# アーキテクチャ設計ドキュメント

## 概要

このドキュメントでは、Speed Limit Detectorの設計思想、実装判断の理由、各コンポーネントの詳細を説明します。

## 全体アーキテクチャ

### パイプライン構成

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                              Video Pipeline                                   │
├───────────────┬───────────────┬───────────────┬───────────────┬─────────────┤
│   Grabber     │   Detector    │     OCR       │ StateManager  │  SharedMem  │
│   (OpenCV)    │   (YOLO)      │  (EasyOCR)    │  (3-frame)    │  (Singleton)│
└───────────────┴───────────────┴───────────────┴───────────────┴─────────────┘
                                                                       │
                                                                       ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                              API Server (FastAPI)                             │
├───────────────────────────────────────────────────────────────────────────────┤
│  GET /health          GET /api/v1/current        WebSocket /ws/speed         │
│  GET /api/v1/effective                                                        │
└───────────────────────────────────────────────────────────────────────────────┘
```

### なぜこの構成か？

**責務の分離**
- 各コンポーネントが単一の責務を持つ（Single Responsibility Principle）
- テスト容易性：各コンポーネントを独立してテスト可能
- 交換可能性：YOLOを別モデルに変更、OCRを別ライブラリに変更が容易

**データフローの明確化**
- 単方向のデータフロー（Grabber → Detector → OCR → StateManager）
- 状態は StateManager が一元管理
- API は SharedMemory を介して状態を参照（読み取り専用）

---

## コンポーネント詳細

### 1. FrameGrabber (`pipeline/grabber.py`)

#### 役割
動画ソース（ファイル/RTSP/HTTP）からフレームを取得する。

#### 設計判断

**なぜOpenCVか？**
- 業界標準で安定性が高い
- 多様な入力形式に対応（mp4, avi, RTSP, HTTP）
- Python/C++両対応でパフォーマンス良好

**なぜFPSリミットを実装したか？**
```python
self._min_frame_interval = 1.0 / self.config.fps_limit
```
- 30fps動画を全フレーム処理すると、検出・OCRが追いつかない
- 10fps程度に制限することで処理負荷を軽減
- 標識は連続フレームで変わらないため、間引いても問題なし

**Frame dataclassの設計理由**
```python
@dataclass
class Frame:
    image: np.ndarray   # BGRイメージ
    timestamp: float    # タイムスタンプ（秒）
    frame_number: int   # フレーム番号
```
- 生のndarrayだけでなくメタデータも保持
- 後段処理でタイムスタンプ・フレーム番号を参照可能
- デバッグ時に「何フレーム目で検出したか」を追跡できる

**Context Manager対応の理由**
```python
with FrameGrabber(video_url=path) as grabber:
    for frame in grabber.frames():
        ...
```
- リソースリーク防止（cv2.VideoCapture は明示的 release が必要）
- Pythonic なインターフェース

---

### 2. SpeedSignDetector (`pipeline/detector.py`)

#### 役割
フレーム画像から速度制限標識の領域を検出する。

#### 設計判断

**なぜYOLOv8か？**
- リアルタイム物体検出の業界標準
- PyTorchベースで使いやすい
- 軽量モデル（yolov8n）でもCPUで動作可能

**なぜLazy Loadingか？**
```python
def _load_model(self):
    if self._model is not None:
        return
    from ultralytics import YOLO
    self._model = YOLO(self.config.model_path)
```
- インポート時間の短縮（ultralyticsは重い）
- テスト時にモデルロードを回避可能
- 必要になるまでGPUメモリを使わない

**detect_circular_signs() フォールバックの理由**
```python
def detect_circular_signs(self, image: np.ndarray) -> list[DetectionResult]:
    # 赤い円形領域を検出
```
- 汎用YOLOモデルは日本の速度標識を学習していない
- 日本の速度標識は「赤い円形」という特徴がある
- 従来のCV手法（色抽出 + 輪郭検出）でフォールバック

**DetectionResult の設計**
```python
@dataclass
class DetectionResult:
    bbox: BoundingBox       # 検出領域
    confidence: float       # 信頼度
    class_id: int           # クラスID
    class_name: str         # クラス名
    cropped_image: np.ndarray  # 切り出し画像
```
- cropped_image を含めることで、OCR用に再度画像から切り出す必要がない
- 処理効率向上 + コード簡潔化

---

### 3. SpeedOCR (`pipeline/ocr.py`)

#### 役割
検出された標識領域から数字を読み取る。

#### 設計判断

**なぜEasyOCRか？**
- 多言語対応（日本語数字に強い）
- GPU/CPU両対応
- セットアップが簡単

**なぜallowlistで数字のみ指定か？**
```python
allowlist="0123456789"
```
- 速度標識に含まれるのは数字のみ
- 誤認識を大幅に削減（"O"を"0"と誤認識など防止）

**VALID_SPEED_LIMITS による検証**
```python
VALID_SPEED_LIMITS = {20, 30, 40, 50, 60, 70, 80, 100, 120}
```
- 日本の法定速度は決まっている
- "45" や "73" などの誤読を排除
- 信頼性向上

**read_with_preprocessing() の複数手法試行**
```python
def read_with_preprocessing(self, image):
    results = []
    # 1. オリジナル画像
    # 2. グレースケール + 二値化
    # 3. コントラスト強調
    return max(results, key=lambda r: r.confidence)
