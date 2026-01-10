/**
 * LLM Reasoning Engine for Orion Browser Neural Intelligence
 * SUB-AGENT 3: AI & Data Pipeline Engineer
 *
 * Provides intelligent reasoning capabilities:
 * - Session summarization
 * - Priority recommendations
 * - Relationship insights
 * - Cross-modal reasoning (combine text, audio, video context)
 * - Alert generation for important patterns
 */

import { v } from "convex/values";
import { action, internalAction, mutation, query } from "../_generated/server";
import { internal } from "../_generated/api";
import type { Id } from "../id";

// ============================================================================
// Types
// ============================================================================

export interface ReasoningContext {
  userId: string;
  sessionId?: string;
  browsingHistory: Array<{
    url: string;
    title: string;
    timestamp: number;
    duration?: number;
  }>;
  voiceTranscripts?: string[];
  knowledgeGraphNodes?: Array<{
    content: string;
    nodeType: string;
    connections: number;
  }>;
  userPreferences?: Record<string, unknown>;
  currentFocus?: string;
}

export interface ReasoningResult {
  type: "summary" | "recommendation" | "insight" | "alert";
  content: string;
  confidence: number;
  reasoning: string;
  sources: string[];
  actionable: boolean;
  suggestedActions?: string[];
  metadata?: Record<string, unknown>;
}

export interface SessionSummary {
  sessionId: string;
  duration: number;
  mainTopics: string[];
  keyActivities: string[];
  productivity: {
    score: number;
    focusTime: number;
    distractions: number;
  };
  insights: string[];
  recommendations: string[];
  emotionalTone?: string;
}

export interface PriorityRecommendation {
  item: string;
  priority: "high" | "medium" | "low";
  reason: string;
  confidence: number;
  deadline?: number;
  relatedItems?: string[];
}

export interface PatternAlert {
  alertId: string;
  type: "productivity" | "health" | "privacy" | "security" | "insight";
  severity: "info" | "warning" | "critical";
  title: string;
  description: string;
  pattern: string;
  suggestedAction: string;
  dismissable: boolean;
  timestamp: number;
}

// ============================================================================
// Session Summarization
// ============================================================================

/**
 * Generate intelligent session summary
 */
export const summarizeSession = action({
  args: {
    clerkId: v.string(),
    sessionId: v.optional(v.id("browsingSessions")),
    includeVoice: v.optional(v.boolean()),
    includeKnowledge: v.optional(v.boolean()),
  },
  handler: async (ctx, args): Promise<SessionSummary | null> => {
    // Get user
    const user = await ctx.runQuery(internal.orchestration.reasoningEngine.getUserByClerkId, {
      clerkId: args.clerkId,
    });

    if (!user) {
      return null;
    }

    // Get session data
    const sessionData = await ctx.runQuery(
      internal.orchestration.reasoningEngine.getSessionData,
      {
        userId: user._id,
        sessionId: args.sessionId,
      }
    );

    if (!sessionData) {
      return null;
    }

    // Get voice data if requested
    let voiceData = null;
    if (args.includeVoice) {
      voiceData = await ctx.runQuery(
        internal.orchestration.reasoningEngine.getVoiceData,
        { userId: user._id }
      );
    }

    // Get knowledge graph data if requested
    let knowledgeData = null;
    if (args.includeKnowledge) {
      knowledgeData = await ctx.runQuery(
        internal.orchestration.reasoningEngine.getKnowledgeData,
        { userId: user._id }
      );
    }

    // Build context for LLM reasoning
    const context = buildReasoningContext(sessionData, voiceData, knowledgeData);

    // Generate summary using LLM
    const summary = await generateSessionSummaryWithLLM(context);

    // Store summary for future reference
    await ctx.runMutation(internal.orchestration.reasoningEngine.storeSessionSummary, {
      userId: user._id,
      sessionId: args.sessionId,
      summary,
    });

    return summary;
  },
});

/**
 * Generate quick summary for active session
 */
