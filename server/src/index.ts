/**
 * Team 4 Chat Server
 * Main entry point - simplified with routes and services modularized
 */

import { Hono } from "hono";
import { cors } from "hono/cors";
import dotenv from "dotenv";

// Routes
import { chatRoutes } from "./routes/chat.routes.js";
import { ragRoutes } from "./routes/rag.routes.js";
import { voiceRoutes } from "./routes/voice.routes.js";
import { routeRoutes } from "./routes/route.routes.js";

// WebSocket handler
import { websocketHandler } from "./websocket/asr-handler.js";

// Config
import { PORT, logStartupInfo } from "./config/app.config.js";

dotenv.config();

// ============================================
// App Setup
// ============================================

const app = new Hono();

// CORS middleware - allow all origins
app.use(
  "/*",
  cors({
    origin: "*",
    allowMethods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
  })
);

// Root endpoint
app.get("/", (c) => {
  return c.json({ message: "Team 4 Chat Server (Hono + Bun)" });
});

// ============================================
// Mount Routes
// ============================================

app.route("/api/chat", chatRoutes);
app.route("/api/rag", ragRoutes);
app.route("/api/voice", voiceRoutes);
app.route("/api/route", routeRoutes);

// ============================================
// Server with WebSocket Support
// ============================================

const server = Bun.serve({
  port: Number(PORT),
  fetch(req, server) {
    // Handle WebSocket upgrade for /ws/asr
    const url = new URL(req.url);
    if (url.pathname === "/ws/asr") {
      const upgraded = server.upgrade(req, { data: {} });
      if (upgraded) {
        return undefined;
      }
      return new Response("WebSocket upgrade failed", { status: 400 });
    }

    // Handle regular HTTP requests with Hono
    return app.fetch(req);
  },
  websocket: websocketHandler,
});

// ============================================
// Startup
// ============================================

console.log(`Server running on port ${PORT}`);
logStartupInfo();

export { app, server };
