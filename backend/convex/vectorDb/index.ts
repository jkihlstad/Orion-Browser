/**
 * Vector Database Operations for Orion Browser
 *
 * Main entry point for vector database functionality including:
 * - Vector storage and retrieval
 * - Embedding management
 * - CRUD operations for vector entries
 * - Integration with AI features
 *
 * @module vectorDb
 */

import { v } from "convex/values";
import { mutation, query, internalMutation, internalQuery } from "../_generated/server";
import type { Id } from "../id";
import { VectorNamespace, NAMESPACE_CONFIG } from "./namespaces";

// ============================================================================
// Types
// ============================================================================

/**
 * Vector entry stored in the database
 */
export interface VectorEntry {
  _id: Id<"vectors">;
  /** User who owns this vector */
  userId: string;
  /** Namespace for isolation */
  namespace: VectorNamespace;
  /** The embedding vector */
  embedding: number[];
  /** Original text/content that was embedded */
  content: string;
  /** Metadata associated with this entry */
  metadata: VectorMetadata;
  /** Timestamp when created */
  createdAt: number;
  /** Timestamp of last access (for forgetting curves) */
  lastAccessedAt: number;
  /** Access count (for importance weighting) */
  accessCount: number;
  /** Confidence score (0-1) */
  confidence: number;
  /** Whether this entry is marked for deletion */
  isMarkedForDeletion: boolean;
  /** Scheduled deletion timestamp (if applicable) */
  scheduledDeletionAt: number | null;
}

/**
 * Metadata for vector entries
 */
export interface VectorMetadata {
  /** Source URL or identifier */
  source: string;
  /** Content type */
  contentType: "page" | "voice" | "search" | "interaction" | "preference";
  /** Domain of the content */
  domain: string;
  /** Title if applicable */
  title?: string;
  /** Summary or excerpt */
  summary?: string;
  /** Tags for categorization */
  tags: string[];
  /** Language of the content */
  language: string;
  /** Sensitivity level */
  sensitivity: "public" | "private" | "sensitive" | "explicit";
  /** Custom metadata */
  custom: Record<string, unknown>;
}

/**
 * Options for vector operations
 */
export interface VectorOperationOptions {
  /** Whether to update access timestamp */
  updateAccessTime?: boolean;
  /** Whether to increment access count */
  incrementAccessCount?: boolean;
  /** Minimum confidence threshold */
  minConfidence?: number;
}

/**
 * Result of a vector upsert operation
 */
export interface UpsertResult {
  id: Id<"vectors">;
  isNew: boolean;
  previousConfidence?: number;
  newConfidence: number;
}

// ============================================================================
// Constants
// ============================================================================

/** Default embedding dimension (OpenAI text-embedding-3-small) */
export const EMBEDDING_DIMENSION = 1536;

/** Maximum number of vectors per user per namespace */
export const MAX_VECTORS_PER_NAMESPACE = 100000;

/** Default confidence for new entries */
export const DEFAULT_CONFIDENCE = 0.5;

// ============================================================================
// Vector Storage Operations
// ============================================================================

/**
 * Stores a new vector or updates an existing one
 */
