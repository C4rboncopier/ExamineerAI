import { supabase } from './supabase';

export interface Program {
  id: string;
  code: string;
  name: string;
  created_at: string;
  updated_at: string;
}

// ── Academic Year ──────────────────────────────────────────

export async function fetchAcademicYear(): Promise<{ value: string | null; error: string | null }> {
  const { data, error } = await supabase
    .from('settings')
    .select('value')
    .eq('key', 'academic_year')
    .single();

  if (error) {
    return { value: null, error: error.message };
  }

  return { value: data.value, error: null };
}

export async function saveAcademicYear(value: string): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('settings')
    .upsert({ key: 'academic_year', value, updated_at: new Date().toISOString() });

  if (error) {
    return { error: error.message };
  }

  return { error: null };
}

// ── Semester ───────────────────────────────────────────────

export async function fetchSemester(): Promise<{ value: string | null; error: string | null }> {
  const { data, error } = await supabase
    .from('settings')
    .select('value')
    .eq('key', 'semester')
    .single();

  if (error) {
    return { value: null, error: error.message };
  }

  return { value: data.value, error: null };
}

export async function saveSemester(value: string): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('settings')
    .upsert({ key: 'semester', value, updated_at: new Date().toISOString() });

  if (error) {
    return { error: error.message };
  }

  return { error: null };
}

// ── Programs ───────────────────────────────────────────────

export async function fetchPrograms(): Promise<{ data: Program[]; error: string | null }> {
  const { data, error } = await supabase
    .from('programs')
    .select('*')
    .order('code', { ascending: true });

  if (error) {
    return { data: [], error: error.message };
  }

  return { data: data as Program[], error: null };
}

export async function createProgram(
  code: string,
  name: string
): Promise<{ data: Program | null; error: string | null }> {
  const { data, error } = await supabase
    .from('programs')
    .insert({ code: code.trim().toUpperCase(), name: name.trim() })
    .select()
    .single();

  if (error) {
    if (error.code === '23505') {
      return { data: null, error: `Program code "${code.toUpperCase()}" already exists.` };
    }
    return { data: null, error: error.message };
  }

  return { data: data as Program, error: null };
}

export async function updateProgram(
  id: string,
  code: string,
  name: string
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('programs')
    .update({ code: code.trim().toUpperCase(), name: name.trim(), updated_at: new Date().toISOString() })
    .eq('id', id);

  if (error) {
    if (error.code === '23505') {
      return { error: `Program code "${code.toUpperCase()}" already exists.` };
    }
    return { error: error.message };
  }

  return { error: null };
}

export async function deleteProgram(id: string): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('programs')
    .delete()
    .eq('id', id);

  if (error) {
    return { error: error.message };
  }

  return { error: null };
}
