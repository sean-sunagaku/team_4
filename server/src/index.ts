import { Hono } from "hono";
import { cors } from "hono/cors";
import { streamSSE } from "hono/streaming";
import { zValidator } from "@hono/zod-validator";
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
import { localTTSService } from "./services/local-tts-service.js";
import { qwenRealtimeService } from "./services/qwen-realtime-service.js";
import { detectLanguage, isLanguageConfident, type SupportedLanguage } from "./services/language-detection-service.js";
import { getEmotionPrompt, getEmotionTTSConfig, determineEmotion } from "./services/emotion-prompt-service.js";
import {
  MOCK_ENABLED,
  MOCK_LOCATION,
  getMockLocation,
  getMockCarData,
  getMockDealers,
} from "./mock/mock-data.js";

// TTS mode selection:
// - 'browser': Use browser's Web Speech API (fastest, <50ms)
// - 'local': Use Edge TTS (50-200ms) - currently not working due to API restrictions
// - 'qwen': Use Qwen TTS API (500-2000ms)
const TTS_MODE = process.env.TTS_MODE || 'browser'; // Default: browser TTS
const USE_BROWSER_TTS = TTS_MODE === 'browser';
const USE_LOCAL_TTS = TTS_MODE === 'local';
const ttsService = USE_LOCAL_TTS ? localTTSService : qwenTTSService;
import WebSocket from "ws";
import { routeService } from "./services/route-service.js";
import { RouteSuggestRequestSchema, type RouteSuggestRequest } from "./types/route.types.js";

dotenv.config();

// Anonymous user ID (no authentication)
const ANONYMOUS_USER_ID = "anonymous-user";

// Location interface for geolocation
interface Location {
  lat: number;
  lng: number;
}

// Log mock status on startup
if (MOCK_ENABLED) {
  console.log(`Mock mode enabled: location=${MOCK_LOCATION.name} (${MOCK_LOCATION.lat}, ${MOCK_LOCATION.lng})`);
}

/**
 * Get location (use mock if enabled, otherwise use provided location)
 */
function getLocation(providedLocation?: Location): Location | undefined {
  const mockLoc = getMockLocation();
  if (mockLoc) {
    return { lat: mockLoc.lat, lng: mockLoc.lng };
  }
  return providedLocation;
}

// Cache for system prompt (language-specific, regenerated when datetime changes)
const cachedSystemPrompts: Record<string, { prompt: string; time: number }> = {};
const PROMPT_CACHE_TTL = 60000; // 1 minute cache

// 言語別の応答指示
const LANGUAGE_INSTRUCTIONS: Record<string, string> = {
  ja: '日本語で簡潔に回答します。',
  en: 'Respond concisely in English.',
  zh: '用简洁的中文回答。',
  ko: '간결하게 한국어로 답변합니다.',
  ru: 'Отвечайте кратко на русском языке.',
  ar: 'أجب بإيجاز باللغة العربية.',
};

/**
 * Build system prompt with current date/time info (with caching)
 * @param language - Response language code (default: 'ja')
 */
