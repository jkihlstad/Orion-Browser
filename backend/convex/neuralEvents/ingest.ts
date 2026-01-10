/**
 * Neural Events - Event Ingestion Mutations
 *
 * Handles ingestion of single and batch events from the iOS SDK
 * with validation, consent verification, and idempotency handling.
 */

import { mutation, internalMutation } from "../_generated/server";
import { v } from "convex/values";
import type { Id } from "../id";
import {
  EventTypeMap,
  isValidEventType,
  getEventTypeDefinition,
  PrivacyScope,
  SourceApp,
} from "./eventTypes";

// ============================================================
// VALIDATORS
// ============================================================

const modalityValidator = v.object({
  text: v.boolean(),
  audio: v.boolean(),
  video: v.boolean(),
  image: v.boolean(),
  numeric: v.boolean(),
  biometric: v.boolean(),
  location: v.boolean(),
  interaction: v.boolean(),
});

const deviceInfoValidator = v.object({
  deviceId: v.string(),
  platform: v.string(),
  osVersion: v.string(),
  appVersion: v.string(),
});

const eventInputValidator = v.object({
  eventId: v.string(),
  eventTypeId: v.string(),
  clientTimestamp: v.number(),
  timezoneOffset: v.optional(v.number()),
  payload: v.any(),
  sessionId: v.optional(v.string()),
  deviceInfo: v.optional(deviceInfoValidator),
});

// ============================================================
// HELPER FUNCTIONS
// ============================================================

/**
 * Check if user has active consent for required scopes
 */
async function verifyConsent(
  ctx: { db: any },
  userId: string,
  requiredScopes: PrivacyScope[]
): Promise<{ isValid: boolean; consentVersion: string; missingScopes: string[] }> {
  // Get the user's active consent record
  const activeConsent = await ctx.db
    .query("consentRecords")
    .withIndex("by_user_active", (q: any) =>
      q.eq("userId", userId).eq("isActive", true)
    )
    .first();

  if (!activeConsent) {
    return {
      isValid: false,
      consentVersion: "none",
      missingScopes: requiredScopes,
    };
  }

  // Check each required scope
  const missingScopes: string[] = [];
  for (const scope of requiredScopes) {
    const scopeKey = scope as keyof typeof activeConsent.scopeConsents;
    if (!activeConsent.scopeConsents[scopeKey]) {
      missingScopes.push(scope);
    }
  }

  return {
    isValid: missingScopes.length === 0,
    consentVersion: activeConsent.consentVersion,
    missingScopes,
  };
}

/**
 * Check for duplicate events (idempotency)
 */
async function checkDuplicateEvent(
  ctx: { db: any },
  eventId: string
): Promise<boolean> {
  const existing = await ctx.db
    .query("neuralEvents")
    .withIndex("by_event_id", (q: any) => q.eq("eventId", eventId))
    .first();

  return existing !== null;
}

/**
 * Update session activity
 */
async function updateSessionActivity(
  ctx: { db: any },
  sessionId: string,
  eventTypeId: string,
  timestamp: number
): Promise<void> {
  const session = await ctx.db
    .query("userSessions")
    .withIndex("by_session_id", (q: any) => q.eq("sessionId", sessionId))
    .first();

  if (session && session.isActive) {
    const uniqueEventTypes = session.uniqueEventTypes.includes(eventTypeId)
      ? session.uniqueEventTypes
      : [...session.uniqueEventTypes, eventTypeId];

    await ctx.db.patch(session._id, {
      lastActivityAt: timestamp,
      eventCount: session.eventCount + 1,
      uniqueEventTypes,
    });
  }
}

/**
 * Create audit log entry
 */
async function createAuditEntry(
  ctx: { db: any },
  action: "create" | "read" | "update" | "delete" | "export" | "consent_change" | "access_request",
  resourceType: string,
  resourceId: string | undefined,
  userId: string | undefined,
  details: any
): Promise<void> {
  await ctx.db.insert("auditLog", {
    userId,
    action,
    resourceType,
    resourceId,
    timestamp: Date.now(),
    details,
    isDataSubjectRequest: false,
  });
}

// ============================================================
// SINGLE EVENT INGESTION
// ============================================================

/**
 * Ingest a single neural event
 *
 * Validates event type, verifies consent, handles idempotency,
 * and stores the event in the database.
 */
