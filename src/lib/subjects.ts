import { supabase } from './supabase';
import type { Subject } from '../types';

export interface OutcomePayload {
  title: string;
  description: string;
  modules: { description: string }[];
}

export interface SubjectWithCounts extends Subject {
  course_outcomes: { count: number }[];
  questions?: { count: number }[];
}

export interface SubjectWithOutcomes extends Subject {
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

export async function createSubject(
  courseTitle: string,
  courseCode: string,
  outcomes: OutcomePayload[]
): Promise<{ data: string | null; error: string | null }> {
  // Check if subject already exists
  const { data: existing, error: checkError } = await supabase
    .from('subjects')
    .select('course_title, course_code')
    .or(`course_title.eq.${courseTitle},course_code.eq.${courseCode}`)
    .limit(1);

  if (checkError) {
    return { data: null, error: 'Failed to validate subject.' };
  }

  if (existing && existing.length > 0) {
    if (existing[0].course_code.toLowerCase() === courseCode.toLowerCase()) {
      return { data: null, error: `The course code "${courseCode}" already exists.` };
    }
    return { data: null, error: `The course title "${courseTitle}" already exists.` };
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
    .select('*, course_outcomes(count), questions(count)')
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
    .select('*, course_outcomes(count), questions(count)')
    .order('created_at', { ascending: false });

  if (error) {
    return { data: [], error: error.message };
  }

  return { data: data as SubjectWithCounts[], error: null };
}

export async function fetchSubjectWithOutcomes(
  subjectId: string
): Promise<{ data: SubjectWithOutcomes | null; error: string | null }> {
  const { data, error } = await supabase
    .from('subjects')
    .select('*, course_outcomes(id, title, description, order_index, module_outcomes(id, description, order_index))')
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
): Promise<{ data: string | null; error: string | null }> {
  // Check if subject already exists
  const { data: existing, error: checkError } = await supabase
    .from('subjects')
    .select('id, course_title, course_code')
    .or(`course_title.eq.${courseTitle},course_code.eq.${courseCode}`)
    .neq('id', subjectId)
    .limit(1);

  if (checkError) {
    return { data: null, error: 'Failed to validate subject.' };
  }

  if (existing && existing.length > 0) {
    if (existing[0].course_code.toLowerCase() === courseCode.toLowerCase()) {
      return { data: null, error: `The course code "${courseCode}" already exists.` };
    }
    return { data: null, error: `The course title "${courseTitle}" already exists.` };
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
