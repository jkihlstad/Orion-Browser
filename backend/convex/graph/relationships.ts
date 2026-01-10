/**
 * Relationship Management for Orion Browser Neural Intelligence
 * SUB-AGENT 3: AI & Data Pipeline Engineer
 *
 * Handles relationship analysis:
 * - Contact graph (who talks to whom)
 * - Task dependencies
 * - Content relationships (similar pages, topics)
 * - Social interaction scoring
 * - Collaboration network detection
 */

import { v } from "convex/values";
import { mutation, query, action, internalMutation } from "../_generated/server";
import { internal } from "../_generated/api";
import type { Id } from "../id";

// ============================================================================
// Types
// ============================================================================

export interface ContactRelationship {
  contactId: Id<"knowledgeGraphNodes">;
  contactName: string;
  relationshipStrength: number;
  interactionCount: number;
  lastInteraction: number;
  channels: string[];
  context: string[];
  sentiment: number;
}

export interface TaskDependency {
  taskId: Id<"knowledgeGraphNodes">;
  taskName: string;
  dependsOn: Id<"knowledgeGraphNodes">[];
  blockedBy: Id<"knowledgeGraphNodes">[];
  blocks: Id<"knowledgeGraphNodes">[];
  priority: number;
  status: string;
  estimatedCompletion?: number;
}

export interface ContentSimilarity {
  contentId: Id<"knowledgeGraphNodes">;
  title: string;
  url?: string;
  similarityScore: number;
  sharedTopics: string[];
  sharedEntities: string[];
  relationshipType: "similar" | "related" | "prerequisite" | "followup";
}

export interface CollaborationNetwork {
  members: Array<{
    contactId: Id<"knowledgeGraphNodes">;
    name: string;
    role: string;
    contribution: number;
  }>;
  projects: Array<{
    projectId: Id<"knowledgeGraphNodes">;
    name: string;
    memberCount: number;
  }>;
  interactionPatterns: Array<{
    from: string;
    to: string;
    frequency: number;
    context: string;
  }>;
  networkDensity: number;
  keyCollaborators: string[];
}

// ============================================================================
// Contact Graph Functions
// ============================================================================

/**
 * Build contact graph from interactions
 */
export const buildContactGraph = query({
  args: {
    clerkId: v.string(),
    timeRange: v.optional(v.object({
      start: v.number(),
      end: v.number(),
    })),
    minInteractions: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<ContactRelationship[]> => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", args.clerkId))
      .unique();

    if (!user) {
      return [];
    }

    // Get all contact nodes
    const allNodes = await ctx.db
      .query("knowledgeGraphNodes")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .collect();

    const contactNodes = allNodes.filter(
      (n) => n.metadata?.graphNodeType === "contact" || n.nodeType === "entity"
    );

    // Get browsing events for interaction context
    const timeStart = args.timeRange?.start ?? 0;
    const timeEnd = args.timeRange?.end ?? Date.now();

    const browsingEvents = await ctx.db
      .query("browsingEvents")
      .withIndex("by_userId_timestamp", (q) =>
        q.eq("userId", user._id).gte("timestamp", timeStart)
      )
      .filter((q) => q.lte(q.field("timestamp"), timeEnd))
      .collect();

    // Calculate relationship metrics for each contact
    const relationships: ContactRelationship[] = [];
    const minInteractions = args.minInteractions ?? 1;

    for (const contact of contactNodes) {
      // Count interactions (mentions in events, connections)
      const mentionCount = browsingEvents.filter((e) =>
        e.metadata?.title?.toLowerCase().includes(contact.content.toLowerCase()) ||
        e.url.toLowerCase().includes(contact.content.toLowerCase())
      ).length;

      const connectionWeight = contact.connections.reduce(
        (sum, c) => sum + c.weight,
        0
      );

      const interactionCount = mentionCount + Math.floor(connectionWeight * 10);

      if (interactionCount < minInteractions) {
        continue;
      }

      // Determine interaction channels
      const channels: string[] = [];
      if (browsingEvents.some((e) => e.url.includes("email"))) channels.push("email");
      if (browsingEvents.some((e) => e.url.includes("slack") || e.url.includes("teams"))) {
        channels.push("messaging");
      }
      if (browsingEvents.some((e) => e.url.includes("linkedin"))) channels.push("linkedin");
      if (browsingEvents.some((e) => e.url.includes("github"))) channels.push("github");

      // Extract context from related nodes
      const relatedNodes = contact.connections.map((c) =>
        allNodes.find((n) => n._id === c.targetNodeId)
      ).filter(Boolean);

      const context = relatedNodes
        .filter((n) => n?.nodeType === "topic" || n?.metadata?.graphNodeType === "topic")
        .map((n) => n!.content)
        .slice(0, 5);

      // Find last interaction timestamp
      const lastInteraction = Math.max(
        contact.updatedAt ?? contact.createdAt,
        ...browsingEvents
          .filter((e) =>
            e.metadata?.title?.toLowerCase().includes(contact.content.toLowerCase())
          )
          .map((e) => e.timestamp)
      );

      relationships.push({
        contactId: contact._id,
        contactName: contact.metadata?.label ?? contact.content,
        relationshipStrength: Math.min(1, connectionWeight + interactionCount / 100),
        interactionCount,
        lastInteraction,
        channels: channels.length > 0 ? channels : ["web"],
        context,
        sentiment: 0.5, // Neutral default, would be calculated from content analysis
      });
    }

    // Sort by relationship strength
    relationships.sort((a, b) => b.relationshipStrength - a.relationshipStrength);

    return relationships;
  },
});

