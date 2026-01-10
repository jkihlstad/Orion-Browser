import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Id } from "./id";
import { requireUser } from "./auth";
import {
  emotionalTones,
  intentTypes,
} from "./schema";

// Start a new voice session
export const startVoiceSession = mutation({
  args: {
    clerkId: v.string(),
    initialTone: v.optional(emotionalTones),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx, args.clerkId);

    // Check if voice is enabled in preferences
    const fullUser = await ctx.db.get(user._id);
    if (!fullUser?.preferences?.voiceEnabled) {
      throw new Error("Voice features are disabled in user preferences");
    }

    // Check intelligence level - voice requires at least basic
    if (fullUser.intelligenceLevel === "off") {
      throw new Error("Voice features require intelligence level to be enabled");
    }

    // End any existing active voice sessions
    const activeSessions = await ctx.db
      .query("voiceSessions")
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

    // Create new voice session
    const sessionId = await ctx.db.insert("voiceSessions", {
      userId: user._id,
      startTime: Date.now(),
      emotionalTone: args.initialTone ?? "neutral",
      intentMarkers: [],
      isActive: true,
    });

    // Log session start
    await ctx.db.insert("auditLogs", {
      userId: user._id,
      action: "voice_session.started",
      details: {
        resourceType: "voiceSessions",
        resourceId: sessionId,
        success: true,
      },
      timestamp: Date.now(),
    });

    return sessionId;
  },
});

// End a voice session
export const endVoiceSession = mutation({
  args: {
    clerkId: v.string(),
    sessionId: v.id("voiceSessions"),
    finalTranscription: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx, args.clerkId);
    const session = await ctx.db.get(args.sessionId);

    if (!session) {
      throw new Error("Voice session not found");
    }

    if (session.userId !== user._id) {
      throw new Error("Unauthorized: Session belongs to another user");
    }

    const endTime = Date.now();
    const duration = endTime - session.startTime;

    await ctx.db.patch(args.sessionId, {
      isActive: false,
      endTime,
      transcription: args.finalTranscription ?? session.transcription,
      metadata: {
        ...session.metadata,
        duration,
        wordCount: args.finalTranscription
          ? args.finalTranscription.split(/\s+/).length
          : session.transcription?.split(/\s+/).length ?? 0,
      },
    });

    // Log session end
    await ctx.db.insert("auditLogs", {
      userId: user._id,
      action: "voice_session.ended",
      details: {
        resourceType: "voiceSessions",
        resourceId: args.sessionId,
        newValue: { duration },
        success: true,
      },
      timestamp: Date.now(),
    });

    return { success: true, duration };
  },
});

// Update transcription in real-time
export const updateTranscription = mutation({
  args: {
    clerkId: v.string(),
    sessionId: v.id("voiceSessions"),
    transcription: v.string(),
    isPartial: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx, args.clerkId);
    const session = await ctx.db.get(args.sessionId);

    if (!session) {
      throw new Error("Voice session not found");
    }

    if (session.userId !== user._id) {
      throw new Error("Unauthorized");
    }

    if (!session.isActive) {
      throw new Error("Cannot update an inactive session");
    }

    await ctx.db.patch(args.sessionId, {
      transcription: args.isPartial
        ? (session.transcription ?? "") + " " + args.transcription
        : args.transcription,
    });

    return { success: true };
  },
});

// Add intent marker to session
export const addIntentMarker = mutation({
  args: {
    clerkId: v.string(),
    sessionId: v.id("voiceSessions"),
    intent: intentTypes,
    confidence: v.number(),
    text: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx, args.clerkId);
    const session = await ctx.db.get(args.sessionId);

    if (!session) {
      throw new Error("Voice session not found");
    }

    if (session.userId !== user._id) {
      throw new Error("Unauthorized");
    }

    const newMarker = {
      timestamp: Date.now(),
      intent: args.intent,
      confidence: args.confidence,
      text: args.text,
    };

    await ctx.db.patch(args.sessionId, {
      intentMarkers: [...session.intentMarkers, newMarker],
    });

    return { success: true, marker: newMarker };
  },
});

