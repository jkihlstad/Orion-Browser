/**
 * Audit Logging Utilities for Orion Browser
 *
 * Provides comprehensive audit logging for:
 * - Security events
 * - Data access
 * - User actions
 * - Compliance tracking
 * - Admin operations
 *
 * @module security/audit
 */

import { v } from "convex/values";
import { mutation, query, internalMutation } from "../_generated/server";
import type { Id } from "../id";

// ============================================================================
// Types
// ============================================================================

/**
 * Audit event categories
 */
export type AuditCategory =
  | "auth" // Authentication events
  | "data" // Data access/modification
  | "consent" // Consent changes
  | "security" // Security events
  | "admin" // Administrative actions
  | "export" // Data export events
  | "deletion" // Deletion events
  | "ai" // AI/ML operations
  | "system"; // System events

/**
 * Audit event severity levels
 */
export type AuditSeverity =
  | "info" // Informational
  | "warning" // Warning
  | "error" // Error
  | "critical"; // Critical security event

/**
 * Audit event status
 */
export type AuditStatus = "success" | "failure" | "pending" | "denied";

/**
 * Audit log entry
 */
export interface AuditLogEntry {
  /** Entry ID */
  _id: Id<"auditLogs">;
  /** Event timestamp */
  timestamp: number;
  /** Event category */
  category: AuditCategory;
  /** Event action */
  action: string;
  /** Severity level */
  severity: AuditSeverity;
  /** Event status */
  status: AuditStatus;
  /** Actor (user or system) */
  actor: AuditActor;
  /** Target of the action */
  target?: AuditTarget;
  /** Event metadata */
  metadata: Record<string, unknown>;
  /** Request context */
  context: AuditContext;
  /** Related events */
  relatedEvents?: string[];
}

/**
 * Actor who performed the action
 */
export interface AuditActor {
  /** Actor type */
  type: "user" | "system" | "admin" | "api" | "scheduled";
  /** Actor ID */
  id: string;
  /** Actor display name */
  name?: string;
  /** Actor email (if applicable) */
  email?: string;
  /** Session ID */
  sessionId?: string;
}

/**
 * Target of the audited action
 */
export interface AuditTarget {
  /** Target type */
  type: string;
  /** Target ID */
  id: string;
  /** Target name/description */
  name?: string;
  /** Additional target info */
  details?: Record<string, unknown>;
}

/**
 * Context of the audit event
 */
export interface AuditContext {
  /** Request ID */
  requestId: string;
  /** IP address (if available) */
  ipAddress?: string;
  /** User agent */
  userAgent?: string;
  /** Client type */
  clientType?: "ios" | "macos" | "web" | "api";
  /** Client version */
  clientVersion?: string;
  /** Geolocation (if available) */
  geolocation?: {
    country?: string;
    region?: string;
    city?: string;
  };
}

/**
 * Audit query filters
 */
export interface AuditQueryFilters {
  /** Filter by category */
  categories?: AuditCategory[];
  /** Filter by severity */
  severities?: AuditSeverity[];
  /** Filter by status */
  statuses?: AuditStatus[];
  /** Filter by actor ID */
  actorId?: string;
  /** Filter by target ID */
  targetId?: string;
  /** Filter by action pattern */
  actionPattern?: string;
  /** Time range */
  timeRange?: {
    after?: number;
    before?: number;
  };
}

/**
 * Audit statistics
 */
export interface AuditStats {
  /** Total events */
  total: number;
  /** By category */
  byCategory: Record<AuditCategory, number>;
  /** By severity */
  bySeverity: Record<AuditSeverity, number>;
  /** By status */
  byStatus: Record<AuditStatus, number>;
  /** Time range covered */
  timeRange: {
    oldest: number;
    newest: number;
  };
}

// ============================================================================
// Audit Actions
// ============================================================================

/**
 * Standard audit actions by category
 */
