import { supabase } from './supabase';
import { markAttemptDidNotTake } from './exams';
import { enrollStudent, fetchExamEnrollments } from './examEnrollments';

// ─── Types ────────────────────────────────────────────────────

export interface FormExamEntry {
    exam_id: string;
    exams: {
        id: string;
        title: string;
        code: string;
        max_attempts: number;
        program_ids: string[];
        exam_attempts: { attempt_number: number; status: 'draft' | 'deployed' | 'done' }[];
        exam_subjects: { subject_id: string; subjects: { course_code: string; course_title: string } | null }[];
    } | null;
}

export interface Form {
    id: string;
    title: string;
    description: string | null;
    exam_date: string;
    submission_start: string;
    submission_end: string;
    attempt_number: number;
    academic_year: string;
    term: string;
    created_by: string;
    created_at: string;
    updated_at: string;
    form_exams: FormExamEntry[];
    submission_count: number;
}

export interface FormSubmission {
    id: string;
    form_id: string;
    student_id: string;
    selected_exam_ids: string[];
    submitted_at: string;
    student: {
        full_name: string | null;
        first_name: string | null;
        last_name: string | null;
        email: string | null;
        username: string | null;
        student_id: string | null;
    } | null;
}

export interface CreateFormData {
    title: string;
    description: string | null;
    exam_date: string;
    submission_start: string;
    submission_end: string;
    attempt_number: number;
    academic_year: string;
    term: string;
    exam_ids: string[];
}

// ─── Helpers ─────────────────────────────────────────────────

/** Convert a datetime-local value (treated as PHT, UTC+8) to UTC ISO string */
export function phtToUtc(datetimeLocal: string): string {
    return new Date(datetimeLocal + ':00+08:00').toISOString();
}

/** Format a UTC ISO string to display in Philippine Time */
export function formatPHT(utcIso: string, opts?: Intl.DateTimeFormatOptions): string {
    const defaults: Intl.DateTimeFormatOptions = {
        timeZone: 'Asia/Manila',
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
    };
    return new Date(utcIso).toLocaleString('en-PH', { ...defaults, ...opts });
}

/** Convert a UTC ISO string back to datetime-local format in PHT for input fields */
export function utcToPhtLocal(utcIso: string): string {
    const d = new Date(utcIso);
    // Add 8 hours for PHT
    const pht = new Date(d.getTime() + 8 * 60 * 60 * 1000);
    return pht.toISOString().slice(0, 16);
}

// ─── Fetch ────────────────────────────────────────────────────

export async function fetchForms(): Promise<{ data: Form[]; error: string | null }> {
    const { data, error } = await supabase
        .from('forms')
        .select(`
            id, title, description, exam_date, submission_start, submission_end,
            attempt_number, academic_year, term, created_by, created_at, updated_at,
            form_exams(
                exam_id,
                exams(id, title, code, max_attempts, program_ids,
                    exam_attempts(attempt_number, status),
                    exam_subjects(subject_id, subjects(course_code, course_title))
                )
            ),
            form_submissions(count)
        `)
        .order('created_at', { ascending: false });

    if (error) return { data: [], error: error.message };

    const forms = (data as any[]).map(f => ({
        ...f,
        submission_count: f.form_submissions?.[0]?.count ?? 0,
    }));

    return { data: forms as Form[], error: null };
}

export async function fetchFormById(formId: string): Promise<{ data: Form | null; error: string | null }> {
    const { data, error } = await supabase
        .from('forms')
        .select(`
            id, title, description, exam_date, submission_start, submission_end,
            attempt_number, academic_year, term, created_by, created_at, updated_at,
            form_exams(
                exam_id,
                exams(id, title, code, max_attempts, program_ids,
                    exam_attempts(attempt_number, status),
                    exam_subjects(subject_id, subjects(course_code, course_title))
                )
            ),
            form_submissions(count)
        `)
        .eq('id', formId)
        .single();

    if (error) return { data: null, error: error.message };

    const form = {
        ...(data as any),
        submission_count: (data as any).form_submissions?.[0]?.count ?? 0,
    };

    return { data: form as Form, error: null };
}

export async function fetchFormSubmissions(formId: string): Promise<{ data: FormSubmission[]; error: string | null }> {
    const { data, error } = await supabase
        .from('form_submissions')
        .select('id, form_id, student_id, selected_exam_ids, submitted_at, student:profiles(full_name, first_name, last_name, email, username, student_id)')
        .eq('form_id', formId)
        .order('submitted_at', { ascending: false });

    if (error) return { data: [], error: error.message };
    return { data: data as unknown as FormSubmission[], error: null };
}

// ─── Create / Update / Delete ────────────────────────────────

export async function createForm(
    formData: CreateFormData,
    createdBy: string
): Promise<{ data: Form | null; error: string | null }> {
    const { exam_ids, ...rest } = formData;

    // Insert the form
    const { data: form, error: formError } = await supabase
        .from('forms')
        .insert({ ...rest, created_by: createdBy })
        .select('id, title, description, exam_date, submission_start, submission_end, attempt_number, academic_year, term, created_by, created_at, updated_at')
        .single();

    if (formError) return { data: null, error: formError.message };

    const formId = (form as any).id;

    // Insert form_exams
    if (exam_ids.length > 0) {
        const { error: examError } = await supabase
            .from('form_exams')
            .insert(exam_ids.map(eid => ({ form_id: formId, exam_id: eid })));
        if (examError) return { data: null, error: examError.message };
    }

    // Notify eligible students
    await notifyEligibleStudents(formId, (form as any).title, (form as any).submission_end, exam_ids);

    return fetchFormById(formId);
}

