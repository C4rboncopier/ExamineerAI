import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { fetchProfessors, deleteProfessor } from '../../lib/professors';
import type { Professor } from '../../lib/professors';
import { Toast } from '../common/Toast';
import { Popup } from '../common/Popup';

const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '9px 12px',
    borderRadius: '8px',
    border: '1.5px solid var(--prof-border)',
    background: '#fff',
    color: 'var(--prof-text-main)',
    fontSize: '0.875rem',
};

export function ProfessorsList() {
    const [searchQuery, setSearchQuery] = useState('');
    const [professors, setProfessors] = useState<Professor[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [currentPage, setCurrentPage] = useState(1);
    const ITEMS_PER_PAGE = 10;
    const navigate = useNavigate();
    const location = useLocation();

    // Delete
    const [deleteTarget, setDeleteTarget] = useState<Professor | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);

    // View
    const [viewTarget, setViewTarget] = useState<Professor | null>(null);

    const [toast, setToast] = useState<{ isOpen: boolean; message: string; type: 'success' | 'error' }>({
        isOpen: false, message: '', type: 'success',
    });

    useEffect(() => {
        fetchProfessors().then(prof => {
            setProfessors(prof.data);
            setIsLoading(false);
        });
    }, []);

    // Handle toast from navigation
    useEffect(() => {
        if (location.state && location.state.toastMessage) {
            setToast({ isOpen: true, message: location.state.toastMessage, type: 'success' });
            // clear the state so it doesn't show again on refresh
            const newState = { ...location.state };
            delete newState.toastMessage;
            navigate(location.pathname, { replace: true, state: newState });
        }
    }, [location, navigate]);

    const filtered = professors.filter(p => {
        const q = searchQuery.toLowerCase();
        return (
            p.full_name?.toLowerCase().includes(q) ||
            p.email?.toLowerCase().includes(q) ||
            p.username?.toLowerCase().includes(q) ||
            p.program?.name.toLowerCase().includes(q) ||
            p.program?.code.toLowerCase().includes(q)
        );
    });

    const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE));
    const pagedProfessors = filtered.slice(
        (currentPage - 1) * ITEMS_PER_PAGE,
        currentPage * ITEMS_PER_PAGE
    );

    function showToast(message: string, type: 'success' | 'error') {
        setToast({ isOpen: true, message, type });
    }

    // ── Delete ───────────────────────────────────────────────────────────
    async function handleDelete() {
        if (!deleteTarget) return;
        setIsDeleting(true);
        const { error } = await deleteProfessor(deleteTarget.id);
        setIsDeleting(false);
        if (error) {
            showToast(error, 'error');
        } else {
            setProfessors(prev => prev.filter(p => p.id !== deleteTarget.id));
            showToast(`${deleteTarget.full_name} has been removed.`, 'success');
        }
        setDeleteTarget(null);
    }

    return (
        <div className="subjects-container">
            <style>{`
                @media (max-width: 768px) {
                    .subjects-header {
                        flex-direction: column !important;
                        align-items: flex-start !important;
                        gap: 12px !important;
                        margin-bottom: 16px !important;
                    }
                    .admin-prof-card {
                        flex-direction: column !important;
                        align-items: flex-start !important;
                        gap: 12px !important;
                    }
                    .admin-add-btn {
                        padding: 8px 12px !important;
                        font-size: 0.85rem !important;
                    }
                }
            `}</style>
            <div className="subjects-header">
                <div style={{ flex: 1 }}>
                    <h2 className="subjects-title">Professors</h2>
                    <p className="subjects-subtitle">Manage professor accounts and access.</p>
                </div>
                <button className="btn-primary admin-add-btn" onClick={() => navigate('/admin/professors/addprofessor')}>+ Add Professor</button>
            </div>

            <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginBottom: '20px' }}>
                <div style={{ position: 'relative', flex: 1, minWidth: 0 }}>
                    <svg fill="none" strokeWidth="2" stroke="currentColor" viewBox="0 0 24 24" width="16" height="16" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--prof-text-muted)', pointerEvents: 'none' }}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                    </svg>
                    <input
                        type="text"
                        placeholder="Search by name, email, username, or program..."
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        style={{ ...inputStyle, padding: '9px 12px 9px 38px', boxShadow: '0 1px 2px rgba(0,0,0,0.02)', transition: 'border-color 0.2s' }}
                    />
                </div>
            </div>

            <div className="templates-simple-list">
                {isLoading ? (
                    <p style={{ color: 'var(--prof-text-muted)', textAlign: 'center', padding: '40px 0' }}>Loading professors...</p>
                ) : filtered.length === 0 ? (
                    <p style={{ color: 'var(--prof-text-muted)', textAlign: 'center', padding: '40px 0' }}>
                        {searchQuery ? 'No professors match your search.' : 'No professors yet. Click "+ Add Professor" to get started.'}
                    </p>
                ) : pagedProfessors.map(prof => (
                    <div key={prof.id} className="subject-card admin-prof-card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px', marginBottom: '12px', flexWrap: 'wrap', gap: '12px' }}>
                        <div className="template-info" style={{ flex: '1 1 auto', minWidth: '150px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <h3 className="subject-name" style={{ margin: 0 }}>{prof.full_name ?? '—'}</h3>
                                {prof.program && (
                                    <span style={{ display: 'inline-flex', alignItems: 'center', padding: '2px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: 600, background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe', whiteSpace: 'nowrap' }}>
                                        {prof.program.code}
                                    </span>
                                )}
                            </div>
                        </div>
                        <div className="subject-card-actions" style={{ marginTop: 0, gap: '6px', flexShrink: 0, display: 'flex' }}>
                            <button
                                className="btn-icon"
                                onClick={() => setViewTarget(prof)}
                                title="View Details"
                            >
                                <svg fill="none" strokeWidth="2" stroke="currentColor" viewBox="0 0 24 24" width="18" height="18"><path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z"></path><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
                            </button>
                            <button
                                className="btn-icon"
                                onClick={() => navigate(`/admin/professors/editprofessor/${prof.id}`, { state: { professor: prof } })}
                                title="Edit Professor"
                            >
                                <svg fill="none" strokeWidth="2" stroke="currentColor" viewBox="0 0 24 24" width="18" height="18"><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10"></path></svg>
                            </button>
                            <button
                                className="btn-icon danger"
                                onClick={() => setDeleteTarget(prof)}
                                title="Delete Professor"
                            >
                                <svg fill="none" strokeWidth="2" stroke="currentColor" viewBox="0 0 24 24" width="18" height="18"><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                            </button>
                        </div>
                    </div>
                ))}
            </div>

            {!isLoading && totalPages > 1 && (
                <div className="subjects-pagination" style={{ marginTop: '16px' }}>
                    <button
                        className="pagination-btn"
                        onClick={() => setCurrentPage(p => p - 1)}
                        disabled={currentPage === 1}
                    >
                        <svg fill="none" strokeWidth="2" stroke="currentColor" viewBox="0 0 24 24" width="16" height="16"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5"></path></svg>
                        Previous
                    </button>
                    <div className="pagination-pages">
                        {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                            <button
                                key={page}
                                className={`pagination-page ${page === currentPage ? 'active' : ''}`}
                                onClick={() => setCurrentPage(page)}
                            >
                                {page}
                            </button>
                        ))}
                    </div>
                    <button
                        className="pagination-btn"
                        onClick={() => setCurrentPage(p => p + 1)}
                        disabled={currentPage === totalPages}
                    >
                        Next
                        <svg fill="none" strokeWidth="2" stroke="currentColor" viewBox="0 0 24 24" width="16" height="16"><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5"></path></svg>
                    </button>
                </div>
            )}
            {!isLoading && filtered.length > 0 && (
                <p className="subjects-count">
                    Showing {(currentPage - 1) * ITEMS_PER_PAGE + 1}–{Math.min(currentPage * ITEMS_PER_PAGE, filtered.length)} of {filtered.length} professor{filtered.length !== 1 ? 's' : ''}
                </p>
            )}

            {/* ── View Professor Modal ── */}
            {viewTarget && (
                <div className="ql-summary-overlay" onClick={() => setViewTarget(null)} style={{ zIndex: 2000, backdropFilter: 'blur(4px)', backgroundColor: 'rgba(15, 37, 84, 0.4)' }}>
                    <div className="ql-summary-modal" style={{ maxWidth: '460px', padding: 0, overflow: 'hidden' }} onClick={e => e.stopPropagation()}>
                        <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid var(--prof-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                                <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: 'var(--prof-text-main)' }}>Professor Details</h3>
                                <p style={{ margin: '4px 0 0', fontSize: '0.825rem', color: 'var(--prof-text-muted)' }}>{viewTarget.full_name}</p>
                            </div>
                            <button className="ql-summary-close" onClick={() => setViewTarget(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--prof-text-muted)', display: 'flex' }}>
                                <svg fill="none" strokeWidth="2" stroke="currentColor" viewBox="0 0 24 24" width="20" height="20"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"></path></svg>
                            </button>
                        </div>
                        <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--prof-text-muted)' }}>Full Name</span>
                                <span style={{ fontSize: '0.95rem', color: 'var(--prof-text-main)' }}>{viewTarget.full_name ?? '—'}</span>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--prof-text-muted)' }}>Email Address</span>
                                <span style={{ fontSize: '0.95rem', color: 'var(--prof-text-main)' }}>{viewTarget.email}</span>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--prof-text-muted)' }}>Username</span>
                                <span style={{ fontSize: '0.95rem', color: 'var(--prof-text-main)' }}>{viewTarget.username ? `@${viewTarget.username}` : '—'}</span>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--prof-text-muted)' }}>Program</span>
                                <span style={{ fontSize: '0.95rem', color: 'var(--prof-text-main)' }}>{viewTarget.program ? `${viewTarget.program.code} — ${viewTarget.program.name}` : '—'}</span>
                            </div>
                        </div>
                        <div style={{ padding: '16px 24px', borderTop: '1px solid var(--prof-border)', display: 'flex', justifyContent: 'flex-end', background: 'var(--prof-bg)' }}>
                            <button className="btn-primary" onClick={() => setViewTarget(null)} style={{ padding: '8px 16px' }}>Close</button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Delete Confirmation ── */}
            <Popup
                isOpen={!!deleteTarget}
                type="danger"
                title="Delete Professor"
                message={`Are you sure you want to delete ${deleteTarget?.full_name ?? 'this professor'}? This will permanently remove their account and cannot be undone.`}
                confirmText={isDeleting ? 'Deleting...' : 'Delete'}
                cancelText="Cancel"
                onConfirm={handleDelete}
                onCancel={() => setDeleteTarget(null)}
            />

            <Toast isOpen={toast.isOpen} message={toast.message} type={toast.type} onClose={() => setToast(t => ({ ...t, isOpen: false }))} />
        </div>
    );
}
