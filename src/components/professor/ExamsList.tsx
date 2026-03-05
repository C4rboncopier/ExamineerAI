import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchExams, deleteExam } from '../../lib/exams';
import type { Exam } from '../../lib/exams';
import { Popup } from '../common/Popup';
import { Toast } from '../common/Toast';

interface ToastState {
    open: boolean;
    message: string;
    type: 'success' | 'error' | 'info';
}

const SET_LABELS = ['A', 'B', 'C', 'D', 'E'];

export function ExamsList() {
    const navigate = useNavigate();
    const [exams, setExams] = useState<Exam[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    const [deletePopupOpen, setDeletePopupOpen] = useState(false);
    const [examToDelete, setExamToDelete] = useState<Exam | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);

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
            ) : (
                <div className="templates-simple-list">
                    {exams.map(exam => {
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
                                    <h3 className="subject-name" style={{ margin: '0 0 6px 0' }}>{exam.title}</h3>
                                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                                        <span className="subject-code" style={{ marginBottom: 0 }}>{exam.code}</span>
                                        <span className="exam-sets-badge">
                                            {exam.num_sets} Set{exam.num_sets !== 1 ? 's' : ''} ({SET_LABELS.slice(0, exam.num_sets).join(', ')})
                                        </span>
                                        {subjectTags.map(s => (
                                            <span key={s.subject_id} style={{ background: '#f1f5f9', padding: '2px 8px', borderRadius: '12px', fontSize: '12px', color: '#475569' }}>
                                                {s.subjects!.course_code}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                                <div className="subject-card-actions" style={{ marginTop: 0 }}>
                                    <button className="btn-icon" onClick={() => navigate(`/professor/exams/${exam.id}`)} title="View Exam">
                                        <svg fill="none" strokeWidth="2" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z"></path><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
                                    </button>
                                    <button className="btn-icon" onClick={() => navigate(`/professor/exams/${exam.id}/edit`)} title="Edit Exam">
                                        <svg fill="none" strokeWidth="2" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10"></path></svg>
                                    </button>
                                    <button className="btn-icon danger" onClick={() => confirmDelete(exam)} title="Delete Exam">
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

            <Toast isOpen={toast.open} message={toast.message} type={toast.type} onClose={closeToast} />
        </div>
    );
}
