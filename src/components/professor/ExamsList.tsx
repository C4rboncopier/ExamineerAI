import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchExams, deleteExam, deployExam, markExamDone } from '../../lib/exams';
import type { Exam } from '../../lib/exams';
import { Popup } from '../common/Popup';
import { Toast } from '../common/Toast';
import { DeployExamModal } from '../common/DeployExamModal';
import { MarkDoneExamModal } from '../common/MarkDoneExamModal';

interface ToastState {
    open: boolean;
    message: string;
    type: 'success' | 'error' | 'info';
}



export function ExamsList() {
    const navigate = useNavigate();
    const [exams, setExams] = useState<Exam[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState<'all' | 'draft' | 'deployed' | 'done'>('all');
    const [termFilter, setTermFilter] = useState<'all' | string>('all');

    const [deletePopupOpen, setDeletePopupOpen] = useState(false);
    const [examToDelete, setExamToDelete] = useState<Exam | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);

    const [deployPopupOpen, setDeployPopupOpen] = useState(false);
    const [examToDeploy, setExamToDeploy] = useState<Exam | null>(null);
    const [isDeploying, setIsDeploying] = useState(false);

    const [donePopupOpen, setDonePopupOpen] = useState(false);
    const [examToMarkDone, setExamToMarkDone] = useState<Exam | null>(null);
    const [isMarkingDone, setIsMarkingDone] = useState(false);

    const [toast, setToast] = useState<ToastState>({ open: false, message: '', type: 'success' });
    const showToast = (message: string, type: 'success' | 'error' | 'info' = 'success') =>
        setToast({ open: true, message, type });
    const closeToast = useCallback(() => setToast(prev => ({ ...prev, open: false })), []);

    useEffect(() => {
        fetchExams().then(({ data, error }) => {
            if (error) showToast('Failed to load exams.', 'error');
            else setExams(data);
            setIsLoading(false);
        });
    }, []);

    const confirmDelete = (exam: Exam) => {
        setExamToDelete(exam);
        setDeletePopupOpen(true);
    };

    const handleDelete = async () => {
        if (!examToDelete) return;
        setIsDeleting(true);
        const { error } = await deleteExam(examToDelete.id);
        if (error) {
            showToast(error, 'error');
        } else {
            setExams(prev => prev.filter(e => e.id !== examToDelete.id));
            showToast(`Exam "${examToDelete.title}" deleted.`);
        }
        setDeletePopupOpen(false);
        setExamToDelete(null);
        setIsDeleting(false);
    };

    const confirmMarkDone = (exam: Exam) => {
        setExamToMarkDone(exam);
        setDonePopupOpen(true);
    };

    const handleMarkDone = async () => {
        if (!examToMarkDone) return;
        setIsMarkingDone(true);
        const { error } = await markExamDone(examToMarkDone.id);
        if (error) {
            showToast(`Failed to mark as done: ${error}`, 'error');
        } else {
            setExams(prev => prev.map(e => e.id === examToMarkDone.id ? { ...e, status: 'done' as const } : e));
            showToast(`Exam "${examToMarkDone.title}" marked as done.`);
        }
        setDonePopupOpen(false);
        setExamToMarkDone(null);
        setIsMarkingDone(false);
    };

    const confirmDeploy = (exam: Exam) => {
        setExamToDeploy(exam);
        setDeployPopupOpen(true);
    };

    const handleDeploy = async () => {
        if (!examToDeploy) return;
        setIsDeploying(true);
        const { error } = await deployExam(examToDeploy.id);
        if (error) {
            showToast(`Failed to deploy: ${error}`, 'error');
        } else {
            setExams(prev => prev.map(e => e.id === examToDeploy.id ? { ...e, status: 'deployed' as const } : e));
            showToast(`Exam "${examToDeploy.title}" successfully deployed!`);
        }
        setDeployPopupOpen(false);
        setExamToDeploy(null);
        setIsDeploying(false);
    };

    const availableTerms = useMemo(() => {
        const terms = new Set<string>();
        exams.forEach(e => {
            const ay = e.academic_year || 'Unknown A.Y.';
            const t = e.term || 'Unknown Term';
            terms.add(`${ay} | ${t}`);
        });
        return Array.from(terms).sort((a, b) => b.localeCompare(a));
    }, [exams]);

    const filteredExams = exams.filter(exam => {
        const matchesSearch = searchQuery === '' ||
            exam.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
            exam.code.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesStatus = statusFilter === 'all' || exam.status === statusFilter;

        const ay = exam.academic_year || 'Unknown A.Y.';
        const t = exam.term || 'Unknown Term';
        const examTermKey = `${ay} | ${t}`;
        const matchesTerm = termFilter === 'all' || examTermKey === termFilter;

        return matchesSearch && matchesStatus && matchesTerm;
    });

    const groupedExams = useMemo(() => {
        const groups = filteredExams.reduce((acc, exam) => {
            const ay = exam.academic_year || 'Unknown A.Y.';
            const t = exam.term || 'Unknown Term';
            const key = `${ay} | ${t}`;
            if (!acc[key]) acc[key] = [];
            acc[key].push(exam);
            return acc;
        }, {} as Record<string, Exam[]>);

        const sortedKeys = Object.keys(groups).sort((a, b) => b.localeCompare(a));
        return sortedKeys.map(key => ({
            termString: key,
            exams: groups[key]
        }));
    }, [filteredExams]);

    return (
        <div className="subjects-container">
            <div className="subjects-header">
                <div>
                    <h2 className="subjects-title">Exams</h2>
                    <p className="subjects-subtitle">Manage your generated exam sets.</p>
                </div>
                <button className="btn-primary" onClick={() => navigate('/professor/exams/create')}>
                    + Create Exam
                </button>
            </div>

            {/* Search + filter bar */}
            {!isLoading && exams.length > 0 && (
                <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginBottom: '24px', flexWrap: 'nowrap' }}>
                    <div style={{ position: 'relative', flex: '1', minWidth: '0' }}>
                        <svg fill="none" strokeWidth="2" stroke="currentColor" viewBox="0 0 24 24" width="16" height="16" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--prof-text-muted)', pointerEvents: 'none' }}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                        </svg>
                        <input
                            type="text"
                            placeholder="Search by title or code..."
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            style={{
                                width: '100%',
                                padding: '9px 12px 9px 38px',
                                borderRadius: '8px',
                                border: '1.5px solid var(--prof-border)',
                                background: '#fff',
                                color: 'var(--prof-text-main)',
                                fontSize: '0.875rem',
                                outline: 'none',
                                boxSizing: 'border-box',
                                boxShadow: '0 1px 2px rgba(0,0,0,0.02)',
                                transition: 'border-color 0.2s'
                            }}
                        />
                    </div>

                    <div style={{ position: 'relative', flexShrink: 0 }}>
                        <select
                            value={termFilter}
                            onChange={e => setTermFilter(e.target.value)}
                            style={{
                                appearance: 'none', padding: '9px 36px 9px 16px', borderRadius: '8px', border: '1.5px solid var(--prof-border)', background: '#fff',
                                color: 'var(--prof-text-main)', fontSize: '0.875rem', fontWeight: 500, outline: 'none', cursor: 'pointer', boxShadow: '0 1px 2px rgba(0,0,0,0.02)', minWidth: '180px'
                            }}
                        >
                            <option value="all">All Terms</option>
                            {availableTerms.map(term => (
                                <option key={term} value={term}>{term}</option>
                            ))}
                        </select>
                        <div style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'var(--prof-text-muted)' }}>
                            <svg fill="none" strokeWidth="2.5" stroke="currentColor" viewBox="0 0 24 24" width="14" height="14"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" /></svg>
                        </div>
                    </div>

                    <div style={{ position: 'relative', flexShrink: 0 }}>
                        <select
                            value={statusFilter}
                            onChange={e => setStatusFilter(e.target.value as typeof statusFilter)}
                            style={{
                                appearance: 'none', padding: '9px 36px 9px 16px', borderRadius: '8px', border: '1.5px solid var(--prof-border)', background: '#fff',
                                color: 'var(--prof-text-main)', fontSize: '0.875rem', fontWeight: 500, outline: 'none', cursor: 'pointer', boxShadow: '0 1px 2px rgba(0,0,0,0.02)', minWidth: '140px'
                            }}
                        >
                            <option value="all">All Status</option>
                            <option value="draft">Draft</option>
                            <option value="deployed">Opened</option>
                            <option value="done">Closed</option>
                        </select>
                        <div style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'var(--prof-text-muted)' }}>
                            <svg fill="none" strokeWidth="2.5" stroke="currentColor" viewBox="0 0 24 24" width="14" height="14"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" /></svg>
                        </div>
                    </div>
                </div>
            )}

            {isLoading ? (
                <div className="subjects-empty">
                    <p style={{ color: 'var(--prof-text-muted)' }}>Loading exams...</p>
                </div>
            ) : exams.length === 0 ? (
                <div className="subjects-empty">
                    <svg fill="none" strokeWidth="1.5" stroke="currentColor" viewBox="0 0 24 24" className="empty-icon">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" />
                    </svg>
                    <h3>No existing exam</h3>
                    <p>Create your first exam to get started.</p>
                    <button className="btn-primary" onClick={() => navigate('/professor/exams/create')} style={{ marginTop: '16px' }}>
                        + Create Exam
                    </button>
                </div>
            ) : filteredExams.length === 0 ? (
                <div className="subjects-empty">
                    <p style={{ color: 'var(--prof-text-muted)' }}>No exams match your search or filter.</p>
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
                    {groupedExams.map(group => (
                        <div key={group.termString}>
                            <h3 style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--prof-text-muted)', marginBottom: '16px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                {group.termString}
                            </h3>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '16px' }}>
                                {group.exams.map(exam => {
                                    const statusColor = exam.status === 'deployed' ? '#16a34a' : exam.status === 'done' ? '#64748b' : '#f59e0b';
                                    const statusLabel = exam.status === 'deployed' ? 'Open' : exam.status === 'done' ? 'Closed' : 'Draft';
                                    const isIncomplete = exam.status === 'draft' && (exam.exam_subjects.length === 0 || exam.num_sets === 0);

                                    return (
                                        <div key={exam.id} style={{
                                            background: '#fff', borderRadius: '10px', border: '1px solid var(--prof-border)', overflow: 'hidden',
                                            display: 'flex', flexDirection: 'column', position: 'relative', boxShadow: '0 2px 4px rgba(0,0,0,0.02)'
                                        }}>
                                            <div style={{ height: '4px', background: statusColor }} />
                                            <div style={{ padding: '20px', flex: 1, display: 'flex', flexDirection: 'column' }}>
                                                <p style={{ margin: '0 0 6px 0', fontSize: '0.75rem', color: 'var(--prof-text-muted)', fontWeight: 600, letterSpacing: '0.05em' }}>
                                                    {exam.code}
                                                </p>
                                                <h3 style={{ margin: '0 0 16px 0', fontSize: '1.05rem', color: 'var(--prof-text-main)', lineHeight: 1.3 }}>
                                                    {exam.title}
                                                </h3>

                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: 'auto', marginBottom: '16px' }}>
                                                    <span style={{ fontSize: '0.85rem', fontWeight: 600, color: statusColor }}>
                                                        {statusLabel}
                                                    </span>
                                                    {isIncomplete && (
                                                        <span style={{ fontSize: '0.75rem', color: '#ef4444', background: '#fef2f2', padding: '2px 6px', borderRadius: '4px', border: '1px solid #fee2e2' }}>
                                                            Incomplete
                                                        </span>
                                                    )}
                                                </div>

                                                <div style={{ height: '1px', background: 'var(--prof-border)', margin: '0 -20px 12px' }} />

                                                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '6px' }}>
                                                    {isIncomplete && (
                                                        <button className="btn-icon" onClick={() => navigate(`/professor/exams/${exam.id}/edit`)} title="Add Sets" style={{ color: '#7c3aed' }}>
                                                            <svg fill="none" strokeWidth="2.5" stroke="currentColor" viewBox="0 0 24 24" width="16" height="16"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
                                                        </button>
                                                    )}
                                                    {exam.status === 'draft' && !isIncomplete && (
                                                        <button className="btn-icon" onClick={() => confirmDeploy(exam)} title="Open Exam" style={{ color: '#16a34a' }}>
                                                            <svg fill="none" strokeWidth="2.5" stroke="currentColor" viewBox="0 0 24 24" width="16" height="16"><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" /></svg>
                                                        </button>
                                                    )}
                                                    {exam.status === 'deployed' && (
                                                        <button className="btn-icon" onClick={() => confirmMarkDone(exam)} title="Close Exam" style={{ color: '#2563eb' }}>
                                                            <svg fill="none" strokeWidth="2.5" stroke="currentColor" viewBox="0 0 24 24" width="16" height="16"><path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" /></svg>
                                                        </button>
                                                    )}

                                                    <button className="btn-icon" onClick={() => navigate(`/professor/exams/${exam.id}`)} title="View Details">
                                                        <svg fill="none" strokeWidth="2" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z"></path><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
                                                    </button>

                                                    <button className="btn-icon" onClick={() => navigate(`/professor/exams/${exam.id}/edit`)} title={exam.status !== 'draft' ? 'Cannot edit an open/closed exam' : 'Edit Exam'} disabled={exam.status !== 'draft'} style={exam.status !== 'draft' ? { opacity: 0.35, cursor: 'not-allowed' } : {}}>
                                                        <svg fill="none" strokeWidth="2" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10"></path></svg>
                                                    </button>

                                                    <button className="btn-icon danger" onClick={() => confirmDelete(exam)} title={exam.status !== 'draft' ? 'Cannot delete an open/closed exam' : 'Delete Exam'} disabled={exam.status !== 'draft'} style={exam.status !== 'draft' ? { opacity: 0.35, cursor: 'not-allowed' } : {}}>
                                                        <svg fill="none" strokeWidth="2" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            <Popup
                isOpen={deletePopupOpen}
                title="Delete Exam"
                message={`Are you sure you want to delete "${examToDelete?.title}" (${examToDelete?.code})? All generated sets will be permanently removed.`}
                type="danger"
                onConfirm={handleDelete}
                onCancel={() => { setDeletePopupOpen(false); setExamToDelete(null); }}
                confirmText={isDeleting ? 'Deleting...' : 'Delete'}
                cancelText="Cancel"
            />

            <MarkDoneExamModal
                isOpen={donePopupOpen && !!examToMarkDone}
                examTitle={examToMarkDone?.title || ''}
                isMarkingDone={isMarkingDone}
                onClose={() => setDonePopupOpen(false)}
                onConfirm={handleMarkDone}
            />

            <DeployExamModal
                isOpen={deployPopupOpen && !!examToDeploy}
                examTitle={examToDeploy?.title || ''}
                isDeploying={isDeploying}
                onClose={() => setDeployPopupOpen(false)}
                onConfirm={handleDeploy}
            />

            <Toast isOpen={toast.open} message={toast.message} type={toast.type} onClose={closeToast} />
        </div>
    );
}
