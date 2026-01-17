"""FastAPI application with video processing pipeline."""

import asyncio
import base64
import io
import shutil
import logging
from pathlib import Path
from typing import Optional, List, Dict, Any
from dataclasses import dataclass, asdict

import cv2
import numpy as np
from fastapi import FastAPI, UploadFile, File, HTTPException, Query, BackgroundTasks
from fastapi.responses import FileResponse, StreamingResponse, JSONResponse
from pydantic import BaseModel

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# OCR用（遅延ロード）
_ocr_reader = None

def get_ocr_reader():
    """EasyOCR readerを遅延ロード"""
    global _ocr_reader
    if _ocr_reader is None:
        import easyocr
        logger.info("Loading EasyOCR reader...")
        _ocr_reader = easyocr.Reader(['en'], gpu=False)
        logger.info("EasyOCR reader loaded")
    return _ocr_reader

# 日本の法定速度制限値
VALID_SPEED_LIMITS = {20, 30, 40, 50, 60, 70, 80, 100, 120}

def read_speed_from_sign(image: np.ndarray) -> Optional[Dict[str, Any]]:
    """標識画像から速度を読み取る"""
    import re
    import cv2
    reader = get_ocr_reader()

    try:
        h, w = image.shape[:2]
        logger.info(f"OCR input image size: {w}x{h}")

        # 画像を十分なサイズにリサイズ（最小100px）
        if h < 100 or w < 100:
            scale = max(100 / h, 100 / w)
            image = cv2.resize(image, None, fx=scale, fy=scale, interpolation=cv2.INTER_CUBIC)
            logger.info(f"Resized to: {image.shape[1]}x{image.shape[0]}")

        # 複数の前処理を試す
        images_to_try = [image]

        # グレースケール + コントラスト強調
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
        enhanced = clahe.apply(gray)
        images_to_try.append(cv2.cvtColor(enhanced, cv2.COLOR_GRAY2BGR))

        # 二値化
        _, binary = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
        images_to_try.append(cv2.cvtColor(binary, cv2.COLOR_GRAY2BGR))

        all_results = []
        for img in images_to_try:
            results = reader.readtext(img, allowlist="0123456789", paragraph=False)
            if results:
                all_results.extend(results)

        results = all_results
        logger.info(f"OCR results: {results}")

        if not results:
            return None

        # 全ての検出テキストを結合
        all_text = " ".join([text for _, text, _ in results])
        numbers = re.findall(r"\d+", all_text)

        if not numbers:
            return None

        # 有効な速度制限値を探す
        for num_str in numbers:
            try:
                num = int(num_str)
                if num in VALID_SPEED_LIMITS:
                    # confidence を取得
                    for _, text, conf in results:
                        if num_str in text:
                            return {"speed_limit": num, "confidence": conf, "raw_text": all_text}
                    return {"speed_limit": num, "confidence": 0.5, "raw_text": all_text}
            except ValueError:
                continue

        # 有効な値がなくても検出された数字を返す
        if numbers:
            return {"speed_limit": None, "confidence": 0.0, "raw_text": all_text, "detected_numbers": numbers}

        return None
    except Exception as e:
        logger.warning(f"OCR failed: {e}")
        return None

app = FastAPI(
    title="Speed Limit Detector API",
    description="Real-time Japanese speed limit sign detection API",
    version="0.1.0",
)

# Add CORS middleware for frontend
from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include frames WebSocket router
from .routes.frames import router as frames_router
app.include_router(frames_router)

# 動画保存ディレクトリ
UPLOAD_DIR = Path("/app/uploads")
UPLOAD_DIR.mkdir(exist_ok=True)

# 処理結果保存用
RESULTS_DIR = Path("/app/results")
RESULTS_DIR.mkdir(exist_ok=True)

# 処理状態を保持
processing_status: Dict[str, Dict[str, Any]] = {}


# ============== Models ==============

