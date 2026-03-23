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
    const [viewMode, setViewMode] = useState<'card' | 'list'>('card');
    const [viewModeUserId, setViewModeUserId] = useState<string | null>(null);

    useEffect(() => {
        if (!user) return;
        setViewModeUserId(user.id);
        const stored = localStorage.getItem(`student_exams_viewMode_${user.id}`);
        if (stored === 'card' || stored === 'list') setViewMode(stored);
    }, [user]);

    useEffect(() => {
        if (viewModeUserId) localStorage.setItem(`student_exams_viewMode_${viewModeUserId}`, viewMode);
    }, [viewMode, viewModeUserId]);

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

                {/* Group 1: toggles + search — always on the same row */}
                <div style={{ display: 'flex', gap: '8px', flex: '1 1 auto', minWidth: '280px', alignItems: 'center' }}>
                    <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
                        <button type="button" onClick={() => setViewMode('card')} title="Card view" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '7px 10px', borderRadius: '6px', cursor: 'pointer', border: viewMode === 'card' ? '1.5px solid var(--prof-primary)' : '1.5px solid var(--prof-border)', background: viewMode === 'card' ? 'var(--prof-primary)' : 'transparent', color: viewMode === 'card' ? '#fff' : 'var(--prof-text-muted)', transition: 'all 0.15s' }}>
                            <svg fill="none" strokeWidth="1.8" stroke="currentColor" viewBox="0 0 24 24" width="16" height="16"><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></svg>
                        </button>
                        <button type="button" onClick={() => setViewMode('list')} title="List view" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '7px 10px', borderRadius: '6px', cursor: 'pointer', border: viewMode === 'list' ? '1.5px solid var(--prof-primary)' : '1.5px solid var(--prof-border)', background: viewMode === 'list' ? 'var(--prof-primary)' : 'transparent', color: viewMode === 'list' ? '#fff' : 'var(--prof-text-muted)', transition: 'all 0.15s' }}>
                            <svg fill="none" strokeWidth="2" stroke="currentColor" viewBox="0 0 24 24" width="16" height="16"><path strokeLinecap="round" d="M4 6h16M4 12h16M4 18h16" /></svg>
                        </button>
                    </div>
                    <div style={{ position: 'relative', flex: 1, minWidth: 0 }}>
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
                </div>

                {/* Group 2: filter selects — wrap below on narrow viewports */}
                <div style={{ display: 'flex', gap: '8px', flexShrink: 0, alignItems: 'center', flexWrap: 'wrap' }}>
                    <div style={{ position: 'relative' }}>
                        <select value={termFilter} onChange={e => setTermFilter(e.target.value)} style={{ appearance: 'none', padding: '9px 36px 9px 16px', borderRadius: '8px', border: '1.5px solid var(--prof-border)', background: '#fff', color: 'var(--prof-text-main)', fontSize: '0.875rem', fontWeight: 500, outline: 'none', cursor: 'pointer', boxShadow: '0 1px 2px rgba(0,0,0,0.02)', minWidth: '180px' }}>
                            <option value="all">All Terms</option>
                            {availableTerms.map(term => <option key={term} value={term}>{term}</option>)}
                        </select>
                        <svg fill="none" strokeWidth="2" stroke="currentColor" viewBox="0 0 24 24" width="14" height="14" style={{ position: 'absolute', right: '14px', top: '50%', transform: 'translateY(-50%)', color: 'var(--prof-text-muted)', pointerEvents: 'none' }}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                        </svg>
                    </div>
                    <div style={{ position: 'relative' }}>
                        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as any)} style={{ appearance: 'none', padding: '9px 36px 9px 16px', borderRadius: '8px', border: '1.5px solid var(--prof-border)', background: '#fff', color: 'var(--prof-text-main)', fontSize: '0.875rem', fontWeight: 500, outline: 'none', cursor: 'pointer', boxShadow: '0 1px 2px rgba(0,0,0,0.02)', minWidth: '140px' }}>
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
                <div style={{ display: 'flex', flexDirection: 'column', gap: viewMode === 'list' ? '20px' : '32px' }}>
                    {groupedExams.map(group => (
                        <div key={group.termString}>
                            <h3 style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--prof-text-muted)', marginBottom: viewMode === 'list' ? '8px' : '16px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                {group.termString}
                            </h3>

                            {viewMode === 'card' ? (
                                <div className="subjects-grid">
                                    {group.exams.map(exam => {
                                        const examStatus = getStudentExamStatus(exam);
                                        let statusColor = '#92400e';
                                        let statusBg = '#fef3c7';
                                        let statusLabel = 'Locked';
                                        let topBorderColor = '#f59e0b';
                                        if (examStatus === 'available') { statusColor = '#059669'; statusBg = '#ecfdf5'; statusLabel = 'Available'; topBorderColor = '#10b981'; }
                                        else if (examStatus === 'completed') { statusColor = '#475569'; statusBg = '#f1f5f9'; statusLabel = 'Completed'; topBorderColor = '#64748b'; }
                                        else if (examStatus === 'upcoming') { statusColor = '#92400e'; statusBg = '#fef3c7'; statusLabel = 'Upcoming'; topBorderColor = '#f59e0b'; }
                                        const deployedAttempts = exam.exam_attempts.filter(a => a.status === 'deployed').length;
                                        const isLocked = examStatus === 'locked';
                                        return (
                                            <div
                                                key={exam.id}
                                                className="subject-card"
                                                style={{ cursor: isLocked ? 'not-allowed' : 'pointer', display: 'flex', flexDirection: 'column', padding: 0, backgroundColor: isLocked ? '#f8fafc' : '#fff', borderRadius: '8px', border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', transition: 'transform 0.2s ease, box-shadow 0.2s ease', minHeight: 'auto', opacity: isLocked ? 0.65 : 1 }}
                                                onClick={() => { if (!isLocked) navigate(`/student/exams/${exam.id}`); }}
                                                onMouseEnter={e => { if (isLocked) return; e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.08)'; }}
                                                onMouseLeave={e => { if (isLocked) return; e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.05)'; }}
                                            >
                                                <div style={{ height: '120px', overflow: 'hidden', background: '#f1f5f9', flexShrink: 0 }}>
                                                    {exam.cover_image_url
                                                        ? <img src={exam.cover_image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                                                        : <div style={{ width: '100%', height: '100%', background: topBorderColor, opacity: 0.18 }} />
                                                    }
                                                </div>
                                                <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', flex: 1 }}>
                                                    <div style={{ color: '#64748b', fontSize: '0.85rem', fontWeight: 600, marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{exam.code}</div>
                                                    <h3 style={{ margin: '0 0 16px 0', fontSize: '1.2rem', color: '#0f172a', fontWeight: 700, lineHeight: 1.3, minHeight: 'calc(1.2rem * 1.3 * 2)' }}>{exam.title}</h3>
                                                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '20px' }}>
                                                        <span style={{ fontWeight: 600, fontSize: '0.75rem', color: statusColor, background: statusBg, padding: '4px 10px', borderRadius: '16px' }}>{statusLabel}</span>
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
                                            </div>
                                        );
                                    })}
                                </div>
                            ) : (
                                <div style={{ borderRadius: '8px', border: '1px solid var(--prof-border)', overflow: 'hidden' }}>
                                    {group.exams.map((exam, idx) => {
                                        const examStatus = getStudentExamStatus(exam);
                                        let statusColor = '#92400e';
                                        let statusBg = '#fef3c7';
                                        let statusLabel = 'Locked';
                                        let borderColor = '#f59e0b';
                                        if (examStatus === 'available') { statusColor = '#059669'; statusBg = '#ecfdf5'; statusLabel = 'Available'; borderColor = '#10b981'; }
                                        else if (examStatus === 'completed') { statusColor = '#475569'; statusBg = '#f1f5f9'; statusLabel = 'Completed'; borderColor = '#64748b'; }
                                        else if (examStatus === 'upcoming') { statusColor = '#92400e'; statusBg = '#fef3c7'; statusLabel = 'Upcoming'; borderColor = '#f59e0b'; }
                                        const deployedAttempts = exam.exam_attempts.filter(a => a.status === 'deployed').length;
                                        const isLocked = examStatus === 'locked';
                                        const isLast = idx === group.exams.length - 1;
                                        return (
                                            <div
                                                key={exam.id}
                                                onClick={() => { if (!isLocked) navigate(`/student/exams/${exam.id}`); }}
                                                style={{
                                                    display: 'flex', alignItems: 'center', gap: '12px',
                                                    padding: '12px 16px', background: isLocked ? '#f8fafc' : '#fff',
                                                    borderLeft: `3px solid ${borderColor}`,
                                                    borderBottom: isLast ? 'none' : '1px solid var(--prof-border)',
                                                    cursor: isLocked ? 'not-allowed' : 'pointer',
                                                    transition: 'background 0.12s',
                                                    opacity: isLocked ? 0.65 : 1,
                                                }}
                                                onMouseEnter={e => { if (!isLocked) (e.currentTarget as HTMLDivElement).style.background = 'var(--prof-surface)'; }}
                                                onMouseLeave={e => { if (!isLocked) (e.currentTarget as HTMLDivElement).style.background = '#fff'; }}
                                            >
                                                <div style={{ flex: 1, minWidth: 0 }}>
                                                    <p style={{ margin: '0 0 2px', fontSize: '0.72rem', color: 'var(--prof-text-muted)', fontWeight: 600, letterSpacing: '0.05em' }}>
                                                        {exam.code}
                                                    </p>
                                                    <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--prof-text-main)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                        {exam.title}
                                                    </p>
                                                </div>
                                                <div style={{ display: 'flex', gap: '5px', flexShrink: 0, flexWrap: 'wrap' }}>
                                                    <span style={{ fontSize: '0.75rem', fontWeight: 600, color: statusColor, background: statusBg, padding: '2px 8px', borderRadius: '99px' }}>
                                                        {statusLabel}
                                                    </span>
                                                    <span style={{ fontSize: '0.75rem', color: '#64748b', background: '#fff', border: '1px solid #e2e8f0', padding: '2px 8px', borderRadius: '99px' }}>
                                                        {deployedAttempts > 0 ? `${deployedAttempts} open` : `${exam.max_attempts} attempt${exam.max_attempts !== 1 ? 's' : ''}`}
                                                    </span>
                                                </div>
                                                {isLocked ? (
                                                    <svg fill="none" strokeWidth="2" stroke="currentColor" viewBox="0 0 24 24" width="14" height="14" style={{ flexShrink: 0, color: '#94a3b8' }}>
                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                                                    </svg>
                                                ) : (
                                                    <svg fill="none" strokeWidth="2" stroke="currentColor" viewBox="0 0 24 24" width="14" height="14" style={{ flexShrink: 0, color: 'var(--prof-text-muted)' }}>
                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                                                    </svg>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