// Update emotional tone
export const updateEmotionalTone = mutation({
  args: {
    clerkId: v.string(),
    sessionId: v.id("voiceSessions"),
    tone: emotionalTones,
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx, args.clerkId);
    const session = await ctx.db.get(args.sessionId);

    if (!session) {
      throw new Error("Voice session not found");
    }

    if (session.userId !== user._id) {
      throw new Error("Unauthorized");
    }

    await ctx.db.patch(args.sessionId, {
      emotionalTone: args.tone,
    });

    return { success: true };
  },
});

// Get active voice session
export const getActiveVoiceSession = query({
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
      .query("voiceSessions")
      .withIndex("by_userId_active", (q) =>
        q.eq("userId", user._id).eq("isActive", true)
      )
      .first();
  },
});

// Get voice session details
export const getVoiceSession = query({
  args: {
    clerkId: v.string(),
    sessionId: v.id("voiceSessions"),
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
      return null;
    }

    if (session.userId !== user._id) {
      throw new Error("Unauthorized");
    }

    // Get associated embeddings
    const embeddings = await ctx.db
      .query("voiceEmbeddings")
      .withIndex("by_sessionId", (q) => q.eq("sessionId", args.sessionId))
      .collect();

    return {
      session,
      embeddings: embeddings.map((e) => ({
        intentType: e.intentType,
        confidence: e.confidence,
        emotionalTrajectory: e.emotionalTrajectory,
        createdAt: e.createdAt,
      })),
    };
  },
});

// Get voice session history
export const getVoiceHistory = query({
  args: {
    clerkId: v.string(),
    limit: v.optional(v.number()),
    before: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", args.clerkId))
      .unique();

    if (!user) {
      return [];
    }

    const sessions = await ctx.db
      .query("voiceSessions")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .order("desc")
      .collect();

    let filteredSessions = sessions;

    if (args.before) {
      filteredSessions = filteredSessions.filter(
        (s) => s.startTime < args.before!
      );
    }

    const limit = args.limit ?? 50;
    return filteredSessions.slice(0, limit);
  },
});

// Get voice statistics
export const getVoiceStats = query({
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
      .query("voiceSessions")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .collect();

    const startDate = args.startDate ?? 0;
    const endDate = args.endDate ?? Date.now();

    const filteredSessions = sessions.filter(
      (s) => s.startTime >= startDate && s.startTime <= endDate
    );

    // Calculate intent distribution
    const intentDistribution: Record<string, number> = {};
    for (const session of filteredSessions) {
      for (const marker of session.intentMarkers) {
        intentDistribution[marker.intent] =
          (intentDistribution[marker.intent] ?? 0) + 1;
      }
    }

    // Calculate emotional tone distribution
    const toneDistribution: Record<string, number> = {};
    for (const session of filteredSessions) {
      toneDistribution[session.emotionalTone] =
        (toneDistribution[session.emotionalTone] ?? 0) + 1;
    }

    // Calculate total duration
    const totalDuration = filteredSessions.reduce((sum, s) => {
      const duration = s.endTime ? s.endTime - s.startTime : 0;
      return sum + duration;
    }, 0);

    // Calculate total word count
    const totalWords = filteredSessions.reduce(
      (sum, s) => sum + (s.metadata?.wordCount ?? 0),
      0
    );

    return {
      totalSessions: filteredSessions.length,
      totalDuration,
      totalWords,
      averageSessionLength:
        filteredSessions.length > 0
          ? totalDuration / filteredSessions.length
          : 0,
      intentDistribution,
      toneDistribution,
    };
  },
});

