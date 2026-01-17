/**
 * Qwen LLM Service
 * テキスト生成サービス（OpenAI互換API使用）
 */

import OpenAI from 'openai';
import { qwenConfig } from '../config/qwen.config.js';

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface StreamCallbacks {
  onChunk?: (chunk: string) => void;
  onDone?: (fullContent: string) => void;
  onError?: (error: Error) => void;
}

// Lazy initialization of OpenAI client for Qwen
let openaiClient: OpenAI | null = null;

function getOpenAIClient(): OpenAI {
  if (!openaiClient) {
    openaiClient = new OpenAI({
      apiKey: qwenConfig.dashscope.apiKey,
      baseURL: qwenConfig.dashscope.openAICompatibleBaseURL,
    });
  }
  return openaiClient;
}

/**
 * Send a chat message and receive a streaming response
 * @param messages Array of chat messages
 * @param callbacks Callbacks for streaming events
 * @returns Full response content
 */
export async function sendMessageStream(
  messages: ChatMessage[],
  callbacks: StreamCallbacks = {}
): Promise<string> {
  const { llm } = qwenConfig;
  const client = getOpenAIClient();

  try {
    const stream = await client.chat.completions.create({
      model: llm.model,
      messages: messages,
      temperature: llm.temperature,
      max_tokens: llm.maxTokens,
      stream: true,
    });

    let fullContent = '';

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) {
        fullContent += content;
        callbacks.onChunk?.(content);
      }
    }

    callbacks.onDone?.(fullContent);
    return fullContent;
  } catch (error) {
    const err = error instanceof Error ? error : new Error('Unknown error');
    callbacks.onError?.(err);
    throw err;
  }
}

/**
 * Send a chat message and receive a non-streaming response
 * @param messages Array of chat messages
 * @returns Response content
 */
export async function sendMessage(messages: ChatMessage[]): Promise<string> {
  const { llm } = qwenConfig;
  const client = getOpenAIClient();

  try {
    const response = await client.chat.completions.create({
      model: llm.model,
      messages: messages,
      temperature: llm.temperature,
      max_tokens: llm.maxTokens,
      stream: false,
    });

    return response.choices[0]?.message?.content || '';
  } catch (error) {
    console.error('Qwen LLM error:', error);
    throw error;
  }
}

/**
 * Create an async iterator for streaming responses
 * Useful for SSE streaming
 */
export async function* streamMessageGenerator(
  messages: ChatMessage[]
): AsyncGenerator<string, void, unknown> {
  const { llm } = qwenConfig;
  const client = getOpenAIClient();

  const stream = await client.chat.completions.create({
    model: llm.model,
    messages: messages,
    temperature: llm.temperature,
    max_tokens: llm.maxTokens,
    stream: true,
  });

  for await (const chunk of stream) {
    const content = chunk.choices[0]?.delta?.content;
    if (content) {
      yield content;
    }
  }
}

export const qwenLLMService = {
  sendMessage,
  sendMessageStream,
  streamMessageGenerator,
};
