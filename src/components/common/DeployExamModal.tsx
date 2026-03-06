

interface DeployExamModalProps {
    isOpen: boolean;
    examTitle: string;
    isDeploying: boolean;
    onClose: () => void;
    onConfirm: () => void;
}

export function DeployExamModal({
    isOpen,
    examTitle,
    isDeploying,
    onClose,
    onConfirm
}: DeployExamModalProps) {
    if (!isOpen) return null;

    return (
        <div className="ql-summary-overlay" onClick={onClose} style={{ zIndex: 2000, backdropFilter: 'blur(4px)', backgroundColor: 'rgba(15, 37, 84, 0.4)' }}>
            <div
                className="ql-summary-modal"
                style={{ maxWidth: '440px', padding: 0, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.4)', boxShadow: '0 20px 40px rgba(15, 37, 84, 0.15), 0 0 0 1px rgba(15, 37, 84, 0.05)' }}
                onClick={e => e.stopPropagation()}
            >
                <div style={{ padding: '24px 24px 16px', borderBottom: '1px solid var(--prof-border)', background: 'linear-gradient(to right, #f0fdf4, #ffffff)' }}>
                    <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '10px', color: '#166534', fontSize: '1.25rem', fontWeight: 700 }}>
                        <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: '#dcfce7', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <svg fill="none" strokeWidth="2.5" stroke="currentColor" viewBox="0 0 24 24" width="20" height="20" style={{ color: '#16a34a' }}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.125A59.769 59.769 0 0121.485 12 59.768 59.768 0 013.27 20.875L5.999 12zm0 0h7.5"></path>
                            </svg>
                        </div>
                        Deploy Exam
                    </h3>
                </div>

                <div style={{ padding: '24px' }}>
                    <p style={{ fontSize: '0.95rem', color: 'var(--prof-text-main)', margin: '0 0 16px', lineHeight: 1.6 }}>
                        You are about to deploy <strong>{examTitle}</strong>.
                    </p>
                    <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '12px 16px', marginBottom: '24px' }}>
                        <p style={{ margin: 0, fontSize: '0.85rem', color: '#991b1b', display: 'flex', gap: '8px', alignItems: 'flex-start', lineHeight: 1.5 }}>
                            <svg fill="currentColor" viewBox="0 0 20 20" width="16" height="16" style={{ marginTop: '2px', flexShrink: 0 }}>
                                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd"></path>
                            </svg>
                            <span>Once deployed, this exam will be locked and can <strong>no longer be edited or deleted</strong>. This action cannot be undone.</span>
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
                            style={{ flex: 1, padding: '10px', background: '#16a34a', borderColor: '#16a34a', boxShadow: '0 4px 12px rgba(22,163,74,0.2)' }}
                            disabled={isDeploying}
                            onClick={onConfirm}
                        >
                            {isDeploying ? 'Deploying...' : 'Yes, Deploy Exam'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
