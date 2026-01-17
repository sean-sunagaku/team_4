# RAG Sample - プリウス取扱説明書検索システム

車の取扱説明書をベクトル化し、自然言語で検索できるRAGシステムです。

## セットアップ

### 1. 依存関係のインストール

```bash
cd rag-sample
npm install
```

### 2. 環境変数の設定

```bash
cp .env.example .env
```

`.env` ファイルを編集してAPIキーを設定：

```
DASHSCOPE_API_KEY=sk-あなたのAPIキー
CHROMA_PORT=8100
CHROMA_URL=http://localhost:8100
```

### 3. ChromaDBサーバーの起動

```bash
docker compose up -d
```

停止する場合：

```bash
docker compose down
```

## 使い方

### データの初期化

```bash
npx ts-node index.ts init
```

### 検索

```bash
npx ts-node index.ts query "エンジンの場所は？"
```

### 再初期化

```bash
npx ts-node index.ts reindex
```

### 状態確認

```bash
npx ts-node index.ts status
```

## 検索方式：ハイブリッド検索

このシステムは**ベクトル検索**と**BM25キーワード検索**を組み合わせたハイブリッド検索を採用しています。

| 検索方式 | 仕組み | 強み |
|---------|--------|------|
| ベクトル検索 | 意味の類似度で検索 | 言い換え表現を理解 |
| BM25 | キーワードの一致度で検索 | 特定の単語を確実に見つける |

両方を組み合わせることで、精度の高い検索結果を実現します。

## 技術スタック

- **言語**: TypeScript / Node.js
- **Embedding**: Qwen text-embedding-v4 (DashScope API)
- **ベクトルDB**: ChromaDB
- **キーワード検索**: BM25アルゴリズム

## ファイル構成

```
rag-sample/
├── index.ts                  # メインエントリーポイント
├── src/
│   ├── text-preprocessor.ts  # テキスト前処理
│   ├── text-splitter.ts      # テキスト分割
│   ├── embedding.ts          # Embedding生成
│   ├── keyword-search.ts     # BM25キーワード検索
│   ├── vectordb.ts           # ChromaDB操作
│   └── rag.ts                # RAG検索ロジック
├── docker-compose.yml
├── package.json
├── tsconfig.json
└── .env
```