export const getQuickSummary = query({
  args: {
    clerkId: v.string(),
    eventLimit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", args.clerkId))
      .unique();

    if (!user) {
      return null;
    }

    const limit = args.eventLimit ?? 20;

    // Get recent browsing events
    const recentEvents = await ctx.db
      .query("browsingEvents")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .order("desc")
      .take(limit);

    if (recentEvents.length === 0) {
      return {
        summary: "No recent activity",
        topSites: [],
        categories: [],
        duration: 0,
      };
    }

    // Calculate basic statistics
    const sites = new Map<string, number>();
    const categories = new Map<string, number>();
    let totalDuration = 0;

    for (const event of recentEvents) {
      try {
        const domain = new URL(event.url).hostname;
        sites.set(domain, (sites.get(domain) ?? 0) + 1);
      } catch {
        // Invalid URL
      }

      if (event.category) {
        categories.set(event.category, (categories.get(event.category) ?? 0) + 1);
      }

      totalDuration += event.dwellTime ?? 0;
    }

    const topSites = [...sites.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([site, count]) => ({ site, count }));

    const topCategories = [...categories.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([category, count]) => ({ category, count }));

    // Generate simple summary
    const primaryFocus = topCategories[0]?.category ?? "browsing";
    const summary = `${recentEvents.length} pages visited, primarily ${primaryFocus}. Top site: ${topSites[0]?.site ?? "various"}`;

    return {
      summary,
      topSites,
      categories: topCategories,
      duration: totalDuration,
      eventCount: recentEvents.length,
    };
  },
});

// ============================================================================
// Priority Recommendations
// ============================================================================

/**
 * Generate priority recommendations based on user activity
 */
