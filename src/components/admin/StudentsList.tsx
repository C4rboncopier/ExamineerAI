import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { fetchStudents, deleteStudent } from '../../lib/students';
import type { Student } from '../../lib/students';
import { Popup } from '../common/Popup';
import { Toast } from '../common/Toast';

const ITEMS_PER_PAGE = 20;

interface ToastState { open: boolean; message: string; type: 'success' | 'error' | 'info'; }

export function StudentsList() {
    const navigate = useNavigate();
    const location = useLocation();
    const [students, setStudents] = useState<Student[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [programFilter, setProgramFilter] = useState('');
    const [currentPage, setCurrentPage] = useState(1);

    // View
    const [viewTarget, setViewTarget] = useState<Student | null>(null);

    // Single delete
    const [deletePopupOpen, setDeletePopupOpen] = useState(false);
    const [studentToDelete, setStudentToDelete] = useState<Student | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);

    // Multi-select
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [bulkDeletePopupOpen, setBulkDeletePopupOpen] = useState(false);
    const [isBulkDeleting, setIsBulkDeleting] = useState(false);

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
        fetchStudents().then((studRes) => {
            if (!studRes.error) setStudents(studRes.data);
            setIsLoading(false);
        });
    }, []);

    // Unique programs derived from loaded students
    const programs = useMemo(() => {
        const map = new Map<string, { id: string; code: string; name: string }>();
        students.forEach(s => {
            if (s.program_id && s.program) map.set(s.program_id, { id: s.program_id, code: s.program.code, name: s.program.name });
        });
        return Array.from(map.values()).sort((a, b) => a.code.localeCompare(b.code));
    }, [students]);

    const filtered = useMemo(() => {
        const q = searchQuery.toLowerCase().trim();
        return students.filter(s => {
            const matchesSearch = !q || s.full_name?.toLowerCase().includes(q) || s.username?.toLowerCase().includes(q);
            const matchesProgram = !programFilter || s.program_id === programFilter;
            return matchesSearch && matchesProgram;
        });
    }, [students, searchQuery, programFilter]);

    const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE));
    const paged = filtered.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

    useEffect(() => { setCurrentPage(1); }, [searchQuery, programFilter]);
    useEffect(() => { setSelectedIds(new Set()); }, [searchQuery, programFilter]);

    // ── Select ──────────────────────────────────────────────────────────

    const allPageSelected = paged.length > 0 && paged.every(s => selectedIds.has(s.id));
    const somePageSelected = paged.some(s => selectedIds.has(s.id)) && !allPageSelected;

    function toggleAll() {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (allPageSelected) {
                paged.forEach(s => next.delete(s.id));
            } else {
                paged.forEach(s => next.add(s.id));
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

    async function handleDelete() {
        if (!studentToDelete) return;
        setIsDeleting(true);
        const { error } = await deleteStudent(studentToDelete.id);
        if (error) {
            showToast(error, 'error');
        } else {
            setStudents(prev => prev.filter(s => s.id !== studentToDelete.id));
            setSelectedIds(prev => { const next = new Set(prev); next.delete(studentToDelete.id); return next; });
            showToast(`Student "${studentToDelete.full_name}" deleted.`);
        }
        setDeletePopupOpen(false);
        setStudentToDelete(null);
        setIsDeleting(false);
    }

    // ── Bulk Delete ─────────────────────────────────────────────────────

    async function handleBulkDelete() {
        setIsBulkDeleting(true);
        const ids = Array.from(selectedIds);
        let errorCount = 0;
        for (const id of ids) {
            const { error } = await deleteStudent(id);
            if (error) errorCount++;
        }
        setStudents(prev => prev.filter(s => !selectedIds.has(s.id)));
        setSelectedIds(new Set());
        setBulkDeletePopupOpen(false);
        setIsBulkDeleting(false);
        if (errorCount > 0) {
            showToast(`${errorCount} student(s) could not be deleted.`, 'error');
        } else {
            showToast(`${ids.length} student${ids.length !== 1 ? 's' : ''} deleted.`);
        }
    }

    // ── Render ─────────────────────────────────────────────────────────

    return (
        <div className="subjects-container">
            {/* Header */}
            <div className="subjects-header">
                <div style={{ flex: 1 }}>
                    <h2 className="subjects-title">Students</h2>
                    <p className="subjects-subtitle">Manage student accounts and records.</p>
                </div>
                <button className="btn-primary" onClick={() => navigate('/admin/students/addstudent')}>+ Add Student</button>
            </div>

            {/* Search + Program Filter */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', alignItems: 'center' }}>
                <div className="subjects-search" style={{ flex: '1 1 0', minWidth: 0, marginBottom: 0 }}>
                    <svg className="search-icon" fill="none" strokeWidth="2" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                    </svg>
                    <input
                        type="text"
                        className="subjects-search-input"
                        placeholder="Search by name or username..."
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                    />
                    {searchQuery && (
                        <button className="search-clear-btn" onClick={() => setSearchQuery('')}>
                            <svg fill="none" strokeWidth="2.5" stroke="currentColor" viewBox="0 0 24 24" width="14" height="14">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    )}
                </div>
                <select
                    value={programFilter}
                    onChange={e => setProgramFilter(e.target.value)}
                    style={{
                        padding: '8px 32px 8px 12px',
                        borderRadius: '8px',
                        border: '1.5px solid var(--prof-border)',
                        background: '#fff',
                        color: programFilter ? 'var(--prof-text-main)' : 'var(--prof-text-muted)',
                        fontSize: '0.875rem',
                        cursor: 'pointer',
                        appearance: 'none',
                        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%236b7280' stroke-width='2'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' d='M19 9l-7 7-7-7'/%3E%3C/svg%3E")`,
                        backgroundRepeat: 'no-repeat',
                        backgroundPosition: 'right 8px center',
                        backgroundSize: '16px',
                        width: '280px',
                        flexShrink: 0,
                        flexGrow: 0,
                        alignSelf: 'stretch',
                    }}
                >
                    <option value="">All Programs</option>
                    {programs.map(p => (
                        <option key={p.id} value={p.id}>{p.code}</option>
                    ))}
                </select>
            </div>

            {/* Selection Banner */}
            {selectedIds.size > 0 && (
                <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '8px 14px', marginBottom: '8px', borderRadius: '8px',
                    background: '#eff6ff', border: '1px solid #bfdbfe',
                }}>
                    <span style={{ fontSize: '0.875rem', fontWeight: 600, color: '#1d4ed8' }}>
                        {selectedIds.size} student{selectedIds.size !== 1 ? 's' : ''} selected
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
                            className="btn-danger"
                            style={{ padding: '5px 12px', fontSize: '0.825rem', background: '#ef4444', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 600 }}
                            onClick={() => setBulkDeletePopupOpen(true)}
                        >
                            Delete Selected
                        </button>
                    </div>
                </div>
            )}

            {/* List */}
            {isLoading ? (
                <div className="subjects-loading">Loading students...</div>
            ) : filtered.length === 0 ? (
                <div className="subjects-empty">
                    <svg fill="none" strokeWidth="1.5" stroke="currentColor" viewBox="0 0 24 24" className="empty-icon">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
                    </svg>
                    <p>{searchQuery || programFilter ? 'No students match your filters.' : 'No students yet. Add one to get started.'}</p>
                </div>
            ) : (
                <div className="templates-simple-list" style={{ borderRadius: '10px', overflow: 'hidden', border: '1px solid var(--prof-border)' }}>
                    {/* Table Header */}
                    <div style={{
                        display: 'grid', gridTemplateColumns: '36px 1fr 80px 110px 100px',
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
                        <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--prof-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Student ID</span>
                        <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--prof-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Actions</span>
                    </div>

                    {/* Rows */}
                    {paged.map((student, idx) => {
                        const isSelected = selectedIds.has(student.id);
                        return (
                            <div
                                key={student.id}
                                style={{
                                    display: 'grid', gridTemplateColumns: '36px 1fr 80px 110px 100px',
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
                                        onChange={() => toggleOne(student.id)}
                                        style={{ width: '15px', height: '15px', cursor: 'pointer', accentColor: 'var(--prof-accent)' }}
                                    />
                                </div>

                                {/* Name */}
                                <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--prof-text-main)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {student.full_name ?? '—'}
                                </span>

                                {/* Program badge */}
                                <div>
                                    {student.program ? (
                                        <span style={{ display: 'inline-flex', padding: '2px 7px', borderRadius: '10px', fontSize: '11px', fontWeight: 600, background: '#f0fdf4', color: '#15803d', border: '1px solid #bbf7d0', whiteSpace: 'nowrap' }}>
                                            {student.program.code}
                                        </span>
                                    ) : (
                                        <span style={{ fontSize: '0.825rem', color: 'var(--prof-text-muted)' }}>—</span>
                                    )}
                                </div>

                                {/* Student ID */}
                                <span style={{ fontSize: '0.825rem', color: 'var(--prof-text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {student.student_id ?? '—'}
                                </span>

                                {/* Actions */}
                                <div style={{ display: 'flex', gap: '2px' }}>
                                    <button className="btn-icon" title="View student" onClick={() => setViewTarget(student)}>
                                        <svg fill="none" strokeWidth="2" stroke="currentColor" viewBox="0 0 24 24" width="15" height="15">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                        </svg>
                                    </button>
                                    <button className="btn-icon" title="Edit student" onClick={() => navigate(`/admin/students/editstudent/${student.id}`, { state: { student } })}>
                                        <svg fill="none" strokeWidth="2" stroke="currentColor" viewBox="0 0 24 24" width="15" height="15">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                                        </svg>
                                    </button>
                                    <button className="btn-icon danger" title="Delete student" onClick={() => { setStudentToDelete(student); setDeletePopupOpen(true); }}>
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
                    Showing {(currentPage - 1) * ITEMS_PER_PAGE + 1}–{Math.min(currentPage * ITEMS_PER_PAGE, filtered.length)} of {filtered.length} student{filtered.length !== 1 ? 's' : ''}
                </p>
            )}

            {/* View Student Modal */}
            {viewTarget && (
                <div className="ql-summary-overlay" onClick={() => setViewTarget(null)} style={{ zIndex: 2000, backdropFilter: 'blur(4px)', backgroundColor: 'rgba(15, 37, 84, 0.4)' }}>
                    <div className="ql-summary-modal" style={{ maxWidth: '460px', padding: 0, overflow: 'hidden' }} onClick={e => e.stopPropagation()}>
                        <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid var(--prof-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                                <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: 'var(--prof-text-main)' }}>Student Details</h3>
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
                                <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--prof-text-muted)' }}>Student ID</span>
                                <span style={{ fontSize: '0.95rem', color: 'var(--prof-text-main)' }}>{viewTarget.student_id ?? '—'}</span>
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

            {/* Single Delete */}
            <Popup
                isOpen={deletePopupOpen}
                title="Delete Student"
                message={`Are you sure you want to delete "${studentToDelete?.full_name}"? Their account and all associated data will be permanently removed.`}
                type="danger"
                onConfirm={handleDelete}
                onCancel={() => { setDeletePopupOpen(false); setStudentToDelete(null); }}
                confirmText={isDeleting ? 'Deleting...' : 'Delete'}
                cancelText="Cancel"
            />

            {/* Bulk Delete */}
            <Popup
                isOpen={bulkDeletePopupOpen}
                title="Delete Students"
                message={`Are you sure you want to delete ${selectedIds.size} selected student${selectedIds.size !== 1 ? 's' : ''}? Their accounts and all associated data will be permanently removed.`}
                type="danger"
                onConfirm={handleBulkDelete}
                onCancel={() => setBulkDeletePopupOpen(false)}
                confirmText={isBulkDeleting ? 'Deleting...' : `Delete ${selectedIds.size} Student${selectedIds.size !== 1 ? 's' : ''}`}
                cancelText="Cancel"
            />

            <Toast isOpen={toast.open} message={toast.message} type={toast.type} onClose={closeToast} />
        </div>
    );
}
