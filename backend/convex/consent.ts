import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Id } from "./id";
import { requireUser } from "./auth";
import { consentStates, consentTypes } from "./schema";

// Current consent policy version
const CURRENT_POLICY_VERSION = "1.0.0";

// 5-step consent flow states
const CONSENT_FLOW_STEPS = [
  "not_started",
  "privacy_shown",
  "features_explained",
  "level_selected",
  "confirmed",
  "completed",
] as const;

// Advance to next consent flow step
export const advanceConsentFlow = mutation({
  args: {
    clerkId: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx, args.clerkId);
    const fullUser = await ctx.db.get(user._id);

    if (!fullUser) {
      throw new Error("User not found");
    }

    const currentStep = fullUser.consentState;
    const currentIndex = CONSENT_FLOW_STEPS.indexOf(
      currentStep as (typeof CONSENT_FLOW_STEPS)[number]
    );

    if (currentIndex === -1 || currentIndex >= CONSENT_FLOW_STEPS.length - 1) {
      // Already at final step
      return { step: currentStep, isComplete: true };
    }

    const nextStep = CONSENT_FLOW_STEPS[currentIndex + 1];

    await ctx.db.patch(user._id, {
      consentState: nextStep,
      updatedAt: Date.now(),
    });

    // Log consent flow progress
    await ctx.db.insert("auditLogs", {
      userId: user._id,
      action: "consent.flow_advanced",
      details: {
        resourceType: "consent",
        previousValue: currentStep,
        newValue: nextStep,
        success: true,
      },
      timestamp: Date.now(),
    });

    return {
      step: nextStep,
      isComplete: nextStep === "completed",
      stepNumber: currentIndex + 2,
      totalSteps: CONSENT_FLOW_STEPS.length,
    };
  },
});

// Set consent flow to specific step
export const setConsentFlowStep = mutation({
  args: {
    clerkId: v.string(),
    step: consentStates,
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx, args.clerkId);
    const fullUser = await ctx.db.get(user._id);

    if (!fullUser) {
      throw new Error("User not found");
    }

    const previousStep = fullUser.consentState;

    await ctx.db.patch(user._id, {
      consentState: args.step,
      updatedAt: Date.now(),
    });

    // Log consent flow change
    await ctx.db.insert("auditLogs", {
      userId: user._id,
      action: "consent.flow_set",
      details: {
        resourceType: "consent",
        previousValue: previousStep,
        newValue: args.step,
        success: true,
      },
      timestamp: Date.now(),
    });

    return { step: args.step };
  },
});

// Get current consent flow status
export const getConsentFlowStatus = query({
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

    const currentStep = user.consentState;
    const stepIndex = CONSENT_FLOW_STEPS.indexOf(
      currentStep as (typeof CONSENT_FLOW_STEPS)[number]
    );

    return {
      currentStep,
      stepNumber: stepIndex + 1,
      totalSteps: CONSENT_FLOW_STEPS.length,
      isComplete: currentStep === "completed",
      steps: CONSENT_FLOW_STEPS.map((step, index) => ({
        name: step,
        completed: index < stepIndex,
        current: index === stepIndex,
      })),
    };
  },
});

// Grant consent for specific type and domain
export const grantConsent = mutation({
  args: {
    clerkId: v.string(),
    domain: v.string(),
    consentType: consentTypes,
    expiresAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx, args.clerkId);

    // Check for existing consent record
    const existingRecords = await ctx.db
      .query("consentRecords")
      .withIndex("by_userId_domain", (q) =>
        q.eq("userId", user._id).eq("domain", args.domain)
      )
      .collect();

    const existingForType = existingRecords.find(
      (r) => r.consentType === args.consentType
    );

    if (existingForType) {
      // Update existing record
      await ctx.db.patch(existingForType._id, {
        granted: true,
        timestamp: Date.now(),
        version: CURRENT_POLICY_VERSION,
        metadata: {
          ...existingForType.metadata,
          expiresAt: args.expiresAt,
          revokedAt: undefined,
        },
      });

      return existingForType._id;
    }

    // Create new consent record
    const recordId = await ctx.db.insert("consentRecords", {
      userId: user._id,
      domain: args.domain,
      consentType: args.consentType,
      granted: true,
      timestamp: Date.now(),
      version: CURRENT_POLICY_VERSION,
      metadata: {
        source: "user_action",
        expiresAt: args.expiresAt,
      },
    });

    // Log consent grant
    await ctx.db.insert("auditLogs", {
      userId: user._id,
      action: "consent.granted",
      details: {
        resourceType: "consentRecords",
        resourceId: recordId,
        newValue: {
          domain: args.domain,
          consentType: args.consentType,
        },
        success: true,
      },
      timestamp: Date.now(),
    });

    return recordId;
  },
});

