/**
 * Forgetting Curves and Data Deletion for Orion Browser
 *
 * Implements memory management based on:
 * - Ebbinghaus forgetting curves
 * - Hard delete for compliance (GDPR, CCPA)
 * - Scheduled deletion
 * - Data lifecycle management
 *
 * @module vectorDb/forgetting
 */

import { v } from "convex/values";
import {
  mutation,
  internalMutation,
  internalQuery,
  action,
} from "../_generated/server";
import { internal } from "../_generated/api";
import type { Id } from "../id";
import { VectorNamespace, NAMESPACE_CONFIG } from "./namespaces";

// ============================================================================
// Types
// ============================================================================

/**
 * Forgetting curve parameters
 */
export interface ForgettingCurveParams {
  /** Initial retention rate (0-1) */
  initialRetention: number;
  /** Decay rate (higher = faster forgetting) */
  decayRate: number;
  /** Minimum retention threshold before deletion */
  minRetention: number;
  /** Retention boost per access */
  accessBoost: number;
  /** Maximum retention boost from accesses */
  maxAccessBoost: number;
}

/**
 * Retention analysis result
 */
export interface RetentionAnalysis {
  /** Vector ID */
  vectorId: Id<"vectors">;
  /** Current retention score (0-1) */
  retentionScore: number;
  /** Days until expiration */
  daysUntilExpiration: number | null;
  /** Whether marked for deletion */
  markedForDeletion: boolean;
  /** Scheduled deletion date */
  scheduledDeletionAt: number | null;
  /** Recommended action */
  recommendation: "keep" | "archive" | "delete";
  /** Access statistics */
  accessStats: {
    totalAccesses: number;
    lastAccessedDaysAgo: number;
    avgAccessInterval: number | null;
  };
}

/**
 * Deletion request for compliance
 */
export interface DeletionRequest {
  /** Request ID */
  requestId: string;
  /** User ID */
  userId: string;
  /** Deletion type */
  type: "full" | "namespace" | "selective";
  /** Namespaces to delete (for namespace/selective types) */
  namespaces?: VectorNamespace[];
  /** Specific vector IDs to delete (for selective type) */
  vectorIds?: Id<"vectors">[];
  /** Request timestamp */
  requestedAt: number;
  /** Status */
  status: "pending" | "processing" | "completed" | "failed";
  /** Completion timestamp */
  completedAt?: number;
  /** Error message if failed */
  error?: string;
}

/**
 * Deletion statistics
 */
export interface DeletionStats {
  /** Total vectors deleted */
  totalDeleted: number;
  /** Vectors deleted by namespace */
  byNamespace: Record<VectorNamespace, number>;
  /** Duration in ms */
  durationMs: number;
}

// ============================================================================
// Constants
// ============================================================================

/**
 * Default forgetting curve parameters per namespace
 */
export const DEFAULT_CURVE_PARAMS: Record<VectorNamespace, ForgettingCurveParams> = {
  browsing: {
    initialRetention: 1.0,
    decayRate: 0.1, // ~10% per day initially
    minRetention: 0.2,
    accessBoost: 0.15,
    maxAccessBoost: 0.5,
  },
  voice: {
    initialRetention: 1.0,
    decayRate: 0.15, // Faster decay for voice
    minRetention: 0.3,
    accessBoost: 0.1,
    maxAccessBoost: 0.3,
  },
  explicit: {
    initialRetention: 1.0,
    decayRate: 0.3, // Very fast decay
    minRetention: 0.5,
    accessBoost: 0.05,
    maxAccessBoost: 0.1,
  },
  preferences: {
    initialRetention: 1.0,
    decayRate: 0.02, // Very slow decay for preferences
    minRetention: 0.1,
    accessBoost: 0.2,
    maxAccessBoost: 0.8,
  },
  interactions: {
    initialRetention: 1.0,
    decayRate: 0.2,
    minRetention: 0.3,
    accessBoost: 0.1,
    maxAccessBoost: 0.3,
  },
};

/** Grace period before hard delete (in ms) - 30 days */
const DELETION_GRACE_PERIOD_MS = 30 * 24 * 60 * 60 * 1000;

