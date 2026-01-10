import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

// ==========================================
// Neural Events Types
// ==========================================

// Source apps for neural events
export const sourceApps = v.union(
  v.literal("browser"),
  v.literal("social"),
  v.literal("tasks"),
  v.literal("calendar"),
  v.literal("fitness"),
  v.literal("dating"),
  v.literal("sleep"),
  v.literal("email"),
  v.literal("workouts"),
  v.literal("location"),
  v.literal("device"),
  v.literal("media"),
  v.literal("analytics"),
  v.literal("health"),
  v.literal("communication")
);

// Privacy scopes for consent
export const privacyScopes = v.union(
  v.literal("essential"),
  v.literal("functional"),
  v.literal("analytics"),
  v.literal("personalization"),
  v.literal("biometric"),
  v.literal("location"),
  v.literal("media"),
  v.literal("social"),
  v.literal("behavioral")
);

// Sensitivity levels for data classification
export const sensitivityLevels = v.union(
  v.literal("low"),
  v.literal("medium"),
  v.literal("high"),
  v.literal("critical")
);

// Media types for neural media references
export const neuralMediaTypes = v.union(
  v.literal("image"),
  v.literal("audio"),
  v.literal("video"),
  v.literal("document"),
  v.literal("screenshot")
);

// Legal basis for consent (GDPR)
export const legalBasisTypes = v.union(
  v.literal("consent"),
  v.literal("contract"),
  v.literal("legitimate_interest"),
  v.literal("legal_obligation")
);

// Neural embedding content types
export const neuralContentTypes = v.union(
  v.literal("text"),
  v.literal("audio"),
  v.literal("video"),
  v.literal("image"),
  v.literal("multimodal")
);

// Session termination reasons
export const sessionTerminationReasons = v.union(
  v.literal("user_logout"),
  v.literal("timeout"),
  v.literal("app_close"),
  v.literal("error"),
  v.literal("forced")
);

// Data deletion strategies
export const deletionStrategies = v.union(
  v.literal("hard_delete"),
  v.literal("soft_delete"),
  v.literal("anonymize"),
  v.literal("aggregate")
);

// Audit log actions for neural events
export const neuralAuditActions = v.union(
  v.literal("create"),
  v.literal("read"),
  v.literal("update"),
  v.literal("delete"),
  v.literal("export"),
  v.literal("consent_change"),
  v.literal("access_request")
);

// Modality flags validator for neural events
export const modalityFlags = v.object({
  text: v.boolean(),
  audio: v.boolean(),
  video: v.boolean(),
  image: v.boolean(),
  numeric: v.boolean(),
  biometric: v.boolean(),
  location: v.boolean(),
  interaction: v.boolean(),
});

// Scope consents validator
export const scopeConsents = v.object({
  essential: v.boolean(),
  functional: v.boolean(),
  analytics: v.boolean(),
  personalization: v.boolean(),
  biometric: v.boolean(),
  location: v.boolean(),
  media: v.boolean(),
  social: v.boolean(),
  behavioral: v.boolean(),
});

// App consents validator
export const appConsents = v.object({
  browser: v.boolean(),
  social: v.boolean(),
  tasks: v.boolean(),
  calendar: v.boolean(),
  fitness: v.boolean(),
  dating: v.boolean(),
  sleep: v.boolean(),
  email: v.boolean(),
  workouts: v.boolean(),
  location: v.boolean(),
  device: v.boolean(),
  media: v.boolean(),
  analytics: v.boolean(),
  health: v.boolean(),
  communication: v.boolean(),
});

// Intelligence level enum values
export const intelligenceLevels = v.union(
  v.literal("off"),
  v.literal("basic"),
  v.literal("enhanced"),
  v.literal("full")
);

// Consent state enum values
export const consentStates = v.union(
  v.literal("not_started"),
  v.literal("privacy_shown"),
  v.literal("features_explained"),
  v.literal("level_selected"),
  v.literal("confirmed"),
  v.literal("completed")
);

// Consent type enum values
export const consentTypes = v.union(
  v.literal("tracking"),
  v.literal("personalization"),
  v.literal("data_sharing"),
  v.literal("voice_processing"),
  v.literal("content_analysis")
);

