import { useState } from 'react';

export function StudentsList() {
    const [searchQuery, setSearchQuery] = useState('');

    return (
        <div className="subjects-container">
            <div className="subjects-header">
                <div style={{ flex: 1 }}>
                    <h2>Students</h2>
                    <p style={{ color: 'var(--prof-text-muted)', margin: 0 }}>Manage student accounts and records.</p>
                </div>
                <button className="btn-primary" onClick={() => { }}>
                    + Add Student
                </button>
            </div>

            <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginBottom: '20px', flexWrap: 'nowrap' }}>
                <div style={{ position: 'relative', flex: '1', minWidth: '0' }}>
                    <svg fill="none" strokeWidth="2" stroke="currentColor" viewBox="0 0 24 24" width="16" height="16" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--prof-text-muted)', pointerEvents: 'none' }}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                    </svg>
                    <input
                        type="text"
                        placeholder="Search students by name, email, or ID..."
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        style={{
                            width: '100%',
                            padding: '9px 12px 9px 38px',
                            borderRadius: '8px',
                            border: '1.5px solid var(--prof-border)',
                            background: '#fff',
                            color: 'var(--prof-text-main)',
                            fontSize: '0.875rem',
                            outline: 'none',
                            boxSizing: 'border-box',
                            boxShadow: '0 1px 2px rgba(0,0,0,0.02)',
                            transition: 'border-color 0.2s'
                        }}
                    />
                </div>
            </div>

            <div className="templates-simple-list">
                {/* Placeholder UI for frontend mockup */}
                <div className="subject-card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px', marginBottom: '12px' }}>
                    <div className="template-info">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                            <h3 className="subject-name" style={{ margin: 0 }}>Alice Johnson</h3>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '2px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: 600, background: '#dcfce7', color: '#16a34a', border: '1px solid #86efac', whiteSpace: 'nowrap' }}>
                                Enrolled
                            </span>
                        </div>
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                            <span className="subject-code" style={{ marginBottom: 0 }}>ID: 2023-0001</span>
                            <span className="exam-sets-badge">
                                alice.j@student.edu
                            </span>
                        </div>
                    </div>
                    <div className="subject-card-actions" style={{ marginTop: 0, gap: '6px' }}>
                        <button className="btn-secondary" style={{ padding: '6px 12px', fontSize: '0.75rem', fontWeight: 600 }}>View Records</button>
                    </div>
                </div>

                <div className="subject-card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px', marginBottom: '12px' }}>
                    <div className="template-info">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                            <h3 className="subject-name" style={{ margin: 0 }}>Bob Smith</h3>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '2px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: 600, background: '#dcfce7', color: '#16a34a', border: '1px solid #86efac', whiteSpace: 'nowrap' }}>
                                Enrolled
                            </span>
                        </div>
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                            <span className="subject-code" style={{ marginBottom: 0 }}>ID: 2023-0002</span>
                            <span className="exam-sets-badge">
                                bob.s@student.edu
                            </span>
                        </div>
                    </div>
                    <div className="subject-card-actions" style={{ marginTop: 0, gap: '6px' }}>
                        <button className="btn-secondary" style={{ padding: '6px 12px', fontSize: '0.75rem', fontWeight: 600 }}>View Records</button>
                    </div>
                </div>
            </div>
        </div>
    );
}
