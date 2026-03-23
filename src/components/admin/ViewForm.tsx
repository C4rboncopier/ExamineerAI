import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import * as XLSX from 'xlsx';
import {
    fetchFormById, fetchFormSubmissions, deleteForm,
    closeForm, processLateSubmissions, formatPHT,
} from '../../lib/forms';
import type { Form, FormSubmission } from '../../lib/forms';
import { Popup } from '../common/Popup';

function getWindowStatus(form: Form): 'open' | 'upcoming' | 'closed' {
    const now = Date.now();
    const start = new Date(form.submission_start).getTime();
    const end = new Date(form.submission_end).getTime();
    if (now < start) return 'upcoming';
    if (now > end) return 'closed';
    return 'open';
}

export function AdminViewForm() {
    const { formId } = useParams<{ formId: string }>();
    const navigate = useNavigate();

    const [form, setForm] = useState<Form | null>(null);
    const [submissions, setSubmissions] = useState<FormSubmission[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [deleteOpen, setDeleteOpen] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [processing, setProcessing] = useState(false);
    const [processResult, setProcessResult] = useState<{ count: number; errors: string[] } | null>(null);
    const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
    const [subSearch, setSubSearch] = useState('');
    const [subPage, setSubPage] = useState(1);
    const SUB_PAGE_SIZE = 10;
    const [isDetailsOpen, setIsDetailsOpen] = useState(false);
    const [closeConfirmOpen, setCloseConfirmOpen] = useState(false);

    useEffect(() => {
        if (!formId) return;
        Promise.all([fetchFormById(formId), fetchFormSubmissions(formId)]).then(
            ([formRes, subsRes]) => {
                if (formRes.data) setForm(formRes.data);
                setSubmissions(subsRes.data);
                setIsLoading(false);
            },
        );
    }, [formId]);

    function showToast(msg: string, type: 'success' | 'error') {
        setToast({ msg, type });
        setTimeout(() => setToast(null), 3500);
    }

    const examCounts = useMemo(() => {
        const counts: Record<string, number> = {};
        for (const sub of submissions) {
            for (const eid of sub.selected_exam_ids) {
                counts[eid] = (counts[eid] ?? 0) + 1;
            }
        }
        return counts;
    }, [submissions]);

    const filteredSubs = useMemo(() => {
        const q = subSearch.toLowerCase().trim();
        setSubPage(1);
        if (!q) return submissions;
        return submissions.filter(
            s =>
                (s.student?.full_name ?? '').toLowerCase().includes(q) ||
                (s.student?.student_id ?? '').toLowerCase().includes(q) ||
                (s.student?.email ?? '').toLowerCase().includes(q),
        );
    }, [submissions, subSearch]);

    const totalSubPages = Math.max(1, Math.ceil(filteredSubs.length / SUB_PAGE_SIZE));
    const pagedSubs = filteredSubs.slice((subPage - 1) * SUB_PAGE_SIZE, subPage * SUB_PAGE_SIZE);

    async function handleDelete() {
        if (!formId) return;
        setIsDeleting(true);
        const { error } = await deleteForm(formId);
        if (error) {
            showToast('Failed to delete form.', 'error');
            setIsDeleting(false);
            setDeleteOpen(false);
        } else {
            navigate('/admin/forms');
        }
    }

    async function handleCloseForm() {
        if (!formId) return;
        setCloseConfirmOpen(false);
        const { error } = await closeForm(formId);
        if (error) {
            showToast('Failed to close form.', 'error');
        } else {
            showToast('Form closed successfully.', 'success');
            const { data } = await fetchFormById(formId);
            if (data) setForm(data);
        }
    }

    async function handleProcess() {
        if (!formId) return;
        setProcessing(true);
        setProcessResult(null);
        const result = await processLateSubmissions(formId);
        setProcessResult({ count: result.processed, errors: result.errors });
        setProcessing(false);
        if (result.errors.length === 0) {
            showToast(`Done — ${result.processed} attempt(s) marked as Did Not Take.`, 'success');
        } else {
            showToast(`Completed with ${result.errors.length} error(s).`, 'error');
        }
    }

    function downloadXlsx() {
        if (!form) return;
        const examsInForm = form.form_exams ?? [];
        if (examsInForm.length === 0) return;

        // Build per-exam student lists, sorted by surname
        const groups = examsInForm.map(fe => {
            const exam = fe.exams;
            const examSubs = submissions.filter(s => s.selected_exam_ids.includes(fe.exam_id));
            const students = examSubs.map(s => {
                // Prefer explicit first_name/last_name; fallback to splitting full_name
                let surname: string, firstName: string;
                if (s.student?.last_name || s.student?.first_name) {
                    surname = s.student.last_name ?? '';
                    firstName = s.student.first_name ?? '';
                } else {
                    const full = (s.student?.full_name ?? s.student?.username ?? '').trim();
                    if (full.includes(', ')) {
                        const idx = full.indexOf(', ');
                        surname = full.slice(0, idx);
                        firstName = full.slice(idx + 2);
                    } else {
                        const parts = full.split(' ');
                        surname = parts.length > 1 ? parts[parts.length - 1] : full;
                        firstName = parts.length > 1 ? parts.slice(0, -1).join(' ') : '';
                    }
                }
                return { surname, firstName };
            }).sort((a, b) => a.surname.localeCompare(b.surname));

            return { title: exam?.code ?? fe.exam_id, students };
        });

        const maxStudents = groups.reduce((m, g) => Math.max(m, g.students.length), 0);
        const numRows = maxStudents + 2; // title row + header row + students

        // Place groups side-by-side: 3 cols each (No. | Surname | First Name), 1 blank col gap
        const grid: (string | number)[][] = Array.from({ length: numRows }, () => []);

        groups.forEach((group, gi) => {
            const col = gi * 4;
            for (let r = 0; r < numRows; r++) {
                while (grid[r].length < col + 3) grid[r].push('');
            }
            grid[0][col] = group.title;
            grid[1][col] = 'No.';
            grid[1][col + 1] = 'Surname';
            grid[1][col + 2] = 'First Name';
            group.students.forEach((s, si) => {
                grid[2 + si][col] = si + 1;
                grid[2 + si][col + 1] = s.surname;
                grid[2 + si][col + 2] = s.firstName;
            });
        });

        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.aoa_to_sheet(grid);

        const colWidths: { wch: number }[] = [];
        groups.forEach((_, gi) => {
            colWidths[gi * 4]     = { wch: 5 };
            colWidths[gi * 4 + 1] = { wch: 20 };
            colWidths[gi * 4 + 2] = { wch: 22 };
            if (gi < groups.length - 1) colWidths[gi * 4 + 3] = { wch: 4 };
        });
        ws['!cols'] = colWidths;

        XLSX.utils.book_append_sheet(wb, ws, 'Summary');

        const safeName = form.title.replace(/[\\/:*?"<>|]/g, '_').slice(0, 50);
        XLSX.writeFile(wb, `${safeName}_Attempt${form.attempt_number}_Summary.xlsx`);
    }

    if (isLoading || !form) {
        return (
            <div className="qb-container create-question-wrapper" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" style={{ animation: 'spin 1s linear infinite' }}>
                    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                </svg>
            </div>
        );
    }

    const ws = getWindowStatus(form);
    const wsLabel = ws === 'open' ? 'Open' : ws === 'upcoming' ? 'Upcoming' : 'Closed';
    const wsColor = ws === 'open' ? '#15803d' : ws === 'upcoming' ? '#d97706' : '#475569';
    const wsBg = ws === 'open' ? '#dcfce7' : ws === 'upcoming' ? '#fef9c3' : '#f1f5f9';
    const examsInForm = form.form_exams ?? [];
    const total = submissions.length;

    return (
        <div className="subjects-container">
            {/* Toast */}
            {toast && (
                <div style={{ position: 'fixed', top: '20px', right: '20px', zIndex: 9999, padding: '12px 20px', borderRadius: '10px', fontSize: '0.875rem', fontWeight: 600, color: '#fff', background: toast.type === 'success' ? '#15803d' : '#b91c1c', boxShadow: '0 4px 20px rgba(0,0,0,0.18)' }}>
                    {toast.msg}
                </div>
            )}

            {/* Back */}
            <button type="button" className="btn-back" onClick={() => navigate('/admin/forms')}>
                <svg fill="none" strokeWidth="2" stroke="currentColor" viewBox="0 0 24 24" width="20" height="20">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
                </svg>
                Back to Forms
            </button>

            {/* Page header */}
            <div className="subjects-header" style={{ marginBottom: '24px', alignItems: 'flex-start' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '6px' }}>
                        <span style={{ fontSize: '0.7rem', fontWeight: 700, color: wsColor, background: wsBg, padding: '2px 10px', borderRadius: '99px', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                            {wsLabel}
                        </span>
                        <span style={{ fontSize: '0.7rem', fontWeight: 600, color: '#64748b', background: '#f1f5f9', padding: '2px 10px', borderRadius: '99px' }}>
                            Attempt {form.attempt_number}
                        </span>
                        <span style={{ fontSize: '0.7rem', fontWeight: 600, color: '#64748b', background: '#f1f5f9', padding: '2px 10px', borderRadius: '99px' }}>
                            {form.academic_year} · {form.term}
                        </span>
                    </div>
                    <h2 className="subjects-title" style={{ margin: 0 }}>{form.title}</h2>
                    {form.description && (
                        <p style={{ margin: '4px 0 0', fontSize: '0.875rem', color: 'var(--prof-text-muted)', lineHeight: 1.5 }}>{form.description}</p>
                    )}
                </div>
                <div style={{ display: 'flex', gap: '8px', flexShrink: 0, flexWrap: 'wrap' }}>
                    {ws !== 'closed' && (
                        <button
                            onClick={() => setCloseConfirmOpen(true)}
                            style={{ padding: '8px 16px', background: '#fff7ed', color: '#c2410c', border: '1.5px solid #fed7aa', borderRadius: '8px', fontSize: '0.83rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
                        >
                            <svg fill="none" strokeWidth="2" stroke="currentColor" viewBox="0 0 24 24" width="14" height="14"><path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" /></svg>
                            Close Form
                        </button>
                    )}
                    {ws === 'closed' && (
                        <button
                            onClick={downloadXlsx}
                            style={{ padding: '8px 16px', background: '#f0fdf4', color: '#15803d', border: '1.5px solid #bbf7d0', borderRadius: '8px', fontSize: '0.83rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
                        >
                            <svg fill="none" strokeWidth="2" stroke="currentColor" viewBox="0 0 24 24" width="14" height="14"><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" /></svg>
                            Download Summary
                        </button>
                    )}
                    <button
                        onClick={() => navigate(`/admin/forms/edit/${form.id}`)}
                        style={{ padding: '8px 16px', background: '#f8fafc', color: 'var(--prof-text-main)', border: '1.5px solid var(--prof-border)', borderRadius: '8px', fontSize: '0.83rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
                    >
                        <svg fill="none" strokeWidth="2" stroke="currentColor" viewBox="0 0 24 24" width="14" height="14"><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" /></svg>
                        Edit
                    </button>
                    <button
                        onClick={() => setDeleteOpen(true)}
                        style={{ padding: '8px 16px', background: '#fff5f5', color: '#b91c1c', border: '1.5px solid #fca5a5', borderRadius: '8px', fontSize: '0.83rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
                    >
                        <svg fill="none" strokeWidth="2" stroke="currentColor" viewBox="0 0 24 24" width="14" height="14"><path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" /></svg>
                        Delete
                    </button>
                </div>
            </div>

            {/* Stat row */}
            <div className="vf-stat-grid" style={{ gap: '12px', marginBottom: '20px' }}>
                {[
                    {
                        label: 'Total Submissions', value: total,
                        icon: <svg fill="none" strokeWidth="1.8" stroke="currentColor" viewBox="0 0 24 24" width="18" height="18"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" /></svg>,
                        color: 'var(--prof-primary)', bg: '#f0f9ff',
                    },
                    {
                        label: 'Exams in Form', value: examsInForm.length,
                        icon: <svg fill="none" strokeWidth="1.8" stroke="currentColor" viewBox="0 0 24 24" width="18" height="18"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25z" /></svg>,
                        color: '#7c3aed', bg: '#f5f3ff',
                    },
                    {
                        label: 'Exam Date', value: new Date(form.exam_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
                        icon: <svg fill="none" strokeWidth="1.8" stroke="currentColor" viewBox="0 0 24 24" width="18" height="18"><path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 9v7.5" /></svg>,
                        color: '#0369a1', bg: '#f0f9ff',
                    },
                    {
                        label: 'Window Status', value: wsLabel,
                        icon: <svg fill="none" strokeWidth="1.8" stroke="currentColor" viewBox="0 0 24 24" width="18" height="18"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
                        color: wsColor, bg: wsBg,
                    },
                ].map(stat => (
                    <div key={stat.label} style={{ background: '#fff', border: '1px solid var(--prof-border)', borderRadius: '10px', padding: '14px 18px', display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                        <div style={{ flexShrink: 0, width: '36px', height: '36px', background: stat.bg, borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: stat.color }}>
                            {stat.icon}
                        </div>
                        <div>
                            <p style={{ margin: '0 0 2px', fontSize: '0.69rem', fontWeight: 600, color: 'var(--prof-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{stat.label}</p>
                            <p style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: 'var(--prof-text-main)', lineHeight: 1.2 }}>{stat.value}</p>
                        </div>
                    </div>
                ))}
            </div>

            {/* Two-column layout */}
            <div className="vf-overview-grid">

                {/* ── Left: Overview ── */}
                <div className="vf-main-col" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

                    {/* Exam breakdown */}
                    <div className="cs-card" style={{ padding: '18px 20px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
                            <h3 className="cs-card-title" style={{ margin: 0 }}>Exam Breakdown</h3>
                            <span style={{ fontSize: '0.75rem', color: 'var(--prof-text-muted)' }}>{examsInForm.length} exam{examsInForm.length !== 1 ? 's' : ''}</span>
                        </div>
                        {examsInForm.length === 0 ? (
                            <p style={{ fontSize: '0.83rem', color: 'var(--prof-text-muted)', margin: 0 }}>No exams in this form.</p>
                        ) : (
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                                <thead>
                                    <tr style={{ borderBottom: '1.5px solid var(--prof-border)' }}>
                                        <th style={{ textAlign: 'left', padding: '5px 10px 5px 0', fontWeight: 700, fontSize: '0.69rem', color: 'var(--prof-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Code</th>
                                        <th style={{ textAlign: 'left', padding: '5px 10px', fontWeight: 700, fontSize: '0.69rem', color: 'var(--prof-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Exam</th>
                                        <th style={{ textAlign: 'right', padding: '5px 0 5px 10px', fontWeight: 700, fontSize: '0.69rem', color: 'var(--prof-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>Submissions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {examsInForm.map(fe => {
                                        const exam = fe.exams;
                                        const count = examCounts[fe.exam_id] ?? 0;
                                        return (
                                            <tr key={fe.exam_id} style={{ borderBottom: '1px solid var(--prof-border)' }}>
                                                <td style={{ padding: '7px 10px 7px 0', verticalAlign: 'middle' }}>
                                                    <span style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--prof-text-muted)', background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: '4px', padding: '2px 6px', whiteSpace: 'nowrap' }}>
                                                        {exam?.code ?? '—'}
                                                    </span>
                                                </td>
                                                <td style={{ padding: '7px 10px', verticalAlign: 'middle', color: 'var(--prof-text-main)', fontWeight: 500 }}>
                                                    {exam?.title ?? fe.exam_id}
                                                </td>
                                                <td style={{ padding: '7px 0 7px 10px', textAlign: 'right', verticalAlign: 'middle', whiteSpace: 'nowrap' }}>
                                                    <span style={{ fontWeight: 700, color: count > 0 ? 'var(--prof-primary)' : '#94a3b8' }}>{count}</span>
                                                    <span style={{ color: 'var(--prof-text-muted)', fontSize: '0.75rem' }}> / {total}</span>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        )}
                    </div>

                    {/* Submissions table */}
                    <div className="cs-card" style={{ padding: '18px 20px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px', gap: '12px', flexWrap: 'wrap' }}>
                            <h3 className="cs-card-title" style={{ margin: 0 }}>
                                Submissions
                                <span style={{ marginLeft: '8px', fontSize: '0.75rem', fontWeight: 600, color: '#475569', background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '1px 8px' }}>
                                    {total}
                                </span>
                            </h3>
                            <div style={{ position: 'relative', width: '280px' }}>
                                <svg fill="none" strokeWidth="2" stroke="currentColor" viewBox="0 0 24 24" width="13" height="13" style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--prof-text-muted)', pointerEvents: 'none' }}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                                </svg>
                                <input
                                    type="text"
                                    placeholder="Search by name, ID, or email..."
                                    value={subSearch}
                                    onChange={e => setSubSearch(e.target.value)}
                                    style={{ width: '100%', padding: '7px 10px 7px 30px', borderRadius: '7px', border: '1.5px solid var(--prof-border)', background: '#fff', color: 'var(--prof-text-main)', fontSize: '0.8rem', outline: 'none', boxSizing: 'border-box' }}
                                />
                            </div>
                        </div>

                        {total === 0 ? (
                            <p style={{ fontSize: '0.83rem', color: 'var(--prof-text-muted)', margin: 0 }}>No submissions yet.</p>
                        ) : filteredSubs.length === 0 ? (
                            <p style={{ fontSize: '0.83rem', color: 'var(--prof-text-muted)', margin: 0 }}>No results for "{subSearch}".</p>
                        ) : (
                            <>
                                <div style={{ overflowX: 'auto' }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.83rem' }}>
                                        <thead>
                                            <tr style={{ borderBottom: '1.5px solid var(--prof-border)' }}>
                                                <th style={{ textAlign: 'left', padding: '7px 12px 7px 0', fontWeight: 700, fontSize: '0.69rem', color: 'var(--prof-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>Student</th>
                                                <th style={{ textAlign: 'left', padding: '7px 12px', fontWeight: 700, fontSize: '0.69rem', color: 'var(--prof-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>Selected Exams</th>
                                                <th style={{ textAlign: 'right', padding: '7px 0 7px 12px', fontWeight: 700, fontSize: '0.69rem', color: 'var(--prof-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>Submitted</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {pagedSubs.map(sub => {
                                                const selectedExams = sub.selected_exam_ids
                                                    .map(eid => examsInForm.find(fe => fe.exam_id === eid)?.exams)
                                                    .filter(Boolean);
                                                return (
                                                    <tr key={sub.id} style={{ borderBottom: '1px solid var(--prof-border)' }}>
                                                        <td style={{ padding: '10px 12px 10px 0', verticalAlign: 'top' }}>
                                                            <div style={{ fontWeight: 600, color: 'var(--prof-text-main)', fontSize: '0.85rem', lineHeight: 1.3 }}>
                                                                {sub.student?.full_name ?? sub.student?.username ?? '—'}
                                                            </div>
                                                            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '2px' }}>
                                                                {sub.student?.student_id && (
                                                                    <span className="vf-hide-mobile" style={{ fontFamily: 'monospace', fontSize: '0.72rem', color: 'var(--prof-text-muted)' }}>
                                                                        {sub.student.student_id}
                                                                    </span>
                                                                )}
                                                                {sub.student?.email && (
                                                                    <span className="vf-hide-mobile" style={{ fontSize: '0.72rem', color: 'var(--prof-text-muted)' }}>
                                                                        · {sub.student.email}
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </td>
                                                        <td style={{ padding: '10px 12px', verticalAlign: 'top' }}>
                                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                                                                {selectedExams.length === 0 ? (
                                                                    <span style={{ color: '#94a3b8', fontSize: '0.78rem' }}>—</span>
                                                                ) : selectedExams.map((exam, i) => (
                                                                    <span key={i} style={{ fontSize: '0.71rem', fontWeight: 600, color: 'var(--prof-primary)', background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: '5px', padding: '2px 7px', whiteSpace: 'nowrap' }}>
                                                                        {exam?.code ?? '?'}
                                                                    </span>
                                                                ))}
                                                            </div>
                                                        </td>
                                                        <td style={{ padding: '10px 0 10px 12px', textAlign: 'right', verticalAlign: 'top', color: 'var(--prof-text-muted)', fontSize: '0.77rem', whiteSpace: 'nowrap' }}>
                                                            {new Date(sub.submitted_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                                {totalSubPages > 1 && (
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '14px', paddingTop: '12px', borderTop: '1px solid var(--prof-border)' }}>
                                        <span style={{ fontSize: '0.78rem', color: 'var(--prof-text-muted)' }}>
                                            {(subPage - 1) * SUB_PAGE_SIZE + 1}–{Math.min(subPage * SUB_PAGE_SIZE, filteredSubs.length)} of {filteredSubs.length}
                                        </span>
                                        <div style={{ display: 'flex', gap: '4px' }}>
                                            <button
                                                onClick={() => setSubPage(p => Math.max(1, p - 1))}
                                                disabled={subPage === 1}
                                                style={{ padding: '4px 10px', borderRadius: '6px', border: '1.5px solid var(--prof-border)', background: '#fff', color: subPage === 1 ? '#cbd5e1' : 'var(--prof-text-main)', fontSize: '0.8rem', fontWeight: 600, cursor: subPage === 1 ? 'default' : 'pointer' }}
                                            >‹ Prev</button>
                                            <button
                                                onClick={() => setSubPage(p => Math.min(totalSubPages, p + 1))}
                                                disabled={subPage === totalSubPages}
                                                style={{ padding: '4px 10px', borderRadius: '6px', border: '1.5px solid var(--prof-border)', background: '#fff', color: subPage === totalSubPages ? '#cbd5e1' : 'var(--prof-text-main)', fontSize: '0.8rem', fontWeight: 600, cursor: subPage === totalSubPages ? 'default' : 'pointer' }}
                                            >Next ›</button>
                                        </div>
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                </div>

                {/* ── Right: Details + Actions ── */}
                <div className="vf-details-col" style={{ position: 'sticky', top: '24px' }}>
                    <div className="vf-details-card">

                        {/* Toggle button — visible on mobile only */}
                        <button className="vf-details-toggle" onClick={() => setIsDetailsOpen(v => !v)}>
                            <span style={{ fontSize: '0.875rem', fontWeight: 600 }}>Form Details</span>
                            <svg fill="none" strokeWidth="2.5" stroke="currentColor" viewBox="0 0 24 24" width="16" height="16" style={{ color: 'var(--prof-text-muted)', transform: isDetailsOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s', flexShrink: 0 }}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                            </svg>
                        </button>

                        <div className={`vf-details-body${isDetailsOpen ? ' vf-details-open' : ''}`}>

                    {/* Form details */}
                    <div className="cs-card vf-details-inner-card" style={{ padding: 0, overflow: 'hidden' }}>
                        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--prof-border)', background: '#fafbfc' }}>
                            <p style={{ margin: 0, fontSize: '0.7rem', fontWeight: 700, color: 'var(--prof-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Form Details</p>
                        </div>
                        <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '11px' }}>
                            {[
                                { label: 'Attempt', value: `Attempt ${form.attempt_number}` },
                                { label: 'Academic Year', value: form.academic_year },
                                { label: 'Term', value: form.term },
                                { label: 'Exam Date', value: new Date(form.exam_date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'long', day: 'numeric', year: 'numeric' }) },
                            ].map(row => (
                                <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                                    <span style={{ fontSize: '0.75rem', color: 'var(--prof-text-muted)', fontWeight: 500, flexShrink: 0 }}>{row.label}</span>
                                    <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--prof-text-main)', textAlign: 'right' }}>{row.value}</span>
                                </div>
                            ))}
                            <div style={{ borderTop: '1px solid var(--prof-border)', paddingTop: '11px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                <div>
                                    <p style={{ margin: '0 0 2px', fontSize: '0.72rem', color: 'var(--prof-text-muted)', fontWeight: 500 }}>Window Opens</p>
                                    <p style={{ margin: 0, fontSize: '0.78rem', fontWeight: 600, color: 'var(--prof-text-main)' }}>
                                        {formatPHT(form.submission_start, { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Manila' })} PHT
                                    </p>
                                </div>
                                <div>
                                    <p style={{ margin: '0 0 2px', fontSize: '0.72rem', color: 'var(--prof-text-muted)', fontWeight: 500 }}>Window Closes</p>
                                    <p style={{ margin: 0, fontSize: '0.78rem', fontWeight: 600, color: 'var(--prof-text-main)' }}>
                                        {formatPHT(form.submission_end, { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Manila' })} PHT
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Process late submissions */}
                    {ws === 'closed' && (
                        <div className="cs-card" style={{ padding: '14px 16px', background: '#fffbeb', border: '1px solid #fde68a' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                                <svg fill="none" strokeWidth="2" stroke="#92400e" viewBox="0 0 24 24" width="14" height="14"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" /></svg>
                                <p style={{ margin: 0, fontSize: '0.78rem', fontWeight: 700, color: '#92400e' }}>Window Closed</p>
                            </div>
                            <p style={{ margin: '0 0 10px', fontSize: '0.75rem', color: '#92400e', lineHeight: 1.5 }}>
                                Mark enrolled students who didn't submit as Did Not Take.
                            </p>
                            {processResult && (
                                <p style={{ margin: '0 0 8px', fontSize: '0.75rem', fontWeight: 600, color: processResult.errors.length > 0 ? '#b91c1c' : '#15803d' }}>
                                    {processResult.errors.length > 0
                                        ? `${processResult.count} processed, ${processResult.errors.length} error(s).`
                                        : `Done — ${processResult.count} attempt(s) marked DNT.`}
                                </p>
                            )}
                            <button
                                onClick={handleProcess}
                                disabled={processing}
                                style={{ width: '100%', padding: '8px 14px', background: '#f59e0b', color: '#fff', border: 'none', borderRadius: '7px', fontSize: '0.8rem', fontWeight: 600, cursor: processing ? 'not-allowed' : 'pointer', opacity: processing ? 0.7 : 1 }}
                            >
                                {processing ? 'Processing…' : 'Process Late Submissions'}
                            </button>
                        </div>
                    )}

                        </div>{/* end vf-details-body */}
                    </div>{/* end vf-details-card */}
                </div>{/* end vf-details-col */}
            </div>{/* end vf-overview-grid */}

            {/* Close form confirmation */}
            <Popup
                isOpen={closeConfirmOpen}
                title="Close Form"
                message={`This will immediately close the submission window for "${form.title}". Students will no longer be able to submit.`}
                type="warning"
                onConfirm={handleCloseForm}
                onCancel={() => setCloseConfirmOpen(false)}
                confirmText="Close Form"
                cancelText="Cancel"
            />

            {/* Delete confirmation */}
            {deleteOpen && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
                    <div style={{ background: '#fff', borderRadius: '14px', padding: '28px', maxWidth: '420px', width: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
                        <h3 style={{ margin: '0 0 10px', fontSize: '1.05rem', fontWeight: 700, color: '#0f172a' }}>Delete Form</h3>
                        <p style={{ margin: '0 0 20px', fontSize: '0.88rem', color: 'var(--prof-text-muted)', lineHeight: 1.6 }}>
                            Are you sure you want to delete <strong>{form.title}</strong>? This will also remove all submissions for this form.
                        </p>
                        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                            <button onClick={() => setDeleteOpen(false)} disabled={isDeleting} style={{ padding: '8px 18px', background: '#fff', border: '1.5px solid var(--prof-border)', borderRadius: '8px', fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer', color: 'var(--prof-text-main)' }}>Cancel</button>
                            <button onClick={handleDelete} disabled={isDeleting} style={{ padding: '8px 18px', background: '#b91c1c', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '0.875rem', fontWeight: 600, cursor: isDeleting ? 'not-allowed' : 'pointer', opacity: isDeleting ? 0.7 : 1 }}>
                                {isDeleting ? 'Deleting…' : 'Delete'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
