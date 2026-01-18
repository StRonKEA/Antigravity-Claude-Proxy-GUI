import { create } from 'zustand';

export interface Toast {
    id: string;
    type: 'success' | 'error' | 'info' | 'warning';
    message: string;
    duration?: number;
}

interface ToastStore {
    toasts: Toast[];
    addToast: (toast: Omit<Toast, 'id'>) => void;
    removeToast: (id: string) => void;
    clearAll: () => void;
}

export const useToastStore = create<ToastStore>((set) => ({
    toasts: [],

    addToast: (toast) => {
        const id = Date.now().toString();
        const newToast = { ...toast, id };

        set((state) => ({
            toasts: [...state.toasts, newToast],
        }));

        // Auto remove after duration
        const duration = toast.duration || 4000;
        setTimeout(() => {
            set((state) => ({
                toasts: state.toasts.filter((t) => t.id !== id),
            }));
        }, duration);
    },

    removeToast: (id) =>
        set((state) => ({
            toasts: state.toasts.filter((t) => t.id !== id),
        })),

    clearAll: () => set({ toasts: [] }),
}));

// Helper functions
export const toast = {
    success: (message: string) => useToastStore.getState().addToast({ type: 'success', message }),
    error: (message: string) => useToastStore.getState().addToast({ type: 'error', message }),
    info: (message: string) => useToastStore.getState().addToast({ type: 'info', message }),
    warning: (message: string) => useToastStore.getState().addToast({ type: 'warning', message }),
};
