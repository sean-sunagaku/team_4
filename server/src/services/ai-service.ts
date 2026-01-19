import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { streamText } from "ai";
import type { LanguageModel } from "ai";
import { config } from "../config/google.config.js";

export interface AIMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface AIResponse {
  content: string;
}

export class AIService {
  private model: LanguageModel;

  constructor() {
    if (!config.googleApiKey) {
      throw new Error("GOOGLE_API_KEY is not set in environment variables");
    }

    const google = createGoogleGenerativeAI({
      apiKey: config.googleApiKey,
    });
    this.model = google(config.model);
  }

  /**
   * Send a message and get streaming response (optimized)
   * @param messages - Array of message objects {role, content}
   * @param onChunk - Callback for each text chunk
   * @returns Full response with content
   */
  async sendMessage(
    messages: AIMessage[],
    onChunk?: (chunk: string) => void
  ): Promise<AIResponse> {
    try {
      const systemMessage = messages.find((m) => m.role === "system");
      const nonSystemMessages = messages.filter((m) => m.role !== "system");

      const streamConfig: {
        model: LanguageModel;
        messages: AIMessage[];
        temperature: number;
        maxTokens: number;
        system?: string;
      } = {
        model: this.model,
        messages: nonSystemMessages.length > 0 ? nonSystemMessages : messages,
        temperature: config.temperature,
        maxTokens: config.maxTokens,
      };

      if (systemMessage) {
        streamConfig.system = systemMessage.content;
      }

      const result = streamText(streamConfig);

      let fullResponse = "";

      // Optimized: Use textStream directly (lighter than fullStream)
      for await (const chunk of result.textStream) {
        fullResponse += chunk;
        if (onChunk && chunk) {
          onChunk(chunk);
        }
      }

      // Optimized: Return immediately without waiting for additional metadata
      return {
        content: fullResponse,
      };
    } catch (error) {
      console.error("AI Service Error:", (error as Error).message);
      throw error;
    }
  }
}
