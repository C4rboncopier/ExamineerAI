import { supabase } from './supabase';

export interface Program {
    id: string;
    code: string;
    name: string;
}

export interface Professor {
    id: string;
    email: string | null;
    full_name: string | null;
    username: string | null;
    program_id: string | null;
    program: Program | null;
    created_at: string;
}

export async function fetchPrograms(): Promise<Program[]> {
    const { data } = await supabase
        .from('programs')
        .select('id, code, name')
        .order('name');
    return (data as Program[]) ?? [];
}

export async function fetchProfessors(): Promise<{ data: Professor[]; error: string | null }> {
    const { data, error } = await supabase
        .from('profiles')
        .select('id, email, full_name, username, program_id, created_at, program:programs(id, code, name)')
        .eq('role', 'professor')
        .order('created_at', { ascending: false });
    return { data: (data as unknown as Professor[]) ?? [], error: error?.message ?? null };
}

export async function createProfessor(payload: {
    email: string;
    first_name: string;
    last_name: string;
    username: string;
    password: string;
    program_id: string | null;
}): Promise<{ error: string | null; emailError: string | null }> {
    const { data, error } = await supabase.functions.invoke('create-professor', {
        body: payload,
    });
    if (error) return { error: error.message, emailError: null };
    if (data?.error) return { error: data.error, emailError: null };
    return { error: null, emailError: data?.email_error ?? null };
}

export async function updateProfessor(
    id: string,
    updates: { full_name: string; username: string; program_id: string | null; email?: string; password?: string }
): Promise<{ error: string | null }> {
    const { email, password, ...profileUpdates } = updates;

    // Update profile fields directly (admin RLS allows this)
    const { error: profileErr } = await supabase
        .from('profiles')
        .update(profileUpdates)
        .eq('id', id);
    if (profileErr) return { error: profileErr.message };

    // Email/password changes require service_role via edge function
    if (email || password) {
        const { data, error: fnErr } = await supabase.functions.invoke('create-professor', {
            body: { action: 'update', professor_id: id, ...(email ? { email } : {}), ...(password ? { password } : {}) },
        });
        if (fnErr) return { error: fnErr.message };
        if (data?.error) return { error: data.error };
    }

    return { error: null };
}

export interface ProfessorOwnershipInfo {
    subjects: { id: string; course_title: string; course_code: string }[];
    exams: { id: string; title: string; code: string }[];
}

export async function checkProfessorOwnership(
    professorId: string
): Promise<{ data: ProfessorOwnershipInfo; error: string | null }> {
    const [subjectsResult, examsResult] = await Promise.all([
        supabase.from('subjects').select('id, course_title, course_code').eq('created_by', professorId),
        supabase.from('exams').select('id, title, code').eq('created_by', professorId),
    ]);
    return {
        data: {
            subjects: (subjectsResult.data ?? []) as ProfessorOwnershipInfo['subjects'],
            exams: (examsResult.data ?? []) as ProfessorOwnershipInfo['exams'],
        },
        error: subjectsResult.error?.message ?? examsResult.error?.message ?? null,
    };
}

export async function deleteProfessor(professor_id: string): Promise<{ error: string | null }> {
    const { data, error } = await supabase.functions.invoke('create-professor', {
        body: { action: 'delete', professor_id },
    });
    if (error) return { error: error.message };
    return { error: data?.error ?? null };
}
