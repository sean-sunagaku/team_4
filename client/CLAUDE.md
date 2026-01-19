# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is **dribiddy-car-navi**, a driving practice support application built with React + TypeScript + Vite. It provides:
- Google Maps integration for navigation and route display
- AI voice assistant with real-time wake word detection via WebSocket ASR
- Route suggestion API integration with practice type selection
- QR code generation for sharing routes to mobile devices
- Driving manual/support panel with safety checklists

## Commands

```bash
# Install dependencies
npm install

# Start development server (runs on http://localhost:5173)
npm run dev

# Build for production (runs TypeScript check then Vite build)
npm run build

# Preview production build
npm run preview

# Run ESLint
npm run lint
```

## Environment Setup

Copy `.env.example` to `.env` and set the required environment variables:
```
VITE_GOOGLE_MAPS_API_KEY=your_google_maps_api_key
VITE_API_BASE_URL=http://localhost:3001  # Backend API server
VITE_API_URL=http://localhost:3001       # Voice chat API (same server)
```

## Architecture

### Entry Point
- `src/main.tsx` → `src/App.tsx` - Standard React setup with StrictMode

### Core Components (src/components/)
- **AIChatButton** - Voice AI assistant with wake word detection, MediaRecorder for audio capture, WebSocket streaming to DashScope ASR, Web Speech API for TTS
- **NavigationStartModal** - Form for setting departure location and practice type (BACK_PARKING, U_TURN, INTERSECTION_TURN, etc.)
- **DrivingSupportPanel** - Expandable panel showing driving manual items from `manualData.ts`
- **RouteShareModal** - QR code display for sharing routes

### Key Hooks (src/hooks/)
- **useNavigation** - Manages navigation state, directions, and route calculation using Google Maps DirectionsService

### API Integration (src/lib/)
- **chat-api.ts** - SSE-based voice chat client that handles audio transcription, streaming text responses, and TTS (both browser Web Speech API and server-side Qwen TTS)

### Utilities (src/utils/)
- **geocoder.ts** - Wrapper around Google Maps Geocoder API

### State Data Flow
1. User opens NavigationStartModal → selects practice type and departure location
2. App calls `/api/route/suggest` with origin + practiceType
3. Backend returns suggested route with Google Maps navigation URL and mission steps
4. App displays mission list and enables Google Maps popup navigation
5. AIChatButton provides voice-based driving assistance during navigation

### Voice AI Flow
1. AIChatButton starts in listening mode with WebSocket ASR connection
2. DashScope ASR detects wake word → triggers recording mode
3. Audio recorded via MediaRecorder → converted to base64 → sent to `/api/voice/chat`
4. Server streams back: transcription → text chunks → TTS audio (or browser TTS text)
5. Audio queued and played sequentially; returns to listening mode after completion

## Key Dependencies
- `@react-google-maps/api` - Google Maps React wrapper
- `qrcode.react` - QR code generation for route sharing
