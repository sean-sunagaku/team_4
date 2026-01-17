import { Hono } from "hono";
import { cors } from "hono/cors";
import { streamSSE } from "hono/streaming";
import dotenv from "dotenv";
import { chatService } from "./services/chat-service.js";
import { AIService } from "./services/ai-service.js";
import { searchWeb, getCurrentDateTime, formatSearchResultsForAI } from "./services/search-service.js";

dotenv.config();

// Initialize AI service
const aiService = new AIService();

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
  if (cachedSystemPromptBase && (now - lastPromptCacheTime) < PROMPT_CACHE_TTL) {
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
    "ニュース", "最新", "現在の", "今日の", "昨日の", "速報",
    "調べて", "検索して", "ググって",
    "天気", "株価", "為替", "相場",
    "〜とは", "について",
    "news", "latest", "current", "today",
  ];

  const lowerContent = content.toLowerCase();
  if (alwaysSearchKeywords.some(kw => lowerContent.includes(kw.toLowerCase()))) {
    return true;
  }

  const questionIndicators = [
    /？$/, /\?$/,
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

const app = new Hono();
const PORT = process.env.PORT || 3001;
const CLIENT_URLS = [
  process.env.CLIENT_URL || "http://localhost:3000",
  "http://localhost:3002",
  "http://localhost:3003",
];

// CORS middleware
app.use("/*", cors({
  origin: CLIENT_URLS,
  allowMethods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
  credentials: true,
}));

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
    const conversations = await chatService.getUserConversations(ANONYMOUS_USER_ID);
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
    const conversation = await chatService.createConversation(ANONYMOUS_USER_ID, title);
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
    const conversation = await chatService.getOrCreateConversation(ANONYMOUS_USER_ID, id);

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
  const conversation = await chatService.getOrCreateConversation(ANONYMOUS_USER_ID, id);

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
          ? searchWeb(content).catch(err => {
              console.error("Search failed:", err);
              return { success: false, results: [] };
            })
          : Promise.resolve({ success: false, results: [] }),
        // Fire-and-forget: save user message without blocking
        chatService.addMessage(id, "user", content).catch(err => {
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

      // Stream AI response
      const result = await aiService.sendMessage(aiMessages, (chunk: string) => {
        fullContent += chunk;
        stream.writeSSE({ data: JSON.stringify({ type: "text", content: chunk }) });
      });

      const aiResponse = result.content || fullContent || "申し訳ありません、応答を生成できませんでした。";

      // OPTIMIZATION: Post-stream operations run in background (non-blocking)
      const postStreamOps = async () => {
        try {
          // Save AI response
          await chatService.addMessage(id, "assistant", aiResponse);

          // Update conversation title if it's the first user message
          const userMessages = messages.filter((m: { role: string }) => m.role === "user");
          if (userMessages.length === 0) {
            const title = content.slice(0, 50) + (content.length > 50 ? "..." : "");
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
        data: JSON.stringify({ type: "error", message: error instanceof Error ? error.message : "Unknown error" }),
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

    const conversation = await chatService.getOrCreateConversation(ANONYMOUS_USER_ID, id);

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

// Export for Bun
export default {
  port: Number(PORT),
  fetch: app.fetch,
};

console.log(`Server running on port ${PORT}`);
