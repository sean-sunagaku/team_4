/**
 * WebSocket ASR Handler
 */

import { qwenRealtimeService } from "../services/qwen-realtime-service.js";
import { WAKE_WORD_PATTERNS } from "../config/constants.js";
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

    const session = qwenRealtimeService.createRealtimeASRSession({
      onTranscript: (text: string, isFinal: boolean) => {
        console.log(`ASR transcript: "${text}" (final: ${isFinal})`);
        const detected = checkWakeWord(text);
        ws.send(
          JSON.stringify({
            type: "transcript",
            text,
            isFinal,
            wakeWordDetected: detected,
          })
        );
      },
      onError: (error: string) => {
        console.error("ASR error:", error);
        ws.send(JSON.stringify({ type: "error", error }));
      },
      onConnected: () => {
        console.log("DashScope ASR session ready");
        ws.send(JSON.stringify({ type: "ready" }));
      },
      onDisconnected: () => {
        console.log("DashScope ASR session disconnected");
      },
    });

    ws.data = { session };
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
