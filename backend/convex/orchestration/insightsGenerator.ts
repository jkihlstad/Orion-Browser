/**
 * Insights Generator for Orion Browser Neural Intelligence
 * SUB-AGENT 3: AI & Data Pipeline Engineer
 *
 * Generates actionable insights:
 * - Daily/weekly summaries
 * - Productivity patterns
 * - Social interaction analysis
 * - Engagement scoring
 * - Memory graph hints
 */

import { v } from "convex/values";
import { action, mutation, query, internalQuery } from "../_generated/server";
import { internal } from "../_generated/api";
import type { Id } from "../id";

// ============================================================================
// Types
// ============================================================================

export interface DailySummary {
  date: string;
  totalBrowsingTime: number;
  pageVisits: number;
  uniqueDomains: number;
  topCategories: Array<{ category: string; count: number; percentage: number }>;
  topSites: Array<{ domain: string; visits: number; timeSpent: number }>;
  productivityScore: number;
  focusScore: number;
  learningMoments: string[];
  highlights: string[];
  concerns: string[];
}

export interface WeeklySummary {
  weekStart: string;
  weekEnd: string;
  totalDays: number;
  totalBrowsingTime: number;
  avgDailyTime: number;
  pageVisits: number;
  uniqueDomains: number;
  trendingTopics: Array<{ topic: string; growth: number }>;
  productivityTrend: Array<{ day: string; score: number }>;
  weekOverWeekChange: {
    browsingTime: number;
    productivity: number;
    focus: number;
  };
  accomplishments: string[];
  recommendations: string[];
}

export interface ProductivityPattern {
  peakHours: number[];
  lowHours: number[];
  avgSessionLength: number;
  focusRatio: number;
  distractionRate: number;
  contextSwitchRate: number;
  deepWorkSessions: number;
  patterns: Array<{
    name: string;
    description: string;
    frequency: number;
    impact: "positive" | "negative" | "neutral";
  }>;
}

export interface SocialInteractionSummary {
  totalInteractions: number;
  uniqueContacts: number;
  channelBreakdown: Record<string, number>;
  topContacts: Array<{
    name: string;
    interactions: number;
    lastContact: number;
    sentiment: number;
  }>;
  networkGrowth: number;
  engagementScore: number;
  recommendations: string[];
}

export interface EngagementMetrics {
  overallScore: number;
  dimensions: {
    depth: number;
    breadth: number;
    consistency: number;
    quality: number;
  };
  trendDirection: "improving" | "stable" | "declining";
  benchmarkComparison: number;
  suggestions: string[];
}

export interface MemoryGraphHint {
  hintId: string;
  type: "connection" | "insight" | "reminder" | "opportunity";
  title: string;
  description: string;
  relatedNodes: string[];
  confidence: number;
  actionable: boolean;
  suggestedAction?: string;
  expiresAt?: number;
}

// ============================================================================
// Daily Summary Generation
// ============================================================================

/**
 * Generate daily summary
 */
