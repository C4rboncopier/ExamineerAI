import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import { fetchSubjectWithOutcomes } from '../../lib/subjects';
import type { SubjectWithOutcomes } from '../../lib/subjects';
import { fetchQuestionsBySubjectPaginated, fetchQuestionOutcomeIdsBySubject, deleteQuestion } from '../../lib/questions';
import { mapToQuestionData } from '../../lib/question-utils';
import type { QuestionData } from '../../lib/question-utils';
import { Popup } from '../common/Popup';
import { Toast } from '../common/Toast';

const ITEMS_PER_PAGE = 20;

function escapeHtml(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function renderLatex(text: string): string {
    if (!text) return '';
    return text.split(/(\$\$[^$]+?\$\$)/).map(part => {
        if (part.startsWith('$$') && part.endsWith('$$')) {
            try {
                return katex.renderToString(part.slice(2, -2).trim(), { displayMode: false, throwOnError: false });
            } catch { return escapeHtml(part); }
        }
        return escapeHtml(part);
    }).join('');
}

function LatexText({ text }: { text: string }) {
    const html = useMemo(() => renderLatex(text), [text]);
    return <span dangerouslySetInnerHTML={{ __html: html }} />;
}

export function QuestionBankList({ embedded = false, canManage = true }: { embedded?: boolean; canManage?: boolean }) {
    const { subjectId } = useParams<{ subjectId: string }>();
    const navigate = useNavigate();

    const [subject, setSubject] = useState<SubjectWithOutcomes | null>(null);
    const [pageQuestions, setPageQuestions] = useState<QuestionData[]>([]);
    const [totalCount, setTotalCount] = useState(0);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const [selectedCo, setSelectedCo] = useState('');
    const [selectedMo, setSelectedMo] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [summaryOpen, setSummaryOpen] = useState(false);

    const [toastMessage, setToastMessage] = useState<string | null>(null);
    const [deletePopupOpen, setDeletePopupOpen] = useState(false);
    const [questionToDelete, setQuestionToDelete] = useState<QuestionData | null>(null);

    // ── Select / bulk delete ──
    const [isSelectMode, setIsSelectMode] = useState(false);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
    const [isBulkDeleting, setIsBulkDeleting] = useState(false);

    // ── Summary ──
    const [summaryOutcomeIds, setSummaryOutcomeIds] = useState<{ course_outcome_id: string; module_outcome_id: string }[]>([]);
    const [summaryLoading, setSummaryLoading] = useState(false);
    const [summaryDirty, setSummaryDirty] = useState(true);

    // Debounce search input
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    useEffect(() => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => setDebouncedSearch(searchQuery), 350);
        return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
    }, [searchQuery]);

    // Load subject outline for CO/MO filter options
    useEffect(() => {
        if (!subjectId) return;
        fetchSubjectWithOutcomes(subjectId).then(({ data }) => setSubject(data));
    }, [subjectId]);

    // Fetch current page from server
    const loadPage = useCallback(async (page: number) => {
        if (!subjectId) return;
        setIsLoading(true);
        setError(null);
        const result = await fetchQuestionsBySubjectPaginated(subjectId, page, ITEMS_PER_PAGE, {
            coId: selectedCo || undefined,
            moId: selectedMo || undefined,
            search: debouncedSearch || undefined,
        });
        if (result.error) {
            setError(result.error);
        } else {
            setPageQuestions(result.data.map(mapToQuestionData));
            setTotalCount(result.count);
        }
        setIsLoading(false);
    }, [subjectId, selectedCo, selectedMo, debouncedSearch]);

    // Reset to page 1 when filters / search change
    useEffect(() => {
        setCurrentPage(1);
        setExpandedId(null);
        setIsSelectMode(false);
        setSelectedIds(new Set());
    }, [debouncedSearch, selectedCo, selectedMo]);

    // Load page whenever page or loadPage changes
    useEffect(() => {
        loadPage(currentPage);
    }, [loadPage, currentPage]);

    useEffect(() => {
        document.querySelector('.prof-content-scroll')?.scrollTo({ top: 0, behavior: 'instant' });
    }, [currentPage]);

    const totalPages = Math.max(1, Math.ceil(totalCount / ITEMS_PER_PAGE));

    // CO options from subject outline
    const coOptions = useMemo(() => {
        if (!subject) return [];
        return [...subject.course_outcomes]
            .sort((a, b) => a.order_index - b.order_index)
            .map(co => ({ id: co.id, title: co.title }));
    }, [subject]);

    // MO options scoped to selected CO
    const moOptions = useMemo(() => {
        if (!subject) return [];
        const targetCos = selectedCo
            ? subject.course_outcomes.filter(co => co.id === selectedCo)
            : subject.course_outcomes;
        return targetCos.flatMap(co => {
            const coIdx = subject.course_outcomes.findIndex(c => c.id === co.id);
            return [...co.module_outcomes]
                .sort((a, b) => a.order_index - b.order_index)
                .map(mo => ({ id: mo.id, label: `MO ${coIdx + 1}${mo.order_index + 1}`, orderIndex: mo.order_index }));
        });
    }, [subject, selectedCo]);

    // Summary data — derived from lightweight outcome IDs + subject outline
    const summaryData = useMemo(() => {
        if (!subject || summaryOutcomeIds.length === 0) return [];
        const byco: Record<string, { title: string; total: number; mos: Record<string, { label: string; count: number; orderIndex: number }> }> = {};
        for (const row of summaryOutcomeIds) {
            if (!byco[row.course_outcome_id]) {
                const co = subject.course_outcomes.find(c => c.id === row.course_outcome_id);
                byco[row.course_outcome_id] = { title: co?.title ?? '—', total: 0, mos: {} };
            }
            byco[row.course_outcome_id].total++;
            if (!byco[row.course_outcome_id].mos[row.module_outcome_id]) {
                const co = subject.course_outcomes.find(c => c.id === row.course_outcome_id);
                const mo = co?.module_outcomes.find(m => m.id === row.module_outcome_id);
                const coIdx = subject.course_outcomes.findIndex(c => c.id === row.course_outcome_id);
                byco[row.course_outcome_id].mos[row.module_outcome_id] = {
                    label: `MO ${coIdx + 1}${(mo?.order_index ?? 0) + 1}`,
                    count: 0,
                    orderIndex: mo?.order_index ?? 0,
                };
            }
            byco[row.course_outcome_id].mos[row.module_outcome_id].count++;
        }
        return Object.values(byco).map(co => ({
            ...co,
            mos: Object.values(co.mos).sort((a, b) => a.orderIndex - b.orderIndex),
        }));
    }, [subject, summaryOutcomeIds]);

    const handleOpenSummary = async () => {
        setSummaryOpen(true);
        if (!summaryDirty) return;
        setSummaryLoading(true);
        const { data } = await fetchQuestionOutcomeIdsBySubject(subjectId!);
        setSummaryOutcomeIds(data);
        setSummaryDirty(false);
        setSummaryLoading(false);
    };

    const handleCoChange = (coId: string) => {
        setSelectedCo(coId);
        setSelectedMo('');
    };

    const confirmDelete = (e: React.MouseEvent, q: QuestionData) => {
        e.stopPropagation();
        setQuestionToDelete(q);
        setDeletePopupOpen(true);
    };

    const handleDelete = async () => {
        if (!questionToDelete) return;
        const result = await deleteQuestion(questionToDelete.id, questionToDelete.imageUrl ?? null);
        if (result.error) {
            setError(result.error);
        } else {
            setSummaryDirty(true);
            if (expandedId === questionToDelete.id) setExpandedId(null);
            setToastMessage('Question deleted successfully.');
            const newTotalPages = Math.max(1, Math.ceil((totalCount - 1) / ITEMS_PER_PAGE));
            const targetPage = Math.min(currentPage, newTotalPages);
            if (targetPage === currentPage) loadPage(currentPage);
            else setCurrentPage(targetPage);
        }
        setDeletePopupOpen(false);
        setQuestionToDelete(null);
    };

    const handleBulkDelete = async () => {
        setIsBulkDeleting(true);
        const toDelete = pageQuestions.filter(q => selectedIds.has(q.id));
        const results = await Promise.all(
            toDelete.map(q => deleteQuestion(q.id, q.imageUrl ?? null))
        );
        const errorCount = results.filter(r => r.error).length;
        const deleted = toDelete.length - errorCount;
        setSummaryDirty(true);
        if (errorCount === 0) {
            setToastMessage(`${toDelete.length} question${toDelete.length !== 1 ? 's' : ''} deleted.`);
        } else {
            setError(`Failed to delete ${errorCount} question(s).`);
        }
        if (expandedId && selectedIds.has(expandedId)) setExpandedId(null);
        setSelectedIds(new Set());
        setIsSelectMode(false);
        setBulkDeleteOpen(false);
        setIsBulkDeleting(false);
        const newTotalPages = Math.max(1, Math.ceil((totalCount - deleted) / ITEMS_PER_PAGE));
        const targetPage = Math.min(currentPage, newTotalPages);
        if (targetPage === currentPage) loadPage(currentPage);
        else setCurrentPage(targetPage);
    };

    const toggleExpand = (id: string) => setExpandedId(prev => (prev === id ? null : id));

    const toggleSelectId = (id: string) => {
        setSelectedIds(prev => {
            const n = new Set(prev);
            if (n.has(id)) n.delete(id);
            else n.add(id);
            if (n.size === 0) setIsSelectMode(false);
            return n;
        });
    };

    const allOnPageSelected = pageQuestions.length > 0 && pageQuestions.every(q => selectedIds.has(q.id));
    const someOnPageSelected = pageQuestions.some(q => selectedIds.has(q.id));

    const handleCheckboxActivate = (id: string) => {
        if (!isSelectMode) { setIsSelectMode(true); setExpandedId(null); }
        toggleSelectId(id);
    };

    const exitSelectMode = () => { setIsSelectMode(false); setSelectedIds(new Set()); };

    const toggleSelectAllOnPage = () => {
        setSelectedIds(prev => {
            const n = new Set(prev);
            if (allOnPageSelected) { pageQuestions.forEach(q => n.delete(q.id)); }
            else { pageQuestions.forEach(q => n.add(q.id)); }
            if (n.size === 0) setIsSelectMode(false);
            return n;
        });
    };

    const hasFilters = !!(searchQuery || selectedCo || selectedMo);
    const isEmpty = !isLoading && totalCount === 0 && !hasFilters;

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
                </div>
            )}

            {error && <p className="cs-error">{error}</p>}

            {isEmpty ? (
                <div className="subjects-empty">
                    <svg fill="none" strokeWidth="1.5" stroke="currentColor" viewBox="0 0 24 24" className="empty-icon">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z"></path>
                    </svg>
                    <h3>No questions yet</h3>
                    <p>Add your first question to this subject's question bank.</p>
                    {canManage && (
                        <button className="btn-primary" onClick={() => navigate(`/professor/subjects/${subjectId}/question-bank/create`)} style={{ marginTop: '16px' }}>
                            + Add Question
                        </button>
                    )}
                </div>
            ) : (
                <>
                    {/* Search + Filters + Actions */}
                    <div className="ql-filter-bar" style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: isSelectMode ? '8px' : '24px', flexWrap: 'wrap' }}>
                        <div className="subjects-search" style={{ flex: '1', minWidth: '160px', margin: 0 }}>
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
                            style={{ width: '170px', padding: '12px 10px', borderRadius: '8px', border: '1px solid var(--prof-border)', backgroundColor: 'var(--prof-surface)', color: 'var(--prof-text-main)', flexShrink: 0 }}
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
                            style={{ width: '170px', padding: '12px 10px', borderRadius: '8px', border: '1px solid var(--prof-border)', backgroundColor: 'var(--prof-surface)', color: 'var(--prof-text-main)', flexShrink: 0, opacity: moOptions.length === 0 ? 0.6 : 1 }}
                        >
                            <option value="">All Module Outcomes</option>
                            {moOptions.map(mo => (
                                <option key={mo.id} value={mo.id}>{mo.label}</option>
                            ))}
                        </select>
                        {hasFilters && (
                            <button className="ql-filter-clear" onClick={() => { setSearchQuery(''); setSelectedCo(''); setSelectedMo(''); }} style={{ background: 'rgba(236, 31, 40, 0.1)', border: '1px solid rgba(236, 31, 40, 0.2)', color: 'var(--prof-primary)', cursor: 'pointer', fontSize: '13px', padding: '10px 12px', borderRadius: '6px', fontWeight: 600, whiteSpace: 'nowrap', transition: 'all 0.2s', flexShrink: 0 }}>
                                Clear filters
                            </button>
                        )}
                        <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexShrink: 0 }}>
                            <button
                                className="btn-secondary"
                                onClick={handleOpenSummary}
                                style={{ padding: '10px 14px', fontSize: '0.88rem', display: 'inline-flex', alignItems: 'center', gap: '5px' }}
                            >
                                <svg fill="none" strokeWidth="2" stroke="currentColor" viewBox="0 0 24 24" width="15" height="15">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z"></path>
                                </svg>
                                Summary
                            </button>
                            {canManage && (
                                <button className="btn-primary" style={{ padding: '10px 14px', fontSize: '0.88rem' }} onClick={() => navigate(`/professor/subjects/${subjectId}/question-bank/create`)}>
                                    + Add Question
                                </button>
                            )}
                        </div>
                    </div>

                    {isLoading ? (
                        <div className="subjects-loading">
                            <p>Loading questions...</p>
                        </div>
                    ) : pageQuestions.length === 0 ? (
                        <div className="subjects-empty">
                            <h3>No results found</h3>
                            <p>No questions match the current filters.</p>
                        </div>
                    ) : (
                        <>
                            {/* Contextual selection bar */}
                            {isSelectMode && (
                                <div style={{
                                    display: 'flex', alignItems: 'center',
                                    marginBottom: '12px',
                                    border: '1px solid var(--prof-border)',
                                    borderRadius: '10px', overflow: 'hidden',
                                    background: 'var(--prof-surface)',
                                }}>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '9px 16px', cursor: 'pointer', userSelect: 'none', borderRight: '1px solid var(--prof-border)', flexShrink: 0 }}>
                                        <input
                                            type="checkbox"
                                            checked={allOnPageSelected}
                                            ref={el => { if (el) el.indeterminate = !allOnPageSelected && someOnPageSelected; }}
                                            onChange={toggleSelectAllOnPage}
                                            style={{ width: '14px', height: '14px', cursor: 'pointer', flexShrink: 0 }}
                                        />
                                        <span style={{ fontSize: '0.82rem', color: 'var(--prof-text-muted)', whiteSpace: 'nowrap' }}>Select all</span>
                                    </label>
                                    <span style={{ flex: 1, padding: '9px 16px', fontSize: '0.83rem', fontWeight: selectedIds.size > 0 ? 600 : 400, color: selectedIds.size > 0 ? '#1d4ed8' : 'var(--prof-text-muted)' }}>
                                        {selectedIds.size > 0 ? `${selectedIds.size} selected` : 'Hover a question to select it'}
                                    </span>
                                    <div style={{ display: 'flex', alignItems: 'center', borderLeft: '1px solid var(--prof-border)', padding: '5px 8px', gap: '2px' }}>
                                        {selectedIds.size > 0 && (
                                            <button
                                                onClick={() => setBulkDeleteOpen(true)}
                                                disabled={isBulkDeleting}
                                                style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '5px 11px', fontSize: '0.82rem', fontWeight: 600, color: '#dc2626', background: 'transparent', border: 'none', borderRadius: '7px', cursor: 'pointer' }}
                                            >
                                                <svg fill="none" strokeWidth="2" stroke="currentColor" viewBox="0 0 24 24" width="14" height="14"><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                                Delete ({selectedIds.size})
                                            </button>
                                        )}
                                        <button
                                            onClick={exitSelectMode}
                                            style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '5px 11px', fontSize: '0.82rem', color: 'var(--prof-text-muted)', background: 'transparent', border: 'none', borderRadius: '7px', cursor: 'pointer' }}
                                        >
                                            <svg fill="none" strokeWidth="2.5" stroke="currentColor" viewBox="0 0 24 24" width="13" height="13"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                                            Cancel
                                        </button>
                                    </div>
                                </div>
                            )}

                            <div className="ql-list">
                                {pageQuestions.map((q, index) => {
                                    const isExpanded = !isSelectMode && expandedId === q.id;
                                    const isSelected = selectedIds.has(q.id);
                                    const globalIndex = (currentPage - 1) * ITEMS_PER_PAGE + index + 1;
                                    return (
                                        <div
                                            key={q.id}
                                            className={`ql-item${isExpanded ? ' expanded' : ''}`}
                                            style={isSelected ? { background: '#eff6ff', borderColor: '#bfdbfe' } : undefined}
                                        >
                                            <div
                                                className="ql-row"
                                                style={{ cursor: isSelectMode ? 'pointer' : undefined }}
                                                onClick={() => isSelectMode ? toggleSelectId(q.id) : toggleExpand(q.id)}
                                            >
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '7px', flexShrink: 0 }}>
                                                    {canManage && (
                                                        <input
                                                            type="checkbox"
                                                            checked={isSelected}
                                                            onChange={() => { }}
                                                            onClick={e => { e.stopPropagation(); handleCheckboxActivate(q.id); }}
                                                            style={{ cursor: 'pointer', width: '14px', height: '14px', flexShrink: 0 }}
                                                        />
                                                    )}
                                                    <span className="ql-num">{globalIndex}.</span>
                                                </div>
                                                <span className="ql-text"><LatexText text={q.question} /></span>
                                                <div className="ql-tags">
                                                    {q.coTitle && <span className="qc-tag">{q.coTitle}</span>}
                                                    {q.moDescription && <span className="qc-tag">MO {(q.moOrderIndex ?? 0) + 1}</span>}
                                                </div>
                                                {!isSelectMode && canManage && (
                                                    <div className="ql-row-actions" onClick={e => e.stopPropagation()}>
                                                        <button className="btn-icon" onClick={() => navigate(`/professor/subjects/${subjectId}/question-bank/${q.id}/edit`)} title="Edit Question">
                                                            <svg fill="none" strokeWidth="2" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10"></path></svg>
                                                        </button>
                                                        <button className="btn-icon danger" onClick={e => confirmDelete(e, q)} title="Delete Question">
                                                            <svg fill="none" strokeWidth="2" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                                                        </button>
                                                    </div>
                                                )}
                                                {!isSelectMode && (
                                                    <svg className={`ql-chevron${isExpanded ? ' open' : ''}`} fill="none" strokeWidth="2" stroke="currentColor" viewBox="0 0 24 24" width="16" height="16">
                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5"></path>
                                                    </svg>
                                                )}
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
                                        {(() => {
                                            const delta = 2;
                                            const pages: (number | '…')[] = [];
                                            const left = currentPage - delta;
                                            const right = currentPage + delta;

                                            for (let p = 1; p <= totalPages; p++) {
                                                if (p === 1 || p === totalPages || (p >= left && p <= right)) {
                                                    pages.push(p);
                                                } else if (pages[pages.length - 1] !== '…') {
                                                    pages.push('…');
                                                }
                                            }

                                            return pages.map((page, idx) =>
                                                page === '…' ? (
                                                    <span key={`ellipsis-${idx}`} className="pagination-ellipsis">…</span>
                                                ) : (
                                                    <button
                                                        key={page}
                                                        className={`pagination-page ${page === currentPage ? 'active' : ''}`}
                                                        onClick={() => setCurrentPage(page)}
                                                    >
                                                        {page}
                                                    </button>
                                                )
                                            );
                                        })()}
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
                                {totalCount === 0
                                    ? 'No questions found'
                                    : `Showing ${(currentPage - 1) * ITEMS_PER_PAGE + 1}–${Math.min(currentPage * ITEMS_PER_PAGE, totalCount)} of ${totalCount} question${totalCount !== 1 ? 's' : ''}`}
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
                        {summaryLoading ? (
                            <div style={{ padding: '32px', textAlign: 'center', color: 'var(--prof-text-muted)', fontSize: '0.9rem' }}>
                                Loading summary...
                            </div>
                        ) : (
                            <>
                                <div className="ql-summary-total">
                                    <span>Total:</span>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <strong>{summaryOutcomeIds.length}</strong>
                                        <span>question{summaryOutcomeIds.length !== 1 ? 's' : ''}</span>
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
                            </>
                        )}
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

            <Popup
                isOpen={bulkDeleteOpen}
                title="Delete Selected Questions"
                message={`Delete ${selectedIds.size} question${selectedIds.size !== 1 ? 's' : ''} This action cannot be undone.`}
                type="danger"
                onConfirm={handleBulkDelete}
                onCancel={() => setBulkDeleteOpen(false)}
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
