# Alibaba Cloud DashScope 活用ガイド

本ドキュメントでは、AI Voice Navigation Systemで活用しているAlibaba Cloud DashScopeサービスの詳細な使い方を解説します。

---

## 目次

1. [DashScope概要](#1-dashscope概要)
2. [セットアップ](#2-セットアップ)
3. [Qwen ASR (音声認識)](#3-qwen-asr-音声認識)
4. [Qwen LLM (言語モデル)](#4-qwen-llm-言語モデル)
5. [Qwen TTS (音声合成)](#5-qwen-tts-音声合成)
6. [Embedding API](#6-embedding-api)
7. [ベストプラクティス](#7-ベストプラクティス)
8. [トラブルシューティング](#8-トラブルシューティング)

---

## 1. DashScope概要

### 1.1 DashScopeとは

DashScopeは、Alibaba Cloudが提供するAIモデルサービスプラットフォームです。本プロジェクトでは以下のサービスを活用しています：

| サービス | モデル | 用途 | 特徴 |
|---------|--------|------|------|
| **Qwen ASR** | qwen3-asr-flash | 音声認識 | 高速・高精度の日本語対応 |
| **Qwen LLM** | qwen-turbo | 対話生成 | 低レイテンシ・ストリーミング対応 |
| **Qwen TTS** | qwen3-tts-flash | 音声合成 | 自然な日本語音声 |
| **Embedding** | text-embedding-v4 | ベクトル化 | 1024次元・多言語対応 |

### 1.2 リージョン

| リージョン | エンドポイント | 用途 |
|-----------|---------------|------|
| 国際版 (intl) | `dashscope-intl.aliyuncs.com` | 日本・海外利用向け |
| 中国版 (cn) | `dashscope.aliyuncs.com` | 中国国内利用向け |

### 1.3 アーキテクチャ概要

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          本プロジェクトのDashScope活用                        │
│                                                                              │
│   ┌──────────────────────────────────────────────────────────────────────┐  │
│   │                         音声チャットパイプライン                        │  │
│   │                                                                       │  │
│   │   音声入力 ──▶ [Qwen ASR] ──▶ テキスト ──▶ [Qwen LLM] ──▶ 応答生成   │  │
│   │                   Flash         │             Turbo                   │  │
│   │                                 │                │                    │  │
│   │                                 ▼                ▼                    │  │
│   │                          [Embedding]       [Qwen TTS]                │  │
│   │                          text-embedding-v4  Flash                    │  │
│   │                                 │                │                    │  │
│   │                                 ▼                ▼                    │  │
│   │                            RAG検索          音声出力                  │  │
│   │                                                                       │  │
│   └──────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. セットアップ

### 2.1 APIキーの取得

1. [Alibaba Cloud Console](https://www.alibabacloud.com/) にアクセス
2. DashScopeサービスを有効化
3. APIキーを発行

### 2.2 環境変数の設定

```bash
# .env ファイル
DASHSCOPE_API_KEY=sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
DASHSCOPE_REGION=intl  # "intl" または "cn"

# モデル選定
QWEN_LLM_MODEL=qwen-turbo        # 低遅延向け
QWEN_ASR_MODEL=qwen3-asr-flash   # 高速音声認識
QWEN_TTS_MODEL=qwen3-tts-flash   # 高速音声合成
QWEN_TTS_VOICE=Cherry            # 音声タイプ
```

### 2.3 設定ファイル

**`server/src/config/qwen.config.ts`:**

```typescript
import { env } from '../env';

// リージョン別エンドポイント
const ENDPOINTS = {
  cn: {
    http: 'https://dashscope.aliyuncs.com',
    ws: 'wss://dashscope.aliyuncs.com',
    compatible: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  },
  intl: {
    http: 'https://dashscope-intl.aliyuncs.com',
    ws: 'wss://dashscope-intl.aliyuncs.com',
    compatible: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',
  },
};

export const qwenConfig = {
  region: env.DASHSCOPE_REGION || 'intl',
  apiKey: env.DASHSCOPE_API_KEY,

  // エンドポイント
  get endpoints() {
    return ENDPOINTS[this.region];
  },

  // ASR設定
  asr: {
    model: env.QWEN_ASR_MODEL || 'qwen3-asr-flash',
  },

  // LLM設定
  llm: {
    model: env.QWEN_LLM_MODEL || 'qwen-turbo',
    maxTokens: 512,
    temperature: 0.7,
  },

  // TTS設定
  tts: {
    model: env.QWEN_TTS_MODEL || 'qwen3-tts-flash',
    voice: env.QWEN_TTS_VOICE || 'Cherry',
    languageType: 'Japanese',
  },

  // Embedding設定
  embedding: {
    model: 'text-embedding-v4',
    dimension: 1024,
  },
};
```

---

## 3. Qwen ASR (音声認識)

### 3.1 概要

Qwen ASRは、音声データをテキストに変換するサービスです。本プロジェクトでは高速版の`qwen3-asr-flash`を使用し、低遅延を実現しています。

### 3.2 REST API 方式

**エンドポイント:**
```
POST https://dashscope-intl.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation
```

**リクエスト:**
```typescript
// server/src/services/qwen-asr-service.ts

interface ASRRequest {
  model: string;
  input: {
    audio: string;  // Base64エンコードされた音声
  };
}

export async function transcribe(audioBase64: string): Promise<string> {
  const response = await fetch(
    `${qwenConfig.endpoints.http}/api/v1/services/aigc/multimodal-generation/generation`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${qwenConfig.apiKey}`,
      },
      body: JSON.stringify({
        model: qwenConfig.asr.model,
        input: {
          audio: audioBase64,
        },
      }),
    }
  );

  const data = await response.json();
  return data.output?.text || '';
}
```

**レスポンス:**
```json
{
  "output": {
    "text": "プリウスのエンジンのかけ方を教えてください"
  },
  "usage": {
    "audio_tokens": 150
  }
}
```

### 3.3 WebSocket リアルタイム方式

常時音声入力が必要な場合は、WebSocketを使用したリアルタイムASRを利用します。

**エンドポイント:**
```
wss://dashscope-intl.aliyuncs.com/api-ws/v1/realtime?model=qwen3-asr-flash-realtime
```

**実装:**

```typescript
// server/src/services/qwen-realtime-service.ts

export class QwenRealtimeASR {
  private ws: WebSocket | null = null;

  async connect(): Promise<void> {
    const url = `${qwenConfig.endpoints.ws}/api-ws/v1/realtime?model=qwen3-asr-flash-realtime`;

    this.ws = new WebSocket(url, {
      headers: {
        'Authorization': `Bearer ${qwenConfig.apiKey}`,
      },
    });

    this.ws.onopen = () => {
      // セッション設定を送信
      this.ws.send(JSON.stringify({
        type: 'session.update',
        session: {
          input_audio_transcription: {
            language: 'ja',
          },
          turn_detection: {
            type: 'server_vad',
            threshold: 0.5,
            silence_duration_ms: 800,  // 800ms無音で終了
          },
        },
      }));
    };

    this.ws.onmessage = (event) => {
      const data = JSON.parse(event.data);

      switch (data.type) {
        case 'transcription.partial':
          // 中間結果
          console.log('Partial:', data.text);
          break;
        case 'transcription.final':
          // 最終結果
          console.log('Final:', data.text);
          break;
        case 'turn_end':
          // 発話終了
          console.log('Turn ended');
          break;
      }
    };
  }

  // 音声データを送信
  sendAudio(pcmBase64: string): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type: 'input_audio_buffer.append',
        audio: pcmBase64,
      }));
    }
  }

  disconnect(): void {
    this.ws?.close();
    this.ws = null;
  }
}
```

### 3.4 対応音声フォーマット

| フォーマット | 説明 |
|-------------|------|
| WebM/Opus | ブラウザMediaRecorder標準 |
| WAV | PCM 16bit |
| MP3 | 圧縮音声 |

---

## 4. Qwen LLM (言語モデル)

### 4.1 概要

Qwen LLMは、テキスト生成を行う大規模言語モデルです。OpenAI互換APIを提供しており、既存のOpenAI SDKをそのまま利用できます。

### 4.2 モデル選定

| モデル | 特徴 | レイテンシ | 用途 |
|--------|------|-----------|------|
| `qwen-turbo` | 高速・低コスト | ~200ms | **リアルタイム対話 (採用)** |
| `qwen-plus` | バランス型 | ~400ms | 一般用途 |
| `qwen-max` | 高精度 | ~600ms | 複雑なタスク |

### 4.3 OpenAI互換APIの使用

**エンドポイント:**
```
https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions
```

**実装:**

```typescript
// server/src/services/qwen-llm-service.ts

