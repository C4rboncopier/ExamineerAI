import { Fragment, useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { fetchEnrolledExams, fetchAllStudentSubmissions } from '../../lib/studentExams';
import type { StudentExam, StudentSubmission } from '../../lib/studentExams';
import { fetchPassingRate } from '../../lib/settings';

const SET_LABELS = ['A', 'B', 'C', 'D', 'E'];

function getGradeColors(pct: number, passingRate: number) {
    if (pct < passingRate) return { text: '#b91c1c', bg: '#fee2e2', border: '#fca5a5', solid: '#dc2626' };
    if (pct < 75) return { text: '#ea580c', bg: '#ffedd5', border: '#fdba74', solid: '#f97316' };
    if (pct < 85) return { text: '#ca8a04', bg: '#fef9c3', border: '#fde047', solid: '#eab308' };
    if (pct < 95) return { text: '#15803d', bg: '#dcfce7', border: '#86efac', solid: '#16a34a' };
    return { text: '#14532d', bg: '#bbf7d0', border: '#4ade80', solid: '#15803d' };
}

function formatDate(iso: string | null) {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: '2-digit' });
}

interface ExamGradeSummary {
    exam: StudentExam;
    submissions: StudentSubmission[];
    bestPct: number | null;
    bestScore: number | null;
    bestTotal: number | null;
    hasPassed: boolean;
    attemptsTaken: number;
    isGraded: boolean;
    showGrade: boolean;
}

