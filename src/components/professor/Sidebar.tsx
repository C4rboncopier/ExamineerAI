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
                <span className="badge">Professor</span>
            </div>

            <nav className="prof-sidebar-nav">
                <div className="nav-section">
                    <h3 className="nav-section-title">Menu</h3>
                    <button
                        className={`prof-nav-btn ${isActive('/professor/subjects') ? 'active' : ''}`}
                        onClick={() => handleNavigate('/professor/subjects')}
                    >
                        <svg className="nav-icon" fill="none" strokeWidth="2" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"></path></svg>
                        Subjects
                    </button>
                    <button
                        className={`prof-nav-btn ${isActive('/professor/question-bank') ? 'active' : ''}`}
                        onClick={() => handleNavigate('/professor/question-bank')}
                    >
                        <svg className="nav-icon" fill="none" strokeWidth="2" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"></path></svg>
                        Question Bank
                    </button>
                    <button
                        className={`prof-nav-btn ${isActive('/professor/templates') ? 'active' : ''}`}
                        onClick={() => handleNavigate('/professor/templates')}
                    >
                        <svg className="nav-icon" fill="none" strokeWidth="2" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z"></path></svg>
                        Templates
                    </button>
                    <button
                        className={`prof-nav-btn ${isActive('/professor/exams') ? 'active' : ''}`}
                        onClick={() => handleNavigate('/professor/exams')}
                    >
                        <svg className="nav-icon" fill="none" strokeWidth="2" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
                        Exams
                    </button>
                    <button
                        className={`prof-nav-btn ${isActive('/professor/settings') ? 'active' : ''}`}
                        onClick={() => handleNavigate('/professor/settings')}
                    >
                        <svg className="nav-icon" fill="none" strokeWidth="2" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"></path><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
                        Settings
                    </button>
                </div>
            </nav>
        </aside>
    );
}
