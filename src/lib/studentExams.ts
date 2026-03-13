import { supabase } from './supabase';

export interface StudentExam {
    id: string;
    title: string;
    code: string;
    academic_year: string;
    term: string;
    status: 'locked' | 'unlocked';
    max_attempts: number;
    num_sets: number;
    program_ids: string[];
    exam_subjects: {
        subject_id: string;
        subjects: { course_code: string; course_title: string } | null;
    }[];
    exam_attempts: {
        attempt_number: number;
        status: 'draft' | 'deployed' | 'done';
    }[];
}

export interface StudentSubmission {
    id: string;
    exam_id: string;
    student_id: string;
    attempt_number: number;
    set_number: number;
    answers: Record<string, number>;
    score: number | null;
    total_items: number | null;
    submitted_at: string | null;
    created_at: string;
}

export function getStudentExamStatus(exam: StudentExam): 'available' | 'upcoming' | 'completed' | 'locked' {
    if (exam.status === 'locked') return 'locked';
    const hasDeployed = exam.exam_attempts.some(a => a.status === 'deployed');
    const allDone = exam.exam_attempts.length > 0 && exam.exam_attempts.every(a => a.status === 'done');
    if (allDone) return 'completed';
    if (hasDeployed) return 'available';
    return 'upcoming';
}

export async function fetchEnrolledExams(studentId: string): Promise<{ data: StudentExam[]; error: string | null }> {
    const { data, error } = await supabase
        .from('exam_enrollments')
        .select(`
            exam:exams(
                id, title, code, academic_year, term, status, max_attempts, num_sets, program_ids,
                exam_subjects(subject_id, subjects(course_code, course_title)),
                exam_attempts(attempt_number, status)
            )
        `)
        .eq('student_id', studentId);

    if (error) return { data: [], error: error.message };
    const exams = (data as any[]).map(row => row.exam).filter(Boolean);
    return { data: exams as StudentExam[], error: null };
}

export async function fetchEnrolledExamById(examId: string): Promise<{ data: StudentExam | null; error: string | null }> {
    const { data, error } = await supabase
        .from('exams')
        .select(`
            id, title, code, academic_year, term, status, max_attempts, num_sets, program_ids,
            exam_subjects(subject_id, subjects(course_code, course_title)),
            exam_attempts(attempt_number, status)
        `)
        .eq('id', examId)
        .single();

    if (error) return { data: null, error: error.message };
    return { data: data as unknown as StudentExam, error: null };
}

export async function fetchStudentSubmissions(
    examId: string,
    studentId: string
): Promise<{ data: StudentSubmission[]; error: string | null }> {
    const { data, error } = await supabase
        .from('student_submissions')
        .select('*')
        .eq('exam_id', examId)
        .eq('student_id', studentId)
        .order('attempt_number', { ascending: true });

    if (error) return { data: [], error: error.message };
    return { data: data as StudentSubmission[], error: null };
}
