import { supabase } from './supabase';
import type { Subject } from '../types';

export interface OutcomePayload {
  title: string;
  description: string;
  modules: { description: string }[];
}

export interface SubjectWithCounts extends Subject {
  created_by: string;
  course_outcomes: { count: number }[];
  questions?: { count: number }[];
}

export interface SubjectWithOutcomes extends Subject {
  created_by: string;
  course_outcomes: {
    id: string;
    title: string;
    description: string;
    order_index: number;
    module_outcomes: {
      id: string;
      description: string;
      order_index: number;
    }[];
  }[];
}

export interface DuplicateSubjectInfo {
  course_title: string;
  course_code: string;
  creator_name: string;
}

export async function createSubject(
  courseTitle: string,
  courseCode: string,
  outcomes: OutcomePayload[]
): Promise<{ data: string | null; error: string | null; duplicateSubject?: DuplicateSubjectInfo }> {
  const { data: dupRows, error: checkError } = await supabase
    .rpc('check_subject_code_duplicate', { p_course_code: courseCode });

  if (checkError) {
    return { data: null, error: 'Failed to validate subject.' };
  }

  if (dupRows && dupRows.length > 0) {
    return {
      data: null,
      error: `The course code "${courseCode}" already exists.`,
      duplicateSubject: {
        course_title: dupRows[0].course_title,
        course_code: dupRows[0].course_code,
        creator_name: dupRows[0].creator_name,
      },
    };
  }

  const { data, error } = await supabase.rpc('create_subject_with_outcomes', {
    p_course_title: courseTitle,
    p_course_code: courseCode,
    p_outcomes: outcomes,
  });

  if (error) {
    return { data: null, error: error.message };
  }

  return { data: data as string, error: null };
}

export async function fetchSubjectById(
  subjectId: string
): Promise<{ data: SubjectWithCounts | null; error: string | null }> {
  const { data, error } = await supabase
    .from('subjects')
    .select('*, created_by, course_outcomes(count), questions(count)')
    .eq('id', subjectId)
    .single();

  if (error) {
    return { data: null, error: error.message };
  }

  return { data: data as SubjectWithCounts, error: null };
}

export async function fetchSubjects(): Promise<{ data: SubjectWithCounts[]; error: string | null }> {
  const { data, error } = await supabase
    .from('subjects')
    .select('*, created_by, course_outcomes(count), questions(count)')
    .order('created_at', { ascending: false });

  if (error) {
    return { data: [], error: error.message };
  }

  return { data: data as SubjectWithCounts[], error: null };
}

export type SubjectAccessType = 'owner' | 'co-handler' | 'exam-only';

export interface SubjectWithAccess extends SubjectWithCounts {
  accessType: SubjectAccessType;
}

export async function fetchProfessorSubjectsWithAccess(): Promise<{ data: SubjectWithAccess[]; error: string | null }> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { data: [], error: 'Not authenticated' };

  const [subjectsResult, coHandlerResult] = await Promise.all([
    supabase
      .from('subjects')
      .select('*, created_by, course_outcomes(count), questions(count)')
      .order('created_at', { ascending: false }),
    supabase
      .from('subject_faculty')
      .select('subject_id')
      .eq('professor_id', user.id)
      .eq('status', 'accepted'),
  ]);

  if (subjectsResult.error) return { data: [], error: subjectsResult.error.message };

  const coHandlerIds = new Set((coHandlerResult.data ?? []).map((sf: any) => sf.subject_id as string));

  const data: SubjectWithAccess[] = (subjectsResult.data as SubjectWithCounts[]).map(subject => {
    let accessType: SubjectAccessType;
    if (subject.professor_id === user.id) {
      accessType = 'owner';
    } else if (coHandlerIds.has(subject.id)) {
      accessType = 'co-handler';
    } else {
      accessType = 'exam-only';
    }
    return { ...subject, accessType };
  });

  return { data, error: null };
}

export interface SubjectCoHandler {
  professor_id: string;
  full_name: string | null;
  email: string | null;
}

export interface AdminSubjectWithCreator extends Subject {
  created_by: string;
  course_outcomes: { count: number }[];
  questions: { count: number }[];
  creator_name: string | null;
  creator_email: string | null;
  co_handlers: SubjectCoHandler[];
}

