import { Hono } from "hono";
import { cors } from "hono/cors";
import { streamSSE } from "hono/streaming";
import dotenv from "dotenv";
import { chatService } from "./services/chat-service.js";
import {
  searchWeb,
  getCurrentDateTime,
  formatSearchResultsForAI,
} from "./services/search-service.js";
import { ragService } from "./services/rag-service.js";
import { qwenASRService } from "./services/qwen-asr-service.js";
import { qwenLLMService } from "./services/qwen-llm-service.js";
import { qwenTTSService } from "./services/qwen-tts-service.js";

dotenv.config();

// Anonymous user ID (no authentication)
const ANONYMOUS_USER_ID = "anonymous-user";

// Cache for system prompt base (regenerated only when datetime changes significantly)
let cachedSystemPromptBase: string | null = null;
let lastPromptCacheTime = 0;
const PROMPT_CACHE_TTL = 60000; // 1 minute cache

/**
 * Build system prompt with current date/time info (with caching)
 */
function buildSystemPrompt(): string {
  const now = Date.now();

  // Use cached base if within TTL
  if (cachedSystemPromptBase && now - lastPromptCacheTime < PROMPT_CACHE_TTL) {
    return cachedSystemPromptBase;
  }

  const datetime = getCurrentDateTime();

  cachedSystemPromptBase = `あなたは親切で知識豊富なAIアシスタントです。

## 現在の日時情報
- 現在の日時: ${datetime.fullDate} ${datetime.time}
- 今日の曜日: ${datetime.dayOfWeek}
- 今日の日付: ${datetime.year}${datetime.month}${datetime.day}

## 重要なルール

### 1. 日時に関する質問
「今日は何曜日？」「今日の日付は？」などの質問には、上記の「現在の日時情報」を参照して正確に回答してください。

### 2. 会話の流れについて
- ユーザーとの過去の会話内容を覚えておいてください
- 前の発言を踏まえて、文脈に沿った回答をしてください
- ユーザーが以前言及した情報（名前、好み、状況など）を覚えておいてください
- 「さっきの」「それ」「あれ」などの指示語は、会話履歴から適切に解釈してください

### 3. 回答スタイル
- 日本語で回答してください
- 親切で分かりやすい説明を心がけてください
- 必要に応じて具体例を挙げてください`;

  lastPromptCacheTime = now;
  return cachedSystemPromptBase;
}

/**
 * Check if message needs web search
 */
function needsWebSearch(content: string): boolean {
  if (content.length < 3) return false;

  const conversationalPatterns = [
    /^(こんにちは|こんばんは|おはよう|ありがとう|さようなら|よろしく)/,
    /^(はい|いいえ|うん|ええ|そうです)/,
    /^(元気|調子|気分)/,
    /お願い(します)?$/,
    /^(あなたは|君は).*(誰|何|AI)/,
  ];

  for (const pattern of conversationalPatterns) {
    if (pattern.test(content)) return false;
  }

  const alwaysSearchKeywords = [
    "ニュース",
    "最新",
    "現在の",
    "今日の",
    "昨日の",
    "速報",
    "調べて",
    "検索して",
    "ググって",
    "天気",
    "株価",
    "為替",
    "相場",
    "〜とは",
    "について",
    "news",
    "latest",
    "current",
    "today",
  ];

  const lowerContent = content.toLowerCase();
  if (
    alwaysSearchKeywords.some((kw) => lowerContent.includes(kw.toLowerCase()))
  ) {
    return true;
  }

  const questionIndicators = [
    /？$/,
    /\?$/,
    /(何|なに|なん)(です|だ|ですか)/,
    /(誰|だれ)(です|だ|ですか)/,
    /(どこ|何処)(です|だ|ですか|に|で)/,
    /(いつ|何時)(です|だ|ですか)/,
    /(なぜ|何故|どうして)/,
    /(どう|どのよう)(です|だ|に|して)/,
    /(いくら|何円|何ドル)/,
    /教えて/,
    /知りたい/,
    /わかる？|分かる？/,
  ];

  for (const pattern of questionIndicators) {
    if (pattern.test(content)) {
      return true;
    }
  }

  return false;
}

