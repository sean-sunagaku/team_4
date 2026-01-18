# RAG API - プリウス取扱説明書検索API

車の取扱説明書をベクトル化し、自然言語で検索できるRAG APIです。

## セットアップ

### 1. 依存関係のインストール

```bash
cd server
bun install
# または
npm install --legacy-peer-deps
```

### 2. 環境変数の設定

```bash
cp .env.example .env
```

`.env` ファイルを編集してAPIキーを設定：

```
# RAG Configuration
DASHSCOPE_API_KEY=sk-あなたのAPIキー
CHROMA_URL=http://localhost:8100
RAG_DATA_FILE=../assets/instruction-manual/prius-instruction-manual.txt
```

### 3. ChromaDBサーバーの起動

プロジェクトルートで実行：

```bash
docker compose up -d
```

停止する場合：

```bash
docker compose down
```

### 4. サーバーの起動

```bash
cd server
bun run dev
```

## API エンドポイント

### ステータス確認

```bash
curl http://localhost:3001/api/rag/status
```

レスポンス例：
```json
{
  "initialized": true,
  "documentCount": 150,
  "bm25DocumentCount": 150,
  "configValid": true,
  "configErrors": [],
  "chromaUrl": "http://localhost:8100",
  "dataFile": "../assets/instruction-manual/prius-instruction-manual.txt"
}
```

### データの初期化

```bash
curl -X POST http://localhost:3001/api/rag/init
```

カスタムファイルパスを指定する場合：
```bash
curl -X POST http://localhost:3001/api/rag/init \
  -H "Content-Type: application/json" \
  -d '{"filePath": "/path/to/your/file.txt"}'
```

レスポンス例：
```json
{
  "success": true,
  "documentCount": 150,
  "message": "Successfully indexed 150 documents"
}
```

### 検索 (POST)

```bash
curl -X POST http://localhost:3001/api/rag/search \
  -H "Content-Type: application/json" \
  -d '{"query": "ブレーキの使い方"}'
```

オプション付き：
```bash
curl -X POST http://localhost:3001/api/rag/search \
  -H "Content-Type: application/json" \
  -d '{
    "query": "エンジンの始動方法",
    "topK": 10,
    "useHybrid": true,
    "vectorWeight": 0.7
  }'
```

### 検索 (GET)

```bash
curl "http://localhost:3001/api/rag/search?q=エンジンの始動方法"
```

オプション付き：
```bash
curl "http://localhost:3001/api/rag/search?q=エンジンの始動方法&topK=10&useHybrid=true"
```

レスポンス例：
```json
{
  "query": "ブレーキの使い方",
  "results": [
    {
      "id": "chunk_42",
      "text": "ブレーキペダルを踏むと...",
      "score": 0.85,
      "source": "hybrid"
    }
  ],
  "formattedForAI": "【参考情報 1】\nブレーキペダルを踏むと...",
  "count": 5
}
```

### 再インデックス

データをリセットして再インデックスします：

```bash
curl -X POST http://localhost:3001/api/rag/reindex
```

## 検索パラメータ

| パラメータ | 型 | デフォルト | 説明 |
|-----------|-----|-----------|------|
| `query` | string | (必須) | 検索クエリ |
| `topK` | number | 5 | 返す結果数（最大20） |
| `useHybrid` | boolean | true | ハイブリッド検索を使用するか |
| `vectorWeight` | number | 0.7 | ベクトル検索の重み（0〜1、残りがキーワード検索の重み） |

## 検索方式：ハイブリッド検索

このシステムは**ベクトル検索**と**BM25キーワード検索**を組み合わせたハイブリッド検索を採用しています。

| 検索方式 | 仕組み | 強み |
|---------|--------|------|
| ベクトル検索 | 意味の類似度で検索 | 言い換え表現を理解 |
| BM25 | キーワードの一致度で検索 | 特定の単語を確実に見つける |

両方を組み合わせることで、精度の高い検索結果を実現します。

### 検索重みの調整

`vectorWeight` パラメータでベクトル検索とキーワード検索のバランスを調整できます：

- `vectorWeight: 1.0` - ベクトル検索のみ（意味重視）
- `vectorWeight: 0.7` - デフォルト（ベクトル70%、キーワード30%）
- `vectorWeight: 0.5` - バランス型
- `vectorWeight: 0.0` - キーワード検索のみ（完全一致重視）

## 技術スタック

