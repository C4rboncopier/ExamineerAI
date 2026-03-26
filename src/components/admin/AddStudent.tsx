import { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { createStudent } from '../../lib/students';
import { fetchPrograms } from '../../lib/professors';
import type { Program } from '../../lib/professors';

function capitalizeWords(str: string): string {
    return str.trim().split(/\s+/).filter(Boolean).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
}

function generateUsername(firstName: string, lastName: string): string {
    const firstParts = firstName.trim().split(/\s+/).filter(Boolean);
    const lastParts = lastName.trim().split(/\s+/).filter(Boolean);
    if (firstParts.length === 0 && lastParts.length === 0) return '';
    const initials = firstParts.map(p => p[0].toLowerCase()).join('');
    if (lastParts.length === 0) return initials;
    const lastJoined = lastParts.join('');
    const lastFormatted = lastJoined.charAt(0).toUpperCase() + lastJoined.slice(1).toLowerCase();
    return initials + lastFormatted;
}

function generateRandomPassword(): string {
    const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
    const lower = 'abcdefghijkmnpqrstuvwxyz';
    const digits = '23456789';
    const special = '!@#$';
    const all = upper + lower + digits + special;
    let pw = upper[Math.floor(Math.random() * upper.length)]
           + lower[Math.floor(Math.random() * lower.length)]
           + digits[Math.floor(Math.random() * digits.length)]
           + special[Math.floor(Math.random() * special.length)];
    for (let i = 0; i < 8; i++) pw += all[Math.floor(Math.random() * all.length)];
    return pw.split('').sort(() => Math.random() - 0.5).join('');
}

interface AddForm {
    email: string;
    first_name: string;
    last_name: string;
    username: string;
    student_id: string;
    program_id: string;
    password: string;
}

export function AddStudent() {
    const navigate = useNavigate();
    const [programs, setPrograms] = useState<Program[]>([]);
    const [addForm, setAddForm] = useState<AddForm>({ email: '', first_name: '', last_name: '', username: '', student_id: '', program_id: '', password: '' });
    const [showPassword, setShowPassword] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [formError, setFormError] = useState<string | null>(null);

    // Searchable dropdown state
    const [programSearch, setProgramSearch] = useState('');
    const [isProgramDropdownOpen, setIsProgramDropdownOpen] = useState(false);
    const programDropdownRef = useRef<HTMLDivElement>(null);

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
        if (!addForm.program_id) return 'No program selected';
        const prog = programs.find(p => p.id === addForm.program_id);
        return prog ? `${prog.code} — ${prog.name}` : 'Unknown';
    }, [addForm.program_id, programs]);

    function handleNameChange(field: 'first_name' | 'last_name', val: string) {
        setAddForm(f => {
            const updated = { ...f, [field]: val };
            return { ...updated, username: generateUsername(updated.first_name, updated.last_name) };
        });
    }

    async function handleAdd(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        setFormError(null);
        if (!addForm.first_name.trim()) { setFormError('First name is required.'); return; }
        if (!addForm.last_name.trim()) { setFormError('Last name is required.'); return; }
        if (!addForm.email.trim()) { setFormError('Email address is required.'); return; }
        if (!addForm.username.trim()) { setFormError('Username is required.'); return; }
        if (!addForm.password.trim()) { setFormError('Password is required.'); return; }
        if (addForm.password.trim().length < 8) { setFormError('Password must be at least 8 characters.'); return; }
        if (!addForm.program_id) { setFormError('Program assignment is required.'); return; }
        const firstName = capitalizeWords(addForm.first_name);
        const lastName = capitalizeWords(addForm.last_name);
        const fullName = `${firstName} ${lastName}`;
        setIsSubmitting(true);
        try {
            const { error, emailError } = await createStudent({
                email: addForm.email,
                first_name: firstName,
                last_name: lastName,
                username: addForm.username,
                password: addForm.password,
                program_id: addForm.program_id,
                student_id: addForm.student_id || null,
            });
            if (error) { setFormError(error); return; }
            const toastMessage = emailError
                ? `Student "${fullName}" added, but email failed: ${emailError}`
                : `Student "${fullName}" added and notified by email.`;
            navigate('/admin/students', { state: { toastMessage } });
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
                <h2>Add New Student</h2>
                <p>Create a student account and optionally notify them by email.</p>
            </div>

            <div className="cs-card" style={{ width: '100%' }}>
                <form onSubmit={handleAdd} style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
                    <div className="admin-form-grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: '16px' }}>
                        {/* First Name */}
                        <div>
                            <label style={labelStyle}>First Name</label>
                            <input type="text" required style={inputStyle} placeholder="e.g. John Mark" value={addForm.first_name} onChange={e => handleNameChange('first_name', e.target.value)} />
                        </div>

                        {/* Last Name */}
                        <div>
                            <label style={labelStyle}>Last Name</label>
                            <input type="text" required style={inputStyle} placeholder="e.g. Doe" value={addForm.last_name} onChange={e => handleNameChange('last_name', e.target.value)} />
                        </div>
                    </div>

                    <div className="admin-form-grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: '16px' }}>
                        {/* Email */}
                        <div>
                            <label style={labelStyle}>Email Address</label>
                            <input type="email" required style={inputStyle} placeholder="student@email.com" value={addForm.email} onChange={e => setAddForm(f => ({ ...f, email: e.target.value }))} />
                        </div>
                    </div>

                    <div className="admin-form-grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: '16px' }}>
                        {/* Username */}
                        <div>
                            <label style={labelStyle}>
                                Username <span style={{ fontWeight: 400, color: '#94a3b8' }}>(auto-generated, editable)</span>
                            </label>
                            <input type="text" required style={inputStyle} placeholder="e.g. jmDoe" value={addForm.username} onChange={e => setAddForm(f => ({ ...f, username: e.target.value }))} />
                        </div>

                        {/* Student ID */}
                        <div>
                            <label style={labelStyle}>Student ID <span style={{ fontWeight: 400, color: '#94a3b8' }}>(optional)</span></label>
                            <input type="text" style={inputStyle} placeholder="e.g. 2021-00123" value={addForm.student_id} onChange={e => setAddForm(f => ({ ...f, student_id: e.target.value }))} />
                        </div>
                    </div>

                    <div className="admin-form-grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: '16px' }}>
                        {/* Password */}
                        <div>
                            <label style={labelStyle}>Temporary Password</label>
                            <div style={{ position: 'relative' }}>
                                <input
                                    type={showPassword ? 'text' : 'password'}
                                    required
                                    style={{ ...inputStyle, paddingRight: '40px' }}
                                    placeholder="Set a password"
                                    value={addForm.password}
                                    onChange={e => setAddForm(f => ({ ...f, password: e.target.value }))}
                                />
                                <button type="button" onClick={() => setShowPassword(v => !v)} style={{ position: 'absolute', right: '11px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--prof-text-muted)', padding: 0, display: 'flex' }}>
                                    {showPassword ? (
                                        <svg fill="none" strokeWidth="2" stroke="currentColor" viewBox="0 0 24 24" width="17" height="17"><path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" /></svg>
                                    ) : (
                                        <svg fill="none" strokeWidth="2" stroke="currentColor" viewBox="0 0 24 24" width="17" height="17"><path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                                    )}
                                </button>
                            </div>
                            <button
                                type="button"
                                onClick={() => { setAddForm(f => ({ ...f, password: generateRandomPassword() })); setShowPassword(true); }}
                                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--prof-primary)'; (e.currentTarget as HTMLButtonElement).style.color = '#fff'; }}
                                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--prof-primary)'; }}
                                style={{
                                    display: 'inline-flex', alignItems: 'center', gap: '5px',
                                    marginTop: '6px', padding: '5px 10px', borderRadius: '6px',
                                    border: '1.5px solid var(--prof-primary)', background: 'transparent',
                                    color: 'var(--prof-primary)', fontSize: '0.75rem', fontWeight: 600,
                                    cursor: 'pointer', transition: 'background 0.15s, color 0.15s', lineHeight: 1.2,
                                }}
                            >
                                <svg fill="none" strokeWidth="2" stroke="currentColor" viewBox="0 0 24 24" width="12" height="12">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
                                </svg>
                                Generate password
                            </button>
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
                                <span style={{ color: addForm.program_id ? 'inherit' : '#94a3b8', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{selectedProgramText}</span>
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
                                        <div
                                            style={{ padding: '8px 12px', fontSize: '0.85rem', cursor: 'pointer', transition: 'background 0.1s', background: addForm.program_id === '' ? '#f1f5f9' : 'transparent' }}
                                            onClick={() => { setAddForm(f => ({ ...f, program_id: '' })); setIsProgramDropdownOpen(false); }}
                                            onMouseOver={e => e.currentTarget.style.background = '#f8fafc'}
                                            onMouseOut={e => e.currentTarget.style.background = addForm.program_id === '' ? '#f1f5f9' : 'transparent'}
                                        >
                                            No program selected
                                        </div>
                                        {filteredPrograms.length > 0 ? filteredPrograms.map(p => (
                                            <div
                                                key={p.id}
                                                style={{ padding: '8px 12px', fontSize: '0.85rem', cursor: 'pointer', borderTop: '1px solid #f1f5f9', transition: 'background 0.1s', background: addForm.program_id === p.id ? '#f1f5f9' : 'transparent' }}
                                                onClick={() => { setAddForm(f => ({ ...f, program_id: p.id })); setIsProgramDropdownOpen(false); }}
                                                onMouseOver={e => e.currentTarget.style.background = '#f8fafc'}
                                                onMouseOut={e => e.currentTarget.style.background = addForm.program_id === p.id ? '#f1f5f9' : 'transparent'}
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
                            {isSubmitting ? 'Adding...' : 'Save Student'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