/**
 * Get contact interaction history
 */
export const getContactInteractions = query({
  args: {
    clerkId: v.string(),
    contactNodeId: v.id("knowledgeGraphNodes"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", args.clerkId))
      .unique();

    if (!user) {
      return null;
    }

    const contact = await ctx.db.get(args.contactNodeId);
    if (!contact || contact.userId !== user._id) {
      return null;
    }

    const limit = args.limit ?? 50;
    const contactName = contact.content.toLowerCase();

    // Find browsing events mentioning this contact
    const events = await ctx.db
      .query("browsingEvents")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .collect();

    const relevantEvents = events
      .filter((e) =>
        e.metadata?.title?.toLowerCase().includes(contactName) ||
        e.url.toLowerCase().includes(contactName)
      )
      .slice(0, limit)
      .map((e) => ({
        eventId: e._id,
        url: e.url,
        title: e.metadata?.title,
        timestamp: e.timestamp,
        category: e.category,
      }));

    // Get connected nodes
    const connectedNodes = await Promise.all(
      contact.connections.map(async (c) => {
        const node = await ctx.db.get(c.targetNodeId);
        return node
          ? {
              nodeId: node._id,
              content: node.content,
              nodeType: node.nodeType,
              relationshipType: c.relationshipType,
              weight: c.weight,
            }
          : null;
      })
    );

    return {
      contact: {
        id: contact._id,
        name: contact.metadata?.label ?? contact.content,
        confidence: contact.confidence,
        createdAt: contact.createdAt,
      },
      recentInteractions: relevantEvents,
      connections: connectedNodes.filter(Boolean),
    };
  },
});

/**
 * Update contact relationship
 */
export const updateContactRelationship = mutation({
  args: {
    clerkId: v.string(),
    contactNodeId: v.id("knowledgeGraphNodes"),
    interactionType: v.string(),
    metadata: v.optional(v.object({
      channel: v.optional(v.string()),
      sentiment: v.optional(v.number()),
      context: v.optional(v.string()),
    })),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", args.clerkId))
      .unique();

    if (!user) {
      throw new Error("User not found");
    }

    const contact = await ctx.db.get(args.contactNodeId);
    if (!contact || contact.userId !== user._id) {
      throw new Error("Contact not found");
    }

    // Update confidence based on interaction
    const confidenceBoost = 0.02;
    const newConfidence = Math.min(1, contact.confidence + confidenceBoost);

    await ctx.db.patch(args.contactNodeId, {
      confidence: newConfidence,
      updatedAt: Date.now(),
      metadata: {
        ...contact.metadata,
        lastInteractionType: args.interactionType,
        lastInteractionChannel: args.metadata?.channel,
      },
    });

    return { success: true };
  },
});

// ============================================================================
// Task Dependencies
// ============================================================================

/**
 * Analyze task dependencies
 */
export const analyzeTaskDependencies = query({
  args: {
    clerkId: v.string(),
  },
  handler: async (ctx, args): Promise<TaskDependency[]> => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", args.clerkId))
      .unique();

    if (!user) {
      return [];
    }

    const allNodes = await ctx.db
      .query("knowledgeGraphNodes")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .collect();

    // Filter task nodes
    const taskNodes = allNodes.filter(
      (n) =>
        n.metadata?.graphNodeType === "task" ||
        n.nodeType === "action"
    );

    const dependencies: TaskDependency[] = [];

    for (const task of taskNodes) {
      const dependsOn: Id<"knowledgeGraphNodes">[] = [];
      const blockedBy: Id<"knowledgeGraphNodes">[] = [];
      const blocks: Id<"knowledgeGraphNodes">[] = [];

      // Analyze connections
      for (const conn of task.connections) {
        const connectedNode = allNodes.find((n) => n._id === conn.targetNodeId);
        if (!connectedNode) continue;

        if (
          conn.relationshipType === "FOLLOWS" ||
          conn.relationshipType === "PRECEDES"
        ) {
          if (conn.relationshipType === "FOLLOWS") {
            dependsOn.push(conn.targetNodeId);
          } else {
            blocks.push(conn.targetNodeId);
          }
        }
      }

      // Find tasks that block this one
      for (const otherTask of taskNodes) {
        if (otherTask._id === task._id) continue;

        const blocksThis = otherTask.connections.some(
          (c) =>
            c.targetNodeId === task._id &&
            (c.relationshipType === "PRECEDES" || c.relationshipType === "FOLLOWS")
        );

        if (blocksThis) {
          blockedBy.push(otherTask._id);
        }
      }

      dependencies.push({
        taskId: task._id,
        taskName: task.metadata?.label ?? task.content,
        dependsOn,
        blockedBy,
        blocks,
        priority: task.metadata?.properties?.priority ?? 0.5,
        status: task.metadata?.properties?.status ?? "pending",
        estimatedCompletion: task.metadata?.properties?.estimatedCompletion,
      });
    }

    // Sort by priority and dependency count
    dependencies.sort((a, b) => {
      // Tasks with more blockers should come later
      const aBlocked = a.blockedBy.length;
      const bBlocked = b.blockedBy.length;
      if (aBlocked !== bBlocked) return aBlocked - bBlocked;

      // Higher priority first
      return b.priority - a.priority;
    });

    return dependencies;
  },
});