class VideoInfo(BaseModel):
    """動画情報のレスポンスモデル"""
    filename: str
    width: int
    height: int
    fps: float
    frame_count: int
    duration_seconds: float
    codec: str


class DetectionResult(BaseModel):
    """検出結果"""
    frame_number: int
    timestamp: float
    has_detection: bool
    bbox: Optional[Dict[str, float]] = None
    confidence: float = 0.0
    class_name: Optional[str] = None


class OCRResult(BaseModel):
    """OCR結果"""
    speed_limit: Optional[int] = None
    confidence: float = 0.0
    raw_text: str = ""


class FrameAnalysisResult(BaseModel):
    """フレーム解析結果"""
    frame_number: int
    timestamp: float
    detection: Optional[DetectionResult] = None
    ocr: Optional[OCRResult] = None
    frame_image_base64: Optional[str] = None


class ProcessingStatus(BaseModel):
    """処理状態"""
    filename: str
    status: str  # "pending", "processing", "completed", "error"
    progress: float  # 0.0 - 1.0
    frames_processed: int
    total_frames: int
    detections_count: int
    error_message: Optional[str] = None


class PipelineResult(BaseModel):
    """パイプライン処理結果"""
    filename: str
    total_frames: int
    processed_frames: int
    detections_count: int
    confirmed_speed_limit: Optional[int] = None
    results: List[Dict[str, Any]]


# ============== Basic Endpoints ==============

@app.get("/")
async def root():
    """Root endpoint."""
    return {
        "message": "Speed Limit Detector API is running",
        "status": "ok",
        "endpoints": {
            "video": {
                "upload": "POST /video/upload",
                "list": "GET /video/list",
                "info": "GET /video/{filename}/info",
                "frame": "GET /video/{filename}/frame",
                "clip": "POST /video/{filename}/clip",
                "delete": "DELETE /video/{filename}",
            },
            "pipeline": {
                "process": "POST /pipeline/process/{filename}",
                "status": "GET /pipeline/status/{filename}",
                "results": "GET /pipeline/results/{filename}",
            },
            "detection": {
                "detect_frame": "POST /detection/frame",
                "detect_circular": "POST /detection/circular",
            }
        }
    }


@app.get("/health")
async def health():
    """Health check endpoint."""
    return {"status": "healthy"}


@app.get("/sample-video")
async def get_sample_video():
    """サンプル動画を提供"""
    sample_path = UPLOAD_DIR / "sample_movie.mp4"
    if not sample_path.exists():
        raise HTTPException(status_code=404, detail="Sample video not found")

    return FileResponse(
        path=str(sample_path),
        filename="sample_movie.mp4",
        media_type="video/mp4"
    )


# ============== Video Endpoints ==============

@app.post("/video/upload", response_model=VideoInfo)
async def upload_video(file: UploadFile = File(...)):
    """動画をアップロードして情報を取得"""
    if not file.filename:
        raise HTTPException(status_code=400, detail="No filename provided")

    file_path = UPLOAD_DIR / file.filename
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    info = get_video_info(str(file_path))
    if info is None:
        file_path.unlink()
        raise HTTPException(status_code=400, detail="Invalid video file")

    return info


@app.get("/video/list")
async def list_videos():
    """アップロードされた動画一覧を取得"""
    videos = []
    for file_path in UPLOAD_DIR.glob("*"):
        if file_path.is_file() and file_path.suffix.lower() in [".mp4", ".avi", ".mov", ".mkv"]:
            info = get_video_info(str(file_path))
            if info:
                videos.append(info)
    return {"videos": videos}


@app.get("/video/{filename}/info", response_model=VideoInfo)
async def get_video_info_endpoint(filename: str):
    """動画の情報を取得"""
    file_path = UPLOAD_DIR / filename
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Video not found")

    info = get_video_info(str(file_path))
    if info is None:
        raise HTTPException(status_code=400, detail="Invalid video file")

    return info


