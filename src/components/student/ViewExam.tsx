import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { fetchEnrolledExamById, fetchStudentSubmissions, saveSubmissionAiAnalysis, getStudentExamStatus, fetchExamRoster } from '../../lib/studentExams';
import type { StudentExam, StudentSubmission, ExamRosterEntry } from '../../lib/studentExams';
import { fetchPassingRate } from '../../lib/settings';
import { fetchQuestionsWithOutcomesByIds } from '../../lib/questions';
import { generateStudentAnalysis } from '../../lib/gemini';
import type { AnalysisFeedback } from '../../lib/gemini';

const SET_LABELS = ['A', 'B', 'C', 'D', 'E'];

function getGradeColors(pct: number, passingRate: number) {
    if (pct < passingRate) return { text: '#b91c1c', bg: '#fee2e2', border: '#fca5a5', solid: '#dc2626' };
    if (pct < 75) return { text: '#ea580c', bg: '#ffedd5', border: '#fdba74', solid: '#f97316' };
    if (pct < 85) return { text: '#ca8a04', bg: '#fef9c3', border: '#fde047', solid: '#eab308' };
    if (pct < 95) return { text: '#15803d', bg: '#dcfce7', border: '#86efac', solid: '#16a34a' };
    return { text: '#14532d', bg: '#bbf7d0', border: '#4ade80', solid: '#15803d' };
}

type Tab = 'gradebook' | 'analytics';

function formatDate(iso: string | null): string {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: '2-digit' });
}

function ScoreBadge({ score, total, passingRate }: { score: number | null; total: number | null; passingRate: number }) {
    if (score === null || total === null || total === 0) {
        return <span style={{ color: '#94a3b8', fontSize: '0.85rem' }}>Not graded</span>;
    }
    const pct = (score / total) * 100;
    const gc = getGradeColors(pct, passingRate);
    return (
        <span style={{
            display: 'inline-block',
            padding: '3px 10px',
            borderRadius: '999px',
            fontSize: '0.82rem',
            fontWeight: 700,
            background: gc.bg,
            color: gc.text,
            border: `1px solid ${gc.border}`,
        }}>
            {score} / {total}
        </span>
    );
}

function StatusDot({ submitted, score, total, passingRate }: { submitted: boolean; score: number | null; total: number | null; passingRate: number }) {
    let color = '#cbd5e1';
    if (submitted && score !== null && total !== null && total > 0) {
        const pct = (score / total) * 100;
        color = getGradeColors(pct, passingRate).solid;
    } else if (submitted) {
        color = '#94a3b8';
    }
    return (
        <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: color, display: 'inline-block', flexShrink: 0 }} />
    );
}

interface TopicStat {
    subjectId: string;
    coId: string;
    coTitle: string;
    coOrderIndex: number;
    moId: string;
    moDescription: string;
    moOrderIndex: number;
    incorrectCount: number;
    totalCount: number;
    pctCorrect: number;
}


interface AttemptAnalysis {
    topics: TopicStat[];
    aiFeedback: AnalysisFeedback | null;
    isLoadingAI: boolean;
    aiError: string | null;
}

function TopicBreakdownList({ topics, subjects }: {
    topics: TopicStat[];
    subjects?: { id: string; courseCode: string; courseTitle: string }[];
}) {
    if (topics.length === 0) {
        return <p style={{ fontSize: '0.82rem', color: 'var(--prof-text-muted)', margin: 0 }}>No topic data available.</p>;
    }

    const renderCOs = (subset: TopicStat[]) => {
        const byCO: Record<string, { coTitle: string; coOrderIndex: number; mos: TopicStat[] }> = {};
        for (const w of subset) {
            if (!byCO[w.coId]) byCO[w.coId] = { coTitle: w.coTitle, coOrderIndex: w.coOrderIndex, mos: [] };
            byCO[w.coId].mos.push(w);
        }
        return Object.values(byCO).sort((a, b) => a.coOrderIndex - b.coOrderIndex).map(co => (
            <div key={co.coTitle} style={{ marginBottom: '4px' }}>
                <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--prof-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '3px' }}>{co.coTitle}</div>
                {co.mos.map(mo => {
                    const correct = mo.totalCount - mo.incorrectCount;
                    const pct = mo.pctCorrect;
                    const dotColor = pct >= 75 ? '#16a34a' : pct >= 50 ? '#ea580c' : '#dc2626';
                    const scoreColor = pct >= 75 ? '#15803d' : pct >= 50 ? '#c2410c' : '#b91c1c';
                    const moLabel = `MO${co.coOrderIndex + 1}${mo.moOrderIndex + 1}`;
                    return (
                        <div key={mo.moId} style={{ display: 'flex', alignItems: 'center', gap: '7px', padding: '4px 0', borderBottom: '1px solid #f1f5f9' }}>
                            <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: dotColor, flexShrink: 0 }} />
                            <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--prof-text-muted)', flexShrink: 0, minWidth: '36px' }}>{moLabel}</span>
                            <span style={{ fontSize: '0.8rem', color: 'var(--prof-text-main)', flex: 1 }}>{mo.moDescription}</span>
                            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: scoreColor, flexShrink: 0 }}>{correct}/{mo.totalCount}</span>
                        </div>
                    );
                })}
            </div>
        ));
    };

    if (!subjects || subjects.length <= 1) {
        return <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>{renderCOs(topics)}</div>;
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {subjects.map(subj => {
                const subjectTopics = topics.filter(t => t.subjectId === subj.id);
                if (subjectTopics.length === 0) return null;
                return (
                    <div key={subj.id}>
                        <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--prof-primary)', background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: '5px', padding: '4px 8px', marginBottom: '6px' }}>
                            {subj.courseCode} — {subj.courseTitle}
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>{renderCOs(subjectTopics)}</div>
                    </div>
                );
            })}
        </div>
    );
}

const PIE_COLORS = ['#3b82f6', '#8b5cf6', '#f59e0b', '#ec4899', '#14b8a6', '#f43f5e', '#84cc16'];

