import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import type { QuestionData } from '../../lib/question-utils';
import { mapToQuestionData } from '../../lib/question-utils';
import { fetchSubjects, fetchSubjectWithOutcomes } from '../../lib/subjects';
import type { SubjectWithCounts, SubjectWithOutcomes } from '../../lib/subjects';
import { createQuestion, updateQuestion, fetchQuestionById } from '../../lib/questions';
import { Toast } from '../common/Toast';

function renderLatex(text: string): string {
    if (!text) return '';
    // Split on $$...$$ (block) and $...$ (inline)
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

function MathPreview({ text }: { text: string }) {
    const html = useMemo(() => renderLatex(text), [text]);
    if (!text.trim()) return null;
    return (
        <div className="math-preview">
            <span className="math-preview-label">Preview</span>
            <div className="math-preview-content" dangerouslySetInnerHTML={{ __html: html }} />
        </div>
    );
}

export function CreateQuestion() {
    const { subjectId, questionId } = useParams<{ subjectId?: string; questionId?: string }>();
    const navigate = useNavigate();

    const [isLoadingQuestion, setIsLoadingQuestion] = useState(false);
    const [initialData, setInitialData] = useState<QuestionData | null>(null);
    const isEditMode = !!questionId;

    const [subjects, setSubjects] = useState<SubjectWithCounts[]>([]);
    const [subjectSearch, setSubjectSearch] = useState('');
    const [subjectDropdownOpen, setSubjectDropdownOpen] = useState(false);
    const [selectedSubjectId, setSelectedSubjectId] = useState(subjectId || '');
    const [subjectDetails, setSubjectDetails] = useState<SubjectWithOutcomes | null>(null);

    const [questionText, setQuestionText] = useState('');
    const [choices, setChoices] = useState<string[]>(['', '', '', '']);
    const [correctChoice, setCorrectChoice] = useState<number>(0);
    const [coId, setCoId] = useState('');
    const [moId, setMoId] = useState('');
    const [imageFile, setImageFile] = useState<File | null>(null);
    const [removeImage, setRemoveImage] = useState(false);

    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submitError, setSubmitError] = useState<string | null>(null);
    const [toastMessage, setToastMessage] = useState<string | null>(null);

    const goBack = () => {
        if (subjectId) {
            navigate(`/professor/question-bank/${subjectId}`);
        } else {
            navigate('/professor/question-bank');
        }
    };

    // Fetch question data in edit mode
    useEffect(() => {
        if (!questionId) return;
        setIsLoadingQuestion(true);
        fetchQuestionById(questionId).then(({ data, error }) => {
            if (error || !data) {
                setSubmitError(error || 'Failed to load question');
                setIsLoadingQuestion(false);
                return;
            }
            const mapped = mapToQuestionData(data);
            setInitialData(mapped);
            setSelectedSubjectId(mapped.subjectId);
            setQuestionText(mapped.question);
            setChoices(mapped.choices);
            setCorrectChoice(mapped.correctChoice);
            setCoId(mapped.coId);
            setMoId(mapped.moId);
            setIsLoadingQuestion(false);
        });
    }, [questionId]);

    // Fetch subjects for dropdown
    useEffect(() => {
        fetchSubjects().then(({ data }) => setSubjects(data));
    }, []);

    // Fetch subject details when selected
    useEffect(() => {
        if (!selectedSubjectId) {
            setSubjectDetails(null);
            return;
        }
        fetchSubjectWithOutcomes(selectedSubjectId).then(({ data }) => {
            setSubjectDetails(data);
            if (data && data.course_outcomes.length > 0 && !coId) {
                setCoId(data.course_outcomes[0].id);
            }
        });
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedSubjectId]);

    // Reset MO when CO changes
    useEffect(() => {
        if (subjectDetails && coId) {
            const co = subjectDetails.course_outcomes.find(c => c.id === coId);
            if (co && co.module_outcomes.length > 0) {
                const currentMoExists = co.module_outcomes.some(m => m.id === moId);
                if (!currentMoExists) {
                    setMoId(co.module_outcomes[0].id);
                }
            } else {
                setMoId('');
            }
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [coId, subjectDetails]);

    // Reset form after successful creation (stay on page for another question)
    const resetForm = () => {
        setQuestionText('');
        setChoices(['', '', '', '']);
        setCorrectChoice(0);
        setImageFile(null);
        setRemoveImage(false);
        setSubmitError(null);
        const input = document.getElementById('q-image') as HTMLInputElement;
        if (input) input.value = '';
    };

    // Filter subjects for searchable dropdown
    const filteredSubjects = useMemo(() => {
        if (!subjectSearch.trim()) return subjects;
        const q = subjectSearch.toLowerCase().trim();
        return subjects.filter(s =>
            s.course_title.toLowerCase().includes(q) ||
            s.course_code.toLowerCase().includes(q)
        );
    }, [subjects, subjectSearch]);

    const selectedSubject = subjects.find(s => s.id === selectedSubjectId);

    const handleSelectSubject = (id: string) => {
        setSelectedSubjectId(id);
        setCoId('');
        setMoId('');
        setSubjectDropdownOpen(false);
        setSubjectSearch('');
    };

    const handleChoiceChange = (index: number, value: string) => {
        const newChoices = [...choices];
        newChoices[index] = value;
        setChoices(newChoices);
    };

    const addChoice = () => {
        if (choices.length < 5) setChoices([...choices, '']);
    };

    const removeChoice = (index: number) => {
        if (choices.length > 2) {
            const newChoices = choices.filter((_, i) => i !== index);
            setChoices(newChoices);
            if (correctChoice === index) setCorrectChoice(0);
            else if (correctChoice > index) setCorrectChoice(correctChoice - 1);
        }
    };

    const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            setImageFile(e.target.files[0]);
            setRemoveImage(false);
        }
    };

    const handleRemoveImage = () => {
        setImageFile(null);
        setRemoveImage(true);
        // Reset the file input
        const input = document.getElementById('q-image') as HTMLInputElement;
        if (input) input.value = '';
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSubmitError(null);
        setIsSubmitting(true);

        const payload = {
            question_text: questionText,
            choices,
            correct_choice: correctChoice,
            subject_id: selectedSubjectId,
            course_outcome_id: coId,
            module_outcome_id: moId,
        };

        const { error } = isEditMode && initialData
            ? await updateQuestion(initialData.id, { ...payload, remove_image: removeImage }, imageFile)
            : await createQuestion(payload, imageFile);

        if (error) {
            setSubmitError(error);
            setIsSubmitting(false);
            return;
        }

        setIsSubmitting(false);

        if (isEditMode) {
            setToastMessage('Question updated successfully!');
            setTimeout(() => goBack(), 1200);
        } else {
            setToastMessage('Question added successfully!');
            resetForm();
            document.querySelector('.prof-content-scroll')?.scrollTo(0, 0);
        }
    };

    const hasExistingImage = isEditMode && initialData?.imageUrl && !removeImage && !imageFile;

    if (isLoadingQuestion) {
        return (
            <div className="qb-container create-question-wrapper">
                <div className="subjects-loading">
                    <p>Loading question...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="qb-container create-question-wrapper">
            <button type="button" className="btn-back" onClick={goBack}>
                <svg fill="none" strokeWidth="2" stroke="currentColor" viewBox="0 0 24 24" width="20" height="20"><path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18"></path></svg>
                Back to Questions
            </button>

            <div className="cs-header">
                <h2>{isEditMode ? 'Edit Question' : 'Create New Question'}</h2>
                <p>Fill in the details below. Use <code>$...$</code> for inline math and <code>$$...$$</code> for block math.</p>
            </div>

            {submitError && <p className="cs-error">{submitError}</p>}

            <form className="cq-form" onSubmit={handleSubmit}>
                {/* Subject & Syllabus Mapping — first so it contextualizes the question */}
                <div className="cs-card">
                    <h3 className="cs-card-title">Subject & Syllabus Mapping</h3>

                    <div className="cs-input-group">
                        <div className="cs-input-field">
                            <label>Subject</label>
                            <div className="cq-subject-search">
                                <div
                                    className={`cq-subject-trigger ${subjectDropdownOpen ? 'open' : ''}`}
                                    onClick={() => setSubjectDropdownOpen(!subjectDropdownOpen)}
                                >
                                    {selectedSubject
                                        ? <span>{selectedSubject.course_code} — {selectedSubject.course_title}</span>
                                        : <span className="cq-placeholder">Select a subject...</span>
                                    }
                                    <svg fill="none" strokeWidth="2" stroke="currentColor" viewBox="0 0 24 24" width="16" height="16"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5"></path></svg>
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
                                                filteredSubjects.map(s => (
                                                    <div
                                                        key={s.id}
                                                        className={`cq-subject-option ${s.id === selectedSubjectId ? 'selected' : ''}`}
                                                        onClick={() => handleSelectSubject(s.id)}
                                                    >
                                                        <span className="cq-subject-option-code">{s.course_code}</span>
                                                        <span>{s.course_title}</span>
                                                    </div>
                                                ))
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                            {/* Hidden input for form validation */}
                            <input type="text" value={selectedSubjectId} required style={{ display: 'none' }} readOnly tabIndex={-1} />
                        </div>
                    </div>

                    <div className="cs-input-group row" style={{ marginTop: '20px' }}>
                        <div className="cs-input-field flex-1">
                            <label>Course Outcome (CO)</label>
                            <select
                                value={coId}
                                onChange={(e) => setCoId(e.target.value)}
                                required
                                disabled={!subjectDetails || subjectDetails.course_outcomes.length === 0}
                            >
                                <option value="" disabled>Select CO</option>
                                {subjectDetails?.course_outcomes
                                    .slice()
                                    .sort((a, b) => a.order_index - b.order_index)
                                    .map(co => (
                                        <option key={co.id} value={co.id}>{co.title}</option>
                                    ))}
                            </select>
                        </div>
                        <div className="cs-input-field flex-1">
                            <label>Module Outcome (MO)</label>
                            <select
                                value={moId}
                                onChange={(e) => setMoId(e.target.value)}
                                required
                                disabled={!coId || !subjectDetails}
                            >
                                <option value="" disabled>Select MO</option>
                                {subjectDetails?.course_outcomes
                                    .find(co => co.id === coId)
                                    ?.module_outcomes
                                    .slice()
                                    .sort((a, b) => a.order_index - b.order_index)
                                    .map(mo => (
                                        <option key={mo.id} value={mo.id}>
                                            MO {mo.order_index + 1} — {mo.description.length > 50 ? mo.description.substring(0, 50) + '...' : mo.description}
                                        </option>
                                    ))}
                            </select>
                        </div>
                    </div>
                </div>

                {/* Question Text */}
                <div className="cs-card">
                    <h3 className="cs-card-title">Question</h3>

                    <div className="cs-input-field">
                        <label>Question Text</label>
                        <textarea
                            placeholder="Type your question here... Use $x^2$ for inline math"
                            rows={4}
                            value={questionText}
                            onChange={(e) => setQuestionText(e.target.value)}
                            required
                        />
                        <MathPreview text={questionText} />
                    </div>

                    <div className="cs-input-field" style={{ marginTop: '20px' }}>
                        <label>Question Image (Optional)</label>
                        <div className="cq-image-upload">
                            <input type="file" id="q-image" accept="image/*" onChange={handleImageChange} className="file-input-hidden" />
                            {imageFile ? (
                                <div className="cq-image-selected">
                                    <span className="cq-image-name">{imageFile.name}</span>
                                    <button type="button" className="btn-icon danger sm" onClick={handleRemoveImage} title="Remove image">
                                        <svg fill="none" strokeWidth="2" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"></path></svg>
                                    </button>
                                </div>
                            ) : hasExistingImage ? (
                                <div className="cq-image-selected">
                                    <span className="current-image-tag">Current image attached</span>
                                    <button type="button" className="btn-icon danger sm" onClick={handleRemoveImage} title="Remove image">
                                        <svg fill="none" strokeWidth="2" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"></path></svg>
                                    </button>
                                </div>
                            ) : (
                                <label htmlFor="q-image" className="file-input-label">
                                    <svg fill="none" strokeWidth="1.5" stroke="currentColor" viewBox="0 0 24 24" className="upload-icon"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0022.5 18.75V5.25A2.25 2.25 0 0020.25 3H3.75A2.25 2.25 0 001.5 5.25v13.5A2.25 2.25 0 003.75 21z"></path></svg>
                                    Click to upload an image
                                </label>
                            )}
                        </div>
                    </div>
                </div>

                {/* Choices */}
                <div className="cs-card">
                    <h3 className="cs-card-title">Choices</h3>
                    <p className="cs-card-description">Provide 2 to 5 choices. Select the radio button for the correct answer.</p>

                    <div className="cq-choices-list">
                        {choices.map((choice, index) => (
                            <div key={index} className={`cq-choice-row ${correctChoice === index ? 'is-correct' : ''}`}>
                                <div className="cq-radio-wrapper" title="Mark as correct answer">
                                    <input
                                        type="radio"
                                        name="correct-choice"
                                        checked={correctChoice === index}
                                        onChange={() => setCorrectChoice(index)}
                                    />
                                </div>
                                <span className="cq-choice-label">{String.fromCharCode(65 + index)}.</span>
                                <div className="cq-choice-content">
                                    <input
                                        type="text"
                                        className="cq-choice-input"
                                        value={choice}
                                        onChange={(e) => handleChoiceChange(index, e.target.value)}
                                        placeholder={`Choice ${String.fromCharCode(65 + index)}`}
                                        required
                                    />
                                    <MathPreview text={choice} />
                                </div>
                                {choices.length > 2 && (
                                    <button
                                        type="button"
                                        className="btn-icon danger sm cq-remove-choice"
                                        onClick={() => removeChoice(index)}
                                        title="Remove Choice"
                                    >
                                        <svg fill="none" strokeWidth="2" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"></path></svg>
                                    </button>
                                )}
                            </div>
                        ))}
                    </div>

                    {choices.length < 5 && (
                        <button type="button" className="btn-text" onClick={addChoice}>
                            + Add another choice
                        </button>
                    )}
                </div>

                <div className="cs-actions">
                    <button type="button" className="btn-secondary" onClick={goBack}>
                        Cancel
                    </button>
                    <button type="submit" className="btn-primary" disabled={isSubmitting}>
                        {isSubmitting
                            ? (isEditMode ? 'Updating...' : 'Saving...')
                            : (isEditMode ? 'Update Question' : 'Save Question')
                        }
                    </button>
                </div>
            </form>

            <Toast
                isOpen={!!toastMessage}
                message={toastMessage || ''}
                type="success"
                onClose={() => setToastMessage(null)}
            />
        </div>
    );
}