/**
 * Check if message needs RAG search (car/driving related)
 */
function needsRAGSearch(content: string): boolean {
  const ragKeywords = [
    // 車関連
    "車",
    "運転",
    "ドライブ",
    "走行",
    "駐車",
    "パーキング",
    // プリウス固有
    "プリウス",
    "prius",
    "ハイブリッド",
    "HV",
    // 操作関連
    "ブレーキ",
    "アクセル",
    "ハンドル",
    "シフト",
    "ギア",
    "エンジン",
    "始動",
    "停止",
    "スタート",
    "ストップ",
    // 機能関連
    "ナビ",
    "エアコン",
    "クーラー",
    "ヒーター",
    "ライト",
    "ワイパー",
    "ドア",
    "窓",
    "ミラー",
    "シート",
    "トランク",
    // 警告・トラブル
    "警告",
    "エラー",
    "故障",
    "異常",
    "トラブル",
    "ランプ",
    "点灯",
    // 取扱説明書
    "取扱",
    "説明書",
    "マニュアル",
    "使い方",
    "操作方法",
  ];

  const lowerContent = content.toLowerCase();
  return ragKeywords.some((kw) => lowerContent.includes(kw.toLowerCase()));
}

const app = new Hono();
const PORT = process.env.PORT || 3001;
const CLIENT_URLS = [
  process.env.CLIENT_URL || "http://localhost:3000",
  "http://localhost:3002",
  "http://localhost:3003",
];

// CORS middleware
app.use(
  "/*",
  cors({
    origin: CLIENT_URLS,
    allowMethods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
    credentials: true,
  }),
);

// Root endpoint
app.get("/", (c) => {
  return c.json({ message: "Team 4 Chat Server (Hono + Bun)" });
});

// ============================================
// Chat API Endpoints
// ============================================

// Get all conversations
app.get("/api/chat/conversations", async (c) => {
  try {
    const conversations =
      await chatService.getUserConversations(ANONYMOUS_USER_ID);
    return c.json({ conversations });
  } catch (error) {
    console.error("Error fetching conversations:", error);
    return c.json({ error: "Failed to fetch conversations" }, 500);
  }
});

// Create a new conversation
app.post("/api/chat/conversations", async (c) => {
  try {
    const body = await c.req.json();
    const { title } = body;
    const conversation = await chatService.createConversation(
      ANONYMOUS_USER_ID,
      title,
    );
    return c.json({ conversation });
  } catch (error) {
    console.error("Error creating conversation:", error);
    return c.json({ error: "Failed to create conversation" }, 500);
  }
});

// Get a specific conversation with messages
app.get("/api/chat/conversations/:id", async (c) => {
  try {
    const id = c.req.param("id");
    const conversation = await chatService.getOrCreateConversation(
      ANONYMOUS_USER_ID,
      id,
    );

    if (!conversation) {
      return c.json({ error: "Conversation not found" }, 404);
    }

    return c.json({ conversation });
  } catch (error) {
    console.error("Error fetching conversation:", error);
    return c.json({ error: "Failed to fetch conversation" }, 500);
  }
});

