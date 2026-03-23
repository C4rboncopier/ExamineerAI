import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import {
    fetchStudentFormById, submitStudentForm,
    getFormWindowStatus, formatPHT, formatFormDate,
} from '../../lib/studentForms';
import type { StudentForm } from '../../lib/studentForms';
import { supabase } from '../../lib/supabase';

export function StudentViewForm() {
    const { user } = useAuth();
    const navigate = useNavigate();
    const { formId } = useParams<{ formId: string }>();

    const [form, setForm] = useState<StudentForm | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);

    const [selectedExamIds, setSelectedExamIds] = useState<Set<string>>(new Set());
    const [enrolledExamIds, setEnrolledExamIds] = useState<Set<string>>(new Set());

    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submitError, setSubmitError] = useState<string | null>(null);
    const [submitSuccess, setSubmitSuccess] = useState<{ autoEnrolled: string[]; dntMarked: number } | null>(null);

    const [userProgramId, setUserProgramId] = useState<string | null>(null);
    const [isDetailsOpen, setIsDetailsOpen] = useState(false);

    useEffect(() => {
        if (!user || !formId) return;

        async function load() {
            setIsLoading(true);

            const { data: profile } = await supabase
                .from('profiles')
                .select('program_id')
                .eq('id', user!.id)
                .single();
            setUserProgramId((profile as any)?.program_id ?? null);

            const { data, error } = await fetchStudentFormById(formId!, user!.id);
            if (error || !data) {
                setLoadError(error ?? 'Form not found.');
                setIsLoading(false);
                return;
            }

            setForm(data);

            if (data.my_submission) {
                setSelectedExamIds(new Set(data.my_submission.selected_exam_ids));
            }

            if (data.form_exams.length > 0) {
                const examIds = data.form_exams.map(fe => fe.exam_id);
                const { data: enrollments } = await supabase
                    .from('exam_enrollments')
                    .select('exam_id')
                    .eq('student_id', user!.id)
                    .in('exam_id', examIds);
                const enrolled = new Set<string>(
                    ((enrollments ?? []) as { exam_id: string }[]).map(e => e.exam_id)
                );
                setEnrolledExamIds(enrolled);
            }

            setIsLoading(false);
        }

        load();
    }, [user, formId]);

    const MAX_EXAMS = 3;

    function toggleExam(examId: string) {
        setSelectedExamIds(prev => {
            const next = new Set(prev);
            if (next.has(examId)) {
                next.delete(examId);
            } else {
                if (next.size >= MAX_EXAMS) return prev;
                next.add(examId);
            }
            return next;
        });
    }

    async function handleSubmit() {
        if (!form || !user) return;
        if (selectedExamIds.size === 0) { setSubmitError('Please select at least one exam.'); return; }

        setIsSubmitting(true);
        setSubmitError(null);

        const result = await submitStudentForm(
            form.id,
            user.id,
            Array.from(selectedExamIds),
            form.attempt_number
        );

        if (result.error) {
            setSubmitError(result.error);
            setIsSubmitting(false);
        } else {
            setSubmitSuccess({ autoEnrolled: result.autoEnrolled, dntMarked: result.dntMarked });
            const { data } = await fetchStudentFormById(form.id, user.id);
            if (data) setForm(data);
            setIsSubmitting(false);
        }
    }

    if (isLoading) {
        return (
            <div className="qb-container create-question-wrapper" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
                <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="#ec1f28" strokeWidth="2" style={{ animation: 'spin 1s linear infinite' }}>
                    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                </svg>
            </div>
        );
    }

    if (loadError || !form) {
        return (
            <div className="qb-container create-question-wrapper">
                <button type="button" className="btn-back" onClick={() => navigate('/student/forms')}>
                    <svg fill="none" strokeWidth="2" stroke="currentColor" viewBox="0 0 24 24" width="20" height="20"><path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" /></svg>
                    Back to Forms
                </button>
                <div style={{ padding: '40px', textAlign: 'center', color: '#b91c1c' }}>{loadError ?? 'Form not found.'}</div>
            </div>
        );
    }

    const ws = getFormWindowStatus(form);
    const hasSubmitted = !!form.my_submission;
    const canSubmit = ws === 'open' && !hasSubmitted;

    const statusStrip = hasSubmitted
        ? { label: '✓ Submitted', bg: '#eff6ff', color: '#1d4ed8', border: '#bfdbfe' }
        : ws === 'open'
            ? { label: 'Open', bg: '#dcfce7', color: '#15803d', border: '#86efac' }
            : ws === 'upcoming'
                ? { label: 'Upcoming', bg: '#fef9c3', color: '#92400e', border: '#fde047' }
                : { label: 'Closed', bg: '#f1f5f9', color: '#475569', border: '#cbd5e1' };

    const detailRow = (label: string, value: React.ReactNode, last = false) => (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '10px', padding: '8px 16px', borderBottom: last ? 'none' : '1px solid var(--prof-border)' }}>
            <span style={{ fontSize: '0.78rem', color: 'var(--prof-text-muted)', fontWeight: 500, flexShrink: 0 }}>{label}</span>
            <span style={{ fontSize: '0.82rem', color: 'var(--prof-text-main)', fontWeight: 600, textAlign: 'right' }}>{value}</span>
        </div>
    );

    return (
        <div className="qb-container create-question-wrapper">
            <button type="button" className="btn-back" onClick={() => navigate('/student/forms')}>
                <svg fill="none" strokeWidth="2" stroke="currentColor" viewBox="0 0 24 24" width="20" height="20">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
                </svg>
                Back to Forms
            </button>

            <h2 style={{ margin: '0 0 16px', fontSize: '1.35rem', fontWeight: 700, color: 'var(--prof-text-main)' }}>
                {form.title}
            </h2>

            <div className="pve-overview-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: '20px', alignItems: 'start' }}>

                {/* ── Left: Exam Selection ── */}
                <div className="pve-main-col" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    <div className="cs-card">
                        <div style={{ marginBottom: '14px' }}>
                            <h3 className="cs-card-title" style={{ marginBottom: '4px' }}>
                                {hasSubmitted ? 'Your Submission' : 'Select Exams to Take'}
                                {canSubmit && selectedExamIds.size > 0 && (
                                    <span style={{ marginLeft: '8px', fontSize: '0.75rem', fontWeight: 600, background: '#f0f9ff', color: 'var(--prof-primary)', border: '1px solid #bae6fd', borderRadius: '10px', padding: '1px 8px' }}>
                                        {selectedExamIds.size} selected
                                    </span>
                                )}
                            </h3>
                            <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--prof-text-muted)' }}>
                                {hasSubmitted
                                    ? 'Exams you selected in your submission.'
                                    : canSubmit
                                        ? `Select up to ${MAX_EXAMS} exams you plan to take in Attempt ${form.attempt_number}.`
                                        : 'Exams included in this form.'}
                            </p>
                            {canSubmit && selectedExamIds.size >= MAX_EXAMS && (
                                <p style={{ margin: '6px 0 0', fontSize: '0.78rem', color: '#d97706', fontWeight: 500 }}>
                                    Maximum of {MAX_EXAMS} exams reached.
                                </p>
                            )}
                        </div>

                        {form.form_exams.length === 0 ? (
                            <p style={{ color: 'var(--prof-text-muted)', fontSize: '0.85rem' }}>No exams in this form.</p>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                {form.form_exams.map(fe => {
                                    if (!fe.exams) return null;
                                    const exam = fe.exams;
                                    const isEnrolled = enrolledExamIds.has(exam.id);
                                    const isEligible = !userProgramId || (exam.program_ids ?? []).length === 0 || (exam.program_ids ?? []).includes(userProgramId);
                                    const isSelected = selectedExamIds.has(exam.id);
                                    const isMaxedOut = canSubmit && !isSelected && selectedExamIds.size >= MAX_EXAMS;
                                    const isSubmittedSelected = hasSubmitted && form.my_submission!.selected_exam_ids.includes(exam.id);

                                    return (
                                        <div
                                            key={fe.exam_id}
                                            onClick={() => { if (canSubmit && isEligible && !isMaxedOut) toggleExam(exam.id); }}
                                            style={{
                                                padding: '12px 14px',
                                                background: !isEligible ? '#fafafa' : isSelected ? '#f0f9ff' : '#fff',
                                                border: `1.5px solid ${!isEligible ? '#e2e8f0' : isSelected ? '#7dd3fc' : 'var(--prof-border)'}`,
                                                borderRadius: '10px',
                                                cursor: canSubmit && isEligible && !isMaxedOut ? 'pointer' : 'default',
                                                opacity: !isEligible || isMaxedOut ? 0.5 : 1,
                                                display: 'flex', alignItems: 'flex-start', gap: '10px',
                                                transition: 'border-color 0.15s, background 0.15s',
                                            }}
                                        >
                                            <div style={{ marginTop: '2px', flexShrink: 0 }}>
                                                {canSubmit ? (
                                                    <input
                                                        type="checkbox"
                                                        checked={isSelected}
                                                        disabled={!isEligible || isMaxedOut}
                                                        onChange={() => { if (isEligible && !isMaxedOut) toggleExam(exam.id); }}
                                                        onClick={e => e.stopPropagation()}
                                                        style={{ width: '16px', height: '16px', cursor: isEligible && !isMaxedOut ? 'pointer' : 'not-allowed' }}
                                                    />
                                                ) : hasSubmitted ? (
                                                    isSubmittedSelected ? (
                                                        <div style={{ width: '20px', height: '20px', borderRadius: '50%', background: '#dcfce7', border: '1.5px solid #86efac', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                            <svg fill="none" strokeWidth="2.5" stroke="#15803d" viewBox="0 0 24 24" width="12" height="12"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
                                                        </div>
                                                    ) : (
                                                        <div style={{ width: '20px', height: '20px', borderRadius: '50%', background: '#f1f5f9', border: '1.5px solid #cbd5e1', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                            <svg fill="none" strokeWidth="2" stroke="#94a3b8" viewBox="0 0 24 24" width="10" height="10"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                                                        </div>
                                                    )
                                                ) : (
                                                    <div style={{ width: '20px', height: '20px', borderRadius: '50%', background: '#f1f5f9', border: '1.5px solid #e2e8f0' }} />
                                                )}
                                            </div>

                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', marginBottom: '4px' }}>
                                                    <span style={{ fontWeight: 600, fontSize: '0.875rem', color: 'var(--prof-text-main)' }}>{exam.title}</span>
                                                    <span style={{ fontSize: '0.7rem', color: 'var(--prof-text-muted)', background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: '4px', padding: '1px 5px' }}>{exam.code}</span>
                                                </div>

                                                {(exam.exam_subjects ?? []).length > 0 && (
                                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: '4px' }}>
                                                        {(exam.exam_subjects ?? []).map((s: any) => s.subjects && (
                                                            <span key={s.subject_id} style={{ fontSize: '0.68rem', fontWeight: 600, color: 'var(--prof-primary)', background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: '4px', padding: '1px 5px' }}>
                                                                {s.subjects.course_code}
                                                            </span>
                                                        ))}
                                                    </div>
                                                )}

                                                {canSubmit && !isEnrolled && isEligible && (
                                                    <p style={{ margin: 0, fontSize: '0.72rem', color: '#d97706', fontWeight: 500 }}>
                                                        ℹ Not enrolled — will be auto-enrolled on submit.
                                                    </p>
                                                )}
                                                {!isEligible && (
                                                    <p style={{ margin: 0, fontSize: '0.72rem', color: '#94a3b8', fontWeight: 500 }}>
                                                        Not eligible for your program.
                                                    </p>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    {/* Submit */}
                    {canSubmit && !submitSuccess && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {submitError && (
                                <div style={{ padding: '10px 14px', background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: '8px', color: '#b91c1c', fontSize: '0.875rem', fontWeight: 500 }}>
                                    {submitError}
                                </div>
                            )}
                            <button
                                onClick={handleSubmit}
                                disabled={isSubmitting || selectedExamIds.size === 0}
                                style={{ padding: '12px 24px', background: '#15803d', color: '#fff', border: 'none', borderRadius: '10px', fontSize: '0.9rem', fontWeight: 700, cursor: isSubmitting || selectedExamIds.size === 0 ? 'not-allowed' : 'pointer', opacity: isSubmitting || selectedExamIds.size === 0 ? 0.65 : 1 }}
                            >
                                {isSubmitting ? 'Submitting...' : `Submit Form (${selectedExamIds.size} exam${selectedExamIds.size !== 1 ? 's' : ''} selected)`}
                            </button>
                            <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--prof-text-muted)', textAlign: 'center' }}>
                                Submission is final and cannot be changed after submitting.
                            </p>
                        </div>
                    )}

                    {/* Success banner */}
                    {submitSuccess && (
                        <div style={{ padding: '16px', background: '#dcfce7', border: '1px solid #86efac', borderRadius: '10px' }}>
                            <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#15803d', marginBottom: submitSuccess.autoEnrolled.length > 0 || submitSuccess.dntMarked > 0 ? '8px' : '0' }}>
                                ✓ Form submitted successfully!
                            </div>
                            {submitSuccess.autoEnrolled.length > 0 && (
                                <div style={{ fontSize: '0.82rem', color: '#166534', marginBottom: '4px' }}>
                                    Auto-enrolled in: {submitSuccess.autoEnrolled.join(', ')}
                                </div>
                            )}
                            {submitSuccess.dntMarked > 0 && (
                                <div style={{ fontSize: '0.82rem', color: '#166534' }}>
                                    {submitSuccess.dntMarked} previous attempt{submitSuccess.dntMarked !== 1 ? 's' : ''} marked as "Did Not Take" for newly enrolled exams.
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* ── Right: Form Details Sidebar ── */}
                <div className="pve-details-col">
                    <div className="pve-details-card">
                        {/* Mobile accordion toggle */}
                        <button
                            className="pve-details-toggle"
                            onClick={() => setIsDetailsOpen(v => !v)}
                        >
                            <span>Form Details</span>
                            <svg fill="none" strokeWidth="2.5" stroke="currentColor" viewBox="0 0 24 24" width="16" height="16"
                                style={{ transform: isDetailsOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                            </svg>
                        </button>

                        <div className={`pve-details-body${isDetailsOpen ? ' pve-details-open' : ''}`}>
                            <div className="pve-details-inner-card cs-card" style={{ padding: 0, overflow: 'hidden' }}>

                                {/* Status strip */}
                                <div style={{ padding: '12px 16px', background: statusStrip.bg, borderBottom: `1px solid ${statusStrip.border}` }}>
                                    <div style={{ fontSize: '0.75rem', fontWeight: 700, color: statusStrip.color, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '2px' }}>
                                        Status
                                    </div>
                                    <div style={{ fontSize: '1rem', fontWeight: 700, color: statusStrip.color }}>
                                        {statusStrip.label}
                                    </div>
                                </div>

                                {/* Key-value details */}
                                <div style={{ padding: '4px 0' }}>
                                    {detailRow('Attempt', `Attempt ${form.attempt_number}`)}
                                    {detailRow('Academic Year', form.academic_year)}
                                    {detailRow('Term', form.term)}
                                    {detailRow('Exam Date', formatFormDate(form.exam_date))}
                                    {detailRow('Window Opens',
                                        <span style={{ fontSize: '0.78rem' }}>{formatPHT(form.submission_start)} PHT</span>
                                    )}
                                    {detailRow('Window Closes',
                                        <span style={{ fontSize: '0.78rem' }}>{formatPHT(form.submission_end)} PHT</span>
                                    )}

                                </div>

                                {/* Description */}
                                {form.description && (
                                    <div style={{ padding: '10px 16px', borderTop: '1px solid var(--prof-border)' }}>
                                        <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--prof-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '6px' }}>
                                            Description
                                        </div>
                                        <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--prof-text-muted)', lineHeight: 1.65 }}>
                                            {form.description}
                                        </p>
                                    </div>
                                )}

                                {/* Status banners */}
                                {ws === 'closed' && !hasSubmitted && (
                                    <div style={{ margin: '0 12px 12px', padding: '10px 12px', background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: '8px', fontSize: '0.8rem', color: '#b91c1c', fontWeight: 500, lineHeight: 1.5 }}>
                                        The submission window has closed. You did not submit.
                                    </div>
                                )}
                                {ws === 'upcoming' && (
                                    <div style={{ margin: '0 12px 12px', padding: '10px 12px', background: '#fef9c3', border: '1px solid #fde047', borderRadius: '8px', fontSize: '0.8rem', color: '#92400e', fontWeight: 500, lineHeight: 1.5 }}>
                                        Opens {formatPHT(form.submission_start)} PHT.
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

            </div>
        </div>
    );
}
