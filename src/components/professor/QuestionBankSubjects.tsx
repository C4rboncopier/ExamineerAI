import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import type { SubjectWithCounts } from '../../lib/subjects';
import { fetchSubjects } from '../../lib/subjects';

const ITEMS_PER_PAGE = 12;

export function QuestionBankSubjects() {
    const navigate = useNavigate();
    const [subjects, setSubjects] = useState<SubjectWithCounts[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [currentPage, setCurrentPage] = useState(1);

    useEffect(() => {
        setIsLoading(true);
        fetchSubjects().then(({ data }) => {
            setSubjects(data);
            setIsLoading(false);
        });
    }, []);

    const filteredSubjects = useMemo(() => {
        if (!searchQuery.trim()) return subjects;
        const q = searchQuery.toLowerCase().trim();
        return subjects.filter(s =>
            s.course_title.toLowerCase().includes(q) ||
            s.course_code.toLowerCase().includes(q)
        );
    }, [subjects, searchQuery]);

    const totalPages = Math.max(1, Math.ceil(filteredSubjects.length / ITEMS_PER_PAGE));
    const paginatedSubjects = filteredSubjects.slice(
        (currentPage - 1) * ITEMS_PER_PAGE,
        currentPage * ITEMS_PER_PAGE
    );

    useEffect(() => {
        setCurrentPage(1);
    }, [searchQuery]);

    return (
        <div className="qb-container">
            <div className="subjects-header">
                <div>
                    <h2 className="subjects-title">Question Bank</h2>
                    <p className="subjects-subtitle">Select a subject to manage its question bank.</p>
                </div>
                <button className="btn-primary" onClick={() => navigate('/professor/question-bank/create')}>
                    + Add Question
                </button>
            </div>

            {isLoading ? (
                <div className="subjects-loading"><p>Loading subjects...</p></div>
            ) : subjects.length === 0 ? (
                <div className="subjects-empty">
                    <svg fill="none" strokeWidth="1.5" stroke="currentColor" viewBox="0 0 24 24" className="empty-icon">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25"></path>
                    </svg>
                    <h3>No subjects available</h3>
                    <p>Create subjects first in the Subjects section.</p>
                </div>
            ) : (
                <>
                    <div className="subjects-search">
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

                    {filteredSubjects.length === 0 ? (
                        <div className="subjects-empty">
                            <svg fill="none" strokeWidth="1.5" stroke="currentColor" viewBox="0 0 24 24" className="empty-icon">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"></path>
                            </svg>
                            <h3>No results found</h3>
                            <p>No subjects match "{searchQuery}". Try a different search term.</p>
                        </div>
                    ) : (
                        <>
                            <div className="subjects-grid">
                                {paginatedSubjects.map(subject => (
                                    <div
                                        key={subject.id}
                                        className="subject-card qb-subject-card"
                                        onClick={() => navigate(`/professor/question-bank/${subject.id}`)}
                                        title={`Manage questions for ${subject.course_code}`}
                                    >
                                        <div className="subject-card-body">
                                            <div className="subject-card-info">
                                                <span className="subject-code">{subject.course_code}</span>
                                                <h3 className="subject-name">{subject.course_title}</h3>
                                                <span className="subject-meta">Click to view/add questions</span>
                                            </div>
                                            <div className="qb-card-arrow">
                                                <svg fill="none" strokeWidth="2" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"></path></svg>
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
