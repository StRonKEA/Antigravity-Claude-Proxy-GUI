/**
 * Antigravity Desktop - i18n System
 * React hook for translations with separate locale files
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { en, tr } from './locales';

export type Language = 'en' | 'tr';

const translations = { en, tr } as const;

export type TranslationKey = keyof typeof en;

interface I18nState {
    language: Language;
    setLanguage: (lang: Language) => void;
}

export const useI18nStore = create<I18nState>()(
    persist(
        (set) => ({
            language: 'en',
            setLanguage: (language) => set({ language }),
        }),
        {
            name: 'antigravity-i18n',
        }
    )
);

/**
 * Translation hook
 * Usage: const { t, language, setLanguage } = useTranslation();
 */
export function useTranslation() {
    const { language, setLanguage } = useI18nStore();

    const t = (key: TranslationKey): string => {
        return translations[language][key] || translations.en[key] || key;
    };

    return { t, language, setLanguage };
}

export { type Language as LanguageType, type TranslationKey as TranslationKeyType };
