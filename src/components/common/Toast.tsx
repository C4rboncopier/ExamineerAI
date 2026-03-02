import { useEffect } from 'react';
import './Toast.css';

interface ToastProps {
    isOpen: boolean;
    message: string;
    type: 'success' | 'error' | 'info';
    onClose: () => void;
    duration?: number;
}

export function Toast({ isOpen, message, type, onClose, duration = 3000 }: ToastProps) {
    useEffect(() => {
        if (!isOpen) return;
        const timer = setTimeout(onClose, duration);
        return () => clearTimeout(timer);
    }, [isOpen, onClose, duration]);

    if (!isOpen) return null;

    return (
        <div className={`toast toast-${type}`}>
            <div className="toast-icon">
                {type === 'success' && (
                    <svg fill="none" strokeWidth="2" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"></path></svg>
                )}
                {type === 'error' && (
                    <svg fill="none" strokeWidth="2" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"></path></svg>
                )}
                {type === 'info' && (
                    <svg fill="none" strokeWidth="2" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                )}
            </div>
            <span className="toast-message">{message}</span>
            <button className="toast-close" onClick={onClose}>
                <svg fill="none" strokeWidth="2" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"></path></svg>
            </button>
        </div>
    );
}
