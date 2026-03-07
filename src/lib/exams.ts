import { supabase } from './supabase';
import { fetchQuestionsBySubject } from './questions';
import type { QuestionWithOutcomes } from './questions';

// ─── Types ────────────────────────────────────────────────────

export interface AllocationConfig {
    mode: 'equal' | 'per_subject';
    total?: number;
    counts?: Record<string, number>;
}

export interface ExamSubject {
    subject_id: string;
    subjects: {
        course_code: string;
        course_title: string;
    } | null;
}

export interface Exam {
    id: string;
    title: string;
    code: string;
    num_sets: number;
    max_attempts: number;
    academic_year: string;
    term: string;
    question_allocation: AllocationConfig;
    created_at: string;
    status: 'locked' | 'unlocked';
    program_ids: string[];
    exam_subjects: ExamSubject[];
}

export interface ExamSetDetail {
    id: string;
    set_number: number;
    attempt_number: number;
    question_ids: string[];
}

export interface ExamAttemptRecord {
    id: string;
    exam_id: string;
    attempt_number: number;
    status: 'draft' | 'deployed' | 'done';
}

export interface ExamWithSets extends Exam {
    exam_sets: ExamSetDetail[];
    exam_attempts: ExamAttemptRecord[];
}

// ─── Shuffle (Fisher-Yates) ───────────────────────────────────

