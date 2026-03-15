import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import type { QuestionData } from '../../lib/question-utils';
import { mapToQuestionData } from '../../lib/question-utils';
import { fetchSubjects, fetchSubjectWithOutcomes } from '../../lib/subjects';
import type { SubjectWithCounts, SubjectWithOutcomes } from '../../lib/subjects';
import { createQuestion, updateQuestion, fetchQuestionById } from '../../lib/questions';
import { generateQuestionVariations } from '../../lib/gemini';
import type { GeneratedQuestion } from '../../lib/gemini';
import { Toast } from '../common/Toast';

function escapeHtml(str: string): string {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function renderLatex(text: string): string {
    if (!text) return '';
    const parts = text.split(/(\$\$[^$]+?\$\$)/g);
    return parts.map(part => {
        const match = part.match(/^\$\$([^$]+?)\$\$$/);
        if (match) {
            try {
                return katex.renderToString(match[1].trim(), { displayMode: false, throwOnError: false });
            } catch {
                return escapeHtml(part);
            }
        }
        return escapeHtml(part);
    }).join('');
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
    const [toastType, setToastType] = useState<'success' | 'error' | 'info'>('success');

    // AI variation generation
    const [aiEnabled, setAiEnabled] = useState(false);
    const [aiCount, setAiCount] = useState(3);
    const [isGenerating, setIsGenerating] = useState(false);
    const [generateError, setGenerateError] = useState<string | null>(null);
    const [generatedVariations, setGeneratedVariations] = useState<GeneratedQuestion[]>([]);
    const [includedVariations, setIncludedVariations] = useState<Set<number>>(new Set());
    const [showAiDisableConfirm, setShowAiDisableConfirm] = useState(false);

    const goBack = () => {
        if (subjectId) {
            navigate(`/professor/subjects/${subjectId}/question-bank`);
        } else {
            navigate('/professor/subjects');
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

        // Save included AI variations
        const toSave = generatedVariations.filter((_, i) => includedVariations.has(i));
        for (const v of toSave) {
            const { error: vErr } = await createQuestion({
                question_text: v.question_text,
                choices: v.choices,
                correct_choice: v.correct_choice,
                subject_id: selectedSubjectId,
                course_outcome_id: coId,
                module_outcome_id: moId,
            }, null);
            if (vErr) { setSubmitError(vErr); setIsSubmitting(false); return; }
        }

        setIsSubmitting(false);

        const varMsg = toSave.length > 0 ? ` ${toSave.length} variation${toSave.length !== 1 ? 's' : ''} also saved.` : '';
        setToastType('success');
        if (isEditMode) {
            setToastMessage(`Question updated successfully!${varMsg}`);
            setTimeout(() => goBack(), 1200);
        } else {
            setToastMessage(`Question added successfully!${varMsg}`);
            resetForm();
            setAiEnabled(false);
            setGeneratedVariations([]);
            setIncludedVariations(new Set());
            document.querySelector('.prof-content-scroll')?.scrollTo(0, 0);
        }
    };

    const hasExistingImage = isEditMode && initialData?.imageUrl && !removeImage && !imageFile;

    const canGenerate = questionText.trim() !== '' &&
        choices.every(c => c.trim() !== '') &&
        selectedSubjectId !== '' && coId !== '' && moId !== '';

    const handleAiToggle = (checked: boolean) => {
        if (!checked && generatedVariations.length > 0) {
            setShowAiDisableConfirm(true);
            return;
        }
        setAiEnabled(checked);
        if (!checked) setGenerateError(null);
    };

    const confirmAiDisable = () => {
        setShowAiDisableConfirm(false);
        setAiEnabled(false);
        setGeneratedVariations([]);
        setIncludedVariations(new Set());
        setGenerateError(null);
    };

    const handleGenerateVariations = async () => {
        setIsGenerating(true);
        setGenerateError(null);
        setGeneratedVariations([]);
        setIncludedVariations(new Set());
        const { data, error } = await generateQuestionVariations(questionText, choices, correctChoice, aiCount);
        setIsGenerating(false);
        if (error) { setGenerateError(error); return; }
        setGeneratedVariations(data);
        setIncludedVariations(new Set(data.map((_, i) => i)));
    };

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
                <p>Fill in the details below. Use <code>$$...$$</code> for math equations.</p>
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
                            placeholder="Type your question here... Use $$x^2$$ for math"
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

                {/* AI Variation Generation */}
                <div className="cs-card">
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <h3 className="cs-card-title" style={{ margin: 0 }}>AI Variation Generation</h3>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', userSelect: 'none' }}>
                            <span style={{ fontSize: '0.85rem', color: aiEnabled ? 'var(--prof-primary)' : 'var(--prof-text-muted)', fontWeight: 500 }}>
                                {aiEnabled ? 'On' : 'Off'}
                            </span>
                            <div style={{ position: 'relative', width: '40px', height: '22px' }}>
                                <input
                                    type="checkbox"
                                    checked={aiEnabled}
                                    onChange={e => handleAiToggle(e.target.checked)}
                                    style={{ opacity: 0, width: 0, height: 0, position: 'absolute' }}
                                />
                                <div style={{
                                    position: 'absolute', inset: 0, borderRadius: '11px',
                                    background: aiEnabled ? 'var(--prof-primary)' : '#cbd5e1',
                                    transition: 'background 0.2s',
                                }} />
                                <div style={{
                                    position: 'absolute', top: '3px',
                                    left: aiEnabled ? '21px' : '3px',
                                    width: '16px', height: '16px', borderRadius: '50%',
                                    background: '#fff', transition: 'left 0.2s',
                                    boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                                }} />
                            </div>
                        </label>
                    </div>

                    {aiEnabled && (
                        <div style={{ marginTop: '20px' }}>
                            <p style={{ fontSize: '0.88rem', color: 'var(--prof-text-muted)', marginBottom: '16px', marginTop: 0 }}>
                                Generate similar questions based on your original. All variations inherit the same Subject, CO, and MO.
                            </p>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                                <label style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--prof-text-main)', whiteSpace: 'nowrap' }}>
                                    Number of variations
                                </label>
                                <input
                                    type="number"
                                    min={1}
                                    max={5}
                                    value={aiCount}
                                    onChange={e => setAiCount(Math.min(5, Math.max(1, parseInt(e.target.value) || 1)))}
                                    style={{ width: '70px', padding: '6px 10px', borderRadius: '7px', border: '1.5px solid var(--prof-border)', fontSize: '0.9rem', background: 'var(--prof-surface)', color: 'var(--prof-text-main)', outline: 'none' }}
                                />
                                <button
                                    type="button"
                                    className="btn-primary"
                                    onClick={handleGenerateVariations}
                                    disabled={!canGenerate || isGenerating}
                                    style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
                                >
                                    {isGenerating ? (
                                        <>
                                            <svg style={{ animation: 'spin 1s linear infinite' }} fill="none" strokeWidth="2" stroke="currentColor" viewBox="0 0 24 24" width="16" height="16">
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
                                            </svg>
                                            Generating...
                                        </>
                                    ) : 'Generate Variations'}
                                </button>
                            </div>

                            {!canGenerate && (
                                <p style={{ fontSize: '0.8rem', color: 'var(--prof-text-muted)', marginBottom: '12px', marginTop: '-8px' }}>
                                    Fill in all required fields above before generating.
                                </p>
                            )}

                            {generateError && <p className="cs-error" style={{ marginBottom: '12px' }}>{generateError}</p>}

                            {generatedVariations.length > 0 && (
                                <div>
                                    <p style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--prof-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '10px' }}>
                                        Generated Variations
                                    </p>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '16px' }}>
                                        {generatedVariations.map((v, i) => {
                                            const included = includedVariations.has(i);
                                            return (
                                                <div
                                                    key={i}
                                                    onClick={() => setIncludedVariations(prev => {
                                                        const next = new Set(prev);
                                                        if (next.has(i)) next.delete(i); else next.add(i);
                                                        return next;
                                                    })}
                                                    style={{
                                                        padding: '14px 16px', borderRadius: '10px', cursor: 'pointer',
                                                        border: `2px solid ${included ? 'var(--prof-primary)' : 'var(--prof-border)'}`,
                                                        background: included ? 'rgba(15,37,84,0.03)' : 'var(--prof-surface)',
                                                        transition: 'border-color 0.15s, background 0.15s',
                                                    }}
                                                >
                                                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                                                        <div style={{
                                                            flexShrink: 0, marginTop: '2px',
                                                            width: '18px', height: '18px', borderRadius: '4px',
                                                            border: `2px solid ${included ? 'var(--prof-primary)' : '#cbd5e1'}`,
                                                            background: included ? 'var(--prof-primary)' : 'transparent',
                                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                        }}>
                                                            {included && (
                                                                <svg fill="none" strokeWidth="2.5" stroke="#fff" viewBox="0 0 24 24" width="11" height="11">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                                                                </svg>
                                                            )}
                                                        </div>
                                                        <div style={{ flex: 1 }}>
                                                            <p style={{ margin: '0 0 10px', fontSize: '0.9rem', color: 'var(--prof-text-main)', fontWeight: 500 }}>
                                                                <span style={{ color: 'var(--prof-text-muted)', fontWeight: 600, marginRight: '6px', fontSize: '0.8rem' }}>#{i + 1}</span>
                                                                {v.question_text}
                                                            </p>
                                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                                                                {v.choices.map((choice, ci) => {
                                                                    const isCorrect = ci === v.correct_choice;
                                                                    return (
                                                                        <span
                                                                            key={ci}
                                                                            style={{
                                                                                padding: '4px 10px', borderRadius: '6px', fontSize: '0.82rem',
                                                                                background: isCorrect ? 'rgba(22,163,74,0.1)' : 'var(--prof-bg)',
                                                                                color: isCorrect ? '#16a34a' : 'var(--prof-text-muted)',
                                                                                border: `1px solid ${isCorrect ? 'rgba(22,163,74,0.3)' : 'var(--prof-border)'}`,
                                                                                fontWeight: isCorrect ? 600 : 400,
                                                                            }}
                                                                        >
                                                                            {String.fromCharCode(65 + ci)}. {choice}{isCorrect ? ' ✓' : ''}
                                                                        </span>
                                                                    );
                                                                })}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                    <p style={{ fontSize: '0.8rem', color: 'var(--prof-text-muted)', marginTop: '-4px' }}>
                                        Selected variations will be saved when you click <strong>Save Question</strong>.
                                    </p>
                                </div>
                            )}
                        </div>
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
                type={toastType}
                onClose={() => setToastMessage(null)}
            />

            {showAiDisableConfirm && (
                <div className="ql-summary-overlay" onClick={() => setShowAiDisableConfirm(false)} style={{ zIndex: 2000 }}>
                    <div className="ql-summary-modal" style={{ maxWidth: '420px', borderRadius: '12px', overflow: 'hidden' }} onClick={e => e.stopPropagation()}>
                        <div className="ql-summary-header" style={{ padding: '20px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <h3 style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#ef4444', fontSize: '1.2rem', margin: 0, fontWeight: 700 }}>
                                <svg fill="none" strokeWidth="2" stroke="currentColor" viewBox="0 0 24 24" width="22" height="22">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                </svg>
                                Discard Variations?
                            </h3>
                            <button className="ql-summary-close" onClick={() => setShowAiDisableConfirm(false)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#64748b', padding: 0, display: 'flex' }}>
                                <svg fill="none" strokeWidth="2" stroke="currentColor" viewBox="0 0 24 24" width="20" height="20"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                            </button>
                        </div>
                        <div style={{ padding: '24px' }}>
                            <p style={{ fontSize: '1rem', color: '#64748b', marginTop: 0, marginBottom: '28px', lineHeight: 1.5 }}>
                                Turning off AI Variation Generation will permanently discard <strong>{generatedVariations.length} generated variation{generatedVariations.length !== 1 ? 's' : ''}</strong>. Are you sure you want to proceed?
                            </p>
                            <div style={{ display: 'flex', gap: '12px' }}>
                                <button type="button" onClick={() => setShowAiDisableConfirm(false)} style={{ flex: 1, padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1', background: '#f8fafc', color: '#0f172a', fontWeight: 600, fontSize: '0.95rem', cursor: 'pointer', transition: 'all 0.15s' }}>
                                    Keep Variations
                                </button>
                                <button type="button" onClick={confirmAiDisable} style={{ flex: 1, padding: '10px', borderRadius: '8px', border: '1px solid #ef4444', background: '#ef4444', color: '#fff', fontWeight: 600, fontSize: '0.95rem', cursor: 'pointer', transition: 'all 0.15s' }}>
                                    Discard & Turn Off
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
