import { useState, useMemo, useEffect, useCallback } from 'react';
import { Search, Eye, EyeOff, Bookmark } from 'lucide-react';
import { toast } from '../stores/toastStore';
import { useTranslation } from '../i18n';
import { useAppStore } from '../stores/appStore';
import { getModelConfigs, updateModelConfig as updateModelConfigAPI, type ModelConfig } from '../services/proxyService';
import { ModelIcon } from '../components/ModelIcon';
import { MaskedEmail } from '../components/MaskedEmail';

// Simple Tooltip component
function Tooltip({ children, content }: { children: React.ReactNode; content: string }) {
    const [show, setShow] = useState(false);
    return (
        <div className="relative inline-block">
            <div
                onMouseEnter={() => setShow(true)}
                onMouseLeave={() => setShow(false)}
            >
                {children}
            </div>
            {show && content && (
                <div className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 text-[10px] font-mono bg-gray-900 border border-white/20 rounded shadow-lg whitespace-nowrap text-white">
                    {content}
                    <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-900" />
                </div>
            )}
        </div>
    );
}

// Account quota info for tooltips
interface AccountQuotaInfo {
    email: string;
    percentage: number;
    resetTime: string | null;
}

// Global model summary with additional fields
interface GlobalModel {
    modelId: string;
    modelName: string;
    provider: 'claude' | 'gemini' | 'other';
    percentage: number;
    resetAt: string | null;
    activeAccounts: number;
    totalAccounts: number;
    accountQuotas: AccountQuotaInfo[];
    pinned?: boolean;
    hidden?: boolean;
}

// Helper to determine model provider/family
function getModelProvider(modelId: string): 'claude' | 'gemini' | 'other' {
    const lower = modelId.toLowerCase();
    if (lower.includes('claude') || lower.includes('opus') || lower.includes('sonnet') || lower.includes('haiku')) {
        return 'claude';
    }
    if (lower.includes('gemini')) {
        return 'gemini';
    }
    return 'other';
}

// Helper to format model name nicely
function formatModelName(modelId: string): { name: string; isThinking: boolean } {
    const isThinking = modelId.toLowerCase().includes('thinking');
    const lower = modelId.toLowerCase();

    // Claude models
    if (lower.includes('sonnet-4-5')) return { name: 'Sonnet 4.5', isThinking };
    if (lower.includes('opus-4-5')) return { name: 'Opus 4.5', isThinking };
    if (lower.includes('sonnet-4-20')) return { name: 'Sonnet 4.20', isThinking };
    if (lower.includes('haiku')) return { name: 'Haiku', isThinking };

    // Gemini models
    if (lower.includes('2.5-flash-lite')) return { name: 'Flash 2.5 Lite', isThinking };
    if (lower.includes('2.5-flash')) return { name: 'Flash 2.5', isThinking };
    if (lower.includes('2.5-pro')) return { name: 'Pro 2.5', isThinking };
    if (lower.includes('3-flash')) return { name: 'Flash 3', isThinking };
    if (lower.includes('3-pro-low')) return { name: 'Pro 3 Low', isThinking };
    if (lower.includes('3-pro-high')) return { name: 'Pro 3 High', isThinking };
    if (lower.includes('3-pro-image')) return { name: 'Pro 3 Image', isThinking };

    // Fallback: clean up the ID
    return {
        name: modelId
            .replace('claude-', '')
            .replace('gemini-', '')
            .replace('-thinking', ''),
        isThinking
    };
}

// Helper to format reset time
function formatResetTime(resetTime: string | null): string {
    if (!resetTime) return '-';
    const reset = new Date(resetTime);
    const now = new Date();
    const diff = reset.getTime() - now.getTime();

    if (diff <= 0) return 'Soon';

    const hours = Math.floor(diff / (1000 * 60 * 60));
    const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

    if (hours > 0) return `${hours}h${mins}m`;
    return `${mins}m`;
}

