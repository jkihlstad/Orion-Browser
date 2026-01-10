/**
 * Time-Aware Embedding Management for Orion Browser
 *
 * Provides temporal intelligence for vector embeddings:
 * - Time-weighted similarity calculations
 * - Temporal clustering and patterns
 * - Session-based grouping
 * - Trend detection
 * - Time-based filtering
 *
 * @module vectorDb/timeAware
 */

import { v } from "convex/values";
import { action, internalQuery } from "../_generated/server";
import { internal } from "../_generated/api";
import { VectorNamespace } from "./namespaces";
import { cosineSimilarity, normalizeVector } from "./index";
import { ConsentLevel } from "../types/consent";

// ============================================================================
// Types
// ============================================================================

/**
 * Time period for analysis
 */
export type TimePeriod =
  | "hour"
  | "day"
  | "week"
  | "month"
  | "quarter"
  | "year"
  | "all";

/**
 * Time-weighted search result
 */
export interface TimeWeightedResult {
  /** Vector ID */
  id: string;
  /** Base similarity score */
  baseSimilarity: number;
  /** Time-adjusted similarity */
  timeWeightedSimilarity: number;
  /** Temporal relevance score */
  temporalRelevance: number;
  /** Content */
  content: string;
  /** Timestamps */
  timestamps: {
    createdAt: number;
    lastAccessedAt: number;
    ageInDays: number;
  };
  /** Temporal context */
  temporalContext: {
    timeOfDay: "morning" | "afternoon" | "evening" | "night";
    dayOfWeek: string;
    isWeekend: boolean;
    session?: string;
  };
}

/**
 * Temporal pattern
 */
export interface TemporalPattern {
  /** Pattern type */
  type: "recurring" | "trend" | "burst" | "decay";
  /** Pattern strength (0-1) */
  strength: number;
  /** Time period */
  period: TimePeriod;
  /** Related vector IDs */
  vectorIds: string[];
  /** Peak times */
  peakTimes: {
    hourOfDay: number[];
    dayOfWeek: number[];
  };
  /** Pattern description */
  description: string;
}

/**
 * Session grouping
 */
export interface SessionGroup {
  /** Session identifier */
  sessionId: string;
  /** Session start time */
  startTime: number;
  /** Session end time */
  endTime: number;
  /** Duration in minutes */
  durationMinutes: number;
  /** Vectors in this session */
  vectors: Array<{
    id: string;
    content: string;
    timestamp: number;
  }>;
  /** Session theme (based on content analysis) */
  theme?: string;
  /** Average similarity within session */
  internalCoherence: number;
}

/**
 * Time series data point
 */
export interface TimeSeriesPoint {
  /** Timestamp */
  timestamp: number;
  /** Count of vectors */
  count: number;
  /** Average confidence */
  avgConfidence: number;
  /** Dominant topics */
  topics: string[];
}

/**
 * Trend analysis result
 */
export interface TrendAnalysis {
  /** Trend direction */
  direction: "increasing" | "decreasing" | "stable" | "volatile";
  /** Trend strength (0-1) */
  strength: number;
  /** Time series data */
  timeSeries: TimeSeriesPoint[];
  /** Emerging topics */
  emergingTopics: string[];
  /** Declining topics */
  decliningTopics: string[];
}

// ============================================================================
// Constants
// ============================================================================

/** Session gap threshold in minutes */
const SESSION_GAP_MINUTES = 30;

/** Time periods in milliseconds */
const TIME_PERIODS_MS: Record<TimePeriod, number> = {
  hour: 60 * 60 * 1000,
  day: 24 * 60 * 60 * 1000,
  week: 7 * 24 * 60 * 60 * 1000,
  month: 30 * 24 * 60 * 60 * 1000,
  quarter: 90 * 24 * 60 * 60 * 1000,
  year: 365 * 24 * 60 * 60 * 1000,
  all: Infinity,
};

// ============================================================================
// Time-Weighted Search
// ============================================================================

