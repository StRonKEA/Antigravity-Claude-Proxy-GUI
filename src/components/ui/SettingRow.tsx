import { ReactNode } from 'react';

interface SettingRowProps {
    icon?: ReactNode;
    label: string;
    description?: string;
    children: ReactNode;
    className?: string;
}

/**
 * Compact setting row with label, description, and inline control
 */
export function SettingRow({ icon, label, description, children, className = '' }: SettingRowProps) {
    return (
        <div className={`flex items-center justify-between py-3 border-b border-white/5 last:border-0 ${className}`}>
            <div className="flex items-start gap-3 flex-1 min-w-0">
                {icon && (
                    <div className="mt-0.5 text-text-muted shrink-0">
                        {icon}
                    </div>
                )}
                <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-text-primary">{label}</div>
                    {description && (
                        <div className="text-xs text-text-muted mt-0.5 leading-relaxed">{description}</div>
                    )}
                </div>
            </div>
            <div className="shrink-0 ml-4">
                {children}
            </div>
        </div>
    );
}

/**
 * Toggle switch component
 */
interface ToggleSwitchProps {
    checked: boolean;
    onChange: (checked: boolean) => void;
    disabled?: boolean;
}

export function ToggleSwitch({ checked, onChange, disabled = false }: ToggleSwitchProps) {
    return (
        <button
            type="button"
            role="switch"
            aria-checked={checked}
            disabled={disabled}
            onClick={() => onChange(!checked)}
            className={`
                relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full 
                border-2 border-transparent transition-colors duration-200 ease-in-out
                focus:outline-none focus:ring-2 focus:ring-accent-primary focus:ring-offset-2 focus:ring-offset-bg-primary
                ${checked ? 'bg-accent-primary' : 'bg-white/20'}
                ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
            `}
        >
            <span
                className={`
                    pointer-events-none inline-block h-5 w-5 transform rounded-full 
                    bg-white shadow ring-0 transition duration-200 ease-in-out
                    ${checked ? 'translate-x-5' : 'translate-x-0'}
                `}
            />
        </button>
    );
}