/**
 * Create task dependency
 */
export const createTaskDependency = mutation({
  args: {
    clerkId: v.string(),
    dependentTaskId: v.id("knowledgeGraphNodes"),
    prerequisiteTaskId: v.id("knowledgeGraphNodes"),
    dependencyType: v.optional(v.union(
      v.literal("blocks"),
      v.literal("requires"),
      v.literal("related")
    )),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", args.clerkId))
      .unique();

    if (!user) {
      throw new Error("User not found");
    }

    const dependentTask = await ctx.db.get(args.dependentTaskId);
    const prerequisiteTask = await ctx.db.get(args.prerequisiteTaskId);

    if (!dependentTask || !prerequisiteTask) {
      throw new Error("Task not found");
    }

    if (
      dependentTask.userId !== user._id ||
      prerequisiteTask.userId !== user._id
    ) {
      throw new Error("Unauthorized");
    }

    const dependencyType = args.dependencyType ?? "requires";
    const relationshipType =
      dependencyType === "blocks" ? "PRECEDES" : "FOLLOWS";

    // Add connection from dependent to prerequisite
    const existingConn = dependentTask.connections.find(
      (c) => c.targetNodeId === args.prerequisiteTaskId
    );

    if (!existingConn) {
      await ctx.db.patch(args.dependentTaskId, {
        connections: [
          ...dependentTask.connections,
          {
            targetNodeId: args.prerequisiteTaskId,
            relationshipType,
            weight: 0.8,
          },
        ],
        updatedAt: Date.now(),
      });
    }

    return { success: true };
  },
});

