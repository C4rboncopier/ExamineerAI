import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import katex from 'katex';
import {
    fetchExamById, lockExam, unlockExam, deleteExam,
    generateExamPapersForAttempt, deleteAttemptPapers,
    deployAttempt, markAttemptDone,
} from '../../lib/exams';
import type { ExamWithSets, ExamSetDetail, AllocationConfig } from '../../lib/exams';
import { fetchQuestionsByIds, fetchQuestionsBySubject } from '../../lib/questions';
import type { QuestionSummary, QuestionWithOutcomes } from '../../lib/questions';
import { printExam } from '../../lib/printExam';
import type { PaperSize, SizeUnit } from '../../lib/printExam';
import { fetchSchoolInfo, fetchAcademicYear, fetchSemester } from '../../lib/settings';
import { Popup } from '../common/Popup';
import { ExamStudents } from './ExamStudents';

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

type Tab = 'overview' | 'papers' | 'students';

export function ViewExam() {
    const { examId } = useParams<{ examId: string }>();
    const navigate = useNavigate();

    // ── Core exam state ──
    const [exam, setExam] = useState<ExamWithSets | null>(null);
    const [questionMap, setQuestionMap] = useState<Record<string, QuestionSummary>>({});
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // ── Tab navigation ──
    const [activeTab, setActiveTab] = useState<Tab>('overview');

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
    const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
    const [paperSize, setPaperSize] = useState<PaperSize>('A4');
    const [customWidth, setCustomWidth] = useState('');
    const [customHeight, setCustomHeight] = useState('');
    const [customUnit, setCustomUnit] = useState<SizeUnit>('in');

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

    // ── School info ──
    const [schoolName, setSchoolName] = useState('');
    const [schoolLogoUrl, setSchoolLogoUrl] = useState<string | null>(null);
    const [schoolAy, setSchoolAy] = useState('');
    const [schoolSem, setSchoolSem] = useState('');

    useEffect(() => {
        fetchSchoolInfo().then(({ name, logoUrl }) => {
            if (name) setSchoolName(name);
            setSchoolLogoUrl(logoUrl);
        });
        fetchAcademicYear().then(({ value }) => { if (value) setSchoolAy(value); });
        fetchSemester().then(({ value }) => { if (value) setSchoolSem(value); });
    }, []);

    const loadExam = useCallback(async () => {
        if (!examId) return;
        const { data, error } = await fetchExamById(examId);
        if (error || !data) { setError('Failed to load exam.'); setIsLoading(false); return; }
        setExam(data);
        const allIds = [...new Set(data.exam_sets.flatMap(s => s.question_ids))];
        if (allIds.length === 0) { setIsLoading(false); return; }
        const { data: questions } = await fetchQuestionsByIds(allIds);
        const map: Record<string, QuestionSummary> = {};
        questions.forEach(q => { map[q.id] = q; });
        setQuestionMap(map);
        setIsLoading(false);
    }, [examId]);

    useEffect(() => { loadExam(); }, [loadExam]);

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
    const currentAttemptSets = setsByAttempt[activeAttempt] ?? [];
    const currentSet = currentAttemptSets[activeSet];
    const shuffleKey = `${activeAttempt}-${activeSet}`;
    const orderedIds = currentSet ? (shuffledMap[shuffleKey] ?? currentSet.question_ids) : [];
    const currentQuestions = orderedIds.map(id => questionMap[id]).filter(Boolean) as QuestionSummary[];
    const totalPages = Math.ceil(currentQuestions.length / ITEMS_PER_PAGE);
    const pagedQuestions = currentQuestions.slice(currentPage * ITEMS_PER_PAGE, (currentPage + 1) * ITEMS_PER_PAGE);

    const customWidthNum = parseFloat(customWidth);
    const customHeightNum = parseFloat(customHeight);
    const isCustomValid = paperSize !== 'Custom' || (
        !isNaN(customWidthNum) && customWidthNum > 0 &&
        !isNaN(customHeightNum) && customHeightNum > 0
    );

    const canGeneratePapers = exam.num_sets > 0 && exam.exam_subjects.length > 0;

    const handleRearrange = () => {
        if (!currentSet) return;
        const ids = [...(shuffledMap[shuffleKey] ?? currentSet.question_ids)];
        for (let i = ids.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [ids[i], ids[j]] = [ids[j], ids[i]];
        }
        setShuffledMap(prev => ({ ...prev, [shuffleKey]: ids }));
        setCurrentPage(0);
        setExpandedId(null);
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
            paperSize,
            customWidth: customWidthNum || undefined,
            customHeight: customHeightNum || undefined,
            customUnit,
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

    const statusColor = exam.status === 'unlocked' ? '#16a34a' : '#f59e0b';
    const statusLabel = exam.status === 'unlocked' ? 'Unlocked' : 'Locked';
    const attemptStatus = attemptStatusMap[activeAttempt] ?? 'draft';

    const TAB_LABELS: Record<Tab, string> = { overview: 'Overview', papers: 'Exam Papers', students: 'Students' };

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
                {(['overview', 'papers', 'students'] as Tab[]).map(tab => {
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

            {/* ══════════════════════════════════════════════
                OVERVIEW TAB
            ══════════════════════════════════════════════ */}
            {activeTab === 'overview' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

                    {/* Status card + actions */}
                    <div className="cs-card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
                        <div>
                            {exam.status === 'unlocked' ? (
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '8px 16px', borderRadius: '8px', fontSize: '0.9rem', fontWeight: 600, background: '#dcfce7', color: '#16a34a', border: '1px solid #86efac' }}>
                                    <svg fill="none" strokeWidth="2" stroke="currentColor" viewBox="0 0 24 24" width="16" height="16"><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 10.5V6.75a4.5 4.5 0 119 0v3.75M3.75 21.75h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H3.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" /></svg>
                                    Unlocked — visible &amp; accessible to students
                                </span>
                            ) : (
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '8px 16px', borderRadius: '8px', fontSize: '0.9rem', fontWeight: 600, background: '#fef9c3', color: '#854d0e', border: '1px solid #fde047' }}>
                                    <svg fill="none" strokeWidth="2" stroke="currentColor" viewBox="0 0 24 24" width="16" height="16"><path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" /></svg>
                                    Locked — students can see but not access
                                </span>
                            )}
                        </div>
                        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
                            <button className="btn-secondary" style={{ padding: '7px 16px', height: '38px', display: 'inline-flex', alignItems: 'center' }} onClick={() => navigate(`/professor/exams/${exam.id}/edit`)}>
                                Edit Exam
                            </button>
                            <button
                                className="btn-secondary"
                                style={{ color: '#ef4444', borderColor: '#fca5a5', padding: '7px 16px', height: '38px', display: 'inline-flex', alignItems: 'center' }}
                                onClick={() => setIsDeleteConfirmOpen(true)}
                            >
                                Delete
                            </button>
                            {exam.status === 'locked' ? (
                                <button
                                    className="btn-primary"
                                    style={{ background: '#16a34a', borderColor: '#16a34a', padding: '7px 16px', height: '38px', display: 'inline-flex', alignItems: 'center' }}
                                    onClick={() => setIsUnlockConfirmOpen(true)}
                                >
                                    Unlock
                                </button>
                            ) : (
                                <button
                                    className="btn-secondary"
                                    style={{ color: '#f59e0b', borderColor: '#fcd34d', padding: '7px 16px', height: '38px', display: 'inline-flex', alignItems: 'center' }}
                                    onClick={() => setIsLockConfirmOpen(true)}
                                >
                                    Lock
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Exam details */}
                    <div className="cs-card">
                        <h3 className="cs-card-title">Exam Details</h3>
                        <dl style={{ display: 'grid', gridTemplateColumns: 'max-content 1fr', gap: '12px 24px', fontSize: '0.9rem', margin: 0 }}>
                            <dt style={{ fontWeight: 600, color: 'var(--prof-text-muted)' }}>Academic Year</dt>
                            <dd style={{ margin: 0 }}>{exam.academic_year}</dd>
                            <dt style={{ fontWeight: 600, color: 'var(--prof-text-muted)' }}>Term</dt>
                            <dd style={{ margin: 0 }}>{exam.term}</dd>
                            <dt style={{ fontWeight: 600, color: 'var(--prof-text-muted)' }}>Sets per Attempt</dt>
                            <dd style={{ margin: 0 }}>{exam.num_sets === 0 ? <span style={{ color: '#ef4444' }}>Not set</span> : exam.num_sets}</dd>
                            <dt style={{ fontWeight: 600, color: 'var(--prof-text-muted)' }}>Max Attempts</dt>
                            <dd style={{ margin: 0 }}>{exam.max_attempts}</dd>
                            <dt style={{ fontWeight: 600, color: 'var(--prof-text-muted)' }}>Subjects</dt>
                            <dd style={{ margin: 0 }}>
                                {subjectTags.length === 0 ? (
                                    <span style={{ color: '#ef4444' }}>None linked</span>
                                ) : (
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                                        {subjectTags.map(s => (
                                            <span key={s.subject_id} style={{ background: '#f1f5f9', padding: '3px 10px', borderRadius: '12px', fontSize: '0.82rem', color: '#475569', border: '1px solid #e2e8f0' }}>
                                                {s.subjects!.course_code} — {s.subjects!.course_title}
                                            </span>
                                        ))}
                                    </div>
                                )}
                            </dd>
                        </dl>
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
                        <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px' }}>
                            {attemptStatus === 'draft' && currentAttemptSets.length > 0 && (
                                <button
                                    className="btn-primary"
                                    style={{ fontSize: '0.85rem', padding: '6px 14px', background: '#16a34a', borderColor: '#16a34a' }}
                                    onClick={() => setIsAttemptDeployOpen(true)}
                                >
                                    Open Attempt
                                </button>
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
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '24px' }}>
                                                <div className="cs-input-field" style={{ maxWidth: '240px', margin: 0 }}>
                                                    <label>Total Questions per Set</label>
                                                    <input
                                                        type="number" min="1"
                                                        value={genTotalQuestions}
                                                        onChange={e => setGenTotalQuestions(Math.max(1, parseInt(e.target.value) || 1))}
                                                    />
                                                </div>
                                            </div>
                                        ) : genAllocMode === 'per_subject' ? (
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc', padding: '16px 20px', borderRadius: '12px', border: '1px solid #e2e8f0', marginBottom: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
                                                <span style={{ fontSize: '0.95rem', fontWeight: 600, color: '#334155' }}>Total Configured Questions per Set</span>
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
                                <>
                                    <p style={{ color: 'var(--prof-text-muted)', marginBottom: '16px', fontSize: '0.9rem' }}>
                                        No papers generated for Attempt {activeAttempt} yet.
                                    </p>
                                    <button className="btn-primary" onClick={() => openGenerateForm(activeAttempt)}>
                                        Generate Papers
                                    </button>
                                </>
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
                            {attemptStatus === 'draft' && (
                                <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', paddingBottom: '16px', borderBottom: '1px solid var(--prof-border)' }}>
                                    <button
                                        className="btn-secondary"
                                        style={{ fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '6px' }}
                                        onClick={() => openGenerateForm(activeAttempt)}
                                    >
                                        <svg fill="none" strokeWidth="2" stroke="currentColor" viewBox="0 0 24 24" width="14" height="14"><path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" /></svg>
                                        Regenerate
                                    </button>
                                    <button
                                        className="btn-icon danger"
                                        title="Delete papers for this attempt"
                                        onClick={() => handleDeleteAttemptPapers(activeAttempt)}
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

                            {/* Question list */}
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

            {/* ── Modals ── */}
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

            {/* ── Print modal ── */}
            {isPrintModalOpen && (
                <div className="ql-summary-overlay" onClick={() => setIsPrintModalOpen(false)} style={{ zIndex: 2000 }}>
                    <div className="ql-summary-modal" style={{ maxWidth: '440px' }} onClick={e => e.stopPropagation()}>
                        <div className="ql-summary-header" style={{ padding: '20px 24px' }}>
                            <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--prof-text-main)', fontSize: '1.1rem' }}>
                                <svg fill="none" strokeWidth="2" stroke="currentColor" viewBox="0 0 24 24" width="20" height="20" style={{ color: 'var(--prof-primary)' }}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0110.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03.48.062.72.096m-.72-.096L17.66 18m0 0l.229 2.523a1.125 1.125 0 01-1.12 1.227H7.231c-.662 0-1.18-.568-1.12-1.227L6.34 18m11.318 0h1.091A2.25 2.25 0 0021 15.75V9.456c0-1.081-.768-2.015-1.837-2.175a48.055 48.055 0 00-1.913-.247M6.34 18H5.25A2.25 2.25 0 013 15.75V9.456c0-1.081.768-2.015 1.837-2.175a48.041 48.041 0 011.913-.247m10.5 0a48.536 48.536 0 00-10.5 0m10.5 0V3.375c0-.621-.504-1.125-1.125-1.125h-8.25c-.621 0-1.125.504-1.125 1.125v3.659M18 10.5h.008v.008H18V10.5zm-3 0h.008v.008H15V10.5z" />
                                </svg>
                                Print — Set {SET_LABELS[activeSet] ?? activeSet + 1}
                            </h3>
                            <button className="ql-summary-close" onClick={() => setIsPrintModalOpen(false)}>
                                <svg fill="none" strokeWidth="2" stroke="currentColor" viewBox="0 0 24 24" width="18" height="18"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                            </button>
                        </div>
                        <div style={{ padding: '24px' }}>
                            <p style={{ fontSize: '0.95rem', color: 'var(--prof-text-muted)', marginBottom: '20px', marginTop: 0 }}>
                                Select your preferred paper size.
                            </p>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
                                {PAPER_SIZES.filter(p => p.value !== 'Custom').map(({ value, label, desc }) => {
                                    const isSelected = paperSize === value;
                                    return (
                                        <label key={value} style={{ display: 'flex', alignItems: 'center', padding: '12px 14px', borderRadius: '10px', border: `2px solid ${isSelected ? 'var(--prof-primary)' : 'var(--prof-border)'}`, backgroundColor: isSelected ? 'rgba(15, 37, 84, 0.04)' : 'var(--prof-surface)', cursor: 'pointer', transition: 'all 0.2s ease' }}>
                                            <div style={{ position: 'relative', width: '20px', height: '20px', borderRadius: '50%', border: `2px solid ${isSelected ? 'var(--prof-primary)' : '#cbd5e1'}`, marginRight: '12px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', boxSizing: 'border-box' }}>
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
                            {(() => {
                                const { value, label, desc } = PAPER_SIZES.find(p => p.value === 'Custom')!;
                                const isSelected = paperSize === value;
                                return (
                                    <div>
                                        <label style={{ display: 'flex', alignItems: 'center', padding: '12px 14px', borderRadius: '10px', border: `2px solid ${isSelected ? 'var(--prof-primary)' : 'var(--prof-border)'}`, backgroundColor: isSelected ? 'rgba(15, 37, 84, 0.04)' : 'var(--prof-surface)', cursor: 'pointer', transition: 'all 0.2s ease' }}>
                                            <div style={{ width: '18px', height: '18px', borderRadius: '50%', border: `2px solid ${isSelected ? 'var(--prof-primary)' : '#cbd5e1'}`, marginRight: '10px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                {isSelected && <div style={{ width: '9px', height: '9px', borderRadius: '50%', backgroundColor: 'var(--prof-primary)' }} />}
                                            </div>
                                            <input type="radio" name="paper-size" value={value} checked={isSelected} onChange={() => setPaperSize(value)} style={{ display: 'none' }} />
                                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                                                <span style={{ fontWeight: 600, fontSize: '0.9rem', color: isSelected ? 'var(--prof-primary)' : 'var(--prof-text-main)' }}>{label}</span>
                                                <span style={{ fontSize: '0.75rem', color: 'var(--prof-text-muted)', marginTop: '1px' }}>{desc}</span>
                                            </div>
                                        </label>
                                        {isSelected && (
                                            <div style={{ marginTop: '10px', padding: '16px', background: 'var(--prof-bg)', borderRadius: '8px', border: '1px solid var(--prof-border)' }}>
                                                <p style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--prof-text-muted)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Unit</p>
                                                <div style={{ display: 'flex', gap: '8px', marginBottom: '14px' }}>
                                                    {SIZE_UNITS.map(u => (
                                                        <button key={u.value} type="button" onClick={() => setCustomUnit(u.value)}
                                                            style={{ padding: '6px 14px', borderRadius: '6px', fontSize: '0.85rem', fontWeight: customUnit === u.value ? 600 : 400, border: `1.5px solid ${customUnit === u.value ? 'var(--prof-primary)' : 'var(--prof-border)'}`, background: customUnit === u.value ? 'rgba(15,37,84,0.06)' : 'var(--prof-surface)', color: customUnit === u.value ? 'var(--prof-primary)' : 'var(--prof-text-muted)', cursor: 'pointer' }}>
                                                            {u.label}
                                                        </button>
                                                    ))}
                                                </div>
                                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                                                    {[{ label: 'Width', val: customWidth, set: setCustomWidth }, { label: 'Height', val: customHeight, set: setCustomHeight }].map(({ label, val, set }) => (
                                                        <div key={label}>
                                                            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--prof-text-muted)', marginBottom: '5px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</label>
                                                            <div style={{ display: 'flex', alignItems: 'center', border: '1.5px solid var(--prof-border)', borderRadius: '7px', overflow: 'hidden', background: 'var(--prof-surface)' }}>
                                                                <input type="number" min="1" step="0.1" placeholder="e.g. 8.5" value={val} onChange={e => set(e.target.value)}
                                                                    style={{ flex: 1, border: 'none', outline: 'none', padding: '8px 10px', fontSize: '0.9rem', background: 'transparent', color: 'var(--prof-text-main)' }} />
                                                                <span style={{ padding: '0 10px', fontSize: '0.8rem', color: 'var(--prof-text-muted)', borderLeft: '1px solid var(--prof-border)' }}>{customUnit}</span>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                );
                            })()}
                            <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
                                <button className="btn-secondary" style={{ flex: 1, padding: '12px' }} onClick={() => setIsPrintModalOpen(false)}>Cancel</button>
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
