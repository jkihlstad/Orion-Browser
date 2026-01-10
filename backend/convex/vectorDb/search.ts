/**
 * Similarity Search for Orion Browser Vector Database
 *
 * Provides advanced similarity search capabilities including:
 * - Cosine similarity search
 * - Confidence-weighted results
 * - Time decay weighting
 * - Multi-namespace search
 * - Semantic filtering
 *
 * @module vectorDb/search
 */

import { v } from "convex/values";
import { action, internalQuery } from "../_generated/server";
import { internal } from "../_generated/api";
import { VectorNamespace, NAMESPACE_CONFIG, canAccessNamespace } from "./namespaces";
import { cosineSimilarity, normalizeVector } from "./index";
import { ConsentLevel } from "../types/consent";

// ============================================================================
// Types
// ============================================================================

/**
 * Search result with similarity score
 */
export interface SearchResult {
  /** Vector ID */
  id: string;
  /** Similarity score (0-1) */
  similarity: number;
  /** Confidence score (0-1) */
  confidence: number;
  /** Combined weighted score */
  weightedScore: number;
  /** Original content */
  content: string;
  /** Metadata */
  metadata: {
    source: string;
    contentType: string;
    domain: string;
    title?: string;
    summary?: string;
    tags: string[];
    language: string;
  };
  /** Timestamps */
  timestamps: {
    createdAt: number;
    lastAccessedAt: number;
  };
  /** Access count */
  accessCount: number;
  /** Namespace */
  namespace: VectorNamespace;
}

/**
 * Search options
 */
export interface SearchOptions {
  /** Number of results to return */
  limit?: number;
  /** Minimum similarity threshold (0-1) */
  minSimilarity?: number;
  /** Minimum confidence threshold (0-1) */
  minConfidence?: number;
  /** Apply time decay weighting */
  applyTimeDecay?: boolean;
  /** Time decay half-life in days */
  timeDecayHalfLifeDays?: number;
  /** Weight for similarity score (default 0.6) */
  similarityWeight?: number;
  /** Weight for confidence score (default 0.3) */
  confidenceWeight?: number;
  /** Weight for recency (default 0.1) */
  recencyWeight?: number;
  /** Filter by content types */
  contentTypes?: string[];
  /** Filter by domains */
  domains?: string[];
  /** Filter by tags (any match) */
  tags?: string[];
  /** Filter by language */
  language?: string;
  /** Exclude specific vector IDs */
  excludeIds?: string[];
  /** Boost results from specific domains */
  domainBoosts?: Record<string, number>;
}

/**
 * Search request
 */
export interface SearchRequest {
  /** User ID */
  userId: string;
  /** User's consent level */
  consentLevel: ConsentLevel;
  /** Query embedding vector */
  queryEmbedding: number[];
  /** Namespaces to search */
  namespaces: VectorNamespace[];
  /** Search options */
  options?: SearchOptions;
}

/**
 * Search response
 */
export interface SearchResponse {
  /** Search results */
  results: SearchResult[];
  /** Total matches before limit */
  totalMatches: number;
  /** Search duration in ms */
  searchDurationMs: number;
  /** Namespaces searched */
  namespacesSearched: VectorNamespace[];
  /** Namespaces excluded (due to consent) */
  namespacesExcluded: VectorNamespace[];
}

// ============================================================================
// Constants
// ============================================================================

/** Default search options */
const DEFAULT_OPTIONS: Required<SearchOptions> = {
  limit: 20,
  minSimilarity: 0.5,
  minConfidence: 0.0,
  applyTimeDecay: true,
  timeDecayHalfLifeDays: 30,
  similarityWeight: 0.6,
  confidenceWeight: 0.3,
  recencyWeight: 0.1,
  contentTypes: [],
  domains: [],
  tags: [],
  language: "",
  excludeIds: [],
  domainBoosts: {},
};

/** Maximum results per search */
const MAX_RESULTS = 100;

/** Maximum namespaces per search */
const MAX_NAMESPACES = 5;

// ============================================================================
// Main Search Function
// ============================================================================

/**
 * Performs similarity search across vector namespaces
 */