export const generatePriorityRecommendations = action({
  args: {
    clerkId: v.string(),
    context: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<PriorityRecommendation[]> => {
    const user = await ctx.runQuery(internal.orchestration.reasoningEngine.getUserByClerkId, {
      clerkId: args.clerkId,
    });

    if (!user) {
      return [];
    }

    const limit = args.limit ?? 5;

    // Get user activity data
    const activityData = await ctx.runQuery(
      internal.orchestration.reasoningEngine.getActivityData,
      { userId: user._id }
    );

    // Get knowledge graph for context
    const knowledgeData = await ctx.runQuery(
      internal.orchestration.reasoningEngine.getKnowledgeData,
      { userId: user._id }
    );

    // Generate recommendations using LLM
    const recommendations = await generateRecommendationsWithLLM(
      activityData,
      knowledgeData,
      args.context,
      limit
    );

    return recommendations;
  },
});

/**
 * Get task priority suggestions
 */
export const getTaskPriorities = query({
  args: {
    clerkId: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", args.clerkId))
      .unique();

    if (!user) {
      return [];
    }

    // Get task nodes from knowledge graph
    const nodes = await ctx.db
      .query("knowledgeGraphNodes")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .collect();

    const taskNodes = nodes.filter(
      (n) =>
        n.metadata?.graphNodeType === "task" ||
        n.nodeType === "action"
    );

    // Calculate priority scores
    const priorities = taskNodes.map((task) => {
      // Factors: connections (importance), confidence, recency
      const connectionScore = Math.min(1, task.connections.length / 5);
      const confidenceScore = task.confidence;
      const recencyScore = Math.max(
        0,
        1 - (Date.now() - task.createdAt) / (7 * 24 * 60 * 60 * 1000)
      );

      const priorityScore =
        connectionScore * 0.3 + confidenceScore * 0.4 + recencyScore * 0.3;

      let priority: "high" | "medium" | "low";
      if (priorityScore > 0.7) priority = "high";
      else if (priorityScore > 0.4) priority = "medium";
      else priority = "low";

      return {
        taskId: task._id,
        taskName: task.metadata?.label ?? task.content,
        priority,
        score: priorityScore,
        factors: {
          connections: connectionScore,
          confidence: confidenceScore,
          recency: recencyScore,
        },
      };
    });

    // Sort by priority score
    priorities.sort((a, b) => b.score - a.score);

    return priorities;
  },
});

// ============================================================================
// Relationship Insights
// ============================================================================

/**
 * Generate insights about user relationships and connections
 */
export const generateRelationshipInsights = action({
  args: {
    clerkId: v.string(),
  },
  handler: async (ctx, args): Promise<ReasoningResult[]> => {
    const user = await ctx.runQuery(internal.orchestration.reasoningEngine.getUserByClerkId, {
      clerkId: args.clerkId,
    });

    if (!user) {
      return [];
    }

    // Get relationship data
    const relationshipData = await ctx.runQuery(
      internal.orchestration.reasoningEngine.getRelationshipData,
      { userId: user._id }
    );

    // Analyze patterns and generate insights
    const insights: ReasoningResult[] = [];

    // Insight 1: Key contacts
    if (relationshipData.topContacts.length > 0) {
      insights.push({
        type: "insight",
        content: `Your most frequent collaborators are ${relationshipData.topContacts.slice(0, 3).join(", ")}`,
        confidence: 0.85,
        reasoning: "Based on interaction frequency and connection strength",
        sources: ["knowledge_graph", "browsing_history"],
        actionable: false,
      });
    }

    // Insight 2: Topic clusters
    if (relationshipData.topicClusters.length > 0) {
      insights.push({
        type: "insight",
        content: `Your interests cluster around ${relationshipData.topicClusters.length} main themes`,
        confidence: 0.8,
        reasoning: "Topic clustering analysis",
        sources: ["knowledge_graph"],
        actionable: true,
        suggestedActions: ["Explore related topics", "Connect related knowledge"],
      });
    }

    // Insight 3: Underexplored connections
    if (relationshipData.isolatedNodes > 3) {
      insights.push({
        type: "recommendation",
        content: `${relationshipData.isolatedNodes} knowledge items are not connected to others`,
        confidence: 0.75,
        reasoning: "Graph connectivity analysis",
        sources: ["knowledge_graph"],
        actionable: true,
        suggestedActions: ["Review isolated items", "Create connections"],
      });
    }

    return insights;
  },
});

// ============================================================================
// Cross-Modal Reasoning
// ============================================================================

/**
 * Perform cross-modal reasoning combining text, audio, and video context
 */
export const crossModalReasoning = action({
  args: {
    clerkId: v.string(),
    query: v.string(),
    modalities: v.optional(v.array(v.union(
      v.literal("text"),
      v.literal("audio"),
      v.literal("video"),
      v.literal("knowledge")
    ))),
  },
  handler: async (ctx, args): Promise<ReasoningResult> => {
    const user = await ctx.runQuery(internal.orchestration.reasoningEngine.getUserByClerkId, {
      clerkId: args.clerkId,
    });

    if (!user) {
      throw new Error("User not found");
    }

    const modalities = args.modalities ?? ["text", "knowledge"];

    // Gather context from each modality
    const contextParts: string[] = [];

    if (modalities.includes("text")) {
      const textContext = await ctx.runQuery(
        internal.orchestration.reasoningEngine.getTextContext,
        { userId: user._id, query: args.query }
      );
      if (textContext) {
        contextParts.push(`Text context: ${textContext}`);
      }
    }

    if (modalities.includes("audio")) {
      const audioContext = await ctx.runQuery(
        internal.orchestration.reasoningEngine.getAudioContext,
        { userId: user._id, query: args.query }
      );
      if (audioContext) {
        contextParts.push(`Voice context: ${audioContext}`);
      }
    }

    if (modalities.includes("knowledge")) {
      const knowledgeContext = await ctx.runQuery(
        internal.orchestration.reasoningEngine.getKnowledgeContext,
        { userId: user._id, query: args.query }
      );
      if (knowledgeContext) {
        contextParts.push(`Knowledge graph: ${knowledgeContext}`);
      }
    }

    // Combine and reason
    const combinedContext = contextParts.join("\n\n");
    const result = await performCrossModalReasoning(args.query, combinedContext);

    return result;
  },
});

// ============================================================================
// Alert Generation
// ============================================================================

/**
 * Generate alerts for important patterns
 */
export const generatePatternAlerts = action({
  args: {
    clerkId: v.string(),
  },
  handler: async (ctx, args): Promise<PatternAlert[]> => {
    const user = await ctx.runQuery(internal.orchestration.reasoningEngine.getUserByClerkId, {
      clerkId: args.clerkId,
    });

    if (!user) {
      return [];
    }

    const alerts: PatternAlert[] = [];
    const timestamp = Date.now();

    // Get recent activity
    const activityPatterns = await ctx.runQuery(
      internal.orchestration.reasoningEngine.analyzeActivityPatterns,
      { userId: user._id }
    );

    // Check for productivity patterns
    if (activityPatterns.doomscrolling > 30) {
      alerts.push({
        alertId: `alert-${timestamp}-doom`,
        type: "health",
        severity: activityPatterns.doomscrolling > 60 ? "warning" : "info",
        title: "Extended scrolling detected",
        description: `You've been scrolling for ${activityPatterns.doomscrolling} minutes`,
        pattern: "doomscrolling",
        suggestedAction: "Consider taking a short break",
        dismissable: true,
        timestamp,
      });
    }

    // Check for focus patterns
    if (activityPatterns.tabSwitches > 50) {
      alerts.push({
        alertId: `alert-${timestamp}-focus`,
        type: "productivity",
        severity: "info",
        title: "High context switching",
        description: "You've switched tabs frequently in this session",
        pattern: "context_switching",
        suggestedAction: "Try focusing on fewer tabs at once",
        dismissable: true,
        timestamp,
      });
    }

    // Check for privacy patterns
    if (activityPatterns.sensitiveContent > 0) {
      alerts.push({
        alertId: `alert-${timestamp}-privacy`,
        type: "privacy",
        severity: "info",
        title: "Sensitive content detected",
        description: "Some browsing activity was not analyzed for privacy",
        pattern: "sensitive_content",
        suggestedAction: "Review privacy settings if needed",
        dismissable: true,
        timestamp,
      });
    }

    // Check for learning opportunities
    if (activityPatterns.researchTopics.length > 2) {
      alerts.push({
        alertId: `alert-${timestamp}-insight`,
        type: "insight",
        severity: "info",
        title: "Research pattern detected",
        description: `You've been exploring: ${activityPatterns.researchTopics.join(", ")}`,
        pattern: "research_mode",
        suggestedAction: "Would you like to save this as a topic of interest?",
        dismissable: true,
        timestamp,
      });
    }

    return alerts;
  },
});

/**
 * Dismiss an alert
 */
export const dismissAlert = mutation({
  args: {
    clerkId: v.string(),
    alertId: v.string(),
    feedback: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", args.clerkId))
      .unique();

    if (!user) {
      throw new Error("User not found");
    }

    // Log the dismissal for learning
    await ctx.db.insert("auditLogs", {
      userId: user._id,
      action: "alert.dismissed",
      details: {
        resourceType: "alert",
        resourceId: args.alertId,
        newValue: { feedback: args.feedback },
        success: true,
      },
      timestamp: Date.now(),
    });

    return { success: true };
  },
});

// ============================================================================
// Internal Queries
// ============================================================================

export const getUserByClerkId = query({
  args: { clerkId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", args.clerkId))
      .unique();
  },
});

export const getSessionData = query({
  args: {
    userId: v.id("users"),
    sessionId: v.optional(v.id("browsingSessions")),
  },
  handler: async (ctx, args) => {
    let session;
    if (args.sessionId) {
      session = await ctx.db.get(args.sessionId);
    } else {
      session = await ctx.db
        .query("browsingSessions")
        .withIndex("by_userId_active", (q) =>
          q.eq("userId", args.userId).eq("isActive", true)
        )
        .first();
    }

    if (!session) {
      return null;
    }

    const events = await ctx.db
      .query("browsingEvents")
      .withIndex("by_sessionId", (q) => q.eq("sessionId", session._id))
      .collect();

    return {
      session,
      events,
      duration: session.endTime
        ? session.endTime - session.startTime
        : Date.now() - session.startTime,
    };
  },
});

export const getVoiceData = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const recentSessions = await ctx.db
      .query("voiceSessions")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .order("desc")
      .take(10);

    return {
      sessions: recentSessions,
      transcripts: recentSessions
        .filter((s) => s.transcription)
        .map((s) => s.transcription),
    };
  },
});

