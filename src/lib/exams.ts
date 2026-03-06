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
    question_allocation: AllocationConfig;
    created_at: string;
    status: 'draft' | 'deployed' | 'done';
    exam_subjects: ExamSubject[];
}

export interface ExamSetDetail {
    id: string;
    set_number: number;
    question_ids: string[];
}

export interface ExamWithSets extends Exam {
    exam_sets: ExamSetDetail[];
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
    numSets: number
): Promise<{ error: string | null }> {
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

    if (pool.length === 0) {
        return { error: 'No questions could be selected. Check allocation settings and question bank.' };
    }

    // 4. For each set: shuffle the pool → save question_ids as JSONB
    for (let setNum = 1; setNum <= numSets; setNum++) {
        const shuffled = shuffle([...pool]);
        const { error: setError } = await supabase
            .from('exam_sets')
            .insert({ exam_id: examId, set_number: setNum, question_ids: shuffled.map(q => q.id) });

        if (setError) return { error: `Failed to create set ${setNum}: ${setError.message}` };
    }

    return { error: null };
}

// ─── CRUD ─────────────────────────────────────────────────────

export async function fetchExams(): Promise<{ data: Exam[]; error: string | null }> {
    const { data, error } = await supabase
        .from('exams')
        .select('id, title, code, num_sets, question_allocation, created_at, status, exam_subjects(subject_id, subjects(course_code, course_title))')
        .order('created_at', { ascending: false });

    if (error) return { data: [], error: error.message };
    return { data: data as Exam[], error: null };
}

export async function fetchExamById(id: string): Promise<{ data: ExamWithSets | null; error: string | null }> {
    const { data, error } = await supabase
        .from('exams')
        .select(`
            id, title, code, num_sets, question_allocation, created_at, status,
            exam_subjects(subject_id, subjects(course_code, course_title)),
            exam_sets(id, set_number, question_ids)
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
    allocationConfig: AllocationConfig
): Promise<{ data: Exam | null; error: string | null }> {
    const { data: { user } } = await supabase.auth.getUser();

    const { data: exam, error: insertError } = await supabase
        .from('exams')
        .insert({ title, code, created_by: user?.id, num_sets: numSets, question_allocation: allocationConfig })
        .select('id')
        .single();

    if (insertError) {
        if (insertError.code === '23505') return { data: null, error: `The exam code "${code}" already exists.` };
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

    const { error: genError } = await generateAndSaveSets(exam.id, subjectIds, allocationConfig, numSets);
    if (genError) {
        await supabase.from('exams').delete().eq('id', exam.id);
        return { data: null, error: genError };
    }

    // Return just the basic exam (list view shape)
    const { data: fetched } = await fetchExams();
    return { data: fetched.find(e => e.id === exam.id) || null, error: null };
}

export async function updateExam(
    id: string,
    title: string,
    code: string,
    subjectIds: string[],
    numSets: number,
    allocationConfig: AllocationConfig
): Promise<{ error: string | null }> {
    const { error: updateError } = await supabase
        .from('exams')
        .update({ title, code, num_sets: numSets, question_allocation: allocationConfig, updated_at: new Date().toISOString() })
        .eq('id', id);

    if (updateError) {
        if (updateError.code === '23505') return { error: `The exam code "${code}" already exists.` };
        return { error: updateError.message };
    }

    // Replace subjects
    await supabase.from('exam_subjects').delete().eq('exam_id', id);
    if (subjectIds.length > 0) {
        const { error: subjError } = await supabase
            .from('exam_subjects')
            .insert(subjectIds.map(subject_id => ({ exam_id: id, subject_id })));
        if (subjError) return { error: 'Failed to update subjects.' };
    }

    // Delete old sets (cascades exam_set_questions) and regenerate
    await supabase.from('exam_sets').delete().eq('exam_id', id);
    return generateAndSaveSets(id, subjectIds, allocationConfig, numSets);
}

export async function deployExam(id: string): Promise<{ error: string | null }> {
    const { error } = await supabase.from('exams').update({ status: 'deployed' }).eq('id', id);
    return { error: error?.message ?? null };
}

export async function markExamDone(id: string): Promise<{ error: string | null }> {
    const { error } = await supabase.from('exams').update({ status: 'done' }).eq('id', id);
    return { error: error?.message ?? null };
}

export async function deleteExam(id: string): Promise<{ error: string | null }> {
    const { error } = await supabase.from('exams').delete().eq('id', id);
    if (error) return { error: error.message };
    return { error: null };
}