// ============================================================================
// Content Relationships
// ============================================================================

/**
 * Find similar content
 */
export const findSimilarContent = query({
  args: {
    clerkId: v.string(),
    contentNodeId: v.id("knowledgeGraphNodes"),
    limit: v.optional(v.number()),
    minSimilarity: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<ContentSimilarity[]> => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", args.clerkId))
      .unique();

    if (!user) {
      return [];
    }

    const sourceNode = await ctx.db.get(args.contentNodeId);
    if (!sourceNode || sourceNode.userId !== user._id) {
      return [];
    }

    const limit = args.limit ?? 10;
    const minSimilarity = args.minSimilarity ?? 0.3;

    // Get all content nodes
    const allNodes = await ctx.db
      .query("knowledgeGraphNodes")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .collect();

    const contentNodes = allNodes.filter(
      (n) =>
        n._id !== args.contentNodeId &&
        (n.metadata?.graphNodeType === "content" ||
          n.nodeType === "entity")
    );

    // Extract topics and entities from source node
    const sourceTopics = new Set(
      sourceNode.connections
        .filter((c) => c.relationshipType === "RELATED_TO" || c.relationshipType === "PART_OF")
        .map((c) => {
          const node = allNodes.find((n) => n._id === c.targetNodeId);
          return node?.content;
        })
        .filter(Boolean)
    );

    const similarities: ContentSimilarity[] = [];

    for (const content of contentNodes) {
      // Calculate topic overlap
      const contentTopics = new Set(
        content.connections
          .filter((c) => c.relationshipType === "RELATED_TO" || c.relationshipType === "PART_OF")
          .map((c) => {
            const node = allNodes.find((n) => n._id === c.targetNodeId);
            return node?.content;
          })
          .filter(Boolean)
      );

      const sharedTopics = [...sourceTopics].filter((t) => contentTopics.has(t));
      const topicSimilarity =
        sharedTopics.length /
        Math.max(1, Math.min(sourceTopics.size, contentTopics.size));

      // Check direct connection
      const directConnection = sourceNode.connections.find(
        (c) => c.targetNodeId === content._id
      );
      const connectionBonus = directConnection ? directConnection.weight * 0.3 : 0;

      // Text similarity (simple word overlap)
      const sourceWords = new Set(sourceNode.content.toLowerCase().split(/\s+/));
      const contentWords = new Set(content.content.toLowerCase().split(/\s+/));
      const wordOverlap = [...sourceWords].filter((w) => contentWords.has(w)).length;
      const textSimilarity =
        wordOverlap / Math.max(1, Math.min(sourceWords.size, contentWords.size));

      // Combined similarity score
      const similarityScore =
        topicSimilarity * 0.4 + textSimilarity * 0.3 + connectionBonus;

      if (similarityScore >= minSimilarity) {
        // Determine relationship type
        let relationshipType: ContentSimilarity["relationshipType"] = "related";
        if (directConnection?.relationshipType === "SIMILAR_TO") {
          relationshipType = "similar";
        } else if (directConnection?.relationshipType === "PRECEDES") {
          relationshipType = "prerequisite";
        } else if (directConnection?.relationshipType === "FOLLOWS") {
          relationshipType = "followup";
        }

        similarities.push({
          contentId: content._id,
          title: content.metadata?.label ?? content.content,
          url: content.metadata?.properties?.url,
          similarityScore,
          sharedTopics: sharedTopics as string[],
          sharedEntities: [],
          relationshipType,
        });
      }
    }

    // Sort by similarity and limit
    similarities.sort((a, b) => b.similarityScore - a.similarityScore);
    return similarities.slice(0, limit);
  },
});

