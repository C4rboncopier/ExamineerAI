import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { fetchProfessors, deleteProfessor, checkProfessorOwnership } from '../../lib/professors';
import type { Professor, ProfessorOwnershipInfo } from '../../lib/professors';
import { Popup } from '../common/Popup';
import { Toast } from '../common/Toast';

const ITEMS_PER_PAGE = 10;

interface ToastState { open: boolean; message: string; type: 'success' | 'error' | 'info'; }

export function ProfessorsList() {
    const navigate = useNavigate();
    const location = useLocation();
    const [professors, setProfessors] = useState<Professor[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [programFilter, setProgramFilter] = useState('');
    const [currentPage, setCurrentPage] = useState(1);

    // View
    const [viewTarget, setViewTarget] = useState<Professor | null>(null);

    // Single delete
    const [deletePopupOpen, setDeletePopupOpen] = useState(false);
    const [profToDelete, setProfToDelete] = useState<Professor | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);

    // Multi-select
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [bulkDeletePopupOpen, setBulkDeletePopupOpen] = useState(false);
    const [isBulkDeleting, setIsBulkDeleting] = useState(false);

    // Ownership check
    const [isCheckingDelete, setIsCheckingDelete] = useState(false);
    type BlockedProf = { professor: Professor; subjects: ProfessorOwnershipInfo['subjects']; exams: ProfessorOwnershipInfo['exams'] };
    const [ownershipWarning, setOwnershipWarning] = useState<{ blocked: BlockedProf[]; canDelete: Professor[] } | null>(null);

    const [toast, setToast] = useState<ToastState>({ open: false, message: '', type: 'success' });
    const showToast = useCallback((message: string, type: 'success' | 'error' | 'info' = 'success') => setToast({ open: true, message, type }), []);
    const closeToast = useCallback(() => setToast(prev => ({ ...prev, open: false })), []);

    useEffect(() => {
        if (location.state?.toastMessage) {
            showToast(location.state.toastMessage, 'success');
            window.history.replaceState({}, document.title);
        }
    }, [location, showToast]);

    useEffect(() => {
        fetchProfessors().then((res) => {
            if (!res.error) setProfessors(res.data);
            setIsLoading(false);
        });
    }, []);

    // Unique programs derived from loaded professors
    const programs = useMemo(() => {
        const map = new Map<string, { id: string; code: string; name: string }>();
        professors.forEach(p => {
            if (p.program_id && p.program) map.set(p.program_id, { id: p.program_id, code: p.program.code, name: p.program.name });
        });
        return Array.from(map.values()).sort((a, b) => a.code.localeCompare(b.code));
    }, [professors]);

    const filtered = useMemo(() => {
        const q = searchQuery.toLowerCase().trim();
        return professors.filter(p => {
            const matchesSearch = !q || p.full_name?.toLowerCase().includes(q) || p.username?.toLowerCase().includes(q);
            const matchesProgram = !programFilter || p.program_id === programFilter;
            return matchesSearch && matchesProgram;
        });
    }, [professors, searchQuery, programFilter]);

    const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE));
    const paged = filtered.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

    useEffect(() => { setCurrentPage(1); }, [searchQuery, programFilter]);
    useEffect(() => { setSelectedIds(new Set()); }, [searchQuery, programFilter]);

    // ── Select ──────────────────────────────────────────────────────────

    const allPageSelected = paged.length > 0 && paged.every(p => selectedIds.has(p.id));
    const somePageSelected = paged.some(p => selectedIds.has(p.id)) && !allPageSelected;

    function toggleAll() {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (allPageSelected) {
                paged.forEach(p => next.delete(p.id));
            } else {
                paged.forEach(p => next.add(p.id));
            }
            return next;
        });
    }

    function toggleOne(id: string) {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    }

    // ── Single Delete ───────────────────────────────────────────────────

    async function openDeleteSingle(prof: Professor) {
        setIsCheckingDelete(true);
        const { data } = await checkProfessorOwnership(prof.id);
        setIsCheckingDelete(false);
        if (data.subjects.length > 0 || data.exams.length > 0) {
            setOwnershipWarning({ blocked: [{ professor: prof, subjects: data.subjects, exams: data.exams }], canDelete: [] });
        } else {
            setProfToDelete(prof);
            setDeletePopupOpen(true);
        }
    }

    async function handleDelete() {
        if (!profToDelete) return;
        setIsDeleting(true);
        const { error } = await deleteProfessor(profToDelete.id);
        if (error) {
            showToast(error, 'error');
        } else {
            setProfessors(prev => prev.filter(p => p.id !== profToDelete.id));
            setSelectedIds(prev => { const next = new Set(prev); next.delete(profToDelete.id); return next; });
            showToast(`Professor "${profToDelete.full_name}" deleted.`);
        }
        setDeletePopupOpen(false);
        setProfToDelete(null);
        setIsDeleting(false);
    }

    // ── Bulk Delete ─────────────────────────────────────────────────────

    async function openBulkDelete() {
        setIsCheckingDelete(true);
        const ids = Array.from(selectedIds);
        const checks = await Promise.all(ids.map(async id => {
            const prof = professors.find(p => p.id === id)!;
            const { data } = await checkProfessorOwnership(id);
            return { professor: prof, subjects: data.subjects, exams: data.exams };
        }));
        setIsCheckingDelete(false);
        const blocked = checks.filter(c => c.subjects.length > 0 || c.exams.length > 0);
        const canDelete = checks.filter(c => c.subjects.length === 0 && c.exams.length === 0).map(c => c.professor);
        if (blocked.length > 0) {
            setOwnershipWarning({ blocked, canDelete });
        } else {
            setBulkDeletePopupOpen(true);
        }
    }

    async function handleBulkDelete() {
        setIsBulkDeleting(true);
        const ids = Array.from(selectedIds);
        let errorCount = 0;
        for (const id of ids) {
            const { error } = await deleteProfessor(id);
            if (error) errorCount++;
        }
        setProfessors(prev => prev.filter(p => !selectedIds.has(p.id)));
        setSelectedIds(new Set());
        setBulkDeletePopupOpen(false);
        setIsBulkDeleting(false);
        if (errorCount > 0) {
            showToast(`${errorCount} professor(s) could not be deleted.`, 'error');
        } else {
            showToast(`${ids.length} professor${ids.length !== 1 ? 's' : ''} deleted.`);
        }
    }

    async function handleDeleteUnblocked() {
        if (!ownershipWarning || ownershipWarning.canDelete.length === 0) return;
        const toDelete = ownershipWarning.canDelete;
        setOwnershipWarning(null);
        setIsBulkDeleting(true);
        let errorCount = 0;
        for (const prof of toDelete) {
            const { error } = await deleteProfessor(prof.id);
            if (error) errorCount++;
        }
        const deletedIds = new Set(toDelete.map(p => p.id));
        setProfessors(prev => prev.filter(p => !deletedIds.has(p.id)));
        setSelectedIds(prev => { const next = new Set(prev); deletedIds.forEach(id => next.delete(id)); return next; });
        setIsBulkDeleting(false);
        if (errorCount > 0) {
            showToast(`${errorCount} professor(s) could not be deleted.`, 'error');
        } else {
            showToast(`${toDelete.length} professor${toDelete.length !== 1 ? 's' : ''} deleted.`);
        }
    }

    // ── Render ─────────────────────────────────────────────────────────

    return (
        <div className="subjects-container">
            {/* Header */}
            <div className="subjects-header">
                <div style={{ flex: 1 }}>
                    <h2 className="subjects-title">Professors</h2>
                    <p className="subjects-subtitle">Manage professor accounts and access.</p>
                </div>
                <button className="btn-primary" onClick={() => navigate('/admin/professors/addprofessor')}>+ Add Professor</button>
            </div>

            {/* Search + Program Filter */}
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap' }}>
                <div style={{ position: 'relative', flex: '1 1 200px' }}>
                    <svg fill="none" strokeWidth="2" stroke="currentColor" viewBox="0 0 24 24" width="16" height="16" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--prof-text-muted)', pointerEvents: 'none' }}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                    </svg>
                    <input
                        type="text"
                        placeholder="Search by name or username..."
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        style={{ width: '100%', padding: '9px 12px 9px 38px', borderRadius: '8px', border: '1.5px solid var(--prof-border)', background: '#fff', color: 'var(--prof-text-main)', fontSize: '0.875rem', outline: 'none', boxSizing: 'border-box', boxShadow: '0 1px 2px rgba(0,0,0,0.02)', transition: 'border-color 0.2s', fontFamily: 'inherit' }}
                    />
                    {searchQuery && (
                        <button onClick={() => setSearchQuery('')} style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--prof-text-muted)', display: 'flex', padding: '4px' }}>
                            <svg fill="none" strokeWidth="2.5" stroke="currentColor" viewBox="0 0 24 24" width="14" height="14">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    )}
                </div>
                <div style={{ position: 'relative', flex: '0 0 155px' }}>
                    <select
                        value={programFilter}
                        onChange={e => setProgramFilter(e.target.value)}
                        style={{ appearance: 'none', padding: '9px 36px 9px 16px', borderRadius: '8px', border: '1.5px solid var(--prof-border)', background: '#fff', color: programFilter ? 'var(--prof-text-main)' : 'var(--prof-text-muted)', fontSize: '0.875rem', fontWeight: 500, outline: 'none', cursor: 'pointer', boxShadow: '0 1px 2px rgba(0,0,0,0.02)', width: '100%', fontFamily: 'inherit' }}
                    >
                        <option value="">All Programs</option>
                        {programs.map(p => (
                            <option key={p.id} value={p.id}>{p.code}</option>
                        ))}
                    </select>
                    <svg fill="none" strokeWidth="2" stroke="currentColor" viewBox="0 0 24 24" width="14" height="14" style={{ position: 'absolute', right: '14px', top: '50%', transform: 'translateY(-50%)', color: 'var(--prof-text-muted)', pointerEvents: 'none' }}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                    </svg>
                </div>
            </div>

            {/* Selection Banner */}
            {selectedIds.size > 0 && (
                <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '8px 14px', marginBottom: '8px', borderRadius: '8px',
                    background: '#eff6ff', border: '1px solid #bfdbfe',
                }}>
                    <span style={{ fontSize: '0.875rem', fontWeight: 600, color: '#1d4ed8' }}>
                        {selectedIds.size} professor{selectedIds.size !== 1 ? 's' : ''} selected
                    </span>
                    <div style={{ display: 'flex', gap: '8px' }}>
                        <button
                            className="btn-secondary"
                            style={{ padding: '5px 12px', fontSize: '0.825rem' }}
                            onClick={() => setSelectedIds(new Set())}
                        >
                            Clear
                        </button>
                        <button
                            style={{ padding: '5px 12px', fontSize: '0.825rem', background: '#ef4444', color: '#fff', border: 'none', borderRadius: '6px', cursor: isCheckingDelete ? 'default' : 'pointer', fontWeight: 600, opacity: isCheckingDelete ? 0.7 : 1 }}
                            onClick={openBulkDelete}
                            disabled={isCheckingDelete}
                        >
                            {isCheckingDelete ? 'Checking…' : 'Delete Selected'}
                        </button>
                    </div>
                </div>
            )}

            {/* List */}
            {isLoading ? (
                <div className="subjects-loading">Loading professors...</div>
            ) : filtered.length === 0 ? (
                <div className="subjects-empty">
                    <svg fill="none" strokeWidth="1.5" stroke="currentColor" viewBox="0 0 24 24" className="empty-icon">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
                    </svg>
                    <p>{searchQuery || programFilter ? 'No professors match your filters.' : 'No professors yet. Click "+ Add Professor" to get started.'}</p>
                </div>
            ) : (
                <div className="templates-simple-list" style={{ borderRadius: '10px', overflow: 'hidden', border: '1px solid var(--prof-border)' }}>
                    {/* Table Header */}
                    <div className="admin-prof-list-header" style={{
                        display: 'grid', gridTemplateColumns: '36px 1fr 80px 100px',
                        alignItems: 'center', padding: '8px 14px',
                        background: 'var(--prof-bg)', borderBottom: '1px solid var(--prof-border)',
                        gap: '12px',
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <input
                                type="checkbox"
                                checked={allPageSelected}
                                ref={el => { if (el) el.indeterminate = somePageSelected; }}
                                onChange={toggleAll}
                                style={{ width: '15px', height: '15px', cursor: 'pointer', accentColor: 'var(--prof-accent)' }}
                            />
                        </div>
                        <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--prof-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Name</span>
                        <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--prof-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Program</span>
                        <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--prof-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Actions</span>
                    </div>

                    {/* Rows */}
                    {paged.map((prof, idx) => {
                        const isSelected = selectedIds.has(prof.id);
                        return (
                            <div
                                key={prof.id}
                                className="admin-prof-list-row"
                                style={{
                                    display: 'grid', gridTemplateColumns: '36px 1fr 80px 100px',
                                    alignItems: 'center', padding: '9px 14px', gap: '12px',
                                    background: isSelected ? '#eff6ff' : idx % 2 === 0 ? '#fff' : 'var(--prof-bg)',
                                    borderBottom: idx < paged.length - 1 ? '1px solid var(--prof-border)' : 'none',
                                    transition: 'background 0.1s',
                                }}
                            >
                                {/* Checkbox */}
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <input
                                        type="checkbox"
                                        checked={isSelected}
                                        onChange={() => toggleOne(prof.id)}
                                        style={{ width: '15px', height: '15px', cursor: 'pointer', accentColor: 'var(--prof-accent)' }}
                                    />
                                </div>

                                {/* Name */}
                                <span className="admin-list-name" style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--prof-text-main)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {prof.full_name ?? '—'}
                                </span>

                                {/* Program badge */}
                                <div>
                                    {prof.program ? (
                                        <span style={{ display: 'inline-flex', padding: '2px 7px', borderRadius: '10px', fontSize: '11px', fontWeight: 600, background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe', whiteSpace: 'nowrap' }}>
                                            {prof.program.code}
                                        </span>
                                    ) : (
                                        <span style={{ fontSize: '0.825rem', color: 'var(--prof-text-muted)' }}>—</span>
                                    )}
                                </div>

                                {/* Actions */}
                                <div style={{ display: 'flex', gap: '2px' }}>
                                    <button className="btn-icon" title="View professor" onClick={() => setViewTarget(prof)}>
                                        <svg fill="none" strokeWidth="2" stroke="currentColor" viewBox="0 0 24 24" width="15" height="15">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                        </svg>
                                    </button>
                                    <button className="btn-icon" title="Edit professor" onClick={() => navigate(`/admin/professors/editprofessor/${prof.id}`, { state: { professor: prof } })}>
                                        <svg fill="none" strokeWidth="2" stroke="currentColor" viewBox="0 0 24 24" width="15" height="15">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                                        </svg>
                                    </button>
                                    <button className="btn-icon danger" title="Delete professor" disabled={isCheckingDelete} onClick={() => openDeleteSingle(prof)}>
                                        <svg fill="none" strokeWidth="2" stroke="currentColor" viewBox="0 0 24 24" width="15" height="15">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                        </svg>
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Pagination */}
            {!isLoading && totalPages > 1 && (
                <div className="subjects-pagination">
                    <button className="pagination-btn" onClick={() => setCurrentPage(p => p - 1)} disabled={currentPage === 1}>
                        <svg fill="none" strokeWidth="2" stroke="currentColor" viewBox="0 0 24 24" width="16" height="16"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" /></svg>
                        Previous
                    </button>
                    <div className="pagination-pages">
                        {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                            <button key={page} className={`pagination-page ${page === currentPage ? 'active' : ''}`} onClick={() => setCurrentPage(page)}>
                                {page}
                            </button>
                        ))}
                    </div>
                    <button className="pagination-btn" onClick={() => setCurrentPage(p => p + 1)} disabled={currentPage === totalPages}>
                        Next
                        <svg fill="none" strokeWidth="2" stroke="currentColor" viewBox="0 0 24 24" width="16" height="16"><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>
                    </button>
                </div>
            )}
            {!isLoading && filtered.length > 0 && (
                <p className="subjects-count">
                    Showing {(currentPage - 1) * ITEMS_PER_PAGE + 1}–{Math.min(currentPage * ITEMS_PER_PAGE, filtered.length)} of {filtered.length} professor{filtered.length !== 1 ? 's' : ''}
                </p>
            )}

            {/* View Professor Modal */}
            {viewTarget && (
                <div className="ql-summary-overlay" onClick={() => setViewTarget(null)} style={{ zIndex: 2000, backdropFilter: 'blur(4px)', backgroundColor: 'rgba(15, 37, 84, 0.4)' }}>
                    <div className="ql-summary-modal" style={{ maxWidth: '460px', padding: 0, overflow: 'hidden' }} onClick={e => e.stopPropagation()}>
                        <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid var(--prof-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                                <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: 'var(--prof-text-main)' }}>Professor Details</h3>
                                <p style={{ margin: '4px 0 0', fontSize: '0.825rem', color: 'var(--prof-text-muted)' }}>{viewTarget.full_name}</p>
                            </div>
                            <button onClick={() => setViewTarget(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--prof-text-muted)', display: 'flex' }}>
                                <svg fill="none" strokeWidth="2" stroke="currentColor" viewBox="0 0 24 24" width="20" height="20"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                            </button>
                        </div>
                        <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--prof-text-muted)' }}>Full Name</span>
                                <span style={{ fontSize: '0.95rem', color: 'var(--prof-text-main)' }}>{viewTarget.full_name ?? '—'}</span>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--prof-text-muted)' }}>Email Address</span>
                                <span style={{ fontSize: '0.95rem', color: 'var(--prof-text-main)' }}>{viewTarget.email ?? '—'}</span>
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

            {/* Ownership Warning Modal */}
            {ownershipWarning && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(2px)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
                    <div style={{ background: '#fff', borderRadius: '16px', width: '100%', maxWidth: '520px', overflow: 'hidden', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04)' }}>
                        {/* Header */}
                        <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid #fee2e2', background: '#fff7f7' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: '#fee2e2', border: '1px solid #fca5a5', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                    <svg fill="none" strokeWidth="2" stroke="#dc2626" viewBox="0 0 24 24" width="20" height="20"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" /></svg>
                                </div>
                                <div>
                                    <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#0f172a' }}>
                                        Cannot Delete Professor{ownershipWarning.blocked.length > 1 ? 's' : ''}
                                    </h3>
                                    <p style={{ margin: '2px 0 0', fontSize: '0.82rem', color: '#64748b' }}>
                                        {ownershipWarning.blocked.length === 1 ? 'This professor' : `${ownershipWarning.blocked.length} professors`}{' '}
                                        still {ownershipWarning.blocked.length === 1 ? 'has' : 'have'} active subjects or exams as main professor.
                                    </p>
                                </div>
                            </div>
                        </div>

                        {/* Body */}
                        <div style={{ padding: '16px 24px', maxHeight: '360px', overflowY: 'auto' }}>
                            <p style={{ margin: '0 0 12px', fontSize: '0.85rem', color: '#475569' }}>
                                The following professor{ownershipWarning.blocked.length > 1 ? 's are' : ' is'} the main professor of one or more subjects or exams.
                                They must pass their main role to a co-handler before being deleted.
                            </p>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                {ownershipWarning.blocked.map(({ professor, subjects, exams }) => (
                                    <div key={professor.id} style={{ borderRadius: '8px', border: '1px solid #fca5a5', overflow: 'hidden' }}>
                                        <div style={{ padding: '7px 12px', background: '#fee2e2' }}>
                                            <span style={{ fontSize: '0.87rem', fontWeight: 700, color: '#991b1b' }}>{professor.full_name ?? professor.email}</span>
                                        </div>
                                        {(subjects.length > 0 || exams.length > 0) && (
                                            <div style={{ padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: '5px' }}>
                                                {subjects.map(s => (
                                                    <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: '7px', fontSize: '0.81rem', color: '#475569' }}>
                                                        <span style={{ flexShrink: 0, fontSize: '0.67rem', fontWeight: 600, background: '#eff6ff', color: '#1e40af', border: '1px solid #93c5fd', borderRadius: '6px', padding: '1px 6px' }}>Subject</span>
                                                        {s.course_title} ({s.course_code})
                                                    </div>
                                                ))}
                                                {exams.map(e => (
                                                    <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: '7px', fontSize: '0.81rem', color: '#475569' }}>
                                                        <span style={{ flexShrink: 0, fontSize: '0.67rem', fontWeight: 600, background: '#fef9c3', color: '#854d0e', border: '1px solid #fde047', borderRadius: '6px', padding: '1px 6px' }}>Exam</span>
                                                        {e.title} ({e.code})
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                            {ownershipWarning.canDelete.length > 0 && (
                                <div style={{ marginTop: '12px', padding: '10px 12px', borderRadius: '8px', background: '#f0fdf4', border: '1px solid #86efac' }}>
                                    <p style={{ margin: 0, fontSize: '0.82rem', color: '#166534' }}>
                                        <strong>{ownershipWarning.canDelete.length} professor{ownershipWarning.canDelete.length !== 1 ? 's' : ''}</strong>{' '}
                                        ({ownershipWarning.canDelete.map(p => p.full_name ?? p.email).join(', ')}) can still be deleted.
                                    </p>
                                </div>
                            )}
                        </div>

                        {/* Footer */}
                        <div style={{ padding: '14px 24px', borderTop: '1px solid var(--prof-border)', background: 'var(--prof-bg)', display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                            {ownershipWarning.canDelete.length > 0 && (
                                <button
                                    style={{ padding: '7px 16px', fontSize: '0.875rem', fontWeight: 600, background: '#ef4444', color: '#fff', border: 'none', borderRadius: '7px', cursor: 'pointer' }}
                                    onClick={handleDeleteUnblocked}
                                >
                                    Delete {ownershipWarning.canDelete.length} Unblocked
                                </button>
                            )}
                            <button
                                className="btn-secondary"
                                style={{ padding: '7px 16px', fontSize: '0.875rem' }}
                                onClick={() => setOwnershipWarning(null)}
                            >
                                {ownershipWarning.canDelete.length > 0 ? 'Cancel' : 'OK'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Single Delete */}
            <Popup
                isOpen={deletePopupOpen}
                title="Delete Professor"
                message={`Are you sure you want to delete "${profToDelete?.full_name}"? Their account and all associated data will be permanently removed.`}
                type="danger"
                onConfirm={handleDelete}
                onCancel={() => { setDeletePopupOpen(false); setProfToDelete(null); }}
                confirmText={isDeleting ? 'Deleting...' : 'Delete'}
                cancelText="Cancel"
            />

            {/* Bulk Delete */}
            <Popup
                isOpen={bulkDeletePopupOpen}
                title="Delete Professors"
                message={`Are you sure you want to delete ${selectedIds.size} selected professor${selectedIds.size !== 1 ? 's' : ''}? Their accounts and all associated data will be permanently removed.`}
                type="danger"
                onConfirm={handleBulkDelete}
                onCancel={() => setBulkDeletePopupOpen(false)}
                confirmText={isBulkDeleting ? 'Deleting...' : `Delete ${selectedIds.size} Professor${selectedIds.size !== 1 ? 's' : ''}`}
                cancelText="Cancel"
            />

            <Toast isOpen={toast.open} message={toast.message} type={toast.type} onClose={closeToast} />
        </div>
    );
}
