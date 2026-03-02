import { useAuth } from '../contexts/AuthContext';
import '../dashboard.css';

export function StudentDashboard() {
  const { profile, signOut } = useAuth();

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <h1>Student Dashboard</h1>
        <div className="dashboard-user-info">
          <span>{profile?.email}</span>
          <button onClick={signOut} className="sign-out-button">Sign Out</button>
        </div>
      </header>
      <main className="dashboard-content">
        <p>Welcome, {profile?.full_name || 'Student'}. Access your exams and results here.</p>
      </main>
    </div>
  );
}