export const ingestEvent = mutation({
  args: {
    userId: v.string(),
    event: eventInputValidator,
  },
  returns: v.object({
    success: v.boolean(),
    eventId: v.optional(v.string()),
    error: v.optional(v.string()),
    errorCode: v.optional(v.string()),
  }),
  handler: async (ctx, args) => {
    const { userId, event } = args;
    const serverTimestamp = Date.now();

    // 1. Validate event type exists
    if (!isValidEventType(event.eventTypeId)) {
      return {
        success: false,
        error: `Invalid event type: ${event.eventTypeId}`,
        errorCode: "INVALID_EVENT_TYPE",
      };
    }

    const eventTypeDef = getEventTypeDefinition(event.eventTypeId)!;

    // 2. Check for duplicate (idempotency)
    const isDuplicate = await checkDuplicateEvent(ctx, event.eventId);
    if (isDuplicate) {
      return {
        success: true,
        eventId: event.eventId,
        // Return success for idempotent requests
      };
    }

    // 3. Verify user consent
    const consentCheck = await verifyConsent(
      ctx,
      userId,
      eventTypeDef.requiredScopes as PrivacyScope[]
    );

    if (!consentCheck.isValid) {
      return {
        success: false,
        error: `Missing consent for scopes: ${consentCheck.missingScopes.join(", ")}`,
        errorCode: "CONSENT_REQUIRED",
      };
    }

    // 4. Insert the event
    try {
      const eventDoc = await ctx.db.insert("neuralEvents", {
        eventId: event.eventId,
        userId,
        sessionId: event.sessionId,
        eventTypeId: event.eventTypeId,
        sourceApp: eventTypeDef.app as SourceApp,
        eventType: eventTypeDef.eventType,
        clientTimestamp: event.clientTimestamp,
        serverTimestamp,
        timezoneOffset: event.timezoneOffset,
        payload: event.payload,
        modality: eventTypeDef.modality,
        sensitivityLevel: eventTypeDef.sensitivityLevel,
        consentVersion: consentCheck.consentVersion,
        requiredScopes: eventTypeDef.requiredScopes,
        isProcessed: false,
        deviceInfo: event.deviceInfo,
        isDeleted: false,
      });

      // 5. Update session if provided
      if (event.sessionId) {
        await updateSessionActivity(
          ctx,
          event.sessionId,
          event.eventTypeId,
          serverTimestamp
        );
      }

      // 6. Create audit entry
      await createAuditEntry(
        ctx,
        "create",
        "neuralEvents",
        event.eventId,
        userId,
        {
          eventTypeId: event.eventTypeId,
          sourceApp: eventTypeDef.app,
        }
      );

      return {
        success: true,
        eventId: event.eventId,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        errorCode: "INSERT_FAILED",
      };
    }
  },
});

// ============================================================
// BATCH EVENT INGESTION
// ============================================================

/**
 * Ingest a batch of neural events
 *
 * Processes multiple events in a single transaction with
 * optimized validation and consent checking.
 */