function SubjectPieChart({ subjects, topics, passingRate }: {
    subjects: { id: string; courseCode: string; courseTitle: string }[];
    topics: TopicStat[];
    passingRate: number;
}) {
    const [hoveredId, setHoveredId] = useState<string | null>(null);
    const cx = 90, cy = 90, outerR = 72, innerR = 44;

    const data = subjects
        .map(subj => {
            const st = topics.filter(t => t.subjectId === subj.id);
            const total = st.reduce((s, t) => s + t.totalCount, 0);
            const correct = st.reduce((s, t) => s + (t.totalCount - t.incorrectCount), 0);
            return { ...subj, total, correct, pct: total > 0 ? (correct / total) * 100 : 0 };
        })
        .filter(d => d.total > 0);

    const totalItems = data.reduce((s, d) => s + d.total, 0);
    const totalCorrect = data.reduce((s, d) => s + d.correct, 0);
    const totalWrong = totalItems - totalCorrect;
    const overallPct = totalItems > 0 ? (totalCorrect / totalItems) * 100 : 0;
    const gc = getGradeColors(overallPct, passingRate);

    // Slices: correct per subject + one combined wrong slice
    type Slice = { id: string; value: number; color: string; start: number; end: number; midAngle: number };
    const allSlices: Slice[] = [];
    let angle = -90;
    data.forEach((d, i) => {
        const sweep = totalItems > 0 ? (d.correct / totalItems) * 360 : 0;
        allSlices.push({ id: d.id, value: d.correct, color: PIE_COLORS[i % PIE_COLORS.length], start: angle, end: angle + sweep, midAngle: angle + sweep / 2 });
        angle += sweep;
    });
    if (totalWrong > 0) {
        const sweep = totalItems > 0 ? (totalWrong / totalItems) * 360 : 0;
        allSlices.push({ id: '__wrong__', value: totalWrong, color: '#fca5a5', start: angle, end: angle + sweep, midAngle: angle + sweep / 2 });
        angle += sweep;
    }

    const toXY = (r: number, deg: number): [number, number] => [
        cx + r * Math.cos((deg * Math.PI) / 180),
        cy + r * Math.sin((deg * Math.PI) / 180),
    ];

    const donutPath = (oR: number, iR: number, sDeg: number, eDeg: number) => {
        const gap = allSlices.length > 1 ? 1.5 : 0;
        const s = sDeg + gap / 2, e = eDeg - gap / 2;
        const [ox1, oy1] = toXY(oR, s); const [ox2, oy2] = toXY(oR, e);
        const [ix1, iy1] = toXY(iR, s); const [ix2, iy2] = toXY(iR, e);
        const large = e - s > 180 ? 1 : 0;
        return `M ${ox1} ${oy1} A ${oR} ${oR} 0 ${large} 1 ${ox2} ${oy2} L ${ix2} ${iy2} A ${iR} ${iR} 0 ${large} 0 ${ix1} ${iy1} Z`;
    };

    return (
        <div style={{ display: 'flex', gap: '20px', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'center' }}>
            <svg
                viewBox="0 0 180 180" width="180" height="180"
                style={{
                    flexShrink: 0,
                    filter: 'drop-shadow(0 6px 12px rgba(0,0,0,0.12))',
                    transform: 'perspective(600px) rotateX(12deg)',
                    animation: 'pieIn 0.45s ease',
                    transformOrigin: 'center',
                }}
            >
                {allSlices.map(s => {
                    const isHov = hoveredId === s.id;
                    const dx = isHov ? 5 * Math.cos(s.midAngle * Math.PI / 180) : 0;
                    const dy = isHov ? 5 * Math.sin(s.midAngle * Math.PI / 180) : 0;
                    return (
                        <path
                            key={s.id}
                            d={donutPath(outerR, innerR, s.start, s.end)}
                            fill={s.color}
                            transform={isHov ? `translate(${dx}, ${dy})` : undefined}
                            style={{ transition: 'transform 0.2s ease', cursor: 'default', filter: isHov ? 'brightness(1.1)' : undefined }}
                            onMouseEnter={() => setHoveredId(s.id)}
                            onMouseLeave={() => setHoveredId(null)}
                        />
                    );
                })}
                <circle cx={cx} cy={cy} r={innerR} fill="white" />
                <text x={cx} y={cy - 7} textAnchor="middle" fontSize="17" fontWeight="700" fill={gc.text}>{overallPct.toFixed(0)}%</text>
                <text x={cx} y={cy + 10} textAnchor="middle" fontSize="9" fill="#94a3b8" fontWeight="600">OVERALL</text>
            </svg>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', flex: 1, minWidth: '150px' }}>
                {data.map((d, i) => {
                    const isHov = hoveredId === d.id;
                    const sliceColor = PIE_COLORS[i % PIE_COLORS.length];
                    return (
                        <div
                            key={d.id}
                            style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 6px', borderRadius: '6px', background: isHov ? `${sliceColor}1a` : 'transparent', transition: 'background 0.15s', cursor: 'default' }}
                            onMouseEnter={() => setHoveredId(d.id)}
                            onMouseLeave={() => setHoveredId(null)}
                        >
                            <span style={{ width: '11px', height: '11px', borderRadius: '3px', background: sliceColor, flexShrink: 0, transform: isHov ? 'scale(1.2)' : 'scale(1)', transition: 'transform 0.15s' }} />
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--prof-text-main)' }}>{d.courseCode}</div>
                                <div style={{ fontSize: '0.7rem', color: 'var(--prof-text-muted)', lineHeight: '1.3', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.courseTitle}</div>
                            </div>
                            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#15803d', flexShrink: 0 }}>
                                {d.correct} correct
                            </span>
                        </div>
                    );
                })}
                {totalWrong > 0 && (
                    <div
                        style={{ display: 'flex', alignItems: 'center', gap: '8px', paddingTop: '6px', borderTop: '1px solid #f1f5f9', padding: '6px', borderRadius: '6px', background: hoveredId === '__wrong__' ? '#fff1f2' : 'transparent', transition: 'background 0.15s', cursor: 'default' }}
                        onMouseEnter={() => setHoveredId('__wrong__')}
                        onMouseLeave={() => setHoveredId(null)}
                    >
                        <span style={{ width: '11px', height: '11px', borderRadius: '3px', background: '#fca5a5', flexShrink: 0, transform: hoveredId === '__wrong__' ? 'scale(1.2)' : 'scale(1)', transition: 'transform 0.15s' }} />
                        <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#b91c1c', flex: 1 }}>Mistakes</span>
                        <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#b91c1c', flexShrink: 0 }}>{totalWrong} wrong</span>
                    </div>
                )}
            </div>
        </div>
    );
}

