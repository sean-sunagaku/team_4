/**
 * Qwen TTS (Text-to-Speech) Service
 * テキストを音声に変換するサービス
 * https://www.alibabacloud.com/help/en/model-studio/qwen-tts
 */

import { qwenConfig } from '../config/qwen.config.js';

interface TTSResult {
  success: boolean;
  audioUrl?: string;
  error?: string;
}

/**
 * Convert text to speech using Qwen TTS
 * Uses SSE mode to get audio URL
 */
export async function synthesizeSpeech(
  text: string,
  voice?: string,
  languageType?: string
): Promise<TTSResult> {
  const { dashscope, tts } = qwenConfig;

  if (!dashscope.apiKey) {
    return { success: false, error: 'DASHSCOPE_API_KEY is not configured' };
  }

  if (!text || text.trim().length === 0) {
    return { success: false, error: 'Text is required for TTS' };
  }

  // Limit text length
  const truncatedText = text.length > 500 ? text.slice(0, 500) + '...' : text;

  try {
    const endpoint = `${dashscope.baseURL}${tts.endpoint}`;

    const requestBody = {
      model: tts.model,
      input: {
        text: truncatedText,
        voice: voice || tts.voice,
        language_type: languageType || tts.languageType,
      },
    };

    console.log('TTS Request URL:', endpoint);
    console.log('TTS Request body:', JSON.stringify(requestBody, null, 2));

    // Add timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000); // 60 second timeout

    // Use SSE mode to get audio URL in the final event
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${dashscope.apiKey}`,
        'Content-Type': 'application/json',
        'X-DashScope-SSE': 'enable',
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('TTS API error:', response.status, errorText);
      return {
        success: false,
        error: `TTS API error: ${response.status} - ${errorText}`,
      };
    }

    // Parse SSE response to get audio URL from the last event
    const responseText = await response.text();
    console.log('TTS Response (raw):', responseText.slice(0, 500));

    // Parse SSE events - look for audio URL in the output
    const lines = responseText.split('\n');
    let audioUrl: string | undefined;

    for (const line of lines) {
      if (line.startsWith('data:')) {
        try {
          const jsonStr = line.slice(5).trim();
          if (jsonStr) {
            const data = JSON.parse(jsonStr);
            // Check various possible locations for the audio URL
            const url = data.output?.audio?.url ||
                       data.output?.audio ||
                       data.audio?.url ||
                       data.audio;
            if (url && typeof url === 'string' && url.startsWith('http')) {
              audioUrl = url;
            }
          }
        } catch (e) {
          // Skip non-JSON lines
        }
      }
    }

    if (audioUrl) {
      console.log('TTS synthesis completed, audio URL:', audioUrl);
      return {
        success: true,
        audioUrl: audioUrl,
      };
    }

    console.error('No audio URL found in TTS response');
    return {
      success: false,
      error: 'No audio URL found in TTS response',
    };
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      console.error('TTS request timed out');
      return {
        success: false,
        error: 'TTS request timed out',
      };
    }
    console.error('TTS synthesis error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown TTS error',
    };
  }
}

export const qwenTTSService = {
  synthesizeSpeech,
};
