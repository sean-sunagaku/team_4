# routeSuggest 実装計画書

**プロジェクトパス**: `/Users/ana/DEV/team_4/routeSuggest`

## 概要

運転練習ルート提案システムのTypeScriptバックエンド実装計画。

**目的**: ユーザーの苦手項目に基づき、練習ルートをGoogle Maps URL形式で生成

---

## 実装状況

| カテゴリ | ファイル | 状態 |
|---------|---------|------|
| 基盤設定 | package.json, tsconfig.json | ✅ 完了 |
| 型定義 | src/types/*.ts (6ファイル) | ✅ 完了 |
| 設定 | src/config/env.ts, searchAssets.ts | ✅ 完了 |
| ユーティリティ | src/utils/logger.ts | ✅ 完了 |
| エラー | src/errors/AppError.ts | ✅ 完了 |
| サービス | src/services/*.ts (5ファイル) | ✅ 完了 |
| ミドルウェア | src/middleware/*.ts (3ファイル) | ✅ 完了 |
| コントローラー | src/controllers/route.controller.ts | ✅ 完了 |
| アプリ設定 | src/app.ts, src/index.ts | ✅ 完了 |
| 環境設定例 | .env.example, .gitignore | ✅ 完了 |
| 依存関係インストール | npm install | ✅ 完了 |
| TypeScriptビルド | npm run build | ⏳ 未実行 |
| テスト | tests/ | ⏳ 未実装 |

---

## 1. プロジェクト構造

```
routeSuggest/
├── src/
│   ├── index.ts                    # エントリーポイント
│   ├── app.ts                      # Express設定
│   ├── config/
│   │   ├── env.ts                  # 環境変数バリデーション
│   │   └── searchAssets.ts         # 練習タイプ→検索テンプレート
│   ├── types/
│   │   ├── practice.ts             # 練習タイプ定義
│   │   ├── poi.ts                  # POI候補型
│   │   ├── route.ts                # ルート提案型
│   │   ├── api.ts                  # リクエスト/レスポンス型
│   │   └── google.ts               # Google API型
│   ├── services/
│   │   ├── geocoding.service.ts    # 住所→座標変換
│   │   ├── places.service.ts       # 周辺施設検索
│   │   ├── ai.service.ts           # Claude AI連携
│   │   ├── url.service.ts          # Google Maps URL生成
│   │   └── route.service.ts        # メインオーケストレーション
│   ├── controllers/
│   │   └── route.controller.ts     # HTTPハンドラー
│   ├── middleware/
│   │   ├── errorHandler.ts         # エラーハンドリング
│   │   └── validation.ts           # リクエスト検証
│   ├── utils/
│   │   └── logger.ts               # ロギング
│   └── errors/
│       └── AppError.ts             # カスタムエラー
├── tests/
│   ├── unit/
│   └── integration/
├── .env.example
├── package.json
└── tsconfig.json
```

---

## 2. 依存関係

```json
{
  "dependencies": {
    "express": "^4.18.2",
    "cors": "^2.8.5",
    "helmet": "^7.1.0",
    "@anthropic-ai/sdk": "^0.32.0",
    "zod": "^3.22.4",
    "dotenv": "^16.4.0",
    "pino": "^8.17.0"
  },
  "devDependencies": {
    "typescript": "^5.3.0",
    "tsx": "^4.7.0",
    "jest": "^29.7.0",
    "ts-jest": "^29.1.0",
    "@types/express": "^4.17.21",
    "@types/node": "^20.10.0"
  }
}
```

---

## 3. APIエンドポイント

**POST** `/api/v1/routes/suggest`

### リクエスト
```json
{
  "origin": "東京都渋谷区神宮前1-1-1",
  "practiceType": "BACK_PARKING",
  "constraints": {
    "avoidHighways": true,
    "avoidTolls": false
  }
}
```

### レスポンス
```json
{
  "success": true,
  "data": {
    "googleMapsUrl": "https://www.google.com/maps/dir/?api=1&...",
    "steps": ["1. 出発地点から...", "2. 駐車場で..."],
    "notes": ["安全注意事項"],
    "waypoints": [{"name": "...", "address": "..."}],
    "destination": {"name": "...", "address": "..."}
  }
}
```

---

## 4. 処理フロー（7ステップ）

| Step | 処理 | 使用サービス |
|------|------|-------------|
| 1 | リクエスト検証 | validation middleware |
| 2 | 住所→座標変換 | GeocodingService (Google Geocoding API) |
| 3 | 検索アセット選択 | config/searchAssets.ts (固定マッピング) |
| 4 | 周辺POI検索 | PlacesService (Google Places API New) |
| 5 | AI経由地選択 | AIService (Claude API) |
| 6 | URL生成 | UrlService |
| 7 | レスポンス返却 | RouteController |

---

## 5. 練習タイプと検索アセット

| タイプ | includedTypes |
|--------|---------------|
| BACK_PARKING | parking, convenience_store, supermarket, shopping_mall |
| BASIC_START_STOP | parking, convenience_store, supermarket |
| U_TURN | gas_station, parking, convenience_store |
| INTERSECTION_TURN | convenience_store, supermarket, parking |
| MERGE_LANECHANGE | gas_station, convenience_store, parking |
| NARROW_ROAD | convenience_store, parking, supermarket |

共通設定: `radius_m: 3000`, `max_results: 25`, `rank_preference: DISTANCE`

---

## 6. Claude AIプロンプト設計

### 重要ルール
1. **候補リストからのみ選択** - 新規地点作成禁止
2. **最大2経由地** - waypoints は 1-2 箇所に限定
3. **JSON出力** - 構造化された形式で回答

### 出力検証
- Zodでスキーマ検証
- 選択されたIDが候補リストに存在するか確認
- 不正な場合はリトライまたはエラー

---

## 7. 環境変数

```bash
PORT=3000
NODE_ENV=development
GOOGLE_API_KEY=your_google_api_key
ANTHROPIC_API_KEY=your_anthropic_api_key
```

---

## 8. 実装順序

### Phase 1: 基盤 (1-2日目)
1. プロジェクト初期化 (npm init, TypeScript設定)
2. 型定義 (`/src/types/`)
3. 設定ファイル (env.ts, searchAssets.ts)
4. ユーティリティ (logger, validators)

### Phase 2: 外部サービス (3-4日目)
5. GeocodingService
6. PlacesService
7. UrlService

### Phase 3: AI連携 (5日目)
8. AIService (Claude API統合)

### Phase 4: 統合 & API (6-7日目)
9. RouteService (オーケストレーション)
10. Controller & Middleware

### Phase 5: テスト (8日目)
11. ユニットテスト
12. 統合テスト

---

## 9. 検証方法

### ローカルテスト
```bash
# 開発サーバー起動
npm run dev

# curlでテスト
curl -X POST http://localhost:3000/api/v1/routes/suggest \
  -H "Content-Type: application/json" \
  -d '{"origin": "東京駅", "practiceType": "BACK_PARKING"}'
```

### 期待結果
- 200レスポンス
- `googleMapsUrl` がブラウザで開けること
- steps, notes が日本語で表示されること

---

## 10. 修正対象ファイル

**新規作成ファイル（全て）:**
- `/src/index.ts`
- `/src/app.ts`
- `/src/config/env.ts`
- `/src/config/searchAssets.ts`
- `/src/types/*.ts` (5ファイル)
- `/src/services/*.ts` (5ファイル)
- `/src/controllers/route.controller.ts`
- `/src/middleware/*.ts` (2ファイル)
- `/src/utils/logger.ts`
- `/src/errors/AppError.ts`
- `package.json`
- `tsconfig.json`
- `.env.example`
- `.gitignore`

---

## 注意事項

1. **AIの制約**: Claude は候補POIからのみ選択（検証必須）
2. **URL長制限**: waypoints は 1-2 個に制限
3. **路駐禁止**: 路上駐車を推奨しない
4. **フロントエンド**: 別途実装予定（このスコープ外）

---

## 残りのタスク

### 即時実行が必要
1. `npm install` - 依存関係のインストール
2. `.env` ファイルの作成（APIキーの設定）
3. `npm run build` - TypeScriptのコンパイル確認

### 動作確認
```bash
# 1. 依存関係インストール
cd /Users/ana/DEV/team_4/routeSuggest && npm install

# 2. 環境変数設定
cp .env.example .env
# .env を編集して実際のAPIキーを設定

# 3. 開発サーバー起動
npm run dev

# 4. テストリクエスト
curl -X POST http://localhost:3000/api/v1/routes/suggest \
  -H "Content-Type: application/json" \
  -d '{"origin": "東京駅", "practiceType": "BACK_PARKING"}'
```

### オプション（将来）
- ユニットテストの実装
- 統合テストの実装
- エラーハンドリングの強化
- レート制限の追加