export const ingestBatch = mutation({
  args: {
    userId: v.string(),
    events: v.array(eventInputValidator),
    sessionId: v.optional(v.string()),
  },
  returns: v.object({
    success: v.boolean(),
    totalReceived: v.number(),
    totalIngested: v.number(),
    totalSkipped: v.number(),
    totalFailed: v.number(),
    results: v.array(
      v.object({
        eventId: v.string(),
        status: v.union(
          v.literal("ingested"),
          v.literal("duplicate"),
          v.literal("invalid"),
          v.literal("no_consent"),
          v.literal("failed")
        ),
        error: v.optional(v.string()),
      })
    ),
  }),
  handler: async (ctx, args) => {
    const { userId, events, sessionId } = args;
    const serverTimestamp = Date.now();

    // Pre-fetch consent for efficiency
    const activeConsent = await ctx.db
      .query("consentRecords")
      .withIndex("by_user_active", (q: any) =>
        q.eq("userId", userId).eq("isActive", true)
      )
      .first();

    const results: Array<{
      eventId: string;
      status: "ingested" | "duplicate" | "invalid" | "no_consent" | "failed";
      error?: string;
    }> = [];

    let totalIngested = 0;
    let totalSkipped = 0;
    let totalFailed = 0;

    // Process each event
    for (const event of events) {
      // 1. Check duplicate
      const isDuplicate = await checkDuplicateEvent(ctx, event.eventId);
      if (isDuplicate) {
        results.push({ eventId: event.eventId, status: "duplicate" });
        totalSkipped++;
        continue;
      }

      // 2. Validate event type
      if (!isValidEventType(event.eventTypeId)) {
        results.push({
          eventId: event.eventId,
          status: "invalid",
          error: `Invalid event type: ${event.eventTypeId}`,
        });
        totalFailed++;
        continue;
      }

      const eventTypeDef = getEventTypeDefinition(event.eventTypeId)!;

      // 3. Check consent
      if (!activeConsent) {
        results.push({
          eventId: event.eventId,
          status: "no_consent",
          error: "No active consent record",
        });
        totalFailed++;
        continue;
      }

      const missingScopes: string[] = [];
      for (const scope of eventTypeDef.requiredScopes) {
        const scopeKey = scope as keyof typeof activeConsent.scopeConsents;
        if (!activeConsent.scopeConsents[scopeKey]) {
          missingScopes.push(scope);
        }
      }

      if (missingScopes.length > 0) {
        results.push({
          eventId: event.eventId,
          status: "no_consent",
          error: `Missing scopes: ${missingScopes.join(", ")}`,
        });
        totalFailed++;
        continue;
      }

      // 4. Insert event
      try {
        await ctx.db.insert("neuralEvents", {
          eventId: event.eventId,
          userId,
          sessionId: event.sessionId || sessionId,
          eventTypeId: event.eventTypeId,
          sourceApp: eventTypeDef.app as SourceApp,
          eventType: eventTypeDef.eventType,
          clientTimestamp: event.clientTimestamp,
          serverTimestamp,
          timezoneOffset: event.timezoneOffset,
          payload: event.payload,
          modality: eventTypeDef.modality,
          sensitivityLevel: eventTypeDef.sensitivityLevel,
          consentVersion: activeConsent.consentVersion,
          requiredScopes: eventTypeDef.requiredScopes,
          isProcessed: false,
          deviceInfo: event.deviceInfo,
          isDeleted: false,
        });

        results.push({ eventId: event.eventId, status: "ingested" });
        totalIngested++;
      } catch (error) {
        results.push({
          eventId: event.eventId,
          status: "failed",
          error: error instanceof Error ? error.message : "Insert failed",
        });
        totalFailed++;
      }
    }

    // Update session with batch activity
    if (sessionId && totalIngested > 0) {
      const session = await ctx.db
        .query("userSessions")
        .withIndex("by_session_id", (q: any) => q.eq("sessionId", sessionId))
        .first();

      if (session && session.isActive) {
        const ingestedEventTypes = events
          .filter((e) => results.find((r) => r.eventId === e.eventId)?.status === "ingested")
          .map((e) => e.eventTypeId);

        const uniqueEventTypes = [
          ...new Set([...session.uniqueEventTypes, ...ingestedEventTypes]),
        ];

        await ctx.db.patch(session._id, {
          lastActivityAt: serverTimestamp,
          eventCount: session.eventCount + totalIngested,
          uniqueEventTypes,
        });
      }
    }

    // Create batch audit entry
    await createAuditEntry(ctx, "create", "neuralEvents", undefined, userId, {
      batchSize: events.length,
      ingested: totalIngested,
      skipped: totalSkipped,
      failed: totalFailed,
    });

    return {
      success: totalFailed === 0,
      totalReceived: events.length,
      totalIngested,
      totalSkipped,
      totalFailed,
      results,
    };
  },
});

// ============================================================
// SESSION MANAGEMENT
// ============================================================

/**
 * Start a new user session
 */