// Delete voice session
export const deleteVoiceSession = mutation({
  args: {
    clerkId: v.string(),
    sessionId: v.id("voiceSessions"),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx, args.clerkId);
    const session = await ctx.db.get(args.sessionId);

    if (!session) {
      throw new Error("Voice session not found");
    }

    if (session.userId !== user._id) {
      throw new Error("Unauthorized");
    }

    // Delete associated embeddings first
    const embeddings = await ctx.db
      .query("voiceEmbeddings")
      .withIndex("by_sessionId", (q) => q.eq("sessionId", args.sessionId))
      .collect();

    for (const embedding of embeddings) {
      await ctx.db.delete(embedding._id);
    }

    // Delete the session
    await ctx.db.delete(args.sessionId);

    // Log deletion
    await ctx.db.insert("auditLogs", {
      userId: user._id,
      action: "voice_session.deleted",
      details: {
        resourceType: "voiceSessions",
        resourceId: args.sessionId,
        success: true,
      },
      timestamp: Date.now(),
    });

    return { success: true };
  },
});

// Process voice command (analyze and route)
export const processVoiceCommand = mutation({
  args: {
    clerkId: v.string(),
    sessionId: v.id("voiceSessions"),
    command: v.string(),
    context: v.optional(
      v.object({
        currentUrl: v.optional(v.string()),
        selectedText: v.optional(v.string()),
        activeTab: v.optional(v.string()),
      })
    ),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx, args.clerkId);
    const session = await ctx.db.get(args.sessionId);

    if (!session) {
      throw new Error("Voice session not found");
    }

    if (session.userId !== user._id) {
      throw new Error("Unauthorized");
    }

    // Simple command parsing - in production, use LangChain/LLM
    const command = args.command.toLowerCase().trim();

    let intent: "navigation" | "search" | "command" | "question" | "dictation" | "unknown" = "unknown";
    let action: Record<string, unknown> = {};

    if (command.startsWith("go to") || command.startsWith("open")) {
      intent = "navigation";
      action = {
        type: "navigate",
        target: command.replace(/^(go to|open)\s+/i, ""),
      };
    } else if (command.startsWith("search") || command.startsWith("find")) {
      intent = "search";
      action = {
        type: "search",
        query: command.replace(/^(search|find)\s+(for\s+)?/i, ""),
      };
    } else if (
      command.startsWith("scroll") ||
      command.startsWith("click") ||
      command.startsWith("back") ||
      command.startsWith("forward") ||
      command.startsWith("refresh")
    ) {
      intent = "command";
      action = {
        type: "browser_action",
        command: command,
      };
    } else if (
      command.includes("?") ||
      command.startsWith("what") ||
      command.startsWith("who") ||
      command.startsWith("where") ||
      command.startsWith("when") ||
      command.startsWith("why") ||
      command.startsWith("how")
    ) {
      intent = "question";
      action = {
        type: "question",
        query: command,
      };
    } else {
      intent = "dictation";
      action = {
        type: "dictation",
        text: command,
      };
    }

    // Add intent marker
    const marker = {
      timestamp: Date.now(),
      intent,
      confidence: 0.8, // Placeholder - use ML model in production
      text: args.command,
    };

    await ctx.db.patch(args.sessionId, {
      intentMarkers: [...session.intentMarkers, marker],
    });

    return {
      intent,
      action,
      confidence: 0.8,
      sessionId: args.sessionId,
    };
  },
});

// Clear voice history
export const clearVoiceHistory = mutation({
  args: {
    clerkId: v.string(),
    before: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx, args.clerkId);

    const sessions = await ctx.db
      .query("voiceSessions")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .collect();

    const before = args.before ?? Date.now();
    let deletedCount = 0;

    for (const session of sessions) {
      if (session.startTime < before && !session.isActive) {
        // Delete associated embeddings
        const embeddings = await ctx.db
          .query("voiceEmbeddings")
          .withIndex("by_sessionId", (q) => q.eq("sessionId", session._id))
          .collect();

        for (const embedding of embeddings) {
          await ctx.db.delete(embedding._id);
        }

        await ctx.db.delete(session._id);
        deletedCount++;
      }
    }

    // Log deletion
    await ctx.db.insert("auditLogs", {
      userId: user._id,
      action: "voice_history.cleared",
      details: {
        resourceType: "voiceSessions",
        newValue: { deletedCount },
        success: true,
      },
      timestamp: Date.now(),
    });

    return { deletedCount };
  },
});