export const generateDailySummary = action({
  args: {
    clerkId: v.string(),
    date: v.optional(v.string()), // ISO date string, defaults to today
  },
  handler: async (ctx, args): Promise<DailySummary | null> => {
    const user = await ctx.runQuery(internal.orchestration.insightsGenerator.getUserByClerkId, {
      clerkId: args.clerkId,
    });

    if (!user) {
      return null;
    }

    const targetDate = args.date ?? new Date().toISOString().split("T")[0];
    const startOfDay = new Date(targetDate).setHours(0, 0, 0, 0);
    const endOfDay = new Date(targetDate).setHours(23, 59, 59, 999);

    // Get browsing events for the day
    const events = await ctx.runQuery(
      internal.orchestration.insightsGenerator.getEventsForRange,
      {
        userId: user._id,
        startTime: startOfDay,
        endTime: endOfDay,
      }
    );

    if (events.length === 0) {
      return {
        date: targetDate,
        totalBrowsingTime: 0,
        pageVisits: 0,
        uniqueDomains: 0,
        topCategories: [],
        topSites: [],
        productivityScore: 0,
        focusScore: 0,
        learningMoments: [],
        highlights: [],
        concerns: [],
      };
    }

    // Calculate metrics
    const totalBrowsingTime = events.reduce((sum, e) => sum + (e.dwellTime ?? 0), 0);

    // Count unique domains
    const domainCounts = new Map<string, { visits: number; time: number }>();
    for (const event of events) {
      try {
        const domain = new URL(event.url).hostname;
        const existing = domainCounts.get(domain) ?? { visits: 0, time: 0 };
        domainCounts.set(domain, {
          visits: existing.visits + 1,
          time: existing.time + (event.dwellTime ?? 0),
        });
      } catch {
        // Invalid URL
      }
    }

    // Count categories
    const categoryCounts = new Map<string, number>();
    for (const event of events) {
      if (event.category) {
        categoryCounts.set(event.category, (categoryCounts.get(event.category) ?? 0) + 1);
      }
    }

    const topCategories = [...categoryCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([category, count]) => ({
        category,
        count,
        percentage: Math.round((count / events.length) * 100),
      }));

    const topSites = [...domainCounts.entries()]
      .sort((a, b) => b[1].time - a[1].time)
      .slice(0, 5)
      .map(([domain, data]) => ({
        domain,
        visits: data.visits,
        timeSpent: data.time,
      }));

    // Calculate productivity score
    const productiveCategories = new Set(["work", "education", "technology", "reference"]);
    const productiveTime = events
      .filter((e) => e.category && productiveCategories.has(e.category))
      .reduce((sum, e) => sum + (e.dwellTime ?? 0), 0);
    const productivityScore = totalBrowsingTime > 0
      ? Math.round((productiveTime / totalBrowsingTime) * 100)
      : 0;

    // Calculate focus score based on session lengths
    const focusScore = calculateFocusScore(events);

    // Generate insights
    const { learningMoments, highlights, concerns } = generateDailyInsights(
      events,
      topCategories,
      productivityScore,
      focusScore
    );

    const summary: DailySummary = {
      date: targetDate,
      totalBrowsingTime,
      pageVisits: events.length,
      uniqueDomains: domainCounts.size,
      topCategories,
      topSites,
      productivityScore,
      focusScore,
      learningMoments,
      highlights,
      concerns,
    };

    // Store summary
    await ctx.runMutation(internal.orchestration.insightsGenerator.storeSummary, {
      userId: user._id,
      type: "daily",
      date: targetDate,
      summary,
    });

    return summary;
  },
});

/**
 * Get stored daily summary
 */
export const getDailySummary = query({
  args: {
    clerkId: v.string(),
    date: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", args.clerkId))
      .unique();

    if (!user) {
      return null;
    }

    // Check for stored summary in audit logs
    const summaryLog = await ctx.db
      .query("auditLogs")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .filter((q) =>
        q.and(
          q.eq(q.field("action"), "insights.daily_summary"),
          q.eq(q.field("details.resourceId"), args.date)
        )
      )
      .first();

    return summaryLog?.details?.newValue ?? null;
  },
});

// ============================================================================
// Weekly Summary Generation
// ============================================================================

/**
 * Generate weekly summary
 */
