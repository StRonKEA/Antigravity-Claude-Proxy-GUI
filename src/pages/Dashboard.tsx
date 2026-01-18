import { useState, useEffect, useRef } from 'react';
import { startProxy, stopProxy, getProxyStatus, getAccountLimits, subscribeToLogStream, type LogEntry as ProxyLogEntry } from '../services/proxyService';
import type { ProxyStatus } from '../types';
import { Power, Play, X, Clock, Users, Database, Zap, AlertTriangle, RefreshCw, Wifi, WifiOff, Download, ArrowUpCircle, Copy, Check, ChevronDown, XCircle, AlertCircle } from 'lucide-react';
import { ModelIcon } from '../components/ModelIcon';
import { useAppStore } from '../stores/appStore';
import { toast } from '../stores/toastStore';
import { useTranslation, useI18nStore } from '../i18n';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { SkeletonDashboard } from '../components/Skeleton';
import { formatLogMessage } from '../utils/logFormatter';

import { checkInstallation, installPackage, updatePackage } from '../services/proxyPackageService';
import type { Account, ModelQuota } from '../types';


// Helper to calculate quota alerts from real data
const getQuotaAlerts = (accounts: Account[]) => {
    const alerts = {
        critical: [] as { email: string, model: string, percentage: number }[],
        warning: 0,
        healthy: 0
    };

    accounts.forEach(acc => {
        if (!acc.limits) return;
        let isHealthy = true;

        Object.entries(acc.limits).forEach(([model, limit]: [string, any]) => {
            const remaining = limit.remainingFraction * 100;
            if (remaining < 20) {
                alerts.critical.push({ email: acc.email, model, percentage: Math.round(remaining) });
                isHealthy = false;
            } else if (remaining < 40) {
                alerts.warning++;
                isHealthy = false;
            }
        });

        if (isHealthy) alerts.healthy++;
    });

    return alerts;
};

// Helper to calculate overall quota stats (all, claude, gemini)
const getQuotaStats = (accounts: Account[]) => {
    const allQuotas: number[] = [];
    const claudeQuotas: number[] = [];
    const geminiQuotas: number[] = [];

    accounts.forEach(acc => {
        if (!acc.limits) return;
        Object.entries(acc.limits).forEach(([model, limit]: [string, any]) => {
            if (limit.remainingFraction !== null && limit.remainingFraction !== undefined) {
                const pct = limit.remainingFraction * 100;
                allQuotas.push(pct);

                const modelLower = model.toLowerCase();
                if (modelLower.includes('claude') || modelLower.includes('opus') || modelLower.includes('sonnet') || modelLower.includes('haiku')) {
                    claudeQuotas.push(pct);
                } else if (modelLower.includes('gemini')) {
                    geminiQuotas.push(pct);
                }
            }
        });
    });

    const calcAvg = (arr: number[]) => arr.length > 0 ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : null;

    return {
        all: calcAvg(allQuotas),
        claude: calcAvg(claudeQuotas),
        gemini: calcAvg(geminiQuotas)
    };
};

// Helper to count subscriptions
const getSubscriptionCounts = (accounts: Account[]) => {
    const counts = { ultra: 0, pro: 0, free: 0 };
    accounts.forEach(acc => {
        if (acc.subscription?.tier === 'ultra') counts.ultra++;
        else if (acc.subscription?.tier === 'pro') counts.pro++;
        else counts.free++;
    });
    return counts;
};

