import { useState, useEffect, useMemo } from 'react';
import { fetchAdminExams } from '../../lib/exams';
import type { AdminExam } from '../../lib/exams';

const ITEMS_PER_PAGE = 10;

function formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

const GRID = '24px 1fr 150px 110px 90px 90px';

export function AdminExamsList() {
    const [exams, setExams] = useState<AdminExam[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState('');
    const [yearFilter, setYearFilter] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const [expandedId, setExpandedId] = useState<string | null>(null);

    useEffect(() => {
        fetchAdminExams().then(res => {
            if (!res.error) setExams(res.data);
            setIsLoading(false);
        });
    }, []);

    const academicYears = useMemo(() => {
        const years = [...new Set(exams.map(e => e.academic_year).filter(Boolean))].sort().reverse();
        return years;
    }, [exams]);

    const filtered = useMemo(() => {
        const q = searchQuery.toLowerCase().trim();
        return exams.filter(e => {
            const matchesSearch = !q || e.title.toLowerCase().includes(q) || e.code.toLowerCase().includes(q);
            const matchesStatus = !statusFilter || e.status === statusFilter;
            const matchesYear = !yearFilter || e.academic_year === yearFilter;
            return matchesSearch && matchesStatus && matchesYear;
        });
    }, [exams, searchQuery, statusFilter, yearFilter]);

    const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE));
    const paged = filtered.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

    useEffect(() => { setCurrentPage(1); setExpandedId(null); }, [searchQuery, statusFilter, yearFilter]);

    const toggleExpand = (id: string) => setExpandedId(prev => prev === id ? null : id);

    const filterSelectStyle: React.CSSProperties = {
        padding: '8px 32px 8px 12px',
        borderRadius: '8px',
        border: '1.5px solid var(--prof-border)',
        background: '#fff',
        fontSize: '0.875rem',
        cursor: 'pointer',
        appearance: 'none',
        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%236b7280' stroke-width='2'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' d='M19 9l-7 7-7-7'/%3E%3C/svg%3E")`,
        backgroundRepeat: 'no-repeat',
        backgroundPosition: 'right 8px center',
        backgroundSize: '16px',
        flexShrink: 0,
        alignSelf: 'stretch',
    };

    return (
        <div className="subjects-container">
            <div className="subjects-header">
                <div style={{ flex: 1 }}>
                    <h2 className="subjects-title">Exams</h2>
                    <p className="subjects-subtitle">All exams created in the system.</p>
                </div>
            </div>

            {/* Filters */}
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
                <select className="admin-exam-filter-select" value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{ ...filterSelectStyle, color: statusFilter ? 'var(--prof-text-main)' : 'var(--prof-text-muted)', width: '160px' }}>
                    <option value="">All Statuses</option>
                    <option value="unlocked">Unlocked</option>
                    <option value="locked">Locked</option>
                </select>
                <select className="admin-exam-filter-select" value={yearFilter} onChange={e => setYearFilter(e.target.value)} style={{ ...filterSelectStyle, color: yearFilter ? 'var(--prof-text-main)' : 'var(--prof-text-muted)', width: '180px' }}>
                    <option value="">All Academic Years</option>
                    {academicYears.map(y => <option key={y} value={y}>{y}</option>)}
                </select>
            </div>

            {/* Table */}
            {isLoading ? (
                <div className="subjects-loading">Loading exams...</div>
            ) : filtered.length === 0 ? (
                <div className="subjects-empty">
                    <svg fill="none" strokeWidth="1.5" stroke="currentColor" viewBox="0 0 24 24" className="empty-icon">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" />
                    </svg>
                    <p>{searchQuery || statusFilter || yearFilter ? 'No exams match your filters.' : 'No exams found.'}</p>
                </div>
            ) : (
                <div className="templates-simple-list" style={{ borderRadius: '10px', overflow: 'hidden', border: '1px solid var(--prof-border)' }}>
                    {/* Header */}
                    <div className="admin-exam-list-header" style={{ display: 'grid', gridTemplateColumns: GRID, alignItems: 'center', padding: '8px 14px', background: 'var(--prof-bg)', borderBottom: '1px solid var(--prof-border)', gap: '12px' }}>
                        <div />
                        {[
                            { label: 'Exam', cls: '' },
                            { label: 'Main Professor', cls: 'admin-hide-mobile' },
                            { label: 'Created', cls: 'admin-hide-mobile' },
                            { label: 'Students', cls: 'admin-hide-mobile' },
                            { label: 'Status', cls: '' },
                        ].map(({ label, cls }) => (
                            <span key={label} className={cls || undefined} style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--prof-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</span>
                        ))}
                    </div>

                    {/* Rows */}
                    {paged.map((exam, idx) => {
                        const isExpanded = expandedId === exam.id;
                        const isLast = idx === paged.length - 1;
                        return (
                            <div key={exam.id}>
                                {/* Main row */}
                                <div
                                    className="admin-exam-list-row"
                                    style={{ display: 'grid', gridTemplateColumns: GRID, alignItems: 'center', padding: '10px 14px', gap: '12px', background: isExpanded ? '#f8fafc' : idx % 2 === 0 ? '#fff' : 'var(--prof-bg)', borderBottom: (!isExpanded && !isLast) ? '1px solid var(--prof-border)' : isExpanded ? '1px solid var(--prof-border)' : 'none', transition: 'background 0.1s', cursor: 'pointer' }}
                                    onClick={() => toggleExpand(exam.id)}
                                >
                                    {/* Chevron */}
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        <svg fill="none" strokeWidth="2.5" stroke="currentColor" viewBox="0 0 24 24" width="14" height="14" style={{ color: 'var(--prof-text-muted)', transition: 'transform 0.2s', transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)' }}>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                                        </svg>
                                    </div>

                                    <div style={{ overflow: 'hidden' }}>
                                        <p style={{ margin: 0, fontSize: '0.875rem', fontWeight: 600, color: 'var(--prof-text-main)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{exam.title}</p>
                                        <p style={{ margin: 0, fontSize: '0.775rem', color: 'var(--prof-text-muted)' }}>{exam.code}</p>
                                    </div>

                                    <span className="admin-hide-mobile" style={{ fontSize: '0.85rem', color: 'var(--prof-text-main)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {exam.creator_name || exam.creator_email || '—'}
                                    </span>

                                    <span className="admin-hide-mobile" style={{ fontSize: '0.825rem', color: 'var(--prof-text-muted)' }}>{formatDate(exam.created_at)}</span>

                                    <span className="admin-hide-mobile" style={{ fontSize: '0.875rem', color: 'var(--prof-text-main)', fontWeight: 500 }}>{exam.enrollment_count}</span>

                                    <div>
                                        <span style={{
                                            display: 'inline-flex', padding: '2px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: 600,
                                            background: exam.status === 'unlocked' ? '#f0fdf4' : '#fffbeb',
                                            color: exam.status === 'unlocked' ? '#15803d' : '#b45309',
                                            border: `1px solid ${exam.status === 'unlocked' ? '#bbf7d0' : '#fde68a'}`,
                                        }}>
                                            {exam.status === 'unlocked' ? 'Unlocked' : 'Locked'}
                                        </span>
                                    </div>
                                </div>

                                {/* Expanded detail panel */}
                                {isExpanded && (
                                    <div className="admin-exam-detail-panel" style={{ background: '#f8fafc', borderBottom: !isLast ? '1px solid var(--prof-border)' : 'none', padding: '10px 20px 12px 60px' }}>
                                        {/* Metadata strip */}
                                        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', marginBottom: '9px', rowGap: '4px' }}>
                                            <span style={{
                                                display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '2px 7px', borderRadius: '99px',
                                                fontSize: '0.72rem', fontWeight: 600, marginRight: '10px', flexShrink: 0,
                                                background: exam.status === 'unlocked' ? '#f0fdf4' : '#fffbeb',
                                                color: exam.status === 'unlocked' ? '#15803d' : '#b45309',
                                                border: `1px solid ${exam.status === 'unlocked' ? '#bbf7d0' : '#fde68a'}`,
                                            }}>
                                                <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: 'currentColor', flexShrink: 0 }} />
                                                {exam.status === 'unlocked' ? 'Unlocked' : 'Locked'}
                                            </span>
                                            {[
                                                exam.academic_year,
                                                exam.term,
                                                `${exam.num_sets} set${exam.num_sets !== 1 ? 's' : ''}`,
                                                `${exam.max_attempts} max attempt${exam.max_attempts !== 1 ? 's' : ''}`,
                                                `${exam.enrollment_count} enrolled`,
                                                exam.ai_analysis_enabled ? 'AI enabled' : 'AI off',
                                                `Created ${formatDate(exam.created_at)}`,
                                            ].map((item, i) => (
                                                <span key={i} style={{ display: 'inline-flex', alignItems: 'center', fontSize: '0.8rem', color: 'var(--prof-text-muted)' }}>
                                                    {i > 0 && <span style={{ margin: '0 5px', opacity: 0.35 }}>·</span>}
                                                    {item}
                                                </span>
                                            ))}
                                        </div>

                                        {/* Professor + Subjects rows */}
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                                            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                                                <span style={{ fontSize: '0.67rem', fontWeight: 700, color: 'var(--prof-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', minWidth: '64px', flexShrink: 0, paddingTop: '3px' }}>Professor</span>
                                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                                                    {[
                                                        { id: exam.created_by, name: exam.creator_name ?? exam.creator_email ?? '—' },
                                                        ...exam.co_handlers.map(ch => ({ id: ch.professor_id, name: ch.full_name ?? ch.email ?? ch.professor_id })),
                                                    ].map(p => (
                                                        <span key={p.id} style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '2px 8px', borderRadius: '99px', fontSize: '0.775rem', fontWeight: 500, background: '#fff', border: '1px solid var(--prof-border)', color: 'var(--prof-text-main)' }}>
                                                            <svg fill="none" strokeWidth="2" stroke="currentColor" viewBox="0 0 24 24" width="11" height="11" style={{ color: 'var(--prof-text-muted)', flexShrink: 0 }}>
                                                                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                                                            </svg>
                                                            {p.name}
                                                        </span>
                                                    ))}
                                                </div>
                                            </div>
                                            {exam.exam_subjects.length > 0 && (
                                                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                                                    <span style={{ fontSize: '0.67rem', fontWeight: 700, color: 'var(--prof-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', minWidth: '64px', flexShrink: 0, paddingTop: '3px' }}>Subjects</span>
                                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                                                        {exam.exam_subjects.map((es, i) => (
                                                            <span key={i} style={{ padding: '2px 8px', borderRadius: '5px', fontSize: '0.775rem', fontWeight: 500, background: '#fff', border: '1px solid var(--prof-border)', color: 'var(--prof-text-main)' }}>
                                                                {es.subjects ? `${es.subjects.course_code} — ${es.subjects.course_title}` : es.subject_id}
                                                            </span>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
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
                    Showing {(currentPage - 1) * ITEMS_PER_PAGE + 1}–{Math.min(currentPage * ITEMS_PER_PAGE, filtered.length)} of {filtered.length} exam{filtered.length !== 1 ? 's' : ''}
                </p>
            )}
        </div>
    );
}
