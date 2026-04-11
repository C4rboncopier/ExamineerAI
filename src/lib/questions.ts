import { supabase } from './supabase';
import type { Question } from '../types';

// ─── Payload types ───────────────────────────────────────────

export interface CreateQuestionPayload {
  question_text: string;
  choices: string[];
  correct_choice: number;
  subject_id: string;
  course_outcome_id: string;
  module_outcome_id: string;
}

export interface UpdateQuestionPayload extends CreateQuestionPayload {
  remove_image?: boolean;
}

// ─── Extended type for list views ────────────────────────────

export interface QuestionWithOutcomes extends Question {
  course_outcomes: {
    id: string;
    title: string;
    description: string;
    order_index: number;
  };
  module_outcomes: {
    id: string;
    description: string;
    order_index: number;
  };
}

// ─── IMAGE HELPERS (private) ─────────────────────────────────



async function uploadImage(
  subjectId: string,
  questionId: string,
  file: File
): Promise<{ url: string | null; error: string | null }> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { url: null, error: 'User not authenticated' };
  }

  const ext = (file.name.split('.').pop() ?? 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5) || 'jpg';
  const path = `${user.id}/${subjectId}/${questionId}/image.${ext}`;

  const { error } = await supabase.storage
    .from('question-images')
    .upload(path, file, { upsert: true });

  if (error) {
    return { url: null, error: error.message };
  }

  const { data: publicUrlData } = supabase.storage
    .from('question-images')
    .getPublicUrl(path);

  return { url: publicUrlData.publicUrl, error: null };
}

function getStorageFolderFromUrl(imageUrl: string): string | null {
  const marker = '/question-images/';
  const idx = imageUrl.indexOf(marker);
  if (idx === -1) return null;
  const fullPath = decodeURIComponent(imageUrl.slice(idx + marker.length));
  const lastSlash = fullPath.lastIndexOf('/');
  return lastSlash >= 0 ? fullPath.slice(0, lastSlash) : null;
}

async function deleteImageByUrl(imageUrl: string): Promise<void> {
  const folder = getStorageFolderFromUrl(imageUrl);
  if (!folder) return;
  const { data: files } = await supabase.storage.from('question-images').list(folder);
  if (files && files.length > 0) {
    await supabase.storage.from('question-images').remove(files.map(f => `${folder}/${f.name}`));
  }
}

// ─── CREATE ──────────────────────────────────────────────────

export async function createQuestion(
  payload: CreateQuestionPayload,
  imageFile?: File | null
): Promise<{ data: string | null; error: string | null }> {
  const { data, error } = await supabase
    .from('questions')
    .insert({
      subject_id: payload.subject_id,
      course_outcome_id: payload.course_outcome_id,
      module_outcome_id: payload.module_outcome_id,
      question_text: payload.question_text,
      choices: payload.choices,
      correct_choice: payload.correct_choice,
    })
    .select('id')
    .single();

  if (error) {
    return { data: null, error: error.message };
  }

  const questionId = data.id as string;

  if (imageFile) {
    const { url, error: uploadError } = await uploadImage(payload.subject_id, questionId, imageFile);

    if (uploadError) {
      await supabase.from('questions').delete().eq('id', questionId);
      return { data: null, error: `Image upload failed: ${uploadError}` };
    }

    const { error: patchError } = await supabase
      .from('questions')
      .update({ image_url: url })
      .eq('id', questionId);

    if (patchError) {
      if (url) await deleteImageByUrl(url);
      await supabase.from('questions').delete().eq('id', questionId);
      return { data: null, error: `Failed to save image URL: ${patchError.message}` };
    }
  }

  return { data: questionId, error: null };
}

// ─── FETCH SINGLE QUESTION ───────────────────────────────────

export async function fetchQuestionById(
  questionId: string
): Promise<{ data: QuestionWithOutcomes | null; error: string | null }> {
  const { data, error } = await supabase
    .from('questions')
    .select(`
      *,
      course_outcomes(id, title, order_index),
      module_outcomes(id, description, order_index)
    `)
    .eq('id', questionId)
    .single();

  if (error) {
    return { data: null, error: error.message };
  }

  return { data: data as QuestionWithOutcomes, error: null };
}

// ─── FETCH ALL FOR SUBJECT ───────────────────────────────────

export async function fetchQuestionsBySubject(
  subjectId: string
): Promise<{ data: QuestionWithOutcomes[]; error: string | null }> {
  const { data, error } = await supabase
    .from('questions')
    .select(`
      *,
      course_outcomes(id, title, order_index),
      module_outcomes(id, description, order_index)
    `)
    .eq('subject_id', subjectId)
    .order('created_at', { ascending: false });

  if (error) {
    return { data: [], error: error.message };
  }

  return { data: data as QuestionWithOutcomes[], error: null };
}

// ─── FETCH BY IDs (for exam view) ────────────────────────────

export interface QuestionSummary {
  id: string;
  subject_id: string;
  question_text: string;
  choices: string[];
  correct_choice: number;
  image_url: string | null;
  course_outcomes: { title: string; description: string; order_index: number } | null;
  module_outcomes: { description: string; order_index: number } | null;
}

