import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Id } from "./id";
import { requireUser } from "./auth";

// Hash URL for privacy-preserving lookups
function hashUrl(url: string): string {
  // Simple hash for demo - in production use crypto
  let hash = 0;
  for (let i = 0; i < url.length; i++) {
    const char = url.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return hash.toString(36);
}

// Create a new browsing session
export const startSession = mutation({
  args: {
    clerkId: v.string(),
    metadata: v.optional(
      v.object({
        deviceType: v.optional(v.string()),
        osVersion: v.optional(v.string()),
        appVersion: v.optional(v.string()),
        networkType: v.optional(v.string()),
        tabCount: v.optional(v.number()),
        isPrivate: v.optional(v.boolean()),
      })
    ),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx, args.clerkId);

    // End any existing active sessions
    const activeSessions = await ctx.db
      .query("browsingSessions")
      .withIndex("by_userId_active", (q) =>
        q.eq("userId", user._id).eq("isActive", true)
      )
      .collect();

    for (const session of activeSessions) {
      await ctx.db.patch(session._id, {
        isActive: false,
        endTime: Date.now(),
      });
    }

    // Create new session
    const sessionId = await ctx.db.insert("browsingSessions", {
      userId: user._id,
      startTime: Date.now(),
      metadata: args.metadata ?? {},
      isActive: true,
    });

    // Log session start
    await ctx.db.insert("auditLogs", {
      userId: user._id,
      action: "session.started",
      details: {
        resourceType: "browsingSessions",
        resourceId: sessionId,
        success: true,
      },
      timestamp: Date.now(),
    });

    return sessionId;
  },
});

// End a browsing session
export const endSession = mutation({
  args: {
    clerkId: v.string(),
    sessionId: v.id("browsingSessions"),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx, args.clerkId);
    const session = await ctx.db.get(args.sessionId);

    if (!session) {
      throw new Error("Session not found");
    }

    if (session.userId !== user._id) {
      throw new Error("Unauthorized: Session belongs to another user");
    }

    await ctx.db.patch(args.sessionId, {
      isActive: false,
      endTime: Date.now(),
    });

    // Log session end
    await ctx.db.insert("auditLogs", {
      userId: user._id,
      action: "session.ended",
      details: {
        resourceType: "browsingSessions",
        resourceId: args.sessionId,
        success: true,
      },
      timestamp: Date.now(),
    });

    return { success: true };
  },
});

// Get active session for user
export const getActiveSession = query({
  args: {
    clerkId: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", args.clerkId))
      .unique();

    if (!user) {
      return null;
    }

    return await ctx.db
      .query("browsingSessions")
      .withIndex("by_userId_active", (q) =>
        q.eq("userId", user._id).eq("isActive", true)
      )
      .first();
  },
});

// Record a browsing event
export const recordEvent = mutation({
  args: {
    clerkId: v.string(),
    sessionId: v.id("browsingSessions"),
    url: v.string(),
    category: v.optional(v.string()),
    dwellTime: v.optional(v.number()),
    scrollDepth: v.optional(v.number()),
    interactionVelocity: v.optional(v.number()),
    intentLabel: v.optional(v.string()),
    metadata: v.optional(
      v.object({
        title: v.optional(v.string()),
        referrer: v.optional(v.string()),
        isBookmarked: v.optional(v.boolean()),
        wasShared: v.optional(v.boolean()),
      })
    ),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx, args.clerkId);
    const session = await ctx.db.get(args.sessionId);

    if (!session) {
      throw new Error("Session not found");
    }

    if (session.userId !== user._id) {
      throw new Error("Unauthorized: Session belongs to another user");
    }

    // Check user's intelligence level for data collection
    const fullUser = await ctx.db.get(user._id);
    if (fullUser?.intelligenceLevel === "off") {
      // Don't record detailed events if intelligence is off
      return null;
    }

    const eventId = await ctx.db.insert("browsingEvents", {
      sessionId: args.sessionId,
      userId: user._id,
      url: args.url,
      urlHash: hashUrl(args.url),
      category: args.category,
      dwellTime: args.dwellTime,
      scrollDepth: args.scrollDepth,
      interactionVelocity: args.interactionVelocity,
      intentLabel: args.intentLabel,
      timestamp: Date.now(),
      metadata: args.metadata,
    });

    return eventId;
  },
});

