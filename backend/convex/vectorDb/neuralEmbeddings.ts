/**
 * Neural Embeddings - Vector Database Integration
 *
 * Provides vector storage and semantic search capabilities for
 * neural events across text, audio, video, and image modalities.
 */

import {
  mutation,
  query,
  action,
  internalMutation,
  internalQuery,
  internalAction,
} from "../_generated/server";
import { v } from "convex/values";
import type { Id, Doc } from "../id";
import { internal } from "../_generated/api";

// ============================================================
// CONSTANTS & TYPES
// ============================================================

// Embedding model configurations
export const EMBEDDING_MODELS = {
  "text-embedding-ada-002": { dimensions: 1536, modality: "text" },
  "text-embedding-3-small": { dimensions: 1536, modality: "text" },
  "text-embedding-3-large": { dimensions: 3072, modality: "text" },
  "clip-vit-base-patch32": { dimensions: 512, modality: "image" },
  "whisper-embedding": { dimensions: 1280, modality: "audio" },
  "multimodal-embedding-001": { dimensions: 1408, modality: "multimodal" },
} as const;

export type EmbeddingModelName = keyof typeof EMBEDDING_MODELS;

type ContentType = "text" | "audio" | "video" | "image" | "multimodal";

// ============================================================
// EMBEDDING STORAGE MUTATIONS
// ============================================================

/**
 * Store a new embedding in the vector database
 */
export const storeEmbedding = mutation({
  args: {
    userId: v.string(),
    embeddingVector: v.array(v.float64()),
    modelName: v.string(),
    modelVersion: v.string(),
    contentType: v.union(
      v.literal("text"),
      v.literal("audio"),
      v.literal("video"),
      v.literal("image"),
      v.literal("multimodal")
    ),
    sourceEventId: v.optional(v.id("neuralEvents")),
    sourceMediaId: v.optional(v.id("mediaReferences")),
    contentSummary: v.optional(v.string()),
    contentHash: v.string(),
    expiresAt: v.optional(v.number()),
    qualityScore: v.optional(v.number()),
  },
  returns: v.id("neuralEmbeddings"),
  handler: async (ctx, args) => {
    const {
      userId,
      embeddingVector,
      modelName,
      modelVersion,
      contentType,
      sourceEventId,
      sourceMediaId,
      contentSummary,
      contentHash,
      expiresAt,
      qualityScore,
    } = args;

    // Check for duplicate by content hash
    const existing = await ctx.db
      .query("neuralEmbeddings")
      .withIndex("by_content_hash", (q) => q.eq("contentHash", contentHash))
      .first();

    if (existing) {
      // Return existing embedding ID for deduplication
      return existing._id;
    }

    // Validate embedding dimensions
    const modelConfig = EMBEDDING_MODELS[modelName as EmbeddingModelName];
    if (modelConfig && embeddingVector.length !== modelConfig.dimensions) {
      throw new Error(
        `Embedding dimension mismatch: expected ${modelConfig.dimensions}, got ${embeddingVector.length}`
      );
    }

    // Store the embedding
    const embeddingId = await ctx.db.insert("neuralEmbeddings", {
      userId,
      sourceEventId,
      sourceMediaId,
      embeddingVector,
      dimensions: embeddingVector.length,
      modelName,
      modelVersion,
      contentType,
      contentSummary,
      contentHash,
      createdAt: Date.now(),
      expiresAt,
      qualityScore,
    });

    return embeddingId;
  },
});

/**
 * Store multiple embeddings in batch
 */
