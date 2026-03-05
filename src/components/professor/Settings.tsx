import { useState, useEffect, useCallback } from 'react';
import { Popup } from '../common/Popup';
import { Toast } from '../common/Toast';
import {
    fetchAcademicYear,
    saveAcademicYear,
    fetchSemester,
    saveSemester,
    fetchPrograms,
    createProgram,
    updateProgram,
    deleteProgram,
} from '../../lib/settings';
import type { Program } from '../../lib/settings';

interface ToastState {
    open: boolean;
    message: string;
    type: 'success' | 'error' | 'info';
}

const PROGRAMS_PER_PAGE = 10;

function parseAY(ay: string): { startYear: string; endYear: string } {
    const match = ay.match(/(\d{4})-(\d{4})/);
    if (match) return { startYear: match[1], endYear: match[2] };
    return { startYear: '', endYear: '' };
}

function formatAY(startYear: string, endYear: string): string {
    return `AY ${startYear}-${endYear}`;
}

export function Settings() {
    // Academic Year + Semester state
    const [academicYear, setAcademicYear] = useState<string>('');
    const [semester, setSemester] = useState<string>('');
    const [isEditingAY, setIsEditingAY] = useState(false);
    const [tempStartYear, setTempStartYear] = useState('');
    const [tempEndYear, setTempEndYear] = useState('');
    const [tempSemester, setTempSemester] = useState('1st Term');
    const [isSavingAY, setIsSavingAY] = useState(false);
    const [isLoadingAY, setIsLoadingAY] = useState(true);

    // Programs state
    const [programs, setPrograms] = useState<Program[]>([]);
    const [isLoadingPrograms, setIsLoadingPrograms] = useState(true);
    const [programsPage, setProgramsPage] = useState(1);
    const [isAddingProgram, setIsAddingProgram] = useState(false);
    const [editingProgramId, setEditingProgramId] = useState<string | null>(null);
    const [tempProgramCode, setTempProgramCode] = useState('');
    const [tempProgramName, setTempProgramName] = useState('');
    const [isSavingProgram, setIsSavingProgram] = useState(false);
    const [programFormError, setProgramFormError] = useState<string | null>(null);

    // Delete state
    const [deletePopupOpen, setDeletePopupOpen] = useState(false);
    const [programToDelete, setProgramToDelete] = useState<Program | null>(null);
    const [isDeletingProgram, setIsDeletingProgram] = useState(false);

    // Toast
    const [toast, setToast] = useState<ToastState>({ open: false, message: '', type: 'success' });
    const showToast = (message: string, type: 'success' | 'error' | 'info' = 'success') =>
        setToast({ open: true, message, type });
    const closeToast = useCallback(() => setToast(prev => ({ ...prev, open: false })), []);

    // Load data on mount
    useEffect(() => {
        Promise.all([fetchAcademicYear(), fetchSemester()]).then(([ayResult, semResult]) => {
            if (!ayResult.error && ayResult.value) setAcademicYear(ayResult.value);
            if (!semResult.error && semResult.value) setSemester(semResult.value);
            setIsLoadingAY(false);
        });
        fetchPrograms().then(({ data, error }) => {
            if (!error) setPrograms(data);
            setIsLoadingPrograms(false);
        });
    }, []);

    // ── Academic Year ──────────────────────────────────────

    const handleEditAY = () => {
        const { startYear, endYear } = parseAY(academicYear);
        const currentYear = new Date().getFullYear();
        setTempStartYear(startYear || String(currentYear));
        setTempEndYear(endYear || String(currentYear + 1));
        setTempSemester(semester || '1st Term');
        setIsEditingAY(true);
    };

    const handleStartYearChange = (val: string) => {
        setTempStartYear(val);
        const n = parseInt(val);
        if (!isNaN(n)) setTempEndYear(String(n + 1));
    };

    const handleSaveAY = async () => {
        if (!tempStartYear || !tempEndYear) return;
        setIsSavingAY(true);
        const newAY = formatAY(tempStartYear, tempEndYear);
        const [ayResult, semResult] = await Promise.all([
            saveAcademicYear(newAY),
            saveSemester(tempSemester),
        ]);
        const error = ayResult.error || semResult.error;
        if (error) {
            showToast(error, 'error');
        } else {
            setAcademicYear(newAY);
            setSemester(tempSemester);
            setIsEditingAY(false);
            showToast('Academic period updated successfully.');
        }
        setIsSavingAY(false);
    };

    // ── Programs ───────────────────────────────────────────

    const handleSaveProgram = async () => {
        setProgramFormError(null);
        if (!tempProgramCode.trim() || !tempProgramName.trim()) {
            setProgramFormError('Both program code and name are required.');
            return;
        }
        setIsSavingProgram(true);

        if (editingProgramId) {
            const { error } = await updateProgram(editingProgramId, tempProgramCode, tempProgramName);
            if (error) {
                setProgramFormError(error);
            } else {
                setPrograms(programs.map(p =>
                    p.id === editingProgramId
                        ? { ...p, code: tempProgramCode.toUpperCase(), name: tempProgramName }
                        : p
                ));
                setEditingProgramId(null);
                showToast('Program updated successfully.');
            }
        } else {
            const { data, error } = await createProgram(tempProgramCode, tempProgramName);
            if (error) {
                setProgramFormError(error);
            } else if (data) {
                setPrograms(prev => [...prev, data].sort((a, b) => a.code.localeCompare(b.code)));
                setIsAddingProgram(false);
                setProgramsPage(1);
                showToast('Program added successfully.');
            }
        }
        setIsSavingProgram(false);
    };

    const handleEditProgram = (p: Program) => {
        setEditingProgramId(p.id);
        setTempProgramCode(p.code);
        setTempProgramName(p.name);
        setProgramFormError(null);
        setIsAddingProgram(false);
    };

    const confirmDeleteProgram = (p: Program) => {
        setProgramToDelete(p);
        setDeletePopupOpen(true);
    };

    const handleDeleteProgram = async () => {
        if (!programToDelete) return;
        setIsDeletingProgram(true);
        const { error } = await deleteProgram(programToDelete.id);
        if (error) {
            showToast(error, 'error');
        } else {
            const updated = programs.filter(p => p.id !== programToDelete.id);
            setPrograms(updated);
            const newTotal = Math.max(1, Math.ceil(updated.length / PROGRAMS_PER_PAGE));
            if (programsPage > newTotal) setProgramsPage(newTotal);
            showToast(`Program "${programToDelete.code}" deleted.`);
        }
        setDeletePopupOpen(false);
        setProgramToDelete(null);
        setIsDeletingProgram(false);
    };

    const cancelProgramForm = () => {
        setIsAddingProgram(false);
        setEditingProgramId(null);
        setProgramFormError(null);
    };

    // Pagination
    const totalProgramPages = Math.max(1, Math.ceil(programs.length / PROGRAMS_PER_PAGE));
    const pagedPrograms = programs.slice(
        (programsPage - 1) * PROGRAMS_PER_PAGE,
        programsPage * PROGRAMS_PER_PAGE
    );

    return (
        <div className="settings-container">
            <div className="cs-header">
                <h2>Settings</h2>
                <p>Manage global configuration, programs, and other system settings.</p>
            </div>

            <div className="settings-sections">

                {/* ── Academic Year Card ── */}
                <div className="cs-card">
                    <div className="settings-section-heading">
                        <div className="settings-section-icon">
                            <svg fill="none" strokeWidth="1.5" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 9v7.5" />
                            </svg>
                        </div>
                        <div>
                            <h3 className="settings-section-title">Academic Period</h3>
                            <p className="settings-section-desc">Set the active academic year and term for all operations.</p>
                        </div>
                    </div>

                    {isLoadingAY ? (
                        <div className="settings-loading-row">Loading...</div>
                    ) : isEditingAY ? (
                        <div className="settings-ay-edit">
                            <div className="settings-ay-inputs">
                                <div className="cs-input-field">
                                    <label>Start Year</label>
                                    <input
                                        type="number"
                                        value={tempStartYear}
                                        onChange={(e) => handleStartYearChange(e.target.value)}
                                        min="2000"
                                        max="2099"
                                        placeholder="2025"
                                    />
                                </div>
                                <div className="settings-ay-dash">–</div>
                                <div className="cs-input-field">
                                    <label>End Year</label>
                                    <input
                                        type="number"
                                        value={tempEndYear}
                                        onChange={(e) => setTempEndYear(e.target.value)}
                                        min="2000"
                                        max="2099"
                                        placeholder="2026"
                                    />
                                </div>
                                <div className="settings-ay-divider-v" />
                                <div className="cs-input-field settings-ay-term-field">
                                    <label>Active Term</label>
                                    <select
                                        value={tempSemester}
                                        onChange={(e) => setTempSemester(e.target.value)}
                                    >
                                        <option value="1st Term">1st Term</option>
                                        <option value="2nd Term">2nd Term</option>
                                        <option value="3rd Term">3rd Term</option>
                                        <option value="4th Term">4th Term</option>
                                    </select>
                                </div>
                            </div>
                            <div className="settings-ay-preview">
                                <span className="ay-preview-label">Preview</span>
                                <span className="ay-preview-value">{formatAY(tempStartYear, tempEndYear)}</span>
                                <span className="ay-preview-sep">·</span>
                                <span className="ay-preview-value">{tempSemester}</span>
                            </div>
                            <div className="settings-actions">
                                <button className="btn-secondary" onClick={() => setIsEditingAY(false)} disabled={isSavingAY}>
                                    Cancel
                                </button>
                                <button className="btn-primary" onClick={handleSaveAY} disabled={isSavingAY}>
                                    {isSavingAY ? 'Saving...' : 'Save Changes'}
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className="settings-ay-view">
                            <div className="ay-display-block">
                                <span className="ay-display-label">Academic Year</span>
                                <span className="ay-display-value">{academicYear || '—'}</span>
                            </div>
                            <div className="ay-display-divider" />
                            <div className="ay-display-block">
                                <span className="ay-display-label">Active Term</span>
                                <span className="ay-display-value">{semester || '—'}</span>
                            </div>
                            <button className="btn-secondary settings-btn-icon-inline" onClick={handleEditAY}>
                                <svg fill="none" strokeWidth="2" stroke="currentColor" viewBox="0 0 24 24" width="15" height="15">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                                </svg>
                                Change
                            </button>
                        </div>
                    )}
                </div>

                {/* ── Programs Card ── */}
                <div className="cs-card">
                    <div className="settings-section-heading">
                        <div className="settings-section-icon">
                            <svg fill="none" strokeWidth="1.5" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M4.26 10.147a60.438 60.438 0 00-.491 6.347A48.62 48.62 0 0112 20.904a48.62 48.62 0 018.232-4.41 60.46 60.46 0 00-.491-6.347m-15.482 0a50.636 50.636 0 00-2.658-.813A59.906 59.906 0 0112 3.493a59.903 59.903 0 0110.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.717 50.717 0 0112 13.489a50.702 50.702 0 017.74-3.342M6.75 15a.75.75 0 100-1.5.75.75 0 000 1.5zm0 0v-3.675A55.378 55.378 0 0112 8.443m-7.007 11.55A5.981 5.981 0 006.75 15.75v-1.5" />
                            </svg>
                        </div>
                        <div className="flex-1">
                            <h3 className="settings-section-title">Programs</h3>
                            <p className="settings-section-desc">Manage academic programs available in the system.</p>
                        </div>
                        {!isAddingProgram && !editingProgramId && (
                            <button
                                className="btn-primary btn-sm"
                                onClick={() => {
                                    setIsAddingProgram(true);
                                    setTempProgramCode('');
                                    setTempProgramName('');
                                    setProgramFormError(null);
                                }}
                            >
                                + Add Program
                            </button>
                        )}
                    </div>

                    {(isAddingProgram || editingProgramId) && (
                        <div className="settings-program-form">
                            <div className="cs-input-group row">
                                <div className="cs-input-field flex-1">
                                    <label>Program Code</label>
                                    <input
                                        type="text"
                                        value={tempProgramCode}
                                        onChange={(e) => setTempProgramCode(e.target.value.toUpperCase())}
                                        placeholder="e.g. BSCS"
                                    />
                                </div>
                                <div className="cs-input-field flex-2">
                                    <label>Program Name</label>
                                    <input
                                        type="text"
                                        value={tempProgramName}
                                        onChange={(e) => setTempProgramName(e.target.value)}
                                        placeholder="e.g. Bachelor of Science in Computer Science"
                                    />
                                </div>
                            </div>
                            {programFormError && <p className="cs-error" style={{ marginTop: '8px', marginBottom: 0 }}>{programFormError}</p>}
                            <div className="settings-actions" style={{ marginTop: '12px' }}>
                                <button type="button" className="btn-secondary" onClick={cancelProgramForm} disabled={isSavingProgram}>
                                    Cancel
                                </button>
                                <button type="button" className="btn-primary" onClick={handleSaveProgram} disabled={isSavingProgram}>
                                    {isSavingProgram ? 'Saving...' : editingProgramId ? 'Update' : 'Save Program'}
                                </button>
                            </div>
                        </div>
                    )}

                    <div className="settings-programs-list">
                        {isLoadingPrograms ? (
                            <p className="settings-empty">Loading programs...</p>
                        ) : programs.length === 0 ? (
                            <p className="settings-empty">No programs yet. Add one to get started.</p>
                        ) : (
                            pagedPrograms.map(program => (
                                <div
                                    key={program.id}
                                    className={`settings-program-item${editingProgramId === program.id ? ' editing' : ''}`}
                                >
                                    <div className="program-info">
                                        <span className="program-code">{program.code}</span>
                                        <span className="program-name">{program.name}</span>
                                    </div>
                                    <div className="program-actions">
                                        <button
                                            className="btn-icon"
                                            onClick={() => handleEditProgram(program)}
                                            title="Edit Program"
                                            disabled={!!editingProgramId || isAddingProgram}
                                        >
                                            <svg fill="none" strokeWidth="2" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                                            </svg>
                                        </button>
                                        <button
                                            className="btn-icon danger"
                                            onClick={() => confirmDeleteProgram(program)}
                                            title="Delete Program"
                                            disabled={!!editingProgramId || isAddingProgram}
                                        >
                                            <svg fill="none" strokeWidth="2" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                            </svg>
                                        </button>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>

                    {!isLoadingPrograms && totalProgramPages > 1 && (
                        <div className="subjects-pagination" style={{ marginTop: '16px' }}>
                            <button
                                className="pagination-btn"
                                onClick={() => setProgramsPage(p => p - 1)}
                                disabled={programsPage === 1}
                            >
                                <svg fill="none" strokeWidth="2" stroke="currentColor" viewBox="0 0 24 24" width="16" height="16"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5"></path></svg>
                                Previous
                            </button>
                            <div className="pagination-pages">
                                {Array.from({ length: totalProgramPages }, (_, i) => i + 1).map(page => (
                                    <button
                                        key={page}
                                        className={`pagination-page ${page === programsPage ? 'active' : ''}`}
                                        onClick={() => setProgramsPage(page)}
                                    >
                                        {page}
                                    </button>
                                ))}
                            </div>
                            <button
                                className="pagination-btn"
                                onClick={() => setProgramsPage(p => p + 1)}
                                disabled={programsPage === totalProgramPages}
                            >
                                Next
                                <svg fill="none" strokeWidth="2" stroke="currentColor" viewBox="0 0 24 24" width="16" height="16"><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5"></path></svg>
                            </button>
                        </div>
                    )}
                    {!isLoadingPrograms && programs.length > 0 && (
                        <p className="subjects-count">
                            Showing {(programsPage - 1) * PROGRAMS_PER_PAGE + 1}–{Math.min(programsPage * PROGRAMS_PER_PAGE, programs.length)} of {programs.length} program{programs.length !== 1 ? 's' : ''}
                        </p>
                    )}
                </div>

            </div>

            <Popup
                isOpen={deletePopupOpen}
                title="Delete Program"
                message={`Are you sure you want to delete "${programToDelete?.name}" (${programToDelete?.code})? This action cannot be undone.`}
                type="danger"
                onConfirm={handleDeleteProgram}
                onCancel={() => { setDeletePopupOpen(false); setProgramToDelete(null); }}
                confirmText={isDeletingProgram ? 'Deleting...' : 'Delete'}
                cancelText="Cancel"
            />

            <Toast
                isOpen={toast.open}
                message={toast.message}
                type={toast.type}
                onClose={closeToast}
            />
        </div>
    );
}
