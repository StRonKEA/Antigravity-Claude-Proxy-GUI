import { useState, useEffect } from 'react';
import { Plus, RefreshCw, Trash2, ToggleLeft, ToggleRight, Search, X, ChevronDown, AlertTriangle, CheckCircle, XCircle, ExternalLink, Power, Zap, ArrowUpDown } from 'lucide-react';
import type { Account } from '../types';
import { toast } from '../stores/toastStore';
import { useTranslation } from '../i18n';
import { useAppStore } from '../stores/appStore';
import { toggleAccountEnabled, refreshAccount, deleteAccount as deleteAccountApi, reloadAccounts, getOAuthUrl, getAccountLimits, getProxyStatus, refreshAllTokens } from '../services/proxyService';
import { open } from '@tauri-apps/plugin-shell';
import { MaskedEmail } from '../components/MaskedEmail';

export function Accounts() {
    const { t } = useTranslation();
    const { accounts, setAccounts } = useAppStore();
    const [selectedAccounts, setSelectedAccounts] = useState<Set<string>>(new Set());
    const [searchQuery, setSearchQuery] = useState('');
    const [showAddModal, setShowAddModal] = useState(false);
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
    const [isRefreshing, setIsRefreshing] = useState<string | null>(null);
    const [isOAuthLoading, setIsOAuthLoading] = useState(false);
    const [isProxyRunning, setIsProxyRunning] = useState(false);
    const [sortField, setSortField] = useState<'email' | 'tier' | 'health' | 'lastUsed'>('email');
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

    // Check proxy status when modal opens
    useEffect(() => {
        if (showAddModal) {
            getProxyStatus().then(status => {
                setIsProxyRunning(status.running);
            });
        }
    }, [showAddModal]);

    const filteredAccounts = accounts
        .filter(acc => acc.email.toLowerCase().includes(searchQuery.toLowerCase()))
        .sort((a, b) => {
            let comparison = 0;
            switch (sortField) {
                case 'email':
                    comparison = a.email.localeCompare(b.email);
                    break;
                case 'tier':
                    const tierOrder = { ultra: 0, pro: 1, free: 2 };
                    const tierA = (a.tier || a.subscription?.tier || 'free') as keyof typeof tierOrder;
                    const tierB = (b.tier || b.subscription?.tier || 'free') as keyof typeof tierOrder;
                    comparison = (tierOrder[tierA] || 2) - (tierOrder[tierB] || 2);
                    break;
                case 'health':
                    const statusOrder = { active: 0, rate_limited: 1, invalid: 2 };
                    comparison = (statusOrder[a.status as keyof typeof statusOrder] || 0) - (statusOrder[b.status as keyof typeof statusOrder] || 0);
                    break;
                case 'lastUsed':
                    comparison = (a.lastUsed || '').localeCompare(b.lastUsed || '');
                    break;
            }
            return sortOrder === 'asc' ? comparison : -comparison;
        });

    const handleSort = (field: typeof sortField) => {
        if (sortField === field) {
            setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
        } else {
            setSortField(field);
            setSortOrder('asc');
        }
    };

    const toggleAccount = async (email: string) => {
        const account = accounts.find(a => a.email === email);
        if (!account) return;

        const newEnabled = !account.enabled;
        const success = await toggleAccountEnabled(email, newEnabled, 8080);

        if (success) {
            // Refresh accounts from server
            const limitData = await getAccountLimits(8080);
            if (limitData) {
                setAccounts(limitData.accounts);
            }
            toast.info(`${email.split('@')[0]} ${newEnabled ? t('accountEnabled') : t('accountDisabled')}`);
        } else {
            toast.error(t('operationFailed'));
        }
    };

    const toggleSelect = (email: string) => {
        const newSelected = new Set(selectedAccounts);
        if (newSelected.has(email)) {
            newSelected.delete(email);
        } else {
            newSelected.add(email);
        }
        setSelectedAccounts(newSelected);
    };

    const selectAll = () => {
        if (selectedAccounts.size === filteredAccounts.length) {
            setSelectedAccounts(new Set());
        } else {
            setSelectedAccounts(new Set(filteredAccounts.map(a => a.email)));
        }
    };

    const handleRefresh = async (email: string) => {
        setIsRefreshing(email);
        const success = await refreshAccount(email, 8080);
        setIsRefreshing(null);

        if (success) {
            // Refresh accounts from server
            const limitData = await getAccountLimits(8080);
            if (limitData) {
                setAccounts(limitData.accounts);
            }
            toast.success(`${email.split('@')[0]} ${t('refreshed')}`);
        } else {
            toast.error(t('operationFailed'));
        }
    };

    const handleDelete = (email: string) => {
        const account = accounts.find(a => a.email === email);
        if (account?.source === 'database') {
            toast.error(t('cannotDeleteDb'));
            return;
        }
        setDeleteTarget(email);
        setShowDeleteModal(true);
    };

    const confirmDelete = async () => {
        if (deleteTarget) {
            const success = await deleteAccountApi(deleteTarget, 8080);
            if (success) {
                // Refresh accounts from server
                const limitData = await getAccountLimits(8080);
                if (limitData) {
                    setAccounts(limitData.accounts);
                }
                toast.success(`${deleteTarget.split('@')[0]} ${t('accountDeleted')}`);
            } else {
                toast.error(t('operationFailed'));
            }
        }
        setShowDeleteModal(false);
        setDeleteTarget(null);
    };

    const handleFix = async (email: string) => {
        toast.info(`${email.split('@')[0]} ${t('attemptingFix')}`);
        await new Promise(resolve => setTimeout(resolve, 2000));
        setAccounts(accounts.map(acc =>
            acc.email === email ? { ...acc, status: 'active' } : acc
        ));
        toast.success(`${email.split('@')[0]} ${t('fixed')}`);
    };

    // Reload all accounts from server
    const handleReloadAll = async () => {
        toast.info(t('reloadingAccounts'));
        const success = await reloadAccounts(8080);
        if (success) {
            const limitData = await getAccountLimits(8080);
            if (limitData) {
                setAccounts(limitData.accounts);
            }
            toast.success(t('accountsReloaded'));
        } else {
            toast.error(t('operationFailed'));
        }
    };

    // Refresh ALL account tokens
    const [isRefreshingAll, setIsRefreshingAll] = useState(false);
    const handleRefreshAll = async () => {
        setIsRefreshingAll(true);
        toast.info(t('refreshingAllAccounts'));

        let successCount = 0;
        for (const account of accounts) {
            const success = await refreshAccount(account.email, 8080);
            if (success) successCount++;
        }

        const limitData = await getAccountLimits(8080);
        if (limitData) {
            setAccounts(limitData.accounts);
        }
        setIsRefreshingAll(false);
        toast.success(`${successCount}/${accounts.length} ${t('accountsRefreshed')}`);
    };

    // Bulk refresh selected accounts
    const handleBulkRefresh = async () => {
        const emails = Array.from(selectedAccounts);
        toast.info(`${emails.length} ${t('accountsRefreshing')}`);

        for (const email of emails) {
            await refreshAccount(email, 8080);
        }

        const limitData = await getAccountLimits(8080);
        if (limitData) {
            setAccounts(limitData.accounts);
        }
        setSelectedAccounts(new Set());
        toast.success(`${emails.length} ${t('accountsRefreshed')}`);
    };

    // Bulk enable selected accounts
    const handleBulkEnable = async () => {
        const emails = Array.from(selectedAccounts);
        toast.info(`${emails.length} ${t('accountsEnabling')}`);

        for (const email of emails) {
            await toggleAccountEnabled(email, true, 8080);
        }

        const limitData = await getAccountLimits(8080);
        if (limitData) {
            setAccounts(limitData.accounts);
        }
        setSelectedAccounts(new Set());
        toast.success(`${emails.length} ${t('accountsEnabled')}`);
    };

    // Bulk disable selected accounts
    const handleBulkDisable = async () => {
        const emails = Array.from(selectedAccounts);
        toast.info(`${emails.length} ${t('accountsDisabling')}`);

        for (const email of emails) {
            await toggleAccountEnabled(email, false, 8080);
        }

        const limitData = await getAccountLimits(8080);
        if (limitData) {
            setAccounts(limitData.accounts);
        }
        setSelectedAccounts(new Set());
        toast.success(`${emails.length} ${t('accountsDisabled')}`);
    };

    const handleAddOAuth = async () => {
        setIsOAuthLoading(true);
        const url = await getOAuthUrl(8080);

        if (url) {
            const currentCount = accounts.length;
            toast.info(t('openingGoogleOAuth'));
            // Open OAuth URL in default browser
            await open(url);
            // Close modal - auth happens in browser
            setShowAddModal(false);
            toast.info(t('completeOAuthInBrowser'));

            // Poll rapidly until new account is detected (max 2 minutes)
            const startTime = Date.now();
            const maxWait = 120000; // 2 minutes
            const pollInterval = 1000; // 1 second

            const pollForNewAccount = async () => {
                if (Date.now() - startTime > maxWait) {
                    setIsOAuthLoading(false);
                    return;
                }

                const limitData = await getAccountLimits(8080);
                if (limitData && limitData.accounts.length > currentCount) {
                    // New account detected!
                    setAccounts(limitData.accounts);
                    toast.success(t('accountAddedSuccessfully'));
                    setIsOAuthLoading(false);
                } else {
                    // Keep polling
                    setTimeout(pollForNewAccount, pollInterval);
                }
            };

            // Start polling after a brief delay
            setTimeout(pollForNewAccount, 500);
        } else {
            toast.error(t('oauthUrlFailed'));
            setIsOAuthLoading(false);
        }
    };

    const getTierBadge = (account: Account) => {
        const tier = account.tier || account.subscription?.tier;
        const colors = {
            free: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
            pro: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
            ultra: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
        };
        if (!tier) return <span className="badge bg-gray-500/10 text-gray-500 border-gray-500/20">-</span>;
        return <span className={`badge border ${colors[tier]}`}>{t(tier)}</span>;
    };

    const getSourceBadge = (source?: 'oauth' | 'database') => {
        if (source === 'database') {
            return <span className="badge bg-purple-500/20 text-purple-400 border border-purple-500/30">DB</span>;
        }
        return <span className="badge bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">OAuth</span>;
    };

    const getHealthIcon = (status: Account['status']) => {
        if (status === 'active' || status === 'ok') return <CheckCircle size={16} className="text-accent-success" />;
        if (status === 'error' || status === 'rate_limited') return <XCircle size={16} className="text-accent-error" />;
        return <AlertTriangle size={16} className="text-accent-warning" />;
    };

    return (
        <div className="space-y-4 animate-fade-in">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <h1 className="text-xl font-bold text-text-primary">{t('accounts')}</h1>
                    <span className="text-xs text-text-muted font-mono bg-white/5 px-2 py-1 rounded">
                        {filteredAccounts.length} / {accounts.length}
                    </span>
                </div>
                <div className="flex gap-3">
                    {/* Search */}
                    <div className="relative">
                        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                        <input
                            type="text"
                            placeholder={t('searchAccounts')}
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="input pl-9 pr-8 py-2 w-48 text-sm"
                        />
                        {searchQuery && (
                            <button
                                onClick={() => setSearchQuery('')}
                                className="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary"
                            >
                                <X size={14} />
                            </button>
                        )}
                    </div>

                    <button
                        onClick={() => setShowAddModal(true)}
                        className="btn-primary flex items-center gap-2 text-sm"
                    >
                        <Plus size={16} />
                        {t('addAccount')}
                    </button>
                    <button
                        onClick={handleRefreshAll}
                        disabled={isRefreshingAll || accounts.length === 0}
                        className="btn-secondary flex items-center gap-2 text-sm"
                        title={t('refreshAllTokens')}
                    >
                        <RefreshCw size={16} className={isRefreshingAll ? 'animate-spin' : ''} />
                        {t('refreshAll')}
                    </button>
                    <button
                        onClick={async () => {
                            toast.info('Token cache temizleniyor...');
                            const success = await refreshAllTokens(8080);
                            if (success) {
                                toast.success('Tüm token cache\'leri temizlendi!');
                                const limitData = await getAccountLimits(8080);
                                if (limitData) setAccounts(limitData.accounts);
                            } else {
                                toast.error(t('operationFailed'));
                            }
                        }}
                        className="btn-primary flex items-center gap-2 text-sm bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-600 hover:to-orange-600"
                        title={t('refreshAllTokens')}
                    >
                        <Zap size={16} />
                        {t('refreshTokens')}
                    </button>
                </div>
            </div>

            {/* Table */}
            <div className="glass-card overflow-hidden">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="bg-white/5 border-b border-white/10">
                            <th className="p-3 w-10">
                                <input
                                    type="checkbox"
                                    checked={selectedAccounts.size === filteredAccounts.length && filteredAccounts.length > 0}
                                    onChange={selectAll}
                                    className="w-4 h-4 rounded accent-accent-primary"
                                />
                            </th>
                            <th className="p-3 w-10 text-center text-xs font-medium text-text-secondary">#</th>
                            <th className="p-3 text-left text-xs font-medium text-text-secondary">{t('enabled')}</th>
                            <th className="p-3 text-left text-xs font-medium text-text-secondary">
                                <button onClick={() => handleSort('email')} className="flex items-center gap-1 hover:text-white transition-colors">
                                    {t('accountCol')}
                                    <ArrowUpDown size={12} className={sortField === 'email' ? 'text-accent-primary' : 'opacity-50'} />
                                </button>
                            </th>
                            <th className="p-3 text-left text-xs font-medium text-text-secondary">{t('source')}</th>
                            <th className="p-3 text-left text-xs font-medium text-text-secondary">
                                <button onClick={() => handleSort('tier')} className="flex items-center gap-1 hover:text-white transition-colors">
                                    {t('tier')}
                                    <ArrowUpDown size={12} className={sortField === 'tier' ? 'text-accent-primary' : 'opacity-50'} />
                                </button>
                            </th>
                            <th className="p-3 text-left text-xs font-medium text-text-secondary">
                                <button onClick={() => handleSort('health')} className="flex items-center gap-1 hover:text-white transition-colors">
                                    {t('health')}
                                    <ArrowUpDown size={12} className={sortField === 'health' ? 'text-accent-primary' : 'opacity-50'} />
                                </button>
                            </th>
                            <th className="p-3 text-right text-xs font-medium text-text-secondary">{t('actions')}</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredAccounts.map((account, index) => (
                            <tr
                                key={account.email}
                                className="border-b border-white/5 hover:bg-white/5 transition-colors"
                            >
                                <td className="p-3">
                                    <input
                                        type="checkbox"
                                        checked={selectedAccounts.has(account.email)}
                                        onChange={() => toggleSelect(account.email)}
                                        className="w-4 h-4 rounded accent-accent-primary"
                                    />
                                </td>
                                <td className="p-3 text-center">
                                    <span className="text-xs font-mono text-text-muted">{index + 1}</span>
                                </td>
                                <td className="p-3">
                                    <button
                                        onClick={() => toggleAccount(account.email)}
                                        className="text-text-secondary hover:text-text-primary transition-colors"
                                    >
                                        {account.enabled ? (
                                            <ToggleRight size={24} className="text-accent-success" />
                                        ) : (
                                            <ToggleLeft size={24} />
                                        )}
                                    </button>
                                </td>
                                <td className="p-3">
                                    <div className="flex items-center gap-2">
                                        <img src="/gmail.svg" alt="Gmail" className="w-4 h-4" />
                                        <div>
                                            <MaskedEmail email={account.email} className="text-text-primary font-mono text-xs" />
                                            <p className="text-text-muted text-[10px]">
                                                {t('lastUsedPrefix')} {account.lastUsed
                                                    ? new Date(typeof account.lastUsed === 'number' ? account.lastUsed : parseInt(account.lastUsed)).toLocaleString()
                                                    : t('never')}
                                            </p>
                                        </div>
                                    </div>
                                </td>
                                <td className="p-3">{getSourceBadge(account.source)}</td>
                                <td className="p-3">{getTierBadge(account)}</td>
                                <td className="p-3">
                                    <div className="flex items-center gap-2">
                                        {getHealthIcon(account.status)}
                                        <div>
                                            <span className={`text-xs font-mono uppercase ${(account.status === 'active' || account.status === 'ok') ? 'text-accent-success' :
                                                account.status === 'error' ? 'text-accent-error' : 'text-accent-warning'
                                                }`}>
                                                {account.status === 'rate_limited' ? t('limited') :
                                                    (account.status === 'active' || account.status === 'ok') ? t('active').toUpperCase() :
                                                        account.status === 'inactive' ? t('inactive').toUpperCase() :
                                                            t('error').toUpperCase()}
                                            </span>
                                            {/* Rate Limit Countdown */}
                                            {account.modelRateLimits && (() => {
                                                const activeLimit = Object.entries(account.modelRateLimits)
                                                    .filter(([_, limit]) => limit.isRateLimited && limit.resetTime > Date.now())
                                                    .sort((a, b) => a[1].resetTime - b[1].resetTime)[0];
                                                if (activeLimit) {
                                                    const remainingMs = activeLimit[1].resetTime - Date.now();
                                                    const mins = Math.floor(remainingMs / 60000);
                                                    const secs = Math.floor((remainingMs % 60000) / 1000);
                                                    return (
                                                        <div className="text-[9px] text-yellow-400 font-mono animate-pulse">
                                                            ⏳ {mins}m {secs}s
                                                        </div>
                                                    );
                                                }
                                                return null;
                                            })()}
                                        </div>
                                    </div>
                                </td>
                                <td className="p-3">
                                    <div className="flex justify-end gap-1">
                                        {(account.status === 'error' || account.status === 'rate_limited') && (
                                            <button
                                                onClick={() => handleFix(account.email)}
                                                className="px-2 py-1 text-[10px] font-bold font-mono uppercase rounded bg-yellow-500/10 text-yellow-400 hover:bg-yellow-500/20 border border-yellow-500/30 transition-all"
                                            >
                                                {t('fix')}
                                            </button>
                                        )}

                                        <button
                                            onClick={() => handleRefresh(account.email)}
                                            disabled={isRefreshing === account.email}
                                            className="p-2 rounded hover:bg-white/10 text-text-secondary hover:text-white transition-colors"
                                            title={t('refresh')}
                                        >
                                            <RefreshCw size={14} className={isRefreshing === account.email ? 'animate-spin' : ''} />
                                        </button>

                                        <button
                                            onClick={() => handleDelete(account.email)}
                                            disabled={account.source === 'database'}
                                            className={`p-2 rounded transition-colors ${account.source === 'database'
                                                ? 'text-gray-600 cursor-not-allowed'
                                                : 'hover:bg-red-500/10 text-text-secondary hover:text-accent-error'
                                                }`}
                                            title={account.source === 'database' ? t('cannotDeleteDbAccounts') : t('delete')}
                                        >
                                            <Trash2 size={14} />
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>

                {filteredAccounts.length === 0 && (
                    <div className="p-12 text-center">
                        <p className="text-text-muted text-sm">{t('noAccountsFound')}</p>
                    </div>
                )}
            </div>

            {/* Info Note */}
            <div className="text-xs text-text-muted flex items-center gap-2 bg-white/5 p-3 rounded-lg">
                <AlertTriangle size={14} />
                <span>{t('disabledAccountsInfo')}</span>
            </div>

            {/* CLI Hint */}
            <div className="text-xs text-text-muted flex items-center gap-2 bg-white/5 p-3 rounded-lg">
                <ExternalLink size={14} />
                <span>{t('cliHint')} <code className="bg-white/10 px-2 py-0.5 rounded font-mono">npm run accounts:add</code></span>
            </div>

            {/* Bulk Actions */}
            {
                selectedAccounts.size > 0 && (
                    <div className="glass-card p-4 flex items-center justify-between animate-fade-in sticky bottom-4">
                        <span className="text-text-secondary text-sm">{selectedAccounts.size} {t('selected')}</span>
                        <div className="flex gap-2">
                            <button onClick={handleBulkRefresh} className="btn-secondary text-sm">{t('bulkRefresh')}</button>
                            <button onClick={handleBulkEnable} className="btn-primary text-sm">{t('bulkEnable')}</button>
                            <button onClick={handleBulkDisable} className="btn-secondary text-accent-error border-accent-error/30 text-sm">{t('bulkDisable')}</button>
                        </div>
                    </div>
                )
            }

            {/* Add Account Modal */}
            {
                showAddModal && (
                    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center">
                        <div className="glass-card p-6 w-full max-w-md animate-fade-in">
                            <h2 className="text-lg font-bold text-text-primary mb-4 flex items-center gap-2">
                                <Plus size={20} />
                                {t('addAccount')}
                            </h2>

                            <div className="space-y-4">
                                {!isProxyRunning ? (
                                    /* Proxy Offline Warning */
                                    <div className="p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
                                        <div className="flex items-center gap-3 mb-2">
                                            <Power size={20} className="text-yellow-400" />
                                            <p className="font-medium text-yellow-400">{t('proxyNotRunning')}</p>
                                        </div>
                                        <p className="text-sm text-text-secondary">{t('startProxyToAddAccount')}</p>
                                    </div>
                                ) : (
                                    /* OAuth Options */
                                    <>
                                        <button
                                            onClick={handleAddOAuth}
                                            disabled={isOAuthLoading}
                                            className="w-full p-4 rounded-xl bg-gradient-to-r from-blue-500/10 via-red-500/10 to-yellow-500/10 border border-white/20 hover:border-white/40 hover:bg-white/10 transition-all flex items-center gap-4 group"
                                        >
                                            <div className="w-12 h-12 rounded-full bg-white flex items-center justify-center shrink-0 shadow-lg group-hover:scale-105 transition-transform">
                                                <img src="/gmail.svg" alt="Google" className="w-7 h-7" />
                                            </div>
                                            <div className="text-left flex-1">
                                                <p className="font-semibold text-text-primary text-base">{t('signInWithGoogle')}</p>
                                                <p className="text-xs text-text-muted">{t('oauthDesc')}</p>
                                            </div>
                                            {isOAuthLoading ? (
                                                <RefreshCw size={18} className="animate-spin text-accent-primary" />
                                            ) : (
                                                <ExternalLink size={18} className="text-text-muted group-hover:text-accent-primary transition-colors" />
                                            )}
                                        </button>

                                        <div className="flex items-center gap-4">
                                            <div className="flex-1 border-t border-white/10"></div>
                                            <span className="text-xs text-text-muted">{t('or')}</span>
                                            <div className="flex-1 border-t border-white/10"></div>
                                        </div>

                                        <div className="p-3 bg-white/5 rounded-lg border border-white/10">
                                            <p className="text-xs text-text-muted mb-2">{t('viaCommandLine')}</p>
                                            <code className="text-sm font-mono text-accent-primary">npm run accounts:add</code>
                                        </div>
                                    </>
                                )}
                            </div>

                            <div className="flex justify-end gap-3 mt-6">
                                <button
                                    onClick={() => setShowAddModal(false)}
                                    className="btn-secondary"
                                >
                                    {t('cancel')}
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }

            {/* Delete Confirmation Modal */}
            {
                showDeleteModal && (
                    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center">
                        <div className="glass-card p-6 w-full max-w-md animate-fade-in border-2 border-accent-error/50">
                            <h2 className="text-lg font-bold text-accent-error mb-2 flex items-center gap-2">
                                <AlertTriangle size={20} />
                                {t('dangerousOperation')}
                            </h2>
                            <p className="text-text-secondary mb-4">
                                {t('deleteConfirmText')} <strong className="text-white font-mono">{deleteTarget}</strong>?
                            </p>
                            <div className="bg-red-500/10 border border-red-500/30 rounded p-3 mb-4">
                                <p className="text-sm text-red-300 flex items-start gap-2">
                                    <AlertTriangle size={16} className="shrink-0 mt-0.5" />
                                    {t('deleteWarningFull')}
                                </p>
                            </div>
                            <div className="flex justify-end gap-3">
                                <button
                                    onClick={() => setShowDeleteModal(false)}
                                    className="btn-secondary"
                                >
                                    {t('cancel')}
                                </button>
                                <button
                                    onClick={confirmDelete}
                                    className="btn-danger flex items-center gap-2"
                                >
                                    <Trash2 size={16} />
                                    {t('confirmDeleteBtn')}
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }
        </div >
    );
}