@app.get("/video/{filename}/frame")
async def get_frame(
    filename: str,
    time: float = Query(0.0, description="取得する時間（秒）"),
    frame_number: Optional[int] = Query(None, description="フレーム番号（timeより優先）"),
    format: str = Query("jpeg", description="出力形式: jpeg or base64")
):
    """指定した時間またはフレーム番号の画像を取得"""
    file_path = UPLOAD_DIR / filename
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Video not found")

    cap = cv2.VideoCapture(str(file_path))
    if not cap.isOpened():
        raise HTTPException(status_code=400, detail="Cannot open video")

    try:
        if frame_number is not None:
            cap.set(cv2.CAP_PROP_POS_FRAMES, frame_number)
        else:
            cap.set(cv2.CAP_PROP_POS_MSEC, time * 1000)

        ret, frame = cap.read()
        if not ret:
            raise HTTPException(status_code=400, detail="Cannot read frame")

        _, buffer = cv2.imencode(".jpg", frame)

        if format == "base64":
            return {"image_base64": base64.b64encode(buffer).decode("utf-8")}

        return StreamingResponse(
            iter([buffer.tobytes()]),
            media_type="image/jpeg"
        )
    finally:
        cap.release()


@app.post("/video/{filename}/clip")
async def create_clip(
    filename: str,
    start_time: float = Query(..., description="開始時間（秒）"),
    end_time: float = Query(..., description="終了時間（秒）")
):
    """動画の一部を切り出してダウンロード"""
    file_path = UPLOAD_DIR / filename
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Video not found")

    if start_time >= end_time:
        raise HTTPException(status_code=400, detail="start_time must be less than end_time")

    cap = cv2.VideoCapture(str(file_path))
    if not cap.isOpened():
        raise HTTPException(status_code=400, detail="Cannot open video")

    try:
        fps = cap.get(cv2.CAP_PROP_FPS)
        width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))

        output_filename = f"clip_{start_time}_{end_time}_{filename}"
        output_path = UPLOAD_DIR / output_filename

        fourcc = cv2.VideoWriter_fourcc(*'mp4v')
        out = cv2.VideoWriter(str(output_path), fourcc, fps, (width, height))

        cap.set(cv2.CAP_PROP_POS_MSEC, start_time * 1000)

        while True:
            ret, frame = cap.read()
            if not ret:
                break

            current_time = cap.get(cv2.CAP_PROP_POS_MSEC) / 1000
            if current_time > end_time:
                break

            out.write(frame)

        out.release()

        return FileResponse(
            path=str(output_path),
            filename=output_filename,
            media_type="video/mp4"
        )
    finally:
        cap.release()


@app.delete("/video/{filename}")
async def delete_video(filename: str):
    """動画を削除"""
    file_path = UPLOAD_DIR / filename
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Video not found")

    file_path.unlink()
    return {"message": f"Deleted {filename}"}


# ============== Detection Endpoints ==============

@app.post("/detection/circular")
async def detect_circular_signs(
    file: UploadFile = File(...),
    return_image: bool = Query(False, description="検出結果の画像を返す")
):
    """画像から円形の赤い標識を検出（従来CV手法）"""
    contents = await file.read()
    nparr = np.frombuffer(contents, np.uint8)
    image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

    if image is None:
        raise HTTPException(status_code=400, detail="Invalid image")

    detections = detect_circular_red_signs(image)

    result = {
        "detections": [
            {
                "bbox": {"x1": d["x1"], "y1": d["y1"], "x2": d["x2"], "y2": d["y2"]},
                "confidence": d["circularity"],
                "class_name": "circular_red_sign"
            }
            for d in detections
        ]
    }

    if return_image and detections:
        # 検出結果を描画
        for d in detections:
            cv2.rectangle(image, (d["x1"], d["y1"]), (d["x2"], d["y2"]), (0, 255, 0), 2)
        _, buffer = cv2.imencode(".jpg", image)
        result["image_base64"] = base64.b64encode(buffer).decode("utf-8")

    return result


