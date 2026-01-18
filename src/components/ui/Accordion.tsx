import { useState, ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';

interface AccordionProps {
    icon?: ReactNode;
    title: string;
    defaultOpen?: boolean;
    children: ReactNode;
    className?: string;
}

/**
 * Collapsible accordion section for settings
 */
export function Accordion({ icon, title, defaultOpen = false, children, className = '' }: AccordionProps) {
    const [isOpen, setIsOpen] = useState(defaultOpen);

    return (
        <div className={`glass-card overflow-hidden ${className}`}>
            <button
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                className="w-full flex items-center justify-between p-4 hover:bg-white/5 transition-colors"
            >
                <div className="flex items-center gap-3">
                    {icon && (
                        <div className="text-accent-primary">
                            {icon}
                        </div>
                    )}
                    <span className="text-sm font-semibold text-text-primary">{title}</span>
                </div>
                <ChevronDown
                    size={18}
                    className={`text-text-muted transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
                />
            </button>
            <div
                className={`transition-all duration-200 ease-in-out ${isOpen ? 'max-h-[2000px] opacity-100' : 'max-h-0 opacity-0 overflow-hidden'
                    }`}
            >
                <div className="px-4 pb-4 border-t border-white/10">
                    {children}
                </div>
            </div>
        </div>
    );
}
