import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { api, internal } from "./_generated/api";
import type { Id } from "./id";

const http = httpRouter();

// ==========================================
// CORS Headers
// ==========================================

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-API-Key, X-User-ID, X-Session-ID, X-Device-ID",
  "Access-Control-Max-Age": "86400",
};

// ==========================================
// Response Helpers
// ==========================================

function errorResponse(status: number, code: string, message: string): Response {
  return new Response(
    JSON.stringify({ success: false, error: { code, message } }),
    { status, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
  );
}

function successResponse(data: unknown, status: number = 200): Response {
  return new Response(
    JSON.stringify({ success: true, data }),
    { status, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
  );
}

// ==========================================
// Neural Events - Event Ingestion
// ==========================================

// POST /neural/ingest - Ingest a single neural event
http.route({
  path: "/neural/ingest",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const userId = request.headers.get("X-User-ID");
    const sessionId = request.headers.get("X-Session-ID");

    if (!userId) {
      return errorResponse(401, "UNAUTHORIZED", "X-User-ID header is required");
    }

    let body: any;
    try {
      body = await request.json();
    } catch (e) {
      return errorResponse(400, "INVALID_JSON", "Request body must be valid JSON");
    }

    if (!body.eventId || !body.eventTypeId || !body.clientTimestamp) {
      return errorResponse(400, "MISSING_FIELDS", "eventId, eventTypeId, and clientTimestamp are required");
    }

    try {
      const result = await ctx.runMutation(api.neuralEvents.ingest.ingestEvent, {
        userId,
        event: {
          eventId: body.eventId,
          eventTypeId: body.eventTypeId,
          clientTimestamp: body.clientTimestamp,
          timezoneOffset: body.timezoneOffset,
          payload: body.payload || {},
          sessionId: sessionId || body.sessionId,
          deviceInfo: body.deviceInfo,
        },
      });

      if (result.success) {
        return successResponse({ eventId: result.eventId, ingested: true });
      } else {
        return errorResponse(
          result.errorCode === "CONSENT_REQUIRED" ? 403 : 400,
          result.errorCode || "INGEST_FAILED",
          result.error || "Failed to ingest event"
        );
      }
    } catch (error) {
      console.error("Neural ingest error:", error);
      return errorResponse(500, "INTERNAL_ERROR", error instanceof Error ? error.message : "Internal server error");
    }
  }),
});

// POST /neural/ingest-batch - Ingest multiple neural events
http.route({
  path: "/neural/ingest-batch",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const userId = request.headers.get("X-User-ID");
    const sessionId = request.headers.get("X-Session-ID");

    if (!userId) {
      return errorResponse(401, "UNAUTHORIZED", "X-User-ID header is required");
    }

    let body: any;
    try {
      body = await request.json();
    } catch (e) {
      return errorResponse(400, "INVALID_JSON", "Request body must be valid JSON");
    }

    if (!body.events || !Array.isArray(body.events)) {
      return errorResponse(400, "MISSING_FIELDS", "events array is required");
    }

    const MAX_BATCH_SIZE = 100;
    if (body.events.length > MAX_BATCH_SIZE) {
      return errorResponse(400, "BATCH_TOO_LARGE", `Maximum batch size is ${MAX_BATCH_SIZE} events`);
    }

    try {
      const result = await ctx.runMutation(api.neuralEvents.ingest.ingestBatch, {
        userId,
        events: body.events,
        sessionId: sessionId || undefined,
      });

      return successResponse({
        totalReceived: result.totalReceived,
        totalIngested: result.totalIngested,
        totalSkipped: result.totalSkipped,
        totalFailed: result.totalFailed,
        results: result.results,
      });
    } catch (error) {
      console.error("Neural batch ingest error:", error);
      return errorResponse(500, "INTERNAL_ERROR", error instanceof Error ? error.message : "Internal server error");
    }
  }),
});

// ==========================================
// Neural Events - Session Management
// ==========================================

