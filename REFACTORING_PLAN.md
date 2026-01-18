# Server フルリファクタリング計画

## 概要
serverディレクトリのJS→TypeScript変換と全体的なリファクタリングを段階的に実施。
各ステップでビルドが通る状態を維持する。

---

## フェーズ 1: JS → TypeScript 変換（5ファイル）

### 1.1 `config/google.config.js` → `.ts`
- `GoogleConfig` interface追加
- 型アノテーション追加

### 1.2 `lib/db.js` → `.ts`
- `globalForPrisma` に型定義追加
- PrismaClient型の活用

### 1.3 `services/ai-service.js` → `.ts`
- `AIMessage`, `AIResponse` interface定義
- メソッドの型アノテーション追加

### 1.4 `services/chat-service.js` → `.ts`
- Prismaの型 (`Conversation`, `Message`) を活用
- `ChatService` interface定義

### 1.5 `services/search-service.js` → `.ts`
- `WebSearchResult`, `SearchResponse`, `DateTimeInfo` interface定義

---

## フェーズ 2: tsconfig.json の strict: true 化

段階的に有効化:
1. `noImplicitAny: true`
2. `strictNullChecks: true`
3. 残りのオプション有効化
4. 最終的に `strict: true` に統合

**修正必要箇所:**
- WebSocketハンドラの `any` → `ServerWebSocket<WebSocketData>`
- エラーハンドリングの型ガード追加

---

## フェーズ 3: 重複コード解消

**新規作成:** `services/context-builder.ts`

`/api/chat/.../stream` と `/api/voice/chat` で重複している以下を共通化:
- システムプロンプト構築
- 検索判定 (needsWebSearch, needsLocationSearch等)
- RAG検索実行
- コンテキスト追加処理

---

## フェーズ 4: 巨大ファイルの分割

### index.ts (1,391行) → 以下に分割:

| 新ファイル | 内容 |
|-----------|------|
| `routes/chat.routes.ts` | Chat API |
| `routes/rag.routes.ts` | RAG API |
| `routes/voice.routes.ts` | Voice Chat API |
| `routes/route.routes.ts` | Route API |
| `websocket/asr-handler.ts` | WebSocket |
| `utils/search-keywords.ts` | 検索判定関数 |
| `config/app.config.ts` | アプリ設定 |

### 分割後の構造:
```
server/src/
├── config/
│   ├── app.config.ts       (NEW)
│   ├── constants.ts        (NEW)
│   └── google.config.ts    (CONVERTED)
├── routes/
│   ├── chat.routes.ts      (NEW)
│   ├── rag.routes.ts       (NEW)
│   ├── voice.routes.ts     (NEW)
│   └── route.routes.ts     (NEW)
├── websocket/
│   └── asr-handler.ts      (NEW)
├── utils/
│   └── search-keywords.ts  (NEW)
├── services/
│   └── context-builder.ts  (NEW)
├── types/
│   └── common.types.ts     (NEW)
└── index.ts                (~100行に簡略化)
```

---

## フェーズ 5: 型定義の整理

**新規作成:** `types/common.types.ts`

統一する型:
- `Location`, `Message`, `Conversation`
- `StreamEvent`, `WebSocketData`
- `WebSearchResult`, `SearchResponse`
- `ApiResponse<T>`

---

## フェーズ 6: 定数の整理

**新規作成:** `config/constants.ts`

集約する定数:
- `APP_CONSTANTS` (ANONYMOUS_USER_ID, DEFAULT_PORT)
- `CACHE_CONSTANTS` (TTL, MAX_SIZE)
- `TIMING_CONSTANTS` (delays)
- `TTS_MODES`
- `SEARCH_KEYWORDS` (検索キーワード一覧)
- `TEXT_PATTERNS` (正規表現パターン)

---

## 重要ファイル

| ファイル | 役割 |
|---------|------|
| `server/src/index.ts` | 分割対象の中心 (1,391行) |
| `server/src/services/chat-service.js` | TS変換対象 |
| `server/src/services/rag-service.ts` | 分割対象 (653行) |
| `server/tsconfig.json` | strict化対象 |

---

## 検証方法

各ステップ完了後:
```bash
cd server
bun run build
bun run dev
```

全体完了後:
- 全APIエンドポイントの動作確認
- WebSocket接続の動作確認
- 型エラーがないことを確認

---

## 実装順序

```
フェーズ1 (JS→TS変換)
    ↓
フェーズ2 (strict化)
    ↓
フェーズ3 (重複コード解消) ← context-builder.ts作成
    ↓
フェーズ4 (ファイル分割) + フェーズ5 (型定義) + フェーズ6 (定数)
    ↓
最終検証
```
