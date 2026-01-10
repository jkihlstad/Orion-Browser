import { v } from "convex/values";
import { mutation, query, QueryCtx, MutationCtx } from "./_generated/server";
import type { Id } from "./id";

// Helper to get user from Clerk ID
export async function getUserByClerkId(
  ctx: QueryCtx | MutationCtx,
  clerkId: string
) {
  return await ctx.db
    .query("users")
    .withIndex("by_clerkId", (q) => q.eq("clerkId", clerkId))
    .unique();
}

// Helper to get user by ID with null check
export async function getUser(ctx: QueryCtx | MutationCtx, userId: Id<"users">) {
  return await ctx.db.get(userId);
}

// Helper to require authenticated user
export async function requireUser(
  ctx: QueryCtx | MutationCtx,
  clerkId: string
): Promise<{ _id: Id<"users">; clerkId: string; email: string }> {
  const user = await getUserByClerkId(ctx, clerkId);
  if (!user) {
    throw new Error("User not found. Please sign up first.");
  }
  return user;
}

// Create a new user from Clerk authentication
export const createUser = mutation({
  args: {
    clerkId: v.string(),
    email: v.string(),
    preferences: v.optional(
      v.object({
        defaultSearchEngine: v.optional(v.string()),
        voiceEnabled: v.optional(v.boolean()),
        hapticFeedback: v.optional(v.boolean()),
        contentBlockingLevel: v.optional(v.string()),
        syncEnabled: v.optional(v.boolean()),
        theme: v.optional(v.string()),
        fontSize: v.optional(v.number()),
        customSettings: v.optional(v.any()),
      })
    ),
  },
  handler: async (ctx, args) => {
    // Check if user already exists
    const existingUser = await getUserByClerkId(ctx, args.clerkId);
    if (existingUser) {
      return existingUser._id;
    }

    // Create new user with default settings
    const userId = await ctx.db.insert("users", {
      clerkId: args.clerkId,
      email: args.email,
      intelligenceLevel: "off",
      consentState: "not_started",
      preferences: args.preferences ?? {
        defaultSearchEngine: "google",
        voiceEnabled: true,
        hapticFeedback: true,
        contentBlockingLevel: "standard",
        syncEnabled: false,
        theme: "system",
        fontSize: 16,
      },
      createdAt: Date.now(),
    });

    // Log user creation
    await ctx.db.insert("auditLogs", {
      userId,
      action: "user.created",
      details: {
        resourceType: "user",
        resourceId: userId,
        success: true,
      },
      timestamp: Date.now(),
    });

    return userId;
  },
});

// Get user by Clerk ID
export const getUserByClerk = query({
  args: {
    clerkId: v.string(),
  },
  handler: async (ctx, args) => {
    return await getUserByClerkId(ctx, args.clerkId);
  },
});

// Get current user profile
export const getCurrentUser = query({
  args: {
    clerkId: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await getUserByClerkId(ctx, args.clerkId);
    if (!user) {
      return null;
    }

    return {
      id: user._id,
      email: user.email,
      intelligenceLevel: user.intelligenceLevel,
      consentState: user.consentState,
      preferences: user.preferences,
      createdAt: user.createdAt,
    };
  },
});

// Update user profile
export const updateUser = mutation({
  args: {
    clerkId: v.string(),
    email: v.optional(v.string()),
    preferences: v.optional(
      v.object({
        defaultSearchEngine: v.optional(v.string()),
        voiceEnabled: v.optional(v.boolean()),
        hapticFeedback: v.optional(v.boolean()),
        contentBlockingLevel: v.optional(v.string()),
        syncEnabled: v.optional(v.boolean()),
        theme: v.optional(v.string()),
        fontSize: v.optional(v.number()),
        customSettings: v.optional(v.any()),
      })
    ),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx, args.clerkId);

    const updates: Record<string, unknown> = {
      updatedAt: Date.now(),
    };

    if (args.email !== undefined) {
      updates.email = args.email;
    }

    if (args.preferences !== undefined) {
      // Merge with existing preferences
      updates.preferences = {
        ...user.preferences,
        ...args.preferences,
      };
    }

    await ctx.db.patch(user._id, updates);

    // Log update
    await ctx.db.insert("auditLogs", {
      userId: user._id,
      action: "user.updated",
      details: {
        resourceType: "user",
        resourceId: user._id,
        newValue: updates,
        success: true,
      },
      timestamp: Date.now(),
    });

    return user._id;
  },
});

