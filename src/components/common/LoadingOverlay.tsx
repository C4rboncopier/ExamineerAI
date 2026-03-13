import './LoadingOverlay.css';

interface LoadingOverlayProps {
    isOpen: boolean;
    message?: string;
    subtext?: string;
}

export function LoadingOverlay({ isOpen, message = 'Loading...', subtext }: LoadingOverlayProps) {
    if (!isOpen) return null;

    return (
        <div className="loading-overlay">
            <div className="loading-card">
                <div className="loading-spinner" />
                <p className="loading-message">{message}</p>
                {subtext && <p className="loading-subtext">{subtext}</p>}
            </div>
        </div>
    );
}