export const storeBatchEmbeddings = mutation({
  args: {
    userId: v.string(),
    embeddings: v.array(
      v.object({
        embeddingVector: v.array(v.float64()),
        modelName: v.string(),
        modelVersion: v.string(),
        contentType: v.union(
          v.literal("text"),
          v.literal("audio"),
          v.literal("video"),
          v.literal("image"),
          v.literal("multimodal")
        ),
        sourceEventId: v.optional(v.id("neuralEvents")),
        sourceMediaId: v.optional(v.id("mediaReferences")),
        contentSummary: v.optional(v.string()),
        contentHash: v.string(),
      })
    ),
  },
  returns: v.array(v.id("neuralEmbeddings")),
  handler: async (ctx, args) => {
    const { userId, embeddings } = args;
    const timestamp = Date.now();
    const embeddingIds: Id<"neuralEmbeddings">[] = [];

    for (const embedding of embeddings) {
      // Check for duplicate
      const existing = await ctx.db
        .query("neuralEmbeddings")
        .withIndex("by_content_hash", (q) =>
          q.eq("contentHash", embedding.contentHash)
        )
        .first();

      if (existing) {
        embeddingIds.push(existing._id);
        continue;
      }

      const embeddingId = await ctx.db.insert("neuralEmbeddings", {
        userId,
        sourceEventId: embedding.sourceEventId,
        sourceMediaId: embedding.sourceMediaId,
        embeddingVector: embedding.embeddingVector,
        dimensions: embedding.embeddingVector.length,
        modelName: embedding.modelName,
        modelVersion: embedding.modelVersion,
        contentType: embedding.contentType,
        contentSummary: embedding.contentSummary,
        contentHash: embedding.contentHash,
        createdAt: timestamp,
      });

      embeddingIds.push(embeddingId);
    }

    return embeddingIds;
  },
});

/**
 * Update an existing embedding
 */
export const updateEmbedding = mutation({
  args: {
    embeddingId: v.id("neuralEmbeddings"),
    embeddingVector: v.optional(v.array(v.float64())),
    qualityScore: v.optional(v.number()),
    contentSummary: v.optional(v.string()),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const { embeddingId, embeddingVector, qualityScore, contentSummary } = args;

    const existing = await ctx.db.get(embeddingId);
    if (!existing) {
      return false;
    }

    const updates: Partial<Doc<"neuralEmbeddings">> = {};

    if (embeddingVector) {
      updates.embeddingVector = embeddingVector;
      updates.dimensions = embeddingVector.length;
    }
    if (qualityScore !== undefined) {
      updates.qualityScore = qualityScore;
    }
    if (contentSummary !== undefined) {
      updates.contentSummary = contentSummary;
    }

    await ctx.db.patch(embeddingId, updates);
    return true;
  },
});

/**
 * Delete an embedding
 */
export const deleteEmbedding = mutation({
  args: {
    embeddingId: v.id("neuralEmbeddings"),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const { embeddingId } = args;

    const existing = await ctx.db.get(embeddingId);
    if (!existing) {
      return false;
    }

    await ctx.db.delete(embeddingId);
    return true;
  },
});

// ============================================================
// VECTOR SEARCH QUERIES
// ============================================================

/**
 * Get embedding by ID
 */
export const getEmbedding = query({
  args: {
    embeddingId: v.id("neuralEmbeddings"),
  },
  returns: v.union(v.any(), v.null()),
  handler: async (ctx, args) => {
    return await ctx.db.get(args.embeddingId);
  },
});

/**
 * Get embeddings for a user
 */
export const getUserEmbeddings = query({
  args: {
    userId: v.string(),
    contentType: v.optional(
      v.union(
        v.literal("text"),
        v.literal("audio"),
        v.literal("video"),
        v.literal("image"),
        v.literal("multimodal")
      )
    ),
    limit: v.optional(v.number()),
  },
  returns: v.array(v.any()),
  handler: async (ctx, args) => {
    const { userId, contentType, limit = 100 } = args;

    if (contentType) {
      return await ctx.db
        .query("neuralEmbeddings")
        .withIndex("by_content_type", (q) => q.eq("contentType", contentType))
        .filter((q) => q.eq(q.field("userId"), userId))
        .take(limit);
    }

    return await ctx.db
      .query("neuralEmbeddings")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .take(limit);
  },
});

