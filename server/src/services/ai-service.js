import { google } from "@ai-sdk/google";
import { streamText } from "ai";
import { config } from "../config/google.config.js";

export class AIService {
  constructor() {
    if (!config.googleApiKey) {
      throw new Error("GOOGLE_API_KEY is not set in environment variables");
    }

    this.model = google(config.model, {
      apiKey: config.googleApiKey,
    });
  }

  /**
   * Send a message and get streaming response
   * @param {Array} messages - Array of message objects {role, content}
   * @param {Function} onChunk - Callback for each text chunk
   * @returns {Promise<Object>} Full response with content and usage
   */
  async sendMessage(messages, onChunk) {
    try {
      const systemMessage = messages.find((m) => m.role === "system");
      const nonSystemMessages = messages.filter((m) => m.role !== "system");

      const streamConfig = {
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

      for await (const part of result.fullStream) {
        if (part.type === "text-delta") {
          const delta = part.textDelta || part.text || "";
          fullResponse += delta;
          if (onChunk && delta) {
            onChunk(delta);
          }
        }
      }

      const [finishReason, usage, text] = await Promise.all([
        result.finishReason,
        result.usage,
        result.text,
      ]);

      return {
        content: text || fullResponse,
        finishReason,
        usage,
      };
    } catch (error) {
      console.error("AI Service Error:", error.message);
      throw error;
    }
  }
}