function shuffle<T>(arr: T[]): T[] {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

// ─── Equal MO distribution ────────────────────────────────────
// Picks `count` questions from `questionsByMO`, distributing
// equally across MOs. Handles uneven counts and MOs with fewer
// questions than needed by redistributing to other MOs.

function distributeAcrossMOs(
    questionsByMO: Record<string, QuestionWithOutcomes[]>,
    count: number
): QuestionWithOutcomes[] {
    const moIds = Object.keys(questionsByMO);
    if (moIds.length === 0 || count === 0) return [];

    const totalAvailable = moIds.reduce((sum, id) => sum + questionsByMO[id].length, 0);
    const actualCount = Math.min(count, totalAvailable);
    if (actualCount === 0) return [];

    // Initial equal allocation with remainder distributed to first MOs
    const allocs: Record<string, number> = {};
    const base = Math.floor(actualCount / moIds.length);
    let remainder = actualCount % moIds.length;
    for (const id of moIds) {
        allocs[id] = base + (remainder > 0 ? 1 : 0);
        if (remainder > 0) remainder--;
    }

    // Clamp each MO to its available count, collect excess
    let excess = 0;
    for (const id of moIds) {
        const avail = questionsByMO[id].length;
        if (allocs[id] > avail) {
            excess += allocs[id] - avail;
            allocs[id] = avail;
        }
    }

    // Redistribute excess to MOs with spare capacity
    for (const id of moIds) {
        if (excess === 0) break;
        const spare = questionsByMO[id].length - allocs[id];
        if (spare > 0) {
            const take = Math.min(spare, excess);
            allocs[id] += take;
            excess -= take;
        }
    }

    // Randomly pick from each MO
    const selected: QuestionWithOutcomes[] = [];
    for (const id of moIds) {
        if (allocs[id] > 0) {
            const shuffledMO = shuffle([...questionsByMO[id]]);
            selected.push(...shuffledMO.slice(0, allocs[id]));
        }
    }
    return selected;
}

// ─── Generation (shared by create + update) ───────────────────

async function generateAndSaveSets(
    examId: string,
    subjectIds: string[],
    allocationConfig: AllocationConfig,
    numSets: number,
    attemptNumber: number = 1
): Promise<{ error: string | null }> {
    // No subjects yet — skip set generation (sets will be created when exam is edited later)
    if (subjectIds.length === 0) return { error: null };

    // 1. Fetch questions for each subject
    const questionsBySubject: Record<string, QuestionWithOutcomes[]> = {};
    for (const subjectId of subjectIds) {
        const { data, error } = await fetchQuestionsBySubject(subjectId);
        if (error) return { error: `Failed to fetch questions: ${error}` };
        questionsBySubject[subjectId] = data;
    }

    // 2. Compute per-subject allocations
    const perSubjectCounts: Record<string, number> = {};
    if (allocationConfig.mode === 'equal') {
        const total = allocationConfig.total || 0;
        const n = subjectIds.length;
        const base = Math.floor(total / n);
        let rem = total % n;
        for (const id of subjectIds) {
            perSubjectCounts[id] = base + (rem > 0 ? 1 : 0);
            if (rem > 0) rem--;
        }
    } else {
        for (const id of subjectIds) {
            perSubjectCounts[id] = allocationConfig.counts?.[id] || 0;
        }
    }

    // 3. Build the question pool — same across all sets
    const pool: QuestionWithOutcomes[] = [];
    for (const subjectId of subjectIds) {
        const count = perSubjectCounts[subjectId] || 0;
        if (count === 0) continue;
        const byMO: Record<string, QuestionWithOutcomes[]> = {};
        for (const q of questionsBySubject[subjectId]) {
            if (!byMO[q.module_outcome_id]) byMO[q.module_outcome_id] = [];
            byMO[q.module_outcome_id].push(q);
        }
        pool.push(...distributeAcrossMOs(byMO, count));
    }

    // No questions available yet — skip set creation silently
    if (pool.length === 0) return { error: null };

    // 4. For each set: shuffle the pool → save question_ids as JSONB
    for (let setNum = 1; setNum <= numSets; setNum++) {
        const shuffled = shuffle([...pool]);
        const { error: setError } = await supabase
            .from('exam_sets')
            .insert({ exam_id: examId, set_number: setNum, attempt_number: attemptNumber, question_ids: shuffled.map(q => q.id) });

        if (setError) return { error: `Failed to create set ${setNum}: ${setError.message}` };
    }

    return { error: null };
}

// ─── CRUD ─────────────────────────────────────────────────────

export async function fetchExams(): Promise<{ data: Exam[]; error: string | null }> {
    const { data, error } = await supabase
        .from('exams')
        .select('id, title, code, num_sets, max_attempts, academic_year, term, question_allocation, created_at, status, program_ids, exam_subjects(subject_id, subjects(course_code, course_title))')
        .order('created_at', { ascending: false });

    if (error) return { data: [], error: error.message };
    return { data: data as Exam[], error: null };
}

export async function fetchExamById(id: string): Promise<{ data: ExamWithSets | null; error: string | null }> {
    const { data, error } = await supabase
        .from('exams')
        .select(`
            id, title, code, num_sets, max_attempts, academic_year, term, question_allocation, created_at, status, program_ids,
            exam_subjects(subject_id, subjects(course_code, course_title)),
            exam_sets(id, set_number, attempt_number, question_ids),
            exam_attempts(id, exam_id, attempt_number, status)
        `)
        .eq('id', id)
        .single();

    if (error) return { data: null, error: error.message };
    return { data: data as ExamWithSets, error: null };
}

export async function createExam(
    title: string,
    code: string,
    subjectIds: string[],
    numSets: number,
    maxAttempts: number,
    academicYear: string,
    term: string,
    programIds: string[] = []
): Promise<{ data: Exam | null; error: string | null }> {
    const { data: { user } } = await supabase.auth.getUser();

    const { data: exam, error: insertError } = await supabase
        .from('exams')
        .insert({ title, code, created_by: user?.id, num_sets: numSets, question_allocation: {}, max_attempts: maxAttempts, academic_year: academicYear, term, program_ids: programIds })
        .select('id')
        .single();

    if (insertError) {
        if (insertError.code === '23505') return { data: null, error: `An exam with code "${code}" already exists for ${academicYear} ${term}.` };
        return { data: null, error: insertError.message };
    }

    if (subjectIds.length > 0) {
        const { error: subjError } = await supabase
            .from('exam_subjects')
            .insert(subjectIds.map(subject_id => ({ exam_id: exam.id, subject_id })));
        if (subjError) {
            await supabase.from('exams').delete().eq('id', exam.id);
            return { data: null, error: 'Failed to link subjects.' };
        }
    }

    const { data: fetched } = await fetchExams();
    return { data: fetched.find(e => e.id === exam.id) || null, error: null };
}

export async function updateExam(
    id: string,
    title: string,
    code: string,
    subjectIds: string[],
    numSets: number,
    maxAttempts: number,
    academicYear: string,
    term: string,
    programIds: string[] = []
): Promise<{ error: string | null }> {
    const { error: updateError } = await supabase
        .from('exams')
        .update({ title, code, num_sets: numSets, max_attempts: maxAttempts, academic_year: academicYear, term, program_ids: programIds, updated_at: new Date().toISOString() })
        .eq('id', id);

    if (updateError) {
        if (updateError.code === '23505') return { error: `An exam with code "${code}" already exists for ${academicYear} ${term}.` };
        return { error: updateError.message };
    }

    // Replace subjects (papers remain intact — professor manages them per-attempt)
    await supabase.from('exam_subjects').delete().eq('exam_id', id);
    if (subjectIds.length > 0) {
        const { error: subjError } = await supabase
            .from('exam_subjects')
            .insert(subjectIds.map(subject_id => ({ exam_id: id, subject_id })));
        if (subjError) return { error: 'Failed to update subjects.' };
    }

    return { error: null };
}

export async function generateExamPapersForAttempt(
    examId: string,
    attemptNumber: number,
    subjectIds: string[],
    allocationConfig: AllocationConfig,
    numSets: number
): Promise<{ error: string | null }> {
    await supabase.from('exam_sets').delete().eq('exam_id', examId).eq('attempt_number', attemptNumber);
    return generateAndSaveSets(examId, subjectIds, allocationConfig, numSets, attemptNumber);
}

export async function deleteAttemptPapers(examId: string, attemptNumber: number): Promise<{ error: string | null }> {
    const { error } = await supabase.from('exam_sets').delete().eq('exam_id', examId).eq('attempt_number', attemptNumber);
    return { error: error?.message ?? null };
}

export async function unlockExam(id: string): Promise<{ error: string | null }> {
    const { error } = await supabase.from('exams').update({ status: 'unlocked' }).eq('id', id);
    return { error: error?.message ?? null };
}

export async function lockExam(id: string): Promise<{ error: string | null }> {
    const { error } = await supabase.from('exams').update({ status: 'locked' }).eq('id', id);
    return { error: error?.message ?? null };
}

export async function deployAttempt(examId: string, attemptNumber: number): Promise<{ error: string | null }> {
    const { error } = await supabase
        .from('exam_attempts')
        .upsert({ exam_id: examId, attempt_number: attemptNumber, status: 'deployed' }, { onConflict: 'exam_id,attempt_number' });
    return { error: error?.message ?? null };
}

export async function markAttemptDone(examId: string, attemptNumber: number): Promise<{ error: string | null }> {
    const { error } = await supabase
        .from('exam_attempts')
        .upsert({ exam_id: examId, attempt_number: attemptNumber, status: 'done' }, { onConflict: 'exam_id,attempt_number' });
    return { error: error?.message ?? null };
}

export async function deleteExam(id: string): Promise<{ error: string | null }> {
    const { error } = await supabase.from('exams').delete().eq('id', id);
    if (error) return { error: error.message };
    return { error: null };
}
