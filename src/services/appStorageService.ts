import { homeDir, join } from '@tauri-apps/api/path';
import { readTextFile, writeTextFile, exists, mkdir } from '@tauri-apps/plugin-fs';

const CONFIG_DIR = '.config/antigravity-proxy/desktop-app';

export interface AppSettings {
    setupCompleted: boolean;
    language: 'en' | 'tr';
    autoStartProxy: boolean;
    fallbackEnabled?: boolean;  // Model fallback when all accounts rate-limited
    lastSelectedPreset?: 'claude' | 'gemini';
    // App settings
    pollingInterval?: number;  // seconds
    logBufferSize?: number;
    // Proxy settings  
    port?: number;
    // Advanced settings
    debugMode?: boolean;
    logLevel?: 'info' | 'warn' | 'error' | 'debug';
    // Performance settings (sent to server)
    maxRetries?: number;
    retryBaseDelay?: number;  // ms
    retryMaxDelay?: number;   // ms
    defaultCooldown?: number; // seconds
    maxWaitBeforeError?: number; // seconds
    persistentSessions?: boolean;
    kiroAutoStart?: boolean;
}

const DEFAULT_SETTINGS: AppSettings = {
    setupCompleted: false,
    language: 'en',
    autoStartProxy: false,
    pollingInterval: 30,
    logBufferSize: 1000,
    port: 8080,
    debugMode: false,
    logLevel: 'info',
    maxRetries: 3,
    retryBaseDelay: 1000,
    retryMaxDelay: 30000,
    defaultCooldown: 10,
    maxWaitBeforeError: 120,
    persistentSessions: true,
    kiroAutoStart: false
};

/**
 * Get the path to desktop-app config directory
 */
export async function getAppConfigDir(): Promise<string> {
    const home = await homeDir();
    return await join(home, CONFIG_DIR);
}

/**
 * Get the path to settings file
 */
export async function getSettingsPath(): Promise<string> {
    const configDir = await getAppConfigDir();
    return await join(configDir, 'settings.json');
}

/**
 * Ensure config directory exists
 */
async function ensureConfigDir(): Promise<void> {
    const configDir = await getAppConfigDir();
    const dirExists = await exists(configDir);
    if (!dirExists) {
        await mkdir(configDir, { recursive: true });
    }
}

/**
 * Load app settings from disk
 */
export async function loadSettings(): Promise<AppSettings> {
    try {
        const path = await getSettingsPath();
        const fileExists = await exists(path);

        if (!fileExists) {
            // No settings file - return defaults (setup not completed)
            return DEFAULT_SETTINGS;
        }

        const content = await readTextFile(path);
        return { ...DEFAULT_SETTINGS, ...JSON.parse(content) };
    } catch {
        return DEFAULT_SETTINGS;
    }
}

/**
 * Save app settings to disk
 */
export async function saveSettings(settings: AppSettings): Promise<boolean> {
    try {
        await ensureConfigDir();
        const path = await getSettingsPath();
        await writeTextFile(path, JSON.stringify(settings, null, 2));
        return true;
    } catch {
        return false;
    }
}

/**
 * Update specific settings
 */
export async function updateSettings(updates: Partial<AppSettings>): Promise<boolean> {
    const current = await loadSettings();
    return await saveSettings({ ...current, ...updates });
}