export const generateWeeklySummary = action({
  args: {
    clerkId: v.string(),
    weekStart: v.optional(v.string()), // ISO date string
  },
  handler: async (ctx, args): Promise<WeeklySummary | null> => {
    const user = await ctx.runQuery(internal.orchestration.insightsGenerator.getUserByClerkId, {
      clerkId: args.clerkId,
    });

    if (!user) {
      return null;
    }

    // Calculate week boundaries
    const now = new Date();
    const weekStartDate = args.weekStart
      ? new Date(args.weekStart)
      : new Date(now.setDate(now.getDate() - now.getDay()));
    weekStartDate.setHours(0, 0, 0, 0);

    const weekEndDate = new Date(weekStartDate);
    weekEndDate.setDate(weekEndDate.getDate() + 6);
    weekEndDate.setHours(23, 59, 59, 999);

    const previousWeekStart = new Date(weekStartDate);
    previousWeekStart.setDate(previousWeekStart.getDate() - 7);

    // Get events for this week and previous week
    const thisWeekEvents = await ctx.runQuery(
      internal.orchestration.insightsGenerator.getEventsForRange,
      {
        userId: user._id,
        startTime: weekStartDate.getTime(),
        endTime: weekEndDate.getTime(),
      }
    );

    const prevWeekEvents = await ctx.runQuery(
      internal.orchestration.insightsGenerator.getEventsForRange,
      {
        userId: user._id,
        startTime: previousWeekStart.getTime(),
        endTime: weekStartDate.getTime() - 1,
      }
    );

    // Calculate metrics
    const totalBrowsingTime = thisWeekEvents.reduce((sum, e) => sum + (e.dwellTime ?? 0), 0);
    const prevBrowsingTime = prevWeekEvents.reduce((sum, e) => sum + (e.dwellTime ?? 0), 0);

    // Daily productivity breakdown
    const productivityTrend: WeeklySummary["productivityTrend"] = [];
    for (let i = 0; i < 7; i++) {
      const dayStart = new Date(weekStartDate);
      dayStart.setDate(dayStart.getDate() + i);
      const dayEnd = new Date(dayStart);
      dayEnd.setHours(23, 59, 59, 999);

      const dayEvents = thisWeekEvents.filter(
        (e) => e.timestamp >= dayStart.getTime() && e.timestamp <= dayEnd.getTime()
      );

      const dayScore = calculateDayProductivity(dayEvents);
      productivityTrend.push({
        day: dayStart.toISOString().split("T")[0],
        score: dayScore,
      });
    }

    // Identify trending topics
    const thisWeekTopics = extractTopics(thisWeekEvents);
    const prevWeekTopics = extractTopics(prevWeekEvents);

    const trendingTopics = [...thisWeekTopics.entries()]
      .map(([topic, count]) => {
        const prevCount = prevWeekTopics.get(topic) ?? 0;
        const growth = prevCount > 0 ? ((count - prevCount) / prevCount) * 100 : 100;
        return { topic, growth };
      })
      .filter((t) => t.growth > 0)
      .sort((a, b) => b.growth - a.growth)
      .slice(0, 5);

    // Calculate week-over-week changes
    const thisWeekProductivity =
      productivityTrend.reduce((sum, d) => sum + d.score, 0) / 7;
    const prevWeekProductivity = calculateWeekProductivity(prevWeekEvents);

    const summary: WeeklySummary = {
      weekStart: weekStartDate.toISOString().split("T")[0],
      weekEnd: weekEndDate.toISOString().split("T")[0],
      totalDays: 7,
      totalBrowsingTime,
      avgDailyTime: Math.round(totalBrowsingTime / 7),
      pageVisits: thisWeekEvents.length,
      uniqueDomains: new Set(
        thisWeekEvents.map((e) => {
          try {
            return new URL(e.url).hostname;
          } catch {
            return "";
          }
        })
      ).size,
      trendingTopics,
      productivityTrend,
      weekOverWeekChange: {
        browsingTime: prevBrowsingTime > 0
          ? Math.round(((totalBrowsingTime - prevBrowsingTime) / prevBrowsingTime) * 100)
          : 0,
        productivity: Math.round((thisWeekProductivity - prevWeekProductivity) * 100),
        focus: 0, // Would need more detailed tracking
      },
      accomplishments: generateAccomplishments(thisWeekEvents, trendingTopics),
      recommendations: generateWeeklyRecommendations(productivityTrend, trendingTopics),
    };

    // Store summary
    await ctx.runMutation(internal.orchestration.insightsGenerator.storeSummary, {
      userId: user._id,
      type: "weekly",
      date: summary.weekStart,
      summary,
    });

    return summary;
  },
});

// ============================================================================
// Productivity Patterns
// ============================================================================

/**
 * Analyze productivity patterns
 */
