import { Command, Child } from '@tauri-apps/plugin-shell';
import { fetch } from '@tauri-apps/plugin-http';
import type { ProxyStatus, AccountLimitData, UsageStats, ClaudeConfig, ClaudeConfigResponse, Preset, PresetsResponse } from '../types';

let activeProcess: Child | null = null;

const DEFAULT_PORT = 8080;
/**
 * Start the proxy server
 * @param port - Port to run the proxy on
 * @param fallbackEnabled - If true, adds --fallback flag for model fallback on quota exhaust
 */
export async function startProxy(port: number = DEFAULT_PORT, fallbackEnabled: boolean = false): Promise<boolean> {
    try {
        if (activeProcess) await stopProxy(port);

        const args = ['start'];
        if (fallbackEnabled) args.push('--fallback');

        const isWindows = navigator.platform.toLowerCase().includes('win');
        const cmdName = isWindows ? 'start-proxy' : 'start-proxy-unix';

        const cmd = Command.create(cmdName, args, {
            env: { PORT: port.toString() }
        });

        // Capture outputs
        let stdout = '';
        let stderr = '';
        let processDied = false;

        cmd.stdout.on('data', line => {
            stdout += line + '\n';
        });

        cmd.stderr.on('data', line => {
            console.error(`[PROXY STDERR]: ${line} `);
            stderr += line + '\n';
        });

        cmd.on('error', error => {
            console.error(`[PROXY ERROR]: "${error}"`);
            processDied = true;
        });

        cmd.on('close', data => {
            if (data.code !== 0 && data.code !== null) {
                processDied = true;
            }
            handleProcessExit(data.code, data.signal);
        });

        // Spawn the process
        activeProcess = await cmd.spawn();

        // Quick check - just verify spawn worked, don't wait for health
        // The polling in Dashboard will detect when it's ready
        if (!activeProcess) {
            console.error('[ProxyService] Failed to spawn process');
            return false;
        }

        return true;
    } catch (e: any) {
        console.error('[ProxyService] Failed to start proxy:', e);
        import('../stores/toastStore').then(({ toast }) => {
            toast.error(`Start failed: ${e.message || e} `);
        });
        return false;
    }
}

// Separate function to handle close event to avoid closure issues
function handleProcessExit(_code: number | null, _signal: number | null) {
    activeProcess = null;
    // Don't show error toast - code 1 is normal for forced kills via taskkill
}

/**
 * Stop the proxy server
 */
export async function stopProxy(port: number = DEFAULT_PORT): Promise<boolean> {
    activeProcess = null;

    try {
        const isWindows = navigator.platform.toLowerCase().includes('win');

        if (isWindows) {
            const killCmd = Command.create('powershell', [
                '-Command',
                `$conn = Get-NetTCPConnection -LocalPort ${port} -ErrorAction SilentlyContinue | Select-Object -First 1; if ($conn) { taskkill /F /PID $($conn.OwningProcess) /T 2>$null }`
            ]);
            await killCmd.execute();
        } else {
            // Mac/Linux: use lsof to find PID and kill
            const killCmd = Command.create('sh', [
                '-c',
                `lsof -ti:${port} | xargs kill -9 2>/dev/null || true`
            ]);
            await killCmd.execute();
        }
        return true;
    } catch (e) {
        console.error('[ProxyService] Failed to stop proxy:', e);
        return false;
    }
}

/**
 * Get proxy health status
 */
export async function getProxyStatus(port: number = DEFAULT_PORT): Promise<ProxyStatus> {
    const url = `http://localhost:${port}/health`;
    try {
        console.debug(`Checking proxy status on ${url}...`);
        // Try Tauri fetch first
        const response = await fetch(url, {
            method: 'GET',
            connectTimeout: 2000
        });
        if (response.ok) {
            const data = await response.json();
            console.debug('Proxy health check success:', data);
            return {
                running: true,
                port,
                uptime: data.uptime,
                latencyMs: data.latencyMs,
                timestamp: data.timestamp,
                counts: data.counts
            };
        }
    } catch (e: any) {
        console.debug(`Tauri fetch failed for ${url}:`, e);
        // Fallback to native browser fetch (might work if CORS allows)
        try {
            const nativeResponse = await window.fetch(url, { method: 'GET' });
            if (nativeResponse.ok) {
                const data = await nativeResponse.json();
                return {
                    running: true,
                    port,
                    uptime: data.uptime,
                    latencyMs: data.latencyMs,
                    timestamp: data.timestamp,
                    counts: data.counts
                };
            }
        } catch (nativeErr) {
            // Silently fail - proxy not running
        }
    }

    return {
        running: false,
        port
    };
}

