import { ChromaClient, Collection } from 'chromadb';

const COLLECTION_NAME = 'car_manual';

// ChromaDBサーバーのURL（デフォルト: localhost:8000）
const CHROMA_URL = process.env.CHROMA_URL || 'http://localhost:8000';

let client: ChromaClient | null = null;
let collection: Collection | null = null;

/**
 * ChromaDBクライアントを初期化する
 * 注意: ChromaDBサーバーが起動している必要があります
 * 起動方法: docker run -p 8000:8000 chromadb/chroma
 */
export async function initChromaClient(): Promise<ChromaClient> {
  if (!client) {
    client = new ChromaClient({
      path: CHROMA_URL,
    });
  }
  return client;
}

/**
 * コレクションを取得または作成する
 */
export async function getOrCreateCollection(): Promise<Collection> {
  if (collection) {
    return collection;
  }

  const chromaClient = await initChromaClient();

  collection = await chromaClient.getOrCreateCollection({
    name: COLLECTION_NAME,
    metadata: {
      description: 'Car instruction manual chunks',
    },
  });

  return collection;
}

/**
 * コレクションをリセットする（再初期化用）
 */
export async function resetCollection(): Promise<Collection> {
  const chromaClient = await initChromaClient();

  try {
    await chromaClient.deleteCollection({ name: COLLECTION_NAME });
  } catch {
    // コレクションが存在しない場合は無視
  }

  collection = null;
  return getOrCreateCollection();
}

export interface DocumentData {
  id: string;
  text: string;
  embedding: number[];
  metadata?: Record<string, string | number | boolean>;
}

/**
 * ドキュメントをコレクションに追加する
 * @param documents ドキュメント配列
 */
export async function addDocuments(documents: DocumentData[]): Promise<void> {
  const col = await getOrCreateCollection();

  if (documents.length === 0) {
    return;
  }

  await col.add({
    ids: documents.map((d) => d.id),
    embeddings: documents.map((d) => d.embedding),
    documents: documents.map((d) => d.text),
    metadatas: documents.map((d) => d.metadata || {}),
  });

  console.log(`Added ${documents.length} documents to collection`);
}

export interface SearchResult {
  id: string;
  text: string;
  distance: number;
  metadata?: Record<string, string | number | boolean>;
}

/**
 * クエリベクトルで類似検索を実行する
 * @param queryEmbedding クエリのEmbeddingベクトル
 * @param topK 返す結果数
 * @returns 類似度の高い順にソートされた検索結果
 */
export async function searchSimilar(
  queryEmbedding: number[],
  topK: number = 5
): Promise<SearchResult[]> {
  const col = await getOrCreateCollection();

  const results = await col.query({
    queryEmbeddings: [queryEmbedding],
    nResults: topK,
  });

  const searchResults: SearchResult[] = [];

  if (results.ids[0]) {
    for (let i = 0; i < results.ids[0].length; i++) {
      searchResults.push({
        id: results.ids[0][i],
        text: results.documents?.[0]?.[i] || '',
        distance: results.distances?.[0]?.[i] || 0,
        metadata: results.metadatas?.[0]?.[i] as Record<
          string,
          string | number | boolean
        >,
      });
    }
  }

  return searchResults;
}

/**
 * コレクション内のドキュメント数を取得する
 */
export async function getDocumentCount(): Promise<number> {
  const col = await getOrCreateCollection();
  return await col.count();
}

/**
 * 全ドキュメントを取得する（BM25インデックス再構築用）
 */
export async function getAllDocuments(): Promise<{ id: string; text: string }[]> {
  const col = await getOrCreateCollection();
  const count = await col.count();

  if (count === 0) {
    return [];
  }

  // ChromaDBはpaginationをサポートしているので、大量データの場合は分割取得
  const results = await col.get({
    limit: count,
  });

  const documents: { id: string; text: string }[] = [];

  if (results.ids) {
    for (let i = 0; i < results.ids.length; i++) {
      documents.push({
        id: results.ids[i],
        text: results.documents?.[i] || '',
      });
    }
  }

  return documents;
}