// POST /neural/session/start - Start a new neural session
http.route({
  path: "/neural/session/start",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const userId = request.headers.get("X-User-ID");

    if (!userId) {
      return errorResponse(401, "UNAUTHORIZED", "X-User-ID header is required");
    }

    let body: any;
    try {
      body = await request.json();
    } catch (e) {
      return errorResponse(400, "INVALID_JSON", "Request body must be valid JSON");
    }

    if (!body.sessionId || !body.deviceInfo) {
      return errorResponse(400, "MISSING_FIELDS", "sessionId and deviceInfo are required");
    }

    try {
      const result = await ctx.runMutation(api.neuralEvents.ingest.startSession, {
        userId,
        sessionId: body.sessionId,
        deviceInfo: body.deviceInfo,
        locationContext: body.locationContext,
      });

      if (result.success) {
        return successResponse({ sessionId: result.sessionId });
      } else {
        return errorResponse(400, "SESSION_FAILED", result.error || "Failed to start session");
      }
    } catch (error) {
      console.error("Neural session start error:", error);
      return errorResponse(500, "INTERNAL_ERROR", error instanceof Error ? error.message : "Internal server error");
    }
  }),
});

// POST /neural/session/end - End a neural session
http.route({
  path: "/neural/session/end",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const sessionId = request.headers.get("X-Session-ID");

    if (!sessionId) {
      return errorResponse(401, "UNAUTHORIZED", "X-Session-ID header is required");
    }

    let body: any = {};
    try {
      body = await request.json();
    } catch (e) {
      // Body is optional
    }

    try {
      const result = await ctx.runMutation(api.neuralEvents.ingest.endSession, {
        sessionId,
        reason: body.reason,
      });

      if (result.success) {
        return successResponse({ ended: true });
      } else {
        return errorResponse(400, "SESSION_FAILED", result.error || "Failed to end session");
      }
    } catch (error) {
      console.error("Neural session end error:", error);
      return errorResponse(500, "INTERNAL_ERROR", error instanceof Error ? error.message : "Internal server error");
    }
  }),
});

// ==========================================
// Neural Events - Consent Management
// ==========================================

// GET /neural/consent - Get current consent state
http.route({
  path: "/neural/consent",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const userId = request.headers.get("X-User-ID");

    if (!userId) {
      return errorResponse(401, "UNAUTHORIZED", "X-User-ID header is required");
    }

    try {
      const result = await ctx.runQuery(api.consent.consentManagement.getConsentState, {
        userId,
      });
      return successResponse(result);
    } catch (error) {
      console.error("Get consent error:", error);
      return errorResponse(500, "INTERNAL_ERROR", error instanceof Error ? error.message : "Internal server error");
    }
  }),
});

// POST /neural/consent - Update consent preferences
http.route({
  path: "/neural/consent",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const userId = request.headers.get("X-User-ID");

    if (!userId) {
      return errorResponse(401, "UNAUTHORIZED", "X-User-ID header is required");
    }

    let body: any;
    try {
      body = await request.json();
    } catch (e) {
      return errorResponse(400, "INVALID_JSON", "Request body must be valid JSON");
    }

    if (!body.scopeConsents || !body.legalBasis || !body.jurisdictions) {
      return errorResponse(400, "MISSING_FIELDS", "scopeConsents, legalBasis, and jurisdictions are required");
    }

    try {
      const result = await ctx.runMutation(api.consent.consentManagement.updateConsent, {
        userId,
        scopeConsents: body.scopeConsents,
        appConsents: body.appConsents,
        legalBasis: body.legalBasis,
        jurisdictions: body.jurisdictions,
        ipAddress: request.headers.get("X-Forwarded-For") || undefined,
        userAgent: request.headers.get("User-Agent") || undefined,
        expiresAt: body.expiresAt,
      });

      if (result.success) {
        return successResponse({
          consentVersion: result.consentVersion,
          previousVersion: result.previousVersion,
        });
      } else {
        return errorResponse(400, "CONSENT_FAILED", result.error || "Failed to update consent");
      }
    } catch (error) {
      console.error("Update consent error:", error);
      return errorResponse(500, "INTERNAL_ERROR", error instanceof Error ? error.message : "Internal server error");
    }
  }),
});

// DELETE /neural/consent - Revoke all consent
http.route({
  path: "/neural/consent",
  method: "DELETE",
  handler: httpAction(async (ctx, request) => {
    const userId = request.headers.get("X-User-ID");

    if (!userId) {
      return errorResponse(401, "UNAUTHORIZED", "X-User-ID header is required");
    }

    let body: any = {};
    try {
      body = await request.json();
    } catch (e) {
      // Body is optional
    }

    try {
      const result = await ctx.runMutation(api.consent.consentManagement.revokeAllConsent, {
        userId,
        reason: body.reason,
      });

      if (result.success) {
        return successResponse({ revoked: true, version: result.revokedVersion });
      } else {
        return errorResponse(400, "REVOKE_FAILED", result.error || "Failed to revoke consent");
      }
    } catch (error) {
      console.error("Revoke consent error:", error);
      return errorResponse(500, "INTERNAL_ERROR", error instanceof Error ? error.message : "Internal server error");
    }
  }),
});

