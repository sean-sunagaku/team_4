import prisma from "../lib/db.js";

export const chatService = {
  // Get all conversations for a user (optimized: minimal fields)
  async getUserConversations(userId) {
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
  async createConversation(userId, title = null) {
    return await prisma.conversation.create({
      data: { userId, title },
      select: { id: true, userId: true, title: true, createdAt: true, updatedAt: true },
    });
  },

  // Get or create a conversation (optimized: no messages include)
  async getOrCreateConversation(userId, conversationId) {
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
  async getMessages(conversationId) {
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
  async addMessage(conversationId, role, content) {
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
  async updateTitle(conversationId, title) {
    return await prisma.conversation.update({
      where: { id: conversationId },
      data: { title },
      select: { id: true, title: true },
    });
  },

  // Delete a conversation (optimized: single transaction)
  async deleteConversation(conversationId, userId) {
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

  // Format messages for AI (no change needed)
  formatMessagesForAI(messages) {
    return messages.map((msg) => ({
      role: msg.role,
      content: msg.content,
    }));
  },
};