/**
 * Get detailed account limits
 */
export async function getAccountLimits(port: number = DEFAULT_PORT): Promise<AccountLimitData | null> {
    try {
        const response = await fetch(`http://localhost:${port}/account-limits`, {
            method: 'GET',
            connectTimeout: 2000
        });

        if (response.ok) {
            const data = await response.json() as AccountLimitData;
            console.debug('Fetched account limits:', data.accounts.length, 'accounts');
            return data;
        } else {
            console.warn('Account limits fetch failed:', response.status);
        }
    } catch (e) {
        console.error('Failed to fetch account limits:', e);
    }
    return null;
}

/**
 * Get usage history from proxy
 */
export async function getUsageHistory(port: number = DEFAULT_PORT): Promise<UsageStats | null> {
    try {
        const response = await fetch(`http://localhost:${port}/api/stats/history`, {
            method: 'GET',
            connectTimeout: 2000
        });

        if (response.ok) {
            return await response.json() as UsageStats;
        }
    } catch (e) { }
    return null;
}

/**
 * Toggle account enabled/disabled state
 */
export async function toggleAccountEnabled(email: string, enabled: boolean, port: number = DEFAULT_PORT): Promise<boolean> {
    try {
        const response = await fetch(`http://localhost:${port}/api/accounts/${encodeURIComponent(email)}/toggle`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ enabled }),
            connectTimeout: 5000
        });

        if (response.ok) {
            const data = await response.json() as { status: string };
            return data.status === 'ok';
        }
        return false;
    } catch (e) {
        console.error('[ProxyService] toggleAccountEnabled failed:', e);
        return false;
    }
}

/**
 * Refresh account token
 */
export async function refreshAccount(email: string, port: number = DEFAULT_PORT): Promise<boolean> {
    try {
        const response = await fetch(`http://localhost:${port}/api/accounts/${encodeURIComponent(email)}/refresh`, {
            method: 'POST',
            connectTimeout: 5000
        });

        if (response.ok) {
            const data = await response.json() as { status: string };
            return data.status === 'ok';
        }
        return false;
    } catch (e) {
        console.error('[ProxyService] refreshAccount failed:', e);
        return false;
    }
}

/**
 * Delete account
 */
export async function deleteAccount(email: string, port: number = DEFAULT_PORT): Promise<boolean> {
    try {
        const response = await fetch(`http://localhost:${port}/api/accounts/${encodeURIComponent(email)}`, {
            method: 'DELETE',
            connectTimeout: 5000
        });

        if (response.ok) {
            const data = await response.json() as { status: string };
            return data.status === 'ok';
        }
        return false;
    } catch (e) {
        console.error('[ProxyService] deleteAccount failed:', e);
        return false;
    }
}

/**
 * Reload accounts from disk
 */
export async function reloadAccounts(port: number = DEFAULT_PORT): Promise<boolean> {
    try {
        const response = await fetch(`http://localhost:${port}/api/accounts/reload`, {
            method: 'POST',
            connectTimeout: 5000
        });

        if (response.ok) {
            const data = await response.json() as { status: string };
            return data.status === 'ok';
        }
        return false;
    } catch (e) {
        console.error('[ProxyService] reloadAccounts failed:', e);
        return false;
    }
}

/**
 * Refresh all tokens - clears all caches and forces token refresh
 */
export async function refreshAllTokens(port: number = DEFAULT_PORT): Promise<boolean> {
    try {
        const response = await fetch(`http://localhost:${port}/refresh-token`, {
            method: 'POST',
            connectTimeout: 10000
        });

        if (response.ok) {
            const data = await response.json() as { status: string };
            return data.status === 'ok';
        }
        return false;
    } catch (e) {
        console.error('[ProxyService] refreshAllTokens failed:', e);
        return false;
    }
}

/**
 * Get OAuth URL for adding new account
 */
export async function getOAuthUrl(port: number = DEFAULT_PORT): Promise<string | null> {
    try {
        const response = await fetch(`http://localhost:${port}/api/auth/url`, {
            method: 'GET',
            connectTimeout: 5000
        });

        if (response.ok) {
            const data = await response.json() as { status: string; url?: string };
            if (data.status === 'ok' && data.url) {
                return data.url;
            }
        }
        return null;
    } catch (e) {
        console.error('[ProxyService] getOAuthUrl failed:', e);
        return null;
    }
}

/**
 * Log entry from proxy
 */