@app.post("/detection/frame")
async def analyze_single_frame(
    file: UploadFile = File(...),
    use_circular_detection: bool = Query(True, description="円形検出を使用")
):
    """単一フレームを解析（検出のみ）"""
    contents = await file.read()
    nparr = np.frombuffer(contents, np.uint8)
    image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

    if image is None:
        raise HTTPException(status_code=400, detail="Invalid image")

    detections = []

    if use_circular_detection:
        circular_detections = detect_circular_red_signs(image)
        for d in circular_detections:
            detections.append({
                "bbox": {"x1": d["x1"], "y1": d["y1"], "x2": d["x2"], "y2": d["y2"]},
                "confidence": d["circularity"],
                "class_name": "circular_red_sign",
                "cropped_image_base64": base64.b64encode(
                    cv2.imencode(".jpg", d["cropped"])[1]
                ).decode("utf-8")
            })

    return {"detections": detections}


# ============== Pipeline Endpoints ==============

@app.post("/pipeline/process/{filename}")
async def start_pipeline_processing(
    filename: str,
    background_tasks: BackgroundTasks,
    skip_frames: int = Query(1, description="N フレームごとに処理"),
    max_frames: Optional[int] = Query(None, description="最大処理フレーム数"),
    use_circular_detection: bool = Query(True, description="円形検出を使用")
):
    """動画の処理パイプラインを開始"""
    file_path = UPLOAD_DIR / filename
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Video not found")

    # 処理状態を初期化
    processing_status[filename] = {
        "status": "pending",
        "progress": 0.0,
        "frames_processed": 0,
        "total_frames": 0,
        "detections_count": 0,
        "error_message": None
    }

    # バックグラウンドで処理を開始
    background_tasks.add_task(
        process_video_pipeline,
        filename,
        str(file_path),
        skip_frames,
        max_frames,
        use_circular_detection
    )

    return {"message": f"Processing started for {filename}", "status": "pending"}


@app.get("/pipeline/status/{filename}", response_model=ProcessingStatus)
async def get_pipeline_status(filename: str):
    """処理状態を取得"""
    if filename not in processing_status:
        raise HTTPException(status_code=404, detail="No processing found for this file")

    status = processing_status[filename]
    return ProcessingStatus(
        filename=filename,
        **status
    )


@app.get("/pipeline/results/{filename}")
async def get_pipeline_results(filename: str):
    """処理結果を取得"""
    results_file = RESULTS_DIR / f"{filename}.json"
    if not results_file.exists():
        raise HTTPException(status_code=404, detail="Results not found")

    import json
    with open(results_file, "r") as f:
        return json.load(f)


# ============== Utility Functions ==============

def get_video_info(file_path: str) -> Optional[VideoInfo]:
    """動画ファイルの情報を取得"""
    cap = cv2.VideoCapture(file_path)
    if not cap.isOpened():
        return None

    try:
        width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        fps = cap.get(cv2.CAP_PROP_FPS)
        frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        fourcc = int(cap.get(cv2.CAP_PROP_FOURCC))
        codec = "".join([chr((fourcc >> 8 * i) & 0xFF) for i in range(4)])

        duration = frame_count / fps if fps > 0 else 0

        return VideoInfo(
            filename=Path(file_path).name,
            width=width,
            height=height,
            fps=fps,
            frame_count=frame_count,
            duration_seconds=round(duration, 2),
            codec=codec
        )
    finally:
        cap.release()


