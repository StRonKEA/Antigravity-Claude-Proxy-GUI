/**
 * Human-readable log message formatter
 * Converts technical log entries to user-friendly messages
 */

export interface HumanLogMessage {
    icon: string;
    title: string;
    description?: string;
    color: 'green' | 'blue' | 'yellow' | 'red' | 'purple' | 'gray';
}

interface FormatOptions {
    language: 'en' | 'tr';
}

const messages = {
    en: {
        // Model usage
        modelUsed: (model: string) => `Request completed using ${getModelName(model)}`,
        modelStarted: (model: string) => `New request started with ${getModelName(model)}`,

        // Success messages
        requestSuccess: (duration: number) => `Request completed successfully (${formatDuration(duration)})`,
        tokenUsage: (input: number, output: number) => `${formatNumber(input)} tokens sent, ${formatNumber(output)} tokens received`,
        streamComplete: 'Streaming response completed',

        // Rate limits
        rateLimitHit: 'Rate limit reached, waiting...',
        rateLimitWait: (seconds: number) => `Waiting ${seconds} seconds due to rate limit`,
        rateLimitReset: 'Rate limit reset, continuing...',
        allAccountsLimited: 'All accounts rate limited, retrying...',

        // Errors
        connectionError: 'Connection error: Cannot reach server',
        authError: 'Authentication failed',
        serverError: (code: number) => `Server error (Code: ${code})`,
        timeoutError: 'Request timed out',
        unknownError: 'An unexpected error occurred',

        // Account related
        accountSwitched: (email: string) => `Switched to account: ${maskEmail(email)}`,
        tokenRefreshed: 'Access token refreshed',
        accountAdded: 'New account added',
        accountRemoved: 'Account removed',

        // Server status
        serverStarted: (port: number) => `Proxy server started on port ${port}`,
        serverStopped: 'Proxy server stopped',
        serverRestart: 'Server restarting...',

        // Fallback
        fallbackActivated: (from: string, to: string) => `Fallback: ${getModelName(from)} → ${getModelName(to)}`,

        // Generic
        processing: 'Processing request...',
        retrying: (attempt: number) => `Retrying... (Attempt ${attempt})`,

        // API requests
        apiRequest: (method: string, path: string) => {
            if (path === '/health') return 'Health check';
            if (path.includes('/stats')) return 'Getting statistics';
            if (path.includes('/account-limits') || path.includes('/limits')) return 'Checking account limits';
            if (path.includes('/accounts')) return 'Getting accounts';
            if (path.includes('/config')) return 'Loading configuration';
            if (path.includes('/presets')) return 'Loading presets';
            if (path.includes('/models')) return 'Getting model list';
            if (path.includes('/logs')) return 'Getting logs';
            if (path.includes('/v1/messages/count_tokens')) return 'Token counting request';
            if (path.includes('/v1/messages')) return 'API Chat request';
            if (path.includes('/v1/complete')) return 'API Completion request';
            return `${method} ${path}`;
        },
        webUiMounted: 'Web interface ready',
        configLoaded: 'Configuration loaded',
        accountsLoaded: (count: number) => `${count} account(s) loaded`,
        accountPoolInit: (total: number, available: number) => `Account pool ready: ${available}/${total} available`,
        serverSuccess: 'Server started successfully',
    },
    tr: {
        // Model kullanımı
        modelUsed: (model: string) => `${getModelName(model)} kullanılarak istek tamamlandı`,
        modelStarted: (model: string) => `${getModelName(model)} ile yeni istek başlatıldı`,

        // Başarı mesajları
        requestSuccess: (duration: number) => `İstek başarıyla tamamlandı (${formatDuration(duration)})`,
        tokenUsage: (input: number, output: number) => `${formatNumber(input)} token gönderildi, ${formatNumber(output)} token alındı`,
        streamComplete: 'Akış yanıtı tamamlandı',

        // Rate limit
        rateLimitHit: 'Rate limite ulaşıldı, bekleniyor...',
        rateLimitWait: (seconds: number) => `Rate limit nedeniyle ${seconds} saniye bekleniyor`,
        rateLimitReset: 'Rate limit sıfırlandı, devam ediliyor...',
        allAccountsLimited: 'Tüm hesaplar rate limitli, yeniden deneniyor...',

        // Hatalar
        connectionError: 'Bağlantı hatası: Sunucuya ulaşılamıyor',
        authError: 'Kimlik doğrulama başarısız',
        serverError: (code: number) => `Sunucu hatası (Kod: ${code})`,
        timeoutError: 'İstek zaman aşımına uğradı',
        unknownError: 'Beklenmeyen bir hata oluştu',

        // Hesap ile ilgili
        accountSwitched: (email: string) => `Hesap değiştirildi: ${maskEmail(email)}`,
        tokenRefreshed: 'Erişim tokeni yenilendi',
        accountAdded: 'Yeni hesap eklendi',
        accountRemoved: 'Hesap kaldırıldı',

        // Sunucu durumu
        serverStarted: (port: number) => `Proxy sunucusu ${port} portunda başlatıldı`,
        serverStopped: 'Proxy sunucusu durduruldu',
        serverRestart: 'Sunucu yeniden başlatılıyor...',

        // Fallback
        fallbackActivated: (from: string, to: string) => `Yedek model: ${getModelName(from)} → ${getModelName(to)}`,

        // Genel
        processing: 'İstek işleniyor...',
        retrying: (attempt: number) => `Yeniden deneniyor... (Deneme ${attempt})`,

        // API istekleri
        apiRequest: (method: string, path: string) => {
            if (path === '/health') return 'Sistem durumu kontrolü';
            if (path.includes('/stats')) return 'İstatistikler alınıyor';
            if (path.includes('/account-limits') || path.includes('/limits')) return 'Hesap limitleri kontrol ediliyor';
            if (path.includes('/accounts')) return 'Hesaplar alınıyor';
            if (path.includes('/config')) return 'Yapılandırma yükleniyor';
            if (path.includes('/presets')) return 'Ön ayarlar yükleniyor';
            if (path.includes('/models')) return 'Model listesi alınıyor';
            if (path.includes('/logs')) return 'Loglar alınıyor';
            if (path.includes('/v1/messages/count_tokens')) return 'Token sayma isteği';
            if (path.includes('/v1/messages')) return 'API Sohbet isteği';
            if (path.includes('/v1/complete')) return 'API Tamamlama isteği';
            return `${method} ${path}`;
        },
        webUiMounted: 'Web arayüzü hazır',
        configLoaded: 'Yapılandırma yüklendi',
        accountsLoaded: (count: number) => `${count} hesap yüklendi`,
        accountPoolInit: (total: number, available: number) => `Hesap havuzu hazır: ${available}/${total} kullanılabilir`,
        serverSuccess: 'Sunucu başarıyla başlatıldı',
    }
};