export const AUDIT_ACTIONS = {
  auth: {
    LOGIN_SUCCESS: "auth.login.success",
    LOGIN_FAILURE: "auth.login.failure",
    LOGOUT: "auth.logout",
    TOKEN_REFRESH: "auth.token.refresh",
    TOKEN_REVOKED: "auth.token.revoked",
    SESSION_CREATED: "auth.session.created",
    SESSION_EXPIRED: "auth.session.expired",
    MFA_ENABLED: "auth.mfa.enabled",
    MFA_DISABLED: "auth.mfa.disabled",
    PASSWORD_CHANGED: "auth.password.changed",
    PASSWORD_RESET: "auth.password.reset",
  },
  data: {
    READ: "data.read",
    CREATE: "data.create",
    UPDATE: "data.update",
    DELETE: "data.delete",
    SEARCH: "data.search",
    EXPORT: "data.export",
    IMPORT: "data.import",
    SYNC: "data.sync",
  },
  consent: {
    GRANTED: "consent.granted",
    WITHDRAWN: "consent.withdrawn",
    LEVEL_CHANGED: "consent.level.changed",
    PERMISSION_GRANTED: "consent.permission.granted",
    PERMISSION_REVOKED: "consent.permission.revoked",
  },
  security: {
    SUSPICIOUS_ACTIVITY: "security.suspicious",
    RATE_LIMITED: "security.rate_limited",
    ACCESS_DENIED: "security.access_denied",
    INVALID_TOKEN: "security.invalid_token",
    ENCRYPTION_ERROR: "security.encryption_error",
    KEY_ROTATED: "security.key_rotated",
  },
  admin: {
    USER_CREATED: "admin.user.created",
    USER_SUSPENDED: "admin.user.suspended",
    USER_DELETED: "admin.user.deleted",
    CONFIG_CHANGED: "admin.config.changed",
    FEATURE_ENABLED: "admin.feature.enabled",
    FEATURE_DISABLED: "admin.feature.disabled",
  },
  export: {
    REQUESTED: "export.requested",
    STARTED: "export.started",
    COMPLETED: "export.completed",
    FAILED: "export.failed",
    DOWNLOADED: "export.downloaded",
  },
  deletion: {
    REQUESTED: "deletion.requested",
    SCHEDULED: "deletion.scheduled",
    STARTED: "deletion.started",
    COMPLETED: "deletion.completed",
    CANCELLED: "deletion.cancelled",
    FAILED: "deletion.failed",
  },
  ai: {
    SUGGESTION_GENERATED: "ai.suggestion.generated",
    SUGGESTION_ACCEPTED: "ai.suggestion.accepted",
    SUGGESTION_REJECTED: "ai.suggestion.rejected",
    ACTION_EXECUTED: "ai.action.executed",
    TRAINING_DATA_USED: "ai.training.used",
  },
  system: {
    STARTUP: "system.startup",
    SHUTDOWN: "system.shutdown",
    MAINTENANCE: "system.maintenance",
    ERROR: "system.error",
    BACKUP: "system.backup",
    MIGRATION: "system.migration",
  },
} as const;

// ============================================================================
// Audit Logging Functions
// ============================================================================

/**
 * Creates an audit log entry
 */
export const createAuditLog = mutation({
  args: {
    category: v.string(),
    action: v.string(),
    severity: v.optional(v.string()),
    status: v.string(),
    actor: v.object({
      type: v.string(),
      id: v.string(),
      name: v.optional(v.string()),
      email: v.optional(v.string()),
      sessionId: v.optional(v.string()),
    }),
    target: v.optional(
      v.object({
        type: v.string(),
        id: v.string(),
        name: v.optional(v.string()),
        details: v.optional(v.any()),
      })
    ),
    metadata: v.optional(v.any()),
    context: v.object({
      requestId: v.string(),
      ipAddress: v.optional(v.string()),
      userAgent: v.optional(v.string()),
      clientType: v.optional(v.string()),
      clientVersion: v.optional(v.string()),
      geolocation: v.optional(
        v.object({
          country: v.optional(v.string()),
          region: v.optional(v.string()),
          city: v.optional(v.string()),
        })
      ),
    }),
    relatedEvents: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args): Promise<Id<"auditLogs">> => {
    const entry = {
      timestamp: Date.now(),
      category: args.category as AuditCategory,
      action: args.action,
      severity: (args.severity as AuditSeverity) ?? "info",
      status: args.status as AuditStatus,
      actor: args.actor,
      target: args.target,
      metadata: args.metadata ?? {},
      context: args.context,
      relatedEvents: args.relatedEvents,
    };

    const id = await ctx.db.insert("auditLogs", entry);
    return id;
  },
});

/**
 * Creates an audit log entry (internal version)
 */
