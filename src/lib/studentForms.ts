import { supabase } from './supabase';
import { enrollStudent } from './examEnrollments';
import { markAttemptDidNotTake } from './exams';
import { formatPHT } from './forms';

// ─── Types ────────────────────────────────────────────────────

export interface StudentForm {
    id: string;
    title: string;
    description: string | null;
    exam_date: string;
    submission_start: string;
    submission_end: string;
    attempt_number: number;
    academic_year: string;
    term: string;
    form_exams: {
        exam_id: string;
        exams: {
            id: string;
            title: string;
            code: string;
            max_attempts: number;
            program_ids: string[];
            exam_subjects: { subject_id: string; subjects: { course_code: string; course_title: string } | null }[];
        } | null;
    }[];
    my_submission: StudentFormSubmission | null;
}

export interface StudentFormSubmission {
    id: string;
    form_id: string;
    student_id: string;
    selected_exam_ids: string[];
    submitted_at: string;
}

export interface StudentNotification {
    id: string;
    student_id: string;
    type: 'new_form' | 'form_closing_soon';
    payload: { form_id: string; form_title: string; submission_end: string };
    read: boolean;
    created_at: string;
}

// ─── Form Window Helpers ──────────────────────────────────────

export type FormWindowStatus = 'open' | 'upcoming' | 'closed';

export function getFormWindowStatus(form: { submission_start: string; submission_end: string }): FormWindowStatus {
    const now = Date.now();
    const start = new Date(form.submission_start).getTime();
    const end = new Date(form.submission_end).getTime();
    if (now < start) return 'upcoming';
    if (now > end) return 'closed';
    return 'open';
}

export function formatFormDate(isoDate: string): string {
    return new Date(isoDate + 'T00:00:00').toLocaleDateString('en-PH', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
    });
}

export { formatPHT };

// ─── Fetch Forms ──────────────────────────────────────────────

export async function fetchStudentForms(
    studentId: string
): Promise<{ data: StudentForm[]; error: string | null }> {
    // Fetch all forms
    const { data: formsData, error: formsError } = await supabase
        .from('forms')
        .select(`
            id, title, description, exam_date, submission_start, submission_end,
            attempt_number, academic_year, term,
            form_exams(
                exam_id,
                exams(id, title, code, max_attempts, program_ids,
                    exam_subjects(subject_id, subjects(course_code, course_title))
                )
            )
        `)
        .order('submission_end', { ascending: false });

    if (formsError) return { data: [], error: formsError.message };

    // Fetch student's submissions
    const { data: subsData } = await supabase
        .from('form_submissions')
        .select('id, form_id, student_id, selected_exam_ids, submitted_at')
        .eq('student_id', studentId);

    const subsByForm: Record<string, StudentFormSubmission> = {};
    for (const sub of (subsData ?? []) as StudentFormSubmission[]) {
        subsByForm[sub.form_id] = sub;
    }

    const forms = (formsData as any[]).map(f => ({
        ...f,
        my_submission: subsByForm[f.id] ?? null,
    }));

    return { data: forms as StudentForm[], error: null };
}

export async function fetchStudentFormById(
    formId: string,
    studentId: string
): Promise<{ data: StudentForm | null; error: string | null }> {
    const { data, error } = await supabase
        .from('forms')
        .select(`
            id, title, description, exam_date, submission_start, submission_end,
            attempt_number, academic_year, term,
            form_exams(
                exam_id,
                exams(id, title, code, max_attempts, program_ids,
                    exam_subjects(subject_id, subjects(course_code, course_title))
                )
            )
        `)
        .eq('id', formId)
        .single();

    if (error) return { data: null, error: error.message };

    // Fetch student's submission for this form
    const { data: sub } = await supabase
        .from('form_submissions')
        .select('id, form_id, student_id, selected_exam_ids, submitted_at')
        .eq('form_id', formId)
        .eq('student_id', studentId)
        .maybeSingle();

    return {
        data: { ...(data as any), my_submission: (sub as StudentFormSubmission | null) ?? null } as StudentForm,
        error: null,
    };
}

// ─── Submit Form ──────────────────────────────────────────────

export interface SubmitFormResult {
    error: string | null;
    autoEnrolled: string[];   // exam titles that were auto-enrolled
    dntMarked: number;        // number of DNT records created
}

