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
    "useHybrid": true
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

## 検索方式：ハイブリッド検索

このシステムは**ベクトル検索**と**BM25キーワード検索**を組み合わせたハイブリッド検索を採用しています。

| 検索方式 | 仕組み | 強み |
|---------|--------|------|
| ベクトル検索 | 意味の類似度で検索 | 言い換え表現を理解 |
| BM25 | キーワードの一致度で検索 | 特定の単語を確実に見つける |

両方を組み合わせることで、精度の高い検索結果を実現します。

## 技術スタック

- **フレームワーク**: Hono + Bun
- **Embedding**: Qwen text-embedding-v4 (DashScope API)
- **ベクトルDB**: ChromaDB
- **キーワード検索**: BM25アルゴリズム

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
│   │   ├── embedding.ts          # Embedding生成
│   │   ├── keyword-search.ts     # BM25キーワード検索
│   │   └── vectordb.ts           # ChromaDB操作
│   └── services/
│       └── rag-service.ts        # RAGサービス
├── docs/
│   └── RAG-API.md            # このドキュメント
└── .env
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
