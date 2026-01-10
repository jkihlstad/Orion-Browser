/**
 * Neural Events - Convex Schema Definitions
 *
 * Defines the database schema for the neural events system including
 * events, media references, consent records, and user sessions.
 */

import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

// Shared validators for reuse across tables
const modalityValidator = v.object({
  text: v.boolean(),
  audio: v.boolean(),
  video: v.boolean(),
  image: v.boolean(),
  numeric: v.boolean(),
  biometric: v.boolean(),
  location: v.boolean(),
  interaction: v.boolean(),
});

const privacyScopeValidator = v.union(
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

const sourceAppValidator = v.union(
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

const sensitivityLevelValidator = v.union(
  v.literal("low"),
  v.literal("medium"),
  v.literal("high"),
  v.literal("critical")
);

/**
 * Neural Events Database Schema
 */
export default defineSchema({
  // ============================================================
  // NEURAL EVENTS TABLE
  // Core table for storing all captured neural events
  // ============================================================
  neuralEvents: defineTable({
    // Unique identifiers
    eventId: v.string(),           // Client-generated UUID for idempotency
    userId: v.string(),            // User identifier
    sessionId: v.optional(v.string()), // Session identifier

    // Event classification
    eventTypeId: v.string(),       // References EventTypeDefinition.id
    sourceApp: sourceAppValidator,
    eventType: v.string(),         // The specific event type name

    // Timing
    clientTimestamp: v.number(),   // Unix timestamp when event occurred on device
    serverTimestamp: v.number(),   // Unix timestamp when event was received
    timezoneOffset: v.optional(v.number()), // Client timezone offset in minutes

    // Event payload
    payload: v.any(),              // Flexible JSON payload for event-specific data

    // Modality flags
    modality: modalityValidator,

    // Privacy & compliance
    sensitivityLevel: sensitivityLevelValidator,
    consentVersion: v.string(),    // Version of consent at time of capture
    requiredScopes: v.array(privacyScopeValidator),

    // Processing status
    isProcessed: v.boolean(),      // Whether AI processing is complete
    processedAt: v.optional(v.number()),

    // Vector embedding reference
    embeddingId: v.optional(v.id("neuralEmbeddings")),

    // Media references
    mediaIds: v.optional(v.array(v.id("mediaReferences"))),

    // Computed fields
    computedScores: v.optional(v.object({
      relevanceScore: v.optional(v.number()),
      engagementScore: v.optional(v.number()),
      importanceScore: v.optional(v.number()),
    })),

    // Metadata
    deviceInfo: v.optional(v.object({
      deviceId: v.string(),
      platform: v.string(),
      osVersion: v.string(),
      appVersion: v.string(),
    })),

    // Soft delete support
    isDeleted: v.boolean(),
    deletedAt: v.optional(v.number()),
  })
    // Primary indexes for common queries
    .index("by_user", ["userId", "serverTimestamp"])
    .index("by_user_and_type", ["userId", "eventTypeId", "serverTimestamp"])
    .index("by_user_and_app", ["userId", "sourceApp", "serverTimestamp"])
    .index("by_event_id", ["eventId"])  // For idempotency checks
    .index("by_session", ["sessionId", "serverTimestamp"])
    .index("by_processing_status", ["isProcessed", "serverTimestamp"])
    .index("by_sensitivity", ["sensitivityLevel", "serverTimestamp"])
    .index("by_deleted", ["isDeleted", "deletedAt"]),

  // ============================================================
  // MEDIA REFERENCES TABLE
  // Links to object storage for binary media (images, audio, video)
  // ============================================================
  mediaReferences: defineTable({
    // Ownership
    userId: v.string(),
    eventId: v.optional(v.id("neuralEvents")),

    // Media metadata
    mediaType: v.union(
      v.literal("image"),
      v.literal("audio"),
      v.literal("video"),
      v.literal("document"),
      v.literal("screenshot")
    ),
    mimeType: v.string(),
    sizeBytes: v.number(),
    durationMs: v.optional(v.number()), // For audio/video

    // Storage reference
    storageId: v.id("_storage"),  // Convex file storage ID
    storageUrl: v.optional(v.string()),

    // Processing metadata
    transcription: v.optional(v.string()),
    ocrText: v.optional(v.string()),
    sceneDescription: v.optional(v.string()),
    embeddings: v.optional(v.array(v.float64())),

    // Privacy
    sensitivityLevel: sensitivityLevelValidator,
    isEncrypted: v.boolean(),
    encryptionKeyId: v.optional(v.string()),

    // Timestamps
    createdAt: v.number(),
    expiresAt: v.optional(v.number()),

    // Soft delete
    isDeleted: v.boolean(),
    deletedAt: v.optional(v.number()),
  })
    .index("by_user", ["userId", "createdAt"])
    .index("by_event", ["eventId"])
    .index("by_type", ["mediaType", "createdAt"])
    .index("by_expiration", ["expiresAt"])
    .index("by_deleted", ["isDeleted", "deletedAt"]),

  // ============================================================
  // CONSENT RECORDS TABLE
  // Tracks user consent status and history for compliance
  // ============================================================
  consentRecords: defineTable({
    // User identification
    userId: v.string(),

    // Consent details
    consentVersion: v.string(),
    scopeConsents: v.object({
      essential: v.boolean(),
      functional: v.boolean(),
      analytics: v.boolean(),
      personalization: v.boolean(),
      biometric: v.boolean(),
      location: v.boolean(),
      media: v.boolean(),
      social: v.boolean(),
      behavioral: v.boolean(),
    }),

    // Granular app-level consents
    appConsents: v.optional(v.object({
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
    })),

    // Consent metadata
    ipAddress: v.optional(v.string()),
    userAgent: v.optional(v.string()),
    grantedAt: v.number(),
    expiresAt: v.optional(v.number()),

    // Status
    isActive: v.boolean(),
    revokedAt: v.optional(v.number()),
    revocationReason: v.optional(v.string()),

    // Compliance tracking
    legalBasis: v.union(
      v.literal("consent"),
      v.literal("contract"),
      v.literal("legitimate_interest"),
      v.literal("legal_obligation")
    ),
    jurisdictions: v.array(v.string()), // ["gdpr", "ccpa", "hipaa"]

    // Audit trail
    previousVersionId: v.optional(v.id("consentRecords")),
  })
    .index("by_user", ["userId", "grantedAt"])
    .index("by_user_active", ["userId", "isActive"])
    .index("by_version", ["userId", "consentVersion"])
    .index("by_expiration", ["expiresAt", "isActive"]),

  // ============================================================
  // USER SESSIONS TABLE
  // Tracks user sessions for event correlation
  // ============================================================
  userSessions: defineTable({
    // Session identification
    sessionId: v.string(),
    userId: v.string(),

    // Session timing
    startedAt: v.number(),
    lastActivityAt: v.number(),
    endedAt: v.optional(v.number()),

    // Session metadata
    deviceInfo: v.object({
      deviceId: v.string(),
      platform: v.string(),
      osVersion: v.string(),
      appVersion: v.string(),
      screenResolution: v.optional(v.string()),
      language: v.optional(v.string()),
    }),

    // Location context (if consented)
    locationContext: v.optional(v.object({
      country: v.optional(v.string()),
      region: v.optional(v.string()),
      city: v.optional(v.string()),
      timezone: v.string(),
    })),

    // Session stats
    eventCount: v.number(),
    uniqueEventTypes: v.array(v.string()),

    // Status
    isActive: v.boolean(),
    terminationReason: v.optional(v.union(
      v.literal("user_logout"),
      v.literal("timeout"),
      v.literal("app_close"),
      v.literal("error"),
      v.literal("forced")
    )),
  })
    .index("by_session_id", ["sessionId"])
    .index("by_user", ["userId", "startedAt"])
    .index("by_user_active", ["userId", "isActive"])
    .index("by_activity", ["lastActivityAt"]),

  // ============================================================
  // NEURAL EMBEDDINGS TABLE
  // Stores vector embeddings for semantic search
  // ============================================================
  neuralEmbeddings: defineTable({
    // Source reference
    userId: v.string(),
    sourceEventId: v.optional(v.id("neuralEvents")),
    sourceMediaId: v.optional(v.id("mediaReferences")),

    // Embedding data
    embeddingVector: v.array(v.float64()),
    dimensions: v.number(),
    modelName: v.string(),  // e.g., "text-embedding-ada-002"
    modelVersion: v.string(),

    // Content type
    contentType: v.union(
      v.literal("text"),
      v.literal("audio"),
      v.literal("video"),
      v.literal("image"),
      v.literal("multimodal")
    ),

    // Source content summary (for debugging/inspection)
    contentSummary: v.optional(v.string()),
    contentHash: v.string(),  // For deduplication

    // Metadata
    createdAt: v.number(),
    expiresAt: v.optional(v.number()),

    // Quality metrics
    qualityScore: v.optional(v.number()),
  })
    // Note: Vector index defined separately for vector search
    .index("by_user", ["userId", "createdAt"])
    .index("by_source_event", ["sourceEventId"])
    .index("by_source_media", ["sourceMediaId"])
    .index("by_content_hash", ["contentHash"])
    .index("by_content_type", ["contentType", "createdAt"])
    .searchIndex("search_content", {
      searchField: "contentSummary",
      filterFields: ["userId", "contentType"],
    }),

  // ============================================================
  // AUDIT LOG TABLE
  // Tracks all data access and modifications for compliance
  // ============================================================
  auditLog: defineTable({
    // Actor identification
    userId: v.optional(v.string()),
    systemActor: v.optional(v.string()),

    // Action details
    action: v.union(
      v.literal("create"),
      v.literal("read"),
      v.literal("update"),
      v.literal("delete"),
      v.literal("export"),
      v.literal("consent_change"),
      v.literal("access_request")
    ),
    resourceType: v.string(),
    resourceId: v.optional(v.string()),

    // Request context
    ipAddress: v.optional(v.string()),
    userAgent: v.optional(v.string()),
    requestId: v.optional(v.string()),

    // Audit data
    timestamp: v.number(),
    details: v.optional(v.any()),

    // Compliance flags
    isDataSubjectRequest: v.boolean(),
    regulatoryContext: v.optional(v.array(v.string())),
  })
    .index("by_user", ["userId", "timestamp"])
    .index("by_resource", ["resourceType", "resourceId", "timestamp"])
    .index("by_action", ["action", "timestamp"])
    .index("by_dsr", ["isDataSubjectRequest", "timestamp"]),

  // ============================================================
  // DATA RETENTION POLICIES TABLE
  // Configures retention policies per event type
  // ============================================================
  dataRetentionPolicies: defineTable({
    // Policy identification
    policyId: v.string(),
    eventTypeId: v.optional(v.string()),  // null = default policy
    userId: v.optional(v.string()),       // null = global policy

    // Retention rules
    retentionDays: v.number(),
    deletionStrategy: v.union(
      v.literal("hard_delete"),
      v.literal("soft_delete"),
      v.literal("anonymize"),
      v.literal("aggregate")
    ),

    // Exceptions
    legalHoldOverride: v.boolean(),
    userRequestOverride: v.boolean(),

    // Metadata
    createdAt: v.number(),
    updatedAt: v.number(),
    createdBy: v.string(),

    // Status
    isActive: v.boolean(),
  })
    .index("by_event_type", ["eventTypeId", "isActive"])
    .index("by_user", ["userId", "isActive"])
    .index("by_policy_id", ["policyId"]),
});

// Export type helpers for use in functions
export type NeuralEventDoc = {
  eventId: string;
  userId: string;
  sessionId?: string;
  eventTypeId: string;
  sourceApp: string;
  eventType: string;
  clientTimestamp: number;
  serverTimestamp: number;
  timezoneOffset?: number;
  payload: unknown;
  modality: {
    text: boolean;
    audio: boolean;
    video: boolean;
    image: boolean;
    numeric: boolean;
    biometric: boolean;
    location: boolean;
    interaction: boolean;
  };
  sensitivityLevel: "low" | "medium" | "high" | "critical";
  consentVersion: string;
  requiredScopes: string[];
  isProcessed: boolean;
  processedAt?: number;
  embeddingId?: string;
  mediaIds?: string[];
  computedScores?: {
    relevanceScore?: number;
    engagementScore?: number;
    importanceScore?: number;
  };
  deviceInfo?: {
    deviceId: string;
    platform: string;
    osVersion: string;
    appVersion: string;
  };
  isDeleted: boolean;
  deletedAt?: number;
};
