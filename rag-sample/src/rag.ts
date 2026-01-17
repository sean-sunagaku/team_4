import { splitText, splitTextFromFile, TextChunk } from './text-splitter';
import { getEmbedding, getEmbeddings } from './embedding';
import {
  addDocuments,
  searchSimilar,
  resetCollection,
  getDocumentCount,
  getAllDocuments,
  DocumentData,
} from './vectordb';
import { getBM25Index, resetBM25Index } from './keyword-search';

export interface RAGConfig {
  chunkSize?: number;
  chunkOverlap?: number;
  topK?: number;
  useHybrid?: boolean;        // ハイブリッド検索を使用するか
  vectorWeight?: number;      // ベクトル検索の重み
  keywordWeight?: number;     // キーワード検索の重み
}

const DEFAULT_CONFIG: Required<RAGConfig> = {
  chunkSize: 300,
  chunkOverlap: 100,
  topK: 5,
  useHybrid: true,
  vectorWeight: 0.5,
  keywordWeight: 0.5,
};

/**
 * テキストデータをRAGシステムに登録する
 * @param text 登録するテキスト
 * @param config 設定
 */
export async function indexText(
  text: string,
  config: RAGConfig = {}
): Promise<number> {
  const { chunkSize, chunkOverlap } = { ...DEFAULT_CONFIG, ...config };

  console.log('Splitting text into chunks...');
  const chunks = splitText(text, { chunkSize, chunkOverlap });
  console.log(`Created ${chunks.length} chunks`);

  return indexChunks(chunks);
}

/**
 * ファイルからテキストを読み込んでRAGシステムに登録する
 * @param filePath ファイルパス
 * @param config 設定
 */
export async function indexFile(
  filePath: string,
  config: RAGConfig = {}
): Promise<number> {
  const { chunkSize, chunkOverlap } = { ...DEFAULT_CONFIG, ...config };

  console.log(`Reading file: ${filePath}`);
  const chunks = await splitTextFromFile(filePath, { chunkSize, chunkOverlap });
  console.log(`Created ${chunks.length} chunks`);

  return indexChunks(chunks);
}

/**
 * チャンクをEmbedding化してDBに保存する
 */
async function indexChunks(chunks: TextChunk[]): Promise<number> {
  if (chunks.length === 0) {
    console.log('No chunks to index');
    return 0;
  }

  console.log('Generating embeddings...');
  const texts = chunks.map((c) => c.text);
  const embeddings = await getEmbeddings(texts);
  console.log(`Generated ${embeddings.length} embeddings`);

  console.log('Storing in vector database...');
  const documents: DocumentData[] = chunks.map((chunk, i) => ({
    id: chunk.id,
    text: chunk.text,
    embedding: embeddings[i],
    metadata: {
      index: chunk.metadata.index,
      start: chunk.metadata.start,
      end: chunk.metadata.end,
    },
  }));

  await addDocuments(documents);

  // BM25インデックスにも追加
  console.log('Building BM25 index...');
  const bm25Index = getBM25Index();
  bm25Index.addDocuments(
    chunks.map((c) => ({ id: c.id, text: c.text }))
  );
  console.log('Indexing complete');

  return chunks.length;
}

/**
 * DBをリセットして再登録する
 * @param text 登録するテキスト
 * @param config 設定
 */
export async function reindexText(
  text: string,
  config: RAGConfig = {}
): Promise<number> {
  console.log('Resetting collection...');
  await resetCollection();
  resetBM25Index();
  return indexText(text, config);
}

/**
 * ファイルからDBをリセットして再登録する
 * @param filePath ファイルパス
 * @param config 設定
 */
export async function reindexFile(
  filePath: string,
  config: RAGConfig = {}
): Promise<number> {
  console.log('Resetting collection...');
  await resetCollection();
  resetBM25Index();
  return indexFile(filePath, config);
}

export interface QueryResult {
  query: string;
  results: {
    id: string;
    text: string;
    score: number;
    vectorScore?: number;
    keywordScore?: number;
    metadata?: Record<string, string | number | boolean>;
  }[];
}

/**
 * BM25インデックスを再構築する（必要な場合）
 */
async function ensureBM25Index(): Promise<void> {
  const bm25Index = getBM25Index();
  if (bm25Index.getDocumentCount() === 0) {
    const vectorCount = await getDocumentCount();
    if (vectorCount > 0) {
      console.log('Rebuilding BM25 index from vector DB...');
      const documents = await getAllDocuments();
      bm25Index.addDocuments(documents);
      console.log(`BM25 index rebuilt with ${documents.length} documents`);
    }
  }
}

