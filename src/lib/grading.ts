import { supabase } from './supabase';
import type { StudentSubmission } from './studentExams';
import type { Program } from './professors';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface EnrolledStudentFull {
    id: string;           // enrollment row UUID
    exam_id: string;
    student_id: string;   // profiles.id (UUID)
    created_at: string;
    student: {
        id: string;
        full_name: string | null;
        email: string | null;
        username: string | null;
        student_id: string | null;   // text field like "2020103917"
        program: Program | null;
    } | null;
}

export interface AttemptGradeRow {
    enrollment: EnrolledStudentFull;
    submission: StudentSubmission | null;
}

export interface OMRBubble {
    q_idx: number;   // 0-based question index
    x: number;
    y: number;
    r: number;
    answer: string;  // detected letter "A"–"E"
}

export interface OMRResult {
    roll_number: string;      // 5-char string like "03917"
    exam_set: string;         // "A"–"E" or "" if blank
    answers: string[];        // 100 entries, each "A"–"E" or "" if blank
    error: string | null;
    filename?: string;
    annotated_image?: string | null;
    bubble_positions?: OMRBubble[];  // detected answer bubble positions (image-space coords)
    img_w?: number;           // annotated image natural width (px)
    img_h?: number;           // annotated image natural height (px)
}

export interface SetAnswerKey {
    questionIds: string[];
    questions: Record<string, { correct_choice: number }>;
}

// ── Data fetching ─────────────────────────────────────────────────────────────

/**
 * Fetch all enrolled students combined with their submission for a specific attempt.
 * Enrolled students with no submission will have submission = null.
 */
export async function fetchAttemptGrades(
    examId: string,
    attemptNumber: number
): Promise<{ data: AttemptGradeRow[]; error: string | null }> {
    // 1. Fetch enrollments with full student profiles (including text student_id)
    const { data: enrollments, error: enrollError } = await supabase
        .from('exam_enrollments')
        .select(`
            id, exam_id, student_id, created_at,
            student:profiles(id, full_name, email, username, student_id, program:programs(id, code, name))
        `)
        .eq('exam_id', examId)
        .order('created_at', { ascending: true });

    if (enrollError) return { data: [], error: enrollError.message };

    // 2. Fetch all submissions for this attempt
    const { data: submissions, error: subError } = await supabase
        .from('student_submissions')
        .select('*')
        .eq('exam_id', examId)
        .eq('attempt_number', attemptNumber);

    if (subError) return { data: [], error: subError.message };

    // 3. Build a map: student UUID → submission
    const subMap = new Map<string, StudentSubmission>();
    for (const sub of (submissions ?? []) as StudentSubmission[]) {
        subMap.set(sub.student_id, sub);
    }

    // 4. Merge
    const rows: AttemptGradeRow[] = (enrollments ?? []).map((e: any) => ({
        enrollment: e as EnrolledStudentFull,
        submission: subMap.get(e.student_id) ?? null,
    }));

    return { data: rows, error: null };
}

/**
 * Fetch the question IDs (in order) and their correct choices for a set.
 */
export async function fetchSetAnswerKey(
    examId: string,
    attemptNumber: number,
    setNumber: number
): Promise<{ data: SetAnswerKey | null; error: string | null }> {
    // 1. Get question_ids for this set
    const { data: setRow, error: setError } = await supabase
        .from('exam_sets')
        .select('question_ids')
        .eq('exam_id', examId)
        .eq('attempt_number', attemptNumber)
        .eq('set_number', setNumber)
        .single();

    if (setError || !setRow) {
        return { data: null, error: setError?.message ?? 'Set not found' };
    }

    const questionIds: string[] = (setRow as any).question_ids ?? [];
    if (questionIds.length === 0) {
        return { data: { questionIds: [], questions: {} }, error: null };
    }

    // 2. Fetch correct choices for those questions
    const { data: questions, error: qError } = await supabase
        .from('questions')
        .select('id, correct_choice')
        .in('id', questionIds);

    if (qError) return { data: null, error: qError.message };

    const qMap: Record<string, { correct_choice: number }> = {};
    for (const q of (questions ?? []) as { id: string; correct_choice: number }[]) {
        qMap[q.id] = { correct_choice: q.correct_choice };
    }

    return { data: { questionIds, questions: qMap }, error: null };
}

// ── Matching & grading ────────────────────────────────────────────────────────

/**
 * Find the enrolled student whose text student_id ends with the given 5-digit roll number.
 */
