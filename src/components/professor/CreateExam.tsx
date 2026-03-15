import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { fetchSubjects } from '../../lib/subjects';
import type { SubjectWithCounts } from '../../lib/subjects';
import { fetchPrograms } from '../../lib/settings';
import type { Program } from '../../lib/settings';
import { fetchTemplates } from '../../lib/templates';
import type { Template } from '../../lib/templates';
import { createExam, updateExam, fetchExamById } from '../../lib/exams';
import { fetchAcademicYear, fetchSemester } from '../../lib/settings';
import { Toast } from '../common/Toast';

interface ToastState {
    open: boolean;
    message: string;
    type: 'success' | 'error' | 'info';
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
    const [maxAttempts, setMaxAttempts] = useState(1);
    const [academicYear, setAcademicYear] = useState('2025-2026');
    const [term, setTerm] = useState('1st Semester');

    // Programs
    const [programs, setPrograms] = useState<Program[]>([]);
    const [selectedProgramIds, setSelectedProgramIds] = useState<string[]>([]);
    const [programDropdownOpen, setProgramDropdownOpen] = useState(false);
    const [programSearch, setProgramSearch] = useState('');

    // Subjects
    const [subjects, setSubjects] = useState<SubjectWithCounts[]>([]);
    const [selectedSubjectIds, setSelectedSubjectIds] = useState<string[]>([]);
    const [subjectSearch, setSubjectSearch] = useState('');
    const [subjectDropdownOpen, setSubjectDropdownOpen] = useState(false);