/**
 * Performs time-weighted similarity search
 */
export const timeWeightedSearch = action({
  args: {
    userId: v.string(),
    consentLevel: v.number(),
    queryEmbedding: v.array(v.number()),
    namespaces: v.array(v.string()),
    options: v.optional(
      v.object({
        limit: v.optional(v.number()),
        minSimilarity: v.optional(v.number()),
        timePeriod: v.optional(v.string()),
        recencyBias: v.optional(v.number()), // 0-1, higher = prefer recent
        timeOfDayBias: v.optional(v.boolean()), // Prefer same time of day
        dayOfWeekBias: v.optional(v.boolean()), // Prefer same day of week
      })
    ),
  },
  handler: async (ctx, args): Promise<TimeWeightedResult[]> => {
    const options = {
      limit: args.options?.limit ?? 20,
      minSimilarity: args.options?.minSimilarity ?? 0.5,
      timePeriod: (args.options?.timePeriod as TimePeriod) ?? "month",
      recencyBias: args.options?.recencyBias ?? 0.3,
      timeOfDayBias: args.options?.timeOfDayBias ?? false,
      dayOfWeekBias: args.options?.dayOfWeekBias ?? false,
    };

    const now = Date.now();
    const currentHour = new Date(now).getHours();
    const currentDay = new Date(now).getDay();

    // Calculate time cutoff
    const timeCutoff =
      options.timePeriod === "all"
        ? 0
        : now - TIME_PERIODS_MS[options.timePeriod];

    const normalizedQuery = normalizeVector(args.queryEmbedding);
    const results: TimeWeightedResult[] = [];

    for (const namespace of args.namespaces) {
      const vectors = await ctx.runQuery(internal.vectorDb.timeAware.getVectorsInTimeRange, {
        userId: args.userId,
        namespace,
        startTime: timeCutoff,
        endTime: now,
      });

      for (const vector of vectors) {
        const normalizedVector = normalizeVector(vector.embedding);
        const baseSimilarity = cosineSimilarity(normalizedQuery, normalizedVector);

        if (baseSimilarity < options.minSimilarity) {
          continue;
        }

        // Calculate temporal relevance factors
        const ageInDays = (now - vector.createdAt) / (1000 * 60 * 60 * 24);
        const recencyScore = calculateRecencyScore(
          vector.lastAccessedAt,
          options.timePeriod
        );

        // Time of day similarity
        let timeOfDayScore = 1;
        if (options.timeOfDayBias) {
          const vectorHour = new Date(vector.createdAt).getHours();
          const hourDiff = Math.abs(currentHour - vectorHour);
          const normalizedHourDiff = Math.min(hourDiff, 24 - hourDiff) / 12;
          timeOfDayScore = 1 - normalizedHourDiff * 0.5;
        }

        // Day of week similarity
        let dayOfWeekScore = 1;
        if (options.dayOfWeekBias) {
          const vectorDay = new Date(vector.createdAt).getDay();
          if (vectorDay === currentDay) {
            dayOfWeekScore = 1.2;
          } else if (
            (currentDay <= 5 && vectorDay <= 5) ||
            (currentDay > 5 && vectorDay > 5)
          ) {
            dayOfWeekScore = 1.1; // Same weekday/weekend type
          }
        }

        // Calculate temporal relevance
        const temporalRelevance =
          recencyScore * 0.5 + timeOfDayScore * 0.25 + dayOfWeekScore * 0.25;

        // Blend base similarity with temporal factors
        const timeWeightedSimilarity =
          baseSimilarity * (1 - options.recencyBias) +
          baseSimilarity * temporalRelevance * options.recencyBias;

        results.push({
          id: vector._id,
          baseSimilarity,
          timeWeightedSimilarity,
          temporalRelevance,
          content: vector.content,
          timestamps: {
            createdAt: vector.createdAt,
            lastAccessedAt: vector.lastAccessedAt,
            ageInDays,
          },
          temporalContext: getTemporalContext(vector.createdAt),
        });
      }
    }

    // Sort by time-weighted similarity
    results.sort((a, b) => b.timeWeightedSimilarity - a.timeWeightedSimilarity);

    return results.slice(0, options.limit);
  },
});

