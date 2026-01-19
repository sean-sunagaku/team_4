/**
 * 文字種ベースの言語検出サービス（ライブラリ不要）
 * ASRの最初の確定結果から言語を検出し、必要に応じて再接続を行う
 */

export type SupportedLanguage = 'ja' | 'en' | 'zh' | 'ko' | 'ru' | 'ar';

// 対応言語マッピング
export const SUPPORTED_LANGUAGES: Record<SupportedLanguage, {
  name: string;
  code: SupportedLanguage;
  ttsLang: string;
}> = {
  ja: { name: 'Japanese', code: 'ja', ttsLang: 'ja-JP' },
  en: { name: 'English', code: 'en', ttsLang: 'en-US' },
  zh: { name: 'Chinese', code: 'zh', ttsLang: 'zh-CN' },
  ko: { name: 'Korean', code: 'ko', ttsLang: 'ko-KR' },
  ru: { name: 'Russian', code: 'ru', ttsLang: 'ru-RU' },
  ar: { name: 'Arabic', code: 'ar', ttsLang: 'ar-SA' },
};

/**
 * 文字種ベースの言語検出
 * @param text 検出対象のテキスト
 * @returns 検出された言語コード（デフォルト: 'ja'）
 */
export function detectLanguage(text: string): SupportedLanguage {
  if (!text || text.trim().length === 0) return 'ja'; // デフォルト日本語

  // 空白と句読点を除いた文字をカウント
  const cleanText = text.replace(/[\s\p{P}]/gu, '');
  if (cleanText.length === 0) return 'ja';

  // 文字種をカウント
  const hiragana = (cleanText.match(/[\u3040-\u309F]/g) || []).length;
  const katakana = (cleanText.match(/[\u30A0-\u30FF]/g) || []).length;
  const kanji = (cleanText.match(/[\u4E00-\u9FAF]/g) || []).length;
  const hangul = (cleanText.match(/[\uAC00-\uD7AF\u1100-\u11FF]/g) || []).length;
  const latin = (cleanText.match(/[a-zA-Z]/g) || []).length;
  const cyrillic = (cleanText.match(/[\u0400-\u04FF]/g) || []).length;
  const arabic = (cleanText.match(/[\u0600-\u06FF]/g) || []).length;

  // 日本語: ひらがな/カタカナが含まれる
  if (hiragana > 0 || katakana > 0) {
    return 'ja';
  }

  // 韓国語: ハングルが含まれる
  if (hangul > 0) {
    return 'ko';
  }

  // 中国語: 漢字のみ（日本語のひらがな/カタカナなし）
  if (kanji > 0 && hiragana === 0 && katakana === 0) {
    return 'zh';
  }

  // ロシア語: キリル文字が多い
  if (cyrillic > latin) {
    return 'ru';
  }

  // アラビア語: アラビア文字が含まれる
  if (arabic > 0) {
    return 'ar';
  }

  // 英語/その他ラテン文字
  if (latin > 0) {
    return 'en';
  }

  return 'ja'; // デフォルト
}

/**
 * 言語コードからTTS言語コードを取得
 * @param langCode 言語コード
 * @returns TTS用言語コード
 */
export function getTtsLanguage(langCode: SupportedLanguage): string {
  return SUPPORTED_LANGUAGES[langCode]?.ttsLang || 'ja-JP';
}

/**
 * 言語検出の確信度チェック（早期言語検出用）
 * 文字種が明確な場合のみtrueを返す
 * @param text 検出対象のテキスト
 * @param lang 検出された言語
 * @returns 検出が確実かどうか
 */
export function isLanguageConfident(text: string, lang: SupportedLanguage): boolean {
  // 日本語: ひらがな/カタカナが1文字以上
  if (lang === 'ja') return /[\u3040-\u309F\u30A0-\u30FF]/.test(text);
  // 英語: 3文字以上のラテン文字
  if (lang === 'en') return (text.match(/[a-zA-Z]/g) || []).length >= 3;
  // 中国語: 漢字が2文字以上（ひらがな/カタカナなし）
  if (lang === 'zh') {
    const hasKana = /[\u3040-\u309F\u30A0-\u30FF]/.test(text);
    return !hasKana && (text.match(/[\u4E00-\u9FAF]/g) || []).length >= 2;
  }
  // 韓国語: ハングルが1文字以上
  if (lang === 'ko') return /[\uAC00-\uD7AF\u1100-\u11FF]/.test(text);
  // ロシア語: キリル文字が2文字以上
  if (lang === 'ru') return (text.match(/[\u0400-\u04FF]/g) || []).length >= 2;
  // アラビア語: アラビア文字が1文字以上
  if (lang === 'ar') return /[\u0600-\u06FF]/.test(text);
  return false;
}
