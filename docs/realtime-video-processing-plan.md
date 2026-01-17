# リアルタイムドラレコ映像処理システム - 実装プラン

## 概要
フロントエンドで動画ファイルをアップロードし、「運転開始」ボタンを押すと、動画フレームをリアルタイムでPythonコンテナに送信し、速度制限標識をOCR認識して、検出時に音声で通知するシステム。

## アーキテクチャ図

```
┌─────────────────────────────────────────────────────────────┐
│                 FRONTEND (Next.js - Port 3000)              │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  /driving ページ - DrivingInterface                  │   │
│  │                                                      │   │
│  │  ┌──────────────┐   ┌───────────────┐               │   │
│  │  │動画ファイル   │──▶│ VideoPlayer   │               │   │
│  │  │アップロード   │   │ (video要素)   │               │   │
│  │  └──────────────┘   └───────┬───────┘               │   │
│  │                             │                        │   │
│  │  ┌──────────┐               ▼                        │   │
│  │  │運転開始   │──▶ useFrameStreamer Hook              │   │
│  │  │ Button   │    - 動画再生 + Canvas描画 (10 FPS)    │   │
│  │  └──────────┘    - JPEG → WebSocket送信              │   │
│  │                             │                        │   │
│  │                             ▼                        │   │
│  │  ┌──────────────────────────────────────────────┐   │   │
│  │  │  SpeedLimitDisplay + TTS                      │   │   │
│  │  │  - "制限速度 40 キロです"                      │   │   │
│  │  │  - 状態変化時のみ発声                         │   │   │
│  │  └──────────────────────────────────────────────┘   │   │
│  └─────────────────────────────────────────────────────┘   │
└────────────────────────────┬────────────────────────────────┘
                             │ WebSocket (Binary JPEG)
                             │ ws://localhost:9000/ws/frames
                             ▼
┌─────────────────────────────────────────────────────────────┐
│              PYTHON CONTAINER (FastAPI - Port 9000)         │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  /ws/frames Endpoint (NEW)                           │   │
│  │  1. Binary JPEG受信 → cv2.imdecode                   │   │
│  │  2. SpeedSignDetector (YOLO) - 既存                  │   │
│  │  3. SpeedOCR (EasyOCR) - 既存                        │   │
│  │  4. StateManager (3フレーム確認) - 既存              │   │
│  │  5. 検出結果をJSON送信                               │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

## 技術的決定事項

| 項目 | 決定 | 理由 |
|------|------|------|
| 入力ソース | 動画ファイルアップロード | ドラレコ録画を後から処理 |
| 標識種類 | 速度制限標識のみ | 既存YOLO+OCRパイプライン活用 |
| データ転送 | WebSocket + Binary JPEG | 低レイテンシ、双方向通信 |
| フレームレート | 10 FPS | 標識は静止物、OCR処理時間を考慮 |
| 音声発声 | CONFIRMED状態変化時のみ | 重複防止、3秒クールダウン |

## 実装ファイル一覧

### Phase 1: Python WebSocket エンドポイント

**新規作成:**
- `python-container/src/speed_detector/api/routes/frames.py`
  - `/ws/frames` - 双方向WebSocket（フレーム受信→検出結果送信）

**修正:**
- `python-container/src/speed_detector/api/simple.py`
  - 新しいルーターを追加

### Phase 2: Frontend UI（client/ に追加）

**新規作成:**
- `client/app/driving/page.tsx` - /driving ルート
- `client/components/driving/DrivingInterface.tsx` - メインUI
- `client/components/driving/VideoUploader.tsx` - 動画アップロード
- `client/components/driving/SpeedLimitDisplay.tsx` - 速度表示

### Phase 3: Frontend WebSocket ストリーミング

**新規作成:**
- `client/lib/detection-api.ts` - WebSocketクライアント
- `client/hooks/useFrameStreamer.ts` - フレーム送信
- `client/hooks/useDrivingSession.ts` - セッション管理

### Phase 4: TTS統合

**新規作成:**
- `client/lib/tts.ts` - 既存TTSを抽出して再利用

## 主要な実装詳細

### 動画アップロード→再生→フレーム送信フロー

```
1. ユーザーが動画ファイルを選択（input type="file"）
2. FileをURL.createObjectURL()でブラウザ内URL生成
3. <video>要素にsrcを設定
4. 「運転開始」ボタンでvideo.play() + WebSocket接続
5. 100msごとにcanvas.drawImage(video) → toBlob() → WebSocket送信
6. Python側で検出 → 結果をJSON返信
7. 速度変化時にTTS発声
```

### WebSocket メッセージフォーマット

**Frontend → Python (Binary):**
```
Raw JPEG bytes (30-50KB per frame)
```

**Python → Frontend (JSON):**
```json
{
  "type": "detection_result",
  "status": "confirmed" | "detecting" | "no_detection",
  "speed_limit": 40,
  "timestamp": "2024-01-15T10:30:00"
}
```

### 音声通知ロジック
```typescript
if (
  result.status === 'confirmed' &&
  result.speed_limit !== lastNotifiedSpeed &&
  Date.now() - lastAnnouncementTime > 3000
) {
  speak(`制限速度 ${result.speed_limit} キロです`);
}
```

## 検証方法

1. **Python WebSocket テスト**
   - `wscat -c ws://localhost:9000/ws/frames` で接続確認
   - テスト画像をバイナリ送信して検出結果を確認

2. **Frontend テスト**
   - `/driving` ページにアクセス
   - 動画ファイルをアップロード
   - 動画が表示されることを確認

3. **E2Eテスト**
   - 「運転開始」ボタン押下
   - 動画再生と同時にフレームが送信されることを確認
   - 標識が映った時に音声発声を確認

## 実装順序

1. **Phase 1**: Python `/ws/frames` エンドポイント作成
2. **Phase 2**: Frontend UI コンポーネント作成（client/）
3. **Phase 3**: WebSocket ストリーミング実装
4. **Phase 4**: TTS 統合
5. **Phase 5**: E2E テスト・調整
