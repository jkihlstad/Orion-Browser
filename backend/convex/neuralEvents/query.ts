/**
 * Neural Events - Query Functions
 *
 * Provides efficient query functions for retrieving neural events
 * with filtering, pagination, and various access patterns.
 */

import { query, internalQuery } from "../_generated/server";
import { v } from "convex/values";
import type { Id, Doc } from "../id";
import { SourceApp, PrivacyScope } from "./eventTypes";

// ============================================================
// PAGINATION HELPERS
// ============================================================

const paginationValidator = v.object({
  cursor: v.optional(v.string()),
  limit: v.optional(v.number()),
});

interface PaginatedResult<T> {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
  totalCount?: number;
}

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 200;

/**
 * Helper to clamp page size within bounds
 */
function getPageSize(requested?: number): number {
  if (!requested) return DEFAULT_PAGE_SIZE;
  return Math.min(Math.max(1, requested), MAX_PAGE_SIZE);
}

// ============================================================
// USER EVENT QUERIES
// ============================================================

/**
 * Get events for a specific user with pagination
 *
 * Returns events sorted by server timestamp (newest first)
 */
export const getEventsByUser = query({
  args: {
    userId: v.string(),
    pagination: v.optional(paginationValidator),
    includeDeleted: v.optional(v.boolean()),
  },
  returns: v.object({
    items: v.array(v.any()),
    nextCursor: v.union(v.string(), v.null()),
    hasMore: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const { userId, pagination, includeDeleted = false } = args;
    const limit = getPageSize(pagination?.limit);

    let queryBuilder = ctx.db
      .query("neuralEvents")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc");

    // Apply cursor for pagination
    if (pagination?.cursor) {
      // The cursor is the _id of the last item
      queryBuilder = queryBuilder;
    }

    const events = await queryBuilder.take(limit + 1);

    // Filter deleted if needed
    const filteredEvents = includeDeleted
      ? events
      : events.filter((e) => !e.isDeleted);

    const hasMore = filteredEvents.length > limit;
    const items = filteredEvents.slice(0, limit);
    const nextCursor = hasMore ? items[items.length - 1]._id : null;

    return {
      items,
      nextCursor,
      hasMore,
    };
  },
});

/**
 * Get events by event type for a user
 */
export const getEventsByType = query({
  args: {
    userId: v.string(),
    eventTypeId: v.string(),
    pagination: v.optional(paginationValidator),
    startTime: v.optional(v.number()),
    endTime: v.optional(v.number()),
  },
  returns: v.object({
    items: v.array(v.any()),
    nextCursor: v.union(v.string(), v.null()),
    hasMore: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const { userId, eventTypeId, pagination, startTime, endTime } = args;
    const limit = getPageSize(pagination?.limit);

    const events = await ctx.db
      .query("neuralEvents")
      .withIndex("by_user_and_type", (q) =>
        q.eq("userId", userId).eq("eventTypeId", eventTypeId)
      )
      .order("desc")
      .take(limit + 1);

    // Filter by time range if provided
    let filteredEvents = events.filter((e) => !e.isDeleted);

    if (startTime) {
      filteredEvents = filteredEvents.filter(
        (e) => e.serverTimestamp >= startTime
      );
    }
    if (endTime) {
      filteredEvents = filteredEvents.filter(
        (e) => e.serverTimestamp <= endTime
      );
    }

    const hasMore = filteredEvents.length > limit;
    const items = filteredEvents.slice(0, limit);
    const nextCursor = hasMore ? items[items.length - 1]._id : null;

    return {
      items,
      nextCursor,
      hasMore,
    };
  },
});

/**
 * Get events within a time range
 */
export const getEventsByTimeRange = query({
  args: {
    userId: v.string(),
    startTime: v.number(),
    endTime: v.number(),
    pagination: v.optional(paginationValidator),
    eventTypeIds: v.optional(v.array(v.string())),
    sourceApps: v.optional(v.array(v.string())),
  },
  returns: v.object({
    items: v.array(v.any()),
    nextCursor: v.union(v.string(), v.null()),
    hasMore: v.boolean(),
    totalInRange: v.number(),
  }),
  handler: async (ctx, args) => {
    const {
      userId,
      startTime,
      endTime,
      pagination,
      eventTypeIds,
      sourceApps,
    } = args;
    const limit = getPageSize(pagination?.limit);

    // Query all events in range for user
    const events = await ctx.db
      .query("neuralEvents")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .filter((q) =>
        q.and(
          q.gte(q.field("serverTimestamp"), startTime),
          q.lte(q.field("serverTimestamp"), endTime),
          q.eq(q.field("isDeleted"), false)
        )
      )
      .order("desc")
      .collect();

    // Apply additional filters
    let filteredEvents = events;

    if (eventTypeIds && eventTypeIds.length > 0) {
      filteredEvents = filteredEvents.filter((e) =>
        eventTypeIds.includes(e.eventTypeId)
      );
    }

    if (sourceApps && sourceApps.length > 0) {
      filteredEvents = filteredEvents.filter((e) =>
        sourceApps.includes(e.sourceApp)
      );
    }

    const totalInRange = filteredEvents.length;
    const hasMore = filteredEvents.length > limit;
    const items = filteredEvents.slice(0, limit);
    const nextCursor = hasMore ? items[items.length - 1]._id : null;

    return {
      items,
      nextCursor,
      hasMore,
      totalInRange,
    };
  },
});

/**
 * Get events by source app
 */
export const getEventsByApp = query({
  args: {
    userId: v.string(),
    sourceApp: v.string(),
    pagination: v.optional(paginationValidator),
    startTime: v.optional(v.number()),
    endTime: v.optional(v.number()),
  },
  returns: v.object({
    items: v.array(v.any()),
    nextCursor: v.union(v.string(), v.null()),
    hasMore: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const { userId, sourceApp, pagination, startTime, endTime } = args;
    const limit = getPageSize(pagination?.limit);

    const events = await ctx.db
      .query("neuralEvents")
      .withIndex("by_user_and_app", (q) =>
        q.eq("userId", userId).eq("sourceApp", sourceApp as SourceApp)
      )
      .order("desc")
      .take(limit * 2); // Take extra for filtering

    // Filter by time and deletion status
    let filteredEvents = events.filter((e) => !e.isDeleted);

    if (startTime) {
      filteredEvents = filteredEvents.filter(
        (e) => e.serverTimestamp >= startTime
      );
    }
    if (endTime) {
      filteredEvents = filteredEvents.filter(
        (e) => e.serverTimestamp <= endTime
      );
    }

    const hasMore = filteredEvents.length > limit;
    const items = filteredEvents.slice(0, limit);
    const nextCursor = hasMore ? items[items.length - 1]._id : null;

    return {
      items,
      nextCursor,
      hasMore,
    };
  },
});

// ============================================================
// SESSION EVENT QUERIES
// ============================================================

/**
 * Get all events for a specific session
 */
export const getEventsBySession = query({
  args: {
    sessionId: v.string(),
    pagination: v.optional(paginationValidator),
  },
  returns: v.object({
    items: v.array(v.any()),
    nextCursor: v.union(v.string(), v.null()),
    hasMore: v.boolean(),
    sessionInfo: v.union(v.any(), v.null()),
  }),
  handler: async (ctx, args) => {
    const { sessionId, pagination } = args;
    const limit = getPageSize(pagination?.limit);

    // Get session info
    const session = await ctx.db
      .query("userSessions")
      .withIndex("by_session_id", (q) => q.eq("sessionId", sessionId))
      .first();

    // Get events for session
    const events = await ctx.db
      .query("neuralEvents")
      .withIndex("by_session", (q) => q.eq("sessionId", sessionId))
      .order("desc")
      .take(limit + 1);

    const filteredEvents = events.filter((e) => !e.isDeleted);
    const hasMore = filteredEvents.length > limit;
    const items = filteredEvents.slice(0, limit);
    const nextCursor = hasMore ? items[items.length - 1]._id : null;

    return {
      items,
      nextCursor,
      hasMore,
      sessionInfo: session,
    };
  },
});

// ============================================================
// SINGLE EVENT QUERIES
// ============================================================

/**
 * Get a single event by ID
 */
export const getEventById = query({
  args: {
    eventId: v.string(),
    userId: v.string(), // Required for authorization
  },
  returns: v.union(v.any(), v.null()),
  handler: async (ctx, args) => {
    const { eventId, userId } = args;

    const event = await ctx.db
      .query("neuralEvents")
      .withIndex("by_event_id", (q) => q.eq("eventId", eventId))
      .first();

    // Verify ownership
    if (!event || event.userId !== userId) {
      return null;
    }

    return event;
  },
});

/**
 * Get event with associated media
 */
export const getEventWithMedia = query({
  args: {
    eventId: v.id("neuralEvents"),
    userId: v.string(),
  },
  returns: v.union(
    v.object({
      event: v.any(),
      media: v.array(v.any()),
    }),
    v.null()
  ),
  handler: async (ctx, args) => {
    const { eventId, userId } = args;

    const event = await ctx.db.get(eventId);

    // Verify ownership
    if (!event || event.userId !== userId) {
      return null;
    }

    // Fetch associated media
    const media: Doc<"mediaReferences">[] = [];
    if (event.mediaIds && event.mediaIds.length > 0) {
      for (const mediaId of event.mediaIds) {
        const mediaDoc = await ctx.db.get(mediaId as Id<"mediaReferences">);
        if (mediaDoc && !mediaDoc.isDeleted) {
          media.push(mediaDoc);
        }
      }
    }

    return {
      event,
      media,
    };
  },
});

// ============================================================
// ANALYTICS QUERIES
// ============================================================

/**
 * Get event statistics for a user
 */
export const getUserEventStats = query({
  args: {
    userId: v.string(),
    startTime: v.optional(v.number()),
    endTime: v.optional(v.number()),
  },
  returns: v.object({
    totalEvents: v.number(),
    eventsByApp: v.any(),
    eventsByType: v.any(),
    eventsByDay: v.any(),
    sensitivityBreakdown: v.any(),
  }),
  handler: async (ctx, args) => {
    const { userId, startTime, endTime } = args;

    // Default to last 30 days if not specified
    const end = endTime || Date.now();
    const start = startTime || end - 30 * 24 * 60 * 60 * 1000;

    const events = await ctx.db
      .query("neuralEvents")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .filter((q) =>
        q.and(
          q.gte(q.field("serverTimestamp"), start),
          q.lte(q.field("serverTimestamp"), end),
          q.eq(q.field("isDeleted"), false)
        )
      )
      .collect();

    // Aggregate by app
    const eventsByApp: Record<string, number> = {};
    const eventsByType: Record<string, number> = {};
    const eventsByDay: Record<string, number> = {};
    const sensitivityBreakdown: Record<string, number> = {
      low: 0,
      medium: 0,
      high: 0,
      critical: 0,
    };

    for (const event of events) {
      // By app
      eventsByApp[event.sourceApp] = (eventsByApp[event.sourceApp] || 0) + 1;

      // By type
      eventsByType[event.eventTypeId] =
        (eventsByType[event.eventTypeId] || 0) + 1;

      // By day
      const day = new Date(event.serverTimestamp).toISOString().split("T")[0];
      eventsByDay[day] = (eventsByDay[day] || 0) + 1;

      // By sensitivity
      sensitivityBreakdown[event.sensitivityLevel]++;
    }

    return {
      totalEvents: events.length,
      eventsByApp,
      eventsByType,
      eventsByDay,
      sensitivityBreakdown,
    };
  },
});

/**
 * Get recent activity summary
 */
export const getRecentActivity = query({
  args: {
    userId: v.string(),
    hours: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  returns: v.object({
    recentEvents: v.array(v.any()),
    activeSessions: v.array(v.any()),
    eventCountByHour: v.any(),
  }),
  handler: async (ctx, args) => {
    const { userId, hours = 24, limit = 100 } = args;

    const cutoff = Date.now() - hours * 60 * 60 * 1000;

    // Recent events
    const recentEvents = await ctx.db
      .query("neuralEvents")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .filter((q) =>
        q.and(
          q.gte(q.field("serverTimestamp"), cutoff),
          q.eq(q.field("isDeleted"), false)
        )
      )
      .order("desc")
      .take(limit);

    // Active sessions
    const activeSessions = await ctx.db
      .query("userSessions")
      .withIndex("by_user_active", (q) =>
        q.eq("userId", userId).eq("isActive", true)
      )
      .collect();

    // Events by hour
    const eventCountByHour: Record<string, number> = {};
    for (const event of recentEvents) {
      const hour = new Date(event.serverTimestamp).toISOString().slice(0, 13);
      eventCountByHour[hour] = (eventCountByHour[hour] || 0) + 1;
    }

    return {
      recentEvents,
      activeSessions,
      eventCountByHour,
    };
  },
});

// ============================================================
// PROCESSING STATUS QUERIES
// ============================================================

/**
 * Get unprocessed events for AI processing pipeline
 */
export const getUnprocessedEvents = internalQuery({
  args: {
    limit: v.optional(v.number()),
    vectorizableOnly: v.optional(v.boolean()),
  },
  returns: v.array(v.any()),
  handler: async (ctx, args) => {
    const { limit = 100, vectorizableOnly = false } = args;

    let events = await ctx.db
      .query("neuralEvents")
      .withIndex("by_processing_status", (q) => q.eq("isProcessed", false))
      .order("asc")
      .take(limit);

    // Filter to vectorizable events if requested
    if (vectorizableOnly) {
      events = events.filter(
        (e) =>
          e.modality.text ||
          e.modality.audio ||
          e.modality.video ||
          e.modality.image
      );
    }

    return events;
  },
});

/**
 * Get events pending deletion (past retention period)
 */
export const getEventsForDeletion = internalQuery({
  args: {
    batchSize: v.optional(v.number()),
  },
  returns: v.array(v.any()),
  handler: async (ctx, args) => {
    const { batchSize = 100 } = args;

    // Get soft-deleted events older than 30 days
    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;

    const events = await ctx.db
      .query("neuralEvents")
      .withIndex("by_deleted", (q) => q.eq("isDeleted", true))
      .filter((q) => q.lt(q.field("deletedAt"), cutoff))
      .take(batchSize);

    return events;
  },
});

// ============================================================
// SEARCH QUERIES
// ============================================================

/**
 * Search events by payload content (basic text search)
 */
export const searchEvents = query({
  args: {
    userId: v.string(),
    searchTerm: v.string(),
    eventTypeIds: v.optional(v.array(v.string())),
    limit: v.optional(v.number()),
  },
  returns: v.array(v.any()),
  handler: async (ctx, args) => {
    const { userId, searchTerm, eventTypeIds, limit = 50 } = args;

    // Get user's events
    let events = await ctx.db
      .query("neuralEvents")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .filter((q) => q.eq(q.field("isDeleted"), false))
      .take(1000); // Get a larger set for searching

    // Filter by event types if specified
    if (eventTypeIds && eventTypeIds.length > 0) {
      events = events.filter((e) => eventTypeIds.includes(e.eventTypeId));
    }

    // Simple text search in payload
    const searchLower = searchTerm.toLowerCase();
    const matchingEvents = events.filter((event) => {
      const payloadStr = JSON.stringify(event.payload).toLowerCase();
      return payloadStr.includes(searchLower);
    });

    return matchingEvents.slice(0, limit);
  },
});

// ============================================================
// EXPORT QUERIES
// ============================================================

/**
 * Get all user data for export (GDPR compliance)
 */
export const getUserDataExport = query({
  args: {
    userId: v.string(),
    includeMedia: v.optional(v.boolean()),
  },
  returns: v.object({
    events: v.array(v.any()),
    sessions: v.array(v.any()),
    consentHistory: v.array(v.any()),
    mediaReferences: v.array(v.any()),
    exportedAt: v.number(),
  }),
  handler: async (ctx, args) => {
    const { userId, includeMedia = false } = args;

    // Get all events
    const events = await ctx.db
      .query("neuralEvents")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    // Get all sessions
    const sessions = await ctx.db
      .query("userSessions")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    // Get consent history
    const consentHistory = await ctx.db
      .query("consentRecords")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    // Get media references if requested
    let mediaReferences: Doc<"mediaReferences">[] = [];
    if (includeMedia) {
      mediaReferences = await ctx.db
        .query("mediaReferences")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .collect();
    }

    return {
      events,
      sessions,
      consentHistory,
      mediaReferences,
      exportedAt: Date.now(),
    };
  },
});