// Batch record multiple events
export const recordEventsBatch = mutation({
  args: {
    clerkId: v.string(),
    sessionId: v.id("browsingSessions"),
    events: v.array(
      v.object({
        url: v.string(),
        category: v.optional(v.string()),
        dwellTime: v.optional(v.number()),
        scrollDepth: v.optional(v.number()),
        interactionVelocity: v.optional(v.number()),
        intentLabel: v.optional(v.string()),
        timestamp: v.number(),
        metadata: v.optional(
          v.object({
            title: v.optional(v.string()),
            referrer: v.optional(v.string()),
            isBookmarked: v.optional(v.boolean()),
            wasShared: v.optional(v.boolean()),
          })
        ),
      })
    ),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx, args.clerkId);
    const session = await ctx.db.get(args.sessionId);

    if (!session) {
      throw new Error("Session not found");
    }

    if (session.userId !== user._id) {
      throw new Error("Unauthorized: Session belongs to another user");
    }

    const fullUser = await ctx.db.get(user._id);
    if (fullUser?.intelligenceLevel === "off") {
      return { recorded: 0 };
    }

    const eventIds: Id<"browsingEvents">[] = [];
    for (const event of args.events) {
      const eventId = await ctx.db.insert("browsingEvents", {
        sessionId: args.sessionId,
        userId: user._id,
        url: event.url,
        urlHash: hashUrl(event.url),
        category: event.category,
        dwellTime: event.dwellTime,
        scrollDepth: event.scrollDepth,
        interactionVelocity: event.interactionVelocity,
        intentLabel: event.intentLabel,
        timestamp: event.timestamp,
        metadata: event.metadata,
      });
      eventIds.push(eventId);
    }

    return { recorded: eventIds.length, eventIds };
  },
});

// Update event with engagement data
export const updateEventEngagement = mutation({
  args: {
    clerkId: v.string(),
    eventId: v.id("browsingEvents"),
    dwellTime: v.optional(v.number()),
    scrollDepth: v.optional(v.number()),
    interactionVelocity: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx, args.clerkId);
    const event = await ctx.db.get(args.eventId);

    if (!event) {
      throw new Error("Event not found");
    }

    if (event.userId !== user._id) {
      throw new Error("Unauthorized: Event belongs to another user");
    }

    const updates: Record<string, unknown> = {};
    if (args.dwellTime !== undefined) {
      updates.dwellTime = args.dwellTime;
    }
    if (args.scrollDepth !== undefined) {
      updates.scrollDepth = args.scrollDepth;
    }
    if (args.interactionVelocity !== undefined) {
      updates.interactionVelocity = args.interactionVelocity;
    }

    if (Object.keys(updates).length > 0) {
      await ctx.db.patch(args.eventId, updates);
    }

    return { success: true };
  },
});

// Get user's browsing history
export const getHistory = query({
  args: {
    clerkId: v.string(),
    limit: v.optional(v.number()),
    before: v.optional(v.number()),
    category: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", args.clerkId))
      .unique();

    if (!user) {
      return [];
    }

    let query = ctx.db
      .query("browsingEvents")
      .withIndex("by_userId_timestamp", (q) => q.eq("userId", user._id))
      .order("desc");

    const events = await query.collect();

    // Apply filters
    let filteredEvents = events;

    if (args.before) {
      filteredEvents = filteredEvents.filter((e) => e.timestamp < args.before!);
    }

    if (args.category) {
      filteredEvents = filteredEvents.filter((e) => e.category === args.category);
    }

    // Apply limit
    const limit = args.limit ?? 50;
    return filteredEvents.slice(0, limit);
  },
});

// Get session details with events
export const getSessionDetails = query({
  args: {
    clerkId: v.string(),
    sessionId: v.id("browsingSessions"),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", args.clerkId))
      .unique();

    if (!user) {
      throw new Error("User not found");
    }

    const session = await ctx.db.get(args.sessionId);
    if (!session) {
      throw new Error("Session not found");
    }

    if (session.userId !== user._id) {
      throw new Error("Unauthorized");
    }

    const events = await ctx.db
      .query("browsingEvents")
      .withIndex("by_sessionId", (q) => q.eq("sessionId", args.sessionId))
      .order("asc")
      .collect();

    return {
      session,
      events,
      stats: {
        totalEvents: events.length,
        totalDwellTime: events.reduce((sum, e) => sum + (e.dwellTime ?? 0), 0),
        averageScrollDepth:
          events.length > 0
            ? events.reduce((sum, e) => sum + (e.scrollDepth ?? 0), 0) /
              events.length
            : 0,
        uniqueUrls: new Set(events.map((e) => e.urlHash)).size,
      },
    };
  },
});

