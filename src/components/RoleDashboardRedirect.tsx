import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import type { UserRole } from '../types';

const roleRouteMap: Record<UserRole, string> = {
  admin: '/admin',
  professor: '/professor',
  student: '/student',
};

export function RoleDashboardRedirect() {
  const { user, profile, isLoading, signOut } = useAuth();

  if (isLoading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: '#070b14', gap: '16px' }}>
        <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="#ec1f28" strokeWidth="2" style={{ animation: 'spin 1s linear infinite' }}>
          <path d="M21 12a9 9 0 1 1-6.219-8.56" />
        </svg>
        <p style={{ margin: 0, color: '#94a3b8', fontSize: '0.95rem', fontWeight: 500 }}>Loading...</p>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (!profile) {
    return (
      <div className="loading-screen">
        <p>Unable to load your profile. Please contact an administrator.</p>
        <button onClick={signOut} style={{ marginTop: '1rem', cursor: 'pointer' }}>
          Sign Out
        </button>
      </div>
    );
  }

  const targetRoute = roleRouteMap[profile.role];
  return <Navigate to={targetRoute} replace />;
}
