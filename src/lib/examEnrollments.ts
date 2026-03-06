import { supabase } from './supabase';
import type { Program } from './professors';

export interface EnrolledStudent {
    id: string;
    exam_id: string;
    student_id: string;
    created_at: string;
    student: {
        full_name: string | null;
        email: string | null;
        username: string | null;
        program: Program | null;
    } | null;
}

export async function fetchExamEnrollments(examId: string): Promise<{ data: EnrolledStudent[]; error: string | null }> {
    const { data, error } = await supabase
        .from('exam_enrollments')
        .select('id, exam_id, student_id, created_at, student:profiles(full_name, email, username, program:programs(id, code, name))')
        .eq('exam_id', examId)
        .order('created_at', { ascending: false });
    if (error) return { data: [], error: error.message };
    return { data: (data as unknown as EnrolledStudent[]) ?? [], error: null };
}

export async function enrollStudent(examId: string, studentId: string): Promise<{ error: string | null }> {
    const { error } = await supabase
        .from('exam_enrollments')
        .insert({ exam_id: examId, student_id: studentId });
    return { error: error?.message ?? null };
}

export async function unenrollStudent(enrollmentId: string): Promise<{ error: string | null }> {
    const { error } = await supabase
        .from('exam_enrollments')
        .delete()
        .eq('id', enrollmentId);
    return { error: error?.message ?? null };
}
