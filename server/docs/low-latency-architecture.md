# 低遅延アーキテクチャ設計

このドキュメントでは、Team 4 Chat Serverで実装されている音声チャットの低遅延化について説明します。

## 概要

| 項目 | 技術選定 |
|-----|---------|
| ランタイム | Bun |
| フレームワーク | Hono |
| データベース | SQLite + Prisma |
| 音声認識 (ASR) | Qwen3 ASR Flash / Realtime |
| 言語モデル (LLM) | Qwen Turbo |
| 音声合成 (TTS) | Qwen3 TTS Flash |
| ベクトルDB | ChromaDB |

---

## 1. 音声チャットパイプライン

### 全体フロー

```
音声入力 → ASR → LLM → TTS → 音声出力
   │         │      │      │
   ▼         ▼      ▼      ▼
  録音    テキスト化  応答生成  音声合成
```

### 低遅延を実現する4つの最適化

1. **高速モデルの選定**
2. **ストリーミング処理**
3. **First Sentence Prefetch（最初の文の先行処理）**
4. **並列処理とFire-and-Forget**

---

## 2. 高速モデルの選定

### Qwen Voice Services

すべてのAI処理に高速版（Flash/Turbo）モデルを採用しています。

**実装箇所:** `src/config/qwen.config.ts`

```typescript
export const qwenConfig = {
  // ASR: 高速音声認識モデル
  asr: {
    model: 'qwen3-asr-flash',
  },

  // LLM: 低レイテンシ向け高速モデル
  llm: {
    model: 'qwen-turbo',      // qwen-plus比で200-400ms短縮
    maxTokens: 512,           // 応答長を制限してレイテンシ削減
  },

  // TTS: 高速音声合成モデル
  tts: {
    model: 'qwen3-tts-flash',
  },
};
```

**効果:**
- ASR: Flash版で認識速度向上
- LLM: Turbo版で200-400ms短縮、maxTokens制限で追加短縮
- TTS: Flash版で合成速度向上

---

## 3. リアルタイム音声認識（WebSocket）

### 常時音声入力モード

WebSocketを使用したリアルタイムASRにより、録音完了を待たずに音声認識を開始します。

**実装箇所:** `src/services/qwen-realtime-service.ts`

```typescript
// WebSocket接続でリアルタイム音声認識
const ASR_MODEL = 'qwen3-asr-flash-realtime';

// Server VAD（音声区間検出）設定
const sessionUpdate = {
  type: 'session.update',
  session: {
    input_audio_transcription: {
      language: 'ja',
    },
    turn_detection: {
      type: 'server_vad',
      threshold: 0.5,
      silence_duration_ms: 800,
    },
  },
};
```

**処理フロー:**
```
従来方式:
録音開始 → 録音完了 → 音声送信 → ASR処理 → テキスト受信
           └──────── 待機時間 ────────┘

リアルタイム方式:
録音開始 → 音声チャンク送信 → 中間結果受信 → 最終結果受信
           └── 並行処理 ──┘   └─ 逐次受信 ─┘
```

**効果:** 録音完了を待つ時間を削減

---

## 4. ストリーミングTTSパイプライン

### 文単位の段階的音声合成

LLMの応答全体を待たずに、文が完成するたびにTTS変換を開始します。

**実装箇所:** `src/index.ts` (音声チャットエンドポイント)

```typescript
// 文の境界検出パターン
const sentenceEndPattern = /[。！？\n]/;

// LLMストリーミング中に文を検出
await qwenLLMService.sendMessageStream(aiMessages, {
  onChunk: async (chunk) => {
    sentenceBuffer += chunk;

    // 文の境界を検出
    while (sentenceEndPattern.test(sentenceBuffer)) {
      const sentence = extractSentence(sentenceBuffer);

      // 文が完成したらTTSキューに追加
      ttsQueue.push({ sentence, index: audioIndex++ });
      processTTSQueue();
    }
  },
});
```

