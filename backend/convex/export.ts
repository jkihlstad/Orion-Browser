import { v } from "convex/values";
import { mutation, query, action } from "./_generated/server";
import { api, internal } from "./_generated/api";
import type { Id } from "./id";
import { requireUser } from "./auth";
import { exportStatuses } from "./schema";

// Data types that can be exported
const EXPORTABLE_DATA_TYPES = [
  "browsing_history",
  "browsing_events",
  "voice_sessions",
  "content_embeddings",
  "voice_embeddings",
  "knowledge_graph",
  "consent_records",
  "preferences",
] as const;

// Create a new data export job
export const createExportJob = mutation({
  args: {
    clerkId: v.string(),
    targetAppId: v.string(),
    dataTypes: v.array(v.string()),
    encryptionKeyHash: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx, args.clerkId);

    // Validate data types
    const validDataTypes = args.dataTypes.filter((dt) =>
      EXPORTABLE_DATA_TYPES.includes(dt as (typeof EXPORTABLE_DATA_TYPES)[number])
    );

    if (validDataTypes.length === 0) {
      throw new Error("No valid data types specified for export");
    }

    // Check for existing pending/in_progress exports for same target
    const existingExports = await ctx.db
      .query("dataExports")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .collect();

    const activeExport = existingExports.find(
      (e) =>
        e.targetAppId === args.targetAppId &&
        (e.status === "pending" || e.status === "in_progress")
    );

    if (activeExport) {
      throw new Error(
        "An export to this target is already in progress. Please wait for it to complete."
      );
    }

    // Create export job
    const exportId = await ctx.db.insert("dataExports", {
      userId: user._id,
      targetAppId: args.targetAppId,
      dataTypes: validDataTypes,
      encryptionKeyHash: args.encryptionKeyHash,
      status: "pending",
      createdAt: Date.now(),
    });

    // Log export creation
    await ctx.db.insert("auditLogs", {
      userId: user._id,
      action: "export.created",
      details: {
        resourceType: "dataExports",
        resourceId: exportId,
        newValue: {
          targetAppId: args.targetAppId,
          dataTypes: validDataTypes,
        },
        success: true,
      },
      timestamp: Date.now(),
    });

    return exportId;
  },
});

// Start processing an export job
export const startExportJob = mutation({
  args: {
    clerkId: v.string(),
    exportId: v.id("dataExports"),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx, args.clerkId);
    const exportJob = await ctx.db.get(args.exportId);

    if (!exportJob) {
      throw new Error("Export job not found");
    }

    if (exportJob.userId !== user._id) {
      throw new Error("Unauthorized: Export belongs to another user");
    }

    if (exportJob.status !== "pending") {
      throw new Error(`Cannot start export with status: ${exportJob.status}`);
    }

    await ctx.db.patch(args.exportId, {
      status: "in_progress",
    });

    // Log export start
    await ctx.db.insert("auditLogs", {
      userId: user._id,
      action: "export.started",
      details: {
        resourceType: "dataExports",
        resourceId: args.exportId,
        success: true,
      },
      timestamp: Date.now(),
    });

    return { success: true, status: "in_progress" };
  },
});

// Mark export as completed
export const completeExportJob = mutation({
  args: {
    clerkId: v.string(),
    exportId: v.id("dataExports"),
    totalRecords: v.optional(v.number()),
    bytesExported: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx, args.clerkId);
    const exportJob = await ctx.db.get(args.exportId);

    if (!exportJob) {
      throw new Error("Export job not found");
    }

    if (exportJob.userId !== user._id) {
      throw new Error("Unauthorized");
    }

    if (exportJob.status !== "in_progress") {
      throw new Error(`Cannot complete export with status: ${exportJob.status}`);
    }

    await ctx.db.patch(args.exportId, {
      status: "completed",
      completedAt: Date.now(),
      lastSync: Date.now(),
      metadata: {
        ...exportJob.metadata,
        totalRecords: args.totalRecords,
        bytesExported: args.bytesExported,
      },
    });

    // Log export completion
    await ctx.db.insert("auditLogs", {
      userId: user._id,
      action: "export.completed",
      details: {
        resourceType: "dataExports",
        resourceId: args.exportId,
        newValue: {
          totalRecords: args.totalRecords,
          bytesExported: args.bytesExported,
        },
        success: true,
      },
      timestamp: Date.now(),
    });

    return { success: true, status: "completed" };
  },
});

