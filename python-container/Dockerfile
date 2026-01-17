# Python Speed Limit Detector
FROM python:3.11-slim

WORKDIR /app

# OpenCV用のシステムライブラリをインストール
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

# Python依存パッケージのインストール
COPY requirements-docker.txt ./
RUN pip install --no-cache-dir --default-timeout=100 -r requirements-docker.txt

# ソースコードをコピー
COPY src/ ./src/
COPY pyproject.toml .

# ディレクトリ作成
RUN mkdir -p /app/uploads /app/results

# Pythonパスを設定
ENV PYTHONPATH=/app/src

# FastAPIサーバーのポート
EXPOSE 9000

# デフォルトコマンド（FastAPIサーバー起動）
CMD ["uvicorn", "speed_detector.api.simple:app", "--host", "0.0.0.0", "--port", "9000"]
