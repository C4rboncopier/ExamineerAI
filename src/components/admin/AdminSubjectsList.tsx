import { useState, useEffect, useMemo } from 'react';
import { fetchAdminSubjects, fetchAdminSubjectDetail } from '../../lib/subjects';
import type { AdminSubjectWithCreator, AdminSubjectDetail } from '../../lib/subjects';

const ITEMS_PER_PAGE = 10;

function formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

const GRID = '24px 1fr 150px 110px 80px';

export function AdminSubjectsList() {
    const [subjects, setSubjects] = useState<AdminSubjectWithCreator[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [detailsMap, setDetailsMap] = useState<Record<string, AdminSubjectDetail>>({});
    const [loadingDetails, setLoadingDetails] = useState<string | null>(null);

    useEffect(() => {
        fetchAdminSubjects().then(res => {
            if (!res.error) setSubjects(res.data);
            setIsLoading(false);
        });
    }, []);

    const filtered = useMemo(() => {
        const q = searchQuery.toLowerCase().trim();
        return subjects.filter(s =>
            !q || s.course_title.toLowerCase().includes(q) || s.course_code.toLowerCase().includes(q)
        );
    }, [subjects, searchQuery]);

    const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE));
    const paged = filtered.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

    useEffect(() => { setCurrentPage(1); setExpandedId(null); }, [searchQuery]);

    async function handleToggleExpand(id: string) {
        if (expandedId === id) {
            setExpandedId(null);
            return;
        }
        setExpandedId(id);
        if (!detailsMap[id]) {
            setLoadingDetails(id);
            const { data } = await fetchAdminSubjectDetail(id);
            if (data) setDetailsMap(prev => ({ ...prev, [id]: data }));
            setLoadingDetails(null);
        }
    }

    return (
        <div className="subjects-container">
            <div className="subjects-header">
                <div style={{ flex: 1 }}>
                    <h2 className="subjects-title">Subjects</h2>
                    <p className="subjects-subtitle">All subjects created in the system.</p>
                </div>
            </div>

            {/* Search */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
                <div className="subjects-search" style={{ flex: '1 1 200px', minWidth: 0, marginBottom: 0 }}>
                    <svg className="search-icon" fill="none" strokeWidth="2" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                    </svg>
                    <input type="text" className="subjects-search-input" placeholder="Search by title or code..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
                    {searchQuery && (
                        <button className="search-clear-btn" onClick={() => setSearchQuery('')}>
                            <svg fill="none" strokeWidth="2.5" stroke="currentColor" viewBox="0 0 24 24" width="14" height="14"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                    )}
                </div>
            </div>

            {/* Table */}
            {isLoading ? (
                <div className="subjects-loading">Loading subjects...</div>
            ) : filtered.length === 0 ? (
                <div className="subjects-empty">
                    <svg fill="none" strokeWidth="1.5" stroke="currentColor" viewBox="0 0 24 24" className="empty-icon">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
                    </svg>
                    <p>{searchQuery ? 'No subjects match your search.' : 'No subjects found.'}</p>
                </div>
            ) : (
                <div className="templates-simple-list" style={{ borderRadius: '10px', overflow: 'hidden', border: '1px solid var(--prof-border)' }}>
                    {/* Header */}
                    <div className="admin-subject-list-header" style={{ display: 'grid', gridTemplateColumns: GRID, alignItems: 'center', padding: '8px 14px', background: 'var(--prof-bg)', borderBottom: '1px solid var(--prof-border)', gap: '12px' }}>
                        <div />
                        {[
                            { label: 'Subject', cls: '' },
                            { label: 'Main Professor', cls: '' },
                            { label: 'Created', cls: 'admin-hide-mobile' },
                            { label: 'Questions', cls: 'admin-hide-mobile' },
                        ].map(({ label, cls }) => (
                            <span key={label} className={cls || undefined} style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--prof-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</span>
                        ))}
                    </div>

                    {/* Rows */}
                    {paged.map((subject, idx) => {
                        const isExpanded = expandedId === subject.id;
                        const isLoadingThis = loadingDetails === subject.id;
                        const isLast = idx === paged.length - 1;
                        const questionCount = subject.questions?.[0]?.count ?? 0;
                        const detail = detailsMap[subject.id];

                        return (
                            <div key={subject.id}>
                                {/* Main row */}
                                <div
                                    className="admin-subject-list-row"
                                    style={{ display: 'grid', gridTemplateColumns: GRID, alignItems: 'center', padding: '10px 14px', gap: '12px', background: isExpanded ? '#f8fafc' : idx % 2 === 0 ? '#fff' : 'var(--prof-bg)', borderBottom: (!isExpanded && !isLast) ? '1px solid var(--prof-border)' : isExpanded ? '1px solid var(--prof-border)' : 'none', transition: 'background 0.1s', cursor: 'pointer' }}
                                    onClick={() => handleToggleExpand(subject.id)}
                                >
                                    {/* Chevron */}
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        {isLoadingThis ? (
                                            <svg style={{ animation: 'spin 1s linear infinite' }} fill="none" strokeWidth="2" stroke="currentColor" viewBox="0 0 24 24" width="14" height="14">
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                            </svg>
                                        ) : (
                                            <svg fill="none" strokeWidth="2.5" stroke="currentColor" viewBox="0 0 24 24" width="14" height="14" style={{ color: 'var(--prof-text-muted)', transition: 'transform 0.2s', transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)' }}>
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                                            </svg>
                                        )}
                                    </div>

                                    <div style={{ overflow: 'hidden' }}>
                                        <p style={{ margin: 0, fontSize: '0.875rem', fontWeight: 600, color: 'var(--prof-text-main)', overflow: 'hidden', display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: 2 }}>{subject.course_title}</p>
                                        <p style={{ margin: 0, fontSize: '0.775rem', color: 'var(--prof-text-muted)' }}>{subject.course_code}</p>
                                    </div>

                                    <span style={{ fontSize: '0.85rem', color: 'var(--prof-text-main)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {subject.creator_name || subject.creator_email || '—'}
                                    </span>

                                    <span className="admin-hide-mobile" style={{ fontSize: '0.825rem', color: 'var(--prof-text-muted)' }}>{formatDate(subject.created_at)}</span>

                                    <span className="admin-hide-mobile" style={{ fontSize: '0.875rem', color: 'var(--prof-text-main)', fontWeight: 500 }}>{questionCount}</span>
                                </div>

                                {/* Expanded detail panel */}
                                {isExpanded && (
                                    <div className="admin-subject-detail-panel" style={{ background: '#f8fafc', borderBottom: !isLast ? '1px solid var(--prof-border)' : 'none', padding: '16px 20px 18px 20px' }}>
                                        {isLoadingThis || !detail ? (
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--prof-text-muted)', fontSize: '0.875rem' }}>
                                                <svg style={{ animation: 'spin 1s linear infinite' }} fill="none" strokeWidth="2" stroke="currentColor" viewBox="0 0 24 24" width="16" height="16">
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                                </svg>
                                                Loading details...
                                            </div>
                                        ) : (
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                                {/* Summary row */}
                                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '12px 24px' }}>
                                                    {[
                                                        { label: 'Main Professor', value: subject.creator_name ?? subject.creator_email ?? '—' },
                                                        { label: 'Created', value: formatDate(subject.created_at) },
                                                        { label: 'Course Outcomes', value: String(detail.course_outcomes.length) },
                                                        { label: 'Questions', value: String(questionCount) },
                                                    ].map(row => (
                                                        <div key={row.label}>
                                                            <p style={{ margin: 0, fontSize: '0.72rem', fontWeight: 700, color: 'var(--prof-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '3px' }}>{row.label}</p>
                                                            <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--prof-text-main)' }}>{row.value}</p>
                                                        </div>
                                                    ))}
                                                </div>

                                                {/* Co-handlers */}
                                                {detail.co_handlers.length > 0 && (
                                                    <div>
                                                        <p style={{ margin: '0 0 8px', fontSize: '0.72rem', fontWeight: 700, color: 'var(--prof-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                                            Co-handler Professor{detail.co_handlers.length !== 1 ? 's' : ''}
                                                        </p>
                                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                                                            {detail.co_handlers.map(ch => (
                                                                <span key={ch.professor_id} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '4px 10px', borderRadius: '99px', background: '#fff', border: '1px solid var(--prof-border)', fontSize: '0.825rem', color: 'var(--prof-text-main)' }}>
                                                                    <svg fill="none" strokeWidth="2" stroke="currentColor" viewBox="0 0 24 24" width="13" height="13" style={{ color: 'var(--prof-text-muted)', flexShrink: 0 }}>
                                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                                                                    </svg>
                                                                    {ch.full_name ?? ch.email ?? ch.professor_id}
                                                                </span>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}

                                                {/* CO/MO hierarchy */}
                                                {detail.course_outcomes.length > 0 && (
                                                    <div>
                                                        <p style={{ margin: '0 0 10px', fontSize: '0.72rem', fontWeight: 700, color: 'var(--prof-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                                            Course Outcomes & Module Outcomes
                                                        </p>
                                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                                            {[...detail.course_outcomes]
                                                                .sort((a, b) => a.order_index - b.order_index)
                                                                .map((co, coIdx) => {
                                                                    const coCount = co.module_outcomes.reduce((sum, mo) => sum + (detail.mo_question_counts[mo.id] ?? 0), 0);
                                                                    return (
                                                                        <div key={co.id} style={{ background: '#fff', border: '1px solid var(--prof-border)', borderRadius: '8px', overflow: 'hidden' }}>
                                                                            {/* CO header */}
                                                                            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '10px 14px', borderBottom: co.module_outcomes.length > 0 ? '1px solid var(--prof-border)' : 'none' }}>
                                                                                <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: '32px', height: '20px', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 700, background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe', flexShrink: 0, marginTop: '1px' }}>
                                                                                    CO{coIdx + 1}
                                                                                </span>
                                                                                <div style={{ flex: 1, minWidth: 0 }}>
                                                                                    <p style={{ margin: 0, fontSize: '0.85rem', fontWeight: 600, color: 'var(--prof-text-main)' }}>{co.title}</p>
                                                                                    {co.description && (
                                                                                        <p style={{ margin: '2px 0 0', fontSize: '0.8rem', color: 'var(--prof-text-muted)' }}>{co.description}</p>
                                                                                    )}
                                                                                </div>
                                                                                <span style={{ flexShrink: 0, fontSize: '0.75rem', fontWeight: 600, color: '#1d4ed8', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '99px', padding: '2px 8px', whiteSpace: 'nowrap' }}>
                                                                                    {coCount} Q
                                                                                </span>
                                                                            </div>
                                                                            {/* MOs */}
                                                                            {co.module_outcomes.length > 0 && (
                                                                                <div className="admin-subject-mo-list" style={{ display: 'flex', flexDirection: 'column' }}>
                                                                                    {[...co.module_outcomes]
                                                                                        .sort((a, b) => a.order_index - b.order_index)
                                                                                        .map((mo, moIdx) => {
                                                                                            const moCount = detail.mo_question_counts[mo.id] ?? 0;
                                                                                            return (
                                                                                                <div key={mo.id} style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '8px 14px 8px 28px', borderTop: moIdx > 0 ? '1px solid #f1f5f9' : 'none' }}>
                                                                                                    <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: '36px', height: '18px', borderRadius: '4px', fontSize: '0.68rem', fontWeight: 700, background: '#f0fdf4', color: '#15803d', border: '1px solid #bbf7d0', flexShrink: 0, marginTop: '1px' }}>
                                                                                                        MO{coIdx + 1}{moIdx + 1}
                                                                                                    </span>
                                                                                                    <p style={{ margin: 0, fontSize: '0.825rem', color: 'var(--prof-text-main)', flex: 1 }}>{mo.description}</p>
                                                                                                    <span style={{ flexShrink: 0, fontSize: '0.72rem', fontWeight: 600, color: '#15803d', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '99px', padding: '2px 7px', whiteSpace: 'nowrap' }}>
                                                                                                        {moCount} Q
                                                                                                    </span>
                                                                                                </div>
                                                                                            );
                                                                                        })
                                                                                    }
                                                                                </div>
                                                                            )}
                                                                        </div>
                                                                    );
                                                                })
                                                            }
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Pagination */}
            {!isLoading && totalPages > 1 && (
                <div className="subjects-pagination">
                    <button className="pagination-btn" onClick={() => setCurrentPage(p => p - 1)} disabled={currentPage === 1}>
                        <svg fill="none" strokeWidth="2" stroke="currentColor" viewBox="0 0 24 24" width="16" height="16"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" /></svg>
                        Previous
                    </button>
                    <div className="pagination-pages">
                        {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                            <button key={page} className={`pagination-page ${page === currentPage ? 'active' : ''}`} onClick={() => setCurrentPage(page)}>{page}</button>
                        ))}
                    </div>
                    <button className="pagination-btn" onClick={() => setCurrentPage(p => p + 1)} disabled={currentPage === totalPages}>
                        Next
                        <svg fill="none" strokeWidth="2" stroke="currentColor" viewBox="0 0 24 24" width="16" height="16"><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>
                    </button>
                </div>
            )}
            {!isLoading && filtered.length > 0 && (
                <p className="subjects-count">
                    Showing {(currentPage - 1) * ITEMS_PER_PAGE + 1}–{Math.min(currentPage * ITEMS_PER_PAGE, filtered.length)} of {filtered.length} subject{filtered.length !== 1 ? 's' : ''}
                </p>
            )}
        </div>
    );
}