export interface LogEntry {
    timestamp: string;
    level: 'info' | 'warn' | 'error' | 'debug' | 'success';
    message: string;
    context?: string;
}

/**
 * Get log history from proxy
 */
export async function getLogs(port: number = DEFAULT_PORT): Promise<LogEntry[]> {
    try {
        const response = await fetch(`http://localhost:${port}/api/logs`, {
            method: 'GET',
            connectTimeout: 5000
        });

        if (response.ok) {
            const data = await response.json() as { status: string; logs?: LogEntry[] };
            if (data.status === 'ok' && data.logs) {
                return data.logs;
            }
        }
    } catch (e) {
        // Silently fail if endpoint not available
    }
    return [];
}

/**
 * Subscribe to log stream via SSE (Server-Sent Events)
 * Returns an EventSource that can be closed when done
 */
export function subscribeToLogStream(
    onLog: (log: LogEntry) => void,
    port: number = DEFAULT_PORT,
    includeHistory: boolean = true
): EventSource | null {
    try {
        const url = `http://localhost:${port}/api/logs/stream${includeHistory ? '?history=true' : ''}`;
        const eventSource = new EventSource(url);

        eventSource.onmessage = (event) => {
            try {
                const log = JSON.parse(event.data) as LogEntry;
                onLog(log);
            } catch (e) {
                console.error('[ProxyService] Failed to parse log event:', e);
            }
        };

        eventSource.onerror = (error) => {
            console.error('[ProxyService] Log stream error:', error);
        };

        return eventSource;
    } catch (e) {
        console.error('[ProxyService] Failed to subscribe to log stream:', e);
        return null;
    }
}

export async function getClaudeConfig(port: number = DEFAULT_PORT): Promise<ClaudeConfigResponse | null> {
    try {
        const response = await fetch(`http://localhost:${port}/api/claude/config`, {
            method: 'GET',
            connectTimeout: 5000
        });

        if (response.ok) {
            return await response.json() as ClaudeConfigResponse;
        }
        console.warn('[ProxyService] getClaudeConfig failed:', response.status);
    } catch (e) {
        console.error('[ProxyService] getClaudeConfig error:', e);
    }
    return null;
}

/**
 * Save Claude CLI configuration
 */
export async function saveClaudeConfig(config: ClaudeConfig, port: number = DEFAULT_PORT): Promise<boolean> {
    try {
        const response = await fetch(`http://localhost:${port}/api/claude/config`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(config),
            connectTimeout: 5000
        });

        if (response.ok) {
            const data = await response.json() as { status: string };
            return data.status === 'ok';
        }
        console.warn('[ProxyService] saveClaudeConfig failed:', response.status);
    } catch (e) {
        console.error('[ProxyService] saveClaudeConfig error:', e);
    }
    return false;
}

/**
 * Restore Claude CLI configuration to defaults
 */
export async function restoreClaudeConfig(port: number = DEFAULT_PORT): Promise<boolean> {
    try {
        const response = await fetch(`http://localhost:${port}/api/claude/config/restore`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            connectTimeout: 5000
        });

        if (response.ok) {
            const data = await response.json() as { status: string };
            return data.status === 'ok';
        }
        console.warn('[ProxyService] restoreClaudeConfig failed:', response.status);
    } catch (e) {
        console.error('[ProxyService] restoreClaudeConfig error:', e);
    }
    return false;
}

/**
 * Set Claude CLI onboarding as complete
 * Writes hasCompletedOnboarding: true to ~/.claude.json to skip login method selection
 */
export async function setClaudeOnboardingComplete(port: number = DEFAULT_PORT): Promise<boolean> {
    try {
        const response = await fetch(`http://localhost:${port}/api/claude/onboarding`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            connectTimeout: 5000
        });

        if (response.ok) {
            const data = await response.json() as { status: string };
            return data.status === 'ok';
        }
        console.warn('[ProxyService] setClaudeOnboardingComplete failed:', response.status);
    } catch (e) {
        console.error('[ProxyService] setClaudeOnboardingComplete error:', e);
    }
    return false;
}

export async function getPresets(port: number = DEFAULT_PORT): Promise<Preset[]> {
    try {
        const response = await fetch(`http://localhost:${port}/api/claude/presets`, {
            method: 'GET',
            connectTimeout: 5000
        });

        if (response.ok) {
            const data = await response.json() as PresetsResponse;
            if (data.status === 'ok') {
                return data.presets || [];
            }
        }
    } catch (e) {
        console.error('[ProxyService] getPresets error:', e);
    }
    return [];
}