// Mark export as failed
export const failExportJob = mutation({
  args: {
    clerkId: v.string(),
    exportId: v.id("dataExports"),
    errorMessage: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx, args.clerkId);
    const exportJob = await ctx.db.get(args.exportId);

    if (!exportJob) {
      throw new Error("Export job not found");
    }

    if (exportJob.userId !== user._id) {
      throw new Error("Unauthorized");
    }

    await ctx.db.patch(args.exportId, {
      status: "failed",
      completedAt: Date.now(),
      metadata: {
        ...exportJob.metadata,
        errorMessage: args.errorMessage,
      },
    });

    // Log export failure
    await ctx.db.insert("auditLogs", {
      userId: user._id,
      action: "export.failed",
      details: {
        resourceType: "dataExports",
        resourceId: args.exportId,
        newValue: { errorMessage: args.errorMessage },
        success: false,
        errorMessage: args.errorMessage,
      },
      timestamp: Date.now(),
    });

    return { success: false, status: "failed", error: args.errorMessage };
  },
});

// Cancel an export job
export const cancelExportJob = mutation({
  args: {
    clerkId: v.string(),
    exportId: v.id("dataExports"),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx, args.clerkId);
    const exportJob = await ctx.db.get(args.exportId);

    if (!exportJob) {
      throw new Error("Export job not found");
    }

    if (exportJob.userId !== user._id) {
      throw new Error("Unauthorized");
    }

    if (
      exportJob.status !== "pending" &&
      exportJob.status !== "in_progress"
    ) {
      throw new Error(`Cannot cancel export with status: ${exportJob.status}`);
    }

    await ctx.db.patch(args.exportId, {
      status: "cancelled",
      completedAt: Date.now(),
    });

    // Log cancellation
    await ctx.db.insert("auditLogs", {
      userId: user._id,
      action: "export.cancelled",
      details: {
        resourceType: "dataExports",
        resourceId: args.exportId,
        success: true,
      },
      timestamp: Date.now(),
    });

    return { success: true, status: "cancelled" };
  },
});

// Get export job status
export const getExportJob = query({
  args: {
    clerkId: v.string(),
    exportId: v.id("dataExports"),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", args.clerkId))
      .unique();

    if (!user) {
      return null;
    }

    const exportJob = await ctx.db.get(args.exportId);

    if (!exportJob || exportJob.userId !== user._id) {
      return null;
    }

    return exportJob;
  },
});

// Get all export jobs for user
export const getExportJobs = query({
  args: {
    clerkId: v.string(),
    status: v.optional(exportStatuses),
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

    let exports;
    if (args.status) {
      exports = await ctx.db
        .query("dataExports")
        .withIndex("by_userId_status", (q) =>
          q.eq("userId", user._id).eq("status", args.status!)
        )
        .order("desc")
        .collect();
    } else {
      exports = await ctx.db
        .query("dataExports")
        .withIndex("by_userId", (q) => q.eq("userId", user._id))
        .order("desc")
        .collect();
    }

    const limit = args.limit ?? 50;
    return exports.slice(0, limit);
  },
});

// Get exportable data for a specific type
export const getExportableData = query({
  args: {
    clerkId: v.string(),
    dataType: v.string(),
    limit: v.optional(v.number()),
    cursor: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", args.clerkId))
      .unique();

    if (!user) {
      return { data: [], hasMore: false };
    }

    const limit = args.limit ?? 100;
    const cursor = args.cursor ?? Date.now();

    switch (args.dataType) {
      case "browsing_history":
      case "browsing_events": {
        const events = await ctx.db
          .query("browsingEvents")
          .withIndex("by_userId_timestamp", (q) => q.eq("userId", user._id))
          .order("desc")
          .collect();

        const filtered = events.filter((e) => e.timestamp < cursor);
        const data = filtered.slice(0, limit);
        const hasMore = filtered.length > limit;

        return {
          data: data.map((e) => ({
            id: e._id,
            url: e.url,
            category: e.category,
            dwellTime: e.dwellTime,
            scrollDepth: e.scrollDepth,
            timestamp: e.timestamp,
            title: e.metadata?.title,
          })),
          hasMore,
          nextCursor: hasMore ? data[data.length - 1].timestamp : null,
        };
      }

      case "voice_sessions": {
        const sessions = await ctx.db
          .query("voiceSessions")
          .withIndex("by_userId", (q) => q.eq("userId", user._id))
          .order("desc")
          .collect();

        const filtered = sessions.filter((s) => s.startTime < cursor);
        const data = filtered.slice(0, limit);
        const hasMore = filtered.length > limit;

        return {
          data: data.map((s) => ({
            id: s._id,
            startTime: s.startTime,
            endTime: s.endTime,
            transcription: s.transcription,
            emotionalTone: s.emotionalTone,
            intentMarkers: s.intentMarkers,
          })),
          hasMore,
          nextCursor: hasMore ? data[data.length - 1].startTime : null,
        };
      }

      case "knowledge_graph": {
        const nodes = await ctx.db
          .query("knowledgeGraphNodes")
          .withIndex("by_userId", (q) => q.eq("userId", user._id))
          .order("desc")
          .collect();

        const filtered = nodes.filter((n) => n.createdAt < cursor);
        const data = filtered.slice(0, limit);
        const hasMore = filtered.length > limit;

        return {
          data: data.map((n) => ({
            id: n._id,
            nodeType: n.nodeType,
            content: n.content,
            connections: n.connections,
            confidence: n.confidence,
            createdAt: n.createdAt,
          })),
          hasMore,
          nextCursor: hasMore ? data[data.length - 1].createdAt : null,
        };
      }

      case "consent_records": {
        const records = await ctx.db
          .query("consentRecords")
          .withIndex("by_userId", (q) => q.eq("userId", user._id))
          .collect();

        const filtered = records.filter((r) => r.timestamp < cursor);
        const data = filtered.slice(0, limit);
        const hasMore = filtered.length > limit;

        return {
          data: data.map((r) => ({
            id: r._id,
            domain: r.domain,
            consentType: r.consentType,
            granted: r.granted,
            timestamp: r.timestamp,
            version: r.version,
          })),
          hasMore,
          nextCursor: hasMore ? data[data.length - 1].timestamp : null,
        };
      }

      case "preferences": {
        return {
          data: [
            {
              intelligenceLevel: user.intelligenceLevel,
              consentState: user.consentState,
              preferences: user.preferences,
              createdAt: user.createdAt,
            },
          ],
          hasMore: false,
          nextCursor: null,
        };
      }

      default:
        return { data: [], hasMore: false, nextCursor: null };
    }
  },
});

