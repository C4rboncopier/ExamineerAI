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

export async function fetchEnrolledStudentIds(examId: string): Promise<string[]> {
    const { data } = await supabase
        .from('exam_enrollments')
        .select('student_id')
        .eq('exam_id', examId);
    return (data ?? []).map((r: { student_id: string }) => r.student_id);
}

export async function fetchExamEnrollmentsPage(params: {
    examId: string;
    search?: string;
    page: number;
    pageSize: number;
}): Promise<{ data: EnrolledStudent[]; total: number; error: string | null }> {
    const { examId, search, page, pageSize } = params;
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let studentIdFilter: string[] | null = null;
    if (search) {
        const q = `%${search}%`;
        const { data: matched } = await supabase
            .from('profiles')
            .select('id')
            .eq('role', 'student')
            .or(`full_name.ilike.${q},username.ilike.${q}`);
        studentIdFilter = (matched ?? []).map((r: { id: string }) => r.id);
        if (studentIdFilter.length === 0) return { data: [], total: 0, error: null };
    }

    let query = supabase
        .from('exam_enrollments')
        .select('id, exam_id, student_id, created_at, student:profiles(full_name, email, username, program:programs(id, code, name))', { count: 'exact' })
        .eq('exam_id', examId)
        .order('created_at', { ascending: false })
        .range(from, to);

    if (studentIdFilter) query = query.in('student_id', studentIdFilter);

    const { data, error, count } = await query;
    if (error) return { data: [], total: 0, error: error.message };
    return { data: (data as unknown as EnrolledStudent[]) ?? [], total: count ?? 0, error: null };
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
