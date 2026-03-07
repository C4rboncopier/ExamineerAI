import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { fetchEnrolledExamById, fetchStudentSubmissions, getStudentExamStatus } from '../../lib/studentExams';
import type { StudentExam, StudentSubmission } from '../../lib/studentExams';

const SET_LABELS = ['A', 'B', 'C', 'D', 'E'];
const PASSING_THRESHOLD = 60; // percent

type Tab = 'gradebook' | 'analytics';

function formatDate(iso: string | null): string {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: '2-digit' });
}

function ScoreBadge({ score, total }: { score: number | null; total: number | null }) {
    if (score === null || total === null || total === 0) {
        return <span style={{ color: '#94a3b8', fontSize: '0.85rem' }}>Not graded</span>;
    }
    const pct = (score / total) * 100;
    const passing = pct >= PASSING_THRESHOLD;
    return (
        <span style={{
            display: 'inline-block',
            padding: '3px 10px',
            borderRadius: '999px',
            fontSize: '0.82rem',
            fontWeight: 700,
            background: passing ? '#dcfce7' : '#fee2e2',
            color: passing ? '#15803d' : '#b91c1c',
            border: `1px solid ${passing ? '#86efac' : '#fca5a5'}`,
        }}>
            {score} / {total}
        </span>
    );
}

function StatusDot({ submitted, score, total }: { submitted: boolean; score: number | null; total: number | null }) {
    let color = '#cbd5e1'; // grey - not submitted
    if (submitted && score !== null && total !== null && total > 0) {
        const pct = (score / total) * 100;
        color = pct >= PASSING_THRESHOLD ? '#16a34a' : '#dc2626';
    } else if (submitted) {
        color = '#94a3b8'; // submitted but not graded
    }
    return (
        <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: color, display: 'inline-block', flexShrink: 0 }} />
    );
}