import OpenAI from 'openai';

// OpenAI SDKをDashScope用に設定
const openai = new OpenAI({
  apiKey: qwenConfig.apiKey,
  baseURL: qwenConfig.endpoints.compatible,
});

interface StreamCallbacks {
  onChunk?: (chunk: string) => void;
  onComplete?: (fullContent: string) => void;
}

export async function sendMessageStream(
  messages: Array<{ role: string; content: string }>,
  callbacks: StreamCallbacks = {}
): Promise<string> {
  let fullContent = '';

  const stream = await openai.chat.completions.create({
    model: qwenConfig.llm.model,
    messages: messages,
    temperature: qwenConfig.llm.temperature,
    max_tokens: qwenConfig.llm.maxTokens,
    stream: true,
  });

  for await (const chunk of stream) {
    const content = chunk.choices[0]?.delta?.content || '';
    if (content) {
      fullContent += content;
      callbacks.onChunk?.(content);
    }
  }

  callbacks.onComplete?.(fullContent);
  return fullContent;
}
```

### 4.4 プロンプト設計

```typescript
// システムプロンプトの例
const systemPrompt = `
あなたは車のAIアシスタントです。以下のルールに従って回答してください：

1. 回答は簡潔に、運転中でも理解しやすい形で
2. 安全に関わる情報は特に明確に伝える
3. 不明な場合は正直に「わかりません」と答える
4. 箇条書きよりも文章形式で回答する

現在の日時: ${new Date().toLocaleString('ja-JP')}
`;
```

### 4.5 ストリーミング処理のフロー

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        LLMストリーミング処理フロー                            │
│                                                                              │
│   リクエスト送信                                                              │
│        │                                                                     │
│        ▼                                                                     │
│   ┌────────────────────────────────────────────────────────────────────┐    │
│   │ DashScope API                                                       │    │
│   │                                                                     │    │
│   │  stream = openai.chat.completions.create({ stream: true })         │    │
│   └────────────────────────────────────────────────────────────────────┘    │
│        │                                                                     │
│        ▼                                                                     │
│   ┌────────────────────────────────────────────────────────────────────┐    │
│   │ for await (const chunk of stream)                                   │    │
│   │        │                                                            │    │
│   │        ▼                                                            │    │
│   │   chunk.choices[0].delta.content                                   │    │
│   │        │                                                            │    │
│   │        ├──▶ SSE送信 (type: "text")                                 │    │
│   │        │                                                            │    │
│   │        └──▶ 文境界検出 → TTS処理                                   │    │
│   └────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│   タイムライン:                                                               │
│   ────────────────────────────────────────────────────────────▶             │
│   │                                                                          │
│   │  ~200ms   最初のチャンク受信 (qwen-turbo)                               │
│   │     │                                                                    │
│   │     ▼                                                                    │
│   │  チャンク1 → チャンク2 → チャンク3 → ... → 完了                          │
│   │                                                                          │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 5. Qwen TTS (音声合成)

### 5.1 概要

Qwen TTSは、テキストを音声に変換するサービスです。SSE（Server-Sent Events）方式で音声URLを受け取ります。

### 5.2 音声タイプ

| 音声名 | 特徴 | 言語 |
|--------|------|------|
| **Cherry** | 女性・明瞭 | 日本語/英語 |
| Serena | 女性・落ち着いた | 英語 |
| Ethan | 男性 | 英語 |

### 5.3 API実装

**エンドポイント:**
```
POST https://dashscope-intl.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation
```

**実装:**

```typescript
// server/src/services/qwen-tts-service.ts

