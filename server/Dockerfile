FROM oven/bun:1-alpine

# netcat-openbsdをインストール（接続待機用）
RUN apk add --no-cache netcat-openbsd bash

WORKDIR /app

# パッケージファイルをコピー
COPY package.json bun.lockb* ./

# 依存関係インストール
RUN bun install --frozen-lockfile

# Prismaスキーマをコピーしてクライアント生成
COPY prisma ./prisma/
RUN bunx prisma generate

# ソースコードをコピー
COPY . .

# エントリポイントスクリプトに実行権限を付与
RUN chmod +x scripts/docker-entrypoint.sh

# ポート公開
EXPOSE 3001

# エントリポイント
ENTRYPOINT ["/bin/sh", "scripts/docker-entrypoint.sh"]
