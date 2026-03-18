import { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';

const passwordRules = [
    { test: (p: string) => p.length >= 8, label: 'At least 8 characters' },
    { test: (p: string) => /[A-Z]/.test(p), label: 'At least one uppercase letter' },
    { test: (p: string) => /[0-9]/.test(p), label: 'At least one number' },
    { test: (p: string) => /[^A-Za-z0-9]/.test(p), label: 'At least one symbol' },
];

export function Settings() {
    const { profile } = useAuth();

    const [oldPassword, setOldPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showOld, setShowOld] = useState(false);
    const [showNew, setShowNew] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [formError, setFormError] = useState<string | null>(null);
    const [isSuccess, setIsSuccess] = useState(false);

    async function handleChangePassword(e: React.FormEvent) {
        e.preventDefault();
        setFormError(null);
        setIsSuccess(false);

        const allPass = passwordRules.every(r => r.test(newPassword));
        if (!allPass) {
            setFormError('New password does not meet all strength requirements.');
            return;
        }
        if (newPassword !== confirmPassword) {
            setFormError('New password and confirm password do not match.');
            return;
        }
        if (!profile?.email) {
            setFormError('Could not verify your identity. Please sign out and sign in again.');
            return;
        }

        setIsSubmitting(true);

        const { error: verifyErr } = await supabase.auth.signInWithPassword({
            email: profile.email,
            password: oldPassword,
        });
        if (verifyErr) {
            setIsSubmitting(false);
            setFormError('Current password is incorrect.');
            return;
        }

        const { error: updateErr } = await supabase.auth.updateUser({ password: newPassword });
        setIsSubmitting(false);
        if (updateErr) {
            setFormError(updateErr.message);
            return;
        }

        setOldPassword('');
        setNewPassword('');
        setConfirmPassword('');
        setIsSuccess(true);
    }

    const EyeIcon = () => (
        <svg fill="none" strokeWidth="2" stroke="currentColor" viewBox="0 0 24 24" width="17" height="17">
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
    );

    const EyeOffIcon = () => (
        <svg fill="none" strokeWidth="2" stroke="currentColor" viewBox="0 0 24 24" width="17" height="17">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
        </svg>
    );

    return (
        <div className="settings-container">
            <div className="cs-header">
                <h2>Settings</h2>
                <p>Manage your account preferences and security.</p>
            </div>

            <div className="settings-sections">

                {/* ── Change Password Card ── */}
                <div className="cs-card">
                    <div className="settings-section-heading">
                        <div className="settings-section-icon">
                            <svg fill="none" strokeWidth="1.5" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
                            </svg>
                        </div>
                        <div>
                            <h3 className="settings-section-title">Change Password</h3>
                            <p className="settings-section-desc">Update your account password. You will need your current password to confirm.</p>
                        </div>
                    </div>

                    {isSuccess ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '16px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '10px', marginTop: '4px' }}>
                            <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: '#dcfce7', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                <svg fill="none" strokeWidth="2.5" stroke="#16a34a" viewBox="0 0 24 24" width="18" height="18">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                </svg>
                            </div>
                            <div>
                                <p style={{ margin: 0, fontWeight: 600, fontSize: '0.9rem', color: '#15803d' }}>Password changed successfully!</p>
                                <p style={{ margin: '2px 0 0', fontSize: '0.825rem', color: '#166534' }}>Your new password is now active.</p>
                            </div>
                            <button
                                className="btn-secondary"
                                style={{ marginLeft: 'auto', fontSize: '0.82rem', padding: '6px 14px', flexShrink: 0 }}
                                onClick={() => setIsSuccess(false)}
                            >
                                Change again
                            </button>
                        </div>
                    ) : (
                        <form onSubmit={handleChangePassword} className="settings-ay-edit">
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

                                {/* Current Password */}
                                <div className="cs-input-field">
                                    <label>Current Password</label>
                                    <div style={{ position: 'relative' }}>
                                        <input
                                            type={showOld ? 'text' : 'password'}
                                            value={oldPassword}
                                            onChange={e => setOldPassword(e.target.value)}
                                            required
                                            placeholder="Enter your current password"
                                            style={{ paddingRight: '40px' }}
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setShowOld(v => !v)}
                                            style={{ position: 'absolute', right: '11px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--prof-text-muted)', padding: 0, display: 'flex' }}
                                        >
                                            {showOld ? <EyeOffIcon /> : <EyeIcon />}
                                        </button>
                                    </div>
                                </div>

                                {/* New Password */}
                                <div className="cs-input-field">
                                    <label>New Password</label>
                                    <div style={{ position: 'relative' }}>
                                        <input
                                            type={showNew ? 'text' : 'password'}
                                            value={newPassword}
                                            onChange={e => setNewPassword(e.target.value)}
                                            required
                                            placeholder="Enter your new password"
                                            style={{ paddingRight: '40px' }}
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setShowNew(v => !v)}
                                            style={{ position: 'absolute', right: '11px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--prof-text-muted)', padding: 0, display: 'flex' }}
                                        >
                                            {showNew ? <EyeOffIcon /> : <EyeIcon />}
                                        </button>
                                    </div>
                                    {newPassword.length > 0 && (
                                        <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '5px' }}>
                                            {passwordRules.map(rule => {
                                                const pass = rule.test(newPassword);
                                                return (
                                                    <div key={rule.label} style={{ display: 'flex', alignItems: 'center', gap: '7px', fontSize: '0.8rem', color: pass ? '#16a34a' : '#94a3b8' }}>
                                                        <svg fill="none" strokeWidth="2.5" stroke="currentColor" viewBox="0 0 24 24" width="13" height="13">
                                                            {pass
                                                                ? <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                                                : <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />}
                                                        </svg>
                                                        {rule.label}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>

                                {/* Confirm Password */}
                                <div className="cs-input-field">
                                    <label>Confirm New Password</label>
                                    <div style={{ position: 'relative' }}>
                                        <input
                                            type={showConfirm ? 'text' : 'password'}
                                            value={confirmPassword}
                                            onChange={e => setConfirmPassword(e.target.value)}
                                            required
                                            placeholder="Re-enter your new password"
                                            style={{ paddingRight: '40px' }}
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setShowConfirm(v => !v)}
                                            style={{ position: 'absolute', right: '11px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--prof-text-muted)', padding: 0, display: 'flex' }}
                                        >
                                            {showConfirm ? <EyeOffIcon /> : <EyeIcon />}
                                        </button>
                                    </div>
                                    {confirmPassword.length > 0 && newPassword !== confirmPassword && (
                                        <p className="cs-error" style={{ marginTop: '5px', marginBottom: 0 }}>Passwords do not match.</p>
                                    )}
                                </div>
                            </div>

                            {formError && (
                                <p className="cs-error" style={{ marginTop: '4px', marginBottom: 0 }}>{formError}</p>
                            )}

                            <div className="settings-actions">
                                <button type="submit" className="btn-primary" disabled={isSubmitting}>
                                    {isSubmitting ? 'Updating...' : 'Update Password'}
                                </button>
                            </div>
                        </form>
                    )}
                </div>

            </div>
        </div>
    );
}
