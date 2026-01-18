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
  addConversationDocument,
  searchSharedConversations as searchSharedConversationsFromDB,
  getSharedConversationsCount,
  type SearchResult,
  type DocumentData,
  type ConversationDocumentData,
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
  source: 'vector' | 'keyword' | 'hybrid' | 'car_manual' | 'shared_conversations';
}

export interface ConversationQAPair {
  conversationId: string;
  questionId: string;
  answerId: string;
  question: string;
  answer: string;
}

interface SimilarityCacheEntry {
  answer: string;
  question: string;
  similarity: number;
  timestamp: number;
}

export interface RAGStatus {
  initialized: boolean;
  documentCount: number;
  bm25DocumentCount: number;
  sharedConversationsCount: number;
  similarityCacheSize: number;
  configValid: boolean;
  configErrors: string[];
  chromaUrl: string;
  dataFile: string;
}

class RAGService {
  private initialized = false;
  private similarityCache: Map<string, SimilarityCacheEntry> = new Map();

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
    let sharedConversationsCount = 0;

    try {
      documentCount = await this.getVectorDocumentCount();
      bm25DocumentCount = getBM25Index().getDocumentCount();
      sharedConversationsCount = await getSharedConversationsCount();
    } catch {
      // ChromaDB might not be available
    }