    // Form state
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isLoadingExam, setIsLoadingExam] = useState(isEditMode);
    const [submitError, setSubmitError] = useState<string | null>(null);

    const [toast, setToast] = useState<ToastState>({ open: false, message: '', type: 'success' });
    const showToast = (message: string, type: 'success' | 'error' | 'info' = 'success') =>
        setToast({ open: true, message, type });
    const closeToast = useCallback(() => setToast(prev => ({ ...prev, open: false })), []);

    const programDropdownRef = useRef<HTMLDivElement>(null);
    const subjectDropdownRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (programDropdownRef.current && !programDropdownRef.current.contains(event.target as Node)) {
                setProgramDropdownOpen(false);
            }
            if (subjectDropdownRef.current && !subjectDropdownRef.current.contains(event.target as Node)) {
                setSubjectDropdownOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // ── Load initial data ──────────────────────────────────────
    useEffect(() => {
        fetchSubjects().then(({ data }) => setSubjects(data || []));
        fetchTemplates().then(({ data }) => setTemplates(data || []));
        fetchPrograms().then(({ data }) => setPrograms(data || []));

        if (!isEditMode) {
            Promise.all([fetchAcademicYear(), fetchSemester()]).then(([ay, sem]) => {
                if (ay.value) setAcademicYear(ay.value);
                if (sem.value) setTerm(sem.value);
            });
        }

        if (isEditMode && examId) {
            fetchExamById(examId).then(({ data, error }) => {
                if (error || !data) {
                    showToast('Failed to load exam.', 'error');
                } else {
                    setTitle(data.title);
                    setCode(data.code);
                    setNumSets(data.num_sets);
                    setMaxAttempts(data.max_attempts ?? 1);
                    // In edit mode keep the exam's original AY + term
                    setAcademicYear(data.academic_year);
                    setTerm(data.term);
                    setSelectedSubjectIds(data.exam_subjects.map(s => s.subject_id));
                    setSelectedProgramIds(data.program_ids ?? []);
                }
                setIsLoadingExam(false);
            });
        }
    }, [isEditMode, examId]);

    // ── Template selection ────────────────────────────────────
    const handleTemplateChange = (templateId: string) => {
        setSelectedTemplateId(templateId);
        if (!templateId) return;
        const tpl = templates.find(t => t.id === templateId);
        if (!tpl) return;
        setTitle(tpl.title);
        setCode(tpl.code);
        // Filter out subject IDs that no longer exist (deleted subjects leave stale IDs in template)
        setSelectedSubjectIds(tpl.subject_ids.filter(id => subjects.some(s => s.id === id)));
        setSelectedProgramIds(tpl.program_ids ?? []);
    };

    // ── Program selection ─────────────────────────────────────
    const filteredPrograms = useMemo(() => {
        if (!programSearch.trim()) return programs;
        const q = programSearch.toLowerCase().trim();
        return programs.filter(p =>
            p.name.toLowerCase().includes(q) ||
            p.code.toLowerCase().includes(q)
        );
    }, [programs, programSearch]);

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
        }
        setSubjectDropdownOpen(false);
        setSubjectSearch('');
    };

    const handleRemoveSubject = (id: string) => {
        setSelectedSubjectIds(prev => prev.filter(s => s !== id));
    };

    // ── Deployment readiness ──────────────────────────────────
    const titleOk = title.trim().length > 0;
    const codeOk = code.trim().length > 0;
    const setsOk = numSets > 0;
    const subjectsOk = selectedSubjectIds.length > 0;
    const deployReadyItems = [
        { label: 'Exam title', done: titleOk },
        { label: 'Exam code', done: codeOk },
        { label: 'Number of sets', done: setsOk },
        { label: 'At least one subject', done: subjectsOk },
    ];
    const readyToDeploy = deployReadyItems.every(i => i.done);

    const statusPill = (done: boolean) => (
        <span style={{
            display: 'inline-flex', alignItems: 'center', gap: '4px',
            padding: '2px 9px', borderRadius: '99px', fontSize: '0.72rem', fontWeight: 600,
            background: done ? '#dcfce7' : '#fef9c3',
            color: done ? '#15803d' : '#a16207',
            marginLeft: '10px', verticalAlign: 'middle',
        }}>
            {done ? '✓ Done' : '○ Needed'}
        </span>
    );

    // ── Validation ────────────────────────────────────────────
    const isFormValid = useMemo(() => {
        if (!title.trim() || !code.trim()) return false;
        return true;
    }, [title, code]);

    // ── Submit ────────────────────────────────────────────────
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSubmitError(null);
        setIsSubmitting(true);

        if (isEditMode && examId) {
            const { error } = await updateExam(examId, title, code, selectedSubjectIds, numSets, maxAttempts, academicYear, term, selectedProgramIds);
            if (error) { setSubmitError(error); setIsSubmitting(false); return; }
            showToast('Exam updated.');
        } else {
            const { error } = await createExam(title, code, selectedSubjectIds, numSets, maxAttempts, academicYear, term, selectedProgramIds);
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
                <div className="cq-form-grid">
                    {/* ── Left Column ── */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
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
                            <h3 className="cs-card-title">Exam Details {statusPill(titleOk && codeOk && setsOk)}</h3>
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
                            <div className="cs-input-group row" style={{ marginTop: '14px' }}>
                                <div className="cs-input-field flex-2">
                                    <label>Academic Year &amp; Term</label>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '9px 12px', background: 'var(--prof-input-bg, #f8fafc)', border: '1px solid var(--prof-border)', borderRadius: '8px', fontSize: '0.9rem', color: 'var(--prof-text-secondary)' }}>
                                        <svg fill="none" strokeWidth="2" stroke="currentColor" viewBox="0 0 24 24" width="15" height="15" style={{ flexShrink: 0, opacity: 0.5 }}>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
                                        </svg>
                                        <span>{academicYear || '—'}</span>
                                        <span style={{ opacity: 0.4 }}>·</span>
                                        <span>{term || '—'}</span>
                                        <span style={{ marginLeft: 'auto', fontSize: '0.78rem', opacity: 0.5 }}>Set by admin</span>
                                    </div>
                                </div>
                                <div className="cs-input-field" style={{ minWidth: '150px' }}>
                                    <label>Max Attempts</label>
                                    <select value={maxAttempts} onChange={e => setMaxAttempts(Number(e.target.value))}>
                                        {[1, 2, 3, 4, 5].map(n => (
                                            <option key={n} value={n}>{n} attempt{n !== 1 ? 's' : ''}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                            {numSets > 1 && (
                                <p style={{ margin: '8px 0 0', fontSize: '0.82rem', color: 'var(--prof-text-muted)' }}>
                                    All sets contain the same questions, shuffled in a different order per set (Sets A–{String.fromCharCode(64 + numSets)}).
                                </p>
                            )}
                            <div className="cs-input-group" style={{ marginTop: '14px' }}>
                                <div className="cs-input-field">
                                    <label>Restrict to Program <span style={{ fontWeight: 400, color: 'var(--prof-text-muted)' }}>(optional)</span></label>
                                    <div className="cq-subject-search" ref={programDropdownRef}>
                                        <div
                                            className={`cq-subject-trigger ${programDropdownOpen ? 'open' : ''}`}
                                            onClick={() => setProgramDropdownOpen(!programDropdownOpen)}
                                        >
                                            <span className="cq-placeholder">
                                                {selectedProgramIds.length > 0
                                                    ? `${selectedProgramIds.length} program${selectedProgramIds.length > 1 ? 's' : ''} selected`
                                                    : 'Click to select programs...'}
                                            </span>
                                            <svg fill="none" strokeWidth="2" stroke="currentColor" viewBox="0 0 24 24" width="16" height="16">
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5"></path>
                                            </svg>
                                        </div>
                                        {programDropdownOpen && (
                                            <div className="cq-subject-dropdown">
                                                <input
                                                    type="text"
                                                    className="cq-subject-search-input"
                                                    placeholder="Search programs..."
                                                    value={programSearch}
                                                    onChange={e => setProgramSearch(e.target.value)}
                                                    autoFocus
                                                />
                                                <div className="cq-subject-options">
                                                    {filteredPrograms.length === 0 ? (
                                                        <div className="cq-subject-no-results">No programs found</div>
                                                    ) : filteredPrograms.map(p => {
                                                        const isSelected = selectedProgramIds.includes(p.id);
                                                        return (
                                                            <div
                                                                key={p.id}
                                                                className={`cq-subject-option ${isSelected ? 'selected' : ''}`}
                                                                onClick={() => {
                                                                    setSelectedProgramIds(prev =>
                                                                        isSelected ? prev.filter(id => id !== p.id) : [...prev, p.id]
                                                                    );
                                                                    setProgramSearch('');
                                                                }}
                                                                style={{ cursor: 'pointer' }}
                                                            >
                                                                <span className="cq-subject-option-code">{p.code}</span>
                                                                <span>{p.name}</span>
                                                                {isSelected && <span style={{ marginLeft: 'auto', fontSize: '12px', color: '#16a34a' }}>✓</span>}
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                    {selectedProgramIds.length > 0 && (
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '12px' }}>
                                            {selectedProgramIds.map(id => {
                                                const program = programs.find(p => p.id === id);
                                                if (!program) return null;
                                                return (
                                                    <div key={id} style={{ display: 'flex', alignItems: 'center', background: '#f1f5f9', padding: '6px 12px', borderRadius: '16px', border: '1px solid #e2e8f0' }}>
                                                        <span style={{ fontSize: '14px', color: '#334155', marginRight: '8px' }}>
                                                            {program.code}
                                                        </span>
                                                        <button
                                                            type="button"
                                                            onClick={() => setSelectedProgramIds(prev => prev.filter(pid => pid !== id))}
                                                            style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: '4px' }}
                                                            title="Remove Program"
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
                                    {selectedProgramIds.length > 0 && (
                                        <p style={{ marginTop: '6px', fontSize: '0.8rem', color: 'var(--prof-text-muted)' }}>
                                            Only students enrolled in the selected program(s) will be able to take this exam.
                                        </p>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* ── Right Column ── */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        {/* ── Card 3: Subjects ── */}
                        <div className="cs-card">
                            <h3 className="cs-card-title">Included Subjects <span style={{ fontWeight: 400, color: 'var(--prof-text-muted)', fontSize: '0.85rem' }}>(optional — can be filled later)</span> {statusPill(subjectsOk)}</h3>
                            <div className="cs-input-field">
                                <label>Search and Add Subjects</label>
                                <div className="cq-subject-search" ref={subjectDropdownRef}>
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

                        {submitError && <p className="cs-error">{submitError}</p>}
                    </div>
                </div>

                {/* ── Deploy readiness checklist ── */}
                <div style={{ marginTop: '24px', padding: '14px 16px', background: readyToDeploy ? '#f0fdf4' : '#fefce8', border: `1px solid ${readyToDeploy ? '#bbf7d0' : '#fde047'}`, borderRadius: '10px' }}>
                    <p style={{ margin: '0 0 10px', fontWeight: 600, fontSize: '0.82rem', color: readyToDeploy ? '#15803d' : '#713f12' }}>
                        {readyToDeploy ? '✓ This exam is ready to deploy.' : 'Complete the following to make this exam deployable:'}
                    </p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                        {deployReadyItems.map(item => (
                            <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: '7px', fontSize: '0.82rem' }}>
                                <span style={{ color: item.done ? '#16a34a' : '#d97706', fontWeight: 700, fontSize: '0.9rem', lineHeight: 1 }}>
                                    {item.done ? '✓' : '○'}
                                </span>
                                <span style={{ color: item.done ? '#15803d' : '#92400e', opacity: item.done ? 0.7 : 1, textDecoration: item.done ? 'line-through' : 'none' }}>
                                    {item.label}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="cs-actions" style={{ marginTop: '24px' }}>
                    <button type="button" className="btn-secondary" onClick={() => navigate('/professor/exams')}>
                        Cancel
                    </button>
                    <button
                        type="submit"
                        className="btn-primary"
                        disabled={isSubmitting || !isFormValid}
                    >
                        {isSubmitting ? 'Saving...' : isEditMode ? 'Save Changes' : 'Save Exam'}
                    </button>
                </div>
            </form>

            <Toast isOpen={toast.open} message={toast.message} type={toast.type} onClose={closeToast} />
        </div>
    );
}
