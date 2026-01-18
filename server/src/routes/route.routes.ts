/**
 * Route Suggestion API Routes
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { routeService } from "../services/route-service.js";
import {
  RouteSuggestRequestSchema,
  type RouteSuggestRequest,
} from "../types/route.types.js";

const routeRoutes = new Hono();

// Get route suggestion health status
routeRoutes.get("/health", (c) => {
  return c.json({
    success: true,
    data: {
      status: "ok",
      timestamp: new Date().toISOString(),
    },
  });
});

// Suggest a driving practice route
routeRoutes.post(
  "/suggest",
  zValidator("json", RouteSuggestRequestSchema),
  async (c) => {
    try {
      const body = c.req.valid("json") as RouteSuggestRequest;
      const suggestion = await routeService.suggestRoute(body);
      return c.json({ success: true, data: suggestion });
    } catch (error) {
      console.error("Error suggesting route:", error);
      const message =
        error instanceof Error ? error.message : "Failed to suggest route";
      return c.json({ success: false, error: message }, 500);
    }
  }
);

// Test Google APIs connectivity (for debugging)
routeRoutes.post(
  "/test",
  zValidator("json", RouteSuggestRequestSchema),
  async (c) => {
    try {
      const body = c.req.valid("json") as RouteSuggestRequest;
      const result = await routeService.testGoogleApis(body);
      return c.json({ success: true, data: result });
    } catch (error) {
      console.error("Error testing Google APIs:", error);
      const message =
        error instanceof Error ? error.message : "Failed to test APIs";
      return c.json({ success: false, error: message }, 500);
    }
  }
);

export { routeRoutes };