export function ViewExam() {
    const { examId } = useParams<{ examId: string }>();
    const { user } = useAuth();
    const navigate = useNavigate();

    const [exam, setExam] = useState<StudentExam | null>(null);
    const [submissions, setSubmissions] = useState<StudentSubmission[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<Tab>('gradebook');

    const loadData = useCallback(async () => {
        if (!examId || !user) return;
        const [examResult, subsResult] = await Promise.all([
            fetchEnrolledExamById(examId),
            fetchStudentSubmissions(examId, user.id),
        ]);
        if (examResult.error || !examResult.data) {
            setError('Failed to load exam.');
            setIsLoading(false);
            return;
        }
        setExam(examResult.data);
        setSubmissions(subsResult.data);
        setIsLoading(false);
    }, [examId, user]);

    useEffect(() => { loadData(); }, [loadData]);

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
                <button className="btn-secondary" onClick={() => navigate('/student/exams')} style={{ marginTop: '12px' }}>
                    Back to Exams
                </button>
            </div>
        );
    }

    const examStatus = getStudentExamStatus(exam);

    if (examStatus === 'locked') {
        return (
            <div className="qb-container create-question-wrapper">
                <button type="button" className="btn-back" onClick={() => navigate('/student/exams')}>
                    <svg fill="none" strokeWidth="2" stroke="currentColor" viewBox="0 0 24 24" width="20" height="20">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
                    </svg>
                    Back to Exams
                </button>
                <div style={{ textAlign: 'center', padding: '60px 20px', backgroundColor: '#fff', borderRadius: '12px', border: '1px solid var(--prof-border)', marginTop: '24px' }}>
                    <svg fill="none" strokeWidth="1.5" stroke="currentColor" viewBox="0 0 24 24" width="48" height="48" style={{ margin: '0 auto 16px', color: '#94a3b8', display: 'block' }}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                    </svg>
                    <h3 style={{ margin: '0 0 8px', color: 'var(--prof-text-main)', fontSize: '1.1rem', fontWeight: 600 }}>Exam Locked</h3>
                    <p style={{ margin: 0, color: 'var(--prof-text-muted)', fontSize: '0.95rem' }}>This exam is currently locked by your professor.</p>
                </div>
            </div>
        );
    }

    const subjectTags = exam.exam_subjects.filter(s => s.subjects);

    // Build attempt status map
    const attemptStatusMap: Record<number, 'draft' | 'deployed' | 'done'> = {};
    exam.exam_attempts.forEach(a => { attemptStatusMap[a.attempt_number] = a.status; });

    // Build submission map
    const submissionByAttempt: Record<number, StudentSubmission> = {};
    submissions.forEach(s => { submissionByAttempt[s.attempt_number] = s; });

    // Analytics
    const gradedSubs = submissions.filter(s => s.score !== null && s.total_items !== null && s.total_items > 0);
    const scores = gradedSubs.map(s => (s.score! / s.total_items!) * 100);
    const avgScore = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : null;
    const bestScore = scores.length > 0 ? Math.max(...scores) : null;
    const latestScore = gradedSubs.length > 0 ? scores[scores.length - 1] : null;

    // Status badge for exam
    const statusStyleMap: Record<string, { color: string; bg: string; label: string }> = {
        available: { color: '#15803d', bg: '#dcfce7', label: 'Available' },
        upcoming:  { color: '#92400e', bg: '#fef3c7', label: 'Upcoming' },
        completed: { color: '#475569', bg: '#f1f5f9', label: 'Completed' },
        locked:    { color: '#92400e', bg: '#fef3c7', label: 'Locked' },
    };
    const statusStyle = statusStyleMap[examStatus] ?? statusStyleMap.locked;

    const TAB_LABELS: Record<Tab, string> = { gradebook: 'Gradebook', analytics: 'Analytics' };

    return (
        <div className="qb-container create-question-wrapper">
            <button type="button" className="btn-back" onClick={() => navigate('/student/exams')}>
                <svg fill="none" strokeWidth="2" stroke="currentColor" viewBox="0 0 24 24" width="20" height="20">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
                </svg>
                Back to Exams
            </button>

            {/* Header */}
            <div className="cs-header" style={{ marginBottom: '8px' }}>
                <div>
                    <h2 style={{ marginBottom: '6px' }}>{exam.title}</h2>
                    <p style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap', margin: 0 }}>
                        <span className="subject-code" style={{ marginBottom: 0 }}>{exam.code}</span>
                        <span style={{ fontSize: '0.85rem', color: 'var(--prof-text-muted)' }}>{exam.academic_year} · {exam.term}</span>
                        <span style={{ fontWeight: 600, fontSize: '0.8rem', color: statusStyle.color, background: statusStyle.bg, padding: '2px 10px', borderRadius: '999px' }}>
                            {statusStyle.label}
                        </span>
                    </p>
                </div>
            </div>

            {/* Subject tags */}
            {subjectTags.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '20px' }}>
                    {subjectTags.map(s => (
                        <span key={s.subject_id} style={{ background: '#f1f5f9', padding: '3px 10px', borderRadius: '12px', fontSize: '0.82rem', color: '#475569', border: '1px solid #e2e8f0' }}>
                            {s.subjects!.course_code} — {s.subjects!.course_title}
                        </span>
                    ))}
                </div>
            )}

            {/* Tab nav */}
            <div style={{ display: 'flex', borderBottom: '2px solid var(--prof-border)', marginBottom: '24px' }}>
                {(['gradebook', 'analytics'] as Tab[]).map(tab => {
                    const isActive = activeTab === tab;
                    return (
                        <button
                            key={tab}
                            onClick={() => setActiveTab(tab)}
                            style={{
                                padding: '11px 20px',
                                border: 'none',
                                background: 'none',
                                cursor: 'pointer',
                                borderBottom: `2px solid ${isActive ? 'var(--prof-primary)' : 'transparent'}`,
                                marginBottom: '-2px',
                                color: isActive ? 'var(--prof-primary)' : 'var(--prof-text-muted)',
                                fontWeight: isActive ? 700 : 500,
                                fontSize: '0.9rem',
                                transition: 'all 0.15s',
                            }}
                        >
                            {TAB_LABELS[tab]}
                        </button>
                    );
                })}
            </div>

            {/* ══ GRADEBOOK TAB ══ */}
            {activeTab === 'gradebook' && (
                <div>
                    {/* Summary info */}
                    <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', flexWrap: 'wrap' }}>
                        <div style={{ background: '#fff', border: '1px solid var(--prof-border)', borderRadius: '10px', padding: '14px 20px', minWidth: '140px' }}>
                            <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--prof-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '4px' }}>Attempts</div>
                            <div style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--prof-text-main)' }}>
                                {submissions.length} <span style={{ fontSize: '0.9rem', fontWeight: 500, color: 'var(--prof-text-muted)' }}>/ {exam.max_attempts}</span>
                            </div>
                        </div>
                        <div style={{ background: '#fff', border: '1px solid var(--prof-border)', borderRadius: '10px', padding: '14px 20px', minWidth: '140px' }}>
                            <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--prof-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '4px' }}>Best Score</div>
                            <div style={{ fontSize: '1.4rem', fontWeight: 700, color: bestScore !== null ? (bestScore >= PASSING_THRESHOLD ? '#15803d' : '#b91c1c') : 'var(--prof-text-muted)' }}>
                                {bestScore !== null ? `${bestScore.toFixed(0)}%` : '—'}
                            </div>
                        </div>
                        <div style={{ background: '#fff', border: '1px solid var(--prof-border)', borderRadius: '10px', padding: '14px 20px', minWidth: '140px' }}>
                            <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--prof-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '4px' }}>Average</div>
                            <div style={{ fontSize: '1.4rem', fontWeight: 700, color: avgScore !== null ? (avgScore >= PASSING_THRESHOLD ? '#15803d' : '#b91c1c') : 'var(--prof-text-muted)' }}>
                                {avgScore !== null ? `${avgScore.toFixed(0)}%` : '—'}
                            </div>
                        </div>
                    </div>

                    {/* Table */}
                    <div className="cs-card" style={{ padding: 0, overflow: 'hidden' }}>
                        {/* Table header */}
                        <div style={{ display: 'grid', gridTemplateColumns: '28px 1fr 130px 120px 130px', gap: '0 12px', padding: '10px 20px', background: 'var(--prof-surface)', borderBottom: '1px solid var(--prof-border)', fontSize: '0.75rem', fontWeight: 700, color: 'var(--prof-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', alignItems: 'center' }}>
                            <div />
                            <div>Item Name</div>
                            <div>Date Submitted</div>
                            <div>Grade</div>
                            <div>Status</div>
                        </div>

                        {/* Rows: one per attempt slot */}
                        {Array.from({ length: exam.max_attempts }, (_, i) => i + 1).map(attemptNum => {
                            const sub = submissionByAttempt[attemptNum];
                            const attemptStatus = attemptStatusMap[attemptNum] ?? 'draft';
                            const isSubmitted = !!sub?.submitted_at;
                            const isGraded = sub?.score !== null && sub?.total_items !== null;

                            let rowStatus = 'Not available';
                            let rowStatusColor = '#94a3b8';
                            if (attemptStatus === 'deployed' && !isSubmitted) { rowStatus = 'Open'; rowStatusColor = '#16a34a'; }
                            else if (isSubmitted && isGraded) { rowStatus = 'Graded'; rowStatusColor = '#2563eb'; }
                            else if (isSubmitted) { rowStatus = 'Submitted'; rowStatusColor = '#f59e0b'; }
                            else if (attemptStatus === 'done') { rowStatus = 'Closed'; rowStatusColor = '#475569'; }

                            const itemName = `Attempt ${attemptNum} — ${exam.academic_year.replace('-', '/').slice(-5)} ${exam.term.slice(0, 2).toUpperCase()}`;
                            const setLabel = sub ? (SET_LABELS[sub.set_number - 1] ?? String(sub.set_number)) : null;

                            return (
                                <div
                                    key={attemptNum}
                                    style={{ display: 'grid', gridTemplateColumns: '28px 1fr 130px 120px 130px', gap: '0 12px', padding: '14px 20px', borderBottom: '1px solid var(--prof-border)', alignItems: 'center', fontSize: '0.875rem' }}
                                >
                                    <div style={{ display: 'flex', alignItems: 'center' }}>
                                        <StatusDot submitted={isSubmitted} score={sub?.score ?? null} total={sub?.total_items ?? null} />
                                    </div>
                                    <div>
                                        <div style={{ fontWeight: 600, color: 'var(--prof-text-main)' }}>{itemName}</div>
                                        {setLabel && (
                                            <div style={{ fontSize: '0.78rem', color: 'var(--prof-text-muted)', marginTop: '2px' }}>Set {setLabel}</div>
                                        )}
                                    </div>
                                    <div style={{ color: 'var(--prof-text-muted)' }}>
                                        {formatDate(sub?.submitted_at ?? null)}
                                    </div>
                                    <div>
                                        {isSubmitted
                                            ? <ScoreBadge score={sub?.score ?? null} total={sub?.total_items ?? null} />
                                            : <span style={{ color: '#94a3b8', fontSize: '0.85rem' }}>—</span>
                                        }
                                    </div>
                                    <div>
                                        <span style={{ fontWeight: 600, fontSize: '0.78rem', color: rowStatusColor }}>
                                            {rowStatus}
                                        </span>
                                    </div>
                                </div>
                            );
                        })}

                        {exam.max_attempts === 0 && (
                            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--prof-text-muted)' }}>
                                No attempts configured for this exam.
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* ══ ANALYTICS TAB ══ */}
            {activeTab === 'analytics' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    {gradedSubs.length === 0 ? (
                        <div className="cs-card" style={{ textAlign: 'center', padding: '48px 24px' }}>
                            <svg fill="none" strokeWidth="1.5" stroke="currentColor" viewBox="0 0 24 24" width="44" height="44" style={{ margin: '0 auto 14px', display: 'block', opacity: 0.3 }}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
                            </svg>
                            <p style={{ color: 'var(--prof-text-muted)', fontSize: '0.95rem', margin: 0 }}>No graded submissions yet.</p>
                            <p style={{ color: 'var(--prof-text-muted)', fontSize: '0.85rem', margin: '6px 0 0' }}>Analytics will appear once your work has been graded.</p>
                        </div>
                    ) : (
                        <>
                            {/* Summary stats */}
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px' }}>
                                {[
                                    { label: 'Best Score', value: bestScore !== null ? `${bestScore.toFixed(1)}%` : '—', color: bestScore !== null && bestScore >= PASSING_THRESHOLD ? '#15803d' : '#b91c1c' },
                                    { label: 'Average Score', value: avgScore !== null ? `${avgScore.toFixed(1)}%` : '—', color: avgScore !== null && avgScore >= PASSING_THRESHOLD ? '#15803d' : '#b91c1c' },
                                    { label: 'Latest Score', value: latestScore !== null ? `${latestScore.toFixed(1)}%` : '—', color: latestScore !== null && latestScore >= PASSING_THRESHOLD ? '#15803d' : '#b91c1c' },
                                    { label: 'Graded Attempts', value: `${gradedSubs.length} / ${exam.max_attempts}`, color: 'var(--prof-text-main)' },
                                ].map(stat => (
                                    <div key={stat.label} style={{ background: '#fff', border: '1px solid var(--prof-border)', borderRadius: '10px', padding: '16px 20px' }}>
                                        <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--prof-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '6px' }}>{stat.label}</div>
                                        <div style={{ fontSize: '1.5rem', fontWeight: 700, color: stat.color }}>{stat.value}</div>
                                    </div>
                                ))}
                            </div>

                            {/* Per-attempt score chart */}
                            <div className="cs-card">
                                <h3 className="cs-card-title">Score Per Attempt</h3>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                    {gradedSubs.map(sub => {
                                        const pct = ((sub.score ?? 0) / (sub.total_items ?? 1)) * 100;
                                        const passing = pct >= PASSING_THRESHOLD;
                                        return (
                                            <div key={sub.id}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                                                    <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--prof-text-main)' }}>
                                                        Attempt {sub.attempt_number}
                                                        {sub.set_number ? <span style={{ fontWeight: 400, color: 'var(--prof-text-muted)', marginLeft: '6px' }}>Set {SET_LABELS[sub.set_number - 1] ?? sub.set_number}</span> : null}
                                                    </span>
                                                    <span style={{ fontSize: '0.85rem', fontWeight: 700, color: passing ? '#15803d' : '#b91c1c' }}>
                                                        {sub.score} / {sub.total_items} ({pct.toFixed(0)}%)
                                                    </span>
                                                </div>
                                                <div style={{ height: '10px', background: '#f1f5f9', borderRadius: '999px', overflow: 'hidden' }}>
                                                    <div style={{ height: '100%', width: `${Math.min(pct, 100)}%`, background: passing ? '#16a34a' : '#dc2626', borderRadius: '999px', transition: 'width 0.5s ease' }} />
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>

                                {/* Passing threshold indicator */}
                                <div style={{ marginTop: '16px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.78rem', color: 'var(--prof-text-muted)' }}>
                                    <span style={{ width: '12px', height: '3px', background: '#94a3b8', borderRadius: '2px', display: 'inline-block' }} />
                                    Passing threshold: {PASSING_THRESHOLD}%
                                </div>
                            </div>

                            {/* Overall performance indicator */}
                            <div className="cs-card">
                                <h3 className="cs-card-title">Overall Performance</h3>
                                {avgScore !== null && (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                                        <div style={{ width: '80px', height: '80px', borderRadius: '50%', border: `6px solid ${avgScore >= PASSING_THRESHOLD ? '#16a34a' : '#dc2626'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                            <span style={{ fontSize: '1.1rem', fontWeight: 800, color: avgScore >= PASSING_THRESHOLD ? '#15803d' : '#b91c1c' }}>
                                                {avgScore.toFixed(0)}%
                                            </span>
                                        </div>
                                        <div>
                                            <div style={{ fontWeight: 700, fontSize: '1rem', color: avgScore >= PASSING_THRESHOLD ? '#15803d' : '#b91c1c', marginBottom: '4px' }}>
                                                {avgScore >= PASSING_THRESHOLD ? 'Passing' : 'Needs Improvement'}
                                            </div>
                                            <div style={{ fontSize: '0.875rem', color: 'var(--prof-text-muted)' }}>
                                                Based on {gradedSubs.length} graded attempt{gradedSubs.length !== 1 ? 's' : ''} · Average {avgScore.toFixed(1)}%
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </>
                    )}
                </div>
            )}
        </div>
    );
}