// Delete user and all associated data (GDPR compliance)
export const deleteUser = mutation({
  args: {
    clerkId: v.string(),
    confirmDeletion: v.boolean(),
  },
  handler: async (ctx, args) => {
    if (!args.confirmDeletion) {
      throw new Error("Deletion must be explicitly confirmed");
    }

    const user = await requireUser(ctx, args.clerkId);

    // Delete all user data in order (respecting foreign key relationships)

    // 1. Delete content embeddings
    const contentEmbeddings = await ctx.db
      .query("contentEmbeddings")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .collect();
    for (const embedding of contentEmbeddings) {
      await ctx.db.delete(embedding._id);
    }

    // 2. Delete voice embeddings
    const voiceEmbeddings = await ctx.db
      .query("voiceEmbeddings")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .collect();
    for (const embedding of voiceEmbeddings) {
      await ctx.db.delete(embedding._id);
    }

    // 3. Delete browsing events
    const browsingEvents = await ctx.db
      .query("browsingEvents")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .collect();
    for (const event of browsingEvents) {
      await ctx.db.delete(event._id);
    }

    // 4. Delete browsing sessions
    const sessions = await ctx.db
      .query("browsingSessions")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .collect();
    for (const session of sessions) {
      await ctx.db.delete(session._id);
    }

    // 5. Delete voice sessions
    const voiceSessions = await ctx.db
      .query("voiceSessions")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .collect();
    for (const session of voiceSessions) {
      await ctx.db.delete(session._id);
    }

    // 6. Delete consent records
    const consentRecords = await ctx.db
      .query("consentRecords")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .collect();
    for (const record of consentRecords) {
      await ctx.db.delete(record._id);
    }

    // 7. Delete data exports
    const dataExports = await ctx.db
      .query("dataExports")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .collect();
    for (const exportRecord of dataExports) {
      await ctx.db.delete(exportRecord._id);
    }

    // 8. Delete knowledge graph nodes
    const knowledgeNodes = await ctx.db
      .query("knowledgeGraphNodes")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .collect();
    for (const node of knowledgeNodes) {
      await ctx.db.delete(node._id);
    }

    // 9. Log deletion before deleting audit logs
    await ctx.db.insert("auditLogs", {
      action: "user.deleted",
      details: {
        resourceType: "user",
        resourceId: user._id,
        success: true,
      },
      timestamp: Date.now(),
    });

    // 10. Delete audit logs (keep the deletion log)
    const auditLogs = await ctx.db
      .query("auditLogs")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .collect();
    for (const log of auditLogs) {
      await ctx.db.delete(log._id);
    }

    // 11. Finally delete the user
    await ctx.db.delete(user._id);

    return { success: true, deletedUserId: user._id };
  },
});

// Check if user exists by Clerk ID
export const userExists = query({
  args: {
    clerkId: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await getUserByClerkId(ctx, args.clerkId);
    return user !== null;
  },
});

// Sync user from Clerk webhook
export const syncUserFromClerk = mutation({
  args: {
    clerkId: v.string(),
    email: v.string(),
    eventType: v.union(
      v.literal("user.created"),
      v.literal("user.updated"),
      v.literal("user.deleted")
    ),
  },
  handler: async (ctx, args) => {
    const existingUser = await getUserByClerkId(ctx, args.clerkId);

    if (args.eventType === "user.deleted") {
      if (existingUser) {
        // Soft-delete or mark for deletion
        await ctx.db.patch(existingUser._id, {
          updatedAt: Date.now(),
        });

        await ctx.db.insert("auditLogs", {
          userId: existingUser._id,
          action: "user.clerk_deleted",
          details: {
            resourceType: "user",
            resourceId: existingUser._id,
            success: true,
          },
          timestamp: Date.now(),
        });
      }
      return { action: "deleted", userId: existingUser?._id };
    }

    if (args.eventType === "user.created") {
      if (existingUser) {
        return { action: "exists", userId: existingUser._id };
      }

      const userId = await ctx.db.insert("users", {
        clerkId: args.clerkId,
        email: args.email,
        intelligenceLevel: "off",
        consentState: "not_started",
        preferences: {
          defaultSearchEngine: "google",
          voiceEnabled: true,
          hapticFeedback: true,
          contentBlockingLevel: "standard",
          syncEnabled: false,
          theme: "system",
          fontSize: 16,
        },
        createdAt: Date.now(),
      });

      await ctx.db.insert("auditLogs", {
        userId,
        action: "user.created_from_clerk",
        details: {
          resourceType: "user",
          resourceId: userId,
          success: true,
        },
        timestamp: Date.now(),
      });

      return { action: "created", userId };
    }

    if (args.eventType === "user.updated") {
      if (!existingUser) {
        // Create if doesn't exist
        const userId = await ctx.db.insert("users", {
          clerkId: args.clerkId,
          email: args.email,
          intelligenceLevel: "off",
          consentState: "not_started",
          preferences: {},
          createdAt: Date.now(),
        });
        return { action: "created", userId };
      }

      await ctx.db.patch(existingUser._id, {
        email: args.email,
        updatedAt: Date.now(),
      });

      return { action: "updated", userId: existingUser._id };
    }

    return { action: "unknown", userId: null };
  },
});
