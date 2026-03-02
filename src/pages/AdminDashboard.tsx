import { useAuth } from '../contexts/AuthContext';
import '../dashboard.css';

export function AdminDashboard() {
  const { profile, signOut } = useAuth();

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <h1>Admin Dashboard</h1>
        <div className="dashboard-user-info">
          <span>{profile?.email}</span>
          <button onClick={signOut} className="sign-out-button">Sign Out</button>
        </div>
      </header>
      <main className="dashboard-content">
        <p>Welcome, {profile?.full_name || 'Admin'}. You have full system access.</p>
      </main>
    </div>
  );
}