// Send a message and get AI response with streaming (OPTIMIZED)
app.post("/api/chat/conversations/:id/messages/stream", async (c) => {
  const id = c.req.param("id");

  let content: string;
  try {
    const body = await c.req.json();
    content = body.content;
  } catch {
    return c.json({ error: "Invalid request body" }, 400);
  }

  if (!content || content.trim().length === 0) {
    return c.json({ error: "Message content is required" }, 400);
  }

  // Verify conversation exists
  const conversation = await chatService.getOrCreateConversation(
    ANONYMOUS_USER_ID,
    id,
  );

  if (!conversation) {
    return c.json({ error: "Conversation not found" }, 404);
  }

  return streamSSE(c, async (stream) => {
    try {
      // OPTIMIZATION: Start building system prompt immediately (cached)
      let systemPrompt = buildSystemPrompt();

      // OPTIMIZATION: Determine if web search is needed early
      const shouldSearch = needsWebSearch(content);

      // OPTIMIZATION: Run parallel operations
      // - Get existing messages (for context)
      // - Save user message (fire-and-forget pattern for non-blocking)
      // - Start web search if needed (parallel with message operations)
      const [messages, searchResult] = await Promise.all([
        chatService.getMessages(id),
        shouldSearch
          ? searchWeb(content).catch((err) => {
              console.error("Search failed:", err);
              return { success: false, results: [] };
            })
          : Promise.resolve({ success: false, results: [] }),
        // Fire-and-forget: save user message without blocking
        chatService.addMessage(id, "user", content).catch((err) => {
          console.error("Failed to save user message:", err);
        }),
      ]);

      // Add search results to prompt if available
      if (searchResult.success && searchResult.results.length > 0) {
        const searchInfo = formatSearchResultsForAI(searchResult);
        systemPrompt += `\n\n## Web検索結果\n${searchInfo}`;
        console.log("Search results added to context");
      }

      // Build AI messages with current user message included
      const aiMessages = [
        { role: "system" as const, content: systemPrompt },
        ...chatService.formatMessagesForAI(messages),
        { role: "user" as const, content: content }, // Add current message directly
      ];

      let fullContent = "";

      // Stream AI response using Qwen LLM
      await qwenLLMService.sendMessageStream(aiMessages, {
        onChunk: (chunk: string) => {
          fullContent += chunk;
          stream.writeSSE({
            data: JSON.stringify({ type: "text", content: chunk }),
          });
        },
      });

      const aiResponse =
        fullContent || "申し訳ありません、応答を生成できませんでした。";

      // OPTIMIZATION: Post-stream operations run in background (non-blocking)
      const postStreamOps = async () => {
        try {
          // Save AI response
          await chatService.addMessage(id, "assistant", aiResponse);

          // Update conversation title if it's the first user message
          const userMessages = messages.filter(
            (m: { role: string }) => m.role === "user",
          );
          if (userMessages.length === 0) {
            const title =
              content.slice(0, 50) + (content.length > 50 ? "..." : "");
            await chatService.updateTitle(id, title);
          }
        } catch (err) {
          console.error("Post-stream operation failed:", err);
        }
      };

      // Start post-stream operations without blocking
      postStreamOps();

      // Send final message immediately
      await stream.writeSSE({
        data: JSON.stringify({
          type: "done",
          content: aiResponse,
        }),
      });
    } catch (error) {
      console.error("Error in streaming message:", error);
      await stream.writeSSE({
        data: JSON.stringify({
          type: "error",
          message: error instanceof Error ? error.message : "Unknown error",
        }),
      });
    }
  });
});

// Delete a conversation
app.delete("/api/chat/conversations/:id", async (c) => {
  try {
    const id = c.req.param("id");
    await chatService.deleteConversation(id, ANONYMOUS_USER_ID);
    return c.json({ success: true });
  } catch (error) {
    console.error("Error deleting conversation:", error);
    return c.json({ error: "Failed to delete conversation" }, 500);
  }
});

// Update conversation title
app.patch("/api/chat/conversations/:id/title", async (c) => {
  try {
    const id = c.req.param("id");
    const body = await c.req.json();
    const { title } = body;

    if (!title || title.trim().length === 0) {
      return c.json({ error: "Title is required" }, 400);
    }

    const conversation = await chatService.getOrCreateConversation(
      ANONYMOUS_USER_ID,
      id,
    );

    if (!conversation) {
      return c.json({ error: "Conversation not found" }, 404);
    }

    await chatService.updateTitle(id, title);

    return c.json({ success: true });
  } catch (error) {
    console.error("Error updating title:", error);
    return c.json({ error: "Failed to update title" }, 500);
  }
});

