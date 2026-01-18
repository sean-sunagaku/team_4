#!/bin/sh
set -e

echo "=========================================="
echo "サーバー初期化スクリプト"
echo "=========================================="

# PostgreSQLの準備を待つ
echo "PostgreSQLの準備を待機中..."
while ! nc -z postgres 5432; do
  sleep 1
done
echo "PostgreSQLが準備完了"

# ChromaDBの準備を待つ
echo "ChromaDBの準備を待機中..."
while ! nc -z chromadb 8000; do
  sleep 1
done
echo "ChromaDBが準備完了"

# Prismaスキーマをプッシュ（テーブル作成）
echo "Prismaスキーマをプッシュ中..."
bunx prisma db push --skip-generate

# Prismaクライアント生成
echo "Prismaクライアントを生成中..."
bunx prisma generate

# シードデータ投入
echo "シードデータを投入中..."
bun run seed-db.ts

echo "=========================================="
echo "初期化完了 - サーバーを起動します"
echo "=========================================="

# サーバー起動
exec bun run src/index.ts