// ==========================================
// Neural Events - Query Endpoints
// ==========================================

// GET /neural/events - Get events for user
http.route({
  path: "/neural/events",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const userId = request.headers.get("X-User-ID");

    if (!userId) {
      return errorResponse(401, "UNAUTHORIZED", "X-User-ID header is required");
    }

    const url = new URL(request.url);
    const limit = parseInt(url.searchParams.get("limit") || "50");
    const cursor = url.searchParams.get("cursor") || undefined;
    const eventType = url.searchParams.get("eventType") || undefined;
    const sourceApp = url.searchParams.get("sourceApp") || undefined;
    const startTime = url.searchParams.get("startTime");
    const endTime = url.searchParams.get("endTime");

    try {
      let result;

      if (eventType) {
        result = await ctx.runQuery(api.neuralEvents.query.getEventsByType, {
          userId,
          eventTypeId: eventType,
          pagination: { limit, cursor },
          startTime: startTime ? parseInt(startTime) : undefined,
          endTime: endTime ? parseInt(endTime) : undefined,
        });
      } else if (sourceApp) {
        result = await ctx.runQuery(api.neuralEvents.query.getEventsByApp, {
          userId,
          sourceApp,
          pagination: { limit, cursor },
          startTime: startTime ? parseInt(startTime) : undefined,
          endTime: endTime ? parseInt(endTime) : undefined,
        });
      } else if (startTime && endTime) {
        result = await ctx.runQuery(api.neuralEvents.query.getEventsByTimeRange, {
          userId,
          startTime: parseInt(startTime),
          endTime: parseInt(endTime),
          pagination: { limit, cursor },
        });
      } else {
        result = await ctx.runQuery(api.neuralEvents.query.getEventsByUser, {
          userId,
          pagination: { limit, cursor },
        });
      }

      return successResponse(result);
    } catch (error) {
      console.error("Get neural events error:", error);
      return errorResponse(500, "INTERNAL_ERROR", error instanceof Error ? error.message : "Internal server error");
    }
  }),
});

// GET /neural/events/stats - Get event statistics
http.route({
  path: "/neural/events/stats",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const userId = request.headers.get("X-User-ID");

    if (!userId) {
      return errorResponse(401, "UNAUTHORIZED", "X-User-ID header is required");
    }

    const url = new URL(request.url);
    const startTime = url.searchParams.get("startTime");
    const endTime = url.searchParams.get("endTime");

    try {
      const result = await ctx.runQuery(api.neuralEvents.query.getUserEventStats, {
        userId,
        startTime: startTime ? parseInt(startTime) : undefined,
        endTime: endTime ? parseInt(endTime) : undefined,
      });

      return successResponse(result);
    } catch (error) {
      console.error("Get stats error:", error);
      return errorResponse(500, "INTERNAL_ERROR", error instanceof Error ? error.message : "Internal server error");
    }
  }),
});

// GET /neural/events/recent - Get recent activity
http.route({
  path: "/neural/events/recent",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const userId = request.headers.get("X-User-ID");

    if (!userId) {
      return errorResponse(401, "UNAUTHORIZED", "X-User-ID header is required");
    }

    const url = new URL(request.url);
    const hours = parseInt(url.searchParams.get("hours") || "24");
    const limit = parseInt(url.searchParams.get("limit") || "100");

    try {
      const result = await ctx.runQuery(api.neuralEvents.query.getRecentActivity, {
        userId,
        hours,
        limit,
      });

      return successResponse(result);
    } catch (error) {
      console.error("Get recent activity error:", error);
      return errorResponse(500, "INTERNAL_ERROR", error instanceof Error ? error.message : "Internal server error");
    }
  }),
});

// ==========================================
// Neural Events - Vector Search
// ==========================================

