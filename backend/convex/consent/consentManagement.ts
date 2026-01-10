/**
 * Consent Management System
 *
 * Handles user consent for data collection across different privacy scopes.
 * Implements GDPR/CCPA compliant consent tracking with versioning and audit trails.
 */

import { mutation, query, internalMutation } from "../_generated/server";
import { v } from "convex/values";
import type { Id, Doc } from "../id";
import { PrivacyScopes, SourceApps } from "../neuralEvents/eventTypes";

// ============================================================
// VALIDATORS
// ============================================================

const scopeConsentsValidator = v.object({
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

const appConsentsValidator = v.object({
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

const legalBasisValidator = v.union(
  v.literal("consent"),
  v.literal("contract"),
  v.literal("legitimate_interest"),
  v.literal("legal_obligation")
);

// ============================================================
// CONSENT VERSION MANAGEMENT
// ============================================================

/**
 * Generate a new consent version string
 */
function generateConsentVersion(): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  return `v${timestamp}-${random}`;
}

/**
 * Default scope consents (all false except essential)
 */
const DEFAULT_SCOPE_CONSENTS = {
  essential: true, // Always required
  functional: false,
  analytics: false,
  personalization: false,
  biometric: false,
  location: false,
  media: false,
  social: false,
  behavioral: false,
};

/**
 * Default app consents (all false)
 */
const DEFAULT_APP_CONSENTS = {
  browser: false,
  social: false,
  tasks: false,
  calendar: false,
  fitness: false,
  dating: false,
  sleep: false,
  email: false,
  workouts: false,
  location: false,
  device: false,
  media: false,
  analytics: false,
  health: false,
  communication: false,
};

// ============================================================
// CONSENT QUERIES
// ============================================================

/**
 * Get the current consent state for a user
 */
export const getConsentState = query({
  args: {
    userId: v.string(),
  },
  returns: v.union(
    v.object({
      hasConsent: v.literal(true),
      consentVersion: v.string(),
      scopeConsents: scopeConsentsValidator,
      appConsents: v.union(appConsentsValidator, v.null()),
      legalBasis: legalBasisValidator,
      jurisdictions: v.array(v.string()),
      grantedAt: v.number(),
      expiresAt: v.union(v.number(), v.null()),
    }),
    v.object({
      hasConsent: v.literal(false),
      reason: v.string(),
    })
  ),
  handler: async (ctx, args) => {
    const { userId } = args;

    const activeConsent = await ctx.db
      .query("consentRecords")
      .withIndex("by_user_active", (q) =>
        q.eq("userId", userId).eq("isActive", true)
      )
      .first();

    if (!activeConsent) {
      return {
        hasConsent: false,
        reason: "No active consent record found",
      };
    }

    // Check if consent has expired
    if (activeConsent.expiresAt && activeConsent.expiresAt < Date.now()) {
      return {
        hasConsent: false,
        reason: "Consent has expired",
      };
    }

    return {
      hasConsent: true,
      consentVersion: activeConsent.consentVersion,
      scopeConsents: activeConsent.scopeConsents,
      appConsents: activeConsent.appConsents || null,
      legalBasis: activeConsent.legalBasis,
      jurisdictions: activeConsent.jurisdictions,
      grantedAt: activeConsent.grantedAt,
      expiresAt: activeConsent.expiresAt || null,
    };
  },
});

/**
 * Get full consent history for a user
 */
export const getConsentHistory = query({
  args: {
    userId: v.string(),
    limit: v.optional(v.number()),
  },
  returns: v.array(v.any()),
  handler: async (ctx, args) => {
    const { userId, limit = 50 } = args;

    const history = await ctx.db
      .query("consentRecords")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .take(limit);

    return history;
  },
});

/**
 * Check if user has consent for specific scopes
 */
export const checkScopeConsent = query({
  args: {
    userId: v.string(),
    scopes: v.array(v.string()),
  },
  returns: v.object({
    hasAllScopes: v.boolean(),
    grantedScopes: v.array(v.string()),
    missingScopes: v.array(v.string()),
    consentVersion: v.union(v.string(), v.null()),
  }),
  handler: async (ctx, args) => {
    const { userId, scopes } = args;

    const activeConsent = await ctx.db
      .query("consentRecords")
      .withIndex("by_user_active", (q) =>
        q.eq("userId", userId).eq("isActive", true)
      )
      .first();

    if (!activeConsent) {
      return {
        hasAllScopes: false,
        grantedScopes: [],
        missingScopes: scopes,
        consentVersion: null,
      };
    }

    // Check expiration
    if (activeConsent.expiresAt && activeConsent.expiresAt < Date.now()) {
      return {
        hasAllScopes: false,
        grantedScopes: [],
        missingScopes: scopes,
        consentVersion: null,
      };
    }

    const grantedScopes: string[] = [];
    const missingScopes: string[] = [];

    for (const scope of scopes) {
      const scopeKey = scope as keyof typeof activeConsent.scopeConsents;
      if (activeConsent.scopeConsents[scopeKey]) {
        grantedScopes.push(scope);
      } else {
        missingScopes.push(scope);
      }
    }

    return {
      hasAllScopes: missingScopes.length === 0,
      grantedScopes,
      missingScopes,
      consentVersion: activeConsent.consentVersion,
    };
  },
});

// ============================================================
// CONSENT MUTATIONS
// ============================================================

/**
 * Create or update user consent
 */
export const updateConsent = mutation({
  args: {
    userId: v.string(),
    scopeConsents: scopeConsentsValidator,
    appConsents: v.optional(appConsentsValidator),
    legalBasis: legalBasisValidator,
    jurisdictions: v.array(v.string()),
    ipAddress: v.optional(v.string()),
    userAgent: v.optional(v.string()),
    expiresAt: v.optional(v.number()),
  },
  returns: v.object({
    success: v.boolean(),
    consentVersion: v.string(),
    previousVersion: v.union(v.string(), v.null()),
    error: v.optional(v.string()),
  }),
  handler: async (ctx, args) => {
    const {
      userId,
      scopeConsents,
      appConsents,
      legalBasis,
      jurisdictions,
      ipAddress,
      userAgent,
      expiresAt,
    } = args;

    const timestamp = Date.now();
    const newVersion = generateConsentVersion();

    // Find and deactivate current active consent
    const currentConsent = await ctx.db
      .query("consentRecords")
      .withIndex("by_user_active", (q) =>
        q.eq("userId", userId).eq("isActive", true)
      )
      .first();

    let previousVersionId: Id<"consentRecords"> | undefined;
    let previousVersion: string | null = null;

    if (currentConsent) {
      previousVersionId = currentConsent._id;
      previousVersion = currentConsent.consentVersion;

      // Deactivate the old consent
      await ctx.db.patch(currentConsent._id, {
        isActive: false,
        revokedAt: timestamp,
        revocationReason: "superseded_by_new_consent",
      });
    }

    // Create new consent record
    try {
      await ctx.db.insert("consentRecords", {
        userId,
        consentVersion: newVersion,
        scopeConsents: {
          ...scopeConsents,
          essential: true, // Always enforce essential
        },
        appConsents,
        ipAddress,
        userAgent,
        grantedAt: timestamp,
        expiresAt,
        isActive: true,
        legalBasis,
        jurisdictions,
        previousVersionId,
      });

      // Create audit log entry
      await ctx.db.insert("auditLog", {
        userId,
        action: "consent_change",
        resourceType: "consentRecords",
        resourceId: newVersion,
        timestamp,
        details: {
          previousVersion,
          newVersion,
          scopeChanges: currentConsent
            ? calculateScopeChanges(
                currentConsent.scopeConsents,
                scopeConsents
              )
            : null,
        },
        isDataSubjectRequest: false,
        regulatoryContext: jurisdictions,
      });

      return {
        success: true,
        consentVersion: newVersion,
        previousVersion,
      };
    } catch (error) {
      return {
        success: false,
        consentVersion: "",
        previousVersion,
        error: error instanceof Error ? error.message : "Failed to update consent",
      };
    }
  },
});

/**
 * Grant consent for initial setup
 */
export const grantInitialConsent = mutation({
  args: {
    userId: v.string(),
    acceptedScopes: v.array(v.string()),
    legalBasis: legalBasisValidator,
    jurisdictions: v.array(v.string()),
    ipAddress: v.optional(v.string()),
    userAgent: v.optional(v.string()),
  },
  returns: v.object({
    success: v.boolean(),
    consentVersion: v.string(),
    error: v.optional(v.string()),
  }),
  handler: async (ctx, args) => {
    const {
      userId,
      acceptedScopes,
      legalBasis,
      jurisdictions,
      ipAddress,
      userAgent,
    } = args;

    // Check if user already has active consent
    const existingConsent = await ctx.db
      .query("consentRecords")
      .withIndex("by_user_active", (q) =>
        q.eq("userId", userId).eq("isActive", true)
      )
      .first();

    if (existingConsent) {
      return {
        success: false,
        consentVersion: existingConsent.consentVersion,
        error: "User already has active consent. Use updateConsent instead.",
      };
    }

    const timestamp = Date.now();
    const newVersion = generateConsentVersion();

    // Build scope consents from accepted scopes
    const scopeConsents = { ...DEFAULT_SCOPE_CONSENTS };
    for (const scope of acceptedScopes) {
      const scopeKey = scope as keyof typeof scopeConsents;
      if (scopeKey in scopeConsents) {
        scopeConsents[scopeKey] = true;
      }
    }

    try {
      await ctx.db.insert("consentRecords", {
        userId,
        consentVersion: newVersion,
        scopeConsents,
        ipAddress,
        userAgent,
        grantedAt: timestamp,
        isActive: true,
        legalBasis,
        jurisdictions,
      });

      // Create audit log entry
      await ctx.db.insert("auditLog", {
        userId,
        action: "consent_change",
        resourceType: "consentRecords",
        resourceId: newVersion,
        timestamp,
        details: {
          type: "initial_consent",
          acceptedScopes,
        },
        isDataSubjectRequest: false,
        regulatoryContext: jurisdictions,
      });

      return {
        success: true,
        consentVersion: newVersion,
      };
    } catch (error) {
      return {
        success: false,
        consentVersion: "",
        error: error instanceof Error ? error.message : "Failed to grant consent",
      };
    }
  },
});

/**
 * Revoke all consent for a user
 */
export const revokeAllConsent = mutation({
  args: {
    userId: v.string(),
    reason: v.optional(v.string()),
  },
  returns: v.object({
    success: v.boolean(),
    revokedVersion: v.union(v.string(), v.null()),
    error: v.optional(v.string()),
  }),
  handler: async (ctx, args) => {
    const { userId, reason = "user_requested" } = args;
    const timestamp = Date.now();

    const activeConsent = await ctx.db
      .query("consentRecords")
      .withIndex("by_user_active", (q) =>
        q.eq("userId", userId).eq("isActive", true)
      )
      .first();

    if (!activeConsent) {
      return {
        success: true,
        revokedVersion: null,
      };
    }

    try {
      await ctx.db.patch(activeConsent._id, {
        isActive: false,
        revokedAt: timestamp,
        revocationReason: reason,
      });

      // Create audit log entry
      await ctx.db.insert("auditLog", {
        userId,
        action: "consent_change",
        resourceType: "consentRecords",
        resourceId: activeConsent.consentVersion,
        timestamp,
        details: {
          type: "revoke_all",
          reason,
        },
        isDataSubjectRequest: true,
        regulatoryContext: activeConsent.jurisdictions,
      });

      return {
        success: true,
        revokedVersion: activeConsent.consentVersion,
      };
    } catch (error) {
      return {
        success: false,
        revokedVersion: null,
        error: error instanceof Error ? error.message : "Failed to revoke consent",
      };
    }
  },
});

/**
 * Update specific scope consent
 */
export const updateScopeConsent = mutation({
  args: {
    userId: v.string(),
    scope: v.string(),
    granted: v.boolean(),
  },
  returns: v.object({
    success: v.boolean(),
    newVersion: v.union(v.string(), v.null()),
    error: v.optional(v.string()),
  }),
  handler: async (ctx, args) => {
    const { userId, scope, granted } = args;
    const timestamp = Date.now();

    // Essential scope cannot be revoked
    if (scope === "essential" && !granted) {
      return {
        success: false,
        newVersion: null,
        error: "Essential scope cannot be revoked",
      };
    }

    const activeConsent = await ctx.db
      .query("consentRecords")
      .withIndex("by_user_active", (q) =>
        q.eq("userId", userId).eq("isActive", true)
      )
      .first();

    if (!activeConsent) {
      return {
        success: false,
        newVersion: null,
        error: "No active consent found. Please grant initial consent first.",
      };
    }

    const scopeKey = scope as keyof typeof activeConsent.scopeConsents;
    if (!(scopeKey in activeConsent.scopeConsents)) {
      return {
        success: false,
        newVersion: null,
        error: `Invalid scope: ${scope}`,
      };
    }

    // Check if scope is already in desired state
    if (activeConsent.scopeConsents[scopeKey] === granted) {
      return {
        success: true,
        newVersion: activeConsent.consentVersion,
      };
    }

    // Create new consent record with updated scope
    const newVersion = generateConsentVersion();
    const newScopeConsents = {
      ...activeConsent.scopeConsents,
      [scopeKey]: granted,
    };

    try {
      // Deactivate old consent
      await ctx.db.patch(activeConsent._id, {
        isActive: false,
        revokedAt: timestamp,
        revocationReason: "scope_update",
      });

      // Create new consent
      await ctx.db.insert("consentRecords", {
        userId,
        consentVersion: newVersion,
        scopeConsents: newScopeConsents,
        appConsents: activeConsent.appConsents,
        grantedAt: timestamp,
        expiresAt: activeConsent.expiresAt,
        isActive: true,
        legalBasis: activeConsent.legalBasis,
        jurisdictions: activeConsent.jurisdictions,
        previousVersionId: activeConsent._id,
      });

      // Audit log
      await ctx.db.insert("auditLog", {
        userId,
        action: "consent_change",
        resourceType: "consentRecords",
        resourceId: newVersion,
        timestamp,
        details: {
          type: "scope_update",
          scope,
          previousValue: activeConsent.scopeConsents[scopeKey],
          newValue: granted,
        },
        isDataSubjectRequest: false,
        regulatoryContext: activeConsent.jurisdictions,
      });

      return {
        success: true,
        newVersion,
      };
    } catch (error) {
      return {
        success: false,
        newVersion: null,
        error: error instanceof Error ? error.message : "Failed to update scope",
      };
    }
  },
});

// ============================================================
// DATA SUBJECT REQUESTS (GDPR)
// ============================================================

/**
 * Request data export (GDPR Article 20)
 */
export const requestDataExport = mutation({
  args: {
    userId: v.string(),
    format: v.optional(v.union(v.literal("json"), v.literal("csv"))),
  },
  returns: v.object({
    success: v.boolean(),
    requestId: v.string(),
    estimatedCompletionTime: v.number(),
  }),
  handler: async (ctx, args) => {
    const { userId, format = "json" } = args;
    const timestamp = Date.now();
    const requestId = `export_${timestamp}_${Math.random().toString(36).substring(2, 8)}`;

    // Create audit entry for data export request
    await ctx.db.insert("auditLog", {
      userId,
      action: "export",
      resourceType: "user_data",
      requestId,
      timestamp,
      details: { format },
      isDataSubjectRequest: true,
      regulatoryContext: ["gdpr"],
    });

    return {
      success: true,
      requestId,
      estimatedCompletionTime: timestamp + 24 * 60 * 60 * 1000, // 24 hours
    };
  },
});

/**
 * Request data deletion (GDPR Article 17 - Right to be Forgotten)
 */
export const requestDataDeletion = mutation({
  args: {
    userId: v.string(),
    scope: v.union(
      v.literal("all"),
      v.literal("personal"),
      v.literal("behavioral")
    ),
    reason: v.optional(v.string()),
  },
  returns: v.object({
    success: v.boolean(),
    requestId: v.string(),
    dataToBeDeleted: v.array(v.string()),
    estimatedCompletionTime: v.number(),
  }),
  handler: async (ctx, args) => {
    const { userId, scope, reason } = args;
    const timestamp = Date.now();
    const requestId = `deletion_${timestamp}_${Math.random().toString(36).substring(2, 8)}`;

    // Determine what data will be deleted
    const dataToBeDeleted: string[] = [];

    if (scope === "all" || scope === "personal") {
      dataToBeDeleted.push(
        "neuralEvents",
        "mediaReferences",
        "userSessions",
        "neuralEmbeddings"
      );
    }

    if (scope === "all") {
      dataToBeDeleted.push("consentRecords"); // Keep audit log for compliance
    }

    // Create audit entry
    await ctx.db.insert("auditLog", {
      userId,
      action: "access_request",
      resourceType: "deletion_request",
      requestId,
      timestamp,
      details: {
        scope,
        reason,
        dataToBeDeleted,
      },
      isDataSubjectRequest: true,
      regulatoryContext: ["gdpr"],
    });

    return {
      success: true,
      requestId,
      dataToBeDeleted,
      estimatedCompletionTime: timestamp + 30 * 24 * 60 * 60 * 1000, // 30 days
    };
  },
});

// ============================================================
// INTERNAL MUTATIONS
// ============================================================

/**
 * Internal: Expire old consents
 */
export const expireOldConsents = internalMutation({
  args: {
    batchSize: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { batchSize = 100 } = args;
    const now = Date.now();

    const expiredConsents = await ctx.db
      .query("consentRecords")
      .withIndex("by_expiration", (q) => q.lt("expiresAt", now).eq("isActive", true))
      .take(batchSize);

    let expired = 0;
    for (const consent of expiredConsents) {
      await ctx.db.patch(consent._id, {
        isActive: false,
        revokedAt: now,
        revocationReason: "expired",
      });
      expired++;
    }

    return { expired };
  },
});

// ============================================================
// HELPER FUNCTIONS
// ============================================================

/**
 * Calculate changes between two scope consent objects
 */
function calculateScopeChanges(
  oldConsents: Record<string, boolean>,
  newConsents: Record<string, boolean>
): Record<string, { from: boolean; to: boolean }> {
  const changes: Record<string, { from: boolean; to: boolean }> = {};

  for (const key of Object.keys(newConsents)) {
    const oldValue = oldConsents[key] ?? false;
    const newValue = newConsents[key as keyof typeof newConsents];

    if (oldValue !== newValue) {
      changes[key] = { from: oldValue, to: newValue };
    }
  }

  return changes;
}
