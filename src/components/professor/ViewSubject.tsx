import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { fetchSubjectWithOutcomes, deleteSubject } from '../../lib/subjects';
import type { SubjectWithOutcomes } from '../../lib/subjects';
import { QuestionBankList } from './QuestionBankList';
import { Popup } from '../common/Popup';

type Tab = 'overview' | 'question-bank';

const TAB_LABELS: Record<Tab, string> = {
    overview: 'Overview',
    'question-bank': 'Question Bank',
};

export function ViewSubject() {
    const { subjectId, tab } = useParams<{ subjectId: string; tab?: string }>();
    const navigate = useNavigate();

    const activeTab: Tab = tab === 'question-bank' ? 'question-bank' : 'overview';

    const [subject, setSubject] = useState<SubjectWithOutcomes | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [deletePopupOpen, setDeletePopupOpen] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);

    useEffect(() => {
        if (!subjectId) return;
        setIsLoading(true);
        fetchSubjectWithOutcomes(subjectId).then(({ data, error }) => {
            if (error || !data) {
                setError(error || 'Failed to load subject');
            } else {
                setSubject(data);
            }
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
                                fontWeight: isActive ? 700 : 500,
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
                        <div style={{ padding: '12px 16px' }}>
                            {sortedCOs.map((co, coIdx) => (
                                <div
                                    key={co.id}
                                    style={{
                                        marginBottom: coIdx < sortedCOs.length - 1 ? '16px' : 0,
                                        paddingBottom: coIdx < sortedCOs.length - 1 ? '16px' : 0,
                                        borderBottom: coIdx < sortedCOs.length - 1 ? '1px solid var(--prof-border)' : 'none',
                                    }}
                                >
                                    <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', marginBottom: '8px' }}>
                                        <span className="co-badge">CO{coIdx + 1}</span>
                                        <p style={{ margin: 0, flex: 1, fontSize: '0.9rem', color: 'var(--prof-text-main)', lineHeight: '1.5' }}>{co.description}</p>
                                    </div>
                                    <div style={{ paddingLeft: '8px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                        {[...co.module_outcomes]
                                            .sort((a, b) => a.order_index - b.order_index)
                                            .map((mo, moIdx) => (
                                                <div key={mo.id} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                                                    <span className="mo-badge">MO{coIdx + 1}{moIdx + 1}</span>
                                                    <p style={{ margin: 0, flex: 1, fontSize: '0.83rem', color: 'var(--prof-text-muted)', lineHeight: '1.5' }}>{mo.description}</p>
                                                </div>
                                            ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Right column: Actions + Details */}
                    <div className="cs-card" style={{ padding: 0, overflow: 'hidden' }}>
                        {/* Action buttons */}
                        <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: '6px', borderBottom: '1px solid var(--prof-border)' }}>
                            <button
                                className="btn-secondary"
                                style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '7px', padding: '7px 12px', fontSize: '0.83rem', justifyContent: 'flex-start' }}
                                onClick={() => navigate(`/professor/subjects/${subjectId}/edit`)}
                            >
                                <svg fill="none" strokeWidth="2" stroke="currentColor" viewBox="0 0 24 24" width="14" height="14"><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125" /></svg>
                                Edit Subject
                            </button>
                            <button
                                className="btn-secondary"
                                style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '7px', padding: '7px 12px', fontSize: '0.83rem', justifyContent: 'flex-start', color: '#dc2626', borderColor: '#fca5a5' }}
                                onClick={() => setDeletePopupOpen(true)}
                            >
                                <svg fill="none" strokeWidth="2" stroke="currentColor" viewBox="0 0 24 24" width="14" height="14"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" /><path d="M10 11v6M14 11v6" /><path d="M9 6V4h6v2" /></svg>
                                Delete Subject
                            </button>
                        </div>

                        {/* Subject details */}
                        <div style={{ padding: '12px 16px' }}>
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
                    </div>
                </div>
            )}

            {/* Question Bank tab */}
            {activeTab === 'question-bank' && <QuestionBankList embedded={true} />}

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
        </div>
    );
}
