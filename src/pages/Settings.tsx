import { useState, useEffect, useCallback } from 'react';
import { Globe, Zap, Server, Settings as SettingsIcon, Info, Save, RotateCcw, Bookmark, Trash2, ExternalLink, Github, Terminal, Monitor, RefreshCw } from 'lucide-react';
import { useAppStore } from '../stores/appStore';
import { toast } from '../stores/toastStore';
import { useTranslation, type TranslationKey } from '../i18n';
import {
    getClaudeConfig,
    saveClaudeConfig as saveClaudeConfigAPI,
    restoreClaudeConfig as restoreClaudeConfigAPI,
    getPresets as getPresetsAPI,
    savePreset as savePresetAPI,
    deletePreset as deletePresetAPI,
    getAvailableModels,
    getServerConfig,
    updateServerConfig,
    setClaudeOnboardingComplete
} from '../services/proxyService';
import { setAutoStart, getAutoStartStatus } from '../services/autostartService';
import { loadSettings, saveSettings, updateSettings } from '../services/appStorageService';
import { getKiroStatus, patchKiro, restoreKiro, startKiroServer, stopKiroServer, type KiroStatus } from '../services/kiroService';
import { Accordion } from '../components/ui/Accordion';
import { SettingRow, ToggleSwitch } from '../components/ui/SettingRow';
import type { Preset } from '../types';

// Default models
const DEFAULT_MODELS = [
    'claude-opus-4-5-thinking',
    'claude-sonnet-4-5-thinking',
    'claude-sonnet-4-5',
    'gemini-3-pro-high',
    'gemini-3-pro-low',
    'gemini-3-flash',
    'gemini-2.5-flash-lite',
];

// Performance presets for latency optimization
const PERFORMANCE_PRESETS = {
    default: {
        nameKey: 'presetDefault',
        descKey: 'presetDefaultDesc',
        maxRetries: 5,
        retryBaseDelay: 1000,
        retryMaxDelay: 30000,
        defaultCooldown: 10,
        maxWaitBeforeError: 120,
    },
    fast: {
        nameKey: 'presetFast',
        descKey: 'presetFastDesc',
        maxRetries: 3,
        retryBaseDelay: 500,
        retryMaxDelay: 15000,
        defaultCooldown: 5,
        maxWaitBeforeError: 60,
    },
    aggressive: {
        nameKey: 'presetAggressive',
        descKey: 'presetAggressiveDesc',
        maxRetries: 2,
        retryBaseDelay: 300,
        retryMaxDelay: 10000,
        defaultCooldown: 3,
        maxWaitBeforeError: 30,
    },
};

// Helper to strip [1m] suffix for dropdown comparison
const stripSuffix = (model?: string) => model?.replace(/\s*\[1m\]$/i, '').trim() || '';

// Helper to add [1m] suffix if it's a Gemini model and 1M mode is enabled
const addSuffixIfGemini = (model?: string, enabled?: boolean) => {
    if (!model) return model || '';
    const stripped = stripSuffix(model);
    if (enabled && stripped.toLowerCase().includes('gemini')) {
        return stripped + '[1m]';
    }
    return stripped;
};

