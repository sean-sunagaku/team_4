export type VoiceState = 'idle' | 'listening' | 'recording' | 'processing' | 'speaking'

export type SupportedLanguage = 'ja' | 'en' | 'zh'

export const LANGUAGE_LABELS: Record<SupportedLanguage, string> = {
  ja: '日本語',
  en: 'English',
  zh: '中文',
}

// 国旗絵文字
export const LANGUAGE_FLAGS: Record<SupportedLanguage, string> = {
  ja: '🇯🇵',
  en: '🇺🇸',
  zh: '🇨🇳',
}
