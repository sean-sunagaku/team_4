/**
 * Voice Chat API Routes
 */

import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { chatService } from "../services/chat-service.js";
import { ragService } from "../services/rag-service.js";
import { qwenASRService } from "../services/qwen-asr-service.js";
import { qwenLLMService } from "../services/qwen-llm-service.js";
import { qwenTTSService } from "../services/qwen-tts-service.js";
import { localTTSService } from "../services/local-tts-service.js";
import { buildContext, buildSystemPrompt } from "../services/context-builder.js";
import {
  ANONYMOUS_USER_ID,
  getLocation,
  TTS_MODE,
  USE_LOCAL_TTS,
} from "../config/app.config.js";
import { TEXT_PATTERNS, TIMING_CONSTANTS, WAKE_WORD_PATTERNS } from "../config/constants.js";
import type { Location, TTSMode } from "../types/common.types.js";

const voiceRoutes = new Hono();

// Select TTS service based on config
const ttsService = USE_LOCAL_TTS ? localTTSService : qwenTTSService;

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
 * Convert markdown to plain text for TTS
 */
function getTextOnly(text: string): string {
  return text
    .replace(TEXT_PATTERNS.EMOJI, "")
    .replace(/^[-*_]{3,}\s*$/gm, "")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/_([^_]+)_/g, "$1")
    .replace(/^>\s*/gm, "")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/^[\s]*[-*+]\s+/gm, "")
    .replace(/\s+/g, " ")
    .trim();
}

// Voice chat endpoint - receives audio, returns text + audio response
voiceRoutes.post("/chat", async (c) => {
  let audioData: string;
  let audioFormat: string;
  let conversationId: string | undefined;
  let ttsMode: TTSMode;
  let location: Location | undefined;

  try {
    const body = await c.req.json();
    audioData = body.audioData;
    audioFormat = body.audioFormat || "webm";
    conversationId = body.conversationId;
    ttsMode = body.ttsMode || TTS_MODE;
    location = body.location;
  } catch {
    return c.json({ error: "Invalid request body" }, 400);
  }

  if (!audioData) {
    return c.json({ error: "Audio data is required" }, 400);
  }

  const useBrowserTts = ttsMode === "browser";

  return streamSSE(c, async (stream) => {
    try {
      // Step 1: ASR - Convert audio to text
      console.log("Starting ASR transcription...");
      const asrResult = await qwenASRService.transcribeAudio(
        audioData,
        audioFormat
      );

      if (!asrResult.success || !asrResult.text) {
        await stream.writeSSE({
          data: JSON.stringify({
            type: "error",
            message: asrResult.error || "Failed to transcribe audio",
          }),
        });
        return;
      }

      const userText = asrResult.text;
      console.log("ASR transcription completed:", userText);

      await stream.writeSSE({
        data: JSON.stringify({ type: "transcription", text: userText }),
      });

      // Get or create conversation
      let convId = conversationId;
      if (!convId) {
        const conversation =
          await chatService.createConversation(ANONYMOUS_USER_ID);
        convId = conversation.id;
        await stream.writeSSE({
          data: JSON.stringify({ type: "conversation", id: convId }),
        });
      }

      // Save user message
      chatService.addMessage(convId, "user", userText).catch((err) => {
        console.error("Failed to save user message:", err);
      });

      // Step 2: Build context
      const effectiveLocation = getLocation(location);
      const [existingMessages, contextResult] = await Promise.all([
        chatService.getMessages(convId),
        buildContext({ content: userText, location: effectiveLocation }),
      ]);

      const aiMessages = [
        { role: "system" as const, content: contextResult.systemPrompt },
        ...chatService.formatMessagesForAI(existingMessages),
        { role: "user" as const, content: userText },
      ];

      // Step 3: LLM + TTS streaming
      console.log("Starting LLM generation with streaming TTS...");
      let fullContent = "";
      let sentenceBuffer = "";
      let audioIndex = 0;

      const ttsQueue: { sentence: string; index: number }[] = [];
      let isProcessingTTS = false;
      let firstSentenceSent = false;
      let ttsCompleteResolve!: () => void;
      const ttsCompletePromise = new Promise<void>((resolve) => {
        ttsCompleteResolve = resolve;
      });
      let llmComplete = false;

      const sleep = (ms: number) =>
        new Promise((resolve) => setTimeout(resolve, ms));

      const sendToTTS = async (sentence: string, index: number) => {
        const textOnly = getTextOnly(sentence);
        if (!textOnly) return;
        console.log(`TTS[${index}]: "${textOnly.slice(0, 30)}..."`);

        if (useBrowserTts) {
          await stream.writeSSE({
            data: JSON.stringify({
              type: "tts_text",
              text: textOnly,
              index: index,
            }),
          });
          console.log(`TTS[${index}] sent to browser`);
          return;
        }

        const ttsResult = await ttsService.synthesizeSpeech(textOnly);
        if (ttsResult.success && ttsResult.audioUrl) {
          await stream.writeSSE({
            data: JSON.stringify({
              type: "audio",
              url: ttsResult.audioUrl,
              index: index,
            }),
          });
          console.log(`TTS[${index}] completed`);
        } else {
          console.error(`TTS[${index}] failed:`, ttsResult.error);
        }
      };

      const processTTSQueue = async () => {
        if (isProcessingTTS) return;
        isProcessingTTS = true;

        while (ttsQueue.length > 0) {
          const item = ttsQueue.shift()!;
          await sendToTTS(item.sentence, item.index);
          if (ttsQueue.length > 0) {
            await sleep(TIMING_CONSTANTS.TTS_QUEUE_DELAY);
          }
        }

        isProcessingTTS = false;

        if (llmComplete && ttsQueue.length === 0) {
          ttsCompleteResolve();
        }
      };

      await qwenLLMService.sendMessageStream(aiMessages, {
        onChunk: async (chunk) => {
          fullContent += chunk;
          sentenceBuffer += chunk;

          await stream.writeSSE({
            data: JSON.stringify({ type: "text", content: chunk }),
          });

          while (TEXT_PATTERNS.SENTENCE_END.test(sentenceBuffer)) {
            const match = sentenceBuffer.match(TEXT_PATTERNS.SENTENCE_END);
            if (match && match.index !== undefined) {
              const sentence = sentenceBuffer.slice(0, match.index + 1);
              sentenceBuffer = sentenceBuffer.slice(match.index + 1);

              if (getTextOnly(sentence)) {
                const currentIndex = audioIndex++;

                if (!firstSentenceSent) {
                  firstSentenceSent = true;
                  console.log("First sentence detected - sending to TTS immediately");
                  sendToTTS(sentence, currentIndex).then(() => {
                    processTTSQueue();
                  });
                } else {
                  ttsQueue.push({ sentence, index: currentIndex });
                  processTTSQueue();
                }
              }
            }
          }
        },
      });

      if (getTextOnly(sentenceBuffer)) {
        const currentIndex = audioIndex++;
        if (!firstSentenceSent) {
          firstSentenceSent = true;
          await sendToTTS(sentenceBuffer, currentIndex);
        } else {
          ttsQueue.push({ sentence: sentenceBuffer, index: currentIndex });
          processTTSQueue();
        }
      }

      llmComplete = true;

      if (!firstSentenceSent || (ttsQueue.length === 0 && !isProcessingTTS)) {
        ttsCompleteResolve();
      }

      const aiResponse =
        fullContent || "申し訳ありません、応答を生成できませんでした。";
      console.log("LLM generation completed");

      // Save AI response
      chatService
        .addMessage(convId, "assistant", aiResponse)
        .then((savedMessage) => {
          if (savedMessage) {
            const lastUserMessage = existingMessages
              .filter((m: { role: string }) => m.role === "user")
              .pop();
            ragService
              .addConversationToRAG({
                conversationId: convId!,
                questionId: lastUserMessage?.id || `user_${Date.now()}`,
                answerId: savedMessage.id,
                question: userText,
                answer: aiResponse,
              })
              .catch((err) => {
                console.error("Failed to add conversation to RAG:", err);
              });
          }
        })
        .catch((err) => {
          console.error("Failed to save AI message:", err);
        });

      // Update title if first message
      const userMessages = existingMessages.filter(
        (m: { role: string }) => m.role === "user"
      );
      if (userMessages.length === 0) {
        const title =
          userText.slice(0, 50) + (userText.length > 50 ? "..." : "");
        chatService.updateTitle(convId, title).catch((err) => {
          console.error("Failed to update title:", err);
        });
      }

      await ttsCompletePromise;

      await stream.writeSSE({
        data: JSON.stringify({
          type: "done",
          content: aiResponse,
          conversationId: convId,
        }),
      });
    } catch (error) {
      console.error("Error in voice chat:", error);
      await stream.writeSSE({
        data: JSON.stringify({
          type: "error",
          message: error instanceof Error ? error.message : "Unknown error",
        }),
      });
    }
  });
});

