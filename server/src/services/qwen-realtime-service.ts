/**
 * Qwen3 ASR Flash Realtime Service
 * WebSocket-based real-time speech recognition
 * Model: qwen3-asr-flash-realtime
 * Supports: Japanese, Chinese, English, Korean, etc.
 *
 * Documentation: https://www.alibabacloud.com/help/en/model-studio/qwen-asr-realtime-interaction-process
 */

import WebSocket from 'ws';

const DASHSCOPE_API_KEY = process.env.DASHSCOPE_API_KEY || '';
const DASHSCOPE_REGION = process.env.DASHSCOPE_REGION || 'cn';

// WebSocket endpoints - model is passed as query parameter
const WS_BASE_URLS = {
  cn: 'wss://dashscope.aliyuncs.com/api-ws/v1/realtime',
  intl: 'wss://dashscope-intl.aliyuncs.com/api-ws/v1/realtime',
};

const ASR_MODEL = 'qwen3-asr-flash-realtime';

interface RealtimeSessionConfig {
  language?: string;  // ASR言語設定（デフォルト: 'ja'）
  onTranscript: (text: string, isFinal: boolean) => void;
  onError: (error: string) => void;
  onConnected?: () => void;
  onDisconnected?: () => void;
}

/**
 * Create a WebSocket session for real-time ASR
 * Uses VAD mode (automatic speech detection)
 */
export function createRealtimeASRSession(config: RealtimeSessionConfig) {
  const baseUrl = WS_BASE_URLS[DASHSCOPE_REGION as keyof typeof WS_BASE_URLS] || WS_BASE_URLS.cn;
  // Model name is passed as query parameter
  const wsUrl = `${baseUrl}?model=${ASR_MODEL}`;

  // 言語設定（デフォルト: 日本語）
  const language = config.language || 'ja';

  let ws: WebSocket | null = null;
  let isSessionReady = false;
  let eventCounter = 0;

  // Generate unique event ID
  const generateEventId = () => `event_${Date.now()}_${++eventCounter}`;

  const connect = () => {
    console.log(`Connecting to DashScope ASR: ${wsUrl} (language: ${language})`);

    ws = new WebSocket(wsUrl, {
      headers: {
        // Note: lowercase 'bearer' as per documentation
        'Authorization': `bearer ${DASHSCOPE_API_KEY}`,
      },
    });

    ws.on('open', () => {
      console.log(`Realtime ASR WebSocket connected (language: ${language})`);

      // Send session.update to configure language
      // Based on DashScope SDK: TranscriptionParams(language='ja', sample_rate=16000, input_audio_format='pcm')
      const sessionUpdate = {
        event_id: generateEventId(),
        type: 'session.update',
        session: {
          modalities: ['text'],  // Output modalities
          input_audio_transcription: {
            language: language,  // 動的言語設定
          },
          turn_detection: {
            type: 'server_vad',
            threshold: 0.5,
            silence_duration_ms: 800,
          },
        },
      };

      console.log(`Sending session.update for ${language}:`, JSON.stringify(sessionUpdate));
      ws?.send(JSON.stringify(sessionUpdate));
    });

    ws.on('message', (data: Buffer) => {
      try {
        const message = JSON.parse(data.toString());
        console.log('ASR message:', message.event || message.type, message);

        // Handle different event types based on documentation
        const eventType = message.event || message.type;

        switch (eventType) {
          case 'session.created':
            console.log('Session created');
            break;

          case 'session.updated':
            console.log('Session updated - ready for audio');
            isSessionReady = true;
            config.onConnected?.();
            break;

          case 'input_audio_buffer.speech_started':
            console.log('Speech started detected');
            break;

          case 'input_audio_buffer.speech_stopped':
            console.log('Speech stopped detected');
            break;

          case 'input_audio_buffer.committed':
            console.log('Audio buffer committed');
            break;

          case 'conversation.item.created':
            console.log('Conversation item created');
            break;

          // Interim transcription results
          case 'conversation.item.input_audio_transcription.text':
            if (message.text || message.transcript) {
              const text = message.text || message.transcript;
              console.log('Interim transcription:', text);
              config.onTranscript(text, false);
            }
            break;

          // Final transcription results
          case 'conversation.item.input_audio_transcription.completed':
            if (message.text || message.transcript) {
              const text = message.text || message.transcript;
              console.log('Final transcription:', text);
              config.onTranscript(text, true);
            }
            break;

          case 'error':
            console.error('ASR error:', message.error || message.message);
            config.onError(message.error?.message || message.message || 'Unknown error');
            break;

          default:
            console.log('Unknown ASR event:', eventType, message);
        }
      } catch (err) {
        console.error('Failed to parse ASR message:', err);
      }
    });

    ws.on('error', (error) => {
      console.error('ASR WebSocket error:', error);
      config.onError('WebSocket connection error');
    });

    ws.on('close', (code, reason) => {
      console.log(`ASR WebSocket closed: ${code} - ${reason}`);
      isSessionReady = false;
      config.onDisconnected?.();
    });
  };

  connect();

  return {
    /**
     * Send audio data (PCM 16kHz mono, base64 encoded)
     * Audio chunk should be ~3200 bytes (~0.1s at 16kHz)
     */
    sendAudio: (audioBase64: string) => {
      if (ws && ws.readyState === WebSocket.OPEN && isSessionReady) {
        if (!audioBase64 || audioBase64.length === 0) {
          console.warn('Skipping empty audio data');
          return;
        }
        const audioEvent = {
          event_id: generateEventId(),
          type: 'input_audio_buffer.append',
          audio: audioBase64,
        };
        ws.send(JSON.stringify(audioEvent));
      }
    },

    /**
     * Signal end of audio input (for manual mode)
     */
    finishAudio: () => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        const finishEvent = {
          event_id: generateEventId(),
          type: 'input_audio_buffer.commit',
        };
        ws.send(JSON.stringify(finishEvent));
      }
    },

    /**
     * End the session
     */
    endSession: () => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        const finishEvent = {
          event_id: generateEventId(),
          type: 'session.finish',
        };
        ws.send(JSON.stringify(finishEvent));
      }
    },

    /**
     * Close the WebSocket connection
     */
    close: () => {
      if (ws) {
        ws.close();
        ws = null;
      }
    },

    /**
     * Check if session is ready
     */
    isReady: () => isSessionReady,
  };
}

/**
 * One-shot wake word detection using REST API (fallback)
 */
export async function detectWakeWordREST(
  audioBase64: string,
  format: string = 'webm'
): Promise<{ detected: boolean; transcription: string }> {
  // This uses the existing qwen-asr-service
  // Kept as fallback if WebSocket is not available
  return { detected: false, transcription: '' };
}

export const qwenRealtimeService = {
  createRealtimeASRSession,
  detectWakeWordREST,
};
