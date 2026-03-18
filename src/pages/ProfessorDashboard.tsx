import { useState } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { NotificationsProvider, useNotifications } from '../contexts/NotificationsContext';
import { Sidebar } from '../components/professor/Sidebar';
import './ProfessorDashboard.css';

function TopbarBell() {
    const navigate = useNavigate();
    const { unreadCount } = useNotifications();
    return (
        <button
            onClick={() => navigate('/professor/notifications')}
            title="Notifications"
            style={{ position: 'relative', background: 'none', border: 'none', cursor: 'pointer', padding: '6px', color: 'var(--prof-text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '8px' }}
        >
            <svg fill="none" strokeWidth="1.75" stroke="currentColor" viewBox="0 0 24 24" width="20" height="20">
                <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
            </svg>
            {unreadCount > 0 && (
                <span style={{
                    position: 'absolute', top: '1px', right: '1px',
                    background: '#ef4444', color: 'white',
                    borderRadius: '50%', fontSize: '0.6rem', fontWeight: 700,
                    width: '15px', height: '15px',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    lineHeight: 1, pointerEvents: 'none',
                }}>
                    {unreadCount > 9 ? '9+' : unreadCount}
                </span>
            )}
        </button>
    );
}

export function ProfessorDashboard() {
    const { profile, signOut } = useAuth();
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);

    return (
        <NotificationsProvider>
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
                            <TopbarBell />
                            <span className="user-email">{profile?.email || 'professor@examineerai.com'}</span>
                            <button onClick={signOut} className="btn-logout">Sign Out</button>
                        </div>
                    </header>

                    <div className="prof-content-scroll">
                        <Outlet />
                    </div>
                </main>
            </div>
        </NotificationsProvider>
    );
}