/** Batch size for deletion operations */
const DELETION_BATCH_SIZE = 100;

// ============================================================================
// Forgetting Curve Calculations
// ============================================================================

/**
 * Calculates retention score based on Ebbinghaus forgetting curve
 *
 * R = e^(-t/S)
 * Where:
 * - R is retention
 * - t is time since last access
 * - S is stability (affected by repetition)
 *
 * @param lastAccessedAt - Timestamp of last access
 * @param accessCount - Number of times accessed
 * @param params - Forgetting curve parameters
 * @returns Retention score between 0 and 1
 */
export function calculateRetention(
  lastAccessedAt: number,
  accessCount: number,
  params: ForgettingCurveParams
): number {
  const now = Date.now();
  const daysSinceAccess = (now - lastAccessedAt) / (1000 * 60 * 60 * 24);

  // Calculate stability boost from repeated access
  // More accesses = slower decay
  const stabilityBoost = Math.min(
    params.maxAccessBoost,
    (accessCount - 1) * params.accessBoost
  );

  // Adjusted decay rate (lower = slower forgetting)
  const adjustedDecayRate = Math.max(0.01, params.decayRate - stabilityBoost);

  // Ebbinghaus forgetting curve
  const retention =
    params.initialRetention * Math.exp(-adjustedDecayRate * daysSinceAccess);

  // Clamp to valid range
  return Math.max(0, Math.min(1, retention));
}

/**
 * Calculates days until a vector reaches minimum retention
 */
export function calculateDaysUntilExpiration(
  lastAccessedAt: number,
  accessCount: number,
  params: ForgettingCurveParams
): number | null {
  const currentRetention = calculateRetention(
    lastAccessedAt,
    accessCount,
    params
  );

  if (currentRetention <= params.minRetention) {
    return 0; // Already at or below threshold
  }

  // Solve for t in: minRetention = initialRetention * e^(-adjustedDecayRate * t)
  const stabilityBoost = Math.min(
    params.maxAccessBoost,
    (accessCount - 1) * params.accessBoost
  );
  const adjustedDecayRate = Math.max(0.01, params.decayRate - stabilityBoost);

  const t =
    -Math.log(params.minRetention / params.initialRetention) /
    adjustedDecayRate;

  const now = Date.now();
  const daysSinceAccess = (now - lastAccessedAt) / (1000 * 60 * 60 * 24);
  const daysRemaining = t - daysSinceAccess;

  return Math.max(0, daysRemaining);
}

/**
 * Determines the recommended action for a vector based on retention
 */
export function getRetentionRecommendation(
  retention: number,
  minRetention: number
): "keep" | "archive" | "delete" {
  if (retention <= minRetention) {
    return "delete";
  }
  if (retention <= minRetention + 0.2) {
    return "archive";
  }
  return "keep";
}

// ============================================================================
// Retention Analysis
// ============================================================================

/**
 * Analyzes retention for a specific vector
 */
export const analyzeVectorRetention = internalQuery({
  args: {
    vectorId: v.id("vectors"),
  },
  handler: async (ctx, args): Promise<RetentionAnalysis | null> => {
    const vector = await ctx.db.get(args.vectorId);
    if (!vector) {
      return null;
    }

    const params =
      DEFAULT_CURVE_PARAMS[vector.namespace as VectorNamespace] ??
      DEFAULT_CURVE_PARAMS.browsing;

    const retention = calculateRetention(
      vector.lastAccessedAt,
      vector.accessCount,
      params
    );

    const daysUntilExpiration = calculateDaysUntilExpiration(
      vector.lastAccessedAt,
      vector.accessCount,
      params
    );

    const now = Date.now();
    const lastAccessedDaysAgo =
      (now - vector.lastAccessedAt) / (1000 * 60 * 60 * 24);

    // Calculate average access interval
    let avgAccessInterval: number | null = null;
    if (vector.accessCount > 1) {
      const totalDays = (vector.lastAccessedAt - vector.createdAt) / (1000 * 60 * 60 * 24);
      avgAccessInterval = totalDays / (vector.accessCount - 1);
    }

    return {
      vectorId: args.vectorId,
      retentionScore: retention,
      daysUntilExpiration,
      markedForDeletion: vector.isMarkedForDeletion,
      scheduledDeletionAt: vector.scheduledDeletionAt,
      recommendation: getRetentionRecommendation(retention, params.minRetention),
      accessStats: {
        totalAccesses: vector.accessCount,
        lastAccessedDaysAgo,
        avgAccessInterval,
      },
    };
  },
});

