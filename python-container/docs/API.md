# API ドキュメント

Speed Limit Detector の REST API と WebSocket API の仕様書です。

## ベースURL

```
http://localhost:8000
```

## 自動生成ドキュメント

サーバー起動後、以下のURLで対話的なAPIドキュメントにアクセスできます：

- **Swagger UI**: http://localhost:8000/docs
- **ReDoc**: http://localhost:8000/redoc

---

## REST API エンドポイント

### GET /

ルートエンドポイント。API情報を返します。

**レスポンス例:**
```json
{
  "name": "Speed Limit Detector API",
  "version": "0.1.0",
  "docs": "/docs",
  "endpoints": {
    "health": "/health",
    "current": "/api/v1/current",
    "effective": "/api/v1/effective",
    "websocket": "/ws/speed"
  }
}
```

---

### GET /health

ヘルスチェックエンドポイント。サーバーの稼働状態を確認します。

**レスポンス例:**
```json
{
  "status": "healthy",
  "version": "0.1.0",
  "pipeline_running": true
}
```

| フィールド | 型 | 説明 |
|-----------|------|------|
| `status` | string | 常に `"healthy"` |
| `version` | string | アプリケーションバージョン |
| `pipeline_running` | boolean | 動画処理パイプラインが稼働中か |

**使用例:**
```bash
curl http://localhost:8000/health
```

---

### GET /api/v1/current

現在の速度制限検出状態を取得します。

**レスポンス例（確定済み）:**
```json
{
  "status": "confirmed",
  "speed_limit": 40,
  "effective_speed_limit": 40,
  "time_condition": null,
  "confirmed_at": "2024-01-15T10:30:00",
  "last_seen_at": "2024-01-15T10:35:00",
  "last_updated": "2024-01-15T10:35:00"
}
```

**レスポンス例（時間条件付き）:**
```json
{
  "status": "confirmed",
  "speed_limit": 30,
  "effective_speed_limit": 30,
  "time_condition": {
    "range": "7-19",
    "is_active": true
  },
  "confirmed_at": "2024-01-15T10:30:00",
  "last_seen_at": "2024-01-15T10:35:00",
  "last_updated": "2024-01-15T10:35:00"
}
```

**レスポンス例（未検出）:**
```json
{
  "status": "no_detection",
  "speed_limit": null,
  "effective_speed_limit": null,
  "time_condition": null,
  "confirmed_at": null,
  "last_seen_at": null,
  "last_updated": "2024-01-15T10:35:00"
}
```

| フィールド | 型 | 説明 |
|-----------|------|------|
| `status` | string | `"no_detection"`, `"detecting"`, `"confirmed"` のいずれか |
| `speed_limit` | int \| null | 確定済みの制限速度（確定前は null） |
| `effective_speed_limit` | int \| null | 有効な制限速度（時間条件外は null） |
| `time_condition` | object \| null | 時間条件（存在する場合） |
| `confirmed_at` | datetime \| null | 確定時刻 |
| `last_seen_at` | datetime \| null | 最終視認時刻 |
| `last_updated` | datetime | 状態の最終更新時刻 |

**status の意味:**

| status | 説明 |
|--------|------|
| `no_detection` | 速度制限標識が一度も検出されていない |
| `detecting` | 標識を検出中（3フレーム確認の途中） |
| `confirmed` | 速度制限が確定済み |

**使用例:**
```bash
curl http://localhost:8000/api/v1/current
```

---

### GET /api/v1/effective

現在有効な制限速度のみを取得します（シンプルなレスポンス）。

**レスポンス例:**
```json
{
  "speed_limit": 40
}
```

```json
{
  "speed_limit": null
}
```

| フィールド | 型 | 説明 |
|-----------|------|------|
| `speed_limit` | int \| null | 有効な制限速度、または null |

**使用例:**
```bash
curl http://localhost:8000/api/v1/effective
```

**ユースケース:**
- シンプルなUIで制限速度だけを表示したい場合
- IoTデバイスなど帯域幅が限られる環境

---

## WebSocket API

### WS /ws/speed

リアルタイムで速度制限の更新を受信するWebSocketエンドポイント。

**接続URL:**
```
ws://localhost:8000/ws/speed
```

**メッセージ形式:**
```json
{
  "type": "speed_update",
  "data": {
    "status": "confirmed",
    "speed_limit": 40,
    "effective_speed_limit": 40,
    "time_condition": null,
    "confirmed_at": "2024-01-15T10:30:00",
    "last_seen_at": "2024-01-15T10:35:00",
    "last_updated": "2024-01-15T10:35:00"
  }
}
```

| フィールド | 型 | 説明 |
|-----------|------|------|
| `type` | string | 常に `"speed_update"` |
| `data` | object | `/api/v1/current` と同じ形式の状態データ |

**動作:**

1. 接続時に現在の状態を即座に送信
2. 状態が変化するたびに新しい状態を送信
3. `last_updated` のみの変更では送信しない（ノイズ削減）

**接続例（wscat）:**
```bash
# wscat のインストール
npm install -g wscat

# 接続
wscat -c ws://localhost:8000/ws/speed
```

**接続例（JavaScript）:**
```javascript
const ws = new WebSocket('ws://localhost:8000/ws/speed');

ws.onopen = () => {
  console.log('Connected');
};

ws.onmessage = (event) => {
  const message = JSON.parse(event.data);
  if (message.type === 'speed_update') {
    const { status, speed_limit, effective_speed_limit } = message.data;
    console.log(`Status: ${status}, Speed: ${effective_speed_limit || 'N/A'} km/h`);
  }
};

ws.onclose = () => {
  console.log('Disconnected');
};
```

**接続例（Python）:**
```python
import asyncio
import websockets
import json

async def monitor_speed():
    async with websockets.connect('ws://localhost:8000/ws/speed') as ws:
        while True:
            message = await ws.recv()
            data = json.loads(message)
            if data['type'] == 'speed_update':
                speed = data['data'].get('effective_speed_limit')
                status = data['data']['status']
                print(f"Status: {status}, Speed: {speed} km/h")

asyncio.run(monitor_speed())
```

---

## ステータスコード

| コード | 説明 |
|--------|------|
| 200 | 成功 |
| 422 | バリデーションエラー |
| 500 | サーバー内部エラー |

---

## 時間条件について

日本には「7-19」のような時間帯限定の速度制限があります。

**例: 30km/h (7-19)**

| 時間 | `speed_limit` | `effective_speed_limit` | `is_active` |
|------|--------------|------------------------|-------------|
| 10:00 | 30 | 30 | true |
| 22:00 | 30 | null | false |

- `speed_limit`: 標識に記載された制限速度（常に表示）
- `effective_speed_limit`: 現在有効な制限速度（時間外は null）
- `is_active`: 時間条件が現在有効かどうか

---

## エラーレスポンス

エラー時のレスポンス形式：

```json
{
  "error": "エラーメッセージ",
  "detail": "詳細情報（オプション）"
}
```

---

## CORS

開発環境では全オリジンからのアクセスを許可しています：

```
Access-Control-Allow-Origin: *
```

本番環境では適切なオリジン制限を設定してください。

---

## レート制限

現在のバージョンにはレート制限はありません。
本番環境ではリバースプロキシ（nginx等）でのレート制限を推奨します。