/**
 * Get embeddings for a specific event
 */
export const getEventEmbeddings = query({
  args: {
    eventId: v.id("neuralEvents"),
  },
  returns: v.array(v.any()),
  handler: async (ctx, args) => {
    return await ctx.db
      .query("neuralEmbeddings")
      .withIndex("by_source_event", (q) => q.eq("sourceEventId", args.eventId))
      .collect();
  },
});

// ============================================================
// SEMANTIC SEARCH (ACTIONS)
// Note: Vector search must run in actions, not queries
// ============================================================

/**
 * Perform vector similarity search
 *
 * This action takes a query vector and returns the most similar embeddings.
 */
export const vectorSearch = action({
  args: {
    userId: v.string(),
    queryVector: v.array(v.float64()),
    contentType: v.optional(
      v.union(
        v.literal("text"),
        v.literal("audio"),
        v.literal("video"),
        v.literal("image"),
        v.literal("multimodal")
      )
    ),
    limit: v.optional(v.number()),
    minScore: v.optional(v.number()),
  },
  returns: v.array(
    v.object({
      embeddingId: v.string(),
      score: v.number(),
      contentType: v.string(),
      contentSummary: v.union(v.string(), v.null()),
      sourceEventId: v.union(v.string(), v.null()),
      sourceMediaId: v.union(v.string(), v.null()),
    })
  ),
  handler: async (ctx, args) => {
    const { userId, queryVector, contentType, limit = 10, minScore = 0.5 } = args;

    // For production, you would use ctx.vectorSearch here
    // Since vector indexes need to be defined at schema level,
    // we implement a cosine similarity fallback for flexibility

    // Get user's embeddings
    const embeddings = await ctx.runQuery(
      internal.vectorDb.neuralEmbeddings.getEmbeddingsForSearch,
      { userId, contentType, limit: 1000 }
    );

    // Calculate cosine similarity for each embedding
    const results: Array<{
      embeddingId: string;
      score: number;
      contentType: string;
      contentSummary: string | null;
      sourceEventId: string | null;
      sourceMediaId: string | null;
    }> = [];

    for (const embedding of embeddings) {
      // Skip if dimensions don't match
      if (embedding.embeddingVector.length !== queryVector.length) {
        continue;
      }

      const score = cosineSimilarity(queryVector, embedding.embeddingVector);

      if (score >= minScore) {
        results.push({
          embeddingId: embedding._id,
          score,
          contentType: embedding.contentType,
          contentSummary: embedding.contentSummary || null,
          sourceEventId: embedding.sourceEventId || null,
          sourceMediaId: embedding.sourceMediaId || null,
        });
      }
    }

    // Sort by score descending and limit
    return results
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  },
});

/**
 * Semantic similarity search with text query
 *
 * Generates embedding from text query and performs vector search.
 */