```
- 照明条件によって最適な前処理が異なる
- 複数手法を試して最も信頼度の高い結果を採用
- 認識精度向上

---

### 4. StateManager (`pipeline/state_manager.py`)

#### 役割
検出結果を集約し、3フレーム確認ロジックで状態を管理する。

#### 設計判断

**なぜ3フレーム確認か？**

```
Frame 1: 40 km/h 検出 → DETECTING (1/3)
Frame 2: 40 km/h 検出 → DETECTING (2/3)
Frame 3: 40 km/h 検出 → CONFIRMED ✓
Frame 4: 検出なし    → CONFIRMED (値を維持)
Frame 5: 60 km/h 検出 → DETECTING (1/3) ← 新しい標識
```

理由:
- **ノイズ耐性**: 1フレームの誤検出で状態が変わらない
- **応答性**: 3フレーム ≈ 0.1秒（30fps時）で十分速い
- **安定性**: ちらつきを防止

**なぜ確定値を永続保持か？**

```python
def _handle_no_detection(self, state: CurrentState) -> CurrentState:
    # 検出なしでも confirmed_speed_limit は維持
    self._pending_count = 0  # pendingのみリセット
    return state
```

理由:
- **実世界の挙動を模倣**: 一度見た標識は、次の標識まで有効
- **一時的遮蔽への対応**: トンネル、木の影で見えなくなっても値を維持
- **運転者の期待に合致**: ナビと同じ挙動

**状態遷移図**

```
                    ┌─────────────────────┐
                    │   NO_DETECTION      │
                    │  (初期状態)          │
                    └─────────┬───────────┘
                              │ 標識検出
                              ▼
                    ┌─────────────────────┐
              ┌────▶│    DETECTING        │◀────┐
              │     │  (確認中 1-2/3)     │     │
              │     └─────────┬───────────┘     │
              │               │ 同じ値3回        │
     異なる値検出              ▼                  │ 異なる値検出
              │     ┌─────────────────────┐     │
              │     │    CONFIRMED        │─────┘
              └─────│  (確定済み)          │
                    └─────────────────────┘
                              ▲
                              │ 検出なし
                              └───────────┘ (値を維持)
```

---

### 5. SharedMemory (`shared/memory.py`)

#### 役割
パイプラインとAPIサーバー間で状態を共有する。

#### 設計判断

**なぜSingletonパターンか？**
```python
class SharedMemory:
    _instance: Optional["SharedMemory"] = None
    _lock = threading.Lock()

    def __new__(cls) -> "SharedMemory":
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = super().__new__(cls)
        return cls._instance
```
- グローバルに一意な状態を保証
- 複数箇所から同じインスタンスにアクセス
- テスト時に `reset_instance()` でリセット可能

**なぜRLock（再入可能ロック）か？**
```python
self._state_lock = threading.RLock()
```
- 同一スレッドからの再帰的なロック取得を許可
- デッドロック防止

**Phase 2 拡張性**

現在: threading.Lock でスレッド間共有
将来: multiprocessing.shared_memory または Redis でプロセス間共有

インターフェースを変えずに内部実装を差し替え可能な設計。

---

### 6. API Server (`api/server.py`)

#### 役割
REST API と WebSocket でクライアントに状態を提供する。

#### 設計判断

**なぜFastAPIか？**
- 高速（Starlette + Pydantic）
- 自動ドキュメント生成（/docs）
- WebSocket対応
- 型ヒント活用

**CORS全許可の理由**
```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 開発用
)
```
- 開発/デモ用途で任意のフロントエンドからアクセス可能
- 本番環境では適切に制限すべき

**WebSocket ブロードキャストの設計**
- 接続中の全クライアントに状態変更を通知
- ポーリング不要でリアルタイム更新
- 運転支援UIに最適

---

## データ構造設計

### 状態データ (`shared/state.py`)

```python
@dataclass
class CurrentState:
    status: DetectionStatus              # NO_DETECTION | DETECTING | CONFIRMED
    confirmed_speed_limit: Optional[ConfirmedSpeedLimit]  # 確定済み速度
    pending_detection: Optional[SpeedLimitDetection]      # 確認中の検出
    pending_count: int                   # 連続検出回数
    last_updated: datetime               # 最終更新時刻
```

**なぜ confirmed と pending を分離か？**
- 確定前の中間状態を表現
- UIで「確認中: 40km/h (2/3)」のような表示が可能
- デバッグ・監視が容易

### 時間条件 (`TimeCondition`)

```python
@dataclass
class TimeCondition:
    start_hour: int    # 開始時刻
    end_hour: int      # 終了時刻
```

日本には「7-19」のような時間帯限定の速度制限がある。
- `is_active()` で現在時刻に有効か判定
- 深夜帯（22-6時など）のオーバーナイト対応

---

## テスト戦略

### テストの階層

```
Unit Tests (高速、依存なし)
├── test_state.py          # データ構造のテスト
├── test_state_manager.py  # 状態遷移ロジックのテスト
└── test_api_*.py          # APIエンドポイントのテスト

Integration Tests (YOLO/OCR使用、時間かかる)
├── test_grabber.py        # 実動画読み込みテスト
└── integration/
    └── test_pipeline.py   # フルパイプラインテスト
```

### マーカーによる分類

```python
@pytest.mark.slow
class TestFullPipeline:
    ...
```

```bash
# 高速テストのみ
pytest -m "not slow"

# 全テスト
pytest tests/ -v
```

---

## Phase 2 拡張計画

### マルチプロセス化

現在: シングルプロセス + スレッド
```
[Main Process]
├── Pipeline Thread (動画処理)
└── Main Thread (API Server)
```

Phase 2: マルチプロセス
```
[Pipeline Process] ──SharedMemory──▶ [API Process]
```

**メリット**:
- GIL回避でCPU効率向上
- パイプラインクラッシュがAPIに影響しない

### 実装済みの準備

`pipeline/process.py`:
```python
def pipeline_process(video_url, shutdown_event, state_queue):
    # 別プロセスで動作するパイプライン
    ...

class PipelineManager:
    # プロセス管理クラス
    ...
```

切り替えは `main.py` の変更のみで可能な設計。
