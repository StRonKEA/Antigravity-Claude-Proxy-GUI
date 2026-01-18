// Account Types
export interface Account {
    email: string;
    status: 'active' | 'inactive' | 'rate_limited' | 'error' | 'ok'; // Added 'ok'
    error?: string | null;
    tier?: 'free' | 'pro' | 'ultra'; // Optional because it's inside subscription now
    enabled: boolean;
    lastUsed?: string | null;
    source?: 'oauth' | 'database';
    quotaPercent?: number;
    quotas?: ModelQuota[];

    // API specific fields
    subscription?: {
        tier: 'free' | 'pro' | 'ultra';
        projectId?: string;
        detectedAt?: number;
    };
    limits?: Record<string, {
        remaining: string;
        remainingFraction: number;
        resetTime: string;
    }>;
    // Model-specific rate limits with countdown info
    modelRateLimits?: Record<string, {
        isRateLimited: boolean;
        resetTime: number;
        actualResetMs?: number;
    }>;

}

export interface AccountLimitData {
    timestamp: string;
    totalAccounts: number;
    models: string[];
    modelConfig: Record<string, { hidden?: boolean; pinned?: boolean; mapping?: string }>;
    accounts: Account[];
    // Optional if includeHistory=true
    history?: Record<string, UsageDataPoint>;
}

// Model Types
export interface ModelQuota {
    modelId: string;
    modelName: string;
    provider: 'claude' | 'gemini';
    used: number;
    total: number;
    percentage: number;
    resetAt?: string;
}

// Proxy Types
export interface ProxyStatus {
    running: boolean;
    port: number;
    uptime?: number;
    latencyMs?: number;
    timestamp?: string;
    counts?: {
        total: number;
        available: number;
        rateLimited: number;
        invalid: number;
    };
}

// Log Types
export type LogLevel = 'info' | 'success' | 'warn' | 'warning' | 'error' | 'debug';

export interface LogEntry {
    id: string;
    timestamp: string;
    level: LogLevel;
    message: string;
    details?: string;
    requestType?: string;
    model?: string;
}

// Usage Types
export interface UsageDataPoint {
    _total: number;
    _tokens?: {
        input: number;
        output: number;
    };
    claude?: Record<string, number> & { _subtotal: number };
    gemini?: Record<string, number> & { _subtotal: number };
}

export interface UsageStats {
    [timestamp: string]: UsageDataPoint;
}

// Settings Types
export interface AppConfig {
    proxy: {
        port: number;
        autoStart: boolean;
        autoStartProxy: boolean;
        minimizeToTray: boolean;
        startMinimized: boolean;
        fallbackEnabled: boolean;
    };
    app: {
        language: 'en' | 'tr';
        checkUpdates: boolean;
        pollingInterval: number;  // seconds (10-300)
        logBufferSize: number;    // max log entries (500-5000)
    };
    advanced: {
        debugMode: boolean;
        requestTimeout: number;
        maxRetries: number;
        logLevel: LogLevel;
    };
    claudeCli: {
        configured: boolean;
        path?: string;
    };
}

// UI Types
export interface NavItem {
    id: string;
    label: string;
    icon: string;
    path: string;
}

// Claude CLI Config Types
export interface ClaudeConfigEnv {
    ANTHROPIC_BASE_URL?: string;
    ANTHROPIC_AUTH_TOKEN?: string;
    ANTHROPIC_MODEL?: string;
    CLAUDE_CODE_SUBAGENT_MODEL?: string;
    ANTHROPIC_DEFAULT_OPUS_MODEL?: string;
    ANTHROPIC_DEFAULT_SONNET_MODEL?: string;
    ANTHROPIC_DEFAULT_HAIKU_MODEL?: string;
    ENABLE_EXPERIMENTAL_MCP_CLI?: string;
    GEMINI_1M_CONTEXT?: string;
}

export interface ClaudeConfig {
    env: ClaudeConfigEnv;
    [key: string]: unknown;
}

export interface ClaudeConfigResponse {
    status: string;
    config: ClaudeConfig;
    path: string;
}

export interface Preset {
    name: string;
    config: ClaudeConfigEnv;
}

export interface PresetsResponse {
    status: string;
    presets: Preset[];
}
