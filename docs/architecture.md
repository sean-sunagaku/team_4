# システムアーキテクチャ詳細

本ドキュメントでは、AI Voice Navigation Systemのアーキテクチャを詳細に解説します。

---

## 目次

1. [システム全体構成](#1-システム全体構成)
2. [フロントエンドアーキテクチャ](#2-フロントエンドアーキテクチャ)
3. [バックエンドアーキテクチャ](#3-バックエンドアーキテクチャ)
4. [データフロー](#4-データフロー)
5. [コンテナ構成](#5-コンテナ構成)
6. [データベース設計](#6-データベース設計)

---

## 1. システム全体構成

### 1.1 レイヤードアーキテクチャ

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          Presentation Layer                                  │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                     Next.js 16 + React 19                            │   │
│  │                                                                      │   │
│  │   ┌──────────────┐   ┌──────────────┐   ┌──────────────┐            │   │
│  │   │ Chat Page    │   │ Driving Page │   │ Map Page     │            │   │
│  │   │ (/)          │   │ (/driving)   │   │ (shohei_work)│            │   │
│  │   └──────────────┘   └──────────────┘   └──────────────┘            │   │
│  │                                                                      │   │
│  │   ┌─────────────────────────────────────────────────────────────┐   │   │
│  │   │                    Shared Components                         │   │   │
│  │   │  • ChatInterface  • DrivingInterface  • VideoUploader       │   │   │
│  │   │  • SpeedLimitDisplay  • UI Components (Radix)               │   │   │
│  │   └─────────────────────────────────────────────────────────────┘   │   │
│  │                                                                      │   │
│  │   ┌─────────────────────────────────────────────────────────────┐   │   │
│  │   │                    Custom Hooks                              │   │   │
│  │   │  • useFrameStreamer  • useDrivingSession                    │   │   │
│  │   └─────────────────────────────────────────────────────────────┘   │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
                                       │ HTTP/WebSocket/SSE
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           API Gateway Layer                                  │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                        Hono Framework                                │   │
│  │                                                                      │   │
│  │   ┌──────────────┐   ┌──────────────┐   ┌──────────────┐            │   │
│  │   │ REST API     │   │ WebSocket    │   │ SSE          │            │   │
│  │   │ Endpoints    │   │ Handlers     │   │ Streaming    │            │   │
│  │   └──────────────┘   └──────────────┘   └──────────────┘            │   │
│  │                                                                      │   │
│  │   ┌─────────────────────────────────────────────────────────────┐   │   │
│  │   │                  Middleware                                  │   │   │
│  │   │  • CORS  • Zod Validation  • Error Handling                 │   │   │
│  │   └─────────────────────────────────────────────────────────────┘   │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                          Business Logic Layer                                │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                         Service Layer                                │   │
│  │                                                                      │   │
│  │   ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                 │   │
│  │   │ Voice       │  │ RAG         │  │ Route       │                 │   │
│  │   │ Pipeline    │  │ Service     │  │ Service     │                 │   │
│  │   │             │  │             │  │             │                 │   │
│  │   │ • ASR       │  │ • Search    │  │ • Geocoding │                 │   │
│  │   │ • LLM       │  │ • Embed     │  │ • Places    │                 │   │
│  │   │ • TTS       │  │ • Cache     │  │ • Maps URL  │                 │   │
│  │   └─────────────┘  └─────────────┘  └─────────────┘                 │   │
│  │                                                                      │   │
│  │   ┌─────────────┐  ┌─────────────┐                                  │   │
│  │   │ Chat        │  │ AI          │                                  │   │
│  │   │ Service     │  │ Service     │                                  │   │
│  │   └─────────────┘  └─────────────┘                                  │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                          Data Access Layer                                   │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │   ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                 │   │
│  │   │ Prisma ORM  │  │ ChromaDB    │  │ In-Memory   │                 │   │
│  │   │ (PostgreSQL)│  │ (Vectors)   │  │ Cache       │                 │   │
│  │   └─────────────┘  └─────────────┘  └─────────────┘                 │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                          External Services                                   │
│  ┌───────────────┐  ┌───────────────┐  ┌───────────────┐                   │
│  │ Alibaba Cloud │  │ Google Cloud  │  │ Python        │                   │
│  │ DashScope     │  │ APIs          │  │ Container     │                   │
│  │               │  │               │  │               │                   │
│  │ • Qwen ASR    │  │ • Maps        │  │ • YOLO v8     │                   │
│  │ • Qwen LLM    │  │ • Places      │  │ • EasyOCR     │                   │
│  │ • Qwen TTS    │  │ • Geocoding   │  │ • FastAPI     │                   │
│  │ • Embedding   │  │               │  │               │                   │
│  └───────────────┘  └───────────────┘  └───────────────┘                   │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 1.2 通信プロトコル

| プロトコル | 用途 | エンドポイント |
|-----------|------|----------------|
| HTTP POST | テキストチャット、音声チャット | `/api/chat/*`, `/api/voice/chat` |
| SSE | ストリーミング応答 | `/api/chat/*/stream`, `/api/voice/chat` |
| WebSocket | リアルタイムASR | `/ws/asr` |
| WebSocket | フレーム処理 | `ws://python:9000/ws/frames` |

---

## 2. フロントエンドアーキテクチャ

### 2.1 ディレクトリ構造

```
client/
├── app/                          # Next.js App Router
│   ├── layout.tsx                # ルートレイアウト
│   ├── page.tsx                  # チャットページ (/)
│   └── driving/
│       └── page.tsx              # ドラレコページ (/driving)
│
├── components/
│   ├── chat/
│   │   └── chat-interface.tsx    # 音声チャットUI (1,803行)
│   │       ├── 状態管理
│   │       ├── 音声録音/再生
│   │       ├── SSE受信
│   │       └── UI描画
│   │
│   ├── driving/
│   │   ├── DrivingInterface.tsx  # ドラレコメインUI
│   │   ├── VideoUploader.tsx     # 動画アップロード
│   │   └── SpeedLimitDisplay.tsx # 速度表示
│   │
│   └── ui/                       # Radix UIコンポーネント
│       ├── button.tsx
│       ├── card.tsx
│       ├── scroll-area.tsx
│       └── ...
│
├── hooks/
│   ├── useFrameStreamer.ts       # フレーム送信Hook
│   │   └── canvas描画 → JPEG変換 → WebSocket送信
│   │
│   └── useDrivingSession.ts      # セッション管理Hook
│       └── WebSocket接続 → 検出結果受信 → 状態更新
│
├── lib/
│   ├── chat-api.ts               # チャットAPIクライアント
│   ├── detection-api.ts          # Python WebSocketクライアント
│   └── tts.ts                    # TTS統合ユーティリティ
│
└── package.json
```

### 2.2 状態管理フロー

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         ChatInterface Component                          │
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │                          State                                      │ │
│  │                                                                     │ │
│  │  • messages: Message[]           会話履歴                           │ │
│  │  • isRecording: boolean          録音中フラグ                        │ │
│  │  • isPlaying: boolean            再生中フラグ                        │ │
│  │  • currentTranscription: string  認識中テキスト                      │ │
│  │  • conversationId: string        会話ID                             │ │
│  │  • ttsMode: 'browser' | 'qwen'   TTS切り替え                        │ │
│  │                                                                     │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                                                                          │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐         │
│  │ useRef          │  │ useCallback     │  │ useEffect       │         │
│  │                 │  │                 │  │                 │         │
│  │ • mediaRecorder │  │ • handleRecord  │  │ • SSE接続管理   │         │
│  │ • audioQueue    │  │ • handleStop    │  │ • 音声再生管理  │         │
│  │ • audioContext  │  │ • handleSubmit  │  │ • クリーンアップ │         │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘         │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
                │
                ▼ 録音 → Base64変換 → fetch POST
┌─────────────────────────────────────────────────────────────────────────┐
│                           SSE Event Stream                               │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  { type: "transcription", text: "..." }                          │   │
│  │       ↓ 認識テキスト表示                                          │   │
│  │                                                                  │   │
│  │  { type: "text", content: "..." }                                │   │
│  │       ↓ メッセージに追加                                          │   │
│  │                                                                  │   │
│  │  { type: "audio", url: "...", index: 0 }                         │   │
│  │       ↓ audioQueueに追加 → 順番に再生                             │   │
│  │                                                                  │   │
│  │  { type: "tts_text", text: "..." }                               │   │
│  │       ↓ Browser TTSで読み上げ                                     │   │
│  │                                                                  │   │
│  │  { type: "done", content: "...", conversationId: "..." }         │   │
│  │       ↓ 完了処理                                                  │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### 2.3 ドラレコ フレーム処理フロー

```
┌─────────────────────────────────────────────────────────────────────────┐
│                      useFrameStreamer Hook                               │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  Props                                                           │   │
│  │  • videoRef: RefObject<HTMLVideoElement>                        │   │
│  │  • wsRef: RefObject<WebSocket>                                  │   │
│  │  • isPlaying: boolean                                           │   │
│  │  • frameInterval: number (default: 100ms = 10 FPS)              │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  useEffect (フレーム送信ループ)                                   │   │
│  │                                                                  │   │
│  │  if (isPlaying && wsRef.current?.readyState === WebSocket.OPEN) │   │
│  │    │                                                            │   │
│  │    ▼                                                            │   │
│  │  setInterval(() => {                                            │   │
│  │    // 1. video要素からcanvasに描画                               │   │
│  │    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);     │   │
│  │                                                                  │   │
│  │    // 2. canvasをJPEGに変換                                      │   │
│  │    canvas.toBlob((blob) => {                                    │   │
│  │      // 3. ArrayBufferに変換してWebSocket送信                    │   │
│  │      blob.arrayBuffer().then((buffer) => {                      │   │
│  │        wsRef.current.send(buffer);                              │   │
│  │      });                                                        │   │
│  │    }, 'image/jpeg', 0.8);                                       │   │
│  │  }, frameInterval);                                             │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 3. バックエンドアーキテクチャ

### 3.1 ディレクトリ構造

```
server/
├── src/
│   ├── index.ts                  # メインサーバー (1,391行)
│   │   ├── Hono アプリ初期化
│   │   ├── APIエンドポイント定義
│   │   ├── WebSocketハンドラ
│   │   └── 音声チャットパイプライン
│   │
│   ├── config/
│   │   ├── qwen.config.ts        # Alibaba Cloud設定
│   │   ├── rag.config.ts         # RAG設定
│   │   ├── route-search.config.ts
│   │   └── google.config.js      # Google Cloud設定
│   │
│   ├── services/
│   │   ├── qwen-asr-service.ts   # 音声認識サービス
│   │   ├── qwen-llm-service.ts   # LLMサービス
│   │   ├── qwen-tts-service.ts   # 音声合成サービス
│   │   ├── qwen-realtime-service.ts  # リアルタイムASR
│   │   ├── rag-service.ts        # RAGサービス
│   │   ├── chat-service.js       # 会話管理
│   │   ├── route-service.ts      # ルートサービス
│   │   └── ...
│   │
│   ├── rag/
│   │   ├── vectordb.ts           # ChromaDBクライアント
│   │   ├── embedding.ts          # Embeddingキャッシュ
│   │   ├── keyword-search.ts     # BM25検索
│   │   ├── text-splitter.ts      # テキスト分割
│   │   └── text-preprocessor.ts  # 前処理
│   │
│   ├── types/
│   │   └── route.types.ts
│   │
│   ├── mock/
│   │   └── mock-data.ts          # モックデータ
│   │
│   └── lib/
│       └── db.js                 # Prismaクライアント
│
├── prisma/
│   └── schema.prisma             # DBスキーマ
│
├── Dockerfile
└── package.json
```

### 3.2 サービス層の依存関係

```
┌─────────────────────────────────────────────────────────────────────────┐
│                            index.ts                                      │
│                         (API Endpoints)                                  │
└────────────────────────────────┬────────────────────────────────────────┘
                                 │
         ┌───────────────────────┼───────────────────────┐
         │                       │                       │
         ▼                       ▼                       ▼
┌─────────────────┐   ┌─────────────────┐   ┌─────────────────┐
│ Voice Pipeline  │   │   RAG Service   │   │  Chat Service   │
│                 │   │                 │   │                 │
│ ┌─────────────┐ │   │ ┌─────────────┐ │   │ ┌─────────────┐ │
│ │ ASR Service │ │   │ │ VectorDB    │ │   │ │ Prisma DB   │ │
│ └──────┬──────┘ │   │ │ (ChromaDB)  │ │   │ └─────────────┘ │
│        │        │   │ └─────────────┘ │   │                 │
│        ▼        │   │                 │   │                 │
│ ┌─────────────┐ │   │ ┌─────────────┐ │   │                 │
│ │ LLM Service │◀┼───┼─│ Embedding   │ │   │                 │
│ └──────┬──────┘ │   │ │ (Cache)     │ │   │                 │
│        │        │   │ └─────────────┘ │   │                 │
│        ▼        │   │                 │   │                 │
│ ┌─────────────┐ │   │ ┌─────────────┐ │   │                 │
│ │ TTS Service │ │   │ │ BM25 Search │ │   │                 │
│ └─────────────┘ │   │ └─────────────┘ │   │                 │
└─────────────────┘   └─────────────────┘   └─────────────────┘
         │                       │                       │
         └───────────────────────┼───────────────────────┘
                                 │
                                 ▼
                    ┌─────────────────────┐
                    │  Alibaba Cloud      │
                    │  DashScope API      │
                    └─────────────────────┘
```

### 3.3 音声チャット処理フロー

```typescript
// POST /api/voice/chat の処理フロー
app.post('/api/voice/chat', async (c) => {
  return streamSSE(c, async (stream) => {

    // ==========================================
    // Phase 1: ASR (音声認識)
    // ==========================================
    const transcribedText = await qwenASRService.transcribe(audioBase64);

    await stream.writeSSE({
      data: JSON.stringify({ type: "transcription", text: transcribedText })
    });

    // ==========================================
    // Phase 2: 並列処理 (RAG検索 + 履歴取得)
    // ==========================================
    const [messages, ragResults, sharedResults] = await Promise.all([
      chatService.getMessages(conversationId),
      needsRAGSearch(transcribedText)
        ? ragService.search(transcribedText)
        : Promise.resolve([]),
      ragService.searchSharedConversations(transcribedText),
      // Fire-and-Forget: ユーザーメッセージ保存
      chatService.addMessage(conversationId, "user", transcribedText),
    ]);

    // ==========================================
    // Phase 3: LLM ストリーミング生成
    // ==========================================
    const systemPrompt = buildSystemPrompt() + buildRAGContext(ragResults);
    let sentenceBuffer = "";
    let audioIndex = 0;
    let firstSentenceSent = false;
    const ttsQueue: { sentence: string; index: number }[] = [];

    await qwenLLMService.sendMessageStream(
      [{ role: "system", content: systemPrompt }, ...messages],
      {
        onChunk: async (chunk) => {
          // テキストチャンクをSSE送信
          await stream.writeSSE({
            data: JSON.stringify({ type: "text", content: chunk })
          });

          // 文の境界検出
          sentenceBuffer += chunk;
          while (SENTENCE_END_PATTERN.test(sentenceBuffer)) {
            const sentence = extractSentence(sentenceBuffer);

            // ==========================================
            // Phase 4: TTS処理
            // ==========================================
            if (!firstSentenceSent) {
              // 最初の文: 即座にTTS送信
              firstSentenceSent = true;
              await sendToTTS(sentence, audioIndex++, stream);
            } else {
              // 後続の文: キューに追加
              ttsQueue.push({ sentence, index: audioIndex++ });
              processTTSQueue(ttsQueue, stream);
            }
          }
        },
      }
    );

    // 完了通知
    await stream.writeSSE({
      data: JSON.stringify({ type: "done", conversationId })
    });
  });
});
```

---

## 4. データフロー

### 4.1 音声チャット データフロー

```
┌───────────────────────────────────────────────────────────────────────────┐
│                            Client (Browser)                                │
│                                                                            │
│  ┌──────────────┐                                                         │
│  │  MediaRecorder│                                                         │
│  │  (WebM/Opus)  │                                                         │
│  └──────┬───────┘                                                         │
│         │ 音声データ                                                        │
│         ▼                                                                  │
│  ┌──────────────┐                                                         │
│  │  Base64      │                                                         │
│  │  Encoder     │                                                         │
│  └──────┬───────┘                                                         │
│         │                                                                  │
│         ▼ POST /api/voice/chat                                            │
└─────────┼─────────────────────────────────────────────────────────────────┘
          │
          │  Request Body: { audio: "base64...", conversationId: "..." }
          ▼
┌───────────────────────────────────────────────────────────────────────────┐
│                             Server (Bun)                                   │
│                                                                            │
│  ┌──────────────────────────────────────────────────────────────────────┐ │
│  │ ASR Service                                                          │ │
│  │                                                                      │ │
│  │  base64 audio → Qwen ASR API → transcribed text                     │ │
│  │                                                                      │ │
│  │  Latency: ~300-500ms                                                 │ │
│  └───────────────────────────────┬──────────────────────────────────────┘ │
│                                  │                                        │
│                                  ▼ text                                   │
│  ┌──────────────────────────────────────────────────────────────────────┐ │
│  │ RAG Service (Conditional)                                            │ │
│  │                                                                      │ │
│  │  ┌─────────────────┐     ┌─────────────────┐                        │ │
│  │  │ Vector Search   │     │ BM25 Search     │                        │ │
│  │  │ (ChromaDB)      │     │ (Keyword)       │                        │ │
│  │  └────────┬────────┘     └────────┬────────┘                        │ │
│  │           │                       │                                  │ │
│  │           └───────────┬───────────┘                                  │ │
│  │                       ▼                                              │ │
│  │               Hybrid Ranking                                         │ │
│  │                                                                      │ │
│  │  Latency: ~100-200ms (cache hit: <5ms)                              │ │
│  └───────────────────────────────┬──────────────────────────────────────┘ │
│                                  │                                        │
│                                  ▼ context                                │
│  ┌──────────────────────────────────────────────────────────────────────┐ │
│  │ LLM Service (Streaming)                                              │ │
│  │                                                                      │ │
│  │  System Prompt + RAG Context + User Query                           │ │
│  │          ↓                                                           │ │
│  │  Qwen Turbo API (Streaming)                                         │ │
│  │          ↓                                                           │ │
│  │  Token Chunks → Sentence Detection                                  │ │
│  │                                                                      │ │
│  │  First Chunk Latency: ~200ms                                        │ │
│  └───────────────────────────────┬──────────────────────────────────────┘ │
│                                  │                                        │
│                                  ▼ sentences                              │
│  ┌──────────────────────────────────────────────────────────────────────┐ │
│  │ TTS Service (Queue-based)                                            │ │
│  │                                                                      │ │
│  │  ┌─────────────┐     ┌─────────────┐     ┌─────────────┐            │ │
│  │  │ Sentence 1  │────▶│ TTS API     │────▶│ Audio URL   │            │ │
│  │  │ (Immediate) │     │             │     │             │            │ │
│  │  └─────────────┘     └─────────────┘     └─────────────┘            │ │
│  │                           │                                          │ │
│  │                       100ms delay                                    │ │
│  │                           │                                          │ │
│  │  ┌─────────────┐         ▼                                          │ │
│  │  │ Sentence 2+ │ ──▶ TTS Queue                                      │ │
│  │  │ (Queued)    │                                                     │ │
│  │  └─────────────┘                                                     │ │
│  │                                                                      │ │
│  │  Per-Sentence Latency: ~200-400ms                                   │ │
│  └───────────────────────────────┬──────────────────────────────────────┘ │
│                                  │                                        │
└──────────────────────────────────┼────────────────────────────────────────┘
                                   │ SSE Stream
                                   ▼
┌───────────────────────────────────────────────────────────────────────────┐
│                            Client (Browser)                                │
│                                                                            │
│  ┌──────────────────────────────────────────────────────────────────────┐ │
│  │ SSE Event Handler                                                    │ │
│  │                                                                      │ │
│  │  { type: "transcription" } → 認識テキスト表示                         │ │
│  │  { type: "text" }          → メッセージ追加                           │ │
│  │  { type: "audio" }         → 音声キュー追加 → 順番に再生               │ │
│  │  { type: "done" }          → 完了処理                                │ │
│  └──────────────────────────────────────────────────────────────────────┘ │
│                                                                            │
└───────────────────────────────────────────────────────────────────────────┘
```

### 4.2 ドラレコ データフロー

```
┌───────────────────────────────────────────────────────────────────────────┐
│                            Client (Browser)                                │
│                                                                            │
│  ┌──────────────┐     ┌──────────────┐     ┌──────────────┐              │
│  │  Video File  │────▶│  <video>     │────▶│  <canvas>    │              │
│  │  Upload      │     │  Element     │     │  Capture     │              │
│  └──────────────┘     └──────────────┘     └──────┬───────┘              │
│                                                    │                      │
│                                                    ▼ 100ms (10 FPS)       │
│                                            ┌──────────────┐              │
│                                            │  JPEG Blob   │              │
│                                            │  (30-50KB)   │              │
│                                            └──────┬───────┘              │
│                                                    │                      │
│                                                    ▼                      │
│                                            ┌──────────────┐              │
│                                            │  WebSocket   │              │
│                                            │  Binary Send │              │
│                                            └──────┬───────┘              │
│                                                    │                      │
└────────────────────────────────────────────────────┼──────────────────────┘
                                                     │
                                                     │ ws://python:9000/ws/frames
                                                     ▼
┌───────────────────────────────────────────────────────────────────────────┐
│                         Python Container (FastAPI)                         │
│                                                                            │
│  ┌──────────────────────────────────────────────────────────────────────┐ │
│  │ Frame Receiver                                                       │ │
│  │                                                                      │ │
│  │  Binary JPEG → cv2.imdecode → OpenCV Image                          │ │
│  └───────────────────────────────────┬──────────────────────────────────┘ │
│                                      │                                    │
│                                      ▼                                    │
│  ┌──────────────────────────────────────────────────────────────────────┐ │
│  │ Speed Sign Detector (YOLO v8n)                                       │ │
│  │                                                                      │ │
│  │  Image → Object Detection → Bounding Boxes                          │ │
│  │                                                                      │ │
│  │  Output: [{ class: "speed_sign", bbox: [x1,y1,x2,y2], conf: 0.95 }] │ │
│  └───────────────────────────────────┬──────────────────────────────────┘ │
│                                      │                                    │
│                                      ▼ Crop ROI                           │
│  ┌──────────────────────────────────────────────────────────────────────┐ │
│  │ Speed OCR (EasyOCR)                                                  │ │
│  │                                                                      │ │
│  │  Cropped Image → Text Recognition → "40", "60", etc.                │ │
│  └───────────────────────────────────┬──────────────────────────────────┘ │
│                                      │                                    │
│                                      ▼                                    │
│  ┌──────────────────────────────────────────────────────────────────────┐ │
│  │ State Manager (3-Frame Confirmation)                                 │ │
│  │                                                                      │ │
│  │  Frame 1: 40 detected → status: "detecting"                         │ │
│  │  Frame 2: 40 detected → status: "detecting"                         │ │
│  │  Frame 3: 40 detected → status: "confirmed" ✓                       │ │
│  │                                                                      │ │
│  │  Output: { status: "confirmed", speed_limit: 40 }                   │ │
│  └───────────────────────────────────┬──────────────────────────────────┘ │
│                                      │                                    │
└──────────────────────────────────────┼────────────────────────────────────┘
                                       │ WebSocket JSON
                                       ▼
┌───────────────────────────────────────────────────────────────────────────┐
│                            Client (Browser)                                │
│                                                                            │
│  ┌──────────────────────────────────────────────────────────────────────┐ │
│  │ useDrivingSession Hook                                               │ │
│  │                                                                      │ │
│  │  if (result.status === "confirmed" &&                               │ │
│  │      result.speed_limit !== lastSpeed &&                            │ │
│  │      Date.now() - lastAnnouncement > 3000) {                        │ │
│  │                                                                      │ │
│  │    speak(`制限速度 ${result.speed_limit} キロです`);                  │ │
│  │    updateDisplay(result.speed_limit);                               │ │
│  │  }                                                                   │ │
│  └──────────────────────────────────────────────────────────────────────┘ │
│                                                                            │
└───────────────────────────────────────────────────────────────────────────┘
```

---

## 5. コンテナ構成

### 5.1 Docker Compose 構成

```yaml
# docker-compose.yml
version: '3.8'

services:
  # ========================================
  # Frontend (Next.js)
  # ========================================
  client:
    build: ./client
    ports:
      - "3000:3000"
    environment:
      - NEXT_PUBLIC_API_URL=http://server:3001
    depends_on:
      - server

  # ========================================
  # Backend (Bun + Hono)
  # ========================================
  server:
    build: ./server
    ports:
      - "3001:3001"
    environment:
      - PORT=3001
      - DATABASE_URL=postgresql://postgres:postgres@postgres:5432/team4_chat
      - CHROMA_HOST=chromadb
      - CHROMA_PORT=8000
      - DASHSCOPE_API_KEY=${DASHSCOPE_API_KEY}
      - DASHSCOPE_REGION=${DASHSCOPE_REGION:-intl}
      - QWEN_LLM_MODEL=${QWEN_LLM_MODEL:-qwen-turbo}
      - QWEN_ASR_MODEL=${QWEN_ASR_MODEL:-qwen3-asr-flash}
      - QWEN_TTS_MODEL=${QWEN_TTS_MODEL:-qwen3-tts-flash}
    depends_on:
      - postgres
      - chromadb

  # ========================================
  # Python ML Container (FastAPI)
  # ========================================
  python-container:
    build: ./python-container
    ports:
      - "9000:9000"
    volumes:
      - ./python-container/yolov8n.pt:/app/yolov8n.pt

  # ========================================
  # PostgreSQL Database
  # ========================================
  postgres:
    image: postgres:15-alpine
    ports:
      - "5435:5432"
    environment:
      - POSTGRES_USER=postgres
      - POSTGRES_PASSWORD=postgres
      - POSTGRES_DB=team4_chat
    volumes:
      - postgres_data:/var/lib/postgresql/data

  # ========================================
  # ChromaDB (Vector Database)
  # ========================================
  chromadb:
    image: chromadb/chroma:latest
    ports:
      - "8100:8000"
    volumes:
      - chroma_data:/chroma/chroma

volumes:
  postgres_data:
  chroma_data:
```

### 5.2 コンテナ間通信

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         Docker Network (bridge)                          │
│                                                                          │
│  ┌────────────┐                              ┌────────────┐             │
│  │   client   │──────── :3000 ────────────▶  │  Browser   │             │
│  │  (Next.js) │                              │  (User)    │             │
│  └─────┬──────┘                              └────────────┘             │
│        │                                                                 │
│        │ http://server:3001                                             │
│        ▼                                                                 │
│  ┌────────────┐                                                         │
│  │   server   │──────── :3001 ───────────────────────────────────────▶  │
│  │ (Bun/Hono) │                                                         │
│  └─────┬──────┘                                                         │
│        │                                                                 │
│   ┌────┴────────────────────┬────────────────────┐                      │
│   │                         │                    │                      │
│   ▼                         ▼                    ▼                      │
│  ┌────────────┐      ┌────────────┐       ┌────────────┐               │
│  │  postgres  │      │  chromadb  │       │   python-  │               │
│  │  :5432     │      │  :8000     │       │  container │               │
│  └────────────┘      └────────────┘       │  :9000     │               │
│                                           └────────────┘               │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 6. データベース設計

### 6.1 Prisma Schema

```prisma
// prisma/schema.prisma

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// ========================================
// 会話モデル
// ========================================
model Conversation {
  id        String    @id @default(cuid())
  title     String?
  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt
  messages  Message[]
}

// ========================================
// メッセージモデル
// ========================================
model Message {
  id             String       @id @default(cuid())
  conversationId String
  role           String       // "user" | "assistant" | "system"
  content        String
  createdAt      DateTime     @default(now())
  conversation   Conversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)

  @@index([conversationId])
}
```

### 6.2 ChromaDB コレクション

```typescript
// RAG用ベクトルデータベース構造

// コレクション: car_manual
{
  name: "car_manual",
  metadata: {
    description: "車両マニュアルドキュメント"
  },
  documents: [
    {
      id: "doc_001",
      content: "プリウスのエンジンをかけるには...",
      embedding: [0.12, 0.45, ...],  // 1024次元
      metadata: {
        source: "prius_manual.md",
        section: "starting_engine",
        chunk_index: 0
      }
    },
    // ...
  ]
}

// コレクション: shared_conversations
{
  name: "shared_conversations",
  metadata: {
    description: "過去の会話から学習したQA"
  },
  documents: [
    {
      id: "qa_001",
      content: "Q: プリウスのエンジンのかけ方は?\nA: まずブレーキを...",
      embedding: [0.23, 0.67, ...],
      metadata: {
        question: "プリウスのエンジンのかけ方は?",
        answer: "まずブレーキを踏みながら...",
        created_at: "2024-01-15T10:00:00Z"
      }
    }
  ]
}
```

---

## まとめ

本システムは、以下の設計原則に基づいて構築されています：

1. **マイクロサービスアーキテクチャ** - 各機能を独立したコンテナで管理
2. **非同期・ストリーミング処理** - 低遅延のためのパイプライン設計
3. **キャッシュ多層化** - Embedding、プロンプト、類似度の各レイヤーでキャッシュ
4. **疎結合** - 各サービス間はAPI/WebSocketで接続
5. **スケーラビリティ** - コンテナベースでスケールアウト可能
