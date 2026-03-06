interface MarkDoneExamModalProps {
    isOpen: boolean;
    examTitle: string;
    isMarkingDone: boolean;
    onClose: () => void;
    onConfirm: () => void;
}

export function MarkDoneExamModal({
    isOpen,
    examTitle,
    isMarkingDone,
    onClose,
    onConfirm
}: MarkDoneExamModalProps) {
    if (!isOpen) return null;

    return (
        <div className="ql-summary-overlay" onClick={onClose} style={{ zIndex: 2000, backdropFilter: 'blur(4px)', backgroundColor: 'rgba(15, 37, 84, 0.4)' }}>
            <div
                className="ql-summary-modal"
                style={{ maxWidth: '440px', padding: 0, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.4)', boxShadow: '0 20px 40px rgba(15, 37, 84, 0.15), 0 0 0 1px rgba(15, 37, 84, 0.05)' }}
                onClick={e => e.stopPropagation()}
            >
                <div style={{ padding: '24px 24px 16px', borderBottom: '1px solid var(--prof-border)', background: 'linear-gradient(to right, #eff6ff, #ffffff)' }}>
                    <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '10px', color: '#1e40af', fontSize: '1.25rem', fontWeight: 700 }}>
                        <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: '#dbeafe', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <svg fill="none" strokeWidth="2.5" stroke="currentColor" viewBox="0 0 24 24" width="20" height="20" style={{ color: '#2563eb' }}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                        </div>
                        Mark as Done
                    </h3>
                </div>

                <div style={{ padding: '24px' }}>
                    <p style={{ fontSize: '0.95rem', color: 'var(--prof-text-main)', margin: '0 0 16px', lineHeight: 1.6 }}>
                        You are about to mark <strong>{examTitle}</strong> as done.
                    </p>
                    <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '12px 16px', marginBottom: '24px' }}>
                        <p style={{ margin: 0, fontSize: '0.85rem', color: '#475569', display: 'flex', gap: '8px', alignItems: 'flex-start', lineHeight: 1.5 }}>
                            <svg fill="currentColor" viewBox="0 0 20 20" width="16" height="16" style={{ marginTop: '2px', flexShrink: 0, color: '#64748b' }}>
                                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd"></path>
                            </svg>
                            <span>This confirms the exam has been administered. It will be badged as "Done" and typically kept for archival or grading purposes.</span>
                        </p>
                    </div>

                    <div style={{ display: 'flex', gap: '12px' }}>
                        <button
                            className="btn-secondary"
                            style={{ flex: 1, padding: '10px' }}
                            onClick={onClose}
                        >
                            Cancel
                        </button>
                        <button
                            className="btn-primary"
                            style={{ flex: 1, padding: '10px', background: '#2563eb', borderColor: '#2563eb', boxShadow: '0 4px 12px rgba(37,99,235,0.2)' }}
                            disabled={isMarkingDone}
                            onClick={onConfirm}
                        >
                            {isMarkingDone ? 'Saving...' : 'Yes, Mark as Done'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