export const upsertVector = mutation({
  args: {
    userId: v.string(),
    namespace: v.string(),
    embedding: v.array(v.number()),
    content: v.string(),
    metadata: v.object({
      source: v.string(),
      contentType: v.union(
        v.literal("page"),
        v.literal("voice"),
        v.literal("search"),
        v.literal("interaction"),
        v.literal("preference")
      ),
      domain: v.string(),
      title: v.optional(v.string()),
      summary: v.optional(v.string()),
      tags: v.array(v.string()),
      language: v.string(),
      sensitivity: v.union(
        v.literal("public"),
        v.literal("private"),
        v.literal("sensitive"),
        v.literal("explicit")
      ),
      custom: v.any(),
    }),
    confidence: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<UpsertResult> => {
    const namespace = args.namespace as VectorNamespace;

    // Validate namespace
    if (!NAMESPACE_CONFIG[namespace]) {
      throw new Error(`Invalid namespace: ${namespace}`);
    }

    // Validate embedding dimension
    if (args.embedding.length !== EMBEDDING_DIMENSION) {
      throw new Error(
        `Invalid embedding dimension: expected ${EMBEDDING_DIMENSION}, got ${args.embedding.length}`
      );
    }

    // Check for existing vector with same content hash
    const contentHash = hashContent(args.content);
    const existing = await ctx.db
      .query("vectors")
      .withIndex("by_user_namespace_content", (q) =>
        q
          .eq("userId", args.userId)
          .eq("namespace", namespace)
          .eq("contentHash", contentHash)
      )
      .first();

    const now = Date.now();
    const confidence = args.confidence ?? DEFAULT_CONFIDENCE;

    if (existing) {
      // Update existing vector
      const previousConfidence = existing.confidence;
      const newConfidence = Math.min(
        1,
        (previousConfidence + confidence) / 2 + 0.1
      ); // Boost confidence on repeated access

      await ctx.db.patch(existing._id, {
        embedding: args.embedding,
        metadata: args.metadata,
        lastAccessedAt: now,
        accessCount: existing.accessCount + 1,
        confidence: newConfidence,
      });

      return {
        id: existing._id,
        isNew: false,
        previousConfidence,
        newConfidence,
      };
    }

    // Create new vector
    const id = await ctx.db.insert("vectors", {
      userId: args.userId,
      namespace,
      embedding: args.embedding,
      content: args.content,
      contentHash,
      metadata: args.metadata,
      createdAt: now,
      lastAccessedAt: now,
      accessCount: 1,
      confidence,
      isMarkedForDeletion: false,
      scheduledDeletionAt: null,
    });

    return {
      id,
      isNew: true,
      newConfidence: confidence,
    };
  },
});

/**
 * Retrieves a vector by ID
 */
export const getVector = query({
  args: {
    id: v.id("vectors"),
    options: v.optional(
      v.object({
        updateAccessTime: v.optional(v.boolean()),
        incrementAccessCount: v.optional(v.boolean()),
      })
    ),
  },
  handler: async (ctx, args) => {
    const vector = await ctx.db.get(args.id);
    if (!vector || vector.isMarkedForDeletion) {
      return null;
    }
    return vector;
  },
});

/**
 * Updates access metrics for a vector (internal use)
 */
export const updateVectorAccess = internalMutation({
  args: {
    id: v.id("vectors"),
  },
  handler: async (ctx, args) => {
    const vector = await ctx.db.get(args.id);
    if (!vector) return;

    await ctx.db.patch(args.id, {
      lastAccessedAt: Date.now(),
      accessCount: vector.accessCount + 1,
    });
  },
});

/**
 * Gets all vectors for a user in a namespace
 */
export const getVectorsByNamespace = query({
  args: {
    userId: v.string(),
    namespace: v.string(),
    limit: v.optional(v.number()),
    cursor: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 100;

    const vectors = await ctx.db
      .query("vectors")
      .withIndex("by_user_namespace", (q) =>
        q.eq("userId", args.userId).eq("namespace", args.namespace)
      )
      .filter((q) => q.eq(q.field("isMarkedForDeletion"), false))
      .take(limit + 1);

    const hasMore = vectors.length > limit;
    const items = hasMore ? vectors.slice(0, limit) : vectors;
    const nextCursor = hasMore ? items[items.length - 1]._id : null;

    return {
      items,
      nextCursor,
      hasMore,
    };
  },
});

/**
 * Deletes a vector immediately (hard delete)
 */
export const deleteVector = mutation({
  args: {
    id: v.id("vectors"),
    userId: v.string(),
  },
  handler: async (ctx, args) => {
    const vector = await ctx.db.get(args.id);
    if (!vector) {
      throw new Error("Vector not found");
    }

    // Verify ownership
    if (vector.userId !== args.userId) {
      throw new Error("Unauthorized: Vector belongs to another user");
    }

    await ctx.db.delete(args.id);

    return { success: true, deletedId: args.id };
  },
});

/**
 * Marks a vector for scheduled deletion
 */
export const scheduleVectorDeletion = mutation({
  args: {
    id: v.id("vectors"),
    userId: v.string(),
    deleteAfterMs: v.number(),
  },
  handler: async (ctx, args) => {
    const vector = await ctx.db.get(args.id);
    if (!vector) {
      throw new Error("Vector not found");
    }

    if (vector.userId !== args.userId) {
      throw new Error("Unauthorized: Vector belongs to another user");
    }

    const scheduledDeletionAt = Date.now() + args.deleteAfterMs;

    await ctx.db.patch(args.id, {
      isMarkedForDeletion: true,
      scheduledDeletionAt,
    });

    return { success: true, scheduledDeletionAt };
  },
});

/**
 * Batch upsert vectors
 */
export const batchUpsertVectors = mutation({
  args: {
    userId: v.string(),
    vectors: v.array(
      v.object({
        namespace: v.string(),
        embedding: v.array(v.number()),
        content: v.string(),
        metadata: v.object({
          source: v.string(),
          contentType: v.union(
            v.literal("page"),
            v.literal("voice"),
            v.literal("search"),
            v.literal("interaction"),
            v.literal("preference")
          ),
          domain: v.string(),
          title: v.optional(v.string()),
          summary: v.optional(v.string()),
          tags: v.array(v.string()),
          language: v.string(),
          sensitivity: v.union(
            v.literal("public"),
            v.literal("private"),
            v.literal("sensitive"),
            v.literal("explicit")
          ),
          custom: v.any(),
        }),
        confidence: v.optional(v.number()),
      })
    ),
  },
  handler: async (ctx, args) => {
    const results: UpsertResult[] = [];

    for (const vector of args.vectors) {
      const namespace = vector.namespace as VectorNamespace;
      const contentHash = hashContent(vector.content);
      const now = Date.now();
      const confidence = vector.confidence ?? DEFAULT_CONFIDENCE;

      const existing = await ctx.db
        .query("vectors")
        .withIndex("by_user_namespace_content", (q) =>
          q
            .eq("userId", args.userId)
            .eq("namespace", namespace)
            .eq("contentHash", contentHash)
        )
        .first();

      if (existing) {
        const previousConfidence = existing.confidence;
        const newConfidence = Math.min(
          1,
          (previousConfidence + confidence) / 2 + 0.1
        );

        await ctx.db.patch(existing._id, {
          embedding: vector.embedding,
          metadata: vector.metadata,
          lastAccessedAt: now,
          accessCount: existing.accessCount + 1,
          confidence: newConfidence,
        });

        results.push({
          id: existing._id,
          isNew: false,
          previousConfidence,
          newConfidence,
        });
      } else {
        const id = await ctx.db.insert("vectors", {
          userId: args.userId,
          namespace,
          embedding: vector.embedding,
          content: vector.content,
          contentHash,
          metadata: vector.metadata,
          createdAt: now,
          lastAccessedAt: now,
          accessCount: 1,
          confidence,
          isMarkedForDeletion: false,
          scheduledDeletionAt: null,
        });

        results.push({
          id,
          isNew: true,
          newConfidence: confidence,
        });
      }
    }

    return results;
  },
});

/**
 * Gets vector statistics for a user
 */
export const getVectorStats = query({
  args: {
    userId: v.string(),
  },
  handler: async (ctx, args) => {
    const namespaces: VectorNamespace[] = [
      "browsing",
      "voice",
      "explicit",
      "preferences",
      "interactions",
    ];

    const stats: Record<string, { count: number; avgConfidence: number }> = {};

    for (const namespace of namespaces) {
      const vectors = await ctx.db
        .query("vectors")
        .withIndex("by_user_namespace", (q) =>
          q.eq("userId", args.userId).eq("namespace", namespace)
        )
        .filter((q) => q.eq(q.field("isMarkedForDeletion"), false))
        .collect();

      const count = vectors.length;
      const avgConfidence =
        count > 0
          ? vectors.reduce((sum, v) => sum + v.confidence, 0) / count
          : 0;

      stats[namespace] = { count, avgConfidence };
    }

    return {
      stats,
      totalVectors: Object.values(stats).reduce((sum, s) => sum + s.count, 0),
    };
  },
});

// ============================================================================
// Internal Queries
// ============================================================================

/**
 * Gets vectors for similarity search (internal)
 */
export const getVectorsForSearch = internalQuery({
  args: {
    userId: v.string(),
    namespace: v.string(),
    minConfidence: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 1000;
    const minConfidence = args.minConfidence ?? 0;

    const vectors = await ctx.db
      .query("vectors")
      .withIndex("by_user_namespace", (q) =>
        q.eq("userId", args.userId).eq("namespace", args.namespace)
      )
      .filter((q) =>
        q.and(
          q.eq(q.field("isMarkedForDeletion"), false),
          q.gte(q.field("confidence"), minConfidence)
        )
      )
      .take(limit);

    return vectors;
  },
});

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Creates a simple hash of content for deduplication
 * Note: In production, use a proper hashing library
 */
function hashContent(content: string): string {
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return hash.toString(36);
}

/**
 * Calculates cosine similarity between two vectors
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error("Vectors must have the same dimension");
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
  if (magnitude === 0) {
    return 0;
  }

  return dotProduct / magnitude;
}

/**
 * Normalizes a vector to unit length
 */
export function normalizeVector(vector: number[]): number[] {
  const norm = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
  if (norm === 0) {
    return vector;
  }
  return vector.map((val) => val / norm);
}

/**
 * Calculates the average of multiple vectors
 */
export function averageVectors(vectors: number[][]): number[] {
  if (vectors.length === 0) {
    throw new Error("Cannot average empty vector array");
  }

  const dimension = vectors[0].length;
  const result = new Array(dimension).fill(0);

  for (const vector of vectors) {
    for (let i = 0; i < dimension; i++) {
      result[i] += vector[i];
    }
  }

  return result.map((val) => val / vectors.length);
}
