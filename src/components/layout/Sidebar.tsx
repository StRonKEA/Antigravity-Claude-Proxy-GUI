import { LayoutDashboard, Users, Database, FileText, Settings, BarChart3, Globe } from 'lucide-react';
import { useAppStore } from '../../stores/appStore';
import { useTranslation, useI18nStore } from '../../i18n';
import { updateSettings } from '../../services/appStorageService';

type NavItemId = 'dashboard' | 'accounts' | 'models' | 'statistics' | 'logs' | 'settings';

const navItems: { id: NavItemId; icon: typeof LayoutDashboard }[] = [
    { id: 'dashboard', icon: LayoutDashboard },
    { id: 'accounts', icon: Users },
    { id: 'models', icon: Database },
    { id: 'statistics', icon: BarChart3 },
    { id: 'logs', icon: FileText },
    { id: 'settings', icon: Settings },
];

export function Sidebar() {
    const { currentPage, setCurrentPage, proxyStatus } = useAppStore();
    const { t } = useTranslation();
    const { language, setLanguage } = useI18nStore();

    const toggleLanguage = () => {
        const newLang = language === 'tr' ? 'en' : 'tr';
        setLanguage(newLang);
        updateSettings({ language: newLang });
    };

    return (
        <aside className="w-[72px] h-full bg-bg-secondary/80 backdrop-blur-xl border-r border-white/5 flex flex-col items-center py-3">
            {/* App Icon with connection indicator */}
            <div className="relative mb-5">
                <div className="w-10 h-10 flex items-center justify-center">
                    <img src="/app-icon.png" alt="Antigravity" className="w-10 h-10 object-contain" />
                </div>
                {/* Connection Status Dot */}
                <div className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-bg-secondary ${proxyStatus.running ? 'bg-emerald-500 shadow-lg shadow-emerald-500/50' : 'bg-zinc-600'
                    }`} />
            </div>

            {/* Navigation */}
            <nav className="flex-1 flex flex-col gap-1 w-full px-2">
                {navItems.map((item) => {
                    const Icon = item.icon;
                    const isActive = currentPage === item.id;
                    // Dashboard and Settings are always enabled, others require proxy
                    const requiresProxy = !['dashboard', 'settings'].includes(item.id);
                    const isDisabled = requiresProxy && !proxyStatus.running;

                    return (
                        <button
                            key={item.id}
                            onClick={() => !isDisabled && setCurrentPage(item.id)}
                            title={isDisabled ? `${t(item.id)} (${t('proxyNotRunning')})` : t(item.id)}
                            disabled={isDisabled}
                            className={`
                                group relative flex flex-col items-center justify-center gap-0.5 py-2.5 rounded-lg transition-all duration-200
                                ${isDisabled
                                    ? 'text-zinc-700 cursor-not-allowed opacity-40'
                                    : isActive
                                        ? 'bg-accent-primary/15 text-accent-primary'
                                        : 'text-zinc-500 hover:text-zinc-300 hover:bg-white/5'
                                }
                            `}
                        >
                            <Icon size={18} strokeWidth={isActive ? 2.5 : 2} />
                            <span className={`text-[8px] font-medium tracking-wide ${isActive ? 'text-accent-primary' : ''}`}>
                                {t(item.id)}
                            </span>
                            {/* Active indicator */}
                            {isActive && !isDisabled && (
                                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-6 bg-accent-primary rounded-r-full" />
                            )}
                        </button>
                    );
                })}
            </nav>

            {/* Bottom Actions */}
            <div className="w-full px-2 pt-2 border-t border-white/5">
                <button
                    onClick={toggleLanguage}
                    className="w-full flex flex-col items-center justify-center gap-0.5 py-2 rounded-lg text-zinc-500 hover:text-zinc-300 hover:bg-white/5 transition-all duration-200"
                    title={language === 'tr' ? 'Switch to English' : 'Türkçe\'ye geç'}
                >
                    <Globe size={16} />
                    <span className="text-[8px] font-semibold">{language.toUpperCase()}</span>
                </button>
            </div>
        </aside>
    );
}