interface TTSResult {
  success: boolean;
  audioUrl?: string;
  error?: string;
}

export async function synthesize(text: string): Promise<TTSResult> {
  try {
    const response = await fetch(
      `${qwenConfig.endpoints.http}/api/v1/services/aigc/multimodal-generation/generation`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${qwenConfig.apiKey}`,
          'X-DashScope-SSE': 'enable',  // SSEモード有効化
        },
        body: JSON.stringify({
          model: qwenConfig.tts.model,
          input: {
            text: cleanTextForTTS(text),
            voice: qwenConfig.tts.voice,
            language_type: qwenConfig.tts.languageType,
          },
        }),
      }
    );

    // SSEレスポンスをパース
    const reader = response.body?.getReader();
    const decoder = new TextDecoder();
    let audioUrl = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value);
      const lines = chunk.split('\n');

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = JSON.parse(line.slice(6));
          if (data.output?.audio?.url) {
            audioUrl = data.output.audio.url;
          }
        }
      }
    }

    return { success: true, audioUrl };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// TTS用テキスト前処理
function cleanTextForTTS(text: string): string {
  return text
    // マークダウン記号を除去
    .replace(/#{1,6}\s+/g, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    // 絵文字を除去
    .replace(/[\u{1F600}-\u{1F6FF}]/gu, '')
    // 余分な空白を除去
    .replace(/\s+/g, ' ')
    .trim();
}
```

### 5.4 レスポンス形式

```
event: message
data: {"output":{"audio":{"url":"https://dashscope-result-bj.oss-cn-beijing.aliyuncs.com/..."}}}

event: message
data: [DONE]
```

### 5.5 TTS キュー処理

429エラー（レート制限）を回避するため、TTS処理を順次実行します：

```typescript
// server/src/index.ts

const ttsQueue: { sentence: string; index: number }[] = [];
let isProcessingTTS = false;

async function processTTSQueue(stream: SSEStreamingApi): Promise<void> {
  if (isProcessingTTS) return;
  isProcessingTTS = true;

  while (ttsQueue.length > 0) {
    const item = ttsQueue.shift()!;

    const result = await qwenTTSService.synthesize(item.sentence);

    if (result.success && result.audioUrl) {
      await stream.writeSSE({
        data: JSON.stringify({
          type: 'audio',
          url: result.audioUrl,
          index: item.index,
        }),
      });
    }

    // 次のリクエストまで100ms待機（レート制限対策）
    if (ttsQueue.length > 0) {
      await sleep(100);
    }
  }

  isProcessingTTS = false;
}
```

---

## 6. Embedding API

### 6.1 概要

Embedding APIは、テキストをベクトル（数値配列）に変換するサービスです。RAG（検索拡張生成）のベクトル検索に使用します。

### 6.2 API実装

**エンドポイント:**
```
POST https://dashscope-intl.aliyuncs.com/compatible-mode/v1/embeddings
```

**実装:**

```typescript
// server/src/rag/embedding.ts

interface EmbeddingCacheEntry {
  embedding: number[];
  timestamp: number;
}

const embeddingCache = new Map<string, EmbeddingCacheEntry>();
const CACHE_TTL = 5 * 60 * 1000;  // 5分
const MAX_CACHE_SIZE = 100;

export async function getEmbedding(text: string): Promise<number[]> {
  const cacheKey = text.trim().toLowerCase();
  const now = Date.now();

  // キャッシュ確認
  const cached = embeddingCache.get(cacheKey);
  if (cached && now - cached.timestamp < CACHE_TTL) {
    console.log('Embedding cache hit');
    return cached.embedding;
  }

  // API呼び出し
  const response = await fetch(
    `${qwenConfig.endpoints.compatible}/embeddings`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${qwenConfig.apiKey}`,
      },
      body: JSON.stringify({
        model: qwenConfig.embedding.model,
        input: text,
        dimension: qwenConfig.embedding.dimension,
      }),
    }
  );

  const data = await response.json();
  const embedding = data.data[0].embedding;

  // キャッシュ保存
  cleanExpiredCache();
  evictOldestIfNeeded();
  embeddingCache.set(cacheKey, { embedding, timestamp: now });

  return embedding;
}