    return {
      initialized: this.initialized,
      documentCount,
      bm25DocumentCount,
      sharedConversationsCount,
      similarityCacheSize: this.similarityCache.size,
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

  // ============================================
  // Shared Conversations & Similarity Cache
  // ============================================

  /**
   * 会話Q&AペアをRAGに追加する（非同期）
   * @param qaPair Q&Aペア情報
   */
  async addConversationToRAG(qaPair: ConversationQAPair): Promise<void> {
    if (!ragConfig.sharedConversations.enabled) {
      return;
    }

    try {
      const combinedText = `Q: ${qaPair.question}\nA: ${qaPair.answer}`;
      const embedding = await getEmbedding(combinedText);
      const category = this.categorizeQuestion(qaPair.question);

      const document: ConversationDocumentData = {
        id: `conv_${qaPair.conversationId}_msg_${qaPair.answerId}`,
        text: combinedText,
        embedding,
        metadata: {
          conversationId: qaPair.conversationId,
          questionId: qaPair.questionId,
          answerId: qaPair.answerId,
          createdAt: new Date().toISOString(),
          category,
        },
      };

      await addConversationDocument(document);

      // 類似質問キャッシュにも追加（キャッシュ有効時）
      if (ragConfig.sharedConversations.similarityCacheEnabled) {
        this.addToSimilarityCache(qaPair.question, qaPair.answer, embedding);
      }

      console.log(`Conversation added to RAG: ${document.id} (category: ${category})`);
    } catch (error) {
      console.error('Failed to add conversation to RAG:', error);
    }
  }

  /**
   * 類似質問キャッシュをチェックする
   * @param query クエリ
   * @returns キャッシュヒット時は回答、ミス時はnull
   */
  async checkSimilarityCache(query: string): Promise<{ answer: string; similarity: number } | null> {
    if (!ragConfig.sharedConversations.similarityCacheEnabled) {
      return null;
    }

    // キャッシュのクリーンアップ（期限切れエントリを削除）
    this.cleanupSimilarityCache();

    if (this.similarityCache.size === 0) {
      return null;
    }

    try {
      const queryEmbedding = await getEmbedding(query);

      let bestMatch: SimilarityCacheEntry | null = null;
      let bestSimilarity = 0;

      for (const [key, entry] of this.similarityCache.entries()) {
        // キャッシュキーからembeddingを復元して類似度計算
        // ここでは簡易的にキャッシュされた質問との文字列類似度で判定
        const similarity = this.calculateTextSimilarity(query, entry.question);

        if (similarity >= ragConfig.sharedConversations.similarityThreshold && similarity > bestSimilarity) {
          bestMatch = entry;
          bestSimilarity = similarity;
        }
      }

      if (bestMatch) {
        console.log(`Similarity cache hit! (similarity: ${(bestSimilarity * 100).toFixed(1)}%)`);
        return { answer: bestMatch.answer, similarity: bestSimilarity };
      }
    } catch (error) {
      console.error('Similarity cache check failed:', error);
    }

    return null;
  }

  /**
   * 共有会話履歴のみを検索する
   * @param query 検索クエリ
   * @param options 検索オプション
   */
  async searchSharedConversations(query: string, options: RAGSearchOptions = {}): Promise<HybridSearchResult[]> {
    if (!ragConfig.sharedConversations.enabled) {
      return [];
    }

    const topK = Math.min(options.topK || ragConfig.search.defaultTopK, ragConfig.search.maxTopK);

    try {
      const queryEmbedding = await getEmbedding(query);
      const results = await searchSharedConversationsFromDB(queryEmbedding, topK);

      return results.map((r) => ({
        id: r.id,
        text: r.text,
        score: 1 - r.distance,
        source: 'shared_conversations' as const,
      }));
    } catch (error) {
      console.error('searchSharedConversations failed:', error);
      return [];
    }
  }

  /**
   * 統合検索（取扱説明書 + 共有会話履歴）
   * @param query 検索クエリ
   * @param options 検索オプション
   */
  async searchAll(query: string, options: RAGSearchOptions = {}): Promise<HybridSearchResult[]> {
    if (!this.initialized) {
      const initResult = await this.initialize();
      if (!initResult.success) {
        throw new Error(`RAG not initialized: ${initResult.message}`);
      }
    }

    const topK = Math.min(options.topK || ragConfig.search.defaultTopK, ragConfig.search.maxTopK);

    try {
      const queryEmbedding = await getEmbedding(query);

      // 両コレクションで並列検索
      const [manualResults, conversationResults] = await Promise.all([
        searchSimilar(queryEmbedding, topK),
        ragConfig.sharedConversations.enabled
          ? searchSharedConversationsFromDB(queryEmbedding, topK)
          : Promise.resolve([]),
      ]);

      // 結果をマージしてスコアでソート
      const allResults: HybridSearchResult[] = [
        ...manualResults.map((r) => ({
          id: r.id,
          text: r.text,
          score: 1 - r.distance, // distanceをsimilarityに変換
          source: 'car_manual' as const,
        })),
        ...conversationResults.map((r) => ({
          id: r.id,
          text: r.text,
          score: 1 - r.distance,
          source: 'shared_conversations' as const,
        })),
      ];

      // スコアでソートして上位N件を返す
      return allResults
        .sort((a, b) => b.score - a.score)
        .slice(0, topK);
    } catch (error) {
      console.error('searchAll failed:', error);
      // フォールバック：通常の検索
      return await this.search(query, options);
    }
  }

  /**
   * 統合検索結果をAI用にフォーマットする
   */
  formatAllResultsForAI(results: HybridSearchResult[]): string {
    if (results.length === 0) {
      return '関連する情報が見つかりませんでした。';
    }

    const manualResults = results.filter((r) => r.source === 'car_manual');
    const conversationResults = results.filter((r) => r.source === 'shared_conversations');

    const parts: string[] = [];

    if (manualResults.length > 0) {
      const manualFormatted = manualResults.map((result, index) => {
        return `【取扱説明書 ${index + 1}】\n${result.text}`;
      });
      parts.push(manualFormatted.join('\n\n'));
    }

    if (conversationResults.length > 0) {
      const convFormatted = conversationResults.map((result, index) => {
        return `【過去の会話 ${index + 1}】\n${result.text}`;
      });
      parts.push(convFormatted.join('\n\n'));
    }

    return parts.join('\n\n---\n\n');
  }

  // Private helper methods for shared conversations

  /**
   * 質問を自動分類する
   */
  private categorizeQuestion(question: string): string {
    const carKeywords = ['車', '運転', 'プリウス', 'ハイブリッド', 'エンジン', 'ブレーキ', 'ナビ', 'エアコン'];
    const lowerQuestion = question.toLowerCase();

    if (carKeywords.some((kw) => lowerQuestion.includes(kw.toLowerCase()))) {
      return 'car_related';
    }

    return 'general';
  }

  /**
   * 類似質問キャッシュに追加する
   */
  private addToSimilarityCache(question: string, answer: string, _embedding: number[]): void {
    // キャッシュサイズ制限
    if (this.similarityCache.size >= ragConfig.sharedConversations.similarityCacheMaxSize) {
      // 最古のエントリを削除
      let oldestKey: string | null = null;
      let oldestTime = Infinity;

      for (const [key, entry] of this.similarityCache.entries()) {
        if (entry.timestamp < oldestTime) {
          oldestTime = entry.timestamp;
          oldestKey = key;
        }
      }

      if (oldestKey) {
        this.similarityCache.delete(oldestKey);
      }
    }

    const cacheKey = this.generateCacheKey(question);
    this.similarityCache.set(cacheKey, {
      question,
      answer,
      similarity: 1.0,
      timestamp: Date.now(),
    });
  }

  /**
   * キャッシュキーを生成する
   */
  private generateCacheKey(question: string): string {
    // 簡易的なハッシュ（実運用では適切なハッシュ関数を使用）
    return question.slice(0, 100).replace(/\s+/g, '_').toLowerCase();
  }

  /**
   * 期限切れキャッシュエントリを削除する
   */
  private cleanupSimilarityCache(): void {
    const now = Date.now();
    const ttl = ragConfig.sharedConversations.similarityCacheTTL;

    for (const [key, entry] of this.similarityCache.entries()) {
      if (now - entry.timestamp > ttl) {
        this.similarityCache.delete(key);
      }
    }
  }

  /**
   * 簡易テキスト類似度計算（Jaccard係数ベース）
   */
  private calculateTextSimilarity(text1: string, text2: string): number {
    const words1 = new Set(text1.toLowerCase().split(/\s+/));
    const words2 = new Set(text2.toLowerCase().split(/\s+/));

    const intersection = new Set([...words1].filter((x) => words2.has(x)));
    const union = new Set([...words1, ...words2]);

    if (union.size === 0) return 0;
    return intersection.size / union.size;
  }
}

// Export singleton instance
export const ragService = new RAGService();
