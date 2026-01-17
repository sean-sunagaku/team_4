/**
 * RAG (Retrieval-Augmented Generation) Configuration
 */

export const ragConfig = {
  // DashScope API Configuration
  dashscope: {
    apiKey: process.env.DASHSCOPE_API_KEY || '',
    baseURL: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',
  },

  // Embedding Configuration
  embedding: {
    model: 'text-embedding-v4',
    dimensions: 1024,
    batchSize: 10,
  },

  // ChromaDB Configuration
  chromadb: {
    url: process.env.CHROMA_URL || 'http://localhost:8100',
    collectionName: 'car_manual',
  },

  // Text Splitting Configuration
  textSplitter: {
    chunkSize: 300,
    chunkOverlap: 100,
    usePreprocessing: true,
  },

  // Search Configuration
  search: {
    defaultTopK: 5,
    maxTopK: 20,
    hybridSearchWeight: 0.7, // Weight for vector search (1 - weight for keyword search)
  },

  // Data File Path
  dataFile: process.env.RAG_DATA_FILE || '../assets/instruction-manual/prius-instruction-manual.txt',
};

/**
 * Validate required configuration
 */
export function validateRagConfig(): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!ragConfig.dashscope.apiKey) {
    errors.push('DASHSCOPE_API_KEY is not set');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