/**
 * Get model display name
 */
function getModelName(modelId: string): string {
    const lower = modelId.toLowerCase();

    if (lower.includes('opus-4-5') || lower.includes('opus-4.5')) return 'Claude Opus 4.5';
    if (lower.includes('sonnet-4-5') || lower.includes('sonnet-4.5')) return 'Claude Sonnet 4.5';
    if (lower.includes('opus')) return 'Claude Opus';
    if (lower.includes('sonnet')) return 'Claude Sonnet';
    if (lower.includes('haiku')) return 'Claude Haiku';
    if (lower.includes('claude')) return 'Claude';

    if (lower.includes('gemini-3-pro')) return 'Gemini 3 Pro';
    if (lower.includes('gemini-3-flash')) return 'Gemini 3 Flash';
    if (lower.includes('gemini-2.5-flash')) return 'Gemini 2.5 Flash';
    if (lower.includes('gemini')) return 'Gemini';

    return modelId;
}

/**
 * Get model icon/emoji
 */
function getModelIcon(modelId: string): string {
    const lower = modelId.toLowerCase();
    if (lower.includes('claude')) return '🟣';
    if (lower.includes('gemini')) return '🔵';
    return '⚪';
}

/**
 * Format duration in human readable format
 */
function formatDuration(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    const seconds = (ms / 1000).toFixed(1);
    return `${seconds}s`;
}

