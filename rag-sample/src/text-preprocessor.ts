/**
 * テキスト前処理モジュール
 * PDFから変換したテキストのノイズを除去し、品質を向上させる
 */

/**
 * テキストを前処理してノイズを除去する
 * @param text 入力テキスト
 * @returns 前処理後のテキスト
 */
export function preprocessText(text: string): string {
  let processed = text;

  // 1. ページ番号パターンを除去 (例: ・123・, -123-, ･123･)
  processed = processed.replace(/[・･\-]\d+[・･\-]/g, '');

  // 2. PDFのヘッダー/フッターパターンを除去
  processed = processed.replace(/PRIUS_UG_M47F64_\(J\)/g, '');
  processed = processed.replace(/Sec_\d+-?\d*\.fm/g, '');
  processed = processed.replace(/Forward\.fm/g, '');

  // 3. 1文字ごとの改行を修正（縦書きPDFの変換ノイズ）
  // 連続する1文字+改行のパターンを検出して結合
  processed = processed.replace(/([ァ-ヶー一-龯a-zA-Z])\n([ァ-ヶー一-龯a-zA-Z])\n/g, '$1$2');

  // 4. 連続する空行を1つに
  processed = processed.replace(/\n{3,}/g, '\n\n');

  // 5. 行頭・行末の空白を除去
  processed = processed
    .split('\n')
    .map((line) => line.trim())
    .join('\n');

  // 6. 記号のみの行を除去
  processed = processed
    .split('\n')
    .filter((line) => {
      // 空行は保持
      if (line === '') return true;
      // 記号・空白のみの行は除去
      return !/^[\s\u3000・･●○■□▲△▼▽◆◇★☆※→←↑↓｜|＊*＝=－\-＿_]+$/.test(line);
    })
    .join('\n');

  // 7. 特殊な空白文字を通常の空白に
  processed = processed.replace(/[\u3000\t]/g, ' ');

  // 8. 連続する空白を1つに
  processed = processed.replace(/ {2,}/g, ' ');

  // 9. 「| 」で始まる見出し行のパイプを除去
  processed = processed.replace(/^\| /gm, '');

  return processed.trim();
}

/**
 * テキストを段落単位で分割する
 * @param text 入力テキスト
 * @returns 段落の配列
 */
export function splitIntoParagraphs(text: string): string[] {
  const preprocessed = preprocessText(text);

  // 空行で段落を分割
  const paragraphs = preprocessed
    .split(/\n{2,}/)
    .map((p) => p.replace(/\n/g, ' ').trim())
    .filter((p) => p.length > 0);

  return paragraphs;
}

/**
 * 日本語テキストをトークン化する（簡易版）
 * @param text 入力テキスト
 * @returns トークンの配列
 */
export function tokenize(text: string): string[] {
  // 日本語の場合、文字単位でn-gramを作成するか、
  // 簡易的に句読点・空白で分割
  const normalized = text.toLowerCase();

  // 句読点、空白、記号で分割
  const tokens = normalized
    .split(/[\s、。！？!?,.;:・\n]+/)
    .filter((t) => t.length > 0);

  return tokens;
}

/**
 * 日本語テキストをbi-gramに分割する
 * @param text 入力テキスト
 * @returns bi-gramの配列
 */
export function toBigrams(text: string): string[] {
  const normalized = text.replace(/[\s\n]/g, '');
  const bigrams: string[] = [];

  for (let i = 0; i < normalized.length - 1; i++) {
    bigrams.push(normalized.slice(i, i + 2));
  }

  return bigrams;
}
