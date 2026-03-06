import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Sidebar } from '../components/professor/Sidebar';
import './ProfessorDashboard.css';

export function ProfessorDashboard() {
    const { profile, signOut } = useAuth();
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);

    return (
        <div className="prof-layout">
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
                        <span className="user-email">{profile?.email || 'professor@examineerai.com'}</span>
                        <button onClick={signOut} className="btn-logout">Sign Out</button>
                    </div>
                </header>

                <div className="prof-content-scroll">
                    <Outlet />
                </div>
            </main>
        </div>
    );
}
