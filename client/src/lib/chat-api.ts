const API_URL = (import.meta as any).env?.VITE_API_URL || "http://localhost:3001";

export const chatApi = {
  // Voice chat - send audio and receive streaming response
  async sendVoiceMessage(
    audioData: string,
    audioFormat: string,
    callbacks: {
      onTranscription?: (text: string, language?: string) => void;
      onChunk?: (chunk: string) => void;
      onAudio?: (url: string, index?: number) => void;
      onTtsText?: (text: string, index?: number, language?: string) => void; // Browser TTS with language
      onDone?: (content: string) => void;
      onError?: (error: string) => void;
    },
    ttsMode: 'browser' | 'qwen' = 'browser',
    language?: string // 言語ヒント（オプション）
  ): Promise<void> {
    const response = await fetch(`${API_URL}/api/voice/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ audioData, audioFormat, ttsMode, language }),
    });

    if (!response.ok) {
      throw new Error("Failed to send voice message");
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error("No response body");
    }

    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (line.startsWith("data: ")) {
          try {
            const data = JSON.parse(line.slice(6));

            switch (data.type) {
              case "transcription":
                callbacks.onTranscription?.(data.text, data.language);
                break;
              case "text":
                callbacks.onChunk?.(data.content);
                break;
              case "audio":
                callbacks.onAudio?.(data.url, data.index);
                break;
              case "tts_text":
                // Browser TTS: text to be spoken by the browser with language
                callbacks.onTtsText?.(data.text, data.index, data.language);
                break;
              case "done":
                callbacks.onDone?.(data.content);
                break;
              case "error":
                callbacks.onError?.(data.message);
                break;
            }
          } catch (e) {
            console.error("Failed to parse SSE data:", e);
          }
        }
      }
    }
  },
};
