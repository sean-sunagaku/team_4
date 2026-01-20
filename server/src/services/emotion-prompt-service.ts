/**
 * Emotion Prompt Service
 * Qwen3 ASR Flashから取得した感情情報をLLMプロンプトに注入するためのサービス
 *
 * 対応感情: neutral, happy, sad, angry, fear, disgust, surprise
 */

export type EmotionType = 'neutral' | 'happy' | 'sad' | 'angry' | 'fear' | 'disgust' | 'surprise';

/**
 * 感情タイプに応じたプロンプト指示
 * LLMがユーザーの感情に適切に対応できるようにする
 */
const EMOTION_PROMPTS: Record<EmotionType, string> = {
  neutral: '',  // 特別な指示なし
  happy: `
【ユーザーの感情: 嬉しい/楽しい】
ユーザーは良い気分です。ポジティブなトーンで会話を続けてください。`,
  sad: `
【ユーザーの感情: 悲しい/落ち込んでいる】
ユーザーは悲しんでいるようです。共感的で優しいトーンで接し、励ましの言葉を添えてください。`,
  angry: `
【ユーザーの感情: 怒っている/イライラ】
ユーザーは怒っているかイライラしているようです。落ち着いた冷静なトーンで対応し、問題解決に焦点を当ててください。`,
  fear: `
【ユーザーの感情: 不安/恐れ】
ユーザーは不安を感じているようです。安心感を与え、落ち着いたトーンで対応してください。`,
  disgust: `
【ユーザーの感情: 不快/嫌悪】
ユーザーは何かに不快感を感じているようです。理解を示し、適切に対応してください。`,
  surprise: `
【ユーザーの感情: 驚き】
ユーザーは驚いているようです。状況を説明し、理解を助けてください。`,
};

/**
 * 感情に応じたプロンプト指示を取得
 * @param emotion - ASRから取得した感情タイプ
 * @returns プロンプトに追加する感情コンテキスト（neutralの場合は空文字）
 */
export function getEmotionPrompt(emotion: string | null | undefined): string {
  if (!emotion) return '';
  return EMOTION_PROMPTS[emotion as EmotionType] || '';
}

/**
 * 感情に対応する絵文字を取得（UIでの表示用）
 * @param emotion - ASRから取得した感情タイプ
 * @returns 感情を表す絵文字
 */
export function getEmotionEmoji(emotion: string | null | undefined): string {
  if (!emotion) return '';

  const emojis: Record<string, string> = {
    neutral: '',
    happy: '😊',
    sad: '😢',
    angry: '😠',
    fear: '😨',
    disgust: '😖',
    surprise: '😮',
  };
  return emojis[emotion] || '';
}

/**
 * 感情が有効な値かどうかを確認
 * @param emotion - 確認する感情文字列
 * @returns 有効なEmotionTypeの場合true
 */
export function isValidEmotion(emotion: string | null | undefined): emotion is EmotionType {
  if (!emotion) return false;
  return ['neutral', 'happy', 'sad', 'angry', 'fear', 'disgust', 'surprise'].includes(emotion);
}

/**
 * 感情の日本語ラベルを取得
 * @param emotion - ASRから取得した感情タイプ
 * @returns 感情の日本語名
 */
export function getEmotionLabel(emotion: string | null | undefined): string {
  if (!emotion) return '';

  const labels: Record<string, string> = {
    neutral: '普通',
    happy: '嬉しい',
    sad: '悲しい',
    angry: '怒り',
    fear: '不安',
    disgust: '不快',
    surprise: '驚き',
  };
  return labels[emotion] || emotion;
}

/**
 * テキストから感情を推測（テキストベースの感情分析）
 * ASRが感情を返さない場合やneutralの場合のフォールバック
 * @param text - 分析するテキスト
 * @returns 推測された感情タイプ
 */
