import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { fetchSubjects } from '../../lib/subjects';
import type { SubjectWithCounts } from '../../lib/subjects';
import { createTemplate, updateTemplate, fetchTemplateById } from '../../lib/templates';
import { Toast } from '../common/Toast';

interface ToastState {
    open: boolean;
    message: string;
    type: 'success' | 'error' | 'info';
}

export function CreateTemplate() {
    const { templateId } = useParams<{ templateId?: string }>();
    const navigate = useNavigate();
    const isEditMode = !!templateId;

    const [title, setTitle] = useState('');
    const [code, setCode] = useState('');
    const [subjects, setSubjects] = useState<SubjectWithCounts[]>([]);
    const [selectedSubjectIds, setSelectedSubjectIds] = useState<string[]>([]);
    const [subjectSearch, setSubjectSearch] = useState('');
    const [subjectDropdownOpen, setSubjectDropdownOpen] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isLoadingTemplate, setIsLoadingTemplate] = useState(isEditMode);
    const [submitError, setSubmitError] = useState<string | null>(null);
    const [toast, setToast] = useState<ToastState>({ open: false, message: '', type: 'success' });

    const showToast = (message: string, type: 'success' | 'error' | 'info' = 'success') =>
        setToast({ open: true, message, type });
    const closeToast = useCallback(() => setToast(prev => ({ ...prev, open: false })), []);

    useEffect(() => {
        fetchSubjects().then(({ data }) => setSubjects(data || []));

        if (isEditMode && templateId) {
            fetchTemplateById(templateId).then(({ data, error }) => {
                if (error || !data) {
                    showToast('Failed to load template.', 'error');
                } else {
                    setTitle(data.title);
                    setCode(data.code);
                    setSelectedSubjectIds(data.subject_ids);
                }
                setIsLoadingTemplate(false);
            });
        }
    }, [isEditMode, templateId]);

    const goBack = () => navigate('/professor/templates');

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
            setSelectedSubjectIds([...selectedSubjectIds, id]);
        }
        setSubjectDropdownOpen(false);
        setSubjectSearch('');
    };

    const handleRemoveSubject = (id: string) => {
        setSelectedSubjectIds(selectedSubjectIds.filter(sId => sId !== id));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSubmitError(null);
        setIsSubmitting(true);

        if (isEditMode && templateId) {
            const { error } = await updateTemplate(templateId, title, code, selectedSubjectIds);
            if (error) {
                setSubmitError(error);
                setIsSubmitting(false);
                return;
            }
            showToast('Template updated successfully.');
        } else {
            const { error } = await createTemplate(title, code, selectedSubjectIds);
            if (error) {
                setSubmitError(error);
                setIsSubmitting(false);
                return;
            }
            showToast('Template created successfully.');
        }

        setIsSubmitting(false);
        setTimeout(() => navigate('/professor/templates'), 600);
    };

    if (isLoadingTemplate) {
        return (
            <div className="qb-container create-question-wrapper">
                <p className="settings-loading-row">Loading template...</p>
            </div>
        );
    }

    return (
        <div className="qb-container create-question-wrapper">
            <button type="button" className="btn-back" onClick={goBack}>
                <svg fill="none" strokeWidth="2" stroke="currentColor" viewBox="0 0 24 24" width="20" height="20">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18"></path>
                </svg>
                Back to Templates
            </button>

            <div className="cs-header">
                <h2>{isEditMode ? 'Edit Template' : 'Create New Template'}</h2>
                <p>Define your exam template block. Select multiple subjects to include.</p>
            </div>

            <form className="cq-form" onSubmit={handleSubmit}>
                <div className="cs-card">
                    <h3 className="cs-card-title">Template Details</h3>

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
                                onChange={e => setCode(e.target.value)}
                                required
                            />
                        </div>
                    </div>
                </div>

                <div className="cs-card">
                    <h3 className="cs-card-title">Included Subjects</h3>

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
                                            <strong>{subject.course_code}</strong> - {subject.course_title}
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

                <div className="cs-actions">
                    <button type="button" className="btn-secondary" onClick={goBack}>
                        Cancel
                    </button>
                    <button
                        type="submit"
                        className="btn-primary"
                        disabled={isSubmitting || title === '' || code === '' || selectedSubjectIds.length === 0}
                    >
                        {isSubmitting
                            ? (isEditMode ? 'Updating...' : 'Saving...')
                            : (isEditMode ? 'Update Template' : 'Save Template')
                        }
                    </button>
                </div>
            </form>

            <Toast
                isOpen={toast.open}
                message={toast.message}
                type={toast.type}
                onClose={closeToast}
            />
        </div>
    );
}
