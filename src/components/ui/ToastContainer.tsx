import { X, CheckCircle, AlertCircle, Info, AlertTriangle } from 'lucide-react';
import { useToastStore } from '../../stores/toastStore';

const icons = {
    success: CheckCircle,
    error: AlertCircle,
    info: Info,
    warning: AlertTriangle,
};

const styles = {
    success: 'bg-green-500/10 border-green-500/30 text-green-400',
    error: 'bg-red-500/10 border-red-500/30 text-red-400',
    info: 'bg-blue-500/10 border-blue-500/30 text-blue-400',
    warning: 'bg-yellow-500/10 border-yellow-500/30 text-yellow-400',
};

export function ToastContainer() {
    const { toasts, removeToast } = useToastStore();

    if (toasts.length === 0) return null;

    return (
        <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none">
            {toasts.map((toast) => {
                const Icon = icons[toast.type];
                return (
                    <div
                        key={toast.id}
                        className={`
              flex items-center gap-3 px-4 py-3 rounded-lg border backdrop-blur-md 
              pointer-events-auto min-w-[300px] max-w-[400px]
              animate-slide-in-right shadow-lg
              ${styles[toast.type]}
            `}
                    >
                        <Icon size={18} className="shrink-0" />
                        <span className="text-sm font-medium flex-1">{toast.message}</span>
                        <button
                            onClick={() => removeToast(toast.id)}
                            className="shrink-0 p-1 rounded hover:bg-white/10 transition-colors"
                        >
                            <X size={14} />
                        </button>
                    </div>
                );
            })}
        </div>
    );
}
