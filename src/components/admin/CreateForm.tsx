import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { fetchAcademicYear, fetchSemester } from '../../lib/settings';
import {
    fetchEligibleExams, createForm, updateForm, fetchFormById,
    phtToUtc, utcToPhtLocal,
} from '../../lib/forms';
import type { EligibleExam, CreateFormData } from '../../lib/forms';

const EXAMS_PER_PAGE = 10;

export function CreateForm() {
    const { user } = useAuth();
    const navigate = useNavigate();
    const { formId } = useParams<{ formId?: string }>();
    const isEdit = !!formId;

    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [examDate, setExamDate] = useState('');
    const [submissionStart, setSubmissionStart] = useState('');
    const [submissionEnd, setSubmissionEnd] = useState('');
    const [attemptNumber, setAttemptNumber] = useState(1);
    const [selectedExamIds, setSelectedExamIds] = useState<Set<string>>(new Set());
    const [examSearch, setExamSearch] = useState('');
    const [examPage, setExamPage] = useState(1);

    const [currentAY, setCurrentAY] = useState('');
    const [currentTerm, setCurrentTerm] = useState('');
    const [eligibleExams, setEligibleExams] = useState<EligibleExam[]>([]);
    const [isLoadingExams, setIsLoadingExams] = useState(false);

    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submitError, setSubmitError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(isEdit);

    // Load current AY/Term
    useEffect(() => {
        Promise.all([fetchAcademicYear(), fetchSemester()]).then(([ay, sem]) => {
            if (ay.value) setCurrentAY(ay.value);
            if (sem.value) setCurrentTerm(sem.value);
        });
    }, []);

    // Load existing form for editing
    useEffect(() => {
        if (!isEdit || !formId) return;
        fetchFormById(formId).then(({ data }) => {
            if (!data) return;
            setTitle(data.title);
            setDescription(data.description ?? '');
            setExamDate(data.exam_date);
            setSubmissionStart(utcToPhtLocal(data.submission_start));
            setSubmissionEnd(utcToPhtLocal(data.submission_end));
            setAttemptNumber(data.attempt_number);
            setSelectedExamIds(new Set(data.form_exams.map(fe => fe.exam_id)));
            setIsLoading(false);
        });
    }, [isEdit, formId]);

    // Load eligible exams when AY/Term/attempt changes
    useEffect(() => {
        if (!currentAY || !currentTerm) return;
        setIsLoadingExams(true);
        fetchEligibleExams(currentAY, currentTerm, attemptNumber).then(({ data }) => {
            setEligibleExams(data);
            setIsLoadingExams(false);
        });
    }, [currentAY, currentTerm, attemptNumber]);

    // Reset exam page when search or filters change
    useEffect(() => { setExamPage(1); }, [examSearch, eligibleExams]);

    const filteredExams = useMemo(() => {
        const q = examSearch.toLowerCase().trim();
        if (!q) return eligibleExams;
        return eligibleExams.filter(e => e.title.toLowerCase().includes(q) || e.code.toLowerCase().includes(q));
    }, [eligibleExams, examSearch]);

    const totalExamPages = Math.max(1, Math.ceil(filteredExams.length / EXAMS_PER_PAGE));
    const pagedExams = filteredExams.slice((examPage - 1) * EXAMS_PER_PAGE, examPage * EXAMS_PER_PAGE);

    function toggleExam(examId: string, isDone: boolean) {
        if (isDone) return;
        setSelectedExamIds(prev => {
            const next = new Set(prev);
            if (next.has(examId)) next.delete(examId); else next.add(examId);
            return next;
        });
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setSubmitError(null);
        if (!title.trim()) { setSubmitError('Title is required.'); return; }
        if (!examDate) { setSubmitError('Exam date is required.'); return; }
        if (!submissionStart || !submissionEnd) { setSubmitError('Submission window is required.'); return; }
        if (new Date(submissionStart) >= new Date(submissionEnd)) { setSubmitError('Submission end must be after start.'); return; }
        if (selectedExamIds.size === 0) { setSubmitError('Select at least one exam.'); return; }
        if (!user) { setSubmitError('Not authenticated.'); return; }

        setIsSubmitting(true);

        const formData: CreateFormData = {
            title: title.trim(),
            description: description.trim() || null,
            exam_date: examDate,
            submission_start: phtToUtc(submissionStart),
            submission_end: phtToUtc(submissionEnd),
            attempt_number: attemptNumber,
            academic_year: currentAY,
            term: currentTerm,
            exam_ids: Array.from(selectedExamIds),
        };

        const { error } = isEdit
            ? await updateForm(formId!, formData)
            : await createForm(formData, user.id);

        if (error) {
            setSubmitError(error);
            setIsSubmitting(false);
        } else {
            navigate('/admin/forms');
        }
    }

    function getAttemptStatusBadge(status: EligibleExam['attempt_status']) {
        if (status === 'done') return { label: 'Closed', bg: '#fee2e2', color: '#b91c1c', border: '#fca5a5' };
        if (status === 'deployed') return { label: 'Open', bg: '#dcfce7', color: '#15803d', border: '#86efac' };
        return { label: 'Draft', bg: '#f1f5f9', color: '#475569', border: '#cbd5e1' };
    }

    const inputStyle: React.CSSProperties = {
        width: '100%', padding: '9px 12px', borderRadius: '8px',
        border: '1.5px solid var(--prof-border)', background: '#fff',
        fontSize: '0.875rem', color: 'var(--prof-text-main)', outline: 'none',
        boxSizing: 'border-box',
    };
    if (isLoading) {
        return (
            <div className="qb-container create-question-wrapper" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#ec1f28" strokeWidth="2" style={{ animation: 'spin 1s linear infinite' }}>
                    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                </svg>
            </div>
        );
    }

    return (
        <div className="qb-container create-question-wrapper">
            {/* Back */}
            <button type="button" className="btn-back" onClick={() => navigate('/admin/forms')}>
                <svg fill="none" strokeWidth="2" stroke="currentColor" viewBox="0 0 24 24" width="20" height="20">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
                </svg>
                Back to Forms
            </button>

            <div className="cs-header">
                <h2>{isEdit ? 'Edit Form' : 'Create Form'}</h2>
                <p>{isEdit ? 'Update this form and its exam selection.' : 'Create a new student application form for an exam attempt.'}</p>
            </div>

            <form className="cq-form" onSubmit={handleSubmit}>
                <div className="cq-form-grid">
                    {/* ── Left Column ── */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        {/* Form Details */}
                        <div className="cs-card">
                            <h3 className="cs-card-title">Form Details</h3>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                                <div className="cs-input-field">
                                    <label>Title <span style={{ color: '#b91c1c' }}>*</span></label>
                                    <input
                                        type="text"
                                        value={title}
                                        onChange={e => setTitle(e.target.value)}
                                        placeholder="e.g., Application Form — Attempt 1 Exit Exam 2T2526"
                                        style={inputStyle}
                                        required
                                    />
                                </div>
                                <div className="cs-input-field">
                                    <label>Description <span style={{ fontWeight: 400, color: 'var(--prof-text-muted)' }}>(optional)</span></label>
                                    <textarea
                                        value={description}
                                        onChange={e => setDescription(e.target.value)}
                                        placeholder="Additional details about this form..."
                                        rows={3}
                                        style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.5 }}
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Attempt & Schedule */}
                        <div className="cs-card">
                            <h3 className="cs-card-title">Attempt &amp; Schedule</h3>
                            <div className="cs-input-group row">
                                <div className="cs-input-field flex-1">
                                    <label>Attempt Number <span style={{ color: '#b91c1c' }}>*</span></label>
                                    <select
                                        value={attemptNumber}
                                        onChange={e => { setAttemptNumber(Number(e.target.value)); setSelectedExamIds(new Set()); }}
                                        style={{ ...inputStyle, appearance: 'none', cursor: 'pointer' }}
                                    >
                                        {[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>Attempt {n}</option>)}
                                    </select>
                                </div>
                                <div className="cs-input-field flex-1">
                                    <label>Exam Date <span style={{ color: '#b91c1c' }}>*</span></label>
                                    <input type="date" value={examDate} onChange={e => setExamDate(e.target.value)} style={inputStyle} required />
                                </div>
                            </div>

                            <div className="cs-input-field" style={{ marginTop: '14px' }}>
                                <label>Submission Window <span style={{ color: '#b91c1c' }}>*</span></label>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                                    <div style={{ flex: 1, minWidth: '160px' }}>
                                        <div style={{ fontSize: '0.72rem', color: 'var(--prof-text-muted)', marginBottom: '4px' }}>Start (PHT, UTC+8)</div>
                                        <input type="datetime-local" value={submissionStart} onChange={e => setSubmissionStart(e.target.value)} style={inputStyle} required />
                                    </div>
                                    <span style={{ color: 'var(--prof-text-muted)', fontSize: '0.85rem', marginTop: '18px' }}>→</span>
                                    <div style={{ flex: 1, minWidth: '160px' }}>
                                        <div style={{ fontSize: '0.72rem', color: 'var(--prof-text-muted)', marginBottom: '4px' }}>End (PHT, UTC+8)</div>
                                        <input type="datetime-local" value={submissionEnd} onChange={e => setSubmissionEnd(e.target.value)} style={inputStyle} required />
                                    </div>
                                </div>
                                <p style={{ margin: '6px 0 0', fontSize: '0.72rem', color: 'var(--prof-text-muted)' }}>
                                    Times are in Philippine Standard Time (UTC+8). Stored as UTC internally.
                                </p>
                            </div>

                            {/* AY/Term display */}
                            <div className="cs-input-field" style={{ marginTop: '14px' }}>
                                <label>Academic Year &amp; Term</label>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '9px 12px', background: 'var(--prof-input-bg, #f8fafc)', border: '1px solid var(--prof-border)', borderRadius: '8px', fontSize: '0.9rem', color: 'var(--prof-text-secondary)' }}>
                                    <svg fill="none" strokeWidth="2" stroke="currentColor" viewBox="0 0 24 24" width="15" height="15" style={{ flexShrink: 0, opacity: 0.5 }}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
                                    </svg>
                                    <span>{currentAY || '—'}</span>
                                    <span style={{ opacity: 0.4 }}>·</span>
                                    <span>{currentTerm || '—'}</span>
                                    <span style={{ marginLeft: 'auto', fontSize: '0.78rem', opacity: 0.5 }}>Set by admin</span>
                                </div>
                            </div>
                        </div>

                        {submitError && (
                            <div style={{ padding: '12px 16px', background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: '8px', color: '#b91c1c', fontSize: '0.875rem', fontWeight: 500 }}>
                                {submitError}
                            </div>
                        )}
                    </div>

                    {/* ── Right Column ── */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        {/* Exam Selection */}
                        <div className="cs-card">
                            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px', marginBottom: '12px' }}>
                                <div>
                                    <h3 className="cs-card-title" style={{ margin: '0 0 2px' }}>
                                        Exam Selection
                                        {selectedExamIds.size > 0 && (
                                            <span style={{ marginLeft: '8px', fontSize: '0.75rem', fontWeight: 600, background: '#f0f9ff', color: 'var(--prof-primary)', border: '1px solid #bae6fd', borderRadius: '10px', padding: '1px 8px' }}>
                                                {selectedExamIds.size} selected
                                            </span>
                                        )}
                                    </h3>
                                    <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--prof-text-muted)' }}>
                                        {currentAY} · {currentTerm} · Attempt {attemptNumber} available
                                    </p>
                                </div>
                            </div>

                            {/* Search */}
                            <div style={{ position: 'relative', marginBottom: '10px' }}>
                                <svg fill="none" strokeWidth="2" stroke="currentColor" viewBox="0 0 24 24" width="14" height="14" style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--prof-text-muted)', pointerEvents: 'none' }}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                                </svg>
                                <input
                                    type="text"
                                    placeholder="Search exams by title or code..."
                                    value={examSearch}
                                    onChange={e => setExamSearch(e.target.value)}
                                    style={{ ...inputStyle, paddingLeft: '32px' }}
                                />
                            </div>

                            {isLoadingExams ? (
                                <div style={{ display: 'flex', justifyContent: 'center', padding: '30px 0' }}>
                                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" style={{ animation: 'spin 1s linear infinite' }}>
                                        <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                                    </svg>
                                </div>
                            ) : filteredExams.length === 0 ? (
                                <div style={{ textAlign: 'center', padding: '24px', color: 'var(--prof-text-muted)', fontSize: '0.85rem' }}>
                                    {examSearch ? 'No exams match your search.' : `No exams available for Attempt ${attemptNumber} in the current AY/Term.`}
                                </div>
                            ) : (
                                <>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                        {pagedExams.map(exam => {
                                            const isDone = exam.attempt_status === 'done';
                                            const isSelected = selectedExamIds.has(exam.id);
                                            const statusBadge = getAttemptStatusBadge(exam.attempt_status);

                                            return (
                                                <div
                                                    key={exam.id}
                                                    onClick={() => toggleExam(exam.id, isDone)}
                                                    style={{
                                                        display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '10px 12px',
                                                        background: isDone ? '#fafafa' : isSelected ? '#f0f9ff' : '#fff',
                                                        border: `1.5px solid ${isDone ? '#e2e8f0' : isSelected ? '#7dd3fc' : 'var(--prof-border)'}`,
                                                        borderRadius: '8px', cursor: isDone ? 'not-allowed' : 'pointer',
                                                        opacity: isDone ? 0.65 : 1, transition: 'all 0.15s',
                                                    }}
                                                >
                                                    <input
                                                        type="checkbox"
                                                        checked={isSelected}
                                                        disabled={isDone}
                                                        onChange={() => toggleExam(exam.id, isDone)}
                                                        onClick={e => e.stopPropagation()}
                                                        style={{ width: '16px', height: '16px', flexShrink: 0, marginTop: '2px', cursor: isDone ? 'not-allowed' : 'pointer' }}
                                                    />
                                                    <div style={{ flex: 1, minWidth: 0 }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                                                            <span style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--prof-text-main)' }}>{exam.title}</span>
                                                            <span style={{ fontSize: '0.7rem', color: 'var(--prof-text-muted)', background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: '4px', padding: '1px 5px' }}>{exam.code}</span>
                                                            <span style={{ fontSize: '0.7rem', fontWeight: 700, color: statusBadge.color, background: statusBadge.bg, border: `1px solid ${statusBadge.border}`, borderRadius: '6px', padding: '1px 6px' }}>
                                                                Attempt {attemptNumber}: {statusBadge.label}
                                                            </span>
                                                        </div>
                                                        {exam.exam_subjects.length > 0 && (
                                                            <div style={{ marginTop: '4px', display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                                                                {exam.exam_subjects.map(s => s.subjects && (
                                                                    <span key={s.subject_id} style={{ fontSize: '0.68rem', fontWeight: 600, color: 'var(--prof-primary)', background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: '4px', padding: '1px 5px' }}>
                                                                        {s.subjects.course_code}
                                                                    </span>
                                                                ))}
                                                            </div>
                                                        )}
                                                        {isDone && (
                                                            <p style={{ margin: '4px 0 0', fontSize: '0.72rem', color: '#b91c1c' }}>
                                                                ⚠ Attempt {attemptNumber} is already closed. Cannot include this exam.
                                                            </p>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>

                                    {/* Pagination */}
                                    {totalExamPages > 1 && (
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '12px', paddingTop: '10px', borderTop: '1px solid var(--prof-border)' }}>
                                            <span style={{ fontSize: '0.78rem', color: 'var(--prof-text-muted)' }}>
                                                {(examPage - 1) * EXAMS_PER_PAGE + 1}–{Math.min(examPage * EXAMS_PER_PAGE, filteredExams.length)} of {filteredExams.length}
                                            </span>
                                            <div style={{ display: 'flex', gap: '4px' }}>
                                                <button
                                                    type="button"
                                                    onClick={() => setExamPage(p => Math.max(1, p - 1))}
                                                    disabled={examPage === 1}
                                                    style={{ padding: '5px 10px', borderRadius: '6px', border: '1px solid var(--prof-border)', background: examPage === 1 ? '#f8fafc' : '#fff', color: examPage === 1 ? '#cbd5e1' : 'var(--prof-text-main)', fontSize: '0.8rem', cursor: examPage === 1 ? 'not-allowed' : 'pointer', fontWeight: 500 }}
                                                >
                                                    ← Prev
                                                </button>
                                                {Array.from({ length: totalExamPages }, (_, i) => i + 1)
                                                    .filter(p => p === 1 || p === totalExamPages || Math.abs(p - examPage) <= 1)
                                                    .reduce<(number | '...')[]>((acc, p, i, arr) => {
                                                        if (i > 0 && (p as number) - (arr[i - 1] as number) > 1) acc.push('...');
                                                        acc.push(p);
                                                        return acc;
                                                    }, [])
                                                    .map((p, i) => p === '...' ? (
                                                        <span key={`ellipsis-${i}`} style={{ padding: '5px 6px', fontSize: '0.8rem', color: 'var(--prof-text-muted)' }}>…</span>
                                                    ) : (
                                                        <button
                                                            key={p}
                                                            type="button"
                                                            onClick={() => setExamPage(p as number)}
                                                            style={{ padding: '5px 10px', borderRadius: '6px', border: '1px solid var(--prof-border)', background: examPage === p ? '#0f172a' : '#fff', color: examPage === p ? '#fff' : 'var(--prof-text-main)', fontSize: '0.8rem', cursor: 'pointer', fontWeight: examPage === p ? 700 : 400 }}
                                                        >
                                                            {p}
                                                        </button>
                                                    ))}
                                                <button
                                                    type="button"
                                                    onClick={() => setExamPage(p => Math.min(totalExamPages, p + 1))}
                                                    disabled={examPage === totalExamPages}
                                                    style={{ padding: '5px 10px', borderRadius: '6px', border: '1px solid var(--prof-border)', background: examPage === totalExamPages ? '#f8fafc' : '#fff', color: examPage === totalExamPages ? '#cbd5e1' : 'var(--prof-text-main)', fontSize: '0.8rem', cursor: examPage === totalExamPages ? 'not-allowed' : 'pointer', fontWeight: 500 }}
                                                >
                                                    Next →
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </>
                            )}
                        </div>
                    </div>
                </div>

                {/* Actions */}
                <div className="cs-actions" style={{ marginTop: '24px' }}>
                    <button type="button" className="btn-secondary" onClick={() => navigate('/admin/forms')}>
                        Cancel
                    </button>
                    <button
                        type="submit"
                        className="btn-primary"
                        disabled={isSubmitting}
                    >
                        {isSubmitting ? (isEdit ? 'Saving...' : 'Creating...') : (isEdit ? 'Save Changes' : 'Create Form')}
                    </button>
                </div>
            </form>
        </div>
    );
}