export async function updateForm(
    formId: string,
    formData: CreateFormData
): Promise<{ data: Form | null; error: string | null }> {
    const { exam_ids, ...rest } = formData;

    const { error: updateError } = await supabase
        .from('forms')
        .update({ ...rest, updated_at: new Date().toISOString() })
        .eq('id', formId);

    if (updateError) return { data: null, error: updateError.message };

    // Replace form_exams
    await supabase.from('form_exams').delete().eq('form_id', formId);

    if (exam_ids.length > 0) {
        const { error: examError } = await supabase
            .from('form_exams')
            .insert(exam_ids.map(eid => ({ form_id: formId, exam_id: eid })));
        if (examError) return { data: null, error: examError.message };
    }

    return fetchFormById(formId);
}

export async function deleteForm(formId: string): Promise<{ error: string | null }> {
    const { error } = await supabase.from('forms').delete().eq('id', formId);
    return { error: error?.message ?? null };
}

// ─── Notify Students ──────────────────────────────────────────

async function notifyEligibleStudents(
    formId: string,
    formTitle: string,
    submissionEnd: string,
    examIds: string[]
): Promise<void> {
    if (examIds.length === 0) return;

    // Get program_ids from selected exams
    const { data: exams } = await supabase
        .from('exams')
        .select('program_ids')
        .in('id', examIds);

    if (!exams) return;

    const allProgramIds = Array.from(
        new Set((exams as { program_ids: string[] }[]).flatMap(e => e.program_ids ?? []))
    );

    if (allProgramIds.length === 0) return;

    // Get students with matching program
    const { data: students } = await supabase
        .from('profiles')
        .select('id')
        .eq('role', 'student')
        .in('program_id', allProgramIds);

    if (!students || students.length === 0) return;

    const notifications = (students as { id: string }[]).map(s => ({
        student_id: s.id,
        type: 'new_form',
        payload: { form_id: formId, form_title: formTitle, submission_end: submissionEnd },
    }));

    // Batch insert notifications (ignore duplicates)
    await supabase.from('student_notifications').insert(notifications);
}

// ─── Process Late Submissions ────────────────────────────────

export interface ProcessResult {
    processed: number;
    errors: string[];
}

export async function processLateSubmissions(formId: string): Promise<ProcessResult> {
    const result: ProcessResult = { processed: 0, errors: [] };

    // Fetch form details
    const { data: form, error: formError } = await supabase
        .from('forms')
        .select('attempt_number, form_exams(exam_id), form_submissions(student_id)')
        .eq('id', formId)
        .single();

    if (formError || !form) {
        result.errors.push(formError?.message ?? 'Form not found');
        return result;
    }

    const f = form as any;
    const attemptNumber: number = f.attempt_number;
    const examIds: string[] = (f.form_exams ?? []).map((fe: { exam_id: string }) => fe.exam_id);
    const submittedStudentIds = new Set<string>(
        (f.form_submissions ?? []).map((fs: { student_id: string }) => fs.student_id)
    );

    // For each exam in the form
    for (const examId of examIds) {
        const { data: enrollments, error: enrollError } = await fetchExamEnrollments(examId);
        if (enrollError) { result.errors.push(`Enrollment fetch error for exam ${examId}`); continue; }

        for (const enrollment of enrollments) {
            const studentId = enrollment.student_id;
            if (submittedStudentIds.has(studentId)) continue; // submitted — skip

            const { error } = await markAttemptDidNotTake(examId, studentId, attemptNumber);
            if (error) {
                result.errors.push(`DNT error for student ${studentId}: ${error}`);
            } else {
                result.processed++;
            }
        }
    }

    return result;
}

// ─── Exam eligibility query for CreateForm ────────────────────

export interface EligibleExam {
    id: string;
    title: string;
    code: string;
    max_attempts: number;
    program_ids: string[];
    attempt_status: 'draft' | 'deployed' | 'done' | null;
    exam_subjects: { subject_id: string; subjects: { course_code: string; course_title: string } | null }[];
}

export async function fetchEligibleExams(
    academicYear: string,
    term: string,
    attemptNumber: number
): Promise<{ data: EligibleExam[]; error: string | null }> {
    const { data, error } = await supabase
        .from('exams')
        .select(`
            id, title, code, max_attempts, program_ids,
            exam_subjects(subject_id, subjects(course_code, course_title)),
            exam_attempts(attempt_number, status)
        `)
        .eq('academic_year', academicYear)
        .eq('term', term)
        .gte('max_attempts', attemptNumber)
        .order('title', { ascending: true });

    if (error) return { data: [], error: error.message };

    const exams = (data as any[]).map(e => {
        const attemptRecord = (e.exam_attempts ?? []).find(
            (a: { attempt_number: number; status: string }) => a.attempt_number === attemptNumber
        );
        return {
            id: e.id,
            title: e.title,
            code: e.code,
            max_attempts: e.max_attempts,
            program_ids: e.program_ids ?? [],
            attempt_status: attemptRecord?.status ?? null,
            exam_subjects: e.exam_subjects ?? [],
        } as EligibleExam;
    });

    return { data: exams, error: null };
}