export const similaritySearch = action({
  args: {
    userId: v.string(),
    consentLevel: v.number(),
    queryEmbedding: v.array(v.number()),
    namespaces: v.array(v.string()),
    options: v.optional(
      v.object({
        limit: v.optional(v.number()),
        minSimilarity: v.optional(v.number()),
        minConfidence: v.optional(v.number()),
        applyTimeDecay: v.optional(v.boolean()),
        timeDecayHalfLifeDays: v.optional(v.number()),
        similarityWeight: v.optional(v.number()),
        confidenceWeight: v.optional(v.number()),
        recencyWeight: v.optional(v.number()),
        contentTypes: v.optional(v.array(v.string())),
        domains: v.optional(v.array(v.string())),
        tags: v.optional(v.array(v.string())),
        language: v.optional(v.string()),
        excludeIds: v.optional(v.array(v.string())),
        domainBoosts: v.optional(v.any()),
      })
    ),
  },
  handler: async (ctx, args): Promise<SearchResponse> => {
    const startTime = Date.now();
    const options = { ...DEFAULT_OPTIONS, ...args.options };
    const consentLevel = args.consentLevel as ConsentLevel;

    // Validate and filter namespaces
    const namespacesToSearch: VectorNamespace[] = [];
    const namespacesExcluded: VectorNamespace[] = [];

    for (const ns of args.namespaces.slice(0, MAX_NAMESPACES)) {
      const namespace = ns as VectorNamespace;
      const access = canAccessNamespace(namespace, consentLevel);
      if (access.allowed) {
        namespacesToSearch.push(namespace);
      } else {
        namespacesExcluded.push(namespace);
      }
    }

    if (namespacesToSearch.length === 0) {
      return {
        results: [],
        totalMatches: 0,
        searchDurationMs: Date.now() - startTime,
        namespacesSearched: [],
        namespacesExcluded,
      };
    }

    // Normalize query embedding
    const normalizedQuery = normalizeVector(args.queryEmbedding);

    // Gather vectors from all namespaces
    const allResults: SearchResult[] = [];

    for (const namespace of namespacesToSearch) {
      const vectors = await ctx.runQuery(internal.vectorDb.index.getVectorsForSearch, {
        userId: args.userId,
        namespace,
        minConfidence: options.minConfidence,
        limit: 1000, // Get more for filtering
      });

      for (const vector of vectors) {
        // Skip excluded IDs
        if (options.excludeIds.includes(vector._id)) {
          continue;
        }

        // Apply content type filter
        if (
          options.contentTypes.length > 0 &&
          !options.contentTypes.includes(vector.metadata.contentType)
        ) {
          continue;
        }

        // Apply domain filter
        if (
          options.domains.length > 0 &&
          !options.domains.includes(vector.metadata.domain)
        ) {
          continue;
        }

        // Apply tag filter (any match)
        if (
          options.tags.length > 0 &&
          !options.tags.some((tag) => vector.metadata.tags.includes(tag))
        ) {
          continue;
        }

        // Apply language filter
        if (
          options.language &&
          vector.metadata.language !== options.language
        ) {
          continue;
        }

        // Calculate similarity
        const normalizedVector = normalizeVector(vector.embedding);
        const similarity = cosineSimilarity(normalizedQuery, normalizedVector);

        // Apply minimum similarity threshold
        if (similarity < options.minSimilarity) {
          continue;
        }

        // Calculate weighted score
        const weightedScore = calculateWeightedScore(
          similarity,
          vector.confidence,
          vector.lastAccessedAt,
          options,
          vector.metadata.domain
        );

        allResults.push({
          id: vector._id,
          similarity,
          confidence: vector.confidence,
          weightedScore,
          content: vector.content,
          metadata: {
            source: vector.metadata.source,
            contentType: vector.metadata.contentType,
            domain: vector.metadata.domain,
            title: vector.metadata.title,
            summary: vector.metadata.summary,
            tags: vector.metadata.tags,
            language: vector.metadata.language,
          },
          timestamps: {
            createdAt: vector.createdAt,
            lastAccessedAt: vector.lastAccessedAt,
          },
          accessCount: vector.accessCount,
          namespace,
        });
      }
    }

    // Sort by weighted score
    allResults.sort((a, b) => b.weightedScore - a.weightedScore);

    // Apply limit
    const limitedResults = allResults.slice(
      0,
      Math.min(options.limit, MAX_RESULTS)
    );

    return {
      results: limitedResults,
      totalMatches: allResults.length,
      searchDurationMs: Date.now() - startTime,
      namespacesSearched: namespacesToSearch,
      namespacesExcluded,
    };
  },
});

/**
 * Finds related vectors to a given vector
 */
