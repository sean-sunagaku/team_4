# DriBiddy - カーナビ Webアプリ

Google Maps APIを使用したカーナビゲーション機能を持つWebアプリケーションです。

## 機能

- 🗺️ Google Maps統合
- 📍 現在地の取得
- 🔍 目的地の検索
- 🚗 ルート計算とナビゲーション
- 📊 距離・所要時間の表示
- 🧭 詳細なルート案内

## セットアップ

### 1. 依存関係のインストール

```bash
npm install
```

### 2. Google Maps API キーの取得

1. [Google Cloud Console](https://console.cloud.google.com/)にアクセス
2. 新しいプロジェクトを作成（または既存のプロジェクトを選択）
3. 「APIとサービス」→「ライブラリ」に移動
4. 以下のAPIを有効化：
   - Maps JavaScript API
   - Geocoding API
   - Directions API
5. 「認証情報」→「認証情報を作成」→「APIキー」を選択
6. APIキーをコピー

### 3. 環境変数の設定

プロジェクトルートに `.env` ファイルを作成し、以下を追加：

```env
VITE_GOOGLE_MAPS_API_KEY=あなたのAPIキー
```

### 4. 開発サーバーの起動

```bash
npm run dev
```

ブラウザで `http://localhost:5173` を開いてアプリケーションを確認できます。

## 使用方法

1. **現在地の取得**: 「現在地を取得」ボタンをクリックして、現在の位置をマップ上に表示します
2. **目的地の検索**: 検索バーに住所や場所名を入力して検索します
3. **ナビゲーション開始**: 目的地が設定されたら「ナビゲーション開始」ボタンをクリックします
4. **ルート案内**: ナビゲーション中は、距離・所要時間・詳細なルート案内が表示されます
5. **ナビゲーション停止**: 「停止」ボタンでナビゲーションを終了できます

## ビルド

本番環境用のビルド：

```bash
npm run build
```

ビルドされたファイルは `dist` ディレクトリに生成されます。

## 技術スタック

- React 18
- TypeScript
- Vite
- Google Maps JavaScript API
- @react-google-maps/api

## 注意事項

- Google Maps APIの使用にはAPIキーが必要です
- APIキーには使用制限を設定することを推奨します
- 位置情報の取得にはブラウザの位置情報許可が必要です