export const analyzeProductivityPatterns = query({
  args: {
    clerkId: v.string(),
    days: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<ProductivityPattern | null> => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", args.clerkId))
      .unique();

    if (!user) {
      return null;
    }

    const days = args.days ?? 14;
    const startTime = Date.now() - days * 24 * 60 * 60 * 1000;

    const events = await ctx.db
      .query("browsingEvents")
      .withIndex("by_userId_timestamp", (q) =>
        q.eq("userId", user._id).gte("timestamp", startTime)
      )
      .collect();

    if (events.length === 0) {
      return null;
    }

    // Analyze by hour
    const hourlyActivity = new Array(24).fill(0);
    const hourlyProductivity = new Array(24).fill(0);
    const hourlyCount = new Array(24).fill(0);

    const productiveCategories = new Set(["work", "education", "technology", "reference"]);

    for (const event of events) {
      const hour = new Date(event.timestamp).getHours();
      hourlyActivity[hour] += event.dwellTime ?? 0;
      hourlyCount[hour]++;

      if (event.category && productiveCategories.has(event.category)) {
        hourlyProductivity[hour]++;
      }
    }

    // Find peak and low hours
    const hourScores = hourlyActivity.map((activity, hour) => ({
      hour,
      activity,
      productivity: hourlyCount[hour] > 0
        ? hourlyProductivity[hour] / hourlyCount[hour]
        : 0,
    }));

    hourScores.sort((a, b) => b.activity - a.activity);
    const peakHours = hourScores.slice(0, 3).map((h) => h.hour);
    const lowHours = hourScores.slice(-3).map((h) => h.hour);

    // Calculate session lengths
    const sessions = groupEventsBySessions(events);
    const avgSessionLength =
      sessions.length > 0
        ? sessions.reduce((sum, s) => sum + s.duration, 0) / sessions.length
        : 0;

    // Calculate focus metrics
    const totalTime = events.reduce((sum, e) => sum + (e.dwellTime ?? 0), 0);
    const productiveTime = events
      .filter((e) => e.category && productiveCategories.has(e.category))
      .reduce((sum, e) => sum + (e.dwellTime ?? 0), 0);
    const focusRatio = totalTime > 0 ? productiveTime / totalTime : 0;

    // Detect patterns
    const patterns = detectPatterns(events, sessions);

    return {
      peakHours,
      lowHours,
      avgSessionLength,
      focusRatio,
      distractionRate: 1 - focusRatio,
      contextSwitchRate: events.length / (sessions.length || 1),
      deepWorkSessions: sessions.filter((s) => s.duration > 30 * 60 * 1000).length,
      patterns,
    };
  },
});

// ============================================================================
// Social Interaction Analysis
// ============================================================================

/**
 * Analyze social interactions
 */
export const analyzeSocialInteractions = query({
  args: {
    clerkId: v.string(),
    days: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<SocialInteractionSummary | null> => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", args.clerkId))
      .unique();

    if (!user) {
      return null;
    }

    const days = args.days ?? 30;
    const startTime = Date.now() - days * 24 * 60 * 60 * 1000;

    // Get browsing events for social platforms
    const events = await ctx.db
      .query("browsingEvents")
      .withIndex("by_userId_timestamp", (q) =>
        q.eq("userId", user._id).gte("timestamp", startTime)
      )
      .collect();

    // Categorize social interactions
    const channels: Record<string, number> = {
      email: 0,
      messaging: 0,
      social: 0,
      video: 0,
      collaboration: 0,
    };

    for (const event of events) {
      const url = event.url.toLowerCase();

      if (url.includes("mail") || url.includes("outlook") || url.includes("gmail")) {
        channels.email++;
      } else if (url.includes("slack") || url.includes("teams") || url.includes("discord")) {
        channels.messaging++;
      } else if (
        url.includes("twitter") ||
        url.includes("linkedin") ||
        url.includes("facebook")
      ) {
        channels.social++;
      } else if (url.includes("zoom") || url.includes("meet") || url.includes("webex")) {
        channels.video++;
      } else if (url.includes("notion") || url.includes("confluence") || url.includes("github")) {
        channels.collaboration++;
      }
    }

    const totalInteractions = Object.values(channels).reduce((a, b) => a + b, 0);

    // Get contacts from knowledge graph
    const nodes = await ctx.db
      .query("knowledgeGraphNodes")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .collect();

    const contacts = nodes.filter(
      (n) => n.metadata?.graphNodeType === "contact"
    );

    const topContacts = contacts
      .sort((a, b) => b.connections.length - a.connections.length)
      .slice(0, 5)
      .map((c) => ({
        name: c.metadata?.label ?? c.content,
        interactions: c.connections.length,
        lastContact: c.updatedAt ?? c.createdAt,
        sentiment: 0.5, // Neutral default
      }));

    // Calculate engagement score
    const engagementScore = Math.min(
      100,
      (totalInteractions / (days * 10)) * 100
    );

    // Generate recommendations
    const recommendations: string[] = [];
    if (channels.email > channels.messaging * 2) {
      recommendations.push("Consider using real-time messaging for quicker responses");
    }
    if (channels.video === 0) {
      recommendations.push("Try video calls for more personal connections");
    }
    if (topContacts.length < 3) {
      recommendations.push("Expand your professional network");
    }

    return {
      totalInteractions,
      uniqueContacts: contacts.length,
      channelBreakdown: channels,
      topContacts,
      networkGrowth: 0, // Would need historical comparison
      engagementScore,
      recommendations,
    };
  },
});

