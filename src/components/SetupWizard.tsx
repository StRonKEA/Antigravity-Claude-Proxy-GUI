import { useState, useEffect } from 'react';
import { Sparkles, Zap, Check, AlertCircle, ArrowRight, ArrowLeft, Package, Terminal, Settings2, Loader2, Globe, Download, CheckCircle2 } from 'lucide-react';
import { applyPreset, checkClaudeCli, installClaudeCli, settingsFileExists, setOnboardingComplete, type ClaudeCliCheckResult } from '../services/claudeCliService';
import { checkInstallation, installPackage, type PackageStatus } from '../services/proxyPackageService';
import { useTranslation, useI18nStore } from '../i18n';

type WizardStep = 'welcome' | 'proxy' | 'claude' | 'config' | 'completed';

interface SetupWizardProps {
    onComplete: () => void;
    onSkip: () => void;
}

export function SetupWizard({ onComplete, onSkip }: SetupWizardProps) {
    const { t } = useTranslation();
    const { setLanguage } = useI18nStore();
    const [currentStep, setCurrentStep] = useState<WizardStep>('welcome');

    // Detect system language - if Turkish, default to Turkish, otherwise English
    const getSystemLanguage = (): 'en' | 'tr' => {
        const browserLang = navigator.language.toLowerCase();
        return browserLang.startsWith('tr') ? 'tr' : 'en';
    };
    const [selectedLanguage, setSelectedLanguage] = useState<'en' | 'tr'>(getSystemLanguage());

    // Step statuses
    const [proxyStatus, setProxyStatus] = useState<'checking' | 'installed' | 'not_installed' | 'installing'>('checking');
    const [proxyInfo, setProxyInfo] = useState<PackageStatus | null>(null);
    const [claudeStatus, setClaudeStatus] = useState<'checking' | 'installed' | 'not_installed' | 'installing'>('checking');
    const [claudeInfo, setClaudeInfo] = useState<ClaudeCliCheckResult | null>(null);
    const [configExists, setConfigExists] = useState(false);

    // Config step
    const [selectedPreset, setSelectedPreset] = useState<'claude' | 'gemini' | null>(null);
    const [isApplying, setIsApplying] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Skip onboarding checkbox
    const [skipOnboarding, setSkipOnboarding] = useState(true);

    // Check proxy installation when entering proxy step
    useEffect(() => {
        if (currentStep === 'proxy') {
            checkProxyInstallation();
        }
    }, [currentStep]);

    // Check Claude CLI when entering claude step
    useEffect(() => {
        if (currentStep === 'claude') {
            checkClaudeInstallation();
        }
    }, [currentStep]);

    // Check if config already exists when entering config step
    useEffect(() => {
        if (currentStep === 'config') {
            checkConfigExists();
        }
    }, [currentStep]);

    // Apply language when changed
    useEffect(() => {
        setLanguage(selectedLanguage);
    }, [selectedLanguage, setLanguage]);

    const checkProxyInstallation = async () => {
        setProxyStatus('checking');
        try {
            const info = await checkInstallation();
            setProxyInfo(info);
            setProxyStatus(info.isInstalled ? 'installed' : 'not_installed');
        } catch {
            setProxyStatus('not_installed');
        }
    };

    const handleInstallProxy = async () => {
        setProxyStatus('installing');
        try {
            await installPackage(() => { });
            await checkProxyInstallation();
        } catch {
            setProxyStatus('not_installed');
            setError('Failed to install proxy package');
        }
    };

    const checkClaudeInstallation = async () => {
        setClaudeStatus('checking');
        try {
            const result = await checkClaudeCli();
            setClaudeInfo(result);
            setClaudeStatus(result.installed ? 'installed' : 'not_installed');
        } catch {
            setClaudeStatus('not_installed');
        }
    };

    const checkConfigExists = async () => {
        try {
            const exists = await settingsFileExists();
            setConfigExists(exists);
        } catch {
            setConfigExists(false);
        }
    };

    const handleInstallClaudeCli = async () => {
        setClaudeStatus('installing');
        setError(null);
        try {
            const success = await installClaudeCli();
            if (success) {
                await checkClaudeInstallation();
            } else {
                setClaudeStatus('not_installed');
                setError('Claude CLI installation failed');
            }
        } catch {
            setClaudeStatus('not_installed');
            setError('Installation failed');
        }
    };

    const handleApplyConfig = async () => {
        if (!selectedPreset) return;

        setIsApplying(true);
        setError(null);

        try {
            const result = await applyPreset(selectedPreset);
            if (result) {
                // Save all settings including language and preset
                const { updateSettings } = await import('../services/appStorageService');
                await updateSettings({
                    setupCompleted: true,
                    language: selectedLanguage,
                    lastSelectedPreset: selectedPreset
                });
                setCurrentStep('completed');
            } else {
                setError('Failed to write settings file.');
            }
        } catch {
            setError('An error occurred while applying settings.');
        } finally {
            setIsApplying(false);
        }
    };

    const handleSkipConfig = async () => {
        const { updateSettings } = await import('../services/appStorageService');
        await updateSettings({ setupCompleted: true, language: selectedLanguage });
        setCurrentStep('completed');
    };

    const handleSkip = async () => {
        const { updateSettings } = await import('../services/appStorageService');
        await updateSettings({ setupCompleted: true, language: selectedLanguage });
        onSkip();
    };

    const handleFinish = () => {
        onComplete();
    };

    const goNext = async () => {
        const steps: WizardStep[] = ['welcome', 'proxy', 'claude', 'config', 'completed'];
        const currentIndex = steps.indexOf(currentStep);

        // If leaving Claude step and skipOnboarding is checked, apply it
        if (currentStep === 'claude' && skipOnboarding && claudeStatus === 'installed') {
            try {
                // Write hasCompletedOnboarding to ~/.claude.json using Tauri FS
                await setOnboardingComplete();
            } catch (e) {
                console.warn('[SetupWizard] Failed to set onboarding complete:', e);
            }
        }

        if (currentIndex < steps.length - 1) {
            setCurrentStep(steps[currentIndex + 1]);
        }
    };

    const goBack = () => {
        const steps: WizardStep[] = ['welcome', 'proxy', 'claude', 'config', 'completed'];
        const currentIndex = steps.indexOf(currentStep);
        if (currentIndex > 0) {
            setCurrentStep(steps[currentIndex - 1]);
        }
    };

    const getStepNumber = () => {
        const steps: WizardStep[] = ['welcome', 'proxy', 'claude', 'config', 'completed'];
        return steps.indexOf(currentStep);
    };

    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center animate-fade-in">
            <div className="glass-card p-8 w-full max-w-xl border-2 border-accent-primary/30">

                {/* Step Indicator */}
                {currentStep !== 'welcome' && currentStep !== 'completed' && (
                    <div className="flex items-center justify-center gap-2 mb-6">
                        {[1, 2, 3].map((step) => (
                            <div key={step} className="flex items-center">
                                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-all ${getStepNumber() >= step
                                    ? 'bg-accent-primary text-white'
                                    : 'bg-white/10 text-text-muted'
                                    }`}>
                                    {getStepNumber() > step ? <Check size={16} /> : step}
                                </div>
                                {step < 3 && (
                                    <div className={`w-12 h-0.5 mx-1 ${getStepNumber() > step ? 'bg-accent-primary' : 'bg-white/10'
                                        }`} />
                                )}
                            </div>
                        ))}
                    </div>
                )}

                {/* Welcome Step */}
                {currentStep === 'welcome' && (
                    <div className="text-center">
                        <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-accent-primary to-accent-secondary flex items-center justify-center mx-auto mb-6">
                            <Sparkles size={40} className="text-white" />
                        </div>
                        <h1 className="text-2xl font-bold text-text-primary mb-3">
                            {t('setupWizardTitle')}
                        </h1>
                        <p className="text-text-secondary mb-6">
                            {t('setupWizardDesc')}
                        </p>

                        {/* Language Selection */}
                        <div className="flex items-center justify-center gap-3 mb-6">
                            <Globe size={18} className="text-text-muted" />
                            <div className="flex rounded-lg overflow-hidden border border-white/10">
                                <button
                                    onClick={() => setSelectedLanguage('en')}
                                    className={`px-4 py-2 text-sm font-medium transition-all ${selectedLanguage === 'en'
                                        ? 'bg-accent-primary text-white'
                                        : 'bg-white/5 text-text-secondary hover:bg-white/10'
                                        }`}
                                >
                                    English
                                </button>
                                <button
                                    onClick={() => setSelectedLanguage('tr')}
                                    className={`px-4 py-2 text-sm font-medium transition-all ${selectedLanguage === 'tr'
                                        ? 'bg-accent-primary text-white'
                                        : 'bg-white/5 text-text-secondary hover:bg-white/10'
                                        }`}
                                >
                                    Türkçe
                                </button>
                            </div>
                        </div>

                        <div className="grid grid-cols-3 gap-4 mb-8">
                            <div className="p-4 rounded-xl bg-white/5 border border-white/10">
                                <Package size={24} className="text-purple-400 mx-auto mb-2" />
                                <p className="text-xs text-text-muted">Proxy Package</p>
                            </div>
                            <div className="p-4 rounded-xl bg-white/5 border border-white/10">
                                <Terminal size={24} className="text-green-400 mx-auto mb-2" />
                                <p className="text-xs text-text-muted">Claude CLI</p>
                            </div>
                            <div className="p-4 rounded-xl bg-white/5 border border-white/10">
                                <Settings2 size={24} className="text-blue-400 mx-auto mb-2" />
                                <p className="text-xs text-text-muted">{t('settings')}</p>
                            </div>
                        </div>

                        <div className="flex items-center justify-between">
                            <button onClick={handleSkip} className="text-sm text-text-muted hover:text-text-secondary">
                                {t('skipForNow')}
                            </button>
                            <button
                                onClick={goNext}
                                className="flex items-center gap-2 px-6 py-2.5 rounded-lg font-medium bg-gradient-to-r from-accent-primary to-accent-secondary text-white hover:opacity-90"
                            >
                                {t('start') || 'Start Setup'}
                                <ArrowRight size={16} />
                            </button>
                        </div>
                    </div>
                )}

                {/* Proxy Step */}
                {currentStep === 'proxy' && (
                    <div>
                        <div className="text-center mb-6">
                            <div className="w-16 h-16 rounded-xl bg-purple-500/20 flex items-center justify-center mx-auto mb-4">
                                <Package size={32} className="text-purple-400" />
                            </div>
                            <h2 className="text-xl font-bold text-text-primary mb-2">Proxy Package</h2>
                            <p className="text-sm text-text-secondary">{t('checkingInstallation')}</p>
                        </div>

                        <div className="p-4 rounded-xl bg-white/5 border border-white/10 mb-6">
                            {proxyStatus === 'checking' && (
                                <div className="flex items-center gap-3">
                                    <Loader2 size={20} className="text-accent-primary animate-spin" />
                                    <span className="text-text-secondary">{t('checkingInstallation')}</span>
                                </div>
                            )}
                            {proxyStatus === 'installed' && (
                                <div className="flex items-center gap-3">
                                    <CheckCircle2 size={20} className="text-green-400" />
                                    <div>
                                        <span className="text-green-400 font-medium">{t('installed')} ✓</span>
                                        {proxyInfo?.installedVersion && (
                                            <span className="text-text-muted ml-2">v{proxyInfo.installedVersion}</span>
                                        )}
                                    </div>
                                </div>
                            )}
                            {proxyStatus === 'not_installed' && (
                                <div className="space-y-3">
                                    <div className="flex items-center gap-3">
                                        <AlertCircle size={20} className="text-yellow-400" />
                                        <span className="text-yellow-400">{t('notInstalled')}</span>
                                    </div>
                                    <button
                                        onClick={handleInstallProxy}
                                        className="w-full py-2 rounded-lg bg-purple-500/20 text-purple-400 hover:bg-purple-500/30 transition-colors flex items-center justify-center gap-2"
                                    >
                                        <Download size={16} />
                                        {t('installNow')}
                                    </button>
                                </div>
                            )}
                            {proxyStatus === 'installing' && (
                                <div className="flex items-center gap-3">
                                    <Loader2 size={20} className="text-accent-primary animate-spin" />
                                    <span className="text-text-secondary">{t('installing')}</span>
                                </div>
                            )}
                        </div>

                        <div className="flex items-center justify-between">
                            <button onClick={goBack} className="flex items-center gap-2 text-text-muted hover:text-text-primary">
                                <ArrowLeft size={16} />
                                {t('back')}
                            </button>
                            <button
                                onClick={goNext}
                                disabled={proxyStatus !== 'installed'}
                                className={`flex items-center gap-2 px-6 py-2.5 rounded-lg font-medium ${proxyStatus === 'installed'
                                    ? 'bg-gradient-to-r from-accent-primary to-accent-secondary text-white hover:opacity-90'
                                    : 'bg-white/10 text-text-muted cursor-not-allowed'
                                    }`}
                            >
                                {t('next')}
                                <ArrowRight size={16} />
                            </button>
                        </div>
                    </div>
                )}

                {/* Claude CLI Step */}
                {currentStep === 'claude' && (
                    <div>
                        <div className="text-center mb-6">
                            <div className="w-16 h-16 rounded-xl bg-green-500/20 flex items-center justify-center mx-auto mb-4">
                                <Terminal size={32} className="text-green-400" />
                            </div>
                            <h2 className="text-xl font-bold text-text-primary mb-2">Claude Code CLI</h2>
                            <p className="text-sm text-text-secondary">{t('checkingInstallation')}</p>
                        </div>

                        <div className="p-4 rounded-xl bg-white/5 border border-white/10 mb-6">
                            {claudeStatus === 'checking' && (
                                <div className="flex items-center gap-3">
                                    <Loader2 size={20} className="text-accent-primary animate-spin" />
                                    <span className="text-text-secondary">{t('checkingInstallation')}</span>
                                </div>
                            )}
                            {claudeStatus === 'installed' && (
                                <div className="flex items-center gap-3">
                                    <CheckCircle2 size={20} className="text-green-400" />
                                    <span className="text-green-400 font-medium">{t('installed')} ✓</span>
                                </div>
                            )}
                            {claudeStatus === 'not_installed' && (
                                <div className="space-y-4">
                                    <div className="flex items-center gap-3">
                                        <AlertCircle size={20} className="text-yellow-400" />
                                        <span className="text-yellow-400">{t('notInstalled')}</span>
                                    </div>
                                    <button
                                        onClick={handleInstallClaudeCli}
                                        className="w-full py-2.5 rounded-lg bg-green-500/20 text-green-400 hover:bg-green-500/30 transition-colors flex items-center justify-center gap-2"
                                    >
                                        <Download size={16} />
                                        {t('installNow')}
                                    </button>
                                </div>
                            )}
                            {claudeStatus === 'installing' && (
                                <div className="flex items-center gap-3">
                                    <Loader2 size={20} className="text-accent-primary animate-spin" />
                                    <span className="text-text-secondary">{t('installing')}</span>
                                </div>
                            )}
                        </div>

                        {error && (
                            <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20 mb-4">
                                <AlertCircle size={16} className="text-red-400" />
                                <p className="text-xs text-red-300">{error}</p>
                            </div>
                        )}

                        <div className="flex items-start gap-3 p-3 rounded-lg bg-blue-500/10 border border-blue-500/20 mb-4">
                            <AlertCircle size={16} className="text-blue-400 shrink-0 mt-0.5" />
                            <p className="text-xs text-blue-300">
                                {t('claudeCliOptional')}
                            </p>
                        </div>

                        {/* Skip Onboarding Checkbox - only show when Claude is installed */}
                        {claudeStatus === 'installed' && (
                            <div className="p-3 rounded-lg bg-violet-500/10 border border-violet-500/20 mb-6">
                                <label className="flex items-start gap-3 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={skipOnboarding}
                                        onChange={(e) => setSkipOnboarding(e.target.checked)}
                                        className="mt-0.5 w-4 h-4 rounded border-white/20 bg-white/10 text-accent-primary focus:ring-accent-primary/50"
                                    />
                                    <div>
                                        <span className="text-sm text-violet-300 font-medium">
                                            {selectedLanguage === 'tr' ? 'Giriş yöntemi seçimini atla' : 'Skip login method selection'}
                                        </span>
                                        <p className="text-xs text-text-muted mt-1">
                                            {selectedLanguage === 'tr'
                                                ? 'Claude CLI\'yi ilk açtığınızda "login yöntemi seç" ekranını atlar. Proxy kullanırken önerilir.'
                                                : 'Skips the "select login method" prompt when you first open Claude CLI. Recommended when using proxy.'}
                                        </p>
                                    </div>
                                </label>
                            </div>
                        )}

                        <div className="flex items-center justify-between">
                            <button onClick={goBack} className="flex items-center gap-2 text-text-muted hover:text-text-primary">
                                <ArrowLeft size={16} />
                                {t('back')}
                            </button>
                            <button
                                onClick={goNext}
                                className="flex items-center gap-2 px-6 py-2.5 rounded-lg font-medium bg-gradient-to-r from-accent-primary to-accent-secondary text-white hover:opacity-90"
                            >
                                {claudeStatus === 'installed' ? t('next') : t('skipContinue')}
                                <ArrowRight size={16} />
                            </button>
                        </div>
                    </div>
                )}

                {/* Config Step */}
                {currentStep === 'config' && (
                    <div>
                        <div className="text-center mb-6">
                            <div className="w-16 h-16 rounded-xl bg-blue-500/20 flex items-center justify-center mx-auto mb-4">
                                <Settings2 size={32} className="text-blue-400" />
                            </div>
                            <h2 className="text-xl font-bold text-text-primary mb-2">{t('settings')}</h2>
                            <p className="text-sm text-text-secondary">{t('chooseModelFamily')}</p>
                        </div>

                        {configExists && (
                            <div className="flex items-center gap-3 p-3 rounded-lg bg-green-500/10 border border-green-500/20 mb-4">
                                <CheckCircle2 size={16} className="text-green-400" />
                                <p className="text-xs text-green-300">
                                    {selectedLanguage === 'tr' ? 'Yapılandırma dosyası zaten mevcut. Yeni bir seçim yapabilir veya mevcut ayarları koruyabilirsiniz.' : 'Configuration file already exists. You can make a new selection or keep current settings.'}
                                </p>
                            </div>
                        )}

                        <div className="grid grid-cols-2 gap-4 mb-6">
                            {/* Claude Preset */}
                            <button
                                onClick={() => setSelectedPreset('claude')}
                                className={`relative p-5 rounded-xl border-2 transition-all duration-200 text-left ${selectedPreset === 'claude'
                                    ? 'border-purple-500 bg-purple-500/10'
                                    : 'border-white/10 bg-white/5 hover:border-white/20'
                                    }`}
                            >
                                {selectedPreset === 'claude' && (
                                    <div className="absolute top-3 right-3 w-6 h-6 rounded-full bg-purple-500 flex items-center justify-center">
                                        <Check size={14} className="text-white" />
                                    </div>
                                )}
                                <Sparkles size={24} className="text-purple-400 mb-2" />
                                <h3 className="font-bold text-text-primary">Claude</h3>
                                <p className="text-[10px] text-text-muted mb-2">Premium</p>
                                <ul className="text-[10px] text-text-secondary space-y-0.5">
                                    <li>• Opus 4.5 Thinking</li>
                                    <li>• Sonnet 4.5 Thinking</li>
                                </ul>
                            </button>

                            {/* Gemini Preset */}
                            <button
                                onClick={() => setSelectedPreset('gemini')}
                                className={`relative p-5 rounded-xl border-2 transition-all duration-200 text-left ${selectedPreset === 'gemini'
                                    ? 'border-green-500 bg-green-500/10'
                                    : 'border-white/10 bg-white/5 hover:border-white/20'
                                    }`}
                            >
                                {selectedPreset === 'gemini' && (
                                    <div className="absolute top-3 right-3 w-6 h-6 rounded-full bg-green-500 flex items-center justify-center">
                                        <Check size={14} className="text-white" />
                                    </div>
                                )}
                                <Zap size={24} className="text-green-400 mb-2" />
                                <h3 className="font-bold text-text-primary">Gemini</h3>
                                <p className="text-[10px] text-text-muted mb-2">Budget</p>
                                <ul className="text-[10px] text-text-secondary space-y-0.5">
                                    <li>• Gemini 3 Pro High</li>
                                    <li>• Gemini 3 Flash</li>
                                </ul>
                            </button>
                        </div>

                        <div className="flex items-start gap-3 p-3 rounded-lg bg-blue-500/10 border border-blue-500/20 mb-6">
                            <AlertCircle size={16} className="text-blue-400 shrink-0 mt-0.5" />
                            <p className="text-xs text-blue-300">
                                {t('setupWizardNote')}
                            </p>
                        </div>

                        {error && (
                            <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20 mb-4">
                                <AlertCircle size={16} className="text-red-400" />
                                <p className="text-xs text-red-300">{error}</p>
                            </div>
                        )}

                        <div className="flex items-center justify-between">
                            <button onClick={goBack} className="flex items-center gap-2 text-text-muted hover:text-text-primary">
                                <ArrowLeft size={16} />
                                {t('back')}
                            </button>
                            <div className="flex gap-2">
                                {configExists && (
                                    <button
                                        onClick={handleSkipConfig}
                                        className="px-4 py-2.5 rounded-lg text-text-secondary hover:bg-white/10 text-sm"
                                    >
                                        {selectedLanguage === 'tr' ? 'Mevcut Ayarları Koru' : 'Keep Current'}
                                    </button>
                                )}
                                <button
                                    onClick={handleApplyConfig}
                                    disabled={!selectedPreset || isApplying}
                                    className={`flex items-center gap-2 px-6 py-2.5 rounded-lg font-medium ${selectedPreset && !isApplying
                                        ? 'bg-gradient-to-r from-accent-primary to-accent-secondary text-white hover:opacity-90'
                                        : 'bg-white/10 text-text-muted cursor-not-allowed'
                                        }`}
                                >
                                    {isApplying ? (
                                        <>
                                            <Loader2 size={16} className="animate-spin" />
                                            {t('applying')}
                                        </>
                                    ) : (
                                        <>
                                            <Check size={16} />
                                            {t('applyFinish')}
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Completed Step */}
                {currentStep === 'completed' && (
                    <div className="text-center">
                        <div className="w-20 h-20 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-6 animate-bounce-in">
                            <CheckCircle2 size={48} className="text-green-400" />
                        </div>
                        <h1 className="text-2xl font-bold text-text-primary mb-3">
                            {selectedLanguage === 'tr' ? '🎉 Kurulum Tamamlandı!' : '🎉 Setup Complete!'}
                        </h1>
                        <p className="text-text-secondary mb-8">
                            {selectedLanguage === 'tr'
                                ? 'Tüm ayarlar başarıyla yapılandırıldı. Artık Claude Code CLI\'yi Antigravity Proxy ile kullanabilirsiniz.'
                                : 'All settings have been configured successfully. You can now use Claude Code CLI with Antigravity Proxy.'
                            }
                        </p>

                        <div className="grid grid-cols-3 gap-4 mb-8">
                            <div className="p-4 rounded-xl bg-green-500/10 border border-green-500/20">
                                <CheckCircle2 size={24} className="text-green-400 mx-auto mb-2" />
                                <p className="text-xs text-green-400">Proxy</p>
                            </div>
                            <div className="p-4 rounded-xl bg-green-500/10 border border-green-500/20">
                                <CheckCircle2 size={24} className="text-green-400 mx-auto mb-2" />
                                <p className="text-xs text-green-400">Claude CLI</p>
                            </div>
                            <div className="p-4 rounded-xl bg-green-500/10 border border-green-500/20">
                                <CheckCircle2 size={24} className="text-green-400 mx-auto mb-2" />
                                <p className="text-xs text-green-400">{t('settings')}</p>
                            </div>
                        </div>

                        <button
                            onClick={handleFinish}
                            className="flex items-center gap-2 px-8 py-3 rounded-lg font-medium bg-gradient-to-r from-accent-primary to-accent-secondary text-white hover:opacity-90 mx-auto"
                        >
                            {selectedLanguage === 'tr' ? 'Başla' : 'Get Started'}
                            <ArrowRight size={16} />
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