// Get browsing stats for user
export const getStats = query({
  args: {
    clerkId: v.string(),
    startDate: v.optional(v.number()),
    endDate: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", args.clerkId))
      .unique();

    if (!user) {
      return null;
    }

    const sessions = await ctx.db
      .query("browsingSessions")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .collect();

    const events = await ctx.db
      .query("browsingEvents")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .collect();

    // Apply date filters
    const startDate = args.startDate ?? 0;
    const endDate = args.endDate ?? Date.now();

    const filteredSessions = sessions.filter(
      (s) => s.startTime >= startDate && s.startTime <= endDate
    );

    const filteredEvents = events.filter(
      (e) => e.timestamp >= startDate && e.timestamp <= endDate
    );

    // Calculate category distribution
    const categoryDistribution: Record<string, number> = {};
    for (const event of filteredEvents) {
      const category = event.category ?? "uncategorized";
      categoryDistribution[category] = (categoryDistribution[category] ?? 0) + 1;
    }

    // Calculate hourly distribution
    const hourlyDistribution: Record<number, number> = {};
    for (const event of filteredEvents) {
      const hour = new Date(event.timestamp).getHours();
      hourlyDistribution[hour] = (hourlyDistribution[hour] ?? 0) + 1;
    }

    return {
      totalSessions: filteredSessions.length,
      totalEvents: filteredEvents.length,
      totalDwellTime: filteredEvents.reduce(
        (sum, e) => sum + (e.dwellTime ?? 0),
        0
      ),
      averageScrollDepth:
        filteredEvents.length > 0
          ? filteredEvents.reduce((sum, e) => sum + (e.scrollDepth ?? 0), 0) /
            filteredEvents.length
          : 0,
      uniqueUrls: new Set(filteredEvents.map((e) => e.urlHash)).size,
      categoryDistribution,
      hourlyDistribution,
    };
  },
});

// Delete browsing history
export const deleteHistory = mutation({
  args: {
    clerkId: v.string(),
    before: v.optional(v.number()),
    category: v.optional(v.string()),
    urlPattern: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx, args.clerkId);

    const events = await ctx.db
      .query("browsingEvents")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .collect();

    let deletedCount = 0;

    for (const event of events) {
      let shouldDelete = true;

      if (args.before && event.timestamp >= args.before) {
        shouldDelete = false;
      }

      if (args.category && event.category !== args.category) {
        shouldDelete = false;
      }

      if (args.urlPattern && !event.url.includes(args.urlPattern)) {
        shouldDelete = false;
      }

      if (shouldDelete) {
        // Also delete associated embeddings
        const embeddings = await ctx.db
          .query("contentEmbeddings")
          .withIndex("by_eventId", (q) => q.eq("eventId", event._id))
          .collect();

        for (const embedding of embeddings) {
          await ctx.db.delete(embedding._id);
        }

        await ctx.db.delete(event._id);
        deletedCount++;
      }
    }

    // Log deletion
    await ctx.db.insert("auditLogs", {
      userId: user._id,
      action: "history.deleted",
      details: {
        resourceType: "browsingEvents",
        newValue: { deletedCount },
        success: true,
      },
      timestamp: Date.now(),
    });

    return { deletedCount };
  },
});

// Search browsing history by URL
export const searchHistory = query({
  args: {
    clerkId: v.string(),
    query: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", args.clerkId))
      .unique();

    if (!user) {
      return [];
    }

    const events = await ctx.db
      .query("browsingEvents")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .collect();

    const searchQuery = args.query.toLowerCase();
    const matchingEvents = events.filter(
      (e) =>
        e.url.toLowerCase().includes(searchQuery) ||
        e.metadata?.title?.toLowerCase().includes(searchQuery) ||
        e.category?.toLowerCase().includes(searchQuery)
    );

    // Sort by timestamp descending
    matchingEvents.sort((a, b) => b.timestamp - a.timestamp);

    const limit = args.limit ?? 20;
    return matchingEvents.slice(0, limit);
  },
});
