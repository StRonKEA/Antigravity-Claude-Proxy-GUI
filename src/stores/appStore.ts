import { create } from 'zustand';
import type { ProxyStatus, AppConfig, Account, ModelQuota } from '../types';

interface ProxyPackageState {
    isInstalled: boolean;
    installedVersion: string | null;
    latestVersion: string | null;
    updateAvailable: boolean;
    isChecking: boolean;
    isInstalling: boolean;
}

interface AppState {
    // Proxy State
    proxyStatus: ProxyStatus;
    setProxyStatus: (status: Partial<ProxyStatus>) => void;

    // Proxy Start Time (for persistent uptime)
    proxyStartTime: number | null;
    setProxyStartTime: (time: number | null) => void;

    // Proxy Package State
    proxyPackage: ProxyPackageState;
    setProxyPackage: (pkg: Partial<ProxyPackageState>) => void;

    // Data State
    accounts: Account[];
    setAccounts: (accounts: Account[]) => void;
    modelQuotas: ModelQuota[];
    setModelQuotas: (quotas: ModelQuota[]) => void;

    // Navigation
    currentPage: string;
    setCurrentPage: (page: string) => void;

    // Config
    config: AppConfig;
    setConfig: (config: Partial<AppConfig>) => void;

    // UI State
    isSidebarCollapsed: boolean;
    toggleSidebar: () => void;

    // Proxy Port (convenience method)
    setProxyPort: (port: number) => void;
}

const defaultConfig: AppConfig = {
    proxy: {
        port: 8080,
        autoStart: true,
        autoStartProxy: true,  // Start proxy when app opens
        minimizeToTray: true,
        startMinimized: false,
        fallbackEnabled: false,
    },
    app: {
        language: 'en',
        checkUpdates: true,
        pollingInterval: 30,  // 30 seconds default
        logBufferSize: 1000,  // 1000 log entries default
    },
    advanced: {
        debugMode: false,
        requestTimeout: 30,
        maxRetries: 3,
        logLevel: 'info',
    },
    claudeCli: {
        configured: false,
    },
};

const defaultProxyStatus: ProxyStatus = {
    running: false,
    port: 8080,
};

const defaultProxyPackage: ProxyPackageState = {
    isInstalled: false,
    installedVersion: null,
    latestVersion: null,
    updateAvailable: false,
    isChecking: true,
    isInstalling: false,
};

export const useAppStore = create<AppState>((set) => ({
    // Proxy State
    proxyStatus: defaultProxyStatus,
    setProxyStatus: (status) =>
        set((state) => ({
            proxyStatus: { ...state.proxyStatus, ...status },
        })),

    // Proxy Start Time (for persistent uptime)
    proxyStartTime: null,
    setProxyStartTime: (time) => set({ proxyStartTime: time }),

    // Proxy Package State
    proxyPackage: defaultProxyPackage,
    setProxyPackage: (pkg) =>
        set((state) => ({
            proxyPackage: { ...state.proxyPackage, ...pkg },
        })),

    // Data State
    accounts: [],
    setAccounts: (accounts) => set({ accounts }),
    modelQuotas: [],
    setModelQuotas: (modelQuotas) => set({ modelQuotas }),

    // Navigation
    currentPage: 'dashboard',
    setCurrentPage: (page) => set({ currentPage: page }),

    // Config
    config: defaultConfig,
    setConfig: (config) =>
        set((state) => ({
            config: { ...state.config, ...config },
        })),

    setProxyPort: (port: number) =>
        set((state) => ({
            config: {
                ...state.config,
                proxy: {
                    ...state.config.proxy,
                    port
                }
            }
        })),

    // UI State
    isSidebarCollapsed: false,
    toggleSidebar: () =>
        set((state) => ({ isSidebarCollapsed: !state.isSidebarCollapsed })),
}));
