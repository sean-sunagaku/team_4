/**
 * Context Builder Service
 * Consolidates context-building logic for chat and voice endpoints
 */

import {
  searchWeb,
  getCurrentDateTime,
  formatSearchResultsForAI,
  type SearchResponse,
} from "./search-service.js";
import { ragService } from "./rag-service.js";

// ============================================
// Types
// ============================================

export interface Location {
  lat: number;
  lng: number;
}

export interface ContextBuildOptions {
  content: string;
  location?: Location;
  language?: string;
  skipWebSearch?: boolean;
  skipRAGSearch?: boolean;
}

export interface BuiltContext {
  systemPrompt: string;
  searchResult: SearchResponse;
  sharedKnowledgeResults: Array<{ text: string; score?: number }>;
  carManualResults: Array<{ text: string; score?: number }>;
}

// ============================================
// Search Keyword Lists
// ============================================

const CONVERSATIONAL_PATTERNS = [
  /^(こんにちは|こんばんは|おはよう|ありがとう|さようなら|よろしく)/,
  /^(はい|いいえ|うん|ええ|そうです)/,
  /^(元気|調子|気分)/,
  /お願い(します)?$/,
  /^(あなたは|君は).*(誰|何|AI)/,
];

const ALWAYS_SEARCH_KEYWORDS = [
  "ニュース", "最新", "現在の", "今日の", "昨日の", "速報",
  "調べて", "検索して", "ググって", "天気", "株価", "為替", "相場",
  "〜とは", "について", "news", "latest", "current", "today",
];