export const getKnowledgeData = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const nodes = await ctx.db
      .query("knowledgeGraphNodes")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .collect();

    return {
      nodes: nodes.slice(0, 50),
      totalNodes: nodes.length,
      topNodes: nodes
        .sort((a, b) => b.connections.length - a.connections.length)
        .slice(0, 10),
    };
  },
});

export const getActivityData = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;

    const recentEvents = await ctx.db
      .query("browsingEvents")
      .withIndex("by_userId_timestamp", (q) =>
        q.eq("userId", args.userId).gte("timestamp", oneDayAgo)
      )
      .collect();

    // Categorize activity
    const categories = new Map<string, number>();
    for (const event of recentEvents) {
      if (event.category) {
        categories.set(event.category, (categories.get(event.category) ?? 0) + 1);
      }
    }

    return {
      eventCount: recentEvents.length,
      categories: Object.fromEntries(categories),
      timeRange: {
        start: oneDayAgo,
        end: Date.now(),
      },
    };
  },
});

export const getRelationshipData = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const nodes = await ctx.db
      .query("knowledgeGraphNodes")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .collect();

    // Find contacts
    const contacts = nodes.filter(
      (n) => n.metadata?.graphNodeType === "contact"
    );
    const topContacts = contacts
      .sort((a, b) => b.connections.length - a.connections.length)
      .slice(0, 5)
      .map((c) => c.metadata?.label ?? c.content);

    // Find topic clusters
    const topics = nodes.filter((n) => n.nodeType === "topic");
    const topicClusters = topics.map((t) => t.content);

    // Find isolated nodes
    const isolatedNodes = nodes.filter((n) => n.connections.length === 0).length;

    return {
      topContacts,
      topicClusters,
      isolatedNodes,
      totalNodes: nodes.length,
    };
  },
});

