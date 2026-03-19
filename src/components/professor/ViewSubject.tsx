import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { fetchSubjectWithOutcomes, deleteSubject } from '../../lib/subjects';
import type { SubjectWithOutcomes } from '../../lib/subjects';
import { fetchSubjectFaculty, addSubjectFaculty, removeSubjectFaculty, type SubjectFacultyMember } from '../../lib/subjectFaculty';
import { fetchProfessors, type Professor } from '../../lib/professors';
import { createSubjectInviteNotification, deleteNotificationBySubjectFacultyId } from '../../lib/notifications';
import { useAuth } from '../../contexts/AuthContext';
import { QuestionBankList } from './QuestionBankList';
import { Popup } from '../common/Popup';

type Tab = 'overview' | 'question-bank';

const TAB_LABELS: Record<Tab, string> = {
    overview: 'Overview',
    'question-bank': 'Question Bank',
};

const avatarColor = (name: string) => {
    const palette = ['#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#ef4444', '#0ea5e9'];
    return palette[(name.charCodeAt(0) + (name.charCodeAt(1) || 0)) % palette.length];
};

const initials = (name: string) =>
    name.split(' ').filter(Boolean).map(w => w[0]).slice(0, 2).join('').toUpperCase() || '?';

const StatusBadge = ({ status }: { status: SubjectFacultyMember['status'] }) => {
    if (status === 'accepted') return <span style={{ fontSize: '0.67rem', fontWeight: 600, background: '#dcfce7', color: '#15803d', border: '1px solid #86efac', borderRadius: '8px', padding: '1px 6px', flexShrink: 0 }}>Accepted</span>;
    if (status === 'declined') return <span style={{ fontSize: '0.67rem', fontWeight: 600, background: '#fee2e2', color: '#b91c1c', border: '1px solid #fca5a5', borderRadius: '8px', padding: '1px 6px', flexShrink: 0 }}>Declined</span>;
    return <span style={{ fontSize: '0.67rem', fontWeight: 600, background: '#fef9c3', color: '#854d0e', border: '1px solid #fde047', borderRadius: '8px', padding: '1px 6px', flexShrink: 0 }}>Pending</span>;
};

