import OpenAI from 'openai';
import { ragConfig } from '../config/rag.config.js';

let openaiClient: OpenAI | null = null;

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
 * テキストのEmbeddingを生成する
 * @param text 単一のテキスト
 * @returns Embeddingベクトル
 */
export async function getEmbedding(text: string): Promise<number[]> {
  const embeddings = await getEmbeddings([text]);
  return embeddings[0];
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
