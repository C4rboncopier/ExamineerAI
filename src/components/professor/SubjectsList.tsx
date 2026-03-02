import { useState, useEffect, useCallback, useMemo } from 'react';
import { fetchSubjects, deleteSubject } from '../../lib/subjects';
import type { SubjectWithCounts } from '../../lib/subjects';
import { CreateSubject } from './CreateSubject';
import { Popup } from '../common/Popup';

type View = 'list' | 'create' | 'edit';

const ITEMS_PER_PAGE = 12;

export function SubjectsList() {
    const [subjects, setSubjects] = useState<SubjectWithCounts[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [view, setView] = useState<View>('list');
    const [editingSubjectId, setEditingSubjectId] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [currentPage, setCurrentPage] = useState(1);

    const [deletePopupOpen, setDeletePopupOpen] = useState(false);
    const [subjectToDelete, setSubjectToDelete] = useState<{ id: string, title: string } | null>(null);

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

    const loadSubjects = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        const result = await fetchSubjects();
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

    const handleBack = () => {
        setView('list');
        setEditingSubjectId(null);
        loadSubjects();
    };

    const handleEdit = (subjectId: string) => {
        setEditingSubjectId(subjectId);
        setView('edit');
    };

    const confirmDelete = (subjectId: string, courseTitle: string) => {
        setSubjectToDelete({ id: subjectId, title: courseTitle });
        setDeletePopupOpen(true);
    };

    const handleDelete = async () => {
        if (!subjectToDelete) return;

        const result = await deleteSubject(subjectToDelete.id);
        if (result.error) {
            setError(result.error);
        } else {
            setSubjects(prev => prev.filter(s => s.id !== subjectToDelete.id));
        }
        setDeletePopupOpen(false);
        setSubjectToDelete(null);
    };

    if (view === 'create') {
        return <CreateSubject onBack={handleBack} />;
    }

    if (view === 'edit' && editingSubjectId) {
        return <CreateSubject onBack={handleBack} editSubjectId={editingSubjectId} />;
    }

    return (
        <div className="subjects-container">
            <div className="subjects-header">
                <div>
                    <h2 className="subjects-title">Subjects</h2>
                    <p className="subjects-subtitle">Manage your course subjects and their syllabi.</p>
                </div>
                <button className="btn-primary" onClick={() => setView('create')}>
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
                    <button className="btn-primary" onClick={() => setView('create')} style={{ marginTop: '16px' }}>
                        + Create Subject
                    </button>
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
                                    <div key={subject.id} className="subject-card">
                                        <div className="subject-card-body">
                                            <div className="subject-card-info">
                                                <span className="subject-code">{subject.course_code}</span>
                                                <h3 className="subject-name">{subject.course_title}</h3>
                                                <span className="subject-meta">
                                                    {subject.course_outcomes[0]?.count ?? 0} Course Outcome{(subject.course_outcomes[0]?.count ?? 0) !== 1 ? 's' : ''}
                                                </span>
                                            </div>
                                            <div className="subject-card-actions">
                                                <button
                                                    className="btn-icon"
                                                    onClick={() => handleEdit(subject.id)}
                                                    title="Edit Subject"
                                                >
                                                    <svg fill="none" strokeWidth="2" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10"></path></svg>
                                                </button>
                                                <button
                                                    className="btn-icon danger"
                                                    onClick={() => confirmDelete(subject.id, subject.course_title)}
                                                    title="Delete Subject"
                                                >
                                                    <svg fill="none" strokeWidth="2" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                                                </button>
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

            <Popup
                isOpen={deletePopupOpen}
                title="Delete Subject"
                message={`Are you sure you want to delete "${subjectToDelete?.title}"? This will also delete all its course and module outcomes.`}
                type="danger"
                onConfirm={handleDelete}
                onCancel={() => setDeletePopupOpen(false)}
                confirmText="Delete"
                cancelText="Cancel"
            />
        </div>
    );
}