/**
 * Build topic clusters
 */
export const buildTopicClusters = query({
  args: {
    clerkId: v.string(),
    minClusterSize: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", args.clerkId))
      .unique();

    if (!user) {
      return [];
    }

    const minClusterSize = args.minClusterSize ?? 2;

    const allNodes = await ctx.db
      .query("knowledgeGraphNodes")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .collect();

    // Get topic nodes
    const topicNodes = allNodes.filter(
      (n) =>
        n.metadata?.graphNodeType === "topic" ||
        n.nodeType === "topic"
    );

    // Build clusters based on shared content connections
    const clusters: Array<{
      topics: string[];
      contentCount: number;
      avgConfidence: number;
    }> = [];

    const processed = new Set<string>();

    for (const topic of topicNodes) {
      if (processed.has(topic._id)) continue;

      const cluster: Id<"knowledgeGraphNodes">[] = [topic._id];
      processed.add(topic._id);

      // Find related topics through shared content
      const contentConnections = allNodes
        .filter((n) =>
          n.connections.some(
            (c) => c.targetNodeId === topic._id && c.relationshipType === "RELATED_TO"
          )
        )
        .map((n) => n._id);

      for (const otherTopic of topicNodes) {
        if (processed.has(otherTopic._id)) continue;

        const sharedContent = allNodes.filter(
          (n) =>
            contentConnections.includes(n._id) &&
            n.connections.some(
              (c) =>
                c.targetNodeId === otherTopic._id &&
                c.relationshipType === "RELATED_TO"
            )
        );

        if (sharedContent.length >= 1) {
          cluster.push(otherTopic._id);
          processed.add(otherTopic._id);
        }
      }

      if (cluster.length >= minClusterSize) {
        const clusterTopics = cluster.map(
          (id) => allNodes.find((n) => n._id === id)?.content ?? ""
        );

        const avgConfidence =
          cluster.reduce((sum, id) => {
            const node = allNodes.find((n) => n._id === id);
            return sum + (node?.confidence ?? 0);
          }, 0) / cluster.length;

        clusters.push({
          topics: clusterTopics,
          contentCount: contentConnections.length,
          avgConfidence,
        });
      }
    }

    return clusters.sort((a, b) => b.contentCount - a.contentCount);
  },
});

// ============================================================================
// Social Interaction Scoring
// ============================================================================

/**
 * Calculate social interaction score
 */
