import { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchFormsPage, formatPHT } from '../../lib/forms';
import type { FormListItem } from '../../lib/forms';
import { supabase } from '../../lib/supabase';
import { Pagination } from './Pagination';

const ITEMS_PER_PAGE = 10;

function getWindowStatus(form: { submission_start: string; submission_end: string }): 'open' | 'upcoming' | 'closed' {
    const now = Date.now();
    const start = new Date(form.submission_start).getTime();
    const end = new Date(form.submission_end).getTime();
    if (now < start) return 'upcoming';
    if (now > end) return 'closed';
    return 'open';
}

export function FormsList() {
    const navigate = useNavigate();
    const [forms, setForms] = useState<FormListItem[]>([]);
    const [total, setTotal] = useState(0);
    const [isLoading, setIsLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const [attemptFilter, setAttemptFilter] = useState('');
    const [windowFilter, setWindowFilter] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const [viewMode, setViewMode] = useState<'card' | 'list'>('card');
    const [viewModeUserId, setViewModeUserId] = useState<string | null>(null);

    useEffect(() => {
        supabase.auth.getUser().then(({ data }) => {
            const uid = data.user?.id;
            if (!uid) return;
            setViewModeUserId(uid);
            const stored = localStorage.getItem(`admin_forms_viewMode_${uid}`);
            if (stored === 'card' || stored === 'list') setViewMode(stored);
        });
    }, []);

    useEffect(() => {
        if (viewModeUserId) localStorage.setItem(`admin_forms_viewMode_${viewModeUserId}`, viewMode);
    }, [viewMode, viewModeUserId]);

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
    }, [debouncedSearch, attemptFilter, windowFilter]);

    // Fetch current page
    useEffect(() => {
        let cancelled = false;
        const isFirst = isLoading;
        if (!isFirst) setIsRefreshing(true);

        fetchFormsPage({
            search: debouncedSearch || undefined,
            attempt: attemptFilter ? Number(attemptFilter) : undefined,
            window: (windowFilter as 'open' | 'upcoming' | 'closed') || undefined,
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
    }, [debouncedSearch, attemptFilter, windowFilter, currentPage]);

    const totalPages = Math.max(1, Math.ceil(total / ITEMS_PER_PAGE));

    const groupedForms = useMemo(() => {
        const groups: Record<string, FormListItem[]> = {};
        forms.forEach(f => {
            const key = `${f.academic_year} | ${f.term}`;
            if (!groups[key]) groups[key] = [];
            groups[key].push(f);
        });
        const sortedKeys = Object.keys(groups).sort((a, b) => b.localeCompare(a));
        return sortedKeys.map(key => ({ termString: key, forms: groups[key] }));
    }, [forms]);

    return (
        <div className="subjects-container">
            {/* Header */}
            <div className="subjects-header">
                <div>
                    <h2 className="subjects-title">Forms</h2>
                    <p className="subjects-subtitle">Manage student application forms for exam attempts.</p>
                </div>
                <button className="btn-primary" onClick={() => navigate('/admin/forms/create')}>
                    + Create Form
                </button>
            </div>

            {/* Filter bar */}
            {!isLoading && (
                <div className="prof-exam-filter-bar" style={{ display: 'flex', gap: '12px', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap' }}>
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
                            <svg fill="none" strokeWidth="2" stroke="currentColor" viewBox="0 0 24 24" width="16" height="16" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--prof-text-muted)', pointerEvents: 'none' }}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                            </svg>
                            <input
                                type="text"
                                placeholder="Search by title..."
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                                style={{ width: '100%', padding: '9px 12px 9px 38px', borderRadius: '8px', border: '1.5px solid var(--prof-border)', background: '#fff', color: 'var(--prof-text-main)', fontSize: '0.875rem', outline: 'none', boxSizing: 'border-box' }}
                            />
                        </div>
                    </div>
                    {/* Group 2: filter selects */}
                    <div style={{ display: 'flex', gap: '8px', flexShrink: 0, alignItems: 'center', flexWrap: 'wrap' }}>
                        <div style={{ position: 'relative' }}>
                            <select value={attemptFilter} onChange={e => setAttemptFilter(e.target.value)} style={{ appearance: 'none', padding: '9px 36px 9px 16px', borderRadius: '8px', border: '1.5px solid var(--prof-border)', background: '#fff', color: 'var(--prof-text-main)', fontSize: '0.875rem', fontWeight: 500, outline: 'none', cursor: 'pointer', minWidth: '150px' }}>
                                <option value="">All Attempts</option>
                                {[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>Attempt {n}</option>)}
                            </select>
                            <div style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'var(--prof-text-muted)' }}>
                                <svg fill="none" strokeWidth="2.5" stroke="currentColor" viewBox="0 0 24 24" width="14" height="14"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" /></svg>
                            </div>
                        </div>
                        <div style={{ position: 'relative' }}>
                            <select value={windowFilter} onChange={e => setWindowFilter(e.target.value)} style={{ appearance: 'none', padding: '9px 36px 9px 16px', borderRadius: '8px', border: '1.5px solid var(--prof-border)', background: '#fff', color: 'var(--prof-text-main)', fontSize: '0.875rem', fontWeight: 500, outline: 'none', cursor: 'pointer', minWidth: '150px' }}>
                                <option value="">All Windows</option>
                                <option value="open">Open</option>
                                <option value="upcoming">Upcoming</option>
                                <option value="closed">Closed</option>
                            </select>
                            <div style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'var(--prof-text-muted)' }}>
                                <svg fill="none" strokeWidth="2.5" stroke="currentColor" viewBox="0 0 24 24" width="14" height="14"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" /></svg>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {isLoading ? (
                <div className="subjects-empty">
                    <p style={{ color: 'var(--prof-text-muted)' }}>Loading forms...</p>
                </div>
            ) : total === 0 ? (
                <div className="subjects-empty">
                    <svg fill="none" strokeWidth="1.5" stroke="currentColor" viewBox="0 0 24 24" className="empty-icon">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" />
                    </svg>
                    {debouncedSearch || attemptFilter || windowFilter ? (
                        <p style={{ color: 'var(--prof-text-muted)' }}>No forms match your search or filter.</p>
                    ) : (
                        <>
                            <h3>No forms yet</h3>
                            <p>Create your first form to get started.</p>
                            <button className="btn-primary" onClick={() => navigate('/admin/forms/create')} style={{ marginTop: '16px' }}>
                                + Create Form
                            </button>
                        </>
                    )}
                </div>
            ) : (
                <div style={{ opacity: isRefreshing ? 0.6 : 1, transition: 'opacity 0.15s' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
                        {groupedForms.map(group => (
                            <div key={group.termString}>
                                <h3 style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--prof-text-muted)', marginBottom: '16px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                    {group.termString}
                                </h3>
                                {viewMode === 'card' ? (
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '14px' }}>
                                        {group.forms.map(form => {
                                            const ws = getWindowStatus(form);
                                            const barColor = ws === 'open' ? '#16a34a' : ws === 'upcoming' ? '#f59e0b' : '#94a3b8';
                                            const statusColor = ws === 'open' ? '#16a34a' : ws === 'upcoming' ? '#d97706' : '#475569';
                                            const statusLabel = ws === 'open' ? 'Open' : ws === 'upcoming' ? 'Upcoming' : 'Closed';
                                            const statusBg = ws === 'open' ? '#dcfce7' : ws === 'upcoming' ? '#fef9c3' : '#f1f5f9';

                                            return (
                                                <div
                                                    key={form.id}
                                                    onClick={() => navigate(`/admin/forms/${form.id}`)}
                                                    style={{
                                                        background: '#fff',
                                                        borderRadius: '10px',
                                                        border: '1px solid var(--prof-border)',
                                                        overflow: 'hidden',
                                                        display: 'flex',
                                                        flexDirection: 'column',
                                                        boxShadow: '0 2px 4px rgba(0,0,0,0.02)',
                                                        transition: 'box-shadow 0.15s, border-color 0.15s',
                                                        cursor: 'pointer',
                                                    }}
                                                    onMouseEnter={e => {
                                                        (e.currentTarget as HTMLDivElement).style.boxShadow = '0 4px 12px rgba(0,0,0,0.08)';
                                                        (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--prof-primary)';
                                                    }}
                                                    onMouseLeave={e => {
                                                        (e.currentTarget as HTMLDivElement).style.boxShadow = '0 2px 4px rgba(0,0,0,0.02)';
                                                        (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--prof-border)';
                                                    }}
                                                >
                                                    <div style={{ height: '4px', background: barColor }} />
                                                    <div style={{ padding: '18px 20px', flex: 1, display: 'flex', flexDirection: 'column' }}>
                                                        <p style={{ margin: '0 0 3px', fontSize: '0.72rem', color: 'var(--prof-text-muted)', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                                                            Attempt {form.attempt_number}
                                                        </p>
                                                        <h3 style={{ margin: '0 0 10px', fontSize: '1rem', color: 'var(--prof-text-main)', lineHeight: 1.35, fontWeight: 700 }}>
                                                            {form.title}
                                                        </h3>
                                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', marginBottom: '10px' }}>
                                                            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: statusColor, background: statusBg, padding: '2px 8px', borderRadius: '99px' }}>
                                                                {statusLabel}
                                                            </span>
                                                            <span style={{ fontSize: '0.75rem', color: 'var(--prof-text-muted)', background: 'var(--prof-surface)', padding: '2px 8px', borderRadius: '99px', border: '1px solid var(--prof-border)' }}>
                                                                {form.submission_count ?? 0} submitted
                                                            </span>
                                                        </div>
                                                        <div style={{ fontSize: '0.78rem', color: 'var(--prof-text-muted)', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                                                            <svg fill="none" strokeWidth="1.8" stroke="currentColor" viewBox="0 0 24 24" width="12" height="12" style={{ flexShrink: 0 }}>
                                                                <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 9v7.5" />
                                                            </svg>
                                                            {new Date(form.exam_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                                        </div>
                                                        <div style={{ fontSize: '0.75rem', color: 'var(--prof-text-muted)', marginTop: 'auto', paddingTop: '8px' }}>
                                                            {ws === 'open' && <>⏰ Closes {formatPHT(form.submission_end, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Manila' })} PHT</>}
                                                            {ws === 'upcoming' && <>Opens {formatPHT(form.submission_start, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Manila' })} PHT</>}
                                                            {ws === 'closed' && <>Closed {formatPHT(form.submission_end, { month: 'short', day: 'numeric', timeZone: 'Asia/Manila' })} PHT</>}
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                ) : (
                                    <div style={{ borderRadius: '8px', border: '1px solid var(--prof-border)', overflow: 'hidden' }}>
                                        {group.forms.map((form, idx) => {
                                            const ws = getWindowStatus(form);
                                            const barColor = ws === 'open' ? '#16a34a' : ws === 'upcoming' ? '#f59e0b' : '#94a3b8';
                                            const statusColor = ws === 'open' ? '#16a34a' : ws === 'upcoming' ? '#d97706' : '#475569';
                                            const statusLabel = ws === 'open' ? 'Open' : ws === 'upcoming' ? 'Upcoming' : 'Closed';
                                            const statusBg = ws === 'open' ? '#dcfce7' : ws === 'upcoming' ? '#fef9c3' : '#f1f5f9';
                                            const isLast = idx === group.forms.length - 1;

                                            return (
                                                <div
                                                    key={form.id}
                                                    onClick={() => navigate(`/admin/forms/${form.id}`)}
                                                    style={{
                                                        display: 'flex', alignItems: 'flex-start', gap: '12px', padding: '12px 16px',
                                                        background: '#fff', borderLeft: `3px solid ${barColor}`,
                                                        borderBottom: isLast ? 'none' : '1px solid var(--prof-border)',
                                                        cursor: 'pointer', transition: 'background 0.12s', flexWrap: 'wrap',
                                                    }}
                                                    onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.background = 'var(--prof-surface)'}
                                                    onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.background = '#fff'}
                                                >
                                                    <div style={{ flex: 1, minWidth: '120px' }}>
                                                        <p style={{ margin: '0 0 1px', fontSize: '0.72rem', color: 'var(--prof-text-muted)', fontWeight: 600 }}>Attempt {form.attempt_number}</p>
                                                        <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--prof-text-main)', fontWeight: 600 }}>{form.title}</p>
                                                    </div>
                                                    <div style={{ display: 'flex', gap: '5px', alignItems: 'center', flexWrap: 'wrap', flexShrink: 0 }}>
                                                        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: statusColor, background: statusBg, padding: '2px 8px', borderRadius: '99px' }}>{statusLabel}</span>
                                                        <span style={{ fontSize: '0.75rem', color: 'var(--prof-text-muted)', background: 'var(--prof-surface)', padding: '2px 8px', borderRadius: '99px', border: '1px solid var(--prof-border)' }}>{form.submission_count ?? 0} submitted</span>
                                                    </div>
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
                        ))}
                    </div>
                </div>
            )}

            {/* Pagination */}
            {!isLoading && totalPages > 1 && (
                <Pagination
                    currentPage={currentPage}
                    totalPages={totalPages}
                    isDisabled={isRefreshing}
                    onPageChange={setCurrentPage}
                />
            )}
            {!isLoading && total > 0 && (
                <p className="subjects-count">
                    Showing {(currentPage - 1) * ITEMS_PER_PAGE + 1}–{Math.min(currentPage * ITEMS_PER_PAGE, total)} of {total} form{total !== 1 ? 's' : ''}
                </p>
            )}
        </div>
    );
}
