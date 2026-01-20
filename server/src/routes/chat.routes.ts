/**
 * Chat API Routes
 */

import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { chatService } from "../services/chat-service.js";
import { ragService } from "../services/rag-service.js";
import { qwenLLMService } from "../services/qwen-llm-service.js";
import { buildContext } from "../services/context-builder.js";
import { ANONYMOUS_USER_ID, getLocation } from "../config/app.config.js";
import type { Location } from "../types/common.types.js";

const chatRoutes = new Hono();

// Get all conversations
chatRoutes.get("/conversations", async (c) => {
  try {
    const conversations =
      await chatService.getUserConversations(ANONYMOUS_USER_ID);
    return c.json({ conversations });
  } catch (error) {
    console.error("Error fetching conversations:", error);
    return c.json({ error: "Failed to fetch conversations" }, 500);
  }
});

// Create a new conversation
chatRoutes.post("/conversations", async (c) => {
  try {
    const body = await c.req.json();
    const { title } = body;
    const conversation = await chatService.createConversation(
      ANONYMOUS_USER_ID,
      title
    );
    return c.json({ conversation });
  } catch (error) {
    console.error("Error creating conversation:", error);
    return c.json({ error: "Failed to create conversation" }, 500);
  }
});

// Get a specific conversation with messages
chatRoutes.get("/conversations/:id", async (c) => {
  try {
    const id = c.req.param("id");
    const conversation = await chatService.getOrCreateConversation(
      ANONYMOUS_USER_ID,
      id
    );

    if (!conversation) {
      return c.json({ error: "Conversation not found" }, 404);
    }

    const messages = await chatService.getMessages(id);

    return c.json({ conversation: { ...conversation, messages } });
  } catch (error) {
    console.error("Error fetching conversation:", error);
    return c.json({ error: "Failed to fetch conversation" }, 500);
  }
});

// Send a message and get AI response with streaming
chatRoutes.post("/conversations/:id/messages/stream", async (c) => {
  const id = c.req.param("id");

  let content: string;
  let location: Location | undefined;
  try {
    const body = await c.req.json();
    content = body.content;
    location = body.location;
  } catch {
    return c.json({ error: "Invalid request body" }, 400);
  }

  if (!content || content.trim().length === 0) {
    return c.json({ error: "Message content is required" }, 400);
  }

  const conversation = await chatService.getOrCreateConversation(
    ANONYMOUS_USER_ID,
    id
  );

  if (!conversation) {
    return c.json({ error: "Conversation not found" }, 404);
  }

  return streamSSE(c, async (stream) => {
    try {
      const effectiveLocation = getLocation(location);

      // Check similarity cache first
      const cacheHit = await ragService.checkSimilarityCache(content);
      if (cacheHit) {
        console.log(`Similarity cache hit! Returning cached answer.`);
        await stream.writeSSE({
          data: JSON.stringify({ type: "text", content: cacheHit.answer }),
        });
        await stream.writeSSE({
          data: JSON.stringify({
            type: "done",
            content: cacheHit.answer,
            cached: true,
          }),
        });
        chatService.addMessage(id, "user", content).catch(console.error);
        chatService.addMessage(id, "assistant", cacheHit.answer).catch(console.error);
        return;
      }

      // Build context with searches
      const [messages, contextResult] = await Promise.all([
        chatService.getMessages(id),
        buildContext({ content, location: effectiveLocation }),
        chatService.addMessage(id, "user", content).catch((err) => {
          console.error("Failed to save user message:", err);
        }),
      ]);

      // Build AI messages
      const aiMessages = [
        { role: "system" as const, content: contextResult.systemPrompt },
        ...chatService.formatMessagesForAI(messages),
        { role: "user" as const, content: content },
      ];

      let fullContent = "";

      // Stream AI response
      await qwenLLMService.sendMessageStream(aiMessages, {
        onChunk: (chunk: string) => {
          fullContent += chunk;
          stream.writeSSE({
            data: JSON.stringify({ type: "text", content: chunk }),
          });
        },
      });

      const aiResponse =
        fullContent || "申し訳ありません、応答を生成できませんでした。";

      // Post-stream operations (non-blocking)
      const postStreamOps = async () => {
        try {
          const savedMessage = await chatService.addMessage(id, "assistant", aiResponse);

          const userMessages = messages.filter(
            (m: { role: string }) => m.role === "user"
          );
          if (userMessages.length === 0) {
            const title =
              content.slice(0, 50) + (content.length > 50 ? "..." : "");
            await chatService.updateTitle(id, title);
          }

          if (savedMessage) {
            const lastUserMessage = messages.filter((m: { role: string }) => m.role === "user").pop();
            ragService.addConversationToRAG({
              conversationId: id,
              questionId: lastUserMessage?.id || `user_${Date.now()}`,
              answerId: savedMessage.id,
              question: content,
              answer: aiResponse,
            }).catch((err) => {
              console.error("Failed to add conversation to RAG:", err);
            });
          }
        } catch (err) {
          console.error("Post-stream operation failed:", err);
        }
      };

      postStreamOps();

      await stream.writeSSE({
        data: JSON.stringify({
          type: "done",
          content: aiResponse,
        }),
      });
    } catch (error) {
      console.error("Error in streaming message:", error);
      await stream.writeSSE({
        data: JSON.stringify({
          type: "error",
          message: error instanceof Error ? error.message : "Unknown error",
        }),
      });
    }
  });
});

// Delete a conversation
chatRoutes.delete("/conversations/:id", async (c) => {
  try {
    const id = c.req.param("id");
    await chatService.deleteConversation(id, ANONYMOUS_USER_ID);
    return c.json({ success: true });
  } catch (error) {
    console.error("Error deleting conversation:", error);
    return c.json({ error: "Failed to delete conversation" }, 500);
  }
});

// Update conversation title
chatRoutes.patch("/conversations/:id/title", async (c) => {
  try {
    const id = c.req.param("id");
    const body = await c.req.json();
    const { title } = body;

    if (!title || title.trim().length === 0) {
      return c.json({ error: "Title is required" }, 400);
    }

    const conversation = await chatService.getOrCreateConversation(
      ANONYMOUS_USER_ID,
      id
    );

    if (!conversation) {
      return c.json({ error: "Conversation not found" }, 404);
    }

    await chatService.updateTitle(id, title);

    return c.json({ success: true });
  } catch (error) {
    console.error("Error updating title:", error);
    return c.json({ error: "Failed to update title" }, 500);
  }
});

export { chatRoutes };