// Get export summary (counts for each data type)
export const getExportSummary = query({
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

    // Count all exportable data
    const browsingEvents = await ctx.db
      .query("browsingEvents")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .collect();

    const voiceSessions = await ctx.db
      .query("voiceSessions")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .collect();

    const contentEmbeddings = await ctx.db
      .query("contentEmbeddings")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .collect();

    const voiceEmbeddings = await ctx.db
      .query("voiceEmbeddings")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .collect();

    const knowledgeNodes = await ctx.db
      .query("knowledgeGraphNodes")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .collect();

    const consentRecords = await ctx.db
      .query("consentRecords")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .collect();

    return {
      browsingEvents: browsingEvents.length,
      voiceSessions: voiceSessions.length,
      contentEmbeddings: contentEmbeddings.length,
      voiceEmbeddings: voiceEmbeddings.length,
      knowledgeGraphNodes: knowledgeNodes.length,
      consentRecords: consentRecords.length,
      totalRecords:
        browsingEvents.length +
        voiceSessions.length +
        contentEmbeddings.length +
        voiceEmbeddings.length +
        knowledgeNodes.length +
        consentRecords.length,
      exportableTypes: EXPORTABLE_DATA_TYPES,
    };
  },
});

// Update last sync timestamp
export const updateLastSync = mutation({
  args: {
    clerkId: v.string(),
    exportId: v.id("dataExports"),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx, args.clerkId);
    const exportJob = await ctx.db.get(args.exportId);

    if (!exportJob) {
      throw new Error("Export job not found");
    }

    if (exportJob.userId !== user._id) {
      throw new Error("Unauthorized");
    }

    await ctx.db.patch(args.exportId, {
      lastSync: Date.now(),
    });

    return { success: true, lastSync: Date.now() };
  },
});

// Delete export job
export const deleteExportJob = mutation({
  args: {
    clerkId: v.string(),
    exportId: v.id("dataExports"),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx, args.clerkId);
    const exportJob = await ctx.db.get(args.exportId);

    if (!exportJob) {
      throw new Error("Export job not found");
    }

    if (exportJob.userId !== user._id) {
      throw new Error("Unauthorized");
    }

    if (
      exportJob.status === "pending" ||
      exportJob.status === "in_progress"
    ) {
      throw new Error("Cannot delete an active export job");
    }

    await ctx.db.delete(args.exportId);

    // Log deletion
    await ctx.db.insert("auditLogs", {
      userId: user._id,
      action: "export.deleted",
      details: {
        resourceType: "dataExports",
        resourceId: args.exportId,
        success: true,
      },
      timestamp: Date.now(),
    });

    return { success: true };
  },
});

// Get export history for target app
export const getExportHistoryByTarget = query({
  args: {
    clerkId: v.string(),
    targetAppId: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", args.clerkId))
      .unique();

    if (!user) {
      return [];
    }

    const exports = await ctx.db
      .query("dataExports")
      .withIndex("by_targetAppId", (q) => q.eq("targetAppId", args.targetAppId))
      .order("desc")
      .collect();

    // Filter by user
    return exports.filter((e) => e.userId === user._id);
  },
});
