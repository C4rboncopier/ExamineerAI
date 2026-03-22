import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import '../App.css';

type Stage = 'loading' | 'form' | 'success' | 'invalid';

function EyeIcon({ open }: { open: boolean }) {
  return open ? (
    <svg fill="none" strokeWidth="2" stroke="currentColor" viewBox="0 0 24 24" width="18" height="18">
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  ) : (
    <svg fill="none" strokeWidth="2" stroke="currentColor" viewBox="0 0 24 24" width="18" height="18">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
    </svg>
  );
}

function CheckItem({ met, label }: { met: boolean; label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
      <div style={{
        width: '16px', height: '16px', borderRadius: '50%', flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: met ? '#dcfce7' : 'transparent',
        border: met ? '1.5px solid #86efac' : '1.5px solid #94a3b8',
        transition: 'all 0.15s',
      }}>
        {met && (
          <svg fill="none" strokeWidth="3" stroke="#15803d" viewBox="0 0 24 24" width="10" height="10">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
          </svg>
        )}
      </div>
      <span style={{ fontSize: '0.78rem', color: met ? '#15803d' : '#94a3b8', transition: 'color 0.15s' }}>{label}</span>
    </div>
  );
}

export function ResetPassword() {
  const navigate = useNavigate();
  const [stage, setStage] = useState<Stage>('loading');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const checks = {
    length: password.length >= 8,
    upper: /[A-Z]/.test(password),
    number: /[0-9]/.test(password),
    special: /[^A-Za-z0-9]/.test(password),
  };
  const allChecksMet = Object.values(checks).every(Boolean);

  useEffect(() => {
    // Flow 1: token_hash in query params (from custom Resend email)
    const searchParams = new URLSearchParams(window.location.search);
    const tokenHash = searchParams.get('token_hash');
    const type = searchParams.get('type');

    if (tokenHash && type === 'recovery') {
      supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'recovery' })
        .then(({ error }) => {
          if (error) setStage('invalid');
          else setStage('form');
        });
      return;
    }

    // Flow 2: access_token in URL hash (from Supabase default email)
    const hash = window.location.hash.substring(1);
    const hashParams = new URLSearchParams(hash);
    const accessToken = hashParams.get('access_token');
    const refreshToken = hashParams.get('refresh_token');
    const hashType = hashParams.get('type');

    if (hashType === 'recovery' && accessToken && refreshToken) {
      supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken })
        .then(({ error }) => {
          if (error) setStage('invalid');
          else setStage('form');
        });
    } else {
      setStage('invalid');
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!allChecksMet) { setError('Please meet all password requirements.'); return; }
    if (password !== confirmPassword) { setError('Passwords do not match.'); return; }

    setIsSubmitting(true);
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      setError(error.message);
      setIsSubmitting(false);
    } else {
      await supabase.auth.signOut();
      setStage('success');
    }
  };

  const toggleBtnStyle: React.CSSProperties = {
    position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)',
    background: 'none', border: 'none', cursor: 'pointer', padding: '4px',
    color: '#94a3b8', display: 'flex', alignItems: 'center',
  };

  return (
    <div className="login-container">
      <div className="login-left">
        <div className="left-content">
          <img src="https://placehold.co/200x60/0f2554/FFF?text=Examineer+AI" alt="Examineer AI Logo" className="logo" />
          <h1 className="brand-title">Examineer AI</h1>
          <p className="brand-subtitle">Empowering your exams with artificial intelligence.</p>
        </div>
      </div>
      <div className="login-right">
        <div className="login-card">
          <div className="mobile-logo-container">
            <img src="https://placehold.co/200x60/0f2554/FFF?text=Examineer+AI" alt="Examineer AI Logo" className="mobile-logo" />
          </div>

          {stage === 'loading' && (
            <div style={{ textAlign: 'center', padding: '32px 0' }}>
              <p style={{ color: '#6b7280', fontSize: '0.9375rem' }}>Verifying reset link...</p>
            </div>
          )}

          {stage === 'invalid' && (
            <div style={{ textAlign: 'center', padding: '16px 0' }}>
              <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: '#fee2e2', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                <svg fill="none" strokeWidth="2.5" stroke="#b91c1c" viewBox="0 0 24 24" width="24" height="24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>
              <h2 className="login-title" style={{ marginBottom: '8px' }}>Invalid Reset Link</h2>
              <p style={{ color: '#6b7280', fontSize: '0.875rem', marginBottom: '24px', lineHeight: 1.5 }}>
                This password reset link is invalid or has expired. Please request a new one.
              </p>
              <button type="button" className="login-button" onClick={() => navigate('/login')}>
                Back to Login
              </button>
            </div>
          )}

          {stage === 'form' && (
            <>
              <h2 className="login-title">Set New Password</h2>
              <p className="login-description">Choose a strong new password for your account.</p>

              <form className="login-form" onSubmit={handleSubmit}>
                <div className="form-group">
                  <label htmlFor="new-password">New Password</label>
                  <div style={{ position: 'relative' }}>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      id="new-password"
                      placeholder="••••••••"
                      required
                      autoFocus
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      disabled={isSubmitting}
                      style={{ paddingRight: '40px', width: '100%', boxSizing: 'border-box' }}
                    />
                    <button type="button" style={toggleBtnStyle} onClick={() => setShowPassword(v => !v)} tabIndex={-1}>
                      <EyeIcon open={showPassword} />
                    </button>
                  </div>

                  {/* Requirements checklist — shown once user starts typing */}
                  {password.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', marginTop: '10px', padding: '10px 12px', background: 'rgba(255,255,255,0.05)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)' }}>
                      <CheckItem met={checks.length} label="At least 8 characters" />
                      <CheckItem met={checks.upper} label="One uppercase letter" />
                      <CheckItem met={checks.number} label="One number" />
                      <CheckItem met={checks.special} label="One special character" />
                    </div>
                  )}
                </div>

                <div className="form-group">
                  <label htmlFor="confirm-password">Confirm Password</label>
                  <div style={{ position: 'relative' }}>
                    <input
                      type={showConfirm ? 'text' : 'password'}
                      id="confirm-password"
                      placeholder="••••••••"
                      required
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      disabled={isSubmitting}
                      style={{ paddingRight: '40px', width: '100%', boxSizing: 'border-box' }}
                    />
                    <button type="button" style={toggleBtnStyle} onClick={() => setShowConfirm(v => !v)} tabIndex={-1}>
                      <EyeIcon open={showConfirm} />
                    </button>
                  </div>
                </div>

                {error && <p className="login-error">{error}</p>}

                <button type="submit" className="login-button" disabled={isSubmitting}>
                  {isSubmitting ? 'Updating...' : 'Update Password'}
                </button>
              </form>
            </>
          )}

          {stage === 'success' && (
            <div style={{ textAlign: 'center', padding: '16px 0' }}>
              <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: '#dcfce7', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                <svg fill="none" strokeWidth="2.5" stroke="#15803d" viewBox="0 0 24 24" width="24" height="24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
              </div>
              <h2 className="login-title" style={{ marginBottom: '8px' }}>Password Updated</h2>
              <p style={{ color: '#6b7280', fontSize: '0.875rem', marginBottom: '24px', lineHeight: 1.5 }}>
                Your password has been updated successfully. You can now sign in with your new password.
              </p>
              <button type="button" className="login-button" onClick={() => navigate('/login')}>
                Go to Login
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
