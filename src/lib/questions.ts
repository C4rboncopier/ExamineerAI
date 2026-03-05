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
    order_index: number;
  };
  module_outcomes: {
    id: string;
    description: string;
    order_index: number;
  };
}

// ─── IMAGE HELPERS (private) ─────────────────────────────────

function buildStoragePath(
  professorId: string,
  subjectId: string,
  questionId: string,
  fileName: string
): string {
  return `${professorId}/${subjectId}/${questionId}/${fileName}`;
}

async function uploadImage(
  professorId: string,
  subjectId: string,
  questionId: string,
  file: File
): Promise<{ url: string | null; error: string | null }> {
  const path = buildStoragePath(professorId, subjectId, questionId, file.name);

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

async function deleteImageFolder(
  professorId: string,
  subjectId: string,
  questionId: string
): Promise<{ error: string | null }> {
  const folderPath = `${professorId}/${subjectId}/${questionId}`;

  const { data: files, error: listError } = await supabase.storage
    .from('question-images')
    .list(folderPath);

  if (listError) {
    return { error: listError.message };
  }

  if (files && files.length > 0) {
    const paths = files.map((f) => `${folderPath}/${f.name}`);
    const { error: removeError } = await supabase.storage
      .from('question-images')
      .remove(paths);

    if (removeError) {
      return { error: removeError.message };
    }
  }

  return { error: null };
}

// ─── CREATE ──────────────────────────────────────────────────

export async function createQuestion(
  payload: CreateQuestionPayload,
  imageFile?: File | null
): Promise<{ data: string | null; error: string | null }> {
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return { data: null, error: 'Authentication required.' };
  }

  const { data, error } = await supabase
    .from('questions')
    .insert({
      professor_id: user.id,
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
    const { url, error: uploadError } = await uploadImage(
      user.id,
      payload.subject_id,
      questionId,
      imageFile
    );

    if (uploadError) {
      await supabase.from('questions').delete().eq('id', questionId);
      return { data: null, error: `Image upload failed: ${uploadError}` };
    }

    const { error: patchError } = await supabase
      .from('questions')
      .update({ image_url: url })
      .eq('id', questionId);

    if (patchError) {
      await deleteImageFolder(user.id, payload.subject_id, questionId);
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
  question_text: string;
  choices: string[];
  correct_choice: number;
  image_url: string | null;
  course_outcomes: { title: string; order_index: number } | null;
  module_outcomes: { description: string; order_index: number } | null;
}

export async function fetchQuestionsByIds(
  ids: string[]
): Promise<{ data: QuestionSummary[]; error: string | null }> {
  if (ids.length === 0) return { data: [], error: null };
  const { data, error } = await supabase
    .from('questions')
    .select('id, question_text, choices, correct_choice, image_url, course_outcomes(title, order_index), module_outcomes(description, order_index)')
    .in('id', ids);
  if (error) return { data: [], error: error.message };
  return { data: data as QuestionSummary[], error: null };
}

// ─── UPDATE ──────────────────────────────────────────────────

export async function updateQuestion(
  questionId: string,
  payload: UpdateQuestionPayload,
  imageFile?: File | null
): Promise<{ data: string | null; error: string | null }> {
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return { data: null, error: 'Authentication required.' };
  }

  const updateData: Record<string, unknown> = {
    subject_id: payload.subject_id,
    course_outcome_id: payload.course_outcome_id,
    module_outcome_id: payload.module_outcome_id,
    question_text: payload.question_text,
    choices: payload.choices,
    correct_choice: payload.correct_choice,
  };

  if (imageFile) {
    await deleteImageFolder(user.id, payload.subject_id, questionId);

    const { url, error: uploadError } = await uploadImage(
      user.id,
      payload.subject_id,
      questionId,
      imageFile
    );

    if (uploadError) {
      return { data: null, error: `Image upload failed: ${uploadError}` };
    }

    updateData.image_url = url;
  } else if (payload.remove_image) {
    await deleteImageFolder(user.id, payload.subject_id, questionId);
    updateData.image_url = null;
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
  professorId: string,
  subjectId: string
): Promise<{ error: string | null }> {
  await deleteImageFolder(professorId, subjectId, questionId);

  const { error } = await supabase
    .from('questions')
    .delete()
    .eq('id', questionId);

  if (error) {
    return { error: error.message };
  }

  return { error: null };
}