// 期限切れキャッシュのクリア
function cleanExpiredCache(): void {
  const now = Date.now();
  for (const [key, value] of embeddingCache.entries()) {
    if (now - value.timestamp > CACHE_TTL) {
      embeddingCache.delete(key);
    }
  }
}

// 最大サイズ超過時に古いエントリを削除
function evictOldestIfNeeded(): void {
  if (embeddingCache.size >= MAX_CACHE_SIZE) {
    let oldest = { key: '', timestamp: Infinity };
    for (const [key, value] of embeddingCache.entries()) {
      if (value.timestamp < oldest.timestamp) {
        oldest = { key, timestamp: value.timestamp };
      }
    }
    embeddingCache.delete(oldest.key);
  }
}
```

### 6.3 レスポンス形式

```json
{
  "object": "list",
  "data": [
    {
      "object": "embedding",
      "index": 0,
      "embedding": [0.0123, -0.0456, 0.0789, ...]  // 1024次元
    }
  ],
  "model": "text-embedding-v4",
  "usage": {
    "prompt_tokens": 10,
    "total_tokens": 10
  }
}
```

---

## 7. ベストプラクティス

### 7.1 モデル選定

| ユースケース | 推奨モデル | 理由 |
|-------------|-----------|------|
| リアルタイム対話 | `qwen-turbo` | 最低レイテンシ |
| 複雑な質問 | `qwen-plus` | バランス型 |
| 高精度が必要 | `qwen-max` | 最高精度 |
| 音声認識 | `qwen3-asr-flash` | 高速処理 |
| 音声合成 | `qwen3-tts-flash` | 高速処理 |

### 7.2 レイテンシ最適化

```typescript
// 1. ストリーミングを活用
const stream = await openai.chat.completions.create({
  stream: true,  // ストリーミング有効
});

