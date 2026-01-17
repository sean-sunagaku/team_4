import { toBigrams } from './text-preprocessor.js';

/**
 * BM25キーワード検索モジュール
 * 日本語テキストに対応したBM25アルゴリズムによる検索
 */

export interface Document {
  id: string;
  text: string;
}

export interface BM25Result {
  id: string;
  text: string;
  score: number;
}

// BM25パラメータ
const K1 = 1.2; // 単語頻度の飽和パラメータ
const B = 0.75; // 文書長の正規化パラメータ

/**
 * BM25インデックス
 */
export class BM25Index {
  private documents: Document[] = [];
  private docBigrams: Map<string, string[]> = new Map();
  private docFreq: Map<string, number> = new Map(); // 各bigramが出現する文書数
  private avgDocLength: number = 0;

  /**
   * ドキュメントをインデックスに追加
   */
  addDocuments(documents: Document[]): void {
    this.documents = documents;
    this.docBigrams.clear();
    this.docFreq.clear();

    let totalLength = 0;

    // 各文書をbi-gramに分割してインデックス作成
    for (const doc of documents) {
      const bigrams = toBigrams(doc.text);
      this.docBigrams.set(doc.id, bigrams);
      totalLength += bigrams.length;

      // 文書頻度をカウント（各bigramが出現する文書数）
      const uniqueBigrams = new Set(bigrams);
      for (const bigram of uniqueBigrams) {
        this.docFreq.set(bigram, (this.docFreq.get(bigram) || 0) + 1);
      }
    }

    this.avgDocLength = documents.length > 0 ? totalLength / documents.length : 0;
  }

  /**
   * BM25スコアを計算して検索
   */
  search(query: string, topK: number = 5): BM25Result[] {
    const queryBigrams = toBigrams(query);
    const scores: Map<string, number> = new Map();
    const N = this.documents.length;

    for (const doc of this.documents) {
      const docBigrams = this.docBigrams.get(doc.id) || [];
      const docLength = docBigrams.length;
      let score = 0;

      // 各クエリbigramに対してBM25スコアを計算
      for (const qBigram of queryBigrams) {
        const tf = this.countOccurrences(docBigrams, qBigram);
        if (tf === 0) continue;

        const df = this.docFreq.get(qBigram) || 0;
        if (df === 0) continue;

        // IDF計算
        const idf = Math.log((N - df + 0.5) / (df + 0.5) + 1);

        // TF正規化
        const tfNorm =
          (tf * (K1 + 1)) /
          (tf + K1 * (1 - B + B * (docLength / this.avgDocLength)));

        score += idf * tfNorm;
      }

      if (score > 0) {
        scores.set(doc.id, score);
      }
    }

    // スコアでソートしてtopKを返す
    const results: BM25Result[] = [];
    const sortedIds = Array.from(scores.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, topK);

    for (const [id, score] of sortedIds) {
      const doc = this.documents.find((d) => d.id === id);
      if (doc) {
        results.push({
          id: doc.id,
          text: doc.text,
          score,
        });
      }
    }

    return results;
  }

  /**
   * 配列内の要素の出現回数をカウント
   */
  private countOccurrences(arr: string[], target: string): number {
    return arr.filter((item) => item === target).length;
  }

  /**
   * インデックスされた文書数を返す
   */
  getDocumentCount(): number {
    return this.documents.length;
  }

  /**
   * インデックスをクリア
   */
  clear(): void {
    this.documents = [];
    this.docBigrams.clear();
    this.docFreq.clear();
    this.avgDocLength = 0;
  }

  /**
   * シリアライズ（保存用）
   */
  serialize(): string {
    return JSON.stringify({
      documents: this.documents,
      docFreq: Array.from(this.docFreq.entries()),
      avgDocLength: this.avgDocLength,
    });
  }

  /**
   * デシリアライズ（読み込み用）
   */
  static deserialize(data: string): BM25Index {
    const parsed = JSON.parse(data);
    const index = new BM25Index();
    index.documents = parsed.documents;
    index.docFreq = new Map(parsed.docFreq);
    index.avgDocLength = parsed.avgDocLength;

    // docBigramsを再構築
    for (const doc of index.documents) {
      index.docBigrams.set(doc.id, toBigrams(doc.text));
    }

    return index;
  }
}

// グローバルインデックスインスタンス
let globalIndex: BM25Index | null = null;

/**
 * グローバルBM25インデックスを取得または作成
 */
export function getBM25Index(): BM25Index {
  if (!globalIndex) {
    globalIndex = new BM25Index();
  }
  return globalIndex;
}

/**
 * グローバルBM25インデックスをリセット
 */
export function resetBM25Index(): void {
  globalIndex = new BM25Index();
}
