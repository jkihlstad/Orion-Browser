/**
 * Authentication Middleware for Orion Browser
 *
 * This module provides:
 * - Token validation for incoming requests
 * - User context injection for authenticated routes
 * - Permission checking utilities based on consent levels
 * - Rate limiting and request validation
 *
 * @module authMiddleware
 */

import {
  ActionCtx,
  MutationCtx,
  QueryCtx,
} from "./_generated/server";
import { internal } from "./_generated/api";
import {
  ClerkJWTPayload,
  validateClerkToken,
  extractUserIdFromToken,
} from "./clerk";
import { ConsentLevel } from "./types/consent";
import { IntelligenceLevel } from "./types/intelligence";

// ============================================================================
// Types
// ============================================================================

/**
 * Authenticated user context injected into handlers
 */
export interface AuthenticatedUser {
  /** Clerk user ID */
  userId: string;
  /** User's email address */
  email: string;
  /** Full name (combined first and last) */
  fullName: string | null;
  /** Current consent level (0-4) */
  consentLevel: ConsentLevel;
  /** Current intelligence level */
  intelligenceLevel: IntelligenceLevel;
  /** Privacy settings */
  privacySettings: {
    dataRetentionDays: number;
    allowAnalytics: boolean;
    allowPersonalization: boolean;
  };
  /** Session ID if available */
  sessionId: string | null;
  /** Organization ID if user belongs to one */
  orgId: string | null;
  /** Organization role if applicable */
  orgRole: string | null;
}

/**
 * Authentication result from token validation
 */
export interface AuthResult {
  success: boolean;
  user: AuthenticatedUser | null;
  error: string | null;
  errorCode: AuthErrorCode | null;
}

/**
 * Error codes for authentication failures
 */
export type AuthErrorCode =
  | "TOKEN_MISSING"
  | "TOKEN_INVALID"
  | "TOKEN_EXPIRED"
  | "USER_NOT_FOUND"
  | "USER_DELETED"
  | "CONSENT_REQUIRED"
  | "PERMISSION_DENIED"
  | "RATE_LIMITED"
  | "INTERNAL_ERROR";

/**
 * Permission check result
 */
export interface PermissionResult {
  allowed: boolean;
  reason: string | null;
  requiredLevel: ConsentLevel | null;
}

/**
 * Request context with authentication
 */
export interface AuthenticatedContext {
  user: AuthenticatedUser;
  jwt: ClerkJWTPayload;
  requestId: string;
  timestamp: number;
}

// ============================================================================
// Token Validation
// ============================================================================

/**
 * Validates a bearer token and returns the authenticated user context
 *
 * @param ctx - Convex context (Query, Mutation, or Action)
 * @param authHeader - The Authorization header value
 * @returns Authentication result with user context or error
 *
 * @example
 * ```typescript
 * const authResult = await validateToken(ctx, request.headers.get("Authorization"));
 * if (!authResult.success) {
 *   throw new Error(authResult.error);
 * }
 * const user = authResult.user;
 * ```
 */
