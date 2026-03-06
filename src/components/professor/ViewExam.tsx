import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import katex from 'katex';
import { fetchExamById } from '../../lib/exams';
import type { ExamWithSets, ExamSetDetail } from '../../lib/exams';
import { fetchQuestionsByIds } from '../../lib/questions';
import type { QuestionSummary } from '../../lib/questions';
import { printExam } from '../../lib/printExam';
import type { PaperSize, SizeUnit } from '../../lib/printExam';
import { fetchSchoolInfo, fetchAcademicYear, fetchSemester } from '../../lib/settings';
import { deployExam, markExamDone } from '../../lib/exams';
import { DeployExamModal } from '../common/DeployExamModal';
import { MarkDoneExamModal } from '../common/MarkDoneExamModal';

function renderMathHtml(text: string): string {
    const mathPattern = /\$\$([^$]+?)\$\$/g;
    const parts: string[] = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = mathPattern.exec(text)) !== null) {
        if (match.index > lastIndex) {
            parts.push(text.slice(lastIndex, match.index).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'));
        }
        try {
            parts.push(katex.renderToString(match[1].trim(), { displayMode: false, throwOnError: false, output: 'html' }));
        } catch {
            parts.push(match[0]);
        }
        lastIndex = match.index + match[0].length;
    }
    if (lastIndex < text.length) {
        parts.push(text.slice(lastIndex).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'));
    }
    return parts.join('');
}

const SET_LABELS = ['A', 'B', 'C', 'D', 'E'];
const CHOICE_LABELS = ['A', 'B', 'C', 'D'];
const ITEMS_PER_PAGE = 20;
const PAPER_SIZES: { value: PaperSize; label: string; desc: string }[] = [
    { value: 'A4', label: 'A4', desc: '210 × 297 mm' },
    { value: 'Letter', label: 'Letter', desc: '8.5 × 11 in' },
    { value: 'Legal', label: 'Legal', desc: '8.5 × 14 in' },
    { value: 'Long', label: 'Long', desc: '8.5 × 13 in' },
    { value: 'Custom', label: 'Custom', desc: 'Enter your own size' },
];
const SIZE_UNITS: { value: SizeUnit; label: string }[] = [
    { value: 'in', label: 'Inches (in)' },
    { value: 'cm', label: 'Centimeters (cm)' },
    { value: 'mm', label: 'Millimeters (mm)' },
];

export function ViewExam() {
    const { examId } = useParams<{ examId: string }>();
    const navigate = useNavigate();
    const [exam, setExam] = useState<ExamWithSets | null>(null);
    const [questionMap, setQuestionMap] = useState<Record<string, QuestionSummary>>({});
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [activeSet, setActiveSet] = useState(0);
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [currentPage, setCurrentPage] = useState(0);
    const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
    const [isDeployConfirmOpen, setIsDeployConfirmOpen] = useState(false);
    const [isDeploying, setIsDeploying] = useState(false);
    const [isDoneConfirmOpen, setIsDoneConfirmOpen] = useState(false);
    const [isMarkingDone, setIsMarkingDone] = useState(false);
    const [paperSize, setPaperSize] = useState<PaperSize>('A4');
    const [customWidth, setCustomWidth] = useState('');
    const [customHeight, setCustomHeight] = useState('');
    const [customUnit, setCustomUnit] = useState<SizeUnit>('in');
    const [schoolName, setSchoolName] = useState('');
    const [schoolLogoUrl, setSchoolLogoUrl] = useState<string | null>(null);
    const [academicYear, setAcademicYear] = useState('');
    const [semester, setSemester] = useState('');
    const [shuffledMap, setShuffledMap] = useState<Record<number, string[]>>({});

    useEffect(() => {
        fetchSchoolInfo().then(({ name, logoUrl }) => {
            if (name) setSchoolName(name);
            setSchoolLogoUrl(logoUrl);
        });
        fetchAcademicYear().then(({ value }) => { if (value) setAcademicYear(value); });
        fetchSemester().then(({ value }) => { if (value) setSemester(value); });
    }, []);

    useEffect(() => {
        if (!examId) return;
        fetchExamById(examId).then(({ data, error }) => {
            if (error || !data) {
                setError('Failed to load exam.');
                setIsLoading(false);
                return;
            }
            setExam(data);

            const allIds = [...new Set(data.exam_sets.flatMap(s => s.question_ids))];
            fetchQuestionsByIds(allIds).then(({ data: questions }) => {
                const map: Record<string, QuestionSummary> = {};
                questions.forEach(q => { map[q.id] = q; });
                setQuestionMap(map);
                setIsLoading(false);
            });
        });
    }, [examId]);

    // Reset page and expanded item when switching sets
    useEffect(() => {
        setCurrentPage(0);
        setExpandedId(null);
    }, [activeSet]);

    if (isLoading) {
        return (
            <div className="qb-container create-question-wrapper">
                <p className="settings-loading-row">Loading exam...</p>
            </div>
        );
    }

    if (error || !exam) {
        return (
            <div className="qb-container create-question-wrapper">
                <p className="cs-error">{error || 'Exam not found.'}</p>
                <button className="btn-secondary" onClick={() => navigate('/professor/exams')} style={{ marginTop: '12px' }}>
                    Back to Exams
                </button>
            </div>
        );
    }

    const subjectTags = exam.exam_subjects.filter(s => s.subjects);
    const alloc = exam.question_allocation;
    const isIncomplete = exam.status === 'draft' && (exam.exam_subjects.length === 0 || exam.exam_sets.length === 0);
    const sortedSets: ExamSetDetail[] = [...(exam.exam_sets || [])].sort((a, b) => a.set_number - b.set_number);
    const currentSet = sortedSets[activeSet];
    const orderedIds = currentSet ? (shuffledMap[activeSet] ?? currentSet.question_ids) : [];
    const currentQuestions = orderedIds.map(id => questionMap[id]).filter(Boolean) as QuestionSummary[];

    const totalPages = Math.ceil(currentQuestions.length / ITEMS_PER_PAGE);
    const pagedQuestions = currentQuestions.slice(currentPage * ITEMS_PER_PAGE, (currentPage + 1) * ITEMS_PER_PAGE);

    const customWidthNum = parseFloat(customWidth);
    const customHeightNum = parseFloat(customHeight);
    const isCustomValid = paperSize !== 'Custom' || (
        !isNaN(customWidthNum) && customWidthNum > 0 &&
        !isNaN(customHeightNum) && customHeightNum > 0
    );

    const handleRearrange = () => {
        if (!currentSet) return;
        const ids = [...(shuffledMap[activeSet] ?? currentSet.question_ids)];
        for (let i = ids.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [ids[i], ids[j]] = [ids[j], ids[i]];
        }
        setShuffledMap(prev => ({ ...prev, [activeSet]: ids }));
        setCurrentPage(0);
        setExpandedId(null);
    };

    const handlePrint = () => {
        if (!exam) return;
        printExam({
            title: exam.title,
            code: exam.code,
            schoolName: schoolName || undefined,
            schoolLogoUrl,
            academicYear: academicYear || undefined,
            semester: semester || undefined,
            subjects: subjectTags.map(s => s.subjects!),
            setLabel: SET_LABELS[activeSet] ?? String(activeSet + 1),
            questions: currentQuestions.map(q => ({
                question_text: q.question_text,
                choices: q.choices,
                image_url: q.image_url,
                mo_label: q.module_outcomes
                    ? `${(q.course_outcomes?.order_index ?? 0) + 1}${q.module_outcomes.order_index + 1}`
                    : null,
            })),
            paperSize,
            customWidth: customWidthNum || undefined,
            customHeight: customHeightNum || undefined,
            customUnit,
        });
    };

    const handleDeploy = async () => {
        if (!exam) return;
        setIsDeploying(true);
        const { error } = await deployExam(exam.id);
        setIsDeploying(false);
        if (error) {
            alert(`Failed to deploy exam: ${error}`);
            return;
        }
        setExam(prev => prev ? { ...prev, status: 'deployed' as const } : prev);
        setIsDeployConfirmOpen(false);
    };

    const handleMarkDone = async () => {
        if (!exam) return;
        setIsMarkingDone(true);
        const { error } = await markExamDone(exam.id);
        setIsMarkingDone(false);
        if (error) {
            alert(`Failed to mark as done: ${error}`);
            return;
        }
        setExam(prev => prev ? { ...prev, status: 'done' as const } : prev);
        setIsDoneConfirmOpen(false);
    };

    return (
        <div className="qb-container create-question-wrapper">
            <button type="button" className="btn-back" onClick={() => navigate('/professor/exams')}>
                <svg fill="none" strokeWidth="2" stroke="currentColor" viewBox="0 0 24 24" width="20" height="20">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18"></path>
                </svg>
                Back to Exams
            </button>

            {/* Header */}
            <div className="cs-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
                <div>
                    <h2>{exam.title}</h2>
                    <p style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
                        <span className="subject-code" style={{ marginBottom: 0 }}>{exam.code}</span>
                        <span className="exam-sets-badge">{exam.num_sets} Set{exam.num_sets !== 1 ? 's' : ''}</span>
                        {subjectTags.map(s => (
                            <span key={s.subject_id} className="ve-hide-mobile" style={{ background: '#f1f5f9', padding: '2px 8px', borderRadius: '12px', fontSize: '12px', color: '#475569', border: '1px solid #e2e8f0' }}>
                                {s.subjects!.course_code} — {s.subjects!.course_title}
                            </span>
                        ))}
                    </p>
                </div>

                {/* Status badge / action buttons */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    {exam.status === 'done' ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '8px 16px', borderRadius: '8px', fontSize: '0.9rem', fontWeight: 600, background: '#eff6ff', color: '#2563eb', border: '1px solid #93c5fd', boxShadow: '0 2px 4px rgba(37,99,235,0.08)' }}>
                            <svg fill="currentColor" viewBox="0 0 20 20" width="16" height="16"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" /></svg>
                            Exam Done
                        </span>
                    ) : exam.status === 'deployed' ? (
                        <>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '8px 16px', borderRadius: '8px', fontSize: '0.9rem', fontWeight: 600, background: '#dcfce7', color: '#16a34a', border: '1px solid #86efac', boxShadow: '0 2px 4px rgba(22,163,74,0.1)' }}>
                                <svg fill="currentColor" viewBox="0 0 20 20" width="16" height="16"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" /></svg>
                                Deployed
                            </span>
                            <button className="btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#2563eb', borderColor: '#93c5fd', padding: '8px 18px', fontSize: '0.9rem', fontWeight: 600, borderRadius: '8px' }} onClick={() => setIsDoneConfirmOpen(true)}>
                                <svg fill="none" strokeWidth="2" stroke="currentColor" viewBox="0 0 24 24" width="18" height="18"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                Mark as Done
                            </button>
                        </>
                    ) : isIncomplete ? (
                        <>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '8px 16px', borderRadius: '8px', fontSize: '0.9rem', fontWeight: 600, background: '#fff7ed', color: '#c2410c', border: '1px solid #fed7aa', boxShadow: '0 2px 4px rgba(194,65,12,0.08)' }}>
                                <svg fill="currentColor" viewBox="0 0 20 20" width="16" height="16"><path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" /></svg>
                                Incomplete
                            </span>
                            <button className="btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 18px', fontSize: '0.9rem', fontWeight: 600, borderRadius: '8px' }} onClick={() => navigate(`/professor/exams/${exam.id}/edit`)}>
                                <svg fill="none" strokeWidth="2" stroke="currentColor" viewBox="0 0 24 24" width="18" height="18"><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" /></svg>
                                Add Details
                            </button>
                        </>
                    ) : (
                        <button className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#16a34a', borderColor: '#16a34a', padding: '8px 18px', fontSize: '0.9rem', fontWeight: 600, borderRadius: '8px', boxShadow: '0 2px 8px rgba(22,163,74,0.2)' }} onClick={() => setIsDeployConfirmOpen(true)}>
                            <svg fill="none" strokeWidth="2" stroke="currentColor" viewBox="0 0 24 24" width="18" height="18"><path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.125A59.769 59.769 0 0121.485 12 59.768 59.768 0 013.27 20.875L5.999 12zm0 0h7.5"></path></svg>
                            Deploy Exam
                        </button>
                    )}
                </div>
            </div>

            {/* Allocation info */}
            <div className="cs-card" style={{ marginBottom: '16px' }}>
                <h3 className="cs-card-title">Question Allocation</h3>
                <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--prof-text-muted)' }}>
                    Mode: <strong>{alloc.mode === 'equal' ? 'Equal distribution' : 'Custom per subject'}</strong>
                    {alloc.mode === 'equal' && alloc.total && (
                        <> — {alloc.total} total questions, divided equally across {exam.exam_subjects.length} subject{exam.exam_subjects.length !== 1 ? 's' : ''}</>
                    )}
                </p>
            </div>

            {/* Set tabs */}
            {sortedSets.length === 0 ? (
                <div className="cs-card">
                    <p className="settings-empty">No sets found for this exam.</p>
                </div>
            ) : (
                <div className="cs-card">
                    <div className="exam-set-tabs">
                        {sortedSets.map((set, idx) => (
                            <button
                                key={set.id}
                                className={`exam-set-tab-btn ${idx === activeSet ? 'active' : ''}`}
                                onClick={() => setActiveSet(idx)}
                            >
                                Set {SET_LABELS[idx] ?? set.set_number}
                                <span className="exam-set-tab-count">{set.question_ids.length}q</span>
                            </button>
                        ))}
                    </div>

                    {/* Question count + page info + Print button */}
                    {currentQuestions.length > 0 && (
                        <div className="ve-action-bar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', fontSize: '0.85rem', color: 'var(--prof-text-muted)' }}>
                            <span className="ve-hide-mobile">{currentQuestions.length} question{currentQuestions.length !== 1 ? 's' : ''}</span>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                {totalPages > 1 && (
                                    <span className="ve-hide-mobile" style={{ marginRight: '8px', fontWeight: 500 }}>Page {currentPage + 1} of {totalPages}</span>
                                )}
                                <button
                                    className="btn-secondary"
                                    style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 16px', fontSize: '0.85rem', fontWeight: 600, borderRadius: '8px', boxShadow: '0 1px 2px rgba(0,0,0,0.05)', ...(exam.status !== 'draft' ? { opacity: 0.4, cursor: 'not-allowed' } : {}) }}
                                    disabled={exam.status !== 'draft'}
                                    onClick={handleRearrange}
                                >
                                    <svg fill="none" strokeWidth="2" stroke="currentColor" viewBox="0 0 24 24" width="16" height="16">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
                                    </svg>
                                    Re-arrange
                                </button>
                                <button
                                    className="btn-primary"
                                    style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 16px', fontSize: '0.85rem', fontWeight: 600, borderRadius: '8px', boxShadow: '0 2px 4px rgba(15, 37, 84, 0.1)' }}
                                    onClick={() => setIsPrintModalOpen(true)}
                                >
                                    <svg fill="none" strokeWidth="2" stroke="currentColor" viewBox="0 0 24 24" width="16" height="16">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0110.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03.48.062.72.096m-.72-.096L17.66 18m0 0l.229 2.523a1.125 1.125 0 01-1.12 1.227H7.231c-.662 0-1.18-.568-1.12-1.227L6.34 18m11.318 0h1.091A2.25 2.25 0 0021 15.75V9.456c0-1.081-.768-2.015-1.837-2.175a48.055 48.055 0 00-1.913-.247M6.34 18H5.25A2.25 2.25 0 013 15.75V9.456c0-1.081.768-2.015 1.837-2.175a48.041 48.041 0 011.913-.247m10.5 0a48.536 48.536 0 00-10.5 0m10.5 0V3.375c0-.621-.504-1.125-1.125-1.125h-8.25c-.621 0-1.125.504-1.125 1.125v3.659M18 10.5h.008v.008H18V10.5zm-3 0h.008v.008H15V10.5z" />
                                    </svg>
                                    Print Exam
                                </button>
                            </div>
                        </div>
                    )}

                    <div className="exam-set-questions-list">
                        {pagedQuestions.length === 0 ? (
                            <p className="settings-empty">No questions in this set.</p>
                        ) : (
                            pagedQuestions.map((q, idx) => {
                                const globalIdx = currentPage * ITEMS_PER_PAGE + idx;
                                const isExpanded = expandedId === q.id;

                                return (
                                    <div
                                        key={q.id}
                                        className="exam-set-question-item"
                                        style={{ cursor: 'pointer', flexDirection: 'column', gap: 0, userSelect: 'none' }}
                                        onClick={() => setExpandedId(isExpanded ? null : q.id)}
                                    >
                                        {/* Question header row */}
                                        <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                                            <span className="exam-q-number">{globalIdx + 1}.</span>
                                            <div className="exam-q-body" style={{ flex: 1 }}>
                                                <p className="exam-q-text" style={{ marginBottom: '4px' }}
                                                    dangerouslySetInnerHTML={{ __html: renderMathHtml(q.question_text) }}
                                                />
                                                <div className="exam-q-meta">
                                                    {q.course_outcomes && (
                                                        <span className="exam-q-tag co">{q.course_outcomes.title}</span>
                                                    )}
                                                    {q.module_outcomes && (
                                                        <span className="exam-q-tag mo">MO{(q.course_outcomes?.order_index ?? 0) + 1}{q.module_outcomes.order_index + 1}</span>
                                                    )}
                                                </div>
                                            </div>
                                            {/* Chevron */}
                                            <svg
                                                fill="none" strokeWidth="2" stroke="currentColor" viewBox="0 0 24 24"
                                                width="16" height="16"
                                                style={{ flexShrink: 0, marginTop: '2px', color: 'var(--prof-text-muted)', transform: isExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}
                                            >
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                                            </svg>
                                        </div>

                                        {/* Expanded details */}
                                        {isExpanded && (
                                            <div style={{ marginLeft: '28px', marginTop: '14px', borderTop: '1px solid var(--prof-border)', paddingTop: '14px' }} onClick={e => e.stopPropagation()}>
                                                {/* Image */}
                                                {q.image_url && (
                                                    <img
                                                        src={q.image_url}
                                                        alt="Question attachment"
                                                        style={{ maxWidth: '100%', maxHeight: '320px', objectFit: 'contain', borderRadius: '6px', marginBottom: '14px', display: 'block', border: '1px solid var(--prof-border)' }}
                                                    />
                                                )}

                                                {/* Choices */}
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                                    {q.choices.map((choice, ci) => {
                                                        const isCorrect = ci === q.correct_choice;
                                                        return (
                                                            <div
                                                                key={ci}
                                                                style={{
                                                                    display: 'flex',
                                                                    alignItems: 'center',
                                                                    gap: '10px',
                                                                    padding: '9px 14px',
                                                                    borderRadius: '8px',
                                                                    background: isCorrect ? '#dcfce7' : 'var(--prof-surface)',
                                                                    border: `1px solid ${isCorrect ? '#86efac' : 'var(--prof-border)'}`,
                                                                }}
                                                            >
                                                                <span style={{ fontWeight: 700, minWidth: '22px', color: isCorrect ? '#16a34a' : 'var(--prof-text-muted)', fontSize: '0.85rem' }}>
                                                                    {CHOICE_LABELS[ci]}.
                                                                </span>
                                                                <span style={{ flex: 1, color: isCorrect ? '#15803d' : 'var(--prof-text-main)', fontSize: '0.9rem' }}
                                                                    dangerouslySetInnerHTML={{ __html: renderMathHtml(choice) }}
                                                                />
                                                                {isCorrect && (
                                                                    <span style={{ fontSize: '12px', fontWeight: 600, color: '#16a34a', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                                        <svg fill="none" strokeWidth="2.5" stroke="currentColor" viewBox="0 0 24 24" width="14" height="14">
                                                                            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                                                                        </svg>
                                                                        Correct
                                                                    </span>
                                                                )}
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                );
                            })
                        )}
                    </div>

                    {/* Pagination */}
                    {totalPages > 1 && (
                        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '12px', marginTop: '20px', paddingTop: '16px', borderTop: '1px solid var(--prof-border)' }}>
                            <button
                                className="btn-secondary"
                                style={{ padding: '7px 18px' }}
                                disabled={currentPage === 0}
                                onClick={() => { setCurrentPage(p => p - 1); setExpandedId(null); document.querySelector('.prof-content-scroll')?.scrollTo(0, 0); }}
                            >
                                Previous
                            </button>
                            <span style={{ fontSize: '14px', color: 'var(--prof-text-muted)', minWidth: '100px', textAlign: 'center' }}>
                                Page {currentPage + 1} of {totalPages}
                            </span>
                            <button
                                className="btn-secondary"
                                style={{ padding: '7px 18px' }}
                                disabled={currentPage >= totalPages - 1}
                                onClick={() => { setCurrentPage(p => p + 1); setExpandedId(null); document.querySelector('.prof-content-scroll')?.scrollTo(0, 0); }}
                            >
                                Next
                            </button>
                        </div>
                    )}
                </div>
            )}

            <div className="cs-actions">
                <button className="btn-secondary" onClick={() => navigate('/professor/exams')}>
                    Back
                </button>

                <button
                    className="btn-secondary"
                    style={{ display: 'flex', alignItems: 'center', gap: '7px' }}
                    onClick={() => navigate(`/professor/exams/${exam.id}/students`)}
                >
                    <svg fill="none" strokeWidth="2" stroke="currentColor" viewBox="0 0 24 24" width="16" height="16">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
                    </svg>
                    Manage Students
                </button>

                <button className="btn-primary" disabled={exam.status !== 'draft'} style={exam.status !== 'draft' ? { opacity: 0.4, cursor: 'not-allowed' } : {}} onClick={() => exam.status === 'draft' && navigate(`/professor/exams/${exam.id}/edit`)}>
                    Edit Exam
                </button>
            </div>

            <DeployExamModal
                isOpen={isDeployConfirmOpen}
                examTitle={exam.title}
                isDeploying={isDeploying}
                onClose={() => setIsDeployConfirmOpen(false)}
                onConfirm={handleDeploy}
            />

            <MarkDoneExamModal
                isOpen={isDoneConfirmOpen}
                examTitle={exam.title}
                isMarkingDone={isMarkingDone}
                onClose={() => setIsDoneConfirmOpen(false)}
                onConfirm={handleMarkDone}
            />

            {/* Print paper size modal */}
            {isPrintModalOpen && (
                <div className="ql-summary-overlay" onClick={() => setIsPrintModalOpen(false)} style={{ zIndex: 2000 }}>
                    <div className="ql-summary-modal" style={{ maxWidth: '440px' }} onClick={e => e.stopPropagation()}>
                        <div className="ql-summary-header" style={{ padding: '20px 24px' }}>
                            <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--prof-text-main)', fontSize: '1.1rem' }}>
                                <svg fill="none" strokeWidth="2" stroke="currentColor" viewBox="0 0 24 24" width="20" height="20" style={{ color: 'var(--prof-primary)' }}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0110.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03.48.062.72.096m-.72-.096L17.66 18m0 0l.229 2.523a1.125 1.125 0 01-1.12 1.227H7.231c-.662 0-1.18-.568-1.12-1.227L6.34 18m11.318 0h1.091A2.25 2.25 0 0021 15.75V9.456c0-1.081-.768-2.015-1.837-2.175a48.055 48.055 0 00-1.913-.247M6.34 18H5.25A2.25 2.25 0 013 15.75V9.456c0-1.081.768-2.015 1.837-2.175a48.041 48.041 0 011.913-.247m10.5 0a48.536 48.536 0 00-10.5 0m10.5 0V3.375c0-.621-.504-1.125-1.125-1.125h-8.25c-.621 0-1.125.504-1.125 1.125v3.659M18 10.5h.008v.008H18V10.5zm-3 0h.008v.008H15V10.5z" />
                                </svg>
                                Print Exam — Set {SET_LABELS[activeSet] ?? activeSet + 1}
                            </h3>
                            <button className="ql-summary-close" onClick={() => setIsPrintModalOpen(false)}>
                                <svg fill="none" strokeWidth="2" stroke="currentColor" viewBox="0 0 24 24" width="18" height="18"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"></path></svg>
                            </button>
                        </div>

                        <div style={{ padding: '24px' }}>
                            <p style={{ fontSize: '0.95rem', color: 'var(--prof-text-muted)', marginBottom: '20px', marginTop: 0 }}>
                                Select your preferred paper size. The exam will be generated as a printable document.
                            </p>

                            {/* 2×2 grid for standard sizes */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
                                {PAPER_SIZES.filter(p => p.value !== 'Custom').map(({ value, label, desc }) => {
                                    const isSelected = paperSize === value;
                                    return (
                                        <label
                                            key={value}
                                            style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                padding: '12px 14px',
                                                borderRadius: '10px',
                                                border: `2px solid ${isSelected ? 'var(--prof-primary)' : 'var(--prof-border)'}`,
                                                backgroundColor: isSelected ? 'rgba(15, 37, 84, 0.04)' : 'var(--prof-surface)',
                                                cursor: 'pointer',
                                                transition: 'all 0.2s ease',
                                                boxShadow: isSelected ? '0 4px 12px rgba(15, 37, 84, 0.08)' : 'none'
                                            }}
                                        >
                                            <div style={{
                                                position: 'relative',
                                                width: '20px', height: '20px', borderRadius: '50%',
                                                border: `2px solid ${isSelected ? 'var(--prof-primary)' : '#cbd5e1'}`,
                                                marginRight: '12px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', boxSizing: 'border-box'
                                            }}>
                                                {isSelected && <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: '10px', height: '10px', borderRadius: '50%', backgroundColor: 'var(--prof-primary)' }} />}
                                            </div>
                                            <input type="radio" name="paper-size" value={value} checked={isSelected} onChange={() => setPaperSize(value)} style={{ display: 'none' }} />
                                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                                                <span style={{ fontWeight: 600, fontSize: '0.9rem', color: isSelected ? 'var(--prof-primary)' : 'var(--prof-text-main)' }}>{label}</span>
                                                <span style={{ fontSize: '0.75rem', color: 'var(--prof-text-muted)', marginTop: '1px' }}>{desc}</span>
                                            </div>
                                        </label>
                                    );
                                })}
                            </div>

                            {/* Custom — full width at the bottom */}
                            {(() => {
                                const { value, label, desc } = PAPER_SIZES.find(p => p.value === 'Custom')!;
                                const isSelected = paperSize === value;
                                return (
                                    <div>
                                        <label
                                            style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                padding: '12px 14px',
                                                borderRadius: '10px',
                                                border: `2px solid ${isSelected ? 'var(--prof-primary)' : 'var(--prof-border)'}`,
                                                backgroundColor: isSelected ? 'rgba(15, 37, 84, 0.04)' : 'var(--prof-surface)',
                                                cursor: 'pointer',
                                                transition: 'all 0.2s ease',
                                                boxShadow: isSelected ? '0 4px 12px rgba(15, 37, 84, 0.08)' : 'none'
                                            }}
                                        >
                                            <div style={{
                                                width: '18px', height: '18px', borderRadius: '50%',
                                                border: `2px solid ${isSelected ? 'var(--prof-primary)' : '#cbd5e1'}`,
                                                marginRight: '10px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center'
                                            }}>
                                                {isSelected && <div style={{ width: '9px', height: '9px', borderRadius: '50%', backgroundColor: 'var(--prof-primary)' }} />}
                                            </div>
                                            <input type="radio" name="paper-size" value={value} checked={isSelected} onChange={() => setPaperSize(value)} style={{ display: 'none' }} />
                                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                                                <span style={{ fontWeight: 600, fontSize: '0.9rem', color: isSelected ? 'var(--prof-primary)' : 'var(--prof-text-main)' }}>{label}</span>
                                                <span style={{ fontSize: '0.75rem', color: 'var(--prof-text-muted)', marginTop: '1px' }}>{desc}</span>
                                            </div>
                                        </label>

                                        {/* Custom size inputs — shown only when Custom is selected */}
                                        {isSelected && (
                                            <div style={{ marginTop: '10px', padding: '16px', background: 'var(--prof-bg)', borderRadius: '8px', border: '1px solid var(--prof-border)' }}>
                                                {/* Unit selector */}
                                                <p style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--prof-text-muted)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Unit</p>
                                                <div style={{ display: 'flex', gap: '8px', marginBottom: '14px' }}>
                                                    {SIZE_UNITS.map(u => (
                                                        <button
                                                            key={u.value}
                                                            type="button"
                                                            onClick={() => setCustomUnit(u.value)}
                                                            style={{
                                                                padding: '6px 14px',
                                                                borderRadius: '6px',
                                                                fontSize: '0.85rem',
                                                                fontWeight: customUnit === u.value ? 600 : 400,
                                                                border: `1.5px solid ${customUnit === u.value ? 'var(--prof-primary)' : 'var(--prof-border)'}`,
                                                                background: customUnit === u.value ? 'rgba(15,37,84,0.06)' : 'var(--prof-surface)',
                                                                color: customUnit === u.value ? 'var(--prof-primary)' : 'var(--prof-text-muted)',
                                                                cursor: 'pointer',
                                                            }}
                                                        >
                                                            {u.label}
                                                        </button>
                                                    ))}
                                                </div>

                                                {/* Width + Height */}
                                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                                                    <div>
                                                        <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--prof-text-muted)', marginBottom: '5px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                                            Width
                                                        </label>
                                                        <div style={{ display: 'flex', alignItems: 'center', border: '1.5px solid var(--prof-border)', borderRadius: '7px', overflow: 'hidden', background: 'var(--prof-surface)' }}>
                                                            <input
                                                                type="number"
                                                                min="1"
                                                                step="0.1"
                                                                placeholder="e.g. 8.5"
                                                                value={customWidth}
                                                                onChange={e => setCustomWidth(e.target.value)}
                                                                style={{ flex: 1, border: 'none', outline: 'none', padding: '8px 10px', fontSize: '0.9rem', background: 'transparent', color: 'var(--prof-text-main)' }}
                                                            />
                                                            <span style={{ padding: '0 10px', fontSize: '0.8rem', color: 'var(--prof-text-muted)', borderLeft: '1px solid var(--prof-border)' }}>{customUnit}</span>
                                                        </div>
                                                    </div>
                                                    <div>
                                                        <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--prof-text-muted)', marginBottom: '5px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                                            Height
                                                        </label>
                                                        <div style={{ display: 'flex', alignItems: 'center', border: '1.5px solid var(--prof-border)', borderRadius: '7px', overflow: 'hidden', background: 'var(--prof-surface)' }}>
                                                            <input
                                                                type="number"
                                                                min="1"
                                                                step="0.1"
                                                                placeholder="e.g. 13"
                                                                value={customHeight}
                                                                onChange={e => setCustomHeight(e.target.value)}
                                                                style={{ flex: 1, border: 'none', outline: 'none', padding: '8px 10px', fontSize: '0.9rem', background: 'transparent', color: 'var(--prof-text-main)' }}
                                                            />
                                                            <span style={{ padding: '0 10px', fontSize: '0.8rem', color: 'var(--prof-text-muted)', borderLeft: '1px solid var(--prof-border)' }}>{customUnit}</span>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                );
                            })()}

                            <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
                                <button className="btn-secondary" style={{ flex: 1, padding: '12px' }} onClick={() => setIsPrintModalOpen(false)}>
                                    Cancel
                                </button>
                                <button className="btn-primary" style={{ flex: 1, padding: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }} disabled={!isCustomValid} onClick={() => { setIsPrintModalOpen(false); handlePrint(); }}>
                                    <svg fill="none" strokeWidth="2" stroke="currentColor" viewBox="0 0 24 24" width="18" height="18">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m3.75 9v6m3-3H9m1.5-12H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                                    </svg>
                                    Generate PDF
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
