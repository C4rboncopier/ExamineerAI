import { useCallback, useEffect, useRef, useState } from 'react';
import {
    type AttemptGradeRow,
    type EnrolledStudentFull,
    type OMRResult,
    type SetAnswerKey,
    fetchSetAnswerKey,
    gradeOMR,
    matchStudentByRoll,
    saveOMRSubmission,
    scanOMRBatch,
    scanOMRImage,
    setLetterToNumber,
} from '../../lib/grading';

// ── Types ─────────────────────────────────────────────────────────────────────

type ScanMode = 'camera' | 'image' | 'zip' | 'manual';
type GradeDecision = 'partial' | 'verified';
type GradeStatus = 'verified' | 'partial' | 'no_match' | 'no_set' | 'server_error' | 'omr_error';

interface ComputedGrade {
    student: EnrolledStudentFull | null;
    setNumber: number;
    answerKey: SetAnswerKey | null;
    score: number;
    totalItems: number;
    answers: Record<string, number>;
}

interface PendingReview {
    omrResult: OMRResult;
    editRollNumber: string;
    editExamSet: string;
    editAnswers: string[];      // editable copy, 100 entries
    filename?: string;
    source: ScanMode;
    computed?: ComputedGrade;
    computeError?: string;
    isComputing?: boolean;
    alreadyGraded?: boolean;    // student already has a submission for this attempt
}

interface ScanRow {
    filename?: string;
    omrResult: OMRResult;
    student: EnrolledStudentFull | null;
    gradeStatus: GradeStatus;
    score?: number;
    totalItems?: number;
    examSet?: string;
    decision?: GradeDecision;
}

