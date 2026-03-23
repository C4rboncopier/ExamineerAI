import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { fetchExams } from '../../lib/exams';
import type { Exam } from '../../lib/exams';
import { Toast } from '../common/Toast';
import { printOMR } from '../../lib/printOMR';

interface ToastState {
    open: boolean;
    message: string;
    type: 'success' | 'error' | 'info';
}

export function ExamsList() {
    const navigate = useNavigate();
    const [exams, setExams] = useState<Exam[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState<'all' | 'locked' | 'unlocked'>('all');
    const [termFilter, setTermFilter] = useState<'all' | string>('all');
    const [viewMode, setViewMode] = useState<'card' | 'list'>('card');
    const [viewModeUserId, setViewModeUserId] = useState<string | null>(null);

    useEffect(() => {
        supabase.auth.getUser().then(({ data }) => {
            const uid = data.user?.id;
            if (!uid) return;
            setViewModeUserId(uid);
            const stored = localStorage.getItem(`exams_viewMode_${uid}`);
            if (stored === 'card' || stored === 'list') setViewMode(stored);
        });
    }, []);

    useEffect(() => {
        if (viewModeUserId) localStorage.setItem(`exams_viewMode_${viewModeUserId}`, viewMode);
    }, [viewMode, viewModeUserId]);


    const [toast, setToast] = useState<ToastState>({ open: false, message: '', type: 'success' });
    const showToast = (message: string, type: 'success' | 'error' | 'info' = 'success') =>
        setToast({ open: true, message, type });
    const closeToast = useCallback(() => setToast(prev => ({ ...prev, open: false })), []);

    useEffect(() => {
        fetchExams().then(({ data, error }) => {
            if (error) showToast('Failed to load exams.', 'error');
            else setExams(data);
            setIsLoading(false);
        });
    }, []);

    const availableTerms = useMemo(() => {
        const terms = new Set<string>();
        exams.forEach(e => {
            const ay = e.academic_year || 'Unknown A.Y.';
            const t = e.term || 'Unknown Term';
            terms.add(`${ay} | ${t}`);
        });
        return Array.from(terms).sort((a, b) => b.localeCompare(a));
    }, [exams]);

    const filteredExams = exams.filter(exam => {
        const matchesSearch = searchQuery === '' ||
            exam.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
            exam.code.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesStatus = statusFilter === 'all' || exam.status === statusFilter;
        const ay = exam.academic_year || 'Unknown A.Y.';
        const t = exam.term || 'Unknown Term';
        const examTermKey = `${ay} | ${t}`;
        const matchesTerm = termFilter === 'all' || examTermKey === termFilter;
        return matchesSearch && matchesStatus && matchesTerm;
    });

    const groupedExams = useMemo(() => {
        const groups = filteredExams.reduce((acc, exam) => {
            const ay = exam.academic_year || 'Unknown A.Y.';
            const t = exam.term || 'Unknown Term';
            const key = `${ay} | ${t}`;
            if (!acc[key]) acc[key] = [];
            acc[key].push(exam);
            return acc;
        }, {} as Record<string, Exam[]>);
        const sortedKeys = Object.keys(groups).sort((a, b) => b.localeCompare(a));
        return sortedKeys.map(key => ({ termString: key, exams: groups[key] }));
    }, [filteredExams]);

    return (
        <div className="subjects-container">
            <div className="subjects-header">
                <div>
                    <h2 className="subjects-title">Exams</h2>
                    <p className="subjects-subtitle">Manage your generated exam sets.</p>
                </div>
                <div className="prof-exam-header-btns" style={{ display: 'flex', gap: '8px' }}>
                    <button className="btn-secondary ve-hide-mobile" onClick={() => printOMR()}>
                        Download OMR
                    </button>
                    <button className="btn-primary" onClick={() => navigate('/professor/exams/create')}>
                        + Create Exam
                    </button>
                </div>
            </div>

            {/* Search + filter bar */}
            {!isLoading && exams.length > 0 && (
                <div className="prof-exam-filter-bar" style={{ display: 'flex', gap: '12px', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap' }}>

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
                            <div style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'var(--prof-text-muted)' }}>
                                <svg fill="none" strokeWidth="2.5" stroke="currentColor" viewBox="0 0 24 24" width="14" height="14"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" /></svg>
                            </div>
                        </div>
                        <div style={{ position: 'relative' }}>
                            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as typeof statusFilter)} style={{ appearance: 'none', padding: '9px 36px 9px 16px', borderRadius: '8px', border: '1.5px solid var(--prof-border)', background: '#fff', color: 'var(--prof-text-main)', fontSize: '0.875rem', fontWeight: 500, outline: 'none', cursor: 'pointer', boxShadow: '0 1px 2px rgba(0,0,0,0.02)', minWidth: '140px' }}>
                                <option value="all">All Status</option>
                                <option value="locked">Locked</option>
                                <option value="unlocked">Unlocked</option>
                            </select>
                            <div style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'var(--prof-text-muted)' }}>
                                <svg fill="none" strokeWidth="2.5" stroke="currentColor" viewBox="0 0 24 24" width="14" height="14"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" /></svg>
                            </div>
                        </div>
                    </div>

                </div>
            )}

            {isLoading ? (
                <div className="subjects-empty">
                    <p style={{ color: 'var(--prof-text-muted)' }}>Loading exams...</p>
                </div>
            ) : exams.length === 0 ? (
                <div className="subjects-empty">
                    <svg fill="none" strokeWidth="1.5" stroke="currentColor" viewBox="0 0 24 24" className="empty-icon">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" />
                    </svg>
                    <h3>No existing exam</h3>
                    <p>Create your first exam to get started.</p>
                    <button className="btn-primary" onClick={() => navigate('/professor/exams/create')} style={{ marginTop: '16px' }}>
                        + Create Exam
                    </button>
                </div>
            ) : filteredExams.length === 0 ? (
                <div className="subjects-empty">
                    <p style={{ color: 'var(--prof-text-muted)' }}>No exams match your search or filter.</p>
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: viewMode === 'list' ? '20px' : '32px' }}>
                    {groupedExams.map(group => (
                        <div key={group.termString}>
                            <h3 style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--prof-text-muted)', marginBottom: viewMode === 'list' ? '8px' : '16px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                {group.termString}
                            </h3>

                            {viewMode === 'card' ? (
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '16px' }}>
                                    {group.exams.map(exam => {
                                        const statusColor = exam.is_completed ? '#475569' : exam.status === 'unlocked' ? '#16a34a' : '#f59e0b';
                                        const statusLabel = exam.is_completed ? 'Completed' : exam.status === 'unlocked' ? 'Unlocked' : 'Locked';
                                        const hasSubjects = exam.exam_subjects.length > 0;
                                        return (
                                            <div
                                                key={exam.id}
                                                onClick={() => navigate(`/professor/exams/${exam.id}`)}
                                                style={{
                                                    background: '#fff',
                                                    borderRadius: '10px',
                                                    border: '1px solid var(--prof-border)',
                                                    overflow: 'hidden',
                                                    display: 'flex',
                                                    flexDirection: 'column',
                                                    boxShadow: '0 2px 4px rgba(0,0,0,0.02)',
                                                    cursor: 'pointer',
                                                    transition: 'box-shadow 0.15s, border-color 0.15s',
                                                }}
                                                onMouseEnter={e => {
                                                    (e.currentTarget as HTMLDivElement).style.boxShadow = '0 4px 12px rgba(0,0,0,0.08)';
                                                    (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--prof-primary)';
                                                }}
                                                onMouseLeave={e => {
                                                    (e.currentTarget as HTMLDivElement).style.boxShadow = '0 2px 4px rgba(0,0,0,0.02)';
                                                    (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--prof-border)';
                                                }}
                                            >
                                                <div style={{ height: '120px', overflow: 'hidden', background: '#f1f5f9', flexShrink: 0 }}>
                                                    {exam.cover_image_url
                                                        ? <img src={exam.cover_image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                                                        : <div style={{ width: '100%', height: '100%', background: statusColor, opacity: 0.18 }} />
                                                    }
                                                </div>
                                                <div style={{ padding: '20px', flex: 1, display: 'flex', flexDirection: 'column' }}>
                                                    <p style={{ margin: '0 0 4px', fontSize: '0.75rem', color: 'var(--prof-text-muted)', fontWeight: 600, letterSpacing: '0.05em' }}>
                                                        {exam.code}
                                                    </p>
                                                    <h3 style={{ margin: '0 0 12px', fontSize: '1.05rem', color: 'var(--prof-text-main)', lineHeight: 1.3 }}>
                                                        {exam.title}
                                                    </h3>
                                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '12px' }}>
                                                        <span style={{ fontSize: '0.78rem', fontWeight: 600, color: statusColor, background: `${statusColor}18`, padding: '3px 8px', borderRadius: '99px' }}>
                                                            {statusLabel}
                                                        </span>
                                                        {!hasSubjects && (
                                                            <span style={{ fontSize: '0.78rem', color: '#ef4444', background: '#fef2f2', padding: '3px 8px', borderRadius: '99px', border: '1px solid #fee2e2' }}>
                                                                No subjects
                                                            </span>
                                                        )}
                                                        <span style={{ fontSize: '0.78rem', color: 'var(--prof-text-muted)', background: 'var(--prof-surface)', padding: '3px 8px', borderRadius: '99px', border: '1px solid var(--prof-border)' }}>
                                                            {exam.num_sets} set{exam.num_sets !== 1 ? 's' : ''} · {exam.max_attempts} attempt{exam.max_attempts !== 1 ? 's' : ''}
                                                        </span>
                                                    </div>
                                                    <div style={{ marginTop: 'auto', fontSize: '0.8rem', color: 'var(--prof-text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                        <svg fill="none" strokeWidth="2" stroke="currentColor" viewBox="0 0 24 24" width="13" height="13">
                                                            <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                                                        </svg>
                                                        View details
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            ) : (
                                <div style={{ borderRadius: '8px', border: '1px solid var(--prof-border)', overflow: 'hidden' }}>
                                    {group.exams.map((exam, idx) => {
                                        const statusColor = exam.is_completed ? '#475569' : exam.status === 'unlocked' ? '#16a34a' : '#f59e0b';
                                        const statusLabel = exam.is_completed ? 'Completed' : exam.status === 'unlocked' ? 'Unlocked' : 'Locked';
                                        const hasSubjects = exam.exam_subjects.length > 0;
                                        const isLast = idx === group.exams.length - 1;
                                        return (
                                            <div
                                                key={exam.id}
                                                onClick={() => navigate(`/professor/exams/${exam.id}`)}
                                                style={{
                                                    display: 'flex', alignItems: 'center', gap: '12px',
                                                    padding: '12px 16px', background: '#fff',
                                                    borderLeft: `3px solid ${statusColor}`,
                                                    borderBottom: isLast ? 'none' : '1px solid var(--prof-border)',
                                                    cursor: 'pointer', transition: 'background 0.12s',
                                                }}
                                                onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.background = 'var(--prof-surface)'}
                                                onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.background = '#fff'}
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
                                                    <span style={{ fontSize: '0.75rem', fontWeight: 600, color: statusColor, background: `${statusColor}18`, padding: '2px 8px', borderRadius: '99px' }}>
                                                        {statusLabel}
                                                    </span>
                                                    {!hasSubjects && (
                                                        <span style={{ fontSize: '0.75rem', color: '#ef4444', background: '#fef2f2', padding: '2px 8px', borderRadius: '99px', border: '1px solid #fee2e2' }}>
                                                            No subjects
                                                        </span>
                                                    )}
                                                </div>
                                                <span style={{ fontSize: '0.78rem', color: 'var(--prof-text-muted)', flexShrink: 0, whiteSpace: 'nowrap' }}>
                                                    {exam.num_sets} set{exam.num_sets !== 1 ? 's' : ''} · {exam.max_attempts} attempt{exam.max_attempts !== 1 ? 's' : ''}
                                                </span>
                                                <svg fill="none" strokeWidth="2" stroke="currentColor" viewBox="0 0 24 24" width="14" height="14" style={{ flexShrink: 0, color: 'var(--prof-text-muted)' }}>
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                                                </svg>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}

            <Toast isOpen={toast.open} message={toast.message} type={toast.type} onClose={closeToast} />
        </div>
    );
}