// ============================================
// RAG API Endpoints
// ============================================

// Get RAG system status
app.get("/api/rag/status", async (c) => {
  try {
    const status = await ragService.getStatus();
    return c.json(status);
  } catch (error) {
    console.error("Error getting RAG status:", error);
    return c.json({ error: "Failed to get RAG status" }, 500);
  }
});

// Initialize RAG system
app.post("/api/rag/init", async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const { filePath } = body as { filePath?: string };

    const result = await ragService.initialize(filePath);

    if (!result.success) {
      return c.json({ error: result.message, documentCount: 0 }, 400);
    }

    return c.json(result);
  } catch (error) {
    console.error("Error initializing RAG:", error);
    return c.json({ error: "Failed to initialize RAG" }, 500);
  }
});

// Reindex RAG system
app.post("/api/rag/reindex", async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const { filePath } = body as { filePath?: string };

    const result = await ragService.reindex(filePath);

    if (!result.success) {
      return c.json({ error: result.message, documentCount: 0 }, 400);
    }

    return c.json(result);
  } catch (error) {
    console.error("Error reindexing RAG:", error);
    return c.json({ error: "Failed to reindex RAG" }, 500);
  }
});

// Search with RAG (POST)
app.post("/api/rag/search", async (c) => {
  try {
    const body = await c.req.json();
    const { query, topK, useHybrid } = body as {
      query: string;
      topK?: number;
      useHybrid?: boolean;
    };

    if (!query || query.trim().length === 0) {
      return c.json({ error: "Query is required" }, 400);
    }

    const results = await ragService.search(query, { topK, useHybrid });
    const formattedForAI = ragService.formatResultsForAI(results);

    return c.json({
      query,
      results,
      formattedForAI,
      count: results.length,
    });
  } catch (error) {
    console.error("Error searching RAG:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    return c.json({ error: `Failed to search: ${errorMessage}` }, 500);
  }
});

// Search with RAG (GET)
app.get("/api/rag/search", async (c) => {
  try {
    const query = c.req.query("q");
    const topKParam = c.req.query("topK");
    const useHybridParam = c.req.query("useHybrid");

    if (!query || query.trim().length === 0) {
      return c.json({ error: "Query parameter 'q' is required" }, 400);
    }

    const topK = topKParam ? parseInt(topKParam, 10) : undefined;
    const useHybrid = useHybridParam !== "false";

    const results = await ragService.search(query, { topK, useHybrid });
    const formattedForAI = ragService.formatResultsForAI(results);

    return c.json({
      query,
      results,
      formattedForAI,
      count: results.length,
    });
  } catch (error) {
    console.error("Error searching RAG:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    return c.json({ error: `Failed to search: ${errorMessage}` }, 500);
  }
});

// ============================================
// Voice Chat API Endpoints (Qwen ASR + LLM + TTS)
// ============================================

// Voice chat endpoint - receives audio, returns text + audio response
app.post("/api/voice/chat", async (c) => {
  let audioData: string;
  let audioFormat: string;
  let conversationId: string | undefined;

  try {
    const body = await c.req.json();
    audioData = body.audioData;
    audioFormat = body.audioFormat || "webm";
    conversationId = body.conversationId;
  } catch {
    return c.json({ error: "Invalid request body" }, 400);
  }

  if (!audioData) {
    return c.json({ error: "Audio data is required" }, 400);
  }

  return streamSSE(c, async (stream) => {
    try {
      // Step 1: ASR - Convert audio to text
      console.log("Starting ASR transcription...");
      const asrResult = await qwenASRService.transcribeAudio(
        audioData,
        audioFormat,
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

      // Send transcription to client
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

      // Save user message (fire-and-forget)
      chatService.addMessage(convId, "user", userText).catch((err) => {
        console.error("Failed to save user message:", err);
      });

      // Step 2: Build messages for LLM
      let systemPrompt = buildSystemPrompt();
      const existingMessages = await chatService.getMessages(convId);

      // RAG検索（車関連の質問の場合）
      if (needsRAGSearch(userText)) {
        console.log("RAG search needed for:", userText);
        try {
          const ragResults = await ragService.search(userText, { topK: 3 });
          if (ragResults.length > 0) {
            const ragContext = ragService.formatResultsForAI(ragResults);
            systemPrompt += `\n\n## プリウス取扱説明書からの参考情報\n以下の情報を参考にして回答してください：\n${ragContext}`;
            console.log("RAG results added to context");
          }
        } catch (err) {
          console.error("RAG search failed:", err);
        }
      }

      const aiMessages = [
        { role: "system" as const, content: systemPrompt },
        ...chatService.formatMessagesForAI(existingMessages),
        { role: "user" as const, content: userText },
      ];

      // Step 3: LLM - Generate response with streaming TTS
      console.log("Starting LLM generation with streaming TTS...");
      let fullContent = "";
      let sentenceBuffer = "";
      let audioIndex = 0;

      // Phase 1 & 2: TTS Queue for sequential processing + first sentence prefetch
      const ttsQueue: { sentence: string; index: number }[] = [];
      let isProcessingTTS = false;
      let firstSentenceSent = false;
      let ttsCompleteResolve: () => void;
      const ttsCompletePromise = new Promise<void>((resolve) => {
        ttsCompleteResolve = resolve;
      });
      let llmComplete = false;

      // Sentence boundary patterns
      const sentenceEndPattern = /[。！？\n]/;

      // Emoji pattern for filtering
      const emojiPattern =
        /[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{1F600}-\u{1F64F}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]/gu;

      // Helper to convert markdown to plain text for TTS
      const getTextOnly = (text: string) => {
        let result = text
          // Remove emojis
          .replace(emojiPattern, "")
          // Remove horizontal rules (---, ***, ___)
          .replace(/^[-*_]{3,}\s*$/gm, "")
          // Remove headers (###, ##, #)
          .replace(/^#{1,6}\s+/gm, "")
          // Remove bold/italic markers (**text**, *text*, __text__, _text_)
          .replace(/\*\*([^*]+)\*\*/g, "$1")
          .replace(/\*([^*]+)\*/g, "$1")
          .replace(/__([^_]+)__/g, "$1")
          .replace(/_([^_]+)_/g, "$1")
          // Remove blockquotes (> text)
          .replace(/^>\s*/gm, "")
          // Remove inline code (`code`)
          .replace(/`([^`]+)`/g, "$1")
          // Remove links [text](url) -> text
          .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
          // Remove bullet list markers (-, *, +) but keep numbered lists (1., 2., etc.)
          .replace(/^[\s]*[-*+]\s+/gm, "")
          // Remove extra whitespace
          .replace(/\s+/g, " ")
          .trim();
        return result;
      };

      // Helper for delay (rate limit avoidance)
      const sleep = (ms: number) =>
        new Promise((resolve) => setTimeout(resolve, ms));

      // Function to send a sentence to TTS
      const sendToTTS = async (sentence: string, index: number) => {
        const textOnly = getTextOnly(sentence);
        if (!textOnly) return;
        console.log(`TTS[${index}]: "${textOnly.slice(0, 30)}..."`);

        const ttsResult = await qwenTTSService.synthesizeSpeech(textOnly);
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

      // Phase 1: Sequential TTS queue processor (avoids 429 rate limit errors)
      const processTTSQueue = async () => {
        if (isProcessingTTS) return;
        isProcessingTTS = true;

        while (ttsQueue.length > 0) {
          const item = ttsQueue.shift()!;
          await sendToTTS(item.sentence, item.index);
          // Small delay between TTS calls to avoid rate limiting
          if (ttsQueue.length > 0) {
            await sleep(100);
          }
        }

        isProcessingTTS = false;

        // Check if we're done (LLM complete and queue empty)
        if (llmComplete && ttsQueue.length === 0) {
          ttsCompleteResolve();
        }
      };

      await qwenLLMService.sendMessageStream(aiMessages, {
        onChunk: async (chunk) => {
          fullContent += chunk;
          sentenceBuffer += chunk;

          // Send text chunk to client
          await stream.writeSSE({
            data: JSON.stringify({ type: "text", content: chunk }),
          });

          // Check for sentence boundaries
          while (sentenceEndPattern.test(sentenceBuffer)) {
            const match = sentenceBuffer.match(sentenceEndPattern);
            if (match && match.index !== undefined) {
              const sentence = sentenceBuffer.slice(0, match.index + 1);
              sentenceBuffer = sentenceBuffer.slice(match.index + 1);

              // Only send to TTS if sentence has actual text content (not just emojis)
              if (getTextOnly(sentence)) {
                const currentIndex = audioIndex++;

                // Phase 2: First sentence prefetch - send immediately (bypass queue)
                if (!firstSentenceSent) {
                  firstSentenceSent = true;
                  console.log("First sentence detected - sending to TTS immediately");
                  // Fire and continue - don't await to minimize TTFA
                  sendToTTS(sentence, currentIndex).then(() => {
                    // After first sentence completes, start processing queue
                    processTTSQueue();
                  });
                } else {
                  // Subsequent sentences go to queue for sequential processing
                  ttsQueue.push({ sentence, index: currentIndex });
                  // Start queue processing if not already running
                  processTTSQueue();
                }
              }
            }
          }
        },
      });

      // Send any remaining text to TTS
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

      // Mark LLM as complete
      llmComplete = true;

      // If no TTS was needed or queue is empty, resolve immediately
      if (!firstSentenceSent || (ttsQueue.length === 0 && !isProcessingTTS)) {
        ttsCompleteResolve();
      }

      const aiResponse =
        fullContent || "申し訳ありません、応答を生成できませんでした。";
      console.log("LLM generation completed");

      // Save AI response (fire-and-forget)
      chatService.addMessage(convId, "assistant", aiResponse).catch((err) => {
        console.error("Failed to save AI message:", err);
      });

      // Update conversation title if first message
      const userMessages = existingMessages.filter(
        (m: { role: string }) => m.role === "user",
      );
      if (userMessages.length === 0) {
        const title =
          userText.slice(0, 50) + (userText.length > 50 ? "..." : "");
        chatService.updateTitle(convId, title).catch((err) => {
          console.error("Failed to update title:", err);
        });
      }

      // Wait for all TTS to complete (sequential queue)
      await ttsCompletePromise;

      // Send completion
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

// Simple ASR endpoint - just transcribe audio
app.post("/api/voice/transcribe", async (c) => {
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
      audioFormat || "webm",
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

// Simple TTS endpoint - just synthesize speech
app.post("/api/voice/synthesize", async (c) => {
  try {
    const body = await c.req.json();
    const { text, voice } = body as {
      text: string;
      voice?: string;
    };

    if (!text || text.trim().length === 0) {
      return c.json({ error: "Text is required" }, 400);
    }

    const result = await qwenTTSService.synthesizeSpeech(text, voice);

    if (!result.success) {
      return c.json({ error: result.error }, 500);
    }

    return c.json({ audioUrl: result.audioUrl });
  } catch (error) {
    console.error("Error synthesizing speech:", error);
    return c.json({ error: "Failed to synthesize speech" }, 500);
  }
});

// Export for Bun
export default {
  port: Number(PORT),
  fetch: app.fetch,
};

console.log(`Server running on port ${PORT}`);
