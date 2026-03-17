import { supabase } from './supabase';

/**
 * Fetch the total number of AI-generated questions used today (UTC day) by a professor.
 */
export async function fetchTodayAiUsage(professorId: string): Promise<{ used: number; error: string | null }> {
    // Compute start of today in Philippine Standard Time (UTC+8)
    const phtOffset = 8 * 60 * 60 * 1000;
    const nowInPHT = new Date(Date.now() + phtOffset);
    nowInPHT.setUTCHours(0, 0, 0, 0); // midnight in PHT
    const todayStart = new Date(nowInPHT.getTime() - phtOffset); // back to UTC

    const { data, error } = await supabase
        .from('ai_generation_logs')
        .select('count')
        .eq('professor_id', professorId)
        .gte('created_at', todayStart.toISOString());

    if (error) return { used: 0, error: error.message };

    const used = (data ?? []).reduce((sum, row) => sum + (row.count ?? 0), 0);
    return { used, error: null };
}

/**
 * Log a batch of AI-generated questions for a professor.
 */
export async function logAiGeneration(professorId: string, count: number): Promise<{ error: string | null }> {
    const { error } = await supabase
        .from('ai_generation_logs')
        .insert({ professor_id: professorId, count });

    return { error: error?.message ?? null };
}
