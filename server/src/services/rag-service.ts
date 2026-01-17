import * as path from 'path';
import { ragConfig, validateRagConfig } from '../config/rag.config.js';
import { splitTextFromFile, type TextChunk } from '../rag/text-splitter.js';
import { getEmbedding, getEmbeddings } from '../rag/embedding.js';
import {
  addDocuments,
  searchSimilar,
  resetCollection,
  getDocumentCount,
  getAllDocuments,
  type SearchResult,
  type DocumentData,
} from '../rag/vectordb.js';
import { getBM25Index, resetBM25Index, type BM25Result } from '../rag/keyword-search.js';

export interface RAGSearchOptions {
  topK?: number;
  useHybrid?: boolean;
  vectorWeight?: number;
}

export interface HybridSearchResult {
  id: string;
  text: string;
  score: number;
  source: 'vector' | 'keyword' | 'hybrid';
}

export interface RAGStatus {
  initialized: boolean;
  documentCount: number;
  bm25DocumentCount: number;
  configValid: boolean;
  configErrors: string[];
  chromaUrl: string;
  dataFile: string;
}

class RAGService {
  private initialized = false;

  /**
   * RAGシステムを初期化する
   * @param filePath オプションのデータファイルパス
   */
  async initialize(filePath?: string): Promise<{ success: boolean; documentCount: number; message: string }> {
    const configValidation = validateRagConfig();
    if (!configValidation.valid) {
      return {
        success: false,
        documentCount: 0,
        message: `Configuration errors: ${configValidation.errors.join(', ')}`,
      };
    }

    // Check if already initialized with documents
    const existingCount = await this.getVectorDocumentCount();
    if (existingCount > 0) {
      // Rebuild BM25 index from existing documents
      await this.rebuildBM25Index();
      this.initialized = true;
      return {
        success: true,
        documentCount: existingCount,
        message: `Already initialized with ${existingCount} documents. BM25 index rebuilt.`,
      };
    }

    // Initialize with new data
    const dataPath = filePath || this.getDataFilePath();
    return await this.indexDocuments(dataPath);
  }

  /**
   * ドキュメントをリセットして再インデックスする
   * @param filePath オプションのデータファイルパス
   */
  async reindex(filePath?: string): Promise<{ success: boolean; documentCount: number; message: string }> {
    const configValidation = validateRagConfig();
    if (!configValidation.valid) {
      return {
        success: false,
        documentCount: 0,
        message: `Configuration errors: ${configValidation.errors.join(', ')}`,
      };
    }

    // Reset collections
    await resetCollection();
    resetBM25Index();
    this.initialized = false;

    // Re-index with data
    const dataPath = filePath || this.getDataFilePath();
    return await this.indexDocuments(dataPath);
  }

  /**
   * ハイブリッド検索を実行する
   * @param query 検索クエリ
   * @param options 検索オプション
   */
  async search(query: string, options: RAGSearchOptions = {}): Promise<HybridSearchResult[]> {
    if (!this.initialized) {
      // Try to initialize first
      const initResult = await this.initialize();
      if (!initResult.success) {
        throw new Error(`RAG not initialized: ${initResult.message}`);
      }
    }

    const topK = Math.min(options.topK || ragConfig.search.defaultTopK, ragConfig.search.maxTopK);
    const useHybrid = options.useHybrid !== false; // Default to true
    const vectorWeight = options.vectorWeight || ragConfig.search.hybridSearchWeight;

    if (!useHybrid) {
      // Vector search only
      return await this.vectorSearch(query, topK);
    }

    // Hybrid search: combine vector and keyword search
    return await this.hybridSearch(query, topK, vectorWeight);
  }

  /**
   * システムステータスを取得する
   */
  async getStatus(): Promise<RAGStatus> {
    const configValidation = validateRagConfig();
    let documentCount = 0;
    let bm25DocumentCount = 0;

    try {
      documentCount = await this.getVectorDocumentCount();
      bm25DocumentCount = getBM25Index().getDocumentCount();
    } catch {
      // ChromaDB might not be available
    }

    return {
      initialized: this.initialized,
      documentCount,
      bm25DocumentCount,
      configValid: configValidation.valid,
      configErrors: configValidation.errors,
      chromaUrl: ragConfig.chromadb.url,
      dataFile: ragConfig.dataFile,
    };
  }

  /**
   * 検索結果をAI用にフォーマットする
   * @param results 検索結果
   */
  formatResultsForAI(results: HybridSearchResult[]): string {
    if (results.length === 0) {
      return '関連する情報が見つかりませんでした。';
    }

    const formattedResults = results.map((result, index) => {
      return `【参考情報 ${index + 1}】\n${result.text}`;
    });

    return formattedResults.join('\n\n');
  }

