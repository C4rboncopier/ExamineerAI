import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import {
    fetchStudentFormsPage, getFormWindowStatus, formatPHT, markAllNotificationsRead,
} from '../../lib/studentForms';
import type { StudentFormListItem } from '../../lib/studentForms';
import { Pagination } from '../admin/Pagination';

type FilterStatus = 'all' | 'open' | 'upcoming' | 'closed' | 'submitted';

const ITEMS_PER_PAGE = 10;

export function StudentFormsList() {
    const { user } = useAuth();
    const navigate = useNavigate();
    const [forms, setForms] = useState<StudentFormListItem[]>([]);
    const [total, setTotal] = useState(0);
    const [isLoading, setIsLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState<FilterStatus>('all');
    const [currentPage, setCurrentPage] = useState(1);
    const [viewMode, setViewMode] = useState<'card' | 'list'>('card');
    const [viewModeUserId, setViewModeUserId] = useState<string | null>(null);

    useEffect(() => {
        if (!user) return;
        setViewModeUserId(user.id);
        const stored = localStorage.getItem(`student_forms_viewMode_${user.id}`);
        if (stored === 'card' || stored === 'list') setViewMode(stored);
    }, [user]);

    useEffect(() => {
        if (viewModeUserId) localStorage.setItem(`student_forms_viewMode_${viewModeUserId}`, viewMode);
    }, [viewMode, viewModeUserId]);

    useEffect(() => {
        if (!user) return;
        markAllNotificationsRead(user.id);
    }, [user]);

    // Debounce search (300ms)
    const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    useEffect(() => {
        if (debounceTimer.current) clearTimeout(debounceTimer.current);
        debounceTimer.current = setTimeout(() => setDebouncedSearch(searchQuery), 300);
        return () => { if (debounceTimer.current) clearTimeout(debounceTimer.current); };
    }, [searchQuery]);

    // Reset to page 1 when filters change
    useEffect(() => {
        setCurrentPage(1);
    }, [debouncedSearch, statusFilter]);

    // Fetch current page
    useEffect(() => {
        if (!user) return;
        let cancelled = false;
        const isFirst = isLoading;
        if (!isFirst) setIsRefreshing(true);

        fetchStudentFormsPage({
            studentId: user.id,
            search: debouncedSearch || undefined,
            status: statusFilter,
            page: currentPage,
            pageSize: ITEMS_PER_PAGE,
        }).then(res => {
            if (cancelled) return;
            if (!res.error) {
                setForms(res.data);
                setTotal(res.total);
            }
            setIsLoading(false);
            setIsRefreshing(false);
        });

        return () => { cancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user, debouncedSearch, statusFilter, currentPage]);

    const totalPages = Math.max(1, Math.ceil(total / ITEMS_PER_PAGE));

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
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '20px', alignItems: 'center' }}>
                {/* Group 1: toggles + search */}
                <div style={{ display: 'flex', gap: '8px', flex: '1 1 auto', minWidth: '280px', alignItems: 'center' }}>
                    <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
                        <button type="button" onClick={() => setViewMode('card')} title="Card view" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '7px 10px', borderRadius: '6px', cursor: 'pointer', border: viewMode === 'card' ? '1.5px solid var(--prof-primary)' : '1.5px solid var(--prof-border)', background: viewMode === 'card' ? 'var(--prof-primary)' : 'transparent', color: viewMode === 'card' ? '#fff' : 'var(--prof-text-muted)', transition: 'all 0.15s' }}>
                            <svg fill="none" strokeWidth="1.8" stroke="currentColor" viewBox="0 0 24 24" width="16" height="16"><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></svg>
                        </button>
                        <button type="button" onClick={() => setViewMode('list')} title="List view" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '7px 10px', borderRadius: '6px', cursor: 'pointer', border: viewMode === 'list' ? '1.5px solid var(--prof-primary)' : '1.5px solid var(--prof-border)', background: viewMode === 'list' ? 'var(--prof-primary)' : 'transparent', color: viewMode === 'list' ? '#fff' : 'var(--prof-text-muted)', transition: 'all 0.15s' }}>
                            <svg fill="none" strokeWidth="2" stroke="currentColor" viewBox="0 0 24 24" width="16" height="16"><path strokeLinecap="round" d="M4 6h16M4 12h16M4 18h16" /></svg>
                        </button>
                    </div>
                    <div style={{ position: 'relative', flex: 1, minWidth: 0 }}>
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
                </div>
                {/* Group 2: filter selects */}
                <div style={{ display: 'flex', gap: '8px', flexShrink: 0, alignItems: 'center', flexWrap: 'wrap' }}>
                    <div style={{ position: 'relative' }}>
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
            </div>

            {total === 0 ? (
                <div style={{ textAlign: 'center', padding: '60px 20px', background: '#fff', borderRadius: '16px', border: '1px solid var(--prof-border)' }}>
                    {debouncedSearch || statusFilter !== 'all' ? (
                        <p style={{ margin: 0, color: 'var(--prof-text-muted)' }}>No forms match your filter.</p>
                    ) : (
                        <>
                            <svg fill="none" strokeWidth="1.5" stroke="currentColor" viewBox="0 0 24 24" width="48" height="48" style={{ margin: '0 auto 14px', display: 'block', opacity: 0.25 }}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" />
                            </svg>
                            <h3 style={{ margin: '0 0 6px', fontSize: '1rem', fontWeight: 600, color: 'var(--prof-text-main)' }}>No forms available</h3>
                            <p style={{ margin: 0, color: 'var(--prof-text-muted)', fontSize: '0.88rem' }}>Application forms for exam attempts will appear here.</p>
                        </>
                    )}
                </div>
            ) : (
                <div style={{ opacity: isRefreshing ? 0.6 : 1, transition: 'opacity 0.15s' }}>
                    {viewMode === 'card' ? (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '16px' }}>
                            {forms.map(form => <FormCard key={form.id} form={form} onOpen={() => navigate(`/student/forms/${form.id}`)} />)}
                        </div>
                    ) : (
                        <div style={{ borderRadius: '8px', border: '1px solid var(--prof-border)', overflow: 'hidden' }}>
                            {forms.map((form, idx) => {
                                const ws = getFormWindowStatus(form);
                                const hasSubmitted = !!form.my_submission;
                                let statusColor: string, statusBg: string, statusLabel: string;
                                if (hasSubmitted) { statusColor = '#1d4ed8'; statusBg = '#eff6ff'; statusLabel = 'Submitted'; }
                                else if (ws === 'open') { statusColor = '#15803d'; statusBg = '#dcfce7'; statusLabel = 'Open'; }
                                else if (ws === 'upcoming') { statusColor = '#854d0e'; statusBg = '#fef9c3'; statusLabel = 'Upcoming'; }
                                else { statusColor = '#475569'; statusBg = '#f1f5f9'; statusLabel = 'Closed'; }
                                const barColor = hasSubmitted ? '#3b82f6' : ws === 'open' ? '#16a34a' : ws === 'upcoming' ? '#f59e0b' : '#94a3b8';
                                const isLast = idx === forms.length - 1;

                                return (
                                    <div
                                        key={form.id}
                                        onClick={() => navigate(`/student/forms/${form.id}`)}
                                        style={{
                                            display: 'flex', alignItems: 'flex-start', gap: '12px', padding: '12px 16px',
                                            background: '#fff', borderLeft: `3px solid ${barColor}`,
                                            borderBottom: isLast ? 'none' : '1px solid var(--prof-border)',
                                            cursor: 'pointer', transition: 'background 0.12s', flexWrap: 'wrap',
                                        }}
                                        onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--prof-surface)'}
                                        onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = '#fff'}
                                    >
                                        <div style={{ flex: 1, minWidth: '120px' }}>
                                            <p style={{ margin: '0 0 1px', fontSize: '0.72rem', color: 'var(--prof-text-muted)', fontWeight: 600 }}>
                                                Attempt {form.attempt_number} · {form.academic_year} · {form.term}
                                            </p>
                                            <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--prof-text-main)', fontWeight: 600 }}>{form.title}</p>
                                        </div>
                                        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: statusColor, background: statusBg, padding: '2px 8px', borderRadius: '99px', flexShrink: 0 }}>{statusLabel}</span>
                                        <span style={{ fontSize: '0.78rem', color: 'var(--prof-text-muted)', flexShrink: 0, whiteSpace: 'nowrap' }}>
                                            {new Date(form.exam_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                        </span>
                                        <svg fill="none" strokeWidth="2" stroke="currentColor" viewBox="0 0 24 24" width="14" height="14" style={{ flexShrink: 0, color: 'var(--prof-text-muted)' }}>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                                        </svg>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}

            {/* Pagination */}
            {totalPages > 1 && (
                <Pagination
                    currentPage={currentPage}
                    totalPages={totalPages}
                    isDisabled={isRefreshing}
                    onPageChange={setCurrentPage}
                />
            )}
            {total > 0 && (
                <p style={{ textAlign: 'center', fontSize: '0.8rem', color: 'var(--prof-text-muted)', marginTop: '8px' }}>
                    Showing {(currentPage - 1) * ITEMS_PER_PAGE + 1}–{Math.min(currentPage * ITEMS_PER_PAGE, total)} of {total} form{total !== 1 ? 's' : ''}
                </p>
            )}
        </div>
    );
}

function FormCard({ form, onOpen }: { form: StudentFormListItem; onOpen: () => void }) {
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