// POST /neural/search/semantic - Semantic search
http.route({
  path: "/neural/search/semantic",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const userId = request.headers.get("X-User-ID");

    if (!userId) {
      return errorResponse(401, "UNAUTHORIZED", "X-User-ID header is required");
    }

    let body: any;
    try {
      body = await request.json();
    } catch (e) {
      return errorResponse(400, "INVALID_JSON", "Request body must be valid JSON");
    }

    if (!body.query) {
      return errorResponse(400, "MISSING_FIELDS", "query is required");
    }

    try {
      const result = await ctx.runAction(api.vectorDb.neuralEmbeddings.semanticSearch, {
        userId,
        textQuery: body.query,
        contentType: body.contentType,
        limit: body.limit || 10,
        minScore: body.minScore || 0.5,
      });

      return successResponse(result);
    } catch (error) {
      console.error("Semantic search error:", error);
      return errorResponse(500, "INTERNAL_ERROR", error instanceof Error ? error.message : "Internal server error");
    }
  }),
});

// POST /neural/search/vector - Vector similarity search
http.route({
  path: "/neural/search/vector",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const userId = request.headers.get("X-User-ID");

    if (!userId) {
      return errorResponse(401, "UNAUTHORIZED", "X-User-ID header is required");
    }

    let body: any;
    try {
      body = await request.json();
    } catch (e) {
      return errorResponse(400, "INVALID_JSON", "Request body must be valid JSON");
    }

    if (!body.vector || !Array.isArray(body.vector)) {
      return errorResponse(400, "MISSING_FIELDS", "vector array is required");
    }

    try {
      const result = await ctx.runAction(api.vectorDb.neuralEmbeddings.vectorSearch, {
        userId,
        queryVector: body.vector,
        contentType: body.contentType,
        limit: body.limit || 10,
        minScore: body.minScore || 0.5,
      });

      return successResponse({ results: result });
    } catch (error) {
      console.error("Vector search error:", error);
      return errorResponse(500, "INTERNAL_ERROR", error instanceof Error ? error.message : "Internal server error");
    }
  }),
});

// ==========================================
// Neural Events - Data Export (GDPR)
// ==========================================

// GET /neural/export - Export all user data
http.route({
  path: "/neural/export",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const userId = request.headers.get("X-User-ID");

    if (!userId) {
      return errorResponse(401, "UNAUTHORIZED", "X-User-ID header is required");
    }

    const url = new URL(request.url);
    const includeMedia = url.searchParams.get("includeMedia") === "true";

    try {
      const result = await ctx.runQuery(api.neuralEvents.query.getUserDataExport, {
        userId,
        includeMedia,
      });

      return successResponse(result);
    } catch (error) {
      console.error("Export data error:", error);
      return errorResponse(500, "INTERNAL_ERROR", error instanceof Error ? error.message : "Internal server error");
    }
  }),
});

// ==========================================
// Neural Events - Store Embeddings
// ==========================================

// POST /neural/embeddings - Store an embedding
http.route({
  path: "/neural/embeddings",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const userId = request.headers.get("X-User-ID");

    if (!userId) {
      return errorResponse(401, "UNAUTHORIZED", "X-User-ID header is required");
    }

    let body: any;
    try {
      body = await request.json();
    } catch (e) {
      return errorResponse(400, "INVALID_JSON", "Request body must be valid JSON");
    }

    if (!body.embeddingVector || !body.modelName || !body.contentType || !body.contentHash) {
      return errorResponse(400, "MISSING_FIELDS", "embeddingVector, modelName, contentType, and contentHash are required");
    }

    try {
      const embeddingId = await ctx.runMutation(api.vectorDb.neuralEmbeddings.storeEmbedding, {
        userId,
        embeddingVector: body.embeddingVector,
        modelName: body.modelName,
        modelVersion: body.modelVersion || "1.0",
        contentType: body.contentType,
        sourceEventId: body.sourceEventId,
        sourceMediaId: body.sourceMediaId,
        contentSummary: body.contentSummary,
        contentHash: body.contentHash,
        expiresAt: body.expiresAt,
        qualityScore: body.qualityScore,
      });

      return successResponse({ embeddingId });
    } catch (error) {
      console.error("Store embedding error:", error);
      return errorResponse(500, "INTERNAL_ERROR", error instanceof Error ? error.message : "Internal server error");
    }
  }),
});

// ==========================================
// Clerk Webhook Handlers
// ==========================================

// Verify Clerk webhook signature (simplified - use svix in production)
function verifyClerkWebhook(
  payload: string,
  signature: string | null,
  webhookSecret: string
): boolean {
  // In production, use svix library to verify signatures
  // This is a placeholder for the actual verification logic
  if (!signature) return false;
  // Add actual signature verification here
  return true;
}

