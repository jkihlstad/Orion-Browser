import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Id } from "./id";
import { requireUser } from "./auth";
import { nodeTypes } from "./schema";

// Create a new knowledge graph node
export const createNode = mutation({
  args: {
    clerkId: v.string(),
    nodeType: nodeTypes,
    content: v.string(),
    confidence: v.number(),
    sourceEvents: v.optional(v.array(v.id("browsingEvents"))),
    extractionMethod: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx, args.clerkId);

    // Check if knowledge graph feature is enabled
    const fullUser = await ctx.db.get(user._id);
    if (
      fullUser?.intelligenceLevel !== "full" &&
      fullUser?.intelligenceLevel !== "enhanced"
    ) {
      throw new Error(
        "Knowledge graph requires enhanced or full intelligence level"
      );
    }

    const nodeId = await ctx.db.insert("knowledgeGraphNodes", {
      userId: user._id,
      nodeType: args.nodeType,
      content: args.content,
      connections: [],
      confidence: args.confidence,
      createdAt: Date.now(),
      metadata: {
        sourceEvents: args.sourceEvents,
        extractionMethod: args.extractionMethod,
      },
    });

    // Log node creation
    await ctx.db.insert("auditLogs", {
      userId: user._id,
      action: "knowledge.node_created",
      details: {
        resourceType: "knowledgeGraphNodes",
        resourceId: nodeId,
        newValue: { nodeType: args.nodeType, content: args.content },
        success: true,
      },
      timestamp: Date.now(),
    });

    return nodeId;
  },
});

// Update a knowledge graph node
export const updateNode = mutation({
  args: {
    clerkId: v.string(),
    nodeId: v.id("knowledgeGraphNodes"),
    content: v.optional(v.string()),
    confidence: v.optional(v.number()),
    nodeType: v.optional(nodeTypes),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx, args.clerkId);
    const node = await ctx.db.get(args.nodeId);

    if (!node) {
      throw new Error("Node not found");
    }

    if (node.userId !== user._id) {
      throw new Error("Unauthorized");
    }

    const updates: Record<string, unknown> = {
      updatedAt: Date.now(),
    };

    if (args.content !== undefined) {
      updates.content = args.content;
    }
    if (args.confidence !== undefined) {
      updates.confidence = args.confidence;
    }
    if (args.nodeType !== undefined) {
      updates.nodeType = args.nodeType;
    }

    await ctx.db.patch(args.nodeId, updates);

    return { success: true };
  },
});

// Add connection between nodes
export const addConnection = mutation({
  args: {
    clerkId: v.string(),
    sourceNodeId: v.id("knowledgeGraphNodes"),
    targetNodeId: v.id("knowledgeGraphNodes"),
    relationshipType: v.string(),
    weight: v.number(),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx, args.clerkId);

    // Verify both nodes belong to user
    const sourceNode = await ctx.db.get(args.sourceNodeId);
    const targetNode = await ctx.db.get(args.targetNodeId);

    if (!sourceNode || !targetNode) {
      throw new Error("One or both nodes not found");
    }

    if (sourceNode.userId !== user._id || targetNode.userId !== user._id) {
      throw new Error("Unauthorized");
    }

    // Check if connection already exists
    const existingConnection = sourceNode.connections.find(
      (c) => c.targetNodeId === args.targetNodeId
    );

    if (existingConnection) {
      // Update existing connection
      const updatedConnections = sourceNode.connections.map((c) =>
        c.targetNodeId === args.targetNodeId
          ? { ...c, relationshipType: args.relationshipType, weight: args.weight }
          : c
      );

      await ctx.db.patch(args.sourceNodeId, {
        connections: updatedConnections,
        updatedAt: Date.now(),
      });
    } else {
      // Add new connection
      await ctx.db.patch(args.sourceNodeId, {
        connections: [
          ...sourceNode.connections,
          {
            targetNodeId: args.targetNodeId,
            relationshipType: args.relationshipType,
            weight: args.weight,
          },
        ],
        updatedAt: Date.now(),
      });
    }

    return { success: true };
  },
});

// Remove connection between nodes
export const removeConnection = mutation({
  args: {
    clerkId: v.string(),
    sourceNodeId: v.id("knowledgeGraphNodes"),
    targetNodeId: v.id("knowledgeGraphNodes"),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx, args.clerkId);

    const sourceNode = await ctx.db.get(args.sourceNodeId);

    if (!sourceNode) {
      throw new Error("Source node not found");
    }

    if (sourceNode.userId !== user._id) {
      throw new Error("Unauthorized");
    }

    const updatedConnections = sourceNode.connections.filter(
      (c) => c.targetNodeId !== args.targetNodeId
    );

    await ctx.db.patch(args.sourceNodeId, {
      connections: updatedConnections,
      updatedAt: Date.now(),
    });

    return { success: true };
  },
});

