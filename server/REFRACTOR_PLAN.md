# index.ts Refactor Plan

目的: server/src/index.ts の既存実装を完全に踏襲しつつ、責務ごとに分割して保守性を高める。

## 前提/制約
- 既存の機能・挙動・API仕様は変更しない
- 既存の services/, routes/, websocket/ などの構成を尊重する
- index.ts はアプリ起動とルーティング/WS配線のみに集約する

## 対象範囲
- server/src/index.ts
- 既存の server/src/routes, server/src/services, server/src/websocket, server/src/config, server/src/types

## 分割方針 (責務別)
- 設定/定数: server/src/config
- ルーティング: server/src/routes
- コンテキスト構築/検索判定: server/src/services/context-builder.ts
- WebSocket ASR: server/src/websocket
- 共通型: server/src/types

## 具体的な移行内容
1. 既存の context-builder.ts をベースに、index.ts 内にある検索判定・system prompt 生成・web/RAG検索のロジックを統合する
2. chat/voice/rag/route の各 API は routes 配下の既存ファイルへ移行 (必要に応じて最新実装へ反映)
3. WebSocket ASR (言語検出・再接続・wake word 検出) は websocket 配下に移行し、index.ts から参照する
4. index.ts では以下のみを担当
   - Hono アプリ作成とミドルウェア設定
   - 各 routes の mount
   - Bun.serve の起動と websocket handler の紐づけ

## 実装手順
1. index.ts の機能分解マッピング
   - ルート群 (chat/voice/rag/route)
   - WebSocket ASR
   - system prompt / search / cache
   - TTS 設定
2. 既存 modules との重複を確認し、差分を整理
3. routes と websocket の中身を最新実装に合わせて更新
4. index.ts を薄く再構成
5. 型/設定のズレを調整

## 検証項目
- /api/chat/conversations 系が従来通り動作
- /api/voice/chat の ASR/LLM/TTS が従来通り動作
- /api/rag/* が従来通り動作
- /api/route/* が従来通り動作
- /ws/asr の WebSocket 挙動 (wake word, 言語検出/再接続) が従来通り