export const findRelated = action({
  args: {
    userId: v.string(),
    consentLevel: v.number(),
    vectorId: v.id("vectors"),
    limit: v.optional(v.number()),
    minSimilarity: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<SearchResult[]> => {
    const limit = args.limit ?? 10;
    const minSimilarity = args.minSimilarity ?? 0.7;

    // Get the source vector
    const sourceVector = await ctx.runQuery(internal.vectorDb.search.getVectorById, {
      id: args.vectorId,
    });

    if (!sourceVector) {
      return [];
    }

    // Search in the same namespace
    const response = await similaritySearch(ctx, {
      userId: args.userId,
      consentLevel: args.consentLevel,
      queryEmbedding: sourceVector.embedding,
      namespaces: [sourceVector.namespace],
      options: {
        limit: limit + 1, // +1 to account for source vector
        minSimilarity,
        excludeIds: [args.vectorId],
      },
    });

    return response.results;
  },
});

/**
 * Semantic cluster search - finds vectors clustered around multiple queries
 */
export const clusterSearch = action({
  args: {
    userId: v.string(),
    consentLevel: v.number(),
    queryEmbeddings: v.array(v.array(v.number())),
    namespaces: v.array(v.string()),
    limit: v.optional(v.number()),
    minSimilarity: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<SearchResponse> => {
    const startTime = Date.now();
    const limit = args.limit ?? 20;

    // Perform search for each query embedding
    const allResults = new Map<string, SearchResult>();

    for (const embedding of args.queryEmbeddings) {
      const response = await similaritySearch(ctx, {
        userId: args.userId,
        consentLevel: args.consentLevel,
        queryEmbedding: embedding,
        namespaces: args.namespaces,
        options: {
          limit: limit * 2,
          minSimilarity: args.minSimilarity,
        },
      });

      for (const result of response.results) {
        const existing = allResults.get(result.id);
        if (existing) {
          // Boost score for results matching multiple queries
          existing.weightedScore += result.weightedScore * 0.5;
        } else {
          allResults.set(result.id, result);
        }
      }
    }

    // Sort and limit
    const sortedResults = Array.from(allResults.values())
      .sort((a, b) => b.weightedScore - a.weightedScore)
      .slice(0, limit);

    return {
      results: sortedResults,
      totalMatches: allResults.size,
      searchDurationMs: Date.now() - startTime,
      namespacesSearched: args.namespaces as VectorNamespace[],
      namespacesExcluded: [],
    };
  },
});

// ============================================================================
// Internal Queries
// ============================================================================

/**
 * Gets a vector by ID (internal)
 */
export const getVectorById = internalQuery({
  args: {
    id: v.id("vectors"),
  },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

// ============================================================================
// Scoring Functions
// ============================================================================

/**
 * Calculates the weighted score for a search result
 */
function calculateWeightedScore(
  similarity: number,
  confidence: number,
  lastAccessedAt: number,
  options: Required<SearchOptions>,
  domain: string
): number {
  // Base components
  let score =
    similarity * options.similarityWeight +
    confidence * options.confidenceWeight;

  // Add recency component
  if (options.applyTimeDecay) {
    const recencyScore = calculateRecencyScore(
      lastAccessedAt,
      options.timeDecayHalfLifeDays
    );
    score += recencyScore * options.recencyWeight;
  }

  // Apply domain boost
  const domainBoost = options.domainBoosts[domain];
  if (domainBoost) {
    score *= 1 + domainBoost;
  }

  // Normalize to 0-1 range
  return Math.min(1, Math.max(0, score));
}

/**
 * Calculates a recency score based on time decay
 */
function calculateRecencyScore(
  lastAccessedAt: number,
  halfLifeDays: number
): number {
  const now = Date.now();
  const ageMs = now - lastAccessedAt;
  const ageDays = ageMs / (1000 * 60 * 60 * 24);

  // Exponential decay: score = 0.5^(age/halfLife)
  return Math.pow(0.5, ageDays / halfLifeDays);
}

/**
 * Calculates confidence-adjusted similarity
 *
 * This weights similarity by confidence to favor
 * results that are both similar AND have high confidence.
 */
export function confidenceAdjustedSimilarity(
  similarity: number,
  confidence: number,
  confidenceWeight: number = 0.3
): number {
  // Blend similarity with confidence
  // High confidence boosts similarity, low confidence dampens it
  const confidenceMultiplier = 0.5 + confidence * 0.5; // Range: 0.5 to 1.0
  const blendedScore =
    similarity * (1 - confidenceWeight) +
    similarity * confidenceMultiplier * confidenceWeight;

  return Math.min(1, Math.max(0, blendedScore));
}

/**
 * Calculates diversity score to penalize similar results
 *
 * Used for result re-ranking to improve diversity.
 */
export function diversityPenalty(
  candidateEmbedding: number[],
  selectedEmbeddings: number[][],
  penaltyStrength: number = 0.5
): number {
  if (selectedEmbeddings.length === 0) {
    return 1.0; // No penalty for first result
  }

  // Calculate max similarity to already selected results
  let maxSimilarity = 0;
  for (const selected of selectedEmbeddings) {
    const sim = cosineSimilarity(candidateEmbedding, selected);
    maxSimilarity = Math.max(maxSimilarity, sim);
  }

  // Apply penalty based on similarity to existing results
  // penaltyStrength controls how much to penalize similar results
  return 1 - maxSimilarity * penaltyStrength;
}

/**
 * Re-ranks results for diversity using MMR (Maximal Marginal Relevance)
 */
export function mmrRerank(
  results: SearchResult[],
  embeddings: Map<string, number[]>,
  lambda: number = 0.5,
  limit: number = 10
): SearchResult[] {
  if (results.length === 0) {
    return [];
  }

  const selected: SearchResult[] = [];
  const remaining = [...results];
  const selectedEmbeddings: number[][] = [];

  while (selected.length < limit && remaining.length > 0) {
    let bestIdx = 0;
    let bestScore = -Infinity;

    for (let i = 0; i < remaining.length; i++) {
      const result = remaining[i];
      const embedding = embeddings.get(result.id);
      if (!embedding) continue;

      // MMR score = lambda * similarity - (1-lambda) * max_sim_to_selected
      const relevance = result.weightedScore;
      const diversity = diversityPenalty(embedding, selectedEmbeddings, 1.0);

      const mmrScore = lambda * relevance + (1 - lambda) * diversity;

      if (mmrScore > bestScore) {
        bestScore = mmrScore;
        bestIdx = i;
      }
    }

    const chosen = remaining.splice(bestIdx, 1)[0];
    selected.push(chosen);

    const chosenEmbedding = embeddings.get(chosen.id);
    if (chosenEmbedding) {
      selectedEmbeddings.push(chosenEmbedding);
    }
  }

  return selected;
}

// ============================================================================
// Search Utilities
// ============================================================================

/**
 * Normalizes search options with defaults
 */
export function normalizeSearchOptions(
  options?: Partial<SearchOptions>
): Required<SearchOptions> {
  return { ...DEFAULT_OPTIONS, ...options };
}

/**
 * Validates search options
 */
export function validateSearchOptions(
  options: SearchOptions
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (options.limit !== undefined) {
    if (options.limit < 1) {
      errors.push("limit must be at least 1");
    }
    if (options.limit > MAX_RESULTS) {
      errors.push(`limit cannot exceed ${MAX_RESULTS}`);
    }
  }

  if (options.minSimilarity !== undefined) {
    if (options.minSimilarity < 0 || options.minSimilarity > 1) {
      errors.push("minSimilarity must be between 0 and 1");
    }
  }

  if (options.minConfidence !== undefined) {
    if (options.minConfidence < 0 || options.minConfidence > 1) {
      errors.push("minConfidence must be between 0 and 1");
    }
  }

  // Check weights sum to approximately 1
  const weights =
    (options.similarityWeight ?? DEFAULT_OPTIONS.similarityWeight) +
    (options.confidenceWeight ?? DEFAULT_OPTIONS.confidenceWeight) +
    (options.recencyWeight ?? DEFAULT_OPTIONS.recencyWeight);

  if (Math.abs(weights - 1.0) > 0.01) {
    errors.push(
      "similarityWeight + confidenceWeight + recencyWeight should sum to 1.0"
    );
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Builds a search query string for logging/debugging
 */
export function buildSearchQueryString(request: SearchRequest): string {
  const parts = [
    `user=${request.userId}`,
    `namespaces=${request.namespaces.join(",")}`,
    `consent=${request.consentLevel}`,
  ];

  if (request.options?.limit) {
    parts.push(`limit=${request.options.limit}`);
  }
  if (request.options?.minSimilarity) {
    parts.push(`minSim=${request.options.minSimilarity}`);
  }

  return parts.join("&");
}
