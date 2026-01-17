import * as dotenv from 'dotenv';
import OpenAI from 'openai';

dotenv.config();

const openai = new OpenAI({
  apiKey: process.env.DASHSCOPE_API_KEY,
  baseURL: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',
});

const EMBEDDING_MODEL = 'text-embedding-v4';
const EMBEDDING_DIMENSIONS = 1024;

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
  if (!process.env.DASHSCOPE_API_KEY) {
    throw new Error(
      'DASHSCOPE_API_KEY is not set. Please set it in .env file.'
    );
  }

  if (texts.length === 0) {
    return [];
  }

  // APIの制限に合わせてバッチ処理（最大10テキストまで）
  const BATCH_SIZE = 10;
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
  const response = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: texts,
    dimensions: EMBEDDING_DIMENSIONS,
  });

  // レスポンスをインデックス順にソートして返す
  const sortedData = response.data.sort((a, b) => a.index - b.index);
  return sortedData.map((item) => item.embedding);
}

/**
 * Embedding次元数を取得する（ChromaDB設定用）
 */
export function getEmbeddingDimension(): number {
  return EMBEDDING_DIMENSIONS;
}