// ============================================================================
// Engagement Scoring
// ============================================================================

/**
 * Calculate engagement metrics
 */
export const calculateEngagementMetrics = query({
  args: {
    clerkId: v.string(),
  },
  handler: async (ctx, args): Promise<EngagementMetrics | null> => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", args.clerkId))
      .unique();

    if (!user) {
      return null;
    }

    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const fourteenDaysAgo = Date.now() - 14 * 24 * 60 * 60 * 1000;

    // Get recent events
    const recentEvents = await ctx.db
      .query("browsingEvents")
      .withIndex("by_userId_timestamp", (q) =>
        q.eq("userId", user._id).gte("timestamp", sevenDaysAgo)
      )
      .collect();

    // Get previous week events
    const prevEvents = await ctx.db
      .query("browsingEvents")
      .withIndex("by_userId_timestamp", (q) =>
        q.eq("userId", user._id).gte("timestamp", fourteenDaysAgo)
      )
      .filter((q) => q.lt(q.field("timestamp"), sevenDaysAgo))
      .collect();

    // Calculate depth (time spent per page)
    const avgDwellTime =
      recentEvents.length > 0
        ? recentEvents.reduce((sum, e) => sum + (e.dwellTime ?? 0), 0) /
          recentEvents.length
        : 0;
    const depthScore = Math.min(1, avgDwellTime / (5 * 60 * 1000)); // 5 min = 1.0

    // Calculate breadth (variety of topics)
    const categories = new Set(recentEvents.map((e) => e.category).filter(Boolean));
    const breadthScore = Math.min(1, categories.size / 10);

    // Calculate consistency (daily usage)
    const daysActive = new Set(
      recentEvents.map((e) => new Date(e.timestamp).toDateString())
    ).size;
    const consistencyScore = daysActive / 7;

    // Calculate quality (productive vs unproductive)
    const productiveCategories = new Set(["work", "education", "technology"]);
    const productiveEvents = recentEvents.filter(
      (e) => e.category && productiveCategories.has(e.category)
    );
    const qualityScore =
      recentEvents.length > 0 ? productiveEvents.length / recentEvents.length : 0;

    // Overall score
    const overallScore =
      depthScore * 0.25 +
      breadthScore * 0.25 +
      consistencyScore * 0.25 +
      qualityScore * 0.25;

    // Determine trend
    const prevScore = calculateEngagementScore(prevEvents);
    const currentScore = overallScore;
    let trendDirection: "improving" | "stable" | "declining";
    if (currentScore > prevScore + 0.05) trendDirection = "improving";
    else if (currentScore < prevScore - 0.05) trendDirection = "declining";
    else trendDirection = "stable";

    // Generate suggestions
    const suggestions: string[] = [];
    if (depthScore < 0.5) {
      suggestions.push("Try spending more time on each page to absorb content better");
    }
    if (breadthScore < 0.3) {
      suggestions.push("Explore diverse topics to broaden your knowledge");
    }
    if (consistencyScore < 0.5) {
      suggestions.push("Establish a more consistent browsing routine");
    }
    if (qualityScore < 0.4) {
      suggestions.push("Allocate more time to productive activities");
    }

    return {
      overallScore: Math.round(overallScore * 100),
      dimensions: {
        depth: Math.round(depthScore * 100),
        breadth: Math.round(breadthScore * 100),
        consistency: Math.round(consistencyScore * 100),
        quality: Math.round(qualityScore * 100),
      },
      trendDirection,
      benchmarkComparison: 0, // Would need aggregate data
      suggestions,
    };
  },
});