export function ViewSubject() {
    const { subjectId, tab } = useParams<{ subjectId: string; tab?: string }>();
    const navigate = useNavigate();
    const { user } = useAuth();

    const activeTab: Tab = tab === 'question-bank' ? 'question-bank' : 'overview';

    const [subject, setSubject] = useState<SubjectWithOutcomes | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [deletePopupOpen, setDeletePopupOpen] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);

    // Faculty state
    const [faculty, setFaculty] = useState<SubjectFacultyMember[]>([]);
    const [allProfessors, setAllProfessors] = useState<Professor[]>([]);
    const [isInviteOpen, setIsInviteOpen] = useState(false);
    const [professorQuery, setProfessorQuery] = useState('');
    const [inviteLoading, setInviteLoading] = useState<string | null>(null);
    const [invitePage, setInvitePage] = useState(0);

    useEffect(() => {
        if (!subjectId) return;
        setIsLoading(true);
        Promise.all([
            fetchSubjectWithOutcomes(subjectId),
            fetchSubjectFaculty(subjectId),
            fetchProfessors(),
        ]).then(([subjectResult, facultyResult, profsResult]) => {
            if (subjectResult.error || !subjectResult.data) {
                setError(subjectResult.error || 'Failed to load subject');
            } else {
                setSubject(subjectResult.data);
            }
            setFaculty(facultyResult.data);
            setAllProfessors(profsResult.data);
            setIsLoading(false);
        });
    }, [subjectId]);

    const handleDelete = async () => {
        if (!subjectId) return;
        setIsDeleting(true);
        const { error } = await deleteSubject(subjectId);
        if (error) {
            setError(error);
            setIsDeleting(false);
            setDeletePopupOpen(false);
            return;
        }
        navigate('/professor/subjects');
    };

    const handleRemoveFaculty = async (facultyId: string) => {
        await removeSubjectFaculty(facultyId);
        await deleteNotificationBySubjectFacultyId(facultyId);
        setFaculty(prev => prev.filter(f => f.id !== facultyId));
    };

    const handleInvite = async (prof: Professor) => {
        if (!subject || !user) return;
        setInviteLoading(prof.id);
        const { data: newFac, error: facErr } = await addSubjectFaculty(subject.id, prof.id);
        if (facErr || !newFac) { setInviteLoading(null); return; }
        await createSubjectInviteNotification({
            recipientId: prof.id,
            senderId: user.id,
            subjectId: subject.id,
            subjectTitle: subject.course_title,
            facultyId: newFac.id,
        });
        setFaculty(prev => [...prev, newFac]);
        setInviteLoading(null);
    };

    // Computed permissions
    const isMainProfessor = !!subject && subject.created_by === user?.id;
    const isAcceptedCohandler = faculty.some(f => f.professor_id === user?.id && f.status === 'accepted');
    const canManage = isMainProfessor || isAcceptedCohandler;

    if (isLoading) {
        return (
            <div className="create-subject-container">
                <div className="subjects-loading">
                    <p>Loading subject...</p>
                </div>
            </div>
        );
    }

    if (error || !subject) {
        return (
            <div className="create-subject-container">
                <p className="cs-error">{error || 'Subject not found.'}</p>
            </div>
        );
    }

    const sortedCOs = [...subject.course_outcomes].sort((a, b) => a.order_index - b.order_index);

    // Find creator profile from allProfessors
    const creatorProfile = allProfessors.find(p => p.id === subject.created_by);
    const creatorName = creatorProfile?.full_name ?? creatorProfile?.email ?? 'Unknown';

    return (
        <div className="create-subject-container">
            <div className="cs-header">
                <button type="button" className="btn-back" onClick={() => navigate('/professor/subjects')}>
                    <svg fill="none" strokeWidth="2" stroke="currentColor" viewBox="0 0 24 24" width="20" height="20"><path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18"></path></svg>
                    Back to Subjects
                </button>
                <h2 style={{ margin: 0 }}>{subject.course_title}</h2>
            </div>

            {/* Tab nav */}
            <div style={{ display: 'flex', borderBottom: '2px solid var(--prof-border)', marginBottom: '24px' }}>
                {(['overview', 'question-bank'] as Tab[]).map(t => {
                    const isActive = activeTab === t;
                    return (
                        <button
                            key={t}
                            onClick={() => navigate(`/professor/subjects/${subjectId}/${t}`)}
                            style={{
                                padding: '11px 20px',
                                border: 'none',
                                background: 'none',
                                cursor: 'pointer',
                                borderBottom: `2px solid ${isActive ? 'var(--prof-primary)' : 'transparent'}`,
                                marginBottom: '-2px',
                                color: isActive ? 'var(--prof-primary)' : 'var(--prof-text-muted)',
                                fontWeight: 600,
                                fontSize: '0.9rem',
                                transition: 'all 0.15s',
                            }}
                        >
                            {TAB_LABELS[t]}
                        </button>
                    );
                })}
            </div>

            {/* Overview tab */}
            {activeTab === 'overview' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: '20px', alignItems: 'start' }}>

                    {/* Left column: Syllabus Outcomes */}
                    <div className="cs-card" style={{ padding: 0, overflow: 'hidden' }}>
                        <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--prof-border)' }}>
                            <p style={{ margin: 0, fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--prof-text-muted)' }}>Syllabus Outcomes</p>
                        </div>
                        <div style={{ padding: '20px 24px' }}>
                            {sortedCOs.map((co, coIdx) => {
                                const sortedMOs = [...co.module_outcomes].sort((a, b) => a.order_index - b.order_index);
                                const isLast = coIdx === sortedCOs.length - 1;
                                return (
                                    <div key={co.id} style={{ display: 'flex', gap: '0', position: 'relative' }}>
                                        {/* Left spine */}
                                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0, width: '32px' }}>
                                            <div style={{ width: '11px', height: '11px', borderRadius: '50%', background: 'var(--prof-primary)', flexShrink: 0, marginTop: '5px', zIndex: 1 }} />
                                            {!isLast && (
                                                <div style={{ width: '2px', flex: 1, background: 'var(--prof-border)', minHeight: '24px' }} />
                                            )}
                                        </div>
                                        {/* CO content */}
                                        <div style={{ flex: 1, paddingBottom: isLast ? 0 : '28px' }}>
                                            <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginBottom: sortedMOs.length > 0 ? '12px' : 0 }}>
                                                <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--prof-primary)', textTransform: 'uppercase', letterSpacing: '0.05em', flexShrink: 0 }}>CO{coIdx + 1}</span>
                                                <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--prof-text-main)', lineHeight: '1.5', fontWeight: 500 }}>{co.description}</p>
                                            </div>
                                            {/* MOs */}
                                            {sortedMOs.map((mo, moIdx) => {
                                                const isLastMO = moIdx === sortedMOs.length - 1;
                                                return (
                                                    <div key={mo.id} style={{ display: 'flex', gap: '0', position: 'relative' }}>
                                                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0, width: '28px' }}>
                                                            <div style={{ width: '7px', height: '7px', borderRadius: '50%', background: 'var(--prof-border)', border: '1.5px solid var(--prof-primary)', opacity: 0.7, flexShrink: 0, marginTop: '6px', zIndex: 1 }} />
                                                            {!isLastMO && (
                                                                <div style={{ width: '1.5px', flex: 1, background: 'var(--prof-border)', minHeight: '8px' }} />
                                                            )}
                                                        </div>
                                                        <div style={{ flex: 1, paddingBottom: isLastMO ? 0 : '10px' }}>
                                                            <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                                                                <span style={{ fontSize: '0.67rem', fontWeight: 700, color: 'var(--prof-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', flexShrink: 0 }}>MO{coIdx + 1}{moIdx + 1}</span>
                                                                <p style={{ margin: 0, fontSize: '0.83rem', color: 'var(--prof-text-muted)', lineHeight: '1.5' }}>{mo.description}</p>
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* Right column: Actions + Details + Faculty */}
                    <div className="cs-card" style={{ padding: 0, overflow: 'hidden' }}>
                        {/* Action buttons */}
                        <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: '6px', borderBottom: '1px solid var(--prof-border)' }}>
                            {canManage && (
                                <button
                                    className="btn-secondary"
                                    style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '7px', padding: '7px 12px', fontSize: '0.83rem', justifyContent: 'flex-start' }}
                                    onClick={() => navigate(`/professor/subjects/${subjectId}/edit`)}
                                >
                                    <svg fill="none" strokeWidth="2" stroke="currentColor" viewBox="0 0 24 24" width="14" height="14"><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125" /></svg>
                                    Edit Subject
                                </button>
                            )}
                            {isMainProfessor && (
                                <button
                                    className="btn-secondary"
                                    style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '7px', padding: '7px 12px', fontSize: '0.83rem', justifyContent: 'flex-start', color: '#dc2626', borderColor: '#fca5a5' }}
                                    onClick={() => setDeletePopupOpen(true)}
                                >
                                    <svg fill="none" strokeWidth="2" stroke="currentColor" viewBox="0 0 24 24" width="14" height="14"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" /><path d="M10 11v6M14 11v6" /><path d="M9 6V4h6v2" /></svg>
                                    Delete Subject
                                </button>
                            )}
                        </div>

                        {/* Subject details */}
                        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--prof-border)' }}>
                            <p style={{ margin: '0 0 10px', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--prof-text-muted)' }}>Subject Details</p>
                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                                {[
                                    { label: 'Course Code', value: subject.course_code },
                                    { label: 'Course Outcomes', value: sortedCOs.length },
                                    { label: 'Created', value: new Date(subject.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) },
                                ].map(({ label, value }) => (
                                    <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '6px 0', borderBottom: '1px solid var(--prof-border)' }}>
                                        <span style={{ fontSize: '0.78rem', color: 'var(--prof-text-muted)', fontWeight: 500 }}>{label}</span>
                                        <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--prof-text-main)', textAlign: 'right' }}>{value}</span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Faculty section */}
                        <div style={{ padding: '12px 16px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                                <p style={{ margin: 0, fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--prof-text-muted)' }}>Faculty</p>
                                {isMainProfessor && (
                                    <button
                                        onClick={() => { setIsInviteOpen(true); setProfessorQuery(''); setInvitePage(0); }}
                                        style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.72rem', fontWeight: 600, background: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe', borderRadius: '6px', padding: '3px 9px', cursor: 'pointer', transition: 'background 0.15s' }}
                                    >
                                        <svg fill="none" strokeWidth="2" stroke="currentColor" viewBox="0 0 24 24" width="11" height="11"><path strokeLinecap="round" strokeLinejoin="round" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" /></svg>
                                        Invite
                                    </button>
                                )}
                            </div>

                            {/* Main professor */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '5px 0' }}>
                                <div style={{ flexShrink: 0, width: '26px', height: '26px', borderRadius: '50%', background: avatarColor(creatorName), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.6rem', fontWeight: 700, color: '#fff', letterSpacing: '0.02em' }}>
                                    {initials(creatorName)}
                                </div>
                                <span style={{ flex: 1, fontSize: '0.82rem', fontWeight: 500, color: 'var(--prof-text-main)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {creatorName}
                                    {subject.created_by === user?.id && <span style={{ color: 'var(--prof-text-muted)', fontWeight: 400 }}> (You)</span>}
                                </span>
                                <span style={{ fontSize: '0.67rem', fontWeight: 600, background: '#dbeafe', color: '#1e40af', border: '1px solid #93c5fd', borderRadius: '8px', padding: '1px 7px', flexShrink: 0 }}>Main</span>
                            </div>

                            {/* Co-handlers */}
                            {faculty.map(f => {
                                const fName = f.professor?.full_name ?? f.professor?.email ?? 'Unknown';
                                return (
                                    <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '5px 0', borderTop: '1px solid var(--prof-border)' }}>
                                        <div style={{ flexShrink: 0, width: '26px', height: '26px', borderRadius: '50%', background: avatarColor(fName), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.6rem', fontWeight: 700, color: '#fff', letterSpacing: '0.02em' }}>
                                            {initials(fName)}
                                        </div>
                                        <span style={{ flex: 1, fontSize: '0.82rem', color: 'var(--prof-text-main)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{fName}</span>
                                        <StatusBadge status={f.status} />
                                        {isMainProfessor && (
                                            <button
                                                onClick={() => handleRemoveFaculty(f.id)}
                                                title="Remove co-handler"
                                                style={{ flexShrink: 0, width: '22px', height: '22px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: '1px solid transparent', borderRadius: '5px', cursor: 'pointer', color: '#94a3b8', transition: 'all 0.15s' }}
                                                onMouseEnter={e => { e.currentTarget.style.background = '#fee2e2'; e.currentTarget.style.borderColor = '#fca5a5'; e.currentTarget.style.color = '#b91c1c'; }}
                                                onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.borderColor = 'transparent'; e.currentTarget.style.color = '#94a3b8'; }}
                                            >
                                                <svg fill="none" strokeWidth="2" stroke="currentColor" viewBox="0 0 24 24" width="12" height="12"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                                            </button>
                                        )}
                                    </div>
                                );
                            })}

                            {faculty.length === 0 && (
                                <p style={{ margin: '6px 0 0', fontSize: '0.78rem', color: 'var(--prof-text-muted)', fontStyle: 'italic' }}>No co-handlers invited yet.</p>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Question Bank tab */}
            {activeTab === 'question-bank' && <QuestionBankList embedded={true} canManage={canManage} />}

            <Popup
                isOpen={deletePopupOpen}
                title="Delete Subject"
                message={`Are you sure you want to delete "${subject.course_title}"? This will also delete all its course outcomes, module outcomes, and questions.`}
                type="danger"
                onConfirm={handleDelete}
                onCancel={() => setDeletePopupOpen(false)}
                confirmText={isDeleting ? 'Deleting...' : 'Delete'}
                cancelText="Cancel"
            />

            {/* Invite Modal */}
            {isInviteOpen && (() => {
                const invitedIds = new Set(faculty.map(f => f.professor_id));
                const filtered = allProfessors.filter(p =>
                    p.id !== subject.created_by &&
                    !invitedIds.has(p.id) &&
                    (professorQuery === '' ||
                        (p.full_name ?? '').toLowerCase().includes(professorQuery.toLowerCase()) ||
                        (p.email ?? '').toLowerCase().includes(professorQuery.toLowerCase()))
                );
                const PAGE_SIZE = 5;
                const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
                const safePage = Math.min(invitePage, totalPages - 1);
                const paged = filtered.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

                return (
                    <div
                        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(2px)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}
                        onClick={() => setIsInviteOpen(false)}
                    >
                        <div
                            style={{ background: '#fff', borderRadius: '16px', width: '100%', maxWidth: '500px', overflow: 'hidden', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04)' }}
                            onClick={e => e.stopPropagation()}
                        >
                            {/* Header */}
                            <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid #f1f5f9' }}>
                                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                        <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: '#eff6ff', border: '1px solid #bfdbfe', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                            <svg fill="none" strokeWidth="1.75" stroke="#2563eb" viewBox="0 0 24 24" width="20" height="20"><path strokeLinecap="round" strokeLinejoin="round" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" /></svg>
                                        </div>
                                        <div>
                                            <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#0f172a' }}>Invite Co-Handler</h3>
                                            <p style={{ margin: '2px 0 0', fontSize: '0.82rem', color: '#64748b' }}>Search and invite a professor to co-handle this subject.</p>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => setIsInviteOpen(false)}
                                        style={{ width: '30px', height: '30px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '7px', cursor: 'pointer', color: '#64748b', flexShrink: 0 }}
                                    >
                                        <svg fill="none" strokeWidth="2" stroke="currentColor" viewBox="0 0 24 24" width="14" height="14"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                                    </button>
                                </div>
                            </div>

                            {/* Search */}
                            <div style={{ padding: '14px 24px', borderBottom: '1px solid #f1f5f9' }}>
                                <div style={{ position: 'relative' }}>
                                    <svg style={{ position: 'absolute', left: '11px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} fill="none" strokeWidth="2" stroke="#94a3b8" viewBox="0 0 24 24" width="15" height="15"><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                                    <input
                                        className="cs-input-field"
                                        placeholder="Search by name or email…"
                                        value={professorQuery}
                                        onChange={e => { setProfessorQuery(e.target.value); setInvitePage(0); }}
                                        autoFocus
                                        style={{ width: '100%', boxSizing: 'border-box', paddingLeft: '34px' }}
                                    />
                                </div>
                            </div>

                            {/* List */}
                            <div style={{ minHeight: '260px' }}>
                                {filtered.length === 0 ? (
                                    <div style={{ padding: '48px 24px', textAlign: 'center' }}>
                                        <div style={{ width: '44px', height: '44px', borderRadius: '50%', background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 10px' }}>
                                            <svg fill="none" strokeWidth="1.5" stroke="#94a3b8" viewBox="0 0 24 24" width="22" height="22"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" /></svg>
                                        </div>
                                        <p style={{ margin: 0, fontSize: '0.88rem', fontWeight: 600, color: '#475569' }}>
                                            {professorQuery ? 'No professors found' : 'All professors invited'}
                                        </p>
                                        <p style={{ margin: '4px 0 0', fontSize: '0.78rem', color: '#94a3b8' }}>
                                            {professorQuery ? 'Try a different name or email.' : 'Every professor has already been invited.'}
                                        </p>
                                    </div>
                                ) : (
                                    paged.map((p, idx) => {
                                        const name = p.full_name ?? p.email ?? 'Unknown';
                                        const isLoading = inviteLoading === p.id;
                                        return (
                                            <div
                                                key={p.id}
                                                style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '11px 24px', borderBottom: idx < paged.length - 1 ? '1px solid #f1f5f9' : 'none' }}
                                            >
                                                <div style={{ flexShrink: 0, width: '36px', height: '36px', borderRadius: '50%', background: avatarColor(name), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', fontWeight: 700, color: '#fff', letterSpacing: '0.03em' }}>
                                                    {initials(name)}
                                                </div>
                                                <div style={{ flex: 1, minWidth: 0 }}>
                                                    <div style={{ fontSize: '0.88rem', fontWeight: 600, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</div>
                                                    <div style={{ fontSize: '0.75rem', color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.email ?? ''}</div>
                                                </div>
                                                <button
                                                    onClick={() => handleInvite(p)}
                                                    disabled={isLoading}
                                                    style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: '5px', padding: '6px 14px', fontSize: '0.8rem', fontWeight: 600, background: isLoading ? '#f1f5f9' : '#2563eb', color: isLoading ? '#94a3b8' : '#fff', border: 'none', borderRadius: '7px', cursor: isLoading ? 'default' : 'pointer', transition: 'background 0.15s' }}
                                                >
                                                    {isLoading ? (
                                                        <span style={{ display: 'inline-block', width: '13px', height: '13px', border: '2px solid #cbd5e1', borderTopColor: '#94a3b8', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
                                                    ) : (
                                                        <svg fill="none" strokeWidth="2.5" stroke="currentColor" viewBox="0 0 24 24" width="13" height="13"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
                                                    )}
                                                    {isLoading ? 'Inviting…' : 'Invite'}
                                                </button>
                                            </div>
                                        );
                                    })
                                )}
                            </div>

                            {/* Footer: pagination */}
                            {filtered.length > PAGE_SIZE && (
                                <div style={{ padding: '12px 24px', borderTop: '1px solid #f1f5f9', background: '#f8fafc', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <button
                                        onClick={() => setInvitePage(p => Math.max(0, p - 1))}
                                        disabled={safePage === 0}
                                        style={{ width: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '6px', cursor: safePage === 0 ? 'default' : 'pointer', color: safePage === 0 ? '#cbd5e1' : '#475569' }}
                                    >
                                        <svg fill="none" strokeWidth="2" stroke="currentColor" viewBox="0 0 24 24" width="13" height="13"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
                                    </button>
                                    <span style={{ fontSize: '0.78rem', color: '#64748b', minWidth: '72px', textAlign: 'center' }}>
                                        Page {safePage + 1} of {totalPages}
                                    </span>
                                    <button
                                        onClick={() => setInvitePage(p => Math.min(totalPages - 1, p + 1))}
                                        disabled={safePage >= totalPages - 1}
                                        style={{ width: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '6px', cursor: safePage >= totalPages - 1 ? 'default' : 'pointer', color: safePage >= totalPages - 1 ? '#cbd5e1' : '#475569' }}
                                    >
                                        <svg fill="none" strokeWidth="2" stroke="currentColor" viewBox="0 0 24 24" width="13" height="13"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                                    </button>
                                    <span style={{ fontSize: '0.75rem', color: '#94a3b8', marginLeft: '4px' }}>
                                        {filtered.length} professor{filtered.length !== 1 ? 's' : ''}
                                    </span>
                                </div>
                            )}
                        </div>
                    </div>
                );
            })()}
        </div>
    );
}
