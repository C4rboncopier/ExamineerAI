import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Sidebar } from '../components/professor/Sidebar';
import { SubjectsList } from '../components/professor/SubjectsList';
import './ProfessorDashboard.css';

export function ProfessorDashboard() {
  const { profile, signOut } = useAuth();
  const [activeTab, setActiveTab] = useState('subjects');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  return (
    <div className="prof-layout">
      {/* Mobile Sidebar Overlay */}
      {isSidebarOpen && (
        <div className="prof-sidebar-overlay" onClick={() => setIsSidebarOpen(false)} />
      )}

      <Sidebar
        activeTab={activeTab}
        setActiveTab={(tab) => {
          setActiveTab(tab);
          setIsSidebarOpen(false); // Close on mobile when selecting tab
        }}
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
            <span className="user-email">{profile?.email || 'professor@examineerai.com'}</span>
            <button onClick={signOut} className="btn-logout">Sign Out</button>
          </div>
        </header>

        <div className="prof-content-scroll">
          {activeTab === 'subjects' && <SubjectsList />}
        </div>
      </main>
    </div>
  );
}
