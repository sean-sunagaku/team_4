import { preprocessText } from './text-preprocessor.js';
import { ragConfig } from '../config/rag.config.js';

export interface SplitOptions {
  chunkSize: number;
  chunkOverlap: number;
  usePreprocessing: boolean;
}

export interface TextChunk {
  id: string;
  text: string;
  metadata: {
    index: number;
    start: number;
    end: number;
  };
}

/**
 * Get default split options from config
 */
function getDefaultOptions(): SplitOptions {
  return {
    chunkSize: ragConfig.textSplitter.chunkSize,
    chunkOverlap: ragConfig.textSplitter.chunkOverlap,
    usePreprocessing: ragConfig.textSplitter.usePreprocessing,
  };
}

/**
 * テキストを適切なサイズのチャンクに分割する
 * @param text 分割対象のテキスト
 * @param options 分割オプション
 * @returns チャンク配列
 */
export function splitText(
  text: string,
  options: Partial<SplitOptions> = {}
): TextChunk[] {
  const { chunkSize, chunkOverlap, usePreprocessing } = {
    ...getDefaultOptions(),
    ...options,
  };
  const chunks: TextChunk[] = [];

  // 前処理を適用
  let processedText = usePreprocessing ? preprocessText(text) : text;

  // テキストを正規化（余分な空白を削除）
  processedText = processedText.replace(/[ \t]+/g, ' ').trim();

  if (processedText.length === 0) {
    return [];
  }

  // チャンクサイズがテキスト長より大きい場合は全体を1チャンクとして返す
  if (processedText.length <= chunkSize) {
    return [
      {
        id: `chunk_0`,
        text: processedText,
        metadata: {
          index: 0,
          start: 0,
          end: processedText.length,
        },
      },
    ];
  }

  let start = 0;
  let index = 0;

  while (start < processedText.length) {
    let end = Math.min(start + chunkSize, processedText.length);

    // 文の途中で切れないように、句読点や改行で区切りを調整
    if (end < processedText.length) {
      const searchStart = Math.max(start + Math.floor(chunkSize * 0.5), start);
      const searchText = processedText.slice(searchStart, end);

      // 日本語の句読点、または英語のピリオド/改行を探す（優先度順）
      const breakPoints = ['。\n', '。', '！', '？', '．', '\n\n', '.', '!', '?', '\n'];
      let bestBreak = -1;

      for (const bp of breakPoints) {
        const lastIndex = searchText.lastIndexOf(bp);
        if (lastIndex > 0) {
          bestBreak = lastIndex + bp.length;
          break; // 優先度の高い区切りが見つかったら終了
        }
      }

      if (bestBreak > 0) {
        end = searchStart + bestBreak;
      }
    }

    const chunkText = processedText.slice(start, end).trim();

    if (chunkText.length > 0) {
      chunks.push({
        id: `chunk_${index}`,
        text: chunkText,
        metadata: {
          index,
          start,
          end,
        },
      });
      index++;
    }

    // 次のチャンクの開始位置（オーバーラップを考慮）
    const nextStart = end - chunkOverlap;

    // 進まない場合は強制的に進める
    if (nextStart <= start) {
      start = end;
    } else {
      start = nextStart;
    }
  }

  return chunks;
}

/**
 * ファイルからテキストを読み込んでチャンクに分割する
 * @param filePath ファイルパス
 * @param options 分割オプション
 * @returns チャンク配列
 */
export async function splitTextFromFile(
  filePath: string,
  options: Partial<SplitOptions> = {}
): Promise<TextChunk[]> {
  const fs = await import('fs/promises');
  const text = await fs.readFile(filePath, 'utf-8');
  return splitText(text, options);
}