export function detectEmotionFromText(text: string): EmotionType {
  const lowerText = text.toLowerCase();

  // Happy: 感謝、喜び、ポジティブな表現
  const happyPatterns = [
    'ありがとう', 'ありがとうございます', 'サンキュー', 'thank',
    '嬉しい', 'うれしい', '楽しい', 'たのしい', '幸せ', 'しあわせ',
    '最高', 'さいこう', 'すごい', 'すばらしい', '素晴らしい',
    'やった', 'できた', '成功', 'うまくいった',
    '助かる', 'たすかる', '感謝', 'おかげ',
    '大好き', 'だいすき', '好き', 'すき',
    'わーい', 'やったー', 'いぇい', 'よっしゃ',
    '！', '!',  // 感嘆符が多いと感情的
  ];

  // Sad: 悲しみ、落ち込み
  const sadPatterns = [
    '悲しい', 'かなしい', '寂しい', 'さみしい', 'つらい', '辛い',
    '疲れた', 'つかれた', 'しんどい', 'だるい',
    '落ち込', 'がっかり', '残念', 'ざんねん',
    '泣き', 'なき', '涙', 'なみだ',
    '失敗', 'しっぱい', 'できなかった', 'だめ', 'ダメ',
    'ごめん', 'すみません', '申し訳',
  ];

  // Angry: 怒り、イライラ
  const angryPatterns = [
    '怒', 'おこ', 'むかつく', 'イライラ', 'いらいら',
    'ふざけ', 'なんで', 'なぜ', 'どうして',
    '最悪', 'さいあく', 'ひどい', 'ひどすぎ',
    'うざい', 'うるさい', 'やめて', 'やめろ',
    'ばか', 'バカ', 'アホ', 'あほ',
  ];

  // Fear: 不安、恐れ
  const fearPatterns = [
    '怖い', 'こわい', '恐', '不安', 'ふあん',
    '心配', 'しんぱい', '大丈夫', 'だいじょうぶ',
    'やばい', 'ヤバい', 'まずい',
    '緊張', 'きんちょう', 'どきどき', 'ドキドキ',
  ];

  // Surprise: 驚き
  const surprisePatterns = [
    '驚', 'おどろ', 'びっくり', 'ビックリ',
    'えっ', 'え？', 'えー', 'まじ', 'マジ', 'ほんと', '本当',
    'すごっ', 'やばっ', 'うそ', 'ウソ', '嘘',
    '信じられない', 'しんじられない',
  ];

  // パターンマッチングでスコアを計算
  const countMatches = (patterns: string[]): number => {
    return patterns.filter(p => lowerText.includes(p.toLowerCase())).length;
  };

  const scores = {
    happy: countMatches(happyPatterns),
    sad: countMatches(sadPatterns),
    angry: countMatches(angryPatterns),
    fear: countMatches(fearPatterns),
    surprise: countMatches(surprisePatterns),
  };

  // 最もスコアが高い感情を返す（スコアが0ならneutral）
  const maxScore = Math.max(...Object.values(scores));
  if (maxScore === 0) return 'neutral';

  const emotions = Object.entries(scores) as [EmotionType, number][];
  const [detectedEmotion] = emotions.reduce((max, current) =>
    current[1] > max[1] ? current : max
  );

  return detectedEmotion;
}

/**
 * ASR感情とテキスト分析を組み合わせて最終的な感情を決定
 * @param asrEmotion - ASRから取得した感情（nullの場合あり）
 * @param text - ユーザーの発言テキスト
 * @returns 最終的な感情タイプ
 */
export function determineEmotion(asrEmotion: string | null | undefined, text: string): EmotionType {
  // ASRがneutral以外の感情を返した場合はそれを使用
  if (asrEmotion && asrEmotion !== 'neutral' && isValidEmotion(asrEmotion)) {
    return asrEmotion;
  }

  // ASRがneutralまたは未検出の場合、テキストから感情を推測
  const textEmotion = detectEmotionFromText(text);
  if (textEmotion !== 'neutral') {
    console.log(`Text-based emotion detected: ${textEmotion} (ASR was: ${asrEmotion || 'none'})`);
    return textEmotion;
  }

  return 'neutral';
}

/**
 * TTS用の感情設定
 * Browser TTS: pitch（0.5-2.0）とrate（0.5-2.0）を調整
 * Qwen TTS: テキストを感情豊かに変換
 */
export interface EmotionTTSConfig {
  pitch: number;      // Browser TTS: 声の高さ (1.0 = 標準)
  rate: number;       // Browser TTS: 話速 (1.0 = 標準)
  prefix?: string;    // Qwen TTS: 文頭に追加する感情表現
  suffix?: string;    // Qwen TTS: 文末に追加する感情表現
}

const EMOTION_TTS_CONFIG: Record<EmotionType, EmotionTTSConfig> = {
  neutral: { pitch: 1.0, rate: 1.0 },
  happy: {
    pitch: 1.15,   // 少し高め
    rate: 1.1,    // 少し速め
    prefix: '',   // 「わぁ！」など
  },
  sad: {
    pitch: 0.9,   // 少し低め
    rate: 0.85,   // ゆっくり
    prefix: '',
  },
  angry: {
    pitch: 1.0,   // 通常
    rate: 1.05,   // やや速め
    prefix: '',
  },
  fear: {
    pitch: 1.1,   // やや高め
    rate: 0.9,    // やや遅め
    prefix: '',
  },
  disgust: {
    pitch: 0.95,  // やや低め
    rate: 0.95,   // やや遅め
    prefix: '',
  },
  surprise: {
    pitch: 1.2,   // 高め
    rate: 1.15,   // 速め
    prefix: '',
  },
};

/**
 * 感情に応じたTTS設定を取得
 * @param emotion - 感情タイプ
 * @returns TTS設定（pitch, rate, prefix, suffix）
 */
export function getEmotionTTSConfig(emotion: string | null | undefined): EmotionTTSConfig {
  if (!emotion) return EMOTION_TTS_CONFIG.neutral;
  return EMOTION_TTS_CONFIG[emotion as EmotionType] || EMOTION_TTS_CONFIG.neutral;
}

/**
 * テキストに感情表現を追加（Qwen TTS用）
 * TTSエンジンがより感情豊かに読み上げるようにテキストを調整
 * @param text - 元のテキスト
 * @param emotion - 感情タイプ
 * @returns 感情表現が追加されたテキスト
 */
export function addEmotionToText(text: string, emotion: string | null | undefined): string {
  if (!emotion || emotion === 'neutral') return text;

  const config = getEmotionTTSConfig(emotion);
  let result = text;

  if (config.prefix) {
    result = config.prefix + result;
  }
  if (config.suffix) {
    result = result + config.suffix;
  }

  return result;
}

export const emotionPromptService = {
  getEmotionPrompt,
  getEmotionEmoji,
  isValidEmotion,
  getEmotionLabel,
  getEmotionTTSConfig,
  addEmotionToText,
  detectEmotionFromText,
  determineEmotion,
};