def detect_circular_red_signs(image: np.ndarray) -> List[Dict[str, Any]]:
    """円形の赤い標識を検出"""
    detections = []

    # HSVに変換
    hsv = cv2.cvtColor(image, cv2.COLOR_BGR2HSV)

    # 赤色のマスク（HSVで赤は0度付近と180度付近）
    lower_red1 = np.array([0, 100, 100])
    upper_red1 = np.array([10, 255, 255])
    lower_red2 = np.array([160, 100, 100])
    upper_red2 = np.array([180, 255, 255])

    mask1 = cv2.inRange(hsv, lower_red1, upper_red1)
    mask2 = cv2.inRange(hsv, lower_red2, upper_red2)
    red_mask = mask1 | mask2

    # 輪郭を検出
    contours, _ = cv2.findContours(red_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    for contour in contours:
        area = cv2.contourArea(contour)
        if area < 500:
            continue

        perimeter = cv2.arcLength(contour, True)
        if perimeter == 0:
            continue
        circularity = 4 * np.pi * area / (perimeter * perimeter)

        if circularity > 0.7:
            x, y, w, h = cv2.boundingRect(contour)

            margin = int(max(w, h) * 0.1)
            x1 = max(0, x - margin)
            y1 = max(0, y - margin)
            x2 = min(image.shape[1], x + w + margin)
            y2 = min(image.shape[0], y + h + margin)

            cropped = image[y1:y2, x1:x2].copy()

            detections.append({
                "x1": x1, "y1": y1, "x2": x2, "y2": y2,
                "circularity": circularity,
                "cropped": cropped
            })

    return detections


async def process_video_pipeline(
    filename: str,
    file_path: str,
    skip_frames: int,
    max_frames: Optional[int],
    use_circular_detection: bool
):
    """動画処理パイプライン（バックグラウンド実行）"""
    import json

    cap = cv2.VideoCapture(file_path)
    if not cap.isOpened():
        processing_status[filename]["status"] = "error"
        processing_status[filename]["error_message"] = "Cannot open video"
        return

    try:
        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        fps = cap.get(cv2.CAP_PROP_FPS)

        processing_status[filename]["status"] = "processing"
        processing_status[filename]["total_frames"] = total_frames

        results = []
        frame_number = 0
        detections_count = 0

        while True:
            ret, frame = cap.read()
            if not ret:
                break

            frame_number += 1

            if frame_number % skip_frames != 0:
                continue

            if max_frames and len(results) >= max_frames:
                break

            timestamp = cap.get(cv2.CAP_PROP_POS_MSEC) / 1000

            frame_result = {
                "frame_number": frame_number,
                "timestamp": timestamp,
                "detections": []
            }

            if use_circular_detection:
                detections = detect_circular_red_signs(frame)
                for d in detections:
                    detection_data = {
                        "bbox": {"x1": d["x1"], "y1": d["y1"], "x2": d["x2"], "y2": d["y2"]},
                        "confidence": d["circularity"],
                        "class_name": "circular_red_sign",
                        "ocr": None
                    }
                    # OCRで数字を読み取り
                    ocr_result = read_speed_from_sign(d["cropped"])
                    if ocr_result:
                        detection_data["ocr"] = ocr_result
                    frame_result["detections"].append(detection_data)
                    detections_count += 1

            results.append(frame_result)

            # 進捗を更新
            processing_status[filename]["progress"] = frame_number / total_frames
            processing_status[filename]["frames_processed"] = len(results)
            processing_status[filename]["detections_count"] = detections_count

        # 結果を保存
        results_file = RESULTS_DIR / f"{filename}.json"
        with open(results_file, "w") as f:
            json.dump({
                "filename": filename,
                "total_frames": total_frames,
                "processed_frames": len(results),
                "detections_count": detections_count,
                "fps": fps,
                "results": results
            }, f, indent=2)

        processing_status[filename]["status"] = "completed"
        processing_status[filename]["progress"] = 1.0

    except Exception as e:
        processing_status[filename]["status"] = "error"
        processing_status[filename]["error_message"] = str(e)
        logger.error(f"Pipeline error: {e}")
    finally:
        cap.release()
