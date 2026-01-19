# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

DriBuddy server - an AI-powered car navigation chat backend built with Hono and Bun. Provides multi-modal chat (text/voice), RAG-based knowledge search, and AI-powered driving route suggestions.

## Common Commands

```bash
# Development (with hot reload)
bun run dev

# Production
bun run start

# Build
bun run build

# Database
bunx prisma generate        # Generate Prisma client
bunx prisma migrate dev     # Run migrations (development)
bunx prisma migrate deploy  # Run migrations (production)
bunx prisma db push         # Push schema changes (no migration file)

# Start infrastructure (from repo root)
docker-compose up -d postgres chromadb
```

## Architecture

### Tech Stack
- **Runtime**: Bun
- **Framework**: Hono (lightweight HTTP framework)
- **Database**: PostgreSQL with Prisma ORM
- **Vector DB**: ChromaDB for RAG embeddings
- **AI Providers**: Google Gemini, Alibaba Qwen (LLM, ASR, TTS)

### API Routes (mounted at `/api/`)

| Route | Purpose |
|-------|---------|
| `/api/chat/conversations` | CRUD for conversations and messages |
| `/api/chat/conversations/:id/messages/stream` | Streaming chat responses (SSE) |
| `/api/voice/chat` | Voice interaction endpoint |
| `/api/rag/init`, `/api/rag/search`, `/api/rag/status` | RAG system management |
| `/api/route/suggest` | AI-powered driving route suggestions |
| `/ws/asr` | WebSocket for real-time speech recognition |

### Service Layer (`src/services/`)

- `chat-service.ts` - Conversation/message CRUD with Prisma
- `ai-service.ts` - Google Gemini integration via Vercel AI SDK
- `qwen-llm-service.ts` - Alibaba Qwen LLM streaming
- `qwen-asr-service.ts` / `qwen-tts-service.ts` - Speech-to-text and text-to-speech
- `rag-service.ts` - Orchestrates hybrid search (vector + keyword)
- `route-service.ts` / `route-ai-service.ts` - Route suggestion with AI waypoint selection
- `context-builder.ts` - System prompt construction with location/search context

### RAG System (`src/rag/`)

Hybrid retrieval using both vector similarity (ChromaDB) and keyword matching (BM25):
- `vectordb.ts` - ChromaDB integration
- `embedding.ts` - Text embedding generation
- `keyword-search.ts` - BM25 keyword indexing
- `text-splitter.ts` - Document chunking for ingestion

### Database Schema

Two Prisma models in `prisma/schema.prisma`:
- `Conversation` - Chat sessions (anonymous user support)
- `Message` - Individual messages with role (user/assistant/system)

## Environment Variables

Copy `.env.example` to `.env`. Key variables:

```
PORT=3001
DATABASE_URL=postgresql://...
GOOGLE_API_KEY=...           # For Gemini
DASHSCOPE_API_KEY=...        # For Qwen services
CHROMA_URL=http://localhost:8100
RAG_DATA_FILE=../assets/instruction-manual/prius-instruction-manual.txt
```

## Multi-Service Setup

From repo root, `docker-compose.yml` orchestrates:
- PostgreSQL (port 5435)
- ChromaDB (port 8100)
- Server (port 3001)
- Speed detector - Python YOLO service (port 9000)