export async function fetchQuestionsByIds(
  ids: string[]
): Promise<{ data: QuestionSummary[]; error: string | null }> {
  if (ids.length === 0) return { data: [], error: null };
  const { data, error } = await supabase
    .from('questions')
    .select('id, subject_id, question_text, choices, correct_choice, image_url, course_outcomes(title, description, order_index), module_outcomes(description, order_index)')
    .in('id', ids);
  if (error) return { data: [], error: error.message };
  return { data: data as unknown as QuestionSummary[], error: null };
}

// ─── UPDATE ──────────────────────────────────────────────────

export async function updateQuestion(
  questionId: string,
  payload: UpdateQuestionPayload,
  imageFile?: File | null
): Promise<{ data: string | null; error: string | null }> {
  const updateData: Record<string, unknown> = {
    subject_id: payload.subject_id,
    course_outcome_id: payload.course_outcome_id,
    module_outcome_id: payload.module_outcome_id,
    question_text: payload.question_text,
    choices: payload.choices,
    correct_choice: payload.correct_choice,
  };

  if (imageFile || payload.remove_image) {
    const { data: existing } = await supabase
      .from('questions')
      .select('image_url')
      .eq('id', questionId)
      .single();
    const currentImageUrl = (existing as { image_url: string | null } | null)?.image_url ?? null;

    if (currentImageUrl) {
      await deleteImageByUrl(currentImageUrl);
    }

    if (imageFile) {
      const { url, error: uploadError } = await uploadImage(payload.subject_id, questionId, imageFile);
      if (uploadError) {
        return { data: null, error: `Image upload failed: ${uploadError}` };
      }
      updateData.image_url = url;
    } else {
      updateData.image_url = null;
    }
  }

  const { error } = await supabase
    .from('questions')
    .update(updateData)
    .eq('id', questionId);

  if (error) {
    return { data: null, error: error.message };
  }

  return { data: questionId, error: null };
}

// ─── DELETE ──────────────────────────────────────────────────

export async function deleteQuestion(
  questionId: string,
  imageUrl: string | null
): Promise<{ error: string | null }> {
  if (imageUrl) {
    await deleteImageByUrl(imageUrl);
  }

  const { error } = await supabase
    .from('questions')
    .delete()
    .eq('id', questionId);

  if (error) {
    return { error: error.message };
  }

  return { error: null };
}

// ─── PAGINATED FETCH ──────────────────────────────────────────

export interface PaginatedQuestionsResult {
  data: QuestionWithOutcomes[];
  count: number;
  error: string | null;
}

export async function fetchQuestionsBySubjectPaginated(
  subjectId: string,
  page: number,
  pageSize: number,
  filters?: { coId?: string; moId?: string; search?: string }
): Promise<PaginatedQuestionsResult> {
  let query = supabase
    .from('questions')
    .select(
      `*, course_outcomes(id, title, order_index), module_outcomes(id, description, order_index)`,
      { count: 'exact' }
    )
    .eq('subject_id', subjectId)
    .order('created_at', { ascending: false });

  if (filters?.coId) query = query.eq('course_outcome_id', filters.coId);
  if (filters?.moId) query = query.eq('module_outcome_id', filters.moId);
  if (filters?.search?.trim()) {
    query = query.ilike('question_text', `%${filters.search.trim()}%`);
  }

  const from = (page - 1) * pageSize;
  query = query.range(from, from + pageSize - 1);

  const { data, error, count } = await query;
  if (error) return { data: [], count: 0, error: error.message };
  return { data: data as QuestionWithOutcomes[], count: count ?? 0, error: null };
}

// ─── LIGHTWEIGHT OUTCOME IDs (for summary modal) ─────────────

export async function fetchQuestionOutcomeIdsBySubject(
  subjectId: string
): Promise<{ data: { course_outcome_id: string; module_outcome_id: string }[]; error: string | null }> {
  const { data, error } = await supabase
    .from('questions')
    .select('course_outcome_id, module_outcome_id')
    .eq('subject_id', subjectId);
  if (error) return { data: [], error: error.message };
  return { data: data as { course_outcome_id: string; module_outcome_id: string }[], error: null };
}

export async function countQuestionsByCourseOutcome(coId: string): Promise<number> {
  const { count } = await supabase
    .from('questions')
    .select('id', { count: 'exact', head: true })
    .eq('course_outcome_id', coId);
  return count ?? 0;
}

export async function countQuestionsByModuleOutcome(moId: string): Promise<number> {
  const { count } = await supabase
    .from('questions')
    .select('id', { count: 'exact', head: true })
    .eq('module_outcome_id', moId);
  return count ?? 0;
}

export async function fetchQuestionsWithOutcomesByIds(
  ids: string[]
): Promise<{ data: QuestionWithOutcomes[]; error: string | null }> {
  if (ids.length === 0) return { data: [], error: null };
  const { data, error } = await supabase
    .from('questions')
    .select('id, subject_id, correct_choice, course_outcome_id, module_outcome_id, course_outcomes(id, title, description, order_index), module_outcomes(id, description, order_index)')
    .in('id', ids);
  if (error) return { data: [], error: error.message };
  return { data: data as unknown as QuestionWithOutcomes[], error: null };
}
