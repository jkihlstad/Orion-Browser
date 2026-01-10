/**
 * Clerk Authentication Integration for Orion Browser
 *
 * This module handles:
 * - Webhook processing for user sync from Clerk
 * - JWT validation and verification
 * - Session management utilities
 * - User metadata synchronization
 *
 * @module clerk
 */

import { httpAction, internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import type { Id } from "./id";

// ============================================================================
// Types
// ============================================================================

/**
 * Clerk webhook event types that we handle
 */
export type ClerkWebhookEvent =
  | "user.created"
  | "user.updated"
  | "user.deleted"
  | "session.created"
  | "session.ended"
  | "session.revoked";

/**
 * Clerk user data structure from webhooks
 */
export interface ClerkUserData {
  id: string;
  email_addresses: Array<{
    id: string;
    email_address: string;
    verification: { status: string } | null;
  }>;
  primary_email_address_id: string | null;
  first_name: string | null;
  last_name: string | null;
  image_url: string | null;
  created_at: number;
  updated_at: number;
  public_metadata: Record<string, unknown>;
  private_metadata: Record<string, unknown>;
  unsafe_metadata: Record<string, unknown>;
}

/**
 * Clerk session data structure
 */
export interface ClerkSessionData {
  id: string;
  user_id: string;
  client_id: string;
  status: "active" | "ended" | "revoked" | "expired" | "removed" | "abandoned";
  last_active_at: number;
  expire_at: number;
  abandon_at: number;
  created_at: number;
  updated_at: number;
}

/**
 * Webhook payload structure from Clerk
 */
export interface ClerkWebhookPayload {
  type: ClerkWebhookEvent;
  data: ClerkUserData | ClerkSessionData;
  object: "event";
  timestamp: number;
}

/**
 * JWT payload structure from Clerk
 */
export interface ClerkJWTPayload {
  sub: string; // Clerk user ID
  iss: string; // Issuer (Clerk)
  aud: string; // Audience
  exp: number; // Expiration timestamp
  iat: number; // Issued at timestamp
  nbf: number; // Not before timestamp
  azp?: string; // Authorized party
  sid?: string; // Session ID
  org_id?: string; // Organization ID
  org_role?: string; // Organization role
  org_slug?: string; // Organization slug
  org_permissions?: string[]; // Organization permissions
}

/**
 * User record stored in Convex
 */
export interface StoredUser {
  _id: Id<"users">;
  clerkId: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  imageUrl: string | null;
  metadata: {
    consentLevel: number; // 0-4 based on 5-step consent flow
    intelligenceLevel: "passive" | "advisory" | "proactive";
    privacySettings: {
      dataRetentionDays: number;
      allowAnalytics: boolean;
      allowPersonalization: boolean;
    };
  };
  createdAt: number;
  updatedAt: number;
  lastActiveAt: number;
  isDeleted: boolean;
}

// ============================================================================
// Webhook Handler
// ============================================================================

/**
 * HTTP action to handle Clerk webhooks
 *
 * Verifies the webhook signature and processes user events
 * for synchronization with the Convex database.
 */
export const handleClerkWebhook = httpAction(async (ctx, request) => {
  // Extract the Svix headers for verification
  const svixId = request.headers.get("svix-id");
  const svixTimestamp = request.headers.get("svix-timestamp");
  const svixSignature = request.headers.get("svix-signature");

  // Validate required headers are present
  if (!svixId || !svixTimestamp || !svixSignature) {
    return new Response("Missing Svix headers", { status: 400 });
  }

  // Parse the request body
  let payload: ClerkWebhookPayload;
  try {
    payload = await request.json();
  } catch {
    return new Response("Invalid JSON payload", { status: 400 });
  }

  // Verify webhook signature (in production, use @clerk/backend or svix)
  const isValid = await verifyWebhookSignature(
    await request.text(),
    svixId,
    svixTimestamp,
    svixSignature
  );

  if (!isValid) {
    return new Response("Invalid webhook signature", { status: 401 });
  }

  // Process the webhook event
  try {
    switch (payload.type) {
      case "user.created":
        await ctx.runMutation(internal.clerk.syncUserCreate, {
          userData: payload.data as ClerkUserData,
        });
        break;

      case "user.updated":
        await ctx.runMutation(internal.clerk.syncUserUpdate, {
          userData: payload.data as ClerkUserData,
        });
        break;

      case "user.deleted":
        await ctx.runMutation(internal.clerk.syncUserDelete, {
          clerkId: (payload.data as ClerkUserData).id,
        });
        break;

      case "session.created":
        await ctx.runMutation(internal.clerk.handleSessionCreated, {
          sessionData: payload.data as ClerkSessionData,
        });
        break;

      case "session.ended":
      case "session.revoked":
        await ctx.runMutation(internal.clerk.handleSessionEnded, {
          sessionData: payload.data as ClerkSessionData,
        });
        break;

      default:
        console.log(`Unhandled webhook event type: ${payload.type}`);
    }

    return new Response("Webhook processed successfully", { status: 200 });
  } catch (error) {
    console.error("Error processing webhook:", error);
    return new Response("Internal server error", { status: 500 });
  }
});

// ============================================================================
// User Sync Mutations
// ============================================================================

/**
 * Creates a new user in the database from Clerk data
 */
export const syncUserCreate = internalMutation({
  args: {
    userData: v.any(),
  },
  handler: async (ctx, args) => {
    const userData = args.userData as ClerkUserData;
    const primaryEmail = userData.email_addresses.find(
      (e) => e.id === userData.primary_email_address_id
    );

    await ctx.db.insert("users", {
      clerkId: userData.id,
      email: primaryEmail?.email_address ?? "",
      firstName: userData.first_name,
      lastName: userData.last_name,
      imageUrl: userData.image_url,
      metadata: {
        consentLevel: 0, // Start with no consent
        intelligenceLevel: "passive", // Start passive
        privacySettings: {
          dataRetentionDays: 30,
          allowAnalytics: false,
          allowPersonalization: false,
        },
      },
      createdAt: userData.created_at,
      updatedAt: Date.now(),
      lastActiveAt: Date.now(),
      isDeleted: false,
    });

    // Log the user creation for audit
    await ctx.db.insert("auditLogs", {
      action: "user.created",
      userId: userData.id,
      timestamp: Date.now(),
      metadata: {
        source: "clerk_webhook",
      },
    });
  },
});

/**
 * Updates an existing user from Clerk data
 */
export const syncUserUpdate = internalMutation({
  args: {
    userData: v.any(),
  },
  handler: async (ctx, args) => {
    const userData = args.userData as ClerkUserData;

    // Find the existing user
    const existingUser = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", userData.id))
      .first();

    if (!existingUser) {
      // User doesn't exist, create them
      await ctx.runMutation(internal.clerk.syncUserCreate, { userData });
      return;
    }

    const primaryEmail = userData.email_addresses.find(
      (e) => e.id === userData.primary_email_address_id
    );

    await ctx.db.patch(existingUser._id, {
      email: primaryEmail?.email_address ?? existingUser.email,
      firstName: userData.first_name,
      lastName: userData.last_name,
      imageUrl: userData.image_url,
      updatedAt: Date.now(),
    });

    // Log the update for audit
    await ctx.db.insert("auditLogs", {
      action: "user.updated",
      userId: userData.id,
      timestamp: Date.now(),
      metadata: {
        source: "clerk_webhook",
      },
    });
  },
});

/**
 * Soft-deletes a user (marks as deleted for compliance)
 */
export const syncUserDelete = internalMutation({
  args: {
    clerkId: v.string(),
  },
  handler: async (ctx, args) => {
    const existingUser = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.clerkId))
      .first();

    if (!existingUser) {
      return;
    }

    // Soft delete - mark as deleted but retain for compliance period
    await ctx.db.patch(existingUser._id, {
      isDeleted: true,
      updatedAt: Date.now(),
      // Clear PII but keep structure for references
      email: "[deleted]",
      firstName: null,
      lastName: null,
      imageUrl: null,
    });

    // Log the deletion for audit
    await ctx.db.insert("auditLogs", {
      action: "user.deleted",
      userId: args.clerkId,
      timestamp: Date.now(),
      metadata: {
        source: "clerk_webhook",
        deletionType: "soft",
      },
    });
  },
});