export const createAuditLogInternal = internalMutation({
  args: {
    category: v.string(),
    action: v.string(),
    severity: v.optional(v.string()),
    status: v.string(),
    actor: v.object({
      type: v.string(),
      id: v.string(),
      name: v.optional(v.string()),
      email: v.optional(v.string()),
      sessionId: v.optional(v.string()),
    }),
    target: v.optional(
      v.object({
        type: v.string(),
        id: v.string(),
        name: v.optional(v.string()),
        details: v.optional(v.any()),
      })
    ),
    metadata: v.optional(v.any()),
    context: v.optional(
      v.object({
        requestId: v.string(),
        ipAddress: v.optional(v.string()),
        userAgent: v.optional(v.string()),
        clientType: v.optional(v.string()),
        clientVersion: v.optional(v.string()),
      })
    ),
  },
  handler: async (ctx, args): Promise<Id<"auditLogs">> => {
    const entry = {
      timestamp: Date.now(),
      category: args.category as AuditCategory,
      action: args.action,
      severity: (args.severity as AuditSeverity) ?? "info",
      status: args.status as AuditStatus,
      actor: args.actor,
      target: args.target,
      metadata: args.metadata ?? {},
      context: args.context ?? {
        requestId: `sys_${Date.now()}`,
      },
    };

    return await ctx.db.insert("auditLogs", entry);
  },
});

// ============================================================================
// Audit Query Functions
// ============================================================================

/**
 * Queries audit logs with filters
 */
export const queryAuditLogs = query({
  args: {
    filters: v.optional(
      v.object({
        categories: v.optional(v.array(v.string())),
        severities: v.optional(v.array(v.string())),
        statuses: v.optional(v.array(v.string())),
        actorId: v.optional(v.string()),
        targetId: v.optional(v.string()),
        actionPattern: v.optional(v.string()),
        timeRange: v.optional(
          v.object({
            after: v.optional(v.number()),
            before: v.optional(v.number()),
          })
        ),
      })
    ),
    limit: v.optional(v.number()),
    cursor: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const filters = args.filters ?? {};
    const limit = args.limit ?? 50;

    let query = ctx.db.query("auditLogs").order("desc");

    // Apply time range filter
    if (filters.timeRange?.after) {
      query = query.filter((q) =>
        q.gte(q.field("timestamp"), filters.timeRange!.after!)
      );
    }
    if (filters.timeRange?.before) {
      query = query.filter((q) =>
        q.lte(q.field("timestamp"), filters.timeRange!.before!)
      );
    }

    // Apply category filter
    if (filters.categories && filters.categories.length > 0) {
      query = query.filter((q) =>
        q.or(
          ...filters.categories!.map((cat) => q.eq(q.field("category"), cat))
        )
      );
    }

    // Apply severity filter
    if (filters.severities && filters.severities.length > 0) {
      query = query.filter((q) =>
        q.or(
          ...filters.severities!.map((sev) => q.eq(q.field("severity"), sev))
        )
      );
    }

    // Apply status filter
    if (filters.statuses && filters.statuses.length > 0) {
      query = query.filter((q) =>
        q.or(
          ...filters.statuses!.map((status) => q.eq(q.field("status"), status))
        )
      );
    }

    const results = await query.take(limit + 1);
    const hasMore = results.length > limit;
    const items = hasMore ? results.slice(0, limit) : results;

    return {
      items,
      hasMore,
      nextCursor: hasMore ? items[items.length - 1]._id : null,
    };
  },
});

/**
 * Gets audit logs for a specific user
 */
export const getAuditLogsForUser = query({
  args: {
    userId: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 100;

    const logs = await ctx.db
      .query("auditLogs")
      .withIndex("by_actor", (q) => q.eq("actor.id", args.userId))
      .order("desc")
      .take(limit);

    return logs;
  },
});

/**
 * Gets audit statistics
 */
