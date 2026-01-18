/**
 * Local TTS (Text-to-Speech) Service using Microsoft Edge TTS
 * Microsoft Edge TTSを使用した高速ローカルTTSサービス
 *
 * 特徴:
 * - 無料で使用可能
 * - 高品質な日本語音声
 * - 低レイテンシ（50-200ms/文）
 */

import WebSocket from 'ws';
import { randomUUID } from 'crypto';

interface TTSResult {
  success: boolean;
  audioUrl?: string;
  audioData?: Buffer;
  error?: string;
}

// 利用可能な日本語音声
export const JAPANESE_VOICES = {
  nanami: 'ja-JP-NanamiNeural',    // 女性（標準、自然）
  keita: 'ja-JP-KeitaNeural',      // 男性
  aoi: 'ja-JP-AoiNeural',          // 女性（若い）
  daichi: 'ja-JP-DaichiNeural',    // 男性（若い）
  mayu: 'ja-JP-MayuNeural',        // 女性（落ち着いた）
  naoki: 'ja-JP-NaokiNeural',      // 男性（落ち着いた）
  shiori: 'ja-JP-ShioriNeural',    // 女性（明るい）
} as const;

// デフォルト設定
const DEFAULT_VOICE = process.env.EDGE_TTS_VOICE || JAPANESE_VOICES.nanami;
const DEFAULT_RATE = process.env.EDGE_TTS_RATE || '+0%';
const DEFAULT_PITCH = process.env.EDGE_TTS_PITCH || '+0Hz';
const DEFAULT_VOLUME = process.env.EDGE_TTS_VOLUME || '+0%';

// Edge TTS WebSocket設定
const EDGE_TTS_URL = 'wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1';
const TRUSTED_CLIENT_TOKEN = '6A5AA1D4EAFF4E9FB37E23D68491D6F4';

/**
 * SSMLを生成
 */
function generateSSML(text: string, voice: string, rate: string, pitch: string, volume: string): string {
  // XMLエスケープ
  const escapedText = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

  return `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xmlns:mstts="https://www.w3.org/2001/mstts" xml:lang="ja-JP">
  <voice name="${voice}">
    <prosody rate="${rate}" pitch="${pitch}" volume="${volume}">
      ${escapedText}
    </prosody>
  </voice>
</speak>`;
}

/**
 * WebSocket経由でEdge TTSに接続し音声を取得
 */
