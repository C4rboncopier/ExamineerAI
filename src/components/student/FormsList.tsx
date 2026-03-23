import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import {
    fetchStudentForms, getFormWindowStatus, formatPHT, markAllNotificationsRead,
} from '../../lib/studentForms';
import type { StudentForm } from '../../lib/studentForms';

type FilterStatus = 'all' | 'open' | 'upcoming' | 'closed' | 'submitted';

export function StudentFormsList() {
    const { user } = useAuth();
    const navigate = useNavigate();
    const [forms, setForms] = useState<StudentForm[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState<FilterStatus>('all');

    useEffect(() => {
        if (!user) return;
        fetchStudentForms(user.id).then(({ data }) => {
            setForms(data);
            setIsLoading(false);
        });
        // Mark all notifications as read when viewing forms list
        markAllNotificationsRead(user.id);
    }, [user]);

    const filtered = useMemo(() => {
        const q = searchQuery.toLowerCase().trim();
        return forms.filter(f => {
            const matchSearch = !q || f.title.toLowerCase().includes(q);
            const ws = getFormWindowStatus(f);
            const hasSubmitted = !!f.my_submission;

            let matchStatus = true;
            if (statusFilter === 'submitted') matchStatus = hasSubmitted;
            else if (statusFilter === 'open') matchStatus = ws === 'open' && !hasSubmitted;
            else if (statusFilter === 'upcoming') matchStatus = ws === 'upcoming';
            else if (statusFilter === 'closed') matchStatus = ws === 'closed' && !hasSubmitted;

            return matchSearch && matchStatus;
        });
    }, [forms, searchQuery, statusFilter]);

    if (isLoading) {
        return (
            <div className="qb-container create-question-wrapper" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
                    <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="#ec1f28" strokeWidth="2" style={{ animation: 'spin 1s linear infinite' }}>
                        <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                    </svg>
                    <p style={{ margin: 0, color: '#94a3b8', fontSize: '0.95rem', fontWeight: 500 }}>Loading forms...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="qb-container create-question-wrapper">
            <div className="cs-header" style={{ marginBottom: '20px' }}>
                <div>
                    <h2>Forms</h2>
                    <p style={{ margin: 0, color: 'var(--prof-text-muted)', fontSize: '0.9rem' }}>Application forms for upcoming exam attempts.</p>
                </div>
            </div>

            {/* Filters */}
            {forms.length > 0 && (
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '20px' }}>
                    <div style={{ position: 'relative', flex: '1 1 200px' }}>
                        <svg fill="none" strokeWidth="2" stroke="currentColor" viewBox="0 0 24 24" width="15" height="15" style={{ position: 'absolute', left: '11px', top: '50%', transform: 'translateY(-50%)', color: 'var(--prof-text-muted)', pointerEvents: 'none' }}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                        </svg>
                        <input
                            type="text"
                            placeholder="Search forms..."
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            style={{ width: '100%', padding: '9px 12px 9px 34px', borderRadius: '8px', border: '1.5px solid var(--prof-border)', background: '#fff', fontSize: '0.875rem', outline: 'none', boxSizing: 'border-box' }}
                        />
                    </div>
                    <div style={{ position: 'relative', flexShrink: 0 }}>
                        <select
                            value={statusFilter}
                            onChange={e => setStatusFilter(e.target.value as FilterStatus)}
                            style={{ appearance: 'none', padding: '9px 36px 9px 14px', borderRadius: '8px', border: '1.5px solid var(--prof-border)', background: '#fff', color: 'var(--prof-text-main)', fontSize: '0.875rem', fontWeight: 500, outline: 'none', cursor: 'pointer', minWidth: '150px' }}
                        >
                            <option value="all">All Status</option>
                            <option value="open">Open</option>
                            <option value="upcoming">Upcoming</option>
                            <option value="closed">Closed</option>
                            <option value="submitted">Submitted</option>
                        </select>
                        <div style={{ position: 'absolute', right: '11px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'var(--prof-text-muted)' }}>
                            <svg fill="none" strokeWidth="2.5" stroke="currentColor" viewBox="0 0 24 24" width="14" height="14"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" /></svg>
                        </div>
                    </div>
                </div>
            )}

            {forms.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '60px 20px', background: '#fff', borderRadius: '16px', border: '1px solid var(--prof-border)' }}>
                    <svg fill="none" strokeWidth="1.5" stroke="currentColor" viewBox="0 0 24 24" width="48" height="48" style={{ margin: '0 auto 14px', display: 'block', opacity: 0.25 }}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" />
                    </svg>
                    <h3 style={{ margin: '0 0 6px', fontSize: '1rem', fontWeight: 600, color: 'var(--prof-text-main)' }}>No forms available</h3>
                    <p style={{ margin: 0, color: 'var(--prof-text-muted)', fontSize: '0.88rem' }}>Application forms for exam attempts will appear here.</p>
                </div>
            ) : filtered.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px 20px', background: '#fff', borderRadius: '12px', border: '1px solid var(--prof-border)' }}>
                    <p style={{ margin: 0, color: 'var(--prof-text-muted)' }}>No forms match your filter.</p>
                </div>
            ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '16px' }}>
                    {filtered.map(form => <FormCard key={form.id} form={form} onOpen={() => navigate(`/student/forms/${form.id}`)} />)}
                </div>
            )}
        </div>
    );
}

