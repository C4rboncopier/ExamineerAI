import { supabase } from './supabase';
import type { AnalysisFeedback } from './gemini';

export interface StudentExam {
    id: string;
    title: string;
    code: string;
    academic_year: string;
    term: string;
    status: 'locked' | 'unlocked';
    is_completed: boolean;
    max_attempts: number;
    num_sets: number;
    program_ids: string[];
    ai_analysis_enabled: boolean;
    created_by: string;
    cover_image_url: string | null;
    created_by_profile: { id: string; full_name: string | null; email: string | null } | null;
    exam_subjects: {
        subject_id: string;
        subjects: { course_code: string; course_title: string } | null;
    }[];
    exam_attempts: {
        attempt_number: number;
        status: 'draft' | 'deployed' | 'done';
        grades_released: boolean;
    }[];
    exam_faculty: {
        id: string;
        professor_id: string;
        status: 'pending' | 'accepted' | 'declined';
        professor: { id: string; full_name: string | null; email: string | null } | null;
    }[];
}

export interface ExamRosterEntry {
    student_id: string;
    profile: {
        full_name: string | null;
        email: string | null;
        program: { code: string; name: string } | null;
    } | null;
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
    ai_analysis: AnalysisFeedback | null;
    status: 'submitted' | 'did_not_take';
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
                id, title, code, academic_year, term, status, is_completed, max_attempts, num_sets, program_ids, ai_analysis_enabled, cover_image_url,
                exam_subjects(subject_id, subjects(course_code, course_title)),
                exam_attempts(attempt_number, status, grades_released)
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
            id, title, code, academic_year, term, status, max_attempts, num_sets, program_ids, ai_analysis_enabled,
            created_by,
            exam_subjects(subject_id, subjects(course_code, course_title)),
            exam_attempts(attempt_number, status, grades_released),
            exam_faculty(id, professor_id, status, professor:profiles!exam_faculty_professor_id_fkey(id, full_name, email))
        `)
        .eq('id', examId)
        .single();

    if (error) return { data: null, error: error.message };

    // Fetch creator profile separately (exams.created_by FK points to auth.users, not profiles)
    const exam = data as any;
    if (exam?.created_by) {
        const { data: profile } = await supabase
            .from('profiles')
            .select('id, full_name, email')
            .eq('id', exam.created_by)
            .single();
        exam.created_by_profile = profile ?? null;
    } else {
        exam.created_by_profile = null;
    }

    return { data: exam as StudentExam, error: null };
}

export async function fetchStudentSubmissions(
    examId: string,
    studentId: string
): Promise<{ data: StudentSubmission[]; error: string | null }> {
    const { data, error } = await supabase
        .from('student_submissions')
        .select('id, exam_id, student_id, attempt_number, set_number, answers, score, total_items, submitted_at, created_at, ai_analysis, status')
        .eq('exam_id', examId)
        .eq('student_id', studentId)
        .order('attempt_number', { ascending: true });

    if (error) return { data: [], error: error.message };
    return { data: data as StudentSubmission[], error: null };
}

export async function fetchAllStudentSubmissions(
    studentId: string
): Promise<{ data: StudentSubmission[]; error: string | null }> {
    const { data, error } = await supabase
        .from('student_submissions')
        .select('id, exam_id, student_id, attempt_number, set_number, score, total_items, submitted_at, created_at, status')
        .eq('student_id', studentId)
        .order('attempt_number', { ascending: true });

    if (error) return { data: [], error: error.message };
    return { data: data as StudentSubmission[], error: null };
}

export async function fetchExamRoster(
    examId: string
): Promise<{ data: ExamRosterEntry[]; error: string | null }> {
    const { data, error } = await supabase
        .from('exam_enrollments')
        .select('student_id, profile:profiles(full_name, email, program:programs(code, name))')
        .eq('exam_id', examId)
        .order('created_at', { ascending: true });

    if (error) return { data: [], error: error.message };
    return { data: data as unknown as ExamRosterEntry[], error: null };
}

export async function saveSubmissionAiAnalysis(
    submissionId: string,
    analysis: AnalysisFeedback
): Promise<{ error: string | null }> {
    const { error } = await supabase
        .from('student_submissions')
        .update({ ai_analysis: analysis })
        .eq('id', submissionId);
    return { error: error?.message ?? null };
}
