import { supabase } from './supabase';

export interface Template {
    id: string;
    title: string;
    code: string;
    created_at: string;
    subject_ids: string[];
    program_ids: string[];
}

export async function fetchTemplates(): Promise<{ data: Template[]; error: string | null }> {
    const { data, error } = await supabase
        .from('exam_templates')
        .select('id, title, code, created_at, subject_ids, program_ids')
        .order('created_at', { ascending: false });

    if (error) return { data: [], error: error.message };
    return { data: data as Template[], error: null };
}

export async function fetchTemplateById(id: string): Promise<{ data: Template | null; error: string | null }> {
    const { data, error } = await supabase
        .from('exam_templates')
        .select('id, title, code, created_at, subject_ids, program_ids')
        .eq('id', id)
        .single();

    if (error) return { data: null, error: error.message };
    return { data: data as Template, error: null };
}

export async function createTemplate(
    title: string,
    code: string,
    subjectIds: string[],
    programIds: string[] = []
): Promise<{ data: Template | null; error: string | null }> {
    const { data: { session } } = await supabase.auth.getSession();
    const user = session?.user;

    const { data: template, error: insertError } = await supabase
        .from('exam_templates')
        .insert({ title, code, created_by: user?.id, subject_ids: subjectIds, program_ids: programIds })
        .select('id, title, code, created_at, subject_ids, program_ids')
        .single();

    if (insertError) {
        if (insertError.code === '23505') return { data: null, error: `The exam code "${code}" already exists.` };
        return { data: null, error: insertError.message };
    }

    return { data: template as Template, error: null };
}

export async function updateTemplate(
    id: string,
    title: string,
    code: string,
    subjectIds: string[],
    programIds: string[] = []
): Promise<{ error: string | null }> {
    const { error: updateError } = await supabase
        .from('exam_templates')
        .update({ title, code, subject_ids: subjectIds, program_ids: programIds, updated_at: new Date().toISOString() })
        .eq('id', id);

    if (updateError) {
        if (updateError.code === '23505') return { error: `The exam code "${code}" already exists.` };
        return { error: updateError.message };
    }

    return { error: null };
}

export async function deleteTemplate(id: string): Promise<{ error: string | null }> {
    const { error } = await supabase.from('exam_templates').delete().eq('id', id);
    if (error) return { error: error.message };
    return { error: null };
}
