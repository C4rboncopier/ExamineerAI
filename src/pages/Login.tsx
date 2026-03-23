import { useState } from 'react';
import type { FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import '../App.css';

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

export function Login() {
  const { user, isLoading, signIn } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Forgot password modal state
  const [showForgotModal, setShowForgotModal] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotStatus, setForgotStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [forgotError, setForgotError] = useState<string | null>(null);

  if (!isLoading && user) {
    return <Navigate to="/dashboard" replace />;
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    const result = await signIn(username, password);

    if (result.error) {
      setError(result.error);
      setIsSubmitting(false);
    }
  };

  const handleForgotSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!forgotEmail.trim()) return;
    setForgotStatus('sending');
    setForgotError(null);

    const { error } = await supabase.auth.resetPasswordForEmail(forgotEmail.trim(), {
      redirectTo: `${window.location.origin}/reset-password`,
    });

    if (error) {
      setForgotStatus('error');
      setForgotError(error.message);
    } else {
      setForgotStatus('sent');
    }
  };

  const closeForgotModal = () => {
    setShowForgotModal(false);
    setForgotEmail('');
    setForgotStatus('idle');
    setForgotError(null);
  };

  return (
    <div className="login-container">
      <div className="login-left">
        <div className="left-content">
          <img src="/logo.png" alt="Examineer AI Logo" className="logo" />
          <h1 className="brand-title"><span>Examineer</span><span className="brand-ai">AI</span></h1>
          <p className="brand-subtitle">Empowering your exams with artificial intelligence.</p>
          <div className="brand-divider" />
          <ul className="brand-features">
            <li>
              <span className="feat-check">
                <svg fill="none" strokeWidth="2.5" stroke="currentColor" viewBox="0 0 24 24" width="11" height="11"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
              </span>
              AI-powered exam question analysis
            </li>
            <li>
              <span className="feat-check">
                <svg fill="none" strokeWidth="2.5" stroke="currentColor" viewBox="0 0 24 24" width="11" height="11"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
              </span>
              Automated OMR sheet scanning &amp; grading
            </li>
            <li>
              <span className="feat-check">
                <svg fill="none" strokeWidth="2.5" stroke="currentColor" viewBox="0 0 24 24" width="11" height="11"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
              </span>
              Real-time student performance insights
            </li>
          </ul>
        </div>
      </div>
      <div className="login-right">
        <div className="login-card">
          <div className="mobile-logo-container">
            <img src="/logo_with_text.png" alt="Examineer AI Logo" className="mobile-logo" />
          </div>
          <h2 className="login-title">Welcome Back</h2>
          <p className="login-description">Please enter your details to sign in.</p>

          <form className="login-form" onSubmit={handleSubmit}>
            <div className="form-group">
              <label htmlFor="username">Username</label>
              <input
                type="text"
                id="username"
                placeholder="Enter your username"
                required
                autoFocus
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                disabled={isSubmitting}
              />
            </div>

            <div className="form-group">
              <label htmlFor="password">Password</label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showPassword ? 'text' : 'password'}
                  id="password"
                  placeholder="••••••••"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={isSubmitting}
                  style={{ paddingRight: '40px', width: '100%', boxSizing: 'border-box' }}
                />
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => setShowPassword(v => !v)}
                  style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', padding: '4px', color: '#94a3b8', display: 'flex', alignItems: 'center' }}
                >
                  <EyeIcon open={showPassword} />
                </button>
              </div>
            </div>

            {error && <p className="login-error">{error}</p>}

            <button type="submit" className="login-button" disabled={isSubmitting}>
              {isSubmitting ? 'Signing in...' : 'Sign In to ExamineerAI'}
            </button>

            <button type="button" className="forgot-password" onClick={() => setShowForgotModal(true)}>Forgot password?</button>
          </form>
        </div>
      </div>

      {/* Forgot Password Modal */}
      {showForgotModal && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(15,37,84,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '16px' }}
          onClick={(e) => { if (e.target === e.currentTarget) closeForgotModal(); }}
        >
          <div style={{ background: '#fff', borderRadius: '14px', padding: '28px 28px 24px', width: '100%', maxWidth: '380px', boxShadow: '0 20px 60px rgba(15,37,84,0.22)' }}>

            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '20px' }}>
              <div>
                <h3 style={{ margin: '0 0 4px', fontSize: '1.0625rem', fontWeight: 700, color: '#0f172a' }}>Reset Password</h3>
                <p style={{ margin: 0, fontSize: '0.8125rem', color: '#64748b' }}>We'll send a reset link to your email.</p>
              </div>
              <button
                type="button"
                onClick={closeForgotModal}
                style={{ background: '#f1f5f9', border: 'none', cursor: 'pointer', padding: '6px', borderRadius: '6px', color: '#64748b', display: 'flex', alignItems: 'center', flexShrink: 0, marginLeft: '12px' }}
              >
                <svg fill="none" strokeWidth="2" stroke="currentColor" viewBox="0 0 24 24" width="16" height="16">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {forgotStatus === 'sent' ? (
              <div style={{ textAlign: 'center', padding: '8px 0 4px' }}>
                <div style={{ width: '44px', height: '44px', borderRadius: '50%', background: '#dcfce7', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
                  <svg fill="none" strokeWidth="2.5" stroke="#15803d" viewBox="0 0 24 24" width="22" height="22">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                  </svg>
                </div>
                <p style={{ margin: '0 0 6px', fontWeight: 700, color: '#0f172a', fontSize: '0.9375rem' }}>Check your inbox</p>
                <p style={{ margin: '0 0 20px', fontSize: '0.8125rem', color: '#64748b', lineHeight: 1.6 }}>
                  If <strong style={{ color: '#0f172a' }}>{forgotEmail}</strong> is registered, you'll receive a reset link shortly.
                </p>
                <button
                  type="button"
                  onClick={closeForgotModal}
                  style={{ width: '100%', padding: '10px', background: '#0f2554', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer' }}
                >
                  Done
                </button>
              </div>
            ) : (
              <form onSubmit={handleForgotSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label htmlFor="forgot-email" style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#1e293b' }}>
                    Email Address
                  </label>
                  <input
                    type="email"
                    id="forgot-email"
                    placeholder="you@example.com"
                    required
                    autoFocus
                    value={forgotEmail}
                    onChange={(e) => setForgotEmail(e.target.value)}
                    disabled={forgotStatus === 'sending'}
                    style={{
                      padding: '10px 12px',
                      borderRadius: '8px',
                      border: '1.5px solid #cbd5e1',
                      fontSize: '0.9rem',
                      color: '#0f172a',
                      background: '#fff',
                      outline: 'none',
                      width: '100%',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>

                {forgotError && (
                  <p style={{ margin: 0, padding: '8px 12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '6px', fontSize: '0.8125rem', color: '#b91c1c' }}>
                    {forgotError}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={forgotStatus === 'sending' || !forgotEmail.trim()}
                  style={{
                    width: '100%',
                    padding: '10px',
                    background: forgotStatus === 'sending' || !forgotEmail.trim() ? '#94a3b8' : '#0f2554',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '8px',
                    fontSize: '0.875rem',
                    fontWeight: 600,
                    cursor: forgotStatus === 'sending' || !forgotEmail.trim() ? 'not-allowed' : 'pointer',
                    transition: 'background 0.15s',
                  }}
                >
                  {forgotStatus === 'sending' ? 'Sending...' : 'Send Reset Link'}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
