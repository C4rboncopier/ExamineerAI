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

// ── School Info ─────────────────────────────────────────────

export async function fetchSchoolInfo(): Promise<{
  name: string | null;
  logoUrl: string | null;
  error: string | null;
}> {
  const { data, error } = await supabase
    .from('settings')
    .select('key, value')
    .in('key', ['school_name', 'school_logo_url']);

  if (error) return { name: null, logoUrl: null, error: error.message };

  const map: Record<string, string> = {};
  (data as { key: string; value: string }[]).forEach(row => { map[row.key] = row.value; });

  return {
    name: map['school_name'] ?? null,
    logoUrl: map['school_logo_url'] || null,
    error: null,
  };
}

export async function saveSchoolName(value: string): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('settings')
    .upsert({ key: 'school_name', value, updated_at: new Date().toISOString() });
  return { error: error?.message ?? null };
}

export async function uploadSchoolLogo(file: File): Promise<{ url: string | null; error: string | null }> {
  const ext = file.name.split('.').pop() ?? 'png';
  const path = `logo/school-logo.${ext}`;

  const { error } = await supabase.storage
    .from('school-assets')
    .upload(path, file, { upsert: true, contentType: file.type });

  if (error) return { url: null, error: error.message };

  const { data } = supabase.storage.from('school-assets').getPublicUrl(path);
  return { url: data.publicUrl, error: null };
}

export async function saveSchoolLogoUrl(url: string): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('settings')
    .upsert({ key: 'school_logo_url', value: url, updated_at: new Date().toISOString() });
  return { error: error?.message ?? null };
}

export async function removeSchoolLogo(): Promise<{ error: string | null }> {
  const { data: files, error: listError } = await supabase.storage
    .from('school-assets')
    .list('logo');

  if (listError) return { error: listError.message };

  if (files && files.length > 0) {
    const paths = files.map(f => `logo/${f.name}`);
    const { error: removeError } = await supabase.storage.from('school-assets').remove(paths);
    if (removeError) return { error: removeError.message };
  }

  const { error } = await supabase
    .from('settings')
    .upsert({ key: 'school_logo_url', value: '', updated_at: new Date().toISOString() });
  return { error: error?.message ?? null };
}

// ── Default Passing Rate ────────────────────────────────────

export async function fetchPassingRate(): Promise<{ value: number | null; error: string | null }> {
  const { data, error } = await supabase
    .from('settings')
    .select('value')
    .eq('key', 'default_passing_rate')
    .single();

  if (error) return { value: null, error: null }; // row may not exist yet; treat as no error
  return { value: parseInt(data.value) || null, error: null };
}

export async function savePassingRate(value: number): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('settings')
    .upsert({ key: 'default_passing_rate', value: String(value), updated_at: new Date().toISOString() });
  return { error: error?.message ?? null };
}

// ── AI Generation Daily Limit ───────────────────────────────

export async function fetchAiDailyLimit(): Promise<{ value: number | null; error: string | null }> {
  const { data, error } = await supabase
    .from('settings')
    .select('value')
    .eq('key', 'ai_generation_daily_limit')
    .single();

  if (error) return { value: null, error: null }; // row may not exist yet; treat as no error
  return { value: parseInt(data.value) || null, error: null };
}

export async function saveAiDailyLimit(value: number): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('settings')
    .upsert({ key: 'ai_generation_daily_limit', value: String(value), updated_at: new Date().toISOString() });
  return { error: error?.message ?? null };
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