/**
 * Handles session creation events
 */
export const handleSessionCreated = internalMutation({
  args: {
    sessionData: v.any(),
  },
  handler: async (ctx, args) => {
    const sessionData = args.sessionData as ClerkSessionData;

    // Update user's last active timestamp
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", sessionData.user_id))
      .first();

    if (user) {
      await ctx.db.patch(user._id, {
        lastActiveAt: Date.now(),
      });
    }

    // Store session for tracking
    await ctx.db.insert("sessions", {
      clerkSessionId: sessionData.id,
      userId: sessionData.user_id,
      clientId: sessionData.client_id,
      status: sessionData.status,
      createdAt: sessionData.created_at,
      expiresAt: sessionData.expire_at,
      lastActiveAt: sessionData.last_active_at,
    });
  },
});

/**
 * Handles session end/revoke events
 */
export const handleSessionEnded = internalMutation({
  args: {
    sessionData: v.any(),
  },
  handler: async (ctx, args) => {
    const sessionData = args.sessionData as ClerkSessionData;

    // Update session status
    const session = await ctx.db
      .query("sessions")
      .withIndex("by_clerk_session_id", (q) =>
        q.eq("clerkSessionId", sessionData.id)
      )
      .first();

    if (session) {
      await ctx.db.patch(session._id, {
        status: sessionData.status,
      });
    }

    // Log session end for audit
    await ctx.db.insert("auditLogs", {
      action: "session.ended",
      userId: sessionData.user_id,
      timestamp: Date.now(),
      metadata: {
        sessionId: sessionData.id,
        reason: sessionData.status,
      },
    });
  },
});

