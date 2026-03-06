import { useState, useEffect, useCallback } from 'react';
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

    const filteredExams = exams.filter(exam => {
        const matchesSearch = searchQuery === '' ||
            exam.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
            exam.code.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesStatus = statusFilter === 'all' || exam.status === statusFilter;
        return matchesSearch && matchesStatus;
    });


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
                <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginBottom: '20px', flexWrap: 'nowrap' }}>
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
                            value={statusFilter}
                            onChange={e => setStatusFilter(e.target.value as typeof statusFilter)}
                            style={{
                                appearance: 'none',
                                padding: '9px 36px 9px 16px',
                                borderRadius: '8px',
                                border: '1.5px solid var(--prof-border)',
                                background: '#fff',
                                color: 'var(--prof-text-main)',
                                fontSize: '0.875rem',
                                fontWeight: 500,
                                outline: 'none',
                                cursor: 'pointer',
                                boxShadow: '0 1px 2px rgba(0,0,0,0.02)',
                                minWidth: '140px'
                            }}
                        >
                            <option value="all">All Status</option>
                            <option value="draft">Draft</option>
                            <option value="deployed">Deployed</option>
                            <option value="done">Completed</option>
                        </select>
                        <div style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'var(--prof-text-muted)' }}>
                            <svg fill="none" strokeWidth="2.5" stroke="currentColor" viewBox="0 0 24 24" width="14" height="14">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                            </svg>
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
                <div className="templates-simple-list">
                    {filteredExams.map(exam => {
                        const subjectTags = exam.exam_subjects
                            .filter(s => s.subjects)
                            .sort((a, b) => (a.subjects!.course_code > b.subjects!.course_code ? 1 : -1));

                        return (
                            <div
                                key={exam.id}
                                className="subject-card"
                                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px', marginBottom: '12px' }}
                            >
                                <div className="template-info">
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                                        <h3 className="subject-name" style={{ margin: 0 }}>{exam.title}</h3>
                                        {exam.status === 'done' ? (
                                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '2px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: 600, background: '#eff6ff', color: '#2563eb', border: '1px solid #93c5fd', whiteSpace: 'nowrap' }}>
                                                <svg fill="currentColor" viewBox="0 0 20 20" width="11" height="11"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" /></svg>
                                                Done
                                            </span>
                                        ) : exam.status === 'deployed' && (
                                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '2px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: 600, background: '#dcfce7', color: '#16a34a', border: '1px solid #86efac', whiteSpace: 'nowrap' }}>
                                                <svg fill="currentColor" viewBox="0 0 20 20" width="11" height="11"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" /></svg>
                                                Deployed
                                            </span>
                                        )}
                                    </div>
                                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                                        <span className="subject-code" style={{ marginBottom: 0 }}>{exam.code}</span>
                                        <span className="exam-sets-badge">
                                            {exam.num_sets} Set{exam.num_sets !== 1 ? 's' : ''}
                                        </span>
                                        {subjectTags.map(s => (
                                            <span key={s.subject_id} className="ve-hide-mobile" style={{ background: '#f1f5f9', padding: '2px 8px', borderRadius: '12px', fontSize: '12px', color: '#475569' }}>
                                                {s.subjects!.course_code}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                                <div className="subject-card-actions" style={{ marginTop: 0, gap: '6px' }}>
                                    {exam.status === 'draft' && (
                                        <button className="btn-primary" onClick={() => confirmDeploy(exam)} style={{ display: 'flex', alignItems: 'center', padding: '6px 12px', fontSize: '0.8rem', fontWeight: 600, gap: '6px', color: '#fff', borderColor: '#16a34a', background: '#16a34a', marginRight: '4px', borderRadius: '8px', boxShadow: '0 1px 2px rgba(22,163,74,0.1)' }}>
                                            <svg fill="none" strokeWidth="2.5" stroke="currentColor" viewBox="0 0 24 24" width="14" height="14"><path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.125A59.769 59.769 0 0121.485 12 59.768 59.768 0 013.27 20.875L5.999 12zm0 0h7.5"></path></svg>
                                            Deploy
                                        </button>
                                    )}
                                    {exam.status === 'deployed' && (
                                        <button className="btn-secondary" onClick={() => confirmMarkDone(exam)} style={{ display: 'flex', alignItems: 'center', padding: '6px 12px', fontSize: '0.8rem', fontWeight: 600, gap: '6px', color: '#2563eb', borderColor: '#93c5fd', marginRight: '4px', borderRadius: '8px' }}>
                                            <svg fill="none" strokeWidth="2.5" stroke="currentColor" viewBox="0 0 24 24" width="14" height="14"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                            Mark as Done
                                        </button>
                                    )}
                                    <button className="btn-icon" onClick={() => navigate(`/professor/exams/${exam.id}`)} title="View Exam">
                                        <svg fill="none" strokeWidth="2" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z"></path><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
                                    </button>
                                    <button className="btn-icon" onClick={() => exam.status === 'draft' && navigate(`/professor/exams/${exam.id}/edit`)} title={exam.status !== 'draft' ? 'Cannot edit a deployed exam' : 'Edit Exam'} disabled={exam.status !== 'draft'} style={exam.status !== 'draft' ? { opacity: 0.35, cursor: 'not-allowed' } : {}}>
                                        <svg fill="none" strokeWidth="2" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10"></path></svg>
                                    </button>
                                    <button className="btn-icon danger" onClick={() => exam.status === 'draft' && confirmDelete(exam)} title={exam.status !== 'draft' ? 'Cannot delete a deployed exam' : 'Delete Exam'} disabled={exam.status !== 'draft'} style={exam.status !== 'draft' ? { opacity: 0.35, cursor: 'not-allowed' } : {}}>
                                        <svg fill="none" strokeWidth="2" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                                    </button>
                                </div>
                            </div>
                        );
                    })}
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