export const calculateInteractionScore = query({
  args: {
    clerkId: v.string(),
    timeRange: v.optional(v.object({
      start: v.number(),
      end: v.number(),
    })),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", args.clerkId))
      .unique();

    if (!user) {
      return null;
    }

    const timeStart = args.timeRange?.start ?? Date.now() - 30 * 24 * 60 * 60 * 1000;
    const timeEnd = args.timeRange?.end ?? Date.now();

    // Get browsing events
    const browsingEvents = await ctx.db
      .query("browsingEvents")
      .withIndex("by_userId_timestamp", (q) =>
        q.eq("userId", user._id).gte("timestamp", timeStart)
      )
      .filter((q) => q.lte(q.field("timestamp"), timeEnd))
      .collect();

    // Categorize social interactions
    const socialPatterns = {
      email: 0,
      messaging: 0,
      socialMedia: 0,
      video: 0,
      collaboration: 0,
    };

    for (const event of browsingEvents) {
      const url = event.url.toLowerCase();

      if (url.includes("mail") || url.includes("outlook") || url.includes("gmail")) {
        socialPatterns.email++;
      }
      if (url.includes("slack") || url.includes("teams") || url.includes("discord")) {
        socialPatterns.messaging++;
      }
      if (
        url.includes("twitter") ||
        url.includes("linkedin") ||
        url.includes("facebook")
      ) {
        socialPatterns.socialMedia++;
      }
      if (url.includes("zoom") || url.includes("meet") || url.includes("webex")) {
        socialPatterns.video++;
      }
      if (
        url.includes("github") ||
        url.includes("notion") ||
        url.includes("confluence")
      ) {
        socialPatterns.collaboration++;
      }
    }

    const totalInteractions = Object.values(socialPatterns).reduce(
      (a, b) => a + b,
      0
    );

    // Calculate engagement score (0-100)
    const engagementScore = Math.min(
      100,
      (totalInteractions / Math.max(1, browsingEvents.length)) * 50
    );

    // Calculate diversity score
    const activeChannels = Object.values(socialPatterns).filter((v) => v > 0).length;
    const diversityScore = (activeChannels / 5) * 100;

    return {
      totalEvents: browsingEvents.length,
      socialInteractions: totalInteractions,
      patterns: socialPatterns,
      engagementScore,
      diversityScore,
      overallScore: (engagementScore + diversityScore) / 2,
      periodDays: Math.ceil((timeEnd - timeStart) / (24 * 60 * 60 * 1000)),
    };
  },
});

// ============================================================================
// Collaboration Network Detection
// ============================================================================

/**
 * Detect collaboration networks
 */
export const detectCollaborationNetwork = query({
  args: {
    clerkId: v.string(),
    minInteractions: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<CollaborationNetwork | null> => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", args.clerkId))
      .unique();

    if (!user) {
      return null;
    }

    const minInteractions = args.minInteractions ?? 3;

    const allNodes = await ctx.db
      .query("knowledgeGraphNodes")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .collect();

    // Find contacts with significant interactions
    const contacts = allNodes.filter(
      (n) =>
        n.metadata?.graphNodeType === "contact" ||
        (n.nodeType === "entity" && n.connections.length >= minInteractions)
    );

    // Find projects
    const projects = allNodes.filter(
      (n) =>
        n.metadata?.graphNodeType === "project" ||
        n.metadata?.graphNodeType === "organization"
    );

    // Build member list
    const members: CollaborationNetwork["members"] = contacts.map((c) => ({
      contactId: c._id,
      name: c.metadata?.label ?? c.content,
      role: c.metadata?.properties?.role ?? "collaborator",
      contribution: Math.min(1, c.connections.length / 10),
    }));

    // Build project list
    const projectList: CollaborationNetwork["projects"] = projects.map((p) => {
      const memberCount = contacts.filter((c) =>
        c.connections.some((conn) => conn.targetNodeId === p._id)
      ).length;

      return {
        projectId: p._id,
        name: p.metadata?.label ?? p.content,
        memberCount,
      };
    });

    // Detect interaction patterns
    const interactionPatterns: CollaborationNetwork["interactionPatterns"] = [];

    for (const contact of contacts) {
      for (const conn of contact.connections) {
        const target = contacts.find((c) => c._id === conn.targetNodeId);
        if (target && conn.weight >= 0.3) {
          interactionPatterns.push({
            from: contact.metadata?.label ?? contact.content,
            to: target.metadata?.label ?? target.content,
            frequency: Math.round(conn.weight * 10),
            context: conn.relationshipType,
          });
        }
      }
    }

    // Calculate network density
    const maxPossibleConnections = (contacts.length * (contacts.length - 1)) / 2;
    const actualConnections = interactionPatterns.length / 2;
    const networkDensity =
      maxPossibleConnections > 0 ? actualConnections / maxPossibleConnections : 0;

    // Find key collaborators (highest degree centrality)
    const keyCollaborators = members
      .sort((a, b) => b.contribution - a.contribution)
      .slice(0, 5)
      .map((m) => m.name);

    return {
      members,
      projects: projectList,
      interactionPatterns,
      networkDensity,
      keyCollaborators,
    };
  },
});

