import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Id } from "./id";
import { requireUser } from "./auth";
import { intelligenceLevels } from "./schema";

// Intelligence level definitions with features
const INTELLIGENCE_LEVELS = {
  off: {
    name: "Off",
    description: "No AI features. Basic browsing only.",
    features: {
      historyTracking: false,
      contentAnalysis: false,
      voiceCommands: false,
      personalizedSuggestions: false,
      knowledgeGraph: false,
      crossSessionLearning: false,
      embeddingGeneration: false,
      intentPrediction: false,
    },
    rateLimit: {
      requestsPerMinute: 0,
      requestsPerHour: 0,
      requestsPerDay: 0,
    },
  },
  basic: {
    name: "Basic",
    description: "Essential AI features with minimal data collection.",
    features: {
      historyTracking: true,
      contentAnalysis: false,
      voiceCommands: true,
      personalizedSuggestions: false,
      knowledgeGraph: false,
      crossSessionLearning: false,
      embeddingGeneration: false,
      intentPrediction: true,
    },
    rateLimit: {
      requestsPerMinute: 10,
      requestsPerHour: 100,
      requestsPerDay: 500,
    },
  },
  enhanced: {
    name: "Enhanced",
    description: "Smart browsing with personalized recommendations.",
    features: {
      historyTracking: true,
      contentAnalysis: true,
      voiceCommands: true,
      personalizedSuggestions: true,
      knowledgeGraph: false,
      crossSessionLearning: true,
      embeddingGeneration: true,
      intentPrediction: true,
    },
    rateLimit: {
      requestsPerMinute: 30,
      requestsPerHour: 500,
      requestsPerDay: 2000,
    },
  },
  full: {
    name: "Full Intelligence",
    description: "Complete AI-powered browsing experience.",
    features: {
      historyTracking: true,
      contentAnalysis: true,
      voiceCommands: true,
      personalizedSuggestions: true,
      knowledgeGraph: true,
      crossSessionLearning: true,
      embeddingGeneration: true,
      intentPrediction: true,
    },
    rateLimit: {
      requestsPerMinute: 60,
      requestsPerHour: 1000,
      requestsPerDay: 5000,
    },
  },
} as const;

type IntelligenceLevel = keyof typeof INTELLIGENCE_LEVELS;

// Get current intelligence level
export const getIntelligenceLevel = query({
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

    const level = user.intelligenceLevel as IntelligenceLevel;
    const levelConfig = INTELLIGENCE_LEVELS[level];

    return {
      currentLevel: level,
      ...levelConfig,
      availableLevels: Object.entries(INTELLIGENCE_LEVELS).map(
        ([key, config]) => ({
          level: key,
          name: config.name,
          description: config.description,
        })
      ),
    };
  },
});

// Set intelligence level
export const setIntelligenceLevel = mutation({
  args: {
    clerkId: v.string(),
    level: intelligenceLevels,
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx, args.clerkId);
    const fullUser = await ctx.db.get(user._id);

    if (!fullUser) {
      throw new Error("User not found");
    }

    // Check if consent flow is completed
    if (fullUser.consentState !== "completed" && args.level !== "off") {
      throw new Error(
        "Please complete the consent flow before enabling AI features"
      );
    }

    const previousLevel = fullUser.intelligenceLevel;

    await ctx.db.patch(user._id, {
      intelligenceLevel: args.level,
      updatedAt: Date.now(),
    });

    // Log level change
    await ctx.db.insert("auditLogs", {
      userId: user._id,
      action: "intelligence.level_changed",
      details: {
        resourceType: "user",
        resourceId: user._id,
        previousValue: previousLevel,
        newValue: args.level,
        success: true,
      },
      timestamp: Date.now(),
    });

    const levelConfig = INTELLIGENCE_LEVELS[args.level as IntelligenceLevel];

    return {
      previousLevel,
      newLevel: args.level,
      ...levelConfig,
    };
  },
});