type FamilyFilter = 'all' | 'claude' | 'gemini';
type SortField = 'name' | 'quota' | 'reset' | 'accounts';
type SortOrder = 'asc' | 'desc';

export function Models() {
    const { t } = useTranslation();
    const { accounts, proxyStatus, config } = useAppStore();

    const [searchQuery, setSearchQuery] = useState('');
    const [familyFilter, setFamilyFilter] = useState<FamilyFilter>('all');
    const [selectedAccount, setSelectedAccount] = useState<string>('all');
    const [showHidden, setShowHidden] = useState(false);
    const [pinnedModels, setPinnedModels] = useState<Set<string>>(new Set());
    const [hiddenModels, setHiddenModels] = useState<Set<string>>(new Set());
    const [sortField, setSortField] = useState<SortField>('quota');
    const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
    const [isLoadingConfig, setIsLoadingConfig] = useState(false);

    // Load model configs from API on mount
    const loadModelConfigs = useCallback(async () => {
        if (!proxyStatus?.running) return;

        setIsLoadingConfig(true);
        try {
            const configs = await getModelConfigs(config.proxy.port);
            const pinned = new Set<string>();
            const hidden = new Set<string>();

            Object.entries(configs).forEach(([modelId, cfg]) => {
                if (cfg.pinned) pinned.add(modelId);
                if (cfg.hidden) hidden.add(modelId);
            });

            setPinnedModels(pinned);
            setHiddenModels(hidden);
        } catch (e) {
            console.error('Failed to load model configs:', e);
        } finally {
            setIsLoadingConfig(false);
        }
    }, [proxyStatus?.running, config.proxy.port]);

    useEffect(() => {
        loadModelConfigs();
    }, [loadModelConfigs]);

    // Compute global models from accounts data
    const globalModels = useMemo<GlobalModel[]>(() => {
        const modelMap = new Map<string, {
            percentages: number[];
            resetTimes: (string | null)[];
            accountQuotas: AccountQuotaInfo[];
        }>();

        // Aggregate data from all accounts
        accounts.forEach(acc => {
            if (!acc.limits) return;

            Object.entries(acc.limits).forEach(([modelId, limit]) => {
                if (!modelMap.has(modelId)) {
                    modelMap.set(modelId, {
                        percentages: [],
                        resetTimes: [],
                        accountQuotas: []
                    });
                }

                const data = modelMap.get(modelId)!;
                const percentage = Math.round((limit.remainingFraction ?? 0) * 100);

                data.percentages.push(percentage);
                data.resetTimes.push(limit.resetTime || null);
                data.accountQuotas.push({
                    email: acc.email,
                    percentage,
                    resetTime: limit.resetTime || null
                });
            });
        });

        // Convert to GlobalModel array
        const models: GlobalModel[] = [];
        modelMap.forEach((data, modelId) => {
            const avgPercentage = data.percentages.length > 0
                ? Math.round(data.percentages.reduce((a, b) => a + b, 0) / data.percentages.length)
                : 0;

            // Find earliest reset time
            const validResets = data.resetTimes.filter(t => t !== null) as string[];
            const earliestReset = validResets.length > 0
                ? validResets.sort()[0]
                : null;

            models.push({
                modelId,
                modelName: modelId,
                provider: getModelProvider(modelId),
                percentage: avgPercentage,
                resetAt: earliestReset,
                activeAccounts: data.percentages.filter(p => p > 0).length,
                totalAccounts: data.percentages.length,
                accountQuotas: data.accountQuotas,
                pinned: pinnedModels.has(modelId),
                hidden: hiddenModels.has(modelId)
            });
        });

        return models;
    }, [accounts, pinnedModels, hiddenModels]);

    const getProgressColor = (percentage: number) => {
        if (percentage >= 70) return 'bg-accent-success';
        if (percentage >= 40) return 'bg-accent-warning';
        return 'bg-accent-error';
    };

    const getChipStyle = (percentage: number) => {
        if (percentage >= 70) return 'bg-green-900/30 border-green-600/40';
        if (percentage >= 40) return 'bg-yellow-900/30 border-yellow-600/40';
        return 'bg-red-900/30 border-red-600/40';
    };

    const getTextColor = (percentage: number) => {
        if (percentage >= 70) return 'text-green-400';
        if (percentage >= 40) return 'text-yellow-400';
        return 'text-red-400';
    };

    const togglePin = async (modelId: string) => {
        const newPinned = !pinnedModels.has(modelId);

        // Optimistic update
        setPinnedModels(prev => {
            const newSet = new Set(prev);
            if (newPinned) {
                newSet.add(modelId);
            } else {
                newSet.delete(modelId);
            }
            return newSet;
        });

        // Call API if proxy is running
        if (proxyStatus?.running) {
            const success = await updateModelConfigAPI(modelId, { pinned: newPinned }, config.proxy.port);
            if (success) {
                toast.info(`${modelId} ${newPinned ? t('modelPinned') : t('modelUnpinned')}`);
            } else {
                // Rollback on failure
                setPinnedModels(prev => {
                    const newSet = new Set(prev);
                    if (newPinned) {
                        newSet.delete(modelId);
                    } else {
                        newSet.add(modelId);
                    }
                    return newSet;
                });
                toast.error(t('saveFailed'));
            }
        } else {
            toast.info(`${modelId} ${newPinned ? t('modelPinned') : t('modelUnpinned')}`);
        }
    };

    const toggleHide = async (modelId: string) => {
        const newHidden = !hiddenModels.has(modelId);

        // Optimistic update
        setHiddenModels(prev => {
            const newSet = new Set(prev);
            if (newHidden) {
                newSet.add(modelId);
            } else {
                newSet.delete(modelId);
            }
            return newSet;
        });

        // Call API if proxy is running
        if (proxyStatus?.running) {
            const success = await updateModelConfigAPI(modelId, { hidden: newHidden }, config.proxy.port);
            if (success) {
                toast.info(`${modelId} ${newHidden ? t('modelHidden') : t('modelShown')}`);
            } else {
                // Rollback on failure
                setHiddenModels(prev => {
                    const newSet = new Set(prev);
                    if (newHidden) {
                        newSet.delete(modelId);
                    } else {
                        newSet.add(modelId);
                    }
                    return newSet;
                });
                toast.error(t('saveFailed'));
            }
        } else {
            toast.info(`${modelId} ${newHidden ? t('modelHidden') : t('modelShown')}`);
        }
    };

    const handleSort = (field: SortField) => {
        if (sortField === field) {
            setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
        } else {
            setSortField(field);
            setSortOrder('desc');
        }
    };

    // Filter and sort models
    const filteredModels = globalModels
        .filter(m => {
            if (!showHidden && m.hidden) return false;
            if (familyFilter !== 'all' && m.provider !== familyFilter) return false;
            if (searchQuery && !m.modelName.toLowerCase().includes(searchQuery.toLowerCase())) return false;
            return true;
        })
        .sort((a, b) => {
            // Pinned items first
            if (a.pinned && !b.pinned) return -1;
            if (!a.pinned && b.pinned) return 1;

            let comparison = 0;
            switch (sortField) {
                case 'name':
                    comparison = a.modelName.localeCompare(b.modelName);
                    break;
                case 'quota':
                    comparison = a.percentage - b.percentage;
                    break;
                case 'accounts':
                    comparison = a.activeAccounts - b.activeAccounts;
                    break;
                default:
                    comparison = 0;
            }
            return sortOrder === 'asc' ? comparison : -comparison;
        });

    // Filter accounts for by-account view
    const filteredAccounts = accounts.filter(a => {
        if (selectedAccount !== 'all' && a.email !== selectedAccount) return false;
        if (searchQuery && !a.email.toLowerCase().includes(searchQuery.toLowerCase())) return false;
        return true;
    });

    // Get account's model quotas filtered by family
    const getAccountQuotas = (limits: Record<string, any> | undefined) => {
        if (!limits) return [];
        return Object.entries(limits)
            .filter(([modelId]) => {
                if (familyFilter === 'all') return true;
                return getModelProvider(modelId) === familyFilter;
            })
            .map(([modelId, limit]) => ({
                modelId,
                modelName: modelId,
                provider: getModelProvider(modelId),
                percentage: Math.round((limit.remainingFraction ?? 0) * 100),
                resetAt: formatResetTime(limit.resetTime),
                isPinned: pinnedModels.has(modelId),
                isHidden: hiddenModels.has(modelId)
            }))
            // Sort: pinned first, then normal, hidden last
            .sort((a, b) => {
                if (a.isPinned && !b.isPinned) return -1;
                if (!a.isPinned && b.isPinned) return 1;
                if (a.isHidden && !b.isHidden) return 1;
                if (!a.isHidden && b.isHidden) return -1;
                return 0;
            });
    };

    return (
        <div className="h-full flex flex-col animate-fade-in">
            {/* Header */}
            <div className="flex items-center justify-between mb-3 shrink-0">
                <div className="flex items-center gap-3">
                    <h1 className="text-xl font-bold text-text-primary">{t('models')}</h1>

                    {/* Search */}
                    <div className="relative w-48">
                        <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted" />
                        <input
                            type="text"
                            placeholder={t('searchAccounts')}
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full bg-white/5 border border-white/10 rounded-lg py-1.5 pl-8 pr-3 text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-primary"
                        />
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    {/* Family Filter */}
                    <div className="flex bg-white/5 rounded-lg p-0.5">
                        {(['all', 'claude', 'gemini'] as FamilyFilter[]).map((filter) => (
                            <button
                                key={filter}
                                onClick={() => setFamilyFilter(filter)}
                                className={`px-3 py-1.5 rounded text-xs font-medium transition-colors flex items-center gap-1.5 ${familyFilter === filter
                                    ? filter === 'claude' ? 'bg-purple-500 text-white' :
                                        filter === 'gemini' ? 'bg-green-500 text-white' :
                                            'bg-accent-primary text-white'
                                    : 'text-text-secondary hover:text-text-primary'
                                    }`}
                            >
                                {filter !== 'all' && <ModelIcon modelId={filter} size={12} />}
                                {filter === 'all' ? t('all') : filter === 'claude' ? t('claude') : t('gemini')}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* By Account View */}
            <div className="flex-1 overflow-auto glass-card p-3">
                <div className="space-y-3">
                    {filteredAccounts.map((account) => {
                        const quotas = getAccountQuotas(account.limits);
                        const tier = account.tier || account.subscription?.tier;

                        // Separate by provider
                        const claudeQuotas = quotas.filter(q => q.provider === 'claude');
                        const geminiQuotas = quotas.filter(q => q.provider === 'gemini');

                        return (
                            <div key={account.email} className="bg-white/5 rounded-lg p-3 hover:bg-white/8 transition-colors">
                                {/* Account Header */}
                                <div className="flex items-center justify-between mb-3 pb-2 border-b border-white/10">
                                    <div className="flex items-center gap-2">
                                        <span className={`w-2 h-2 rounded-full ${account.enabled ? 'bg-emerald-500' : 'bg-zinc-500'}`} />
                                        <MaskedEmail email={account.email} className="text-sm font-medium text-zinc-200" />
                                        {tier && (
                                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${tier === 'ultra' ? 'bg-amber-500/20 text-amber-400' :
                                                tier === 'pro' ? 'bg-violet-500/20 text-violet-400' :
                                                    'bg-zinc-500/20 text-zinc-400'
                                                }`}>
                                                {tier.toUpperCase()}
                                            </span>
                                        )}
                                    </div>
                                    <span className="text-[10px] text-zinc-500">{quotas.length} models</span>
                                </div>

                                {quotas.length === 0 ? (
                                    <span className="text-xs text-zinc-600">{t('noQuotaData')}</span>
                                ) : (
                                    <div className="space-y-2">
                                        {/* Claude Models */}
                                        {claudeQuotas.length > 0 && (
                                            <div className="space-y-1">
                                                <div className="flex items-center gap-1.5 mb-1">
                                                    <ModelIcon modelId="claude-3" size={14} />
                                                    <span className="text-[10px] font-medium text-zinc-400">Claude ({claudeQuotas.length})</span>
                                                </div>
                                                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2">
                                                    {claudeQuotas.map((quota) => (
                                                        <div key={quota.modelId}
                                                            className={`bg-black/20 rounded px-2.5 py-2 group relative ${hiddenModels.has(quota.modelId) ? 'opacity-50' : ''}`}
                                                        >
                                                            <div className="flex items-center justify-between mb-1">
                                                                <div className="flex items-center gap-1">
                                                                    {pinnedModels.has(quota.modelId) && (
                                                                        <Bookmark size={10} className="text-amber-400 fill-amber-400" />
                                                                    )}
                                                                    {(() => {
                                                                        const { name, isThinking } = formatModelName(quota.modelId);
                                                                        return (
                                                                            <>
                                                                                <span className="text-xs text-zinc-300 truncate">{name}</span>
                                                                                {isThinking && <span className="text-[9px] px-1 py-0.5 rounded bg-violet-500/30 text-violet-300 font-medium">Thinking</span>}
                                                                            </>
                                                                        );
                                                                    })()}
                                                                </div>
                                                                <div className="flex items-center gap-1">
                                                                    <span className={`text-xs font-bold ${quota.percentage > 50 ? 'text-emerald-400' :
                                                                        quota.percentage > 20 ? 'text-amber-400' : 'text-red-400'
                                                                        }`}>
                                                                        {quota.percentage}%
                                                                    </span>
                                                                    {/* Action buttons - show on hover */}
                                                                    <div className="hidden group-hover:flex items-center gap-0.5 ml-1">
                                                                        <button
                                                                            onClick={() => togglePin(quota.modelId)}
                                                                            className="p-0.5 rounded hover:bg-white/10 transition-colors"
                                                                            title={pinnedModels.has(quota.modelId) ? t('unpin') : t('pin')}
                                                                        >
                                                                            <Bookmark size={12} className={pinnedModels.has(quota.modelId) ? 'text-amber-400 fill-amber-400' : 'text-zinc-500'} />
                                                                        </button>
                                                                        <button
                                                                            onClick={() => toggleHide(quota.modelId)}
                                                                            className="p-0.5 rounded hover:bg-white/10 transition-colors"
                                                                            title={hiddenModels.has(quota.modelId) ? t('show') : t('hide')}
                                                                        >
                                                                            {hiddenModels.has(quota.modelId) ? (
                                                                                <Eye size={12} className="text-zinc-500" />
                                                                            ) : (
                                                                                <EyeOff size={12} className="text-zinc-500" />
                                                                            )}
                                                                        </button>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                            <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                                                                <div
                                                                    className={`h-full rounded-full transition-all ${quota.percentage > 50 ? 'bg-emerald-500' :
                                                                        quota.percentage > 20 ? 'bg-amber-500' : 'bg-red-500'
                                                                        }`}
                                                                    style={{ width: `${quota.percentage}%` }}
                                                                />
                                                            </div>
                                                            <div className="text-[10px] text-zinc-400 mt-1">Reset: {quota.resetAt}</div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}

                                        {/* Gemini Models */}
                                        {geminiQuotas.length > 0 && (
                                            <div className="space-y-1">
                                                <div className="flex items-center gap-1.5 mb-1">
                                                    <ModelIcon modelId="gemini-1" size={14} />
                                                    <span className="text-[10px] font-medium text-zinc-400">Gemini ({geminiQuotas.length})</span>
                                                </div>
                                                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2">
                                                    {geminiQuotas.map((quota) => (
                                                        <div key={quota.modelId}
                                                            className={`bg-black/20 rounded px-2.5 py-2 group relative ${hiddenModels.has(quota.modelId) ? 'opacity-50' : ''}`}
                                                        >
                                                            <div className="flex items-center justify-between mb-1">
                                                                <div className="flex items-center gap-1">
                                                                    {pinnedModels.has(quota.modelId) && (
                                                                        <Bookmark size={10} className="text-amber-400 fill-amber-400" />
                                                                    )}
                                                                    {(() => {
                                                                        const { name, isThinking } = formatModelName(quota.modelId);
                                                                        return (
                                                                            <>
                                                                                <span className="text-xs text-zinc-300 truncate">{name}</span>
                                                                                {isThinking && <span className="text-[9px] px-1 py-0.5 rounded bg-violet-500/30 text-violet-300 font-medium">Thinking</span>}
                                                                            </>
                                                                        );
                                                                    })()}
                                                                </div>
                                                                <div className="flex items-center gap-1">
                                                                    <span className={`text-xs font-bold ${quota.percentage > 50 ? 'text-emerald-400' :
                                                                        quota.percentage > 20 ? 'text-amber-400' : 'text-red-400'
                                                                        }`}>
                                                                        {quota.percentage}%
                                                                    </span>
                                                                    {/* Action buttons - show on hover */}
                                                                    <div className="hidden group-hover:flex items-center gap-0.5 ml-1">
                                                                        <button
                                                                            onClick={() => togglePin(quota.modelId)}
                                                                            className="p-0.5 rounded hover:bg-white/10 transition-colors"
                                                                            title={pinnedModels.has(quota.modelId) ? t('unpin') : t('pin')}
                                                                        >
                                                                            <Bookmark size={12} className={pinnedModels.has(quota.modelId) ? 'text-amber-400 fill-amber-400' : 'text-zinc-500'} />
                                                                        </button>
                                                                        <button
                                                                            onClick={() => toggleHide(quota.modelId)}
                                                                            className="p-0.5 rounded hover:bg-white/10 transition-colors"
                                                                            title={hiddenModels.has(quota.modelId) ? t('show') : t('hide')}
                                                                        >
                                                                            {hiddenModels.has(quota.modelId) ? (
                                                                                <Eye size={12} className="text-zinc-500" />
                                                                            ) : (
                                                                                <EyeOff size={12} className="text-zinc-500" />
                                                                            )}
                                                                        </button>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                            <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                                                                <div
                                                                    className={`h-full rounded-full transition-all ${quota.percentage > 50 ? 'bg-emerald-500' :
                                                                        quota.percentage > 20 ? 'bg-amber-500' : 'bg-red-500'
                                                                        }`}
                                                                    style={{ width: `${quota.percentage}%` }}
                                                                />
                                                            </div>
                                                            <div className="text-[10px] text-zinc-400 mt-1">Reset: {quota.resetAt}</div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>

                {/* Empty State */}
                {filteredAccounts.length === 0 && (
                    <div className="p-12 text-center text-zinc-500">
                        {!proxyStatus?.running ? (
                            <>
                                <p className="text-lg font-medium text-zinc-400">{t('proxyNotRunning')}</p>
                                <p className="text-sm mt-2">{t('startProxyToSeeModels')}</p>
                            </>
                        ) : accounts.length === 0 ? (
                            <>
                                <p className="text-lg font-medium text-zinc-400">{t('loadingData')}</p>
                                <p className="text-sm mt-2">{t('waitingForAccountData')}</p>
                            </>
                        ) : (
                            <p>{t('noAccountsFound')}</p>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