/**
 * Format large numbers with separators
 */
function formatNumber(num: number): string {
    return num.toLocaleString();
}

/**
 * Mask email for privacy
 */
function maskEmail(email: string): string {
    const [name, domain] = email.split('@');
    if (!name || !domain) return email;
    const masked = name.slice(0, 2) + '***';
    return `${masked}@${domain}`;
}

/**
 * Parse log message and extract context
 */
interface ParsedLog {
    type: 'model_used' | 'rate_limit' | 'error' | 'success' | 'account' | 'server' | 'fallback' | 'api_request' | 'webui' | 'account_pool' | 'accounts_loaded' | 'server_success' | 'info';
    model?: string;
    duration?: number;
    inputTokens?: number;
    outputTokens?: number;
    errorCode?: number;
    email?: string;
    port?: number;
    waitSeconds?: number;
    attempt?: number;
    fromModel?: string;
    toModel?: string;
    method?: string;
    path?: string;
    accountCount?: number;
    totalAccounts?: number;
    availableAccounts?: number;
}

/**
 * Parse technical log message
 */
function parseLogMessage(message: string, level: string): ParsedLog {
    const lower = message.toLowerCase();

    // WebUI detection
    if (lower.includes('[webui]') || lower.includes('web ui') || lower.includes('mounted')) {
        return { type: 'webui' };
    }

    // Server success detection
    if (level === 'success' && (lower.includes('server started') || lower.includes('started successfully'))) {
        const portMatch = message.match(/port\s*[:=]?\s*(\d+)/i);
        return {
            type: 'server',
            port: portMatch ? parseInt(portMatch[1]) : 8080
        };
    }

    // AccountManager loaded detection
    const accountLoadMatch = message.match(/loaded\s+(\d+)\s+account/i);
    if (accountLoadMatch) {
        return {
            type: 'accounts_loaded',
            accountCount: parseInt(accountLoadMatch[1])
        };
    }

    // Account pool initialized detection
    const poolMatch = message.match(/(\d+)\s+total.*?(\d+)\s+available/i);
    if (poolMatch || lower.includes('account pool')) {
        return {
            type: 'account_pool',
            totalAccounts: poolMatch ? parseInt(poolMatch[1]) : undefined,
            availableAccounts: poolMatch ? parseInt(poolMatch[2]) : undefined
        };
    }

    // API request detection - multiple formats: [GET] /path, GET /path, etc.
    const apiMatch = message.match(/\[?(GET|POST|PUT|DELETE|PATCH)\]?\s+(\/[^\s]*)/i);
    if (apiMatch) {
        return {
            type: 'api_request',
            method: apiMatch[1].toUpperCase(),
            path: apiMatch[2]
        };
    }

    // Rate limit detection
    if (lower.includes('rate limit') || lower.includes('ratelimit') || lower.includes('429')) {
        const waitMatch = message.match(/(\d+)\s*(?:seconds?|s\b|saniye)/i);
        return {
            type: 'rate_limit',
            waitSeconds: waitMatch ? parseInt(waitMatch[1]) : undefined
        };
    }

    // Error detection
    if (level === 'error' || lower.includes('error') || lower.includes('failed')) {
        const codeMatch = message.match(/(?:code|status|error)\s*[:=]?\s*(\d{3})/i);
        return {
            type: 'error',
            errorCode: codeMatch ? parseInt(codeMatch[1]) : undefined
        };
    }

    // Model usage detection
    const modelPatterns = [
        /using\s+(?:model\s+)?([a-z0-9-_.]+)/i,
        /model[:\s]+([a-z0-9-_.]+)/i,
        /(claude[a-z0-9-_.]*|gemini[a-z0-9-_.]*)/i
    ];

    for (const pattern of modelPatterns) {
        const match = message.match(pattern);
        if (match) {
            return {
                type: 'model_used',
                model: match[1]
            };
        }
    }

    // Fallback detection
    if (lower.includes('fallback') || lower.includes('switching')) {
        const fromTo = message.match(/from\s+(\S+)\s+to\s+(\S+)/i);
        if (fromTo) {
            return {
                type: 'fallback',
                fromModel: fromTo[1],
                toModel: fromTo[2]
            };
        }
    }

    // Server status
    if (lower.includes('server') && (lower.includes('started') || lower.includes('listening'))) {
        const portMatch = message.match(/port\s*[:=]?\s*(\d+)/i);
        return {
            type: 'server',
            port: portMatch ? parseInt(portMatch[1]) : 8080
        };
    }

    // Account related
    if (lower.includes('account') || lower.includes('token refresh')) {
        const emailMatch = message.match(/([a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})/i);
        return {
            type: 'account',
            email: emailMatch ? emailMatch[1] : undefined
        };
    }

    // Success detection
    if (level === 'success' || lower.includes('success') || lower.includes('completed')) {
        const durationMatch = message.match(/(\d+(?:\.\d+)?)\s*(?:ms|seconds?|s\b)/i);
        return {
            type: 'success',
            duration: durationMatch ? parseFloat(durationMatch[1]) : undefined
        };
    }

    return { type: 'info' };
}

