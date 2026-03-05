import { supabase } from './supabase';

export interface TemplateSubject {
    subject_id: string;
    subjects: {
        course_code: string;
        course_title: string;
    } | null;
}

export interface Template {
    id: string;
    title: string;
    code: string;
    created_at: string;
    exam_template_subjects: TemplateSubject[];
}

export async function fetchTemplates(): Promise<{ data: Template[]; error: string | null }> {
    const { data, error } = await supabase
        .from('exam_templates')
        .select('id, title, code, created_at, exam_template_subjects(subject_id, subjects(course_code, course_title))')
        .order('created_at', { ascending: false });

    if (error) return { data: [], error: error.message };
    return { data: data as Template[], error: null };
}

export async function fetchTemplateById(id: string): Promise<{ data: Template | null; error: string | null }> {
    const { data, error } = await supabase
        .from('exam_templates')
        .select('id, title, code, created_at, exam_template_subjects(subject_id, subjects(course_code, course_title))')
        .eq('id', id)
        .single();

    if (error) return { data: null, error: error.message };
    return { data: data as Template, error: null };
}

export async function createTemplate(
    title: string,
    code: string,
    subjectIds: string[]
): Promise<{ data: Template | null; error: string | null }> {
    const { data: { user } } = await supabase.auth.getUser();

    const { data: template, error: insertError } = await supabase
        .from('exam_templates')
        .insert({ title, code, created_by: user?.id })
        .select('id')
        .single();

    if (insertError) {
        if (insertError.code === '23505') return { data: null, error: `The exam code "${code}" already exists.` };
        return { data: null, error: insertError.message };
    }

    if (subjectIds.length > 0) {
        const { error: junctionError } = await supabase
            .from('exam_template_subjects')
            .insert(subjectIds.map(subject_id => ({ template_id: template.id, subject_id })));

        if (junctionError) {
            await supabase.from('exam_templates').delete().eq('id', template.id);
            return { data: null, error: 'Failed to link subjects. Please try again.' };
        }
    }

    return fetchTemplateById(template.id);
}

export async function updateTemplate(
    id: string,
    title: string,
    code: string,
    subjectIds: string[]
): Promise<{ error: string | null }> {
    const { error: updateError } = await supabase
        .from('exam_templates')
        .update({ title, code, updated_at: new Date().toISOString() })
        .eq('id', id);

    if (updateError) {
        if (updateError.code === '23505') return { error: `The exam code "${code}" already exists.` };
        return { error: updateError.message };
    }

    await supabase.from('exam_template_subjects').delete().eq('template_id', id);

    if (subjectIds.length > 0) {
        const { error: junctionError } = await supabase
            .from('exam_template_subjects')
            .insert(subjectIds.map(subject_id => ({ template_id: id, subject_id })));

        if (junctionError) return { error: 'Failed to update subjects. Please try again.' };
    }

    return { error: null };
}

export async function deleteTemplate(id: string): Promise<{ error: string | null }> {
    const { error } = await supabase.from('exam_templates').delete().eq('id', id);
    if (error) return { error: error.message };
    return { error: null };
}