/**
 * Suggest new connections
 */
export const suggestConnections = query({
  args: {
    clerkId: v.string(),
    nodeId: v.id("knowledgeGraphNodes"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", args.clerkId))
      .unique();

    if (!user) {
      return [];
    }

    const sourceNode = await ctx.db.get(args.nodeId);
    if (!sourceNode || sourceNode.userId !== user._id) {
      return [];
    }

    const limit = args.limit ?? 10;

    const allNodes = await ctx.db
      .query("knowledgeGraphNodes")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .collect();

    // Get nodes already connected
    const connectedIds = new Set(sourceNode.connections.map((c) => c.targetNodeId));
    connectedIds.add(args.nodeId);

    // Find nodes with shared connections (friend-of-friend)
    const suggestions: Array<{
      nodeId: Id<"knowledgeGraphNodes">;
      content: string;
      score: number;
      reason: string;
    }> = [];

    for (const node of allNodes) {
      if (connectedIds.has(node._id)) continue;

      // Count shared connections
      const sharedConnections = node.connections.filter((c) =>
        connectedIds.has(c.targetNodeId)
      ).length;

      if (sharedConnections > 0) {
        suggestions.push({
          nodeId: node._id,
          content: node.metadata?.label ?? node.content,
          score: sharedConnections / Math.max(1, node.connections.length),
          reason: `${sharedConnections} shared connections`,
        });
      }

      // Same node type affinity
      if (node.nodeType === sourceNode.nodeType && sharedConnections === 0) {
        suggestions.push({
          nodeId: node._id,
          content: node.metadata?.label ?? node.content,
          score: 0.3,
          reason: `Same type: ${node.nodeType}`,
        });
      }
    }

    // Sort by score and return top suggestions
    suggestions.sort((a, b) => b.score - a.score);
    return suggestions.slice(0, limit);
  },
});

// ============================================================================
// Relationship Analytics
// ============================================================================

/**
 * Get relationship analytics summary
 */
export const getRelationshipAnalytics = query({
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

    const allNodes = await ctx.db
      .query("knowledgeGraphNodes")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .collect();

    // Relationship type distribution
    const relationshipTypes: Record<string, number> = {};
    for (const node of allNodes) {
      for (const conn of node.connections) {
        relationshipTypes[conn.relationshipType] =
          (relationshipTypes[conn.relationshipType] ?? 0) + 1;
      }
    }

    // Average weights by type
    const avgWeightsByType: Record<string, number> = {};
    const countsByType: Record<string, number> = {};

    for (const node of allNodes) {
      for (const conn of node.connections) {
        avgWeightsByType[conn.relationshipType] =
          (avgWeightsByType[conn.relationshipType] ?? 0) + conn.weight;
        countsByType[conn.relationshipType] =
          (countsByType[conn.relationshipType] ?? 0) + 1;
      }
    }

    for (const type in avgWeightsByType) {
      avgWeightsByType[type] /= countsByType[type];
    }

    // Identify isolated nodes
    const isolatedNodes = allNodes.filter((n) => n.connections.length === 0);

    // Identify hub nodes
    const hubNodes = allNodes
      .filter((n) => n.connections.length > 5)
      .map((n) => ({
        id: n._id,
        content: n.content,
        connectionCount: n.connections.length,
      }));

    return {
      totalNodes: allNodes.length,
      totalRelationships: Object.values(relationshipTypes).reduce((a, b) => a + b, 0),
      relationshipTypeDistribution: relationshipTypes,
      averageWeightsByType: avgWeightsByType,
      isolatedNodeCount: isolatedNodes.length,
      hubNodes: hubNodes.slice(0, 10),
    };
  },
});
