import { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { fetchEnrolledExams, getStudentExamStatus } from '../../lib/studentExams';
import type { StudentExam } from '../../lib/studentExams';

export function ExamsList() {
    const { user } = useAuth();
    const navigate = useNavigate();
    const [exams, setExams] = useState<StudentExam[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState<'all' | 'available' | 'upcoming' | 'completed' | 'locked'>('all');
    const [termFilter, setTermFilter] = useState<'all' | string>('all');

    useEffect(() => {
        if (!user) return;
        fetchEnrolledExams(user.id).then(({ data }) => {
            setExams(data);
            setIsLoading(false);
        });
    }, [user]);

    const availableTerms = useMemo(() => {
        const terms = new Set<string>();
        exams.forEach(e => terms.add(`${e.academic_year} | ${e.term}`));
        return Array.from(terms).sort((a, b) => b.localeCompare(a));
    }, [exams]);

    const filteredExams = exams.filter(exam => {
        const examStatus = getStudentExamStatus(exam);
        const matchesSearch = searchQuery === '' ||
            exam.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
            exam.code.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesStatus = statusFilter === 'all' || examStatus === statusFilter;
        const examTermKey = `${exam.academic_year} | ${exam.term}`;
        const matchesTerm = termFilter === 'all' || examTermKey === termFilter;
        return matchesSearch && matchesStatus && matchesTerm;
    });

    const groupedExams = useMemo(() => {
        const groups = filteredExams.reduce((acc, exam) => {
            const key = `${exam.academic_year} | ${exam.term}`;
            if (!acc[key]) acc[key] = [];
            acc[key].push(exam);
            return acc;
        }, {} as Record<string, StudentExam[]>);
        const sortedKeys = Object.keys(groups).sort((a, b) => b.localeCompare(a));
        return sortedKeys.map(key => ({ termString: key, exams: groups[key] }));
    }, [filteredExams]);

    if (isLoading) {
        return (
            <div className="subjects-container">
                <p className="settings-loading-row">Loading exams...</p>
            </div>
        );
    }

    return (
        <div className="subjects-container">
            <div className="subjects-header">
                <div>
                    <h2 className="subjects-title">My Exams</h2>
                    <p className="subjects-subtitle">View and take your enrolled exams.</p>
                </div>
            </div>

            {/* Search + filter bar */}
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap' }}>
                <div style={{ position: 'relative', flex: '1', minWidth: '200px' }}>
                    <svg fill="none" strokeWidth="2" stroke="currentColor" viewBox="0 0 24 24" width="16" height="16" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--prof-text-muted)', pointerEvents: 'none' }}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                    </svg>
                    <input
                        type="text"
                        placeholder="Search by title or code..."
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        style={{ width: '100%', padding: '9px 12px 9px 38px', borderRadius: '8px', border: '1.5px solid var(--prof-border)', background: '#fff', color: 'var(--prof-text-main)', fontSize: '0.875rem', outline: 'none', boxSizing: 'border-box', boxShadow: '0 1px 2px rgba(0,0,0,0.02)', transition: 'border-color 0.2s' }}
                    />
                </div>

                <div style={{ position: 'relative', flexShrink: 0 }}>
                    <select value={termFilter} onChange={e => setTermFilter(e.target.value)} style={{ appearance: 'none', padding: '9px 36px 9px 16px', borderRadius: '8px', border: '1.5px solid var(--prof-border)', background: '#fff', color: 'var(--prof-text-main)', fontSize: '0.875rem', fontWeight: 500, outline: 'none', cursor: 'pointer', boxShadow: '0 1px 2px rgba(0,0,0,0.02)', minWidth: '180px' }}>
                        <option value="all">All Terms</option>
                        {availableTerms.map(term => <option key={term} value={term}>{term}</option>)}
                    </select>
                    <svg fill="none" strokeWidth="2" stroke="currentColor" viewBox="0 0 24 24" width="14" height="14" style={{ position: 'absolute', right: '14px', top: '50%', transform: 'translateY(-50%)', color: 'var(--prof-text-muted)', pointerEvents: 'none' }}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                    </svg>
                </div>

                <div style={{ position: 'relative', flexShrink: 0 }}>
                    <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as any)} style={{ appearance: 'none', padding: '9px 36px 9px 16px', borderRadius: '8px', border: '1.5px solid var(--prof-border)', background: '#fff', color: 'var(--prof-text-main)', fontSize: '0.875rem', fontWeight: 500, outline: 'none', cursor: 'pointer', boxShadow: '0 1px 2px rgba(0,0,0,0.02)', minWidth: '150px' }}>
                        <option value="all">All Statuses</option>
                        <option value="available">Available</option>
                        <option value="upcoming">Upcoming</option>
                        <option value="completed">Completed</option>
                        <option value="locked">Locked</option>
                    </select>
                    <svg fill="none" strokeWidth="2" stroke="currentColor" viewBox="0 0 24 24" width="14" height="14" style={{ position: 'absolute', right: '14px', top: '50%', transform: 'translateY(-50%)', color: 'var(--prof-text-muted)', pointerEvents: 'none' }}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                    </svg>
                </div>
            </div>

            {exams.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '60px 20px', backgroundColor: '#fff', borderRadius: '12px', border: '1px solid var(--prof-border)', boxShadow: '0 2px 8px rgba(0,0,0,0.02)' }}>
                    <svg fill="none" strokeWidth="1.5" stroke="currentColor" viewBox="0 0 24 24" width="48" height="48" style={{ margin: '0 auto 16px', color: 'var(--prof-text-muted)', opacity: 0.5, display: 'block' }}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <h3 style={{ margin: '0 0 8px', color: 'var(--prof-text-main)', fontSize: '1.1rem', fontWeight: 600 }}>No exams enrolled</h3>
                    <p style={{ margin: 0, color: 'var(--prof-text-muted)', fontSize: '0.95rem' }}>You have not been enrolled in any exams yet.</p>
                </div>
            ) : filteredExams.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '60px 20px', backgroundColor: '#fff', borderRadius: '12px', border: '1px solid var(--prof-border)', boxShadow: '0 2px 8px rgba(0,0,0,0.02)' }}>
                    <h3 style={{ margin: '0 0 8px', color: 'var(--prof-text-main)', fontSize: '1.1rem', fontWeight: 600 }}>No exams found</h3>
                    <p style={{ margin: 0, color: 'var(--prof-text-muted)', fontSize: '0.95rem' }}>Try adjusting your search or filters.</p>
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
                    {groupedExams.map(group => (
                        <div key={group.termString}>
                            <h3 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--prof-text-main)', marginBottom: '16px', borderBottom: '2px solid var(--prof-border)', paddingBottom: '8px' }}>
                                {group.termString}
                            </h3>
                            <div className="subjects-grid">
                                {group.exams.map(exam => {
                                    const examStatus = getStudentExamStatus(exam);

                                    let statusColor = '#92400e';
                                    let statusBg = '#fef3c7';
                                    let statusLabel = 'Locked';
                                    let topBorderColor = '#f59e0b';

                                    if (examStatus === 'available') {
                                        statusColor = '#059669';
                                        statusBg = '#ecfdf5';
                                        statusLabel = 'Available';
                                        topBorderColor = '#10b981';
                                    } else if (examStatus === 'completed') {
                                        statusColor = '#475569';
                                        statusBg = '#f1f5f9';
                                        statusLabel = 'Completed';
                                        topBorderColor = '#64748b';
                                    } else if (examStatus === 'upcoming') {
                                        statusColor = '#92400e';
                                        statusBg = '#fef3c7';
                                        statusLabel = 'Upcoming';
                                        topBorderColor = '#f59e0b';
                                    }

                                    const deployedAttempts = exam.exam_attempts.filter(a => a.status === 'deployed').length;

                                    const isLocked = examStatus === 'locked';

                                    return (
                                        <div
                                            key={exam.id}
                                            className="subject-card"
                                            style={{ cursor: isLocked ? 'not-allowed' : 'pointer', display: 'flex', flexDirection: 'column', padding: '20px', backgroundColor: isLocked ? '#f8fafc' : '#fff', borderRadius: '8px', border: '1px solid #e2e8f0', borderTop: `4px solid ${topBorderColor}`, boxShadow: '0 1px 3px rgba(0,0,0,0.05)', transition: 'all 0.2s ease', minHeight: 'auto', opacity: isLocked ? 0.65 : 1 }}
                                            onClick={() => { if (!isLocked) navigate(`/student/exams/${exam.id}`); }}
                                            onMouseEnter={e => {
                                                if (isLocked) return;
                                                e.currentTarget.style.transform = 'translateY(-2px)';
                                                e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.08)';
                                            }}
                                            onMouseLeave={e => {
                                                if (isLocked) return;
                                                e.currentTarget.style.transform = 'translateY(0)';
                                                e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.05)';
                                            }}
                                        >
                                            <div style={{ color: '#64748b', fontSize: '0.85rem', fontWeight: 600, marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                                {exam.code}
                                            </div>
                                            <h3 style={{ margin: '0 0 16px 0', fontSize: '1.2rem', color: '#0f172a', fontWeight: 700, lineHeight: 1.3 }}>
                                                {exam.title}
                                            </h3>

                                            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '20px' }}>
                                                <span style={{ fontWeight: 600, fontSize: '0.75rem', color: statusColor, background: statusBg, padding: '4px 10px', borderRadius: '16px' }}>
                                                    {statusLabel}
                                                </span>
                                                <span style={{ fontWeight: 500, fontSize: '0.75rem', color: '#64748b', background: '#ffffff', border: '1px solid #e2e8f0', padding: '3px 10px', borderRadius: '16px' }}>
                                                    {deployedAttempts > 0 ? `${deployedAttempts} open` : `${exam.max_attempts} attempt${exam.max_attempts !== 1 ? 's' : ''}`}
                                                </span>
                                            </div>

                                            {isLocked ? (
                                                <div style={{ display: 'flex', alignItems: 'center', color: '#94a3b8', fontSize: '0.9rem', fontWeight: 500 }}>
                                                    <svg fill="none" strokeWidth="2" stroke="currentColor" viewBox="0 0 24 24" width="16" height="16" style={{ marginRight: '6px' }}><path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" /></svg>
                                                    Locked by professor
                                                </div>
                                            ) : (
                                                <div style={{ display: 'flex', alignItems: 'center', color: '#3b82f6', fontSize: '0.9rem', fontWeight: 500 }}>
                                                    <svg fill="none" strokeWidth="2" stroke="currentColor" viewBox="0 0 24 24" width="16" height="16" style={{ marginRight: '6px' }}><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" /></svg>
                                                    View details
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
