/**
 * Common Type Definitions
 */

// ============================================
// Location Types
// ============================================

export interface Location {
  lat: number;
  lng: number;
}

// ============================================
// Message Types
// ============================================

export type MessageRole = "system" | "user" | "assistant";

export interface Message {
  id?: string;
  role: MessageRole;
  content: string;
}

export interface MessageRecord {
  id?: string;
  role: string;
  content: string;
}

// ============================================
// Conversation Types
// ============================================

export interface Conversation {
  id: string;
  userId: string;
  title: string | null;
  createdAt: Date;
  updatedAt: Date;
  messages?: MessageRecord[];
}

// ============================================
// Stream Event Types
// ============================================

export type StreamEventType =
  | "text"
  | "done"
  | "error"
  | "transcription"
  | "conversation"
  | "audio"
  | "tts_text";

export interface BaseStreamEvent {
  type: StreamEventType;
}

export interface TextStreamEvent extends BaseStreamEvent {
  type: "text";
  content: string;
}

export interface DoneStreamEvent extends BaseStreamEvent {
  type: "done";
  content: string;
  conversationId?: string;
  cached?: boolean;
}

export interface ErrorStreamEvent extends BaseStreamEvent {
  type: "error";
  message: string;
}

export interface TranscriptionStreamEvent extends BaseStreamEvent {
  type: "transcription";
  text: string;
  language?: string;
}

export interface ConversationStreamEvent extends BaseStreamEvent {
  type: "conversation";
  id: string;
}

export interface AudioStreamEvent extends BaseStreamEvent {
  type: "audio";
  url: string;
  index: number;
  language?: string;
}

export interface TTSTextStreamEvent extends BaseStreamEvent {
  type: "tts_text";
  text: string;
  index: number;
  language?: string;
}

export type StreamEvent =
  | TextStreamEvent
  | DoneStreamEvent
  | ErrorStreamEvent
  | TranscriptionStreamEvent
  | ConversationStreamEvent
  | AudioStreamEvent
  | TTSTextStreamEvent;

// ============================================
// WebSocket Types
// ============================================

export interface WebSocketData {
  session?: {
    sendAudio: (audio: string) => void;
    finishAudio: () => void;
    close: () => void;
  };
  currentLanguage?: string;
  isFirstTranscript?: boolean;
  createSession?: (language: string) => {
    sendAudio: (audio: string) => void;
    finishAudio: () => void;
    close: () => void;
  };
}

export interface WebSocketTranscriptMessage {
  type: "transcript";
  text: string;
  isFinal: boolean;
  wakeWordDetected: boolean;
}

export interface WebSocketReadyMessage {
  type: "ready";
}

export interface WebSocketErrorMessage {
  type: "error";
  error: string;
}

export type WebSocketOutboundMessage =
  | WebSocketTranscriptMessage
  | WebSocketReadyMessage
  | WebSocketErrorMessage;

// ============================================
// API Response Types
// ============================================

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface ConversationsResponse {
  conversations: Conversation[];
}

export interface ConversationResponse {
  conversation: Conversation;
}

// ============================================
// Search Types (re-exported from search-service)
// ============================================

export interface WebSearchResult {
  type: "web" | "answer" | "note";
  title?: string;
  content: string;
  url?: string;
  source?: string;
}

export interface SearchResponse {
  success: boolean;
  query: string;
  results: WebSearchResult[];
  timestamp?: string;
  error?: string;
}

// ============================================
// RAG Types
// ============================================

export interface RAGSearchResult {
  text: string;
  score?: number;
  metadata?: Record<string, unknown>;
}

export interface RAGSearchResponse {
  query: string;
  results: RAGSearchResult[];
  formattedForAI: string;
  count: number;
}

// ============================================
// TTS Types
// ============================================

export type TTSMode = "browser" | "local" | "qwen";

export interface TTSResult {
  success: boolean;
  audioUrl?: string;
  error?: string;
}
