import { Fragment, useState, useEffect, useMemo, useCallback, type CSSProperties } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import katex from 'katex';
import {
    fetchExamById, lockExam, unlockExam, deleteExam,
    generateExamPapersForAttempt, deleteAttemptPapers,
    deployAttempt, markAttemptDone,
    releaseAttemptGrades, hideAttemptGrades,
    updateExamSetOrder,
} from '../../lib/exams';
import type { ExamWithSets, ExamSetDetail, AllocationConfig } from '../../lib/exams';
import { fetchExamFaculty, addExamFaculty, removeExamFaculty, type ExamFacultyMember } from '../../lib/examFaculty';
import { createExamInviteNotification, deleteNotificationByFacultyId } from '../../lib/notifications';
import { fetchProfessors, type Professor } from '../../lib/professors';
import { useAuth } from '../../contexts/AuthContext';
import { fetchQuestionsByIds, fetchQuestionsBySubject } from '../../lib/questions';
import type { QuestionSummary, QuestionWithOutcomes } from '../../lib/questions';
import { printExam } from '../../lib/printExam';
import { fetchSchoolInfo, fetchAcademicYear, fetchSemester, fetchPassingRate } from '../../lib/settings';
import { Popup } from '../common/Popup';
import { LoadingOverlay } from '../common/LoadingOverlay';
import { ExamStudents } from './ExamStudents';
import OMRScanner from './OMRScanner';
import { ExamAnalysis } from './ExamAnalysis';
import {
    fetchAttemptGrades,
    fetchSetAnswerKey,
    gradeOMR,
    saveOMRSubmission,
    deleteSubmission,
    setNumberToLetter,
    type AttemptGradeRow,
    type SetAnswerKey,
} from '../../lib/grading';

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
const GRADES_PER_PAGE = 10;

function getGradeColors(pct: number, passingRate: number) {
    if (pct < passingRate) return { text: '#b91c1c', bg: '#fee2e2', border: '#fca5a5', solid: '#dc2626' };
    if (pct < 75) return { text: '#ea580c', bg: '#ffedd5', border: '#fdba74', solid: '#f97316' };
    if (pct < 85) return { text: '#ca8a04', bg: '#fef9c3', border: '#fde047', solid: '#eab308' };
    if (pct < 95) return { text: '#15803d', bg: '#dcfce7', border: '#86efac', solid: '#16a34a' };
    return { text: '#14532d', bg: '#bbf7d0', border: '#4ade80', solid: '#15803d' };
}

type Tab = 'overview' | 'papers' | 'students' | 'scan' | 'analysis';

const PIE_COLORS_MINI = ['#3b82f6', '#8b5cf6', '#f59e0b', '#ec4899', '#14b8a6'];

