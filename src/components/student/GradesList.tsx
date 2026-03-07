export function GradesList() {
    return (
        <div className="subjects-container">
            <div className="subjects-header">
                <div>
                    <h2 className="subjects-title">Grades</h2>
                    <p className="subjects-subtitle">View your past exam results and performance.</p>
                </div>
            </div>

            <div style={{ textAlign: 'center', padding: '60px 20px', backgroundColor: '#fff', borderRadius: '12px', border: '1px solid var(--prof-border)', boxShadow: '0 2px 8px rgba(0,0,0,0.02)' }}>
                <svg fill="none" strokeWidth="1.5" stroke="currentColor" viewBox="0 0 24 24" width="48" height="48" style={{ margin: '0 auto 16px', color: 'var(--prof-text-muted)', opacity: 0.5, display: 'block' }}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
                <h3 style={{ margin: '0 0 8px', color: 'var(--prof-text-main)', fontSize: '1.1rem', fontWeight: 600 }}>Grades feature coming soon</h3>
                <p style={{ margin: 0, color: 'var(--prof-text-muted)', fontSize: '0.95rem' }}>Detailed breakdown of your exam scores will appear here.</p>
            </div>
        </div>
    );
}