// ============================================================================
// JWT Validation Helpers
// ============================================================================

/**
 * Verifies a webhook signature from Clerk/Svix
 *
 * Uses HMAC-SHA256 signature verification for webhook security
 */
async function verifyWebhookSignature(
  payload: string,
  svixId: string,
  svixTimestamp: string,
  svixSignature: string
): Promise<boolean> {
  const webhookSecret = process.env.CLERK_WEBHOOK_SECRET;

  if (!webhookSecret) {
    console.error("CLERK_WEBHOOK_SECRET not configured - rejecting webhook");
    return false;
  }

  try {
    // Verify timestamp is within 5 minutes to prevent replay attacks
    const timestampSeconds = parseInt(svixTimestamp, 10);
    const currentTimestamp = Math.floor(Date.now() / 1000);
    const tolerance = 300; // 5 minutes

    if (Math.abs(currentTimestamp - timestampSeconds) > tolerance) {
      console.error("Webhook timestamp outside tolerance window");
      return false;
    }

    // Construct the signed payload
    const signedPayload = `${svixId}.${svixTimestamp}.${payload}`;

    // Parse the signature (format: v1,signature1 v1,signature2)
    const signatures = svixSignature.split(" ");
    const secret = webhookSecret.startsWith("whsec_")
      ? webhookSecret.slice(6)
      : webhookSecret;

    // Create HMAC-SHA256 signature
    const encoder = new TextEncoder();
    const keyData = Uint8Array.from(atob(secret), c => c.charCodeAt(0));
    const key = await crypto.subtle.importKey(
      "raw",
      keyData,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );

    const signatureBuffer = await crypto.subtle.sign(
      "HMAC",
      key,
      encoder.encode(signedPayload)
    );

    const expectedSignature = btoa(String.fromCharCode(...new Uint8Array(signatureBuffer)));

    // Check if any of the provided signatures match
    for (const sig of signatures) {
      const [version, signature] = sig.split(",");
      if (version === "v1" && signature === expectedSignature) {
        return true;
      }
    }

    console.error("Webhook signature verification failed - no matching signature");
    return false;
  } catch (error) {
    console.error("Webhook signature verification error:", error);
    return false;
  }
}

/**
 * Validates a Clerk JWT token with signature verification
 *
 * @param token - The JWT token to validate
 * @returns The decoded payload if valid, null otherwise
 */
