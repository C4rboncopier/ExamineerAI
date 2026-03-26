import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { fetchExamById } from '../../lib/exams';
import type { ExamWithSets } from '../../lib/exams';
import { fetchAvailableStudentsPage } from '../../lib/students';
import type { Student } from '../../lib/students';
import { fetchEnrolledStudentIds, fetchExamEnrollmentsPage, enrollStudent, unenrollStudent } from '../../lib/examEnrollments';
import type { EnrolledStudent } from '../../lib/examEnrollments';
import { fetchPrograms } from '../../lib/professors';
import { Popup } from '../common/Popup';
import { Toast } from '../common/Toast';

interface ToastState { open: boolean; message: string; type: 'success' | 'error' | 'info'; }

const ITEMS_PER_PAGE = 10;

export function ExamStudents({ examId: examIdProp }: { examId?: string } = {}) {
    const { examId: examIdParam } = useParams<{ examId: string }>();
    const examId = examIdProp ?? examIdParam;
    const navigate = useNavigate();

    const [exam, setExam] = useState<ExamWithSets | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [programMap, setProgramMap] = useState<Record<string, { code: string; name: string }>>({});

    // All enrolled IDs — maintained locally for count badge and exclusion
    const [enrolledIds, setEnrolledIds] = useState<string[]>([]);

    // Enrolled section
    const [enrolledData, setEnrolledData] = useState<EnrolledStudent[]>([]);
    const [enrolledTotal, setEnrolledTotal] = useState(0);
    const [enrolledPage, setEnrolledPage] = useState(1);
    const [enrollSearch, setEnrollSearch] = useState('');
    const [submittedEnrollSearch, setSubmittedEnrollSearch] = useState('');
    const [isLoadingEnrolled, setIsLoadingEnrolled] = useState(false);

    // Add students section
    const [addData, setAddData] = useState<Student[]>([]);
    const [addTotal, setAddTotal] = useState(0);
    const [addPage, setAddPage] = useState(1);
    const [addSearch, setAddSearch] = useState('');
    const [submittedSearch, setSubmittedSearch] = useState<string | null>(null);
    const [isLoadingAdd, setIsLoadingAdd] = useState(false);

    const [unenrollTarget, setUnenrollTarget] = useState<EnrolledStudent | null>(null);
    const [isUnenrolling, setIsUnenrolling] = useState(false);
    const [enrollingId, setEnrollingId] = useState<string | null>(null);

    const [toast, setToast] = useState<ToastState>({ open: false, message: '', type: 'success' });
    const showToast = useCallback((message: string, type: 'success' | 'error' | 'info' = 'success') =>
        setToast({ open: true, message, type }), []);
    const closeToast = useCallback(() => setToast(prev => ({ ...prev, open: false })), []);

    const allowedProgramIds = useMemo(() => new Set(exam?.program_ids ?? []), [exam]);
    const totalEnrolledPages = Math.max(1, Math.ceil(enrolledTotal / ITEMS_PER_PAGE));
    const totalAddPages = Math.max(1, Math.ceil(addTotal / ITEMS_PER_PAGE));

    // Initial load
    useEffect(() => {
        if (!examId) return;
        Promise.all([
            fetchExamById(examId),
            fetchEnrolledStudentIds(examId),
            fetchPrograms(),
        ]).then(([examRes, ids, programs]) => {
            if (examRes.data) setExam(examRes.data);
            setEnrolledIds(ids);
            const map: Record<string, { code: string; name: string }> = {};
            for (const p of programs) map[p.id] = p;
            setProgramMap(map);
            setIsLoading(false);
        });
    }, [examId]);

    const loadEnrolledPage = useCallback(async (page: number, search: string) => {
        if (!examId) return;
        setIsLoadingEnrolled(true);
        const result = await fetchExamEnrollmentsPage({
            examId,
            search: search || undefined,
            page,
            pageSize: ITEMS_PER_PAGE,
        });
        setEnrolledData(result.data);
        setEnrolledTotal(result.total);
        setIsLoadingEnrolled(false);
    }, [examId]);

    // Load first enrolled page once initial data is ready
    useEffect(() => {
        if (!isLoading && examId) loadEnrolledPage(1, '');
    }, [isLoading]); // eslint-disable-line react-hooks/exhaustive-deps

    async function loadAddPage(page: number, search: string, currentExcludeIds: string[], currentAllowedProgramIds: Set<string>) {
        if (!examId) return;
        setIsLoadingAdd(true);
        const result = await fetchAvailableStudentsPage({
            search: search || undefined,
            allowedProgramIds: currentAllowedProgramIds.size > 0 ? [...currentAllowedProgramIds] : undefined,
            excludeIds: currentExcludeIds.length > 0 ? currentExcludeIds : undefined,
            page,
            pageSize: ITEMS_PER_PAGE,
        });
        setAddData(result.data);
        setAddTotal(result.total);
        setIsLoadingAdd(false);
    }

    function handleEnrollSearch() {
        const search = enrollSearch.trim();
        setSubmittedEnrollSearch(search);
        setEnrolledPage(1);
        loadEnrolledPage(1, search);
    }

    function handleAddSearch() {
        const search = addSearch.trim();
        setSubmittedSearch(search);
        setAddPage(1);
        loadAddPage(1, search, enrolledIds, allowedProgramIds);
    }

    async function handleEnroll(student: Student) {
        if (!examId) return;
        setEnrollingId(student.id);
        const { error } = await enrollStudent(examId, student.id);
        setEnrollingId(null);
        if (error) { showToast(`Failed to enroll: ${error}`, 'error'); return; }

        const newIds = [...enrolledIds, student.id];
        setEnrolledIds(newIds);

        // Refresh enrolled section from page 1 (new enrollment is at top)
        setEnrolledPage(1);
        loadEnrolledPage(1, submittedEnrollSearch);

        // Refresh add section so the enrolled student disappears
        if (submittedSearch !== null) {
            loadAddPage(addPage, submittedSearch, newIds, allowedProgramIds);
        }

        showToast(`${student.full_name ?? 'Student'} enrolled successfully.`);
    }

    async function handleUnenroll() {
        if (!unenrollTarget) return;
        setIsUnenrolling(true);
        const { error } = await unenrollStudent(unenrollTarget.id);
        setIsUnenrolling(false);
        if (error) { showToast(`Failed to remove: ${error}`, 'error'); setUnenrollTarget(null); return; }

        const newIds = enrolledIds.filter(id => id !== unenrollTarget.student_id);
        setEnrolledIds(newIds);

        // If the removed item was the only one on this page, go back one page
        const newPage = enrolledData.length === 1 && enrolledPage > 1 ? enrolledPage - 1 : enrolledPage;
        setEnrolledPage(newPage);
        loadEnrolledPage(newPage, submittedEnrollSearch);

        // Refresh add section so the unenrolled student can reappear
        if (submittedSearch !== null) {
            loadAddPage(addPage, submittedSearch, newIds, allowedProgramIds);
        }

        showToast(`${unenrollTarget.student?.full_name ?? 'Student'} removed from exam.`);
        setUnenrollTarget(null);
    }

    const inputStyle: React.CSSProperties = {
        width: '100%', padding: '9px 12px 9px 38px', borderRadius: '8px',
        border: '1.5px solid var(--prof-border)', fontSize: '0.875rem',
        color: 'var(--prof-text-main)', outline: 'none', boxSizing: 'border-box',
        background: '#fff',
    };

    if (isLoading) {
        return (
            <div className="subjects-container">
                <p className="settings-loading-row">Loading...</p>
            </div>
        );
    }

    if (!exam) {
        return (
            <div className="subjects-container">
                <p className="cs-error">Exam not found.</p>
                <button className="btn-secondary" onClick={() => navigate('/professor/exams')} style={{ marginTop: '12px' }}>
                    Back to Exams
                </button>
            </div>
        );
    }

    return (
        <div className="subjects-container">
            <div className="es-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '24px', alignItems: 'start' }}>
                {/* ── Enrolled Students ── */}
                <div className="cs-card" style={{ padding: '20px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                        <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: 'var(--prof-text-main)' }}>
                            Enrolled
                            <span style={{ marginLeft: '8px', padding: '2px 8px', borderRadius: '12px', fontSize: '12px', fontWeight: 600, background: '#eff6ff', color: '#2563eb', border: '1px solid #93c5fd' }}>
                                {enrolledIds.length}
                            </span>
                        </h3>
                    </div>

                    {/* Search enrolled */}
                    <div style={{ display: 'flex', gap: '8px', marginBottom: '14px' }}>
                        <div style={{ position: 'relative', flex: 1 }}>
                            <svg fill="none" strokeWidth="2" stroke="currentColor" viewBox="0 0 24 24" width="16" height="16"
                                style={{ position: 'absolute', left: '11px', top: '50%', transform: 'translateY(-50%)', color: 'var(--prof-text-muted)', pointerEvents: 'none' }}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                            </svg>
                            <input
                                type="text"
                                placeholder="Search enrolled students..."
                                value={enrollSearch}
                                onChange={e => setEnrollSearch(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter') handleEnrollSearch(); }}
                                style={inputStyle}
                            />
                            {enrollSearch && (
                                <button
                                    onClick={() => {
                                        setEnrollSearch('');
                                        setSubmittedEnrollSearch('');
                                        setEnrolledPage(1);
                                        loadEnrolledPage(1, '');
                                    }}
                                    style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--prof-text-muted)', display: 'flex', padding: 0 }}
                                >
                                    <svg fill="none" strokeWidth="2.5" stroke="currentColor" viewBox="0 0 24 24" width="14" height="14">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                </button>
                            )}
                        </div>
                        <button className="btn-primary" onClick={handleEnrollSearch} style={{ padding: '0 14px', fontSize: '0.85rem', borderRadius: '8px', flexShrink: 0 }}>
                            Search
                        </button>
                    </div>

                    {isLoadingEnrolled ? (
                        <p style={{ textAlign: 'center', padding: '32px', color: 'var(--prof-text-muted)', fontSize: '0.875rem' }}>Loading...</p>
                    ) : enrolledIds.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '32px 16px', color: 'var(--prof-text-muted)', fontSize: '0.875rem' }}>
                            <svg fill="none" strokeWidth="1.5" stroke="currentColor" viewBox="0 0 24 24" width="36" height="36" style={{ margin: '0 auto 10px', display: 'block', opacity: 0.4 }}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
                            </svg>
                            No students enrolled yet.
                        </div>
                    ) : enrolledData.length === 0 ? (
                        <p style={{ textAlign: 'center', padding: '20px', color: 'var(--prof-text-muted)', fontSize: '0.875rem' }}>
                            No students match your search.
                        </p>
                    ) : (
                        <>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                {enrolledData.map(enrollment => (
                                    <div
                                        key={enrollment.id}
                                        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--prof-border)', background: 'var(--prof-surface)' }}
                                    >
                                        <div style={{ minWidth: 0 }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                                                <span style={{ fontWeight: 600, fontSize: '0.875rem', color: 'var(--prof-text-main)' }}>
                                                    {enrollment.student?.full_name ?? '—'}
                                                </span>
                                                {enrollment.student?.program && (
                                                    <span style={{ padding: '1px 6px', borderRadius: '10px', fontSize: '11px', fontWeight: 600, background: '#f0fdf4', color: '#15803d', border: '1px solid #bbf7d0', whiteSpace: 'nowrap' }}>
                                                        {enrollment.student.program.code}
                                                    </span>
                                                )}
                                            </div>
                                            <span style={{ fontSize: '0.775rem', color: 'var(--prof-text-muted)' }}>
                                                @{enrollment.student?.username ?? '—'}
                                            </span>
                                        </div>
                                        <button
                                            className="btn-icon danger"
                                            title="Remove from exam"
                                            onClick={() => setUnenrollTarget(enrollment)}
                                            style={{ flexShrink: 0 }}
                                        >
                                            <svg fill="none" strokeWidth="2" stroke="currentColor" viewBox="0 0 24 24" width="15" height="15">
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M22 10.5h-6m-2.25-4.125a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zM4 19.235v-.11a6.375 6.375 0 0112.75 0v.109A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766z" />
                                            </svg>
                                        </button>
                                    </div>
                                ))}
                            </div>
                            {totalEnrolledPages > 1 && (
                                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '15px', marginTop: '16px', paddingTop: '16px', borderTop: '1px solid var(--prof-border)' }}>
                                    <button
                                        onClick={() => { const p = Math.max(1, enrolledPage - 1); setEnrolledPage(p); loadEnrolledPage(p, submittedEnrollSearch); }}
                                        disabled={enrolledPage === 1}
                                        className="btn-secondary"
                                        type="button"
                                        style={{ padding: '6px 12px', fontSize: '0.8rem' }}
                                    >
                                        Previous
                                    </button>
                                    <span style={{ fontSize: '0.85rem', color: 'var(--prof-text-muted)' }}>
                                        Page {enrolledPage} of {totalEnrolledPages}
                                    </span>
                                    <button
                                        onClick={() => { const p = Math.min(totalEnrolledPages, enrolledPage + 1); setEnrolledPage(p); loadEnrolledPage(p, submittedEnrollSearch); }}
                                        disabled={enrolledPage === totalEnrolledPages}
                                        className="btn-secondary"
                                        type="button"
                                        style={{ padding: '6px 12px', fontSize: '0.8rem' }}
                                    >
                                        Next
                                    </button>
                                </div>
                            )}
                        </>
                    )}
                </div>

                {/* ── Add Students ── */}
                <div className="cs-card" style={{ padding: '20px' }}>
                    <div style={{ marginBottom: '16px' }}>
                        <h3 style={{ margin: '0 0 4px', fontSize: '1rem', fontWeight: 700, color: 'var(--prof-text-main)' }}>
                            Add Students
                        </h3>
                        {allowedProgramIds.size > 0 && (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '8px', alignItems: 'center' }}>
                                <span style={{ fontSize: '0.775rem', color: 'var(--prof-text-muted)' }}>Restricted to:</span>
                                {[...allowedProgramIds].map(pid => (
                                    <span key={pid} style={{ padding: '2px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: 600, background: '#eff6ff', color: '#2563eb', border: '1px solid #93c5fd', whiteSpace: 'nowrap' }}>
                                        {programMap[pid]?.code ?? pid.slice(0, 8)}
                                    </span>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Search available */}
                    <div style={{ display: 'flex', gap: '8px', marginBottom: '14px' }}>
                        <div style={{ position: 'relative', flex: 1 }}>
                            <svg fill="none" strokeWidth="2" stroke="currentColor" viewBox="0 0 24 24" width="16" height="16"
                                style={{ position: 'absolute', left: '11px', top: '50%', transform: 'translateY(-50%)', color: 'var(--prof-text-muted)', pointerEvents: 'none' }}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                            </svg>
                            <input
                                type="text"
                                placeholder={allowedProgramIds.size > 0 ? 'Search by name, username...' : 'Search by name, username, program...'}
                                value={addSearch}
                                onChange={e => setAddSearch(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter') handleAddSearch(); }}
                                style={inputStyle}
                            />
                            {addSearch && (
                                <button
                                    onClick={() => { setAddSearch(''); setSubmittedSearch(null); setAddPage(1); setAddData([]); setAddTotal(0); }}
                                    style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--prof-text-muted)', display: 'flex', padding: 0 }}
                                >
                                    <svg fill="none" strokeWidth="2.5" stroke="currentColor" viewBox="0 0 24 24" width="14" height="14">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                </button>
                            )}
                        </div>
                        <button className="btn-primary" onClick={handleAddSearch} style={{ padding: '0 14px', fontSize: '0.85rem', borderRadius: '8px', flexShrink: 0 }}>
                            Search
                        </button>
                    </div>

                    {submittedSearch === null ? (
                        <div style={{ textAlign: 'center', padding: '32px 16px', color: 'var(--prof-text-muted)', fontSize: '0.875rem' }}>
                            <svg fill="none" strokeWidth="1.5" stroke="currentColor" viewBox="0 0 24 24" width="36" height="36" style={{ margin: '0 auto 10px', display: 'block', opacity: 0.4 }}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                            </svg>
                            Search to find students to enroll.
                        </div>
                    ) : isLoadingAdd ? (
                        <p style={{ textAlign: 'center', padding: '32px', color: 'var(--prof-text-muted)', fontSize: '0.875rem' }}>Loading...</p>
                    ) : addData.length === 0 ? (
                        <p style={{ textAlign: 'center', padding: '20px', color: 'var(--prof-text-muted)', fontSize: '0.875rem' }}>
                            {submittedSearch ? 'No students match your search.' : 'All students are already enrolled.'}
                        </p>
                    ) : (
                        <>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                {addData.map(student => (
                                    <div
                                        key={student.id}
                                        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--prof-border)', background: 'var(--prof-surface)' }}
                                    >
                                        <div style={{ minWidth: 0 }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                                                <span style={{ fontWeight: 600, fontSize: '0.875rem', color: 'var(--prof-text-main)' }}>
                                                    {student.full_name ?? '—'}
                                                </span>
                                                {student.program && (
                                                    <span style={{ padding: '1px 6px', borderRadius: '10px', fontSize: '11px', fontWeight: 600, background: '#f0fdf4', color: '#15803d', border: '1px solid #bbf7d0', whiteSpace: 'nowrap' }}>
                                                        {student.program.code}
                                                    </span>
                                                )}
                                            </div>
                                            <span style={{ fontSize: '0.775rem', color: 'var(--prof-text-muted)' }}>
                                                @{student.username ?? '—'}
                                            </span>
                                        </div>
                                        <button
                                            className="btn-primary"
                                            style={{ padding: '5px 12px', fontSize: '0.8rem', fontWeight: 600, borderRadius: '7px', display: 'flex', alignItems: 'center', gap: '5px', flexShrink: 0, minWidth: '72px', justifyContent: 'center' }}
                                            disabled={enrollingId === student.id}
                                            onClick={() => handleEnroll(student)}
                                        >
                                            {enrollingId === student.id ? (
                                                'Adding...'
                                            ) : (
                                                <>
                                                    <svg fill="none" strokeWidth="2.5" stroke="currentColor" viewBox="0 0 24 24" width="13" height="13">
                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                                                    </svg>
                                                    Enroll
                                                </>
                                            )}
                                        </button>
                                    </div>
                                ))}
                            </div>
                            {totalAddPages > 1 && (
                                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '15px', marginTop: '16px', paddingTop: '16px', borderTop: '1px solid var(--prof-border)' }}>
                                    <button
                                        onClick={() => { const p = Math.max(1, addPage - 1); setAddPage(p); loadAddPage(p, submittedSearch ?? '', enrolledIds, allowedProgramIds); }}
                                        disabled={addPage === 1}
                                        className="btn-secondary"
                                        type="button"
                                        style={{ padding: '6px 12px', fontSize: '0.8rem' }}
                                    >
                                        Previous
                                    </button>
                                    <span style={{ fontSize: '0.85rem', color: 'var(--prof-text-muted)' }}>
                                        Page {addPage} of {totalAddPages}
                                    </span>
                                    <button
                                        onClick={() => { const p = Math.min(totalAddPages, addPage + 1); setAddPage(p); loadAddPage(p, submittedSearch ?? '', enrolledIds, allowedProgramIds); }}
                                        disabled={addPage === totalAddPages}
                                        className="btn-secondary"
                                        type="button"
                                        style={{ padding: '6px 12px', fontSize: '0.8rem' }}
                                    >
                                        Next
                                    </button>
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>

            <Popup
                isOpen={!!unenrollTarget}
                title="Remove Student"
                message={`Remove "${unenrollTarget?.student?.full_name}" from this exam? They will lose access to it.`}
                type="danger"
                onConfirm={handleUnenroll}
                onCancel={() => setUnenrollTarget(null)}
                confirmText={isUnenrolling ? 'Removing...' : 'Remove'}
                cancelText="Cancel"
            />

            <Toast isOpen={toast.open} message={toast.message} type={toast.type} onClose={closeToast} />
        </div>
    );
}