// Check if a specific feature is enabled for user
export const checkFeatureEnabled = query({
  args: {
    clerkId: v.string(),
    feature: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", args.clerkId))
      .unique();

    if (!user) {
      return { enabled: false, reason: "user_not_found" };
    }

    const level = user.intelligenceLevel as IntelligenceLevel;
    const levelConfig = INTELLIGENCE_LEVELS[level];
    const features = levelConfig.features as Record<string, boolean>;

    if (!(args.feature in features)) {
      return { enabled: false, reason: "unknown_feature" };
    }

    return {
      enabled: features[args.feature],
      currentLevel: level,
      reason: features[args.feature] ? "enabled" : "level_insufficient",
    };
  },
});

// Get all enabled features for user
export const getEnabledFeatures = query({
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

    const level = user.intelligenceLevel as IntelligenceLevel;
    const levelConfig = INTELLIGENCE_LEVELS[level];

    const enabledFeatures = Object.entries(levelConfig.features)
      .filter(([, enabled]) => enabled)
      .map(([feature]) => feature);

    const disabledFeatures = Object.entries(levelConfig.features)
      .filter(([, enabled]) => !enabled)
      .map(([feature]) => feature);

    return {
      currentLevel: level,
      levelName: levelConfig.name,
      enabledFeatures,
      disabledFeatures,
      allFeatures: levelConfig.features,
    };
  },
});

// Check rate limit for user
export const checkRateLimit = query({
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

    const level = user.intelligenceLevel as IntelligenceLevel;
    const levelConfig = INTELLIGENCE_LEVELS[level];
    const limits = levelConfig.rateLimit;

    // Get recent audit logs to count requests
    const now = Date.now();
    const oneMinuteAgo = now - 60 * 1000;
    const oneHourAgo = now - 60 * 60 * 1000;
    const oneDayAgo = now - 24 * 60 * 60 * 1000;

    const recentLogs = await ctx.db
      .query("auditLogs")
      .withIndex("by_userId_timestamp", (q) => q.eq("userId", user._id))
      .order("desc")
      .collect();

    // Count AI-related requests
    const aiActions = [
      "embedding.generated",
      "content.analyzed",
      "voice.processed",
      "suggestion.generated",
      "knowledge.updated",
    ];

    const logsInMinute = recentLogs.filter(
      (log) => log.timestamp >= oneMinuteAgo && aiActions.includes(log.action)
    ).length;

    const logsInHour = recentLogs.filter(
      (log) => log.timestamp >= oneHourAgo && aiActions.includes(log.action)
    ).length;

    const logsInDay = recentLogs.filter(
      (log) => log.timestamp >= oneDayAgo && aiActions.includes(log.action)
    ).length;

    return {
      currentLevel: level,
      limits,
      usage: {
        lastMinute: logsInMinute,
        lastHour: logsInHour,
        lastDay: logsInDay,
      },
      remaining: {
        perMinute: Math.max(0, limits.requestsPerMinute - logsInMinute),
        perHour: Math.max(0, limits.requestsPerHour - logsInHour),
        perDay: Math.max(0, limits.requestsPerDay - logsInDay),
      },
      isThrottled:
        logsInMinute >= limits.requestsPerMinute ||
        logsInHour >= limits.requestsPerHour ||
        logsInDay >= limits.requestsPerDay,
    };
  },
});

// Record AI request for rate limiting
export const recordAIRequest = mutation({
  args: {
    clerkId: v.string(),
    action: v.string(),
    details: v.optional(v.object({
      resourceType: v.optional(v.string()),
      resourceId: v.optional(v.string()),
      success: v.boolean(),
    })),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx, args.clerkId);

    // Check rate limit first
    const level = (
      await ctx.db.get(user._id)
    )?.intelligenceLevel as IntelligenceLevel;
    const levelConfig = INTELLIGENCE_LEVELS[level];
    const limits = levelConfig.rateLimit;

    if (limits.requestsPerMinute === 0) {
      throw new Error("AI features are disabled at current intelligence level");
    }

    // Record the request
    await ctx.db.insert("auditLogs", {
      userId: user._id,
      action: args.action,
      details: {
        ...args.details,
        success: args.details?.success ?? true,
      },
      timestamp: Date.now(),
    });

    return { recorded: true };
  },
});

