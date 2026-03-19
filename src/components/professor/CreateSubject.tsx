import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { createSubject, updateSubject, fetchSubjectWithOutcomes, type DuplicateSubjectInfo } from '../../lib/subjects';
import { countQuestionsByCourseOutcome, countQuestionsByModuleOutcome } from '../../lib/questions';
import { Popup } from '../common/Popup';

interface ModuleOutcome {
    id: string;
    dbId?: string;
    description: string;
}

interface CourseOutcome {
    id: string;
    dbId?: string;
    description: string;
    modules: ModuleOutcome[];
}

type PendingRemove =
    | { type: 'co'; coId: string }
    | { type: 'mo'; coId: string; moId: string };

const initialOutcomes = (): CourseOutcome[] => [
    { id: crypto.randomUUID(), description: '', modules: [{ id: crypto.randomUUID(), description: '' }] }
];

export function CreateSubject() {
    const { subjectId } = useParams<{ subjectId?: string }>();
    const navigate = useNavigate();
    const isEditMode = !!subjectId;

    const [courseTitle, setCourseTitle] = useState('');
    const [courseCode, setCourseCode] = useState('');
    const [outcomes, setOutcomes] = useState<CourseOutcome[]>(initialOutcomes);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isLoadingSubject, setIsLoadingSubject] = useState(false);
    const [submitError, setSubmitError] = useState<string | null>(null);
    const [duplicateSubject, setDuplicateSubject] = useState<DuplicateSubjectInfo | null>(null);
    const [submitSuccess, setSubmitSuccess] = useState(false);

    const [pendingRemove, setPendingRemove] = useState<PendingRemove | null>(null);
    const [pendingRemoveCount, setPendingRemoveCount] = useState(0);
    const [pendingRemoveLoading, setPendingRemoveLoading] = useState(false);

    useEffect(() => {
        if (!subjectId) return;

        setIsLoadingSubject(true);
        fetchSubjectWithOutcomes(subjectId).then(({ data, error }) => {
            if (error || !data) {
                setSubmitError(error || 'Failed to load subject');
                setIsLoadingSubject(false);
                return;
            }

            setCourseTitle(data.course_title);
            setCourseCode(data.course_code);

            const sorted = [...data.course_outcomes].sort((a, b) => a.order_index - b.order_index);
            setOutcomes(sorted.map(co => ({
                id: crypto.randomUUID(),
                dbId: co.id,
                description: co.description,
                modules: [...co.module_outcomes]
                    .sort((a, b) => a.order_index - b.order_index)
                    .map(mo => ({
                        id: crypto.randomUUID(),
                        dbId: mo.id,
                        description: mo.description,
                    })),
            })));

            setIsLoadingSubject(false);
        });
    }, [subjectId]);

    const goBack = () => navigate(isEditMode && subjectId ? `/professor/subjects/${subjectId}/overview` : '/professor/subjects');

    const addCourseOutcome = () => {
        setOutcomes([...outcomes, { id: crypto.randomUUID(), description: '', modules: [{ id: crypto.randomUUID(), description: '' }] }]);
    };

    const requestRemoveCourseOutcome = async (coId: string) => {
        if (outcomes.length <= 1) return;
        const co = outcomes.find(c => c.id === coId);
        if (isEditMode && co?.dbId) {
            setPendingRemoveLoading(true);
            const count = await countQuestionsByCourseOutcome(co.dbId);
            setPendingRemoveLoading(false);
            if (count > 0) {
                setPendingRemoveCount(count);
                setPendingRemove({ type: 'co', coId });
                return;
            }
        }
        setOutcomes(outcomes.filter(c => c.id !== coId));
    };

    const requestRemoveModuleOutcome = async (coId: string, moId: string) => {
        const co = outcomes.find(c => c.id === coId);
        if (!co || co.modules.length <= 1) return;
        const mo = co.modules.find(m => m.id === moId);
        if (isEditMode && mo?.dbId) {
            setPendingRemoveLoading(true);
            const count = await countQuestionsByModuleOutcome(mo.dbId);
            setPendingRemoveLoading(false);
            if (count > 0) {
                setPendingRemoveCount(count);
                setPendingRemove({ type: 'mo', coId, moId });
                return;
            }
        }
        setOutcomes(outcomes.map(c => {
            if (c.id !== coId) return c;
            return { ...c, modules: c.modules.filter(m => m.id !== moId) };
        }));
    };

    const confirmPendingRemove = () => {
        if (!pendingRemove) return;
        if (pendingRemove.type === 'co') {
            setOutcomes(outcomes.filter(c => c.id !== pendingRemove.coId));
        } else {
            setOutcomes(outcomes.map(c => {
                if (c.id !== pendingRemove.coId) return c;
                return { ...c, modules: c.modules.filter(m => m.id !== pendingRemove.moId) };
            }));
        }
        setPendingRemove(null);
    };

    const addModuleOutcome = (coId: string) => {
        setOutcomes(outcomes.map(co => {
            if (co.id === coId) {
                return { ...co, modules: [...co.modules, { id: crypto.randomUUID(), description: '' }] };
            }
            return co;
        }));
    };

    const updateCourseOutcomeDescription = (coId: string, description: string) => {
        setOutcomes(outcomes.map(co => co.id === coId ? { ...co, description } : co));
    };

    const updateModuleOutcomeDescription = (coId: string, moId: string, description: string) => {
        setOutcomes(outcomes.map(co => {
            if (co.id === coId) {
                return {
                    ...co,
                    modules: co.modules.map(mo => mo.id === moId ? { ...mo, description } : mo)
                };
            }
            return co;
        }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSubmitError(null);
        setDuplicateSubject(null);
        setSubmitSuccess(false);
        setIsSubmitting(true);

        const payload = outcomes.map((co, i) => ({
            title: `CO ${i + 1}`,
            description: co.description,
            modules: co.modules.map(mo => ({ description: mo.description })),
        }));

        const result = isEditMode && subjectId
            ? await updateSubject(subjectId, courseTitle, courseCode, payload)
            : await createSubject(courseTitle, courseCode, payload);

        if (result.error) {
            setSubmitError(result.error);
            if (result.duplicateSubject) setDuplicateSubject(result.duplicateSubject);
            setIsSubmitting(false);
            return;
        }

        setIsSubmitting(false);
        setSubmitSuccess(true);
    };

    if (isLoadingSubject) {
        return (
            <div className="create-subject-container">
                <div className="subjects-loading">
                    <p>Loading subject...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="create-subject-container">
            <div className="cs-header">
                <button type="button" className="btn-back" onClick={goBack}>
                    <svg fill="none" strokeWidth="2" stroke="currentColor" viewBox="0 0 24 24" width="20" height="20"><path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18"></path></svg>
                    Back to Subjects
                </button>
                <h2>{isEditMode ? 'Edit Subject' : 'Create New Subject'}</h2>
                <p>
                    {isEditMode
                        ? 'Update the course details and syllabus outcomes.'
                        : 'Set up a new course syllabus by defining its course outcomes and module outcomes.'}
                </p>
            </div>

            <form className="cs-form" onSubmit={handleSubmit}>
                <div className="cs-card">
                    <h3 className="cs-card-title">Course Information</h3>
                    <div className="cs-input-group row">
                        <div className="cs-input-field flex-2">
                            <label>Course Title</label>
                            <input
                                type="text"
                                placeholder="e.g. Introduction to Computer Science"
                                value={courseTitle}
                                onChange={e => setCourseTitle(e.target.value)}
                                required
                            />
                        </div>
                        <div className="cs-input-field flex-1">
                            <label>Course Code</label>
                            <input
                                type="text"
                                placeholder="e.g. CS101"
                                value={courseCode}
                                onChange={e => setCourseCode(e.target.value.toUpperCase())}
                                required
                            />
                        </div>
                    </div>
                </div>

                <div className="cs-syllabus-section">
                    <div className="syllabus-header">
                        <h3>Syllabus Outcomes</h3>
                    </div>

                    <div className="co-list">
                        {outcomes.map((co, coIndex) => (
                            <div key={co.id} className="co-card">
                                <div className="mo-item">
                                    <span className="co-badge">CO{coIndex + 1}</span>
                                    <textarea
                                        className="mo-textarea"
                                        placeholder="Describe what students will achieve in this course outcome..."
                                        value={co.description}
                                        onChange={e => updateCourseOutcomeDescription(co.id, e.target.value)}
                                        required
                                        rows={2}
                                    />
                                    {outcomes.length > 1 && (
                                        <button type="button" className="btn-icon danger sm" onClick={() => requestRemoveCourseOutcome(co.id)} disabled={pendingRemoveLoading} title="Remove CO">
                                            <svg fill="none" strokeWidth="2" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                                        </button>
                                    )}
                                </div>

                                <div className="mo-list">
                                    <h4 className="mo-section-title">Module Outcomes (MO)</h4>
                                    {co.modules.map((mo, moIndex) => (
                                        <div key={mo.id} className="mo-item">
                                            <span className="mo-badge">MO{coIndex + 1}{moIndex + 1}</span>
                                            <textarea
                                                className="mo-textarea"
                                                placeholder="What specific module outcome supports this course outcome?"
                                                value={mo.description}
                                                onChange={e => updateModuleOutcomeDescription(co.id, mo.id, e.target.value)}
                                                required
                                                rows={2}
                                            />
                                            {co.modules.length > 1 && (
                                                <button type="button" className="btn-icon danger sm" onClick={() => requestRemoveModuleOutcome(co.id, mo.id)} disabled={pendingRemoveLoading} title="Remove MO">
                                                    <svg fill="none" strokeWidth="2" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"></path></svg>
                                                </button>
                                            )}
                                        </div>
                                    ))}

                                    <button type="button" className="btn-text" onClick={() => addModuleOutcome(co.id)}>
                                        + Add another Module Outcome
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>

                    <div style={{ marginTop: '24px', display: 'flex', justifyContent: 'center' }}>
                        <button type="button" className="btn-secondary" onClick={addCourseOutcome} style={{ width: '100%', maxWidth: '300px' }}>
                            + Add Course Outcome (CO)
                        </button>
                    </div>
                </div>

                {submitError && (
                    <div style={{
                        background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '10px',
                        padding: '14px 16px', display: 'flex', gap: '12px', alignItems: 'flex-start',
                        marginTop: '16px',
                    }}>
                        <svg fill="none" strokeWidth="2" stroke="#ef4444" viewBox="0 0 24 24" width="20" height="20" style={{ flexShrink: 0, marginTop: '1px' }}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                        </svg>
                        <div>
                            <p style={{ margin: 0, fontWeight: 600, fontSize: '0.88rem', color: '#b91c1c' }}>{submitError}</p>
                            {duplicateSubject && (
                                <div style={{ marginTop: '8px', padding: '8px 12px', background: '#fff', border: '1px solid #fecaca', borderRadius: '7px', fontSize: '0.83rem', color: '#7f1d1d' }}>
                                    <p style={{ margin: '0 0 2px' }}><strong>Existing subject:</strong> {duplicateSubject.course_title}</p>
                                    <p style={{ margin: '0 0 2px' }}><strong>Course code:</strong> {duplicateSubject.course_code}</p>
                                    <p style={{ margin: 0 }}><strong>Created by:</strong> {duplicateSubject.creator_name}</p>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                <div className="cs-actions">
                    <button type="button" className="btn-secondary" onClick={goBack}>
                        Cancel
                    </button>
                    <button type="submit" className="btn-primary" disabled={isSubmitting}>
                        {isSubmitting ? 'Saving...' : isEditMode ? 'Update Subject' : 'Save Subject'}
                    </button>
                </div>
            </form>

            <Popup
                isOpen={submitSuccess}
                title={isEditMode ? 'Subject Updated' : 'Subject Created'}
                message={isEditMode ? 'The subject was successfully updated.' : 'The new subject was successfully created.'}
                type="success"
                onConfirm={goBack}
                confirmText={isEditMode ? 'Back to Subject' : 'Back to Subjects List'}
            />

            <Popup
                isOpen={!!pendingRemove}
                title={`Remove ${pendingRemove?.type === 'co' ? 'Course Outcome' : 'Module Outcome'}?`}
                message={`This ${pendingRemove?.type === 'co' ? 'Course Outcome' : 'Module Outcome'} has ${pendingRemoveCount} linked question${pendingRemoveCount !== 1 ? 's' : ''}. Removing it will permanently delete those questions. This cannot be undone.`}
                type="danger"
                onConfirm={confirmPendingRemove}
                onCancel={() => setPendingRemove(null)}
                confirmText="Yes, Remove"
                cancelText="Keep It"
            />
        </div>
    );
}