interface Props {
    examId: string;
    attemptNumber: number;
    numSets: number;
    enrollments: EnrolledStudentFull[];
    existingGrades?: AttemptGradeRow[];   // already-saved submissions for duplicate detection
    onComplete: () => void;
    onBusyChange?: (busy: boolean) => void;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const ANSWER_LETTERS = ['A', 'B', 'C', 'D', 'E'];

/** Returns the set of 0-based question indices that have more than one shaded bubble. */
function getMultiBubbleQuestions(omrResult: OMRResult): Set<number> {
    const counts: Record<number, number> = {};
    for (const b of omrResult.bubble_positions ?? []) {
        counts[b.q_idx] = (counts[b.q_idx] ?? 0) + 1;
    }
    const result = new Set<number>();
    for (const [qIdx, count] of Object.entries(counts)) {
        if (count > 1) result.add(Number(qIdx));
    }
    return result;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function OMRScanner({ examId, attemptNumber, numSets, enrollments, existingGrades, onComplete, onBusyChange }: Props) {
    const [mode, setMode] = useState<ScanMode>('camera');
    const serverUrl = import.meta.env.VITE_OMR_URL || '/omr';

    // ── Processing ────────────────────────────────────────────────────────────
    const [isProcessing, setIsProcessing] = useState(false);
    const [zipProgress, setZipProgress] = useState<{ phase: string; done: number; total: number } | null>(null);

    // ── Finalized results ─────────────────────────────────────────────────────
    const [results, setResults] = useState<ScanRow[]>([]);

    // ── Review queue ──────────────────────────────────────────────────────────
    const [reviewQueue, setReviewQueue] = useState<PendingReview[]>([]);
    const [reviewIndex, setReviewIndex] = useState(0);
    const [showAnswerEditor, setShowAnswerEditor] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    // ── Camera ────────────────────────────────────────────────────────────────
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const [cameraActive, setCameraActive] = useState(false);
    const [cameraError, setCameraError] = useState<string | null>(null);

    // ── Image upload ──────────────────────────────────────────────────────────
    const [imageFile, setImageFile] = useState<File | null>(null);
    const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);

    // ── ZIP ───────────────────────────────────────────────────────────────────
    const [zipFile, setZipFile] = useState<File | null>(null);

    // ── Manual input ──────────────────────────────────────────────────────────
    const [manualStudentSearch, setManualStudentSearch] = useState('');
    const [manualStudentId, setManualStudentId] = useState<string>('');
    const [manualSetNumber, setManualSetNumber] = useState(1);
    const [manualAnswerKey, setManualAnswerKey] = useState<SetAnswerKey | null>(null);
    const [manualAnswers, setManualAnswers] = useState<string[]>([]);
    const [isLoadingManualKey, setIsLoadingManualKey] = useState(false);
    const [manualKeyError, setManualKeyError] = useState<string | null>(null);
    const [isSavingManual, setIsSavingManual] = useState(false);
    const [manualSaveError, setManualSaveError] = useState<string | null>(null);

    // ── Busy state ────────────────────────────────────────────────────────────
    useEffect(() => {
        onBusyChange?.(cameraActive || isProcessing || reviewQueue.length > 0);
    }, [cameraActive, isProcessing, reviewQueue.length, onBusyChange]);

    // ── Responsive ────────────────────────────────────────────────────────────
    const [isMobile, setIsMobile] = useState(() => window.innerWidth < 640);
    useEffect(() => {
        const mq = window.matchMedia('(max-width: 640px)');
        const handler = () => setIsMobile(mq.matches);
        mq.addEventListener('change', handler);
        return () => mq.removeEventListener('change', handler);
    }, []);

    // ── Image viewer (zoom / pan) ─────────────────────────────────────────────
    const [imgTransform, setImgTransform] = useState({ scale: 1, tx: 0, ty: 0 });
    const imgTransformRef = useRef({ scale: 1, tx: 0, ty: 0 });
    const imgContainerRef = useRef<HTMLDivElement>(null);
    const imgRef = useRef<HTMLImageElement>(null);
    const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
    const imgDragging = useRef(false);
    const imgDragStart = useRef({ x: 0, y: 0 });
    const imgPinchStart = useRef<{ dist: number; scale: number; tx: number; ty: number; cx: number; cy: number } | null>(null);

    function applyImgTransform(next: { scale: number; tx: number; ty: number }) {
        imgTransformRef.current = next;
        setImgTransform(next);
    }

    // Fit and center the image inside the container
    function fitImage() {
        const img = imgRef.current;
        const container = imgContainerRef.current;
        if (!img || !container || !img.naturalWidth) return;
        const fitScale = Math.min(
            container.clientWidth / img.naturalWidth,
            container.clientHeight / img.naturalHeight,
            1,
        );
        applyImgTransform({
            scale: fitScale,
            tx: (container.clientWidth - img.naturalWidth * fitScale) / 2,
            ty: (container.clientHeight - img.naturalHeight * fitScale) / 2,
        });
    }

    // Reset transform when navigating to a new review item
    useEffect(() => {
        applyImgTransform({ scale: 1, tx: 0, ty: 0 });
        // If the image is already cached, fit immediately
        const img = imgRef.current;
        if (img?.complete && img.naturalWidth) fitImage();
    }, [reviewIndex]); // eslint-disable-line react-hooks/exhaustive-deps

    // Attach non-passive wheel + touch listeners to the image container
    useEffect(() => {
        const el = imgContainerRef.current;
        if (!el) return;

        const clampScale = (s: number) => Math.min(20, Math.max(0.1, s));

        const zoomAt = (cx: number, cy: number, factor: number) => {
            const prev = imgTransformRef.current;
            const ns = clampScale(prev.scale * factor);
            const r = ns / prev.scale;
            applyImgTransform({ scale: ns, tx: cx - r * (cx - prev.tx), ty: cy - r * (cy - prev.ty) });
        };

        const onWheel = (e: WheelEvent) => {
            e.preventDefault();
            const rect = el.getBoundingClientRect();
            zoomAt(e.clientX - rect.left, e.clientY - rect.top, e.deltaY < 0 ? 1.15 : 1 / 1.15);
        };

        const onTouchStart = (e: TouchEvent) => {
            if (e.touches.length === 1) {
                imgDragging.current = true;
                imgPinchStart.current = null;
                const cur = imgTransformRef.current;
                imgDragStart.current = { x: e.touches[0].clientX - cur.tx, y: e.touches[0].clientY - cur.ty };
            } else if (e.touches.length === 2) {
                e.preventDefault();
                imgDragging.current = false;
                const rect = el.getBoundingClientRect();
                const dist = Math.hypot(
                    e.touches[0].clientX - e.touches[1].clientX,
                    e.touches[0].clientY - e.touches[1].clientY,
                );
                const cur = imgTransformRef.current;
                imgPinchStart.current = {
                    dist,
                    scale: cur.scale,
                    tx: cur.tx,
                    ty: cur.ty,
                    cx: (e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left,
                    cy: (e.touches[0].clientY + e.touches[1].clientY) / 2 - rect.top,
                };
            }
        };

        const onTouchMove = (e: TouchEvent) => {
            e.preventDefault();
            if (e.touches.length === 1 && imgDragging.current) {
                const prev = imgTransformRef.current;
                applyImgTransform({
                    ...prev,
                    tx: e.touches[0].clientX - imgDragStart.current.x,
                    ty: e.touches[0].clientY - imgDragStart.current.y,
                });
            } else if (e.touches.length === 2 && imgPinchStart.current) {
                const dist = Math.hypot(
                    e.touches[0].clientX - e.touches[1].clientX,
                    e.touches[0].clientY - e.touches[1].clientY,
                );
                const p = imgPinchStart.current;
                const ns = clampScale(p.scale * (dist / p.dist));
                const r = ns / p.scale;
                applyImgTransform({ scale: ns, tx: p.cx - r * (p.cx - p.tx), ty: p.cy - r * (p.cy - p.ty) });
            }
        };

        const onTouchEnd = () => { imgDragging.current = false; imgPinchStart.current = null; };

        el.addEventListener('wheel', onWheel, { passive: false });
        el.addEventListener('touchstart', onTouchStart, { passive: false });
        el.addEventListener('touchmove', onTouchMove, { passive: false });
        el.addEventListener('touchend', onTouchEnd);
        return () => {
            el.removeEventListener('wheel', onWheel);
            el.removeEventListener('touchstart', onTouchStart);
            el.removeEventListener('touchmove', onTouchMove);
            el.removeEventListener('touchend', onTouchEnd);
        };
    }, [reviewQueue.length]); // re-attach when review panel mounts/unmounts (container is conditionally rendered)

    // Draw colored bubble circles on the overlay canvas after grade is computed
    useEffect(() => {
        const canvas = overlayCanvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const pending = reviewQueue[reviewIndex] ?? null;
        const bubbles = pending?.omrResult?.bubble_positions;
        const imgW = pending?.omrResult?.img_w ?? 1240;
        const imgH = pending?.omrResult?.img_h ?? 1604;

        canvas.width = imgW;
        canvas.height = imgH;
        ctx.clearRect(0, 0, imgW, imgH);

        if (!bubbles?.length) return;

        const multiBubbleQs = pending ? getMultiBubbleQuestions(pending.omrResult) : new Set<number>();
        for (const bubble of bubbles) {
            const studentAnswer = pending?.editAnswers[bubble.q_idx] ?? '';
            const computed = pending?.computed;
            let strokeColor = '#94a3b8'; // gray: detected, grade not yet computed

            if (multiBubbleQs.has(bubble.q_idx)) {
                strokeColor = '#eab308'; // yellow: multiple bubbles shaded
            } else if (computed?.answerKey) {
                const qId = computed.answerKey.questionIds[bubble.q_idx];
                const correctNum = qId != null ? computed.answerKey.questions[qId]?.correct_choice : undefined;
                const correctLetter = correctNum != null ? ANSWER_LETTERS[correctNum] : '';
                strokeColor = studentAnswer !== '' && studentAnswer === correctLetter ? '#16a34a' : '#dc2626';
            }

            ctx.beginPath();
            ctx.arc(bubble.x, bubble.y, bubble.r + 4, 0, Math.PI * 2);
            ctx.strokeStyle = strokeColor;
            ctx.lineWidth = 4;
            ctx.stroke();
        }
    }, [reviewQueue, reviewIndex]); // re-draws when grade computed or answers edited

    function onImgMouseDown(e: React.MouseEvent) {
        e.preventDefault();
        imgDragging.current = true;
        const cur = imgTransformRef.current;
        imgDragStart.current = { x: e.clientX - cur.tx, y: e.clientY - cur.ty };
    }

    function onImgMouseMove(e: React.MouseEvent) {
        if (!imgDragging.current) return;
        const prev = imgTransformRef.current;
        applyImgTransform({ ...prev, tx: e.clientX - imgDragStart.current.x, ty: e.clientY - imgDragStart.current.y });
    }

    function onImgMouseUp() { imgDragging.current = false; }

    function zoomBy(factor: number) {
        const container = imgContainerRef.current;
        if (!container) return;
        const cx = container.clientWidth / 2;
        const cy = container.clientHeight / 2;
        const prev = imgTransformRef.current;
        const ns = Math.min(20, Math.max(0.1, prev.scale * factor));
        const r = ns / prev.scale;
        applyImgTransform({ scale: ns, tx: cx - r * (cx - prev.tx), ty: cy - r * (cy - prev.ty) });
    }

    // ── Camera helpers ────────────────────────────────────────────────────────

    const startCamera = useCallback(async () => {
        setCameraError(null);
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 960 } },
            });
            streamRef.current = stream;
            setCameraActive(true); // triggers render → <video> mounts → useEffect below attaches stream
        } catch (err: any) {
            setCameraError(err?.message ?? 'Camera access denied');
        }
    }, []);

    const stopCamera = useCallback(() => {
        streamRef.current?.getTracks().forEach(t => t.stop());
        streamRef.current = null;
        if (videoRef.current) videoRef.current.srcObject = null;
        setCameraActive(false);
    }, []);

    // Attach stream to <video> after it mounts.
    // reviewQueue.length is included so the effect re-runs when the scan card
    // re-mounts after the user clicks Rescan (cameraActive stays true but <video> unmounts/remounts).
    useEffect(() => {
        if (!cameraActive || !videoRef.current || !streamRef.current) return;
        videoRef.current.srcObject = streamRef.current;
        videoRef.current.play().catch(() => {});
    }, [cameraActive, reviewQueue.length]); // eslint-disable-line react-hooks/exhaustive-deps

    // Stop camera when leaving camera mode
    useEffect(() => {
        if (mode !== 'camera') stopCamera();
    }, [mode, stopCamera]);

    // Cleanup on unmount
    useEffect(() => () => { streamRef.current?.getTracks().forEach(t => t.stop()); }, []);

    // Reset on attempt change
    useEffect(() => {
        setResults([]);
        setReviewQueue([]);
        setReviewIndex(0);
    }, [attemptNumber]);

    // ── Grade computation ─────────────────────────────────────────────────────

    /**
     * Async: fetch answer key for the given set, compute score from current editAnswers,
     * and write result into queue[idx] via functional state updates.
     */
    async function computeAtIndex(queue: PendingReview[], idx: number): Promise<void> {
        const pending = queue[idx];
        if (!pending) return;

        // Capture lookup values from the snapshot at call time
        const rollToUse = pending.editRollNumber;
        const setLetter = pending.editExamSet;

        setReviewQueue(prev => {
            const next = [...prev];
            if (next[idx]) next[idx] = { ...next[idx], isComputing: true, computeError: undefined };
            return next;
        });

        const student = matchStudentByRoll(enrollments, rollToUse);
        const setNumber = setLetterToNumber(setLetter || 'A');
        const { data: answerKey, error: keyError } = await fetchSetAnswerKey(examId, attemptNumber, setNumber);

        if (keyError || !answerKey) {
            setReviewQueue(prev => {
                const next = [...prev];
                if (next[idx]) next[idx] = { ...next[idx], isComputing: false, computeError: keyError ?? 'Set not found' };
                return next;
            });
            return;
        }

        // Check if this student already has a saved submission for this attempt
        const alreadyGraded = !!(student && existingGrades?.find(
            g => g.enrollment.student_id === student.student_id && g.submission != null
        ));

        // Use CURRENT editAnswers (may have been edited since the async call started)
        setReviewQueue(prev => {
            const next = [...prev];
            const item = next[idx];
            if (!item) return prev;
            const { score, totalItems, answers } = gradeOMR(answerKey.questionIds, item.editAnswers, answerKey.questions);
            next[idx] = { ...item, isComputing: false, alreadyGraded, computed: { student, setNumber, answerKey, score, totalItems, answers } };
            return next;
        });
    }

    /**
     * Sync: recompute score when editAnswers changes (uses stored answerKey).
     */
    function recomputeScoreSync(idx: number, newAnswers: string[]) {
        setReviewQueue(prev => {
            const next = [...prev];
            const item = next[idx];
            if (!item?.computed?.answerKey) return prev;
            const { score, totalItems, answers } = gradeOMR(
                item.computed.answerKey.questionIds,
                newAnswers,
                item.computed.answerKey.questions,
            );
            next[idx] = { ...item, editAnswers: newAnswers, computed: { ...item.computed, score, totalItems, answers } };
            return next;
        });
    }

    // ── Review entry ──────────────────────────────────────────────────────────

    async function enterReview(omrResult: OMRResult, source: ScanMode, filename?: string) {
        const multiBubbleQs = getMultiBubbleQuestions(omrResult);
        const editAnswers = [...(omrResult.answers ?? [])];
        for (const qIdx of multiBubbleQs) {
            if (qIdx < editAnswers.length) editAnswers[qIdx] = '';
        }
        const pending: PendingReview = {
            omrResult,
            editRollNumber: omrResult.roll_number ?? '',
            editExamSet: omrResult.exam_set ?? '',
            editAnswers,
            filename,
            source,
        };
        const queue = [pending];
        setReviewQueue(queue);
        setReviewIndex(0);
        setShowAnswerEditor(false);
        await computeAtIndex(queue, 0);
    }

    // ── Decision handling ─────────────────────────────────────────────────────

    async function handleDecision(decision: GradeDecision) {
        if (isSaving) return;
        setIsSaving(true);

        const pending = reviewQueue[reviewIndex];
        if (!pending) { setIsSaving(false); return; }

        let row: ScanRow;
        const computed = pending.computed;

        if (!computed) {
            row = { omrResult: pending.omrResult, student: null, gradeStatus: 'omr_error', filename: pending.filename };
        } else if (!computed.student) {
            row = { omrResult: pending.omrResult, student: null, gradeStatus: 'no_match', filename: pending.filename, decision };
        } else if (!computed.answerKey) {
            row = { omrResult: pending.omrResult, student: computed.student, gradeStatus: 'no_set', filename: pending.filename, decision };
        } else {
            const { error: saveError } = await saveOMRSubmission({
                examId,
                studentId: computed.student.student_id,
                attemptNumber,
                setNumber: computed.setNumber,
                answers: computed.answers,
                score: computed.score,
                totalItems: computed.totalItems,
            });
            row = {
                omrResult: pending.omrResult,
                student: computed.student,
                gradeStatus: saveError ? 'server_error' : decision,
                score: computed.score,
                totalItems: computed.totalItems,
                examSet: pending.editExamSet,
                filename: pending.filename,
                decision: saveError ? undefined : decision,
            };
            if (!saveError) onComplete();
        }

        setResults(prev => [...prev, row]);

        const nextIdx = reviewIndex + 1;
        if (nextIdx < reviewQueue.length) {
            setReviewIndex(nextIdx);
            setShowAnswerEditor(false);
            // Lazy compute next item if not already done
            if (!reviewQueue[nextIdx]?.computed && !reviewQueue[nextIdx]?.isComputing) {
                await computeAtIndex(reviewQueue, nextIdx);
            }
        } else {
            // All items done
            setReviewQueue([]);
            setReviewIndex(0);
            if (pending.source === 'camera') startCamera();
        }

        setIsSaving(false);
    }

    function handleRescan() {
        setReviewQueue([]);
        setReviewIndex(0);
        setShowAnswerEditor(false);
    }

    // ── Edit handlers ─────────────────────────────────────────────────────────

    function updateRollNumber(val: string) {
        setReviewQueue(prev => {
            const next = [...prev];
            if (next[reviewIndex]) next[reviewIndex] = { ...next[reviewIndex], editRollNumber: val };
            return next;
        });
    }

    function updateExamSet(val: string) {
        setReviewQueue(prev => {
            const next = [...prev];
            if (next[reviewIndex]) next[reviewIndex] = { ...next[reviewIndex], editExamSet: val };
            return next;
        });
    }

    async function handleRecompute() {
        await computeAtIndex(reviewQueue, reviewIndex);
    }

    function toggleAnswer(answerIdx: number) {
        const pending = reviewQueue[reviewIndex];
        if (!pending) return;
        const current = pending.editAnswers[answerIdx] ?? '';
        const pos = ANSWER_LETTERS.indexOf(current);
        const next = pos >= ANSWER_LETTERS.length - 1 ? '' : (ANSWER_LETTERS[pos + 1] ?? ANSWER_LETTERS[0]);
        const newAnswers = [...pending.editAnswers];
        newAnswers[answerIdx] = next;
        recomputeScoreSync(reviewIndex, newAnswers);
    }

    // ── Camera capture ────────────────────────────────────────────────────────

    async function handleCapture() {
        if (!videoRef.current || !canvasRef.current || isProcessing) return;
        const video = videoRef.current;
        const canvas = canvasRef.current;
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        canvas.getContext('2d')!.drawImage(video, 0, 0);
        canvas.toBlob(async (blob) => {
            if (!blob) return;
            setIsProcessing(true);
            try {
                const file = new File([blob], 'capture.jpg', { type: 'image/jpeg' });
                const omrResult = await scanOMRImage(file, serverUrl);
                stopCamera(); // turn off camera before showing review panel
                await enterReview(omrResult, 'camera', 'capture.jpg');
            } catch (err: any) {
                setResults(prev => [{ omrResult: { roll_number: '', exam_set: '', answers: [], error: err.message }, student: null, gradeStatus: 'server_error' }, ...prev]);
            } finally {
                setIsProcessing(false);
            }
        }, 'image/jpeg', 0.92);
    }

    // ── Image upload ──────────────────────────────────────────────────────────

    function handleImageSelect(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0] ?? null;
        setImageFile(file);
        if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl);
        setImagePreviewUrl(file ? URL.createObjectURL(file) : null);
    }

    async function handleScanImage() {
        if (!imageFile || isProcessing) return;
        setIsProcessing(true);
        try {
            const omrResult = await scanOMRImage(imageFile, serverUrl);
            await enterReview(omrResult, 'image', imageFile.name);
        } catch (err: any) {
            setResults(prev => [{ omrResult: { roll_number: '', exam_set: '', answers: [], error: err.message }, student: null, gradeStatus: 'server_error' }, ...prev]);
        } finally {
            setIsProcessing(false);
        }
    }

    // ── ZIP batch ─────────────────────────────────────────────────────────────

    async function handleProcessZip() {
        if (!zipFile || isProcessing) return;
        setIsProcessing(true);
        setZipProgress({ phase: 'Uploading ZIP…', done: 0, total: 0 });
        try {
            const omrResults = await scanOMRBatch(zipFile, serverUrl, (done, total) => {
                if (done === 0) {
                    setZipProgress({ phase: 'Scanning sheets…', done: 0, total });
                } else {
                    setZipProgress({ phase: `Scanning sheet ${done} of ${total}…`, done, total });
                }
            });
            if (omrResults.length === 0) {
                setZipProgress(null);
                setIsProcessing(false);
                return;
            }
            setZipProgress({ phase: 'Building review queue…', done: omrResults.length, total: omrResults.length });
            const queue: PendingReview[] = omrResults.map(r => {
                const mqs = getMultiBubbleQuestions(r);
                const editAnswers = [...(r.answers ?? [])];
                for (const qIdx of mqs) {
                    if (qIdx < editAnswers.length) editAnswers[qIdx] = '';
                }
                return {
                    omrResult: r,
                    editRollNumber: r.roll_number ?? '',
                    editExamSet: r.exam_set ?? '',
                    editAnswers,
                    filename: r.filename,
                    source: 'zip' as const,
                };
            });
            setReviewQueue(queue);
            setReviewIndex(0);
            setShowAnswerEditor(false);
            setZipProgress(null);
            setIsProcessing(false);
            // Compute first item
            await computeAtIndex(queue, 0);
        } catch (err: any) {
            setResults(prev => [{ omrResult: { roll_number: '', exam_set: '', answers: [], error: err.message }, student: null, gradeStatus: 'server_error' }, ...prev]);
            setZipProgress(null);
            setIsProcessing(false);
        }
    }

    // ── Manual input handlers ─────────────────────────────────────────────────

    async function handleLoadManualKey() {
        setIsLoadingManualKey(true);
        setManualKeyError(null);
        setManualAnswerKey(null);
        setManualAnswers([]);
        const { data: answerKey, error } = await fetchSetAnswerKey(examId, attemptNumber, manualSetNumber);
        if (error || !answerKey) {
            setManualKeyError(error ?? 'Set not found');
            setIsLoadingManualKey(false);
            return;
        }
        setManualAnswerKey(answerKey);
        setManualAnswers(Array(answerKey.questionIds.length).fill(''));
        setIsLoadingManualKey(false);
    }

    async function handleManualSubmit() {
        if (!manualAnswerKey || !manualStudentId || isSavingManual) return;
        setIsSavingManual(true);
        setManualSaveError(null);
        const student = enrollments.find(e => e.student_id === manualStudentId) ?? null;
        const { score, totalItems, answers } = gradeOMR(manualAnswerKey.questionIds, manualAnswers, manualAnswerKey.questions);
        const { error: saveError } = await saveOMRSubmission({
            examId,
            studentId: manualStudentId,
            attemptNumber,
            setNumber: manualSetNumber,
            answers,
            score,
            totalItems,
        });
        if (saveError) {
            setManualSaveError(saveError);
            setIsSavingManual(false);
            return;
        }
        const setLetter = ANSWER_LETTERS[manualSetNumber - 1] ?? 'A';
        const row: ScanRow = {
            omrResult: { roll_number: student?.student?.student_id ?? '', exam_set: setLetter, answers: manualAnswers, error: null },
            student,
            gradeStatus: 'verified',
            score,
            totalItems,
            examSet: setLetter,
            decision: 'verified',
        };
        setResults(prev => [...prev, row]);
        onComplete();
        setManualStudentId('');
        setManualStudentSearch('');
        setManualAnswers(Array(manualAnswerKey.questionIds.length).fill(''));
        setIsSavingManual(false);
    }

    // ── Styles ────────────────────────────────────────────────────────────────


    const modeTabStyle = (active: boolean): React.CSSProperties => ({
        padding: '8px 18px', borderRadius: '8px',
        border: `1.5px solid ${active ? 'var(--prof-primary, #2563eb)' : 'var(--prof-border, #e2e8f0)'}`,
        background: active ? 'var(--prof-primary, #2563eb)' : '#fff',
        color: active ? '#fff' : 'var(--prof-text-main, #1e293b)',
        fontWeight: active ? 700 : 500, fontSize: '0.88rem', cursor: 'pointer', transition: 'all 0.15s',
    });

    const btnPrimary: React.CSSProperties = {
        padding: '9px 20px', background: 'var(--prof-primary, #2563eb)', color: '#fff',
        border: 'none', borderRadius: '8px', fontWeight: 600, cursor: 'pointer',
        fontSize: '0.9rem', display: 'inline-flex', alignItems: 'center', gap: '8px',
    };

    const dropZoneStyle: React.CSSProperties = {
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        gap: '8px', padding: '36px 24px', border: '2px dashed var(--prof-border, #e2e8f0)',
        borderRadius: '10px', cursor: 'pointer', background: '#f8fafc',
        color: 'var(--prof-text-muted, #64748b)', fontSize: '0.9rem', transition: 'border-color 0.15s',
    };

    // ── Derived ───────────────────────────────────────────────────────────────

    const isReviewing = reviewQueue.length > 0;
    const currentPending = isReviewing ? reviewQueue[reviewIndex] : null;

    // ── Render ────────────────────────────────────────────────────────────────

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

            {/* ── Review Panel ─────────────────────────────────────────────── */}
            {isReviewing && currentPending && (
                <div className="cs-card">
                    {/* Header */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px', flexWrap: 'wrap', gap: '8px' }}>
                        <div>
                            <h3 className="cs-card-title" style={{ margin: 0 }}>
                                {currentPending.source === 'zip' ? 'Review Scanned Sheets' : 'Review Scan Result'}
                            </h3>
                            <p style={{ margin: '2px 0 0', fontSize: '0.82rem', color: 'var(--prof-text-muted, #64748b)' }}>
                                {currentPending.source === 'zip'
                                    ? `Sheet ${reviewIndex + 1} of ${reviewQueue.length}${currentPending.filename ? ` — ${currentPending.filename}` : ''}`
                                    : currentPending.filename ?? ''
                                }
                            </p>
                        </div>
                        {/* ZIP progress indicator */}
                        {currentPending.source === 'zip' && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.82rem', color: 'var(--prof-text-muted, #64748b)' }}>
                                <div style={{ width: '80px', height: '6px', background: '#e2e8f0', borderRadius: '99px', overflow: 'hidden' }}>
                                    <div style={{ height: '100%', width: `${((reviewIndex) / reviewQueue.length) * 100}%`, background: 'var(--prof-primary, #2563eb)', borderRadius: '99px', transition: 'width 0.2s' }} />
                                </div>
                                <span>{reviewIndex}/{reviewQueue.length}</span>
                            </div>
                        )}
                    </div>

                    {/* Two-column layout: image + editable fields */}
                    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '20px' }}>

                        {/* Debug image with zoom/pan */}
                        <div style={{ border: '1px solid var(--prof-border, #e2e8f0)', borderRadius: '10px', overflow: 'hidden', background: '#0f172a', display: 'flex', flexDirection: 'column' }}>
                            {/* Toolbar */}
                            {currentPending.omrResult.annotated_image && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '5px 8px', background: 'rgba(0,0,0,0.45)', flexShrink: 0 }}>
                                    <button onClick={() => zoomBy(1.25)} title="Zoom in" style={{ width: '28px', height: '28px', borderRadius: '5px', border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.08)', color: '#fff', cursor: 'pointer', fontSize: '1rem', lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>+</button>
                                    <button onClick={() => zoomBy(1 / 1.25)} title="Zoom out" style={{ width: '28px', height: '28px', borderRadius: '5px', border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.08)', color: '#fff', cursor: 'pointer', fontSize: '1.1rem', lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>−</button>
                                    <span style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.6)', minWidth: '38px', textAlign: 'center', fontFamily: 'monospace' }}>
                                        {Math.round(imgTransform.scale * 100)}%
                                    </span>
                                    <button onClick={fitImage} title="Fit to view" style={{ padding: '0 8px', height: '28px', borderRadius: '5px', border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.8)', cursor: 'pointer', fontSize: '0.72rem', fontWeight: 600, whiteSpace: 'nowrap' }}>Fit</button>
                                    <span style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.35)', marginLeft: 'auto' }}>scroll to zoom · drag to pan</span>
                                </div>
                            )}
                            {/* Viewport */}
                            <div
                                ref={imgContainerRef}
                                style={{ position: 'relative', overflow: 'hidden', minHeight: isMobile ? '420px' : '300px', flex: 1, cursor: 'grab' }}
                                onMouseDown={onImgMouseDown}
                                onMouseMove={onImgMouseMove}
                                onMouseUp={onImgMouseUp}
                                onMouseLeave={onImgMouseUp}
                            >
                                {currentPending.omrResult.annotated_image ? (
                                    <>
                                        <img
                                            ref={imgRef}
                                            src={currentPending.omrResult.annotated_image}
                                            alt="Annotated scan"
                                            draggable={false}
                                            onLoad={fitImage}
                                            style={{
                                                position: 'absolute',
                                                top: 0, left: 0,
                                                transformOrigin: '0 0',
                                                transform: `translate(${imgTransform.tx}px, ${imgTransform.ty}px) scale(${imgTransform.scale})`,
                                                userSelect: 'none',
                                                pointerEvents: 'none',
                                                display: 'block',
                                            }}
                                        />
                                        {/* Colored bubble overlay — same transform as img */}
                                        <canvas
                                            ref={overlayCanvasRef}
                                            style={{
                                                position: 'absolute',
                                                top: 0, left: 0,
                                                transformOrigin: '0 0',
                                                transform: `translate(${imgTransform.tx}px, ${imgTransform.ty}px) scale(${imgTransform.scale})`,
                                                pointerEvents: 'none',
                                                display: 'block',
                                            }}
                                        />
                                    </>
                                ) : (
                                    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.3)', gap: '8px' }}>
                                        <svg fill="none" strokeWidth="1.5" stroke="currentColor" viewBox="0 0 24 24" width="40" height="40" style={{ opacity: 0.4 }}>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
                                        </svg>
                                        <span style={{ fontSize: '0.82rem' }}>No annotated image</span>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Editable fields */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', minWidth: 0 }}>
                            {/* OMR error banner */}
                            {currentPending.omrResult.error && (
                                <div style={{ padding: '10px 14px', background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: '8px', color: '#dc2626', fontSize: '0.85rem' }}>
                                    <strong>Scanner error:</strong> {currentPending.omrResult.error}
                                </div>
                            )}

                            {/* Roll number */}
                            <div>
                                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--prof-text-muted, #64748b)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '4px' }}>
                                    Roll Number
                                </label>
                                <div style={{ display: 'flex', gap: '6px' }}>
                                    <input
                                        value={currentPending.editRollNumber}
                                        onChange={e => updateRollNumber(e.target.value)}
                                        onBlur={handleRecompute}
                                        maxLength={10}
                                        style={{ flex: 1, padding: '8px 10px', border: '1px solid var(--prof-border, #e2e8f0)', borderRadius: '6px', fontSize: '0.9rem', fontFamily: 'monospace' }}
                                    />
                                </div>
                            </div>

                            {/* Exam set */}
                            <div>
                                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--prof-text-muted, #64748b)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '4px' }}>
                                    Exam Set
                                </label>
                                <select
                                    value={currentPending.editExamSet}
                                    onChange={e => updateExamSet(e.target.value)}
                                    onBlur={handleRecompute}
                                    style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--prof-border, #e2e8f0)', borderRadius: '6px', fontSize: '0.9rem' }}
                                >
                                    <option value="">— Unknown —</option>
                                    {ANSWER_LETTERS.slice(0, numSets).map(l => <option key={l} value={l}>{l}</option>)}
                                </select>
                            </div>

                            {/* Recompute button (shown when user edited fields) */}
                            <button
                                onClick={handleRecompute}
                                disabled={currentPending.isComputing}
                                style={{ padding: '6px 12px', borderRadius: '6px', border: '1px solid var(--prof-border, #e2e8f0)', background: '#fff', cursor: currentPending.isComputing ? 'not-allowed' : 'pointer', fontSize: '0.82rem', fontWeight: 500, color: 'var(--prof-text-main, #1e293b)', alignSelf: 'flex-start', opacity: currentPending.isComputing ? 0.5 : 1 }}
                            >
                                ↺ Recompute
                            </button>

                            {/* Matched student */}
                            <div style={{ padding: '10px 12px', background: '#f8fafc', borderRadius: '8px', border: '1px solid var(--prof-border, #e2e8f0)' }}>
                                <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--prof-text-muted, #64748b)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '4px' }}>Matched Student</div>
                                {currentPending.isComputing ? (
                                    <span style={{ fontSize: '0.85rem', color: 'var(--prof-text-muted, #94a3b8)' }}>Computing…</span>
                                ) : currentPending.computeError ? (
                                    <span style={{ fontSize: '0.85rem', color: '#dc2626' }}>{currentPending.computeError}</span>
                                ) : currentPending.computed ? (
                                    currentPending.computed.student ? (
                                        <div>
                                            <div style={{ fontWeight: 600, fontSize: '0.88rem' }}>{currentPending.computed.student.student?.full_name ?? '—'}</div>
                                            <div style={{ fontSize: '0.78rem', color: 'var(--prof-text-muted, #64748b)' }}>{currentPending.computed.student.student?.student_id ?? ''}</div>
                                        </div>
                                    ) : (
                                        <span style={{ fontSize: '0.85rem', color: '#b45309' }}>No student matched</span>
                                    )
                                ) : (
                                    <span style={{ fontSize: '0.85rem', color: 'var(--prof-text-muted, #94a3b8)' }}>—</span>
                                )}
                            </div>

                            {/* Score */}
                            <div style={{ padding: '10px 12px', background: '#f8fafc', borderRadius: '8px', border: '1px solid var(--prof-border, #e2e8f0)' }}>
                                <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--prof-text-muted, #64748b)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '4px' }}>Score</div>
                                {currentPending.isComputing ? (
                                    <span style={{ fontSize: '0.85rem', color: 'var(--prof-text-muted, #94a3b8)' }}>Computing…</span>
                                ) : currentPending.computed ? (
                                    <span className="omr-score-value" style={{ fontWeight: 700, fontSize: '1.1rem' }}>{currentPending.computed.score} / {currentPending.computed.totalItems}</span>
                                ) : (
                                    <span style={{ fontSize: '0.85rem', color: 'var(--prof-text-muted, #94a3b8)' }}>—</span>
                                )}
                            </div>

                            {/* Answer editor toggle — mobile only */}
                            {isMobile && (
                                <button
                                    onClick={() => setShowAnswerEditor(v => !v)}
                                    style={{ background: 'none', border: '1px solid var(--prof-border, #e2e8f0)', borderRadius: '6px', padding: '7px 12px', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 500, color: 'var(--prof-text-main, #1e293b)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                                >
                                    <span>View / Edit Answers</span>
                                    <span style={{ fontSize: '0.7rem', color: 'var(--prof-text-muted, #64748b)' }}>{showAnswerEditor ? '▲ Collapse' : '▼ Expand'}</span>
                                </button>
                            )}

                            {/* ── Answer editor grid — always visible on desktop, toggle on mobile ── */}
                            {(!isMobile || showAnswerEditor) && (() => {
                                const hasAnswerKey = !!currentPending.computed?.answerKey;
                                return (
                                <div style={{ padding: '14px 16px', background: '#f8fafc', borderRadius: '8px', border: '1px solid var(--prof-border, #e2e8f0)', overflow: 'hidden' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px', flexWrap: 'wrap', gap: '8px' }}>
                                <span style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--prof-text-muted, #64748b)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                    Answer Grid — click to cycle (A→B→C→D→E→blank)
                                </span>
                                {hasAnswerKey && (
                                    <span style={{ display: 'flex', gap: '10px', fontSize: '0.72rem' }}>
                                        <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                            <span style={{ width: '10px', height: '10px', background: '#dcfce7', border: '1px solid #86efac', borderRadius: '2px', display: 'inline-block' }} />
                                            Correct
                                        </span>
                                        <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                            <span style={{ width: '10px', height: '10px', background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: '2px', display: 'inline-block' }} />
                                            Wrong (small = correct ans.)
                                        </span>
                                    </span>
                                )}
                            </div>
                            <div style={{ overflowX: 'auto' }}>
                                <table style={{ borderCollapse: 'collapse', fontSize: '0.78rem' }}>
                                    <thead>
                                        <tr>
                                            <th style={{ padding: '4px 8px', color: 'var(--prof-text-muted, #94a3b8)', fontWeight: 500, fontSize: '0.72rem' }}>Base</th>
                                            {Array.from({ length: 10 }, (_, i) => (
                                                <th key={i} style={{ padding: '4px 4px', color: 'var(--prof-text-muted, #94a3b8)', fontWeight: 500, textAlign: 'center', minWidth: '34px', fontSize: '0.72rem' }}>+{i + 1}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {Array.from({ length: 10 }, (_, row) => (
                                            <tr key={row}>
                                                <td style={{ padding: '3px 8px', color: 'var(--prof-text-muted, #94a3b8)', fontWeight: 500, fontSize: '0.72rem', whiteSpace: 'nowrap' }}>
                                                    Q{row * 10}
                                                </td>
                                                {Array.from({ length: 10 }, (_, col) => {
                                                    const idx = row * 10 + col;
                                                    const letter = currentPending.editAnswers[idx] ?? '';
                                                    const answerKey = currentPending.computed?.answerKey;
                                                    const qId = answerKey?.questionIds[idx];
                                                    const correctNum = qId != null ? answerKey?.questions[qId]?.correct_choice : undefined;
                                                    const correctLetter = correctNum != null ? ANSWER_LETTERS[correctNum] : '';
                                                    const isCorrect = hasAnswerKey && letter !== '' && correctLetter !== '' && letter === correctLetter;
                                                    const isWrong = hasAnswerKey && letter !== '' && correctLetter !== '' && letter !== correctLetter;
                                                    const bg = isCorrect ? '#dcfce7' : isWrong ? '#fee2e2' : letter ? '#f1f5f9' : '#fff';
                                                    const borderColor = isCorrect ? '#86efac' : isWrong ? '#fca5a5' : 'var(--prof-border, #e2e8f0)';
                                                    const textColor = isCorrect ? '#15803d' : isWrong ? '#dc2626' : letter ? '#1e293b' : '#cbd5e1';
                                                    return (
                                                        <td key={col} style={{ padding: '2px 3px', textAlign: 'center' }}>
                                                            <button
                                                                onClick={() => toggleAnswer(idx)}
                                                                title={`Q${idx + 1}${correctLetter ? ` — Correct: ${correctLetter}` : ''}`}
                                                                style={{
                                                                    width: '30px', height: hasAnswerKey ? '34px' : '26px',
                                                                    border: `1px solid ${borderColor}`,
                                                                    borderRadius: '4px',
                                                                    background: bg,
                                                                    cursor: 'pointer',
                                                                    fontWeight: letter ? 700 : 400,
                                                                    fontSize: '0.75rem',
                                                                    color: textColor,
                                                                    display: 'flex', flexDirection: 'column',
                                                                    alignItems: 'center', justifyContent: 'center',
                                                                    padding: '1px',
                                                                }}
                                                            >
                                                                <span>{letter || '—'}</span>
                                                                {hasAnswerKey && correctLetter && (
                                                                    <span style={{ fontSize: '0.55rem', lineHeight: 1, color: isCorrect ? '#15803d' : '#dc2626' }}>
                                                                        {isCorrect ? '✓' : correctLetter}
                                                                    </span>
                                                                )}
                                                            </button>
                                                        </td>
                                                    );
                                                })}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                                </div>
                                );
                            })()}

                            {/* Multi-bubble warning */}
                            {(() => {
                                const mqs = getMultiBubbleQuestions(currentPending.omrResult);
                                if (mqs.size === 0) return null;
                                const qNums = Array.from(mqs).sort((a, b) => a - b).map(i => i + 1);
                                return (
                                    <div style={{ padding: '10px 14px', background: '#fefce8', border: '1px solid #fde047', borderRadius: '8px', color: '#854d0e', fontSize: '0.85rem', display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                                        <svg fill="none" strokeWidth="2" stroke="currentColor" viewBox="0 0 24 24" width="16" height="16" style={{ flexShrink: 0, marginTop: '1px' }}>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                                        </svg>
                                        <span>
                                            <strong>Multiple bubbles shaded</strong> in {qNums.length === 1 ? 'question' : 'questions'} {qNums.join(', ')}.
                                            {' '}{qNums.length === 1 ? 'This question has' : 'These questions have'} been marked blank in the answer grid.
                                        </span>
                                    </div>
                                );
                            })()}
                        </div>{/* end right column */}
                    </div>{/* end two-column grid */}

                    {/* Already graded warning */}
                    {currentPending.alreadyGraded && (
                        <div style={{ marginTop: '16px', padding: '10px 14px', background: '#fef3c7', border: '1px solid #fcd34d', borderRadius: '8px', color: '#92400e', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <svg fill="none" strokeWidth="2" stroke="currentColor" viewBox="0 0 24 24" width="16" height="16"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /></svg>
                            This student already has a saved grade for this attempt. Clicking Check will overwrite it.
                        </div>
                    )}

                    {/* ── Action buttons ── */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '16px', paddingTop: '16px', borderTop: '1px solid var(--prof-border, #e2e8f0)', flexWrap: 'wrap' }}>
                        {currentPending.source !== 'zip' && (
                            <button
                                onClick={handleRescan}
                                disabled={isSaving}
                                style={{ padding: '9px 18px', borderRadius: '8px', border: '1.5px solid var(--prof-border, #e2e8f0)', background: '#fff', cursor: isSaving ? 'not-allowed' : 'pointer', fontWeight: 600, fontSize: '0.88rem', color: 'var(--prof-text-main, #1e293b)', display: 'inline-flex', alignItems: 'center', gap: '6px', opacity: isSaving ? 0.5 : 1 }}
                            >
                                ← Rescan
                            </button>
                        )}
                        <button
                            onClick={() => handleDecision('verified')}
                            disabled={isSaving || !!currentPending.isComputing || !currentPending.computed?.student}
                            style={{ ...btnPrimary, background: '#16a34a', ...(isSaving || currentPending.isComputing || !currentPending.computed?.student ? { opacity: 0.5, cursor: 'not-allowed' } : {}) }}
                        >
                            {isSaving ? 'Saving…' : '✓ Check'}
                        </button>
                        {currentPending.isComputing && (
                            <span style={{ fontSize: '0.82rem', color: 'var(--prof-text-muted, #64748b)' }}>Computing grade…</span>
                        )}
                    </div>
                </div>
            )}

            {/* ── Scan input card (hidden while reviewing) ─────────────────── */}
            {!isReviewing && (
                <div className="cs-card">
                    {/* Mode tabs */}
                    <div style={{ display: 'flex', gap: '8px', marginBottom: '24px', flexWrap: 'wrap' }}>
                        <button style={modeTabStyle(mode === 'camera')} onClick={() => setMode('camera')}>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                                <svg fill="none" strokeWidth="2" stroke="currentColor" viewBox="0 0 24 24" width="15" height="15">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0zM18.75 10.5h.008v.008h-.008V10.5z" />
                                </svg>
                                Camera
                            </span>
                        </button>
                        <button style={modeTabStyle(mode === 'image')} onClick={() => setMode('image')}>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                                <svg fill="none" strokeWidth="2" stroke="currentColor" viewBox="0 0 24 24" width="15" height="15">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
                                </svg>
                                Upload Image
                            </span>
                        </button>
                        <button style={modeTabStyle(mode === 'zip')} onClick={() => setMode('zip')}>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                                <svg fill="none" strokeWidth="2" stroke="currentColor" viewBox="0 0 24 24" width="15" height="15">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
                                </svg>
                                Batch ZIP
                            </span>
                        </button>
                        <button style={modeTabStyle(mode === 'manual')} onClick={() => setMode('manual')}>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                                <svg fill="none" strokeWidth="2" stroke="currentColor" viewBox="0 0 24 24" width="15" height="15">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125" />
                                </svg>
                                Manual Input
                            </span>
                        </button>
                    </div>

                    {/* ── Camera mode ── */}
                    {mode === 'camera' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                            {/* Mobile recommendation notice */}
                            <div className="omr-best-on-mobile-notice" style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '10px 14px', background: '#eff6ff', border: '1px solid #93c5fd', borderRadius: '8px' }}>
                                <svg fill="none" strokeWidth="2" stroke="#2563eb" viewBox="0 0 24 24" width="16" height="16" style={{ flexShrink: 0, marginTop: '1px' }}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 1.5H8.25A2.25 2.25 0 006 3.75v16.5a2.25 2.25 0 002.25 2.25h7.5A2.25 2.25 0 0018 20.25V3.75a2.25 2.25 0 00-2.25-2.25H13.5m-3 0V3h3V1.5m-3 0h3m-3 8.25h3m-3 3h3m-3 3h3" />
                                </svg>
                                <span style={{ fontSize: '0.82rem', color: '#1e40af', lineHeight: 1.5 }}>
                                    <strong>Best on mobile.</strong> Camera mode is recommended for mobile devices where you can point directly at the sheet. On desktop, <strong>Upload Image</strong> or <strong>Batch ZIP</strong> gives better scanning accuracy.
                                </span>
                            </div>

                            {/* Camera toggle */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                                <button
                                    onClick={cameraActive ? stopCamera : startCamera}
                                    style={{
                                        padding: '8px 16px', borderRadius: '8px',
                                        border: `1.5px solid ${cameraActive ? '#dc2626' : 'var(--prof-primary, #2563eb)'}`,
                                        background: cameraActive ? '#fef2f2' : '#eff6ff',
                                        color: cameraActive ? '#dc2626' : '#2563eb',
                                        cursor: 'pointer', fontWeight: 600, fontSize: '0.88rem',
                                        display: 'inline-flex', alignItems: 'center', gap: '6px',
                                    }}
                                >
                                    {cameraActive ? (
                                        <>
                                            <svg fill="currentColor" viewBox="0 0 24 24" width="14" height="14"><path d="M6 6h12v12H6z" /></svg>
                                            Turn Off Camera
                                        </>
                                    ) : (
                                        <>
                                            <svg fill="none" strokeWidth="2" stroke="currentColor" viewBox="0 0 24 24" width="14" height="14">
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0zM18.75 10.5h.008v.008h-.008V10.5z" />
                                            </svg>
                                            Turn On Camera
                                        </>
                                    )}
                                </button>
                                {cameraActive && (
                                    <span style={{ fontSize: '0.8rem', color: '#16a34a', fontWeight: 500, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                        <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#16a34a', display: 'inline-block' }} />
                                        Live
                                    </span>
                                )}
                            </div>

                            {cameraError && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '14px', background: '#fef2f2', borderRadius: '8px', border: '1px solid #fca5a5', color: '#dc2626', fontSize: '0.88rem' }}>
                                    Camera unavailable: {cameraError}
                                </div>
                            )}

                            {cameraActive && !cameraError && (
                                <div style={{ position: 'relative', borderRadius: '10px', overflow: 'hidden', border: '1px solid var(--prof-border, #e2e8f0)', background: '#0f172a', aspectRatio: '3/4', maxWidth: '360px', margin: '0 auto', width: '100%' }}>
                                    <video ref={videoRef} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} muted playsInline />
                                    <div style={{ position: 'absolute', inset: 0, border: '3px solid rgba(255,255,255,0.15)', borderRadius: '10px', pointerEvents: 'none' }} />
                                </div>
                            )}

                            <canvas ref={canvasRef} style={{ display: 'none' }} />

                            {cameraActive && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
                                    <button
                                        onClick={handleCapture}
                                        disabled={isProcessing || !!cameraError}
                                        style={{ ...btnPrimary, ...(isProcessing || !!cameraError ? { opacity: 0.5, cursor: 'not-allowed' } : {}) }}
                                    >
                                        <svg fill="none" strokeWidth="2" stroke="currentColor" viewBox="0 0 24 24" width="16" height="16">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0zM18.75 10.5h.008v.008h-.008V10.5z" />
                                        </svg>
                                        {isProcessing ? 'Processing…' : 'Capture & Scan'}
                                    </button>
                                    <p style={{ fontSize: '0.8rem', color: 'var(--prof-text-muted, #64748b)', margin: 0 }}>
                                        Position the OMR sheet, then capture. The review panel will appear before any grade is saved.
                                    </p>
                                </div>
                            )}
                        </div>
                    )}

                    {/* ── Image upload mode ── */}
                    {mode === 'image' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                            <label style={dropZoneStyle}>
                                <svg fill="none" strokeWidth="1.5" stroke="currentColor" viewBox="0 0 24 24" width="36" height="36" style={{ opacity: 0.5 }}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                                </svg>
                                <span style={{ fontWeight: 500 }}>{imageFile ? imageFile.name : 'Click to choose an image'}</span>
                                <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>JPG, PNG, WEBP supported</span>
                                <input type="file" accept="image/*" onChange={handleImageSelect} style={{ display: 'none' }} />
                            </label>
                            {imagePreviewUrl && (
                                <div style={{ border: '1px solid var(--prof-border, #e2e8f0)', borderRadius: '10px', overflow: 'hidden', background: '#f8fafc', display: 'flex', justifyContent: 'center' }}>
                                    <img src={imagePreviewUrl} alt="Preview" style={{ maxHeight: '260px', objectFit: 'contain', display: 'block' }} />
                                </div>
                            )}
                            <button
                                onClick={handleScanImage}
                                disabled={!imageFile || isProcessing}
                                style={{ ...btnPrimary, ...(!imageFile || isProcessing ? { opacity: 0.5, cursor: 'not-allowed' } : {}), alignSelf: 'flex-start' }}
                            >
                                <svg fill="none" strokeWidth="2" stroke="currentColor" viewBox="0 0 24 24" width="16" height="16">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                                </svg>
                                {isProcessing ? 'Scanning…' : 'Scan Image'}
                            </button>
                        </div>
                    )}

                    {/* ── ZIP batch mode ── */}
                    {mode === 'zip' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                            <label style={dropZoneStyle}>
                                <svg fill="none" strokeWidth="1.5" stroke="currentColor" viewBox="0 0 24 24" width="36" height="36" style={{ opacity: 0.5 }}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
                                </svg>
                                <span style={{ fontWeight: 500 }}>{zipFile ? zipFile.name : 'Click to choose a ZIP file'}</span>
                                {zipFile
                                    ? <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>{(zipFile.size / 1024).toFixed(0)} KB</span>
                                    : <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>ZIP containing JPG/PNG OMR scans</span>
                                }
                                <input type="file" accept=".zip" onChange={e => setZipFile(e.target.files?.[0] ?? null)} style={{ display: 'none' }} />
                            </label>
                            {zipProgress && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '14px 16px', background: '#f8fafc', borderRadius: '8px', border: '1px solid var(--prof-border, #e2e8f0)' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', fontWeight: 500 }}>
                                        <span style={{ color: 'var(--prof-text-main, #1e293b)' }}>{zipProgress.phase}</span>
                                        {zipProgress.total > 0 && <span style={{ color: 'var(--prof-text-muted, #64748b)' }}>{zipProgress.done} / {zipProgress.total}</span>}
                                    </div>
                                    {zipProgress.total > 0 && (
                                        <div style={{ height: '6px', background: '#e2e8f0', borderRadius: '99px', overflow: 'hidden' }}>
                                            <div style={{ height: '100%', width: `${(zipProgress.done / zipProgress.total) * 100}%`, background: 'var(--prof-primary, #2563eb)', borderRadius: '99px', transition: 'width 0.2s' }} />
                                        </div>
                                    )}
                                </div>
                            )}
                            <button
                                onClick={handleProcessZip}
                                disabled={!zipFile || isProcessing}
                                style={{ ...btnPrimary, ...(!zipFile || isProcessing ? { opacity: 0.5, cursor: 'not-allowed' } : {}), alignSelf: 'flex-start' }}
                            >
                                <svg fill="none" strokeWidth="2" stroke="currentColor" viewBox="0 0 24 24" width="16" height="16">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                                </svg>
                                {isProcessing ? 'Processing…' : 'Process All Sheets'}
                            </button>
                        </div>
                    )}

                    {/* ── Manual input mode ── */}
                    {mode === 'manual' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            {/* Student search */}
                            <div>
                                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--prof-text-muted, #64748b)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '6px' }}>
                                    Search Student
                                </label>
                                <input
                                    type="text"
                                    placeholder="Search by name or student ID..."
                                    value={manualStudentSearch}
                                    onChange={e => { setManualStudentSearch(e.target.value); setManualStudentId(''); }}
                                    style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--prof-border, #e2e8f0)', borderRadius: '6px', fontSize: '0.9rem', boxSizing: 'border-box' }}
                                />
                                {manualStudentSearch.trim() && !manualStudentId && (() => {
                                    const q = manualStudentSearch.toLowerCase();
                                    const matches = enrollments.filter(e =>
                                        e.student?.full_name?.toLowerCase().includes(q) ||
                                        e.student?.student_id?.toLowerCase().includes(q)
                                    ).slice(0, 8);
                                    if (matches.length === 0) return (
                                        <div style={{ padding: '8px 10px', fontSize: '0.85rem', color: 'var(--prof-text-muted, #64748b)', border: '1px solid var(--prof-border, #e2e8f0)', borderTop: 'none', borderRadius: '0 0 6px 6px' }}>No students found</div>
                                    );
                                    return (
                                        <div style={{ border: '1px solid var(--prof-border, #e2e8f0)', borderTop: 'none', borderRadius: '0 0 6px 6px', background: '#fff', maxHeight: '200px', overflowY: 'auto' }}>
                                            {matches.map(e => (
                                                <button
                                                    key={e.student_id}
                                                    onClick={() => { setManualStudentId(e.student_id); setManualStudentSearch(e.student?.full_name ?? e.student_id); }}
                                                    style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 10px', background: 'none', border: 'none', borderBottom: '1px solid var(--prof-border, #e2e8f0)', cursor: 'pointer', fontSize: '0.85rem' }}
                                                >
                                                    <span style={{ fontWeight: 600 }}>{e.student?.full_name ?? '—'}</span>
                                                    <span style={{ marginLeft: '8px', fontSize: '0.78rem', color: 'var(--prof-text-muted, #64748b)', fontFamily: 'monospace' }}>{e.student?.student_id}</span>
                                                </button>
                                            ))}
                                        </div>
                                    );
                                })()}
                                {manualStudentId && (
                                    <div style={{ marginTop: '4px', fontSize: '0.8rem', color: '#16a34a', fontWeight: 500 }}>
                                        ✓ Student selected
                                    </div>
                                )}
                            </div>

                            {/* Set selector + Load button */}
                            <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-end' }}>
                                <div style={{ flex: 1 }}>
                                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--prof-text-muted, #64748b)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '6px' }}>
                                        Exam Set
                                    </label>
                                    <select
                                        value={manualSetNumber}
                                        onChange={e => { setManualSetNumber(Number(e.target.value)); setManualAnswerKey(null); setManualAnswers([]); setManualKeyError(null); }}
                                        style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--prof-border, #e2e8f0)', borderRadius: '6px', fontSize: '0.9rem' }}
                                    >
                                        {Array.from({ length: numSets }, (_, i) => (
                                            <option key={i + 1} value={i + 1}>Set {ANSWER_LETTERS[i] ?? String(i + 1)}</option>
                                        ))}
                                    </select>
                                </div>
                                <button
                                    onClick={handleLoadManualKey}
                                    disabled={isLoadingManualKey}
                                    style={{ ...btnPrimary, ...(isLoadingManualKey ? { opacity: 0.5, cursor: 'not-allowed' } : {}), whiteSpace: 'nowrap' }}
                                >
                                    {isLoadingManualKey ? 'Loading…' : 'Load Answer Sheet'}
                                </button>
                            </div>

                            {manualKeyError && (
                                <div style={{ padding: '10px 14px', background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: '8px', color: '#dc2626', fontSize: '0.85rem' }}>
                                    {manualKeyError}
                                </div>
                            )}

                            {/* Answer grid + submit */}
                            {manualAnswerKey && (
                                <>
                                    {/* Duplicate warning */}
                                    {manualStudentId && existingGrades?.find(g => g.enrollment.student_id === manualStudentId && g.submission != null) && (
                                        <div style={{ padding: '10px 14px', background: '#fef3c7', border: '1px solid #fcd34d', borderRadius: '8px', color: '#92400e', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <svg fill="none" strokeWidth="2" stroke="currentColor" viewBox="0 0 24 24" width="16" height="16"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /></svg>
                                            This student already has a saved grade. Submitting will overwrite it.
                                        </div>
                                    )}

                                    <div style={{ padding: '14px 16px', background: '#f8fafc', borderRadius: '8px', border: '1px solid var(--prof-border, #e2e8f0)', overflow: 'hidden' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px', flexWrap: 'wrap', gap: '8px' }}>
                                            <span style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--prof-text-muted, #64748b)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                                Answer Grid — click to cycle (A→B→C→D→E→blank)
                                            </span>
                                            <span style={{ fontSize: '0.85rem', fontWeight: 700 }}>
                                                Score: {manualAnswers.filter((a, i) => {
                                                    const qId = manualAnswerKey.questionIds[i];
                                                    const correct = qId != null ? ANSWER_LETTERS[manualAnswerKey.questions[qId]?.correct_choice ?? -1] : '';
                                                    return a !== '' && a === correct;
                                                }).length} / {manualAnswerKey.questionIds.length}
                                            </span>
                                        </div>
                                        <div style={{ overflowX: 'auto' }}>
                                            <table style={{ borderCollapse: 'collapse', fontSize: '0.78rem' }}>
                                                <thead>
                                                    <tr>
                                                        <th style={{ padding: '4px 8px', color: 'var(--prof-text-muted, #94a3b8)', fontWeight: 500, fontSize: '0.72rem' }}>Base</th>
                                                        {Array.from({ length: 10 }, (_, i) => (
                                                            <th key={i} style={{ padding: '4px 4px', color: 'var(--prof-text-muted, #94a3b8)', fontWeight: 500, textAlign: 'center', minWidth: '34px', fontSize: '0.72rem' }}>+{i + 1}</th>
                                                        ))}
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {Array.from({ length: Math.ceil(manualAnswerKey.questionIds.length / 10) }, (_, row) => (
                                                        <tr key={row}>
                                                            <td style={{ padding: '3px 8px', color: 'var(--prof-text-muted, #94a3b8)', fontWeight: 500, fontSize: '0.72rem', whiteSpace: 'nowrap' }}>
                                                                Q{row * 10}
                                                            </td>
                                                            {Array.from({ length: 10 }, (_, col) => {
                                                                const idx = row * 10 + col;
                                                                if (idx >= manualAnswerKey.questionIds.length) return <td key={col} />;
                                                                const letter = manualAnswers[idx] ?? '';
                                                                const qId = manualAnswerKey.questionIds[idx];
                                                                const correctNum = qId != null ? manualAnswerKey.questions[qId]?.correct_choice : undefined;
                                                                const correctLetter = correctNum != null ? ANSWER_LETTERS[correctNum] : '';
                                                                const isCorrect = letter !== '' && correctLetter !== '' && letter === correctLetter;
                                                                const isWrong = letter !== '' && correctLetter !== '' && letter !== correctLetter;
                                                                const bg = isCorrect ? '#dcfce7' : isWrong ? '#fee2e2' : letter ? '#f1f5f9' : '#fff';
                                                                const borderColor = isCorrect ? '#86efac' : isWrong ? '#fca5a5' : 'var(--prof-border, #e2e8f0)';
                                                                const textColor = isCorrect ? '#15803d' : isWrong ? '#dc2626' : letter ? '#1e293b' : '#cbd5e1';
                                                                return (
                                                                    <td key={col} style={{ padding: '2px 3px', textAlign: 'center' }}>
                                                                        <button
                                                                            onClick={() => {
                                                                                const pos = ANSWER_LETTERS.indexOf(letter);
                                                                                const next = pos >= ANSWER_LETTERS.length - 1 ? '' : (ANSWER_LETTERS[pos + 1] ?? ANSWER_LETTERS[0]);
                                                                                const newAnswers = [...manualAnswers];
                                                                                newAnswers[idx] = next;
                                                                                setManualAnswers(newAnswers);
                                                                            }}
                                                                            title={`Q${idx + 1}${correctLetter ? ` — Correct: ${correctLetter}` : ''}`}
                                                                            style={{
                                                                                width: '30px', height: '34px',
                                                                                border: `1px solid ${borderColor}`,
                                                                                borderRadius: '4px',
                                                                                background: bg,
                                                                                cursor: 'pointer',
                                                                                fontWeight: letter ? 700 : 400,
                                                                                fontSize: '0.75rem',
                                                                                color: textColor,
                                                                                display: 'flex', flexDirection: 'column',
                                                                                alignItems: 'center', justifyContent: 'center',
                                                                                padding: '1px',
                                                                            }}
                                                                        >
                                                                            <span>{letter || '—'}</span>
                                                                            {correctLetter && (
                                                                                <span style={{ fontSize: '0.55rem', lineHeight: 1, color: isCorrect ? '#15803d' : '#dc2626' }}>
                                                                                    {isCorrect ? '✓' : correctLetter}
                                                                                </span>
                                                                            )}
                                                                        </button>
                                                                    </td>
                                                                );
                                                            })}
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>

                                    {manualSaveError && (
                                        <div style={{ padding: '10px 14px', background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: '8px', color: '#dc2626', fontSize: '0.85rem' }}>
                                            {manualSaveError}
                                        </div>
                                    )}

                                    <button
                                        onClick={handleManualSubmit}
                                        disabled={!manualStudentId || isSavingManual}
                                        style={{ ...btnPrimary, ...(!manualStudentId || isSavingManual ? { opacity: 0.5, cursor: 'not-allowed' } : {}), alignSelf: 'flex-start' }}
                                    >
                                        {isSavingManual ? 'Saving…' : 'Submit Grade'}
                                    </button>
                                </>
                            )}
                        </div>
                    )}
                </div>
            )}

            {/* ── Results table ─────────────────────────────────────────────── */}
            {results.length > 0 && (
                <div className="cs-card">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                        <div>
                            <h3 className="cs-card-title" style={{ margin: 0 }}>Scan Results</h3>
                            <p style={{ margin: '2px 0 0', fontSize: '0.82rem', color: 'var(--prof-text-muted, #64748b)' }}>
                                {results.length} sheet{results.length !== 1 ? 's' : ''} processed
                            </p>
                        </div>
                        <button
                            onClick={() => setResults([])}
                            style={{ background: 'none', border: '1px solid var(--prof-border, #e2e8f0)', borderRadius: '6px', color: 'var(--prof-text-muted, #64748b)', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 500, padding: '5px 12px' }}
                        >
                            Clear
                        </button>
                    </div>
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                            <thead>
                                <tr>
                                    {(['Student', 'Roll No.', 'Set', 'Score'] as const).map(h => (
                                        <th key={h} style={{ textAlign: h === 'Student' ? 'left' : 'center', padding: '8px 10px', fontWeight: 600, fontSize: '0.78rem', color: 'var(--prof-text-muted, #64748b)', borderBottom: '1px solid var(--prof-border, #e2e8f0)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {results.map((row, i) => (
                                    <tr key={i} style={{ borderBottom: '1px solid var(--prof-border, #e2e8f0)' }}>
                                        <td style={{ padding: '9px 10px', fontWeight: 500 }}>
                                            {row.student?.student?.full_name ?? '—'}
                                        </td>
                                        <td style={{ padding: '9px 10px', textAlign: 'center', fontFamily: 'monospace', fontSize: '0.82rem', color: 'var(--prof-text-muted, #64748b)' }}>
                                            {row.omrResult.roll_number || '—'}
                                        </td>
                                        <td style={{ padding: '9px 10px', textAlign: 'center' }}>
                                            {row.examSet ? <strong>{row.examSet}</strong> : <span style={{ color: '#94a3b8' }}>—</span>}
                                        </td>
                                        <td style={{ padding: '9px 10px', textAlign: 'center', fontWeight: 600 }}>
                                            {row.score != null ? `${row.score} / ${row.totalItems}` : <span style={{ color: '#94a3b8' }}>—</span>}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
}