function AIAnalysisCard({ feedback }: { feedback: AnalysisFeedback }) {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* Summary */}
            <p style={{ fontSize: '0.88rem', color: '#166534', margin: 0, lineHeight: '1.6' }}>{feedback.summary}</p>

            {/* Per-subject sections */}
            {feedback.subjectAnalyses.map((subj, si) => (
                <div key={si} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ background: '#dbeafe', color: '#1d4ed8', border: '1px solid #bfdbfe', borderRadius: '999px', padding: '2px 10px', fontSize: '0.75rem', fontWeight: 700 }}>
                            {subj.courseCode} — {subj.courseTitle}
                        </span>
                    </div>
                    <p style={{ fontSize: '0.83rem', color: '#15803d', margin: 0, fontStyle: 'italic', lineHeight: '1.5' }}>{subj.overallComment}</p>
                    {subj.weakTopics.map((topic, ti) => (
                        <div key={ti} style={{ background: '#fff', border: '1px solid #bbf7d0', borderRadius: '7px', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#166534' }}>
                                {topic.coTitle}
                            </div>
                            <p style={{ fontSize: '0.82rem', color: '#374151', margin: 0, lineHeight: '1.55' }}>{topic.insight}</p>
                            {topic.studyTips.length > 0 && (
                                <div>
                                    <p style={{ fontSize: '0.73rem', fontWeight: 700, color: '#15803d', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '4px 0 4px' }}>Study Tips</p>
                                    <ul style={{ margin: 0, paddingLeft: '16px', display: 'flex', flexDirection: 'column', gap: '3px' }}>
                                        {topic.studyTips.map((tip, ti2) => (
                                            <li key={ti2} style={{ fontSize: '0.81rem', color: '#166534', lineHeight: '1.45' }}>{tip}</li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            ))}

        </div>
    );
}

export function ViewExam() {
    const { examId, tab } = useParams<{ examId: string; tab: string }>();
    const { user } = useAuth();
    const navigate = useNavigate();

    const [exam, setExam] = useState<StudentExam | null>(null);
    const [submissions, setSubmissions] = useState<StudentSubmission[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const activeTab: Tab = (tab === 'analytics' ? 'analytics' : 'gradebook');
    const [passingRate, setPassingRate] = useState(60);

    // Roster state
    const [isRosterOpen, setIsRosterOpen] = useState(false);
    const [rosterStudents, setRosterStudents] = useState<ExamRosterEntry[]>([]);
    const [rosterSearch, setRosterSearch] = useState('');
    const [rosterPage, setRosterPage] = useState(1);
    const [rosterLoading, setRosterLoading] = useState(false);

    // Analytics state
    const [attemptAnalyses, setAttemptAnalyses] = useState<Record<number, AttemptAnalysis>>({});
    const [analyticsView, setAnalyticsView] = useState<'chart' | 'breakdown'>('chart');
    const [selectedAttempt, setSelectedAttempt] = useState<number | null>(null);
    const [analysisLoaded, setAnalysisLoaded] = useState(false);
    const [analysisLoading, setAnalysisLoading] = useState(false);

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

    useEffect(() => {
        fetchPassingRate().then(({ value }) => { if (value !== null) setPassingRate(value); });
    }, []);

    const handleOpenRoster = useCallback(async () => {
        if (!examId) return;
        setIsRosterOpen(true);
        setRosterLoading(true);
        setRosterSearch('');
        setRosterPage(1);
        const { data } = await fetchExamRoster(examId);
        setRosterStudents(data);
        setRosterLoading(false);
    }, [examId]);

    // Compute CO/MO weak areas when analytics tab is opened
    const computeAnalysis = useCallback(async (
        gradedSubs: StudentSubmission[]
    ) => {
        if (gradedSubs.length === 0) { setAnalysisLoaded(true); return; }
        setAnalysisLoading(true);

        // Collect all unique question IDs from all submissions
        const allIds = [...new Set(gradedSubs.flatMap(s => Object.keys(s.answers)))];
        const { data: questions, error: qErr } = await fetchQuestionsWithOutcomesByIds(allIds);
        if (qErr || !questions) { setAnalysisLoaded(true); setAnalysisLoading(false); return; }

        const questionMap: Record<string, typeof questions[0]> = {};
        for (const q of questions) questionMap[q.id] = q;

        // Per-attempt weak areas
        const newAnalyses: Record<number, AttemptAnalysis> = {};
        for (const sub of gradedSubs) {
            const moStats: Record<string, { subjectId: string; coId: string; coTitle: string; coOrderIndex: number; moId: string; moDescription: string; moOrderIndex: number; incorrect: number; total: number }> = {};
            for (const [qId, studentAnswer] of Object.entries(sub.answers)) {
                const q = questionMap[qId];
                if (!q || !q.course_outcomes || !q.module_outcomes) continue;
                const moId = q.module_outcome_id;
                if (!moStats[moId]) {
                    moStats[moId] = {
                        subjectId: q.subject_id,
                        coId: q.course_outcome_id,
                        coTitle: q.course_outcomes.title,
                        coOrderIndex: q.course_outcomes.order_index,
                        moId,
                        moDescription: q.module_outcomes.description,
                        moOrderIndex: q.module_outcomes.order_index,
                        incorrect: 0,
                        total: 0,
                    };
                }
                moStats[moId].total++;
                if (studentAnswer !== q.correct_choice) moStats[moId].incorrect++;
            }
            const topics: TopicStat[] = Object.values(moStats)
                .map(s => ({
                    subjectId: s.subjectId,
                    coId: s.coId, coTitle: s.coTitle, coOrderIndex: s.coOrderIndex,
                    moId: s.moId, moDescription: s.moDescription, moOrderIndex: s.moOrderIndex,
                    incorrectCount: s.incorrect, totalCount: s.total,
                    pctCorrect: ((s.total - s.incorrect) / s.total) * 100,
                }))
                .sort((a, b) => a.coOrderIndex - b.coOrderIndex || a.moOrderIndex - b.moOrderIndex);

            newAnalyses[sub.attempt_number] = { topics, aiFeedback: sub.ai_analysis ?? null, isLoadingAI: false, aiError: null };
        }
        setAttemptAnalyses(newAnalyses);
        setAnalysisLoaded(true);
        setAnalysisLoading(false);
    }, []);

    useEffect(() => {
        if (activeTab !== 'analytics' || analysisLoaded || analysisLoading || !exam || submissions.length === 0) return;
        const gradesReleasedMap: Record<number, boolean> = {};
        exam.exam_attempts.forEach(a => { gradesReleasedMap[a.attempt_number] = a.grades_released; });
        const gradedSubs = submissions.filter(s =>
            s.score !== null && s.total_items !== null && s.total_items > 0 &&
            (gradesReleasedMap[s.attempt_number] ?? false)
        );
        computeAnalysis(gradedSubs);
    }, [activeTab, analysisLoaded, analysisLoading, exam, submissions, computeAnalysis]);

    const handleTabChange = (newTab: Tab) => {
        navigate(`/student/exams/${examId}/${newTab}`, { replace: true });
        if (newTab === 'analytics' && !analysisLoaded && exam && submissions.length > 0) {
            const attemptGradesReleasedMap: Record<number, boolean> = {};
            exam.exam_attempts.forEach(a => { attemptGradesReleasedMap[a.attempt_number] = a.grades_released; });
            const gradedSubs = submissions.filter(s =>
                s.score !== null && s.total_items !== null && s.total_items > 0 &&
                (attemptGradesReleasedMap[s.attempt_number] ?? false)
            );
            computeAnalysis(gradedSubs);
        }
    };

    const loadAttemptAI = async (attemptNumber: number) => {
        if (!exam) return;
        const analysis = attemptAnalyses[attemptNumber];
        if (!analysis || analysis.isLoadingAI || analysis.aiFeedback) return;
        setAttemptAnalyses(prev => ({ ...prev, [attemptNumber]: { ...prev[attemptNumber], isLoadingAI: true, aiError: null } }));
        const sub = submissions.find(s => s.attempt_number === attemptNumber);
        const subPct = sub && sub.total_items ? ((sub.score ?? 0) / sub.total_items) * 100 : 0;
        const subPassed = subPct >= passingRate;
        const examSubjects = exam.exam_subjects
            .map(es => {
                const coMap: Record<string, { coTitle: string; incorrectCount: number; totalCount: number; mos: { moDescription: string; incorrectCount: number; totalCount: number }[] }> = {};
                analysis.topics
                    .filter(t => t.subjectId === es.subject_id && (subPassed ? t.pctCorrect <= 50 : t.incorrectCount > 0))
                    .forEach(t => {
                        if (!coMap[t.coId]) coMap[t.coId] = { coTitle: t.coTitle, incorrectCount: 0, totalCount: 0, mos: [] };
                        coMap[t.coId].incorrectCount += t.incorrectCount;
                        coMap[t.coId].totalCount += t.totalCount;
                        coMap[t.coId].mos.push({ moDescription: t.moDescription, incorrectCount: t.incorrectCount, totalCount: t.totalCount });
                    });
                const topics = Object.values(coMap).map(c => ({
                    coTitle: c.coTitle,
                    incorrectCount: c.incorrectCount,
                    totalCount: c.totalCount,
                    pctCorrect: ((c.totalCount - c.incorrectCount) / c.totalCount) * 100,
                    moduleOutcomes: c.mos,
                }));
                return { courseCode: es.subjects?.course_code ?? '', courseTitle: es.subjects?.course_title ?? '', topics };
            })
            .filter(s => s.topics.length > 0);
        const { data, error: aiErr } = await generateStudentAnalysis(
            exam.title,
            examSubjects,
            { score: sub?.score ?? 0, total: sub?.total_items ?? 0, attemptNumber },
            passingRate
        );
        if (data && sub) saveSubmissionAiAnalysis(sub.id, data);
        setAttemptAnalyses(prev => ({
            ...prev,
            [attemptNumber]: { ...prev[attemptNumber], aiFeedback: data, isLoadingAI: false, aiError: aiErr },
        }));
    };

    if (isLoading) {
        return (
            <div className="qb-container create-question-wrapper" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
                    <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="#ec1f28" strokeWidth="2" style={{ animation: 'spin 1s linear infinite' }}>
                        <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                    </svg>
                    <p style={{ margin: 0, color: '#94a3b8', fontSize: '0.95rem', fontWeight: 500 }}>Loading exam...</p>
                </div>
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

    const attemptStatusMap: Record<number, 'draft' | 'deployed' | 'done'> = {};
    const attemptGradesReleasedMap: Record<number, boolean> = {};
    exam.exam_attempts.forEach(a => {
        attemptStatusMap[a.attempt_number] = a.status;
        attemptGradesReleasedMap[a.attempt_number] = a.grades_released;
    });

    const submissionByAttempt: Record<number, StudentSubmission> = {};
    submissions.forEach(s => { submissionByAttempt[s.attempt_number] = s; });

    const gradedSubs = submissions.filter(s =>
        s.score !== null && s.total_items !== null && s.total_items > 0 &&
        (attemptGradesReleasedMap[s.attempt_number] ?? false)
    );
    const scores = gradedSubs.map(s => (s.score! / s.total_items!) * 100);
    const bestScore = scores.length > 0 ? Math.max(...scores) : null;
    const latestScore = gradedSubs.length > 0 ? scores[scores.length - 1] : null;
    const hasPassed = scores.some(pct => pct >= passingRate);
    const passingAttemptNum = hasPassed
        ? (gradedSubs.find(s => (s.score! / s.total_items!) * 100 >= passingRate)?.attempt_number ?? null)
        : null;
    const allAttemptsDone = exam.exam_attempts.length > 0 && exam.exam_attempts.every(a => a.status === 'done');
    const lastAttemptSub = submissionByAttempt[exam.max_attempts];
    const lastAttemptGradesReleased = attemptGradesReleasedMap[exam.max_attempts] ?? false;
    const failedLastAttempt = !hasPassed
        && !!lastAttemptSub
        && lastAttemptSub.score !== null
        && lastAttemptSub.total_items !== null
        && lastAttemptGradesReleased
        && ((lastAttemptSub.score / lastAttemptSub.total_items) * 100) < passingRate;
    const showGrade = hasPassed || (allAttemptsDone && gradedSubs.length > 0) || failedLastAttempt;

    const statusStyleMap: Record<string, { color: string; bg: string; label: string }> = {
        available: { color: '#15803d', bg: '#dcfce7', label: 'Available' },
        upcoming:  { color: '#92400e', bg: '#fef3c7', label: 'Upcoming' },
        completed: { color: '#475569', bg: '#f1f5f9', label: 'Completed' },
        locked:    { color: '#92400e', bg: '#fef3c7', label: 'Locked' },
    };
    const statusStyle = statusStyleMap[examStatus] ?? statusStyleMap.locked;

    const TAB_LABELS: Record<Tab, string> = { gradebook: 'Gradebook', analytics: 'Analytics' };

    // Exam details panel (right side)
    const ExamDetailsPanel = () => (
        <div className="cs-card" style={{ padding: '16px' }}>
            <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--prof-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '10px' }}>Exam Details</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.85rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ color: 'var(--prof-text-muted)' }}>Code</span>
                    <span style={{ fontWeight: 600, color: 'var(--prof-text-main)' }}>{exam.code}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ color: 'var(--prof-text-muted)' }}>Academic Year</span>
                    <span style={{ fontWeight: 600, color: 'var(--prof-text-main)' }}>{exam.academic_year}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ color: 'var(--prof-text-muted)' }}>Term</span>
                    <span style={{ fontWeight: 600, color: 'var(--prof-text-main)' }}>{exam.term}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ color: 'var(--prof-text-muted)' }}>Status</span>
                    <span style={{ fontWeight: 600, fontSize: '0.78rem', color: statusStyle.color, background: statusStyle.bg, padding: '2px 8px', borderRadius: '999px' }}>{statusStyle.label}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ color: 'var(--prof-text-muted)' }}>Max Attempts</span>
                    <span style={{ fontWeight: 600, color: 'var(--prof-text-main)' }}>{exam.max_attempts}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ color: 'var(--prof-text-muted)' }}>Passing Rate</span>
                    <span style={{ fontWeight: 600, color: 'var(--prof-text-main)' }}>{passingRate}%</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ color: 'var(--prof-text-muted)' }}>AI Analysis</span>
                    <span style={{ fontWeight: 600, fontSize: '0.78rem', color: exam.ai_analysis_enabled ? '#15803d' : '#64748b', background: exam.ai_analysis_enabled ? '#dcfce7' : '#f1f5f9', padding: '2px 8px', borderRadius: '999px' }}>
                        {exam.ai_analysis_enabled ? 'Enabled' : 'Disabled'}
                    </span>
                </div>
            </div>

            {subjectTags.length > 0 && (
                <>
                    <div style={{ borderTop: '1px solid var(--prof-border)', margin: '12px 0' }} />
                    <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--prof-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>Subjects</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        {subjectTags.map(s => (
                            <div key={s.subject_id} style={{ fontSize: '0.82rem', color: 'var(--prof-text-main)' }}>
                                <span style={{ fontWeight: 700, color: 'var(--prof-primary)' }}>{s.subjects!.course_code}</span>
                                <span style={{ color: 'var(--prof-text-muted)' }}> — {s.subjects!.course_title}</span>
                            </div>
                        ))}
                    </div>
                </>
            )}

            {/* Faculty */}
            <div style={{ borderTop: '1px solid var(--prof-border)', margin: '12px 0' }} />
            <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--prof-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>Faculty</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                {/* Main professor */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem' }}>
                    <span style={{ flex: 1, color: 'var(--prof-text-main)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {exam.created_by_profile?.full_name ?? exam.created_by_profile?.email ?? 'Professor'}
                    </span>
                    <span style={{ flexShrink: 0, background: '#dbeafe', color: '#1e40af', fontSize: '0.68rem', fontWeight: 700, borderRadius: '5px', padding: '1px 6px' }}>Main</span>
                </div>
                {/* Accepted co-handlers */}
                {exam.exam_faculty.filter(f => f.status === 'accepted').map(f => (
                    <div key={f.id} style={{ display: 'flex', alignItems: 'center', fontSize: '0.82rem', color: 'var(--prof-text-main)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {f.professor?.full_name ?? f.professor?.email ?? '—'}
                    </div>
                ))}
            </div>

            {/* View Roster */}
            <div style={{ borderTop: '1px solid var(--prof-border)', margin: '12px 0' }} />
            <button
                onClick={handleOpenRoster}
                style={{
                    width: '100%', padding: '7px 12px', fontSize: '0.82rem', fontWeight: 600,
                    background: 'var(--prof-surface)', color: 'var(--prof-text-main)',
                    border: '1px solid var(--prof-border)', borderRadius: '8px',
                    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                    transition: 'background 0.15s',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = '#f1f5f9')}
                onMouseLeave={e => (e.currentTarget.style.background = 'var(--prof-surface)')}
            >
                <svg fill="none" strokeWidth="1.75" stroke="currentColor" viewBox="0 0 24 24" width="15" height="15">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
                </svg>
                View Roster
            </button>
        </div>
    );

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
                    <h2 style={{ marginBottom: '4px' }}>{exam.title}</h2>
                </div>
            </div>

            {/* Tab nav */}
            <div style={{ display: 'flex', borderBottom: '2px solid var(--prof-border)', marginBottom: '20px' }}>
                {(['gradebook', 'analytics'] as Tab[]).map(tab => {
                    const isActive = activeTab === tab;
                    return (
                        <button
                            key={tab}
                            onClick={() => handleTabChange(tab)}
                            style={{
                                padding: '10px 20px',
                                border: 'none',
                                background: 'none',
                                cursor: 'pointer',
                                borderBottom: `2px solid ${isActive ? 'var(--prof-primary)' : 'transparent'}`,
                                marginBottom: '-2px',
                                color: isActive ? 'var(--prof-primary)' : 'var(--prof-text-muted)',
                                fontWeight: 600,
                                fontSize: '0.9rem',
                                transition: 'all 0.15s',
                            }}
                        >
                            {TAB_LABELS[tab]}
                        </button>
                    );
                })}
            </div>

            {/* Two-column layout */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: '20px', alignItems: 'start' }}>

                {/* ── LEFT: Tab content ── */}
                <div>
                    {/* ══ GRADEBOOK TAB ══ */}
                    {activeTab === 'gradebook' && (
                        <div>
                            {/* Summary stats */}
                            <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', flexWrap: 'wrap' }}>
                                <div style={{ background: '#fff', border: '1px solid var(--prof-border)', borderRadius: '10px', padding: '12px 16px', minWidth: '120px' }}>
                                    <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--prof-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '4px' }}>Attempts</div>
                                    <div style={{ fontSize: '1.3rem', fontWeight: 700, color: 'var(--prof-text-main)' }}>
                                        {submissions.length} <span style={{ fontSize: '0.85rem', fontWeight: 500, color: 'var(--prof-text-muted)' }}>/ {exam.max_attempts}</span>
                                    </div>
                                </div>
                                <div style={{ background: '#fff', border: '1px solid var(--prof-border)', borderRadius: '10px', padding: '12px 16px', minWidth: '120px' }}>
                                    <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--prof-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '4px' }}>Best Score</div>
                                    <div style={{ fontSize: '1.3rem', fontWeight: 700, color: bestScore !== null ? getGradeColors(bestScore, passingRate).text : 'var(--prof-text-muted)' }}>
                                        {bestScore !== null ? `${bestScore.toFixed(0)}%` : '—'}
                                    </div>
                                </div>
                                <div style={{ background: '#fff', border: '1px solid var(--prof-border)', borderRadius: '10px', padding: '12px 16px', minWidth: '100px' }}>
                                    <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--prof-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '4px' }}>Grade</div>
                                    {showGrade ? (
                                        <div style={{ fontSize: '1.5rem', fontWeight: 800, color: hasPassed ? '#15803d' : '#b91c1c' }}>
                                            {hasPassed ? 'P' : 'F'}
                                        </div>
                                    ) : (
                                        <div style={{ fontSize: '1.3rem', fontWeight: 700, color: 'var(--prof-text-muted)' }}>—</div>
                                    )}
                                </div>
                            </div>

                            {/* Attempts table */}
                            <div className="cs-card" style={{ padding: 0, overflow: 'hidden' }}>
                                <div style={{ display: 'grid', gridTemplateColumns: '28px 1fr 110px 110px 110px', gap: '0 10px', padding: '9px 16px', background: 'var(--prof-surface)', borderBottom: '1px solid var(--prof-border)', fontSize: '0.72rem', fontWeight: 700, color: 'var(--prof-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', alignItems: 'center' }}>
                                    <div />
                                    <div>Item</div>
                                    <div>Date</div>
                                    <div>Grade</div>
                                    <div>Status</div>
                                </div>

                                {Array.from({ length: exam.max_attempts }, (_, i) => i + 1).map(attemptNum => {
                                    const sub = submissionByAttempt[attemptNum];
                                    const attemptStatus = attemptStatusMap[attemptNum] ?? 'draft';
                                    const gradesReleased = attemptGradesReleasedMap[attemptNum] ?? false;
                                    const isSubmitted = !!sub?.submitted_at;
                                    const isGraded = sub?.score !== null && sub?.total_items !== null;

                                    let rowStatus = 'Not available';
                                    let rowStatusColor = '#94a3b8';
                                    if (hasPassed && passingAttemptNum !== null && attemptNum > passingAttemptNum && !isSubmitted) { rowStatus = 'N/A'; rowStatusColor = '#94a3b8'; }
                                    else if (attemptStatus === 'deployed' && !isSubmitted) { rowStatus = 'Open'; rowStatusColor = '#16a34a'; }
                                    else if (isSubmitted && isGraded && gradesReleased) { rowStatus = 'Graded'; rowStatusColor = '#2563eb'; }
                                    else if (isSubmitted && isGraded && !gradesReleased) { rowStatus = 'Pending'; rowStatusColor = '#9333ea'; }
                                    else if (isSubmitted) { rowStatus = 'Submitted'; rowStatusColor = '#f59e0b'; }
                                    else if (attemptStatus === 'done') { rowStatus = 'Closed'; rowStatusColor = '#475569'; }

                                    const itemName = `Attempt ${attemptNum}`;
                                    const setLabel = sub ? (SET_LABELS[sub.set_number - 1] ?? String(sub.set_number)) : null;

                                    return (
                                        <div
                                            key={attemptNum}
                                            style={{ display: 'grid', gridTemplateColumns: '28px 1fr 110px 110px 110px', gap: '0 10px', padding: '12px 16px', borderBottom: '1px solid var(--prof-border)', alignItems: 'center', fontSize: '0.85rem' }}
                                        >
                                            <div style={{ display: 'flex', alignItems: 'center' }}>
                                                <StatusDot submitted={isSubmitted} score={gradesReleased ? (sub?.score ?? null) : null} total={gradesReleased ? (sub?.total_items ?? null) : null} passingRate={passingRate} />
                                            </div>
                                            <div>
                                                <div style={{ fontWeight: 600, color: 'var(--prof-text-main)', fontSize: '0.85rem' }}>{itemName}</div>
                                                {setLabel && (
                                                    <div style={{ fontSize: '0.75rem', color: 'var(--prof-text-muted)', marginTop: '1px' }}>Set {setLabel}</div>
                                                )}
                                            </div>
                                            <div style={{ color: 'var(--prof-text-muted)', fontSize: '0.8rem' }}>
                                                {formatDate(sub?.submitted_at ?? null)}
                                            </div>
                                            <div>
                                                {isSubmitted && gradesReleased
                                                    ? <ScoreBadge score={sub?.score ?? null} total={sub?.total_items ?? null} passingRate={passingRate} />
                                                    : isSubmitted && !gradesReleased
                                                        ? <span style={{ color: '#9333ea', fontSize: '0.78rem', fontWeight: 600 }}>Pending</span>
                                                        : <span style={{ color: '#94a3b8', fontSize: '0.8rem' }}>—</span>
                                                }
                                            </div>
                                            <div>
                                                <span style={{ fontWeight: 600, fontSize: '0.75rem', color: rowStatusColor }}>
                                                    {rowStatus}
                                                </span>
                                            </div>
                                        </div>
                                    );
                                })}

                                {exam.max_attempts === 0 && (
                                    <div style={{ padding: '32px', textAlign: 'center', color: 'var(--prof-text-muted)' }}>
                                        No attempts configured for this exam.
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* ══ ANALYTICS TAB ══ */}
                    {activeTab === 'analytics' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
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
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '10px' }}>
                                        {[
                                            { label: 'Best Score', value: bestScore !== null ? `${bestScore.toFixed(1)}%` : '—', color: bestScore !== null ? getGradeColors(bestScore, passingRate).text : '#b91c1c' },
                                            { label: 'Latest Score', value: latestScore !== null ? `${latestScore.toFixed(1)}%` : '—', color: latestScore !== null ? getGradeColors(latestScore, passingRate).text : '#b91c1c' },
                                            { label: 'Graded Attempts', value: `${gradedSubs.length} / ${exam.max_attempts}`, color: 'var(--prof-text-main)' },
                                            { label: 'Grade', value: showGrade ? (hasPassed ? 'P' : 'F') : '—', color: showGrade ? (hasPassed ? '#15803d' : '#b91c1c') : 'var(--prof-text-muted)' },
                                        ].map(stat => (
                                            <div key={stat.label} style={{ background: '#fff', border: '1px solid var(--prof-border)', borderRadius: '10px', padding: '14px 16px' }}>
                                                <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--prof-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '4px' }}>{stat.label}</div>
                                                <div style={{ fontSize: '1.4rem', fontWeight: 700, color: stat.color }}>{stat.value}</div>
                                            </div>
                                        ))}
                                    </div>

                                    {/* Score progression */}
                                    <div className="cs-card">
                                        <h3 className="cs-card-title">Score Per Attempt</h3>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                            {gradedSubs.map(sub => {
                                                const pct = ((sub.score ?? 0) / (sub.total_items ?? 1)) * 100;
                                                const gc = getGradeColors(pct, passingRate);
                                                return (
                                                    <div key={sub.id}>
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '5px' }}>
                                                            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--prof-text-main)' }}>
                                                                Attempt {sub.attempt_number}
                                                                {sub.set_number ? <span style={{ fontWeight: 400, color: 'var(--prof-text-muted)', marginLeft: '6px' }}>Set {SET_LABELS[sub.set_number - 1] ?? sub.set_number}</span> : null}
                                                            </span>
                                                            <span style={{ fontSize: '0.82rem', fontWeight: 700, color: gc.text }}>
                                                                {sub.score}/{sub.total_items} ({pct.toFixed(0)}%)
                                                            </span>
                                                        </div>
                                                        <div style={{ height: '8px', background: '#f1f5f9', borderRadius: '999px', overflow: 'hidden' }}>
                                                            <div style={{ height: '100%', width: `${Math.min(pct, 100)}%`, background: gc.solid, borderRadius: '999px', transition: 'width 0.5s ease' }} />
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                        <div style={{ marginTop: '12px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.75rem', color: 'var(--prof-text-muted)' }}>
                                            <span style={{ width: '12px', height: '3px', background: '#94a3b8', borderRadius: '2px', display: 'inline-block' }} />
                                            Passing threshold: {passingRate}%
                                        </div>
                                    </div>

                                    {/* Unified analysis card */}
                                    {analysisLoading && (
                                        <div className="cs-card" style={{ textAlign: 'center', padding: '24px', color: 'var(--prof-text-muted)', fontSize: '0.875rem' }}>
                                            Loading analysis...
                                        </div>
                                    )}

                                    {analysisLoaded && (() => {
                                        const examSubjects = exam.exam_subjects.map(es => ({ id: es.subject_id, courseCode: es.subjects?.course_code ?? '', courseTitle: es.subjects?.course_title ?? '' }));
                                        const activeAttemptNum = selectedAttempt ?? gradedSubs[gradedSubs.length - 1]?.attempt_number ?? null;
                                        const analysis = activeAttemptNum !== null ? attemptAnalyses[activeAttemptNum] : null;
                                        const activeSub = gradedSubs.find(s => s.attempt_number === activeAttemptNum);
                                        const pct = activeSub ? ((activeSub.score ?? 0) / (activeSub.total_items ?? 1)) * 100 : 0;
                                        const gc = getGradeColors(pct, passingRate);
                                        const passed = pct >= passingRate;
                                        const hasWeakTopics = analysis ? analysis.topics.some(t => passed ? t.pctCorrect <= 50 : t.incorrectCount > 0) : false;
                                        return (
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                                {/* ── Main analysis card ── */}
                                                <div className="cs-card">
                                                    {/* Header row */}
                                                    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
                                                        <h3 className="cs-card-title" style={{ margin: 0, flex: 1 }}>Analysis</h3>

                                                        {/* Attempt selector */}
                                                        {gradedSubs.length > 1 && (
                                                            <div style={{ display: 'flex', gap: '3px', background: '#f1f5f9', borderRadius: '8px', padding: '3px' }}>
                                                                {gradedSubs.map(s => (
                                                                    <button
                                                                        key={s.attempt_number}
                                                                        onClick={() => setSelectedAttempt(s.attempt_number)}
                                                                        style={{ fontSize: '0.73rem', fontWeight: 600, padding: '3px 9px', borderRadius: '5px', border: 'none', cursor: 'pointer', background: s.attempt_number === activeAttemptNum ? '#fff' : 'transparent', color: s.attempt_number === activeAttemptNum ? 'var(--prof-text-main)' : 'var(--prof-text-muted)', boxShadow: s.attempt_number === activeAttemptNum ? '0 1px 3px rgba(0,0,0,0.1)' : 'none', transition: 'all 0.15s' }}
                                                                    >
                                                                        Attempt {s.attempt_number}
                                                                    </button>
                                                                ))}
                                                            </div>
                                                        )}

                                                        {/* View toggle */}
                                                        <div style={{ display: 'flex', gap: '3px', background: '#f1f5f9', borderRadius: '8px', padding: '3px' }}>
                                                            {(['chart', 'breakdown'] as const).map(v => (
                                                                <button
                                                                    key={v}
                                                                    onClick={() => setAnalyticsView(v)}
                                                                    style={{ fontSize: '0.73rem', fontWeight: 600, padding: '3px 9px', borderRadius: '5px', border: 'none', cursor: 'pointer', background: analyticsView === v ? '#fff' : 'transparent', color: analyticsView === v ? 'var(--prof-text-main)' : 'var(--prof-text-muted)', boxShadow: analyticsView === v ? '0 1px 3px rgba(0,0,0,0.1)' : 'none', transition: 'all 0.15s' }}
                                                                >
                                                                    {v === 'chart' ? 'Pie Chart' : 'Topic Breakdown'}
                                                                </button>
                                                            ))}
                                                        </div>
                                                    </div>

                                                    {/* Attempt score info */}
                                                    {activeSub && (
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                                                            <span style={{ fontSize: '0.82rem', fontWeight: 700, color: gc.text, background: gc.bg, border: `1px solid ${gc.border}`, padding: '2px 8px', borderRadius: '999px' }}>
                                                                {activeSub.score}/{activeSub.total_items} ({pct.toFixed(0)}%)
                                                            </span>
                                                            <span style={{ fontSize: '0.78rem', fontWeight: 700, color: pct >= passingRate ? '#15803d' : '#b91c1c' }}>
                                                                {pct >= passingRate ? 'Pass' : 'Fail'}
                                                            </span>
                                                        </div>
                                                    )}

                                                    {/* Content */}
                                                    {analysis ? (
                                                        analyticsView === 'chart' ? (
                                                            <SubjectPieChart subjects={examSubjects} topics={analysis.topics} passingRate={passingRate} />
                                                        ) : (
                                                            <TopicBreakdownList topics={analysis.topics} subjects={examSubjects} />
                                                        )
                                                    ) : (
                                                        <p style={{ fontSize: '0.82rem', color: 'var(--prof-text-muted)', margin: 0 }}>No data available.</p>
                                                    )}
                                                </div>

                                                {/* ── Separate AI Analysis card ── */}
                                                {exam.ai_analysis_enabled && analysis && activeAttemptNum !== null && (
                                                    <div className="cs-card" style={{ background: '#f0fdf4', border: '1px solid #86efac' }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '12px' }}>
                                                            <svg fill="none" strokeWidth="2" stroke="#16a34a" viewBox="0 0 24 24" width="15" height="15">
                                                                <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                                                            </svg>
                                                            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#15803d', textTransform: 'uppercase', letterSpacing: '0.05em' }}>AI Analysis</span>
                                                        </div>
                                                        {analysis.aiFeedback ? (
                                                            <AIAnalysisCard feedback={analysis.aiFeedback} />
                                                        ) : analysis.isLoadingAI ? (
                                                            <div style={{ fontSize: '0.82rem', color: '#15803d', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                                <svg style={{ animation: 'spin 1s linear infinite' }} fill="none" strokeWidth="2" stroke="currentColor" viewBox="0 0 24 24" width="14" height="14">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
                                                                </svg>
                                                                Generating AI analysis...
                                                            </div>
                                                        ) : analysis.aiError ? (
                                                            <p style={{ fontSize: '0.82rem', color: '#b91c1c', margin: 0 }}>{analysis.aiError}</p>
                                                        ) : hasWeakTopics ? (
                                                            <button
                                                                onClick={() => loadAttemptAI(activeAttemptNum)}
                                                                style={{ fontSize: '0.8rem', fontWeight: 600, color: '#15803d', background: '#dcfce7', border: '1px solid #86efac', borderRadius: '6px', padding: '6px 14px', cursor: 'pointer' }}
                                                            >
                                                                Generate AI Analysis
                                                            </button>
                                                        ) : (
                                                            <p style={{ fontSize: '0.82rem', color: '#15803d', margin: 0, fontStyle: 'italic' }}>No weak areas to analyze.</p>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })()}
                                </>
                            )}
                        </div>
                    )}
                </div>

                {/* ── RIGHT: Exam details panel ── */}
                <div>
                    <ExamDetailsPanel />
                </div>
            </div>

            {/* ── Roster Modal ── */}
            {isRosterOpen && (() => {
                const ITEMS_PER_PAGE = 10;
                const filtered = rosterStudents.filter(s => {
                    if (!rosterSearch.trim()) return true;
                    const q = rosterSearch.toLowerCase();
                    const name = (s.profile?.full_name ?? '').toLowerCase();
                    const program = (s.profile?.program?.name ?? s.profile?.program?.code ?? '').toLowerCase();
                    return name.includes(q) || program.includes(q);
                });
                const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE));
                const safePage = Math.min(rosterPage, totalPages);
                const pageItems = filtered.slice((safePage - 1) * ITEMS_PER_PAGE, safePage * ITEMS_PER_PAGE);
                const startIdx = (safePage - 1) * ITEMS_PER_PAGE + 1;
                const endIdx = Math.min(safePage * ITEMS_PER_PAGE, filtered.length);
                return (
                    <div
                        style={{
                            position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)',
                            backdropFilter: 'blur(3px)', zIndex: 200,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            padding: '20px',
                        }}
                        onClick={e => { if (e.target === e.currentTarget) { setIsRosterOpen(false); setRosterSearch(''); setRosterPage(1); } }}
                    >
                        <div style={{
                            background: '#fff', borderRadius: '14px', width: '100%', maxWidth: '520px',
                            maxHeight: '80vh', display: 'flex', flexDirection: 'column',
                            boxShadow: '0 24px 48px -8px rgba(0,0,0,0.22), 0 8px 16px -4px rgba(0,0,0,0.1)',
                            border: '1px solid #e2e8f0',
                        }}>
                            {/* Header */}
                            <div style={{ padding: '16px 20px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <div style={{ width: '34px', height: '34px', borderRadius: '8px', background: '#eff6ff', border: '1px solid #bfdbfe', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                    <svg fill="none" strokeWidth="1.75" stroke="#3b82f6" viewBox="0 0 24 24" width="17" height="17">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
                                    </svg>
                                </div>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <p style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: '#0f172a' }}>Exam Roster</p>
                                    <p style={{ margin: '1px 0 0', fontSize: '0.75rem', color: '#64748b' }}>
                                        {rosterLoading ? 'Loading…' : `${rosterStudents.length} student${rosterStudents.length !== 1 ? 's' : ''} enrolled`}
                                    </p>
                                </div>
                                <button
                                    onClick={() => { setIsRosterOpen(false); setRosterSearch(''); setRosterPage(1); }}
                                    style={{ background: '#f8fafc', border: '1px solid #e2e8f0', cursor: 'pointer', padding: '5px', color: '#64748b', borderRadius: '7px', display: 'flex', alignItems: 'center', flexShrink: 0 }}
                                >
                                    <svg fill="none" strokeWidth="2.5" stroke="currentColor" viewBox="0 0 24 24" width="15" height="15"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                                </button>
                            </div>

                            {/* Search */}
                            <div style={{ padding: '10px 16px', borderBottom: '1px solid #f1f5f9' }}>
                                <div style={{ position: 'relative' }}>
                                    <svg fill="none" strokeWidth="2" stroke="#94a3b8" viewBox="0 0 24 24" width="14" height="14"
                                        style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                                    </svg>
                                    <input
                                        type="text"
                                        placeholder="Search by name or program…"
                                        value={rosterSearch}
                                        onChange={e => { setRosterSearch(e.target.value); setRosterPage(1); }}
                                        style={{
                                            width: '100%', padding: '6px 10px 6px 30px', fontSize: '0.82rem',
                                            border: '1px solid #e2e8f0', borderRadius: '7px',
                                            outline: 'none', background: '#f8fafc',
                                            color: '#0f172a', boxSizing: 'border-box',
                                            transition: 'border-color 0.15s',
                                        }}
                                        onFocus={e => (e.currentTarget.style.borderColor = '#93c5fd')}
                                        onBlur={e => (e.currentTarget.style.borderColor = '#e2e8f0')}
                                    />
                                </div>
                            </div>

                            {/* Column headers */}
                            {!rosterLoading && filtered.length > 0 && (
                                <div style={{ display: 'grid', gridTemplateColumns: '36px 1fr 90px', padding: '6px 16px', background: '#f8fafc', borderBottom: '1px solid #f1f5f9' }}>
                                    <span style={{ fontSize: '0.67rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>#</span>
                                    <span style={{ fontSize: '0.67rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Name</span>
                                    <span style={{ fontSize: '0.67rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', textAlign: 'right' }}>Program</span>
                                </div>
                            )}

                            {/* List */}
                            <div style={{ flex: 1, overflowY: 'auto' }}>
                                {rosterLoading ? (
                                    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '52px 0' }}>
                                        <span style={{ display: 'inline-block', width: '24px', height: '24px', border: '2.5px solid #e2e8f0', borderTopColor: '#3b82f6', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                                    </div>
                                ) : filtered.length === 0 ? (
                                    <div style={{ textAlign: 'center', padding: '40px 20px' }}>
                                        <svg fill="none" strokeWidth="1.5" stroke="#cbd5e1" viewBox="0 0 24 24" width="32" height="32" style={{ margin: '0 auto 10px', display: 'block' }}>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                                        </svg>
                                        <p style={{ margin: 0, fontSize: '0.82rem', fontWeight: 600, color: '#64748b' }}>
                                            {rosterSearch ? 'No results found' : 'No students enrolled'}
                                        </p>
                                        {rosterSearch && (
                                            <p style={{ margin: '3px 0 0', fontSize: '0.75rem', color: '#94a3b8' }}>Try a different name or program</p>
                                        )}
                                    </div>
                                ) : (
                                    pageItems.map((s, i) => {
                                        const globalIdx = (safePage - 1) * ITEMS_PER_PAGE + i + 1;
                                        const name = s.profile?.full_name ?? s.profile?.email ?? '—';
                                        const programCode = s.profile?.program?.code;
                                        return (
                                            <div
                                                key={s.student_id}
                                                style={{
                                                    display: 'grid', gridTemplateColumns: '36px 1fr 90px',
                                                    padding: '8px 16px', borderBottom: '1px solid #f8fafc',
                                                    alignItems: 'center',
                                                    background: i % 2 === 0 ? '#fff' : '#fafbfd',
                                                }}
                                            >
                                                <span style={{ fontSize: '0.72rem', color: '#cbd5e1', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{globalIdx}</span>
                                                <span style={{ fontSize: '0.83rem', color: '#0f172a', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingRight: '8px' }}>{name}</span>
                                                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                                                    {programCode ? (
                                                        <span style={{ fontSize: '0.68rem', fontWeight: 700, color: '#1e40af', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '5px', padding: '2px 7px', whiteSpace: 'nowrap', letterSpacing: '0.02em' }}>
                                                            {programCode}
                                                        </span>
                                                    ) : (
                                                        <span style={{ fontSize: '0.75rem', color: '#cbd5e1' }}>—</span>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })
                                )}
                            </div>

                            {/* Footer: count + pagination */}
                            {!rosterLoading && filtered.length > 0 && (
                                <div style={{ padding: '9px 16px', borderTop: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#fafbfd', borderRadius: '0 0 14px 14px' }}>
                                    <span style={{ fontSize: '0.73rem', color: '#94a3b8' }}>
                                        {filtered.length <= ITEMS_PER_PAGE
                                            ? `${filtered.length} student${filtered.length !== 1 ? 's' : ''}`
                                            : `${startIdx}–${endIdx} of ${filtered.length}`}
                                    </span>
                                    {totalPages > 1 && (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                            <button
                                                onClick={() => setRosterPage(p => Math.max(1, p - 1))}
                                                disabled={safePage === 1}
                                                style={{ width: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', fontWeight: 700, border: '1px solid #e2e8f0', borderRadius: '6px', background: '#fff', cursor: safePage === 1 ? 'default' : 'pointer', opacity: safePage === 1 ? 0.35 : 1, color: '#334155' }}
                                            >
                                                ‹
                                            </button>
                                            {Array.from({ length: totalPages }, (_, i) => i + 1)
                                                .filter(p => p === 1 || p === totalPages || Math.abs(p - safePage) <= 1)
                                                .reduce<(number | '…')[]>((acc, p, i, arr) => {
                                                    if (i > 0 && p - (arr[i - 1] as number) > 1) acc.push('…');
                                                    acc.push(p);
                                                    return acc;
                                                }, [])
                                                .map((p, i) => p === '…' ? (
                                                    <span key={`ellipsis-${i}`} style={{ fontSize: '0.75rem', color: '#94a3b8', padding: '0 2px' }}>…</span>
                                                ) : (
                                                    <button
                                                        key={p}
                                                        onClick={() => setRosterPage(p as number)}
                                                        style={{ width: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 700, border: '1px solid', borderColor: safePage === p ? '#3b82f6' : '#e2e8f0', borderRadius: '6px', background: safePage === p ? '#3b82f6' : '#fff', cursor: 'pointer', color: safePage === p ? '#fff' : '#334155', transition: 'all 0.1s' }}
                                                    >
                                                        {p}
                                                    </button>
                                                ))
                                            }
                                            <button
                                                onClick={() => setRosterPage(p => Math.min(totalPages, p + 1))}
                                                disabled={safePage === totalPages}
                                                style={{ width: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', fontWeight: 700, border: '1px solid #e2e8f0', borderRadius: '6px', background: '#fff', cursor: safePage === totalPages ? 'default' : 'pointer', opacity: safePage === totalPages ? 0.35 : 1, color: '#334155' }}
                                            >
                                                ›
                                            </button>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                );
            })()}
        </div>
    );
}
