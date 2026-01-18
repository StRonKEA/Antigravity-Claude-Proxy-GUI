import { useState, useEffect, useMemo } from 'react';
import {
    BarChart3,
    TrendingUp,
    Zap,
    Activity,
    RefreshCw,
    Download,
    Calendar,
    Clock,
    Users
} from 'lucide-react';
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    Tooltip,
    ResponsiveContainer,
    LineChart,
    Line,
    PieChart,
    Pie,
    Cell,
    Legend,
    Area,
    AreaChart
} from 'recharts';
import { useTranslation, useI18nStore } from '../i18n';
import { toast } from '../stores/toastStore';
import { useAppStore } from '../stores/appStore';
import { getUsageHistory } from '../services/proxyService';
import { getModelDisplayName } from '../utils/modelUtils';
import { ModelIcon } from '../components/ModelIcon';
import { MaskedEmail } from '../components/MaskedEmail';
import type { UsageStats } from '../types';

type TimeRange = '24h' | '7d' | '30d' | 'all';

const COLORS = {
    claude: '#8b5cf6',
    gemini: '#22c55e',
    accent: '#3b82f6',
    warning: '#f59e0b',
    error: '#ef4444'
};

export function Statistics() {
    const { t } = useTranslation();
    const { language } = useI18nStore();
    const { accounts, proxyStatus } = useAppStore();

    const [timeRange, setTimeRange] = useState<TimeRange>('24h');
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [usageHistory, setUsageHistory] = useState<UsageStats | null>(null);

    // Fetch data on mount and when proxy is running
    useEffect(() => {
        const fetchData = async () => {
            if (!proxyStatus.running) return;
            const history = await getUsageHistory();
            setUsageHistory(history);
        };

        fetchData();

        const interval = setInterval(() => {
            if (proxyStatus.running) {
                fetchData();
            }
        }, 15000);

        return () => clearInterval(interval);
    }, [proxyStatus.running]);

    const handleRefresh = async () => {
        setIsRefreshing(true);
        const history = await getUsageHistory();
        setUsageHistory(history);
        setIsRefreshing(false);
        toast.success(t('statisticsRefreshed'));
    };

    const handleExport = () => {
        const data = {
            usageHistory,
            accounts: accounts.map(a => ({ email: a.email, tier: a.subscription?.tier })),
            exportedAt: new Date().toISOString()
        };
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `statistics-${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        URL.revokeObjectURL(url);
        toast.success(t('statisticsExported'));
    };

    // Calculate comprehensive stats
    const stats = useMemo(() => {
        if (!usageHistory) {
            return {
                total: 0,
                today: 0,
                claudeTotal: 0,
                geminiTotal: 0,
                hourlyData: [],
                dailyData: [],
                topModels: [],
                providerData: []
            };
        }

        let total = 0;
        let today = 0;
        let claudeTotal = 0;
        let geminiTotal = 0;

        const now = new Date();
        const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

        // Model counts
        const modelCounts: Record<string, number> = {};

        // Hourly data for last 24 hours
        const hourlyMap: Record<string, { claude: number; gemini: number }> = {};

        // Daily data for last 7 days
        const dailyMap: Record<string, { claude: number; gemini: number }> = {};

        Object.entries(usageHistory).forEach(([timestamp, data]: [string, any]) => {
            const time = new Date(timestamp).getTime();
            const date = new Date(timestamp);

            const count = data._total || 0;
            total += count;

            if (time >= startOfToday) {
                today += count;
            }

            // Claude subtotal
            const claudeCount = data.claude?._subtotal || 0;
            claudeTotal += claudeCount;

            // Gemini subtotal
            const geminiCount = data.gemini?._subtotal || 0;
            geminiTotal += geminiCount;

            // Hourly aggregation - use numeric hour for proper sorting
            const hourNum = date.getHours();
            const hourKey = hourNum.toString().padStart(2, '0');
            if (!hourlyMap[hourKey]) {
                hourlyMap[hourKey] = { claude: 0, gemini: 0 };
            }
            hourlyMap[hourKey].claude += claudeCount;
            hourlyMap[hourKey].gemini += geminiCount;

            // Daily aggregation
            const dayKey = date.toLocaleDateString(language === 'tr' ? 'tr-TR' : 'en-US', { weekday: 'short' });
            if (!dailyMap[dayKey]) {
                dailyMap[dayKey] = { claude: 0, gemini: 0 };
            }
            dailyMap[dayKey].claude += claudeCount;
            dailyMap[dayKey].gemini += geminiCount;

            // Model counts
            if (data.claude) {
                Object.entries(data.claude).forEach(([model, cnt]) => {
                    if (model !== '_subtotal' && typeof cnt === 'number') {
                        const fullName = `claude-${model}`;
                        modelCounts[fullName] = (modelCounts[fullName] || 0) + cnt;
                    }
                });
            }
            if (data.gemini) {
                Object.entries(data.gemini).forEach(([model, cnt]) => {
                    if (model !== '_subtotal' && typeof cnt === 'number') {
                        const fullName = `gemini-${model}`;
                        modelCounts[fullName] = (modelCounts[fullName] || 0) + cnt;
                    }
                });
            }
        });

        // Convert hourly to array - only hours with data, sorted
        const hourlyData = Object.entries(hourlyMap)
            .filter(([_, data]) => data.claude > 0 || data.gemini > 0)
            .sort(([a], [b]) => parseInt(a) - parseInt(b))
            .map(([hour, data]) => ({
                time: `${hour}:00`,
                claude: data.claude,
                gemini: data.gemini,
                total: data.claude + data.gemini
            }));

        // Convert daily to array - show all 7 days of week (locale-aware)
        const getWeekDays = () => {
            const days = [];
            const today = new Date();
            const dayOfWeek = today.getDay(); // 0 = Sunday
            const monday = new Date(today);
            monday.setDate(today.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));

            for (let i = 0; i < 7; i++) {
                const d = new Date(monday);
                d.setDate(monday.getDate() + i);
                days.push(d.toLocaleDateString(language === 'tr' ? 'tr-TR' : 'en-US', { weekday: 'short' }));
            }
            return days;
        };
        const weekDays = getWeekDays();
        const dailyData = weekDays.map(day => {
            const data = dailyMap[day] || { claude: 0, gemini: 0 };
            return {
                day,
                claude: data.claude,
                gemini: data.gemini,
                total: data.claude + data.gemini
            };
        });

        // Top models
        const topModels = Object.entries(modelCounts)
            .sort(([, a], [, b]) => b - a)
            .slice(0, 5)
            .map(([model, requests]) => ({
                model,
                requests,
                percentage: total > 0 ? Math.round((requests / total) * 100) : 0
            }));

        // Provider pie data
        const providerData = [
            { name: 'Claude', value: claudeTotal, color: COLORS.claude },
            { name: 'Gemini', value: geminiTotal, color: COLORS.gemini }
        ].filter(d => d.value > 0);

        return {
            total,
            today,
            claudeTotal,
            geminiTotal,
            hourlyData,
            dailyData,
            topModels,
            providerData
        };
    }, [usageHistory, language]);

    // Account quota data
    const accountQuotas = useMemo(() => {
        return accounts.slice(0, 8).map(acc => {
            let claudeAvg = 0;
            let geminiAvg = 0;
            let claudeCount = 0;
            let geminiCount = 0;

            if (acc.limits) {
                Object.entries(acc.limits).forEach(([model, limit]) => {
                    const pct = Math.round((limit.remainingFraction ?? 0) * 100);
                    const lower = model.toLowerCase();
                    if (lower.includes('claude') || lower.includes('opus') || lower.includes('sonnet') || lower.includes('haiku')) {
                        claudeAvg += pct;
                        claudeCount++;
                    } else if (lower.includes('gemini')) {
                        geminiAvg += pct;
                        geminiCount++;
                    }
                });
            }

            return {
                email: acc.email.split('@')[0].slice(0, 8),
                claude: claudeCount > 0 ? Math.round(claudeAvg / claudeCount) : 0,
                gemini: geminiCount > 0 ? Math.round(geminiAvg / geminiCount) : 0,
                tier: acc.subscription?.tier || 'free'
            };
        });
    }, [accounts]);

    // Empty state
    if (!proxyStatus.running) {
        return (
            <div className="h-full flex items-center justify-center">
                <div className="text-center">
                    <BarChart3 size={48} className="mx-auto mb-4 text-text-muted opacity-50" />
                    <h2 className="text-lg font-semibold text-text-primary mb-2">{t('proxyNotRunning')}</h2>
                    <p className="text-sm text-text-muted">{t('startProxyToSeeStats')}</p>
                </div>
            </div>
        );
    }

    return (
        <div className="h-full flex flex-col gap-4 animate-fade-in overflow-auto p-1">
            {/* Header */}
            <div className="flex items-center justify-between shrink-0">
                <div>
                    <h1 className="text-xl font-bold text-text-primary flex items-center gap-2">
                        <BarChart3 className="text-accent-primary" size={24} />
                        {t('statisticsTitle')}
                    </h1>
                    <p className="text-sm text-text-muted mt-1">{t('statisticsDesc')}</p>
                </div>
                <div className="flex items-center gap-3">
                    {/* Time Range */}
                    <div className="flex bg-white/5 rounded-lg p-0.5">
                        {(['24h', '7d', '30d', 'all'] as TimeRange[]).map((range) => (
                            <button
                                key={range}
                                onClick={() => setTimeRange(range)}
                                className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${timeRange === range
                                    ? 'bg-accent-primary text-white'
                                    : 'text-text-secondary hover:text-text-primary'
                                    }`}
                            >
                                {range === '24h' ? t('last24h') :
                                    range === '7d' ? t('last7d') :
                                        range === '30d' ? t('last30d') : t('allTime')}
                            </button>
                        ))}
                    </div>
                    <button
                        onClick={handleRefresh}
                        disabled={isRefreshing}
                        className="p-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors"
                    >
                        <RefreshCw size={16} className={`text-text-secondary ${isRefreshing ? 'animate-spin' : ''}`} />
                    </button>
                    <button
                        onClick={handleExport}
                        className="p-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors"
                    >
                        <Download size={16} className="text-text-secondary" />
                    </button>
                </div>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-4 gap-3 shrink-0">
                <div className="glass-card p-4 text-center">
                    <Zap className="w-5 h-5 mx-auto mb-2 text-accent-primary" />
                    <p className="text-2xl font-bold text-text-primary">{stats.total.toLocaleString()}</p>
                    <p className="text-[10px] text-text-muted uppercase tracking-wide">{t('totalRequests')}</p>
                </div>
                <div className="glass-card p-4 text-center">
                    <Calendar className="w-5 h-5 mx-auto mb-2 text-blue-400" />
                    <p className="text-2xl font-bold text-text-primary">{stats.today.toLocaleString()}</p>
                    <p className="text-[10px] text-text-muted uppercase tracking-wide">{t('todayRequests')}</p>
                </div>
                <div className="glass-card p-4 text-center">
                    <div className="w-5 h-5 mx-auto mb-2">
                        <img src="/claude-color.svg" alt="Claude" className="w-5 h-5" />
                    </div>
                    <p className="text-2xl font-bold text-purple-400">{stats.claudeTotal.toLocaleString()}</p>
                    <p className="text-[10px] text-text-muted uppercase tracking-wide">Claude</p>
                </div>
                <div className="glass-card p-4 text-center">
                    <div className="w-5 h-5 mx-auto mb-2">
                        <img src="/gemini-color.svg" alt="Gemini" className="w-5 h-5" />
                    </div>
                    <p className="text-2xl font-bold text-green-400">{stats.geminiTotal.toLocaleString()}</p>
                    <p className="text-[10px] text-text-muted uppercase tracking-wide">Gemini</p>
                </div>
            </div>

            {/* Main Content */}
            <div className="grid grid-cols-3 gap-4 flex-1 min-h-0">
                {/* Left Column - Charts */}
                <div className="col-span-2 flex flex-col gap-4">
                    {/* Hourly Trend */}
                    <div className="glass-card p-4 flex-1">
                        <h3 className="text-sm font-semibold text-text-primary mb-3 flex items-center gap-2">
                            <Clock size={16} className="text-accent-primary" />
                            {t('hourlyTrend')}
                        </h3>
                        {stats.hourlyData.length === 0 ? (
                            <div className="h-40 flex items-center justify-center text-text-muted text-sm">
                                {t('noActivity')}
                            </div>
                        ) : (
                            <ResponsiveContainer width="100%" height={150}>
                                <AreaChart data={stats.hourlyData}>
                                    <defs>
                                        <linearGradient id="colorClaude" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor={COLORS.claude} stopOpacity={0.3} />
                                            <stop offset="95%" stopColor={COLORS.claude} stopOpacity={0} />
                                        </linearGradient>
                                        <linearGradient id="colorGemini" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor={COLORS.gemini} stopOpacity={0.3} />
                                            <stop offset="95%" stopColor={COLORS.gemini} stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    <XAxis dataKey="time" tick={{ fontSize: 10, fill: '#888' }} axisLine={false} tickLine={false} interval={0} />
                                    <YAxis tick={{ fontSize: 10, fill: '#888' }} axisLine={false} tickLine={false} width={30} />
                                    <Tooltip
                                        contentStyle={{ backgroundColor: '#1a1a2e', border: '1px solid #333', borderRadius: '8px', fontSize: '12px' }}
                                        labelStyle={{ color: '#fff' }}
                                    />
                                    <Area type="monotone" dataKey="claude" stroke={COLORS.claude} fillOpacity={1} fill="url(#colorClaude)" strokeWidth={2} />
                                    <Area type="monotone" dataKey="gemini" stroke={COLORS.gemini} fillOpacity={1} fill="url(#colorGemini)" strokeWidth={2} />
                                </AreaChart>
                            </ResponsiveContainer>
                        )}
                    </div>

                    {/* Daily Usage Bar Chart */}
                    <div className="glass-card p-4 flex-1">
                        <h3 className="text-sm font-semibold text-text-primary mb-3 flex items-center gap-2">
                            <Activity size={16} className="text-accent-success" />
                            {t('dailyUsage')}
                        </h3>
                        {stats.dailyData.length === 0 ? (
                            <div className="h-40 flex items-center justify-center text-text-muted text-sm">
                                {t('noActivity')}
                            </div>
                        ) : (
                            <ResponsiveContainer width="100%" height={150}>
                                <BarChart data={stats.dailyData} style={{ background: 'transparent' }}>
                                    <XAxis dataKey="day" tick={{ fontSize: 10, fill: '#888' }} axisLine={false} tickLine={false} />
                                    <YAxis tick={{ fontSize: 10, fill: '#888' }} axisLine={false} tickLine={false} width={30} />
                                    <Tooltip
                                        contentStyle={{ backgroundColor: '#1a1a2e', border: '1px solid #333', borderRadius: '8px', fontSize: '12px' }}
                                        cursor={false}
                                    />
                                    <Bar dataKey="claude" stackId="a" fill={COLORS.claude} radius={[0, 0, 0, 0]} />
                                    <Bar dataKey="gemini" stackId="a" fill={COLORS.gemini} radius={[4, 4, 0, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        )}
                    </div>
                </div>

                {/* Right Column */}
                <div className="flex flex-col gap-4">
                    {/* Provider Usage Percentage */}
                    <div className="glass-card p-4">
                        <h3 className="text-sm font-semibold text-text-primary mb-3 flex items-center gap-2">
                            <TrendingUp size={16} className="text-accent-warning" />
                            {t('usagePercentage')}
                        </h3>
                        {stats.total === 0 ? (
                            <div className="h-24 flex items-center justify-center text-text-muted text-sm">
                                {t('noActivity')}
                            </div>
                        ) : (
                            <div className="space-y-4">
                                {/* Claude */}
                                <div>
                                    <div className="flex items-center justify-between mb-1">
                                        <div className="flex items-center gap-2">
                                            <img src="/claude-color.svg" alt="Claude" className="w-4 h-4" />
                                            <span className="text-xs text-text-secondary">Claude</span>
                                        </div>
                                        <span className="text-sm font-bold text-purple-400">
                                            {stats.total > 0 ? Math.round((stats.claudeTotal / stats.total) * 100) : 0}%
                                        </span>
                                    </div>
                                    <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden">
                                        <div
                                            className="h-full bg-gradient-to-r from-purple-500 to-purple-400 rounded-full transition-all duration-500"
                                            style={{ width: `${stats.total > 0 ? (stats.claudeTotal / stats.total) * 100 : 0}%` }}
                                        />
                                    </div>
                                </div>
                                {/* Gemini */}
                                <div>
                                    <div className="flex items-center justify-between mb-1">
                                        <div className="flex items-center gap-2">
                                            <img src="/gemini-color.svg" alt="Gemini" className="w-4 h-4" />
                                            <span className="text-xs text-text-secondary">Gemini</span>
                                        </div>
                                        <span className="text-sm font-bold text-green-400">
                                            {stats.total > 0 ? Math.round((stats.geminiTotal / stats.total) * 100) : 0}%
                                        </span>
                                    </div>
                                    <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden">
                                        <div
                                            className="h-full bg-gradient-to-r from-green-500 to-green-400 rounded-full transition-all duration-500"
                                            style={{ width: `${stats.total > 0 ? (stats.geminiTotal / stats.total) * 100 : 0}%` }}
                                        />
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Top Models */}
                    <div className="glass-card p-4 flex-1 overflow-auto">
                        <h3 className="text-sm font-semibold text-text-primary mb-3 flex items-center gap-2">
                            <BarChart3 size={16} className="text-purple-400" />
                            {t('top5MostUsed')}
                        </h3>
                        {stats.topModels.length === 0 ? (
                            <div className="h-20 flex items-center justify-center text-text-muted text-sm">
                                {t('noActivity')}
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {stats.topModels.map((item, idx) => (
                                    <div key={item.model} className="flex items-center gap-2">
                                        <span className="text-[10px] text-text-muted w-3">{idx + 1}</span>
                                        <ModelIcon modelId={item.model} size={14} />
                                        <div className="flex-1 min-w-0">
                                            <div className="flex justify-between items-center mb-0.5">
                                                <span className="text-[11px] font-medium text-text-primary truncate">
                                                    {getModelDisplayName(item.model)}
                                                </span>
                                                <span className="text-[10px] text-text-muted ml-2">{item.requests}</span>
                                            </div>
                                            <div className="h-1 bg-white/10 rounded-full overflow-hidden">
                                                <div
                                                    className="h-full rounded-full"
                                                    style={{
                                                        width: `${item.percentage}%`,
                                                        backgroundColor: item.model.includes('claude') ? COLORS.claude : COLORS.gemini
                                                    }}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Account Quotas */}
                    <div className="glass-card p-4">
                        <h3 className="text-sm font-semibold text-text-primary mb-3 flex items-center gap-2">
                            <Users size={16} className="text-blue-400" />
                            {t('accountQuotas')}
                        </h3>
                        {accountQuotas.length === 0 ? (
                            <div className="h-20 flex items-center justify-center text-text-muted text-sm">
                                {t('noAccounts')}
                            </div>
                        ) : (
                            <div className="space-y-2 max-h-32 overflow-auto">
                                {accountQuotas.map((acc) => (
                                    <div key={acc.email} className="flex items-center gap-2">
                                        <MaskedEmail email={acc.email} className="text-[10px] text-text-muted w-16 truncate" />
                                        <div className="flex-1 flex gap-1">
                                            <div className="flex-1 h-1.5 bg-white/10 rounded-full overflow-hidden" title="Claude">
                                                <div
                                                    className="h-full rounded-full"
                                                    style={{ width: `${acc.claude}%`, backgroundColor: COLORS.claude }}
                                                />
                                            </div>
                                            <div className="flex-1 h-1.5 bg-white/10 rounded-full overflow-hidden" title="Gemini">
                                                <div
                                                    className="h-full rounded-full"
                                                    style={{ width: `${acc.gemini}%`, backgroundColor: COLORS.gemini }}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