// ============================================================================
// Memory Graph Hints
// ============================================================================

/**
 * Generate memory graph hints
 */
export const generateMemoryGraphHints = action({
  args: {
    clerkId: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<MemoryGraphHint[]> => {
    const user = await ctx.runQuery(internal.orchestration.insightsGenerator.getUserByClerkId, {
      clerkId: args.clerkId,
    });

    if (!user) {
      return [];
    }

    const limit = args.limit ?? 5;
    const hints: MemoryGraphHint[] = [];

    // Get knowledge graph data
    const nodes = await ctx.runQuery(
      internal.orchestration.insightsGenerator.getKnowledgeNodes,
      { userId: user._id }
    );

    // Hint 1: Unconnected nodes that could be related
    const isolatedNodes = nodes.filter((n) => n.connections.length === 0);
    if (isolatedNodes.length > 0) {
      hints.push({
        hintId: `hint-isolated-${Date.now()}`,
        type: "connection",
        title: "Orphaned knowledge",
        description: `${isolatedNodes.length} items in your knowledge graph aren't connected to anything`,
        relatedNodes: isolatedNodes.slice(0, 3).map((n) => n.content),
        confidence: 0.8,
        actionable: true,
        suggestedAction: "Review and connect these items to related topics",
      });
    }

    // Hint 2: Topics with many connections (central concepts)
    const hubNodes = nodes
      .filter((n) => n.connections.length > 5)
      .sort((a, b) => b.connections.length - a.connections.length);

    if (hubNodes.length > 0) {
      hints.push({
        hintId: `hint-hub-${Date.now()}`,
        type: "insight",
        title: "Knowledge hubs identified",
        description: `"${hubNodes[0].content}" is a central topic in your knowledge graph`,
        relatedNodes: hubNodes.slice(0, 3).map((n) => n.content),
        confidence: 0.9,
        actionable: false,
      });
    }

    // Hint 3: Recent topics that might connect
    const recentEvents = await ctx.runQuery(
      internal.orchestration.insightsGenerator.getRecentEvents,
      { userId: user._id, limit: 50 }
    );

    const recentTopics = extractTopicsFromEvents(recentEvents);
    const potentialConnections = findPotentialConnections(recentTopics, nodes);

    if (potentialConnections.length > 0) {
      hints.push({
        hintId: `hint-connect-${Date.now()}`,
        type: "opportunity",
        title: "Potential connection found",
        description: `Your recent browsing about "${potentialConnections[0].topic}" relates to existing knowledge`,
        relatedNodes: potentialConnections[0].relatedNodes,
        confidence: 0.7,
        actionable: true,
        suggestedAction: "Create a connection between these topics",
      });
    }

    // Hint 4: Fading memories (nodes not accessed recently)
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const fadingNodes = nodes.filter(
      (n) => (n.updatedAt ?? n.createdAt) < thirtyDaysAgo && n.connections.length > 0
    );

    if (fadingNodes.length > 5) {
      hints.push({
        hintId: `hint-fading-${Date.now()}`,
        type: "reminder",
        title: "Knowledge refresh needed",
        description: `${fadingNodes.length} knowledge items haven't been reviewed in 30+ days`,
        relatedNodes: fadingNodes.slice(0, 3).map((n) => n.content),
        confidence: 0.75,
        actionable: true,
        suggestedAction: "Review and reinforce this knowledge",
      });
    }

    return hints.slice(0, limit);
  },
});

// ============================================================================
// Internal Queries
// ============================================================================

export const getUserByClerkId = internalQuery({
  args: { clerkId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", args.clerkId))
      .unique();
  },
});

export const getEventsForRange = internalQuery({
  args: {
    userId: v.id("users"),
    startTime: v.number(),
    endTime: v.number(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("browsingEvents")
      .withIndex("by_userId_timestamp", (q) =>
        q.eq("userId", args.userId).gte("timestamp", args.startTime)
      )
      .filter((q) => q.lte(q.field("timestamp"), args.endTime))
      .collect();
  },
});

export const getKnowledgeNodes = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("knowledgeGraphNodes")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .collect();
  },
});

