/**
 * Qwen ASR (Automatic Speech Recognition) Service
 * 音声をテキストに変換するサービス
 */

import { qwenConfig } from '../config/qwen.config.js';

interface ASRResponse {
  output: {
    choices: Array<{
      message: {
        content: Array<{
          text?: string;
        }>;
      };
    }>;
  };
  request_id?: string;
}

interface ASRResult {
  success: boolean;
  text?: string;
  error?: string;
}

/**
 * Convert audio data to text using Qwen ASR
 * @param audioData Base64 encoded audio data or data URL
 * @param audioFormat Audio format (e.g., 'webm', 'wav', 'mp3')
 * @returns Transcribed text
 */
export async function transcribeAudio(
  audioData: string,
  audioFormat: string = 'webm'
): Promise<ASRResult> {
  const { dashscope, asr } = qwenConfig;

  if (!dashscope.apiKey) {
    return { success: false, error: 'DASHSCOPE_API_KEY is not configured' };
  }

  try {
    // Ensure audio data is properly formatted as a data URL
    let formattedAudioData = audioData;
    if (!audioData.startsWith('data:')) {
      // Add data URL prefix if not present
      const mimeType = getMimeType(audioFormat);
      formattedAudioData = `data:${mimeType};base64,${audioData}`;
    }

    const requestBody = {
      model: asr.model,
      input: {
        messages: [
          {
            role: 'system',
            content: [{ text: '' }],
          },
          {
            role: 'user',
            content: [{ audio: formattedAudioData }],
          },
        ],
      },
    };

    const response = await fetch(`${dashscope.baseURL}${asr.endpoint}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${dashscope.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('ASR API error:', response.status, errorText);
      return {
        success: false,
        error: `ASR API error: ${response.status} - ${errorText}`,
      };
    }

    const data = (await response.json()) as ASRResponse;

    // Extract transcribed text from response
    const transcribedText = data.output?.choices?.[0]?.message?.content?.[0]?.text;

    if (!transcribedText) {
      return {
        success: false,
        error: 'No transcription found in response',
      };
    }

    return {
      success: true,
      text: transcribedText,
    };
  } catch (error) {
    console.error('ASR transcription error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error during transcription',
    };
  }
}

/**
 * Get MIME type for audio format
 */
function getMimeType(format: string): string {
  const mimeTypes: Record<string, string> = {
    webm: 'audio/webm',
    wav: 'audio/wav',
    mp3: 'audio/mpeg',
    ogg: 'audio/ogg',
    m4a: 'audio/m4a',
    flac: 'audio/flac',
  };
  return mimeTypes[format.toLowerCase()] || 'audio/webm';
}

export const qwenASRService = {
  transcribeAudio,
};
