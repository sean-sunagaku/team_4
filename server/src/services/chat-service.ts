import prisma from "../lib/db.js";

export type MessageRole = "system" | "user" | "assistant";

export interface MessageRecord {
  id?: string;
  role: string;
  content: string;
}

export interface MessageWithId {
  id: string;
  role: string;
  content: string;
}

export interface ConversationSummary {
  id: string;
  userId: string;
  title: string | null;
  createdAt: Date;
  updatedAt: Date;
  messages?: MessageRecord[];
}

export interface AIFormattedMessage {
  role: MessageRole;
  content: string;
}

export interface ChatServiceInterface {
  getUserConversations(userId: string): Promise<ConversationSummary[]>;
  createConversation(userId: string, title?: string | null): Promise<ConversationSummary>;
  getOrCreateConversation(userId: string, conversationId: string): Promise<ConversationSummary | null>;
  getMessages(conversationId: string): Promise<MessageRecord[]>;
  addMessage(conversationId: string, role: string, content: string): Promise<MessageWithId>;
  updateTitle(conversationId: string, title: string): Promise<{ id: string; title: string | null }>;
  deleteConversation(conversationId: string, userId: string): Promise<{ id: string }>;
  formatMessagesForAI(messages: MessageRecord[]): AIFormattedMessage[];
}

export const chatService: ChatServiceInterface = {
  // Get all conversations for a user (optimized: minimal fields)
  async getUserConversations(userId: string): Promise<ConversationSummary[]> {
    return await prisma.conversation.findMany({
      where: { userId },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        userId: true,
        title: true,
        createdAt: true,
        updatedAt: true,
        messages: {
          take: 1,
          orderBy: { createdAt: "desc" },
          select: { role: true, content: true },
        },
      },
    });
  },

  // Create a new conversation
  async createConversation(userId: string, title: string | null = null): Promise<ConversationSummary> {
    return await prisma.conversation.create({
      data: { userId, title },
      select: { id: true, userId: true, title: true, createdAt: true, updatedAt: true },
    });
  },

  // Get or create a conversation (optimized: no messages include)
  async getOrCreateConversation(userId: string, conversationId: string): Promise<ConversationSummary | null> {
    const conversation = await prisma.conversation.findFirst({
      where: { id: conversationId, userId },
      select: {
        id: true,
        userId: true,
        title: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return conversation || null;
  },

  // Get messages for a conversation (optimized: only role and content)
  async getMessages(conversationId: string): Promise<MessageRecord[]> {
    return await prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: "asc" },
      select: {
        role: true,
        content: true,
      },
    });
  },

  // Add a message to a conversation (optimized: single transaction)
  async addMessage(conversationId: string, role: string, content: string): Promise<MessageWithId> {
    const [message] = await prisma.$transaction([
      prisma.message.create({
        data: { conversationId, role, content },
        select: { id: true, role: true, content: true },
      }),
      prisma.conversation.update({
        where: { id: conversationId },
        data: { updatedAt: new Date() },
        select: { id: true },
      }),
    ]);

    return message;
  },

  // Update conversation title
  async updateTitle(conversationId: string, title: string): Promise<{ id: string; title: string | null }> {
    return await prisma.conversation.update({
      where: { id: conversationId },
      data: { title },
      select: { id: true, title: true },
    });
  },

  // Delete a conversation (optimized: single transaction)
  async deleteConversation(conversationId: string, userId: string): Promise<{ id: string }> {
    const conversation = await prisma.conversation.findFirst({
      where: { id: conversationId, userId },
      select: { id: true },
    });

    if (!conversation) {
      throw new Error("Conversation not found");
    }

    await prisma.$transaction([
      prisma.message.deleteMany({
        where: { conversationId },
      }),
      prisma.conversation.delete({
        where: { id: conversationId },
      }),
    ]);

    return { id: conversationId };
  },

  // Format messages for AI (cast role to MessageRole)
  formatMessagesForAI(messages: MessageRecord[]): AIFormattedMessage[] {
    return messages.map((msg) => ({
      role: msg.role as MessageRole,
      content: msg.content,
    }));
  },
};