/**
 * Analyzes retention for all vectors of a user
 */
export const analyzeUserRetention = action({
  args: {
    userId: v.string(),
    namespace: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<{
    analyses: RetentionAnalysis[];
    summary: {
      total: number;
      atRisk: number;
      expiringSoon: number;
      healthy: number;
    };
  }> => {
    const analyses: RetentionAnalysis[] = [];
    const namespaces: VectorNamespace[] = args.namespace
      ? [args.namespace as VectorNamespace]
      : ["browsing", "voice", "explicit", "preferences", "interactions"];

    for (const namespace of namespaces) {
      const vectors = await ctx.runQuery(internal.vectorDb.forgetting.getVectorsForRetentionAnalysis, {
        userId: args.userId,
        namespace,
      });

      for (const vector of vectors) {
        const analysis = await ctx.runQuery(internal.vectorDb.forgetting.analyzeVectorRetention, {
          vectorId: vector._id,
        });
        if (analysis) {
          analyses.push(analysis);
        }
      }
    }

    // Calculate summary
    const summary = {
      total: analyses.length,
      atRisk: analyses.filter((a) => a.recommendation === "delete").length,
      expiringSoon: analyses.filter(
        (a) => a.daysUntilExpiration !== null && a.daysUntilExpiration < 7
      ).length,
      healthy: analyses.filter((a) => a.recommendation === "keep").length,
    };

    return { analyses, summary };
  },
});

/**
 * Gets vectors for retention analysis (internal)
 */
export const getVectorsForRetentionAnalysis = internalQuery({
  args: {
    userId: v.string(),
    namespace: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("vectors")
      .withIndex("by_user_namespace", (q) =>
        q.eq("userId", args.userId).eq("namespace", args.namespace)
      )
      .filter((q) => q.eq(q.field("isMarkedForDeletion"), false))
      .collect();
  },
});

// ============================================================================
// Hard Delete Operations (Compliance)
// ============================================================================

/**
 * Initiates a full data deletion request for a user (GDPR right to erasure)
 */
export const requestFullDeletion = mutation({
  args: {
    userId: v.string(),
    immediate: v.optional(v.boolean()),
  },
  handler: async (ctx, args): Promise<{ requestId: string }> => {
    const requestId = `del_${Date.now()}_${Math.random().toString(36).slice(2)}`;

    // Create deletion request record
    await ctx.db.insert("deletionRequests", {
      requestId,
      userId: args.userId,
      type: "full",
      namespaces: undefined,
      vectorIds: undefined,
      requestedAt: Date.now(),
      status: "pending",
      scheduledFor: args.immediate
        ? Date.now()
        : Date.now() + DELETION_GRACE_PERIOD_MS,
    });

    // Log for audit
    await ctx.db.insert("auditLogs", {
      action: "deletion.requested",
      userId: args.userId,
      timestamp: Date.now(),
      metadata: {
        requestId,
        type: "full",
        immediate: args.immediate ?? false,
      },
    });

    return { requestId };
  },
});

/**
 * Initiates deletion of specific namespaces for a user
 */
export const requestNamespaceDeletion = mutation({
  args: {
    userId: v.string(),
    namespaces: v.array(v.string()),
    immediate: v.optional(v.boolean()),
  },
  handler: async (ctx, args): Promise<{ requestId: string }> => {
    const requestId = `del_${Date.now()}_${Math.random().toString(36).slice(2)}`;

    await ctx.db.insert("deletionRequests", {
      requestId,
      userId: args.userId,
      type: "namespace",
      namespaces: args.namespaces as VectorNamespace[],
      vectorIds: undefined,
      requestedAt: Date.now(),
      status: "pending",
      scheduledFor: args.immediate
        ? Date.now()
        : Date.now() + DELETION_GRACE_PERIOD_MS,
    });

    await ctx.db.insert("auditLogs", {
      action: "deletion.requested",
      userId: args.userId,
      timestamp: Date.now(),
      metadata: {
        requestId,
        type: "namespace",
        namespaces: args.namespaces,
        immediate: args.immediate ?? false,
      },
    });

    return { requestId };
  },
});

/**
 * Processes pending deletion requests (scheduled job)
 */
export const processDeletionRequests = internalMutation({
  handler: async (ctx): Promise<DeletionStats> => {
    const startTime = Date.now();
    const stats: DeletionStats = {
      totalDeleted: 0,
      byNamespace: {
        browsing: 0,
        voice: 0,
        explicit: 0,
        preferences: 0,
        interactions: 0,
      },
      durationMs: 0,
    };

    // Get pending requests that are due
    const pendingRequests = await ctx.db
      .query("deletionRequests")
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .filter((q) => q.lte(q.field("scheduledFor"), Date.now()))
      .take(10);

    for (const request of pendingRequests) {
      // Update status to processing
      await ctx.db.patch(request._id, { status: "processing" });

      try {
        let deletedCount = 0;

        if (request.type === "full") {
          // Delete all vectors for user
          for (const namespace of Object.keys(DEFAULT_CURVE_PARAMS) as VectorNamespace[]) {
            const nsDeleted = await deleteNamespaceVectors(
              ctx,
              request.userId,
              namespace
            );
            deletedCount += nsDeleted;
            stats.byNamespace[namespace] += nsDeleted;
          }
        } else if (request.type === "namespace" && request.namespaces) {
          // Delete specific namespaces
          for (const namespace of request.namespaces) {
            const nsDeleted = await deleteNamespaceVectors(
              ctx,
              request.userId,
              namespace as VectorNamespace
            );
            deletedCount += nsDeleted;
            stats.byNamespace[namespace as VectorNamespace] += nsDeleted;
          }
        } else if (request.type === "selective" && request.vectorIds) {
          // Delete specific vectors
          for (const vectorId of request.vectorIds) {
            const vector = await ctx.db.get(vectorId as Id<"vectors">);
            if (vector && vector.userId === request.userId) {
              await ctx.db.delete(vectorId as Id<"vectors">);
              deletedCount++;
              stats.byNamespace[vector.namespace as VectorNamespace]++;
            }
          }
        }

        stats.totalDeleted += deletedCount;

        // Mark as completed
        await ctx.db.patch(request._id, {
          status: "completed",
          completedAt: Date.now(),
        });

        // Audit log
        await ctx.db.insert("auditLogs", {
          action: "deletion.completed",
          userId: request.userId,
          timestamp: Date.now(),
          metadata: {
            requestId: request.requestId,
            deletedCount,
          },
        });
      } catch (error) {
        // Mark as failed
        await ctx.db.patch(request._id, {
          status: "failed",
          error: error instanceof Error ? error.message : "Unknown error",
        });

        await ctx.db.insert("auditLogs", {
          action: "deletion.failed",
          userId: request.userId,
          timestamp: Date.now(),
          metadata: {
            requestId: request.requestId,
            error: error instanceof Error ? error.message : "Unknown error",
          },
        });
      }
    }

    stats.durationMs = Date.now() - startTime;
    return stats;
  },
});

/**
 * Helper to delete all vectors in a namespace for a user
 */
async function deleteNamespaceVectors(
  ctx: { db: any },
  userId: string,
  namespace: VectorNamespace
): Promise<number> {
  let deleted = 0;

  while (true) {
    const batch = await ctx.db
      .query("vectors")
      .withIndex("by_user_namespace", (q) =>
        q.eq("userId", userId).eq("namespace", namespace)
      )
      .take(DELETION_BATCH_SIZE);

    if (batch.length === 0) {
      break;
    }

    for (const vector of batch) {
      await ctx.db.delete(vector._id);
      deleted++;
    }
  }

  return deleted;
}

/**
 * Cancels a pending deletion request
 */
export const cancelDeletionRequest = mutation({
  args: {
    requestId: v.string(),
    userId: v.string(),
  },
  handler: async (ctx, args): Promise<{ success: boolean }> => {
    const request = await ctx.db
      .query("deletionRequests")
      .withIndex("by_request_id", (q) => q.eq("requestId", args.requestId))
      .first();

    if (!request) {
      throw new Error("Deletion request not found");
    }

    if (request.userId !== args.userId) {
      throw new Error("Unauthorized");
    }

    if (request.status !== "pending") {
      throw new Error("Can only cancel pending requests");
    }

    await ctx.db.patch(request._id, {
      status: "cancelled" as any,
    });

    await ctx.db.insert("auditLogs", {
      action: "deletion.cancelled",
      userId: args.userId,
      timestamp: Date.now(),
      metadata: {
        requestId: args.requestId,
      },
    });

    return { success: true };
  },
});

// ============================================================================
// Automatic Cleanup
// ============================================================================

/**
 * Cleans up expired vectors based on forgetting curves (scheduled job)
 */
export const cleanupExpiredVectors = internalMutation({
  handler: async (ctx): Promise<{ cleaned: number }> => {
    let cleaned = 0;

    for (const namespace of Object.keys(DEFAULT_CURVE_PARAMS) as VectorNamespace[]) {
      const params = DEFAULT_CURVE_PARAMS[namespace];

      // Get vectors that might be expired
      const candidates = await ctx.db
        .query("vectors")
        .withIndex("by_namespace", (q) => q.eq("namespace", namespace))
        .filter((q) => q.eq(q.field("isMarkedForDeletion"), false))
        .take(1000);

      for (const vector of candidates) {
        const retention = calculateRetention(
          vector.lastAccessedAt,
          vector.accessCount,
          params
        );

        if (retention < params.minRetention) {
          // Mark for deletion instead of immediate delete
          await ctx.db.patch(vector._id, {
            isMarkedForDeletion: true,
            scheduledDeletionAt: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 days grace
          });
          cleaned++;
        }
      }
    }

    return { cleaned };
  },
});

/**
 * Permanently deletes vectors marked for deletion (scheduled job)
 */
export const purgeMarkedVectors = internalMutation({
  handler: async (ctx): Promise<{ purged: number }> => {
    const now = Date.now();

    const toPurge = await ctx.db
      .query("vectors")
      .withIndex("by_deletion_status", (q) => q.eq("isMarkedForDeletion", true))
      .filter((q) =>
        q.and(
          q.neq(q.field("scheduledDeletionAt"), null),
          q.lte(q.field("scheduledDeletionAt"), now)
        )
      )
      .take(DELETION_BATCH_SIZE);

    for (const vector of toPurge) {
      await ctx.db.delete(vector._id);
    }

    return { purged: toPurge.length };
  },
});

/**
 * Refreshes retention for a vector (called on access)
 */
export const refreshRetention = internalMutation({
  args: {
    vectorId: v.id("vectors"),
  },
  handler: async (ctx, args) => {
    const vector = await ctx.db.get(args.vectorId);
    if (!vector) return;

    const params =
      DEFAULT_CURVE_PARAMS[vector.namespace as VectorNamespace] ??
      DEFAULT_CURVE_PARAMS.browsing;

    // Calculate new confidence based on access pattern
    const oldRetention = calculateRetention(
      vector.lastAccessedAt,
      vector.accessCount,
      params
    );

    // Boost confidence slightly on access
    const newConfidence = Math.min(1, vector.confidence + 0.05);

    await ctx.db.patch(args.vectorId, {
      lastAccessedAt: Date.now(),
      accessCount: vector.accessCount + 1,
      confidence: newConfidence,
      // Clear deletion marking if it was set
      isMarkedForDeletion: false,
      scheduledDeletionAt: null,
    });

    return {
      oldRetention,
      newConfidence,
    };
  },
});
