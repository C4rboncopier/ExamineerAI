import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { useAuth } from './AuthContext';
import { fetchUnreadCount } from '../lib/notifications';

interface NotificationsContextType {
    unreadCount: number;
    refreshCount: () => void;
}

const NotificationsContext = createContext<NotificationsContextType>({
    unreadCount: 0,
    refreshCount: () => {},
});

export function NotificationsProvider({ children }: { children: React.ReactNode }) {
    const { user } = useAuth();
    const [unreadCount, setUnreadCount] = useState(0);

    const refreshCount = useCallback(async () => {
        if (!user?.id) return;
        const count = await fetchUnreadCount(user.id);
        setUnreadCount(count);
    }, [user?.id]);

    useEffect(() => {
        refreshCount();
    }, [refreshCount]);

    return (
        <NotificationsContext.Provider value={{ unreadCount, refreshCount }}>
            {children}
        </NotificationsContext.Provider>
    );
}

export function useNotifications() {
    return useContext(NotificationsContext);
}