// Get node by ID
export const getNode = query({
  args: {
    clerkId: v.string(),
    nodeId: v.id("knowledgeGraphNodes"),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", args.clerkId))
      .unique();

    if (!user) {
      return null;
    }

    const node = await ctx.db.get(args.nodeId);

    if (!node || node.userId !== user._id) {
      return null;
    }

    return node;
  },
});

// Get all nodes for user
export const getNodes = query({
  args: {
    clerkId: v.string(),
    nodeType: v.optional(nodeTypes),
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

    let nodes;
    if (args.nodeType) {
      nodes = await ctx.db
        .query("knowledgeGraphNodes")
        .withIndex("by_userId_nodeType", (q) =>
          q.eq("userId", user._id).eq("nodeType", args.nodeType!)
        )
        .order("desc")
        .collect();
    } else {
      nodes = await ctx.db
        .query("knowledgeGraphNodes")
        .withIndex("by_userId", (q) => q.eq("userId", user._id))
        .order("desc")
        .collect();
    }

    const limit = args.limit ?? 100;
    return nodes.slice(0, limit);
  },
});

// Get connected nodes
export const getConnectedNodes = query({
  args: {
    clerkId: v.string(),
    nodeId: v.id("knowledgeGraphNodes"),
    depth: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", args.clerkId))
      .unique();

    if (!user) {
      return null;
    }

    const node = await ctx.db.get(args.nodeId);

    if (!node || node.userId !== user._id) {
      return null;
    }

    const depth = args.depth ?? 1;
    const visited = new Set<string>();
    const result: Array<{
      node: typeof node;
      depth: number;
      path: string[];
    }> = [];

    // BFS to find connected nodes
    const queue: Array<{
      nodeId: Id<"knowledgeGraphNodes">;
      currentDepth: number;
      path: string[];
    }> = [{ nodeId: args.nodeId, currentDepth: 0, path: [] }];

    while (queue.length > 0) {
      const current = queue.shift()!;

      if (visited.has(current.nodeId)) continue;
      visited.add(current.nodeId);

      const currentNode = await ctx.db.get(current.nodeId);
      if (!currentNode) continue;

      if (current.currentDepth > 0) {
        result.push({
          node: currentNode,
          depth: current.currentDepth,
          path: current.path,
        });
      }

      if (current.currentDepth < depth) {
        for (const connection of currentNode.connections) {
          if (!visited.has(connection.targetNodeId)) {
            queue.push({
              nodeId: connection.targetNodeId,
              currentDepth: current.currentDepth + 1,
              path: [...current.path, connection.relationshipType],
            });
          }
        }
      }
    }

    return {
      sourceNode: node,
      connectedNodes: result,
      totalConnections: result.length,
    };
  },
});

// Search nodes by content
export const searchNodes = query({
  args: {
    clerkId: v.string(),
    query: v.string(),
    nodeType: v.optional(nodeTypes),
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

    let nodes;
    if (args.nodeType) {
      nodes = await ctx.db
        .query("knowledgeGraphNodes")
        .withIndex("by_userId_nodeType", (q) =>
          q.eq("userId", user._id).eq("nodeType", args.nodeType!)
        )
        .collect();
    } else {
      nodes = await ctx.db
        .query("knowledgeGraphNodes")
        .withIndex("by_userId", (q) => q.eq("userId", user._id))
        .collect();
    }

    const searchQuery = args.query.toLowerCase();
    const matchingNodes = nodes.filter((n) =>
      n.content.toLowerCase().includes(searchQuery)
    );

    // Sort by confidence
    matchingNodes.sort((a, b) => b.confidence - a.confidence);

    const limit = args.limit ?? 20;
    return matchingNodes.slice(0, limit);
  },
});

// Delete a node
export const deleteNode = mutation({
  args: {
    clerkId: v.string(),
    nodeId: v.id("knowledgeGraphNodes"),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx, args.clerkId);
    const node = await ctx.db.get(args.nodeId);

    if (!node) {
      throw new Error("Node not found");
    }

    if (node.userId !== user._id) {
      throw new Error("Unauthorized");
    }

    // Remove connections to this node from other nodes
    const allNodes = await ctx.db
      .query("knowledgeGraphNodes")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .collect();

    for (const otherNode of allNodes) {
      const hasConnection = otherNode.connections.some(
        (c) => c.targetNodeId === args.nodeId
      );
      if (hasConnection) {
        await ctx.db.patch(otherNode._id, {
          connections: otherNode.connections.filter(
            (c) => c.targetNodeId !== args.nodeId
          ),
          updatedAt: Date.now(),
        });
      }
    }

    // Delete the node
    await ctx.db.delete(args.nodeId);

    // Log deletion
    await ctx.db.insert("auditLogs", {
      userId: user._id,
      action: "knowledge.node_deleted",
      details: {
        resourceType: "knowledgeGraphNodes",
        resourceId: args.nodeId,
        previousValue: { nodeType: node.nodeType, content: node.content },
        success: true,
      },
      timestamp: Date.now(),
    });

    return { success: true };
  },
});

