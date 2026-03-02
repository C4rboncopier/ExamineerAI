import { useState } from 'react';
import type { FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import '../App.css';

export function Login() {
  const { user, isLoading, signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isLoading && user) {
    return <Navigate to="/dashboard" replace />;
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    const result = await signIn(email, password);

    if (result.error) {
      setError(result.error);
      setIsSubmitting(false);
    }
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
          <h2 className="login-title">Welcome Back</h2>
          <p className="login-description">Please enter your details to sign in.</p>

          <form className="login-form" onSubmit={handleSubmit}>
            <div className="form-group">
              <label htmlFor="email">Email address</label>
              <input
                type="email"
                id="email"
                placeholder="name@example.com"
                required
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={isSubmitting}
              />
            </div>

            <div className="form-group">
              <div className="password-header">
                <label htmlFor="password">Password</label>
                <button type="button" className="forgot-password">Forgot password?</button>
              </div>
              <input
                type="password"
                id="password"
                placeholder="••••••••"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isSubmitting}
              />
            </div>

            {error && <p className="login-error">{error}</p>}

            <button type="submit" className="login-button" disabled={isSubmitting}>
              {isSubmitting ? 'Signing in...' : 'Sign In to Examineer'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
