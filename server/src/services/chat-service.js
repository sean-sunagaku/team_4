import prisma from "../lib/db.js";

export const chatService = {
  // Get all conversations for a user
  async getUserConversations(userId) {
    return await prisma.conversation.findMany({
      where: { userId },
      orderBy: { updatedAt: "desc" },
      include: {
        messages: {
          take: 1,
          orderBy: { createdAt: "desc" },
        },
      },
    });
  },

  // Create a new conversation
  async createConversation(userId, title = null) {
    return await prisma.conversation.create({
      data: {
        userId,
        title,
      },
    });
  },

  // Get or create a conversation
  async getOrCreateConversation(userId, conversationId) {
    let conversation = await prisma.conversation.findFirst({
      where: {
        id: conversationId,
        userId,
      },
      include: {
        messages: {
          orderBy: { createdAt: "asc" },
        },
      },
    });

    if (!conversation) {
      return null;
    }

    return conversation;
  },

  // Get messages for a conversation
  async getMessages(conversationId) {
    return await prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: "asc" },
    });
  },

  // Add a message to a conversation
  async addMessage(conversationId, role, content) {
    const message = await prisma.message.create({
      data: {
        conversationId,
        role,
        content,
      },
    });

    // Update conversation's updatedAt
    await prisma.conversation.update({
      where: { id: conversationId },
      data: { updatedAt: new Date() },
    });

    return message;
  },

  // Update conversation title
  async updateTitle(conversationId, title) {
    return await prisma.conversation.update({
      where: { id: conversationId },
      data: { title },
    });
  },

  // Delete a conversation
  async deleteConversation(conversationId, userId) {
    const conversation = await prisma.conversation.findFirst({
      where: {
        id: conversationId,
        userId,
      },
    });

    if (!conversation) {
      throw new Error("Conversation not found");
    }

    await prisma.message.deleteMany({
      where: { conversationId },
    });

    return await prisma.conversation.delete({
      where: { id: conversationId },
    });
  },

  // Format messages for AI
  formatMessagesForAI(messages) {
    return messages.map((msg) => ({
      role: msg.role,
      content: msg.content,
    }));
  },
};