  // Private methods

  private getDataFilePath(): string {
    // Resolve relative path from server directory
    return path.resolve(process.cwd(), ragConfig.dataFile);
  }

  private async getVectorDocumentCount(): Promise<number> {
    try {
      return await getDocumentCount();
    } catch {
      return 0;
    }
  }

  private async indexDocuments(filePath: string): Promise<{ success: boolean; documentCount: number; message: string }> {
    try {
      console.log(`Indexing documents from: ${filePath}`);

      // Split text into chunks
      const chunks = await splitTextFromFile(filePath);
      console.log(`Created ${chunks.length} chunks`);

      if (chunks.length === 0) {
        return {
          success: false,
          documentCount: 0,
          message: 'No chunks created from file',
        };
      }

      // Generate embeddings
      console.log('Generating embeddings...');
      const texts = chunks.map((c) => c.text);
      const embeddings = await getEmbeddings(texts);

      // Prepare documents for vector store
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

      // Add to vector store
      console.log('Adding documents to vector store...');
      await addDocuments(documents);

      // Build BM25 index
      console.log('Building BM25 index...');
      const bm25Index = getBM25Index();
      bm25Index.addDocuments(chunks.map((c) => ({ id: c.id, text: c.text })));

      this.initialized = true;
      console.log(`Indexing complete: ${chunks.length} documents`);

      return {
        success: true,
        documentCount: chunks.length,
        message: `Successfully indexed ${chunks.length} documents`,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('Indexing failed:', errorMessage);
      return {
        success: false,
        documentCount: 0,
        message: `Indexing failed: ${errorMessage}`,
      };
    }
  }

  private async rebuildBM25Index(): Promise<void> {
    console.log('Rebuilding BM25 index from vector store...');
    const documents = await getAllDocuments();
    const bm25Index = getBM25Index();
    bm25Index.addDocuments(documents);
    console.log(`BM25 index rebuilt with ${documents.length} documents`);
  }

  private async vectorSearch(query: string, topK: number): Promise<HybridSearchResult[]> {
    const queryEmbedding = await getEmbedding(query);
    const results = await searchSimilar(queryEmbedding, topK);

    return results.map((r) => ({
      id: r.id,
      text: r.text,
      score: 1 - r.distance, // Convert distance to similarity score
      source: 'vector' as const,
    }));
  }

  private async hybridSearch(
    query: string,
    topK: number,
    vectorWeight: number
  ): Promise<HybridSearchResult[]> {
    // Fetch more results for merging
    const fetchK = topK * 2;

    // Run both searches in parallel
    const [vectorResults, keywordResults] = await Promise.all([
      this.vectorSearch(query, fetchK),
      this.keywordSearch(query, fetchK),
    ]);

    // Normalize scores
    const normalizedVector = this.normalizeScores(vectorResults);
    const normalizedKeyword = this.normalizeScores(keywordResults);

    // Merge results with weighted scores
    const mergedScores = new Map<string, { text: string; score: number }>();

    for (const result of normalizedVector) {
      mergedScores.set(result.id, {
        text: result.text,
        score: result.score * vectorWeight,
      });
    }

    const keywordWeight = 1 - vectorWeight;
    for (const result of normalizedKeyword) {
      const existing = mergedScores.get(result.id);
      if (existing) {
        existing.score += result.score * keywordWeight;
      } else {
        mergedScores.set(result.id, {
          text: result.text,
          score: result.score * keywordWeight,
        });
      }
    }

    // Sort by merged score and return top K
    const sortedResults = Array.from(mergedScores.entries())
      .sort((a, b) => b[1].score - a[1].score)
      .slice(0, topK)
      .map(([id, data]) => ({
        id,
        text: data.text,
        score: data.score,
        source: 'hybrid' as const,
      }));

    return sortedResults;
  }

  private keywordSearch(query: string, topK: number): HybridSearchResult[] {
    const bm25Index = getBM25Index();
    const results = bm25Index.search(query, topK);

    return results.map((r) => ({
      id: r.id,
      text: r.text,
      score: r.score,
      source: 'keyword' as const,
    }));
  }

  private normalizeScores(results: HybridSearchResult[]): HybridSearchResult[] {
    if (results.length === 0) return [];

    const maxScore = Math.max(...results.map((r) => r.score));
    if (maxScore === 0) return results;

    return results.map((r) => ({
      ...r,
      score: r.score / maxScore,
    }));
  }
}

// Export singleton instance
export const ragService = new RAGService();