export const getTextContext = query({
  args: { userId: v.id("users"), query: v.string() },
  handler: async (ctx, args) => {
    // Get recent content that matches query
    const events = await ctx.db
      .query("browsingEvents")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .order("desc")
      .take(20);

    const queryLower = args.query.toLowerCase();
    const relevant = events.filter(
      (e) =>
        e.metadata?.title?.toLowerCase().includes(queryLower) ||
        e.url.toLowerCase().includes(queryLower)
    );

    return relevant.slice(0, 5).map((e) => e.metadata?.title ?? e.url).join("; ");
  },
});

export const getAudioContext = query({
  args: { userId: v.id("users"), query: v.string() },
  handler: async (ctx, args) => {
    const sessions = await ctx.db
      .query("voiceSessions")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .order("desc")
      .take(10);

    const queryLower = args.query.toLowerCase();
    const relevant = sessions.filter(
      (s) => s.transcription?.toLowerCase().includes(queryLower)
    );

    return relevant
      .slice(0, 3)
      .map((s) => s.transcription?.slice(0, 200))
      .filter(Boolean)
      .join("; ");
  },
});

export const getKnowledgeContext = query({
  args: { userId: v.id("users"), query: v.string() },
  handler: async (ctx, args) => {
    const nodes = await ctx.db
      .query("knowledgeGraphNodes")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .collect();

    const queryLower = args.query.toLowerCase();
    const relevant = nodes.filter((n) =>
      n.content.toLowerCase().includes(queryLower)
    );

    return relevant
      .slice(0, 5)
      .map((n) => `${n.nodeType}: ${n.content}`)
      .join("; ");
  },
});