**処理フロー:**
```
従来方式:
LLM応答完了 → TTS全文変換 → 音声再生開始
└────────── 長い待機時間 ──────────┘

ストリーミング方式:
LLM開始 → 文1完成 → TTS1開始 → 文2完成 → TTS2開始 → ...
              └─ 音声1再生 ─┘     └─ 音声2再生 ─┘
```

---

## 5. First Sentence Prefetch（最初の文の先行処理）

### TTFA（Time To First Audio）の最小化

最初の文は即座にTTS処理を開始し、後続の文はキューで順次処理します。

**実装箇所:** `src/index.ts`

```typescript
let firstSentenceSent = false;

// 文が完成したとき
if (!firstSentenceSent) {
  firstSentenceSent = true;
  // 最初の文は即座にTTS送信（キューをバイパス）
  sendToTTS(sentence, currentIndex).then(() => {
    processTTSQueue();  // 完了後にキュー処理開始
  });
} else {
  // 後続の文はキューに追加（順次処理）
  ttsQueue.push({ sentence, index: currentIndex });
  processTTSQueue();
}
```

**効果:**
- 最初の音声出力までの時間（TTFA）を最小化
- 429エラー（レート制限）を回避しつつ最速で音声開始

---

## 6. 並列処理とFire-and-Forget

### Promise.allによる同時実行

**実装箇所:** `src/index.ts`

```typescript
// 依存関係のない処理を並列実行
const [messages, searchResult] = await Promise.all([
  chatService.getMessages(id),
  shouldSearch ? searchWeb(content) : Promise.resolve({ success: false }),
  chatService.addMessage(id, "user", content),  // fire-and-forget
]);
```

### Fire-and-Forgetパターン

結果を待つ必要のない処理は完了を待たずに次へ進みます。

```typescript
// メッセージ保存（結果不要）
chatService.addMessage(convId, "user", userText).catch(console.error);

// AI応答後の処理（ストリーム完了後にバックグラウンド実行）
chatService.addMessage(convId, "assistant", aiResponse).catch(console.error);
```

---

## 7. キャッシュ戦略

### システムプロンプトキャッシュ

**実装箇所:** `src/index.ts`

```typescript
let cachedSystemPromptBase: string | null = null;
let lastPromptCacheTime = 0;
const PROMPT_CACHE_TTL = 60000; // 1分

function buildSystemPrompt(): string {
  const now = Date.now();
  if (cachedSystemPromptBase && (now - lastPromptCacheTime) < PROMPT_CACHE_TTL) {
    return cachedSystemPromptBase;  // キャッシュヒット
  }
  // キャッシュミス: 再生成
  cachedSystemPromptBase = generatePrompt();
  lastPromptCacheTime = now;
  return cachedSystemPromptBase;
}
```

### Embeddingキャッシュ（RAG用）

**実装箇所:** `src/rag/embedding.ts`

```typescript
const CACHE_TTL = 5 * 60 * 1000;  // 5分
const MAX_CACHE_SIZE = 100;

// 同一クエリはAPIを呼び出さずにキャッシュから返す
export async function getEmbedding(text: string): Promise<number[]> {
  const cacheKey = normalizeCacheKey(text);
  const cached = embeddingCache.get(cacheKey);

  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.embedding;  // キャッシュヒット
  }
  // キャッシュミス: API呼び出し
}
```

---

## 8. RAG検索の最適化

### ハイブリッド検索の並列実行

**実装箇所:** `src/services/rag-service.ts`

```typescript
// ベクトル検索とキーワード検索を並列実行
const [vectorResults, keywordResults] = await Promise.all([
  this.vectorSearch(query, fetchK),
  this.keywordSearch(query, fetchK),
]);
```

---

## 9. ランタイム最適化

### Bun + Hono

**Bun の採用:**
- 起動速度: Node.js比で4倍高速
- HTTP処理: 2-3倍高速
- TypeScript: ネイティブ実行（トランスパイル不要）
- メモリ使用量: 約30%削減

**Hono の採用:**
- バンドルサイズ: Express (~2MB) → Hono (~14KB)
- SSEストリーミング: `streamSSE` による効率的な実装
- Webstandard準拠で高速

