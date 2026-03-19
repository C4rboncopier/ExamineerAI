import { supabase } from './supabase';

export interface SubjectFacultyMember {
    id: string;
    subject_id: string;
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

export async function fetchSubjectFaculty(
    subjectId: string
): Promise<{ data: SubjectFacultyMember[]; error: string | null }> {
    const { data, error } = await supabase
        .from('subject_faculty')
        .select('id, subject_id, professor_id, status, created_at, professor:profiles(id, full_name, email, username)')
        .eq('subject_id', subjectId)
        .order('created_at', { ascending: true });

    if (error) return { data: [], error: error.message };
    return { data: data as SubjectFacultyMember[], error: null };
}

export async function addSubjectFaculty(
    subjectId: string,
    professorId: string
): Promise<{ data: SubjectFacultyMember | null; error: string | null }> {
    const { data, error } = await supabase
        .from('subject_faculty')
        .insert({ subject_id: subjectId, professor_id: professorId, status: 'pending' })
        .select('id, subject_id, professor_id, status, created_at, professor:profiles(id, full_name, email, username)')
        .single();

    if (error) return { data: null, error: error.message };
    return { data: data as SubjectFacultyMember, error: null };
}

export async function removeSubjectFaculty(
    facultyId: string
): Promise<{ error: string | null }> {
    const { error } = await supabase
        .from('subject_faculty')
        .delete()
        .eq('id', facultyId);
    return { error: error?.message ?? null };
}

export async function updateSubjectFacultyStatus(
    facultyId: string,
    status: 'accepted' | 'declined'
): Promise<{ error: string | null }> {
    const { error } = await supabase
        .from('subject_faculty')
        .update({ status })
        .eq('id', facultyId);
    return { error: error?.message ?? null };
}
