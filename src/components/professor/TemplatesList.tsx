import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchTemplates, deleteTemplate } from '../../lib/templates';
import type { Template } from '../../lib/templates';
import { fetchSubjects } from '../../lib/subjects';
import type { SubjectWithCounts } from '../../lib/subjects';
import { Popup } from '../common/Popup';
import { Toast } from '../common/Toast';

interface ToastState {
    open: boolean;
    message: string;
    type: 'success' | 'error' | 'info';
}

export function TemplatesList() {
    const navigate = useNavigate();
    const [templates, setTemplates] = useState<Template[]>([]);
    const [subjectMap, setSubjectMap] = useState<Record<string, SubjectWithCounts>>({});
    const [isLoading, setIsLoading] = useState(true);

    // Delete state
    const [deletePopupOpen, setDeletePopupOpen] = useState(false);
    const [templateToDelete, setTemplateToDelete] = useState<Template | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);

    // Toast
    const [toast, setToast] = useState<ToastState>({ open: false, message: '', type: 'success' });
    const showToast = (message: string, type: 'success' | 'error' | 'info' = 'success') =>
        setToast({ open: true, message, type });
    const closeToast = useCallback(() => setToast(prev => ({ ...prev, open: false })), []);

    useEffect(() => {
        fetchSubjects().then(({ data }) => {
            const map: Record<string, SubjectWithCounts> = {};
            data.forEach(s => { map[s.id] = s; });
            setSubjectMap(map);
        });
        fetchTemplates().then(({ data, error }) => {
            if (error) showToast('Failed to load templates.', 'error');
            else setTemplates(data);
            setIsLoading(false);
        });
    }, []);

    const handleEdit = (id: string) => navigate(`/professor/templates/${id}/edit`);

    const confirmDelete = (template: Template) => {
        setTemplateToDelete(template);
        setDeletePopupOpen(true);
    };

    const handleDelete = async () => {
        if (!templateToDelete) return;
        setIsDeleting(true);
        const { error } = await deleteTemplate(templateToDelete.id);
        if (error) {
            showToast(error, 'error');
        } else {
            setTemplates(prev => prev.filter(t => t.id !== templateToDelete.id));
            showToast(`Template "${templateToDelete.title}" deleted.`);
        }
        setDeletePopupOpen(false);
        setTemplateToDelete(null);
        setIsDeleting(false);
    };

    return (
        <div className="subjects-container">
            <div className="subjects-header">
                <div>
                    <h2 className="subjects-title">Templates</h2>
                    <p className="subjects-subtitle">Manage your exam templates.</p>
                </div>
                <div className="prof-exam-header-btns">
                    <button className="btn-primary" onClick={() => navigate('/professor/templates/create')}>
                        + Create Template
                    </button>
                </div>
            </div>

            {isLoading ? (
                <div className="subjects-empty">
                    <p style={{ color: 'var(--prof-text-muted)' }}>Loading templates...</p>
                </div>
            ) : templates.length === 0 ? (
                <div className="subjects-empty">
                    <svg fill="none" strokeWidth="1.5" stroke="currentColor" viewBox="0 0 24 24" className="empty-icon">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m3.75 9v6m3-3H9m1.5-12H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"></path>
                    </svg>
                    <h3>No template available</h3>
                    <p>Create your first exam template to get started.</p>
                    <button className="btn-primary" onClick={() => navigate('/professor/templates/create')} style={{ marginTop: '16px' }}>
                        + Create Template
                    </button>
                </div>
            ) : (
                <div className="templates-simple-list">
                    {templates.map(template => {
                        const subjectTags = template.subject_ids
                            .map(id => subjectMap[id])
                            .filter(Boolean)
                            .sort((a, b) => a.course_code.localeCompare(b.course_code));

                        return (
                            <div
                                key={template.id}
                                className="template-list-item subject-card"
                                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px', marginBottom: '12px' }}
                            >
                                <div className="template-info">
                                    <h3 className="subject-name" style={{ margin: '0 0 4px 0' }}>{template.title}</h3>
                                    <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
                                        <span className="subject-code" style={{ marginBottom: 0 }}>{template.code}</span>
                                        <span className="subject-meta" style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                                            {subjectTags.length > 0 ? (
                                                subjectTags.map(s => (
                                                    <span key={s.id} style={{ background: '#f1f5f9', padding: '2px 8px', borderRadius: '12px', fontSize: '12px', color: '#475569' }}>
                                                        {s.course_code}
                                                    </span>
                                                ))
                                            ) : (
                                                <span style={{ fontSize: '12px', color: '#94a3b8' }}>No subjects assigned</span>
                                            )}
                                        </span>
                                    </div>
                                </div>
                                <div className="subject-card-actions" style={{ marginTop: 0 }}>
                                    <button className="btn-icon" onClick={() => handleEdit(template.id)} title="Edit Template">
                                        <svg fill="none" strokeWidth="2" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10"></path></svg>
                                    </button>
                                    <button className="btn-icon danger" onClick={() => confirmDelete(template)} title="Delete Template">
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
                title="Delete Template"
                message={`Are you sure you want to delete "${templateToDelete?.title}" (${templateToDelete?.code})? This action cannot be undone.`}
                type="danger"
                onConfirm={handleDelete}
                onCancel={() => { setDeletePopupOpen(false); setTemplateToDelete(null); }}
                confirmText={isDeleting ? 'Deleting...' : 'Delete'}
                cancelText="Cancel"
            />

            <Toast
                isOpen={toast.open}
                message={toast.message}
                type={toast.type}
                onClose={closeToast}
            />
        </div>
    );
}