// Wake word detection endpoint
voiceRoutes.post("/detect-wake-word", async (c) => {
  try {
    const body = await c.req.json();
    const { audio, format } = body as {
      audio: string;
      format?: string;
    };

    if (!audio) {
      return c.json({ error: "Audio data is required", detected: false }, 400);
    }

    const asrResult = await qwenASRService.transcribeAudio(
      audio,
      format || "webm"
    );

    if (!asrResult.success || !asrResult.text) {
      return c.json({
        detected: false,
        transcription: "",
        error: asrResult.error || "Transcription failed",
      });
    }

    const transcription = asrResult.text;
    const detected = checkWakeWord(transcription);

    console.log(
      `Wake word check: "${transcription}" -> detected: ${detected}`
    );

    return c.json({
      detected,
      transcription,
    });
  } catch (error) {
    console.error("Error in wake word detection:", error);
    return c.json(
      {
        detected: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      500
    );
  }
});

// Simple ASR endpoint
voiceRoutes.post("/transcribe", async (c) => {
  try {
    const body = await c.req.json();
    const { audioData, audioFormat } = body as {
      audioData: string;
      audioFormat?: string;
    };

    if (!audioData) {
      return c.json({ error: "Audio data is required" }, 400);
    }

    const result = await qwenASRService.transcribeAudio(
      audioData,
      audioFormat || "webm"
    );

    if (!result.success) {
      return c.json({ error: result.error }, 500);
    }

    return c.json({ text: result.text });
  } catch (error) {
    console.error("Error transcribing audio:", error);
    return c.json({ error: "Failed to transcribe audio" }, 500);
  }
});

// Simple TTS endpoint
voiceRoutes.post("/synthesize", async (c) => {
  try {
    const body = await c.req.json();
    const { text, voice } = body as {
      text: string;
      voice?: string;
    };

    if (!text || text.trim().length === 0) {
      return c.json({ error: "Text is required" }, 400);
    }

    const result = await ttsService.synthesizeSpeech(text, voice);

    if (!result.success) {
      return c.json({ error: result.error }, 500);
    }

    return c.json({ audioUrl: result.audioUrl });
  } catch (error) {
    console.error("Error synthesizing speech:", error);
    return c.json({ error: "Failed to synthesize speech" }, 500);
  }
});

export { voiceRoutes, checkWakeWord };