// Get knowledge graph statistics
export const getGraphStats = query({
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

    const nodes = await ctx.db
      .query("knowledgeGraphNodes")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .collect();

    // Calculate statistics
    const nodeTypeDistribution: Record<string, number> = {};
    let totalConnections = 0;
    let avgConfidence = 0;

    for (const node of nodes) {
      nodeTypeDistribution[node.nodeType] =
        (nodeTypeDistribution[node.nodeType] ?? 0) + 1;
      totalConnections += node.connections.length;
      avgConfidence += node.confidence;
    }

    if (nodes.length > 0) {
      avgConfidence /= nodes.length;
    }

    // Find most connected nodes
    const sortedByConnections = [...nodes].sort(
      (a, b) => b.connections.length - a.connections.length
    );
    const mostConnected = sortedByConnections.slice(0, 5).map((n) => ({
      id: n._id,
      content: n.content,
      connectionCount: n.connections.length,
    }));

    return {
      totalNodes: nodes.length,
      totalConnections,
      averageConnectionsPerNode:
        nodes.length > 0 ? totalConnections / nodes.length : 0,
      averageConfidence: avgConfidence,
      nodeTypeDistribution,
      mostConnectedNodes: mostConnected,
    };
  },
});

// Merge two nodes
export const mergeNodes = mutation({
  args: {
    clerkId: v.string(),
    sourceNodeId: v.id("knowledgeGraphNodes"),
    targetNodeId: v.id("knowledgeGraphNodes"),
    mergedContent: v.string(),
    mergedConfidence: v.number(),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx, args.clerkId);

    const sourceNode = await ctx.db.get(args.sourceNodeId);
    const targetNode = await ctx.db.get(args.targetNodeId);

    if (!sourceNode || !targetNode) {
      throw new Error("One or both nodes not found");
    }

    if (sourceNode.userId !== user._id || targetNode.userId !== user._id) {
      throw new Error("Unauthorized");
    }

    // Merge connections, avoiding duplicates
    const mergedConnections = [...targetNode.connections];
    for (const conn of sourceNode.connections) {
      if (
        conn.targetNodeId !== args.targetNodeId &&
        !mergedConnections.some((c) => c.targetNodeId === conn.targetNodeId)
      ) {
        mergedConnections.push(conn);
      }
    }

    // Update target node with merged data
    await ctx.db.patch(args.targetNodeId, {
      content: args.mergedContent,
      confidence: args.mergedConfidence,
      connections: mergedConnections,
      updatedAt: Date.now(),
      metadata: {
        ...targetNode.metadata,
        mergedFrom: args.sourceNodeId,
      },
    });

    // Update connections pointing to source node to point to target
    const allNodes = await ctx.db
      .query("knowledgeGraphNodes")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .collect();

    for (const node of allNodes) {
      const updatedConnections = node.connections.map((c) =>
        c.targetNodeId === args.sourceNodeId
          ? { ...c, targetNodeId: args.targetNodeId }
          : c
      );

      if (
        JSON.stringify(updatedConnections) !== JSON.stringify(node.connections)
      ) {
        await ctx.db.patch(node._id, {
          connections: updatedConnections,
          updatedAt: Date.now(),
        });
      }
    }

    // Delete source node
    await ctx.db.delete(args.sourceNodeId);

    // Log merge
    await ctx.db.insert("auditLogs", {
      userId: user._id,
      action: "knowledge.nodes_merged",
      details: {
        resourceType: "knowledgeGraphNodes",
        resourceId: args.targetNodeId,
        previousValue: {
          sourceId: args.sourceNodeId,
          targetId: args.targetNodeId,
        },
        success: true,
      },
      timestamp: Date.now(),
    });

    return { mergedNodeId: args.targetNodeId };
  },
});

// Clear knowledge graph
export const clearGraph = mutation({
  args: {
    clerkId: v.string(),
    confirmClear: v.boolean(),
  },
  handler: async (ctx, args) => {
    if (!args.confirmClear) {
      throw new Error("Clear must be explicitly confirmed");
    }

    const user = await requireUser(ctx, args.clerkId);

    const nodes = await ctx.db
      .query("knowledgeGraphNodes")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .collect();

    for (const node of nodes) {
      await ctx.db.delete(node._id);
    }

    // Log clear
    await ctx.db.insert("auditLogs", {
      userId: user._id,
      action: "knowledge.graph_cleared",
      details: {
        resourceType: "knowledgeGraphNodes",
        newValue: { deletedCount: nodes.length },
        success: true,
      },
      timestamp: Date.now(),
    });

    return { deletedCount: nodes.length };
  },
});
