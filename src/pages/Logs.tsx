import { useState, useRef, useEffect } from 'react';
import { Trash2, Download, Search, X, MessageSquare, Terminal, RefreshCw, Clock, Globe, Zap, CheckCircle, Info, AlertTriangle, XCircle, Wrench } from 'lucide-react';
import { toast } from '../stores/toastStore';
import { useTranslation, useI18nStore } from '../i18n';
import { useAppStore } from '../stores/appStore';
import { subscribeToLogStream, type LogEntry as ProxyLogEntry } from '../services/proxyService';
import { formatLogMessage } from '../utils/logFormatter';

export function Logs() {
    const { t } = useTranslation();
    const { language } = useI18nStore();
    const { proxyStatus, config } = useAppStore();

    const [humanReadable, setHumanReadable] = useState(true);
    const [autoScroll, setAutoScroll] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [terminalLogs, setTerminalLogs] = useState<ProxyLogEntry[]>([]);
    const terminalRef = useRef<HTMLDivElement>(null);
    const eventSourceRef = useRef<EventSource | null>(null);

    // Level filters
    const [filters, setFilters] = useState({
        INFO: true,
        SUCCESS: true,
        WARN: true,
        ERROR: true,
        DEBUG: true,
    });

    // Subscribe to log stream
    useEffect(() => {
        if (!proxyStatus.running) {
            if (eventSourceRef.current) {
                eventSourceRef.current.close();
                eventSourceRef.current = null;
            }
            return;
        }

        if (eventSourceRef.current) return;

        const eventSource = subscribeToLogStream((log) => {
            setTerminalLogs(prev => [...prev.slice(-(config.app.logBufferSize - 1)), log]);

            // Detect fallback activation and show toast notification
            if (log.message && log.message.includes('Attempting fallback')) {
                // Extract model names from message like "Attempting fallback to gemini-3-flash"
                const match = log.message.match(/Attempting fallback to (\S+)/);
                if (match) {
                    toast.warning(`🔄 ${t('fallbackTriggered')}: ${match[1]}`);
                }
            }
        });

        if (eventSource) {
            eventSourceRef.current = eventSource;
        }

        return () => {
            if (eventSourceRef.current) {
                eventSourceRef.current.close();
                eventSourceRef.current = null;
            }
        };
    }, [proxyStatus.running]);

    // Auto-scroll
    useEffect(() => {
        if (autoScroll && terminalRef.current) {
            terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
        }
    }, [autoScroll, terminalLogs]);


    const toggleFilter = (level: keyof typeof filters) => {
        setFilters(prev => ({ ...prev, [level]: !prev[level] }));
    };

    // Hide noisy logs toggle
    const [hideNoisyLogs, setHideNoisyLogs] = useState(true);

    // Helper function to check if log is noisy
    const isNoisyLog = (message: string) => {
        const lowerMsg = message.toLowerCase();
        return (
            // Polling/API endpoints
            lowerMsg.includes('/health') ||
            lowerMsg.includes('/stats') ||
            lowerMsg.includes('/account-limits') ||
            lowerMsg.includes('/limits') ||
            lowerMsg.includes('/accounts') ||
            lowerMsg.includes('/config') ||
            lowerMsg.includes('/models') ||
            lowerMsg.includes('/presets') ||
            lowerMsg.includes('/usage-history') ||
            lowerMsg.includes('[get]') ||
            lowerMsg.includes('[post]') ||
            // Health checks
            lowerMsg.includes('health check') ||
            lowerMsg.includes('sistem durumu') ||
            // Token refresh
            lowerMsg.includes('token refresh') ||
            lowerMsg.includes('access token refreshed') ||
            lowerMsg.includes('erişim tokeni yenilendi') ||
            // Startup noise
            lowerMsg.includes('web interface ready') ||
            lowerMsg.includes('web arayüzü hazır') ||
            lowerMsg.includes('configuration loaded') ||
            lowerMsg.includes('yapılandırma yüklendi')
        );
    };

    const filteredLogs = terminalLogs.filter(log => {
        // Hide noisy logs if enabled
        if (hideNoisyLogs && isNoisyLog(log.message)) {
            return false;
        }
        if (searchQuery && !log.message.toLowerCase().includes(searchQuery.toLowerCase())) {
            return false;
        }
        const normalizedLevel = log.level?.toLowerCase() || 'info';
        const levelMap: Record<string, keyof typeof filters> = {
            'info': 'INFO',
            'success': 'SUCCESS',
            'warn': 'WARN',
            'warning': 'WARN',
            'error': 'ERROR',
            'debug': 'DEBUG',
        };
        const filterKey = levelMap[normalizedLevel];
        return filterKey ? filters[filterKey] : true;
    });

    const handleClear = () => {
        setTerminalLogs([]);
        toast.info(t('logsCleared'));
    };

    const handleExport = async () => {
        try {
            const { homeDir, join } = await import('@tauri-apps/api/path');
            const { writeTextFile } = await import('@tauri-apps/plugin-fs');

            const content = terminalLogs.map(log =>
                `[${log.timestamp}] [${log.level.toUpperCase()}] ${log.message}`
            ).join('\n');

            const home = await homeDir();
            const fileName = `logs-${new Date().toISOString().split('T')[0]}.txt`;
            const filePath = await join(home, 'Downloads', fileName);

            await writeTextFile(filePath, content);
            toast.success(language === 'tr'
                ? `Loglar kaydedildi: ${filePath}`
                : `Logs saved to: ${filePath}`);
        } catch (error) {
            console.error('Export failed:', error);
            toast.error('Export failed');
        }
    };

    const getTerminalLineColor = (level: string) => {
        const colors: Record<string, string> = {
            'info': 'text-blue-400',
            'success': 'text-green-400',
            'warn': 'text-yellow-400',
            'warning': 'text-yellow-400',
            'error': 'text-red-400',
            'debug': 'text-purple-400',
        };
        return colors[level?.toLowerCase()] || 'text-text-secondary';
    };

    const formatLogTimestamp = (timestamp: string) => {
        try {
            const date = new Date(timestamp);
            return date.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        } catch {
            return timestamp;
        }
    };

    return (
        <div className="h-full flex flex-col animate-fade-in">
            {/* Header Card */}
            <div className="glass-card mb-3 shrink-0">
                {/* Toolbar */}
                <div className="flex items-center justify-between p-2 px-4">
                    {/* Left: Status */}
                    <div className="flex items-center gap-2">
                        {proxyStatus.running && eventSourceRef.current && (
                            <span className="px-1.5 py-0.5 rounded text-[9px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">● LIVE</span>
                        )}
                    </div>

                    {/* Center: Search & Filters */}
                    <div className="flex items-center gap-4">
                        {/* Search */}
                        <div className="relative">
                            <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-text-muted" />
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder={t('grepLogs')}
                                className="w-48 bg-white/5 border border-white/10 rounded py-1.5 pl-7 pr-7 text-xs font-mono text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-primary"
                            />
                            {searchQuery && (
                                <button
                                    onClick={() => setSearchQuery('')}
                                    className="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted hover:text-white"
                                >
                                    <X size={12} />
                                </button>
                            )}
                        </div>

                        {/* Level Filters */}
                        <div className="flex gap-3 text-[10px] font-mono font-bold uppercase">
                            <label className={`flex items-center gap-1.5 cursor-pointer transition-opacity ${filters.INFO ? 'opacity-100' : 'opacity-50'} text-blue-400`}>
                                <input type="checkbox" checked={filters.INFO} onChange={() => toggleFilter('INFO')} className="w-3 h-3 rounded accent-blue-400" />
                                {t('info')}
                            </label>
                            <label className={`flex items-center gap-1.5 cursor-pointer transition-opacity ${filters.SUCCESS ? 'opacity-100' : 'opacity-50'} text-green-400`}>
                                <input type="checkbox" checked={filters.SUCCESS} onChange={() => toggleFilter('SUCCESS')} className="w-3 h-3 rounded accent-green-400" />
                                {t('success')}
                            </label>
                            <label className={`flex items-center gap-1.5 cursor-pointer transition-opacity ${filters.WARN ? 'opacity-100' : 'opacity-50'} text-yellow-400`}>
                                <input type="checkbox" checked={filters.WARN} onChange={() => toggleFilter('WARN')} className="w-3 h-3 rounded accent-yellow-400" />
                                {t('warn')}
                            </label>
                            <label className={`flex items-center gap-1.5 cursor-pointer transition-opacity ${filters.ERROR ? 'opacity-100' : 'opacity-50'} text-red-400`}>
                                <input type="checkbox" checked={filters.ERROR} onChange={() => toggleFilter('ERROR')} className="w-3 h-3 rounded accent-red-400" />
                                {t('error')}
                            </label>
                            <label className={`flex items-center gap-1.5 cursor-pointer transition-opacity ${filters.DEBUG ? 'opacity-100' : 'opacity-50'} text-purple-400`}>
                                <input type="checkbox" checked={filters.DEBUG} onChange={() => toggleFilter('DEBUG')} className="w-3 h-3 rounded accent-purple-400" />
                                {t('debug')}
                            </label>
                        </div>
                    </div>

                    {/* Right: Controls */}
                    <div className="flex items-center gap-3">
                        <span className="text-[10px] font-mono text-text-muted">{filteredLogs.length}/{terminalLogs.length}</span>

                        <label className="flex items-center gap-2 cursor-pointer">
                            <span className="text-[10px] font-mono text-text-muted uppercase">{t('hideNoise')}</span>
                            <input
                                type="checkbox"
                                checked={hideNoisyLogs}
                                onChange={() => setHideNoisyLogs(!hideNoisyLogs)}
                                className="w-8 h-4 rounded-full appearance-none bg-white/20 checked:bg-orange-500 cursor-pointer transition-colors relative before:content-[''] before:absolute before:w-3 before:h-3 before:rounded-full before:bg-white before:top-0.5 before:left-0.5 before:transition-transform checked:before:translate-x-4"
                            />
                        </label>

                        <label className="flex items-center gap-2 cursor-pointer">
                            <span className="text-[10px] font-mono text-text-muted uppercase">{t('autoScroll')}</span>
                            <input
                                type="checkbox"
                                checked={autoScroll}
                                onChange={() => setAutoScroll(!autoScroll)}
                                className="w-8 h-4 rounded-full appearance-none bg-white/20 checked:bg-accent-success cursor-pointer transition-colors relative before:content-[''] before:absolute before:w-3 before:h-3 before:rounded-full before:bg-white before:top-0.5 before:left-0.5 before:transition-transform checked:before:translate-x-4"
                            />
                        </label>

                        <button
                            onClick={() => setHumanReadable(!humanReadable)}
                            className={`flex items-center gap-1.5 px-2 py-1 rounded text-[10px] font-medium transition-colors ${humanReadable ? 'bg-green-500/20 text-green-400' : 'bg-white/5 text-text-muted'}`}
                            title={humanReadable ? 'Human-Readable Mode' : 'Terminal Mode'}
                        >
                            {humanReadable ? <MessageSquare size={12} /> : <Terminal size={12} />}
                            {humanReadable ? (language === 'tr' ? 'Okunabilir' : 'Readable') : (language === 'tr' ? 'Teknik' : 'Raw')}
                        </button>

                        <button onClick={handleClear} className="p-1.5 rounded hover:bg-white/10 text-text-muted hover:text-white transition-colors" title={t('clearLogsTooltip')}>
                            <Trash2 size={14} />
                        </button>
                        <button onClick={handleExport} className="p-1.5 rounded hover:bg-white/10 text-text-muted hover:text-white transition-colors" title={t('exportLogs')}>
                            <Download size={14} />
                        </button>
                    </div>
                </div>
            </div>

            {/* Log View - Windows Terminal Style */}
            <div className="flex-1 overflow-hidden rounded-lg border border-zinc-800">
                <div className="h-full bg-[#0c0c0c]">
                    {!proxyStatus.running && (
                        <div className="text-zinc-500 p-4 font-mono text-[11px]">
                            <p>PS C:\proxy&gt; {language === 'tr' ? 'Proxy başlatılması bekleniyor...' : 'Waiting for proxy to start...'}</p>
                            <p className="text-zinc-600">PS C:\proxy&gt; {language === 'tr' ? 'Log akışı burada gerçek zamanlı görüntülenecek.' : 'Log stream will appear here in real-time.'}</p>
                        </div>
                    )}

                    {filteredLogs.length > 0 ? (
                        <div ref={terminalRef} className="h-full overflow-auto p-3 font-mono text-[11px] leading-relaxed" style={{ contain: 'strict' }}>
                            {filteredLogs.slice(-500).map((log, i) => {
                                if (humanReadable) {
                                    const formatted = formatLogMessage(log.message, log.level, { language: language as 'en' | 'tr' });
                                    const colorClasses: Record<string, string> = {
                                        green: 'text-green-400',
                                        blue: 'text-blue-400',
                                        yellow: 'text-yellow-400',
                                        red: 'text-red-400',
                                        purple: 'text-purple-400',
                                        gray: 'text-text-muted'
                                    };
                                    return (
                                        <div key={i} className={`py-1 px-2 -mx-2 rounded hover:bg-white/5 flex items-center gap-2 ${colorClasses[formatted.color]}`}>
                                            {/* Brand logos as custom SVGs, everything else as Lucide icons */}
                                            {formatted.icon === '🟣' ? (
                                                <img src="/claude-color.svg" alt="Claude" className="w-4 h-4" />
                                            ) : formatted.icon === '🔵' ? (
                                                <img src="/gemini-color.svg" alt="Gemini" className="w-4 h-4" />
                                            ) : formatted.icon === '👤' || formatted.icon === '👥' ? (
                                                <img src="/gmail.svg" alt="Gmail" className="w-4 h-4" />
                                            ) : formatted.icon === '🔄' ? (
                                                <RefreshCw size={16} className="animate-spin text-blue-400" />
                                            ) : formatted.icon === '⏳' ? (
                                                <Clock size={16} className="text-yellow-400" />
                                            ) : formatted.icon === '🌐' ? (
                                                <Globe size={16} className="text-green-400" />
                                            ) : formatted.icon === '🚀' ? (
                                                <Zap size={16} className="text-green-400" />
                                            ) : formatted.icon === '✅' ? (
                                                <CheckCircle size={16} className="text-green-400" />
                                            ) : formatted.icon === 'ℹ️' ? (
                                                <Info size={16} className="text-blue-400" />
                                            ) : formatted.icon === '🔧' ? (
                                                <Wrench size={16} className="text-gray-400" />
                                            ) : formatted.icon === '⚠️' ? (
                                                <AlertTriangle size={16} className="text-yellow-400" />
                                            ) : formatted.icon === '❌' ? (
                                                <XCircle size={16} className="text-red-400" />
                                            ) : (
                                                <Info size={16} className="text-gray-400" />
                                            )}
                                            <div className="flex-1">
                                                <span>{formatted.title}</span>
                                                {formatted.description && (
                                                    <span className="text-text-muted ml-2 text-[10px]">— {formatted.description}</span>
                                                )}
                                            </div>
                                            <span className="text-text-muted text-[10px]">{formatLogTimestamp(log.timestamp)}</span>
                                        </div>
                                    );
                                }
                                return (
                                    <div key={i} className={`py-0.5 ${getTerminalLineColor(log.level)} hover:bg-white/5`}>
                                        <span className="text-text-muted">[{formatLogTimestamp(log.timestamp)}]</span>
                                        {' '}
                                        <span className={getTerminalLineColor(log.level)}>[{log.level.toUpperCase()}]</span>
                                        {' '}
                                        {log.message}
                                        {log.context && <span className="text-text-muted"> ({log.context})</span>}
                                    </div>
                                );
                            })}
                        </div>
                    ) : proxyStatus.running ? (
                        <div className="text-center py-8 text-text-muted italic font-mono text-[11px]">{t('noLogsMatch')}</div>
                    ) : null}
                </div>
            </div>
        </div>
    );
}
