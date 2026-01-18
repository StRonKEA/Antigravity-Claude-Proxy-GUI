import { homeDir, join } from '@tauri-apps/api/path';
import { readTextFile, writeTextFile, exists, mkdir } from '@tauri-apps/plugin-fs';
import { Command } from '@tauri-apps/plugin-shell';

const CLAUDE_DIR = '.claude';
const SETTINGS_FILE = 'settings.json';

export interface ClaudeCliCheckResult {
    installed: boolean;
    version?: string;
    error?: string;
}

/**
 * Check if Claude Code CLI is installed
 */
export async function checkClaudeCli(): Promise<ClaudeCliCheckResult> {
    // Check via npm list - this is the only reliable method
    try {
        const command = Command.create('npm', ['list', '-g', '@anthropic-ai/claude-code', '--depth=0']);
        const output = await command.execute();

        if (output.code === 0 && output.stdout && output.stdout.includes('@anthropic-ai/claude-code')) {
            // Extract version from npm list output
            const versionMatch = output.stdout.match(/@anthropic-ai\/claude-code@(\d+\.\d+\.\d+)/);
            return {
                installed: true,
                version: versionMatch ? versionMatch[1] : undefined
            };
        }
    } catch {
        // npm list failed, CLI not installed
    }

    return {
        installed: false,
        error: 'Claude CLI not found'
    };
}

/**
 * Install Claude Code CLI using npm
 */
export async function installClaudeCli(onProgress?: (msg: string) => void): Promise<boolean> {
    try {
        onProgress?.('Installing Claude CLI via npm...');

        const command = Command.create('npm', ['install', '-g', '@anthropic-ai/claude-code']);

        command.on('error', error => onProgress?.(`Error: ${error}`));

        const output = await command.execute();

        if (output.code === 0) {
            onProgress?.('Claude CLI installed successfully!');
            return true;
        } else {
            onProgress?.(`Error: ${output.stderr || 'Installation failed'}`);
            return false;
        }
    } catch {
        onProgress?.('Installation failed');
        return false;
    }
}

export interface ClaudeCliSettings {
    env: {
        ANTHROPIC_AUTH_TOKEN: string;
        ANTHROPIC_BASE_URL: string;
        ANTHROPIC_MODEL: string;
        ANTHROPIC_DEFAULT_OPUS_MODEL: string;
        ANTHROPIC_DEFAULT_SONNET_MODEL: string;
        ANTHROPIC_DEFAULT_HAIKU_MODEL: string;
        CLAUDE_CODE_SUBAGENT_MODEL: string;
        ENABLE_EXPERIMENTAL_MCP_CLI: string;
    };
}

// Claude preset configuration
export const CLAUDE_PRESET: ClaudeCliSettings = {
    env: {
        ANTHROPIC_AUTH_TOKEN: 'test',
        ANTHROPIC_BASE_URL: 'http://localhost:8080',
        ANTHROPIC_MODEL: 'claude-opus-4-5-thinking',
        ANTHROPIC_DEFAULT_OPUS_MODEL: 'claude-opus-4-5-thinking',
        ANTHROPIC_DEFAULT_SONNET_MODEL: 'claude-sonnet-4-5-thinking',
        ANTHROPIC_DEFAULT_HAIKU_MODEL: 'gemini-2.5-flash-lite[1m]',
        CLAUDE_CODE_SUBAGENT_MODEL: 'claude-sonnet-4-5-thinking',
        ENABLE_EXPERIMENTAL_MCP_CLI: 'true',
    },
};

// Gemini preset configuration
export const GEMINI_PRESET: ClaudeCliSettings = {
    env: {
        ANTHROPIC_AUTH_TOKEN: 'test',
        ANTHROPIC_BASE_URL: 'http://localhost:8080',
        ANTHROPIC_MODEL: 'gemini-3-pro-high[1m]',
        ANTHROPIC_DEFAULT_OPUS_MODEL: 'gemini-3-pro-high[1m]',
        ANTHROPIC_DEFAULT_SONNET_MODEL: 'gemini-3-flash[1m]',
        ANTHROPIC_DEFAULT_HAIKU_MODEL: 'gemini-2.5-flash-lite[1m]',
        CLAUDE_CODE_SUBAGENT_MODEL: 'gemini-3-flash[1m]',
        ENABLE_EXPERIMENTAL_MCP_CLI: 'true',
    },
};