/**
 * Format a log entry to human-readable message
 */
export function formatLogMessage(
    message: string,
    level: string,
    options: FormatOptions = { language: 'en' }
): HumanLogMessage {
    const t = messages[options.language];
    const parsed = parseLogMessage(message, level);

    switch (parsed.type) {
        case 'model_used':
            return {
                icon: getModelIcon(parsed.model || ''),
                title: t.modelUsed(parsed.model || 'Unknown'),
                color: 'purple'
            };

        case 'rate_limit':
            return {
                icon: '⏳',
                title: parsed.waitSeconds
                    ? t.rateLimitWait(parsed.waitSeconds)
                    : t.rateLimitHit,
                color: 'yellow'
            };

        case 'error':
            return {
                icon: '❌',
                title: parsed.errorCode
                    ? t.serverError(parsed.errorCode)
                    : t.unknownError,
                description: message,
                color: 'red'
            };

        case 'success':
            return {
                icon: '✅',
                title: parsed.duration
                    ? t.requestSuccess(parsed.duration)
                    : t.streamComplete,
                color: 'green'
            };

        case 'fallback':
            return {
                icon: '🔄',
                title: t.fallbackActivated(
                    parsed.fromModel || 'Unknown',
                    parsed.toModel || 'Unknown'
                ),
                color: 'blue'
            };

        case 'server':
            return {
                icon: '🚀',
                title: t.serverStarted(parsed.port || 8080),
                color: 'green'
            };

        case 'account':
            return {
                icon: '👤',
                title: parsed.email
                    ? t.accountSwitched(parsed.email)
                    : t.tokenRefreshed,
                color: 'blue'
            };

        case 'api_request':
            return {
                icon: '🔄',
                title: t.apiRequest(parsed.method || 'GET', parsed.path || '/'),
                color: 'gray'
            };

        case 'webui':
            return {
                icon: '🌐',
                title: t.webUiMounted,
                color: 'green'
            };

        case 'accounts_loaded':
            return {
                icon: '👥',
                title: t.accountsLoaded(parsed.accountCount || 0),
                color: 'green'
            };

        case 'account_pool':
            return {
                icon: '✅',
                title: t.accountPoolInit(parsed.totalAccounts || 0, parsed.availableAccounts || 0),
                color: 'green'
            };

        default:
            // Return original message with level-based styling
            const iconMap: Record<string, string> = {
                info: 'ℹ️',
                debug: '🔧',
                warn: '⚠️',
                warning: '⚠️',
                error: '❌',
                success: '✅'
            };

            const colorMap: Record<string, HumanLogMessage['color']> = {
                info: 'blue',
                debug: 'gray',
                warn: 'yellow',
                warning: 'yellow',
                error: 'red',
                success: 'green'
            };

            return {
                icon: iconMap[level] || 'ℹ️',
                title: message,
                color: colorMap[level] || 'gray'
            };
    }
}