/**
 * Save a new preset
 */
export async function savePreset(name: string, config: Record<string, string>, port: number = DEFAULT_PORT): Promise<Preset[]> {
    try {
        const response = await fetch(`http://localhost:${port}/api/claude/presets`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, config }),
            connectTimeout: 5000
        });

        if (response.ok) {
            const data = await response.json() as PresetsResponse;
            if (data.status === 'ok') {
                return data.presets || [];
            }
        }
    } catch (e) {
        console.error('[ProxyService] savePreset error:', e);
    }
    return [];
}

/**
 * Delete a preset
 */
export async function deletePreset(name: string, port: number = DEFAULT_PORT): Promise<Preset[]> {
    try {
        const response = await fetch(`http://localhost:${port}/api/claude/presets/${encodeURIComponent(name)}`, {
            method: 'DELETE',
            connectTimeout: 5000
        });

        if (response.ok) {
            const data = await response.json() as PresetsResponse;
            if (data.status === 'ok') {
                return data.presets || [];
            }
        }
    } catch (e) {
        console.error('[ProxyService] deletePreset error:', e);
    }
    return [];
}

export async function getAvailableModels(port: number = DEFAULT_PORT): Promise<string[]> {
    try {
        const response = await fetch(`http://localhost:${port}/v1/models`, {
            method: 'GET',
            connectTimeout: 5000
        });

        if (response.ok) {
            const data = await response.json() as { data?: Array<{ id: string }> };
            if (data.data && Array.isArray(data.data)) {
                return data.data.map(m => m.id);
            }
        }
    } catch (e) {
        // Silently fail - proxy might not be running
    }
    return [];
}

// Model config type
export interface ModelConfig {
    hidden?: boolean;
    pinned?: boolean;
    mapping?: string;
}

/**
 * Get all model configs from proxy
 */
export async function getModelConfigs(port: number = DEFAULT_PORT): Promise<Record<string, ModelConfig>> {
    try {
        const response = await fetch(`http://localhost:${port}/api/config`, {
            method: 'GET',
            connectTimeout: 5000
        });

        if (response.ok) {
            const data = await response.json() as { status: string; config?: { modelMapping?: Record<string, ModelConfig> } };
            if (data.status === 'ok' && data.config?.modelMapping) {
                return data.config.modelMapping;
            }
        }
    } catch (e) {
        console.error('[ProxyService] Failed to get model configs:', e);
    }
    return {};
}

/**
 * Update model config (pin/hide/mapping)
 */
export async function updateModelConfig(
    modelId: string,
    config: ModelConfig,
    port: number = DEFAULT_PORT
): Promise<boolean> {
    try {
        const response = await fetch(`http://localhost:${port}/api/models/config`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ modelId, config }),
            connectTimeout: 5000
        });

        if (response.ok) {
            const data = await response.json() as { status: string };
            return data.status === 'ok';
        }
    } catch (e) {
        console.error('[ProxyService] Failed to update model config:', e);
    }
    return false;
}

export interface ServerConfig {
    debug?: boolean;
    logLevel?: 'info' | 'warn' | 'error' | 'debug';
    maxRetries?: number;
    retryBaseMs?: number;
    retryMaxMs?: number;
    persistTokenCache?: boolean;
    defaultCooldownMs?: number;
    maxWaitBeforeErrorMs?: number;
    accountSelection?: {
        strategy?: 'sticky' | 'round-robin' | 'hybrid';
    };
}

/**
 * Get server runtime config
 */
export async function getServerConfig(port: number = DEFAULT_PORT): Promise<ServerConfig | null> {
    try {
        const response = await fetch(`http://localhost:${port}/api/config`, {
            method: 'GET',
            connectTimeout: 5000
        });

        if (response.ok) {
            const data = await response.json() as { status: string; config?: ServerConfig };
            if (data.status === 'ok' && data.config) {
                return data.config;
            }
        }
    } catch (e) {
        console.error('[ProxyService] Failed to get server config:', e);
    }
    return null;
}

/**
 * Update server runtime config
 */
export async function updateServerConfig(
    config: ServerConfig,
    port: number = DEFAULT_PORT
): Promise<boolean> {
    try {
        const response = await fetch(`http://localhost:${port}/api/config`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(config),
            connectTimeout: 5000
        });

        if (response.ok) {
            const data = await response.json() as { status: string };
            return data.status === 'ok';
        }
    } catch (e) {
        console.error('[ProxyService] Failed to update server config:', e);
    }
    return false;
}
