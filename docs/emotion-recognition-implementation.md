# 音声感情認識（SER）と低遅延最適化の実装

本ドキュメントでは、DriBuddyシステムに実装された音声感情認識（Speech Emotion Recognition）と追加の低遅延最適化について解説します。

---

## 目次

1. [概要](#1-概要)
2. [音声感情認識（SER）](#2-音声感情認識ser)
3. [低遅延最適化](#3-低遅延最適化)
4. [データフロー](#4-データフロー)
5. [実装詳細](#5-実装詳細)
6. [パフォーマンス](#6-パフォーマンス)

---

## 1. 概要

### 1.1 実装目標

| 機能 | 目的 |
|------|------|
| **感情認識** | ユーザーの感情を検出し、AIの応答トーンを適応させる |
| **ASRスキップ** | WebSocket ASRの転写結果を再利用し、重複処理を削減 |
| **RAGスキップ** | 単純なメッセージでRAG検索をスキップし、応答時間を短縮 |

### 1.2 アーキテクチャ概要

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          感情認識 + 低遅延最適化                              │
│                                                                              │
│   ユーザー音声                                                               │
│        │                                                                     │
│        ▼                                                                     │
│   ┌────────────────────────────────────────────────────────────────────┐   │
│   │  Qwen3 ASR Flash (WebSocket)                                        │   │
│   │  - リアルタイム転写                                                  │   │
│   │  - 感情検出: neutral, happy, sad, angry, fear, disgust, surprise    │   │
│   └────────────────────────┬───────────────────────────────────────────┘   │
│                            │                                                │
│                            ▼                                                │
│   ┌────────────────────────────────────────────────────────────────────┐   │
│   │  クライアント                                                        │   │
│   │  - 転写テキスト蓄積                                                  │   │
│   │  - 最新感情の保持                                                    │   │
│   │  - ウェイクワード検出                                                │   │
│   └────────────────────────┬───────────────────────────────────────────┘   │
│                            │                                                │
│                            ▼                                                │
│   ┌────────────────────────────────────────────────────────────────────┐   │
│   │  Voice Chat API (/api/voice/chat)                                   │   │
│   │                                                                      │   │
│   │  受信: transcript, emotion                                          │   │
│   │                                                                      │   │
│   │  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐  │   │
│   │  │ ASRスキップ判定  │  │ RAGスキップ判定  │  │ 感情プロンプト   │  │   │
│   │  │ ~1800ms節約     │  │ ~200ms節約       │  │ 注入             │  │   │
│   │  └──────────────────┘  └──────────────────┘  └──────────────────┘  │   │
│   │                                                                      │   │
│   └────────────────────────┬───────────────────────────────────────────┘   │
│                            │                                                │
│                            ▼                                                │
│   ┌────────────────────────────────────────────────────────────────────┐   │
│   │  LLM + TTS                                                          │   │
│   │  - 感情に応じたトーンで応答                                          │   │
│   │  - TTSに感情パラメータ送信 (pitch, rate)                            │   │
│   └────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. 音声感情認識（SER）

### 2.1 Qwen3 ASR Flashの感情検出

Qwen3 ASR Flashは音声認識と同時に感情を検出し、以下の7種類を返します：

| 感情 | 説明 | 日本語 |
|------|------|--------|
| `neutral` | 中立・普通 | 普通 |
| `happy` | 喜び・楽しい | 嬉しい |
| `sad` | 悲しみ・落ち込み | 悲しい |
| `angry` | 怒り・イライラ | 怒り |
| `fear` | 恐れ・不安 | 不安 |
| `disgust` | 嫌悪・不快 | 不快 |
| `surprise` | 驚き | 驚き |

### 2.2 ASRレスポンス例

```json
{
  "type": "conversation.item.input_audio_transcription.text",
  "text": "疲れたなあ",
  "stash": "疲れたなあ",
  "language": "ja",
  "emotion": "sad"
}
```

### 2.3 感情の決定ロジック

ASRの感情検出とテキスト分析を組み合わせて最終的な感情を決定します：

```typescript
// server/src/services/emotion-prompt-service.ts

export function determineEmotion(asrEmotion?: string, text?: string): EmotionType {
  // 1. テキストベースの感情分析
  const textEmotion = text ? analyzeTextEmotion(text) : null;

  // 2. テキスト感情が強い場合は優先
  if (textEmotion && textEmotion !== 'neutral') {
    console.log(`Text-based emotion detected: ${textEmotion} (ASR was: ${asrEmotion || 'none'})`);
    return textEmotion;
  }

  // 3. ASR感情を使用
  if (asrEmotion && isValidEmotion(asrEmotion)) {
    return asrEmotion as EmotionType;
  }

  return 'neutral';
}

function analyzeTextEmotion(text: string): EmotionType | null {
  const patterns: Record<EmotionType, RegExp[]> = {
    happy: [/嬉しい|楽しい|最高|ありがとう|やった|わーい/],
    sad: [/悲しい|辛い|寂しい|疲れた|しんどい/],
    angry: [/怒|イライラ|ムカつく|なんで|ふざけ/],
    fear: [/怖い|不安|心配|緊張/],
    surprise: [/え[ぇー]|びっくり|驚|マジ/],
    disgust: [/嫌|気持ち悪い|うんざり/],
    neutral: [],
  };

  for (const [emotion, regexes] of Object.entries(patterns)) {
    if (regexes.some(regex => regex.test(text))) {
      return emotion as EmotionType;
    }
  }
  return null;
}
```

### 2.4 感情プロンプトの注入

検出した感情に基づいて、LLMのシステムプロンプトに指示を追加します：

```typescript
// server/src/services/emotion-prompt-service.ts

const EMOTION_PROMPTS: Record<EmotionType, string> = {
  neutral: '',
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

export function getEmotionPrompt(emotion: string): string {
  return EMOTION_PROMPTS[emotion as EmotionType] || '';
}
```

### 2.5 TTS感情パラメータ

感情に応じてTTSのピッチとスピードを調整します：

```typescript
// server/src/services/emotion-prompt-service.ts

interface EmotionTTSConfig {
  pitch: number;  // 1.0 = 標準
  rate: number;   // 1.0 = 標準
}

const EMOTION_TTS_CONFIG: Record<EmotionType, EmotionTTSConfig> = {
  neutral: { pitch: 1.0, rate: 1.0 },
  happy: { pitch: 1.1, rate: 1.05 },   // 明るく少し速め
  sad: { pitch: 0.9, rate: 0.95 },     // 低めでゆっくり
  angry: { pitch: 1.0, rate: 1.1 },    // 標準ピッチで速め
  fear: { pitch: 1.05, rate: 0.9 },    // やや高めでゆっくり
  disgust: { pitch: 0.95, rate: 1.0 }, // やや低め
  surprise: { pitch: 1.15, rate: 1.0 }, // 高め
};

export function getEmotionTTSConfig(emotion: string): EmotionTTSConfig {
  return EMOTION_TTS_CONFIG[emotion as EmotionType] || EMOTION_TTS_CONFIG.neutral;
}
```

---

## 3. 低遅延最適化

### 3.1 ASRスキップ最適化

WebSocket ASRで既に転写されたテキストを再利用し、Voice Chat APIでのASR処理をスキップします。

#### 従来フロー（ASRスキップなし）

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              従来フロー                                      │
│                                                                              │
│   WebSocket ASR          Voice Chat API                                     │
│   ─────────────          ───────────────                                    │
│   [転写処理 ~1800ms]     [ASR処理 ~1800ms]  ← 重複！                        │
│          │                      │                                           │
│          ▼                      ▼                                           │
│   "こんにちは"           "こんにちは"                                       │
│                                 │                                           │
│                                 ▼                                           │
│                          [LLM + TTS]                                        │
│                                                                              │
│   合計ASR時間: ~3600ms（2回実行）                                           │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### 最適化フロー（ASRスキップあり）

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           最適化フロー                                       │
│                                                                              │
│   WebSocket ASR          Voice Chat API                                     │
│   ─────────────          ───────────────                                    │
│   [転写処理 ~1800ms]     [ASRスキップ 0ms]  ← スキップ！                    │
│          │                      │                                           │
│          ▼                      ▼                                           │
│   "こんにちは" ─────────▶ preTranscript使用                                │
│   emotion: happy                │                                           │
│                                 ▼                                           │
│                          [LLM + TTS]                                        │
│                                                                              │
│   合計ASR時間: ~1800ms（1回のみ）                                           │
│   節約時間: ~1800ms                                                         │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### 実装

```typescript
// server/src/routes/voice.routes.ts

// Step 1: ASR - Convert audio to text (skip if preTranscript provided)
let userText: string;

if (preTranscript && preTranscript.trim().length > 0) {
  // ASR SKIP: Use pre-transcript from WebSocket ASR
  console.log(`⏱️ [PERF] ASR SKIPPED! Using pre-transcript from WebSocket ASR`);
  userText = preTranscript;
  timings.asrEnd = Date.now();
  console.log(`⏱️ [PERF] ASR skip saved ~1800ms (total: ${timings.asrEnd - timings.start}ms)`);
} else if (audioData) {
  // Fallback: Run ASR on audio data
  console.log("⏱️ [PERF] Starting ASR transcription...");
  const asrResult = await qwenASRService.transcribeAudio(audioData, audioFormat);
  // ...
}
```

### 3.2 RAGスキップ最適化

短くて質問を含まないメッセージ（挨拶、感嘆など）はRAG検索をスキップします。

#### スキップ条件

```typescript
// server/src/routes/voice.routes.ts

const isSimpleMessage = userText.length < 30 &&
  !userText.includes('？') &&
  !userText.includes('?') &&
  !userText.match(/どう|なに|いつ|どこ|なぜ|教えて|方法|やり方|仕方/);

if (isSimpleMessage) {
  console.log(`⏱️ [PERF] RAG will be skipped (simple message: "${userText.slice(0, 20)}...")`);
}
```

#### スキップ対象の例

| メッセージ | RAG検索 | 理由 |
|-----------|---------|------|
| 「こんにちは」 | スキップ | 短い挨拶 |
| 「ありがとう」 | スキップ | 短い感謝 |
| 「疲れた」 | スキップ | 短い感嘆 |
| 「エンジンのかけ方は？」 | 実行 | 質問を含む |
| 「車線変更の方法を教えて」 | 実行 | 「方法」「教えて」を含む |

#### コンテキストビルダーへの適用

```typescript
// server/src/routes/voice.routes.ts

const contextResult = await buildContext({
  content: userText,
  location: effectiveLocation,
  language: detectedLang,
  skipWebSearch: true,
  skipRAGSearch: isSimpleMessage,  // RAGスキップフラグ
});
```

---

## 4. データフロー

### 4.1 WebSocket ASRデータフロー

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        WebSocket ASRデータフロー                              │
│                                                                              │
│   クライアント                     サーバー                                   │
│   ──────────────                   ────────                                  │
│                                                                              │
│   マイク入力                                                                  │
│       │                                                                      │
│       ▼                                                                      │
│   [PCM16 Base64]                                                             │
│       │                                                                      │
│       └─────────────────────────▶  WebSocket /ws/asr                        │
│                                         │                                    │
│                                         ▼                                    │
│                                   Qwen3 ASR Flash                           │
│                                         │                                    │
│                                         ▼                                    │
│   ◀──────────────────────────────  {                                        │
│                                     type: "transcript",                      │
│                                     text: "こんにちは",                      │
│                                     isFinal: true,                          │
│                                     language: "ja",                         │
│                                     emotion: "happy"                        │
│                                   }                                          │
│       │                                                                      │
│       ▼                                                                      │
│   転写蓄積 + 感情保持                                                        │
│   accumulatedTranscript += text                                             │
│   latestEmotion = emotion                                                   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 4.2 Voice Chatデータフロー

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        Voice Chatデータフロー                                 │
│                                                                              │
│   クライアント                     サーバー                                   │
│   ──────────────                   ────────                                  │
│                                                                              │
│   POST /api/voice/chat                                                       │
│   {                                                                          │
│     audioData: undefined,  ← ASRスキップ時は不要                            │
│     transcript: "こんにちは",                                                │
│     emotion: "happy",                                                        │
│     ttsMode: "qwen"                                                          │
│   }                                                                          │
│       │                                                                      │
│       └─────────────────────────▶  ASRスキップ判定                          │
│                                         │                                    │
│                                         ▼                                    │
│                                   RAGスキップ判定                            │
│                                         │                                    │
│                                         ▼                                    │
│                                   感情プロンプト注入                         │
│                                         │                                    │
│                                         ▼                                    │
│                                   LLMストリーミング                          │
│                                         │                                    │
│   ◀──────────────────────────────  SSE: { type: "text", content: "..." }   │
│                                         │                                    │
│                                         ▼                                    │
│                                   TTS処理                                    │
│                                         │                                    │
│   ◀──────────────────────────────  SSE: {                                  │
│                                     type: "audio",                          │
│                                     url: "https://...",                     │
│                                     emotion: "happy"                        │
│                                   }                                          │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 5. 実装詳細

### 5.1 サーバー側ファイル

| ファイル | 役割 |
|----------|------|
| `server/src/services/qwen-realtime-service.ts` | ASRから感情を抽出 |
| `server/src/websocket/asr-handler.ts` | WebSocketで感情を送信 |
| `server/src/services/emotion-prompt-service.ts` | 感情プロンプト・TTS設定 |
| `server/src/routes/voice.routes.ts` | ASR/RAGスキップ・感情注入 |

### 5.2 クライアント側ファイル

| ファイル | 役割 |
|----------|------|
| `client/src/components/aiChat/useWakeWordListener.ts` | 感情・転写の蓄積 |
| `client/src/components/aiChat/AIChatButton.tsx` | 感情・転写の送信 |
| `client/src/lib/chat-api.ts` | Voice Chat API呼び出し |

### 5.3 qwen-realtime-service.ts（感情抽出）

```typescript
// server/src/services/qwen-realtime-service.ts

interface RealtimeSessionConfig {
  language?: string;
  onTranscript: (text: string, isFinal: boolean, emotion?: string) => void;
  onError: (error: string) => void;
  onConnected?: () => void;
  onDisconnected?: () => void;
}

// メッセージハンドラー
case 'conversation.item.input_audio_transcription.text':
  if (message.text || message.transcript) {
    const text = message.text || message.transcript;
    const emotion = message.emotion as string | undefined;
    console.log(`Interim transcription: "${text}" (emotion: ${emotion || 'none'})`);
    config.onTranscript(text, false, emotion);
  }
  break;

case 'conversation.item.input_audio_transcription.completed':
  if (message.text || message.transcript) {
    const text = message.text || message.transcript;
    const emotion = message.emotion as string | undefined;
    config.onTranscript(text, true, emotion);
  }
  break;
```

### 5.4 asr-handler.ts（WebSocket感情送信）

```typescript
// server/src/websocket/asr-handler.ts

onTranscript: (text: string, isFinal: boolean, emotion?: string) => {
  const currentLang = ws.data.currentLanguage || language;
  console.log(
    `ASR transcript: "${text}" (final: ${isFinal}, lang: ${currentLang}, emotion: ${emotion || 'none'})`
  );

  // 感情を保存（最新の感情を保持）
  if (emotion) {
    ws.data.latestEmotion = emotion;
  }

  ws.send(JSON.stringify({
    type: "transcript",
    text,
    isFinal,
    wakeWordDetected: detected,
    language: currentLang,
    emotion: emotion || ws.data.latestEmotion || null,
  }));
},
```

### 5.5 voice.routes.ts（統合処理）

```typescript
// server/src/routes/voice.routes.ts

// Detect emotion: combine ASR emotion with text analysis
const detectedEmotion = determineEmotion(userEmotion, userText);
const emotionTTSConfig = getEmotionTTSConfig(detectedEmotion);
console.log(`Final emotion: ${detectedEmotion} (client ASR: ${userEmotion || 'none'})`);

// Add emotion context to system prompt
const emotionPrompt = getEmotionPrompt(detectedEmotion);
const systemPromptWithEmotion = emotionPrompt
  ? `${contextResult.systemPrompt}\n\n${emotionPrompt}`
  : contextResult.systemPrompt;

// TTS with emotion parameters
if (useBrowserTts) {
  await stream.writeSSE({
    data: JSON.stringify({
      type: "tts_text",
      text: textOnly,
      index: index,
      language: detectedLang,
      emotion: detectedEmotion,
      pitch: emotionTTSConfig.pitch,
      rate: emotionTTSConfig.rate,
    }),
  });
}
```

---

## 6. パフォーマンス

### 6.1 レイテンシ改善

| 最適化 | 節約時間 | 条件 |
|--------|---------|------|
| **ASRスキップ** | ~1800ms | preTranscriptが存在する場合 |
| **RAGスキップ** | ~200ms | 短くて質問を含まないメッセージ |
| **合計** | ~2000ms | 最大節約時間 |

### 6.2 サーバーログ例

```
⏱️ [PERF] ASR SKIPPED! Using pre-transcript from WebSocket ASR
⏱️ [PERF] ASR skip saved ~1800ms (total: 0ms)
Detected language: ja (hint: ja, text: "今までありがとう。")
Text-based emotion detected: happy (ASR was: neutral)
Final emotion: happy (client ASR: neutral)
⏱️ [PERF] RAG will be skipped (simple message: "今までありがとう。...")
⏱️ [PERF] Starting context building...
⏱️ [PERF] Context building completed in 590ms
Starting LLM generation with streaming TTS...
First sentence detected - sending to TTS immediately
TTS[0]: "また会えて嬉しいな..."
TTS[0] sent to browser (lang: ja, emotion: happy)
```

### 6.3 全体フロー時間

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              全体フロー時間                                   │
│                                                                              │
│   従来システム（最適化なし）:                                                 │
│   ─────────────────────────────────────────────────────────────────────────  │
│   [WebSocket ASR 1800ms][HTTP ASR 1800ms][RAG 200ms][LLM+TTS 500ms]         │
│                                                                              │
│   合計: ~4300ms                                                              │
│                                                                              │
│   ─────────────────────────────────────────────────────────────────────────  │
│                                                                              │
│   本システム（最適化あり）:                                                   │
│   ─────────────────────────────────────────────────────────────────────────  │
│   [WebSocket ASR 1800ms][ASRスキップ 0ms][RAGスキップ][LLM+TTS 500ms]       │
│                                                                              │
│   合計: ~2300ms（TTFA: ~500ms）                                              │
│                                                                              │
│   ─────────────────────────────────────────────────────────────────────────  │
│   改善: ~2000ms削減（約47%高速化）                                           │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## まとめ

本実装により、以下の機能を追加しました：

| 機能 | 実装内容 | 効果 |
|------|----------|------|
| **感情認識** | Qwen3 ASR Flashの感情検出 + テキスト分析 | ユーザー感情に適応した応答 |
| **感情プロンプト** | 7種類の感情に応じたLLM指示 | 共感的なAI応答 |
| **感情TTS** | pitch/rateパラメータ調整 | 感情に合った音声トーン |
| **ASRスキップ** | WebSocket ASR転写の再利用 | ~1800ms節約 |
| **RAGスキップ** | 単純メッセージの検索省略 | ~200ms節約 |

これらの最適化により、より自然で迅速な音声対話を実現しています。
