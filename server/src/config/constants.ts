/**
 * Application Constants
 */

// ============================================
// App Constants
// ============================================

export const APP_CONSTANTS = {
  ANONYMOUS_USER_ID: "anonymous-user",
  DEFAULT_PORT: 3001,
} as const;

// ============================================
// Cache Constants
// ============================================

export const CACHE_CONSTANTS = {
  PROMPT_CACHE_TTL: 60000, // 1 minute cache for system prompt
  RAG_CACHE_TTL: 300000, // 5 minutes cache for RAG results
  MAX_CACHE_SIZE: 100,
} as const;

// ============================================
// Timing Constants
// ============================================

export const TIMING_CONSTANTS = {
  TTS_QUEUE_DELAY: 100, // Delay between TTS calls to avoid rate limiting
  WEBSOCKET_PING_INTERVAL: 30000,
} as const;

// ============================================
// TTS Modes
// ============================================

export const TTS_MODES = {
  BROWSER: "browser",
  LOCAL: "local",
  QWEN: "qwen",
} as const;

// ============================================
// Wake Word Patterns
// ============================================

export const WAKE_WORD_PATTERNS = [
  "ドライバ",
  "どらいば",
  "drivab",
  "driver",
  "buddy",
] as const;

// ============================================
// Text Patterns
// ============================================

export const TEXT_PATTERNS = {
  SENTENCE_END: /[。！？\n]/,
  EMOJI: /[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{1F600}-\u{1F64F}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]/gu,
} as const;

// ============================================
// Video Trigger Patterns
// ============================================

export interface VideoTrigger {
  id: string;
  patterns: RegExp[];
  videoUrl: string;
  title: string;
  description: string;
}

export const VIDEO_TRIGGERS: VideoTrigger[] = [
  {
    id: "yaris_refuel",
    patterns: [
      /ヤリス.*(給油|ガソリン|燃料)/i,
      /yaris.*(refuel|gas|fuel)/i,
      /(給油|ガソリン|燃料).*ヤリス/i,
    ],
    videoUrl: "https://www.youtube.com/watch?v=9l0x4T56Lmw",
    title: "ヤリスの給油方法",
    description: "トヨタ ヤリスの給油方法を動画で確認できます。",
  },
  // 将来: 他の動画トリガーを追加可能
];

/**
 * テキストからビデオトリガーを検出
 */
export function detectVideoTrigger(text: string): VideoTrigger | null {
  for (const trigger of VIDEO_TRIGGERS) {
    for (const pattern of trigger.patterns) {
      if (pattern.test(text)) {
        return trigger;
      }
    }
  }
  return null;
}

// ============================================
// Search Keywords (re-exported from context-builder)
// ============================================

export { SEARCH_KEYWORDS } from "../services/context-builder.js";
