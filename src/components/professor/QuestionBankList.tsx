import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import { fetchSubjectById } from '../../lib/subjects';
import type { SubjectWithCounts } from '../../lib/subjects';
import { fetchQuestionsBySubject, deleteQuestion } from '../../lib/questions';
import { mapToQuestionData } from '../../lib/question-utils';
import type { QuestionData } from '../../lib/question-utils';
import { Popup } from '../common/Popup';
import { Toast } from '../common/Toast';

const ITEMS_PER_PAGE = 20;

function renderLatex(text: string): string {
    if (!text) return '';
    return text.replace(/\$\$([\s\S]*?)\$\$|\$([^$]*?)\$/g, (match, block, inline) => {
        const expr = block ?? inline;
        const displayMode = block !== undefined;
        try {
            return katex.renderToString(expr, { displayMode, throwOnError: false });
        } catch {
            return match;
        }
    });
}

function LatexText({ text }: { text: string }) {
    const html = useMemo(() => renderLatex(text), [text]);
    return <span dangerouslySetInnerHTML={{ __html: html }} />;
}

export function QuestionBankList() {
    const { subjectId } = useParams<{ subjectId: string }>();
    const navigate = useNavigate();

    const [subject, setSubject] = useState<SubjectWithCounts | null>(null);
    const [questions, setQuestions] = useState<QuestionData[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [currentPage, setCurrentPage] = useState(1);

    const [visibleImages, setVisibleImages] = useState<Set<string>>(new Set());

    const [toastMessage, setToastMessage] = useState<string | null>(null);

    const [deletePopupOpen, setDeletePopupOpen] = useState(false);
    const [questionToDelete, setQuestionToDelete] = useState<QuestionData | null>(null);

    useEffect(() => {
        if (!subjectId) return;
        fetchSubjectById(subjectId).then(({ data }) => setSubject(data));
    }, [subjectId]);

    const loadQuestions = useCallback(async () => {
        if (!subjectId) return;
        setIsLoading(true);
        setError(null);
        const result = await fetchQuestionsBySubject(subjectId);
        if (result.error) {
            setError(result.error);
        } else {
            setQuestions(result.data.map(mapToQuestionData));
        }
        setIsLoading(false);
    }, [subjectId]);

    useEffect(() => {
        loadQuestions();
    }, [loadQuestions]);

    const filteredQuestions = useMemo(() => {
        if (!searchQuery.trim()) return questions;
        const q = searchQuery.toLowerCase().trim();
        return questions.filter(qn =>
            qn.question.toLowerCase().includes(q) ||
            qn.choices.some(c => c.toLowerCase().includes(q))
        );
    }, [questions, searchQuery]);

    const totalPages = Math.max(1, Math.ceil(filteredQuestions.length / ITEMS_PER_PAGE));
    const paginatedQuestions = filteredQuestions.slice(
        (currentPage - 1) * ITEMS_PER_PAGE,
        currentPage * ITEMS_PER_PAGE
    );

    useEffect(() => {
        setCurrentPage(1);
    }, [searchQuery]);

    const confirmDelete = (q: QuestionData) => {
        setQuestionToDelete(q);
        setDeletePopupOpen(true);
    };

    const handleDelete = async () => {
        if (!questionToDelete) return;
        const result = await deleteQuestion(questionToDelete.id, questionToDelete.professorId, questionToDelete.subjectId);
        if (result.error) {
            setError(result.error);
        } else {
            setQuestions(prev => prev.filter(q => q.id !== questionToDelete.id));
            setToastMessage('Question deleted successfully.');
        }
        setDeletePopupOpen(false);
        setQuestionToDelete(null);
    };

    const toggleImage = (questionId: string) => {
        setVisibleImages(prev => {
            const next = new Set(prev);
            if (next.has(questionId)) next.delete(questionId);
            else next.add(questionId);
            return next;
        });
    };

    return (
        <div className="qb-container">
            <div className="cs-header qb-list-header">
                <div>
                    <button type="button" className="btn-back" onClick={() => navigate('/professor/question-bank')}>
                        <svg fill="none" strokeWidth="2" stroke="currentColor" viewBox="0 0 24 24" width="20" height="20"><path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18"></path></svg>
                        Back to Subjects
                    </button>
                    <h2>{subject?.course_code ?? '...'} Questions</h2>
                    <p>{subject?.course_title ?? ''}</p>
                </div>
                <button className="btn-primary" onClick={() => navigate(`/professor/question-bank/${subjectId}/create`)}>
                    + Add Question
                </button>
            </div>

            {error && <p className="cs-error">{error}</p>}

            {isLoading ? (
                <div className="subjects-loading">
                    <p>Loading questions...</p>
                </div>
            ) : questions.length === 0 ? (
                <div className="subjects-empty">
                    <svg fill="none" strokeWidth="1.5" stroke="currentColor" viewBox="0 0 24 24" className="empty-icon">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z"></path>
                    </svg>
                    <h3>No questions yet</h3>
                    <p>Add your first question to this subject's question bank.</p>
                    <button className="btn-primary" onClick={() => navigate(`/professor/question-bank/${subjectId}/create`)} style={{ marginTop: '16px' }}>
                        + Add Question
                    </button>
                </div>
            ) : (
                <>
                    <div className="subjects-search">
                        <svg className="search-icon" fill="none" strokeWidth="2" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"></path></svg>
                        <input
                            type="text"
                            className="subjects-search-input"
                            placeholder="Search questions..."
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                        />
                        {searchQuery && (
                            <button className="search-clear-btn" onClick={() => setSearchQuery('')} title="Clear search">
                                <svg fill="none" strokeWidth="2" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"></path></svg>
                            </button>
                        )}
                    </div>

                    {filteredQuestions.length === 0 ? (
                        <div className="subjects-empty">
                            <h3>No results found</h3>
                            <p>No questions match "{searchQuery}".</p>
                        </div>
                    ) : (
                        <>
                        <div className="questions-list">
                            {paginatedQuestions.map((q, index) => (
                                <div key={q.id} className="question-card">
                                    <div className="qc-header">
                                        <span className="qc-number">Q{(currentPage - 1) * ITEMS_PER_PAGE + index + 1}</span>
                                        <div className="qc-tags">
                                            {q.coTitle && <span className="qc-tag">{q.coTitle}</span>}
                                            {q.moDescription && (
                                                <span className="qc-tag">MO {(q.moOrderIndex ?? 0) + 1}</span>
                                            )}
                                        </div>
                                        <div className="qc-actions">
                                            <button className="btn-icon" onClick={() => navigate(`/professor/question-bank/${subjectId}/${q.id}/edit`)} title="Edit Question">
                                                <svg fill="none" strokeWidth="2" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10"></path></svg>
                                            </button>
                                            <button className="btn-icon danger" onClick={() => confirmDelete(q)} title="Delete Question">
                                                <svg fill="none" strokeWidth="2" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                                            </button>
                                        </div>
                                    </div>
                                    <div className="qc-body">
                                        <p className="qc-text"><LatexText text={q.question} /></p>
                                        {q.imageUrl && (
                                            <div className="qc-image">
                                                <button
                                                    type="button"
                                                    className="btn-toggle-image"
                                                    onClick={() => toggleImage(q.id)}
                                                >
                                                    <svg fill="none" strokeWidth="2" stroke="currentColor" viewBox="0 0 24 24" width="16" height="16">
                                                        {visibleImages.has(q.id)
                                                            ? <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12c1.292 4.338 5.31 7.5 10.066 7.5.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88"></path>
                                                            : <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178zM15 12a3 3 0 11-6 0 3 3 0 016 0z"></path>
                                                        }
                                                    </svg>
                                                    {visibleImages.has(q.id) ? 'Hide Image' : 'Show Image'}
                                                </button>
                                                {visibleImages.has(q.id) && (
                                                    <img src={q.imageUrl} alt="Question image" />
                                                )}
                                            </div>
                                        )}
                                        <div className="qc-choices">
                                            {q.choices.map((choice, cIndex) => (
                                                <div key={cIndex} className={`qc-choice ${q.correctChoice === cIndex ? 'correct' : ''}`}>
                                                    <span className="choice-letter">{String.fromCharCode(65 + cIndex)}.</span>
                                                    <span className="choice-text"><LatexText text={choice} /></span>
                                                    {q.correctChoice === cIndex && (
                                                        <svg className="correct-icon" fill="none" strokeWidth="2" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"></path></svg>
                                                    )}
                                                </div>
                                            ))}
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
                            Showing {(currentPage - 1) * ITEMS_PER_PAGE + 1}-{Math.min(currentPage * ITEMS_PER_PAGE, filteredQuestions.length)} of {filteredQuestions.length} question{filteredQuestions.length !== 1 ? 's' : ''}
                        </p>
                        </>
                    )}
                </>
            )}

            <Popup
                isOpen={deletePopupOpen}
                title="Delete Question"
                message="Are you sure you want to delete this question? This action cannot be undone."
                type="danger"
                onConfirm={handleDelete}
                onCancel={() => setDeletePopupOpen(false)}
                confirmText="Delete"
                cancelText="Cancel"
            />

            <Toast
                isOpen={!!toastMessage}
                message={toastMessage || ''}
                type="success"
                onClose={() => setToastMessage(null)}
            />
        </div>
    );
}