export function Settings() {
    const { t, language, setLanguage } = useTranslation();
    const { config, setConfig, proxyStatus } = useAppStore();

    // Dynamic models from API
    const [availableModels, setAvailableModels] = useState<string[]>(DEFAULT_MODELS);

    // Claude CLI settings  
    const [claudeConfig, setClaudeConfig] = useState({
        ANTHROPIC_BASE_URL: 'http://localhost:8080',
        ANTHROPIC_AUTH_TOKEN: 'any-token',
        ANTHROPIC_MODEL: 'claude-sonnet-4-5-thinking',
        CLAUDE_CODE_SUBAGENT_MODEL: 'gemini-3-flash',
        ANTHROPIC_DEFAULT_OPUS_MODEL: 'claude-opus-4-5-thinking',
        ANTHROPIC_DEFAULT_SONNET_MODEL: 'claude-sonnet-4-5-thinking',
        ANTHROPIC_DEFAULT_HAIKU_MODEL: 'gemini-2.5-flash-lite',
        ENABLE_EXPERIMENTAL_MCP_CLI: true,
        GEMINI_1M_CONTEXT: false,
    });
    const [initialClaudeConfig, setInitialClaudeConfig] = useState(claudeConfig);
    const [presets, setPresets] = useState<Preset[]>([]);
    const [selectedPreset, setSelectedPreset] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

    // Server settings
    const [debugMode, setDebugMode] = useState(false);
    const [logLevel, setLogLevel] = useState<'info' | 'warn' | 'error' | 'debug'>('info');
    const [maxRetries, setMaxRetries] = useState(3);
    const [retryBaseDelay, setRetryBaseDelay] = useState(1000);
    const [retryMaxDelay, setRetryMaxDelay] = useState(30000);
    const [persistentSessions, setPersistentSessions] = useState(true);
    const [defaultCooldown, setDefaultCooldown] = useState(10);
    const [maxWaitBeforeError, setMaxWaitBeforeError] = useState(120);
    const [accountStrategy, setAccountStrategy] = useState<'sticky' | 'round-robin' | 'hybrid'>('hybrid');

    // Kiro IDE Integration
    const [kiroStatus, setKiroStatus] = useState<KiroStatus & { installed: boolean }>({
        running: false,
        patched: false,
        port: 9980,
        installed: false
    });
    const [kiroLoading, setKiroLoading] = useState(false);
    const [kiroInitialLoading, setKiroInitialLoading] = useState(true);
    const [kiroAutoStart, setKiroAutoStart] = useState(false);

    // Load performance settings from disk on mount
    useEffect(() => {
        const loadPerformanceSettings = async () => {
            const settings = await loadSettings();
            if (settings.maxRetries !== undefined) setMaxRetries(settings.maxRetries);
            if (settings.retryBaseDelay !== undefined) setRetryBaseDelay(settings.retryBaseDelay);
            if (settings.retryMaxDelay !== undefined) setRetryMaxDelay(settings.retryMaxDelay);
            if (settings.defaultCooldown !== undefined) setDefaultCooldown(settings.defaultCooldown);
            if (settings.maxWaitBeforeError !== undefined) setMaxWaitBeforeError(settings.maxWaitBeforeError);
            if (settings.persistentSessions !== undefined) setPersistentSessions(settings.persistentSessions);
        };
        loadPerformanceSettings();
    }, []);

    // Load Kiro status on mount
    useEffect(() => {
        const loadKiroStatusAndSettings = async () => {
            try {
                const [status, settings] = await Promise.all([
                    getKiroStatus(),
                    loadSettings()
                ]);
                setKiroStatus(status);
                setKiroAutoStart(settings.kiroAutoStart ?? false);
            } catch (error) {
                console.error('Failed to load Kiro status:', error);
            } finally {
                setKiroInitialLoading(false);
            }
        };
        loadKiroStatusAndSettings();
    }, []);

    // Track unsaved changes
    useEffect(() => {
        const hasChanges = JSON.stringify(claudeConfig) !== JSON.stringify(initialClaudeConfig);
        setHasUnsavedChanges(hasChanges);
    }, [claudeConfig, initialClaudeConfig]);

    // Sync autostart status on mount
    useEffect(() => {
        const syncAutoStart = async () => {
            const isEnabled = await getAutoStartStatus();
            if (isEnabled !== config.proxy.autoStart) {
                setConfig({
                    ...config,
                    proxy: { ...config.proxy, autoStart: isEnabled }
                });
            }
        };
        syncAutoStart();
    }, []);

    // Load Claude config
    const loadClaudeConfig = useCallback(async () => {
        if (!proxyStatus.running) return;

        try {
            const [configResponse, presetsData, modelsData] = await Promise.all([
                getClaudeConfig(config.proxy.port),
                getPresetsAPI(config.proxy.port),
                getAvailableModels(config.proxy.port)
            ]);

            if (configResponse) {
                // Config is nested under config.env in the response
                const resp = configResponse as unknown as { config?: { env?: Record<string, unknown> }; env?: Record<string, unknown> };
                const rawEnv = resp.config?.env || resp.env || resp;
                const env = rawEnv as Partial<import('../types').ClaudeConfigEnv>;

                // Detect GEMINI_1M_CONTEXT from [1m] suffix in any Gemini model
                const has1mSuffix = [
                    env.ANTHROPIC_MODEL,
                    env.CLAUDE_CODE_SUBAGENT_MODEL,
                    env.ANTHROPIC_DEFAULT_OPUS_MODEL,
                    env.ANTHROPIC_DEFAULT_SONNET_MODEL,
                    env.ANTHROPIC_DEFAULT_HAIKU_MODEL
                ].some(m => m && m.toLowerCase().includes('gemini') && m.includes('[1m]'));

                // Store model values WITHOUT [1m] suffix - suffix is added for display/saving based on toggle
                const newConfig = {
                    ANTHROPIC_BASE_URL: env.ANTHROPIC_BASE_URL || claudeConfig.ANTHROPIC_BASE_URL,
                    ANTHROPIC_AUTH_TOKEN: env.ANTHROPIC_AUTH_TOKEN || claudeConfig.ANTHROPIC_AUTH_TOKEN,
                    ANTHROPIC_MODEL: stripSuffix(env.ANTHROPIC_MODEL) || claudeConfig.ANTHROPIC_MODEL,
                    CLAUDE_CODE_SUBAGENT_MODEL: stripSuffix(env.CLAUDE_CODE_SUBAGENT_MODEL) || claudeConfig.CLAUDE_CODE_SUBAGENT_MODEL,
                    ANTHROPIC_DEFAULT_OPUS_MODEL: stripSuffix(env.ANTHROPIC_DEFAULT_OPUS_MODEL) || claudeConfig.ANTHROPIC_DEFAULT_OPUS_MODEL,
                    ANTHROPIC_DEFAULT_SONNET_MODEL: stripSuffix(env.ANTHROPIC_DEFAULT_SONNET_MODEL) || claudeConfig.ANTHROPIC_DEFAULT_SONNET_MODEL,
                    ANTHROPIC_DEFAULT_HAIKU_MODEL: stripSuffix(env.ANTHROPIC_DEFAULT_HAIKU_MODEL) || claudeConfig.ANTHROPIC_DEFAULT_HAIKU_MODEL,
                    ENABLE_EXPERIMENTAL_MCP_CLI: env.ENABLE_EXPERIMENTAL_MCP_CLI === 'true',
                    GEMINI_1M_CONTEXT: has1mSuffix,
                };
                setClaudeConfig(newConfig);
                setInitialClaudeConfig(newConfig);
            }
            if (presetsData) setPresets(presetsData);
            if (modelsData?.length) setAvailableModels(modelsData);
        } catch (e) {
            console.error('[Settings] Failed to load config:', e);
        }
    }, [proxyStatus.running, config.proxy.port]);

    // Load server config
    const loadServerConfig = useCallback(async () => {
        if (!proxyStatus.running) return;

        try {
            const serverConfig = await getServerConfig(config.proxy.port);
            if (serverConfig) {
                if (serverConfig.debug !== undefined) setDebugMode(serverConfig.debug);
                if (serverConfig.logLevel !== undefined) setLogLevel(serverConfig.logLevel);
                if (serverConfig.maxRetries !== undefined) setMaxRetries(serverConfig.maxRetries);
                if (serverConfig.retryBaseMs !== undefined) setRetryBaseDelay(serverConfig.retryBaseMs);
                if (serverConfig.retryMaxMs !== undefined) setRetryMaxDelay(serverConfig.retryMaxMs);
                if (serverConfig.persistTokenCache !== undefined) setPersistentSessions(serverConfig.persistTokenCache);
                if (serverConfig.defaultCooldownMs !== undefined) setDefaultCooldown(serverConfig.defaultCooldownMs / 1000);
                if (serverConfig.maxWaitBeforeErrorMs !== undefined) setMaxWaitBeforeError(serverConfig.maxWaitBeforeErrorMs / 1000);
                if (serverConfig.accountSelection?.strategy) setAccountStrategy(serverConfig.accountSelection.strategy);
            }
        } catch (e) {
            console.error('[Settings] Failed to load server config:', e);
        }
    }, [proxyStatus.running, config.proxy.port]);

    useEffect(() => {
        if (proxyStatus.running) {
            loadClaudeConfig();
            loadServerConfig();
        }
    }, [proxyStatus.running, loadClaudeConfig, loadServerConfig]);

    // Save Claude config
    const handleSaveClaudeConfig = async () => {
        if (!proxyStatus.running) {
            toast.error(t('proxyRequiredForSettings'));
            return;
        }

        setIsSaving(true);
        try {
            // Build env object with string values for booleans (Claude CLI expects strings)
            // Add [1m] suffix to Gemini models when GEMINI_1M_CONTEXT is enabled
            const envConfig = {
                ANTHROPIC_BASE_URL: claudeConfig.ANTHROPIC_BASE_URL,
                ANTHROPIC_AUTH_TOKEN: claudeConfig.ANTHROPIC_AUTH_TOKEN,
                ANTHROPIC_MODEL: addSuffixIfGemini(claudeConfig.ANTHROPIC_MODEL, claudeConfig.GEMINI_1M_CONTEXT),
                CLAUDE_CODE_SUBAGENT_MODEL: addSuffixIfGemini(claudeConfig.CLAUDE_CODE_SUBAGENT_MODEL, claudeConfig.GEMINI_1M_CONTEXT),
                ANTHROPIC_DEFAULT_OPUS_MODEL: addSuffixIfGemini(claudeConfig.ANTHROPIC_DEFAULT_OPUS_MODEL, claudeConfig.GEMINI_1M_CONTEXT),
                ANTHROPIC_DEFAULT_SONNET_MODEL: addSuffixIfGemini(claudeConfig.ANTHROPIC_DEFAULT_SONNET_MODEL, claudeConfig.GEMINI_1M_CONTEXT),
                ANTHROPIC_DEFAULT_HAIKU_MODEL: addSuffixIfGemini(claudeConfig.ANTHROPIC_DEFAULT_HAIKU_MODEL, claudeConfig.GEMINI_1M_CONTEXT),
                ENABLE_EXPERIMENTAL_MCP_CLI: claudeConfig.ENABLE_EXPERIMENTAL_MCP_CLI ? 'true' : 'false',
            };

            // Wrap in env object to match Claude CLI settings.json format
            const configToSave = { env: envConfig };

            const success = await saveClaudeConfigAPI(configToSave, config.proxy.port);
            if (success) {
                setInitialClaudeConfig(claudeConfig);
                // Also mark Claude CLI onboarding as complete to skip login prompt
                await setClaudeOnboardingComplete(config.proxy.port);
                toast.success(t('configSaved'));
            } else {
                toast.error(t('saveFailed'));
            }
        } catch (e) {
            toast.error(t('saveFailed'));
        } finally {
            setIsSaving(false);
        }
    };

    // Restore defaults
    const handleRestoreDefaults = async () => {
        if (!proxyStatus.running) {
            toast.error(t('proxyRequiredForSettings'));
            return;
        }

        if (!confirm(t('confirmRestoreDefaults'))) return;

        try {
            const success = await restoreClaudeConfigAPI(config.proxy.port);
            if (success) {
                loadClaudeConfig();
                toast.success(t('defaultsRestored'));
            } else {
                toast.error(t('restoreFailed'));
            }
        } catch (e) {
            toast.error(t('restoreFailed'));
        }
    };

    // Save server config
    const handleSaveServerConfig = async () => {
        if (!proxyStatus.running) {
            toast.error(t('proxyRequiredForSettings'));
            return;
        }

        try {
            const success = await updateServerConfig({
                debug: debugMode,
                logLevel: logLevel,
                maxRetries: maxRetries,
                retryBaseMs: retryBaseDelay,
                retryMaxMs: retryMaxDelay,
                persistTokenCache: persistentSessions,
                defaultCooldownMs: defaultCooldown * 1000,
                maxWaitBeforeErrorMs: maxWaitBeforeError * 1000,
                accountSelection: { strategy: accountStrategy },
            }, config.proxy.port);

            if (success) {
                // Also save to disk for persistence
                const currentSettings = await loadSettings();
                await saveSettings({
                    ...currentSettings,
                    maxRetries,
                    retryBaseDelay,
                    retryMaxDelay,
                    defaultCooldown,
                    maxWaitBeforeError,
                    persistentSessions,
                });
                toast.success(t('configSaved'));
            } else {
                toast.error(t('saveFailed'));
            }
        } catch (e) {
            toast.error(t('saveFailed'));
        }
    };

    // Preset handlers
    const handleSavePreset = async () => {
        const name = prompt(t('enterPresetName'));
        if (name && proxyStatus.running) {
            const presetConfig = {
                ANTHROPIC_BASE_URL: claudeConfig.ANTHROPIC_BASE_URL,
                ANTHROPIC_AUTH_TOKEN: claudeConfig.ANTHROPIC_AUTH_TOKEN,
                ANTHROPIC_MODEL: addSuffixIfGemini(claudeConfig.ANTHROPIC_MODEL, claudeConfig.GEMINI_1M_CONTEXT),
                CLAUDE_CODE_SUBAGENT_MODEL: addSuffixIfGemini(claudeConfig.CLAUDE_CODE_SUBAGENT_MODEL, claudeConfig.GEMINI_1M_CONTEXT),
                ANTHROPIC_DEFAULT_OPUS_MODEL: addSuffixIfGemini(claudeConfig.ANTHROPIC_DEFAULT_OPUS_MODEL, claudeConfig.GEMINI_1M_CONTEXT),
                ANTHROPIC_DEFAULT_SONNET_MODEL: addSuffixIfGemini(claudeConfig.ANTHROPIC_DEFAULT_SONNET_MODEL, claudeConfig.GEMINI_1M_CONTEXT),
                ANTHROPIC_DEFAULT_HAIKU_MODEL: addSuffixIfGemini(claudeConfig.ANTHROPIC_DEFAULT_HAIKU_MODEL, claudeConfig.GEMINI_1M_CONTEXT),
                ENABLE_EXPERIMENTAL_MCP_CLI: claudeConfig.ENABLE_EXPERIMENTAL_MCP_CLI ? 'true' : 'false',
            };
            const updatedPresets = await savePresetAPI(name, presetConfig, config.proxy.port);
            if (updatedPresets.length > 0) {
                setPresets(updatedPresets);
                setSelectedPreset(name);
                toast.success(t('presetSaved'));
            }
        }
    };

    const handleLoadPreset = (presetName: string) => {
        const preset = presets.find((p: Preset) => p.name === presetName);
        if (preset) {
            if (hasUnsavedChanges && !confirm(t('unsavedChangesDesc'))) return;
            const presetEnv = preset.config;

            // Detect if preset has [1m] suffix on any Gemini model
            const has1mSuffix = [
                presetEnv.ANTHROPIC_MODEL,
                presetEnv.CLAUDE_CODE_SUBAGENT_MODEL,
                presetEnv.ANTHROPIC_DEFAULT_OPUS_MODEL,
                presetEnv.ANTHROPIC_DEFAULT_SONNET_MODEL,
                presetEnv.ANTHROPIC_DEFAULT_HAIKU_MODEL
            ].some(m => m && m.toLowerCase().includes('gemini') && m.includes('[1m]'));

            // Store values without [1m] suffix - suffix will be added for display based on toggle
            setClaudeConfig({
                ...claudeConfig,
                ANTHROPIC_MODEL: stripSuffix(presetEnv.ANTHROPIC_MODEL) || claudeConfig.ANTHROPIC_MODEL,
                CLAUDE_CODE_SUBAGENT_MODEL: stripSuffix(presetEnv.CLAUDE_CODE_SUBAGENT_MODEL) || claudeConfig.CLAUDE_CODE_SUBAGENT_MODEL,
                ANTHROPIC_DEFAULT_OPUS_MODEL: stripSuffix(presetEnv.ANTHROPIC_DEFAULT_OPUS_MODEL) || claudeConfig.ANTHROPIC_DEFAULT_OPUS_MODEL,
                ANTHROPIC_DEFAULT_SONNET_MODEL: stripSuffix(presetEnv.ANTHROPIC_DEFAULT_SONNET_MODEL) || claudeConfig.ANTHROPIC_DEFAULT_SONNET_MODEL,
                ANTHROPIC_DEFAULT_HAIKU_MODEL: stripSuffix(presetEnv.ANTHROPIC_DEFAULT_HAIKU_MODEL) || claudeConfig.ANTHROPIC_DEFAULT_HAIKU_MODEL,
                ENABLE_EXPERIMENTAL_MCP_CLI: presetEnv.ENABLE_EXPERIMENTAL_MCP_CLI === 'true',
                GEMINI_1M_CONTEXT: has1mSuffix,
            });
            setSelectedPreset(presetName);
            toast.info(t('presetLoaded'));
        }
    };

    const handleDeletePreset = async (presetName: string) => {
        if (!proxyStatus.running) return;
        if (confirm(`${t('deletePresetConfirm')}: "${presetName}"?`)) {
            const updatedPresets = await deletePresetAPI(presetName, config.proxy.port);
            setPresets(updatedPresets);
            if (selectedPreset === presetName) {
                setSelectedPreset(updatedPresets[0]?.name || '');
            }
            toast.success(t('presetDeleted'));
        }
    };

    // Auto-start handler
    const handleAutoStartChange = async (enabled: boolean) => {
        const success = await setAutoStart(enabled);
        if (success) {
            setConfig({ ...config, proxy: { ...config.proxy, autoStart: enabled } });
            toast.success(enabled ? t('autoStartEnabled') : t('autoStartDisabled'));
        } else {
            toast.error(t('autoStartFailed'));
        }
    };

    return (
        <div className="h-full flex flex-col animate-fade-in overflow-auto">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 shrink-0">
                <div className="flex items-center gap-3">
                    <SettingsIcon size={22} className="text-accent-primary" />
                    <h1 className="text-lg font-bold text-text-primary">{t('settings')}</h1>
                    {hasUnsavedChanges && (
                        <span className="px-2 py-0.5 bg-yellow-500/20 text-yellow-400 text-xs rounded-full">
                            {t('unsavedChanges')}
                        </span>
                    )}
                </div>
                {hasUnsavedChanges && (
                    <button
                        onClick={handleSaveClaudeConfig}
                        disabled={isSaving}
                        className="btn-primary text-sm flex items-center gap-2"
                    >
                        <Save size={14} />
                        {isSaving ? t('saving') : t('saveChanges')}
                    </button>
                )}
            </div>

            {/* Settings Sections */}
            <div className="flex-1 overflow-auto p-4 space-y-3">
                {/* Section 1: General */}
                <Accordion icon={<Globe size={18} />} title={t('generalSettings')}>
                    <SettingRow
                        label={t('language')}
                        description={t('languageDesc')}
                    >
                        <select
                            value={language}
                            onChange={(e) => setLanguage(e.target.value as 'en' | 'tr')}
                            className="input text-sm py-1.5 px-3 w-32"
                        >
                            <option value="en">{t('english')}</option>
                            <option value="tr">{t('turkish')}</option>
                        </select>
                    </SettingRow>

                    <SettingRow
                        label={t('autoStart')}
                        description={t('autoStartDesc')}
                    >
                        <ToggleSwitch
                            checked={config.proxy.autoStart}
                            onChange={handleAutoStartChange}
                        />
                    </SettingRow>

                    <SettingRow
                        label={t('autoStartProxy')}
                        description={t('autoStartProxyDesc')}
                    >
                        <ToggleSwitch
                            checked={config.proxy.autoStartProxy}
                            onChange={async (v) => {
                                setConfig({ ...config, proxy: { ...config.proxy, autoStartProxy: v } });
                                // Also save to disk
                                const currentSettings = await loadSettings();
                                await saveSettings({ ...currentSettings, autoStartProxy: v });
                            }}
                        />
                    </SettingRow>

                    <SettingRow
                        label={t('modelFallback')}
                        description={t('modelFallbackDesc')}
                    >
                        <ToggleSwitch
                            checked={config.proxy.fallbackEnabled}
                            onChange={async (v) => {
                                setConfig({ ...config, proxy: { ...config.proxy, fallbackEnabled: v } });
                                // Save to disk
                                const currentSettings = await loadSettings();
                                await saveSettings({ ...currentSettings, fallbackEnabled: v });
                                // Show notification about restart requirement
                                if (proxyStatus.running) {
                                    toast.info(t('restartProxyForChanges'));
                                }
                            }}
                        />
                    </SettingRow>

                    <SettingRow
                        label={t('pollingInterval')}
                        description={t('pollingIntervalDesc')}
                    >
                        <div className="flex items-center gap-2">
                            <input
                                type="range"
                                min="10"
                                max="300"
                                value={config.app.pollingInterval}
                                onChange={async (e) => {
                                    const value = parseInt(e.target.value);
                                    setConfig({ app: { ...config.app, pollingInterval: value } });
                                    // Save to disk
                                    const currentSettings = await loadSettings();
                                    await saveSettings({ ...currentSettings, pollingInterval: value });
                                }}
                                className="w-24 accent-accent-primary"
                            />
                            <span className="text-sm font-mono text-text-secondary w-12">{config.app.pollingInterval}s</span>
                        </div>
                    </SettingRow>
                </Accordion>

                {/* Section 2: Proxy */}
                <Accordion icon={<Server size={18} />} title={t('proxySettings')}>
                    <SettingRow
                        label={t('port')}
                        description={t('portDesc')}
                    >
                        <input
                            type="number"
                            value={config.proxy.port}
                            onChange={async (e) => {
                                const value = parseInt(e.target.value) || 8080;
                                setConfig({ ...config, proxy: { ...config.proxy, port: value } });
                                const currentSettings = await loadSettings();
                                await saveSettings({ ...currentSettings, port: value });
                            }}
                            className="input text-sm py-1.5 px-3 w-24 text-center"
                        />
                    </SettingRow>

                    <SettingRow
                        label={t('logBufferSize')}
                        description={t('logBufferDesc')}
                    >
                        <div className="flex items-center gap-2">
                            <input
                                type="range"
                                min="500"
                                max="5000"
                                step="500"
                                value={config.app.logBufferSize}
                                onChange={async (e) => {
                                    const value = parseInt(e.target.value);
                                    setConfig({ app: { ...config.app, logBufferSize: value } });
                                    const currentSettings = await loadSettings();
                                    await saveSettings({ ...currentSettings, logBufferSize: value });
                                }}
                                className="w-24 accent-accent-primary"
                            />
                            <span className="text-sm font-mono text-text-secondary w-16">{config.app.logBufferSize}</span>
                        </div>
                    </SettingRow>

                    <SettingRow
                        label={t('debugMode')}
                        description={t('debugModeDesc')}
                    >
                        <ToggleSwitch
                            checked={debugMode}
                            onChange={async (v) => {
                                setDebugMode(v);
                                const currentSettings = await loadSettings();
                                await saveSettings({ ...currentSettings, debugMode: v });
                            }}
                        />
                    </SettingRow>

                    <SettingRow
                        label={t('logLevel')}
                        description={t('logLevelDesc')}
                    >
                        <select
                            value={logLevel}
                            onChange={async (e) => {
                                const value = e.target.value as 'info' | 'warn' | 'error' | 'debug';
                                setLogLevel(value);
                                const currentSettings = await loadSettings();
                                await saveSettings({ ...currentSettings, logLevel: value });
                            }}
                            className="input text-sm py-1.5 px-3 w-28"
                        >
                            <option value="info">Info</option>
                            <option value="warn">Warn</option>
                            <option value="error">Error</option>
                            <option value="debug">Debug</option>
                        </select>
                    </SettingRow>
                </Accordion>

                {/* Section 3: Performance */}
                <Accordion icon={<Zap size={18} />} title={t('performanceSettings')}>
                    {/* Performance Preset Selector */}
                    <SettingRow
                        label={t('performancePreset')}
                        description={t('performancePresetDesc')}
                    >
                        <div className="flex gap-2">
                            {Object.entries(PERFORMANCE_PRESETS).map(([key, preset]) => (
                                <button
                                    key={key}
                                    onClick={async () => {
                                        setMaxRetries(preset.maxRetries);
                                        setRetryBaseDelay(preset.retryBaseDelay);
                                        setRetryMaxDelay(preset.retryMaxDelay);
                                        setDefaultCooldown(preset.defaultCooldown);
                                        setMaxWaitBeforeError(preset.maxWaitBeforeError);
                                        const currentSettings = await loadSettings();
                                        await saveSettings({
                                            ...currentSettings,
                                            maxRetries: preset.maxRetries,
                                            retryBaseDelay: preset.retryBaseDelay,
                                            retryMaxDelay: preset.retryMaxDelay,
                                            defaultCooldown: preset.defaultCooldown,
                                            maxWaitBeforeError: preset.maxWaitBeforeError,
                                        });
                                        toast.success(`${t('presetApplied')}: ${t(preset.nameKey as TranslationKey)}`);
                                    }}
                                    className={`tooltip-fast px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${maxRetries === preset.maxRetries && retryBaseDelay === preset.retryBaseDelay
                                        ? 'bg-accent-primary text-white'
                                        : 'bg-bg-tertiary text-text-secondary hover:bg-bg-secondary'
                                        }`}
                                    data-tooltip={t(preset.descKey as TranslationKey)}
                                >
                                    {t(preset.nameKey as TranslationKey)}
                                </button>
                            ))}
                        </div>
                    </SettingRow>

                    <SettingRow
                        label={t('maxRetries')}
                        description={t('maxRetriesDesc')}
                    >
                        <input
                            type="number"
                            min="1"
                            max="10"
                            value={maxRetries}
                            onChange={(e) => setMaxRetries(parseInt(e.target.value))}
                            className="input text-sm py-1.5 px-3 w-20 text-center"
                        />
                    </SettingRow>

                    <SettingRow
                        label={t('retryBaseDelay')}
                        description={t('retryBaseDelayDesc')}
                    >
                        <div className="flex items-center gap-1">
                            <input
                                type="number"
                                min="100"
                                max="10000"
                                step="100"
                                value={retryBaseDelay}
                                onChange={(e) => setRetryBaseDelay(parseInt(e.target.value))}
                                className="input text-sm py-1.5 px-3 w-24 text-center"
                            />
                            <span className="text-xs text-text-muted">ms</span>
                        </div>
                    </SettingRow>

                    <SettingRow
                        label={t('retryMaxDelay')}
                        description={t('retryMaxDelayDesc')}
                    >
                        <div className="flex items-center gap-1">
                            <input
                                type="number"
                                min="1000"
                                max="60000"
                                step="1000"
                                value={retryMaxDelay}
                                onChange={(e) => setRetryMaxDelay(parseInt(e.target.value))}
                                className="input text-sm py-1.5 px-3 w-24 text-center"
                            />
                            <span className="text-xs text-text-muted">ms</span>
                        </div>
                    </SettingRow>

                    <SettingRow
                        label={t('defaultCooldown')}
                        description={t('defaultCooldownDesc')}
                    >
                        <div className="flex items-center gap-1">
                            <input
                                type="number"
                                min="1"
                                max="300"
                                value={defaultCooldown}
                                onChange={(e) => setDefaultCooldown(parseInt(e.target.value))}
                                className="input text-sm py-1.5 px-3 w-20 text-center"
                            />
                            <span className="text-xs text-text-muted">s</span>
                        </div>
                    </SettingRow>

                    <SettingRow
                        label={t('maxWaitBeforeError')}
                        description={t('maxWaitBeforeErrorDesc')}
                    >
                        <div className="flex items-center gap-1">
                            <input
                                type="number"
                                min="10"
                                max="600"
                                value={maxWaitBeforeError}
                                onChange={(e) => setMaxWaitBeforeError(parseInt(e.target.value))}
                                className="input text-sm py-1.5 px-3 w-20 text-center"
                            />
                            <span className="text-xs text-text-muted">s</span>
                        </div>
                    </SettingRow>

                    <SettingRow
                        label={t('accountStrategy')}
                        description={t('accountStrategyDesc')}
                    >
                        <div className="flex gap-2">
                            {(['sticky', 'round-robin', 'hybrid'] as const).map((strategy) => {
                                const labels = {
                                    sticky: { name: 'strategySticky', desc: 'strategyStickyDesc' },
                                    'round-robin': { name: 'strategyRoundRobin', desc: 'strategyRoundRobinDesc' },
                                    hybrid: { name: 'strategyHybrid', desc: 'strategyHybridDesc' },
                                };
                                return (
                                    <button
                                        key={strategy}
                                        onClick={() => setAccountStrategy(strategy)}
                                        className={`tooltip-fast px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${accountStrategy === strategy
                                            ? 'bg-accent-primary text-white'
                                            : 'bg-bg-tertiary text-text-secondary hover:bg-bg-secondary'
                                            }`}
                                        data-tooltip={t(labels[strategy].desc as TranslationKey)}
                                    >
                                        {t(labels[strategy].name as TranslationKey)}
                                    </button>
                                );
                            })}
                        </div>
                    </SettingRow>

                    <SettingRow
                        label={t('persistentSessions')}
                        description={t('persistentSessionsDesc')}
                    >
                        <ToggleSwitch
                            checked={persistentSessions}
                            onChange={setPersistentSessions}
                        />
                    </SettingRow>

                    <div className="pt-3">
                        <button
                            onClick={handleSaveServerConfig}
                            disabled={!proxyStatus.running}
                            className="btn-primary text-sm flex items-center gap-2"
                        >
                            <Save size={14} />
                            {t('saveServerConfig')}
                        </button>
                    </div>
                </Accordion>

                {/* Section 4: IDE Integrations */}
                <Accordion icon={<Monitor size={18} />} title={t('ideIntegrations')}>
                    {/* Kiro IDE */}
                    <SettingRow
                        label={t('kiroIde')}
                        description={t('kiroDesc')}
                    >
                        <div className="flex items-center gap-3">
                            {kiroInitialLoading ? (
                                <RefreshCw size={14} className="animate-spin text-text-muted" />
                            ) : !kiroStatus.installed ? (
                                <span className="text-xs text-text-muted">{t('kiroNotInstalled')}</span>
                            ) : (
                                <>
                                    {/* Server Status */}
                                    <span className={`text-xs px-2 py-0.5 rounded ${kiroStatus.running ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                                        {kiroStatus.running ? t('kiroServerRunning') : t('kiroServerStopped')}
                                    </span>
                                    {/* Patch Status */}
                                    <span className={`text-xs px-2 py-0.5 rounded ${kiroStatus.patched ? 'bg-green-500/20 text-green-400' : 'bg-yellow-500/20 text-yellow-400'}`}>
                                        {kiroStatus.patched ? t('kiroPatched') : t('kiroNotPatched')}
                                    </span>
                                    {/* Enable/Disable Button */}
                                    <button
                                        onClick={async () => {
                                            setKiroLoading(true);
                                            try {
                                                if (kiroStatus.running && kiroStatus.patched) {
                                                    // Disable: stop server and restore
                                                    await stopKiroServer();
                                                    await restoreKiro();
                                                    toast.success(t('kiroDisabled'));
                                                } else {
                                                    // Enable: start server and patch
                                                    const serverResult = await startKiroServer();
                                                    if (!serverResult.success) {
                                                        toast.error(t('kiroServerFailed') + (serverResult.error ? `: ${serverResult.error}` : ''));
                                                        return;
                                                    }
                                                    const patchResult = await patchKiro();
                                                    if (!patchResult.success) {
                                                        toast.error(t('kiroPatchFailed') + (patchResult.error ? `: ${patchResult.error}` : ''));
                                                        return;
                                                    }
                                                    toast.success(t('kiroEnabled'));
                                                    toast.info(t('restartKiroRequired'));
                                                }
                                                // Refresh status
                                                const newStatus = await getKiroStatus();
                                                setKiroStatus(newStatus);
                                            } finally {
                                                setKiroLoading(false);
                                            }
                                        }}
                                        disabled={kiroLoading}
                                        className={`btn-secondary text-xs py-1.5 px-3 ${kiroLoading ? 'opacity-50' : ''}`}
                                    >
                                        {kiroLoading ? (
                                            <RefreshCw size={12} className="animate-spin" />
                                        ) : kiroStatus.running && kiroStatus.patched ? (
                                            t('kiroDisable')
                                        ) : (
                                            t('kiroEnable')
                                        )}
                                    </button>
                                    {/* Restore Button - shows when patched but not running */}
                                    {kiroStatus.patched && !kiroStatus.running && (
                                        <button
                                            onClick={async () => {
                                                setKiroLoading(true);
                                                try {
                                                    await restoreKiro();
                                                    toast.success(t('kiroRestoreSuccess'));
                                                    const newStatus = await getKiroStatus();
                                                    setKiroStatus(newStatus);
                                                } finally {
                                                    setKiroLoading(false);
                                                }
                                            }}
                                            disabled={kiroLoading}
                                            className={`btn-secondary text-xs py-1.5 px-3 bg-orange-500/20 text-orange-400 hover:bg-orange-500/30 ${kiroLoading ? 'opacity-50' : ''}`}
                                        >
                                            {t('kiroRestore')}
                                        </button>
                                    )}
                                </>
                            )}
                        </div>
                    </SettingRow>

                    {/* Kiro Auto-Start */}
                    {kiroStatus.installed && (
                        <SettingRow
                            label={t('kiroAutoStart')}
                            description={t('kiroAutoStartDesc')}
                        >
                            <ToggleSwitch
                                checked={kiroAutoStart}
                                onChange={async (enabled) => {
                                    setKiroAutoStart(enabled);
                                    await updateSettings({ kiroAutoStart: enabled });
                                }}
                            />
                        </SettingRow>
                    )}

                </Accordion>

                {/* Section 5: Claude CLI */}
                <Accordion icon={<Terminal size={18} />} title={t('claudeCliConfig')}>
                    {!proxyStatus.running && (
                        <div className="flex items-center gap-2 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg mb-3">
                            <Info size={16} className="text-yellow-400" />
                            <span className="text-sm text-yellow-300">{t('startProxyToEdit')}</span>
                        </div>
                    )}

                    {/* Presets */}
                    <div className="flex items-center gap-2 py-3 border-b border-white/5">
                        <Bookmark size={14} className="text-accent-cyan" />
                        <select
                            value={selectedPreset}
                            onChange={(e) => handleLoadPreset(e.target.value)}
                            className="input text-sm py-1.5 px-3 flex-1"
                            disabled={!proxyStatus.running}
                        >
                            <option value="">{t('selectPreset')}</option>
                            {presets.map((preset) => (
                                <option key={preset.name} value={preset.name}>{preset.name}</option>
                            ))}
                        </select>
                        <button
                            onClick={handleSavePreset}
                            disabled={!proxyStatus.running}
                            className="btn-secondary text-xs py-1.5 px-2"
                        >
                            <Save size={12} />
                        </button>
                        {selectedPreset && (
                            <button
                                onClick={() => handleDeletePreset(selectedPreset)}
                                disabled={!proxyStatus.running}
                                className="btn-secondary text-xs py-1.5 px-2 text-red-400 hover:text-red-300"
                            >
                                <Trash2 size={12} />
                            </button>
                        )}
                    </div>

                    <SettingRow
                        label={t('defaultModel')}
                        description={t('defaultModelDesc')}
                    >
                        <select
                            value={addSuffixIfGemini(claudeConfig.ANTHROPIC_MODEL, claudeConfig.GEMINI_1M_CONTEXT)}
                            onChange={(e) => setClaudeConfig({ ...claudeConfig, ANTHROPIC_MODEL: stripSuffix(e.target.value) })}
                            className="input text-sm py-1.5 px-3 w-56"
                            disabled={!proxyStatus.running}
                        >
                            {availableModels.map((model) => {
                                const displayValue = addSuffixIfGemini(model, claudeConfig.GEMINI_1M_CONTEXT);
                                return <option key={model} value={displayValue}>{displayValue}</option>;
                            })}
                        </select>
                    </SettingRow>

                    <SettingRow
                        label={t('subagentModel')}
                        description={t('subagentModelDesc')}
                    >
                        <select
                            value={addSuffixIfGemini(claudeConfig.CLAUDE_CODE_SUBAGENT_MODEL, claudeConfig.GEMINI_1M_CONTEXT)}
                            onChange={(e) => setClaudeConfig({ ...claudeConfig, CLAUDE_CODE_SUBAGENT_MODEL: stripSuffix(e.target.value) })}
                            className="input text-sm py-1.5 px-3 w-56"
                            disabled={!proxyStatus.running}
                        >
                            {availableModels.map((model) => {
                                const displayValue = addSuffixIfGemini(model, claudeConfig.GEMINI_1M_CONTEXT);
                                return <option key={model} value={displayValue}>{displayValue}</option>;
                            })}
                        </select>
                    </SettingRow>

                    <SettingRow
                        label={t('opusModel')}
                        description={t('opusModelDesc')}
                    >
                        <select
                            value={addSuffixIfGemini(claudeConfig.ANTHROPIC_DEFAULT_OPUS_MODEL, claudeConfig.GEMINI_1M_CONTEXT)}
                            onChange={(e) => setClaudeConfig({ ...claudeConfig, ANTHROPIC_DEFAULT_OPUS_MODEL: stripSuffix(e.target.value) })}
                            className="input text-sm py-1.5 px-3 w-56"
                            disabled={!proxyStatus.running}
                        >
                            {availableModels.map((model) => {
                                const displayValue = addSuffixIfGemini(model, claudeConfig.GEMINI_1M_CONTEXT);
                                return <option key={model} value={displayValue}>{displayValue}</option>;
                            })}
                        </select>
                    </SettingRow>

                    <SettingRow
                        label={t('sonnetModel')}
                        description={t('sonnetModelDesc')}
                    >
                        <select
                            value={addSuffixIfGemini(claudeConfig.ANTHROPIC_DEFAULT_SONNET_MODEL, claudeConfig.GEMINI_1M_CONTEXT)}
                            onChange={(e) => setClaudeConfig({ ...claudeConfig, ANTHROPIC_DEFAULT_SONNET_MODEL: stripSuffix(e.target.value) })}
                            className="input text-sm py-1.5 px-3 w-56"
                            disabled={!proxyStatus.running}
                        >
                            {availableModels.map((model) => {
                                const displayValue = addSuffixIfGemini(model, claudeConfig.GEMINI_1M_CONTEXT);
                                return <option key={model} value={displayValue}>{displayValue}</option>;
                            })}
                        </select>
                    </SettingRow>

                    <SettingRow
                        label={t('haikuModel')}
                        description={t('haikuModelDesc')}
                    >
                        <select
                            value={addSuffixIfGemini(claudeConfig.ANTHROPIC_DEFAULT_HAIKU_MODEL, claudeConfig.GEMINI_1M_CONTEXT)}
                            onChange={(e) => setClaudeConfig({ ...claudeConfig, ANTHROPIC_DEFAULT_HAIKU_MODEL: stripSuffix(e.target.value) })}
                            className="input text-sm py-1.5 px-3 w-56"
                            disabled={!proxyStatus.running}
                        >
                            {availableModels.map((model) => {
                                const displayValue = addSuffixIfGemini(model, claudeConfig.GEMINI_1M_CONTEXT);
                                return <option key={model} value={displayValue}>{displayValue}</option>;
                            })}
                        </select>
                    </SettingRow>

                    <SettingRow
                        label={t('experimentalMcp')}
                        description={t('experimentalMcpDesc')}
                    >
                        <ToggleSwitch
                            checked={claudeConfig.ENABLE_EXPERIMENTAL_MCP_CLI}
                            onChange={(v) => setClaudeConfig({ ...claudeConfig, ENABLE_EXPERIMENTAL_MCP_CLI: v })}
                            disabled={!proxyStatus.running}
                        />
                    </SettingRow>

                    <SettingRow
                        label={t('gemini1mContext')}
                        description={t('gemini1mContextDesc')}
                    >
                        <ToggleSwitch
                            checked={claudeConfig.GEMINI_1M_CONTEXT}
                            onChange={(enabled) => setClaudeConfig({ ...claudeConfig, GEMINI_1M_CONTEXT: enabled })}
                            disabled={!proxyStatus.running}
                        />
                    </SettingRow>

                    <div className="flex gap-2 pt-3">
                        <button
                            onClick={handleSaveClaudeConfig}
                            disabled={!proxyStatus.running || isSaving}
                            className="btn-primary text-sm flex items-center gap-2"
                        >
                            <Save size={14} />
                            {isSaving ? t('saving') : t('saveConfig')}
                        </button>
                        <button
                            onClick={handleRestoreDefaults}
                            disabled={!proxyStatus.running}
                            className="btn-secondary text-sm flex items-center gap-2"
                        >
                            <RotateCcw size={14} />
                            {t('restoreDefaults')}
                        </button>
                    </div>
                </Accordion>

                {/* Section 6: About */}
                <Accordion icon={<Info size={18} />} title={t('about')}>
                    <SettingRow label={t('version')} description="Antigravity Claude Proxy Desktop">
                        <span className="text-sm font-mono text-accent-primary">v1.0.0</span>
                    </SettingRow>

                    <SettingRow label={t('documentation')} description={t('documentationDesc')}>
                        <a
                            href="https://github.com/AutoMaker-Org/automaker"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-accent-primary hover:text-accent-primary/80 flex items-center gap-1"
                        >
                            <ExternalLink size={14} />
                        </a>
                    </SettingRow>

                    <SettingRow label={t('sourceCode')} description={t('sourceCodeDesc')}>
                        <a
                            href="https://github.com/AutoMaker-Org/automaker"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-accent-primary hover:text-accent-primary/80 flex items-center gap-1"
                        >
                            <Github size={14} />
                        </a>
                    </SettingRow>
                </Accordion>
            </div>
        </div>
    );
}
