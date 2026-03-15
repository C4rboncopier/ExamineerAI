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
    return text.replace(/\$\$([^$]+?)\$\$/g, (match, expr) => {
        try {
            return katex.renderToString(expr.trim(), { displayMode: false, throwOnError: false });
        } catch {
            return match;
        }
    });
}

function LatexText({ text }: { text: string }) {
    const html = useMemo(() => renderLatex(text), [text]);
    return <span dangerouslySetInnerHTML={{ __html: html }} />;
}

export function QuestionBankList({ embedded = false }: { embedded?: boolean }) {
    const { subjectId } = useParams<{ subjectId: string }>();
    const navigate = useNavigate();

    const [subject, setSubject] = useState<SubjectWithCounts | null>(null);
    const [questions, setQuestions] = useState<QuestionData[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedCo, setSelectedCo] = useState('');
    const [selectedMo, setSelectedMo] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [summaryOpen, setSummaryOpen] = useState(false);

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

    // Unique COs from all questions
    const coOptions = useMemo(() => {
        const seen = new Set<string>();
        const result: { id: string; title: string }[] = [];
        for (const q of questions) {
            if (q.coId && !seen.has(q.coId)) {
                seen.add(q.coId);
                result.push({ id: q.coId, title: q.coTitle ?? q.coId });
            }
        }
        return result;
    }, [questions]);

    // MOs scoped to the selected CO (or all if none selected)
    const moOptions = useMemo(() => {
        const source = selectedCo ? questions.filter(q => q.coId === selectedCo) : questions;
        const seen = new Set<string>();
        const result: { id: string; label: string; orderIndex: number }[] = [];
        for (const q of source) {
            if (q.moId && !seen.has(q.moId)) {
                seen.add(q.moId);
                result.push({ id: q.moId, label: `MO ${(q.moOrderIndex ?? 0) + 1}`, orderIndex: q.moOrderIndex ?? 0 });
            }
        }
        return result.sort((a, b) => a.orderIndex - b.orderIndex);
    }, [questions, selectedCo]);

    const filteredQuestions = useMemo(() => {
        let result = questions;
        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase().trim();
            result = result.filter(qn =>
                qn.question.toLowerCase().includes(q) ||
                qn.choices.some(c => c.toLowerCase().includes(q))
            );
        }
        if (selectedCo) result = result.filter(q => q.coId === selectedCo);
        if (selectedMo) result = result.filter(q => q.moId === selectedMo);
        return result;
    }, [questions, searchQuery, selectedCo, selectedMo]);

    const totalPages = Math.max(1, Math.ceil(filteredQuestions.length / ITEMS_PER_PAGE));
    const paginatedQuestions = filteredQuestions.slice(
        (currentPage - 1) * ITEMS_PER_PAGE,
        currentPage * ITEMS_PER_PAGE
    );

    useEffect(() => {
        setCurrentPage(1);
        setExpandedId(null);
    }, [searchQuery, selectedCo, selectedMo]);

    useEffect(() => {
        document.querySelector('.prof-content-scroll')?.scrollTo({ top: 0, behavior: 'instant' });
    }, [currentPage]);

    const handleCoChange = (coId: string) => {
        setSelectedCo(coId);
        setSelectedMo('');
    };

    // Summary: CO totals + per-MO breakdown
    const summaryData = useMemo(() => {
        const byco: Record<string, {
            title: string;
            total: number;
            mos: Record<string, { label: string; count: number; orderIndex: number }>;
        }> = {};
        for (const q of questions) {
            if (!byco[q.coId]) byco[q.coId] = { title: q.coTitle ?? q.coId, total: 0, mos: {} };
            byco[q.coId].total++;
            if (!byco[q.coId].mos[q.moId]) {
                byco[q.coId].mos[q.moId] = { label: `MO ${(q.moOrderIndex ?? 0) + 1}`, count: 0, orderIndex: q.moOrderIndex ?? 0 };
            }
            byco[q.coId].mos[q.moId].count++;
        }
        return Object.values(byco).map(co => ({
            ...co,
            mos: Object.values(co.mos).sort((a, b) => a.orderIndex - b.orderIndex),
        }));
    }, [questions]);

    const confirmDelete = (e: React.MouseEvent, q: QuestionData) => {
        e.stopPropagation();
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
            if (expandedId === questionToDelete.id) setExpandedId(null);
            setToastMessage('Question deleted successfully.');
        }
        setDeletePopupOpen(false);
        setQuestionToDelete(null);
    };

    const toggleExpand = (id: string) => {
        setExpandedId(prev => (prev === id ? null : id));
    };

    const hasFilters = !!(searchQuery || selectedCo || selectedMo);

    return (
        <div className="qb-container">
            {!embedded && (
                <div className="cs-header qb-list-header">
                    <div>
                        <button type="button" className="btn-back" onClick={() => navigate('/professor/subjects')}>
                            <svg fill="none" strokeWidth="2" stroke="currentColor" viewBox="0 0 24 24" width="20" height="20"><path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18"></path></svg>
                            Back to Subjects
                        </button>
                        <h2>{subject?.course_code ?? '...'} Questions</h2>
                        <p>{subject?.course_title ?? ''}</p>
                    </div>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <button className="btn-secondary" onClick={() => setSummaryOpen(true)} style={{ padding: '14px 28px', fontSize: '1rem', display: 'flex', alignItems: 'center' }}>
                            <svg fill="none" strokeWidth="2" stroke="currentColor" viewBox="0 0 24 24" width="18" height="18" style={{ marginRight: '8px' }}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z"></path>
                            </svg>
                            Summary
                        </button>
                        <button className="btn-primary" onClick={() => navigate(`/professor/subjects/${subjectId}/question-bank/create`)}>
                            + Add Question
                        </button>
                    </div>
                </div>
            )}
            {embedded && (
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginBottom: '24px' }}>
                    <button className="btn-secondary" onClick={() => setSummaryOpen(true)} style={{ padding: '10px 20px', fontSize: '0.9rem', display: 'flex', alignItems: 'center' }}>
                        <svg fill="none" strokeWidth="2" stroke="currentColor" viewBox="0 0 24 24" width="16" height="16" style={{ marginRight: '6px' }}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z"></path>
                        </svg>
                        Summary
                    </button>
                    <button className="btn-primary" onClick={() => navigate(`/professor/subjects/${subjectId}/question-bank/create`)}>
                        + Add Question
                    </button>
                </div>
            )}

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
                    <button className="btn-primary" onClick={() => navigate(`/professor/subjects/${subjectId}/question-bank/create`)} style={{ marginTop: '16px' }}>
                        + Add Question
                    </button>
                </div>
            ) : (
                <>
                    {/* Search + Filters row */}
                    <div className="ql-filter-bar" style={{ display: 'flex', gap: '12px', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap' }}>
                        <div className="subjects-search" style={{ flex: '1', minWidth: '200px', margin: 0 }}>
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
                        <select
                            className="ql-filter-select"
                            value={selectedCo}
                            onChange={e => handleCoChange(e.target.value)}
                            style={{ width: '240px', padding: '12px 14px', borderRadius: '8px', border: '1px solid var(--prof-border)', backgroundColor: 'var(--prof-surface)', color: 'var(--prof-text-main)', flexShrink: 0 }}
                        >
                            <option value="">All Course Outcomes</option>
                            {coOptions.map(co => (
                                <option key={co.id} value={co.id}>{co.title}</option>
                            ))}
                        </select>
                        <select
                            className="ql-filter-select"
                            value={selectedMo}
                            onChange={e => setSelectedMo(e.target.value)}
                            disabled={moOptions.length === 0}
                            style={{ width: '240px', padding: '12px 14px', borderRadius: '8px', border: '1px solid var(--prof-border)', backgroundColor: 'var(--prof-surface)', color: 'var(--prof-text-main)', flexShrink: 0, opacity: moOptions.length === 0 ? 0.6 : 1 }}
                        >
                            <option value="">All Module Outcomes</option>
                            {moOptions.map(mo => (
                                <option key={mo.id} value={mo.id}>{mo.label}</option>
                            ))}
                        </select>
                        {hasFilters && (
                            <button className="ql-filter-clear" onClick={() => { setSearchQuery(''); setSelectedCo(''); setSelectedMo(''); }} style={{ background: 'rgba(236, 31, 40, 0.1)', border: '1px solid rgba(236, 31, 40, 0.2)', color: 'var(--prof-primary)', cursor: 'pointer', fontSize: '14px', padding: '10px 16px', borderRadius: '6px', fontWeight: 600, whiteSpace: 'nowrap', transition: 'all 0.2s' }}>
                                Clear filters
                            </button>
                        )}
                    </div>

                    {filteredQuestions.length === 0 ? (
                        <div className="subjects-empty">
                            <h3>No results found</h3>
                            <p>No questions match the current filters.</p>
                        </div>
                    ) : (
                        <>
                            <div className="ql-list">
                                {paginatedQuestions.map((q, index) => {
                                    const isExpanded = expandedId === q.id;
                                    const globalIndex = (currentPage - 1) * ITEMS_PER_PAGE + index + 1;
                                    return (
                                        <div key={q.id} className={`ql-item${isExpanded ? ' expanded' : ''}`}>
                                            <div className="ql-row" onClick={() => toggleExpand(q.id)}>
                                                <span className="ql-num">{globalIndex}.</span>
                                                <span className="ql-text"><LatexText text={q.question} /></span>
                                                <div className="ql-tags">
                                                    {q.coTitle && <span className="qc-tag">{q.coTitle}</span>}
                                                    {q.moDescription && <span className="qc-tag">MO {(q.moOrderIndex ?? 0) + 1}</span>}
                                                </div>
                                                <div className="ql-row-actions" onClick={e => e.stopPropagation()}>
                                                    <button className="btn-icon" onClick={() => navigate(`/professor/subjects/${subjectId}/question-bank/${q.id}/edit`)} title="Edit Question">
                                                        <svg fill="none" strokeWidth="2" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10"></path></svg>
                                                    </button>
                                                    <button className="btn-icon danger" onClick={e => confirmDelete(e, q)} title="Delete Question">
                                                        <svg fill="none" strokeWidth="2" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                                                    </button>
                                                </div>
                                                <svg className={`ql-chevron${isExpanded ? ' open' : ''}`} fill="none" strokeWidth="2" stroke="currentColor" viewBox="0 0 24 24" width="16" height="16">
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5"></path>
                                                </svg>
                                            </div>

                                            {isExpanded && (
                                                <div className="ql-detail">
                                                    <p className="qc-text"><LatexText text={q.question} /></p>
                                                    {q.imageUrl && (
                                                        <div className="qc-image" style={{ marginBottom: '16px' }}>
                                                            <img src={q.imageUrl} alt="Question image" />
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
                                            )}
                                        </div>
                                    );
                                })}
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
                                Showing {(currentPage - 1) * ITEMS_PER_PAGE + 1}–{Math.min(currentPage * ITEMS_PER_PAGE, filteredQuestions.length)} of {filteredQuestions.length} question{filteredQuestions.length !== 1 ? 's' : ''}
                            </p>
                        </>
                    )}
                </>
            )}

            {/* Summary Modal */}
            {summaryOpen && (
                <div className="ql-summary-overlay" onClick={() => setSummaryOpen(false)}>
                    <div className="ql-summary-modal" onClick={e => e.stopPropagation()}>
                        <div className="ql-summary-header">
                            <h3>Question Summary</h3>
                            <button className="ql-summary-close" onClick={() => setSummaryOpen(false)}>
                                <svg fill="none" strokeWidth="2" stroke="currentColor" viewBox="0 0 24 24" width="18" height="18"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"></path></svg>
                            </button>
                        </div>
                        <div className="ql-summary-total">
                            <span>Total:</span>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <strong>{questions.length}</strong>
                                <span>question{questions.length !== 1 ? 's' : ''}</span>
                            </div>
                        </div>
                        <div className="ql-summary-body">
                            {summaryData.map((co, i) => (
                                <div key={i} className="ql-summary-co">
                                    <div className="ql-summary-co-row">
                                        <span className="ql-summary-co-title">{co.title}</span>
                                        <span className="ql-summary-co-count">{co.total}</span>
                                    </div>
                                    <div className="ql-summary-mos">
                                        {co.mos.map((mo, j) => (
                                            <div key={j} className="ql-summary-mo-row">
                                                <span className="ql-summary-mo-label">{mo.label}</span>
                                                <span className="ql-summary-mo-count">{mo.count}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
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