// 2. max_tokensを制限
{
  max_tokens: 512,  // 応答長を制限して高速化
}

// 3. 並列処理
const [asrResult, ragResult] = await Promise.all([
  transcribe(audio),
  searchRAG(query),
]);

// 4. キャッシュ活用
const cached = embeddingCache.get(query);
if (cached) return cached;  // API呼び出しスキップ
```

### 7.3 エラーハンドリング

```typescript
// リトライ処理
async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  delay = 1000
): Promise<T> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (i === maxRetries - 1) throw error;

      // 429エラー（レート制限）の場合は待機
      if (error.status === 429) {
        await sleep(delay * (i + 1));
      }
    }
  }
  throw new Error('Max retries exceeded');
}

// 使用例
const result = await withRetry(() => synthesize(text));
```

### 7.4 コスト最適化

| 戦略 | 効果 |
|------|------|
| Embeddingキャッシュ | 同一クエリのAPI呼び出し削減 |
| max_tokens制限 | 不要な長文生成を防止 |
| 条件付きRAG検索 | 必要時のみ検索実行 |
| Flash/Turboモデル | 低コストかつ高速 |

---

## 8. トラブルシューティング

### 8.1 よくあるエラー

| エラー | 原因 | 対策 |
|--------|------|------|
| 401 Unauthorized | APIキー無効 | DASHSCOPE_API_KEYを確認 |
| 429 Too Many Requests | レート制限 | リクエスト間隔を空ける |
| 400 Bad Request | パラメータ不正 | リクエストボディを確認 |
| Timeout | ネットワーク問題 | リージョン設定を確認 |

### 8.2 デバッグ方法

```typescript
// APIリクエストのログ出力
console.log('Request:', {
  url: endpoint,
  model: qwenConfig.llm.model,
  messages: messages.slice(-3),  // 直近3件のみ
});

// レスポンスのログ出力
console.log('Response:', {
  status: response.status,
  headers: Object.fromEntries(response.headers),
});
```

### 8.3 レート制限対策

```typescript
// TTS処理の順次実行（429エラー回避）
const TTS_DELAY_MS = 100;

while (ttsQueue.length > 0) {
  const item = ttsQueue.shift();
  await synthesize(item.text);
  await sleep(TTS_DELAY_MS);  // 次のリクエストまで待機
}
```

---

## まとめ

本プロジェクトでは、Alibaba Cloud DashScopeの以下のサービスを活用しています：

| サービス | 使用モデル | 最適化 |
|---------|-----------|--------|
| ASR | qwen3-asr-flash | 高速音声認識 |
| LLM | qwen-turbo | ストリーミング + 低レイテンシ |
| TTS | qwen3-tts-flash | キュー処理 + 順次実行 |
| Embedding | text-embedding-v4 | キャッシュ (5分TTL) |

これらの組み合わせにより、**音声入力から最初の音声出力まで500-800ms**という低遅延を実現しています。

---

## 参考リンク

- [DashScope Documentation](https://help.aliyun.com/zh/model-studio/)
- [Qwen Audio API Reference](https://help.aliyun.com/zh/model-studio/developer-reference/qwen-audio-api)
- [OpenAI Compatible API](https://help.aliyun.com/zh/model-studio/developer-reference/openai-compatible-api)
