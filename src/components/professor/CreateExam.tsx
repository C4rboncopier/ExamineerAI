import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { fetchSubjects } from '../../lib/subjects';
import type { SubjectWithCounts } from '../../lib/subjects';
import { fetchTemplates } from '../../lib/templates';
import type { Template } from '../../lib/templates';
import { createExam, updateExam, fetchExamById } from '../../lib/exams';
import type { AllocationConfig } from '../../lib/exams';
import { fetchQuestionsBySubject } from '../../lib/questions';
import { Toast } from '../common/Toast';

interface ToastState {
    open: boolean;
    message: string;
    type: 'success' | 'error' | 'info';
}

interface SubjectStats {
    available: number;
    moCount: number;
}

export function CreateExam() {
    const { examId } = useParams<{ examId?: string }>();
    const navigate = useNavigate();
    const isEditMode = !!examId;

    // Template
    const [templates, setTemplates] = useState<Template[]>([]);
    const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');

    // Basic details
    const [title, setTitle] = useState('');
    const [code, setCode] = useState('');
    const [numSets, setNumSets] = useState(0);

    // Subjects
    const [subjects, setSubjects] = useState<SubjectWithCounts[]>([]);
    const [selectedSubjectIds, setSelectedSubjectIds] = useState<string[]>([]);
    const [subjectSearch, setSubjectSearch] = useState('');
    const [subjectDropdownOpen, setSubjectDropdownOpen] = useState(false);

    // Allocation
    const [allocMode, setAllocMode] = useState<'equal' | 'per_subject'>('equal');
    const [totalQuestions, setTotalQuestions] = useState(20);
    const [perSubjectCounts, setPerSubjectCounts] = useState<Record<string, number>>({});

    // Question stats per subject (for preview + validation)
    const [subjectStats, setSubjectStats] = useState<Record<string, SubjectStats>>({});
    const [loadingStats, setLoadingStats] = useState<Set<string>>(new Set());

    // Form state
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isLoadingExam, setIsLoadingExam] = useState(isEditMode);
    const [submitError, setSubmitError] = useState<string | null>(null);

    const [toast, setToast] = useState<ToastState>({ open: false, message: '', type: 'success' });
    const showToast = (message: string, type: 'success' | 'error' | 'info' = 'success') =>
        setToast({ open: true, message, type });
    const closeToast = useCallback(() => setToast(prev => ({ ...prev, open: false })), []);

    // ── Load initial data ──────────────────────────────────────
    useEffect(() => {
        fetchSubjects().then(({ data }) => setSubjects(data || []));
        fetchTemplates().then(({ data }) => setTemplates(data || []));

        if (isEditMode && examId) {
            fetchExamById(examId).then(({ data, error }) => {
                if (error || !data) {
                    showToast('Failed to load exam.', 'error');
                } else {
                    setTitle(data.title);
                    setCode(data.code);
                    setNumSets(data.num_sets);
                    setSelectedSubjectIds(data.exam_subjects.map(s => s.subject_id));
                    const config = data.question_allocation;
                    setAllocMode(config.mode);
                    if (config.mode === 'equal') setTotalQuestions(config.total || 20);
                    else setPerSubjectCounts(config.counts || {});
                }
                setIsLoadingExam(false);
            });
        }
    }, [isEditMode, examId]);

    // ── Fetch stats when subjects change ──────────────────────
    useEffect(() => {
        selectedSubjectIds.forEach(id => {
            if (subjectStats[id] || loadingStats.has(id)) return;
            setLoadingStats(prev => new Set(prev).add(id));
            fetchQuestionsBySubject(id).then(({ data }) => {
                const moSet = new Set(data.map(q => q.module_outcome_id));
                setSubjectStats(prev => ({
                    ...prev,
                    [id]: { available: data.length, moCount: moSet.size },
                }));
                setLoadingStats(prev => {
                    const next = new Set(prev);
                    next.delete(id);
                    return next;
                });
            });
        });
    }, [selectedSubjectIds]); // eslint-disable-line react-hooks/exhaustive-deps

    // ── Template selection ────────────────────────────────────
    const handleTemplateChange = (templateId: string) => {
        setSelectedTemplateId(templateId);
        if (!templateId) return;
        const tpl = templates.find(t => t.id === templateId);
        if (!tpl) return;
        setTitle(tpl.title);
        setCode(tpl.code);
        setSelectedSubjectIds(tpl.subject_ids);
    };

    // ── Subject selection ─────────────────────────────────────
    const filteredSubjects = useMemo(() => {
        if (!subjectSearch.trim()) return subjects;
        const q = subjectSearch.toLowerCase().trim();
        return subjects.filter(s =>
            s.course_title.toLowerCase().includes(q) ||
            s.course_code.toLowerCase().includes(q)
        );
    }, [subjects, subjectSearch]);

    const handleSelectSubject = (id: string) => {
        if (!selectedSubjectIds.includes(id)) {
            setSelectedSubjectIds(prev => [...prev, id]);
            // Initialize per-subject count to a sensible default
            setPerSubjectCounts(prev => ({ ...prev, [id]: prev[id] || 10 }));
        }
        setSubjectDropdownOpen(false);
        setSubjectSearch('');
    };

    const handleRemoveSubject = (id: string) => {
        setSelectedSubjectIds(prev => prev.filter(s => s !== id));
    };

    // ── Allocation mode switch ────────────────────────────────
    const handleAllocModeChange = (mode: 'equal' | 'per_subject') => {
        setAllocMode(mode);
        if (mode === 'per_subject') {
            // Default per-subject: divide current total equally
            const n = selectedSubjectIds.length || 1;
            const base = Math.floor(totalQuestions / n);
            const newCounts: Record<string, number> = {};
            selectedSubjectIds.forEach((id, i) => {
                newCounts[id] = base + (i < (totalQuestions % n) ? 1 : 0);
            });
            setPerSubjectCounts(newCounts);
        }
    };

    // ── Preview rows ──────────────────────────────────────────
    const previewRows = useMemo(() => {
        if (selectedSubjectIds.length === 0) return [];

        return selectedSubjectIds.map((id, i) => {
            const subject = subjects.find(s => s.id === id);
            const stats = subjectStats[id];
            const available = stats?.available ?? null;
            const moCount = stats?.moCount || 0;

            let allocated: number;
            if (allocMode === 'equal') {
                const base = Math.floor(totalQuestions / selectedSubjectIds.length);
                const rem = totalQuestions % selectedSubjectIds.length;
                allocated = base + (i < rem ? 1 : 0);
            } else {
                allocated = perSubjectCounts[id] || 0;
            }

            const perMO = moCount > 0 ? Math.floor(allocated / moCount) : 0;
            const insufficient = available !== null && allocated > available;

            return { id, code: subject?.course_code || id, available, moCount, allocated, perMO, insufficient };
        });
    }, [selectedSubjectIds, subjects, subjectStats, allocMode, totalQuestions, perSubjectCounts]);

    const totalAllocated = previewRows.reduce((sum, r) => sum + r.allocated, 0);
    const hasInsufficientWarning = previewRows.some(r => r.insufficient);

    // ── Validation ────────────────────────────────────────────
    const isFormValid = useMemo(() => {
        if (!title.trim() || !code.trim()) return false;
        if (selectedSubjectIds.length > 0) {
            if (allocMode === 'equal' && totalQuestions < 1) return false;
            if (allocMode === 'per_subject' && selectedSubjectIds.some(id => (perSubjectCounts[id] || 0) < 1)) return false;
        }
        return true;
    }, [title, code, selectedSubjectIds, allocMode, totalQuestions, perSubjectCounts]);

    // ── Submit ────────────────────────────────────────────────
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSubmitError(null);
        setIsSubmitting(true);

        const allocationConfig: AllocationConfig = allocMode === 'equal'
            ? { mode: 'equal', total: totalQuestions }
            : { mode: 'per_subject', counts: { ...perSubjectCounts } };

        if (isEditMode && examId) {
            const { error } = await updateExam(examId, title, code, selectedSubjectIds, numSets, allocationConfig);
            if (error) { setSubmitError(error); setIsSubmitting(false); return; }
            showToast('Exam updated and sets regenerated.');
        } else {
            const { error } = await createExam(title, code, selectedSubjectIds, numSets, allocationConfig);
            if (error) { setSubmitError(error); setIsSubmitting(false); return; }
            showToast('Exam created successfully.');
        }

        setIsSubmitting(false);
        setTimeout(() => navigate('/professor/exams'), 600);
    };

    if (isLoadingExam) {
        return (
            <div className="qb-container create-question-wrapper">
                <p className="settings-loading-row">Loading exam...</p>
            </div>
        );
    }

    return (
        <div className="qb-container create-question-wrapper">
            <button type="button" className="btn-back" onClick={() => navigate('/professor/exams')}>
                <svg fill="none" strokeWidth="2" stroke="currentColor" viewBox="0 0 24 24" width="20" height="20">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18"></path>
                </svg>
                Back to Exams
            </button>

            <div className="cs-header">
                <h2>{isEditMode ? 'Edit Exam' : 'Create New Exam'}</h2>
                <p>Only the exam title and code are required to save. Subjects, sets, and question allocation can be configured later by editing the exam.</p>
            </div>

            <form className="cq-form" onSubmit={handleSubmit}>

                {/* ── Card 1: Template (optional) ── */}
                <div className="cs-card">
                    <h3 className="cs-card-title">Use a Template <span style={{ fontWeight: 400, color: 'var(--prof-text-muted)', fontSize: '0.85rem' }}>(optional)</span></h3>
                    <div className="cs-input-field">
                        <label>Select Template</label>
                        <select
                            value={selectedTemplateId}
                            onChange={e => handleTemplateChange(e.target.value)}
                        >
                            <option value="">— No template —</option>
                            {templates.map(t => (
                                <option key={t.id} value={t.id}>{t.title} ({t.code})</option>
                            ))}
                        </select>
                        {selectedTemplateId && (
                            <p style={{ marginTop: '6px', fontSize: '0.8rem', color: 'var(--prof-text-muted)' }}>
                                Template pre-fills title, code, and subjects. Any changes here won't affect the original template.
                            </p>
                        )}
                    </div>
                </div>

                {/* ── Card 2: Exam Details ── */}
                <div className="cs-card">
                    <h3 className="cs-card-title">Exam Details</h3>
                    <div className="cs-input-group row">
                        <div className="cs-input-field flex-2">
                            <label>Exam Title</label>
                            <input
                                type="text"
                                placeholder="e.g. Midterm Exam 2026"
                                value={title}
                                onChange={e => setTitle(e.target.value)}
                                required
                            />
                        </div>
                        <div className="cs-input-field flex-1">
                            <label>Exam Code</label>
                            <input
                                type="text"
                                placeholder="e.g. CS101-MID"
                                value={code}
                                onChange={e => setCode(e.target.value.toUpperCase())}
                                required
                            />
                        </div>
                        <div className="cs-input-field" style={{ minWidth: '120px' }}>
                            <label>Number of Sets <span style={{ fontWeight: 400, color: 'var(--prof-text-muted)' }}>(optional)</span></label>
                            <select value={numSets} onChange={e => setNumSets(Number(e.target.value))}>
                                <option value={0}>— Not set —</option>
                                {[1, 2, 3, 4, 5].map(n => (
                                    <option key={n} value={n}>{n} Set{n !== 1 ? 's' : ''}</option>
                                ))}
                            </select>
                        </div>
                    </div>
                    {numSets > 1 && (
                        <p style={{ margin: '8px 0 0', fontSize: '0.82rem', color: 'var(--prof-text-muted)' }}>
                            All sets contain the same questions, shuffled in a different order per set (Sets A–{String.fromCharCode(64 + numSets)}).
                        </p>
                    )}
                </div>

                {/* ── Card 3: Subjects ── */}
                <div className="cs-card">
                    <h3 className="cs-card-title">Included Subjects <span style={{ fontWeight: 400, color: 'var(--prof-text-muted)', fontSize: '0.85rem' }}>(optional — can be filled later)</span></h3>
                    <div className="cs-input-field">
                        <label>Search and Add Subjects</label>
                        <div className="cq-subject-search">
                            <div
                                className={`cq-subject-trigger ${subjectDropdownOpen ? 'open' : ''}`}
                                onClick={() => setSubjectDropdownOpen(!subjectDropdownOpen)}
                            >
                                <span className="cq-placeholder">Click to search and select subjects...</span>
                                <svg fill="none" strokeWidth="2" stroke="currentColor" viewBox="0 0 24 24" width="16" height="16">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5"></path>
                                </svg>
                            </div>

                            {subjectDropdownOpen && (
                                <div className="cq-subject-dropdown">
                                    <input
                                        type="text"
                                        className="cq-subject-search-input"
                                        placeholder="Search subjects..."
                                        value={subjectSearch}
                                        onChange={e => setSubjectSearch(e.target.value)}
                                        autoFocus
                                    />
                                    <div className="cq-subject-options">
                                        {filteredSubjects.length === 0 ? (
                                            <div className="cq-subject-no-results">No subjects found</div>
                                        ) : (
                                            filteredSubjects.map(s => {
                                                const isSelected = selectedSubjectIds.includes(s.id);
                                                return (
                                                    <div
                                                        key={s.id}
                                                        className={`cq-subject-option ${isSelected ? 'selected' : ''}`}
                                                        onClick={() => handleSelectSubject(s.id)}
                                                        style={{ opacity: isSelected ? 0.6 : 1, cursor: isSelected ? 'default' : 'pointer' }}
                                                    >
                                                        <span className="cq-subject-option-code">{s.course_code}</span>
                                                        <span>{s.course_title}</span>
                                                        {isSelected && <span style={{ marginLeft: 'auto', fontSize: '12px', color: '#16a34a' }}>Added</span>}
                                                    </div>
                                                );
                                            })
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    {selectedSubjectIds.length > 0 && (
                        <div className="selected-subjects-tags" style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '16px' }}>
                            {selectedSubjectIds.map(id => {
                                const subject = subjects.find(s => s.id === id);
                                if (!subject) return null;
                                return (
                                    <div key={id} style={{ display: 'flex', alignItems: 'center', background: '#f1f5f9', padding: '6px 12px', borderRadius: '16px', border: '1px solid #e2e8f0' }}>
                                        <span style={{ fontSize: '14px', color: '#334155', marginRight: '8px' }}>
                                            <strong>{subject.course_code}</strong> – {subject.course_title}
                                        </span>
                                        <button
                                            type="button"
                                            onClick={() => handleRemoveSubject(id)}
                                            style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: '4px' }}
                                            title="Remove Subject"
                                        >
                                            <svg fill="none" strokeWidth="2" stroke="currentColor" viewBox="0 0 24 24" width="14" height="14">
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"></path>
                                            </svg>
                                        </button>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* ── Card 4: Question Allocation ── */}
                {selectedSubjectIds.length > 0 && (
                    <div className="cs-card">
                        <h3 className="cs-card-title">Question Allocation <span style={{ fontWeight: 400, color: 'var(--prof-text-muted)', fontSize: '0.85rem' }}>(optional — can be filled later)</span></h3>
                        <p style={{ margin: '0 0 16px', fontSize: '0.875rem', color: 'var(--prof-text-muted)' }}>
                            Choose how questions are distributed across subjects. Within each subject, questions are spread equally across all Module Outcomes.
                        </p>

                        {/* Mode toggle */}
                        <div className="exam-alloc-mode-toggle">
                            <button
                                type="button"
                                className={`exam-alloc-mode-btn ${allocMode === 'equal' ? 'active' : ''}`}
                                onClick={() => handleAllocModeChange('equal')}
                            >
                                <svg fill="none" strokeWidth="2" stroke="currentColor" viewBox="0 0 24 24" width="16" height="16">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 7.5h18M3 12h18M3 16.5h18" />
                                </svg>
                                Equal distribution
                                <span className="exam-alloc-mode-desc">Same count per subject</span>
                            </button>
                            <button
                                type="button"
                                className={`exam-alloc-mode-btn ${allocMode === 'per_subject' ? 'active' : ''}`}
                                onClick={() => handleAllocModeChange('per_subject')}
                            >
                                <svg fill="none" strokeWidth="2" stroke="currentColor" viewBox="0 0 24 24" width="16" height="16">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75" />
                                </svg>
                                Custom per subject
                                <span className="exam-alloc-mode-desc">Set count individually</span>
                            </button>
                        </div>

                        {/* Equal mode input */}
                        {allocMode === 'equal' && (
                            <div className="cs-input-field" style={{ maxWidth: '220px', marginTop: '16px' }}>
                                <label>Total Questions</label>
                                <input
                                    type="number"
                                    min="1"
                                    value={totalQuestions}
                                    onChange={e => setTotalQuestions(Math.max(1, parseInt(e.target.value) || 1))}
                                />
                            </div>
                        )}

                        {/* Per-subject mode inputs */}
                        {allocMode === 'per_subject' && (
                            <div className="exam-alloc-per-subject" style={{ marginTop: '16px' }}>
                                {selectedSubjectIds.map(id => {
                                    const subject = subjects.find(s => s.id === id);
                                    const stats = subjectStats[id];
                                    return (
                                        <div key={id} className="exam-alloc-subject-row">
                                            <div className="exam-alloc-subject-label">
                                                <strong>{subject?.course_code}</strong>
                                                <span>{subject?.course_title}</span>
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                <input
                                                    type="number"
                                                    min="1"
                                                    className="exam-alloc-count-input"
                                                    value={perSubjectCounts[id] || ''}
                                                    onChange={e => setPerSubjectCounts(prev => ({
                                                        ...prev,
                                                        [id]: Math.max(1, parseInt(e.target.value) || 1),
                                                    }))}
                                                />
                                                {stats ? (
                                                    <span className="exam-alloc-stats-hint">
                                                        {stats.available} available · {stats.moCount} MO{stats.moCount !== 1 ? 's' : ''}
                                                    </span>
                                                ) : loadingStats.has(id) ? (
                                                    <span className="exam-alloc-stats-hint">loading...</span>
                                                ) : null}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}

                        {/* Preview table */}
                        {previewRows.length > 0 && (
                            <div style={{ marginTop: '20px' }}>
                                <p style={{ margin: '0 0 8px', fontSize: '0.82rem', fontWeight: 600, color: 'var(--prof-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                    Allocation Preview
                                </p>
                                <div className="exam-alloc-preview-table-wrap">
                                    <table className="exam-alloc-preview-table">
                                        <thead>
                                            <tr>
                                                <th>Subject</th>
                                                <th>Available</th>
                                                <th>Allocated</th>
                                                <th>MOs</th>
                                                <th>~Per MO</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {previewRows.map(row => (
                                                <tr key={row.id} className={row.insufficient ? 'exam-alloc-row-warn' : ''}>
                                                    <td><strong>{row.code}</strong></td>
                                                    <td>{row.available !== null ? row.available : <span className="exam-alloc-stats-hint">…</span>}</td>
                                                    <td>
                                                        {row.allocated}
                                                        {row.insufficient && (
                                                            <span className="exam-alloc-insufficient-tag">Not enough</span>
                                                        )}
                                                    </td>
                                                    <td>{row.moCount || '…'}</td>
                                                    <td>{row.moCount > 0 ? row.perMO : '—'}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                        <tfoot>
                                            <tr>
                                                <td><strong>Total</strong></td>
                                                <td></td>
                                                <td><strong>{totalAllocated}</strong></td>
                                                <td></td>
                                                <td></td>
                                            </tr>
                                        </tfoot>
                                    </table>
                                </div>
                                {hasInsufficientWarning && (
                                    <p className="cs-error" style={{ marginTop: '10px' }}>
                                        One or more subjects don't have enough questions in the bank. Reduce the allocation or add more questions to those subjects.
                                    </p>
                                )}
                            </div>
                        )}
                    </div>
                )}

                {submitError && <p className="cs-error">{submitError}</p>}

                <div className="cs-actions">
                    <button type="button" className="btn-secondary" onClick={() => navigate('/professor/exams')}>
                        Cancel
                    </button>
                    <button
                        type="submit"
                        className="btn-primary"
                        disabled={isSubmitting || !isFormValid || hasInsufficientWarning}
                    >
                        {isSubmitting
                            ? 'Saving...'
                            : isEditMode
                                ? (selectedSubjectIds.length > 0 ? 'Update & Regenerate Sets' : 'Save Changes')
                                : (selectedSubjectIds.length > 0 ? 'Generate Exam' : 'Save Exam')
                        }
                    </button>
                </div>
            </form>

            <Toast isOpen={toast.open} message={toast.message} type={toast.type} onClose={closeToast} />
        </div>
    );
}
