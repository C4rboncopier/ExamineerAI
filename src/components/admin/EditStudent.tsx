import { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { updateStudent } from '../../lib/students';
import type { Student } from '../../lib/students';
import { fetchPrograms } from '../../lib/professors';
import type { Program } from '../../lib/professors';

interface EditForm {
    email: string;
    full_name: string;
    username: string;
    student_id: string;
    program_id: string;
}

export function EditStudent() {
    const navigate = useNavigate();
    const location = useLocation();
    const student = location.state?.student as Student | undefined;

    const [programs, setPrograms] = useState<Program[]>([]);
    const [form, setForm] = useState<EditForm>({
        email: student?.email ?? '',
        full_name: student?.full_name ?? '',
        username: student?.username ?? '',
        student_id: student?.student_id ?? '',
        program_id: student?.program_id ?? '',
    });
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [formError, setFormError] = useState<string | null>(null);

    // Searchable dropdown state
    const [programSearch, setProgramSearch] = useState('');
    const [isProgramDropdownOpen, setIsProgramDropdownOpen] = useState(false);
    const programDropdownRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!student) navigate('/admin/students');
    }, [student, navigate]);

    useEffect(() => {
        fetchPrograms().then(setPrograms);
    }, []);

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
        if (!form.program_id) return 'No program selected';
        const prog = programs.find(p => p.id === form.program_id);
        return prog ? `${prog.code} — ${prog.name}` : 'Unknown';
    }, [form.program_id, programs]);

    async function handleSave(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        setFormError(null);
        if (!form.full_name.trim()) { setFormError('Full name is required.'); return; }
        if (!form.email.trim()) { setFormError('Email address is required.'); return; }
        if (!form.username.trim()) { setFormError('Username is required.'); return; }
        if (!form.program_id) { setFormError('Program assignment is required.'); return; }
        if (!student) return;
        setIsSubmitting(true);
        try {
            const { error } = await updateStudent(student.id, {
                full_name: form.full_name,
                email: form.email,
                username: form.username,
                student_id: form.student_id || null,
                program_id: form.program_id,
            });
            if (error) { setFormError(error); return; }
            navigate('/admin/students', { state: { toastMessage: `Student "${form.full_name}" updated successfully.` } });
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

    return (
        <div className="subjects-container">
            <button className="btn-back" onClick={() => navigate('/admin/students')}>
                <svg fill="none" strokeWidth="2" stroke="currentColor" viewBox="0 0 24 24" width="16" height="16">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
                </svg>
                Back to Students
            </button>
            <div className="cs-header">
                <h2>Edit Student</h2>
                <p>Update the student's account information.</p>
            </div>

            <div className="cs-card" style={{ width: '100%' }}>
                <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
                    <div className="admin-form-grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: '16px' }}>
                        {/* Full Name */}
                        <div>
                            <label style={labelStyle}>Full Complete Name</label>
                            <input
                                type="text"
                                required
                                style={inputStyle}
                                placeholder="e.g. John Mark Doe"
                                value={form.full_name}
                                onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))}
                            />
                        </div>

                        {/* Email */}
                        <div>
                            <label style={labelStyle}>Email Address</label>
                            <input
                                type="email"
                                required
                                style={inputStyle}
                                placeholder="student@email.com"
                                value={form.email}
                                onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                            />
                        </div>
                    </div>

                    <div className="admin-form-grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: '16px' }}>
                        {/* Username */}
                        <div>
                            <label style={labelStyle}>Username</label>
                            <input
                                type="text"
                                required
                                style={inputStyle}
                                placeholder="e.g. jmDoe"
                                value={form.username}
                                onChange={e => setForm(f => ({ ...f, username: e.target.value }))}
                            />
                        </div>

                        {/* Student ID */}
                        <div>
                            <label style={labelStyle}>Student ID <span style={{ fontWeight: 400, color: '#94a3b8' }}>(optional)</span></label>
                            <input
                                type="text"
                                style={inputStyle}
                                placeholder="e.g. 2021-00123"
                                value={form.student_id}
                                onChange={e => setForm(f => ({ ...f, student_id: e.target.value }))}
                            />
                        </div>
                    </div>

                    <div>
                        {/* Searchable Program Dropdown */}
                        <div ref={programDropdownRef} style={{ position: 'relative' }}>
                            <label style={labelStyle}>Program Assignment</label>
                            <div
                                style={{ ...inputStyle, cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                                onClick={() => { setIsProgramDropdownOpen(!isProgramDropdownOpen); setProgramSearch(''); }}
                            >
                                <span style={{ color: form.program_id ? 'inherit' : '#94a3b8', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{selectedProgramText}</span>
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
                                                style={{ padding: '8px 12px', fontSize: '0.85rem', cursor: 'pointer', borderTop: '1px solid #f1f5f9', transition: 'background 0.1s', background: form.program_id === p.id ? '#f1f5f9' : 'transparent' }}
                                                onClick={() => { setForm(f => ({ ...f, program_id: p.id })); setIsProgramDropdownOpen(false); }}
                                                onMouseOver={e => e.currentTarget.style.background = '#f8fafc'}
                                                onMouseOut={e => e.currentTarget.style.background = form.program_id === p.id ? '#f1f5f9' : 'transparent'}
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
