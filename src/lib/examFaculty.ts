import { supabase } from './supabase';

export interface ExamFacultyMember {
    id: string;
    exam_id: string;
    professor_id: string;
    status: 'pending' | 'accepted' | 'declined';
    created_at: string;
    professor: {
        id: string;
        full_name: string | null;
        email: string | null;
        username: string | null;
    } | null;
}

export async function fetchExamFaculty(
    examId: string
): Promise<{ data: ExamFacultyMember[]; error: string | null }> {
    const { data, error } = await supabase
        .from('exam_faculty')
        .select('id, exam_id, professor_id, status, created_at, professor:profiles(id, full_name, email, username)')
        .eq('exam_id', examId)
        .order('created_at', { ascending: true });

    if (error) return { data: [], error: error.message };
    return { data: data as ExamFacultyMember[], error: null };
}

export async function addExamFaculty(
    examId: string,
    professorId: string
): Promise<{ data: ExamFacultyMember | null; error: string | null }> {
    // Remove any existing declined row so a fresh invite can be inserted
    await supabase
        .from('exam_faculty')
        .delete()
        .eq('exam_id', examId)
        .eq('professor_id', professorId)
        .eq('status', 'declined');

    const { data, error } = await supabase
        .from('exam_faculty')
        .insert({ exam_id: examId, professor_id: professorId, status: 'pending' })
        .select('id, exam_id, professor_id, status, created_at, professor:profiles(id, full_name, email, username)')
        .single();

    if (error) return { data: null, error: error.message };
    return { data: data as ExamFacultyMember, error: null };
}

export async function removeExamFaculty(
    facultyId: string
): Promise<{ error: string | null }> {
    const { error } = await supabase
        .from('exam_faculty')
        .delete()
        .eq('id', facultyId);
    return { error: error?.message ?? null };
}

export async function updateFacultyStatus(
    facultyId: string,
    status: 'accepted' | 'declined'
): Promise<{ error: string | null }> {
    const { error } = await supabase
        .from('exam_faculty')
        .update({ status })
        .eq('id', facultyId);
    return { error: error?.message ?? null };
}