export const semanticSearch = action({
  args: {
    userId: v.string(),
    textQuery: v.string(),
    contentType: v.optional(
      v.union(
        v.literal("text"),
        v.literal("audio"),
        v.literal("video"),
        v.literal("image"),
        v.literal("multimodal")
      )
    ),
    limit: v.optional(v.number()),
    minScore: v.optional(v.number()),
  },
  returns: v.object({
    results: v.array(
      v.object({
        embeddingId: v.string(),
        score: v.number(),
        contentType: v.string(),
        contentSummary: v.union(v.string(), v.null()),
        sourceEventId: v.union(v.string(), v.null()),
        sourceMediaId: v.union(v.string(), v.null()),
      })
    ),
    queryEmbeddingGenerated: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const { userId, textQuery, contentType, limit = 10, minScore = 0.5 } = args;

    // In production, generate embedding using OpenAI or another provider
    // For now, we return empty results indicating embedding generation is needed
    // The iOS SDK should generate the embedding client-side or use a separate endpoint

    // Placeholder: In production, call embedding API here
    // const queryVector = await generateEmbedding(textQuery);

    // For now, use text search as fallback
    const textSearchResults = await ctx.runQuery(
      internal.vectorDb.neuralEmbeddings.textSearchEmbeddings,
      { userId, searchTerm: textQuery, contentType, limit }
    );

    return {
      results: textSearchResults.map((r: any) => ({
        embeddingId: r._id,
        score: 0.8, // Placeholder score for text match
        contentType: r.contentType,
        contentSummary: r.contentSummary || null,
        sourceEventId: r.sourceEventId || null,
        sourceMediaId: r.sourceMediaId || null,
      })),
      queryEmbeddingGenerated: false,
    };
  },
});

/**
 * Find similar events based on an existing event's embedding
 */
export const findSimilarEvents = action({
  args: {
    userId: v.string(),
    sourceEventId: v.id("neuralEvents"),
    limit: v.optional(v.number()),
    minScore: v.optional(v.number()),
  },
  returns: v.array(
    v.object({
      eventId: v.string(),
      score: v.number(),
      eventTypeId: v.string(),
      timestamp: v.number(),
    })
  ),
  handler: async (ctx, args) => {
    const { userId, sourceEventId, limit = 10, minScore = 0.6 } = args;

    // Get the source event's embedding
    const sourceEmbeddings = await ctx.runQuery(
      internal.vectorDb.neuralEmbeddings.getEventEmbeddingsInternal,
      { eventId: sourceEventId }
    );

    if (sourceEmbeddings.length === 0) {
      return [];
    }

    // Use the first embedding (typically the primary text embedding)
    const sourceEmbedding = sourceEmbeddings[0];

    // Search for similar embeddings
    const similarEmbeddings = await ctx.runAction(
      internal.vectorDb.neuralEmbeddings.vectorSearchInternal,
      {
        userId,
        queryVector: sourceEmbedding.embeddingVector,
        limit: limit + 1, // +1 to exclude the source event
        minScore,
      }
    );

    // Map to events and exclude source
    const results: Array<{
      eventId: string;
      score: number;
      eventTypeId: string;
      timestamp: number;
    }> = [];

    for (const embedding of similarEmbeddings) {
      if (
        embedding.sourceEventId &&
        embedding.sourceEventId !== sourceEventId
      ) {
        const event = await ctx.runQuery(
          internal.vectorDb.neuralEmbeddings.getEventById,
          { eventId: embedding.sourceEventId as Id<"neuralEvents"> }
        );

        if (event) {
          results.push({
            eventId: event._id,
            score: embedding.score,
            eventTypeId: event.eventTypeId,
            timestamp: event.serverTimestamp,
          });
        }
      }
    }

    return results.slice(0, limit);
  },
});

// ============================================================
// INTERNAL HELPERS
// ============================================================

/**
 * Internal query to get embeddings for vector search
 */
export const getEmbeddingsForSearch = internalQuery({
  args: {
    userId: v.string(),
    contentType: v.optional(
      v.union(
        v.literal("text"),
        v.literal("audio"),
        v.literal("video"),
        v.literal("image"),
        v.literal("multimodal")
      )
    ),
    limit: v.number(),
  },
  handler: async (ctx, args) => {
    const { userId, contentType, limit } = args;

    if (contentType) {
      return await ctx.db
        .query("neuralEmbeddings")
        .withIndex("by_content_type", (q) => q.eq("contentType", contentType))
        .filter((q) => q.eq(q.field("userId"), userId))
        .take(limit);
    }

    return await ctx.db
      .query("neuralEmbeddings")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .take(limit);
  },
});

/**
 * Internal query for text search on content summaries
 */
export const textSearchEmbeddings = internalQuery({
  args: {
    userId: v.string(),
    searchTerm: v.string(),
    contentType: v.optional(
      v.union(
        v.literal("text"),
        v.literal("audio"),
        v.literal("video"),
        v.literal("image"),
        v.literal("multimodal")
      )
    ),
    limit: v.number(),
  },
  handler: async (ctx, args) => {
    const { userId, searchTerm, contentType, limit } = args;

    // Use the search index on contentSummary
    const results = await ctx.db
      .query("neuralEmbeddings")
      .withSearchIndex("search_content", (q) => {
        let search = q.search("contentSummary", searchTerm);
        search = search.eq("userId", userId);
        if (contentType) {
          search = search.eq("contentType", contentType);
        }
        return search;
      })
      .take(limit);

    return results;
  },
});

/**
 * Internal query to get event embeddings
 */
export const getEventEmbeddingsInternal = internalQuery({
  args: {
    eventId: v.id("neuralEvents"),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("neuralEmbeddings")
      .withIndex("by_source_event", (q) => q.eq("sourceEventId", args.eventId))
      .collect();
  },
});

/**
 * Internal vector search action
 */
export const vectorSearchInternal = internalAction({
  args: {
    userId: v.string(),
    queryVector: v.array(v.float64()),
    limit: v.number(),
    minScore: v.number(),
  },
  handler: async (ctx, args) => {
    const { userId, queryVector, limit, minScore } = args;

    const embeddings = await ctx.runQuery(
      internal.vectorDb.neuralEmbeddings.getEmbeddingsForSearch,
      { userId, limit: 1000 }
    );

    const results: Array<{
      embeddingId: string;
      score: number;
      sourceEventId: string | null;
      sourceMediaId: string | null;
    }> = [];

    for (const embedding of embeddings) {
      if (embedding.embeddingVector.length !== queryVector.length) {
        continue;
      }

      const score = cosineSimilarity(queryVector, embedding.embeddingVector);

      if (score >= minScore) {
        results.push({
          embeddingId: embedding._id,
          score,
          sourceEventId: embedding.sourceEventId || null,
          sourceMediaId: embedding.sourceMediaId || null,
        });
      }
    }

    return results.sort((a, b) => b.score - a.score).slice(0, limit);
  },
});

/**
 * Internal query to get event by ID
 */
export const getEventById = internalQuery({
  args: {
    eventId: v.id("neuralEvents"),
  },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.eventId);
  },
});

