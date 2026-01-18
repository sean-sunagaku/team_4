#!/bin/bash

# RAG初期化スクリプト
# Usage: ./scripts/rag-init.sh [--reindex]

BASE_URL="${RAG_API_URL:-http://localhost:3001}"

echo "=== RAG System Setup ==="
echo "API Base URL: $BASE_URL"
echo ""

# ステータス確認
echo "1. Checking RAG status..."
curl -s "$BASE_URL/api/rag/status" | jq .
echo ""

# 初期化 or 再インデックス
if [ "$1" == "--reindex" ]; then
    echo "2. Reindexing RAG system..."
    curl -s -X POST "$BASE_URL/api/rag/reindex" \
        -H "Content-Type: application/json" | jq .
else
    echo "2. Initializing RAG system..."
    curl -s -X POST "$BASE_URL/api/rag/init" \
        -H "Content-Type: application/json" | jq .
fi

echo ""
echo "=== Done ==="