export function matchStudentByRoll(
    enrollments: EnrolledStudentFull[],
    rollNumber: string
): EnrolledStudentFull | null {
    const roll = rollNumber.padStart(5, '0');
    return enrollments.find(e => {
        const sid = e.student?.student_id ?? '';
        return sid.length >= 5 && sid.slice(-5) === roll;
    }) ?? null;
}

/**
 * Calculate score from OMR answers vs the answer key.
 * omrAnswers: array of 100 letter strings ("A"–"E", or "" for blank).
 * Returns { score, totalItems, answers } where answers matches student_submissions format.
 */
export function gradeOMR(
    questionIds: string[],
    omrAnswers: string[],
    questions: Record<string, { correct_choice: number }>
): { score: number; totalItems: number; answers: Record<string, number> } {
    const LETTER_INDEX: Record<string, number> = { A: 0, B: 1, C: 2, D: 3, E: 4 };
    let score = 0;
    const answers: Record<string, number> = {};

    const totalItems = questionIds.length;
    for (let i = 0; i < totalItems; i++) {
        const qId = questionIds[i];
        const letter = omrAnswers[i] ?? '';
        const choiceIndex = LETTER_INDEX[letter] ?? -1;
        answers[qId] = choiceIndex === -1 ? -1 : choiceIndex;

        if (choiceIndex !== -1 && questions[qId]?.correct_choice === choiceIndex) {
            score++;
        }
    }

    return { score, totalItems, answers };
}

/** Convert exam set letter (A–E) to 1-based set number. */
export function setLetterToNumber(letter: string): number {
    return Math.max(1, 'ABCDE'.indexOf(letter.toUpperCase()) + 1);
}

/** Convert 1-based set number to letter. */
export function setNumberToLetter(n: number): string {
    return 'ABCDE'[n - 1] ?? '?';
}

// ── Database write ────────────────────────────────────────────────────────────

/**
 * Upsert a student's submission record with OMR grading results.
 * Uses the unique constraint (exam_id, student_id, attempt_number) to update or insert.
 */
export async function saveOMRSubmission(params: {
    examId: string;
    studentId: string;
    attemptNumber: number;
    setNumber: number;
    answers: Record<string, number>;
    score: number;
    totalItems: number;
}): Promise<{ error: string | null }> {
    const now = new Date().toISOString();
    const { error } = await supabase
        .from('student_submissions')
        .upsert(
            {
                exam_id: params.examId,
                student_id: params.studentId,
                attempt_number: params.attemptNumber,
                set_number: params.setNumber,
                answers: params.answers,
                score: params.score,
                total_items: params.totalItems,
                submitted_at: now,
                updated_at: now,
            },
            { onConflict: 'exam_id,student_id,attempt_number' }
        );

    return { error: error?.message ?? null };
}

/**
 * Delete a student's submission for a specific attempt.
 */
export async function deleteSubmission(params: {
    examId: string;
    studentId: string;
    attemptNumber: number;
}): Promise<{ error: string | null }> {
    const { error } = await supabase
        .from('student_submissions')
        .delete()
        .eq('exam_id', params.examId)
        .eq('student_id', params.studentId)
        .eq('attempt_number', params.attemptNumber);
    return { error: error?.message ?? null };
}

// ── Server calls ──────────────────────────────────────────────────────────────

/** Send a single image file to the OMR server for processing. */
export async function scanOMRImage(file: File, serverUrl: string): Promise<OMRResult> {
    const form = new FormData();
    form.append('file', file);

    const res = await fetch(`${serverUrl}/scan`, { method: 'POST', body: form });
    if (!res.ok) {
        const text = await res.text().catch(() => res.statusText);
        throw new Error(`OMR server error: ${text}`);
    }
    return res.json() as Promise<OMRResult>;
}

/** Send a ZIP file to the OMR server for batch processing. */
export async function scanOMRBatch(file: File, serverUrl: string): Promise<OMRResult[]> {
    const form = new FormData();
    form.append('file', file);

    const res = await fetch(`${serverUrl}/scan-batch`, { method: 'POST', body: form });
    if (!res.ok) {
        const text = await res.text().catch(() => res.statusText);
        throw new Error(`OMR server error: ${text}`);
    }
    return res.json() as Promise<OMRResult[]>;
}

/** Test connection to the OMR server. */
export async function testOMRServerConnection(serverUrl: string): Promise<boolean> {
    try {
        const res = await fetch(`${serverUrl}/health`, { signal: AbortSignal.timeout(4000) });
        return res.ok;
    } catch {
        return false;
    }
}
