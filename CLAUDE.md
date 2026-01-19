# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**DriBuddy** - An AI-powered car navigation assistant with voice interaction. Features real-time speech recognition with wake word detection, RAG-based knowledge retrieval from car manuals, and speed sign detection via computer vision.

## Monorepo Structure

- `/client` - React + Vite frontend (see `client/CLAUDE.md` for details)
- `/server` - Bun + Hono backend (see `server/CLAUDE.md` for details)
- `/python-container` - FastAPI service for YOLO object detection + OCR (speed signs)
- `/docs` - Architecture documentation (Japanese)
- `/assets` - Prius instruction manual for RAG ingestion

## Infrastructure

```bash
docker-compose up -d postgres chromadb    # Required for server
docker-compose up -d                       # All services
```

| Service | Port |
| ------- | ---- |
| postgres | 5435 |
| chromadb | 8100 |
| server | 3001 |
| python-container | 9000 |

## Key Technical Patterns

1. **Voice Pipeline**: Audio → DashScope ASR → RAG search → LLM streaming → TTS with "First Sentence Prefetch" for low latency (TTFA ~500-800ms)

2. **Streaming Architecture**: SSE for voice chat responses; WebSocket for wake word ASR detection

3. **Hybrid RAG**: ChromaDB vector search + BM25 keyword search on car manual content

4. **Multi-layer Caching**: Embedding cache (5min TTL), system prompt cache (1min TTL), similarity cache for repeated questions

## Documentation

- `docs/architecture.md` - Full system architecture with diagrams (Japanese)
- `docs/low-latency-techniques.md` - Voice latency optimization details (Japanese)
