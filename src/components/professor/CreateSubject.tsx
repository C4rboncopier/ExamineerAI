import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { createSubject, updateSubject, fetchSubjectWithOutcomes } from '../../lib/subjects';
import { Popup } from '../common/Popup';

interface ModuleOutcome {
    id: string;
    description: string;
}

interface CourseOutcome {
    id: string;
    modules: ModuleOutcome[];
}

const initialOutcomes = (): CourseOutcome[] => [
    { id: crypto.randomUUID(), modules: [{ id: crypto.randomUUID(), description: '' }] }
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
    const [submitSuccess, setSubmitSuccess] = useState(false);

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
                modules: [...co.module_outcomes]
                    .sort((a, b) => a.order_index - b.order_index)
                    .map(mo => ({
                        id: crypto.randomUUID(),
                        description: mo.description,
                    })),
            })));

            setIsLoadingSubject(false);
        });
    }, [subjectId]);

    const goBack = () => navigate('/professor/subjects');

    const addCourseOutcome = () => {
        setOutcomes([...outcomes, { id: crypto.randomUUID(), modules: [{ id: crypto.randomUUID(), description: '' }] }]);
    };

    const removeCourseOutcome = (coId: string) => {
        if (outcomes.length > 1) {
            setOutcomes(outcomes.filter(co => co.id !== coId));
        }
    };

    const addModuleOutcome = (coId: string) => {
        setOutcomes(outcomes.map(co => {
            if (co.id === coId) {
                return { ...co, modules: [...co.modules, { id: crypto.randomUUID(), description: '' }] };
            }
            return co;
        }));
    };

    const removeModuleOutcome = (coId: string, moId: string) => {
        setOutcomes(outcomes.map(co => {
            if (co.id === coId && co.modules.length > 1) {
                return { ...co, modules: co.modules.filter(mo => mo.id !== moId) };
            }
            return co;
        }));
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
        setSubmitSuccess(false);
        setIsSubmitting(true);

        const payload = outcomes.map((co, i) => ({
            title: `CO ${i + 1}`,
            modules: co.modules.map(mo => ({ description: mo.description })),
        }));

        const { error } = isEditMode && subjectId
            ? await updateSubject(subjectId, courseTitle, courseCode, payload)
            : await createSubject(courseTitle, courseCode, payload);

        if (error) {
            setSubmitError(error);
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
                                onChange={e => setCourseCode(e.target.value)}
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
                                <div className="co-header">
                                    <span className="co-badge">CO{coIndex + 1}</span>
                                    {outcomes.length > 1 && (
                                        <button type="button" className="btn-icon danger" onClick={() => removeCourseOutcome(co.id)} title="Remove CO">
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
                                                <button type="button" className="btn-icon danger sm" onClick={() => removeModuleOutcome(co.id, mo.id)} title="Remove MO">
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

                {submitError && <p className="cs-error">{submitError}</p>}

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
                confirmText="Back to Subjects List"
            />
        </div>
    );
}
