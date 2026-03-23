import { useState, useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Sidebar } from '../components/student/Sidebar';
import { Popup } from '../components/common/Popup';
import './ProfessorDashboard.css'; // Reusing professor styles for consistency

export function StudentDashboard() {
  const { profile, signOut } = useAuth();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [isMobileMode, setIsMobileMode] = useState(() => window.innerWidth < window.screen.width / 2);

  useEffect(() => {
    const check = () => {
      const half = window.innerWidth < window.screen.width / 2;
      setIsMobileMode(half);
      if (!half) setIsSidebarOpen(false);
    };
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  return (
    <div className={`prof-layout${isMobileMode ? ' mobile-mode' : ''}`}>
      {isSidebarOpen && (
        <div className="prof-sidebar-overlay" onClick={() => setIsSidebarOpen(false)} />
      )}

      <Sidebar
        isOpen={isSidebarOpen}
        setIsOpen={setIsSidebarOpen}
      />

      <main className="prof-main">
        <header className="prof-topbar">
          <div className="topbar-left">
            <button className="mobile-menu-btn" onClick={() => setIsSidebarOpen(true)}>
              <svg fill="none" strokeWidth="2" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16"></path></svg>
            </button>
          </div>
          <div className="user-profile">
            <span className="user-email">{profile?.full_name || profile?.email || 'User'}</span>
            <button onClick={() => setShowLogoutConfirm(true)} className="btn-logout">Sign Out</button>
          </div>
        </header>

        <div className="prof-content-scroll">
          <Outlet />
        </div>
      </main>
      <Popup
        isOpen={showLogoutConfirm}
        title="Sign Out"
        message="Are you sure you want to sign out of your account?"
        type="warning"
        onConfirm={signOut}
        onCancel={() => setShowLogoutConfirm(false)}
        confirmText="Sign Out"
        cancelText="Cancel"
      />
    </div>
  );
}
