import claudeIcon from '../assets/claude-color.svg';
import geminiIcon from '../assets/gemini-color.svg';

interface ModelIconProps {
    modelId: string;
    size?: number;
    className?: string;
}

/**
 * Get model icon/emoji for text contexts
 */
export function getModelIconEmoji(modelId: string): string {
    const lower = modelId.toLowerCase();
    if (lower.includes('claude') || lower.includes('opus') || lower.includes('sonnet') || lower.includes('haiku')) {
        return '🟣';
    }
    if (lower.includes('gemini')) {
        return '🔵';
    }
    return '⚪';
}

/**
 * Model Icon Component - renders SVG icon
 */
export function ModelIcon({ modelId, size = 16, className = '' }: ModelIconProps) {
    const lower = modelId.toLowerCase();
    const isClaude = lower.includes('claude') || lower.includes('opus') || lower.includes('sonnet') || lower.includes('haiku');
    const isGemini = lower.includes('gemini');

    if (isClaude) {
        return <img src={claudeIcon} alt="Claude" width={size} height={size} className={className} />;
    }
    if (isGemini) {
        return <img src={geminiIcon} alt="Gemini" width={size} height={size} className={className} />;
    }
    return <span className={className} style={{ fontSize: size }}>⚪</span>;
}

export default ModelIcon;
