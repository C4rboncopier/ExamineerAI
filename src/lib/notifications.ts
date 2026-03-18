import { supabase } from './supabase';

export interface ProfessorNotification {
    id: string;
    recipient_id: string;
    sender_id: string;
    type: 'exam_invite';
    payload: { exam_id: string; exam_title: string; faculty_id: string };
    read: boolean;
    created_at: string;
    sender: {
        id: string;
        full_name: string | null;
        email: string | null;
    } | null;
}

export async function fetchNotifications(
    recipientId: string
): Promise<{ data: ProfessorNotification[]; error: string | null }> {
    const { data, error } = await supabase
        .from('professor_notifications')
        .select('id, recipient_id, sender_id, type, payload, read, created_at, sender:profiles!professor_notifications_sender_id_fkey(id, full_name, email)')
        .eq('recipient_id', recipientId)
        .order('created_at', { ascending: false });

    if (error) return { data: [], error: error.message };
    return { data: data as ProfessorNotification[], error: null };
}

export async function fetchUnreadCount(recipientId: string): Promise<number> {
    const { count, error } = await supabase
        .from('professor_notifications')
        .select('id', { count: 'exact', head: true })
        .eq('recipient_id', recipientId)
        .eq('read', false);

    if (error) return 0;
    return count ?? 0;
}

export async function markNotificationRead(
    notifId: string
): Promise<{ error: string | null }> {
    const { error } = await supabase
        .from('professor_notifications')
        .update({ read: true })
        .eq('id', notifId);
    return { error: error?.message ?? null };
}

export async function markAllNotificationsRead(
    recipientId: string
): Promise<{ error: string | null }> {
    const { error } = await supabase
        .from('professor_notifications')
        .update({ read: true })
        .eq('recipient_id', recipientId)
        .eq('read', false);
    return { error: error?.message ?? null };
}

export async function deleteReadNotifications(
    recipientId: string
): Promise<{ error: string | null }> {
    const { error } = await supabase
        .from('professor_notifications')
        .delete()
        .eq('recipient_id', recipientId)
        .eq('read', true);
    return { error: error?.message ?? null };
}

export async function deleteNotificationByFacultyId(
    facultyId: string
): Promise<{ error: string | null }> {
    const { error } = await supabase.rpc('delete_exam_invite_notification', {
        p_faculty_id: facultyId,
    });
    return { error: error?.message ?? null };
}

export async function createExamInviteNotification(params: {
    recipientId: string;
    senderId: string;
    examId: string;
    examTitle: string;
    facultyId: string;
}): Promise<{ error: string | null }> {
    const { error } = await supabase
        .from('professor_notifications')
        .insert({
            recipient_id: params.recipientId,
            sender_id: params.senderId,
            type: 'exam_invite',
            payload: {
                exam_id: params.examId,
                exam_title: params.examTitle,
                faculty_id: params.facultyId,
            },
        });
    return { error: error?.message ?? null };
}
