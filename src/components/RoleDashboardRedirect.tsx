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
      <div className="loading-screen">
        <p>Loading...</p>
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
