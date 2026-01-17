import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { chatService } from "./services/chat-service.js";
import { AIService } from "./services/ai-service.js";
import { searchWeb, getCurrentDateTime, formatSearchResultsForAI } from "./services/search-service.js";

dotenv.config({ quiet: true });

// Initialize AI service
const aiService = new AIService();

// Anonymous user ID (no authentication)
const ANONYMOUS_USER_ID = "anonymous-user";

/**
 * Build system prompt with current date/time info
 */
function buildSystemPrompt() {
  const datetime = getCurrentDateTime();

  return `あなたは親切で知識豊富なAIアシスタントです。

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
}

/**
 * Check if message needs web search
 * More intelligent detection - considers question type and content
 */
function needsWebSearch(content) {
  // Skip very short messages
  if (content.length < 3) return false;

  // Conversational patterns that don't need search
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

  // High-priority search triggers (always search)
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

  // Question indicators - if it looks like a factual question, search
  const questionIndicators = [
    /？$/, /\?$/,                           // Ends with question mark
    /(何|なに|なん)(です|だ|ですか)/, // What is
    /(誰|だれ)(です|だ|ですか)/,      // Who is
    /(どこ|何処)(です|だ|ですか|に|で)/, // Where
    /(いつ|何時)(です|だ|ですか)/,    // When
    /(なぜ|何故|どうして)/,              // Why
    /(どう|どのよう)(です|だ|に|して)/, // How
    /(いくら|何円|何ドル)/,               // How much
    /教えて/,                                // Tell me
    /知りたい/,                              // Want to know
    /わかる？|分かる？/,                   // Do you know
  ];

  for (const pattern of questionIndicators) {
    if (pattern.test(content)) {
      // Additional check: is this asking about facts/real-world info?
      const factualTopics = [
        /人|人物|会社|企業|国|都市|場所|イベント|事件|出来事/,
        /価格|値段|料金|費用/,
        /方法|やり方|手順|仕方/,
        /意味|定義|説明/,
        /歴史|経緯|由来/,
        /比較|違い|差/,
        /おすすめ|推奨|人気|ランキング/,
      ];

      // If it matches question pattern, likely needs search for factual info
      return true;
    }
  }

  return false;
}

const app = express();
const PORT = process.env.PORT || 3001;
const CLIENT_URLS = [
  process.env.CLIENT_URL || "http://localhost:3000",
  "http://localhost:3002",
  "http://localhost:3003",
];

app.use(
  cors({
    origin: CLIENT_URLS,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
    credentials: true,
  })
);

app.use(express.json());

app.get("/", (req, res) => {
  res.json({ message: "Team 4 Chat Server" });
});

// ============================================
// Chat API Endpoints
// ============================================

// Get all conversations
app.get("/api/chat/conversations", async (req, res) => {
  try {
    const conversations = await chatService.getUserConversations(ANONYMOUS_USER_ID);
    return res.json({ conversations });
  } catch (error) {
    console.error("Error fetching conversations:", error);
    return res.status(500).json({ error: "Failed to fetch conversations" });
  }
});

// Create a new conversation
app.post("/api/chat/conversations", async (req, res) => {
  try {
    const { title } = req.body;
    const conversation = await chatService.createConversation(ANONYMOUS_USER_ID, title);
    return res.json({ conversation });
  } catch (error) {
    console.error("Error creating conversation:", error);
    return res.status(500).json({ error: "Failed to create conversation" });
  }
});

// Get a specific conversation with messages
app.get("/api/chat/conversations/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const conversation = await chatService.getOrCreateConversation(ANONYMOUS_USER_ID, id);

    if (!conversation) {
      return res.status(404).json({ error: "Conversation not found" });
    }

    return res.json({ conversation });
  } catch (error) {
    console.error("Error fetching conversation:", error);
    return res.status(500).json({ error: "Failed to fetch conversation" });
  }
});

// Send a message and get AI response with streaming
app.post("/api/chat/conversations/:id/messages/stream", async (req, res) => {
  try {
    const { id } = req.params;
    const { content } = req.body;

    if (!content || content.trim().length === 0) {
      return res.status(400).json({ error: "Message content is required" });
    }

    // Verify conversation exists
    const conversation = await chatService.getOrCreateConversation(ANONYMOUS_USER_ID, id);

    if (!conversation) {
      return res.status(404).json({ error: "Conversation not found" });
    }

    // Set up SSE headers
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.setHeader("Access-Control-Allow-Origin", req.headers.origin || CLIENT_URLS[0]);
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.flushHeaders();

    // Save user message
    await chatService.addMessage(id, "user", content);

    // Get all messages for context
    const messages = await chatService.getMessages(id);

    // Build system prompt with current datetime
    let systemPrompt = buildSystemPrompt();

    // Check if web search is needed
    if (needsWebSearch(content)) {
      console.log("Searching web for:", content);
      const searchResult = await searchWeb(content);
      if (searchResult.success && searchResult.results.length > 0) {
        const searchInfo = formatSearchResultsForAI(searchResult);
        systemPrompt += `\n\n## Web検索結果\n${searchInfo}`;
        console.log("Search results added to context");
      }
    }

    // Build AI messages
    const aiMessages = [
      { role: "system", content: systemPrompt },
      ...chatService.formatMessagesForAI(messages),
    ];

    let fullContent = "";

    // Helper to write SSE and flush
    const writeSSE = (data) => {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
      if (res.flush) res.flush();
    };

    // Stream AI response
    const result = await aiService.sendMessage(aiMessages, (chunk) => {
      fullContent += chunk;
      writeSSE({ type: "text", content: chunk });
    });

    const aiResponse = result.content || fullContent || "申し訳ありません、応答を生成できませんでした。";

    // Save AI response
    await chatService.addMessage(id, "assistant", aiResponse);

    // Update conversation title if it's the first user message
    const userMessages = messages.filter((m) => m.role === "user");
    if (userMessages.length === 0) {
      const title = content.slice(0, 50) + (content.length > 50 ? "..." : "");
      await chatService.updateTitle(id, title);
    }

    // Send final message
    writeSSE({
      type: "done",
      content: aiResponse,
    });

    res.end();
  } catch (error) {
    console.error("Error in streaming message:", error);
    res.write(`data: ${JSON.stringify({ type: "error", message: error.message })}\n\n`);
    res.end();
  }
});

// Delete a conversation
app.delete("/api/chat/conversations/:id", async (req, res) => {
  try {
    const { id } = req.params;
    await chatService.deleteConversation(id, ANONYMOUS_USER_ID);
    return res.json({ success: true });
  } catch (error) {
    console.error("Error deleting conversation:", error);
    return res.status(500).json({ error: "Failed to delete conversation" });
  }
});

// Update conversation title
app.patch("/api/chat/conversations/:id/title", async (req, res) => {
  try {
    const { id } = req.params;
    const { title } = req.body;

    if (!title || title.trim().length === 0) {
      return res.status(400).json({ error: "Title is required" });
    }

    // Verify conversation exists
    const conversation = await chatService.getOrCreateConversation(ANONYMOUS_USER_ID, id);

    if (!conversation) {
      return res.status(404).json({ error: "Conversation not found" });
    }

    await chatService.updateTitle(id, title);

    return res.json({ success: true });
  } catch (error) {
    console.error("Error updating title:", error);
    return res.status(500).json({ error: "Failed to update title" });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
