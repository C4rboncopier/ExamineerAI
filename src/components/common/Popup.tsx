import React from 'react';
import './Popup.css';

interface PopupProps {
    isOpen: boolean;
    title: string;
    message: string;
    type: 'success' | 'warning' | 'danger' | 'info';
    onConfirm?: () => void;
    onCancel?: () => void;
    confirmText?: string;
    cancelText?: string;
}

export function Popup({
    isOpen,
    title,
    message,
    type,
    onConfirm,
    onCancel,
    confirmText = 'Confirm',
    cancelText = 'Cancel'
}: PopupProps) {
    if (!isOpen) return null;

    const getIcon = () => {
        switch (type) {
            case 'success':
                return (
                    <div className="popup-icon success">
                        <svg fill="none" strokeWidth="2" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"></path></svg>
                    </div>
                );
            case 'danger':
            case 'warning':
                return (
                    <div className="popup-icon danger">
                        <svg fill="none" strokeWidth="2" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
                    </div>
                );
            default:
                return null;
        }
    };

    return (
        <div className="popup-overlay">
            <div className="popup-content">
                <div className="popup-header">
                    {getIcon()}
                    <h3>{title}</h3>
                </div>
                <div className="popup-body">
                    <p>{message}</p>
                </div>
                <div className="popup-actions">
                    {onCancel && (
                        <button className="btn-secondary" onClick={onCancel}>
                            {cancelText}
                        </button>
                    )}
                    {onConfirm && (
                        <button className={`btn-primary ${type === 'danger' ? 'danger-btn' : ''}`} onClick={onConfirm}>
                            {confirmText}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
