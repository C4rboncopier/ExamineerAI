import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useNotifications } from '../../contexts/NotificationsContext';
import {
    fetchNotifications,
    markNotificationRead,
    deleteReadNotifications,
    type ProfessorNotification,
} from '../../lib/notifications';
import { updateFacultyStatus } from '../../lib/examFaculty';
import { updateSubjectFacultyStatus } from '../../lib/subjectFaculty';

function timeAgo(dateStr: string): string {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days < 7) return `${days}d ago`;
    return new Date(dateStr).toLocaleDateString();
}

export function Notifications() {
    const { user } = useAuth();
    const { refreshCount } = useNotifications();
    const [notifications, setNotifications] = useState<ProfessorNotification[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState<string | null>(null);
    const [filter, setFilter] = useState<'all' | 'unread'>('all');

    const load = useCallback(async () => {
        if (!user?.id) return;
        const { data } = await fetchNotifications(user.id);
        setNotifications(data);
        setIsLoading(false);
    }, [user?.id]);

    useEffect(() => { load(); }, [load]);

    useEffect(() => {
        if (!user?.id) return;
        const channel = supabase
            .channel(`notifications-list-${user.id}`)
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'professor_notifications',
                filter: `recipient_id=eq.${user.id}`,
            }, () => {
                load();
            })
            .subscribe();
        return () => { supabase.removeChannel(channel); };
    }, [user?.id, load]);

    const handleClearRead = async () => {
        if (!user?.id) return;
        await deleteReadNotifications(user.id);
        setNotifications(prev => prev.filter(n => !n.read));
    };

    const handleAccept = async (notif: ProfessorNotification) => {
        setActionLoading(notif.id + '_accept');
        if (notif.type === 'exam_invite') {
            await updateFacultyStatus(notif.payload.faculty_id, 'accepted');
        } else {
            await updateSubjectFacultyStatus(notif.payload.faculty_id, 'accepted');
        }
        await markNotificationRead(notif.id);
        setNotifications(prev => prev.map(n => n.id === notif.id ? { ...n, read: true } : n));
        refreshCount();
        setActionLoading(null);
    };

    const handleDecline = async (notif: ProfessorNotification) => {
        setActionLoading(notif.id + '_decline');
        if (notif.type === 'exam_invite') {
            await updateFacultyStatus(notif.payload.faculty_id, 'declined');
        } else {
            await updateSubjectFacultyStatus(notif.payload.faculty_id, 'declined');
        }
        await markNotificationRead(notif.id);
        setNotifications(prev => prev.map(n => n.id === notif.id ? { ...n, read: true } : n));
        refreshCount();
        setActionLoading(null);
    };

    const unreadCount = notifications.filter(n => !n.read).length;
    const displayed = filter === 'unread' ? notifications.filter(n => !n.read) : notifications;

    return (
        <div className="subjects-container">

            {/* ── Header ── */}
            <div className="subjects-header">
                <div>
                    <h2 className="subjects-title">Notifications</h2>
                    <p className="subjects-subtitle">
                        {unreadCount > 0
                            ? `You have ${unreadCount} unread notification${unreadCount > 1 ? 's' : ''}.`
                            : 'You are all caught up.'}
                    </p>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                    {notifications.some(n => n.read) && (
                        <button className="btn-secondary" onClick={handleClearRead}>
                            Clear read
                        </button>
                    )}
                </div>
            </div>

            {/* ── Filter tabs ── */}
            <div style={{ display: 'flex', gap: '6px', marginBottom: '16px' }}>
                {(['all', 'unread'] as const).map(f => (
                    <button
                        key={f}
                        onClick={() => setFilter(f)}
                        style={{
                            padding: '6px 16px',
                            fontSize: '0.83rem',
                            fontWeight: 600,
                            borderRadius: '8px',
                            border: filter === f ? '1px solid var(--prof-primary)' : '1px solid var(--prof-border)',
                            background: filter === f ? 'var(--prof-primary)' : 'var(--prof-surface)',
                            color: filter === f ? '#fff' : 'var(--prof-text-muted)',
                            cursor: 'pointer',
                            transition: 'all 0.15s',
                        }}
                    >
                        {f === 'all' ? `All (${notifications.length})` : `Unread (${unreadCount})`}
                    </button>
                ))}
            </div>

            {/* ── Content ── */}
            {isLoading ? (
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '80px 0' }}>
                    <span style={{
                        display: 'inline-block', width: '32px', height: '32px',
                        border: '3px solid var(--prof-border)', borderTopColor: 'var(--prof-primary)',
                        borderRadius: '50%', animation: 'spin 0.8s linear infinite',
                    }} />
                </div>
            ) : displayed.length === 0 ? (
                <div className="cs-card" style={{ textAlign: 'center', padding: '64px 24px' }}>
                    <div style={{
                        width: '56px', height: '56px', borderRadius: '50%',
                        background: '#f1f5f9', display: 'flex', alignItems: 'center',
                        justifyContent: 'center', margin: '0 auto 16px',
                    }}>
                        <svg fill="none" strokeWidth="1.5" stroke="#94a3b8" viewBox="0 0 24 24" width="28" height="28">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
                        </svg>
                    </div>
                    <p style={{ margin: 0, fontWeight: 600, fontSize: '0.95rem', color: 'var(--prof-text-main)' }}>
                        {filter === 'unread' ? 'No unread notifications.' : 'No notifications yet.'}
                    </p>
                    <p style={{ margin: '4px 0 0', fontSize: '0.85rem', color: 'var(--prof-text-muted)' }}>
                        {filter === 'unread' ? 'Switch to "All" to see past notifications.' : 'Exam and subject handling invitations will appear here.'}
                    </p>
                </div>
            ) : (
                <div className="cs-card" style={{ padding: 0, overflow: 'hidden' }}>
                    {displayed.map((notif, idx) => {
                        const isPending = !notif.read;
                        const senderName = notif.sender?.full_name ?? notif.sender?.email ?? 'A professor';
                        const itemTitle = notif.type === 'exam_invite'
                            ? (notif.payload as { exam_title: string }).exam_title
                            : (notif.payload as { subject_title: string }).subject_title;
                        const isFirst = idx === 0;
                        return (
                            <div
                                key={notif.id}
                                style={{
                                    display: 'flex',
                                    alignItems: 'flex-start',
                                    gap: '14px',
                                    padding: '16px 20px',
                                    borderTop: isFirst ? 'none' : '1px solid var(--prof-border)',
                                    background: notif.read ? 'transparent' : '#f8faff',
                                    position: 'relative',
                                }}
                            >
                                {/* Unread left accent */}
                                {!notif.read && (
                                    <div style={{
                                        position: 'absolute', left: 0, top: 0, bottom: 0,
                                        width: '3px', background: '#3b82f6',
                                    }} />
                                )}

                                {/* Icon */}
                                <div style={{
                                    flexShrink: 0, width: '38px', height: '38px', borderRadius: '50%',
                                    background: '#eff6ff', border: '1px solid #bfdbfe',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    marginTop: '1px',
                                }}>
                                    <svg fill="none" strokeWidth="1.75" stroke="#3b82f6" viewBox="0 0 24 24" width="18" height="18">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
                                    </svg>
                                </div>

                                {/* Body */}
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <p style={{ margin: '0 0 2px', fontSize: '0.9rem', color: 'var(--prof-text-main)', lineHeight: 1.45 }}>
                                        <strong>{senderName}</strong>
                                        {' '}invited you to co-handle{' '}
                                        <strong>{itemTitle}</strong>.
                                    </p>
                                    <p style={{ margin: '0 0 10px', fontSize: '0.77rem', color: 'var(--prof-text-muted)' }}>
                                        {timeAgo(notif.created_at)}
                                    </p>

                                    {isPending && (
                                        <div style={{ display: 'flex', gap: '8px' }}>
                                            <button
                                                onClick={() => handleAccept(notif)}
                                                disabled={!!actionLoading}
                                                style={{
                                                    padding: '5px 16px', fontSize: '0.82rem', fontWeight: 600,
                                                    background: '#dcfce7', color: '#166534',
                                                    border: '1px solid #86efac', borderRadius: '7px',
                                                    cursor: actionLoading ? 'default' : 'pointer',
                                                    opacity: actionLoading === notif.id + '_accept' ? 0.6 : 1,
                                                }}
                                            >
                                                {actionLoading === notif.id + '_accept' ? 'Accepting...' : 'Accept'}
                                            </button>
                                            <button
                                                onClick={() => handleDecline(notif)}
                                                disabled={!!actionLoading}
                                                style={{
                                                    padding: '5px 16px', fontSize: '0.82rem', fontWeight: 600,
                                                    background: 'var(--prof-surface)', color: 'var(--prof-text-muted)',
                                                    border: '1px solid var(--prof-border)', borderRadius: '7px',
                                                    cursor: actionLoading ? 'default' : 'pointer',
                                                    opacity: actionLoading === notif.id + '_decline' ? 0.6 : 1,
                                                }}
                                            >
                                                {actionLoading === notif.id + '_decline' ? 'Declining...' : 'Decline'}
                                            </button>
                                        </div>
                                    )}

                                    {!isPending && (
                                        <span style={{
                                            display: 'inline-block', fontSize: '0.77rem', fontWeight: 600,
                                            background: '#f1f5f9', color: '#64748b',
                                            border: '1px solid #e2e8f0', borderRadius: '6px',
                                            padding: '2px 10px',
                                        }}>
                                            Responded
                                        </span>
                                    )}
                                </div>

                                {/* Unread dot */}
                                {!notif.read && (
                                    <div style={{
                                        flexShrink: 0, width: '8px', height: '8px',
                                        borderRadius: '50%', background: '#3b82f6', marginTop: '6px',
                                    }} />
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