// Clerk webhook handler for user events
http.route({
  path: "/webhooks/clerk",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const payload = await request.text();
    const signature = request.headers.get("svix-signature");

    // In production, verify the webhook signature
    // const webhookSecret = process.env.CLERK_WEBHOOK_SECRET;
    // if (!verifyClerkWebhook(payload, signature, webhookSecret)) {
    //   return new Response("Invalid signature", { status: 401 });
    // }

    try {
      const event = JSON.parse(payload);

      if (
        event.type === "user.created" ||
        event.type === "user.updated" ||
        event.type === "user.deleted"
      ) {
        const clerkId = event.data.id;
        const email =
          event.data.email_addresses?.[0]?.email_address ?? "";

        await ctx.runMutation(api.auth.syncUserFromClerk, {
          clerkId,
          email,
          eventType: event.type,
        });

        return new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ message: "Event type not handled" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    } catch (error) {
      console.error("Webhook processing error:", error);
      return new Response(JSON.stringify({ error: "Processing failed" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  }),
});

// ==========================================
// iOS App Webhook Handlers
// ==========================================

// Receive browsing events from iOS app
http.route({
  path: "/webhooks/ios/browsing-events",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const authHeader = request.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const clerkId = authHeader.slice(7); // Extract token after "Bearer "

    try {
      const body = await request.json();
      const { sessionId, events } = body as {
        sessionId: string;
        events: Array<{
          url: string;
          category?: string;
          dwellTime?: number;
          scrollDepth?: number;
          interactionVelocity?: number;
          intentLabel?: string;
          timestamp: number;
          metadata?: {
            title?: string;
            referrer?: string;
            isBookmarked?: boolean;
            wasShared?: boolean;
          };
        }>;
      };

      if (!sessionId || !events || !Array.isArray(events)) {
        return new Response(
          JSON.stringify({ error: "Invalid request body" }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        );
      }

      const result = await ctx.runMutation(api.browsing.recordEventsBatch, {
        clerkId,
        sessionId: sessionId as Id<"browsingSessions">,
        events,
      });

      return new Response(JSON.stringify(result), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      return new Response(JSON.stringify({ error: message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  }),
});

// Start browsing session from iOS app
http.route({
  path: "/webhooks/ios/session/start",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const authHeader = request.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const clerkId = authHeader.slice(7);

    try {
      const body = await request.json();
      const { metadata } = body as {
        metadata?: {
          deviceType?: string;
          osVersion?: string;
          appVersion?: string;
          networkType?: string;
          tabCount?: number;
          isPrivate?: boolean;
        };
      };

      const sessionId = await ctx.runMutation(api.browsing.startSession, {
        clerkId,
        metadata,
      });

      return new Response(JSON.stringify({ sessionId }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      return new Response(JSON.stringify({ error: message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  }),
});

// End browsing session from iOS app
http.route({
  path: "/webhooks/ios/session/end",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const authHeader = request.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const clerkId = authHeader.slice(7);

    try {
      const body = await request.json();
      const { sessionId } = body as { sessionId: string };

      if (!sessionId) {
        return new Response(
          JSON.stringify({ error: "sessionId is required" }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        );
      }

      const result = await ctx.runMutation(api.browsing.endSession, {
        clerkId,
        sessionId: sessionId as Id<"browsingSessions">,
      });

      return new Response(JSON.stringify(result), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      return new Response(JSON.stringify({ error: message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  }),
});

// ==========================================
// Voice Processing Endpoints
// ==========================================

// Start voice session
http.route({
  path: "/webhooks/ios/voice/start",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const authHeader = request.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const clerkId = authHeader.slice(7);

    try {
      const body = await request.json();
      const { initialTone } = body as { initialTone?: string };

      const sessionId = await ctx.runMutation(api.voice.startVoiceSession, {
        clerkId,
        initialTone: initialTone as
          | "neutral"
          | "positive"
          | "negative"
          | "urgent"
          | "curious"
          | "frustrated"
          | undefined,
      });

      return new Response(JSON.stringify({ sessionId }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      return new Response(JSON.stringify({ error: message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  }),
});

// Process voice command
http.route({
  path: "/webhooks/ios/voice/command",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const authHeader = request.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const clerkId = authHeader.slice(7);

    try {
      const body = await request.json();
      const { sessionId, command, context } = body as {
        sessionId: string;
        command: string;
        context?: {
          currentUrl?: string;
          selectedText?: string;
          activeTab?: string;
        };
      };

      if (!sessionId || !command) {
        return new Response(
          JSON.stringify({ error: "sessionId and command are required" }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        );
      }

      const result = await ctx.runMutation(api.voice.processVoiceCommand, {
        clerkId,
        sessionId: sessionId as Id<"voiceSessions">,
        command,
        context,
      });

      return new Response(JSON.stringify(result), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      return new Response(JSON.stringify({ error: message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  }),
});

// ==========================================
// LangGraph Agent Communication
// ==========================================

// Agent query endpoint - for LangGraph agents to query user context
http.route({
  path: "/api/agent/context",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const authHeader = request.headers.get("Authorization");
    const apiKey = request.headers.get("X-API-Key");

    // Verify API key for agent access
    // In production, validate against stored API keys
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "API key required" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    try {
      const body = await request.json();
      const { clerkId, queryType, params } = body as {
        clerkId: string;
        queryType: string;
        params?: Record<string, unknown>;
      };

      if (!clerkId || !queryType) {
        return new Response(
          JSON.stringify({ error: "clerkId and queryType are required" }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        );
      }

      let result: unknown;

      switch (queryType) {
        case "user_profile":
          result = await ctx.runQuery(api.auth.getCurrentUser, { clerkId });
          break;

        case "browsing_history":
          result = await ctx.runQuery(api.browsing.getHistory, {
            clerkId,
            limit: (params?.limit as number) ?? 20,
          });
          break;

        case "browsing_stats":
          result = await ctx.runQuery(api.browsing.getStats, {
            clerkId,
            startDate: params?.startDate as number | undefined,
            endDate: params?.endDate as number | undefined,
          });
          break;

        case "voice_history":
          result = await ctx.runQuery(api.voice.getVoiceHistory, {
            clerkId,
            limit: (params?.limit as number) ?? 20,
          });
          break;

        case "consent_status":
          result = await ctx.runQuery(api.consent.getConsentSummary, {
            clerkId,
          });
          break;

        case "intelligence_level":
          result = await ctx.runQuery(api.intelligence.getIntelligenceLevel, {
            clerkId,
          });
          break;

        case "enabled_features":
          result = await ctx.runQuery(api.intelligence.getEnabledFeatures, {
            clerkId,
          });
          break;

        default:
          return new Response(
            JSON.stringify({ error: `Unknown queryType: ${queryType}` }),
            { status: 400, headers: { "Content-Type": "application/json" } }
          );
      }

      return new Response(JSON.stringify({ data: result }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      return new Response(JSON.stringify({ error: message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  }),
});

// Agent action endpoint - for LangGraph agents to perform actions
http.route({
  path: "/api/agent/action",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const apiKey = request.headers.get("X-API-Key");

    if (!apiKey) {
      return new Response(JSON.stringify({ error: "API key required" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    try {
      const body = await request.json();
      const { clerkId, actionType, params } = body as {
        clerkId: string;
        actionType: string;
        params?: Record<string, unknown>;
      };

      if (!clerkId || !actionType) {
        return new Response(
          JSON.stringify({ error: "clerkId and actionType are required" }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        );
      }

      let result: unknown;

      switch (actionType) {
        case "update_preferences":
          result = await ctx.runMutation(api.auth.updateUser, {
            clerkId,
            preferences: params?.preferences as Record<string, unknown> | undefined,
          });
          break;

        case "set_intelligence_level":
          result = await ctx.runMutation(api.intelligence.setIntelligenceLevel, {
            clerkId,
            level: params?.level as
              | "off"
              | "basic"
              | "enhanced"
              | "full",
          });
          break;

        case "grant_consent":
          result = await ctx.runMutation(api.consent.grantConsent, {
            clerkId,
            domain: params?.domain as string,
            consentType: params?.consentType as
              | "tracking"
              | "personalization"
              | "data_sharing"
              | "voice_processing"
              | "content_analysis",
          });
          break;

        case "revoke_consent":
          result = await ctx.runMutation(api.consent.revokeConsent, {
            clerkId,
            domain: params?.domain as string,
            consentType: params?.consentType as
              | "tracking"
              | "personalization"
              | "data_sharing"
              | "voice_processing"
              | "content_analysis",
          });
          break;

        default:
          return new Response(
            JSON.stringify({ error: `Unknown actionType: ${actionType}` }),
            { status: 400, headers: { "Content-Type": "application/json" } }
          );
      }

      return new Response(JSON.stringify({ data: result }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      return new Response(JSON.stringify({ error: message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  }),
});

// Vector search endpoint for agents
http.route({
  path: "/api/agent/search",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const apiKey = request.headers.get("X-API-Key");

    if (!apiKey) {
      return new Response(JSON.stringify({ error: "API key required" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    try {
      const body = await request.json();
      const { clerkId, embedding, searchType, params } = body as {
        clerkId: string;
        embedding: number[];
        searchType: "content" | "voice";
        params?: {
          limit?: number;
          namespace?: string;
          contentType?: string;
          intentType?: string;
          minConfidence?: number;
        };
      };

      if (!clerkId || !embedding || !searchType) {
        return new Response(
          JSON.stringify({
            error: "clerkId, embedding, and searchType are required",
          }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        );
      }

      let result: unknown;

      if (searchType === "content") {
        result = await ctx.runQuery(api.embeddings.searchSimilarContent, {
          clerkId,
          embedding,
          limit: params?.limit,
          namespace: params?.namespace,
          contentType: params?.contentType as
            | "page"
            | "article"
            | "video"
            | "image"
            | "document"
            | "social"
            | "commerce"
            | undefined,
          minConfidence: params?.minConfidence,
        });
      } else {
        result = await ctx.runQuery(api.embeddings.searchSimilarVoice, {
          clerkId,
          embedding,
          limit: params?.limit,
          intentType: params?.intentType as
            | "navigation"
            | "search"
            | "command"
            | "question"
            | "dictation"
            | "unknown"
            | undefined,
          minConfidence: params?.minConfidence,
        });
      }

      return new Response(JSON.stringify({ data: result }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      return new Response(JSON.stringify({ error: message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  }),
});

// ==========================================
// Export Sync Endpoints
// ==========================================

// Get export data
http.route({
  path: "/api/export/data",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const authHeader = request.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const clerkId = authHeader.slice(7);

    try {
      const body = await request.json();
      const { exportId, dataType, cursor, limit } = body as {
        exportId: string;
        dataType: string;
        cursor?: number;
        limit?: number;
      };

      if (!exportId || !dataType) {
        return new Response(
          JSON.stringify({ error: "exportId and dataType are required" }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        );
      }

      // Verify export job belongs to user
      const exportJob = await ctx.runQuery(api.export.getExportJob, {
        clerkId,
        exportId: exportId as Id<"dataExports">,
      });

      if (!exportJob) {
        return new Response(
          JSON.stringify({ error: "Export job not found" }),
          { status: 404, headers: { "Content-Type": "application/json" } }
        );
      }

      // Get the data
      const result = await ctx.runQuery(api.export.getExportableData, {
        clerkId,
        dataType,
        cursor,
        limit,
      });

      return new Response(JSON.stringify(result), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      return new Response(JSON.stringify({ error: message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  }),
});

// Sync confirmation - update last sync timestamp
http.route({
  path: "/api/export/sync-confirm",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const authHeader = request.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const clerkId = authHeader.slice(7);

    try {
      const body = await request.json();
      const { exportId } = body as { exportId: string };

      if (!exportId) {
        return new Response(
          JSON.stringify({ error: "exportId is required" }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        );
      }

      const result = await ctx.runMutation(api.export.updateLastSync, {
        clerkId,
        exportId: exportId as Id<"dataExports">,
      });

      return new Response(JSON.stringify(result), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      return new Response(JSON.stringify({ error: message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  }),
});

// ==========================================
// Health Check
// ==========================================

http.route({
  path: "/health",
  method: "GET",
  handler: httpAction(async () => {
    return new Response(
      JSON.stringify({
        status: "healthy",
        timestamp: Date.now(),
        version: "1.0.0",
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  }),
});

// ==========================================
// CORS Preflight Handler
// ==========================================

http.route({
  path: "/*",
  method: "OPTIONS",
  handler: httpAction(async () => {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
        "Access-Control-Allow-Headers":
          "Content-Type, Authorization, X-API-Key",
        "Access-Control-Max-Age": "86400",
      },
    });
  }),
});

export default http;
