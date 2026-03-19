import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchProfessorSubjectsWithAccess } from '../../lib/subjects';
import type { SubjectWithAccess, SubjectAccessType } from '../../lib/subjects';

const ITEMS_PER_PAGE = 12;

type AccessFilter = 'all' | 'manageable' | 'view-only';

function AccessBadge({ type }: { type: SubjectAccessType }) {
    if (type === 'exam-only') {
        return (
            <span style={{
                display: 'inline-flex', alignItems: 'center', gap: '4px',
                fontSize: '0.72rem', fontWeight: 600, padding: '2px 8px',
                borderRadius: '99px', background: '#f1f5f9', color: '#64748b',
                border: '1px solid #e2e8f0', lineHeight: 1.4,
            }}>
                View Only
            </span>
        );
    }
    return (
        <span style={{
            display: 'inline-flex', alignItems: 'center', gap: '4px',
            fontSize: '0.72rem', fontWeight: 600, padding: '2px 8px',
            borderRadius: '99px', background: '#dcfce7', color: '#15803d',
            border: '1px solid #bbf7d0', lineHeight: 1.4,
        }}>
            Manageable
        </span>
    );
}

export function SubjectsList() {
    const navigate = useNavigate();
    const [subjects, setSubjects] = useState<SubjectWithAccess[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [accessFilter, setAccessFilter] = useState<AccessFilter>('all');
    const [currentPage, setCurrentPage] = useState(1);

    const filteredSubjects = useMemo(() => {
        let result = subjects;
        if (accessFilter === 'manageable') result = result.filter(s => s.accessType !== 'exam-only');
        else if (accessFilter === 'view-only') result = result.filter(s => s.accessType === 'exam-only');
        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase().trim();
            result = result.filter(s =>
                s.course_title.toLowerCase().includes(q) ||
                s.course_code.toLowerCase().includes(q)
            );
        }
        return result;
    }, [subjects, searchQuery, accessFilter]);

    const totalPages = Math.max(1, Math.ceil(filteredSubjects.length / ITEMS_PER_PAGE));
    const paginatedSubjects = filteredSubjects.slice(
        (currentPage - 1) * ITEMS_PER_PAGE,
        currentPage * ITEMS_PER_PAGE
    );

    useEffect(() => {
        setCurrentPage(1);
    }, [searchQuery, accessFilter]);

    const loadSubjects = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        const result = await fetchProfessorSubjectsWithAccess();
        if (result.error) {
            setError(result.error);
        } else {
            setSubjects(result.data);
        }
        setIsLoading(false);
    }, []);

    useEffect(() => {
        loadSubjects();
    }, [loadSubjects]);

    return (
        <div className="subjects-container">
            <div className="subjects-header">
                <div>
                    <h2 className="subjects-title">Subjects</h2>
                    <p className="subjects-subtitle">Manage your course subjects and their syllabi.</p>
                </div>
                <button className="btn-primary" onClick={() => navigate('/professor/subjects/create')}>
                    + Create Subject
                </button>
            </div>

            {error && <p className="cs-error">{error}</p>}

            {isLoading ? (
                <div className="subjects-loading">
                    <p>Loading subjects...</p>
                </div>
            ) : subjects.length === 0 ? (
                <div className="subjects-empty">
                    <svg fill="none" strokeWidth="1.5" stroke="currentColor" viewBox="0 0 24 24" className="empty-icon">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
                    </svg>
                    <h3>No subjects available</h3>
                    <p>Create your first subject to get started.</p>
                    <button className="btn-primary" onClick={() => navigate('/professor/subjects/create')} style={{ marginTop: '16px' }}>
                        + Create Subject
                    </button>
                </div>
            ) : (
                <>
                    <div style={{ display: 'flex', gap: '8px', marginBottom: '24px', alignItems: 'center' }}>
                        <div className="subjects-search" style={{ flex: 1, marginBottom: 0 }}>
                            <svg className="search-icon" fill="none" strokeWidth="2" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"></path></svg>
                            <input
                                type="text"
                                className="subjects-search-input"
                                placeholder="Search by course title or code..."
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                            />
                            {searchQuery && (
                                <button className="search-clear-btn" onClick={() => setSearchQuery('')} title="Clear search">
                                    <svg fill="none" strokeWidth="2" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"></path></svg>
                                </button>
                            )}
                        </div>
                        <select
                            value={accessFilter}
                            onChange={e => setAccessFilter(e.target.value as AccessFilter)}
                            style={{
                                flexShrink: 0, width: '160px', padding: '10px 12px', border: '1px solid var(--prof-border)',
                                borderRadius: '8px', fontSize: '0.875rem', background: 'var(--prof-surface)',
                                color: 'var(--prof-text-main)', cursor: 'pointer', outline: 'none', height: '46px',
                            }}
                        >
                            <option value="all">All Access</option>
                            <option value="manageable">Manageable</option>
                            <option value="view-only">View Only</option>
                        </select>
                    </div>

                    {filteredSubjects.length === 0 ? (
                        <div className="subjects-empty">
                            <svg fill="none" strokeWidth="1.5" stroke="currentColor" viewBox="0 0 24 24" className="empty-icon">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"></path>
                            </svg>
                            <h3>No results found</h3>
                            <p>No subjects match your current filters.</p>
                        </div>
                    ) : (
                        <>
                            <div className="subjects-grid">
                                {paginatedSubjects.map(subject => (
                                    <div
                                        key={subject.id}
                                        className="subject-card"
                                        style={{ cursor: 'pointer' }}
                                        onClick={() => navigate(`/professor/subjects/${subject.id}/overview`)}
                                    >
                                        <div className="subject-card-body">
                                            <div className="subject-card-info">
                                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                                                    <span className="subject-code">{subject.course_code}</span>
                                                    <AccessBadge type={subject.accessType} />
                                                </div>
                                                <h3 className="subject-name">{subject.course_title}</h3>
                                                <span className="subject-meta">
                                                    {subject.course_outcomes[0]?.count ?? 0} Course Outcome{(subject.course_outcomes[0]?.count ?? 0) !== 1 ? 's' : ''}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {totalPages > 1 && (
                                <div className="subjects-pagination">
                                    <button
                                        className="pagination-btn"
                                        onClick={() => setCurrentPage(p => p - 1)}
                                        disabled={currentPage === 1}
                                    >
                                        <svg fill="none" strokeWidth="2" stroke="currentColor" viewBox="0 0 24 24" width="16" height="16"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5"></path></svg>
                                        Previous
                                    </button>
                                    <div className="pagination-pages">
                                        {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                                            <button
                                                key={page}
                                                className={`pagination-page ${page === currentPage ? 'active' : ''}`}
                                                onClick={() => setCurrentPage(page)}
                                            >
                                                {page}
                                            </button>
                                        ))}
                                    </div>
                                    <button
                                        className="pagination-btn"
                                        onClick={() => setCurrentPage(p => p + 1)}
                                        disabled={currentPage === totalPages}
                                    >
                                        Next
                                        <svg fill="none" strokeWidth="2" stroke="currentColor" viewBox="0 0 24 24" width="16" height="16"><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5"></path></svg>
                                    </button>
                                </div>
                            )}

                            <p className="subjects-count">
                                Showing {(currentPage - 1) * ITEMS_PER_PAGE + 1}-{Math.min(currentPage * ITEMS_PER_PAGE, filteredSubjects.length)} of {filteredSubjects.length} subject{filteredSubjects.length !== 1 ? 's' : ''}
                            </p>
                        </>
                    )}
                </>
            )}
        </div>
    );
}
