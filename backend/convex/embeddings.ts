import { v } from "convex/values";
import { mutation, query, action } from "./_generated/server";
import { api, internal } from "./_generated/api";
import type { Id } from "./id";
import { requireUser } from "./auth";
import { contentTypes, intentTypes, emotionalTones } from "./schema";

// Store content embedding for a browsing event
export const storeContentEmbedding = mutation({
  args: {
    clerkId: v.string(),
    eventId: v.id("browsingEvents"),
    embedding: v.array(v.float64()),
    contentType: contentTypes,
    confidence: v.number(),
    namespace: v.string(),
    metadata: v.optional(
      v.object({
        extractedTopics: v.optional(v.array(v.string())),
        sentiment: v.optional(v.number()),
        readabilityScore: v.optional(v.number()),
      })
    ),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx, args.clerkId);

    // Verify the event belongs to this user
    const event = await ctx.db.get(args.eventId);
    if (!event) {
      throw new Error("Browsing event not found");
    }
    if (event.userId !== user._id) {
      throw new Error("Unauthorized: Event belongs to another user");
    }

    // Check if embedding already exists for this event
    const existing = await ctx.db
      .query("contentEmbeddings")
      .withIndex("by_eventId", (q) => q.eq("eventId", args.eventId))
      .first();

    if (existing) {
      // Update existing embedding
      await ctx.db.patch(existing._id, {
        embedding: args.embedding,
        contentType: args.contentType,
        confidence: args.confidence,
        namespace: args.namespace,
        metadata: args.metadata,
      });
      return existing._id;
    }

    // Create new embedding
    const embeddingId = await ctx.db.insert("contentEmbeddings", {
      userId: user._id,
      eventId: args.eventId,
      embedding: args.embedding,
      contentType: args.contentType,
      confidence: args.confidence,
      namespace: args.namespace,
      createdAt: Date.now(),
      metadata: args.metadata,
    });

    return embeddingId;
  },
});

// Store voice embedding for a voice session
export const storeVoiceEmbedding = mutation({
  args: {
    clerkId: v.string(),
    sessionId: v.id("voiceSessions"),
    embedding: v.array(v.float64()),
    intentType: intentTypes,
    emotionalTrajectory: v.array(
      v.object({
        timestamp: v.number(),
        tone: emotionalTones,
        intensity: v.number(),
      })
    ),
    confidence: v.number(),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx, args.clerkId);

    // Verify the session belongs to this user
    const session = await ctx.db.get(args.sessionId);
    if (!session) {
      throw new Error("Voice session not found");
    }
    if (session.userId !== user._id) {
      throw new Error("Unauthorized: Session belongs to another user");
    }

    const embeddingId = await ctx.db.insert("voiceEmbeddings", {
      userId: user._id,
      sessionId: args.sessionId,
      embedding: args.embedding,
      intentType: args.intentType,
      emotionalTrajectory: args.emotionalTrajectory,
      confidence: args.confidence,
      createdAt: Date.now(),
    });

    return embeddingId;
  },
});

// Vector search for similar content
export const searchSimilarContent = query({
  args: {
    clerkId: v.string(),
    embedding: v.array(v.float64()),
    limit: v.optional(v.number()),
    namespace: v.optional(v.string()),
    contentType: v.optional(contentTypes),
    minConfidence: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", args.clerkId))
      .unique();

    if (!user) {
      return [];
    }

    const limit = args.limit ?? 10;

    // Build filter for vector search
    const filter: Record<string, unknown> = {
      userId: user._id,
    };

    if (args.namespace) {
      filter.namespace = args.namespace;
    }

    if (args.contentType) {
      filter.contentType = args.contentType;
    }

    // Perform vector search
    const results = await ctx.db
      .query("contentEmbeddings")
      .withIndex("by_embedding", (q) => q.eq("userId", user._id))
      .collect();

    // Calculate cosine similarity manually for now
    // In production, use the vectorSearch method
    const scoredResults = results.map((result) => {
      const similarity = cosineSimilarity(args.embedding, result.embedding);
      return { ...result, similarity };
    });

    // Filter by confidence if specified
    let filteredResults = scoredResults;
    if (args.minConfidence) {
      filteredResults = filteredResults.filter(
        (r) => r.confidence >= args.minConfidence!
      );
    }

    // Sort by similarity and take top results
    filteredResults.sort((a, b) => b.similarity - a.similarity);
    const topResults = filteredResults.slice(0, limit);

    // Fetch associated events
    const enrichedResults = await Promise.all(
      topResults.map(async (result) => {
        const event = await ctx.db.get(result.eventId);
        return {
          embeddingId: result._id,
          eventId: result.eventId,
          similarity: result.similarity,
          confidence: result.confidence,
          contentType: result.contentType,
          namespace: result.namespace,
          metadata: result.metadata,
          event: event
            ? {
                url: event.url,
                category: event.category,
                title: event.metadata?.title,
                timestamp: event.timestamp,
              }
            : null,
        };
      })
    );

    return enrichedResults;
  },
});