// Export status enum values
export const exportStatuses = v.union(
  v.literal("pending"),
  v.literal("in_progress"),
  v.literal("completed"),
  v.literal("failed"),
  v.literal("cancelled")
);

// Knowledge graph node types
export const nodeTypes = v.union(
  v.literal("topic"),
  v.literal("entity"),
  v.literal("concept"),
  v.literal("action"),
  v.literal("preference")
);

// Content types for embeddings
export const contentTypes = v.union(
  v.literal("page"),
  v.literal("article"),
  v.literal("video"),
  v.literal("image"),
  v.literal("document"),
  v.literal("social"),
  v.literal("commerce")
);

// Intent types for voice embeddings
export const intentTypes = v.union(
  v.literal("navigation"),
  v.literal("search"),
  v.literal("command"),
  v.literal("question"),
  v.literal("dictation"),
  v.literal("unknown")
);

// Emotional tone markers
export const emotionalTones = v.union(
  v.literal("neutral"),
  v.literal("positive"),
  v.literal("negative"),
  v.literal("urgent"),
  v.literal("curious"),
  v.literal("frustrated")
);

export default defineSchema({
  // Users table - core user identity and preferences
  users: defineTable({
    clerkId: v.string(),
    email: v.string(),
    intelligenceLevel: intelligenceLevels,
    consentState: consentStates,
    preferences: v.object({
      defaultSearchEngine: v.optional(v.string()),
      voiceEnabled: v.optional(v.boolean()),
      hapticFeedback: v.optional(v.boolean()),
      contentBlockingLevel: v.optional(v.string()),
      syncEnabled: v.optional(v.boolean()),
      theme: v.optional(v.string()),
      fontSize: v.optional(v.number()),
      customSettings: v.optional(v.any()),
    }),
    createdAt: v.number(),
    updatedAt: v.optional(v.number()),
  })
    .index("by_clerkId", ["clerkId"])
    .index("by_email", ["email"]),

  // Browsing sessions table - tracks browsing session lifecycle
  browsingSessions: defineTable({
    userId: v.id("users"),
    startTime: v.number(),
    endTime: v.optional(v.number()),
    metadata: v.object({
      deviceType: v.optional(v.string()),
      osVersion: v.optional(v.string()),
      appVersion: v.optional(v.string()),
      networkType: v.optional(v.string()),
      tabCount: v.optional(v.number()),
      isPrivate: v.optional(v.boolean()),
    }),
    isActive: v.boolean(),
  })
    .index("by_userId", ["userId"])
    .index("by_userId_active", ["userId", "isActive"])
    .index("by_startTime", ["startTime"]),

  // Browsing events table - individual page visits and interactions
  browsingEvents: defineTable({
    sessionId: v.id("browsingSessions"),
    userId: v.id("users"),
    url: v.string(),
    urlHash: v.string(),
    category: v.optional(v.string()),
    dwellTime: v.optional(v.number()), // milliseconds
    scrollDepth: v.optional(v.number()), // percentage 0-100
    interactionVelocity: v.optional(v.number()), // interactions per minute
    intentLabel: v.optional(v.string()),
    timestamp: v.number(),
    metadata: v.optional(
      v.object({
        title: v.optional(v.string()),
        referrer: v.optional(v.string()),
        isBookmarked: v.optional(v.boolean()),
        wasShared: v.optional(v.boolean()),
      })
    ),
  })
    .index("by_sessionId", ["sessionId"])
    .index("by_userId", ["userId"])
    .index("by_userId_timestamp", ["userId", "timestamp"])
    .index("by_urlHash", ["urlHash"])
    .index("by_category", ["category"]),

  // Content embeddings table - vector representations of browsed content
  contentEmbeddings: defineTable({
    userId: v.id("users"),
    eventId: v.id("browsingEvents"),
    embedding: v.array(v.float64()),
    contentType: contentTypes,
    confidence: v.number(), // 0-1 confidence score
    namespace: v.string(), // for logical separation of embedding spaces
    createdAt: v.number(),
    metadata: v.optional(
      v.object({
        extractedTopics: v.optional(v.array(v.string())),
        sentiment: v.optional(v.number()),
        readabilityScore: v.optional(v.number()),
      })
    ),
  })
    .index("by_userId", ["userId"])
    .index("by_eventId", ["eventId"])
    .index("by_namespace", ["namespace"])
    .index("by_userId_namespace", ["userId", "namespace"])
    .vectorIndex("by_embedding", {
      vectorField: "embedding",
      dimensions: 1536, // OpenAI ada-002 dimensions
      filterFields: ["userId", "namespace", "contentType"],
    }),

  // Voice sessions table - tracks voice interaction sessions
  voiceSessions: defineTable({
    userId: v.id("users"),
    startTime: v.number(),
    endTime: v.optional(v.number()),
    transcription: v.optional(v.string()),
    emotionalTone: emotionalTones,
    intentMarkers: v.array(
      v.object({
        timestamp: v.number(),
        intent: intentTypes,
        confidence: v.number(),
        text: v.optional(v.string()),
      })
    ),
    isActive: v.boolean(),
    metadata: v.optional(
      v.object({
        duration: v.optional(v.number()),
        wordCount: v.optional(v.number()),
        languageCode: v.optional(v.string()),
      })
    ),
  })
    .index("by_userId", ["userId"])
    .index("by_userId_active", ["userId", "isActive"])
    .index("by_startTime", ["startTime"]),

  // Voice embeddings table - vector representations of voice interactions
  voiceEmbeddings: defineTable({
    userId: v.id("users"),
    sessionId: v.id("voiceSessions"),
    embedding: v.array(v.float64()),
    intentType: intentTypes,
    emotionalTrajectory: v.array(
      v.object({
        timestamp: v.number(),
        tone: emotionalTones,
        intensity: v.number(), // 0-1
      })
    ),
    confidence: v.number(),
    createdAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_sessionId", ["sessionId"])
    .vectorIndex("by_embedding", {
      vectorField: "embedding",
      dimensions: 1536,
      filterFields: ["userId", "intentType"],
    }),

  // Consent records table - granular consent tracking
  consentRecords: defineTable({
    userId: v.id("users"),
    domain: v.string(), // website domain or "global"
    consentType: consentTypes,
    granted: v.boolean(),
    timestamp: v.number(),
    version: v.string(), // consent policy version
    metadata: v.optional(
      v.object({
        source: v.optional(v.string()), // how consent was obtained
        expiresAt: v.optional(v.number()),
        revokedAt: v.optional(v.number()),
      })
    ),
  })
    .index("by_userId", ["userId"])
    .index("by_userId_domain", ["userId", "domain"])
    .index("by_userId_consentType", ["userId", "consentType"])
    .index("by_domain", ["domain"]),

  // Data exports table - tracks data export jobs
  dataExports: defineTable({
    userId: v.id("users"),
    targetAppId: v.string(),
    dataTypes: v.array(v.string()),
    encryptionKeyHash: v.string(),
    status: exportStatuses,
    lastSync: v.optional(v.number()),
    createdAt: v.number(),
    completedAt: v.optional(v.number()),
    metadata: v.optional(
      v.object({
        totalRecords: v.optional(v.number()),
        bytesExported: v.optional(v.number()),
        errorMessage: v.optional(v.string()),
      })
    ),
  })
    .index("by_userId", ["userId"])
    .index("by_status", ["status"])
    .index("by_userId_status", ["userId", "status"])
    .index("by_targetAppId", ["targetAppId"]),

  // Knowledge graph nodes table - user's personal knowledge graph
  knowledgeGraphNodes: defineTable({
    userId: v.id("users"),
    nodeType: nodeTypes,
    content: v.string(),
    connections: v.array(
      v.object({
        targetNodeId: v.id("knowledgeGraphNodes"),
        relationshipType: v.string(),
        weight: v.number(), // 0-1 connection strength
      })
    ),
    confidence: v.number(),
    createdAt: v.number(),
    updatedAt: v.optional(v.number()),
    metadata: v.optional(
      v.object({
        sourceEvents: v.optional(v.array(v.id("browsingEvents"))),
        extractionMethod: v.optional(v.string()),
        lastAccessed: v.optional(v.number()),
      })
    ),
  })
    .index("by_userId", ["userId"])
    .index("by_userId_nodeType", ["userId", "nodeType"])
    .index("by_nodeType", ["nodeType"]),

  // Audit logs table - comprehensive activity logging
  auditLogs: defineTable({
    userId: v.optional(v.id("users")), // optional for system-level events
    action: v.string(),
    details: v.object({
      resourceType: v.optional(v.string()),
      resourceId: v.optional(v.string()),
      previousValue: v.optional(v.any()),
      newValue: v.optional(v.any()),
      ipAddress: v.optional(v.string()),
      userAgent: v.optional(v.string()),
      success: v.boolean(),
      errorMessage: v.optional(v.string()),
    }),
    timestamp: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_action", ["action"])
    .index("by_timestamp", ["timestamp"])
    .index("by_userId_timestamp", ["userId", "timestamp"]),

  // ==========================================
  // NEURAL EVENTS TABLES
  // ==========================================

  // Neural events table - stores all captured neural events
  neuralEvents: defineTable({
    eventId: v.string(),
    userId: v.string(),
    sessionId: v.optional(v.string()),
    eventTypeId: v.string(),
    sourceApp: sourceApps,
    eventType: v.string(),
    clientTimestamp: v.number(),
    serverTimestamp: v.number(),
    timezoneOffset: v.optional(v.number()),
    payload: v.any(),
    modality: modalityFlags,
    sensitivityLevel: sensitivityLevels,
    consentVersion: v.string(),
    requiredScopes: v.array(privacyScopes),
    isProcessed: v.boolean(),
    processedAt: v.optional(v.number()),
    embeddingId: v.optional(v.id("neuralEmbeddings")),
    mediaIds: v.optional(v.array(v.id("mediaReferences"))),
    computedScores: v.optional(v.object({
      relevanceScore: v.optional(v.number()),
      engagementScore: v.optional(v.number()),
      importanceScore: v.optional(v.number()),
    })),
    deviceInfo: v.optional(v.object({
      deviceId: v.string(),
      platform: v.string(),
      osVersion: v.string(),
      appVersion: v.string(),
    })),
    isDeleted: v.boolean(),
    deletedAt: v.optional(v.number()),
  })
    .index("by_user", ["userId", "serverTimestamp"])
    .index("by_user_and_type", ["userId", "eventTypeId", "serverTimestamp"])
    .index("by_user_and_app", ["userId", "sourceApp", "serverTimestamp"])
    .index("by_event_id", ["eventId"])
    .index("by_session", ["sessionId", "serverTimestamp"])
    .index("by_processing_status", ["isProcessed", "serverTimestamp"])
    .index("by_sensitivity", ["sensitivityLevel", "serverTimestamp"])
    .index("by_deleted", ["isDeleted", "deletedAt"]),

  // Media references table - links to object storage for binary media
  mediaReferences: defineTable({
    userId: v.string(),
    eventId: v.optional(v.id("neuralEvents")),
    mediaType: neuralMediaTypes,
    mimeType: v.string(),
    sizeBytes: v.number(),
    durationMs: v.optional(v.number()),
    storageId: v.id("_storage"),
    storageUrl: v.optional(v.string()),
    transcription: v.optional(v.string()),
    ocrText: v.optional(v.string()),
    sceneDescription: v.optional(v.string()),
    embeddings: v.optional(v.array(v.float64())),
    sensitivityLevel: sensitivityLevels,
    isEncrypted: v.boolean(),
    encryptionKeyId: v.optional(v.string()),
    createdAt: v.number(),
    expiresAt: v.optional(v.number()),
    isDeleted: v.boolean(),
    deletedAt: v.optional(v.number()),
  })
    .index("by_user", ["userId", "createdAt"])
    .index("by_event", ["eventId"])
    .index("by_type", ["mediaType", "createdAt"])
    .index("by_expiration", ["expiresAt"])
    .index("by_deleted", ["isDeleted", "deletedAt"]),

  // Neural consent records table - comprehensive consent tracking for neural events
  neuralConsentRecords: defineTable({
    userId: v.string(),
    consentVersion: v.string(),
    scopeConsents: scopeConsents,
    appConsents: v.optional(appConsents),
    ipAddress: v.optional(v.string()),
    userAgent: v.optional(v.string()),
    grantedAt: v.number(),
    expiresAt: v.optional(v.number()),
    isActive: v.boolean(),
    revokedAt: v.optional(v.number()),
    revocationReason: v.optional(v.string()),
    legalBasis: legalBasisTypes,
    jurisdictions: v.array(v.string()),
    previousVersionId: v.optional(v.id("neuralConsentRecords")),
  })
    .index("by_user", ["userId", "grantedAt"])
    .index("by_user_active", ["userId", "isActive"])
    .index("by_version", ["userId", "consentVersion"])
    .index("by_expiration", ["expiresAt", "isActive"]),

  // User sessions table - tracks user sessions for neural events
  userSessions: defineTable({
    sessionId: v.string(),
    userId: v.string(),
    startedAt: v.number(),
    lastActivityAt: v.number(),
    endedAt: v.optional(v.number()),
    deviceInfo: v.object({
      deviceId: v.string(),
      platform: v.string(),
      osVersion: v.string(),
      appVersion: v.string(),
      screenResolution: v.optional(v.string()),
      language: v.optional(v.string()),
    }),
    locationContext: v.optional(v.object({
      country: v.optional(v.string()),
      region: v.optional(v.string()),
      city: v.optional(v.string()),
      timezone: v.string(),
    })),
    eventCount: v.number(),
    uniqueEventTypes: v.array(v.string()),
    isActive: v.boolean(),
    terminationReason: v.optional(sessionTerminationReasons),
  })
    .index("by_session_id", ["sessionId"])
    .index("by_user", ["userId", "startedAt"])
    .index("by_user_active", ["userId", "isActive"])
    .index("by_activity", ["lastActivityAt"]),

  // Neural embeddings table - stores vector embeddings for semantic search
  neuralEmbeddings: defineTable({
    userId: v.string(),
    sourceEventId: v.optional(v.id("neuralEvents")),
    sourceMediaId: v.optional(v.id("mediaReferences")),
    embeddingVector: v.array(v.float64()),
    dimensions: v.number(),
    modelName: v.string(),
    modelVersion: v.string(),
    contentType: neuralContentTypes,
    contentSummary: v.optional(v.string()),
    contentHash: v.string(),
    createdAt: v.number(),
    expiresAt: v.optional(v.number()),
    qualityScore: v.optional(v.number()),
  })
    .index("by_user", ["userId", "createdAt"])
    .index("by_source_event", ["sourceEventId"])
    .index("by_source_media", ["sourceMediaId"])
    .index("by_content_hash", ["contentHash"])
    .index("by_content_type", ["contentType", "createdAt"])
    .searchIndex("search_content", {
      searchField: "contentSummary",
      filterFields: ["userId", "contentType"],
    }),

  // Neural audit log table - comprehensive activity logging for neural events
  auditLog: defineTable({
    userId: v.optional(v.string()),
    systemActor: v.optional(v.string()),
    action: neuralAuditActions,
    resourceType: v.string(),
    resourceId: v.optional(v.string()),
    ipAddress: v.optional(v.string()),
    userAgent: v.optional(v.string()),
    requestId: v.optional(v.string()),
    timestamp: v.number(),
    details: v.optional(v.any()),
    isDataSubjectRequest: v.boolean(),
    regulatoryContext: v.optional(v.array(v.string())),
  })
    .index("by_user", ["userId", "timestamp"])
    .index("by_resource", ["resourceType", "resourceId", "timestamp"])
    .index("by_action", ["action", "timestamp"])
    .index("by_dsr", ["isDataSubjectRequest", "timestamp"]),

  // Data retention policies table - configures retention policies
  dataRetentionPolicies: defineTable({
    policyId: v.string(),
    eventTypeId: v.optional(v.string()),
    userId: v.optional(v.string()),
    retentionDays: v.number(),
    deletionStrategy: deletionStrategies,
    legalHoldOverride: v.boolean(),
    userRequestOverride: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
    createdBy: v.string(),
    isActive: v.boolean(),
  })
    .index("by_event_type", ["eventTypeId", "isActive"])
    .index("by_user", ["userId", "isActive"])
    .index("by_policy_id", ["policyId"]),
});