/**
 * Gets vectors within a time range (internal)
 */
export const getVectorsInTimeRange = internalQuery({
  args: {
    userId: v.string(),
    namespace: v.string(),
    startTime: v.number(),
    endTime: v.number(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("vectors")
      .withIndex("by_user_namespace", (q) =>
        q.eq("userId", args.userId).eq("namespace", args.namespace)
      )
      .filter((q) =>
        q.and(
          q.gte(q.field("createdAt"), args.startTime),
          q.lte(q.field("createdAt"), args.endTime),
          q.eq(q.field("isMarkedForDeletion"), false)
        )
      )
      .collect();
  },
});

// ============================================================================
// Session Analysis
// ============================================================================

/**
 * Groups vectors into sessions based on temporal proximity
 */
export const identifySessions = action({
  args: {
    userId: v.string(),
    namespace: v.string(),
    timePeriod: v.optional(v.string()),
    sessionGapMinutes: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<SessionGroup[]> => {
    const timePeriod = (args.timePeriod as TimePeriod) ?? "week";
    const sessionGap = (args.sessionGapMinutes ?? SESSION_GAP_MINUTES) * 60 * 1000;

    const now = Date.now();
    const startTime =
      timePeriod === "all" ? 0 : now - TIME_PERIODS_MS[timePeriod];

    const vectors = await ctx.runQuery(internal.vectorDb.timeAware.getVectorsInTimeRange, {
      userId: args.userId,
      namespace: args.namespace,
      startTime,
      endTime: now,
    });

    if (vectors.length === 0) {
      return [];
    }

    // Sort by creation time
    const sorted = vectors.sort((a, b) => a.createdAt - b.createdAt);

    // Group into sessions
    const sessions: SessionGroup[] = [];
    let currentSession: typeof sorted = [sorted[0]];

    for (let i = 1; i < sorted.length; i++) {
      const gap = sorted[i].createdAt - sorted[i - 1].createdAt;

      if (gap > sessionGap) {
        // New session
        sessions.push(createSessionGroup(currentSession));
        currentSession = [sorted[i]];
      } else {
        currentSession.push(sorted[i]);
      }
    }

    // Don't forget the last session
    if (currentSession.length > 0) {
      sessions.push(createSessionGroup(currentSession));
    }

    return sessions;
  },
});

/**
 * Creates a session group from a list of vectors
 */
function createSessionGroup(vectors: any[]): SessionGroup {
  const startTime = vectors[0].createdAt;
  const endTime = vectors[vectors.length - 1].createdAt;
  const durationMinutes = (endTime - startTime) / (1000 * 60);

  // Calculate internal coherence (average pairwise similarity)
  let totalSimilarity = 0;
  let pairCount = 0;

  if (vectors.length > 1) {
    for (let i = 0; i < vectors.length; i++) {
      for (let j = i + 1; j < vectors.length; j++) {
        const sim = cosineSimilarity(
          normalizeVector(vectors[i].embedding),
          normalizeVector(vectors[j].embedding)
        );
        totalSimilarity += sim;
        pairCount++;
      }
    }
  }

  const internalCoherence = pairCount > 0 ? totalSimilarity / pairCount : 1;

  return {
    sessionId: `session_${startTime}`,
    startTime,
    endTime,
    durationMinutes,
    vectors: vectors.map((v) => ({
      id: v._id,
      content: v.content,
      timestamp: v.createdAt,
    })),
    internalCoherence,
  };
}

// ============================================================================
// Temporal Pattern Detection
// ============================================================================

/**
 * Detects temporal patterns in vector access
 */
export const detectTemporalPatterns = action({
  args: {
    userId: v.string(),
    namespace: v.string(),
    timePeriod: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<TemporalPattern[]> => {
    const timePeriod = (args.timePeriod as TimePeriod) ?? "month";
    const now = Date.now();
    const startTime =
      timePeriod === "all" ? 0 : now - TIME_PERIODS_MS[timePeriod];

    const vectors = await ctx.runQuery(internal.vectorDb.timeAware.getVectorsInTimeRange, {
      userId: args.userId,
      namespace: args.namespace,
      startTime,
      endTime: now,
    });

    if (vectors.length < 10) {
      return []; // Not enough data for pattern detection
    }

    const patterns: TemporalPattern[] = [];

    // Analyze hour-of-day distribution
    const hourCounts = new Array(24).fill(0);
    for (const vector of vectors) {
      const hour = new Date(vector.createdAt).getHours();
      hourCounts[hour]++;
    }

    const avgHourCount = vectors.length / 24;
    const peakHours = hourCounts
      .map((count, hour) => ({ hour, count }))
      .filter((h) => h.count > avgHourCount * 1.5)
      .map((h) => h.hour);

    if (peakHours.length > 0 && peakHours.length < 6) {
      patterns.push({
        type: "recurring",
        strength: Math.min(
          1,
          Math.max(...hourCounts) / (avgHourCount * 2)
        ),
        period: "day",
        vectorIds: [],
        peakTimes: {
          hourOfDay: peakHours,
          dayOfWeek: [],
        },
        description: `Peak activity at ${peakHours.map((h) => `${h}:00`).join(", ")}`,
      });
    }

    // Analyze day-of-week distribution
    const dayCounts = new Array(7).fill(0);
    for (const vector of vectors) {
      const day = new Date(vector.createdAt).getDay();
      dayCounts[day]++;
    }

    const avgDayCount = vectors.length / 7;
    const peakDays = dayCounts
      .map((count, day) => ({ day, count }))
      .filter((d) => d.count > avgDayCount * 1.3)
      .map((d) => d.day);

    if (peakDays.length > 0 && peakDays.length < 4) {
      const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
      patterns.push({
        type: "recurring",
        strength: Math.min(1, Math.max(...dayCounts) / (avgDayCount * 2)),
        period: "week",
        vectorIds: [],
        peakTimes: {
          hourOfDay: [],
          dayOfWeek: peakDays,
        },
        description: `Peak activity on ${peakDays.map((d) => dayNames[d]).join(", ")}`,
      });
    }

    // Detect trend (increasing or decreasing activity)
    const firstHalf = vectors.filter(
      (v) => v.createdAt < startTime + (now - startTime) / 2
    );
    const secondHalf = vectors.filter(
      (v) => v.createdAt >= startTime + (now - startTime) / 2
    );

    if (firstHalf.length > 0 && secondHalf.length > 0) {
      const ratio = secondHalf.length / firstHalf.length;

      if (ratio > 1.5) {
        patterns.push({
          type: "trend",
          strength: Math.min(1, (ratio - 1) / 2),
          period: timePeriod,
          vectorIds: [],
          peakTimes: { hourOfDay: [], dayOfWeek: [] },
          description: "Activity is increasing over time",
        });
      } else if (ratio < 0.67) {
        patterns.push({
          type: "decay",
          strength: Math.min(1, (1 / ratio - 1) / 2),
          period: timePeriod,
          vectorIds: [],
          peakTimes: { hourOfDay: [], dayOfWeek: [] },
          description: "Activity is decreasing over time",
        });
      }
    }

    return patterns;
  },
});

// ============================================================================
// Trend Analysis
// ============================================================================

/**
 * Analyzes trends in vector data over time
 */
export const analyzeTrends = action({
  args: {
    userId: v.string(),
    namespace: v.string(),
    granularity: v.optional(v.string()), // hour, day, week
    timePeriod: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<TrendAnalysis> => {
    const granularity = (args.granularity as "hour" | "day" | "week") ?? "day";
    const timePeriod = (args.timePeriod as TimePeriod) ?? "month";
    const now = Date.now();
    const startTime =
      timePeriod === "all" ? 0 : now - TIME_PERIODS_MS[timePeriod];

    const vectors = await ctx.runQuery(internal.vectorDb.timeAware.getVectorsInTimeRange, {
      userId: args.userId,
      namespace: args.namespace,
      startTime,
      endTime: now,
    });

    // Build time series
    const bucketSize = TIME_PERIODS_MS[granularity];
    const buckets = new Map<number, { vectors: any[]; confidence: number[] }>();

    for (const vector of vectors) {
      const bucketStart =
        Math.floor(vector.createdAt / bucketSize) * bucketSize;

      if (!buckets.has(bucketStart)) {
        buckets.set(bucketStart, { vectors: [], confidence: [] });
      }

      const bucket = buckets.get(bucketStart)!;
      bucket.vectors.push(vector);
      bucket.confidence.push(vector.confidence);
    }

    // Convert to time series
    const timeSeries: TimeSeriesPoint[] = Array.from(buckets.entries())
      .map(([timestamp, data]) => ({
        timestamp,
        count: data.vectors.length,
        avgConfidence:
          data.confidence.reduce((a, b) => a + b, 0) / data.confidence.length,
        topics: extractTopics(data.vectors),
      }))
      .sort((a, b) => a.timestamp - b.timestamp);

    // Analyze trend direction
    const counts = timeSeries.map((p) => p.count);
    const trendResult = analyzeTrendDirection(counts);

    // Find emerging and declining topics
    const halfPoint = Math.floor(timeSeries.length / 2);
    const firstHalfTopics = new Set(
      timeSeries.slice(0, halfPoint).flatMap((p) => p.topics)
    );
    const secondHalfTopics = new Set(
      timeSeries.slice(halfPoint).flatMap((p) => p.topics)
    );

    const emergingTopics = Array.from(secondHalfTopics).filter(
      (t) => !firstHalfTopics.has(t)
    );
    const decliningTopics = Array.from(firstHalfTopics).filter(
      (t) => !secondHalfTopics.has(t)
    );

    return {
      direction: trendResult.direction,
      strength: trendResult.strength,
      timeSeries,
      emergingTopics,
      decliningTopics,
    };
  },
});

// ============================================================================
// Time Filter Operations
// ============================================================================

/**
 * Filters vectors by various time criteria
 */
export const filterByTime = action({
  args: {
    userId: v.string(),
    namespace: v.string(),
    filters: v.object({
      after: v.optional(v.number()),
      before: v.optional(v.number()),
      hoursOfDay: v.optional(v.array(v.number())),
      daysOfWeek: v.optional(v.array(v.number())),
      excludeWeekends: v.optional(v.boolean()),
      excludeNights: v.optional(v.boolean()),
    }),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<any[]> => {
    const now = Date.now();
    const startTime = args.filters.after ?? 0;
    const endTime = args.filters.before ?? now;

    const vectors = await ctx.runQuery(internal.vectorDb.timeAware.getVectorsInTimeRange, {
      userId: args.userId,
      namespace: args.namespace,
      startTime,
      endTime,
    });

    let filtered = vectors;

    // Filter by hours of day
    if (args.filters.hoursOfDay && args.filters.hoursOfDay.length > 0) {
      const hours = new Set(args.filters.hoursOfDay);
      filtered = filtered.filter((v) =>
        hours.has(new Date(v.createdAt).getHours())
      );
    }

    // Filter by days of week
    if (args.filters.daysOfWeek && args.filters.daysOfWeek.length > 0) {
      const days = new Set(args.filters.daysOfWeek);
      filtered = filtered.filter((v) =>
        days.has(new Date(v.createdAt).getDay())
      );
    }

    // Exclude weekends
    if (args.filters.excludeWeekends) {
      filtered = filtered.filter((v) => {
        const day = new Date(v.createdAt).getDay();
        return day !== 0 && day !== 6;
      });
    }

    // Exclude nights (10pm - 6am)
    if (args.filters.excludeNights) {
      filtered = filtered.filter((v) => {
        const hour = new Date(v.createdAt).getHours();
        return hour >= 6 && hour < 22;
      });
    }

    const limit = args.limit ?? 100;
    return filtered.slice(0, limit);
  },
});

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Calculates a recency score based on time period
 */
function calculateRecencyScore(timestamp: number, period: TimePeriod): number {
  const now = Date.now();
  const age = now - timestamp;
  const periodMs = TIME_PERIODS_MS[period];

  if (period === "all") {
    // For "all", use a year as reference
    const yearMs = TIME_PERIODS_MS.year;
    return Math.exp(-age / yearMs);
  }

  // Exponential decay within the period
  return Math.exp(-age / periodMs);
}

/**
 * Gets temporal context for a timestamp
 */
function getTemporalContext(timestamp: number): {
  timeOfDay: "morning" | "afternoon" | "evening" | "night";
  dayOfWeek: string;
  isWeekend: boolean;
} {
  const date = new Date(timestamp);
  const hour = date.getHours();
  const day = date.getDay();

  let timeOfDay: "morning" | "afternoon" | "evening" | "night";
  if (hour >= 5 && hour < 12) {
    timeOfDay = "morning";
  } else if (hour >= 12 && hour < 17) {
    timeOfDay = "afternoon";
  } else if (hour >= 17 && hour < 21) {
    timeOfDay = "evening";
  } else {
    timeOfDay = "night";
  }

  const dayNames = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
  ];

  return {
    timeOfDay,
    dayOfWeek: dayNames[day],
    isWeekend: day === 0 || day === 6,
  };
}

/**
 * Extracts topics from vectors (simplified - uses tags)
 */
function extractTopics(vectors: any[]): string[] {
  const topics = new Map<string, number>();

  for (const vector of vectors) {
    for (const tag of vector.metadata?.tags ?? []) {
      topics.set(tag, (topics.get(tag) ?? 0) + 1);
    }
  }

  return Array.from(topics.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([topic]) => topic);
}

/**
 * Analyzes trend direction from a series of counts
 */
function analyzeTrendDirection(counts: number[]): {
  direction: "increasing" | "decreasing" | "stable" | "volatile";
  strength: number;
} {
  if (counts.length < 2) {
    return { direction: "stable", strength: 0 };
  }

  // Calculate linear regression slope
  const n = counts.length;
  const sumX = (n * (n - 1)) / 2;
  const sumY = counts.reduce((a, b) => a + b, 0);
  const sumXY = counts.reduce((sum, y, x) => sum + x * y, 0);
  const sumX2 = (n * (n - 1) * (2 * n - 1)) / 6;

  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  const avgY = sumY / n;

  // Normalize slope
  const normalizedSlope = slope / (avgY || 1);

  // Calculate volatility
  const mean = sumY / n;
  const variance =
    counts.reduce((sum, y) => sum + Math.pow(y - mean, 2), 0) / n;
  const cv = Math.sqrt(variance) / (mean || 1);

  // Determine direction
  let direction: "increasing" | "decreasing" | "stable" | "volatile";
  let strength: number;

  if (cv > 0.5) {
    direction = "volatile";
    strength = Math.min(1, cv);
  } else if (normalizedSlope > 0.1) {
    direction = "increasing";
    strength = Math.min(1, normalizedSlope * 5);
  } else if (normalizedSlope < -0.1) {
    direction = "decreasing";
    strength = Math.min(1, Math.abs(normalizedSlope) * 5);
  } else {
    direction = "stable";
    strength = 1 - Math.abs(normalizedSlope) * 10;
  }

  return { direction, strength: Math.max(0, Math.min(1, strength)) };
}