// ============================================================
// UTILITY FUNCTIONS
// ============================================================

/**
 * Calculate cosine similarity between two vectors
 */
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error("Vectors must have same length");
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  normA = Math.sqrt(normA);
  normB = Math.sqrt(normB);

  if (normA === 0 || normB === 0) {
    return 0;
  }

  return dotProduct / (normA * normB);
}

/**
 * Generate a content hash for deduplication
 */
export function generateContentHash(content: string): string {
  // Simple hash function - in production use a proper hashing library
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return `hash_${Math.abs(hash).toString(16)}`;
}

// ============================================================
// CLEANUP & MAINTENANCE
// ============================================================

/**
 * Delete expired embeddings
 */
export const cleanupExpiredEmbeddings = internalMutation({
  args: {
    batchSize: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { batchSize = 100 } = args;
    const now = Date.now();

    // Find expired embeddings
    const expired = await ctx.db
      .query("neuralEmbeddings")
      .filter((q) =>
        q.and(
          q.neq(q.field("expiresAt"), undefined),
          q.lt(q.field("expiresAt"), now)
        )
      )
      .take(batchSize);

    let deleted = 0;
    for (const embedding of expired) {
      await ctx.db.delete(embedding._id);
      deleted++;
    }

    return { deleted };
  },
});

/**
 * Delete all embeddings for a user (GDPR deletion)
 */
export const deleteUserEmbeddings = internalMutation({
  args: {
    userId: v.string(),
  },
  handler: async (ctx, args) => {
    const { userId } = args;

    const embeddings = await ctx.db
      .query("neuralEmbeddings")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    let deleted = 0;
    for (const embedding of embeddings) {
      await ctx.db.delete(embedding._id);
      deleted++;
    }

    return { deleted };
  },
});
