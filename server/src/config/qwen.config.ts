/**
 * Qwen Voice Services Configuration
 * ASR (音声認識), LLM (言語モデル), TTS (音声合成)
 */

// DashScope region: 'cn' for China, 'intl' for International
const region = process.env.DASHSCOPE_REGION || 'cn';
const baseURLs = {
  cn: 'https://dashscope.aliyuncs.com',
  intl: 'https://dashscope-intl.aliyuncs.com',
};
const baseURL = baseURLs[region as keyof typeof baseURLs] || baseURLs.cn;

export const qwenConfig = {
  // DashScope API Configuration
  dashscope: {
    apiKey: process.env.DASHSCOPE_API_KEY || '',
    baseURL: baseURL,
    openAICompatibleBaseURL: `${baseURL}/compatible-mode/v1`,
  },

  // ASR (Automatic Speech Recognition) Configuration
  asr: {
    model: process.env.QWEN_ASR_MODEL || 'qwen3-asr-flash',
    endpoint: '/api/v1/services/aigc/multimodal-generation/generation',
  },

  // LLM (Large Language Model) Configuration
  // qwen-turbo: 低レイテンシ向け高速モデル（200-400ms短縮）
  // qwen-plus: 標準モデル（品質重視）
  llm: {
    model: process.env.QWEN_LLM_MODEL || 'qwen-turbo',
    temperature: 0.7,
    maxTokens: 512, // 応答長を短縮してレイテンシ削減
  },

  // TTS (Text-to-Speech) Configuration
  tts: {
    model: process.env.QWEN_TTS_MODEL || 'qwen3-tts-flash',
    voice: process.env.QWEN_TTS_VOICE || 'Cherry',
    languageType: 'Japanese',
    endpoint: '/api/v1/services/aigc/multimodal-generation/generation',
  },
};

/**
 * Validate required configuration
 */
export function validateQwenConfig(): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!qwenConfig.dashscope.apiKey) {
    errors.push('DASHSCOPE_API_KEY is not set');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