export function GradesList() {
    const { user } = useAuth();
    const [summaries, setSummaries] = useState<ExamGradeSummary[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [passingRate, setPassingRate] = useState(60);
    const [expandedExamId, setExpandedExamId] = useState<string | null>(null);

    useEffect(() => {
        fetchPassingRate().then(({ value }) => { if (value !== null) setPassingRate(value); });
    }, []);

    useEffect(() => {
        if (!user) return;
        async function load() {
            setIsLoading(true);
            const [examsResult, subsResult] = await Promise.all([
                fetchEnrolledExams(user!.id),
                fetchAllStudentSubmissions(user!.id),
            ]);
            if (examsResult.error || subsResult.error) {
                setIsLoading(false);
                return;
            }
            const subsByExam: Record<string, StudentSubmission[]> = {};
            for (const sub of subsResult.data) {
                if (!subsByExam[sub.exam_id]) subsByExam[sub.exam_id] = [];
                subsByExam[sub.exam_id].push(sub);
            }

            const results: ExamGradeSummary[] = examsResult.data.map(exam => {
                const subs = subsByExam[exam.id] ?? [];
                const gradesReleasedMap: Record<number, boolean> = {};
                exam.exam_attempts.forEach(a => { gradesReleasedMap[a.attempt_number] = a.grades_released; });

                const gradedSubs = subs.filter(s =>
                    s.score !== null && s.total_items !== null && s.total_items > 0 &&
                    (gradesReleasedMap[s.attempt_number] ?? false)
                );

                const scores = gradedSubs.map(s => (s.score! / s.total_items!) * 100);
                const bestPct = scores.length > 0 ? Math.max(...scores) : null;
                const bestSub = bestPct !== null ? gradedSubs.find(s => (s.score! / s.total_items!) * 100 === bestPct) ?? null : null;
                const hasPassed = scores.some(pct => pct >= passingRate);
                const allAttemptsDone = exam.exam_attempts.length > 0 && exam.exam_attempts.every(a => a.status === 'done');
                const lastAttemptSub = subs.find(s => s.attempt_number === exam.max_attempts);
                const lastAttemptGradesReleased = gradesReleasedMap[exam.max_attempts] ?? false;
                const failedLastAttempt = !hasPassed
                    && !!lastAttemptSub
                    && lastAttemptSub.score !== null
                    && lastAttemptSub.total_items !== null
                    && lastAttemptGradesReleased
                    && ((lastAttemptSub.score / lastAttemptSub.total_items!) * 100) < passingRate;
                const showGrade = hasPassed || (allAttemptsDone && gradedSubs.length > 0) || failedLastAttempt;

                return {
                    exam,
                    submissions: subs,
                    bestPct,
                    bestScore: bestSub?.score ?? null,
                    bestTotal: bestSub?.total_items ?? null,
                    hasPassed,
                    attemptsTaken: subs.length,
                    isGraded: gradedSubs.length > 0,
                    showGrade,
                };
            });

            setSummaries(results);
            setIsLoading(false);
        }
        load();
    }, [user, passingRate]);

    if (isLoading) {
        return (
            <div className="qb-container create-question-wrapper" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
                    <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="#ec1f28" strokeWidth="2" style={{ animation: 'spin 1s linear infinite' }}>
                        <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                    </svg>
                    <p style={{ margin: 0, color: '#94a3b8', fontSize: '0.95rem', fontWeight: 500 }}>Loading grades...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="qb-container create-question-wrapper">
            <div className="cs-header" style={{ marginBottom: '16px' }}>
                <div>
                    <h2>Grades</h2>
                    <p style={{ margin: 0, color: 'var(--prof-text-muted)', fontSize: '0.9rem' }}>Summary of your exam results and performance.</p>
                </div>
            </div>

            {summaries.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '60px 20px', backgroundColor: '#fff', borderRadius: '12px', border: '1px solid var(--prof-border)' }}>
                    <svg fill="none" strokeWidth="1.5" stroke="currentColor" viewBox="0 0 24 24" width="44" height="44" style={{ margin: '0 auto 14px', display: 'block', opacity: 0.3 }}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                    </svg>
                    <h3 style={{ margin: '0 0 6px', color: 'var(--prof-text-main)', fontSize: '1rem', fontWeight: 600 }}>No exams enrolled</h3>
                    <p style={{ margin: 0, color: 'var(--prof-text-muted)', fontSize: '0.88rem' }}>Your exam grades will appear here once you are enrolled.</p>
                </div>
            ) : (
                <div className="cs-card" style={{ padding: 0, overflow: 'hidden' }}>
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                            <thead>
                                <tr>
                                    <th style={{ textAlign: 'left', padding: '9px 10px 9px 16px', fontWeight: 700, borderBottom: '1px solid var(--prof-border)', fontSize: '0.7rem', color: 'var(--prof-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', background: 'var(--prof-surface)' }}>Exam</th>
                                    <th style={{ textAlign: 'left', padding: '9px 10px', fontWeight: 700, borderBottom: '1px solid var(--prof-border)', fontSize: '0.7rem', color: 'var(--prof-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', background: 'var(--prof-surface)', whiteSpace: 'nowrap' }}>Year / Term</th>
                                    <th style={{ textAlign: 'center', padding: '9px 10px', fontWeight: 700, borderBottom: '1px solid var(--prof-border)', fontSize: '0.7rem', color: 'var(--prof-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', background: 'var(--prof-surface)' }}>Attempts</th>
                                    <th style={{ textAlign: 'center', padding: '9px 10px', fontWeight: 700, borderBottom: '1px solid var(--prof-border)', fontSize: '0.7rem', color: 'var(--prof-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', background: 'var(--prof-surface)', whiteSpace: 'nowrap' }}>Best Score</th>
                                    <th style={{ textAlign: 'center', padding: '9px 16px 9px 10px', fontWeight: 700, borderBottom: '1px solid var(--prof-border)', fontSize: '0.7rem', color: 'var(--prof-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', background: 'var(--prof-surface)' }}>Grade</th>
                                </tr>
                            </thead>
                            <tbody>
                                {summaries.map(({ exam, bestPct, bestScore, bestTotal, hasPassed, attemptsTaken, isGraded, showGrade, submissions }) => {
                                    const subjects = exam.exam_subjects.filter(s => s.subjects);
                                    const gc = bestPct !== null ? getGradeColors(bestPct, passingRate) : null;
                                    const isExpanded = expandedExamId === exam.id;

                                    const gradesReleasedMap: Record<number, boolean> = {};
                                    const attemptStatusMap: Record<number, string> = {};
                                    exam.exam_attempts.forEach(a => {
                                        gradesReleasedMap[a.attempt_number] = a.grades_released;
                                        attemptStatusMap[a.attempt_number] = a.status;
                                    });
                                    const subByAttempt: Record<number, StudentSubmission> = {};
                                    submissions.forEach(s => { subByAttempt[s.attempt_number] = s; });

                                    return (
                                        <Fragment key={exam.id}>
                                            <tr
                                                onClick={() => setExpandedExamId(isExpanded ? null : exam.id)}
                                                style={{ borderBottom: isExpanded ? 'none' : '1px solid var(--prof-border)', cursor: 'pointer', background: isExpanded ? '#f8fafc' : 'transparent' }}
                                            >
                                                <td style={{ padding: '10px 10px 10px 16px' }}>
                                                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                                                        <svg
                                                            fill="none" strokeWidth="2.5" stroke="currentColor" viewBox="0 0 24 24" width="13" height="13"
                                                            style={{ flexShrink: 0, marginTop: '3px', color: 'var(--prof-text-muted)', transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}
                                                        >
                                                            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                                                        </svg>
                                                        <div>
                                                            <div style={{ fontWeight: 600, color: 'var(--prof-text-main)', fontSize: '0.85rem', marginBottom: subjects.length > 0 ? '5px' : 0 }}>{exam.title}</div>
                                                            {subjects.length > 0 && (
                                                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                                                                    {subjects.map(s => (
                                                                        <span key={s.subject_id} style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--prof-primary)', background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: '4px', padding: '1px 6px' }}>
                                                                            {s.subjects!.course_code}
                                                                        </span>
                                                                    ))}
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                </td>
                                                <td style={{ padding: '10px', color: 'var(--prof-text-muted)', fontSize: '0.8rem', whiteSpace: 'nowrap' }}>
                                                    {exam.academic_year} · {exam.term}
                                                </td>
                                                <td style={{ padding: '10px', textAlign: 'center', fontSize: '0.82rem', color: 'var(--prof-text-main)', fontWeight: 600 }}>
                                                    {attemptsTaken} <span style={{ fontWeight: 400, color: 'var(--prof-text-muted)' }}>/ {exam.max_attempts}</span>
                                                </td>
                                                <td style={{ padding: '10px', textAlign: 'center' }}>
                                                    {isGraded && gc && bestScore !== null && bestTotal !== null ? (
                                                        <span style={{ fontSize: '0.78rem', fontWeight: 700, color: gc.text, background: gc.bg, border: `1px solid ${gc.border}`, borderRadius: '8px', padding: '2px 8px' }}>
                                                            {bestScore}/{bestTotal} ({bestPct!.toFixed(0)}%)
                                                        </span>
                                                    ) : (
                                                        <span style={{ color: '#94a3b8', fontSize: '0.8rem' }}>—</span>
                                                    )}
                                                </td>
                                                <td style={{ padding: '10px 16px 10px 10px', textAlign: 'center' }}>
                                                    {showGrade ? (
                                                        <span style={{ fontSize: '0.82rem', fontWeight: 800, color: hasPassed ? '#15803d' : '#b91c1c', background: hasPassed ? '#dcfce7' : '#fee2e2', border: `1px solid ${hasPassed ? '#86efac' : '#fca5a5'}`, borderRadius: '6px', padding: '2px 10px' }}>
                                                            {hasPassed ? 'P' : 'F'}
                                                        </span>
                                                    ) : (
                                                        <span style={{ color: '#94a3b8', fontSize: '0.8rem' }}>—</span>
                                                    )}
                                                </td>
                                            </tr>

                                            {isExpanded && (
                                                <tr style={{ borderBottom: '1px solid var(--prof-border)', background: '#f8fafc' }}>
                                                    <td colSpan={5} style={{ padding: '0 16px 14px 36px' }}>
                                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                                                            {Array.from({ length: exam.max_attempts }, (_, i) => i + 1).map(attemptNum => {
                                                                const sub = subByAttempt[attemptNum];
                                                                const attemptStatus = attemptStatusMap[attemptNum] ?? 'draft';
                                                                const gradesReleased = gradesReleasedMap[attemptNum] ?? false;
                                                                const isSubmitted = !!sub?.submitted_at;
                                                                const isScored = sub?.score != null && sub?.total_items != null;

                                                                let statusLabel = 'Not Available';
                                                                let statusColor = '#94a3b8';
                                                                if (attemptStatus === 'deployed' && !isSubmitted) { statusLabel = 'Open'; statusColor = '#16a34a'; }
                                                                else if (isSubmitted && isScored && gradesReleased) { statusLabel = 'Graded'; statusColor = '#2563eb'; }
                                                                else if (isSubmitted && isScored && !gradesReleased) { statusLabel = 'Pending'; statusColor = '#9333ea'; }
                                                                else if (isSubmitted) { statusLabel = 'Submitted'; statusColor = '#f59e0b'; }
                                                                else if (attemptStatus === 'done') { statusLabel = 'Closed'; statusColor = '#475569'; }

                                                                const pct = sub && sub.score != null && sub.total_items ? (sub.score / sub.total_items) * 100 : null;
                                                                const agc = pct !== null ? getGradeColors(pct, passingRate) : null;
                                                                const setLabel = sub?.set_number ? (SET_LABELS[sub.set_number - 1] ?? String(sub.set_number)) : null;

                                                                return (
                                                                    <div key={attemptNum} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '7px 10px', background: '#fff', border: '1px solid var(--prof-border)', borderRadius: '8px', fontSize: '0.8rem' }}>
                                                                        <span style={{ fontWeight: 600, color: 'var(--prof-text-main)', minWidth: '72px' }}>Attempt {attemptNum}</span>
                                                                        {setLabel && (
                                                                            <span style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--prof-text-muted)', background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: '4px', padding: '1px 6px' }}>Set {setLabel}</span>
                                                                        )}
                                                                        <span style={{ color: 'var(--prof-text-muted)', fontSize: '0.75rem', flex: 1 }}>
                                                                            {formatDate(sub?.submitted_at ?? null)}
                                                                        </span>
                                                                        <span>
                                                                            {isSubmitted && gradesReleased && pct !== null && agc && sub?.score != null && sub?.total_items ? (
                                                                                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: agc.text, background: agc.bg, border: `1px solid ${agc.border}`, borderRadius: '6px', padding: '2px 8px' }}>
                                                                                    {sub.score}/{sub.total_items} ({pct.toFixed(0)}%)
                                                                                </span>
                                                                            ) : (
                                                                                <span style={{ color: '#94a3b8', fontSize: '0.75rem' }}>—</span>
                                                                            )}
                                                                        </span>
                                                                        <span style={{ fontSize: '0.72rem', fontWeight: 700, color: statusColor, minWidth: '64px', textAlign: 'right' }}>{statusLabel}</span>
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                    </td>
                                                </tr>
                                            )}
                                        </Fragment>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
}