// Revoke consent for specific type and domain
export const revokeConsent = mutation({
  args: {
    clerkId: v.string(),
    domain: v.string(),
    consentType: consentTypes,
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx, args.clerkId);

    const existingRecords = await ctx.db
      .query("consentRecords")
      .withIndex("by_userId_domain", (q) =>
        q.eq("userId", user._id).eq("domain", args.domain)
      )
      .collect();

    const existingForType = existingRecords.find(
      (r) => r.consentType === args.consentType
    );

    if (!existingForType) {
      // No consent to revoke
      return { success: true, wasAlreadyRevoked: true };
    }

    await ctx.db.patch(existingForType._id, {
      granted: false,
      timestamp: Date.now(),
      version: CURRENT_POLICY_VERSION,
      metadata: {
        ...existingForType.metadata,
        revokedAt: Date.now(),
      },
    });

    // Log consent revocation
    await ctx.db.insert("auditLogs", {
      userId: user._id,
      action: "consent.revoked",
      details: {
        resourceType: "consentRecords",
        resourceId: existingForType._id,
        previousValue: { granted: true },
        newValue: { granted: false },
        success: true,
      },
      timestamp: Date.now(),
    });

    return { success: true, wasAlreadyRevoked: false };
  },
});

// Bulk grant consents (for onboarding)
export const grantBulkConsents = mutation({
  args: {
    clerkId: v.string(),
    consents: v.array(
      v.object({
        domain: v.string(),
        consentType: consentTypes,
        expiresAt: v.optional(v.number()),
      })
    ),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx, args.clerkId);

    const grantedIds: Id<"consentRecords">[] = [];

    for (const consent of args.consents) {
      // Check for existing
      const existingRecords = await ctx.db
        .query("consentRecords")
        .withIndex("by_userId_domain", (q) =>
          q.eq("userId", user._id).eq("domain", consent.domain)
        )
        .collect();

      const existingForType = existingRecords.find(
        (r) => r.consentType === consent.consentType
      );

      if (existingForType) {
        await ctx.db.patch(existingForType._id, {
          granted: true,
          timestamp: Date.now(),
          version: CURRENT_POLICY_VERSION,
          metadata: {
            ...existingForType.metadata,
            expiresAt: consent.expiresAt,
            revokedAt: undefined,
          },
        });
        grantedIds.push(existingForType._id);
      } else {
        const recordId = await ctx.db.insert("consentRecords", {
          userId: user._id,
          domain: consent.domain,
          consentType: consent.consentType,
          granted: true,
          timestamp: Date.now(),
          version: CURRENT_POLICY_VERSION,
          metadata: {
            source: "bulk_onboarding",
            expiresAt: consent.expiresAt,
          },
        });
        grantedIds.push(recordId);
      }
    }

    // Log bulk grant
    await ctx.db.insert("auditLogs", {
      userId: user._id,
      action: "consent.bulk_granted",
      details: {
        resourceType: "consentRecords",
        newValue: { count: grantedIds.length },
        success: true,
      },
      timestamp: Date.now(),
    });

    return { granted: grantedIds.length, ids: grantedIds };
  },
});

// Get all consents for user
export const getConsents = query({
  args: {
    clerkId: v.string(),
    domain: v.optional(v.string()),
    activeOnly: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", args.clerkId))
      .unique();

    if (!user) {
      return [];
    }

    let records;
    if (args.domain) {
      records = await ctx.db
        .query("consentRecords")
        .withIndex("by_userId_domain", (q) =>
          q.eq("userId", user._id).eq("domain", args.domain!)
        )
        .collect();
    } else {
      records = await ctx.db
        .query("consentRecords")
        .withIndex("by_userId", (q) => q.eq("userId", user._id))
        .collect();
    }

    // Filter active only if requested
    if (args.activeOnly) {
      const now = Date.now();
      records = records.filter((r) => {
        if (!r.granted) return false;
        if (r.metadata?.expiresAt && r.metadata.expiresAt < now) return false;
        return true;
      });
    }

    return records;
  },
});

// Check if consent is granted for specific type and domain
export const checkConsent = query({
  args: {
    clerkId: v.string(),
    domain: v.string(),
    consentType: consentTypes,
  },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", args.clerkId))
      .unique();

    if (!user) {
      return { granted: false, reason: "user_not_found" };
    }

    const records = await ctx.db
      .query("consentRecords")
      .withIndex("by_userId_domain", (q) =>
        q.eq("userId", user._id).eq("domain", args.domain)
      )
      .collect();

    const record = records.find((r) => r.consentType === args.consentType);

    if (!record) {
      return { granted: false, reason: "no_consent_record" };
    }

    if (!record.granted) {
      return { granted: false, reason: "consent_revoked" };
    }

    // Check expiration
    if (record.metadata?.expiresAt && record.metadata.expiresAt < Date.now()) {
      return { granted: false, reason: "consent_expired" };
    }

    return {
      granted: true,
      consentId: record._id,
      grantedAt: record.timestamp,
      version: record.version,
    };
  },
});