export const startSession = mutation({
  args: {
    userId: v.string(),
    sessionId: v.string(),
    deviceInfo: deviceInfoValidator,
    locationContext: v.optional(
      v.object({
        country: v.optional(v.string()),
        region: v.optional(v.string()),
        city: v.optional(v.string()),
        timezone: v.string(),
      })
    ),
  },
  returns: v.object({
    success: v.boolean(),
    sessionId: v.string(),
    error: v.optional(v.string()),
  }),
  handler: async (ctx, args) => {
    const { userId, sessionId, deviceInfo, locationContext } = args;
    const timestamp = Date.now();

    // Check for existing active session
    const existingSession = await ctx.db
      .query("userSessions")
      .withIndex("by_session_id", (q: any) => q.eq("sessionId", sessionId))
      .first();

    if (existingSession) {
      return {
        success: true,
        sessionId,
        // Return success for idempotent requests
      };
    }

    // End any other active sessions for this user
    const activeSessions = await ctx.db
      .query("userSessions")
      .withIndex("by_user_active", (q: any) =>
        q.eq("userId", userId).eq("isActive", true)
      )
      .collect();

    for (const session of activeSessions) {
      await ctx.db.patch(session._id, {
        isActive: false,
        endedAt: timestamp,
        terminationReason: "forced",
      });
    }

    // Create new session
    try {
      await ctx.db.insert("userSessions", {
        sessionId,
        userId,
        startedAt: timestamp,
        lastActivityAt: timestamp,
        deviceInfo: {
          ...deviceInfo,
          screenResolution: undefined,
          language: undefined,
        },
        locationContext,
        eventCount: 0,
        uniqueEventTypes: [],
        isActive: true,
      });

      return { success: true, sessionId };
    } catch (error) {
      return {
        success: false,
        sessionId,
        error: error instanceof Error ? error.message : "Session creation failed",
      };
    }
  },
});

/**
 * End a user session
 */
export const endSession = mutation({
  args: {
    sessionId: v.string(),
    reason: v.optional(
      v.union(
        v.literal("user_logout"),
        v.literal("timeout"),
        v.literal("app_close"),
        v.literal("error")
      )
    ),
  },
  returns: v.object({
    success: v.boolean(),
    error: v.optional(v.string()),
  }),
  handler: async (ctx, args) => {
    const { sessionId, reason = "app_close" } = args;
    const timestamp = Date.now();

    const session = await ctx.db
      .query("userSessions")
      .withIndex("by_session_id", (q: any) => q.eq("sessionId", sessionId))
      .first();

    if (!session) {
      return { success: false, error: "Session not found" };
    }

    if (!session.isActive) {
      return { success: true }; // Already ended
    }

    await ctx.db.patch(session._id, {
      isActive: false,
      endedAt: timestamp,
      terminationReason: reason,
    });

    return { success: true };
  },
});

// ============================================================
// INTERNAL MUTATIONS
// ============================================================

/**
 * Internal mutation to mark events as processed
 */
export const markEventsProcessed = internalMutation({
  args: {
    eventIds: v.array(v.id("neuralEvents")),
    embeddingIds: v.optional(v.array(v.id("neuralEmbeddings"))),
  },
  handler: async (ctx, args) => {
    const { eventIds, embeddingIds } = args;
    const timestamp = Date.now();

    for (let i = 0; i < eventIds.length; i++) {
      const embeddingId = embeddingIds?.[i];
      await ctx.db.patch(eventIds[i], {
        isProcessed: true,
        processedAt: timestamp,
        ...(embeddingId && { embeddingId }),
      });
    }
  },
});

/**
 * Internal mutation to soft-delete events
 */
export const softDeleteEvents = internalMutation({
  args: {
    eventIds: v.array(v.id("neuralEvents")),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { eventIds } = args;
    const timestamp = Date.now();

    for (const eventId of eventIds) {
      await ctx.db.patch(eventId, {
        isDeleted: true,
        deletedAt: timestamp,
      });
    }
  },
});

/**
 * Internal mutation to attach media references to an event
 */
export const attachMediaToEvent = internalMutation({
  args: {
    eventId: v.id("neuralEvents"),
    mediaIds: v.array(v.id("mediaReferences")),
  },
  handler: async (ctx, args) => {
    const { eventId, mediaIds } = args;

    const event = await ctx.db.get(eventId);
    if (!event) {
      throw new Error("Event not found");
    }

    const existingMediaIds = event.mediaIds || [];
    const newMediaIds = [...new Set([...existingMediaIds, ...mediaIds])];

    await ctx.db.patch(eventId, {
      mediaIds: newMediaIds,
    });

    // Update media references with event ID
    for (const mediaId of mediaIds) {
      await ctx.db.patch(mediaId, { eventId });
    }
  },
});
