import { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate, useLocation, useParams } from 'react-router-dom';
import { updateProfessor, fetchPrograms, fetchProfessors } from '../../lib/professors';
import type { Program, Professor } from '../../lib/professors';

interface EditForm {
    email: string;
    full_name: string;
    username: string;
    program_id: string;
}

export function EditProfessor() {
    const navigate = useNavigate();
    const location = useLocation();
    const { id } = useParams<{ id: string }>();

    const [programs, setPrograms] = useState<Program[]>([]);
    const [editForm, setEditForm] = useState<EditForm>({ email: '', full_name: '', username: '', program_id: '' });
    const [originalEmail, setOriginalEmail] = useState('');

    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [formError, setFormError] = useState<string | null>(null);

    // Searchable dropdown state
    const [programSearch, setProgramSearch] = useState('');
    const [isProgramDropdownOpen, setIsProgramDropdownOpen] = useState(false);
    const programDropdownRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        async function loadData() {
            setFormError(null);

            // Fetch programs
            const fetchedPrograms = await fetchPrograms();
            setPrograms(fetchedPrograms);

            // Get professor details
            let professor = location.state?.professor as Professor | undefined;
            if (!professor && id) {
                const { data } = await fetchProfessors();
                professor = data.find(p => p.id === id);
            }

            if (!professor) {
                setFormError("Professor not found.");
                setIsLoading(false);
                return;
            }

            setEditForm({
                full_name: professor.full_name ?? '',
                username: professor.username ?? '',
                program_id: professor.program_id ?? '',
                email: professor.email ?? '',
            });
            setOriginalEmail(professor.email ?? '');
            setIsLoading(false);
        }

        loadData();
    }, [id, location.state]);

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (programDropdownRef.current && !programDropdownRef.current.contains(event.target as Node)) {
                setIsProgramDropdownOpen(false);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const filteredPrograms = useMemo(() => {
        if (!programSearch) return programs;
        const q = programSearch.toLowerCase();
        return programs.filter(p => p.code.toLowerCase().includes(q) || p.name.toLowerCase().includes(q));
    }, [programs, programSearch]);

    const selectedProgramText = useMemo(() => {
        if (!editForm.program_id) return 'No program selected';
        const prog = programs.find(p => p.id === editForm.program_id);
        return prog ? `${prog.code} — ${prog.name}` : 'Unknown';
    }, [editForm.program_id, programs]);

    async function handleEdit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        if (!id) return;
        setFormError(null);

        if (!editForm.full_name.trim()) { setFormError('Full name is required.'); return; }
        if (!editForm.email.trim()) { setFormError('Email address is required.'); return; }
        if (!editForm.username.trim()) { setFormError('Username is required.'); return; }
        if (!editForm.program_id) { setFormError('Program assignment is required.'); return; }

        const emailChanged = editForm.email.trim() !== originalEmail;

        setIsSubmitting(true);
        try {
            const { error } = await updateProfessor(id, {
                full_name: editForm.full_name,
                username: editForm.username,
                program_id: editForm.program_id,
                email: emailChanged ? editForm.email : undefined,
            });

            if (error) {
                setFormError(
                    /already registered|already exists|duplicate|email/i.test(error)
                        ? 'An account with this email already exists.'
                        : error
                );
                return;
            }
            navigate('/admin/professors', { state: { toastMessage: `Professor "${editForm.full_name}" has been updated.` } });
        } catch {
            setFormError('An unexpected error occurred. Please try again.');
        } finally {
            setIsSubmitting(false);
        }
    }

    const inputStyle: React.CSSProperties = {
        width: '100%', padding: '9px 12px', borderRadius: '8px',
        border: '1.5px solid var(--prof-border)', fontSize: '0.875rem',
        color: 'var(--prof-text-main)', outline: 'none', boxSizing: 'border-box',
        background: '#fff',
    };
    const labelStyle: React.CSSProperties = {
        display: 'block', fontSize: '0.8rem', fontWeight: 600,
        color: 'var(--prof-text-muted)', marginBottom: '5px',
    };

    if (isLoading) {
        return (
            <div className="subjects-container">
                <p style={{ color: 'var(--prof-text-muted)', textAlign: 'center', padding: '40px 0' }}>Loading professor details...</p>
            </div>
        );
    }

    return (
        <div className="subjects-container">
            <button className="btn-back" onClick={() => navigate('/admin/professors')}>
                <svg fill="none" strokeWidth="2" stroke="currentColor" viewBox="0 0 24 24" width="16" height="16">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
                </svg>
                Back to Professors
            </button>
            <div className="cs-header">
                <h2>Edit Professor</h2>
                <p>Update professor account details and assignment.</p>
            </div>

            <div className="cs-card" style={{ width: '100%' }}>
                <form onSubmit={handleEdit} style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
                    <div className="admin-form-grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: '16px' }}>
                        {/* Full Name */}
                        <div>
                            <label style={labelStyle}>Full Name</label>
                            <input type="text" required style={inputStyle} placeholder="e.g. John Mark Doe" value={editForm.full_name} onChange={e => setEditForm(f => ({ ...f, full_name: e.target.value }))} />
                        </div>

                        {/* Email */}
                        <div>
                            <label style={labelStyle}>Email Address</label>
                            <input type="email" required style={inputStyle} placeholder="professor@mcm.edu.ph" value={editForm.email} onChange={e => setEditForm(f => ({ ...f, email: e.target.value }))} />
                        </div>
                    </div>

                    <div>
                        <label style={labelStyle}>Username</label>
                        <input type="text" required style={inputStyle} placeholder="Username" value={editForm.username} onChange={e => setEditForm(f => ({ ...f, username: e.target.value }))} />
                    </div>

                    <div>
                        {/* Searchable Program Dropdown */}
                        <div ref={programDropdownRef} style={{ position: 'relative' }}>
                            <label style={labelStyle}>Program Assignment</label>
                            <div
                                style={{ ...inputStyle, cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                                onClick={() => { setIsProgramDropdownOpen(!isProgramDropdownOpen); setProgramSearch(''); }}
                            >
                                <span style={{ color: editForm.program_id ? 'inherit' : '#94a3b8', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{selectedProgramText}</span>
                                <svg fill="none" strokeWidth="2" stroke="currentColor" viewBox="0 0 24 24" width="16" height="16" style={{ color: '#64748b', flexShrink: 0 }}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                                </svg>
                            </div>

                            {isProgramDropdownOpen && (
                                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, marginTop: '4px', background: '#fff', border: '1px solid var(--prof-border)', borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', zIndex: 100, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                                    <div style={{ padding: '8px', borderBottom: '1px solid var(--prof-border)' }}>
                                        <input
                                            type="text"
                                            autoFocus
                                            placeholder="Search program..."
                                            style={{ ...inputStyle, padding: '6px 10px', fontSize: '0.8rem' }}
                                            value={programSearch}
                                            onChange={e => setProgramSearch(e.target.value)}
                                        />
                                    </div>
                                    <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
                                        {filteredPrograms.length > 0 ? filteredPrograms.map(p => (
                                            <div
                                                key={p.id}
                                                style={{ padding: '8px 12px', fontSize: '0.85rem', cursor: 'pointer', borderTop: '1px solid #f1f5f9', transition: 'background 0.1s', background: editForm.program_id === p.id ? '#f1f5f9' : 'transparent' }}
                                                onClick={() => { setEditForm(f => ({ ...f, program_id: p.id })); setIsProgramDropdownOpen(false); }}
                                                onMouseOver={e => e.currentTarget.style.background = '#f8fafc'}
                                                onMouseOut={e => e.currentTarget.style.background = editForm.program_id === p.id ? '#f1f5f9' : 'transparent'}
                                            >
                                                <strong style={{ color: 'var(--prof-text-main)' }}>{p.code}</strong> <span style={{ color: 'var(--prof-text-muted)' }}>— {p.name}</span>
                                            </div>
                                        )) : (
                                            <div style={{ padding: '12px', fontSize: '0.85rem', color: '#94a3b8', textAlign: 'center', fontStyle: 'italic' }}>
                                                No programs found.
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    {formError && (
                        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '10px 14px', fontSize: '0.85rem', color: '#991b1b', marginTop: '4px' }}>
                            {formError}
                        </div>
                    )}

                    <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: '12px', marginTop: '8px', borderTop: '1px solid var(--prof-border)' }}>
                        <button type="submit" className="btn-primary" style={{ minWidth: '160px' }} disabled={isSubmitting}>
                            {isSubmitting ? 'Saving...' : 'Save Changes'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