function buildSystemPrompt(language: string = 'ja'): string {
  const now = Date.now();
  const cached = cachedSystemPrompts[language];

  // キャッシュが有効な場合は使用
  if (cached && now - cached.time < PROMPT_CACHE_TTL) {
    return cached.prompt;
  }

  const datetime = getCurrentDateTime();
  const langInstruction = LANGUAGE_INSTRUCTIONS[language] || LANGUAGE_INSTRUCTIONS.ja;

  // システムプロンプト（言語に応じた指示）
  const prompt = `親切なAIアシスタントです。${langInstruction}
現在: ${datetime.fullDate} ${datetime.time}（${datetime.dayOfWeek}）
会話履歴を踏まえて回答してください。`;

  // 言語ごとにキャッシュ
  cachedSystemPrompts[language] = { prompt, time: now };

  return prompt;
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
 * Check if message needs location-based search
 */
function needsLocationSearch(content: string): boolean {
  const locationKeywords = [
    // 場所・店舗検索
    "近く",
    "付近",
    "周辺",
    "最寄り",
    "近所",
    "現在地",
    "ここから",
    "この辺",
    // ディーラー・店舗
    "ディーラー",
    "販売店",
    "店舗",
    "ショールーム",
    "サービスセンター",
    "整備",
    "修理",
    // ガソリンスタンド
    "ガソリン",
    "スタンド",
    "給油",
    "充電",
    "EV充電",
    // 駐車場
    "駐車場",
    "パーキング",
    "コインパーキング",
    // 一般的な場所検索
    "どこ",
    "場所",
    "行き方",
    "道順",
  ];

  const lowerContent = content.toLowerCase();
  return locationKeywords.some((kw) => lowerContent.includes(kw.toLowerCase()));
}

/**
 * Build search query with location info
 */
function buildLocationQuery(content: string, location: Location): string {
  // Add approximate location to search query
  // Using coordinates for search (some search engines support this)
  return `${content} 緯度${location.lat.toFixed(4)} 経度${location.lng.toFixed(4)} 付近`;
}

/**
 * Check if message needs car-related web search (other cars info)
 * Returns true if the message mentions car brands with info keywords
 */
function needsCarSearch(content: string): boolean {
  // Japanese and international car brands
  const carBrands = [
    // Japanese brands
    "トヨタ", "toyota", "ホンダ", "honda", "日産", "nissan", "ニッサン",
    "マツダ", "mazda", "スバル", "subaru", "三菱", "mitsubishi",
    "スズキ", "suzuki", "ダイハツ", "daihatsu", "レクサス", "lexus",
    "インフィニティ", "infiniti", "アキュラ", "acura",
    // European brands
    "ベンツ", "メルセデス", "mercedes", "BMW", "ビーエム",
    "アウディ", "audi", "フォルクスワーゲン", "volkswagen", "VW",
    "ポルシェ", "porsche", "ボルボ", "volvo", "ルノー", "renault",
    "プジョー", "peugeot", "フェラーリ", "ferrari", "ランボルギーニ", "lamborghini",
    // American brands
    "フォード", "ford", "シボレー", "chevrolet", "テスラ", "tesla",
    "ジープ", "jeep", "キャデラック", "cadillac",
    // Korean brands
    "ヒュンダイ", "現代", "hyundai", "キア", "kia",
    // Chinese brands
    "BYD", "ビーワイディー",
    // Specific car models
    "プリウス", "prius", "カローラ", "corolla", "アクア", "aqua",
    "フィット", "fit", "ヴェゼル", "vezel", "シビック", "civic",
    "リーフ", "leaf", "ノート", "note", "セレナ", "serena",
    "CX-5", "CX5", "アテンザ", "デミオ", "マツダ3", "mazda3",
    "フォレスター", "forester", "インプレッサ", "impreza", "レヴォーグ", "levorg",
    "N-BOX", "NBOX", "タント", "tanto", "ワゴンR", "ハスラー", "hustler",
    "クラウン", "crown", "カムリ", "camry", "RAV4", "ハリアー", "harrier",
    "ヤリス", "yaris", "アルファード", "alphard", "ヴォクシー", "voxy",
  ];

  // Keywords that indicate need for car information search
  const carInfoKeywords = [
    // Spec & comparison
    "燃費", "価格", "値段", "スペック", "仕様", "性能",
    "比較", "違い", "どっち", "どちら", "vs",
    // Reviews & ratings
    "評価", "評判", "レビュー", "口コミ", "クチコミ",
    "おすすめ", "オススメ", "人気", "ランキング",
    // Purchase related
    "値引き", "中古", "新車", "見積もり", "下取り",
    "リセールバリュー", "残価", "買い替え",
    // Features
    "装備", "オプション", "グレード", "カラー", "色",
    "サイズ", "寸法", "荷室", "乗り心地", "静粛性",
    // Safety & tech
    "安全", "衝突", "自動ブレーキ", "運転支援", "ADAS",
    "電気自動車", "EV", "ハイブリッド", "PHV", "PHEV",
    // Maintenance
    "維持費", "保険", "税金", "車検",
  ];

  const lowerContent = content.toLowerCase();

  // Check if content mentions any car brand
  const hasBrand = carBrands.some((brand) =>
    lowerContent.includes(brand.toLowerCase())
  );

  // Check if content has car info keywords
  const hasInfoKeyword = carInfoKeywords.some((kw) =>
    lowerContent.includes(kw.toLowerCase())
  );

  // Trigger search if both brand and info keyword are present
  return hasBrand && hasInfoKeyword;
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
// CORS middleware - allow all origins
app.use(
  "/*",
  cors({
    origin: "*",
    allowMethods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
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

    // メッセージも取得
    const messages = await chatService.getMessages(id);

    return c.json({ conversation: { ...conversation, messages } });
  } catch (error) {
    console.error("Error fetching conversation:", error);
    return c.json({ error: "Failed to fetch conversation" }, 500);
  }
});

// Send a message and get AI response with streaming (OPTIMIZED)
app.post("/api/chat/conversations/:id/messages/stream", async (c) => {
  const id = c.req.param("id");

  let content: string;
  let location: Location | undefined;
  try {
    const body = await c.req.json();
    content = body.content;
    location = body.location;
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

      // Get effective location (use mock if enabled)
      const effectiveLocation = getLocation(location);

      // OPTIMIZATION: Determine if web search is needed early
      // Also check for car-related searches (e.g., "ホンダ フィットの燃費は？")
      const shouldSearch = needsWebSearch(content) || needsCarSearch(content);
      const shouldLocationSearch = effectiveLocation && needsLocationSearch(content);

      // Log car search trigger
      if (needsCarSearch(content)) {
        console.log(`Car search triggered: ${content}`);
      }

      // Build search query with location if available
      const searchQuery = shouldLocationSearch
        ? buildLocationQuery(content, effectiveLocation!)
        : content;

      // Log location-based search
      if (shouldLocationSearch) {
        console.log(`Location-based search: ${searchQuery}`);
      }

      // Check similarity cache first (for cached answers from shared knowledge)
      const cacheHit = await ragService.checkSimilarityCache(content);
      if (cacheHit) {
        console.log(`Similarity cache hit! Returning cached answer.`);
        // Stream cached answer
        await stream.writeSSE({
          data: JSON.stringify({ type: "text", content: cacheHit.answer }),
        });
        await stream.writeSSE({
          data: JSON.stringify({
            type: "done",
            content: cacheHit.answer,
            cached: true,
          }),
        });
        // Save messages in background
        chatService.addMessage(id, "user", content).catch(console.error);
        chatService.addMessage(id, "assistant", cacheHit.answer).catch(console.error);
        return;
      }

      // OPTIMIZATION: Run parallel operations
      // - Get existing messages (for context)
      // - Save user message (fire-and-forget pattern for non-blocking)
      // - Start web search if needed (parallel with message operations)
      // - Always search shared knowledge (past conversations)
      // - Search car manual only if car-related keywords
      const [messages, searchResult, sharedKnowledgeResults, carManualResults] = await Promise.all([
        chatService.getMessages(id),
        shouldSearch
          ? searchWeb(searchQuery).catch((err) => {
              console.error("Search failed:", err);
              return { success: false, query: searchQuery, results: [] };
            })
          : Promise.resolve({ success: false, query: '', results: [] }),
        // Always search shared knowledge (past conversations)
        ragService.searchSharedConversations(content, { topK: 3 }).catch((err) => {
          console.error("Shared knowledge search failed:", err);
          return [];
        }),
        // Search car manual only if car-related
        needsRAGSearch(content)
          ? ragService.search(content, { topK: 3 }).catch((err) => {
              console.error("Car manual search failed:", err);
              return [];
            })
          : Promise.resolve([]),
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

      // Add shared knowledge (past conversations) to prompt if available
      if (sharedKnowledgeResults.length > 0) {
        const sharedContext = sharedKnowledgeResults.map((r, i) =>
          `【過去の会話 ${i + 1}】\n${r.text}`
        ).join('\n\n');
        systemPrompt += `\n\n## 過去の会話からの参考情報\n${sharedContext}`;
        console.log(`Shared knowledge results added to context (${sharedKnowledgeResults.length} items)`);
      }

      // Add car manual results to prompt if available
      if (carManualResults.length > 0) {
        const manualContext = ragService.formatResultsForAI(carManualResults);
        systemPrompt += `\n\n## プリウス取扱説明書からの参考情報\n${manualContext}`;
        console.log("Car manual results added to context");
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
          const savedMessage = await chatService.addMessage(id, "assistant", aiResponse);

          // Update conversation title if it's the first user message
          const userMessages = messages.filter(
            (m: { role: string }) => m.role === "user",
          );
          if (userMessages.length === 0) {
            const title =
              content.slice(0, 50) + (content.length > 50 ? "..." : "");
            await chatService.updateTitle(id, title);
          }

          // Register Q&A pair to RAG (for shared knowledge)
          if (savedMessage) {
            const lastUserMessage = messages.filter((m: { role: string }) => m.role === "user").pop();
            ragService.addConversationToRAG({
              conversationId: id,
              questionId: lastUserMessage?.id || `user_${Date.now()}`,
              answerId: savedMessage.id,
              question: content,
              answer: aiResponse,
            }).catch((err) => {
              console.error("Failed to add conversation to RAG:", err);
            });
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
  let ttsMode: string;
  let location: Location | undefined;
  let requestLanguage: string | undefined; // クライアントから渡される言語ヒント
  let userEmotion: string | undefined; // クライアントから渡される感情（WebSocket ASRで検出）

  try {
    const body = await c.req.json();
    audioData = body.audioData;
    audioFormat = body.audioFormat || "webm";
    conversationId = body.conversationId;
    // TTS mode from request, fallback to server default
    ttsMode = body.ttsMode || TTS_MODE;
    location = body.location;
    requestLanguage = body.language; // クライアントからの言語ヒント
    userEmotion = body.emotion; // クライアントからの感情（WebSocket ASRで検出された感情）
  } catch {
    return c.json({ error: "Invalid request body" }, 400);
  }

  if (!audioData) {
    return c.json({ error: "Audio data is required" }, 400);
  }

  // Determine TTS mode for this request
  const useBrowserTts = ttsMode === 'browser';

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

      // 言語検出: 常にテキストから検出（ヒントは参考程度）
      const detectedLang = detectLanguage(userText);
      console.log(`Detected language: ${detectedLang} (hint: ${requestLanguage || 'none'}, text: "${userText.slice(0, 20)}")`);

      // 感情検出: ASR感情とテキスト分析を組み合わせて最終的な感情を決定
      // userEmotionはクライアントから渡されたASR感情（WebSocket ASRで検出）
      // テキストからも感情を分析し、より適切な感情を選択
      const finalEmotion = determineEmotion(userEmotion, userText);
      console.log(`Final emotion: ${finalEmotion} (client ASR: ${userEmotion || 'none'}, text analysis applied)`);

      // Send transcription to client with detected language
      await stream.writeSSE({
        data: JSON.stringify({ type: "transcription", text: userText, language: detectedLang }),
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

      // Step 2: Build messages for LLM (検出言語を使用)
      let systemPrompt = buildSystemPrompt(detectedLang);
      const existingMessages = await chatService.getMessages(convId);

      // Get effective location (use mock if enabled)
      const effectiveLocation = getLocation(location);

      // Check if location-based search is needed
      const shouldLocationSearch = effectiveLocation && needsLocationSearch(userText);
      if (shouldLocationSearch) {
        const locationQuery = buildLocationQuery(userText, effectiveLocation);
        console.log(`Voice: Location-based search: ${locationQuery}`);
        // Add location info to system prompt
        systemPrompt += `\n\n現在地: 緯度${effectiveLocation.lat.toFixed(4)}, 経度${effectiveLocation.lng.toFixed(4)}`;
      }

      // Check if car search is needed
      if (needsCarSearch(userText)) {
        console.log(`Voice: Car search triggered: ${userText}`);
      }

      // 並列でRAG検索を実行
      // - 共有ナレッジは常に検索（過去の会話）
      // - 取扱説明書は車関連キーワードがある場合のみ
      const [sharedKnowledgeResults, carManualResults] = await Promise.all([
        ragService.searchSharedConversations(userText, { topK: 3 }).catch((err) => {
          console.error("Shared knowledge search failed:", err);
          return [];
        }),
        needsRAGSearch(userText)
          ? ragService.search(userText, { topK: 3 }).catch((err) => {
              console.error("Car manual search failed:", err);
              return [];
            })
          : Promise.resolve([]),
      ]);

      // 過去の会話をコンテキストに追加
      if (sharedKnowledgeResults.length > 0) {
        const sharedContext = sharedKnowledgeResults.map((r, i) =>
          `【過去の会話 ${i + 1}】\n${r.text}`
        ).join('\n\n');
        systemPrompt += `\n\n## 過去の会話からの参考情報\n${sharedContext}`;
        console.log(`Shared knowledge results added to context (${sharedKnowledgeResults.length} items)`);
      }

      // 取扱説明書をコンテキストに追加
      if (carManualResults.length > 0) {
        const manualContext = ragService.formatResultsForAI(carManualResults);
        systemPrompt += `\n\n## プリウス取扱説明書からの参考情報\n${manualContext}`;
        console.log("Car manual results added to context");
      }

      // 感情コンテキストを追加（ユーザーの感情に応じた応答指示）
      if (finalEmotion && finalEmotion !== 'neutral') {
        const emotionContext = getEmotionPrompt(finalEmotion);
        if (emotionContext) {
          systemPrompt += emotionContext;
          console.log(`Emotion context added: ${finalEmotion}`);
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
      let ttsCompleteResolve: () => void = () => {};
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

        // Browser TTS mode: send text directly for client-side speech synthesis
        if (useBrowserTts) {
          // 感情に応じたTTS設定を取得（pitch, rate）
          const ttsConfig = getEmotionTTSConfig(finalEmotion);
          await stream.writeSSE({
            data: JSON.stringify({
              type: "tts_text",
              text: textOnly,
              index: index,
              language: detectedLang, // 検出言語をクライアントに送信
              emotion: finalEmotion,  // 感情情報（テキスト分析結果も反映）
              pitch: ttsConfig.pitch, // 声の高さ
              rate: ttsConfig.rate,   // 話速
            }),
          });
          console.log(`TTS[${index}] sent to browser (lang: ${detectedLang}, emotion: ${finalEmotion || 'none'}, pitch: ${ttsConfig.pitch}, rate: ${ttsConfig.rate})`);
          return;
        }

        // Server-side TTS: synthesize audio and send URL (with language support)
        const ttsResult = await ttsService.synthesizeSpeech(textOnly, undefined, undefined, detectedLang);
        if (ttsResult.success && ttsResult.audioUrl) {
          await stream.writeSSE({
            data: JSON.stringify({
              type: "audio",
              url: ttsResult.audioUrl,
              index: index,
              language: detectedLang,
            }),
          });
          console.log(`TTS[${index}] completed (lang: ${detectedLang})`);
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

      // Save AI response and register to RAG (fire-and-forget)
      chatService.addMessage(convId, "assistant", aiResponse)
        .then((savedMessage) => {
          // Register Q&A pair to RAG (for shared knowledge)
          if (savedMessage) {
            const lastUserMessage = existingMessages.filter((m: { role: string }) => m.role === "user").pop();
            ragService.addConversationToRAG({
              conversationId: convId,
              questionId: lastUserMessage?.id || `user_${Date.now()}`,
              answerId: savedMessage.id,
              question: userText,
              answer: aiResponse,
            }).catch((err) => {
              console.error("Failed to add conversation to RAG:", err);
            });
          }
        })
        .catch((err) => {
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

// Wake word detection endpoint
app.post("/api/voice/detect-wake-word", async (c) => {
  try {
    const body = await c.req.json();
    const { audio, format } = body as {
      audio: string;
      format?: string;
    };

    if (!audio) {
      return c.json({ error: "Audio data is required", detected: false }, 400);
    }

    // Use existing Qwen ASR service
    const asrResult = await qwenASRService.transcribeAudio(audio, format || "webm");

    if (!asrResult.success || !asrResult.text) {
      return c.json({
        detected: false,
        transcription: "",
        error: asrResult.error || "Transcription failed"
      });
    }

    const transcription = asrResult.text;

    // Check for wake word patterns - 緩和したパターンマッチング
    const wakeWordPatterns = [
      "ドライバ",      // 基本パターン（「ドライバー」「ドライバで」等にマッチ）
      "どらいば",      // ひらがな
      "drivab",        // ローマ字（部分）
    ];

    const normalized = transcription.toLowerCase();
    const detected = wakeWordPatterns.some(pattern =>
      normalized.includes(pattern.toLowerCase())
    );

    console.log(`Wake word check: "${transcription}" -> detected: ${detected}`);

    return c.json({
      detected,
      transcription
    });
  } catch (error) {
    console.error("Error in wake word detection:", error);
    return c.json({
      detected: false,
      error: error instanceof Error ? error.message : "Unknown error"
    }, 500);
  }
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

// WebSocket upgrade route is handled by Bun.serve() directly

// Wake word patterns for detection (Japanese and English)
const WAKE_WORD_PATTERNS = ["ドライバ", "どらいば", "drivab", "driver", "buddy"];

function checkWakeWord(text: string): boolean {
  const normalized = text.toLowerCase();
  return WAKE_WORD_PATTERNS.some(pattern =>
    normalized.includes(pattern.toLowerCase())
  );
}

// ============================================
// Route Suggestion API Endpoints
// ============================================

// Get route suggestion health status
app.get("/api/route/health", (c) => {
  return c.json({
    success: true,
    data: {
      status: "ok",
      timestamp: new Date().toISOString(),
    },
  });
});

// Suggest a driving practice route
app.post("/api/route/suggest", zValidator("json", RouteSuggestRequestSchema), async (c) => {
  try {
    const body = c.req.valid("json") as RouteSuggestRequest;
    const suggestion = await routeService.suggestRoute(body);
    return c.json({ success: true, data: suggestion });
  } catch (error) {
    console.error("Error suggesting route:", error);
    const message = error instanceof Error ? error.message : "Failed to suggest route";
    const status = (error as any).statusCode || 500;
    return c.json({ success: false, error: message }, status);
  }
});

// Test Google APIs connectivity (for debugging)
app.post("/api/route/test", zValidator("json", RouteSuggestRequestSchema), async (c) => {
  try {
    const body = c.req.valid("json") as RouteSuggestRequest;
    const result = await routeService.testGoogleApis(body);
    return c.json({ success: true, data: result });
  } catch (error) {
    console.error("Error testing Google APIs:", error);
    const message = error instanceof Error ? error.message : "Failed to test APIs";
    return c.json({ success: false, error: message }, 500);
  }
});

// Start server with Bun.serve() for WebSocket support
const server = Bun.serve({
  port: Number(PORT),
  fetch(req, server) {
    // Handle WebSocket upgrade for /ws/asr
    const url = new URL(req.url);
    if (url.pathname === '/ws/asr') {
      const upgraded = server.upgrade(req);
      if (upgraded) {
        return undefined;
      }
      return new Response('WebSocket upgrade failed', { status: 400 });
    }

    // Handle regular HTTP requests with Hono
    return app.fetch(req);
  },
  websocket: {
    open(ws: any) {
      console.log("WebSocket client connected");

      // 初期言語設定（デフォルト: 日本語）
      const initialLanguage: SupportedLanguage = 'ja';

      // ws.dataで言語状態を管理（クロージャ問題を回避）
      ws.data = {
        currentLanguage: initialLanguage,
        session: null,
        isFirstTranscript: true, // 早期言語検出用フラグ
        latestEmotion: null as string | null, // 最新の感情を保存
      };

      // ASRセッション作成関数（言語変更時の再接続用）
      const createSession = (language: SupportedLanguage) => {
        // 言語を更新
        ws.data.currentLanguage = language;
        // 早期言語検出フラグをリセット
        ws.data.isFirstTranscript = true;

        return qwenRealtimeService.createRealtimeASRSession({
          language: language,
          onTranscript: (text, isFinal, emotion) => {
            const currentLang = ws.data.currentLanguage;
            console.log(`ASR transcript: "${text}" (final: ${isFinal}, lang: ${currentLang}, emotion: ${emotion || 'none'})`);
            const wakeWordDetected = checkWakeWord(text);

            // 最新の感情を保存（isFinalでなくても更新）
            if (emotion) {
              ws.data.latestEmotion = emotion;
            }

            // 早期言語検出（案2）: isFinalを待たずに検出し、遅延を削減
            if (ws.data.isFirstTranscript && text.length >= 2) {
              const detectedLang = detectLanguage(text);
              // 検出精度を上げるため、文字種が明確な場合のみ切り替え
              if (detectedLang !== currentLang && isLanguageConfident(text, detectedLang)) {
                ws.data.isFirstTranscript = false;
                console.log(`Early language detection: ${currentLang} → ${detectedLang} (text: "${text}")`);
                // クライアントに言語変更を通知（再接続をリクエスト）
                ws.send(JSON.stringify({
                  type: 'language_change',
                  currentLanguage: currentLang,
                  detectedLanguage: detectedLang,
                  text: text,
                }));
              }
            }

            ws.send(JSON.stringify({
              type: 'transcript',
              text,
              isFinal,
              wakeWordDetected,
              language: currentLang,
              emotion: emotion || ws.data.latestEmotion, // 感情情報を追加
            }));
          },
          onError: (error) => {
            console.error("ASR error:", error);
            ws.send(JSON.stringify({ type: 'error', error }));
          },
          onConnected: () => {
            const lang = ws.data.currentLanguage;
            console.log(`DashScope ASR session ready (language: ${lang})`);
            ws.send(JSON.stringify({ type: 'ready', language: lang }));
          },
          onDisconnected: () => {
            console.log("DashScope ASR session disconnected");
          },
        });
      };

      // 初期セッションを作成
      ws.data.session = createSession(initialLanguage);
      ws.data.createSession = createSession;
    },
    message(ws: any, message: string | Buffer) {
      try {
        const data = JSON.parse(message.toString());

        if (data.type === 'audio' && data.audio) {
          // Forward audio to DashScope
          ws.data?.session?.sendAudio(data.audio);
        } else if (data.type === 'finish') {
          // Signal end of audio
          ws.data?.session?.finishAudio();
        } else if (data.type === 'reconnect_with_language') {
          // 言語変更のための再接続
          const newLanguage = (data.language as SupportedLanguage) || 'ja';
          console.log(`Reconnecting with new language: ${newLanguage}`);

          // 現在のセッションを終了
          ws.data?.session?.close();

          // 新しい言語でセッションを再作成
          ws.data.currentLanguage = newLanguage;
          ws.data.session = ws.data.createSession(newLanguage);
        } else if (data.type === 'set_language') {
          // 言語を設定（再接続なしで次回セッション用）
          const language = (data.language as SupportedLanguage) || 'ja';
          ws.data.currentLanguage = language;
          console.log(`Language set to: ${language}`);
        }
      } catch (err) {
        console.error("WebSocket message error:", err);
      }
    },
    close(ws: any) {
      console.log("WebSocket client disconnected");
      ws.data?.session?.close();
    },
  },
});

console.log(`Server running on port ${PORT}`);
const ttsInfo = USE_BROWSER_TTS
  ? 'Browser (Web Speech API) - <50ms'
  : USE_LOCAL_TTS
    ? 'Local (Edge TTS) - 50-200ms'
    : 'Qwen API - 500-2000ms';
console.log(`TTS Service: ${ttsInfo} per sentence`);
