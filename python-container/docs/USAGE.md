# Speed Limit Detector 使い方ガイド

## 起動方法

トップディレクトリで以下を実行:

```bash
docker compose up speed-detector --build
```

サーバーが `http://localhost:9000` で起動します。

## 開発モード

ホットリロード有効（ソースコード変更時に自動再起動）

```bash
# ソースは ./python-container/src にマウントされている
# 編集すると自動的にサーバーが再起動
```

---

## API エンドポイント一覧

| メソッド | エンドポイント | 説明 |
|---------|---------------|------|
| GET | `/` | API情報 |
| GET | `/health` | ヘルスチェック |
| GET | `/video/list` | 動画一覧 |
| GET | `/video/{filename}/info` | 動画情報 |
| GET | `/video/{filename}/frame` | フレーム取得 |
| POST | `/video/upload` | 動画アップロード |
| POST | `/pipeline/process/{filename}` | パイプライン処理開始 |
| GET | `/pipeline/status/{filename}` | 処理状態確認 |
| GET | `/pipeline/results/{filename}` | 結果取得 |

---

## 基本的な使い方

### 1. ヘルスチェック

```bash
curl http://localhost:9000/health
```

レスポンス:
```json
{"status": "healthy"}
```

### 2. 動画一覧を確認

```bash
curl http://localhost:9000/video/list
```

レスポンス:
```json
{
  "videos": [
    {
      "filename": "sample_movie.mp4",
      "width": 640,
      "height": 360,
      "fps": 30.0,
      "frame_count": 265,
      "duration_seconds": 8.83,
      "codec": "h264"
    }
  ]
}
```

### 3. 標識検出パイプラインを実行

```bash
curl -X POST "http://localhost:9000/pipeline/process/sample_movie.mp4?skip_frames=5"
```

**パラメータ:**
| パラメータ | デフォルト | 説明 |
|-----------|-----------|------|
| `skip_frames` | 1 | Nフレームごとに処理 |
| `max_frames` | なし | 最大処理フレーム数 |
| `use_circular_detection` | true | 円形検出を使用 |

### 4. 処理状態を確認

```bash
curl http://localhost:9000/pipeline/status/sample_movie.mp4
```

レスポンス:
```json
{
  "filename": "sample_movie.mp4",
  "status": "completed",
  "progress": 1.0,
  "frames_processed": 24,
  "total_frames": 265,
  "detections_count": 2,
  "error_message": null
}
```

**status の値:**
- `pending` - 処理待ち
- `processing` - 処理中
- `completed` - 完了
- `error` - エラー

### 5. 結果を取得

```bash
curl http://localhost:9000/pipeline/results/sample_movie.mp4
```

レスポンス例:
```json
{
  "filename": "sample_movie.mp4",
  "total_frames": 265,
  "processed_frames": 24,
  "detections_count": 2,
  "fps": 30.0,
  "results": [
    {
      "frame_number": 100,
      "timestamp": 3.3,
      "detections": [
        {
          "bbox": {"x1": 232, "y1": 146, "x2": 264, "y2": 178},
          "confidence": 0.796,
          "class_name": "circular_red_sign",
          "ocr": {
            "speed_limit": 40,
            "confidence": 0.9999,
            "raw_text": "40"
          }
        }
      ]
    }
  ]
}
```

---

## OCR結果の解説

```json
{
  "ocr": {
    "speed_limit": 40,        // 検出された速度制限値（有効な値のみ）
    "confidence": 0.9999,     // OCR信頼度
    "raw_text": "40 40"       // 生のOCRテキスト
  }
}
```

**有効な速度制限値:**
- 20, 30, 40, 50, 60, 70, 80, 100, 120 km/h

これ以外の値は無効として `speed_limit: null` になります。

---

## フレーム画像の取得

### 時間指定で取得

```bash
curl "http://localhost:9000/video/sample_movie.mp4/frame?time=3.3"
```

### フレーム番号で取得

```bash
curl "http://localhost:9000/video/sample_movie.mp4/frame?frame_number=100"
```

### Base64形式で取得

```bash
curl "http://localhost:9000/video/sample_movie.mp4/frame?frame_number=100&format=base64"
```

---

## 動画アップロード

```bash
curl -X POST -F "file=@your_video.mp4" http://localhost:9000/video/upload
```

---

## Python からの利用例

```python
import requests

BASE_URL = "http://localhost:9000"

# 1. パイプライン開始
response = requests.post(f"{BASE_URL}/pipeline/process/sample_movie.mp4?skip_frames=5")
print(response.json())

# 2. 完了まで待機
import time
while True:
    status = requests.get(f"{BASE_URL}/pipeline/status/sample_movie.mp4").json()
    if status["status"] == "completed":
        break
    time.sleep(1)

# 3. 結果取得
results = requests.get(f"{BASE_URL}/pipeline/results/sample_movie.mp4").json()

# 4. 検出された速度制限を表示
for frame in results["results"]:
    for detection in frame["detections"]:
        if detection.get("ocr") and detection["ocr"].get("speed_limit"):
            print(f"Frame {frame['frame_number']}: {detection['ocr']['speed_limit']} km/h")
```

---

## トラブルシューティング

### コンテナのログを確認

```bash
docker logs team4_speed_detector --tail 50
```

### コンテナの再起動

```bash
docker compose restart speed-detector
```

### 完全な再ビルド

```bash
docker compose up speed-detector --build
```

---

## 処理フロー

```
動画フレーム
    ↓
円形赤標識検出（HSV色抽出 + 輪郭検出）
    ↓
検出領域をリサイズ（100px以上に）
    ↓
前処理（オリジナル、コントラスト強調、二値化）
    ↓
EasyOCR で数字認識
    ↓
有効な速度制限値（20-120）を検証
    ↓
結果をJSON保存
```

---

## 設定

環境変数で設定可能:

| 変数名 | デフォルト | 説明 |
|--------|-----------|------|
| `YOLO_MODEL` | `yolov8n.pt` | YOLOモデルパス |
| `PYTHONUNBUFFERED` | - | ログ出力をバッファリングしない |