export const getAuditStats = query({
  args: {
    timeRange: v.optional(
      v.object({
        after: v.optional(v.number()),
        before: v.optional(v.number()),
      })
    ),
  },
  handler: async (ctx, args): Promise<AuditStats> => {
    const timeRange = args.timeRange ?? {};
    const after = timeRange.after ?? 0;
    const before = timeRange.before ?? Date.now();

    const logs = await ctx.db
      .query("auditLogs")
      .filter((q) =>
        q.and(
          q.gte(q.field("timestamp"), after),
          q.lte(q.field("timestamp"), before)
        )
      )
      .collect();

    const stats: AuditStats = {
      total: logs.length,
      byCategory: {} as Record<AuditCategory, number>,
      bySeverity: {} as Record<AuditSeverity, number>,
      byStatus: {} as Record<AuditStatus, number>,
      timeRange: {
        oldest: logs.length > 0 ? Math.min(...logs.map((l) => l.timestamp)) : 0,
        newest: logs.length > 0 ? Math.max(...logs.map((l) => l.timestamp)) : 0,
      },
    };

    for (const log of logs) {
      // Count by category
      stats.byCategory[log.category as AuditCategory] =
        (stats.byCategory[log.category as AuditCategory] ?? 0) + 1;

      // Count by severity
      stats.bySeverity[log.severity as AuditSeverity] =
        (stats.bySeverity[log.severity as AuditSeverity] ?? 0) + 1;

      // Count by status
      stats.byStatus[log.status as AuditStatus] =
        (stats.byStatus[log.status as AuditStatus] ?? 0) + 1;
    }

    return stats;
  },
});

// ============================================================================
// Audit Utilities
// ============================================================================

/**
 * Creates a standard audit context
 */
export function createAuditContext(
  requestId?: string,
  additionalContext?: Partial<AuditContext>
): AuditContext {
  return {
    requestId: requestId ?? `req_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    ...additionalContext,
  };
}

/**
 * Creates a system actor
 */
export function createSystemActor(
  componentName: string
): AuditActor {
  return {
    type: "system",
    id: `system:${componentName}`,
    name: componentName,
  };
}

/**
 * Creates a user actor
 */
export function createUserActor(
  userId: string,
  email?: string,
  sessionId?: string
): AuditActor {
  return {
    type: "user",
    id: userId,
    email,
    sessionId,
  };
}

/**
 * Determines severity for a security event
 */
export function determineSecuritySeverity(
  eventType: string,
  failed: boolean
): AuditSeverity {
  if (eventType.includes("denied") || eventType.includes("invalid")) {
    return failed ? "error" : "warning";
  }
  if (eventType.includes("suspicious")) {
    return "critical";
  }
  if (eventType.includes("rate_limited")) {
    return "warning";
  }
  return failed ? "error" : "info";
}

/**
 * Masks sensitive data in audit metadata
 */
export function maskSensitiveData(
  data: Record<string, unknown>
): Record<string, unknown> {
  const sensitiveKeys = [
    "password",
    "token",
    "secret",
    "key",
    "authorization",
    "cookie",
    "ssn",
    "credit_card",
  ];

  const masked: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(data)) {
    const lowerKey = key.toLowerCase();
    if (sensitiveKeys.some((sk) => lowerKey.includes(sk))) {
      masked[key] = "[REDACTED]";
    } else if (typeof value === "object" && value !== null) {
      masked[key] = maskSensitiveData(value as Record<string, unknown>);
    } else {
      masked[key] = value;
    }
  }

  return masked;
}

/**
 * Formats an audit event for logging
 */
export function formatAuditEvent(entry: Partial<AuditLogEntry>): string {
  const parts = [
    `[${entry.severity?.toUpperCase() ?? "INFO"}]`,
    `[${entry.category ?? "unknown"}]`,
    entry.action ?? "unknown.action",
    `- ${entry.status ?? "unknown"}`,
  ];

  if (entry.actor) {
    parts.push(`by ${entry.actor.type}:${entry.actor.id}`);
  }

  if (entry.target) {
    parts.push(`on ${entry.target.type}:${entry.target.id}`);
  }

  return parts.join(" ");
}

/**
 * Retention policy for audit logs
 */
export const AUDIT_RETENTION_DAYS: Record<AuditSeverity, number> = {
  info: 90, // 3 months
  warning: 180, // 6 months
  error: 365, // 1 year
  critical: 730, // 2 years
};

/**
 * Cleans up old audit logs based on retention policy
 */
export const cleanupOldAuditLogs = internalMutation({
  handler: async (ctx): Promise<{ deleted: number }> => {
    const now = Date.now();
    let deleted = 0;

    for (const [severity, days] of Object.entries(AUDIT_RETENTION_DAYS)) {
      const cutoff = now - days * 24 * 60 * 60 * 1000;

      const oldLogs = await ctx.db
        .query("auditLogs")
        .filter((q) =>
          q.and(
            q.eq(q.field("severity"), severity),
            q.lt(q.field("timestamp"), cutoff)
          )
        )
        .take(1000);

      for (const log of oldLogs) {
        await ctx.db.delete(log._id);
        deleted++;
      }
    }

    return { deleted };
  },
});
