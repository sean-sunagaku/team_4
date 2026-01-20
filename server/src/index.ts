import { Hono } from "hono";
import { cors } from "hono/cors";
import { chatRoutes } from "./routes/chat.routes.js";
import { ragRoutes } from "./routes/rag.routes.js";
import { routeRoutes } from "./routes/route.routes.js";
import { voiceRoutes } from "./routes/voice.routes.js";
import { websocketHandler } from "./websocket/asr-handler.js";
import { PORT, logStartupInfo } from "./config/app.config.js";

const app = new Hono();

app.use(
  "/*",
  cors({
    origin: "*",
    allowMethods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
  })
);

app.get("/", (c) => {
  return c.json({ message: "Team 4 Chat Server (Hono + Bun)" });
});

app.route("/api/chat", chatRoutes);
app.route("/api/rag", ragRoutes);
app.route("/api/route", routeRoutes);
app.route("/api/voice", voiceRoutes);

const server = Bun.serve({
  port: Number(PORT),
  fetch(req, serverInstance) {
    const url = new URL(req.url);
    if (url.pathname === "/ws/asr") {
      const upgraded = serverInstance.upgrade(req);
      if (upgraded) {
        return undefined;
      }
      return new Response("WebSocket upgrade failed", { status: 400 });
    }
    return app.fetch(req);
  },
  websocket: websocketHandler,
});

logStartupInfo();
console.log(`Server running on port ${server.port}`);
