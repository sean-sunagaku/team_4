/**
 * RAG API Routes
 */

import { Hono } from "hono";
import { ragService } from "../services/rag-service.js";

const ragRoutes = new Hono();

// Get RAG system status
ragRoutes.get("/status", async (c) => {
  try {
    const status = await ragService.getStatus();
    return c.json(status);
  } catch (error) {
    console.error("Error getting RAG status:", error);
    return c.json({ error: "Failed to get RAG status" }, 500);
  }
});

// Initialize RAG system
ragRoutes.post("/init", async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const { filePath } = body as { filePath?: string };

    const result = await ragService.initialize(filePath);

    if (!result.success) {
      return c.json({ error: result.message, documentCount: 0 }, 400);
    }

    return c.json(result);
  } catch (error) {
    console.error("Error initializing RAG:", error);
    return c.json({ error: "Failed to initialize RAG" }, 500);
  }
});

// Reindex RAG system
ragRoutes.post("/reindex", async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const { filePath } = body as { filePath?: string };

    const result = await ragService.reindex(filePath);

    if (!result.success) {
      return c.json({ error: result.message, documentCount: 0 }, 400);
    }

    return c.json(result);
  } catch (error) {
    console.error("Error reindexing RAG:", error);
    return c.json({ error: "Failed to reindex RAG" }, 500);
  }
});

// Search with RAG (POST)
ragRoutes.post("/search", async (c) => {
  try {
    const body = await c.req.json();
    const { query, topK, useHybrid } = body as {
      query: string;
      topK?: number;
      useHybrid?: boolean;
    };

    if (!query || query.trim().length === 0) {
      return c.json({ error: "Query is required" }, 400);
    }

    const results = await ragService.search(query, { topK, useHybrid });
    const formattedForAI = ragService.formatResultsForAI(results);

    return c.json({
      query,
      results,
      formattedForAI,
      count: results.length,
    });
  } catch (error) {
    console.error("Error searching RAG:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    return c.json({ error: `Failed to search: ${errorMessage}` }, 500);
  }
});

// Search with RAG (GET)
ragRoutes.get("/search", async (c) => {
  try {
    const query = c.req.query("q");
    const topKParam = c.req.query("topK");
    const useHybridParam = c.req.query("useHybrid");

    if (!query || query.trim().length === 0) {
      return c.json({ error: "Query parameter 'q' is required" }, 400);
    }

    const topK = topKParam ? parseInt(topKParam, 10) : undefined;
    const useHybrid = useHybridParam !== "false";

    const results = await ragService.search(query, { topK, useHybrid });
    const formattedForAI = ragService.formatResultsForAI(results);

    return c.json({
      query,
      results,
      formattedForAI,
      count: results.length,
    });
  } catch (error) {
    console.error("Error searching RAG:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    return c.json({ error: `Failed to search: ${errorMessage}` }, 500);
  }
});

export { ragRoutes };