const QUESTION_INDICATORS = [
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

const LOCATION_KEYWORDS = [
  // 場所・店舗検索
  "近く", "付近", "周辺", "最寄り", "近所", "現在地", "ここから", "この辺",
  // ディーラー・店舗
  "ディーラー", "販売店", "店舗", "ショールーム", "サービスセンター", "整備", "修理",
  // ガソリンスタンド
  "ガソリン", "スタンド", "給油", "充電", "EV充電",
  // 駐車場
  "駐車場", "パーキング", "コインパーキング",
  // 一般的な場所検索
  "どこ", "場所", "行き方", "道順",
];

const CAR_BRANDS = [
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

const CAR_INFO_KEYWORDS = [
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

const RAG_KEYWORDS = [
  // 車関連
  "車", "運転", "ドライブ", "走行", "駐車", "パーキング",
  // プリウス固有
  "プリウス", "prius", "ハイブリッド", "HV",
  // 操作関連
  "ブレーキ", "アクセル", "ハンドル", "シフト", "ギア", "エンジン",
  "始動", "停止", "スタート", "ストップ",
  // 機能関連
  "ナビ", "エアコン", "クーラー", "ヒーター", "ライト", "ワイパー",
  "ドア", "窓", "ミラー", "シート", "トランク",
  // 警告・トラブル
  "警告", "エラー", "故障", "異常", "トラブル", "ランプ", "点灯",
  // 取扱説明書
  "取扱", "説明書", "マニュアル", "使い方", "操作方法",
];

// ============================================
// Language Instructions
// ============================================

const LANGUAGE_INSTRUCTIONS: Record<string, string> = {
  ja: "日本語で簡潔に回答します。",
  en: "Respond concisely in English.",
  zh: "用简洁的中文回答。",
  ko: "간결하게 한국어로 답변합니다.",
  ru: "Отвечайте кратко на русском языке.",
  ar: "أجب بإيجاز باللغة العربية.",
};

// ============================================
// Cache for System Prompt
// ============================================

const cachedSystemPrompts: Record<string, { prompt: string; time: number }> = {};
const PROMPT_CACHE_TTL = 60000; // 1 minute cache

// ============================================
// Search Determination Functions
// ============================================

/**
 * Check if message needs web search
 */
export function needsWebSearch(content: string): boolean {
  if (content.length < 3) return false;

  for (const pattern of CONVERSATIONAL_PATTERNS) {
    if (pattern.test(content)) return false;
  }

  const lowerContent = content.toLowerCase();
  if (
    ALWAYS_SEARCH_KEYWORDS.some((kw) => lowerContent.includes(kw.toLowerCase()))
  ) {
    return true;
  }

  for (const pattern of QUESTION_INDICATORS) {
    if (pattern.test(content)) {
      return true;
    }
  }

  return false;
}

/**
 * Check if message needs location-based search
 */
export function needsLocationSearch(content: string): boolean {
  const lowerContent = content.toLowerCase();
  return LOCATION_KEYWORDS.some((kw) => lowerContent.includes(kw.toLowerCase()));
}

/**
 * Check if message needs car-related web search (other cars info)
 */
export function needsCarSearch(content: string): boolean {
  const lowerContent = content.toLowerCase();

  const hasBrand = CAR_BRANDS.some((brand) =>
    lowerContent.includes(brand.toLowerCase())
  );

  const hasInfoKeyword = CAR_INFO_KEYWORDS.some((kw) =>
    lowerContent.includes(kw.toLowerCase())
  );

  return hasBrand && hasInfoKeyword;
}

/**
 * Check if message needs RAG search (car/driving related)
 */
export function needsRAGSearch(content: string): boolean {
  const lowerContent = content.toLowerCase();
  return RAG_KEYWORDS.some((kw) => lowerContent.includes(kw.toLowerCase()));
}

// ============================================
// Utility Functions
// ============================================

/**
 * Build search query with location info
 */
export function buildLocationQuery(content: string, location: Location): string {
  return `${content} 緯度${location.lat.toFixed(4)} 経度${location.lng.toFixed(4)} 付近`;
}

/**
 * Build system prompt with current date/time info (with caching)
 */
export function buildSystemPrompt(language: string = "ja"): string {
  const now = Date.now();

  const cached = cachedSystemPrompts[language];
  if (cached && now - cached.time < PROMPT_CACHE_TTL) {
    return cached.prompt;
  }

  const datetime = getCurrentDateTime();
  const langInstruction =
    LANGUAGE_INSTRUCTIONS[language] || LANGUAGE_INSTRUCTIONS.ja;

  const prompt = `親切なAIアシスタントです。${langInstruction}
現在: ${datetime.fullDate} ${datetime.time}（${datetime.dayOfWeek}）
会話履歴を踏まえて回答してください。`;

  cachedSystemPrompts[language] = { prompt, time: now };
  return prompt;
}

// ============================================
// Main Context Building Function
// ============================================

/**
 * Build context for AI chat (web search, RAG search, etc.)
 */
export async function buildContext(options: ContextBuildOptions): Promise<BuiltContext> {
  const {
    content,
    location,
    language = "ja",
    skipWebSearch = false,
    skipRAGSearch = false,
  } = options;

  let systemPrompt = buildSystemPrompt(language);

  // Determine what searches are needed
  const shouldSearch = !skipWebSearch && (needsWebSearch(content) || needsCarSearch(content));
  const shouldLocationSearch = location && needsLocationSearch(content);

  // Build search query with location if available
  const searchQuery = shouldLocationSearch
    ? buildLocationQuery(content, location)
    : content;

  // Log search triggers
  if (needsCarSearch(content)) {
    console.log(`Car search triggered: ${content}`);
  }
  if (shouldLocationSearch) {
    console.log(`Location-based search: ${searchQuery}`);
  }

  // Run parallel searches
  const [searchResult, sharedKnowledgeResults, carManualResults] = await Promise.all([
    // Web search
    shouldSearch
      ? searchWeb(searchQuery).catch((err) => {
          console.error("Search failed:", err);
          return { success: false, query: searchQuery, results: [] } as SearchResponse;
        })
      : Promise.resolve({ success: false, query: searchQuery, results: [] } as SearchResponse),

    // Always search shared knowledge (past conversations)
    ragService.searchSharedConversations(content, { topK: 3 }).catch((err) => {
      console.error("Shared knowledge search failed:", err);
      return [];
    }),

    // Search car manual only if car-related and not skipped
    !skipRAGSearch && needsRAGSearch(content)
      ? ragService.search(content, { topK: 3 }).catch((err) => {
          console.error("Car manual search failed:", err);
          return [];
        })
      : Promise.resolve([]),
  ]);

  // Add web search results to prompt
  if (searchResult.success && searchResult.results.length > 0) {
    const searchInfo = formatSearchResultsForAI(searchResult);
    systemPrompt += `\n\n## Web検索結果\n${searchInfo}`;
    console.log("Search results added to context");
  }

  // Add shared knowledge to prompt
  if (sharedKnowledgeResults.length > 0) {
    const sharedContext = sharedKnowledgeResults.map((r, i) =>
      `【過去の会話 ${i + 1}】\n${r.text}`
    ).join('\n\n');
    systemPrompt += `\n\n## 過去の会話からの参考情報\n${sharedContext}`;
    console.log(`Shared knowledge results added to context (${sharedKnowledgeResults.length} items)`);
  }

  // Add car manual results to prompt
  if (carManualResults.length > 0) {
    const manualContext = ragService.formatResultsForAI(carManualResults);
    systemPrompt += `\n\n## プリウス取扱説明書からの参考情報\n${manualContext}`;
    console.log("Car manual results added to context");
  }

  // Add location info to system prompt if location search was triggered
  if (shouldLocationSearch && location) {
    systemPrompt += `\n\n現在地: 緯度${location.lat.toFixed(4)}, 経度${location.lng.toFixed(4)}`;
  }

  return {
    systemPrompt,
    searchResult,
    sharedKnowledgeResults,
    carManualResults,
  };
}

/**
 * Export keyword lists for external use
 */
export const SEARCH_KEYWORDS = {
  CONVERSATIONAL_PATTERNS,
  ALWAYS_SEARCH_KEYWORDS,
  QUESTION_INDICATORS,
  LOCATION_KEYWORDS,
  CAR_BRANDS,
  CAR_INFO_KEYWORDS,
  RAG_KEYWORDS,
};