// Vector search for similar voice patterns
export const searchSimilarVoice = query({
  args: {
    clerkId: v.string(),
    embedding: v.array(v.float64()),
    limit: v.optional(v.number()),
    intentType: v.optional(intentTypes),
    minConfidence: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", args.clerkId))
      .unique();

    if (!user) {
      return [];
    }

    const limit = args.limit ?? 10;

    const results = await ctx.db
      .query("voiceEmbeddings")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .collect();

    // Calculate similarity
    const scoredResults = results.map((result) => {
      const similarity = cosineSimilarity(args.embedding, result.embedding);
      return { ...result, similarity };
    });

    // Apply filters
    let filteredResults = scoredResults;

    if (args.intentType) {
      filteredResults = filteredResults.filter(
        (r) => r.intentType === args.intentType
      );
    }

    if (args.minConfidence) {
      filteredResults = filteredResults.filter(
        (r) => r.confidence >= args.minConfidence!
      );
    }

    // Sort and limit
    filteredResults.sort((a, b) => b.similarity - a.similarity);
    const topResults = filteredResults.slice(0, limit);

    // Fetch associated sessions
    const enrichedResults = await Promise.all(
      topResults.map(async (result) => {
        const session = await ctx.db.get(result.sessionId);
        return {
          embeddingId: result._id,
          sessionId: result.sessionId,
          similarity: result.similarity,
          confidence: result.confidence,
          intentType: result.intentType,
          emotionalTrajectory: result.emotionalTrajectory,
          session: session
            ? {
                startTime: session.startTime,
                endTime: session.endTime,
                transcription: session.transcription?.substring(0, 100),
                emotionalTone: session.emotionalTone,
              }
            : null,
        };
      })
    );

    return enrichedResults;
  },
});

// Get content embedding by event ID
export const getContentEmbedding = query({
  args: {
    clerkId: v.string(),
    eventId: v.id("browsingEvents"),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", args.clerkId))
      .unique();

    if (!user) {
      return null;
    }

    const embedding = await ctx.db
      .query("contentEmbeddings")
      .withIndex("by_eventId", (q) => q.eq("eventId", args.eventId))
      .first();

    if (!embedding || embedding.userId !== user._id) {
      return null;
    }

    return embedding;
  },
});

// Get embeddings by namespace
export const getEmbeddingsByNamespace = query({
  args: {
    clerkId: v.string(),
    namespace: v.string(),
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

    const embeddings = await ctx.db
      .query("contentEmbeddings")
      .withIndex("by_userId_namespace", (q) =>
        q.eq("userId", user._id).eq("namespace", args.namespace)
      )
      .order("desc")
      .take(args.limit ?? 100);

    return embeddings;
  },
});

// Delete embedding
export const deleteEmbedding = mutation({
  args: {
    clerkId: v.string(),
    embeddingId: v.id("contentEmbeddings"),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx, args.clerkId);

    const embedding = await ctx.db.get(args.embeddingId);
    if (!embedding) {
      throw new Error("Embedding not found");
    }

    if (embedding.userId !== user._id) {
      throw new Error("Unauthorized");
    }

    await ctx.db.delete(args.embeddingId);

    return { success: true };
  },
});

// Delete all embeddings in a namespace
export const deleteEmbeddingsByNamespace = mutation({
  args: {
    clerkId: v.string(),
    namespace: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx, args.clerkId);

    const embeddings = await ctx.db
      .query("contentEmbeddings")
      .withIndex("by_userId_namespace", (q) =>
        q.eq("userId", user._id).eq("namespace", args.namespace)
      )
      .collect();

    for (const embedding of embeddings) {
      await ctx.db.delete(embedding._id);
    }

    // Log deletion
    await ctx.db.insert("auditLogs", {
      userId: user._id,
      action: "embeddings.namespace_deleted",
      details: {
        resourceType: "contentEmbeddings",
        newValue: { namespace: args.namespace, count: embeddings.length },
        success: true,
      },
      timestamp: Date.now(),
    });

    return { deletedCount: embeddings.length };
  },
});