function FormCard({ form, onOpen }: { form: StudentForm; onOpen: () => void }) {
    const ws = getFormWindowStatus(form);
    const hasSubmitted = !!form.my_submission;

    let statusLabel: string;
    let statusBg: string;
    let statusColor: string;
    let statusBorder: string;

    if (hasSubmitted) {
        statusLabel = 'Submitted'; statusBg = '#eff6ff'; statusColor = '#1d4ed8'; statusBorder = '#bfdbfe';
    } else if (ws === 'open') {
        statusLabel = 'Open'; statusBg = '#dcfce7'; statusColor = '#15803d'; statusBorder = '#86efac';
    } else if (ws === 'upcoming') {
        statusLabel = 'Upcoming'; statusBg = '#fef9c3'; statusColor = '#854d0e'; statusBorder = '#fde047';
    } else {
        statusLabel = 'Closed'; statusBg = '#f1f5f9'; statusColor = '#475569'; statusBorder = '#cbd5e1';
    }

    return (
        <div
            onClick={onOpen}
            style={{
                background: '#fff', border: '1px solid var(--prof-border)', borderRadius: '14px',
                padding: '20px', cursor: ws === 'open' && !hasSubmitted ? 'pointer' : 'default',
                display: 'flex', flexDirection: 'column', gap: '14px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                transition: 'box-shadow 0.2s, border-color 0.2s',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 12px rgba(0,0,0,0.08)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.boxShadow = '0 1px 3px rgba(0,0,0,0.05)'; }}
        >
            {/* Title + status */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '10px' }}>
                <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#0f172a', lineHeight: 1.4, minHeight: 'calc(1rem * 1.4 * 2)' }}>
                    {form.title}
                </h3>
                <span style={{ flexShrink: 0, fontSize: '0.72rem', fontWeight: 700, color: statusColor, background: statusBg, border: `1px solid ${statusBorder}`, borderRadius: '8px', padding: '2px 8px' }}>
                    {statusLabel}
                </span>
            </div>

            {/* Attempt badge */}
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--prof-primary)', background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: '6px', padding: '2px 8px' }}>
                    Attempt {form.attempt_number}
                </span>
                <span style={{ fontSize: '0.72rem', color: 'var(--prof-text-muted)', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '2px 8px' }}>
                    {form.academic_year} · {form.term}
                </span>
            </div>

            {/* Exam date */}
            <div style={{ fontSize: '0.8rem', color: 'var(--prof-text-muted)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <svg fill="none" strokeWidth="1.8" stroke="currentColor" viewBox="0 0 24 24" width="14" height="14" style={{ flexShrink: 0 }}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 9v7.5" />
                </svg>
                Exam Date: {new Date(form.exam_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
            </div>

            {/* Window info */}
            <div style={{ fontSize: '0.78rem', color: ws === 'open' ? '#15803d' : ws === 'upcoming' ? '#92400e' : 'var(--prof-text-muted)' }}>
                {ws === 'open' && !hasSubmitted && (
                    <span>⏰ Closes {formatPHT(form.submission_end, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Manila' })} PHT</span>
                )}
                {ws === 'upcoming' && (
                    <span>Opens {formatPHT(form.submission_start, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Manila' })} PHT</span>
                )}
                {ws === 'closed' && !hasSubmitted && (
                    <span>Closed {formatPHT(form.submission_end, { month: 'short', day: 'numeric', timeZone: 'Asia/Manila' })} PHT</span>
                )}
                {hasSubmitted && (
                    <span style={{ color: '#1d4ed8' }}>✓ Submitted {new Date(form.my_submission!.submitted_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                )}
            </div>

            {/* CTA */}
            {ws === 'open' && !hasSubmitted && (
                <button
                    onClick={e => { e.stopPropagation(); onOpen(); }}
                    style={{ width: '100%', padding: '9px', background: '#15803d', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer' }}
                >
                    Fill Out Form →
                </button>
            )}
            {(ws !== 'open' || hasSubmitted) && (
                <button
                    onClick={e => { e.stopPropagation(); onOpen(); }}
                    style={{ width: '100%', padding: '9px', background: '#f8fafc', color: 'var(--prof-text-muted)', border: '1px solid var(--prof-border)', borderRadius: '8px', fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer' }}
                >
                    View Details
                </button>
            )}
        </div>
    );
}