/**
 * Get the path to Claude CLI settings file
 */
export async function getSettingsPath(): Promise<string> {
    const home = await homeDir();
    return await join(home, CLAUDE_DIR, SETTINGS_FILE);
}

/**
 * Get the path to .claude directory
 */
export async function getClaudeDir(): Promise<string> {
    const home = await homeDir();
    return await join(home, CLAUDE_DIR);
}

/**
 * Check if Claude CLI settings file exists
 */
export async function settingsFileExists(): Promise<boolean> {
    try {
        const path = await getSettingsPath();
        return await exists(path);
    } catch {
        return false;
    }
}

/**
 * Read current Claude CLI settings
 */
export async function readSettings(): Promise<ClaudeCliSettings | null> {
    try {
        const path = await getSettingsPath();
        const content = await readTextFile(path);
        return JSON.parse(content) as ClaudeCliSettings;
    } catch {
        return null;
    }
}

/**
 * Write Claude CLI settings
 */
export async function writeSettings(settings: ClaudeCliSettings): Promise<boolean> {
    try {
        const claudeDir = await getClaudeDir();
        const settingsPath = await getSettingsPath();

        // Create .claude directory if it doesn't exist
        const dirExists = await exists(claudeDir);
        if (!dirExists) {
            await mkdir(claudeDir, { recursive: true });
        }

        const content = JSON.stringify(settings, null, 2);
        await writeTextFile(settingsPath, content);
        return true;
    } catch {
        return false;
    }
}

/**
 * Apply a preset configuration
 */
export async function applyPreset(preset: 'claude' | 'gemini'): Promise<boolean> {
    const settings = preset === 'claude' ? CLAUDE_PRESET : GEMINI_PRESET;
    return await writeSettings(settings);
}

/**
 * Check if setup is needed (first run check only)
 */
export async function isSetupNeeded(): Promise<boolean> {
    try {
        const { loadSettings } = await import('./appStorageService');
        const settings = await loadSettings();
        return !settings.setupCompleted;
    } catch {
        return true; // If error, assume setup needed
    }
}

/**
 * Get current configuration status
 */
export async function getConfigStatus(): Promise<'configured' | 'not_configured'> {
    const fileExists = await settingsFileExists();
    return fileExists ? 'configured' : 'not_configured';
}

/**
 * Detect which preset is currently configured (if any)
 */
export async function detectCurrentPreset(): Promise<'claude' | 'gemini' | 'custom' | null> {
    const settings = await readSettings();
    if (!settings?.env) return null;

    const model = settings.env.ANTHROPIC_MODEL?.toLowerCase() || '';

    if (model.includes('claude') || model.includes('opus') || model.includes('sonnet')) {
        return 'claude';
    } else if (model.includes('gemini')) {
        return 'gemini';
    }

    return 'custom';
}

/**
 * Get the path to Claude CLI onboarding config file (~/.claude.json)
 * This is separate from settings.json - it's ~/.claude.json (not ~/.claude/settings.json)
 */
export async function getOnboardingPath(): Promise<string> {
    const home = await homeDir();
    return await join(home, '.claude.json');
}

/**
 * Set Claude CLI onboarding as completed
 * Writes hasCompletedOnboarding: true to ~/.claude.json
 * This skips the "select a login method" prompt in Claude CLI
 * Uses Tauri FS API directly - no proxy required
 */
export async function setOnboardingComplete(): Promise<boolean> {
    try {
        const onboardingPath = await getOnboardingPath();
        let currentConfig: Record<string, unknown> = {};

        // Read existing config if present
        try {
            const pathExists = await exists(onboardingPath);
            if (pathExists) {
                const content = await readTextFile(onboardingPath);
                if (content.trim()) {
                    currentConfig = JSON.parse(content);
                }
            }
        } catch {
            // Ignore read errors, start with empty config
        }

        // Add hasCompletedOnboarding flag
        currentConfig.hasCompletedOnboarding = true;

        // Write back to file
        await writeTextFile(onboardingPath, JSON.stringify(currentConfig, null, 2));
        return true;
    } catch (e) {
        console.error('[ClaudeCliService] Failed to write onboarding config:', e);
        return false;
    }
}
