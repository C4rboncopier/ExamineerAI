import { useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';

interface AccountProfile {
    id: string;
    full_name: string | null;
    email: string | null;
    username: string | null;
    role: string;
    student_id: string | null;
    program_id: string | null;
    program: { id: string; code: string; name: string } | null;
    created_at: string;
}

function getInitials(name: string | null | undefined): string {
    if (!name) return '?';
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0][0].toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
    });
}

const roleLabel: Record<string, string> = {
    admin: 'Administrator',
    professor: 'Professor',
    student: 'Student',
};

const roleBadgeStyle: Record<string, React.CSSProperties> = {
    admin: { background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca' },
    professor: { background: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe' },
    student: { background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0' },
};

export function Account() {
    const { profile: authProfile } = useAuth();
    const [accountData, setAccountData] = useState<AccountProfile | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        if (!authProfile) return;
        async function load() {
            setIsLoading(true);
            const { data } = await supabase
                .from('profiles')
                .select('id, full_name, email, username, role, student_id, program_id, created_at, program:programs(id, code, name)')
                .eq('id', authProfile!.id)
                .single();
            setAccountData((data as unknown as AccountProfile) ?? null);
            setIsLoading(false);
        }
        load();
    }, [authProfile]);

    const data = accountData ?? authProfile;
    const role = data?.role ?? '';
    const initials = getInitials(data?.full_name);
    const badgeStyle = roleBadgeStyle[role] ?? {};

    const infoRows: { label: string; value: string | null | undefined }[] = [
        { label: 'Full Name', value: data?.full_name },
        { label: 'Email', value: data?.email },
        { label: 'Username', value: 'username' in (data ?? {}) ? (data as AccountProfile)?.username : (authProfile?.username ?? null) },
        { label: 'Role', value: roleLabel[role] ?? role },
    ];

    if ((role === 'professor' || role === 'student') && accountData?.program) {
        infoRows.push({ label: 'Program', value: `${accountData.program.code} — ${accountData.program.name}` });
    }

    if (role === 'student' && accountData?.student_id) {
        infoRows.push({ label: 'Student ID', value: accountData.student_id });
    }

    if (data?.created_at) {
        infoRows.push({ label: 'Member Since', value: formatDate(data.created_at) });
    }

    return (
        <div className="settings-container">
            <div className="cs-header">
                <h2>Account</h2>
                <p>Your profile information and account details.</p>
            </div>

            <div className="settings-sections">
                <div className="cs-card">
                    <div className="settings-section-heading">
                        <div className="settings-section-icon">
                            <svg fill="none" strokeWidth="1.5" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M17.982 18.725A7.488 7.488 0 0012 15.75a7.488 7.488 0 00-5.982 2.975m11.963 0a9 9 0 10-11.963 0m11.963 0A8.966 8.966 0 0112 21a8.966 8.966 0 01-5.982-2.275M15 9.75a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                        </div>
                        <div>
                            <h3 className="settings-section-title">Profile Information</h3>
                            <p className="settings-section-desc">Your account details as registered in the system.</p>
                        </div>
                    </div>

                    {isLoading ? (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 0', color: 'var(--prof-text-muted)', fontSize: '0.9rem', gap: '10px' }}>
                            <svg style={{ animation: 'spin 1s linear infinite' }} fill="none" strokeWidth="2" stroke="currentColor" viewBox="0 0 24 24" width="18" height="18">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                            </svg>
                            Loading...
                        </div>
                    ) : (
                        <div style={{ marginTop: '20px', display: 'flex', flexDirection: 'column', gap: '0' }}>
                            {/* Avatar */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '24px' }}>
                                <div style={{
                                    width: '64px', height: '64px', borderRadius: '50%',
                                    background: 'var(--prof-primary, #2563eb)', color: '#fff',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    fontSize: '1.5rem', fontWeight: 700, flexShrink: 0, letterSpacing: '0.02em',
                                }}>
                                    {initials}
                                </div>
                                <div>
                                    <p style={{ margin: 0, fontWeight: 600, fontSize: '1.05rem', color: 'var(--prof-text-main)' }}>
                                        {data?.full_name || data?.email || 'User'}
                                    </p>
                                    <span style={{ display: 'inline-block', marginTop: '5px', fontSize: '0.75rem', fontWeight: 600, padding: '2px 10px', borderRadius: '20px', ...badgeStyle }}>
                                        {roleLabel[role] ?? role}
                                    </span>
                                </div>
                            </div>

                            {/* Info rows */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0', borderTop: '1px solid var(--prof-border)' }}>
                                {infoRows.map((row, i) => (
                                    <div key={row.label} style={{
                                        display: 'flex', alignItems: 'flex-start', gap: '12px',
                                        padding: '14px 0',
                                        borderBottom: i < infoRows.length - 1 ? '1px solid var(--prof-border)' : 'none',
                                    }}>
                                        <span style={{ minWidth: '120px', fontSize: '0.82rem', fontWeight: 600, color: 'var(--prof-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', paddingTop: '2px' }}>
                                            {row.label}
                                        </span>
                                        <span style={{ fontSize: '0.9rem', color: 'var(--prof-text-main)', overflowWrap: 'break-word', minWidth: 0 }}>
                                            {row.value || <span style={{ color: 'var(--prof-text-muted)', fontStyle: 'italic' }}>Not set</span>}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
