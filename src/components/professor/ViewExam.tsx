import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { fetchExamById } from '../../lib/exams';
import type { ExamWithSets, ExamSetDetail } from '../../lib/exams';

const SET_LABELS = ['A', 'B', 'C', 'D', 'E'];

function truncate(text: string, max = 160): string {
    return text.length > max ? text.slice(0, max) + '…' : text;
}

export function ViewExam() {
    const { examId } = useParams<{ examId: string }>();
    const navigate = useNavigate();
    const [exam, setExam] = useState<ExamWithSets | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [activeSet, setActiveSet] = useState(0);

    useEffect(() => {
        if (!examId) return;
        fetchExamById(examId).then(({ data, error }) => {
            if (error || !data) setError('Failed to load exam.');
            else setExam(data);
            setIsLoading(false);
        });
    }, [examId]);

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
    const sortedSets: ExamSetDetail[] = [...(exam.exam_sets || [])].sort((a, b) => a.set_number - b.set_number);
    const currentSet = sortedSets[activeSet];
    const sortedQuestions = currentSet
        ? [...currentSet.exam_set_questions].sort((a, b) => a.order_index - b.order_index)
        : [];

    return (
        <div className="qb-container create-question-wrapper">
            <button type="button" className="btn-back" onClick={() => navigate('/professor/exams')}>
                <svg fill="none" strokeWidth="2" stroke="currentColor" viewBox="0 0 24 24" width="20" height="20">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18"></path>
                </svg>
                Back to Exams
            </button>

            {/* Header */}
            <div className="cs-header">
                <h2>{exam.title}</h2>
                <p style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
                    <span className="subject-code" style={{ marginBottom: 0 }}>{exam.code}</span>
                    <span className="exam-sets-badge">{exam.num_sets} Set{exam.num_sets !== 1 ? 's' : ''}</span>
                    {subjectTags.map(s => (
                        <span key={s.subject_id} style={{ background: '#f1f5f9', padding: '2px 8px', borderRadius: '12px', fontSize: '12px', color: '#475569', border: '1px solid #e2e8f0' }}>
                            {s.subjects!.course_code} — {s.subjects!.course_title}
                        </span>
                    ))}
                </p>
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
                                <span className="exam-set-tab-count">{set.exam_set_questions.length}q</span>
                            </button>
                        ))}
                    </div>

                    <div className="exam-set-questions-list">
                        {sortedQuestions.length === 0 ? (
                            <p className="settings-empty">No questions in this set.</p>
                        ) : (
                            sortedQuestions.map((sq, idx) => {
                                const q = sq.questions;
                                if (!q) return null;
                                return (
                                    <div key={sq.question_id} className="exam-set-question-item">
                                        <span className="exam-q-number">{idx + 1}.</span>
                                        <div className="exam-q-body">
                                            <p className="exam-q-text">{truncate(q.question_text)}</p>
                                            <div className="exam-q-meta">
                                                {q.course_outcomes && (
                                                    <span className="exam-q-tag co">{q.course_outcomes.title}</span>
                                                )}
                                                {q.module_outcomes && (
                                                    <span className="exam-q-tag mo">{q.module_outcomes.description}</span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>
                </div>
            )}

            <div className="cs-actions">
                <button className="btn-secondary" onClick={() => navigate('/professor/exams')}>
                    Back
                </button>
                <button className="btn-primary" onClick={() => navigate(`/professor/exams/${exam.id}/edit`)}>
                    Edit Exam
                </button>
            </div>
        </div>
    );
}
