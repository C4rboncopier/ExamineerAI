import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { useAuth } from './AuthContext';
import { fetchUnreadCount } from '../lib/notifications';
import { supabase } from '../lib/supabase';

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

    useEffect(() => {
        if (!user?.id) return;
        const channel = supabase
            .channel(`notifications-count-${user.id}`)
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'professor_notifications',
                filter: `recipient_id=eq.${user.id}`,
            }, () => {
                refreshCount();
            })
            .subscribe();
        return () => { supabase.removeChannel(channel); };
    }, [user?.id, refreshCount]);

    return (
        <NotificationsContext.Provider value={{ unreadCount, refreshCount }}>
            {children}
        </NotificationsContext.Provider>
    );
}

export function useNotifications() {
    return useContext(NotificationsContext);
}
