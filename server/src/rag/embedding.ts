import OpenAI from 'openai';
import { ragConfig } from '../config/rag.config.js';

let openaiClient: OpenAI | null = null;

// Phase 3: Embedding cache for low-latency RAG queries
// Simple LRU-style cache with TTL
interface EmbeddingCacheEntry {
  embedding: number[];
  timestamp: number;
}

const embeddingCache = new Map<string, EmbeddingCacheEntry>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const MAX_CACHE_SIZE = 100; // Maximum number of cached entries

/**
 * Normalize cache key for consistent matching
 */
function normalizeCacheKey(text: string): string {
  return text.trim().toLowerCase();
}

/**
 * Clean expired entries from cache
 */
function cleanExpiredCache(): void {
  const now = Date.now();
  for (const [key, entry] of embeddingCache.entries()) {
    if (now - entry.timestamp > CACHE_TTL) {
      embeddingCache.delete(key);
    }
  }
}

/**
 * Evict oldest entries if cache is full
 */
function evictOldestIfNeeded(): void {
  if (embeddingCache.size >= MAX_CACHE_SIZE) {
    // Find and remove the oldest entry
    let oldestKey: string | null = null;
    let oldestTime = Infinity;

    for (const [key, entry] of embeddingCache.entries()) {
      if (entry.timestamp < oldestTime) {
        oldestTime = entry.timestamp;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      embeddingCache.delete(oldestKey);
    }
  }
}

/**
 * Get OpenAI client instance (lazy initialization)
 */
function getOpenAIClient(): OpenAI {
  if (!openaiClient) {
    openaiClient = new OpenAI({
      apiKey: ragConfig.dashscope.apiKey,
      baseURL: ragConfig.dashscope.baseURL,
    });
  }
  return openaiClient;
}

/**
 * テキストのEmbeddingを生成する（キャッシュ付き）
 * @param text 単一のテキスト
 * @returns Embeddingベクトル
 */
export async function getEmbedding(text: string): Promise<number[]> {
  // Check cache first
  const cacheKey = normalizeCacheKey(text);
  const cached = embeddingCache.get(cacheKey);
  const now = Date.now();

  if (cached && now - cached.timestamp < CACHE_TTL) {
    console.log("Embedding cache hit");
    return cached.embedding;
  }

  // Cache miss - fetch from API
  const embeddings = await getEmbeddings([text]);
  const embedding = embeddings[0];

  // Store in cache
  cleanExpiredCache();
  evictOldestIfNeeded();
  embeddingCache.set(cacheKey, { embedding, timestamp: now });
  console.log(`Embedding cached (cache size: ${embeddingCache.size})`);

  return embedding;
}

/**
 * 複数テキストのEmbeddingを一括生成する
 * @param texts テキスト配列
 * @returns Embeddingベクトル配列
 */
export async function getEmbeddings(texts: string[]): Promise<number[][]> {
  if (!ragConfig.dashscope.apiKey) {
    throw new Error(
      'DASHSCOPE_API_KEY is not set. Please set it in .env file.'
    );
  }

  if (texts.length === 0) {
    return [];
  }

  const BATCH_SIZE = ragConfig.embedding.batchSize;
  const allEmbeddings: number[][] = [];

  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);
    const batchEmbeddings = await fetchEmbeddings(batch);
    allEmbeddings.push(...batchEmbeddings);

    // 進捗表示
    console.log(`  Processed ${Math.min(i + BATCH_SIZE, texts.length)}/${texts.length} texts`);
  }

  return allEmbeddings;
}

async function fetchEmbeddings(texts: string[]): Promise<number[][]> {
  const openai = getOpenAIClient();

  const response = await openai.embeddings.create({
    model: ragConfig.embedding.model,
    input: texts,
    dimensions: ragConfig.embedding.dimensions,
  });

  // レスポンスをインデックス順にソートして返す
  const sortedData = response.data.sort((a, b) => a.index - b.index);
  return sortedData.map((item) => item.embedding);
}

/**
 * Embedding次元数を取得する（ChromaDB設定用）
 */
export function getEmbeddingDimension(): number {
  return ragConfig.embedding.dimensions;
}