export const getRecentEvents = internalQuery({
  args: {
    userId: v.id("users"),
    limit: v.number(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("browsingEvents")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .order("desc")
      .take(args.limit);
  },
});

export const storeSummary = mutation({
  args: {
    userId: v.id("users"),
    type: v.union(v.literal("daily"), v.literal("weekly")),
    date: v.string(),
    summary: v.any(),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("auditLogs", {
      userId: args.userId,
      action: `insights.${args.type}_summary`,
      details: {
        resourceType: "summary",
        resourceId: args.date,
        newValue: args.summary,
        success: true,
      },
      timestamp: Date.now(),
    });

    return { success: true };
  },
});

// ============================================================================
// Helper Functions
// ============================================================================

function calculateFocusScore(events: Array<{ dwellTime?: number }>): number {
  if (events.length === 0) return 0;

  // Focus is measured by longer dwell times
  const avgDwell = events.reduce((sum, e) => sum + (e.dwellTime ?? 0), 0) / events.length;
  const focusThreshold = 2 * 60 * 1000; // 2 minutes

  return Math.min(100, Math.round((avgDwell / focusThreshold) * 100));
}

function generateDailyInsights(
  events: Array<{ category?: string; dwellTime?: number; url: string }>,
  topCategories: Array<{ category: string; percentage: number }>,
  productivityScore: number,
  focusScore: number
): {
  learningMoments: string[];
  highlights: string[];
  concerns: string[];
} {
  const learningMoments: string[] = [];
  const highlights: string[] = [];
  const concerns: string[] = [];

  // Learning moments based on educational content
  const educationCategory = topCategories.find((c) => c.category === "education");
  if (educationCategory && educationCategory.percentage > 20) {
    learningMoments.push(
      `Spent ${educationCategory.percentage}% of time on educational content`
    );
  }

  // Highlights
  if (productivityScore > 70) {
    highlights.push("Highly productive session!");
  }
  if (focusScore > 80) {
    highlights.push("Excellent focus - maintained attention well");
  }

  // Concerns
  if (productivityScore < 30) {
    concerns.push("Low productivity - consider reviewing your browsing habits");
  }
  if (focusScore < 30) {
    concerns.push("Frequent context switching detected");
  }

  return { learningMoments, highlights, concerns };
}

function extractTopics(events: Array<{ category?: string }>): Map<string, number> {
  const topics = new Map<string, number>();
  for (const event of events) {
    if (event.category) {
      topics.set(event.category, (topics.get(event.category) ?? 0) + 1);
    }
  }
  return topics;
}

function calculateDayProductivity(events: Array<{ category?: string; dwellTime?: number }>): number {
  if (events.length === 0) return 0;

  const productiveCategories = new Set(["work", "education", "technology"]);
  const productiveTime = events
    .filter((e) => e.category && productiveCategories.has(e.category))
    .reduce((sum, e) => sum + (e.dwellTime ?? 0), 0);

  const totalTime = events.reduce((sum, e) => sum + (e.dwellTime ?? 0), 0);

  return totalTime > 0 ? productiveTime / totalTime : 0;
}

function calculateWeekProductivity(events: Array<{ category?: string }>): number {
  if (events.length === 0) return 0;

  const productiveCategories = new Set(["work", "education", "technology"]);
  const productiveCount = events.filter(
    (e) => e.category && productiveCategories.has(e.category)
  ).length;

  return productiveCount / events.length;
}

function generateAccomplishments(
  events: Array<{ category?: string }>,
  trendingTopics: Array<{ topic: string; growth: number }>
): string[] {
  const accomplishments: string[] = [];

  if (events.length > 100) {
    accomplishments.push("Active week with significant browsing activity");
  }

  if (trendingTopics.length > 0 && trendingTopics[0].growth > 50) {
    accomplishments.push(`Explored new interest: ${trendingTopics[0].topic}`);
  }

  return accomplishments;
}

function generateWeeklyRecommendations(
  productivityTrend: Array<{ score: number }>,
  trendingTopics: Array<{ topic: string }>
): string[] {
  const recommendations: string[] = [];

  const avgProductivity =
    productivityTrend.reduce((sum, d) => sum + d.score, 0) / productivityTrend.length;

  if (avgProductivity < 0.4) {
    recommendations.push("Try to increase focus time on productive activities");
  }

  if (trendingTopics.length > 3) {
    recommendations.push("Consider deepening knowledge in one area rather than spreading thin");
  }

  return recommendations;
}

function groupEventsBySessions(
  events: Array<{ timestamp: number; dwellTime?: number }>
): Array<{ events: number[]; duration: number }> {
  if (events.length === 0) return [];

  const sorted = [...events].sort((a, b) => a.timestamp - b.timestamp);
  const sessions: Array<{ events: number[]; duration: number }> = [];
  let currentSession = { events: [0], startTime: sorted[0].timestamp };

  for (let i = 1; i < sorted.length; i++) {
    const gap = sorted[i].timestamp - sorted[i - 1].timestamp;

    if (gap > 30 * 60 * 1000) {
      // 30 min gap = new session
      sessions.push({
        events: currentSession.events,
        duration: sorted[i - 1].timestamp - currentSession.startTime,
      });
      currentSession = { events: [i], startTime: sorted[i].timestamp };
    } else {
      currentSession.events.push(i);
    }
  }

  sessions.push({
    events: currentSession.events,
    duration: sorted[sorted.length - 1].timestamp - currentSession.startTime,
  });

  return sessions;
}

function detectPatterns(
  events: Array<{ timestamp: number; category?: string; url: string }>,
  sessions: Array<{ events: number[]; duration: number }>
): ProductivityPattern["patterns"] {
  const patterns: ProductivityPattern["patterns"] = [];

  // Detect morning browsing pattern
  const morningEvents = events.filter(
    (e) => new Date(e.timestamp).getHours() < 10
  );
  if (morningEvents.length > events.length * 0.3) {
    patterns.push({
      name: "Early bird",
      description: "Significant activity in morning hours",
      frequency: morningEvents.length / events.length,
      impact: "positive",
    });
  }

  // Detect late night pattern
  const lateNightEvents = events.filter(
    (e) => new Date(e.timestamp).getHours() >= 22
  );
  if (lateNightEvents.length > events.length * 0.2) {
    patterns.push({
      name: "Night owl",
      description: "Significant late-night activity",
      frequency: lateNightEvents.length / events.length,
      impact: "neutral",
    });
  }

  // Detect social media pattern
  const socialEvents = events.filter(
    (e) =>
      e.url.includes("twitter") ||
      e.url.includes("facebook") ||
      e.url.includes("reddit")
  );
  if (socialEvents.length > events.length * 0.3) {
    patterns.push({
      name: "Social browser",
      description: "Heavy social media usage detected",
      frequency: socialEvents.length / events.length,
      impact: "negative",
    });
  }

  return patterns;
}

function calculateEngagementScore(events: Array<{ dwellTime?: number; category?: string }>): number {
  if (events.length === 0) return 0;

  const avgDwell = events.reduce((sum, e) => sum + (e.dwellTime ?? 0), 0) / events.length;
  const categories = new Set(events.map((e) => e.category).filter(Boolean)).size;

  return (avgDwell / (5 * 60 * 1000)) * 0.5 + (categories / 10) * 0.5;
}

function extractTopicsFromEvents(events: Array<{ category?: string; metadata?: { title?: string } }>): string[] {
  const topics = new Set<string>();

  for (const event of events) {
    if (event.category) {
      topics.add(event.category);
    }
  }

  return [...topics];
}

function findPotentialConnections(
  recentTopics: string[],
  nodes: Array<{ content: string; nodeType: string; connections: { targetNodeId: string }[] }>
): Array<{ topic: string; relatedNodes: string[] }> {
  const connections: Array<{ topic: string; relatedNodes: string[] }> = [];

  for (const topic of recentTopics) {
    const relatedNodes = nodes
      .filter((n) => n.content.toLowerCase().includes(topic.toLowerCase()))
      .map((n) => n.content)
      .slice(0, 3);

    if (relatedNodes.length > 0) {
      connections.push({ topic, relatedNodes });
    }
  }

  return connections;
}
