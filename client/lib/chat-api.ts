const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

interface Message {
  id: string;
  conversationId: string;
  role: string;
  content: string;
  createdAt: Date;
}

interface Conversation {
  id: string;
  userId: string;
  title: string | null;
  createdAt: Date;
  updatedAt: Date;
  messages?: Message[];
}

export const chatApi = {
  // Get all conversations
  async getConversations(): Promise<Conversation[]> {
    const response = await fetch(`${API_URL}/api/chat/conversations`);

    if (!response.ok) {
      throw new Error("Failed to fetch conversations");
    }

    const data = await response.json();
    return data.conversations;
  },

  // Create a new conversation
  async createConversation(title?: string): Promise<Conversation> {
    const response = await fetch(`${API_URL}/api/chat/conversations`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ title }),
    });

    if (!response.ok) {
      throw new Error("Failed to create conversation");
    }

    const data = await response.json();
    return data.conversation;
  },

  // Get a specific conversation
  async getConversation(id: string): Promise<Conversation> {
    const response = await fetch(`${API_URL}/api/chat/conversations/${id}`);

    if (!response.ok) {
      throw new Error("Failed to fetch conversation");
    }

    const data = await response.json();
    return data.conversation;
  },

  // Send a message with streaming
  async sendMessageStream(
    conversationId: string,
    content: string,
    onChunk: (chunk: string) => void,
    onDone?: (message: Message) => void,
    onError?: (error: string) => void
  ): Promise<void> {
    const response = await fetch(
      `${API_URL}/api/chat/conversations/${conversationId}/messages/stream`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ content }),
      }
    );

    if (!response.ok) {
      throw new Error("Failed to send message");
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error("No response body");
    }

    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (line.startsWith("data: ")) {
          try {
            const data = JSON.parse(line.slice(6));

            switch (data.type) {
              case "text":
                onChunk(data.content);
                break;
              case "done":
                onDone?.({
                  id: Date.now().toString(),
                  conversationId,
                  role: "assistant",
                  content: data.content,
                  createdAt: new Date(),
                });
                break;
              case "error":
                onError?.(data.message);
                break;
            }
          } catch (e) {
            console.error("Failed to parse SSE data:", e);
          }
        }
      }
    }
  },

  // Delete a conversation
  async deleteConversation(id: string): Promise<void> {
    const response = await fetch(`${API_URL}/api/chat/conversations/${id}`, {
      method: "DELETE",
    });

    if (!response.ok) {
      throw new Error("Failed to delete conversation");
    }
  },

  // Update conversation title
  async updateTitle(id: string, title: string): Promise<void> {
    const response = await fetch(
      `${API_URL}/api/chat/conversations/${id}/title`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ title }),
      }
    );

    if (!response.ok) {
      throw new Error("Failed to update title");
    }
  },
};