export async function validateClerkToken(
  token: string
): Promise<ClerkJWTPayload | null> {
  const clerkSecretKey = process.env.CLERK_SECRET_KEY;
  const clerkPublishableKey = process.env.CLERK_PUBLISHABLE_KEY;

  if (!clerkSecretKey) {
    console.error("CLERK_SECRET_KEY not configured - cannot validate JWT");
    return null;
  }

  try {
    // Split JWT into parts
    const parts = token.split(".");
    if (parts.length !== 3) {
      console.error("Invalid JWT structure");
      return null;
    }

    const [headerB64, payloadB64, signatureB64] = parts;

    // Decode header to get algorithm
    const headerJson = Buffer.from(headerB64, "base64url").toString("utf-8");
    const header = JSON.parse(headerJson) as { alg: string; typ: string };

    if (header.alg !== "RS256") {
      console.error(`Unsupported JWT algorithm: ${header.alg}`);
      return null;
    }

    // Decode payload
    const payloadJson = Buffer.from(payloadB64, "base64url").toString("utf-8");
    const payload = JSON.parse(payloadJson) as ClerkJWTPayload;

    // Verify signature using Clerk's JWKS
    const isSignatureValid = await verifyJWTSignature(
      `${headerB64}.${payloadB64}`,
      signatureB64,
      payload.iss
    );

    if (!isSignatureValid) {
      console.error("JWT signature verification failed");
      return null;
    }

    // Check expiration
    const now = Date.now() / 1000;
    if (payload.exp < now) {
      console.error("JWT expired");
      return null;
    }

    // Check not-before
    if (payload.nbf && payload.nbf > now) {
      console.error("JWT not yet valid (nbf)");
      return null;
    }

    // Check issued-at isn't in the future (with 30s tolerance for clock skew)
    if (payload.iat && payload.iat > now + 30) {
      console.error("JWT issued in the future");
      return null;
    }

    // Verify issuer matches Clerk
    if (!payload.iss || !payload.iss.includes("clerk")) {
      console.error("Invalid JWT issuer");
      return null;
    }

    return payload;
  } catch (error) {
    console.error("JWT validation error:", error);
    return null;
  }
}

/**
 * Verifies JWT signature against Clerk's JWKS
 * Caches public keys for performance
 */
const jwksCache = new Map<string, { key: CryptoKey; expiresAt: number }>();

async function verifyJWTSignature(
  signedContent: string,
  signature: string,
  issuer: string
): Promise<boolean> {
  try {
    // Get or fetch JWKS
    const jwksUrl = `${issuer}/.well-known/jwks.json`;

    let publicKey = jwksCache.get(jwksUrl);
    const now = Date.now();

    if (!publicKey || publicKey.expiresAt < now) {
      // Fetch JWKS from Clerk
      const response = await fetch(jwksUrl);
      if (!response.ok) {
        console.error(`Failed to fetch JWKS: ${response.status}`);
        return false;
      }

      const jwks = await response.json() as { keys: Array<{ kty: string; n: string; e: string; alg: string; use: string }> };
      const rsaKey = jwks.keys.find(k => k.kty === "RSA" && k.use === "sig");

      if (!rsaKey) {
        console.error("No suitable RSA key found in JWKS");
        return false;
      }

      // Import the public key
      const importedKey = await crypto.subtle.importKey(
        "jwk",
        {
          kty: rsaKey.kty,
          n: rsaKey.n,
          e: rsaKey.e,
          alg: "RS256",
          use: "sig",
        },
        { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
        false,
        ["verify"]
      );

      publicKey = {
        key: importedKey,
        expiresAt: now + 3600000, // Cache for 1 hour
      };
      jwksCache.set(jwksUrl, publicKey);
    }

    // Verify the signature
    const encoder = new TextEncoder();
    const signatureBytes = Uint8Array.from(
      atob(signature.replace(/-/g, "+").replace(/_/g, "/")),
      c => c.charCodeAt(0)
    );

    const isValid = await crypto.subtle.verify(
      "RSASSA-PKCS1-v1_5",
      publicKey.key,
      signatureBytes,
      encoder.encode(signedContent)
    );

    return isValid;
  } catch (error) {
    console.error("JWT signature verification error:", error);
    return false;
  }
}

/**
 * Extracts the user ID from a validated JWT payload
 */
export function extractUserIdFromToken(payload: ClerkJWTPayload): string {
  return payload.sub;
}

/**
 * Extracts the session ID from a validated JWT payload
 */
export function extractSessionIdFromToken(
  payload: ClerkJWTPayload
): string | null {
  return payload.sid ?? null;
}

/**
 * Checks if a token belongs to a specific organization
 */
export function isOrganizationMember(
  payload: ClerkJWTPayload,
  orgId: string
): boolean {
  return payload.org_id === orgId;
}

/**
 * Checks if a user has a specific organization role
 */
export function hasOrganizationRole(
  payload: ClerkJWTPayload,
  role: string
): boolean {
  return payload.org_role === role;
}

/**
 * Checks if a user has a specific organization permission
 */
export function hasOrganizationPermission(
  payload: ClerkJWTPayload,
  permission: string
): boolean {
  return payload.org_permissions?.includes(permission) ?? false;
}

// ============================================================================
// Session Management Utilities
// ============================================================================

/**
 * Gets the current user from the database based on Clerk ID
 */
export const getUserByClerkId = internalQuery({
  args: {
    clerkId: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.clerkId))
      .first();
  },
});