- **フレームワーク**: Hono + Bun
- **Embedding**: Qwen text-embedding-v4 (DashScope API)
  - 次元数: 1024
  - バッチサイズ: 10
  - キャッシュ: 5分TTL、最大100エントリ
- **ベクトルDB**: ChromaDB
  - コレクション名: `car_manual`
- **キーワード検索**: BM25アルゴリズム
- **テキスト分割**:
  - チャンクサイズ: 300文字
  - オーバーラップ: 100文字

## Embeddingキャッシュ

検索クエリのEmbedding生成にはインメモリキャッシュを使用しており、同一・類似クエリの応答速度を向上させています。

### キャッシュ仕様

| 項目 | 値 | 説明 |
|-----|-----|------|
| TTL | 5分 | キャッシュエントリの有効期限 |
| 最大エントリ数 | 100 | キャッシュに保持する最大クエリ数 |
| キー正規化 | あり | テキストをtrim + lowercaseして比較 |
| 削除方式 | LRU風 | 最大数到達時に最も古いエントリを削除 |

### キャッシュの動作

1. **キャッシュヒット**: 同一クエリ（大文字小文字・前後空白を無視）が5分以内に再度実行された場合、APIを呼び出さずにキャッシュから返す
2. **キャッシュミス**: 新しいクエリまたはTTL超過時はDashScope APIを呼び出し、結果をキャッシュに保存
3. **自動クリーンアップ**: 新しいエントリ追加時に期限切れエントリを自動削除
4. **容量制限**: 100エントリを超える場合、最も古いエントリを削除して新しいエントリを保存

### キャッシュの効果

- **レイテンシ削減**: キャッシュヒット時はAPI呼び出しをスキップし、即座に応答
- **API呼び出し削減**: 繰り返しの同一クエリでAPIコストを削減
- **メモリ効率**: 最大100エントリ、TTL 5分で適切なメモリ使用量を維持

### ログ出力

キャッシュの動作はコンソールログで確認できます：

```
Embedding cache hit                    # キャッシュヒット
Embedding cached (cache size: 42)      # 新規キャッシュ保存（現在42エントリ）
```

## ファイル構成

```
server/
├── src/
│   ├── index.ts              # APIエンドポイント定義
│   ├── config/
│   │   └── rag.config.ts     # RAG設定
│   ├── rag/
│   │   ├── text-preprocessor.ts  # テキスト前処理
│   │   ├── text-splitter.ts      # テキスト分割
│   │   ├── embedding.ts          # Embedding生成（キャッシュ付き）
│   │   ├── keyword-search.ts     # BM25キーワード検索
│   │   └── vectordb.ts           # ChromaDB操作
│   └── services/
│       └── rag-service.ts        # RAGサービス
├── docs/
│   └── RAG-API.md            # このドキュメント
└── .env
```

## 設定オプション

`src/config/rag.config.ts` で以下の設定をカスタマイズできます：

```typescript
export const ragConfig = {
  // DashScope API設定
  dashscope: {
    apiKey: process.env.DASHSCOPE_API_KEY,
    baseURL: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',
  },

  // Embedding設定
  embedding: {
    model: 'text-embedding-v4',
    dimensions: 1024,
    batchSize: 10,
  },

  // ChromaDB設定
  chromadb: {
    url: process.env.CHROMA_URL || 'http://localhost:8100',
    collectionName: 'car_manual',
  },

  // テキスト分割設定
  textSplitter: {
    chunkSize: 300,
    chunkOverlap: 100,
    usePreprocessing: true,
  },

  // 検索設定
  search: {
    defaultTopK: 5,
    maxTopK: 20,
    hybridSearchWeight: 0.7,
  },

  // データファイルパス
  dataFile: process.env.RAG_DATA_FILE,
};
```

## エラーハンドリング

### よくあるエラー

**DASHSCOPE_API_KEY未設定**
```json
{
  "error": "Configuration errors: DASHSCOPE_API_KEY is not set",
  "documentCount": 0
}
```
→ `.env` ファイルに `DASHSCOPE_API_KEY` を設定してください。

**ChromaDB接続エラー**
```json
{
  "error": "Failed to search: fetch failed"
}
```
→ `docker compose up -d` でChromaDBが起動しているか確認してください。

**初期化前の検索**
```json
{
  "error": "Failed to search: RAG not initialized: ..."
}
```
→ 先に `/api/rag/init` を呼び出してください。