function MiniSubjectPieChart({ subjects, questionIds, questionMap, answers, passingRate }: {
    subjects: { subject_id: string; course_code: string; course_title: string }[];
    questionIds: string[];
    questionMap: Record<string, QuestionSummary>;
    answers: Record<string, number>;
    passingRate: number;
}) {
    const [hoveredId, setHoveredId] = useState<string | null>(null);
    const cx = 90, cy = 90, outerR = 72, innerR = 44;

    const data = subjects.map(subj => {
        const qs = questionIds.filter(id => questionMap[id]?.subject_id === subj.subject_id);
        const total = qs.length;
        const correct = qs.filter(id => (answers[id] ?? -1) === questionMap[id]?.correct_choice).length;
        return { ...subj, total, correct, pct: total > 0 ? (correct / total) * 100 : 0 };
    }).filter(d => d.total > 0);

    const totalItems = data.reduce((s, d) => s + d.total, 0);
    const totalCorrect = data.reduce((s, d) => s + d.correct, 0);
    const totalWrong = totalItems - totalCorrect;

    type Slice = { id: string; value: number; color: string; start: number; end: number; midAngle: number };
    const allSlices: Slice[] = [];
    let angle = -90;
    data.forEach((d, i) => {
        const sweep = totalItems > 0 ? (d.correct / totalItems) * 360 : 0;
        allSlices.push({ id: d.subject_id, value: d.correct, color: PIE_COLORS_MINI[i % PIE_COLORS_MINI.length], start: angle, end: angle + sweep, midAngle: angle + sweep / 2 });
        angle += sweep;
    });
    if (totalWrong > 0) {
        const sweep = totalItems > 0 ? (totalWrong / totalItems) * 360 : 0;
        allSlices.push({ id: '__wrong__', value: totalWrong, color: '#fca5a5', start: angle, end: angle + sweep, midAngle: angle + sweep / 2 });
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

    const overallPct = totalItems > 0 ? (totalCorrect / totalItems) * 100 : 0;
    const gc = getGradeColors(overallPct, passingRate);

    // CO/MO breakdown per subject
    const breakdown = subjects.map((subj, si) => {
        const qs = questionIds.filter(id => questionMap[id]?.subject_id === subj.subject_id);
        const coMap: Record<number, Record<number, { correct: number; total: number }>> = {};
        for (const id of qs) {
            const q = questionMap[id];
            if (!q?.course_outcomes || !q?.module_outcomes) continue;
            const ci = q.course_outcomes.order_index;
            const mi = q.module_outcomes.order_index;
            if (!coMap[ci]) coMap[ci] = {};
            if (!coMap[ci][mi]) coMap[ci][mi] = { correct: 0, total: 0 };
            coMap[ci][mi].total++;
            if ((answers[id] ?? -1) === q.correct_choice) coMap[ci][mi].correct++;
        }
        const cos = Object.entries(coMap)
            .sort(([a], [b]) => Number(a) - Number(b))
            .map(([ciStr, moMap]) => {
                const ci = Number(ciStr);
                const mos = Object.entries(moMap)
                    .sort(([a], [b]) => Number(a) - Number(b))
                    .map(([miStr, d]) => ({ label: `MO${ci + 1}${Number(miStr) + 1}`, ...d }));
                const correct = mos.reduce((sum, m) => sum + m.correct, 0);
                const total = mos.reduce((sum, m) => sum + m.total, 0);
                return { label: `CO${ci + 1}`, mos, correct, total };
            });
        return { ...subj, cos, color: PIE_COLORS_MINI[si % PIE_COLORS_MINI.length] };
    }).filter(s => s.cos.length > 0);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', width: '100%' }}>
            {/* Pie + legend row */}
            <div style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
                <svg viewBox="0 0 180 180" width="180" height="180"
                    style={{ flexShrink: 0, filter: 'drop-shadow(0 6px 12px rgba(0,0,0,0.12))', transform: 'perspective(600px) rotateX(12deg)', animation: 'pieIn 0.45s ease', transformOrigin: 'center' }}>
                    {allSlices.map(s => {
                        const isHov = hoveredId === s.id;
                        const dx = isHov ? 5 * Math.cos(s.midAngle * Math.PI / 180) : 0;
                        const dy = isHov ? 5 * Math.sin(s.midAngle * Math.PI / 180) : 0;
                        return (
                            <path key={s.id} d={donutPath(outerR, innerR, s.start, s.end)} fill={s.color}
                                transform={isHov ? `translate(${dx}, ${dy})` : undefined}
                                style={{ transition: 'transform 0.2s ease', cursor: 'default', filter: isHov ? 'brightness(1.1)' : undefined }}
                                onMouseEnter={() => setHoveredId(s.id)}
                                onMouseLeave={() => setHoveredId(null)} />
                        );
                    })}
                    <circle cx={cx} cy={cy} r={innerR} fill="white" />
                    <text x={cx} y={cy - 7} textAnchor="middle" fontSize="17" fontWeight="700" fill={gc.text}>{overallPct.toFixed(0)}%</text>
                    <text x={cx} y={cy + 10} textAnchor="middle" fontSize="9" fill="#94a3b8" fontWeight="600">OVERALL</text>
                </svg>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', flex: 1, minWidth: '150px' }}>
                    {data.map((d, i) => {
                        const isHov = hoveredId === d.subject_id;
                        const sliceColor = PIE_COLORS_MINI[i % PIE_COLORS_MINI.length];
                        return (
                            <div key={d.subject_id}
                                style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 6px', borderRadius: '6px', background: isHov ? `${sliceColor}1a` : 'transparent', transition: 'background 0.15s', cursor: 'default' }}
                                onMouseEnter={() => setHoveredId(d.subject_id)}
                                onMouseLeave={() => setHoveredId(null)}>
                                <span style={{ width: '11px', height: '11px', borderRadius: '3px', background: sliceColor, flexShrink: 0, transform: isHov ? 'scale(1.2)' : 'scale(1)', transition: 'transform 0.15s' }} />
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--prof-text-main)' }}>{d.course_code}</div>
                                    <div style={{ fontSize: '0.7rem', color: 'var(--prof-text-muted)', lineHeight: '1.3', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.course_title}</div>
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
                            onMouseLeave={() => setHoveredId(null)}>
                            <span style={{ width: '11px', height: '11px', borderRadius: '3px', background: '#fca5a5', flexShrink: 0, transform: hoveredId === '__wrong__' ? 'scale(1.2)' : 'scale(1)', transition: 'transform 0.15s' }} />
                            <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#b91c1c', flex: 1 }}>Mistakes</span>
                            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#b91c1c', flexShrink: 0 }}>{totalWrong} wrong</span>
                        </div>
                    )}
                </div>
            </div>

            {/* CO/MO breakdown */}
            {breakdown.length > 0 && (
                <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '10px', display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                    {breakdown.map(subj => (
                        <div key={subj.subject_id} style={{ flex: 1, minWidth: '130px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '6px' }}>
                                <span style={{ width: '6px', height: '6px', borderRadius: '1px', background: subj.color, flexShrink: 0 }} />
                                <span style={{ fontSize: '0.72rem', fontWeight: 700, color: subj.color, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{subj.course_code}</span>
                            </div>
                            {subj.cos.map(co => {
                                const coPct = co.total > 0 ? (co.correct / co.total) * 100 : 0;
                                const coGc = getGradeColors(coPct, passingRate);
                                return (
                                    <div key={co.label} style={{ marginBottom: '5px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '2px 0' }}>
                                            <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#475569', minWidth: '30px' }}>{co.label}</span>
                                            <span style={{ fontSize: '0.72rem', fontWeight: 700, color: coGc.text }}>{co.correct}/{co.total}</span>
                                        </div>
                                        {co.mos.map(mo => {
                                            const moPct = mo.total > 0 ? (mo.correct / mo.total) * 100 : 0;
                                            const moGc = getGradeColors(moPct, passingRate);
                                            return (
                                                <div key={mo.label} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '1px 0 1px 10px' }}>
                                                    <span style={{ fontSize: '0.67rem', fontWeight: 600, color: '#94a3b8', minWidth: '30px' }}>{mo.label}</span>
                                                    <span style={{ fontSize: '0.67rem', color: moGc.text }}>{mo.correct}/{mo.total}</span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                );
                            })}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

export function ViewExam() {
    const { examId, tab } = useParams<{ examId: string; tab?: string }>();
    const navigate = useNavigate();
    const { user } = useAuth();

    // ── Core exam state ──
    const [exam, setExam] = useState<ExamWithSets | null>(null);
    const [questionMap, setQuestionMap] = useState<Record<string, QuestionSummary>>({});
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // ── Tab navigation (derived from URL) ──
    const activeTab: Tab =
        tab === 'papers' || tab === 'students' || tab === 'scan' || tab === 'overview' || tab === 'analysis'
            ? tab
            : 'overview';

    // ── Papers tab ──
    const [activeAttempt, setActiveAttempt] = useState(1);
    const [activeSet, setActiveSet] = useState(0);
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [currentPage, setCurrentPage] = useState(0);
    const [shuffledMap, setShuffledMap] = useState<Record<string, string[]>>({});

    // ── Generate papers form ──
    const [showGenerateForm, setShowGenerateForm] = useState<number | null>(null);
    const [genAllocMode, setGenAllocMode] = useState<'equal' | 'per_subject' | 'per_mo'>('equal');
    const [genPerMOCounts, setGenPerMOCounts] = useState<Record<string, number>>({});
    const [genTotalQuestions, setGenTotalQuestions] = useState(20);
    const [genPerSubjectCounts, setGenPerSubjectCounts] = useState<Record<string, number>>({});
    const [isGenerating, setIsGenerating] = useState(false);
    const [isDeletingAttempt, setIsDeletingAttempt] = useState<number | null>(null);
    const [generateError, setGenerateError] = useState<string | null>(null);
    const [availableQuestionsStats, setAvailableQuestionsStats] = useState<Record<string, { total: number, coStats: Record<string, number>, moStats: Record<string, number>, raw: QuestionWithOutcomes[] }>>({});
    const [isFetchingStats, setIsFetchingStats] = useState(false);

    // ── Print ──

    // ── Lock / Unlock / Delete ──
    const [isUnlockConfirmOpen, setIsUnlockConfirmOpen] = useState(false);
    const [isUnlocking, setIsUnlocking] = useState(false);
    const [isLockConfirmOpen, setIsLockConfirmOpen] = useState(false);
    const [isLocking, setIsLocking] = useState(false);
    const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);

    // ── Attempt deploy / done ──
    const [isAttemptDeployOpen, setIsAttemptDeployOpen] = useState(false);
    const [isAttemptDeploying, setIsAttemptDeploying] = useState(false);
    const [isAttemptDoneOpen, setIsAttemptDoneOpen] = useState(false);
    const [isAttemptDoneProcessing, setIsAttemptDoneProcessing] = useState(false);

    // ── Regenerate / delete attempt confirm ──
    const [isRegenerateConfirmOpen, setIsRegenerateConfirmOpen] = useState(false);
    const [isDeleteAttemptConfirmOpen, setIsDeleteAttemptConfirmOpen] = useState(false);

    // ── School info ──
    const [schoolName, setSchoolName] = useState('');
    const [schoolLogoUrl, setSchoolLogoUrl] = useState<string | null>(null);
    const [schoolAy, setSchoolAy] = useState('');
    const [schoolSem, setSchoolSem] = useState('');

    // ── Passing rate (from admin settings) ──
    const [passingRate, setPassingRate] = useState(60);

    // ── Grade release ──
    const [isTogglingRelease, setIsTogglingRelease] = useState<number | null>(null);
    const [isTogglingAllRelease, setIsTogglingAllRelease] = useState(false);

    // ── Grades ──
    const [gradesData, setGradesData] = useState<Record<number, AttemptGradeRow[]>>({});
    const [isLoadingGrades, setIsLoadingGrades] = useState(false);
    const [scannerAttempt, setScannerAttempt] = useState<number | null>(null);

    // ── Grade answer viewer / editor ──
    const [expandedGradeKey, setExpandedGradeKey] = useState<string | null>(null);
    const [answerKeyCache, setAnswerKeyCache] = useState<Record<string, SetAnswerKey | null>>({});
    const [loadingAnswerKey, setLoadingAnswerKey] = useState<string | null>(null);
    const [editingGradeKey, setEditingGradeKey] = useState<string | null>(null);
    const [editingAnswers, setEditingAnswers] = useState<Record<string, number>>({});
    const [editingSaving, setEditingSaving] = useState(false);

    // ── Grade attempt filter ──
    const [gradesAttemptFilter, setGradesAttemptFilter] = useState<number | null>(null);
    const [gradesSummaryMode, setGradesSummaryMode] = useState(false);

    // ── Exam Faculty ──
    const [faculty, setFaculty] = useState<ExamFacultyMember[]>([]);
    const [isInviteOpen, setIsInviteOpen] = useState(false);
    const [professorQuery, setProfessorQuery] = useState('');
    const [allProfessors, setAllProfessors] = useState<Professor[]>([]);
    const [inviteLoading, setInviteLoading] = useState<string | null>(null);
    const [removeTarget, setRemoveTarget] = useState<{ id: string; name: string } | null>(null);
    const [invitePage, setInvitePage] = useState(0);

    // ── OMR scanner busy guard ──
    const [isScannerBusy, setIsScannerBusy] = useState(false);
    const [pendingTab, setPendingTab] = useState<string | null>(null);

    // ── Grade select / bulk delete ──
    const [selectModeAttempt, setSelectModeAttempt] = useState<number | null>(null);
    const [selectedGradeKeys, setSelectedGradeKeys] = useState<Set<string>>(new Set());
    const [gradePageMap, setGradePageMap] = useState<Record<number, number>>({});
    const [isBulkDeleteOpen, setIsBulkDeleteOpen] = useState(false);
    const [isBulkDeleting, setIsBulkDeleting] = useState(false);

    useEffect(() => {
        fetchSchoolInfo().then(({ name, logoUrl }) => {
            if (name) setSchoolName(name);
            setSchoolLogoUrl(logoUrl);
        });
        fetchAcademicYear().then(({ value }) => { if (value) setSchoolAy(value); });
        fetchSemester().then(({ value }) => { if (value) setSchoolSem(value); });
        fetchPassingRate().then(({ value }) => { if (value !== null) setPassingRate(value); });
    }, []);

    const loadExam = useCallback(async () => {
        if (!examId) return;
        const [{ data, error }, { data: fac }, { data: profs }] = await Promise.all([
            fetchExamById(examId),
            fetchExamFaculty(examId),
            fetchProfessors(),
        ]);
        if (error || !data) { setError('Failed to load exam.'); setIsLoading(false); return; }
        setExam(data);
        setFaculty(fac ?? []);
        setAllProfessors(profs ?? []);
        const allIds = [...new Set(data.exam_sets.flatMap(s => s.question_ids))];
        if (allIds.length === 0) { setIsLoading(false); return; }
        const { data: questions } = await fetchQuestionsByIds(allIds);
        const map: Record<string, QuestionSummary> = {};
        questions.forEach(q => { map[q.id] = q; });
        setQuestionMap(map);
        setIsLoading(false);
    }, [examId]);

    useEffect(() => { loadExam(); }, [loadExam]);

    const loadGradesOnly = useCallback(async () => {
        if (!exam || !examId) return;
        setIsLoadingGrades(true);
        const deployed = exam.exam_attempts.filter(
            a => a.status === 'deployed' || a.status === 'done'
        );
        const newGrades: Record<number, AttemptGradeRow[]> = {};
        await Promise.all(deployed.map(async a => {
            const { data } = await fetchAttemptGrades(examId, a.attempt_number);
            newGrades[a.attempt_number] = data;
        }));
        setGradesData(newGrades);
        setIsLoadingGrades(false);
    }, [exam, examId]);

    useEffect(() => { loadGradesOnly(); }, [loadGradesOnly]);

    useEffect(() => {
        setActiveSet(0);
        setCurrentPage(0);
        setExpandedId(null);
        setShowGenerateForm(null);
    }, [activeAttempt, activeTab]);

    useEffect(() => {
        setCurrentPage(0);
        setExpandedId(null);
    }, [activeSet]);

    // ── Sets grouped by attempt ──
    const setsByAttempt = useMemo(() => {
        if (!exam) return {} as Record<number, ExamSetDetail[]>;
        const map: Record<number, ExamSetDetail[]> = {};
        for (let a = 1; a <= exam.max_attempts; a++) {
            map[a] = exam.exam_sets
                .filter(s => s.attempt_number === a)
                .sort((a, b) => a.set_number - b.set_number);
        }
        return map;
    }, [exam]);

    // ── Attempt status map ──
    const attemptStatusMap = useMemo(() => {
        if (!exam) return {} as Record<number, 'draft' | 'deployed' | 'done'>;
        const map: Record<number, 'draft' | 'deployed' | 'done'> = {};
        exam.exam_attempts.forEach(a => { map[a.attempt_number] = a.status; });
        return map;
    }, [exam]);

    // ── Attempt grades-released map ──
    const attemptGradesReleasedMap = useMemo(() => {
        if (!exam) return {} as Record<number, { released: boolean; id: string }>;
        const map: Record<number, { released: boolean; id: string }> = {};
        exam.exam_attempts.forEach(a => { map[a.attempt_number] = { released: a.grades_released, id: a.id }; });
        return map;
    }, [exam]);

    if (isLoading) {
        return (
            <div className="qb-container create-question-wrapper" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
                    <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="var(--prof-primary)" strokeWidth="2" style={{ animation: 'spin 1s linear infinite' }}>
                        <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                    </svg>
                    <p style={{ margin: 0, color: 'var(--prof-text-muted)', fontSize: '0.95rem', fontWeight: 500 }}>Loading exam...</p>
                </div>
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
    const currentAttemptSets = setsByAttempt[activeAttempt] ?? [];
    const currentSet = currentAttemptSets[activeSet];
    const shuffleKey = `${activeAttempt}-${activeSet}`;
    const orderedIds = currentSet ? (shuffledMap[shuffleKey] ?? currentSet.question_ids) : [];
    const currentQuestions = orderedIds.map(id => questionMap[id]).filter(Boolean) as QuestionSummary[];
    const totalPages = Math.ceil(currentQuestions.length / ITEMS_PER_PAGE);
    const pagedQuestions = currentQuestions.slice(currentPage * ITEMS_PER_PAGE, (currentPage + 1) * ITEMS_PER_PAGE);

    const canGeneratePapers = exam.num_sets > 0 && exam.exam_subjects.length > 0;
    const prevAttemptDone = activeAttempt === 1 || attemptStatusMap[activeAttempt - 1] === 'done';

    const handleRearrange = async () => {
        if (!currentSet) return;
        const ids = [...(shuffledMap[shuffleKey] ?? currentSet.question_ids)];
        for (let i = ids.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [ids[i], ids[j]] = [ids[j], ids[i]];
        }
        setShuffledMap(prev => ({ ...prev, [shuffleKey]: ids }));
        setCurrentPage(0);
        setExpandedId(null);
        await updateExamSetOrder(currentSet.id, ids);
    };

    const handlePrint = () => {
        if (!exam || !currentSet) return;
        printExam({
            title: exam.title,
            code: exam.code,
            schoolName: schoolName || undefined,
            schoolLogoUrl,
            academicYear: schoolAy || undefined,
            semester: schoolSem || undefined,
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
        });
    };

    const handleUnlock = async () => {
        if (!exam) return;
        setIsUnlocking(true);
        const { error } = await unlockExam(exam.id);
        setIsUnlocking(false);
        if (error) { alert(`Failed: ${error}`); return; }
        setExam(prev => prev ? { ...prev, status: 'unlocked' as const } : prev);
        setIsUnlockConfirmOpen(false);
    };

    const handleLock = async () => {
        if (!exam) return;
        setIsLocking(true);
        const { error } = await lockExam(exam.id);
        setIsLocking(false);
        if (error) { alert(`Failed: ${error}`); return; }
        setExam(prev => prev ? { ...prev, status: 'locked' as const } : prev);
        setIsLockConfirmOpen(false);
    };

    const handleToggleGradeRelease = async (attemptNumber: number) => {
        const info = attemptGradesReleasedMap[attemptNumber];
        if (!info) return;
        setIsTogglingRelease(attemptNumber);
        const { error } = info.released
            ? await hideAttemptGrades(info.id)
            : await releaseAttemptGrades(info.id);
        setIsTogglingRelease(null);
        if (error) { alert(`Failed: ${error}`); return; }
        setExam(prev => {
            if (!prev) return prev;
            return {
                ...prev,
                exam_attempts: prev.exam_attempts.map(a =>
                    a.attempt_number === attemptNumber
                        ? { ...a, grades_released: !a.grades_released }
                        : a
                ),
            };
        });
    };

    const handleToggleAllGradeRelease = async () => {
        const deployedList = exam?.exam_attempts.filter(a => a.status === 'deployed' || a.status === 'done') ?? [];
        const allReleased = deployedList.every(a => attemptGradesReleasedMap[a.attempt_number]?.released);
        setIsTogglingAllRelease(true);
        const errors: string[] = [];
        await Promise.all(deployedList.map(async a => {
            const info = attemptGradesReleasedMap[a.attempt_number];
            if (!info) return;
            if (allReleased && info.released) {
                const { error } = await hideAttemptGrades(info.id);
                if (error) errors.push(error);
            } else if (!allReleased && !info.released) {
                const { error } = await releaseAttemptGrades(info.id);
                if (error) errors.push(error);
            }
        }));
        setIsTogglingAllRelease(false);
        if (errors.length) { alert(`Some attempts failed: ${errors.join(', ')}`); }
        setExam(prev => {
            if (!prev) return prev;
            return {
                ...prev,
                exam_attempts: prev.exam_attempts.map(a =>
                    (a.status === 'deployed' || a.status === 'done')
                        ? { ...a, grades_released: !allReleased }
                        : a
                ),
            };
        });
    };

    const handleDeployAttempt = async (attemptNumber: number) => {
        if (!exam) return;
        setIsAttemptDeploying(true);
        const { error } = await deployAttempt(exam.id, attemptNumber);
        setIsAttemptDeploying(false);
        if (error) { alert(`Failed: ${error}`); return; }
        await loadExam();
        setIsAttemptDeployOpen(false);
    };

    const handleAttemptDone = async (attemptNumber: number) => {
        if (!exam) return;
        setIsAttemptDoneProcessing(true);
        const { error } = await markAttemptDone(exam.id, attemptNumber);
        setIsAttemptDoneProcessing(false);
        if (error) { alert(`Failed: ${error}`); return; }
        await loadExam();
        setIsAttemptDoneOpen(false);
    };

    const handleDeleteExam = async () => {
        if (!exam) return;
        setIsDeleting(true);
        const { error } = await deleteExam(exam.id);
        setIsDeleting(false);
        if (error) { alert(error); setIsDeleteConfirmOpen(false); return; }
        navigate('/professor/exams');
    };

    const openGenerateForm = async (attemptNumber: number) => {
        if (!exam) return;
        const counts: Record<string, number> = {};
        exam.exam_subjects.forEach(s => { counts[s.subject_id] = 10; });
        setGenPerSubjectCounts(counts);
        setGenAllocMode('equal');
        setGenTotalQuestions(20);
        setGenerateError(null);
        setShowGenerateForm(attemptNumber);

        setIsFetchingStats(true);
        const stats: Record<string, { total: number, coStats: Record<string, number>, moStats: Record<string, number>, raw: QuestionWithOutcomes[] }> = {};
        for (const s of exam.exam_subjects) {
            const { data } = await fetchQuestionsBySubject(s.subject_id);
            if (data) {
                const coStats: Record<string, number> = {};
                const moStats: Record<string, number> = {};
                data.forEach(q => {
                    const co = q.course_outcomes?.title || 'Uncategorized CO';
                    const mo = q.module_outcomes ? `MO${(q.course_outcomes?.order_index ?? 0) + 1}${q.module_outcomes.order_index + 1}` : 'Uncategorized MO';
                    coStats[co] = (coStats[co] || 0) + 1;
                    moStats[mo] = (moStats[mo] || 0) + 1;
                });
                stats[s.subject_id] = { total: data.length, coStats, moStats, raw: data };
            }
        }
        setAvailableQuestionsStats(stats);
        // Init per-MO counts to 0 for every MO found in the fetched stats
        const moCounts: Record<string, number> = {};
        for (const statData of Object.values(stats)) {
            const seen = new Set<string>();
            for (const q of statData.raw) {
                if (!seen.has(q.module_outcome_id)) {
                    seen.add(q.module_outcome_id);
                    moCounts[q.module_outcome_id] = 0;
                }
            }
        }
        setGenPerMOCounts(moCounts);
        setIsFetchingStats(false);
    };

    const handleGeneratePapers = async (attemptNumber: number) => {
        if (!exam) return;
        const totalForValidation = genAllocMode === 'equal'
            ? genTotalQuestions
            : genAllocMode === 'per_subject'
                ? Object.values(genPerSubjectCounts).reduce((s, n) => s + (n || 0), 0)
                : Object.values(genPerMOCounts).reduce((s, n) => s + (n || 0), 0);
        if (totalForValidation > 100) {
            setGenerateError('Total questions per set cannot exceed 100.');
            return;
        }
        setIsGenerating(true);
        setGenerateError(null);
        const subjectIds = exam.exam_subjects.map(s => s.subject_id);
        const allocationConfig: AllocationConfig = genAllocMode === 'equal'
            ? { mode: 'equal', total: genTotalQuestions }
            : genAllocMode === 'per_subject'
                ? { mode: 'per_subject', counts: { ...genPerSubjectCounts } }
                : { mode: 'per_mo', mo_counts: { ...genPerMOCounts } };
        const { error } = await generateExamPapersForAttempt(exam.id, attemptNumber, subjectIds, allocationConfig, exam.num_sets);
        if (error) { setGenerateError(error); setIsGenerating(false); return; }
        await loadExam();
        setIsGenerating(false);
        setShowGenerateForm(null);
        setShuffledMap({});
    };

    const handleDeleteAttemptPapers = async (attemptNumber: number) => {
        if (!exam) return;
        setIsDeletingAttempt(attemptNumber);
        await deleteAttemptPapers(exam.id, attemptNumber);
        await loadExam();
        setIsDeletingAttempt(null);
        setActiveSet(0);
        setShuffledMap({});
    };

    // ── Grade answer viewer / editor helpers ──

    const GRADE_ANSWER_LETTERS = ['A', 'B', 'C', 'D', 'E'];

    async function handleToggleGradeView(gradeKey: string, attemptNum: number, setNumber: number) {
        if (expandedGradeKey === gradeKey) {
            setExpandedGradeKey(null);
            setEditingGradeKey(null);
            return;
        }
        setExpandedGradeKey(gradeKey);
        const cacheKey = `${attemptNum}-${setNumber}`;
        if (!(cacheKey in answerKeyCache)) {
            setLoadingAnswerKey(cacheKey);
            const { data } = await fetchSetAnswerKey(examId!, attemptNum, setNumber);
            setAnswerKeyCache(prev => ({ ...prev, [cacheKey]: data }));
            setLoadingAnswerKey(null);
        }
    }

    function handleStartEditGrade(gradeKey: string, answers: Record<string, number>) {
        setEditingGradeKey(gradeKey);
        setEditingAnswers({ ...answers });
    }

    function handleToggleAnswerCell(qId: string) {
        setEditingAnswers(prev => {
            const current = prev[qId] ?? -1;
            const next = current >= 4 ? -1 : current + 1;
            return { ...prev, [qId]: next };
        });
    }

    async function handleSaveGrade(attemptNum: number, studentId: string, setNumber: number) {
        const cacheKey = `${attemptNum}-${setNumber}`;
        const answerKey = answerKeyCache[cacheKey];
        if (!answerKey) return;
        setEditingSaving(true);
        const letters = answerKey.questionIds.map(qId => {
            const idx = editingAnswers[qId] ?? -1;
            return idx >= 0 ? (GRADE_ANSWER_LETTERS[idx] ?? '') : '';
        });
        const { score, totalItems, answers } = gradeOMR(answerKey.questionIds, letters, answerKey.questions);
        const { error } = await saveOMRSubmission({
            examId: examId!,
            studentId,
            attemptNumber: attemptNum,
            setNumber,
            answers,
            score,
            totalItems,
        });
        setEditingSaving(false);
        if (error) { alert(`Save failed: ${error}`); return; }
        setEditingGradeKey(null);
        await loadGradesOnly();
    }

    async function handleBulkDeleteConfirmed() {
        setIsBulkDeleteOpen(false);
        setIsBulkDeleting(true);
        const ops: Promise<{ error: string | null }>[] = [];
        for (const [attemptStr, attemptRows] of Object.entries(gradesData)) {
            for (const { enrollment, submission } of attemptRows) {
                if (!submission) continue;
                const gk = `${attemptStr}-${enrollment.student_id}`;
                if (selectedGradeKeys.has(gk)) {
                    ops.push(deleteSubmission({ examId: examId!, studentId: enrollment.student_id, attemptNumber: Number(attemptStr) }));
                }
            }
        }
        await Promise.all(ops);
        setIsBulkDeleting(false);
        setSelectedGradeKeys(new Set());
        setSelectModeAttempt(null);
        setExpandedGradeKey(null);
        setEditingGradeKey(null);
        await loadGradesOnly();
    }

    const statusColor = exam.status === 'unlocked' ? '#16a34a' : '#f59e0b';
    const statusLabel = exam.status === 'unlocked' ? 'Unlocked' : 'Locked';
    const attemptStatus = attemptStatusMap[activeAttempt] ?? 'draft';

    const deployedAttempts = exam.exam_attempts
        .filter(a => a.status === 'deployed' || a.status === 'done')
        .sort((a, b) => a.attempt_number - b.attempt_number);

    const TAB_LABELS: Record<Tab, string> = { overview: 'Overview', papers: 'Exams', students: 'Students', scan: 'Scan OMR', analysis: 'Analysis' };

    return (
        <div className="qb-container create-question-wrapper">
            <button type="button" className="btn-back" onClick={() => navigate('/professor/exams')}>
                <svg fill="none" strokeWidth="2" stroke="currentColor" viewBox="0 0 24 24" width="20" height="20">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
                </svg>
                Back to Exams
            </button>

            {/* ── Header ── */}
            <div className="cs-header" style={{ marginBottom: '8px' }}>
                <div>
                    <h2 style={{ marginBottom: '6px' }}>{exam.title}</h2>
                    <p style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap', margin: 0 }}>
                        <span className="subject-code" style={{ marginBottom: 0 }}>{exam.code}</span>
                        <span style={{ fontWeight: 600, fontSize: '0.85rem', color: statusColor }}>{statusLabel}</span>
                    </p>
                </div>
            </div>

            {/* ── Tab nav ── */}
            <div style={{ display: 'flex', borderBottom: '2px solid var(--prof-border)', marginBottom: '24px' }}>
                {(['overview', 'papers', 'scan', 'analysis', 'students'] as Tab[]).map(t => {
                    const isActive = activeTab === t;
                    return (
                        <button
                            key={t}
                            onClick={() => {
                                if (activeTab === 'scan' && isScannerBusy && t !== activeTab) {
                                    setPendingTab(t);
                                } else {
                                    if (t === 'scan' && deployedAttempts.length > 0) {
                                        const openAttempt = deployedAttempts.find(a => a.status === 'deployed');
                                        const target = openAttempt ?? deployedAttempts[deployedAttempts.length - 1];
                                        setScannerAttempt(target.attempt_number);
                                    }
                                    navigate(`/professor/exams/${examId}/${t}`);
                                }
                            }}
                            style={{
                                padding: '11px 20px',
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
                            {TAB_LABELS[t]}
                        </button>
                    );
                })}
            </div>

            {/* ══════════════════════════════════════════════
                OVERVIEW TAB
            ══════════════════════════════════════════════ */}
            {activeTab === 'overview' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: '20px', alignItems: 'start' }}>

                    {/* ── Left column: Student Grades ── */}
                    <div>
                        {deployedAttempts.length === 0 ? (
                            <div className="cs-card" style={{ padding: '48px 24px', textAlign: 'center' }}>
                                <p style={{ margin: '0 0 6px', fontSize: '0.92rem', color: 'var(--prof-text-muted)' }}>No grades yet.</p>
                                <p style={{ margin: 0, fontSize: '0.83rem', color: 'var(--prof-text-muted)' }}>Deploy an attempt in the Exams tab, then scan OMR sheets to record grades.</p>
                            </div>
                        ) : (
                            <div className="cs-card" style={{ padding: 0, overflow: 'hidden' }}>
                                {/* ── Header ── */}
                                <div style={{ padding: '10px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--prof-border)' }}>
                                    <p style={{ margin: 0, fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--prof-text-muted)' }}>Student Grades</p>
                                    {isLoadingGrades && (
                                        <span style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.75rem', color: 'var(--prof-text-muted)' }}>
                                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ animation: 'spin 1s linear infinite' }}><path d="M21 12a9 9 0 1 1-6.219-8.56" /></svg>
                                            Loading
                                        </span>
                                    )}
                                </div>
                                {/* ── Attempt filter bar ── */}
                                {(() => {
                                    const activeNum = gradesAttemptFilter ?? deployedAttempts[0]?.attempt_number;
                                    const activeAttemptData = deployedAttempts.find(a => a.attempt_number === activeNum);
                                    if (!activeAttemptData) return null;
                                    const { attempt_number, status } = activeAttemptData;
                                    const isDone = status === 'done';
                                    const statusColor = isDone ? '#2563eb' : '#16a34a';
                                    const statusBg = isDone ? '#eff6ff' : '#f0fdf4';
                                    const statusBdr = isDone ? '#bfdbfe' : '#bbf7d0';
                                    const rows = gradesData[attempt_number] ?? [];
                                    const isSelecting = selectModeAttempt === attempt_number;
                                    const submittedRows = rows.filter(r => r.submission != null);
                                    const submittedKeys = submittedRows.map(r => `${attempt_number}-${r.enrollment.student_id}`);
                                    const selectedCount = submittedKeys.filter(k => selectedGradeKeys.has(k)).length;
                                    const allSelected = submittedKeys.length > 0 && submittedKeys.every(k => selectedGradeKeys.has(k));
                                    const page = gradePageMap[attempt_number] ?? 0;
                                    const totalGradePages = Math.ceil(rows.length / GRADES_PER_PAGE);
                                    const pagedRows = rows.slice(page * GRADES_PER_PAGE, (page + 1) * GRADES_PER_PAGE);
                                    const colCount = isSelecting ? 8 : 7;
                                    return (
                                        <>
                                            {/* Filter pills + action buttons */}
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 16px', background: '#f8fafc', borderBottom: '1px solid var(--prof-border)', flexWrap: 'wrap', gap: '6px' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                                                    {Array.from({ length: exam.max_attempts }, (_, i) => i + 1).map(n => {
                                                        const isActive = activeNum === n;
                                                        const nStatus = attemptStatusMap[n] ?? 'draft';
                                                        const isDeployed = nStatus === 'deployed' || nStatus === 'done';
                                                        return (
                                                            <button
                                                                key={n}
                                                                disabled={!isDeployed}
                                                                onClick={() => { setGradesAttemptFilter(n); setGradesSummaryMode(false); setSelectModeAttempt(null); setSelectedGradeKeys(new Set()); setExpandedGradeKey(null); setEditingGradeKey(null); }}
                                                                style={{ padding: '3px 11px', borderRadius: '9px', border: `1px solid ${isActive && !gradesSummaryMode ? '#2563eb' : 'var(--prof-border)'}`, background: isActive && !gradesSummaryMode ? '#2563eb' : '#fff', color: isActive && !gradesSummaryMode ? '#fff' : isDeployed ? 'var(--prof-text-main)' : '#94a3b8', cursor: isDeployed ? 'pointer' : 'not-allowed', fontSize: '0.77rem', fontWeight: 600, opacity: !isDeployed ? 0.5 : 1 }}
                                                            >
                                                                Attempt {n}
                                                            </button>
                                                        );
                                                    })}
                                                    <button
                                                        onClick={() => { setGradesSummaryMode(v => !v); setSelectModeAttempt(null); setSelectedGradeKeys(new Set()); setExpandedGradeKey(null); setEditingGradeKey(null); }}
                                                        style={{ padding: '3px 11px', borderRadius: '9px', border: `1px solid ${gradesSummaryMode ? '#7c3aed' : 'var(--prof-border)'}`, background: gradesSummaryMode ? '#7c3aed' : '#fff', color: gradesSummaryMode ? '#fff' : 'var(--prof-text-main)', cursor: 'pointer', fontSize: '0.77rem', fontWeight: 600 }}
                                                    >
                                                        Summary
                                                    </button>
                                                    {!gradesSummaryMode && (
                                                        <span style={{ fontSize: '0.7rem', fontWeight: 600, color: statusColor, background: statusBg, padding: '1px 7px', borderRadius: '9px', border: `1px solid ${statusBdr}` }}>
                                                            {isDone ? 'Closed' : 'Open'}
                                                        </span>
                                                    )}
                                                </div>
                                                <div style={{ display: 'flex', gap: '5px', alignItems: 'center' }}>
                                                    {isSelecting ? (
                                                        <>
                                                            {selectedCount > 0 && (
                                                                <button
                                                                    className="btn-primary danger-btn"
                                                                    style={{ padding: '4px 10px', fontSize: '0.77rem', height: '26px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                                                                    onClick={() => setIsBulkDeleteOpen(true)}
                                                                    disabled={isBulkDeleting}
                                                                >
                                                                    <svg fill="none" strokeWidth="2" stroke="currentColor" viewBox="0 0 24 24" width="13" height="13"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" /><path d="M10 11v6M14 11v6" /><path d="M9 6V4h6v2" /></svg>
                                                                    Delete ({selectedCount})
                                                                </button>
                                                            )}
                                                            <button
                                                                className="btn-secondary"
                                                                style={{ padding: '4px 10px', fontSize: '0.77rem', height: '26px' }}
                                                                onClick={() => { setSelectModeAttempt(null); setSelectedGradeKeys(new Set()); }}
                                                            >
                                                                Cancel
                                                            </button>
                                                        </>
                                                    ) : (
                                                        <>
                                                            {submittedRows.length > 0 && (
                                                                <button
                                                                    className="btn-secondary"
                                                                    style={{ padding: '4px 10px', fontSize: '0.77rem', height: '26px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                                                                    onClick={() => { setSelectModeAttempt(attempt_number); setSelectedGradeKeys(new Set()); setExpandedGradeKey(null); setEditingGradeKey(null); }}
                                                                >
                                                                    <svg fill="none" strokeWidth="2" stroke="currentColor" viewBox="0 0 24 24" width="13" height="13"><rect x="3" y="3" width="18" height="18" rx="2" /><polyline points="9 11 12 14 22 4" /></svg>
                                                                    Select
                                                                </button>
                                                            )}
                                                            <button
                                                                className="btn-secondary"
                                                                style={{ padding: '4px 10px', fontSize: '0.77rem', height: '26px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                                                                onClick={() => { setScannerAttempt(attempt_number); navigate(`/professor/exams/${examId}/scan`); }}
                                                            >
                                                                <svg fill="none" strokeWidth="2" stroke="currentColor" viewBox="0 0 24 24" width="13" height="13">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 013.75 9.375v-4.5zM3.75 14.625c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5a1.125 1.125 0 01-1.125-1.125v-4.5zM13.5 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 0113.5 9.375v-4.5z" />
                                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 6.75h.75v.75h-.75v-.75zM6.75 16.5h.75v.75h-.75V16.5zM16.5 6.75h.75v.75h-.75v-.75zM13.5 13.5h.75v.75h-.75v-.75zM13.5 19.5h.75v.75h-.75v-.75zM19.5 13.5h.75v.75h-.75v-.75zM19.5 19.5h.75v.75h-.75v-.75zM16.5 16.5h.75v.75h-.75v-.75z" />
                                                                </svg>
                                                                Scan
                                                            </button>
                                                            {gradesSummaryMode ? (() => {
                                                                const allReleased = deployedAttempts.every(a => attemptGradesReleasedMap[a.attempt_number]?.released);
                                                                return (
                                                                    <button
                                                                        className="btn-secondary"
                                                                        disabled={isTogglingAllRelease}
                                                                        onClick={handleToggleAllGradeRelease}
                                                                        style={{ padding: '4px 10px', fontSize: '0.77rem', height: '26px', display: 'inline-flex', alignItems: 'center', gap: '4px', color: allReleased ? '#15803d' : 'var(--prof-text-main)', borderColor: allReleased ? '#86efac' : undefined, background: allReleased ? '#f0fdf4' : undefined, opacity: isTogglingAllRelease ? 0.6 : 1 }}
                                                                        title={allReleased ? 'All grades visible to students — click to hide all' : 'Release grades for all attempts'}
                                                                    >
                                                                        {allReleased ? (
                                                                            <svg fill="none" strokeWidth="2" stroke="currentColor" viewBox="0 0 24 24" width="13" height="13"><path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                                                                        ) : (
                                                                            <svg fill="none" strokeWidth="2" stroke="currentColor" viewBox="0 0 24 24" width="13" height="13"><path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" /></svg>
                                                                        )}
                                                                        {isTogglingAllRelease ? '...' : allReleased ? 'All Released' : 'Release All'}
                                                                    </button>
                                                                );
                                                            })() : (() => {
                                                                const releaseInfo = attemptGradesReleasedMap[attempt_number];
                                                                const isReleased = releaseInfo?.released ?? false;
                                                                const isToggling = isTogglingRelease === attempt_number;
                                                                return (
                                                                    <button
                                                                        className="btn-secondary"
                                                                        disabled={isToggling}
                                                                        onClick={() => handleToggleGradeRelease(attempt_number)}
                                                                        style={{ padding: '4px 10px', fontSize: '0.77rem', height: '26px', display: 'inline-flex', alignItems: 'center', gap: '4px', color: isReleased ? '#15803d' : 'var(--prof-text-main)', borderColor: isReleased ? '#86efac' : undefined, background: isReleased ? '#f0fdf4' : undefined, opacity: isToggling ? 0.6 : 1 }}
                                                                        title={isReleased ? 'Grades are visible to students — click to hide' : 'Grades are hidden from students — click to release'}
                                                                    >
                                                                        {isReleased ? (
                                                                            <svg fill="none" strokeWidth="2" stroke="currentColor" viewBox="0 0 24 24" width="13" height="13"><path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                                                                        ) : (
                                                                            <svg fill="none" strokeWidth="2" stroke="currentColor" viewBox="0 0 24 24" width="13" height="13"><path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" /></svg>
                                                                        )}
                                                                        {isToggling ? '...' : isReleased ? 'Grades Released' : 'Release Grades'}
                                                                    </button>
                                                                );
                                                            })()}
                                                        </>
                                                    )}
                                                </div>
                                            </div>
                                            {/* ── Table ── */}
                                            {gradesSummaryMode ? (() => {
                                                const studentMap: Record<string, AttemptGradeRow['enrollment']> = {};
                                                const subMap: Record<string, Record<number, AttemptGradeRow['submission']>> = {};
                                                for (const [attemptKey, attemptRows] of Object.entries(gradesData)) {
                                                    const aNum = Number(attemptKey);
                                                    for (const { enrollment, submission } of attemptRows) {
                                                        if (!studentMap[enrollment.student_id]) studentMap[enrollment.student_id] = enrollment;
                                                        if (!subMap[enrollment.student_id]) subMap[enrollment.student_id] = {};
                                                        subMap[enrollment.student_id][aNum] = submission;
                                                    }
                                                }
                                                const allStudents = Object.values(studentMap).sort((a, b) =>
                                                    (a.student?.full_name ?? '').localeCompare(b.student?.full_name ?? '')
                                                );
                                                const thStyle: CSSProperties = { textAlign: 'left', padding: '6px 10px', fontWeight: 700, borderBottom: '1px solid var(--prof-border)', fontSize: '0.7rem', color: 'var(--prof-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', background: 'var(--prof-surface)' };
                                                if (allStudents.length === 0 && !isLoadingGrades) {
                                                    return <p style={{ color: 'var(--prof-text-muted)', fontSize: '0.82rem', margin: 0, padding: '12px 16px' }}>No students enrolled.</p>;
                                                }
                                                return (
                                                    <div style={{ overflowX: 'auto' }}>
                                                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                                                            <thead>
                                                                <tr>
                                                                    <th style={{ ...thStyle, padding: '6px 10px 6px 16px' }}>Student</th>
                                                                    <th style={thStyle}>ID</th>
                                                                    {deployedAttempts.map(a => (
                                                                        <th key={a.attempt_number} style={{ ...thStyle, textAlign: 'center' }}>Attempt {a.attempt_number}</th>
                                                                    ))}
                                                                </tr>
                                                            </thead>
                                                            <tbody>
                                                                {allStudents.map(enrollment => (
                                                                    <tr key={enrollment.student_id} style={{ borderBottom: '1px solid var(--prof-border)' }}>
                                                                        <td style={{ padding: '7px 10px 7px 16px', fontSize: '0.83rem', color: 'var(--prof-text-main)' }}>{enrollment.student?.full_name ?? '—'}</td>
                                                                        <td style={{ padding: '7px 10px', fontFamily: 'monospace', fontSize: '0.77rem', color: 'var(--prof-text-muted)' }}>{enrollment.student?.student_id ?? '—'}</td>
                                                                        {deployedAttempts.map(a => {
                                                                            const sub = subMap[enrollment.student_id]?.[a.attempt_number];
                                                                            const isDone = a.status === 'done';
                                                                            if (!sub) {
                                                                                return (
                                                                                    <td key={a.attempt_number} style={{ padding: '7px 10px', textAlign: 'center' }}>
                                                                                        {isDone
                                                                                            ? <span style={{ fontSize: '0.74rem', fontWeight: 600, color: '#64748b', background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '2px 7px' }}>DNT</span>
                                                                                            : <span style={{ color: '#cbd5e1', fontSize: '0.78rem' }}>—</span>}
                                                                                    </td>
                                                                                );
                                                                            }
                                                                            if (sub.score == null || !sub.total_items) {
                                                                                return <td key={a.attempt_number} style={{ padding: '7px 10px', textAlign: 'center' }}><span style={{ color: '#cbd5e1' }}>—</span></td>;
                                                                            }
                                                                            const pct = Math.round((sub.score / sub.total_items) * 100);
                                                                            const gc = getGradeColors(pct, passingRate);
                                                                            return (
                                                                                <td key={a.attempt_number} style={{ padding: '7px 10px', textAlign: 'center' }}>
                                                                                    <span style={{ fontSize: '0.78rem', fontWeight: 600, color: gc.text, background: gc.bg, border: `1px solid ${gc.border}`, borderRadius: '8px', padding: '2px 7px' }}>
                                                                                        {sub.score}/{sub.total_items}
                                                                                    </span>
                                                                                </td>
                                                                            );
                                                                        })}
                                                                    </tr>
                                                                ))}
                                                            </tbody>
                                                        </table>
                                                    </div>
                                                );
                                            })() : rows.length === 0 && !isLoadingGrades ? (
                                                <p style={{ color: 'var(--prof-text-muted)', fontSize: '0.82rem', margin: 0, padding: '12px 16px' }}>No students enrolled.</p>
                                            ) : (
                                                <>
                                                    <div style={{ overflowX: 'auto' }}>
                                                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                                                            <thead>
                                                                <tr>
                                                                    {isSelecting && (
                                                                        <th style={{ width: '32px', padding: '6px 10px 6px 16px', borderBottom: '1px solid var(--prof-border)' }}>
                                                                            <input type="checkbox" checked={allSelected} style={{ cursor: 'pointer', width: '14px', height: '14px' }} onChange={() => {
                                                                                if (allSelected) {
                                                                                    setSelectedGradeKeys(prev => { const n = new Set(prev); submittedKeys.forEach(k => n.delete(k)); return n; });
                                                                                } else {
                                                                                    setSelectedGradeKeys(prev => { const n = new Set(prev); submittedKeys.forEach(k => n.add(k)); return n; });
                                                                                }
                                                                            }} />
                                                                        </th>
                                                                    )}
                                                                    <th style={{ textAlign: 'left', padding: '6px 10px 6px 16px', fontWeight: 700, borderBottom: '1px solid var(--prof-border)', fontSize: '0.7rem', color: 'var(--prof-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Student</th>
                                                                    <th style={{ textAlign: 'left', padding: '6px 10px', fontWeight: 700, borderBottom: '1px solid var(--prof-border)', fontSize: '0.7rem', color: 'var(--prof-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>ID</th>
                                                                    <th style={{ textAlign: 'center', padding: '6px 10px', fontWeight: 700, borderBottom: '1px solid var(--prof-border)', fontSize: '0.7rem', color: 'var(--prof-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Set</th>
                                                                    <th style={{ textAlign: 'center', padding: '6px 10px', fontWeight: 700, borderBottom: '1px solid var(--prof-border)', fontSize: '0.7rem', color: 'var(--prof-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Scanned</th>
                                                                    <th style={{ textAlign: 'center', padding: '6px 10px', fontWeight: 700, borderBottom: '1px solid var(--prof-border)', fontSize: '0.7rem', color: 'var(--prof-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Score</th>
                                                                    <th style={{ textAlign: 'center', padding: '6px 10px', fontWeight: 700, borderBottom: '1px solid var(--prof-border)', fontSize: '0.7rem', color: 'var(--prof-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>%</th>
                                                                    <th style={{ padding: '6px 16px 6px 10px', borderBottom: '1px solid var(--prof-border)' }}></th>
                                                                </tr>
                                                            </thead>
                                                            <tbody>
                                                                {pagedRows.map(({ enrollment, submission }) => {
                                                                    const gradeKey = `${attempt_number}-${enrollment.student_id}`;
                                                                    const isExpanded = expandedGradeKey === gradeKey;
                                                                    const isEditing = editingGradeKey === gradeKey;
                                                                    const isSelected = selectedGradeKeys.has(gradeKey);
                                                                    const cacheKey = submission ? `${attempt_number}-${submission.set_number}` : null;
                                                                    const answerKey = cacheKey ? (answerKeyCache[cacheKey] ?? null) : null;
                                                                    const isLoadingKey = cacheKey ? loadingAnswerKey === cacheKey : false;
                                                                    return (
                                                                        <Fragment key={enrollment.student_id}>
                                                                            <tr
                                                                                style={{ borderBottom: isExpanded ? 'none' : '1px solid var(--prof-border, #eee)', background: isSelected ? '#eff6ff' : undefined, cursor: isSelecting && submission ? 'pointer' : undefined }}
                                                                                onClick={() => {
                                                                                    if (!isSelecting || !submission) return;
                                                                                    setSelectedGradeKeys(prev => { const n = new Set(prev); if (n.has(gradeKey)) n.delete(gradeKey); else n.add(gradeKey); return n; });
                                                                                }}
                                                                            >
                                                                                {isSelecting && (
                                                                                    <td style={{ padding: '7px 10px 7px 16px', width: '32px' }}>
                                                                                        {submission && <input type="checkbox" checked={isSelected} onChange={() => { }} style={{ cursor: 'pointer', width: '14px', height: '14px' }} />}
                                                                                    </td>
                                                                                )}
                                                                                <td style={{ padding: '7px 10px 7px 16px', fontSize: '0.83rem' }}>{enrollment.student?.full_name ?? '—'}</td>
                                                                                <td style={{ padding: '7px 10px', fontFamily: 'monospace', fontSize: '0.77rem', color: 'var(--prof-text-muted)' }}>{enrollment.student?.student_id ?? '—'}</td>
                                                                                <td style={{ padding: '7px 10px', textAlign: 'center', fontSize: '0.83rem' }}>
                                                                                    {submission ? <strong style={{ color: 'var(--prof-text-main)' }}>{setNumberToLetter(submission.set_number)}</strong> : <span style={{ color: '#cbd5e1' }}>—</span>}
                                                                                </td>
                                                                                <td style={{ padding: '7px 10px', textAlign: 'center', fontSize: '0.78rem', color: 'var(--prof-text-muted)' }}>
                                                                                    {submission?.submitted_at ? new Date(submission.submitted_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : <span style={{ color: '#cbd5e1' }}>—</span>}
                                                                                </td>
                                                                                <td style={{ padding: '7px 10px', textAlign: 'center', fontSize: '0.82rem', fontWeight: 700, color: 'var(--prof-text-main)' }}>
                                                                                    {submission?.score != null
                                                                                        ? `${submission.score} / ${submission.total_items}`
                                                                                        : !submission && isDone
                                                                                            ? <span style={{ fontSize: '0.74rem', fontWeight: 600, color: '#64748b', background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '2px 7px' }}>Did Not Take</span>
                                                                                            : <span style={{ color: '#cbd5e1' }}>—</span>}
                                                                                </td>
                                                                                <td style={{ padding: '7px 10px', textAlign: 'center' }}>
                                                                                    {submission?.score != null ? (() => {
                                                                                        const pct = (submission.total_items ?? 0) > 0 ? Math.round((submission.score / submission.total_items!) * 100) : 0;
                                                                                        const gc = getGradeColors(pct, passingRate);
                                                                                        return <span style={{ fontSize: '0.78rem', fontWeight: 600, color: gc.text, background: gc.bg, border: `1px solid ${gc.border}`, borderRadius: '8px', padding: '2px 7px' }}>{pct}%</span>;
                                                                                    })() : <span style={{ color: '#cbd5e1', fontSize: '0.78rem' }}>—</span>}
                                                                                </td>
                                                                                <td style={{ padding: '7px 16px 7px 10px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                                                                                    {submission && !isSelecting ? (
                                                                                        <button onClick={e => { e.stopPropagation(); handleToggleGradeView(gradeKey, attempt_number, submission.set_number); }} style={{ padding: '3px 10px', borderRadius: '6px', border: '1px solid var(--prof-border)', background: isExpanded ? '#eff6ff' : '#fff', color: isExpanded ? '#2563eb' : 'var(--prof-text-main)', cursor: 'pointer', fontSize: '0.78rem', fontWeight: 500 }}>
                                                                                            {isExpanded ? 'Hide' : 'View'}
                                                                                        </button>
                                                                                    ) : !submission && isDone && !isSelecting ? (
                                                                                        <span style={{ fontSize: '0.72rem', color: '#94a3b8', fontStyle: 'italic' }}>not submitted</span>
                                                                                    ) : null}
                                                                                </td>
                                                                            </tr>
                                                                                {isExpanded && submission && !isSelecting && (
                                                                                    <tr style={{ borderBottom: '1px solid var(--prof-border,#e2e8f0)' }}>
                                                                                        <td colSpan={colCount} style={{ padding: '0', background: '#f8fafc', borderTop: '1px solid var(--prof-border,#e2e8f0)' }}>
                                                                                            {isLoadingKey ? (
                                                                                                <div style={{ padding: '18px 16px', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--prof-text-muted)', fontSize: '0.83rem' }}>
                                                                                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ animation: 'spin 1s linear infinite', flexShrink: 0 }}><path d="M21 12a9 9 0 1 1-6.219-8.56" /></svg>
                                                                                                    Loading answer key…
                                                                                                </div>
                                                                                            ) : !answerKey ? (
                                                                                                <div style={{ padding: '16px', color: '#dc2626', fontSize: '0.83rem' }}>Answer key not available for this set.</div>
                                                                                            ) : (() => {
                                                                                                const activeAnswers = isEditing ? editingAnswers : submission.answers;
                                                                                                let correct = 0, wrong = 0, blank = 0;
                                                                                                answerKey.questionIds.forEach(qId => {
                                                                                                    const ch = activeAnswers[qId] ?? -1;
                                                                                                    if (ch === -1) { blank++; return; }
                                                                                                    if (answerKey.questions[qId]?.correct_choice === ch) correct++; else wrong++;
                                                                                                });
                                                                                                const total = answerKey.questionIds.length;
                                                                                                const pct = total > 0 ? Math.round((correct / total) * 100) : 0;
                                                                                                const pctColor = getGradeColors(pct, passingRate).text;
                                                                                                return (
                                                                                                    <>
                                                                                                        {/* ── Header ── */}
                                                                                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', borderBottom: '1px solid var(--prof-border,#e2e8f0)', flexWrap: 'wrap', gap: '12px' }}>
                                                                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '14px', fontSize: '0.82rem', flexWrap: 'wrap' }}>
                                                                                                                <span style={{ fontWeight: 700, color: '#0f172a' }}>{correct} / {total}</span>
                                                                                                                <span style={{ fontWeight: 600, color: pctColor }}>{pct}%</span>
                                                                                                                <span style={{ color: '#15803d' }}>✓ {correct} correct</span>
                                                                                                                <span style={{ color: '#dc2626' }}>✗ {wrong} wrong</span>
                                                                                                                {blank > 0 && <span style={{ color: '#94a3b8' }}>— {blank} blank</span>}
                                                                                                            </div>
                                                                                                            <div style={{ display: 'flex', gap: '6px' }}>
                                                                                                                {isEditing ? (
                                                                                                                    <>
                                                                                                                        <button onClick={() => setEditingGradeKey(null)} style={{ padding: '4px 12px', borderRadius: '6px', border: '1px solid var(--prof-border,#e2e8f0)', background: '#fff', cursor: 'pointer', fontSize: '0.78rem', fontWeight: 500, color: 'var(--prof-text-main)' }}>Cancel</button>
                                                                                                                        <button onClick={() => handleSaveGrade(attempt_number, enrollment.student_id, submission.set_number)} disabled={editingSaving} style={{ padding: '4px 14px', borderRadius: '6px', border: 'none', background: '#16a34a', color: '#fff', cursor: editingSaving ? 'not-allowed' : 'pointer', fontSize: '0.78rem', fontWeight: 600, opacity: editingSaving ? 0.7 : 1 }}>
                                                                                                                            {editingSaving ? 'Saving…' : 'Save'}
                                                                                                                        </button>
                                                                                                                    </>
                                                                                                                ) : (
                                                                                                                    <button onClick={() => handleStartEditGrade(gradeKey, submission.answers)} style={{ padding: '4px 12px', borderRadius: '6px', border: '1px solid var(--prof-border,#e2e8f0)', background: '#fff', cursor: 'pointer', fontSize: '0.78rem', fontWeight: 500, color: 'var(--prof-text-main)' }}>Edit Answers</button>
                                                                                                                )}
                                                                                                            </div>
                                                                                                        </div>
                                                                                                        {/* ── Answer grid + Pie chart ── */}
                                                                                                        <div style={{ display: 'flex', gap: '24px', padding: '12px 16px', alignItems: 'stretch' }}>
                                                                                                        <div style={{ overflowX: 'auto', flexShrink: 0 }}>
                                                                                                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(10, 36px)', gap: '4px', minWidth: '400px' }}>
                                                                                                                {answerKey.questionIds.map((qId, qi) => {
                                                                                                                    const rawChoice = isEditing ? (editingAnswers[qId] ?? -1) : (submission.answers[qId] ?? -1);
                                                                                                                    const letter = rawChoice >= 0 ? (GRADE_ANSWER_LETTERS[rawChoice] ?? '') : '';
                                                                                                                    const correctNum = answerKey.questions[qId]?.correct_choice;
                                                                                                                    const correctLetter = correctNum != null ? (GRADE_ANSWER_LETTERS[correctNum] ?? '') : '';
                                                                                                                    const isC = letter !== '' && correctLetter !== '' && letter === correctLetter;
                                                                                                                    const isW = letter !== '' && correctLetter !== '' && letter !== correctLetter;
                                                                                                                    return (
                                                                                                                        <button
                                                                                                                            key={qId}
                                                                                                                            onClick={() => isEditing && handleToggleAnswerCell(qId)}
                                                                                                                            title={`Q${qi + 1}${correctLetter ? ` · Correct: ${correctLetter}` : ''}${isEditing ? ' · Click to change' : ''}`}
                                                                                                                            style={{
                                                                                                                                width: '36px', height: '42px',
                                                                                                                                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '1px',
                                                                                                                                border: `1px solid ${isC ? '#86efac' : isW ? '#fca5a5' : '#e2e8f0'}`,
                                                                                                                                borderRadius: '5px',
                                                                                                                                background: isC ? '#f0fdf4' : isW ? '#fff1f2' : '#fff',
                                                                                                                                cursor: isEditing ? 'pointer' : 'default',
                                                                                                                                outline: 'none',
                                                                                                                                padding: 0,
                                                                                                                            }}
                                                                                                                        >
                                                                                                                            <span style={{ fontSize: '0.52rem', color: '#94a3b8', fontWeight: 600, lineHeight: 1 }}>Q{qi + 1}</span>
                                                                                                                            <span style={{ fontSize: '0.88rem', fontWeight: 700, color: isC ? '#16a34a' : isW ? '#dc2626' : letter ? '#334155' : '#cbd5e1', lineHeight: 1 }}>{letter || '—'}</span>
                                                                                                                            <span style={{ fontSize: '0.52rem', lineHeight: 1, color: isW ? '#dc2626' : 'transparent' }}>{isW ? correctLetter : '·'}</span>
                                                                                                                        </button>
                                                                                                                    );
                                                                                                                })}
                                                                                                            </div>
                                                                                                            {isEditing && <p style={{ margin: '8px 0 0', fontSize: '0.72rem', color: '#94a3b8' }}>Click a cell to cycle: A → B → C → D → E → blank</p>}
                                                                                                        </div>
                                                                                                        <div style={{ flex: 1, minWidth: 0, padding: '0 8px', display: 'flex', alignItems: 'flex-start' }}>
                                                                                                            <MiniSubjectPieChart
                                                                                                                subjects={exam.exam_subjects.filter(es => es.subjects).map(es => ({ subject_id: es.subject_id, course_code: es.subjects!.course_code, course_title: es.subjects!.course_title }))}
                                                                                                                questionIds={answerKey.questionIds}
                                                                                                                questionMap={questionMap}
                                                                                                                answers={activeAnswers}
                                                                                                                passingRate={passingRate}
                                                                                                            />
                                                                                                        </div>
                                                                                                        </div>
                                                                                                    </>
                                                                                                );
                                                                                            })()}
                                                                                        </td>
                                                                                    </tr>
                                                                                )}
                                                                            </Fragment>
                                                                        );
                                                                    })}
                                                                </tbody>
                                                            </table>
                                                        </div>
                                                        {totalGradePages > 1 && (
                                                            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '10px', padding: '10px 16px', borderTop: '1px solid var(--prof-border)' }}>
                                                                <button className="btn-secondary" style={{ padding: '5px 14px', fontSize: '0.8rem' }} disabled={page === 0} onClick={() => setGradePageMap(prev => ({ ...prev, [attempt_number]: page - 1 }))}>Prev</button>
                                                                <span style={{ fontSize: '0.78rem', color: 'var(--prof-text-muted)', minWidth: '60px', textAlign: 'center' }}>{page + 1} / {totalGradePages}</span>
                                                                <button className="btn-secondary" style={{ padding: '5px 14px', fontSize: '0.8rem' }} disabled={page >= totalGradePages - 1} onClick={() => setGradePageMap(prev => ({ ...prev, [attempt_number]: page + 1 }))}>Next</button>
                                                            </div>
                                                        )}
                                                </>
                                            )}
                                        </>
                                        );
                                    })()}
                                </div>
                        )}
                    </div>

                    {/* ── Right column: Actions + Details ── */}
                    <div className="cs-card" style={{ padding: 0, overflow: 'hidden' }}>

                        {/* Status header strip */}
                        <div style={{
                            padding: '12px 16px',
                            display: 'flex', alignItems: 'center', gap: '8px',
                            background: exam.status === 'unlocked' ? '#f0fdf4' : '#fefce8',
                            borderBottom: `1px solid ${exam.status === 'unlocked' ? '#bbf7d0' : '#fde68a'}`,
                        }}>
                            {exam.status === 'unlocked' ? (
                                <svg fill="none" strokeWidth="2" stroke="#16a34a" viewBox="0 0 24 24" width="14" height="14"><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 10.5V6.75a4.5 4.5 0 119 0v3.75M3.75 21.75h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H3.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" /></svg>
                            ) : (
                                <svg fill="none" strokeWidth="2" stroke="#92400e" viewBox="0 0 24 24" width="14" height="14"><path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" /></svg>
                            )}
                            <span style={{ fontSize: '0.8rem', fontWeight: 700, color: exam.status === 'unlocked' ? '#15803d' : '#92400e', letterSpacing: '0.03em', textTransform: 'uppercase' }}>
                                {exam.status === 'unlocked' ? 'Unlocked' : 'Locked'}
                            </span>
                            <span style={{ fontSize: '0.75rem', color: exam.status === 'unlocked' ? '#16a34a' : '#a16207', marginLeft: '2px' }}>
                                {exam.status === 'unlocked' ? '— visible to students' : '— hidden from students'}
                            </span>
                        </div>

                        {/* Action buttons */}
                        <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: '6px', borderBottom: '1px solid var(--prof-border)' }}>
                            <button
                                style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '7px', padding: '7px 12px', fontSize: '0.83rem', justifyContent: 'flex-start', fontWeight: 600, borderRadius: '7px', border: '1px solid #93c5fd', background: '#dbeafe', color: '#1e40af', cursor: 'pointer' }}
                                onClick={() => navigate(`/professor/exams/${exam.id}/edit`)}
                            >
                                <svg fill="none" strokeWidth="2" stroke="currentColor" viewBox="0 0 24 24" width="14" height="14"><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125" /></svg>
                                Edit Exam
                            </button>
                            {exam.status === 'locked' ? (
                                <button
                                    style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '7px', padding: '7px 12px', fontSize: '0.83rem', justifyContent: 'flex-start', fontWeight: 600, borderRadius: '7px', border: '1px solid #86efac', background: '#dcfce7', color: '#166534', cursor: 'pointer' }}
                                    onClick={() => setIsUnlockConfirmOpen(true)}
                                >
                                    <svg fill="none" strokeWidth="2" stroke="currentColor" viewBox="0 0 24 24" width="14" height="14"><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 10.5V6.75a4.5 4.5 0 119 0v3.75M3.75 21.75h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H3.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" /></svg>
                                    Unlock Exam
                                </button>
                            ) : (
                                <button
                                    style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '7px', padding: '7px 12px', fontSize: '0.83rem', justifyContent: 'flex-start', fontWeight: 600, borderRadius: '7px', border: '1px solid #fcd34d', background: '#fef3c7', color: '#92400e', cursor: 'pointer' }}
                                    onClick={() => setIsLockConfirmOpen(true)}
                                >
                                    <svg fill="none" strokeWidth="2" stroke="currentColor" viewBox="0 0 24 24" width="14" height="14"><path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" /></svg>
                                    Lock Exam
                                </button>
                            )}
                            {exam.created_by === user?.id && (
                                <button
                                    style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '7px', padding: '7px 12px', fontSize: '0.83rem', justifyContent: 'flex-start', fontWeight: 600, borderRadius: '7px', border: '1px solid #fca5a5', background: '#fee2e2', color: '#991b1b', cursor: 'pointer' }}
                                    onClick={() => setIsDeleteConfirmOpen(true)}
                                >
                                    <svg fill="none" strokeWidth="2" stroke="currentColor" viewBox="0 0 24 24" width="14" height="14"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" /><path d="M10 11v6M14 11v6" /><path d="M9 6V4h6v2" /></svg>
                                    Delete Exam
                                </button>
                            )}
                        </div>

                        {/* Exam details list */}
                        <div style={{ padding: '12px 16px' }}>
                            <p style={{ margin: '0 0 10px', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--prof-text-muted)' }}>Exam Details</p>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
                                {[
                                    { label: 'Academic Year', value: exam.academic_year },
                                    { label: 'Term', value: exam.term },
                                    { label: 'Sets / Attempt', value: exam.num_sets === 0 ? <span style={{ color: '#ef4444' }}>Not set</span> : exam.num_sets },
                                    { label: 'Max Attempts', value: exam.max_attempts },
                                    { label: 'AI Analysis', value: exam.ai_analysis_enabled ? <span style={{ color: '#15803d', fontWeight: 600 }}>Enabled</span> : <span style={{ color: '#94a3b8' }}>Disabled</span> },
                                ].map(({ label, value }) => (
                                    <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '6px 0', borderBottom: '1px solid var(--prof-border)' }}>
                                        <span style={{ fontSize: '0.78rem', color: 'var(--prof-text-muted)', fontWeight: 500 }}>{label}</span>
                                        <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--prof-text-main)', textAlign: 'right' }}>{value}</span>
                                    </div>
                                ))}
                                <div style={{ paddingTop: '8px' }}>
                                    <span style={{ fontSize: '0.78rem', color: 'var(--prof-text-muted)', fontWeight: 500, display: 'block', marginBottom: '5px' }}>Subjects</span>
                                    {subjectTags.length === 0 ? (
                                        <span style={{ fontSize: '0.82rem', color: '#ef4444' }}>None linked</span>
                                    ) : (
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                                            {subjectTags.map(s => (
                                                <span key={s.subject_id} style={{ background: '#f1f5f9', padding: '2px 8px', borderRadius: '10px', fontSize: '0.75rem', color: '#475569', border: '1px solid #e2e8f0', fontWeight: 500 }}>
                                                    {s.subjects!.course_code}
                                                </span>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* ── Faculty section ── */}
                        {(() => {
                            const isMain = exam.created_by === user?.id;
                            const creatorProfile = allProfessors.find(p => p.id === exam.created_by);

                            const statusBadge = (status: ExamFacultyMember['status']) => {
                                if (status === 'accepted') return <span style={{ fontSize: '0.67rem', fontWeight: 600, background: '#dcfce7', color: '#15803d', border: '1px solid #86efac', borderRadius: '8px', padding: '1px 6px' }}>Accepted</span>;
                                if (status === 'declined') return <span style={{ fontSize: '0.67rem', fontWeight: 600, background: '#fee2e2', color: '#b91c1c', border: '1px solid #fca5a5', borderRadius: '8px', padding: '1px 6px' }}>Declined</span>;
                                return <span style={{ fontSize: '0.67rem', fontWeight: 600, background: '#fef9c3', color: '#854d0e', border: '1px solid #fde047', borderRadius: '8px', padding: '1px 6px' }}>Pending</span>;
                            };

                            const avatarColor = (name: string) => {
                                const palette = ['#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#ef4444', '#0ea5e9'];
                                return palette[(name.charCodeAt(0) + (name.charCodeAt(1) || 0)) % palette.length];
                            };
                            const initials = (name: string) =>
                                name.split(' ').filter(Boolean).map(w => w[0]).slice(0, 2).join('').toUpperCase() || '?';

                            return (
                                <div style={{ padding: '12px 16px', borderTop: '1px solid var(--prof-border)' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                                        <p style={{ margin: 0, fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--prof-text-muted)' }}>Faculty</p>
                                        {isMain && (
                                            <button
                                                onClick={() => { setIsInviteOpen(true); setProfessorQuery(''); setInvitePage(0); }}
                                                style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.72rem', fontWeight: 600, background: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe', borderRadius: '6px', padding: '3px 9px', cursor: 'pointer', transition: 'background 0.15s' }}
                                            >
                                                <svg fill="none" strokeWidth="2" stroke="currentColor" viewBox="0 0 24 24" width="11" height="11"><path strokeLinecap="round" strokeLinejoin="round" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" /></svg>
                                                Invite
                                            </button>
                                        )}
                                    </div>

                                    {/* Main professor */}
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '5px 0' }}>
                                        <div style={{ flexShrink: 0, width: '26px', height: '26px', borderRadius: '50%', background: avatarColor(creatorProfile?.full_name ?? creatorProfile?.email ?? 'U'), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.6rem', fontWeight: 700, color: '#fff', letterSpacing: '0.02em' }}>
                                            {initials(creatorProfile?.full_name ?? creatorProfile?.email ?? 'U')}
                                        </div>
                                        <span style={{ flex: 1, fontSize: '0.82rem', fontWeight: 500, color: 'var(--prof-text-main)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {creatorProfile?.full_name ?? creatorProfile?.email ?? 'Unknown'}
                                            {exam.created_by === user?.id && <span style={{ color: 'var(--prof-text-muted)', fontWeight: 400 }}> (You)</span>}
                                        </span>
                                        <span style={{ fontSize: '0.67rem', fontWeight: 600, background: '#dbeafe', color: '#1e40af', border: '1px solid #93c5fd', borderRadius: '8px', padding: '1px 7px', flexShrink: 0 }}>Main</span>
                                    </div>

                                    {/* Co-handlers */}
                                    {faculty.filter(f => f.status !== 'declined').map(f => {
                                        const fName = f.professor?.full_name ?? f.professor?.email ?? 'Unknown';
                                        return (
                                            <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '5px 0', borderTop: '1px solid var(--prof-border)' }}>
                                                <div style={{ flexShrink: 0, width: '26px', height: '26px', borderRadius: '50%', background: avatarColor(fName), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.6rem', fontWeight: 700, color: '#fff', letterSpacing: '0.02em' }}>
                                                    {initials(fName)}
                                                </div>
                                                <span style={{ flex: 1, fontSize: '0.82rem', color: 'var(--prof-text-main)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{fName}</span>
                                                {statusBadge(f.status)}
                                                {isMain && (
                                                    <button
                                                        onClick={() => setRemoveTarget({ id: f.id, name: fName })}
                                                        title="Remove co-handler"
                                                        style={{ flexShrink: 0, width: '22px', height: '22px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: '1px solid transparent', borderRadius: '5px', cursor: 'pointer', color: '#94a3b8', transition: 'all 0.15s' }}
                                                        onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#fee2e2'; (e.currentTarget as HTMLButtonElement).style.borderColor = '#fca5a5'; (e.currentTarget as HTMLButtonElement).style.color = '#b91c1c'; }}
                                                        onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'none'; (e.currentTarget as HTMLButtonElement).style.borderColor = 'transparent'; (e.currentTarget as HTMLButtonElement).style.color = '#94a3b8'; }}
                                                    >
                                                        <svg fill="none" strokeWidth="2" stroke="currentColor" viewBox="0 0 24 24" width="12" height="12"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                                                    </button>
                                                )}
                                            </div>
                                        );
                                    })}

                                    {faculty.filter(f => f.status !== 'declined').length === 0 && (
                                        <p style={{ margin: '6px 0 0', fontSize: '0.78rem', color: 'var(--prof-text-muted)', fontStyle: 'italic' }}>No co-handlers invited yet.</p>
                                    )}
                                </div>
                            );
                        })()}

                        {/* ── Invite Modal ── */}
                        {isInviteOpen && (() => {
                            const invitedIds = new Set(faculty.filter(f => f.status !== 'declined').map(f => f.professor_id));
                            const filtered = allProfessors.filter(p =>
                                p.id !== exam.created_by &&
                                !invitedIds.has(p.id) &&
                                (professorQuery === '' ||
                                    (p.full_name ?? '').toLowerCase().includes(professorQuery.toLowerCase()) ||
                                    (p.email ?? '').toLowerCase().includes(professorQuery.toLowerCase()))
                            );
                            const avatarColor = (name: string) => {
                                const palette = ['#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#ef4444', '#0ea5e9'];
                                return palette[(name.charCodeAt(0) + (name.charCodeAt(1) || 0)) % palette.length];
                            };
                            const initials = (name: string) =>
                                name.split(' ').filter(Boolean).map(w => w[0]).slice(0, 2).join('').toUpperCase() || '?';
                            const handleInvite = async (prof: Professor) => {
                                if (!exam) return;
                                setInviteLoading(prof.id);
                                const { data: newFac, error: facErr } = await addExamFaculty(exam.id, prof.id);
                                if (facErr || !newFac) { setInviteLoading(null); return; }
                                await createExamInviteNotification({
                                    recipientId: prof.id,
                                    senderId: user!.id,
                                    examId: exam.id,
                                    examTitle: exam.title,
                                    facultyId: newFac.id,
                                });
                                setFaculty(prev => [...prev, newFac]);
                                setInviteLoading(null);
                            };
                            return (
                                <div
                                    style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(2px)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px', animation: 'fadeIn 0.2s ease-out' }}
                                    onClick={() => setIsInviteOpen(false)}
                                >
                                    <div
                                        style={{ background: '#fff', borderRadius: '16px', width: '100%', maxWidth: '500px', overflow: 'hidden', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04)', animation: 'slideUp 0.3s cubic-bezier(0.16,1,0.3,1)' }}
                                        onClick={e => e.stopPropagation()}
                                    >
                                        {/* Header */}
                                        <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid #f1f5f9' }}>
                                            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                                    <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: '#eff6ff', border: '1px solid #bfdbfe', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                                        <svg fill="none" strokeWidth="1.75" stroke="#2563eb" viewBox="0 0 24 24" width="20" height="20"><path strokeLinecap="round" strokeLinejoin="round" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" /></svg>
                                                    </div>
                                                    <div>
                                                        <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#0f172a' }}>Invite Co-Handler</h3>
                                                        <p style={{ margin: '2px 0 0', fontSize: '0.82rem', color: '#64748b' }}>Search and invite a professor to co-handle this exam.</p>
                                                    </div>
                                                </div>
                                                <button
                                                    onClick={() => setIsInviteOpen(false)}
                                                    style={{ width: '30px', height: '30px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '7px', cursor: 'pointer', color: '#64748b', flexShrink: 0 }}
                                                >
                                                    <svg fill="none" strokeWidth="2" stroke="currentColor" viewBox="0 0 24 24" width="14" height="14"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                                                </button>
                                            </div>
                                        </div>

                                        {/* Search bar */}
                                        <div style={{ padding: '14px 24px', borderBottom: '1px solid #f1f5f9' }}>
                                            <div style={{ position: 'relative' }}>
                                                <svg style={{ position: 'absolute', left: '11px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} fill="none" strokeWidth="2" stroke="#94a3b8" viewBox="0 0 24 24" width="15" height="15"><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                                                <input
                                                    className="cs-input-field"
                                                    placeholder="Search by name or email…"
                                                    value={professorQuery}
                                                    onChange={e => { setProfessorQuery(e.target.value); setInvitePage(0); }}
                                                    autoFocus
                                                    style={{ width: '100%', boxSizing: 'border-box', paddingLeft: '34px' }}
                                                />
                                            </div>
                                        </div>

                                        {/* List */}
                                        {(() => {
                                            const PAGE_SIZE = 5;
                                            const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
                                            const safePage = Math.min(invitePage, totalPages - 1);
                                            const paged = filtered.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);
                                            return (
                                                <>
                                                    <div style={{ minHeight: '260px' }}>
                                                        {filtered.length === 0 ? (
                                                            <div style={{ padding: '48px 24px', textAlign: 'center' }}>
                                                                <div style={{ width: '44px', height: '44px', borderRadius: '50%', background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 10px' }}>
                                                                    <svg fill="none" strokeWidth="1.5" stroke="#94a3b8" viewBox="0 0 24 24" width="22" height="22"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" /></svg>
                                                                </div>
                                                                <p style={{ margin: 0, fontSize: '0.88rem', fontWeight: 600, color: '#475569' }}>
                                                                    {professorQuery ? 'No professors found' : 'All professors invited'}
                                                                </p>
                                                                <p style={{ margin: '4px 0 0', fontSize: '0.78rem', color: '#94a3b8' }}>
                                                                    {professorQuery ? 'Try a different name or email.' : 'Every professor has already been invited.'}
                                                                </p>
                                                            </div>
                                                        ) : (
                                                            paged.map((p, idx) => {
                                                                const name = p.full_name ?? p.email ?? 'Unknown';
                                                                const isLoading = inviteLoading === p.id;
                                                                return (
                                                                    <div
                                                                        key={p.id}
                                                                        style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '11px 24px', borderBottom: idx < paged.length - 1 ? '1px solid #f1f5f9' : 'none' }}
                                                                    >
                                                                        <div style={{ flexShrink: 0, width: '36px', height: '36px', borderRadius: '50%', background: avatarColor(name), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', fontWeight: 700, color: '#fff', letterSpacing: '0.03em' }}>
                                                                            {initials(name)}
                                                                        </div>
                                                                        <div style={{ flex: 1, minWidth: 0 }}>
                                                                            <div style={{ fontSize: '0.88rem', fontWeight: 600, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</div>
                                                                            <div style={{ fontSize: '0.75rem', color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.email ?? ''}{p.program ? <span style={{ marginLeft: '6px', background: '#f1f5f9', borderRadius: '4px', padding: '0 5px', fontSize: '0.68rem', color: '#475569' }}>{p.program.code}</span> : null}</div>
                                                                        </div>
                                                                        <button
                                                                            onClick={() => handleInvite(p)}
                                                                            disabled={isLoading}
                                                                            style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: '5px', padding: '6px 14px', fontSize: '0.8rem', fontWeight: 600, background: isLoading ? '#f1f5f9' : '#2563eb', color: isLoading ? '#94a3b8' : '#fff', border: 'none', borderRadius: '7px', cursor: isLoading ? 'default' : 'pointer', transition: 'background 0.15s' }}
                                                                        >
                                                                            {isLoading ? (
                                                                                <span style={{ display: 'inline-block', width: '13px', height: '13px', border: '2px solid #cbd5e1', borderTopColor: '#94a3b8', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
                                                                            ) : (
                                                                                <svg fill="none" strokeWidth="2.5" stroke="currentColor" viewBox="0 0 24 24" width="13" height="13"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
                                                                            )}
                                                                            {isLoading ? 'Inviting…' : 'Invite'}
                                                                        </button>
                                                                    </div>
                                                                );
                                                            })
                                                        )}
                                                    </div>

                                                    {/* Footer: pagination */}
                                                    {filtered.length > 0 && (
                                                        <div style={{ padding: '12px 24px', borderTop: '1px solid #f1f5f9', background: '#f8fafc', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                            <button
                                                                onClick={() => setInvitePage(p => Math.max(0, p - 1))}
                                                                disabled={safePage === 0}
                                                                style={{ width: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '6px', cursor: safePage === 0 ? 'default' : 'pointer', color: safePage === 0 ? '#cbd5e1' : '#475569' }}
                                                            >
                                                                <svg fill="none" strokeWidth="2" stroke="currentColor" viewBox="0 0 24 24" width="13" height="13"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
                                                            </button>
                                                            <span style={{ fontSize: '0.78rem', color: '#64748b', minWidth: '72px', textAlign: 'center' }}>
                                                                Page {safePage + 1} of {totalPages}
                                                            </span>
                                                            <button
                                                                onClick={() => setInvitePage(p => Math.min(totalPages - 1, p + 1))}
                                                                disabled={safePage >= totalPages - 1}
                                                                style={{ width: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '6px', cursor: safePage >= totalPages - 1 ? 'default' : 'pointer', color: safePage >= totalPages - 1 ? '#cbd5e1' : '#475569' }}
                                                            >
                                                                <svg fill="none" strokeWidth="2" stroke="currentColor" viewBox="0 0 24 24" width="13" height="13"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                                                            </button>
                                                            <span style={{ fontSize: '0.75rem', color: '#94a3b8', marginLeft: '4px' }}>
                                                                {filtered.length} professor{filtered.length !== 1 ? 's' : ''}
                                                            </span>
                                                        </div>
                                                    )}
                                                </>
                                            );
                                        })()}
                                    </div>
                                </div>
                            );
                        })()}

                    </div>
                </div>
            )}

            {/* ══════════════════════════════════════════════
                PAPERS TAB
            ══════════════════════════════════════════════ */}
            {activeTab === 'papers' && (
                <div>
                    {/* Attempt selector */}
                    {exam.max_attempts > 1 && (
                        <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', flexWrap: 'wrap' }}>
                            {Array.from({ length: exam.max_attempts }, (_, i) => i + 1).map(n => {
                                const nStatus = attemptStatusMap[n] ?? 'draft';
                                const hasSets = (setsByAttempt[n] ?? []).length > 0;
                                const isActive = activeAttempt === n;
                                const dotColor = nStatus === 'deployed' ? '#16a34a' : nStatus === 'done' ? '#2563eb' : hasSets ? '#94a3b8' : null;
                                return (
                                    <button
                                        key={n}
                                        onClick={() => setActiveAttempt(n)}
                                        style={{
                                            padding: '8px 18px',
                                            borderRadius: '8px',
                                            border: `1.5px solid ${isActive ? 'var(--prof-primary)' : 'var(--prof-border)'}`,
                                            background: isActive ? 'var(--prof-primary)' : '#fff',
                                            color: isActive ? '#fff' : 'var(--prof-text-main)',
                                            fontWeight: isActive ? 700 : 500,
                                            fontSize: '0.88rem',
                                            cursor: 'pointer',
                                            position: 'relative',
                                        }}
                                    >
                                        Attempt {n}
                                        {dotColor && (
                                            <span style={{ position: 'absolute', top: '5px', right: '5px', width: '7px', height: '7px', background: dotColor, borderRadius: '50%', border: '1.5px solid #fff' }} />
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                    )}

                    {/* Attempt status bar */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px', paddingBottom: '14px', borderBottom: '1px dashed var(--prof-border)', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--prof-text-muted)' }}>
                            {exam.max_attempts > 1 ? `Attempt ${activeAttempt}` : 'Papers'}
                        </span>
                        <span style={{
                            fontSize: '0.78rem', fontWeight: 600, padding: '2px 9px', borderRadius: '99px',
                            background: attemptStatus === 'deployed' ? '#dcfce7' : attemptStatus === 'done' ? '#eff6ff' : '#f1f5f9',
                            color: attemptStatus === 'deployed' ? '#16a34a' : attemptStatus === 'done' ? '#2563eb' : '#64748b',
                        }}>
                            {attemptStatus === 'deployed' ? 'Open' : attemptStatus === 'done' ? 'Closed' : 'Draft'}
                        </span>
                        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            {attemptStatus === 'draft' && currentAttemptSets.length > 0 && (
                                prevAttemptDone ? (
                                    <button
                                        className="btn-primary"
                                        style={{ fontSize: '0.85rem', padding: '6px 14px', background: '#16a34a', borderColor: '#16a34a' }}
                                        onClick={() => setIsAttemptDeployOpen(true)}
                                    >
                                        Open Attempt
                                    </button>
                                ) : (
                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '0.8rem', color: '#94a3b8', padding: '6px 12px', borderRadius: '8px', border: '1px dashed #cbd5e1', background: '#f8fafc' }}>
                                        <svg fill="none" strokeWidth="2" stroke="currentColor" viewBox="0 0 24 24" width="13" height="13"><path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75M3.75 21.75h16.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H3.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" /></svg>
                                        Close Attempt {activeAttempt - 1} first
                                    </span>
                                )
                            )}
                            {attemptStatus === 'deployed' && (
                                <button
                                    className="btn-secondary"
                                    style={{ fontSize: '0.85rem', padding: '6px 14px', color: '#2563eb', borderColor: '#93c5fd' }}
                                    onClick={() => setIsAttemptDoneOpen(true)}
                                >
                                    Close Attempt
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Generate form */}
                    {showGenerateForm === activeAttempt ? (
                        <div className="cs-card">
                            <h3 className="cs-card-title">Generate Papers — Attempt {activeAttempt}</h3>
                            <p style={{ margin: '0 0 16px', fontSize: '0.875rem', color: 'var(--prof-text-muted)' }}>
                                Will create {exam.num_sets} set{exam.num_sets !== 1 ? 's' : ''}, each with the same questions shuffled differently.
                            </p>

                            {/* Mode toggle */}
                            <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', flexWrap: 'wrap' }}>
                                <button
                                    type="button"
                                    onClick={() => setGenAllocMode('equal')}
                                    style={{ padding: '8px 16px', borderRadius: '8px', border: `1.5px solid ${genAllocMode === 'equal' ? 'var(--prof-primary)' : 'var(--prof-border)'}`, background: genAllocMode === 'equal' ? 'var(--prof-primary)' : '#fff', color: genAllocMode === 'equal' ? '#fff' : 'var(--prof-text-main)', fontWeight: 500, fontSize: '0.875rem', cursor: 'pointer', transition: 'all 0.15s' }}
                                >
                                    Equal distribution
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setGenAllocMode('per_subject')}
                                    style={{ padding: '8px 16px', borderRadius: '8px', border: `1.5px solid ${genAllocMode === 'per_subject' ? 'var(--prof-primary)' : 'var(--prof-border)'}`, background: genAllocMode === 'per_subject' ? 'var(--prof-primary)' : '#fff', color: genAllocMode === 'per_subject' ? '#fff' : 'var(--prof-text-main)', fontWeight: 500, fontSize: '0.875rem', cursor: 'pointer', transition: 'all 0.15s' }}
                                >
                                    Custom per subject
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setGenAllocMode('per_mo')}
                                    style={{ padding: '8px 16px', borderRadius: '8px', border: `1.5px solid ${genAllocMode === 'per_mo' ? 'var(--prof-primary)' : 'var(--prof-border)'}`, background: genAllocMode === 'per_mo' ? 'var(--prof-primary)' : '#fff', color: genAllocMode === 'per_mo' ? '#fff' : 'var(--prof-text-main)', fontWeight: 500, fontSize: '0.875rem', cursor: 'pointer', transition: 'all 0.15s' }}
                                >
                                    Manual per MO
                                </button>
                            </div>

                            {(() => {
                                // Compute projected allocations based on actual generation logic
                                const projectedStats: Record<string, { total: number, coStats: Record<string, number>, moStats: Record<string, number> }> = {};
                                const subjectIds = exam.exam_subjects.map(s => s.subject_id);
                                let baseCounts: Record<string, number> = {};

                                if (genAllocMode === 'equal') {
                                    const total = genTotalQuestions || 0;
                                    const n = subjectIds.length;
                                    const base = Math.floor(total / (n || 1));
                                    let rem = total % (n || 1);
                                    for (const id of subjectIds) {
                                        baseCounts[id] = base + (rem > 0 ? 1 : 0);
                                        if (rem > 0) rem--;
                                    }
                                } else {
                                    for (const id of subjectIds) {
                                        baseCounts[id] = genPerSubjectCounts[id] || 0;
                                    }
                                }

                                for (const subjectId of subjectIds) {
                                    const stats = availableQuestionsStats[subjectId];
                                    if (!stats) continue;

                                    const byMO: Record<string, QuestionWithOutcomes[]> = {};
                                    for (const q of stats.raw) {
                                        if (!byMO[q.module_outcome_id]) byMO[q.module_outcome_id] = [];
                                        byMO[q.module_outcome_id].push(q);
                                    }

                                    if (genAllocMode === 'per_mo') {
                                        const coStatsMap: Record<string, number> = {};
                                        const moStatsMap: Record<string, number> = {};
                                        let actualTotal = 0;
                                        for (const [moId, questions] of Object.entries(byMO)) {
                                            const allocated = Math.min(genPerMOCounts[moId] || 0, questions.length);
                                            if (allocated > 0) {
                                                const sampleQ = questions[0];
                                                const coName = sampleQ.course_outcomes?.title || 'Uncategorized CO';
                                                const moName = sampleQ.module_outcomes ? `MO${(sampleQ.course_outcomes?.order_index ?? 0) + 1}${sampleQ.module_outcomes.order_index + 1}` : 'Uncategorized MO';
                                                coStatsMap[coName] = (coStatsMap[coName] || 0) + allocated;
                                                moStatsMap[moName] = (moStatsMap[moName] || 0) + allocated;
                                                actualTotal += allocated;
                                            }
                                        }
                                        projectedStats[subjectId] = { total: actualTotal, coStats: coStatsMap, moStats: moStatsMap };
                                        continue;
                                    }

                                    const targetCount = baseCounts[subjectId] || 0;
                                    const actualCount = Math.min(targetCount, stats.total);

                                    if (actualCount === 0) {
                                        projectedStats[subjectId] = { total: 0, coStats: {}, moStats: {} };
                                        continue;
                                    }

                                    const moIds = Object.keys(byMO);
                                    const allocs: Record<string, number> = {};
                                    const base = Math.floor(actualCount / moIds.length);
                                    let remainder = actualCount % moIds.length;
                                    for (const id of moIds) {
                                        allocs[id] = base + (remainder > 0 ? 1 : 0);
                                        if (remainder > 0) remainder--;
                                    }

                                    let excess = 0;
                                    for (const id of moIds) {
                                        const avail = byMO[id].length;
                                        if (allocs[id] > avail) {
                                            excess += allocs[id] - avail;
                                            allocs[id] = avail;
                                        }
                                    }

                                    for (const id of moIds) {
                                        if (excess === 0) break;
                                        const spare = byMO[id].length - allocs[id];
                                        if (spare > 0) {
                                            const take = Math.min(spare, excess);
                                            allocs[id] += take;
                                            excess -= take;
                                        }
                                    }

                                    const coStatsMap: Record<string, number> = {};
                                    const moStatsMap: Record<string, number> = {};
                                    let actualTotal = 0;

                                    for (const id of moIds) {
                                        const allocated = allocs[id];
                                        if (allocated > 0) {
                                            const sampleQ = byMO[id][0];
                                            const coName = sampleQ.course_outcomes?.title || 'Uncategorized CO';
                                            const moName = sampleQ.module_outcomes ? `MO${(sampleQ.course_outcomes?.order_index ?? 0) + 1}${sampleQ.module_outcomes.order_index + 1}` : 'Uncategorized MO';

                                            moStatsMap[moName] = (moStatsMap[moName] || 0) + allocated;
                                            coStatsMap[coName] = (coStatsMap[coName] || 0) + allocated;
                                            actualTotal += allocated;
                                        }
                                    }

                                    projectedStats[subjectId] = { total: actualTotal, coStats: coStatsMap, moStats: moStatsMap };
                                }

                                let anyExceeded = false;
                                if (genAllocMode === 'per_mo') {
                                    for (const subjectId of subjectIds) {
                                        const stats = availableQuestionsStats[subjectId];
                                        if (!stats) continue;
                                        const avByMO: Record<string, number> = {};
                                        for (const q of stats.raw) { avByMO[q.module_outcome_id] = (avByMO[q.module_outcome_id] || 0) + 1; }
                                        if (Object.keys(avByMO).some(moId => (genPerMOCounts[moId] || 0) > (avByMO[moId] || 0))) anyExceeded = true;
                                    }
                                } else {
                                    for (const id of subjectIds) {
                                        const req = baseCounts[id] || 0;
                                        const avail = availableQuestionsStats[id]?.total || 0;
                                        if (req > avail) anyExceeded = true;
                                    }
                                }

                                const renderStatsBreakdown = (pStats: any) => {
                                    if (isFetchingStats) return <div style={{ fontSize: '0.8rem', color: 'var(--prof-text-muted)', marginTop: '8px' }}>Loading projected stats...</div>;
                                    if (!pStats) return <div style={{ fontSize: '0.8rem', color: '#ef4444', marginTop: '8px' }}>Failed to project stats.</div>;

                                    return (
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginTop: '16px', borderTop: '1px solid #e2e8f0', paddingTop: '16px' }}>
                                            <div>
                                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                                                    <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Projected COs</span>
                                                </div>
                                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                                                    {Object.entries(pStats.coStats).map(([co, count]) => (
                                                        <span key={co} style={{ fontSize: '0.75rem', padding: '4px 10px', background: '#f0f9ff', color: '#0369a1', borderRadius: '6px', border: '1px solid #bae6fd', fontWeight: 500 }}>
                                                            {co}: <strong style={{ color: '#0c4a6e' }}>{count as number}</strong>
                                                        </span>
                                                    ))}
                                                    {Object.keys(pStats.coStats).length === 0 && <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>None</span>}
                                                </div>
                                            </div>
                                            <div>
                                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                                                    <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Projected MOs</span>
                                                </div>
                                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                                                    {Object.entries(pStats.moStats).map(([mo, count]) => (
                                                        <span key={mo} style={{ fontSize: '0.75rem', padding: '4px 10px', background: '#fffbeb', color: '#b45309', borderRadius: '6px', border: '1px solid #fde68a', fontWeight: 500 }}>
                                                            {mo}: <strong style={{ color: '#78350f' }}>{count as number}</strong>
                                                        </span>
                                                    ))}
                                                    {Object.keys(pStats.moStats).length === 0 && <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>None</span>}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                };

                                return (
                                    <>
                                        {genAllocMode === 'equal' ? (
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '24px' }}>
                                                <div style={{ display: 'flex', alignItems: 'flex-end', gap: '12px', flexWrap: 'wrap' }}>
                                                    <div className="cs-input-field" style={{ maxWidth: '240px', margin: 0 }}>
                                                        <label>Total Questions per Set</label>
                                                        <input
                                                            type="number" min="1" max="100"
                                                            value={genTotalQuestions}
                                                            onChange={e => setGenTotalQuestions(Math.min(100, Math.max(1, parseInt(e.target.value) || 1)))}
                                                        />
                                                    </div>
                                                    {!isFetchingStats && (
                                                        <button
                                                            type="button"
                                                            className="btn-secondary"
                                                            title="Distribute the total across subjects proportionally based on available question counts"
                                                            style={{ fontSize: '0.82rem', padding: '7px 14px', marginBottom: '1px', display: 'flex', alignItems: 'center', gap: '6px' }}
                                                            onClick={() => {
                                                                const subjs = [...exam.exam_subjects]
                                                                    .map(s => ({ id: s.subject_id, available: availableQuestionsStats[s.subject_id]?.total || 0 }))
                                                                    .sort((a, b) => a.available - b.available);
                                                                const counts: Record<string, number> = {};
                                                                let remaining = genTotalQuestions;
                                                                for (let i = 0; i < subjs.length; i++) {
                                                                    const share = Math.floor(remaining / (subjs.length - i));
                                                                    const allocated = Math.min(share, subjs[i].available);
                                                                    counts[subjs[i].id] = allocated;
                                                                    remaining -= allocated;
                                                                }
                                                                setGenPerSubjectCounts(counts);
                                                                setGenAllocMode('per_subject');
                                                            }}
                                                        >
                                                            <svg fill="none" strokeWidth="2" stroke="currentColor" viewBox="0 0 24 24" width="13" height="13">
                                                                <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6a7.5 7.5 0 107.5 7.5h-7.5V6z" />
                                                                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 10.5H21A7.5 7.5 0 0013.5 3v7.5z" />
                                                            </svg>
                                                            Auto Allocate
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        ) : genAllocMode === 'per_subject' ? (
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc', padding: '16px 20px', borderRadius: '12px', border: '1px solid #e2e8f0', marginBottom: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
                                                <span style={{ fontSize: '0.95rem', fontWeight: 600, color: '#334155' }}>Total Questions per Set</span>
                                                <div style={{ background: '#fff', padding: '6px 16px', borderRadius: '8px', border: '1.5px solid #cbd5e1', fontSize: '1.1rem', fontWeight: 700, color: '#0f172a' }}>
                                                    {Object.values(genPerSubjectCounts).reduce((sum, count) => sum + (count || 0), 0)}
                                                </div>
                                            </div>
                                        ) : (
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc', padding: '16px 20px', borderRadius: '12px', border: '1px solid #e2e8f0', marginBottom: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
                                                <span style={{ fontSize: '0.95rem', fontWeight: 600, color: '#334155' }}>Total Questions per Set</span>
                                                <div style={{ background: '#fff', padding: '6px 16px', borderRadius: '8px', border: '1.5px solid #cbd5e1', fontSize: '1.1rem', fontWeight: 700, color: '#0f172a' }}>
                                                    {Object.values(genPerMOCounts).reduce((sum, count) => sum + (count || 0), 0)}
                                                </div>
                                            </div>
                                        )}

                                        <div style={{ marginBottom: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                            {exam.exam_subjects.map(s => {
                                                const pStats = projectedStats[s.subject_id];
                                                const available = availableQuestionsStats[s.subject_id]?.total || 0;
                                                const targetCount = baseCounts[s.subject_id] || 0;
                                                const hasWarning = genAllocMode === 'per_mo' ? (() => {
                                                    const st = availableQuestionsStats[s.subject_id];
                                                    if (!st) return false;
                                                    const avByMO: Record<string, number> = {};
                                                    for (const q of st.raw) { avByMO[q.module_outcome_id] = (avByMO[q.module_outcome_id] || 0) + 1; }
                                                    return Object.keys(avByMO).some(moId => (genPerMOCounts[moId] || 0) > (avByMO[moId] || 0));
                                                })() : targetCount > available;

                                                return (
                                                    <div key={s.subject_id} style={{ display: 'flex', flexDirection: 'column', background: hasWarning ? '#fef2f2' : '#f8fafc', padding: '20px', borderRadius: '12px', border: `1px solid ${hasWarning ? '#fca5a5' : '#e2e8f0'}`, boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
                                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                                                <span style={{ fontSize: '1rem', color: '#0f172a', fontWeight: 600 }}>
                                                                    {s.subjects?.course_code}
                                                                </span>
                                                                <span style={{ fontSize: '0.85rem', color: '#64748b' }}>
                                                                    {s.subjects?.course_title}
                                                                </span>
                                                            </div>

                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginLeft: 'auto', background: '#fff', padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1' }}>
                                                                {genAllocMode === 'equal' ? (
                                                                    <div style={{ fontSize: '0.9rem', fontWeight: 600, color: hasWarning ? '#ef4444' : '#0f172a' }}>
                                                                        {targetCount} <span style={{ fontWeight: 400, color: '#64748b' }}>questions</span>
                                                                    </div>
                                                                ) : genAllocMode === 'per_subject' ? (
                                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                                        <input
                                                                            type="number" min="1"
                                                                            style={{ width: '70px', padding: '6px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.9rem', textAlign: 'center' }}
                                                                            value={genPerSubjectCounts[s.subject_id] || ''}
                                                                            onChange={e => setGenPerSubjectCounts(prev => ({ ...prev, [s.subject_id]: Math.max(1, parseInt(e.target.value) || 1) }))}
                                                                        />
                                                                        <span style={{ fontSize: '0.85rem', color: '#64748b' }}>questions</span>
                                                                    </div>
                                                                ) : (
                                                                    <div style={{ fontSize: '0.9rem', fontWeight: 600, color: hasWarning ? '#ef4444' : '#0f172a' }}>
                                                                        {(() => {
                                                                            const st = availableQuestionsStats[s.subject_id];
                                                                            if (!st) return 0;
                                                                            const moIds = [...new Set(st.raw.map(q => q.module_outcome_id))];
                                                                            return moIds.reduce((sum, moId) => sum + (genPerMOCounts[moId] || 0), 0);
                                                                        })()} <span style={{ fontWeight: 400, color: '#64748b' }}>questions</span>
                                                                    </div>
                                                                )}
                                                                {hasWarning && (
                                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#ef4444', fontSize: '0.8rem', fontWeight: 500, marginLeft: '8px', paddingLeft: '12px', borderLeft: '1px solid #e2e8f0' }}>
                                                                        <svg fill="none" strokeWidth="2" stroke="currentColor" viewBox="0 0 24 24" width="14" height="14"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                                                                        Only {available} available
                                                                    </div>
                                                                )}
                                                                {!hasWarning && (
                                                                    <div style={{ fontSize: '0.8rem', color: '#64748b', marginLeft: '8px', paddingLeft: '12px', borderLeft: '1px solid #e2e8f0' }}>
                                                                        {available} total in bank
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>
                                                        {genAllocMode === 'per_mo' && !isFetchingStats && (() => {
                                                            const st = availableQuestionsStats[s.subject_id];
                                                            if (!st) return null;
                                                            const coMap: Record<string, { co: { id: string; title: string; order_index: number }; mos: { moId: string; desc: string; order_index: number; available: number }[] }> = {};
                                                            for (const q of st.raw) {
                                                                const coId = q.course_outcomes.id;
                                                                if (!coMap[coId]) coMap[coId] = { co: q.course_outcomes, mos: [] };
                                                                const existing = coMap[coId].mos.find(m => m.moId === q.module_outcome_id);
                                                                if (existing) {
                                                                    existing.available++;
                                                                } else {
                                                                    coMap[coId].mos.push({ moId: q.module_outcome_id, desc: q.module_outcomes.description, order_index: q.module_outcomes.order_index, available: 1 });
                                                                }
                                                            }
                                                            const sortedCOs = Object.values(coMap).sort((a, b) => a.co.order_index - b.co.order_index);
                                                            return (
                                                                <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                                                    {sortedCOs.map(({ co, mos }) => (
                                                                        <div key={co.id}>
                                                                            <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>
                                                                                CO{co.order_index + 1}: {co.title}
                                                                            </div>
                                                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                                                                                {[...mos].sort((a, b) => a.order_index - b.order_index).map(mo => {
                                                                                    const moLabel = `MO${co.order_index + 1}${mo.order_index + 1}`;
                                                                                    const isExceeded = (genPerMOCounts[mo.moId] || 0) > mo.available;
                                                                                    return (
                                                                                        <div key={mo.moId} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '7px 12px', background: isExceeded ? '#fef2f2' : '#fff', borderRadius: '8px', border: `1px solid ${isExceeded ? '#fca5a5' : '#e2e8f0'}` }}>
                                                                                            <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#0f172a', minWidth: '38px' }}>{moLabel}</span>
                                                                                            <span style={{ fontSize: '0.8rem', color: '#475569', flex: 1 }}>{mo.desc}</span>
                                                                                            <span style={{ fontSize: '0.74rem', color: isExceeded ? '#ef4444' : '#94a3b8', marginRight: '4px', whiteSpace: 'nowrap' }}>{mo.available} avail.</span>
                                                                                            <input
                                                                                                type="number" min="0"
                                                                                                style={{ width: '58px', padding: '4px 8px', borderRadius: '6px', border: `1px solid ${isExceeded ? '#fca5a5' : '#cbd5e1'}`, fontSize: '0.85rem', textAlign: 'center' }}
                                                                                                value={genPerMOCounts[mo.moId] ?? 0}
                                                                                                onChange={e => setGenPerMOCounts(prev => ({ ...prev, [mo.moId]: Math.max(0, parseInt(e.target.value) || 0) }))}
                                                                                            />
                                                                                        </div>
                                                                                    );
                                                                                })}
                                                                            </div>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            );
                                                        })()}
                                                        {renderStatsBreakdown(pStats)}
                                                    </div>
                                                );
                                            })}
                                        </div>

                                        {anyExceeded && (
                                            <div style={{ padding: '12px 16px', background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: '8px', color: '#b91c1c', fontSize: '0.9rem', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <svg fill="currentColor" viewBox="0 0 20 20" width="18" height="18"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" /></svg>
                                                You requested more questions than are available in one or more subjects. Please lower the count to proceed.
                                            </div>
                                        )}
                                    </>
                                );
                            })()}

                            {generateError && <p className="cs-error" style={{ marginBottom: '12px' }}>{generateError}</p>}

                            <div style={{ display: 'flex', gap: '10px' }}>
                                <button className="btn-secondary" onClick={() => setShowGenerateForm(null)}>Cancel</button>
                                <button className="btn-primary" onClick={() => handleGeneratePapers(activeAttempt)} disabled={isGenerating}>
                                    {isGenerating ? 'Generating...' : `Generate ${exam.num_sets} Set${exam.num_sets !== 1 ? 's' : ''}`}
                                </button>
                            </div>
                        </div>

                    ) : currentAttemptSets.length === 0 ? (
                        /* No sets yet */
                        <div className="cs-card" style={{ textAlign: 'center', padding: '48px 24px' }}>
                            <svg fill="none" strokeWidth="1.5" stroke="currentColor" viewBox="0 0 24 24" width="40" height="40" style={{ margin: '0 auto 12px', display: 'block', opacity: 0.35 }}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m3.75 9v6m3-3H9m1.5-12H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                            </svg>
                            {canGeneratePapers ? (
                                prevAttemptDone ? (
                                    <>
                                        <p style={{ color: 'var(--prof-text-muted)', marginBottom: '16px', fontSize: '0.9rem' }}>
                                            No papers generated for Attempt {activeAttempt} yet.
                                        </p>
                                        <button className="btn-primary" onClick={() => openGenerateForm(activeAttempt)}>
                                            Generate Papers
                                        </button>
                                    </>
                                ) : (
                                    <p style={{ color: 'var(--prof-text-muted)', fontSize: '0.9rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                                        <svg fill="none" strokeWidth="2" stroke="currentColor" viewBox="0 0 24 24" width="16" height="16"><path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75M3.75 21.75h16.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H3.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" /></svg>
                                        Attempt {activeAttempt - 1} must be closed before generating papers for Attempt {activeAttempt}.
                                    </p>
                                )
                            ) : (
                                <p style={{ color: 'var(--prof-text-muted)', fontSize: '0.9rem' }}>
                                    {exam.exam_subjects.length === 0
                                        ? 'Link subjects to this exam first (Overview → Edit Exam).'
                                        : 'Set the number of sets per attempt in Edit Exam first.'}
                                </p>
                            )}
                        </div>

                    ) : (
                        /* Set viewer */
                        <div className="cs-card">
                            {/* Attempt actions bar */}
                            {attemptStatus === 'draft' && prevAttemptDone && (
                                <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', paddingBottom: '16px', borderBottom: '1px solid var(--prof-border)' }}>
                                    <button
                                        className="btn-secondary"
                                        style={{ fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '6px' }}
                                        onClick={() => setIsRegenerateConfirmOpen(true)}
                                    >
                                        <svg fill="none" strokeWidth="2" stroke="currentColor" viewBox="0 0 24 24" width="14" height="14"><path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" /></svg>
                                        Regenerate
                                    </button>
                                    <button
                                        className="btn-icon danger"
                                        title="Delete papers for this attempt"
                                        onClick={() => setIsDeleteAttemptConfirmOpen(true)}
                                        disabled={isDeletingAttempt === activeAttempt}
                                    >
                                        {isDeletingAttempt === activeAttempt
                                            ? <span style={{ fontSize: '0.75rem' }}>...</span>
                                            : <svg fill="none" strokeWidth="2" stroke="currentColor" viewBox="0 0 24 24" width="16" height="16"><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                        }
                                    </button>
                                </div>
                            )}

                            {/* Set tabs */}
                            <div className="exam-set-tabs">
                                {currentAttemptSets.map((set, idx) => (
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

                            {/* Action bar */}
                            {currentQuestions.length > 0 && (
                                <div className="ve-action-bar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', fontSize: '0.85rem', color: 'var(--prof-text-muted)' }}>
                                    <span className="ve-hide-mobile">{currentQuestions.length} question{currentQuestions.length !== 1 ? 's' : ''}</span>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                        {totalPages > 1 && (
                                            <span className="ve-hide-mobile" style={{ marginRight: '8px', fontWeight: 500 }}>Page {currentPage + 1} of {totalPages}</span>
                                        )}
                                        <button
                                            className="btn-secondary"
                                            style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 16px', fontSize: '0.85rem', fontWeight: 600, borderRadius: '8px', ...(attemptStatus !== 'draft' ? { opacity: 0.4, cursor: 'not-allowed' } : {}) }}
                                            disabled={attemptStatus !== 'draft'}
                                            onClick={handleRearrange}
                                        >
                                            <svg fill="none" strokeWidth="2" stroke="currentColor" viewBox="0 0 24 24" width="16" height="16">
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
                                            </svg>
                                            Re-arrange
                                        </button>
                                        <button
                                            className="btn-primary"
                                            style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 16px', fontSize: '0.85rem', fontWeight: 600, borderRadius: '8px' }}
                                            onClick={() => handlePrint()}
                                        >
                                            <svg fill="none" strokeWidth="2" stroke="currentColor" viewBox="0 0 24 24" width="16" height="16">
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0110.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03.48.062.72.096m-.72-.096L17.66 18m0 0l.229 2.523a1.125 1.125 0 01-1.12 1.227H7.231c-.662 0-1.18-.568-1.12-1.227L6.34 18m11.318 0h1.091A2.25 2.25 0 0021 15.75V9.456c0-1.081-.768-2.015-1.837-2.175a48.055 48.055 0 00-1.913-.247M6.34 18H5.25A2.25 2.25 0 013 15.75V9.456c0-1.081.768-2.015 1.837-2.175a48.041 48.041 0 011.913-.247m10.5 0a48.536 48.536 0 00-10.5 0m10.5 0V3.375c0-.621-.504-1.125-1.125-1.125h-8.25c-.621 0-1.125.504-1.125 1.125v3.659M18 10.5h.008v.008H18V10.5zm-3 0h.008v.008H15V10.5z" />
                                            </svg>
                                            Print Exam
                                        </button>
                                    </div>
                                </div>
                            )}

                            {/* Question list */}
                            <div className="exam-set-questions-list">
                                {pagedQuestions.length === 0 ? (
                                    <p className="settings-empty">No questions in this set.</p>
                                ) : (
                                    pagedQuestions.map((q, idx) => {
                                        const globalIdx = currentPage * ITEMS_PER_PAGE + idx;
                                        const isExpanded = expandedId === q.id;
                                        const subCode = exam?.exam_subjects.find(es => es.subject_id === q.subject_id)?.subjects?.course_code;
                                        return (
                                            <div
                                                key={q.id}
                                                className="exam-set-question-item"
                                                style={{ cursor: 'pointer', flexDirection: 'column', gap: 0, userSelect: 'none' }}
                                                onClick={() => setExpandedId(isExpanded ? null : q.id)}
                                            >
                                                <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                                                    <span className="exam-q-number">{globalIdx + 1}.</span>
                                                    <div className="exam-q-body" style={{ flex: 1 }}>
                                                        <p className="exam-q-text" style={{ marginBottom: '4px' }}
                                                            dangerouslySetInnerHTML={{ __html: renderMathHtml(q.question_text) }}
                                                        />
                                                        <div className="exam-q-meta">
                                                            {subCode && (
                                                                <span className="exam-q-tag subject">{subCode}</span>
                                                            )}
                                                            {q.course_outcomes && (
                                                                <span className="exam-q-tag co">CO{(q.course_outcomes.order_index ?? 0) + 1}</span>
                                                            )}
                                                            {q.module_outcomes && (
                                                                <span className="exam-q-tag mo">MO{(q.course_outcomes?.order_index ?? 0) + 1}{q.module_outcomes.order_index + 1}</span>
                                                            )}
                                                        </div>
                                                    </div>
                                                    <svg fill="none" strokeWidth="2" stroke="currentColor" viewBox="0 0 24 24" width="16" height="16"
                                                        style={{ flexShrink: 0, marginTop: '2px', color: 'var(--prof-text-muted)', transform: isExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>
                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                                                    </svg>
                                                </div>
                                                {isExpanded && (
                                                    <div style={{ marginLeft: '28px', marginTop: '14px', borderTop: '1px solid var(--prof-border)', paddingTop: '14px' }} onClick={e => e.stopPropagation()}>
                                                        {q.image_url && (
                                                            <img src={q.image_url} alt="Question attachment"
                                                                style={{ maxWidth: '100%', maxHeight: '320px', objectFit: 'contain', borderRadius: '6px', marginBottom: '14px', display: 'block', border: '1px solid var(--prof-border)' }}
                                                            />
                                                        )}
                                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                                            {q.choices.map((choice, ci) => {
                                                                const isCorrect = ci === q.correct_choice;
                                                                return (
                                                                    <div key={ci} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '9px 14px', borderRadius: '8px', background: isCorrect ? '#dcfce7' : 'var(--prof-surface)', border: `1px solid ${isCorrect ? '#86efac' : 'var(--prof-border)'}` }}>
                                                                        <span style={{ fontWeight: 700, minWidth: '22px', color: isCorrect ? '#16a34a' : 'var(--prof-text-muted)', fontSize: '0.85rem' }}>
                                                                            {CHOICE_LABELS[ci]}.
                                                                        </span>
                                                                        <span style={{ flex: 1, color: isCorrect ? '#15803d' : 'var(--prof-text-main)', fontSize: '0.9rem' }}
                                                                            dangerouslySetInnerHTML={{ __html: renderMathHtml(choice) }}
                                                                        />
                                                                        {isCorrect && (
                                                                            <span style={{ fontSize: '12px', fontWeight: 600, color: '#16a34a', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                                                <svg fill="none" strokeWidth="2.5" stroke="currentColor" viewBox="0 0 24 24" width="14" height="14"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
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
                                    <button className="btn-secondary" style={{ padding: '7px 18px' }} disabled={currentPage === 0}
                                        onClick={() => { setCurrentPage(p => p - 1); setExpandedId(null); document.querySelector('.prof-content-scroll')?.scrollTo(0, 0); }}>
                                        Previous
                                    </button>
                                    <span style={{ fontSize: '14px', color: 'var(--prof-text-muted)', minWidth: '100px', textAlign: 'center' }}>
                                        Page {currentPage + 1} of {totalPages}
                                    </span>
                                    <button className="btn-secondary" style={{ padding: '7px 18px' }} disabled={currentPage >= totalPages - 1}
                                        onClick={() => { setCurrentPage(p => p + 1); setExpandedId(null); document.querySelector('.prof-content-scroll')?.scrollTo(0, 0); }}>
                                        Next
                                    </button>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}

            {/* ══════════════════════════════════════════════
                STUDENTS TAB
            ══════════════════════════════════════════════ */}
            {activeTab === 'students' && examId && (
                <ExamStudents examId={examId} />
            )}

            {/* ══════════════════════════════════════════════
                SCAN OMR TAB
            ══════════════════════════════════════════════ */}
            {activeTab === 'scan' && (() => {
                if (deployedAttempts.length === 0) {
                    return (
                        <div className="cs-card" style={{ textAlign: 'center', padding: '56px 24px' }}>
                            <svg fill="none" strokeWidth="1.5" stroke="currentColor" viewBox="0 0 24 24" width="44" height="44" style={{ margin: '0 auto 14px', display: 'block', opacity: 0.3 }}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 013.75 9.375v-4.5zM3.75 14.625c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5a1.125 1.125 0 01-1.125-1.125v-4.5zM13.5 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 0113.5 9.375v-4.5z" />
                            </svg>
                            <p style={{ color: 'var(--prof-text-muted)', fontSize: '0.92rem', margin: 0 }}>
                                No attempts have been deployed yet. Open an attempt first before scanning.
                            </p>
                        </div>
                    );
                }

                const effectiveAttempt = scannerAttempt ?? (gradesAttemptFilter != null && gradesAttemptFilter > 0 ? gradesAttemptFilter : null) ?? deployedAttempts[0].attempt_number;

                return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

                        {/* Section header + attempt selector */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
                            <div>
                                <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: 'var(--prof-text-main)' }}>Scan OMR Sheets</h3>
                                <p style={{ margin: '3px 0 0', fontSize: '0.83rem', color: 'var(--prof-text-muted)' }}>
                                    Attempt {effectiveAttempt} — {deployedAttempts.find(a => a.attempt_number === effectiveAttempt)?.status === 'done' ? 'Closed' : 'Open'}
                                </p>
                            </div>
                            {deployedAttempts.length > 1 && (
                                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                    {deployedAttempts.map(({ attempt_number, status }) => {
                                        const isActive = effectiveAttempt === attempt_number;
                                        return (
                                            <button
                                                key={attempt_number}
                                                onClick={() => setScannerAttempt(attempt_number)}
                                                style={{
                                                    padding: '6px 16px',
                                                    borderRadius: '8px',
                                                    border: `1.5px solid ${isActive ? 'var(--prof-primary)' : 'var(--prof-border)'}`,
                                                    background: isActive ? 'var(--prof-primary)' : '#fff',
                                                    color: isActive ? '#fff' : 'var(--prof-text-main)',
                                                    fontWeight: isActive ? 700 : 500,
                                                    fontSize: '0.85rem',
                                                    cursor: 'pointer',
                                                    display: 'inline-flex',
                                                    alignItems: 'center',
                                                    gap: '6px',
                                                }}
                                            >
                                                Attempt {attempt_number}
                                                <span style={{ fontSize: '0.75rem', opacity: 0.75, fontWeight: 400 }}>
                                                    {status === 'done' ? '(Closed)' : '(Open)'}
                                                </span>
                                            </button>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        {/* OMR Scanner inline */}
                        <OMRScanner
                            examId={exam.id}
                            attemptNumber={effectiveAttempt}
                            numSets={exam.num_sets}
                            enrollments={(gradesData[effectiveAttempt] ?? []).map(r => r.enrollment)}
                            existingGrades={gradesData[effectiveAttempt] ?? []}
                            onComplete={loadGradesOnly}
                            onBusyChange={setIsScannerBusy}
                        />
                    </div>
                );
            })()}

            {activeTab === 'analysis' && (
                <ExamAnalysis
                    exam={exam}
                    gradesData={gradesData}
                    questionMap={questionMap}
                    passingRate={passingRate}
                    isLoadingGrades={isLoadingGrades}
                />
            )}

            {/* ── Loading overlay (blocks all interaction while generating) ── */}
            <LoadingOverlay
                isOpen={isGenerating}
                message="Generating exam sets…"
                subtext="This may take a moment. Please wait."
            />

            {/* ── Modals ── */}
            <Popup
                isOpen={removeTarget !== null}
                title="Remove Co-Handler"
                message={`Remove ${removeTarget?.name ?? 'this professor'} from the exam? They will lose access and their invitation will be cancelled.`}
                type="danger"
                onConfirm={async () => {
                    if (!removeTarget) return;
                    await Promise.all([
                        removeExamFaculty(removeTarget.id),
                        deleteNotificationByFacultyId(removeTarget.id),
                    ]);
                    setFaculty(prev => prev.filter(f => f.id !== removeTarget.id));
                    setRemoveTarget(null);
                }}
                onCancel={() => setRemoveTarget(null)}
                confirmText="Remove"
                cancelText="Cancel"
            />
            <Popup
                isOpen={pendingTab !== null}
                title="Scanning in Progress"
                message="You have ongoing scanning activity. Leaving this tab may cause unsaved work to be lost. Are you sure you want to continue?"
                type="warning"
                onConfirm={() => {
                    const dest = pendingTab!;
                    setPendingTab(null);
                    navigate(`/professor/exams/${examId}/${dest}`);
                }}
                onCancel={() => setPendingTab(null)}
                confirmText="Leave Tab"
                cancelText="Stay"
            />
            <Popup
                isOpen={isRegenerateConfirmOpen}
                title="Regenerate Papers"
                message={`Regenerate all papers for Attempt ${activeAttempt}? The existing sets will be replaced with newly generated ones.`}
                type="warning"
                onConfirm={() => { setIsRegenerateConfirmOpen(false); openGenerateForm(activeAttempt); }}
                onCancel={() => setIsRegenerateConfirmOpen(false)}
                confirmText="Regenerate"
                cancelText="Cancel"
            />
            <Popup
                isOpen={isDeleteAttemptConfirmOpen}
                title="Delete Attempt Papers"
                message={`Delete all papers for Attempt ${activeAttempt}? This cannot be undone.`}
                type="danger"
                onConfirm={() => { setIsDeleteAttemptConfirmOpen(false); handleDeleteAttemptPapers(activeAttempt); }}
                onCancel={() => setIsDeleteAttemptConfirmOpen(false)}
                confirmText={isDeletingAttempt === activeAttempt ? 'Deleting...' : 'Delete'}
                cancelText="Cancel"
            />
            <Popup
                isOpen={isUnlockConfirmOpen}
                title="Unlock Exam"
                message={`Unlock "${exam.title}"? Enrolled students will be able to see and access this exam.`}
                type="info"
                onConfirm={handleUnlock}
                onCancel={() => setIsUnlockConfirmOpen(false)}
                confirmText={isUnlocking ? 'Unlocking...' : 'Unlock'}
                cancelText="Cancel"
            />
            <Popup
                isOpen={isLockConfirmOpen}
                title="Lock Exam"
                message={`Lock "${exam.title}"? Students will still see the exam in their list but will not be able to access it.`}
                type="warning"
                onConfirm={handleLock}
                onCancel={() => setIsLockConfirmOpen(false)}
                confirmText={isLocking ? 'Locking...' : 'Lock'}
                cancelText="Cancel"
            />
            <Popup
                isOpen={isAttemptDeployOpen}
                title={`Open Attempt ${activeAttempt}`}
                message={`Open Attempt ${activeAttempt} for "${exam.title}"? Students enrolled in this (unlocked) exam will be able to take this attempt.`}
                type="info"
                onConfirm={() => handleDeployAttempt(activeAttempt)}
                onCancel={() => setIsAttemptDeployOpen(false)}
                confirmText={isAttemptDeploying ? 'Opening...' : 'Open Attempt'}
                cancelText="Cancel"
            />
            <Popup
                isOpen={isAttemptDoneOpen}
                title={`Close Attempt ${activeAttempt}`}
                message={`Close Attempt ${activeAttempt}? Students will no longer be able to submit for this attempt.`}
                type="warning"
                onConfirm={() => handleAttemptDone(activeAttempt)}
                onCancel={() => setIsAttemptDoneOpen(false)}
                confirmText={isAttemptDoneProcessing ? 'Closing...' : 'Close Attempt'}
                cancelText="Cancel"
            />
            <Popup
                isOpen={isDeleteConfirmOpen}
                title="Delete Exam"
                message={`Are you sure you want to delete "${exam.title}" (${exam.code})? All papers and enrollments will be permanently removed.`}
                type="danger"
                onConfirm={handleDeleteExam}
                onCancel={() => setIsDeleteConfirmOpen(false)}
                confirmText={isDeleting ? 'Deleting...' : 'Delete'}
                cancelText="Cancel"
            />
            <Popup
                isOpen={isBulkDeleteOpen}
                title="Remove Selected Submissions"
                message={`Remove ${selectedGradeKeys.size} student submission${selectedGradeKeys.size === 1 ? '' : 's'}? This will permanently delete their scores and answers and cannot be undone.`}
                type="danger"
                onConfirm={handleBulkDeleteConfirmed}
                onCancel={() => setIsBulkDeleteOpen(false)}
                confirmText={isBulkDeleting ? 'Deleting...' : 'Remove'}
                cancelText="Cancel"
            />


        </div>
    );
}