export async function validateToken(
  ctx: QueryCtx | MutationCtx | ActionCtx,
  authHeader: string | null
): Promise<AuthResult> {
  // Check for presence of token
  if (!authHeader) {
    return {
      success: false,
      user: null,
      error: "Authorization header is required",
      errorCode: "TOKEN_MISSING",
    };
  }

  // Extract bearer token
  const token = extractBearerToken(authHeader);
  if (!token) {
    return {
      success: false,
      user: null,
      error: "Invalid authorization header format. Expected: Bearer <token>",
      errorCode: "TOKEN_INVALID",
    };
  }

  // Validate the JWT
  const jwtPayload = await validateClerkToken(token);
  if (!jwtPayload) {
    return {
      success: false,
      user: null,
      error: "Invalid or expired token",
      errorCode: "TOKEN_EXPIRED",
    };
  }

  // Get user from database
  const clerkId = extractUserIdFromToken(jwtPayload);

  try {
    const user = await (ctx as ActionCtx).runQuery(
      internal.clerk.getUserByClerkId,
      { clerkId }
    );

    if (!user) {
      return {
        success: false,
        user: null,
        error: "User not found in database",
        errorCode: "USER_NOT_FOUND",
      };
    }

    if (user.isDeleted) {
      return {
        success: false,
        user: null,
        error: "User account has been deleted",
        errorCode: "USER_DELETED",
      };
    }

    // Build authenticated user context
    const authenticatedUser: AuthenticatedUser = {
      userId: clerkId,
      email: user.email,
      fullName:
        user.firstName || user.lastName
          ? `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim()
          : null,
      consentLevel: user.metadata.consentLevel as ConsentLevel,
      intelligenceLevel: user.metadata.intelligenceLevel as IntelligenceLevel,
      privacySettings: user.metadata.privacySettings,
      sessionId: jwtPayload.sid ?? null,
      orgId: jwtPayload.org_id ?? null,
      orgRole: jwtPayload.org_role ?? null,
    };

    return {
      success: true,
      user: authenticatedUser,
      error: null,
      errorCode: null,
    };
  } catch (error) {
    console.error("Error validating token:", error);
    return {
      success: false,
      user: null,
      error: "Internal error during authentication",
      errorCode: "INTERNAL_ERROR",
    };
  }
}

/**
 * Extracts the bearer token from an Authorization header
 */
function extractBearerToken(authHeader: string): string | null {
  const parts = authHeader.split(" ");
  if (parts.length !== 2 || parts[0].toLowerCase() !== "bearer") {
    return null;
  }
  return parts[1];
}

// ============================================================================
// User Context Injection
// ============================================================================

/**
 * Creates a full authenticated context for request handling
 *
 * @param user - The authenticated user
 * @param jwt - The validated JWT payload
 * @returns Full authenticated context with request metadata
 */
export function createAuthenticatedContext(
  user: AuthenticatedUser,
  jwt: ClerkJWTPayload
): AuthenticatedContext {
  return {
    user,
    jwt,
    requestId: generateRequestId(),
    timestamp: Date.now(),
  };
}

/**
 * Generates a unique request ID for tracing
 */
function generateRequestId(): string {
  const timestamp = Date.now().toString(36);
  const randomPart = Math.random().toString(36).substring(2, 10);
  return `req_${timestamp}_${randomPart}`;
}

/**
 * Higher-order function to wrap a handler with authentication
 *
 * @param handler - The handler function to wrap
 * @returns Wrapped handler that validates auth before execution
 *
 * @example
 * ```typescript
 * export const myProtectedAction = action({
 *   handler: withAuth(async (ctx, authContext, args) => {
 *     // authContext.user is guaranteed to exist
 *     return { userId: authContext.user.userId };
 *   }),
 * });
 * ```
 */
export function withAuth<TArgs, TResult>(
  handler: (
    ctx: ActionCtx,
    authContext: AuthenticatedContext,
    args: TArgs
  ) => Promise<TResult>
) {
  return async (
    ctx: ActionCtx,
    args: TArgs & { authToken: string }
  ): Promise<TResult> => {
    const authResult = await validateToken(ctx, `Bearer ${args.authToken}`);

    if (!authResult.success || !authResult.user) {
      throw new Error(authResult.error ?? "Authentication failed");
    }

    // Validate token again to get JWT payload
    const jwt = await validateClerkToken(args.authToken);
    if (!jwt) {
      throw new Error("Token validation failed");
    }

    const authContext = createAuthenticatedContext(authResult.user, jwt);

    return handler(ctx, authContext, args);
  };
}

// ============================================================================
// Permission Checking Utilities
// ============================================================================

/**
 * Permission definitions based on consent levels
 */
const PERMISSION_REQUIREMENTS: Record<string, ConsentLevel> = {
  // Basic permissions (Level 0 - No Consent)
  "read:public": 0,
  "auth:basic": 0,

  // Limited permissions (Level 1 - Basic Consent)
  "read:settings": 1,
  "write:settings": 1,
  "read:bookmarks": 1,
  "write:bookmarks": 1,

  // Standard permissions (Level 2 - Standard Consent)
  "read:history": 2,
  "write:history": 2,
  "read:analytics": 2,
  "ai:passive": 2,

  // Enhanced permissions (Level 3 - Enhanced Consent)
  "read:patterns": 3,
  "ai:advisory": 3,
  "voice:basic": 3,
  "personalization:basic": 3,

  // Full permissions (Level 4 - Full Consent)
  "ai:proactive": 4,
  "voice:advanced": 4,
  "personalization:full": 4,
  "explicit:content": 4,
  "cross:domain": 4,
};

/**
 * Checks if a user has a specific permission based on their consent level
 *
 * @param user - The authenticated user
 * @param permission - The permission to check
 * @returns Permission check result
 *
 * @example
 * ```typescript
 * const result = checkPermission(user, "ai:advisory");
 * if (!result.allowed) {
 *   throw new Error(`Permission denied: ${result.reason}`);
 * }
 * ```
 */
export function checkPermission(
  user: AuthenticatedUser,
  permission: string
): PermissionResult {
  const requiredLevel = PERMISSION_REQUIREMENTS[permission];

  if (requiredLevel === undefined) {
    return {
      allowed: false,
      reason: `Unknown permission: ${permission}`,
      requiredLevel: null,
    };
  }

  if (user.consentLevel >= requiredLevel) {
    return {
      allowed: true,
      reason: null,
      requiredLevel,
    };
  }

  return {
    allowed: false,
    reason: `This action requires consent level ${requiredLevel} (${getConsentLevelName(requiredLevel)}), but user has level ${user.consentLevel}`,
    requiredLevel,
  };
}

/**
 * Checks multiple permissions at once
 *
 * @param user - The authenticated user
 * @param permissions - Array of permissions to check
 * @returns True only if all permissions are granted
 */
export function checkAllPermissions(
  user: AuthenticatedUser,
  permissions: string[]
): PermissionResult {
  for (const permission of permissions) {
    const result = checkPermission(user, permission);
    if (!result.allowed) {
      return result;
    }
  }

  return {
    allowed: true,
    reason: null,
    requiredLevel: null,
  };
}

/**
 * Checks if any of the specified permissions are granted
 *
 * @param user - The authenticated user
 * @param permissions - Array of permissions to check
 * @returns True if at least one permission is granted
 */
export function checkAnyPermission(
  user: AuthenticatedUser,
  permissions: string[]
): PermissionResult {
  let highestRequired: ConsentLevel = 0;
  const deniedReasons: string[] = [];

  for (const permission of permissions) {
    const result = checkPermission(user, permission);
    if (result.allowed) {
      return {
        allowed: true,
        reason: null,
        requiredLevel: result.requiredLevel,
      };
    }
    if (result.requiredLevel !== null && result.requiredLevel > highestRequired) {
      highestRequired = result.requiredLevel;
    }
    if (result.reason) {
      deniedReasons.push(result.reason);
    }
  }

  return {
    allowed: false,
    reason: `None of the required permissions are granted. ${deniedReasons[0]}`,
    requiredLevel: highestRequired,
  };
}

/**
 * Gets a human-readable name for a consent level
 */
function getConsentLevelName(level: ConsentLevel): string {
  const names: Record<ConsentLevel, string> = {
    0: "No Consent",
    1: "Basic Consent",
    2: "Standard Consent",
    3: "Enhanced Consent",
    4: "Full Consent",
  };
  return names[level];
}

/**
 * Checks if user can access AI features at a specific level
 */
export function canAccessAI(
  user: AuthenticatedUser,
  requiredLevel: IntelligenceLevel
): PermissionResult {
  const levelHierarchy: Record<IntelligenceLevel, number> = {
    passive: 1,
    advisory: 2,
    proactive: 3,
  };

  const userLevel = levelHierarchy[user.intelligenceLevel];
  const required = levelHierarchy[requiredLevel];

  if (userLevel >= required) {
    return {
      allowed: true,
      reason: null,
      requiredLevel: null,
    };
  }

  return {
    allowed: false,
    reason: `This feature requires ${requiredLevel} AI mode, but user has ${user.intelligenceLevel} mode enabled`,
    requiredLevel: null,
  };
}

/**
 * Checks if personalization features can be used
 */
export function canUsePersonalization(user: AuthenticatedUser): boolean {
  return (
    user.consentLevel >= 3 && user.privacySettings.allowPersonalization
  );
}

/**
 * Checks if analytics can be collected for a user
 */
export function canCollectAnalytics(user: AuthenticatedUser): boolean {
  return user.consentLevel >= 2 && user.privacySettings.allowAnalytics;
}

// ============================================================================
// Rate Limiting Utilities
// ============================================================================

/**
 * Rate limit configuration per operation type
 */
export const RATE_LIMITS: Record<string, { maxRequests: number; windowMs: number }> = {
  "api:general": { maxRequests: 100, windowMs: 60000 }, // 100 per minute
  "api:ai": { maxRequests: 20, windowMs: 60000 }, // 20 per minute
  "api:voice": { maxRequests: 10, windowMs: 60000 }, // 10 per minute
  "api:export": { maxRequests: 5, windowMs: 3600000 }, // 5 per hour
  "api:search": { maxRequests: 50, windowMs: 60000 }, // 50 per minute
};

/**
 * Checks if a request should be rate limited
 * Note: Actual rate limiting state should be stored in the database
 *
 * @param userId - The user ID to check
 * @param operation - The operation type
 * @param currentCount - Current request count in the window
 * @returns Whether the request is rate limited
 */
export function isRateLimited(
  _userId: string,
  operation: string,
  currentCount: number
): boolean {
  const limit = RATE_LIMITS[operation];
  if (!limit) {
    return false;
  }

  return currentCount >= limit.maxRequests;
}

/**
 * Gets the remaining requests for a rate limit window
 */
export function getRateLimitRemaining(
  operation: string,
  currentCount: number
): number {
  const limit = RATE_LIMITS[operation];
  if (!limit) {
    return Infinity;
  }

  return Math.max(0, limit.maxRequests - currentCount);
}

// ============================================================================
// Request Validation Utilities
// ============================================================================

/**
 * Validates that required fields are present in a request
 */
export function validateRequiredFields<T extends Record<string, unknown>>(
  data: T,
  requiredFields: (keyof T)[]
): { valid: boolean; missingFields: string[] } {
  const missingFields: string[] = [];

  for (const field of requiredFields) {
    if (data[field] === undefined || data[field] === null) {
      missingFields.push(String(field));
    }
  }

  return {
    valid: missingFields.length === 0,
    missingFields,
  };
}

/**
 * Sanitizes user input to prevent injection attacks
 */
export function sanitizeInput(input: string): string {
  // Remove any null bytes
  let sanitized = input.replace(/\0/g, "");

  // Limit length
  sanitized = sanitized.substring(0, 10000);

  // Remove any control characters except newlines and tabs
  sanitized = sanitized.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");

  return sanitized;
}

/**
 * Validates a URL format
 */
export function isValidUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

/**
 * Validates an email format
 */
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}