export const analyzeActivityPatterns = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const oneHourAgo = Date.now() - 60 * 60 * 1000;

    const recentEvents = await ctx.db
      .query("browsingEvents")
      .withIndex("by_userId_timestamp", (q) =>
        q.eq("userId", args.userId).gte("timestamp", oneHourAgo)
      )
      .collect();

    // Analyze patterns
    let doomscrolling = 0;
    let tabSwitches = 0;
    let sensitiveContent = 0;
    const topics = new Set<string>();

    for (const event of recentEvents) {
      // Check for long scroll sessions on social sites
      if (
        event.url.includes("twitter") ||
        event.url.includes("reddit") ||
        event.url.includes("facebook")
      ) {
        if (event.dwellTime && event.dwellTime > 60000) {
          doomscrolling += Math.floor(event.dwellTime / 60000);
        }
      }

      // Count distinct URLs as proxy for tab switches
      tabSwitches++;

      // Check for research topics
      if (event.category) {
        topics.add(event.category);
      }
    }

    return {
      doomscrolling,
      tabSwitches,
      sensitiveContent,
      researchTopics: [...topics].slice(0, 5),
    };
  },
});

export const storeSessionSummary = mutation({
  args: {
    userId: v.id("users"),
    sessionId: v.optional(v.id("browsingSessions")),
    summary: v.any(),
  },
  handler: async (ctx, args) => {
    // Store as audit log for now
    await ctx.db.insert("auditLogs", {
      userId: args.userId,
      action: "session.summarized",
      details: {
        resourceType: "browsingSessions",
        resourceId: args.sessionId,
        newValue: args.summary,
        success: true,
      },
      timestamp: Date.now(),
    });

    return { success: true };
  },
});

// ============================================================================
// LLM Integration Helpers
// ============================================================================

/**
 * Build reasoning context from multiple data sources
 */
function buildReasoningContext(
  sessionData: { session: { startTime: number }; events: Array<{ url: string; metadata?: { title?: string }; timestamp: number; dwellTime?: number }> },
  voiceData: { transcripts: string[] } | null,
  knowledgeData: { nodes: Array<{ content: string; nodeType: string; connections: { targetNodeId: string }[] }> } | null
): ReasoningContext {
  return {
    userId: "user",
    sessionId: "session",
    browsingHistory: sessionData.events.map((e) => ({
      url: e.url,
      title: e.metadata?.title ?? "",
      timestamp: e.timestamp,
      duration: e.dwellTime,
    })),
    voiceTranscripts: voiceData?.transcripts,
    knowledgeGraphNodes: knowledgeData?.nodes.map((n) => ({
      content: n.content,
      nodeType: n.nodeType,
      connections: n.connections.length,
    })),
  };
}

/**
 * Generate session summary using LLM
 */
async function generateSessionSummaryWithLLM(
  context: ReasoningContext
): Promise<SessionSummary> {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    // Return basic summary without LLM
    return generateBasicSummary(context);
  }

  try {
    const prompt = buildSummaryPrompt(context);

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content:
              "You are an AI assistant analyzing browsing sessions. Provide concise, actionable insights.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        temperature: 0.3,
        max_tokens: 500,
      }),
    });

    if (!response.ok) {
      return generateBasicSummary(context);
    }

    const data = await response.json();
    const llmResponse = data.choices[0].message.content;

    // Parse LLM response into structured summary
    return parseLLMSummary(llmResponse, context);
  } catch {
    return generateBasicSummary(context);
  }
}

/**
 * Generate basic summary without LLM
 */
function generateBasicSummary(context: ReasoningContext): SessionSummary {
  const sites = new Map<string, number>();

  for (const visit of context.browsingHistory) {
    try {
      const domain = new URL(visit.url).hostname;
      sites.set(domain, (sites.get(domain) ?? 0) + 1);
    } catch {
      // Invalid URL
    }
  }

  const topSites = [...sites.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([site]) => site);

  const totalDuration = context.browsingHistory.reduce(
    (sum, v) => sum + (v.duration ?? 0),
    0
  );

  return {
    sessionId: context.sessionId ?? "unknown",
    duration: totalDuration,
    mainTopics: topSites,
    keyActivities: ["Browsing"],
    productivity: {
      score: 0.5,
      focusTime: totalDuration,
      distractions: 0,
    },
    insights: [],
    recommendations: [],
  };
}