export function Dashboard() {
    const { proxyStatus, setProxyStatus, proxyPackage, setProxyPackage, accounts, setAccounts, config, proxyStartTime, setProxyStartTime } = useAppStore();
    const { t } = useTranslation();
    const { language } = useI18nStore();
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [installProgress, setInstallProgress] = useState<string>('');
    const [updateBannerDismissed, setUpdateBannerDismissed] = useState(false);

    // Live uptime counter
    const [liveUptime, setLiveUptime] = useState(0);
    const [copied, setCopied] = useState(false);
    const [isInitialLoading, setIsInitialLoading] = useState(true);

    // Live log feed
    const [dashboardLogs, setDashboardLogs] = useState<ProxyLogEntry[]>([]);
    const logEventSourceRef = useRef<EventSource | null>(null);
    const logContainerRef = useRef<HTMLDivElement>(null);

    // Session-based request counter (resets on app restart)
    const [sessionRequests, setSessionRequests] = useState(0);

    // Live uptime ticker - updates every second (uses global store for persistence)
    useEffect(() => {
        if (!proxyStatus.running) {
            setLiveUptime(0);
            // Don't clear proxyStartTime here - let handleStop do it
            return;
        }

        // Set start time if not already set (persisted in global store)
        if (!proxyStartTime) {
            setProxyStartTime(Date.now());
        }

        // Initial uptime calculation
        if (proxyStartTime) {
            const elapsed = Math.floor((Date.now() - proxyStartTime) / 1000);
            setLiveUptime(elapsed);
        }

        const ticker = setInterval(() => {
            if (proxyStartTime) {
                const elapsed = Math.floor((Date.now() - proxyStartTime) / 1000);
                setLiveUptime(elapsed);
            }
        }, 1000);

        return () => clearInterval(ticker);
    }, [proxyStatus.running, proxyStartTime, setProxyStartTime]);

    // Live log stream for dashboard
    useEffect(() => {
        if (!proxyStatus.running) {
            if (logEventSourceRef.current) {
                logEventSourceRef.current.close();
                logEventSourceRef.current = null;
            }
            setDashboardLogs([]);
            setSessionRequests(0); // Reset session counter
            return;
        }

        if (logEventSourceRef.current) return;

        const eventSource = subscribeToLogStream((log) => {
            // Filter out noisy logs - keep only important events
            const lowerMsg = log.message.toLowerCase();
            const isNoisyLog =
                // Polling/API logs
                lowerMsg.includes('/health') ||
                lowerMsg.includes('/stats') ||
                lowerMsg.includes('/account-limits') ||
                lowerMsg.includes('/limits') ||
                lowerMsg.includes('/accounts') ||
                lowerMsg.includes('/config') ||
                lowerMsg.includes('/models') ||
                lowerMsg.includes('/presets') ||
                lowerMsg.includes('[get]') ||
                lowerMsg.includes('[post]') ||
                // Health/Stats (TR & EN)
                lowerMsg.includes('health check') ||
                lowerMsg.includes('getting statistics') ||
                lowerMsg.includes('checking account limits') ||
                lowerMsg.includes('sistem durumu kontrolü') ||
                lowerMsg.includes('istatistikler alınıyor') ||
                lowerMsg.includes('hesap limitleri kontrol') ||
                // Token refresh (too frequent)
                lowerMsg.includes('token refresh') ||
                lowerMsg.includes('access token refreshed') ||
                lowerMsg.includes('erişim tokeni yenilendi') ||
                // API Chat/Completion requests (too frequent)
                lowerMsg.includes('api chat request') ||
                lowerMsg.includes('api sohbet isteği') ||
                lowerMsg.includes('api completion request') ||
                lowerMsg.includes('api tamamlama isteği') ||
                // Startup noise
                lowerMsg.includes('web interface ready') ||
                lowerMsg.includes('web arayüzü hazır') ||
                lowerMsg.includes('account pool ready') ||
                lowerMsg.includes('hesap havuzu hazır') ||
                lowerMsg.includes('accounts loaded') ||
                lowerMsg.includes('hesap yüklendi') ||
                lowerMsg.includes('configuration loaded') ||
                lowerMsg.includes('yapılandırma yüklendi') ||
                lowerMsg.includes('loading configuration') ||
                lowerMsg.includes('yapılandırma yükleniyor') ||
                lowerMsg.includes('getting accounts') ||
                lowerMsg.includes('hesaplar alınıyor') ||
                lowerMsg.includes('getting model list') ||
                lowerMsg.includes('model listesi alınıyor');

            if (!isNoisyLog) {
                setDashboardLogs(prev => [...prev.slice(-14), log]); // Keep last 15
            }

            // Count model usage for session requests (detect from raw log patterns)
            // Raw logs: "[API] Request for model: gemini-..." or "[API] Request for model: claude-..."
            const isModelUsage = lowerMsg.includes('[api]') && lowerMsg.includes('request for model');

            if (isModelUsage) {
                setSessionRequests(prev => prev + 1);
            }
        });

        if (eventSource) {
            logEventSourceRef.current = eventSource;
        }

        return () => {
            if (logEventSourceRef.current) {
                logEventSourceRef.current.close();
                logEventSourceRef.current = null;
            }
        };
    }, [proxyStatus.running]);

    // Auto-scroll logs
    useEffect(() => {
        if (logContainerRef.current) {
            logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
        }
    }, [dashboardLogs]);

    // Check proxy package installation on mount - only if not already checked
    useEffect(() => {
        // Skip if already checked (has version info or explicitly marked as checked)
        if (proxyPackage.installedVersion || proxyPackage.isInstalled !== undefined && !proxyPackage.isChecking) {
            return;
        }

        const checkPackage = async () => {
            setProxyPackage({ isChecking: true });
            const status = await checkInstallation();

            // FALLBACK: Even if install check fails, try to detect running proxy
            if (!status.isInstalled) {
                try {
                    const proxyStatus = await getProxyStatus(config.proxy.port);
                    if (proxyStatus.running) {
                        console.info('Proxy is running, treating as installed (fallback)');
                        setProxyPackage({
                            isInstalled: true,
                            installedVersion: 'running',
                            latestVersion: status.latestVersion,
                            updateAvailable: false,
                            isChecking: false,
                        });
                        setProxyStatus(proxyStatus);
                        return;
                    }
                } catch (e) {
                    console.debug('Fallback proxy check failed:', e);
                }
            }

            setProxyPackage({
                isInstalled: status.isInstalled,
                installedVersion: status.installedVersion,
                latestVersion: status.latestVersion,
                updateAvailable: status.updateAvailable,
                isChecking: false,
            });
            // Banner will automatically show when updateAvailable is true
        };
        checkPackage();
    }, [proxyPackage.installedVersion, proxyPackage.isInstalled]);

    // Ref to track if we're in the middle of stopping (to prevent polling race condition)
    const isStoppingRef = useRef(false);

    // Poll proxy status and data - only poll when proxy is supposed to be running
    useEffect(() => {
        if (!proxyPackage.isInstalled) return;

        const pollStatus = async () => {
            // Skip polling if we're in the middle of stopping
            if (isStoppingRef.current) {
                console.debug('[Dashboard] Skipping poll - stop in progress');
                return;
            }

            const status = await getProxyStatus(config.proxy.port);

            // Double-check we're not stopping (could have changed during async call)
            if (isStoppingRef.current) {
                return;
            }

            setProxyStatus(status);

            if (status.running) {
                const limitData = await getAccountLimits(status.port);

                if (limitData) {
                    setAccounts(limitData.accounts);
                }
                setIsInitialLoading(false);
            } else {
                setIsInitialLoading(false);
            }
        };

        // Delay initial poll to let auto-start complete (if enabled)
        const initialDelay = setTimeout(() => {
            pollStatus();
        }, 3000);

        // Only continue polling if proxy is running
        // When proxy is stopped, we do one final check and then stop polling
        let interval: NodeJS.Timeout | null = null;
        if (proxyStatus.running) {
            // Use pollingInterval from settings (convert seconds to ms)
            const pollIntervalMs = (config.app.pollingInterval || 30) * 1000;
            interval = setInterval(pollStatus, pollIntervalMs);
            console.debug(`[Dashboard] Polling every ${config.app.pollingInterval}s`);
        } else {
            console.debug('[Dashboard] Proxy not running, will poll once after delay');
        }

        return () => {
            clearTimeout(initialDelay);
            if (interval) clearInterval(interval);
        };
    }, [proxyPackage.isInstalled, proxyStatus.running, config.proxy.port, config.app.pollingInterval]);

    // Calculate real stats from accounts data
    const realAccountCount = accounts.length;


    const handleInstall = async () => {
        setProxyPackage({ isInstalling: true });

        // Attempt install (ignore return value, check reality instead)
        await installPackage(setInstallProgress);

        // Wait 2 seconds for file system/PATH update
        setInstallProgress('Verifying installation...');
        await new Promise(resolve => setTimeout(resolve, 2000));

        const status = await checkInstallation();

        setProxyPackage({
            isInstalled: status.isInstalled,
            installedVersion: status.installedVersion,
            latestVersion: status.latestVersion,
            updateAvailable: status.updateAvailable,
            isInstalling: false,
        });

        if (status.isInstalled) {
            toast.success(t('installSuccess'));
        } else {
            toast.error(t('installFailed'));
        }
        setInstallProgress('');
    };

    const handleUpdate = async () => {
        setProxyPackage({ isInstalling: true });
        const success = await updatePackage(setInstallProgress);
        if (success) {
            const status = await checkInstallation();
            setProxyPackage({
                isInstalled: status.isInstalled,
                installedVersion: status.installedVersion,
                latestVersion: status.latestVersion,
                updateAvailable: false,
                isInstalling: false,
            });
            setUpdateBannerDismissed(false); // Reset dismiss state on update
            toast.success(t('updateSuccess'));
        } else {
            setProxyPackage({ isInstalling: false });
        }
        setInstallProgress('');
    };

    const handleDismissUpdate = () => {
        setUpdateBannerDismissed(true);
    };


    const handleStart = async () => {
        toast.info(`Starting proxy on port ${config.proxy.port}...`);

        const success = await startProxy(config.proxy.port, config.proxy.fallbackEnabled);

        if (success) {
            setProxyStatus({ running: true });
            setProxyStartTime(Date.now()); // Record start time in global store
            toast.success(t('proxyStarted'));

            // Kiro auto-start: check settings and start Kiro server if enabled
            try {
                const { loadSettings } = await import('../services/appStorageService');
                const { startKiroServer, patchKiro, isKiroInstalled } = await import('../services/kiroService');

                const settings = await loadSettings();
                if (settings.kiroAutoStart) {
                    const kiroInstalled = await isKiroInstalled();
                    if (kiroInstalled) {
                        console.log('[Dashboard] Kiro auto-start enabled, starting Kiro server...');
                        const result = await startKiroServer();
                        if (result.success) {
                            await patchKiro();
                            console.log('[Dashboard] Kiro server started and patched');
                        }
                    }
                }
            } catch (e) {
                console.error('[Dashboard] Kiro auto-start failed:', e);
            }
        } else {
            toast.error(t('proxyStartFailed'));
        }
    };

    const handleStop = async () => {
        // Set stopping flag to prevent polling from interfering
        isStoppingRef.current = true;

        // Immediately update UI to show stopped
        setProxyStatus({ running: false, uptime: 0 });
        setProxyStartTime(null); // Clear start time
        setAccounts([]); // Clear sensitive data

        // Stop Kiro server if auto-start was enabled
        try {
            const { stopKiroServer } = await import('../services/kiroService');
            await stopKiroServer();
            console.log('[Dashboard] Kiro server stopped');
        } catch (e) {
            console.error('[Dashboard] Kiro stop failed:', e);
        }

        const success = await stopProxy(config.proxy.port);

        // Clear stopping flag
        isStoppingRef.current = false;

        if (success) {
            toast.info(t('proxyStopped'));
        } else {
            toast.error(t('proxyStopFailed'));
        }
    };

    const handleRefresh = async () => {
        setIsRefreshing(true);
        await new Promise(resolve => setTimeout(resolve, 1000));
        setIsRefreshing(false);
        toast.success(t('dataRefreshed'));
    };

    const formatUptime = (seconds: number) => {
        const hours = Math.floor(seconds / 3600);
        const mins = Math.floor((seconds % 3600) / 60);
        const secs = seconds % 60;
        return `${hours}h ${mins}m ${secs}s`;
    };

    const proxyUrl = `http://localhost:${config.proxy.port}`;

    const copyUrl = async () => {
        await navigator.clipboard.writeText(proxyUrl);
        setCopied(true);
        toast.success(t('clickToCopy'));
        setTimeout(() => setCopied(false), 2000);
    };

    const quotaAlerts = getQuotaAlerts(accounts);
    const quotaStats = getQuotaStats(accounts);
    const subscriptionData = getSubscriptionCounts(accounts);
    const allHealthy = quotaAlerts.critical.length === 0 && quotaAlerts.warning === 0;
    const rateLimitedCount = accounts.filter(acc => acc.status === 'rate_limited').length;

    const stats = [
        { labelKey: 'accounts' as const, value: realAccountCount, icon: Users, color: 'text-accent-primary' },
        { labelKey: 'requests' as const, value: sessionRequests, icon: Zap, color: 'text-accent-success' },
        { labelKey: 'critical' as const, value: quotaAlerts.critical.length, icon: AlertTriangle, color: quotaAlerts.critical.length > 0 ? 'text-accent-error' : 'text-accent-success' },
        { labelKey: 'rateLimited' as const, value: proxyStatus.counts?.rateLimited || 0, icon: Clock, color: (proxyStatus.counts?.rateLimited || 0) > 0 ? 'text-accent-warning' : 'text-text-muted' },
        { labelKey: 'invalid' as const, value: proxyStatus.counts?.invalid || 0, icon: XCircle, color: (proxyStatus.counts?.invalid || 0) > 0 ? 'text-accent-error' : 'text-text-muted' },
    ];

    return (
        <div className="space-y-4 animate-fade-in">
            {/* Header */}
            <div className="flex items-center justify-between">
                <h1 className="text-xl font-bold text-text-primary">{t('dashboard')}</h1>
                <div className="flex items-center gap-3">
                    {/* Refresh Button */}
                    <button
                        onClick={handleRefresh}
                        disabled={isRefreshing}
                        className="p-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors"
                    >
                        <RefreshCw size={16} className={`text-text-secondary ${isRefreshing ? 'animate-spin' : ''}`} />
                    </button>
                </div>
            </div>

            {/* Update Available Banner */}
            {proxyPackage.updateAvailable && !updateBannerDismissed && (
                <div className="glass-card p-4 bg-gradient-to-r from-blue-500/10 to-purple-500/10 border border-blue-500/30">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <ArrowUpCircle className="text-blue-400" size={24} />
                            <div>
                                <p className="text-sm font-semibold text-text-primary">{t('updateAvailable')}</p>
                                <p className="text-xs text-text-secondary">
                                    {t('currentVersion')}: v{proxyPackage.installedVersion} → {t('latestVersion')}: v{proxyPackage.latestVersion}
                                </p>
                            </div>
                        </div>
                        <div className="flex gap-2">
                            <button
                                onClick={handleDismissUpdate}
                                className="px-3 py-1.5 text-xs rounded-lg bg-white/5 text-text-secondary hover:bg-white/10 transition-colors"
                            >
                                {t('updateLater')}
                            </button>
                            <button
                                onClick={handleUpdate}
                                disabled={proxyPackage.isInstalling}
                                className="px-3 py-1.5 text-xs rounded-lg bg-blue-500 text-white hover:bg-blue-600 transition-colors flex items-center gap-2"
                            >
                                {proxyPackage.isInstalling ? t('updating') : t('updateNow')}
                            </button>
                        </div>
                    </div>
                    {installProgress && (
                        <p className="text-xs text-text-muted mt-2 font-mono">{installProgress}</p>
                    )}
                </div>
            )}

            {/* Proxy Not Installed Panel */}
            {!proxyPackage.isChecking && !proxyPackage.isInstalled ? (
                <div className="glass-card p-8 text-center">
                    <div className="w-20 h-20 rounded-full bg-yellow-500/20 ring-2 ring-yellow-500/30 flex items-center justify-center mx-auto mb-4">
                        <Download className="w-10 h-10 text-yellow-400" />
                    </div>
                    <h2 className="text-xl font-bold text-text-primary mb-2">{t('proxyNotInstalled')}</h2>
                    <p className="text-sm text-text-secondary mb-6 max-w-md mx-auto">
                        {t('proxyNotInstalledDesc')}
                    </p>
                    <div className="bg-bg-tertiary rounded-lg p-4 mb-6 max-w-md mx-auto">
                        <code className="text-xs text-accent-primary font-mono">
                            npm install -g antigravity-claude-proxy@latest
                        </code>
                    </div>
                    <button
                        onClick={handleInstall}
                        disabled={proxyPackage.isInstalling}
                        className="px-6 py-3 rounded-lg bg-gradient-to-r from-accent-primary to-accent-secondary text-white font-medium hover:shadow-lg hover:shadow-accent-primary/30 transition-all flex items-center gap-2 mx-auto"
                    >
                        <Download size={18} />
                        {proxyPackage.isInstalling ? t('installing') : t('installProxy')}
                    </button>
                    {installProgress && (
                        <p className="text-xs text-text-muted mt-4 font-mono">{installProgress}</p>
                    )}
                </div>
            ) : proxyPackage.isChecking ? (
                <div className="glass-card p-8 text-center">
                    <div className="w-16 h-16 rounded-full bg-white/10 flex items-center justify-center mx-auto mb-4 animate-pulse">
                        <RefreshCw className="w-8 h-8 text-text-muted animate-spin" />
                    </div>
                    <p className="text-sm text-text-secondary">{t('checkingVersion')}</p>
                </div>
            ) : (
                /* Proxy Control Panel */
                <div className="glass-card p-4">

                    <div className="flex items-center justify-between">
                        {/* Status */}
                        <div className="flex items-center gap-4">
                            <div className={`
                                w-12 h-12 rounded-xl flex items-center justify-center shrink-0
                                ${proxyStatus.running
                                    ? 'bg-emerald-500/15 ring-1 ring-emerald-500/50'
                                    : 'bg-zinc-800/50 ring-1 ring-zinc-700'
                                }
                            `}>
                                <Power className={`w-6 h-6 ${proxyStatus.running ? 'text-emerald-400' : 'text-zinc-500'}`} />
                            </div>

                            <div>
                                <p className="text-[10px] text-zinc-500 uppercase tracking-wide mb-0.5">{t('proxyStatus')}</p>
                                <p className={`text-xl font-semibold ${proxyStatus.running ? 'text-emerald-400' : 'text-zinc-500'}`}>
                                    {proxyStatus.running ? t('running') : t('stopped')}
                                </p>
                                <div className="flex gap-3 text-[11px] text-zinc-500 mt-1">
                                    <button
                                        onClick={copyUrl}
                                        className="flex items-center gap-1 hover:text-zinc-300 transition-colors cursor-pointer group"
                                        title={t('clickToCopy')}
                                    >
                                        {copied ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} className="group-hover:text-zinc-300" />}
                                        <span className="font-mono">{proxyUrl}</span>
                                    </button>
                                    <span className="flex items-center gap-1 font-mono tabular-nums">
                                        <Clock size={11} />
                                        {proxyStatus.running ? formatUptime(liveUptime) : '--'}
                                    </span>
                                    {/* Latency Indicator */}
                                    {proxyStatus.running && proxyStatus.latencyMs !== undefined && (
                                        <span className={`flex items-center gap-1 font-mono tabular-nums ${proxyStatus.latencyMs < 100 ? 'text-emerald-400' :
                                            proxyStatus.latencyMs < 500 ? 'text-amber-400' : 'text-red-400'
                                            }`}>
                                            <Zap size={11} />
                                            {proxyStatus.latencyMs}ms
                                        </span>
                                    )}
                                    {/* Fallback Indicator */}
                                    {proxyStatus.running && config.proxy.fallbackEnabled && (
                                        <span className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-violet-500/15 text-violet-400 border border-violet-500/20">
                                            ↔ Fallback
                                        </span>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Control Buttons */}
                        <div className="flex gap-2">
                            <button
                                onClick={handleStart}
                                disabled={proxyStatus.running}
                                className={`
                                    flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all
                                    ${proxyStatus.running
                                        ? 'bg-zinc-800/50 text-zinc-600 cursor-not-allowed'
                                        : 'bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25 ring-1 ring-emerald-500/30'
                                    }
                                `}
                            >
                                <Play size={16} />
                                {t('start')}
                            </button>

                            <button
                                onClick={handleStop}
                                disabled={!proxyStatus.running}
                                className={`
                                    flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all
                                    ${!proxyStatus.running
                                        ? 'bg-zinc-800/50 text-zinc-600 cursor-not-allowed'
                                        : 'bg-red-500/15 text-red-400 hover:bg-red-500/25 ring-1 ring-red-500/30'
                                    }
                                `}
                            >
                                <X size={16} />
                                {t('stop')}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Rest of content only shown when installed */}
            {proxyPackage.isInstalled && (
                <>
                    {/* Stats Row */}
                    <div className="grid grid-cols-5 gap-2">
                        {stats.map((stat) => {
                            const Icon = stat.icon;
                            return (
                                <div key={stat.labelKey} className="glass-card p-3 text-center">
                                    <Icon className={`w-5 h-5 mx-auto mb-1 opacity-80 ${stat.color}`} />
                                    <p className="text-lg font-semibold text-zinc-100">{stat.value}</p>
                                    <p className="text-[10px] text-zinc-500 uppercase tracking-wide">{t(stat.labelKey)}</p>
                                    {stat.labelKey === 'accounts' && (
                                        <div className="flex justify-center gap-1 mt-1.5">
                                            {subscriptionData.ultra > 0 && (
                                                <span className="px-1 py-0.5 rounded text-[8px] bg-amber-500/15 text-amber-400 border border-amber-500/20">
                                                    {subscriptionData.ultra} Ultra
                                                </span>
                                            )}
                                            <span className="px-1 py-0.5 rounded text-[8px] bg-blue-500/15 text-blue-400 border border-blue-500/20">
                                                {subscriptionData.pro} Pro
                                            </span>
                                            <span className="px-1 py-0.5 rounded text-[8px] bg-zinc-500/15 text-zinc-400 border border-zinc-500/20">
                                                {subscriptionData.free} Free
                                            </span>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>


                    {/* Quota Status with Pie Chart */}
                    <div className="glass-card p-4">
                        <div className="flex items-center gap-2 mb-3">
                            <AlertTriangle size={16} className={allHealthy ? 'text-accent-success' : 'text-accent-warning'} />
                            <h3 className="text-sm font-semibold text-text-primary">{t('quotaStatus')}</h3>
                        </div>

                        {/* Compact Stats Row */}
                        <div className="flex gap-3">
                            <div className="flex-1 flex items-center justify-between p-3 rounded-lg bg-purple-500/10 border border-purple-500/20">
                                <div className="flex items-center gap-2">
                                    <ModelIcon modelId="claude" size={14} />
                                    <span className="text-xs text-purple-400">Claude</span>
                                </div>
                                <span className="text-sm font-bold font-mono text-purple-400">{quotaStats.claude ?? '-'}%</span>
                            </div>

                            <div className="flex-1 flex items-center justify-between p-3 rounded-lg bg-green-500/10 border border-green-500/20">
                                <div className="flex items-center gap-2">
                                    <ModelIcon modelId="gemini" size={14} />
                                    <span className="text-xs text-green-400">Gemini</span>
                                </div>
                                <span className="text-sm font-bold font-mono text-green-400">{quotaStats.gemini ?? '-'}%</span>
                            </div>
                        </div>
                    </div>

                    {/* Live Log Feed */}
                    {proxyStatus.running && (
                        <div className="glass-card p-4">
                            <div className="flex items-center gap-2 mb-3">
                                <span className="relative flex h-2 w-2">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                                    <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                                </span>
                                <h3 className="text-sm font-semibold text-text-primary">{t('liveActivity')}</h3>
                            </div>
                            <div
                                ref={logContainerRef}
                                className="bg-bg-tertiary rounded-lg p-3 max-h-[200px] overflow-y-auto font-mono text-xs"
                            >
                                {dashboardLogs.length === 0 ? (
                                    <p className="text-text-muted text-center py-4">{t('waitingForLogs')}</p>
                                ) : (
                                    dashboardLogs.map((log, i) => {
                                        const formatted = formatLogMessage(log.message, log.level, { language: language as 'en' | 'tr' });
                                        const colorClasses: Record<string, string> = {
                                            green: 'text-accent-success',
                                            blue: 'text-blue-400',
                                            yellow: 'text-accent-warning',
                                            red: 'text-accent-error',
                                            purple: 'text-purple-400',
                                            gray: 'text-text-muted'
                                        };
                                        return (
                                            <div key={i} className={`py-0.5 flex items-center gap-2 ${colorClasses[formatted.color]}`}>
                                                {formatted.icon === '🟣' ? (
                                                    <img src="/claude-color.svg" alt="Claude" className="w-3.5 h-3.5" />
                                                ) : formatted.icon === '🔵' ? (
                                                    <img src="/gemini-color.svg" alt="Gemini" className="w-3.5 h-3.5" />
                                                ) : formatted.icon === '👤' || formatted.icon === '👥' ? (
                                                    <img src="/gmail.svg" alt="Gmail" className="w-3.5 h-3.5" />
                                                ) : formatted.icon === '🔄' ? (
                                                    <RefreshCw size={14} className="animate-spin text-blue-400" />
                                                ) : formatted.icon === '⏳' ? (
                                                    <Clock size={14} className="text-yellow-400" />
                                                ) : formatted.icon === '🌐' ? (
                                                    <Wifi size={14} className="text-green-400" />
                                                ) : formatted.icon === '🚀' ? (
                                                    <Zap size={14} className="text-green-400" />
                                                ) : formatted.icon === '✅' ? (
                                                    <Check size={14} className="text-green-400" />
                                                ) : formatted.icon === 'ℹ️' ? (
                                                    <AlertCircle size={14} className="text-blue-400" />
                                                ) : formatted.icon === '🔧' ? (
                                                    <Database size={14} className="text-gray-400" />
                                                ) : formatted.icon === '⚠️' ? (
                                                    <AlertTriangle size={14} className="text-yellow-400" />
                                                ) : formatted.icon === '❌' ? (
                                                    <XCircle size={14} className="text-red-400" />
                                                ) : (
                                                    <AlertCircle size={14} className="text-gray-400" />
                                                )}
                                                <span className="truncate">{formatted.title}</span>
                                            </div>
                                        );
                                    })
                                )}
                            </div>
                        </div>
                    )}
                </>)}
        </div>
    );
}