export async function fetchAdminSubjects(): Promise<{ data: AdminSubjectWithCreator[]; error: string | null }> {
  const { data, error } = await supabase
    .from('subjects')
    .select('*, created_by, course_outcomes(count), questions(count)')
    .order('created_at', { ascending: false });

  if (error) return { data: [], error: error.message };

  const rows = data as any[];
  const creatorIds = [...new Set(rows.map((s: any) => s.created_by).filter(Boolean))];
  const subjectIds = rows.map((s: any) => s.id);

  let profileMap: Record<string, { full_name: string | null; email: string | null }> = {};
  let coHandlerMap: Record<string, SubjectCoHandler[]> = {};

  const [profilesResult, facultyResult] = await Promise.all([
    creatorIds.length > 0
      ? supabase.from('profiles').select('id, full_name, email').in('id', creatorIds)
      : Promise.resolve({ data: [] }),
    subjectIds.length > 0
      ? supabase
          .from('subject_faculty')
          .select('subject_id, professor_id, professor:profiles(full_name, email)')
          .in('subject_id', subjectIds)
          .eq('status', 'accepted')
      : Promise.resolve({ data: [] }),
  ]);

  if (profilesResult.data) {
    for (const p of profilesResult.data as any[]) profileMap[p.id] = { full_name: p.full_name, email: p.email };
  }
  if (facultyResult.data) {
    for (const sf of facultyResult.data as any[]) {
      if (!coHandlerMap[sf.subject_id]) coHandlerMap[sf.subject_id] = [];
      coHandlerMap[sf.subject_id].push({
        professor_id: sf.professor_id,
        full_name: sf.professor?.full_name ?? null,
        email: sf.professor?.email ?? null,
      });
    }
  }

  const merged: AdminSubjectWithCreator[] = rows.map((s: any) => ({
    ...s,
    creator_name: profileMap[s.created_by]?.full_name ?? null,
    creator_email: profileMap[s.created_by]?.email ?? null,
    co_handlers: coHandlerMap[s.id] ?? [],
  }));

  return { data: merged, error: null };
}

export interface AdminSubjectDetail extends SubjectWithOutcomes {
  co_handlers: SubjectCoHandler[];
  mo_question_counts: Record<string, number>;
}

export async function fetchAdminSubjectDetail(
  subjectId: string
): Promise<{ data: AdminSubjectDetail | null; error: string | null }> {
  const [outcomesResult, facultyResult, questionsResult] = await Promise.all([
    supabase
      .from('subjects')
      .select('*, created_by, course_outcomes(id, title, description, order_index, module_outcomes(id, description, order_index))')
      .eq('id', subjectId)
      .single(),
    supabase
      .from('subject_faculty')
      .select('professor_id, professor:profiles(full_name, email)')
      .eq('subject_id', subjectId)
      .eq('status', 'accepted'),
    supabase
      .from('questions')
      .select('module_outcome_id')
      .eq('subject_id', subjectId),
  ]);

  if (outcomesResult.error) return { data: null, error: outcomesResult.error.message };

  const co_handlers: SubjectCoHandler[] = (facultyResult.data ?? []).map((sf: any) => ({
    professor_id: sf.professor_id,
    full_name: sf.professor?.full_name ?? null,
    email: sf.professor?.email ?? null,
  }));

  const mo_question_counts: Record<string, number> = {};
  for (const q of (questionsResult.data ?? []) as any[]) {
    if (q.module_outcome_id) {
      mo_question_counts[q.module_outcome_id] = (mo_question_counts[q.module_outcome_id] ?? 0) + 1;
    }
  }

  return {
    data: { ...(outcomesResult.data as SubjectWithOutcomes), co_handlers, mo_question_counts },
    error: null,
  };
}

export async function fetchSubjectWithOutcomes(
  subjectId: string
): Promise<{ data: SubjectWithOutcomes | null; error: string | null }> {
  const { data, error } = await supabase
    .from('subjects')
    .select('*, created_by, course_outcomes(id, title, description, order_index, module_outcomes(id, description, order_index))')
    .eq('id', subjectId)
    .single();

  if (error) {
    return { data: null, error: error.message };
  }

  return { data: data as SubjectWithOutcomes, error: null };
}

export async function updateSubject(
  subjectId: string,
  courseTitle: string,
  courseCode: string,
  outcomes: OutcomePayload[]
): Promise<{ data: string | null; error: string | null; duplicateSubject?: DuplicateSubjectInfo }> {
  const { data: dupRows, error: checkError } = await supabase
    .rpc('check_subject_code_duplicate', { p_course_code: courseCode, p_exclude_subject_id: subjectId });

  if (checkError) {
    return { data: null, error: 'Failed to validate subject.' };
  }

  if (dupRows && dupRows.length > 0) {
    return {
      data: null,
      error: `The course code "${courseCode}" already exists.`,
      duplicateSubject: {
        course_title: dupRows[0].course_title,
        course_code: dupRows[0].course_code,
        creator_name: dupRows[0].creator_name,
      },
    };
  }

  const { data, error } = await supabase.rpc('update_subject_with_outcomes', {
    p_subject_id: subjectId,
    p_course_title: courseTitle,
    p_course_code: courseCode,
    p_outcomes: outcomes,
  });

  if (error) {
    return { data: null, error: error.message };
  }

  return { data: data as string, error: null };
}

export async function deleteSubject(
  subjectId: string
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('subjects')
    .delete()
    .eq('id', subjectId);

  if (error) {
    return { error: error.message };
  }

  return { error: null };
}