// Check multiple consents at once
export const checkBulkConsents = query({
  args: {
    clerkId: v.string(),
    checks: v.array(
      v.object({
        domain: v.string(),
        consentType: consentTypes,
      })
    ),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", args.clerkId))
      .unique();

    if (!user) {
      return args.checks.map((check) => ({
        ...check,
        granted: false,
        reason: "user_not_found",
      }));
    }

    const allRecords = await ctx.db
      .query("consentRecords")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .collect();

    const now = Date.now();

    return args.checks.map((check) => {
      const record = allRecords.find(
        (r) => r.domain === check.domain && r.consentType === check.consentType
      );

      if (!record) {
        return { ...check, granted: false, reason: "no_consent_record" };
      }

      if (!record.granted) {
        return { ...check, granted: false, reason: "consent_revoked" };
      }

      if (record.metadata?.expiresAt && record.metadata.expiresAt < now) {
        return { ...check, granted: false, reason: "consent_expired" };
      }

      return { ...check, granted: true, consentId: record._id };
    });
  },
});

// Get consent summary for user
export const getConsentSummary = query({
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

    const records = await ctx.db
      .query("consentRecords")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .collect();

    const now = Date.now();

    // Group by domain
    const byDomain: Record<
      string,
      { granted: string[]; revoked: string[]; expired: string[] }
    > = {};

    for (const record of records) {
      if (!byDomain[record.domain]) {
        byDomain[record.domain] = { granted: [], revoked: [], expired: [] };
      }

      if (!record.granted) {
        byDomain[record.domain].revoked.push(record.consentType);
      } else if (
        record.metadata?.expiresAt &&
        record.metadata.expiresAt < now
      ) {
        byDomain[record.domain].expired.push(record.consentType);
      } else {
        byDomain[record.domain].granted.push(record.consentType);
      }
    }

    // Calculate totals
    const totalGranted = records.filter((r) => r.granted).length;
    const totalRevoked = records.filter((r) => !r.granted).length;
    const totalExpired = records.filter(
      (r) =>
        r.granted && r.metadata?.expiresAt && r.metadata.expiresAt < now
    ).length;

    return {
      totalRecords: records.length,
      totalGranted,
      totalRevoked,
      totalExpired,
      byDomain,
      lastUpdated:
        records.length > 0
          ? Math.max(...records.map((r) => r.timestamp))
          : null,
      policyVersion: CURRENT_POLICY_VERSION,
    };
  },
});

// Revoke all consents for a domain
export const revokeAllConsentsForDomain = mutation({
  args: {
    clerkId: v.string(),
    domain: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx, args.clerkId);

    const records = await ctx.db
      .query("consentRecords")
      .withIndex("by_userId_domain", (q) =>
        q.eq("userId", user._id).eq("domain", args.domain)
      )
      .collect();

    let revokedCount = 0;
    for (const record of records) {
      if (record.granted) {
        await ctx.db.patch(record._id, {
          granted: false,
          timestamp: Date.now(),
          version: CURRENT_POLICY_VERSION,
          metadata: {
            ...record.metadata,
            revokedAt: Date.now(),
          },
        });
        revokedCount++;
      }
    }

    // Log bulk revocation
    await ctx.db.insert("auditLogs", {
      userId: user._id,
      action: "consent.domain_revoked",
      details: {
        resourceType: "consentRecords",
        newValue: { domain: args.domain, count: revokedCount },
        success: true,
      },
      timestamp: Date.now(),
    });

    return { revokedCount };
  },
});

// Reset all consents (for testing/development)
export const resetAllConsents = mutation({
  args: {
    clerkId: v.string(),
    confirmReset: v.boolean(),
  },
  handler: async (ctx, args) => {
    if (!args.confirmReset) {
      throw new Error("Reset must be explicitly confirmed");
    }

    const user = await requireUser(ctx, args.clerkId);

    const records = await ctx.db
      .query("consentRecords")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .collect();

    for (const record of records) {
      await ctx.db.delete(record._id);
    }

    // Reset consent flow state
    await ctx.db.patch(user._id, {
      consentState: "not_started",
      updatedAt: Date.now(),
    });

    // Log reset
    await ctx.db.insert("auditLogs", {
      userId: user._id,
      action: "consent.all_reset",
      details: {
        resourceType: "consentRecords",
        newValue: { deletedCount: records.length },
        success: true,
      },
      timestamp: Date.now(),
    });

    return { deletedCount: records.length };
  },
});
