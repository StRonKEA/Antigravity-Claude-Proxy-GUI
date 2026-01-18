/**
 * Model utility functions
 * Centralized model color and naming logic
 */

export type ModelFamily = 'claude' | 'gemini' | 'other';

/**
 * Get model family from model ID
 */
export function getModelFamily(modelId: string): ModelFamily {
    const lower = modelId.toLowerCase();
    if (lower.includes('claude') || lower.includes('opus') || lower.includes('sonnet') || lower.includes('haiku')) {
        return 'claude';
    }
    if (lower.includes('gemini')) {
        return 'gemini';
    }
    return 'other';
}

/**
 * Get Tailwind color class for model
 */
export function getModelColor(modelId: string): string {
    const family = getModelFamily(modelId);
    switch (family) {
        case 'claude':
            return 'text-purple-400';
        case 'gemini':
            return 'text-green-400';
        default:
            return 'text-blue-400';
    }
}

/**
 * Get background color class for model
 */
export function getModelBgColor(modelId: string): string {
    const family = getModelFamily(modelId);
    switch (family) {
        case 'claude':
            return 'bg-purple-500';
        case 'gemini':
            return 'bg-green-500';
        default:
            return 'bg-blue-500';
    }
}

/**
 * Get model icon/emoji
 */
export function getModelIcon(modelId: string): string {
    const family = getModelFamily(modelId);
    switch (family) {
        case 'claude':
            return '🟣';
        case 'gemini':
            return '🔵';
        default:
            return '⚪';
    }
}

/**
 * Get human-readable model name
 */
export function getModelDisplayName(modelId: string): string {
    const lower = modelId.toLowerCase();

    // Claude models with thinking
    if (lower.includes('opus-4-5-thinking') || lower.includes('opus-4.5-thinking')) return 'Claude Opus 4.5 Thinking';
    if (lower.includes('sonnet-4-5-thinking') || lower.includes('sonnet-4.5-thinking')) return 'Claude Sonnet 4.5 Thinking';

    // Claude models without thinking
    if (lower.includes('opus-4-5') || lower.includes('opus-4.5')) return 'Claude Opus 4.5';
    if (lower.includes('sonnet-4-5') || lower.includes('sonnet-4.5')) return 'Claude Sonnet 4.5';
    if (lower.includes('opus')) return 'Claude Opus';
    if (lower.includes('sonnet')) return 'Claude Sonnet';
    if (lower.includes('haiku')) return 'Claude Haiku';
    if (lower.includes('claude')) return 'Claude';

    // Gemini models
    if (lower.includes('gemini-3-pro-high')) return 'Gemini 3 Pro High';
    if (lower.includes('gemini-3-pro-low')) return 'Gemini 3 Pro Low';
    if (lower.includes('gemini-3-pro')) return 'Gemini 3 Pro';
    if (lower.includes('gemini-3-flash')) return 'Gemini 3 Flash';
    if (lower.includes('gemini-2.5-flash-lite')) return 'Gemini 2.5 Flash Lite';
    if (lower.includes('gemini-2.5-flash')) return 'Gemini 2.5 Flash';
    if (lower.includes('gemini')) return 'Gemini';

    return modelId;
}
