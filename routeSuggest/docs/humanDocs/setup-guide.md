# routeSuggest セットアップ・起動ガイド

このドキュメントは、非エンジニアの方でも理解できるように書かれています。

---

## 事前準備（初回のみ）

### 1. 必要なもの

| 項目 | 説明 | 取得場所 |
|------|------|----------|
| Node.js | プログラムを動かすためのソフト | [nodejs.org](https://nodejs.org/) からダウンロード |
| Google API キー | 地図機能を使うための鍵 | [Google Cloud Console](https://console.cloud.google.com/) |
| Qwen API キー | AI機能を使うための鍵 | [Alibaba Cloud DashScope](https://dashscope.console.aliyun.com/) |

### 2. Google API キーの設定（Google Cloud Console で）

以下の2つのAPIを**有効化**してください：
- **Geocoding API** - 住所を座標に変換する機能
- **Places API (New)** - 周辺のお店や施設を検索する機能

> 💡 1つのAPIキーで両方使えます

### 3. 環境変数ファイルの作成

プロジェクトフォルダ内の `.env.example` をコピーして `.env` という名前に変更し、
実際のAPIキーを記入します。

```
# ターミナルでコピーする場合
cp .env.example .env
```

`.env` ファイルの中身（例）：
```
PORT=3000
NODE_ENV=development
GOOGLE_API_KEY=あなたのGoogleAPIキー
QWEN_API_KEY=あなたのQwenAPIキー
QWEN_BASE_URL=https://dashscope-intl.aliyuncs.com/compatible-mode/v1
QWEN_MODEL=qwen-plus
```

---

## サーバーの起動方法

### ステップ1: ターミナルを開く

Macの場合: `アプリケーション` → `ユーティリティ` → `ターミナル`

### ステップ2: プロジェクトフォルダに移動

```bash
cd /Users/ana/DEV/team_4/routeSuggest
```

> 💡 `cd` は「そのフォルダに移動する」という意味です

### ステップ3: サーバーを起動

```bash
npm run dev
```

### 成功した場合の表示

```
[日時] INFO: 🚗 Route Suggest server started
    port: 3000
    env: "development"
```

この表示が出れば、サーバーは正常に動いています！

### サーバーを止める方法

ターミナルで `Ctrl + C` を押す

---

## 疎通確認（動作テスト）

サーバーが起動した状態で、**別のターミナルウィンドウ**を開いて以下を実行します。

---

### 🔧 Google Maps APIのみテスト（AIなし）

**Qwen APIキーがなくても使えるテスト**です。
Google Maps API（Geocoding + Places）だけをテストし、デモ用のルートURLを生成します。

```bash
curl -X POST http://localhost:3000/api/v1/routes/test-google \
  -H "Content-Type: application/json" \
  -d '{"origin": "東京駅", "practiceType": "BACK_PARKING"}'
```

> 💡 `/test-google` エンドポイントはAIをスキップして、検索結果の最初の施設を目的地に設定します

#### 成功した場合のレスポンス例

```json
{
  "success": true,
  "message": "Google Maps API疎通テスト成功！",
  "data": {
    "geocoding": {
      "inputAddress": "東京駅",
      "resolvedAddress": "日本、〒100-0005 東京都千代田区丸の内１丁目",
      "location": { "lat": 35.6812362, "lng": 139.7671248 }
    },
    "placesSearch": {
      "totalFound": 20,
      "searchTypes": ["parking", "convenience_store", "supermarket", "shopping_mall"]
    },
    "demoRoute": {
      "destination": { "name": "○○パーキング", "address": "..." },
      "waypoints": [{ "name": "セブンイレブン ○○店", "address": "..." }]
    },
    "googleMapsUrl": "https://www.google.com/maps/dir/?api=1&..."
  }
}
```

**確認ポイント:**
- `geocoding` で住所が正しく座標に変換されているか
- `placesSearch.totalFound` が1以上か（周辺施設が見つかったか）
- `googleMapsUrl` をブラウザで開いてルートが表示されるか

---

### 📱 Qwen AI 疎通確認（推奨）

AI（Qwen）を使った完全なルート提案をテストします。
**Qwen APIキーが必要です。**

```bash
curl -X POST http://localhost:3000/api/v1/routes/suggest \
  -H "Content-Type: application/json" \
  -d '{"origin": "東京駅", "practiceType": "BACK_PARKING"}'
```

> 💡 このコマンドは「東京駅からバック駐車の練習ルートを提案して」という意味です

#### 🚀 ワンライナー版（コピペ用）

```bash
curl -s -X POST http://localhost:3000/api/v1/routes/suggest -H "Content-Type: application/json" -d '{"origin": "東京駅", "practiceType": "BACK_PARKING"}' | python3 -m json.tool
```

> `-s` で進捗表示を消し、`python3 -m json.tool` で結果を見やすく整形

### 成功した場合のレスポンス例

```json
{
  "success": true,
  "data": {
    "googleMapsUrl": "https://www.google.com/maps/dir/?api=1&...",
    "steps": ["1. 出発地点から...", "2. 駐車場で..."],
    "notes": ["安全注意事項"],
    "waypoints": [...],
    "destination": {...}
  }
}
```

`googleMapsUrl` をブラウザで開くと、提案されたルートがGoogle Mapsで表示されます。

---

## よくあるエラーと対処法

### エラー1: 環境変数が見つからない

```
❌ Invalid environment variables:
  GOOGLE_API_KEY: { _errors: [ 'Required' ] }
```

**原因**: `.env` ファイルがないか、APIキーが設定されていない

**対処**: `.env.example` をコピーして `.env` を作成し、APIキーを記入

---

### エラー2: Places APIエラー（max_results）

```
"Max number of place results to return must be between 1 and 20"
```

**原因**: 検索結果の最大数が20を超えている（設定ミス）

**対処**: 開発者に連絡してください

---

### エラー3: Qwen API認証エラー

```
"Invalid API key" または "Authentication failed"
```

**原因**: Qwen APIキーが無効または未設定

**対処**:
1. [DashScope Console](https://dashscope.console.aliyun.com/) でAPIキーを確認
2. `.env` の `QWEN_API_KEY` が正しく設定されているか確認

---

### エラー4: ポートが使用中

```
Error: listen EADDRINUSE: address already in use :::3000
```

**原因**: 別のプログラムが同じポート（3000）を使っている

**対処**:
1. 他のターミナルでサーバーが動いていないか確認
2. または `.env` の `PORT=3000` を `PORT=3001` など別の数字に変更

---

## 練習タイプ一覧

テストコマンドの `practiceType` に使える値：

| タイプ | 説明 |
|--------|------|
| `BACK_PARKING` | バック駐車の練習 |
| `BASIC_START_STOP` | 発進・停止の練習 |
| `U_TURN` | Uターンの練習 |
| `INTERSECTION_TURN` | 交差点での右左折の練習 |
| `MERGE_LANECHANGE` | 合流・車線変更の練習 |
| `NARROW_ROAD` | 狭い道の走行練習 |

### 例: Uターン練習のテスト

```bash
curl -X POST http://localhost:3000/api/v1/routes/suggest \
  -H "Content-Type: application/json" \
  -d '{"origin": "渋谷駅", "practiceType": "U_TURN"}'
```

---

## 疎通確認チェックリスト

- [ ] `.env` ファイルが存在する
- [ ] Google API キーが設定されている
- [ ] Qwen API キーが設定されている
- [ ] `npm run dev` でサーバーが起動する
- [ ] curlコマンドでレスポンスが返ってくる
- [ ] `googleMapsUrl` がブラウザで開ける

---

## クイック疎通確認コマンド

サーバー起動後、別ターミナルで以下を実行：

```bash
# Qwen AI 疎通確認（ワンライナー）
curl -s -X POST http://localhost:3000/api/v1/routes/suggest -H "Content-Type: application/json" -d '{"origin": "東京駅", "practiceType": "BACK_PARKING"}' | python3 -m json.tool
```

成功なら `googleMapsUrl` を含むJSONが返ります。
