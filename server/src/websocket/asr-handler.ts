/**
 * WebSocket ASR Handler
 */

import { qwenRealtimeService } from "../services/qwen-realtime-service.js";
import { WAKE_WORD_PATTERNS } from "../config/constants.js";
import {
  detectLanguage,
  isLanguageConfident,
  type SupportedLanguage,
} from "../services/language-detection-service.js";
import type { WebSocketData } from "../types/common.types.js";

/**
 * Check for wake word in transcribed text
 */
function checkWakeWord(text: string): boolean {
  const normalized = text.toLowerCase();
  return WAKE_WORD_PATTERNS.some((pattern) =>
    normalized.includes(pattern.toLowerCase())
  );
}

/**
 * WebSocket handler for ASR streaming
 */
export const websocketHandler = {
  open(ws: { send: (msg: string) => void; data: WebSocketData }) {
    console.log("WebSocket client connected");

    const initialLanguage: SupportedLanguage = "ja";

    ws.data = {
      currentLanguage: initialLanguage,
      session: null,
      isFirstTranscript: true,
    };

    const createSession = (language: SupportedLanguage) => {
      ws.data.currentLanguage = language;
      ws.data.isFirstTranscript = true;

      return qwenRealtimeService.createRealtimeASRSession({
        language,
        onTranscript: (text: string, isFinal: boolean) => {
          const currentLang = ws.data.currentLanguage || language;
          console.log(
            `ASR transcript: "${text}" (final: ${isFinal}, lang: ${currentLang})`
          );
          const detected = checkWakeWord(text);

          if (ws.data.isFirstTranscript && text.length >= 2) {
            const detectedLang = detectLanguage(text);
            if (
              detectedLang !== currentLang &&
              isLanguageConfident(text, detectedLang)
            ) {
              ws.data.isFirstTranscript = false;
              console.log(
                `Early language detection: ${currentLang} -> ${detectedLang} (text: "${text}")`
              );
              ws.send(
                JSON.stringify({
                  type: "language_change",
                  currentLanguage: currentLang,
                  detectedLanguage: detectedLang,
                  text,
                })
              );
            }
          }

          ws.send(
            JSON.stringify({
              type: "transcript",
              text,
              isFinal,
              wakeWordDetected: detected,
              language: currentLang,
            })
          );
        },
        onError: (error: string) => {
          console.error("ASR error:", error);
          ws.send(JSON.stringify({ type: "error", error }));
        },
        onConnected: () => {
          const lang = ws.data.currentLanguage || language;
          console.log(`DashScope ASR session ready (language: ${lang})`);
          ws.send(JSON.stringify({ type: "ready", language: lang }));
        },
        onDisconnected: () => {
          console.log("DashScope ASR session disconnected");
        },
      });
    };

    ws.data.session = createSession(initialLanguage);
    ws.data.createSession = createSession;
  },

  message(
    ws: { data: WebSocketData },
    message: string | Buffer
  ) {
    try {
      const data = JSON.parse(message.toString());

      if (data.type === "audio" && data.audio) {
        ws.data?.session?.sendAudio(data.audio);
      } else if (data.type === "finish") {
        ws.data?.session?.finishAudio();
      } else if (data.type === "reconnect_with_language") {
        const newLanguage = (data.language as SupportedLanguage) || "ja";
        console.log(`Reconnecting with new language: ${newLanguage}`);
        ws.data?.session?.close();
        ws.data.currentLanguage = newLanguage;
        ws.data.session = ws.data.createSession?.(newLanguage);
      } else if (data.type === "set_language") {
        const language = (data.language as SupportedLanguage) || "ja";
        ws.data.currentLanguage = language;
        console.log(`Language set to: ${language}`);
      }
    } catch (err) {
      console.error("WebSocket message error:", err);
    }
  },

  close(ws: { data: WebSocketData }) {
    console.log("WebSocket client disconnected");
    ws.data?.session?.close();
  },
};

export { checkWakeWord };