/**
 * Updates user metadata (consent level, intelligence level, etc.)
 */
export const updateUserMetadata = internalMutation({
  args: {
    clerkId: v.string(),
    metadata: v.object({
      consentLevel: v.optional(v.number()),
      intelligenceLevel: v.optional(
        v.union(
          v.literal("passive"),
          v.literal("advisory"),
          v.literal("proactive")
        )
      ),
      privacySettings: v.optional(
        v.object({
          dataRetentionDays: v.number(),
          allowAnalytics: v.boolean(),
          allowPersonalization: v.boolean(),
        })
      ),
    }),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.clerkId))
      .first();

    if (!user) {
      throw new Error("User not found");
    }

    const updatedMetadata = {
      ...user.metadata,
      ...args.metadata,
      privacySettings: args.metadata.privacySettings
        ? { ...user.metadata.privacySettings, ...args.metadata.privacySettings }
        : user.metadata.privacySettings,
    };

    await ctx.db.patch(user._id, {
      metadata: updatedMetadata,
      updatedAt: Date.now(),
    });

    // Log metadata update for audit
    await ctx.db.insert("auditLogs", {
      action: "user.metadata_updated",
      userId: args.clerkId,
      timestamp: Date.now(),
      metadata: {
        changedFields: Object.keys(args.metadata),
      },
    });

    return updatedMetadata;
  },
});

/**
 * Records user activity for session tracking
 */
export const recordUserActivity = internalMutation({
  args: {
    clerkId: v.string(),
    activityType: v.string(),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.clerkId))
      .first();

    if (user) {
      await ctx.db.patch(user._id, {
        lastActiveAt: Date.now(),
      });
    }

    // Only log if consent level allows
    if (user && user.metadata.consentLevel >= 2) {
      await ctx.db.insert("activityLogs", {
        userId: args.clerkId,
        activityType: args.activityType,
        timestamp: Date.now(),
        metadata: args.metadata ?? {},
      });
    }
  },
});

// ============================================================================
// User Metadata Sync Functions
// ============================================================================

/**
 * Syncs user preferences from the iOS app to the backend
 */
export const syncUserPreferences = internalMutation({
  args: {
    clerkId: v.string(),
    preferences: v.object({
      theme: v.optional(v.string()),
      language: v.optional(v.string()),
      notifications: v.optional(v.boolean()),
      voiceEnabled: v.optional(v.boolean()),
      hapticFeedback: v.optional(v.boolean()),
    }),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.clerkId))
      .first();

    if (!user) {
      throw new Error("User not found");
    }

    // Store preferences in a separate collection for flexibility
    const existingPrefs = await ctx.db
      .query("userPreferences")
      .withIndex("by_user_id", (q) => q.eq("userId", args.clerkId))
      .first();

    if (existingPrefs) {
      await ctx.db.patch(existingPrefs._id, {
        ...args.preferences,
        updatedAt: Date.now(),
      });
    } else {
      await ctx.db.insert("userPreferences", {
        userId: args.clerkId,
        ...args.preferences,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    }
  },
});

/**
 * Gets the current sync status for a user
 */
export const getUserSyncStatus = internalQuery({
  args: {
    clerkId: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.clerkId))
      .first();

    if (!user) {
      return { synced: false, lastSyncAt: null };
    }

    return {
      synced: true,
      lastSyncAt: user.updatedAt,
      consentLevel: user.metadata.consentLevel,
      intelligenceLevel: user.metadata.intelligenceLevel,
    };
  },
});