// Get embedding statistics
export const getEmbeddingStats = query({
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

    const contentEmbeddings = await ctx.db
      .query("contentEmbeddings")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .collect();

    const voiceEmbeddings = await ctx.db
      .query("voiceEmbeddings")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .collect();

    // Calculate namespace distribution
    const namespaceDistribution: Record<string, number> = {};
    for (const e of contentEmbeddings) {
      namespaceDistribution[e.namespace] =
        (namespaceDistribution[e.namespace] ?? 0) + 1;
    }

    // Calculate content type distribution
    const contentTypeDistribution: Record<string, number> = {};
    for (const e of contentEmbeddings) {
      contentTypeDistribution[e.contentType] =
        (contentTypeDistribution[e.contentType] ?? 0) + 1;
    }

    // Calculate intent type distribution for voice
    const intentTypeDistribution: Record<string, number> = {};
    for (const e of voiceEmbeddings) {
      intentTypeDistribution[e.intentType] =
        (intentTypeDistribution[e.intentType] ?? 0) + 1;
    }

    // Average confidence scores
    const avgContentConfidence =
      contentEmbeddings.length > 0
        ? contentEmbeddings.reduce((sum, e) => sum + e.confidence, 0) /
          contentEmbeddings.length
        : 0;

    const avgVoiceConfidence =
      voiceEmbeddings.length > 0
        ? voiceEmbeddings.reduce((sum, e) => sum + e.confidence, 0) /
          voiceEmbeddings.length
        : 0;

    return {
      totalContentEmbeddings: contentEmbeddings.length,
      totalVoiceEmbeddings: voiceEmbeddings.length,
      namespaceDistribution,
      contentTypeDistribution,
      intentTypeDistribution,
      averageContentConfidence: avgContentConfidence,
      averageVoiceConfidence: avgVoiceConfidence,
    };
  },
});

// Batch store embeddings
export const storeContentEmbeddingsBatch = mutation({
  args: {
    clerkId: v.string(),
    embeddings: v.array(
      v.object({
        eventId: v.id("browsingEvents"),
        embedding: v.array(v.float64()),
        contentType: contentTypes,
        confidence: v.number(),
        namespace: v.string(),
        metadata: v.optional(
          v.object({
            extractedTopics: v.optional(v.array(v.string())),
            sentiment: v.optional(v.number()),
            readabilityScore: v.optional(v.number()),
          })
        ),
      })
    ),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx, args.clerkId);

    const storedIds: Id<"contentEmbeddings">[] = [];

    for (const embeddingData of args.embeddings) {
      // Verify event ownership
      const event = await ctx.db.get(embeddingData.eventId);
      if (!event || event.userId !== user._id) {
        continue; // Skip invalid/unauthorized events
      }

      // Check for existing
      const existing = await ctx.db
        .query("contentEmbeddings")
        .withIndex("by_eventId", (q) => q.eq("eventId", embeddingData.eventId))
        .first();

      if (existing) {
        await ctx.db.patch(existing._id, {
          embedding: embeddingData.embedding,
          contentType: embeddingData.contentType,
          confidence: embeddingData.confidence,
          namespace: embeddingData.namespace,
          metadata: embeddingData.metadata,
        });
        storedIds.push(existing._id);
      } else {
        const id = await ctx.db.insert("contentEmbeddings", {
          userId: user._id,
          eventId: embeddingData.eventId,
          embedding: embeddingData.embedding,
          contentType: embeddingData.contentType,
          confidence: embeddingData.confidence,
          namespace: embeddingData.namespace,
          createdAt: Date.now(),
          metadata: embeddingData.metadata,
        });
        storedIds.push(id);
      }
    }

    return { stored: storedIds.length, ids: storedIds };
  },
});

// Helper function: Cosine similarity
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    return 0;
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

// Internal mutation for generating embeddings (to be called from actions)
export const internalStoreEmbedding = mutation({
  args: {
    userId: v.id("users"),
    eventId: v.id("browsingEvents"),
    embedding: v.array(v.float64()),
    contentType: contentTypes,
    confidence: v.number(),
    namespace: v.string(),
    metadata: v.optional(
      v.object({
        extractedTopics: v.optional(v.array(v.string())),
        sentiment: v.optional(v.number()),
        readabilityScore: v.optional(v.number()),
      })
    ),
  },
  handler: async (ctx, args) => {
    // Check for existing
    const existing = await ctx.db
      .query("contentEmbeddings")
      .withIndex("by_eventId", (q) => q.eq("eventId", args.eventId))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        embedding: args.embedding,
        contentType: args.contentType,
        confidence: args.confidence,
        namespace: args.namespace,
        metadata: args.metadata,
      });
      return existing._id;
    }

    return await ctx.db.insert("contentEmbeddings", {
      userId: args.userId,
      eventId: args.eventId,
      embedding: args.embedding,
      contentType: args.contentType,
      confidence: args.confidence,
      namespace: args.namespace,
      createdAt: Date.now(),
      metadata: args.metadata,
    });
  },
});