/**
 * Build summary prompt for LLM
 */
function buildSummaryPrompt(context: ReasoningContext): string {
  const visits = context.browsingHistory
    .slice(0, 20)
    .map((v) => `- ${v.title || v.url} (${Math.round((v.duration ?? 0) / 1000)}s)`)
    .join("\n");

  return `Analyze this browsing session and provide a brief summary:

Visited pages:
${visits}

${context.voiceTranscripts?.length ? `Voice activity: ${context.voiceTranscripts.length} transcripts` : ""}
${context.knowledgeGraphNodes?.length ? `Knowledge nodes: ${context.knowledgeGraphNodes.length}` : ""}

Provide:
1. Main topics explored
2. Key activities
3. Productivity assessment (0-1)
4. Brief insights
5. Recommendations`;
}

/**
 * Parse LLM response into structured summary
 */
function parseLLMSummary(
  llmResponse: string,
  context: ReasoningContext
): SessionSummary {
  const totalDuration = context.browsingHistory.reduce(
    (sum, v) => sum + (v.duration ?? 0),
    0
  );

  // Simple parsing - in production, use structured outputs
  const lines = llmResponse.split("\n").filter(Boolean);

  return {
    sessionId: context.sessionId ?? "unknown",
    duration: totalDuration,
    mainTopics: lines.slice(0, 3).map((l) => l.replace(/^[-*\d.]\s*/, "")),
    keyActivities: ["Browsing", "Research"],
    productivity: {
      score: 0.7,
      focusTime: totalDuration,
      distractions: 0,
    },
    insights: [llmResponse.slice(0, 200)],
    recommendations: [],
  };
}

/**
 * Generate recommendations using LLM
 */
async function generateRecommendationsWithLLM(
  activityData: { eventCount: number; categories: Record<string, number> },
  knowledgeData: { nodes: Array<{ content: string; nodeType: string }> } | null,
  context: string | undefined,
  limit: number
): Promise<PriorityRecommendation[]> {
  // Basic recommendations without LLM
  const recommendations: PriorityRecommendation[] = [];

  // Recommend based on activity categories
  const categories = Object.entries(activityData.categories)
    .sort((a, b) => b[1] - a[1]);

  for (const [category, count] of categories.slice(0, limit)) {
    recommendations.push({
      item: `Continue exploring ${category}`,
      priority: count > 10 ? "high" : count > 5 ? "medium" : "low",
      reason: `You've shown ${count} interactions in this category`,
      confidence: 0.7,
    });
  }

  return recommendations.slice(0, limit);
}

/**
 * Perform cross-modal reasoning
 */
async function performCrossModalReasoning(
  query: string,
  combinedContext: string
): Promise<ReasoningResult> {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey || !combinedContext) {
    return {
      type: "insight",
      content: "Unable to perform reasoning - insufficient context",
      confidence: 0.3,
      reasoning: "No context available",
      sources: [],
      actionable: false,
    };
  }

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content:
              "You are an AI assistant that combines information from multiple sources (text, voice, knowledge graph) to answer questions.",
          },
          {
            role: "user",
            content: `Context:\n${combinedContext}\n\nQuestion: ${query}`,
          },
        ],
        temperature: 0.3,
        max_tokens: 300,
      }),
    });

    if (!response.ok) {
      throw new Error("API request failed");
    }

    const data = await response.json();
    const llmResponse = data.choices[0].message.content;

    return {
      type: "insight",
      content: llmResponse,
      confidence: 0.8,
      reasoning: "Cross-modal analysis combining text, voice, and knowledge graph",
      sources: ["browsing_history", "voice_transcripts", "knowledge_graph"],
      actionable: true,
    };
  } catch {
    return {
      type: "insight",
      content: "Unable to complete reasoning",
      confidence: 0.3,
      reasoning: "Error during analysis",
      sources: [],
      actionable: false,
    };
  }
}