---

## 10. 音声チャットのレイテンシ内訳

### パイプライン全体

```
音声チャット処理の流れ:

1. ASR（音声→テキスト）
   ├── 音声送信・認識      : 300-500ms
   └── クライアントへ送信   : ~10ms

2. LLM（テキスト生成）
   ├── プロンプト構築      : 0-1ms（キャッシュヒット時）
   ├── RAG検索（条件付き）  : 100-200ms
   ├── ネットワーク往復     : ~100ms
   └── 最初のチャンク受信   : ~200ms（qwen-turbo）

3. TTS（テキスト→音声）
   ├── 最初の文のTTS       : 200-400ms
   └── 音声URL取得・再生   : ~50ms

4. 総合TTFA（Time To First Audio）
   └── ASR完了から最初の音声まで: ~500-800ms
```

### 最適化なしの場合との比較

```
最適化なし:
ASR完了 → LLM全応答待ち → TTS全文変換 → 音声再生
          └─── 2-4秒 ───┘ └─ 1-2秒 ─┘
          合計: 3-6秒

最適化あり:
ASR完了 → LLM開始 → 最初の文完成 → TTS → 音声再生
          └── ~300ms ──┘ └ ~300ms ┘
          合計: ~600ms
```

---

## 11. まとめ

### 低遅延を実現する主要な戦略

| 戦略 | 実装 | 効果 |
|-----|------|------|
| 高速モデル選定 | qwen-turbo, flash系モデル | 200-400ms短縮 |
| リアルタイムASR | WebSocket + VAD | 録音待機時間削減 |
| ストリーミングTTS | 文単位の段階的合成 | 全応答待ち削減 |
| First Sentence Prefetch | 最初の文を即座にTTS | TTFA最小化 |
| 並列処理 | Promise.all | 25ms以上短縮 |
| Fire-and-Forget | 非ブロッキング保存 | 不要な待機削除 |
| キャッシュ | プロンプト、Embedding | API呼び出し削減 |

### アーキテクチャ図

```
┌─────────────────────────────────────────────────────────────┐
│                      クライアント                            │
│  ┌─────────┐    ┌─────────┐    ┌─────────┐                 │
│  │ 録音    │───▶│ WebSocket│───▶│ 音声再生 │                 │
│  └─────────┘    └────┬────┘    └────▲────┘                 │
└─────────────────────┼───────────────┼───────────────────────┘
                      │               │
                      ▼               │
┌─────────────────────────────────────────────────────────────┐
│                       サーバー                               │
│                                                             │
│  ┌──────────────┐                                          │
│  │ Realtime ASR │◀─── WebSocket (/ws/asr)                  │
│  │ (qwen3-asr-  │                                          │
│  │  flash-      │                                          │
│  │  realtime)   │                                          │
│  └──────┬───────┘                                          │
│         │ テキスト                                          │
│         ▼                                                   │
│  ┌──────────────┐    ┌──────────────┐                      │
│  │     LLM      │◀──▶│     RAG      │                      │
│  │ (qwen-turbo) │    │ (ChromaDB +  │                      │
│  │              │    │  BM25)       │                      │
│  └──────┬───────┘    └──────────────┘                      │
│         │ ストリーミング応答                                 │
│         ▼                                                   │
│  ┌──────────────┐                                          │
│  │ TTS Pipeline │                                          │
│  │ ┌──────────┐ │                                          │
│  │ │First Sent│─┼──▶ 即座にTTS（TTFA最小化）               │
│  │ └──────────┘ │                                          │
│  │ ┌──────────┐ │                                          │
│  │ │TTS Queue │─┼──▶ 順次処理（レート制限回避）             │
│  │ └──────────┘ │                                          │
│  └──────┬───────┘                                          │
│         │ 音声URL                                           │
│         ▼                                                   │
│      SSE送信 ───────────────────────────────────▶ 音声再生  │
└─────────────────────────────────────────────────────────────┘
```

これらの最適化により、ユーザーが話し終わってから最初の音声が聞こえるまでの時間を約500-800msに抑えています。