async function synthesizeWithEdgeTTS(
  text: string,
  voice: string = DEFAULT_VOICE,
  rate: string = DEFAULT_RATE,
  pitch: string = DEFAULT_PITCH,
  volume: string = DEFAULT_VOLUME
): Promise<TTSResult> {
  return new Promise((resolve) => {
    const requestId = randomUUID().replace(/-/g, '');
    const timestamp = new Date().toISOString();
    const audioChunks: Buffer[] = [];
    let resolved = false;

    const wsUrl = `${EDGE_TTS_URL}?TrustedClientToken=${TRUSTED_CLIENT_TOKEN}&ConnectionId=${requestId}`;

    const ws = new WebSocket(wsUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0',
        'Origin': 'chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold',
      },
    });

    // タイムアウト設定（10秒）
    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        ws.close();
        resolve({ success: false, error: 'TTS request timed out' });
      }
    }, 10000);

    ws.on('open', () => {
      // 設定メッセージを送信
      const configMessage = `X-Timestamp:${timestamp}\r\nContent-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n{"context":{"synthesis":{"audio":{"metadataoptions":{"sentenceBoundaryEnabled":"false","wordBoundaryEnabled":"false"},"outputFormat":"audio-24khz-48kbitrate-mono-mp3"}}}}`;
      ws.send(configMessage);

      // SSMLメッセージを送信
      const ssml = generateSSML(text, voice, rate, pitch, volume);
      const ssmlMessage = `X-RequestId:${requestId}\r\nContent-Type:application/ssml+xml\r\nX-Timestamp:${timestamp}\r\nPath:ssml\r\n\r\n${ssml}`;
      ws.send(ssmlMessage);
    });

    ws.on('message', (data: Buffer | string) => {
      if (resolved) return;

      // バイナリデータ（音声）の場合
      if (Buffer.isBuffer(data)) {
        // ヘッダー部分をスキップして音声データを抽出
        const headerEndIndex = data.indexOf(Buffer.from('Path:audio\r\n'));
        if (headerEndIndex !== -1) {
          // "Path:audio\r\n" の後にある音声データを取得
          const audioStart = data.indexOf(Buffer.from('\r\n\r\n'), headerEndIndex);
          if (audioStart !== -1) {
            const audioData = data.slice(audioStart + 4);
            if (audioData.length > 0) {
              audioChunks.push(audioData);
            }
          }
        }
      } else {
        // テキストメッセージの場合
        const message = data.toString();

        // 完了メッセージを検出
        if (message.includes('Path:turn.end')) {
          clearTimeout(timeout);
          resolved = true;
          ws.close();

          if (audioChunks.length > 0) {
            const fullAudio = Buffer.concat(audioChunks);
            // Base64 Data URLとして返す
            const base64Audio = fullAudio.toString('base64');
            const audioUrl = `data:audio/mp3;base64,${base64Audio}`;
            resolve({ success: true, audioUrl, audioData: fullAudio });
          } else {
            resolve({ success: false, error: 'No audio data received' });
          }
        }
      }
    });

    ws.on('error', (error) => {
      if (!resolved) {
        clearTimeout(timeout);
        resolved = true;
        console.error('Edge TTS WebSocket error:', error);
        resolve({ success: false, error: `WebSocket error: ${error.message}` });
      }
    });

    ws.on('close', () => {
      if (!resolved) {
        clearTimeout(timeout);
        resolved = true;

        if (audioChunks.length > 0) {
          const fullAudio = Buffer.concat(audioChunks);
          const base64Audio = fullAudio.toString('base64');
          const audioUrl = `data:audio/mp3;base64,${base64Audio}`;
          resolve({ success: true, audioUrl, audioData: fullAudio });
        } else {
          resolve({ success: false, error: 'Connection closed without audio' });
        }
      }
    });
  });
}

/**
 * テキストを音声に変換
 * Qwen TTS互換のインターフェース
 */
export async function synthesizeSpeech(
  text: string,
  voice?: string,
  _languageType?: string
): Promise<TTSResult> {
  if (!text || text.trim().length === 0) {
    return { success: false, error: 'Text is required for TTS' };
  }

  // テキスト長制限（長いテキストは分割処理が必要）
  const truncatedText = text.length > 1000 ? text.slice(0, 1000) : text;

  const startTime = Date.now();

  try {
    // 音声名のマッピング（Qwen voice名からEdge voice名への変換）
    const edgeVoice = mapVoiceToEdge(voice);

    const result = await synthesizeWithEdgeTTS(truncatedText, edgeVoice);

    const duration = Date.now() - startTime;
    console.log(`[LocalTTS] Synthesized ${truncatedText.length} chars in ${duration}ms`);

    return result;
  } catch (error) {
    console.error('[LocalTTS] Synthesis error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown TTS error',
    };
  }
}

/**
 * Qwen音声名をEdge音声名にマッピング
 */
function mapVoiceToEdge(voice?: string): string {
  if (!voice) return DEFAULT_VOICE;

  // すでにEdge形式の場合はそのまま返す
  if (voice.startsWith('ja-JP-')) return voice;

  // Qwen音声名からEdge音声名へのマッピング
  const voiceMap: Record<string, string> = {
    'Cherry': JAPANESE_VOICES.nanami,
    'Serena': JAPANESE_VOICES.aoi,
    'Ethan': JAPANESE_VOICES.keita,
    'Chelsie': JAPANESE_VOICES.shiori,
  };

  return voiceMap[voice] || DEFAULT_VOICE;
}

/**
 * 利用可能な音声一覧を取得
 */
export function getAvailableVoices() {
  return JAPANESE_VOICES;
}

export const localTTSService = {
  synthesizeSpeech,
  getAvailableVoices,
  JAPANESE_VOICES,
};
