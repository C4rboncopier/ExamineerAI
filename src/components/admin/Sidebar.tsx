import { useLocation, useNavigate } from 'react-router-dom';

interface SidebarProps {
    isOpen: boolean;
    setIsOpen: (isOpen: boolean) => void;
}

export function Sidebar({ isOpen, setIsOpen }: SidebarProps) {
    const location = useLocation();
    const navigate = useNavigate();

    const isActive = (path: string) => location.pathname.startsWith(path);

    const handleNavigate = (path: string) => {
        navigate(path);
        setIsOpen(false);
    };

    return (
        <aside className={`prof-sidebar ${isOpen ? 'open' : ''}`}>
            <div className="prof-sidebar-header">
                <div className="sidebar-brand">
                    <h2 className="prof-logo">
                        <span className="logo-examineer">Examineer</span>
                        <span className="logo-ai">AI</span>
                    </h2>
                    <button className="mobile-close-btn" onClick={() => setIsOpen(false)}>
                        <svg fill="none" strokeWidth="2" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"></path></svg>
                    </button>
                </div>
                <span className="badge" style={{ background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca' }}>Admin</span>
            </div>

            <nav className="prof-sidebar-nav">
                <div className="nav-section">
                    <h3 className="nav-section-title">Menu</h3>
                    <button
                        className={`prof-nav-btn ${isActive('/admin/professors') ? 'active' : ''}`}
                        onClick={() => handleNavigate('/admin/professors')}
                    >
                        <svg className="nav-icon" fill="none" strokeWidth="2" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"></path></svg>
                        Professors
                    </button>
                    <button
                        className={`prof-nav-btn ${isActive('/admin/students') ? 'active' : ''}`}
                        onClick={() => handleNavigate('/admin/students')}
                    >
                        <svg className="nav-icon" fill="none" strokeWidth="2" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"></path></svg>
                        Students
                    </button>
                    <button
                        className={`prof-nav-btn ${isActive('/admin/settings') ? 'active' : ''}`}
                        onClick={() => handleNavigate('/admin/settings')}
                    >
                        <svg className="nav-icon" fill="none" strokeWidth="2" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"></path><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
                        Settings
                    </button>
                </div>
            </nav>
        </aside>
    );
}