export async function submitStudentForm(
    formId: string,
    studentId: string,
    selectedExamIds: string[],
    attemptNumber: number
): Promise<SubmitFormResult> {
    const result: SubmitFormResult = { error: null, autoEnrolled: [], dntMarked: 0 };

    // Check for already existing submission
    const { data: existing } = await supabase
        .from('form_submissions')
        .select('id')
        .eq('form_id', formId)
        .eq('student_id', studentId)
        .maybeSingle();

    if (existing) {
        return { ...result, error: 'You have already submitted this form.' };
    }

    // Handle enrollment and DNT for each selected exam
    for (const examId of selectedExamIds) {
        // Check current enrollment
        const { data: enrollments } = await supabase
            .from('exam_enrollments')
            .select('id')
            .eq('exam_id', examId)
            .eq('student_id', studentId)
            .maybeSingle();

        if (!enrollments) {
            // Not enrolled — auto-enroll
            const { error: enrollError } = await enrollStudent(examId, studentId);
            if (enrollError) {
                result.error = `Enrollment error: ${enrollError}`;
                return result;
            }

            // Fetch exam title for display
            const { data: examData } = await supabase
                .from('exams')
                .select('title')
                .eq('id', examId)
                .single();
            result.autoEnrolled.push((examData as any)?.title ?? examId);

            // Mark all previous attempts as DNT
            for (let prevAttempt = 1; prevAttempt < attemptNumber; prevAttempt++) {
                const { error: dntError } = await markAttemptDidNotTake(examId, studentId, prevAttempt);
                if (!dntError) result.dntMarked++;
            }
        }
    }

    // Save the form submission
    const { error: subError } = await supabase
        .from('form_submissions')
        .insert({
            form_id: formId,
            student_id: studentId,
            selected_exam_ids: selectedExamIds,
        });

    if (subError) {
        result.error = subError.message;
    }

    return result;
}

// ─── Exam Form Enrollment ─────────────────────────────────────

export interface ExamFormEnrollment {
    attempt_number: number;
    form_id: string;
    form_title: string;
    submitted_at: string;
}

/**
 * For a given exam and student, returns a map of attempt_number → ExamFormEnrollment
 * for every attempt where the student explicitly selected this exam in a form submission.
 */
export async function fetchExamFormEnrollments(
    examId: string,
    studentId: string
): Promise<{ data: Record<number, ExamFormEnrollment>; error: string | null }> {
    // Find all forms that include this exam, with their attempt_number
    const { data: formExams, error } = await supabase
        .from('form_exams')
        .select('form_id, forms(id, title, attempt_number)')
        .eq('exam_id', examId);

    if (error) return { data: {}, error: error.message };
    if (!formExams || formExams.length === 0) return { data: {}, error: null };

    const formIds = (formExams as any[]).map(fe => fe.form_id);

    // Fetch student's submissions for those forms
    const { data: submissions, error: subError } = await supabase
        .from('form_submissions')
        .select('form_id, selected_exam_ids, submitted_at')
        .eq('student_id', studentId)
        .in('form_id', formIds);

    if (subError) return { data: {}, error: subError.message };

    const result: Record<number, ExamFormEnrollment> = {};
    for (const sub of (submissions ?? []) as any[]) {
        const selectedIds: string[] = sub.selected_exam_ids ?? [];
        if (!selectedIds.includes(examId)) continue;

        const formExamEntry = (formExams as any[]).find(fe => fe.form_id === sub.form_id);
        if (!formExamEntry) continue;

        const form = formExamEntry.forms;
        if (!form) continue;

        result[form.attempt_number] = {
            attempt_number: form.attempt_number,
            form_id: form.id,
            form_title: form.title,
            submitted_at: sub.submitted_at,
        };
    }

    return { data: result, error: null };
}

// ─── Notifications ────────────────────────────────────────────

export async function fetchStudentNotifications(
    studentId: string
): Promise<{ data: StudentNotification[]; error: string | null }> {
    const { data, error } = await supabase
        .from('student_notifications')
        .select('id, student_id, type, payload, read, created_at')
        .eq('student_id', studentId)
        .order('created_at', { ascending: false });

    if (error) return { data: [], error: error.message };
    return { data: data as StudentNotification[], error: null };
}

export async function fetchUnreadNotificationCount(
    studentId: string
): Promise<{ count: number; error: string | null }> {
    const { count, error } = await supabase
        .from('student_notifications')
        .select('id', { count: 'exact', head: true })
        .eq('student_id', studentId)
        .eq('read', false);

    if (error) return { count: 0, error: error.message };
    return { count: count ?? 0, error: null };
}

export async function markNotificationRead(notifId: string): Promise<void> {
    await supabase.from('student_notifications').update({ read: true }).eq('id', notifId);
}

export async function markAllNotificationsRead(studentId: string): Promise<void> {
    await supabase
        .from('student_notifications')
        .update({ read: true })
        .eq('student_id', studentId)
        .eq('read', false);
}
