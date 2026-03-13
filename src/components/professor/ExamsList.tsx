import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchExams } from '../../lib/exams';
import type { Exam } from '../../lib/exams';
import { Toast } from '../common/Toast';
import { printOMR } from '../../lib/printOMR';
import type { PaperSize, SizeUnit } from '../../lib/printExam';

const PAPER_SIZES: { value: PaperSize; label: string; desc: string }[] = [
    { value: 'A4',     label: 'A4',     desc: '210 × 297 mm' },
    { value: 'Letter', label: 'Letter', desc: '8.5 × 11 in' },
    { value: 'Legal',  label: 'Legal',  desc: '8.5 × 14 in' },
    { value: 'Long',   label: 'Long',   desc: '8.5 × 13 in' },
    { value: 'Custom', label: 'Custom', desc: 'Enter your own size' },
];
const SIZE_UNITS: { value: SizeUnit; label: string }[] = [
    { value: 'in', label: 'Inches (in)' },
    { value: 'cm', label: 'Centimeters (cm)' },
    { value: 'mm', label: 'Millimeters (mm)' },
];

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

    const [isOMRModalOpen, setIsOMRModalOpen] = useState(false);
    const [omrPaperSize, setOmrPaperSize] = useState<PaperSize>('Letter');
    const [omrCustomWidth, setOmrCustomWidth] = useState('');
    const [omrCustomHeight, setOmrCustomHeight] = useState('');
    const [omrCustomUnit, setOmrCustomUnit] = useState<SizeUnit>('in');

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
                <div style={{ display: 'flex', gap: '8px' }}>
                    <button className="btn-secondary" onClick={() => setIsOMRModalOpen(true)}>
                        Download OMR
                    </button>
                    <button className="btn-primary" onClick={() => navigate('/professor/exams/create')}>
                        + Create Exam
                    </button>
                </div>
            </div>

            {/* Search + filter bar */}
            {!isLoading && exams.length > 0 && (
                <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginBottom: '24px', flexWrap: 'nowrap' }}>
                    <div style={{ position: 'relative', flex: '1', minWidth: '0' }}>
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
                        <div style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'var(--prof-text-muted)' }}>
                            <svg fill="none" strokeWidth="2.5" stroke="currentColor" viewBox="0 0 24 24" width="14" height="14"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" /></svg>
                        </div>
                    </div>

                    <div style={{ position: 'relative', flexShrink: 0 }}>
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
                <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
                    {groupedExams.map(group => (
                        <div key={group.termString}>
                            <h3 style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--prof-text-muted)', marginBottom: '16px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                {group.termString}
                            </h3>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '16px' }}>
                                {group.exams.map(exam => {
                                    const statusColor = exam.status === 'unlocked' ? '#16a34a' : '#f59e0b';
                                    const statusLabel = exam.status === 'unlocked' ? 'Unlocked' : 'Locked';
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
                                            <div style={{ height: '4px', background: statusColor }} />
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
                        </div>
                    ))}
                </div>
            )}

            {isOMRModalOpen && (
                <div className="ql-summary-overlay" onClick={() => setIsOMRModalOpen(false)} style={{ zIndex: 2000 }}>
                    <div className="ql-summary-modal" style={{ maxWidth: '440px' }} onClick={e => e.stopPropagation()}>
                        <div className="ql-summary-header" style={{ padding: '20px 24px' }}>
                            <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--prof-text-main)', fontSize: '1.1rem' }}>
                                <svg fill="none" strokeWidth="2" stroke="currentColor" viewBox="0 0 24 24" width="20" height="20" style={{ color: 'var(--prof-primary)' }}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0110.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03.48.062.72.096m-.72-.096L17.66 18m0 0l.229 2.523a1.125 1.125 0 01-1.12 1.227H7.231c-.662 0-1.18-.568-1.12-1.227L6.34 18m11.318 0h1.091A2.25 2.25 0 0021 15.75V9.456c0-1.081-.768-2.015-1.837-2.175a48.055 48.055 0 00-1.913-.247M6.34 18H5.25A2.25 2.25 0 013 15.75V9.456c0-1.081.768-2.015 1.837-2.175a48.041 48.041 0 011.913-.247m10.5 0a48.536 48.536 0 00-10.5 0m10.5 0V3.375c0-.621-.504-1.125-1.125-1.125h-8.25c-.621 0-1.125.504-1.125 1.125v3.659M18 10.5h.008v.008H18V10.5zm-3 0h.008v.008H15V10.5z" />
                                </svg>
                                Download OMR
                            </h3>
                            <button className="ql-summary-close" onClick={() => setIsOMRModalOpen(false)}>
                                <svg fill="none" strokeWidth="2" stroke="currentColor" viewBox="0 0 24 24" width="18" height="18"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                            </button>
                        </div>
                        <div style={{ padding: '24px' }}>
                            <p style={{ fontSize: '0.95rem', color: 'var(--prof-text-muted)', marginBottom: '20px', marginTop: 0 }}>
                                Select your preferred paper size.
                            </p>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
                                {PAPER_SIZES.filter(p => p.value !== 'Custom').map(({ value, label, desc }) => {
                                    const isSelected = omrPaperSize === value;
                                    return (
                                        <label key={value} style={{ display: 'flex', alignItems: 'center', padding: '12px 14px', borderRadius: '10px', border: `2px solid ${isSelected ? 'var(--prof-primary)' : 'var(--prof-border)'}`, backgroundColor: isSelected ? 'rgba(15, 37, 84, 0.04)' : 'var(--prof-surface)', cursor: 'pointer', transition: 'all 0.2s ease' }}>
                                            <div style={{ position: 'relative', width: '20px', height: '20px', borderRadius: '50%', border: `2px solid ${isSelected ? 'var(--prof-primary)' : '#cbd5e1'}`, marginRight: '12px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', boxSizing: 'border-box' }}>
                                                {isSelected && <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: '10px', height: '10px', borderRadius: '50%', backgroundColor: 'var(--prof-primary)' }} />}
                                            </div>
                                            <input type="radio" name="omr-paper-size" value={value} checked={isSelected} onChange={() => setOmrPaperSize(value)} style={{ display: 'none' }} />
                                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                                                <span style={{ fontWeight: 600, fontSize: '0.9rem', color: isSelected ? 'var(--prof-primary)' : 'var(--prof-text-main)' }}>{label}</span>
                                                <span style={{ fontSize: '0.75rem', color: 'var(--prof-text-muted)', marginTop: '1px' }}>{desc}</span>
                                            </div>
                                        </label>
                                    );
                                })}
                            </div>
                            {(() => {
                                const { value, label, desc } = PAPER_SIZES.find(p => p.value === 'Custom')!;
                                const isSelected = omrPaperSize === value;
                                const isValid = omrPaperSize !== 'Custom' || (parseFloat(omrCustomWidth) > 0 && parseFloat(omrCustomHeight) > 0);
                                return (
                                    <div>
                                        <label style={{ display: 'flex', alignItems: 'center', padding: '12px 14px', borderRadius: '10px', border: `2px solid ${isSelected ? 'var(--prof-primary)' : 'var(--prof-border)'}`, backgroundColor: isSelected ? 'rgba(15, 37, 84, 0.04)' : 'var(--prof-surface)', cursor: 'pointer', transition: 'all 0.2s ease' }}>
                                            <div style={{ width: '18px', height: '18px', borderRadius: '50%', border: `2px solid ${isSelected ? 'var(--prof-primary)' : '#cbd5e1'}`, marginRight: '10px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                {isSelected && <div style={{ width: '9px', height: '9px', borderRadius: '50%', backgroundColor: 'var(--prof-primary)' }} />}
                                            </div>
                                            <input type="radio" name="omr-paper-size" value={value} checked={isSelected} onChange={() => setOmrPaperSize(value)} style={{ display: 'none' }} />
                                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                                                <span style={{ fontWeight: 600, fontSize: '0.9rem', color: isSelected ? 'var(--prof-primary)' : 'var(--prof-text-main)' }}>{label}</span>
                                                <span style={{ fontSize: '0.75rem', color: 'var(--prof-text-muted)', marginTop: '1px' }}>{desc}</span>
                                            </div>
                                        </label>
                                        {isSelected && (
                                            <div style={{ marginTop: '10px', padding: '16px', background: 'var(--prof-bg)', borderRadius: '8px', border: '1px solid var(--prof-border)' }}>
                                                <p style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--prof-text-muted)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Unit</p>
                                                <div style={{ display: 'flex', gap: '8px', marginBottom: '14px' }}>
                                                    {SIZE_UNITS.map(u => (
                                                        <button key={u.value} type="button" onClick={() => setOmrCustomUnit(u.value)}
                                                            style={{ padding: '6px 14px', borderRadius: '6px', fontSize: '0.85rem', fontWeight: omrCustomUnit === u.value ? 600 : 400, border: `1.5px solid ${omrCustomUnit === u.value ? 'var(--prof-primary)' : 'var(--prof-border)'}`, background: omrCustomUnit === u.value ? 'rgba(15,37,84,0.06)' : 'var(--prof-surface)', color: omrCustomUnit === u.value ? 'var(--prof-primary)' : 'var(--prof-text-muted)', cursor: 'pointer' }}>
                                                            {u.label}
                                                        </button>
                                                    ))}
                                                </div>
                                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                                                    {([{ label: 'Width', val: omrCustomWidth, set: setOmrCustomWidth }, { label: 'Height', val: omrCustomHeight, set: setOmrCustomHeight }] as const).map(({ label, val, set }) => (
                                                        <div key={label}>
                                                            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--prof-text-muted)', marginBottom: '5px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</label>
                                                            <div style={{ display: 'flex', alignItems: 'center', border: '1.5px solid var(--prof-border)', borderRadius: '7px', overflow: 'hidden', background: 'var(--prof-surface)' }}>
                                                                <input type="number" min="1" step="0.1" placeholder="e.g. 8.5" value={val} onChange={e => set(e.target.value)}
                                                                    style={{ flex: 1, border: 'none', outline: 'none', padding: '8px 10px', fontSize: '0.9rem', background: 'transparent', color: 'var(--prof-text-main)' }} />
                                                                <span style={{ padding: '0 10px', fontSize: '0.8rem', color: 'var(--prof-text-muted)', borderLeft: '1px solid var(--prof-border)' }}>{omrCustomUnit}</span>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                        <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
                                            <button className="btn-secondary" style={{ flex: 1, padding: '12px' }} onClick={() => setIsOMRModalOpen(false)}>Cancel</button>
                                            <button className="btn-primary" style={{ flex: 1, padding: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }} disabled={!isValid}
                                                onClick={() => {
                                                    setIsOMRModalOpen(false);
                                                    printOMR({ paperSize: omrPaperSize, customWidth: parseFloat(omrCustomWidth), customHeight: parseFloat(omrCustomHeight), customUnit: omrCustomUnit });
                                                }}>
                                                <svg fill="none" strokeWidth="2" stroke="currentColor" viewBox="0 0 24 24" width="18" height="18">
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m3.75 9v6m3-3H9m1.5-12H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                                                </svg>
                                                Generate PDF
                                            </button>
                                        </div>
                                    </div>
                                );
                            })()}
                        </div>
                    </div>
                </div>
            )}

            <Toast isOpen={toast.open} message={toast.message} type={toast.type} onClose={closeToast} />
        </div>
    );
}