// Get intelligence level comparison
export const getLevelComparison = query({
  args: {},
  handler: async () => {
    return Object.entries(INTELLIGENCE_LEVELS).map(([level, config]) => ({
      level,
      name: config.name,
      description: config.description,
      features: Object.entries(config.features).map(([feature, enabled]) => ({
        feature,
        enabled,
      })),
      rateLimit: config.rateLimit,
    }));
  },
});

// Recommend intelligence level based on usage
export const recommendLevel = query({
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

    // Get usage data
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

    const browsingEvents = await ctx.db
      .query("browsingEvents")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .collect();

    const recentEvents = browsingEvents.filter(
      (e) => e.timestamp >= weekAgo
    );

    const voiceSessions = await ctx.db
      .query("voiceSessions")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .collect();

    const recentVoice = voiceSessions.filter(
      (s) => s.startTime >= weekAgo
    );

    // Calculate usage patterns
    const dailyBrowsingEvents = recentEvents.length / 7;
    const dailyVoiceSessions = recentVoice.length / 7;
    const uniqueCategories = new Set(
      recentEvents.map((e) => e.category).filter(Boolean)
    ).size;

    // Recommend based on usage
    let recommendedLevel: IntelligenceLevel = "off";
    let reason = "";

    if (recentEvents.length === 0 && recentVoice.length === 0) {
      recommendedLevel = "off";
      reason = "No recent activity detected. Start with basic features.";
    } else if (dailyBrowsingEvents < 10 && dailyVoiceSessions < 1) {
      recommendedLevel = "basic";
      reason = "Light usage detected. Basic features should meet your needs.";
    } else if (dailyBrowsingEvents < 50 && uniqueCategories < 10) {
      recommendedLevel = "enhanced";
      reason =
        "Moderate usage with varied interests. Enhanced features will improve your experience.";
    } else {
      recommendedLevel = "full";
      reason =
        "Heavy usage detected. Full intelligence will maximize your productivity.";
    }

    const currentLevel = user.intelligenceLevel as IntelligenceLevel;
    const currentConfig = INTELLIGENCE_LEVELS[currentLevel];
    const recommendedConfig = INTELLIGENCE_LEVELS[recommendedLevel];

    return {
      currentLevel,
      recommendedLevel,
      reason,
      shouldUpgrade:
        Object.values(INTELLIGENCE_LEVELS).indexOf(recommendedConfig) >
        Object.values(INTELLIGENCE_LEVELS).indexOf(currentConfig),
      usageStats: {
        weeklyBrowsingEvents: recentEvents.length,
        weeklyVoiceSessions: recentVoice.length,
        dailyAverageEvents: Math.round(dailyBrowsingEvents),
        uniqueCategories,
      },
      comparison: {
        current: {
          level: currentLevel,
          ...currentConfig,
        },
        recommended: {
          level: recommendedLevel,
          ...recommendedConfig,
        },
      },
    };
  },
});

// Check feature gate (for conditional rendering)
export const checkFeatureGate = query({
  args: {
    clerkId: v.string(),
    features: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", args.clerkId))
      .unique();

    if (!user) {
      return args.features.reduce(
        (acc, feature) => ({
          ...acc,
          [feature]: false,
        }),
        {}
      );
    }

    const level = user.intelligenceLevel as IntelligenceLevel;
    const levelConfig = INTELLIGENCE_LEVELS[level];
    const features = levelConfig.features as Record<string, boolean>;

    return args.features.reduce(
      (acc, feature) => ({
        ...acc,
        [feature]: features[feature] ?? false,
      }),
      {}
    );
  },
});

// Get minimum level required for feature
export const getMinimumLevelForFeature = query({
  args: {
    feature: v.string(),
  },
  handler: async (_, args) => {
    const levels: IntelligenceLevel[] = ["off", "basic", "enhanced", "full"];

    for (const level of levels) {
      const config = INTELLIGENCE_LEVELS[level];
      const features = config.features as Record<string, boolean>;

      if (features[args.feature]) {
        return {
          feature: args.feature,
          minimumLevel: level,
          levelName: config.name,
        };
      }
    }

    return {
      feature: args.feature,
      minimumLevel: null,
      error: "Feature not found",
    };
  },
});
