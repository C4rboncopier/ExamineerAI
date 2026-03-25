import { supabase } from './supabase';
import type { Program } from './professors';

export interface Student {
    id: string;
    email: string | null;
    full_name: string | null;
    username: string | null;
    student_id: string | null;
    program_id: string | null;
    program: Program | null;
    created_at: string;
}

export async function fetchStudents(): Promise<{ data: Student[]; error: string | null }> {
    const { data, error } = await supabase
        .from('profiles')
        .select('id, email, full_name, username, student_id, program_id, created_at, program:programs(id, code, name)')
        .eq('role', 'student')
        .order('created_at', { ascending: false });
    return { data: (data as unknown as Student[]) ?? [], error: error?.message ?? null };
}

export async function fetchStudentsPage(params: {
    search?: string;
    programId?: string;
    page: number;
    pageSize: number;
}): Promise<{ data: Student[]; total: number; error: string | null }> {
    const { search, programId, page, pageSize } = params;
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let query = supabase
        .from('profiles')
        .select('id, email, full_name, username, student_id, program_id, created_at, program:programs(id, code, name)', { count: 'exact' })
        .eq('role', 'student')
        .order('created_at', { ascending: false })
        .range(from, to);

    if (search) query = query.or(`full_name.ilike.%${search}%,username.ilike.%${search}%`);
    if (programId) query = query.eq('program_id', programId);

    const { data, error, count } = await query;
    if (error) return { data: [], total: 0, error: error.message };
    return { data: (data as unknown as Student[]), total: count ?? 0, error: null };
}

export async function createStudent(payload: {
    email: string;
    first_name: string;
    last_name: string;
    username: string;
    password: string;
    program_id: string | null;
    student_id?: string | null;
}): Promise<{ error: string | null; emailError: string | null }> {
    const { data, error } = await supabase.functions.invoke('create-student', { body: payload });
    if (error) return { error: error.message, emailError: null };
    if (data?.error) return { error: data.error, emailError: null };
    return { error: null, emailError: data?.email_error ?? null };
}

export async function updateStudent(
    id: string,
    updates: { full_name: string; email: string; username: string; program_id: string | null; student_id?: string | null }
): Promise<{ error: string | null }> {
    const { email, ...profileUpdates } = updates;

    const { error: profileErr } = await supabase
        .from('profiles')
        .update({ ...profileUpdates, email })
        .eq('id', id);
    if (profileErr) return { error: profileErr.message };

    const { data, error: fnErr } = await supabase.functions.invoke('create-student', {
        body: { action: 'update', student_id: id, email },
    });
    if (fnErr) return { error: fnErr.message };
    if (data?.error) return { error: data.error };

    return { error: null };
}

export async function deleteStudent(student_id: string): Promise<{ error: string | null }> {
    const { data, error } = await supabase.functions.invoke('create-student', {
        body: { action: 'delete', student_id },
    });
    if (error) return { error: error.message };
    return { error: data?.error ?? null };
}