/**
 * クエリに対して関連テキストを検索する（ハイブリッド検索）
 * @param query 検索クエリ
 * @param config 設定
 * @returns 検索結果
 */
export async function search(
  query: string,
  config: RAGConfig = {}
): Promise<QueryResult> {
  const { topK, useHybrid, vectorWeight, keywordWeight } = {
    ...DEFAULT_CONFIG,
    ...config,
  };

  console.log(`Searching for: "${query}"`);

  // BM25インデックスを確認・再構築
  if (useHybrid) {
    await ensureBM25Index();
  }

  // ベクトル検索
  const queryEmbedding = await getEmbedding(query);
  const vectorResults = await searchSimilar(queryEmbedding, topK * 2); // より多く取得してマージ

  if (!useHybrid) {
    // ベクトル検索のみ
    return {
      query,
      results: vectorResults.map((r) => ({
        id: r.id,
        text: r.text,
        score: 1 - r.distance,
        metadata: r.metadata,
      })),
    };
  }

  // BM25キーワード検索
  const bm25Index = getBM25Index();
  const keywordResults = bm25Index.search(query, topK * 2);

  // RRF（Reciprocal Rank Fusion）でスコアを統合
  const K = 60; // RRF定数
  const fusedScores: Map<
    string,
    {
      text: string;
      rrfScore: number;
      vectorScore: number;
      keywordScore: number;
      metadata?: Record<string, string | number | boolean>;
    }
  > = new Map();

  // ベクトル検索結果のRRFスコア
  vectorResults.forEach((r, rank) => {
    const rrfScore = vectorWeight * (1 / (K + rank + 1));
    const vectorScore = 1 - r.distance;
    fusedScores.set(r.id, {
      text: r.text,
      rrfScore,
      vectorScore,
      keywordScore: 0,
      metadata: r.metadata,
    });
  });

  // キーワード検索結果のRRFスコアを加算
  keywordResults.forEach((r, rank) => {
    const rrfScore = keywordWeight * (1 / (K + rank + 1));
    const existing = fusedScores.get(r.id);
    if (existing) {
      existing.rrfScore += rrfScore;
      existing.keywordScore = r.score;
    } else {
      fusedScores.set(r.id, {
        text: r.text,
        rrfScore,
        vectorScore: 0,
        keywordScore: r.score,
        metadata: undefined,
      });
    }
  });

  // RRFスコアでソート
  const sortedResults = Array.from(fusedScores.entries())
    .sort((a, b) => b[1].rrfScore - a[1].rrfScore)
    .slice(0, topK);

  return {
    query,
    results: sortedResults.map(([id, data]) => ({
      id,
      text: data.text,
      score: data.rrfScore,
      vectorScore: data.vectorScore,
      keywordScore: data.keywordScore,
      metadata: data.metadata,
    })),
  };
}

/**
 * ベクトル検索のみを実行
 */
export async function vectorSearch(
  query: string,
  topK: number = 5
): Promise<QueryResult> {
  return search(query, { topK, useHybrid: false });
}

/**
 * キーワード検索のみを実行
 */
export function keywordSearch(query: string, topK: number = 5): QueryResult {
  const bm25Index = getBM25Index();
  const results = bm25Index.search(query, topK);

  return {
    query,
    results: results.map((r) => ({
      id: r.id,
      text: r.text,
      score: r.score,
    })),
  };
}

/**
 * 検索結果をフォーマットして表示する
 */
export function formatSearchResults(result: QueryResult): string {
  const lines: string[] = [
    `Query: "${result.query}"`,
    '',
    'Results:',
    '---',
  ];

  result.results.forEach((r, i) => {
    lines.push(`[${i + 1}] Score: ${r.score.toFixed(4)}`);
    if (r.vectorScore !== undefined) {
      lines.push(`    Vector: ${r.vectorScore.toFixed(4)}, Keyword: ${r.keywordScore?.toFixed(4) || 'N/A'}`);
    }
    lines.push(r.text);
    lines.push('---');
  });

  return lines.join('\n');
}

/**
 * 現在のDB状態を取得する
 */
export async function getStatus(): Promise<{
  documentCount: number;
  bm25DocumentCount: number;
}> {
  const documentCount = await getDocumentCount();
  const bm25Index = getBM25Index();
  const bm25DocumentCount = bm25Index.getDocumentCount();
  return { documentCount, bm25DocumentCount };
}
