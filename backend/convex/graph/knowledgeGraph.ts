/**
 * Enhanced Knowledge Graph Layer for Orion Browser Neural Intelligence
 * SUB-AGENT 3: AI & Data Pipeline Engineer
 *
 * Graph structure with comprehensive node and edge types:
 * - Node types: User, Content, Contact, Session, Task, Event, Location
 * - Edge types: VISITED, INTERACTED_WITH, KNOWS, COMPLETED, ATTENDED
 * - Neural event integration
 * - Relationship strength scoring
 * - Graph traversal queries
 */

import { v } from "convex/values";
import { mutation, query, action, internalMutation } from "../_generated/server";
import { internal } from "../_generated/api";
import type { Id } from "../id";

// ============================================================================
// Node Type Definitions
// ============================================================================

export const graphNodeTypes = v.union(
  v.literal("user"),
  v.literal("content"),
  v.literal("contact"),
  v.literal("session"),
  v.literal("task"),
  v.literal("event"),
  v.literal("location"),
  v.literal("topic"),
  v.literal("entity"),
  v.literal("concept"),
  v.literal("preference"),
  v.literal("skill"),
  v.literal("project"),
  v.literal("organization")
);

export type GraphNodeType =
  | "user"
  | "content"
  | "contact"
  | "session"
  | "task"
  | "event"
  | "location"
  | "topic"
  | "entity"
  | "concept"
  | "preference"
  | "skill"
  | "project"
  | "organization";

// ============================================================================
// Edge Type Definitions
// ============================================================================

export const graphEdgeTypes = v.union(
  v.literal("VISITED"),
  v.literal("INTERACTED_WITH"),
  v.literal("KNOWS"),
  v.literal("COMPLETED"),
  v.literal("ATTENDED"),
  v.literal("CREATED"),
  v.literal("MODIFIED"),
  v.literal("MENTIONED"),
  v.literal("RELATED_TO"),
  v.literal("PART_OF"),
  v.literal("FOLLOWS"),
  v.literal("PRECEDES"),
  v.literal("SIMILAR_TO"),
  v.literal("CONTRADICTS"),
  v.literal("SUPPORTS"),
  v.literal("LOCATED_AT"),
  v.literal("WORKS_ON"),
  v.literal("INTERESTED_IN"),
  v.literal("LEARNED_FROM")
);

export type GraphEdgeType =
  | "VISITED"
  | "INTERACTED_WITH"
  | "KNOWS"
  | "COMPLETED"
  | "ATTENDED"
  | "CREATED"
  | "MODIFIED"
  | "MENTIONED"
  | "RELATED_TO"
  | "PART_OF"
  | "FOLLOWS"
  | "PRECEDES"
  | "SIMILAR_TO"
  | "CONTRADICTS"
  | "SUPPORTS"
  | "LOCATED_AT"
  | "WORKS_ON"
  | "INTERESTED_IN"
  | "LEARNED_FROM";

// ============================================================================
// Graph Node Operations
// ============================================================================

/**
 * Create a new graph node
 */
export const createGraphNode = mutation({
  args: {
    clerkId: v.string(),
    nodeType: graphNodeTypes,
    label: v.string(),
    content: v.string(),
    confidence: v.number(),
    properties: v.optional(v.object({
      url: v.optional(v.string()),
      timestamp: v.optional(v.number()),
      duration: v.optional(v.number()),
      priority: v.optional(v.number()),
      status: v.optional(v.string()),
      tags: v.optional(v.array(v.string())),
      embedding: v.optional(v.array(v.float64())),
      sourceEventIds: v.optional(v.array(v.string())),
      externalId: v.optional(v.string()),
      metadata: v.optional(v.any()),
    })),
    sourceEvents: v.optional(v.array(v.id("browsingEvents"))),
    extractionMethod: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Get user
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", args.clerkId))
      .unique();

    if (!user) {
      throw new Error("User not found");
    }

    // Check intelligence level
    if (user.intelligenceLevel !== "full" && user.intelligenceLevel !== "enhanced") {
      throw new Error("Knowledge graph requires enhanced or full intelligence level");
    }

    // Create the node using existing knowledgeGraphNodes table
    const nodeId = await ctx.db.insert("knowledgeGraphNodes", {
      userId: user._id,
      nodeType: mapToLegacyNodeType(args.nodeType),
      content: `${args.label}: ${args.content}`,
      connections: [],
      confidence: args.confidence,
      createdAt: Date.now(),
      metadata: {
        sourceEvents: args.sourceEvents,
        extractionMethod: args.extractionMethod,
        graphNodeType: args.nodeType,
        label: args.label,
        properties: args.properties,
      },
    });

    // Log node creation
    await ctx.db.insert("auditLogs", {
      userId: user._id,
      action: "graph.node_created",
      details: {
        resourceType: "knowledgeGraphNodes",
        resourceId: nodeId,
        newValue: {
          nodeType: args.nodeType,
          label: args.label,
        },
        success: true,
      },
      timestamp: Date.now(),
    });

    return nodeId;
  },
});

/**
 * Create graph node from neural event
 */
export const createNodeFromNeuralEvent = mutation({
  args: {
    clerkId: v.string(),
    eventType: v.string(),
    eventData: v.object({
      url: v.optional(v.string()),
      title: v.optional(v.string()),
      content: v.optional(v.string()),
      entities: v.optional(v.array(v.object({
        text: v.string(),
        type: v.string(),
        confidence: v.number(),
      }))),
      topics: v.optional(v.array(v.string())),
      sentiment: v.optional(v.number()),
      timestamp: v.number(),
    }),
    browsingEventId: v.optional(v.id("browsingEvents")),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", args.clerkId))
      .unique();

    if (!user) {
      throw new Error("User not found");
    }

    const createdNodes: Id<"knowledgeGraphNodes">[] = [];

    // Create content node for the page/content
    if (args.eventData.url || args.eventData.title) {
      const contentNode = await ctx.db.insert("knowledgeGraphNodes", {
        userId: user._id,
        nodeType: "entity",
        content: args.eventData.title || args.eventData.url || "Content",
        connections: [],
        confidence: 0.8,
        createdAt: Date.now(),
        metadata: {
          sourceEvents: args.browsingEventId ? [args.browsingEventId] : undefined,
          extractionMethod: "neural_event",
          graphNodeType: "content",
          label: args.eventData.title || "Content",
          properties: {
            url: args.eventData.url,
            timestamp: args.eventData.timestamp,
            sentiment: args.eventData.sentiment,
          },
        },
      });
      createdNodes.push(contentNode);
    }

    // Create nodes for extracted entities
    if (args.eventData.entities) {
      for (const entity of args.eventData.entities) {
        const entityNode = await ctx.db.insert("knowledgeGraphNodes", {
          userId: user._id,
          nodeType: mapEntityTypeToNodeType(entity.type),
          content: entity.text,
          connections: [],
          confidence: entity.confidence,
          createdAt: Date.now(),
          metadata: {
            sourceEvents: args.browsingEventId ? [args.browsingEventId] : undefined,
            extractionMethod: "entity_extraction",
            graphNodeType: mapEntityToGraphType(entity.type),
            label: entity.text,
          },
        });
        createdNodes.push(entityNode);
      }
    }

    // Create nodes for topics
    if (args.eventData.topics) {
      for (const topic of args.eventData.topics) {
        // Check if topic node already exists
        const existing = await ctx.db
          .query("knowledgeGraphNodes")
          .withIndex("by_userId", (q) => q.eq("userId", user._id))
          .filter((q) => q.eq(q.field("content"), topic))
          .first();

        if (!existing) {
          const topicNode = await ctx.db.insert("knowledgeGraphNodes", {
            userId: user._id,
            nodeType: "topic",
            content: topic,
            connections: [],
            confidence: 0.7,
            createdAt: Date.now(),
            metadata: {
              sourceEvents: args.browsingEventId ? [args.browsingEventId] : undefined,
              extractionMethod: "topic_extraction",
              graphNodeType: "topic",
              label: topic,
            },
          });
          createdNodes.push(topicNode);
        }
      }
    }

    return createdNodes;
  },
});

/**
 * Update graph node
 */
export const updateGraphNode = mutation({
  args: {
    clerkId: v.string(),
    nodeId: v.id("knowledgeGraphNodes"),
    label: v.optional(v.string()),
    content: v.optional(v.string()),
    confidence: v.optional(v.number()),
    properties: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", args.clerkId))
      .unique();

    if (!user) {
      throw new Error("User not found");
    }

    const node = await ctx.db.get(args.nodeId);
    if (!node || node.userId !== user._id) {
      throw new Error("Node not found or unauthorized");
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
    if (args.label !== undefined || args.properties !== undefined) {
      updates.metadata = {
        ...(node.metadata ?? {}),
        ...(args.label ? { label: args.label } : {}),
        ...(args.properties ? { properties: args.properties } : {}),
      };
    }

    await ctx.db.patch(args.nodeId, updates);

    return { success: true };
  },
});

// ============================================================================
// Graph Edge Operations
// ============================================================================

/**
 * Create edge between nodes
 */
export const createGraphEdge = mutation({
  args: {
    clerkId: v.string(),
    sourceNodeId: v.id("knowledgeGraphNodes"),
    targetNodeId: v.id("knowledgeGraphNodes"),
    edgeType: graphEdgeTypes,
    weight: v.number(),
    properties: v.optional(v.object({
      timestamp: v.optional(v.number()),
      frequency: v.optional(v.number()),
      context: v.optional(v.string()),
      bidirectional: v.optional(v.boolean()),
      metadata: v.optional(v.any()),
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
      // Update existing connection with stronger weight
      const updatedConnections = sourceNode.connections.map((c) =>
        c.targetNodeId === args.targetNodeId
          ? {
              ...c,
              relationshipType: args.edgeType,
              weight: Math.min(1, c.weight + args.weight * 0.1), // Decay-based strengthening
            }
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
            relationshipType: args.edgeType,
            weight: args.weight,
          },
        ],
        updatedAt: Date.now(),
      });
    }

    // Handle bidirectional edges
    if (args.properties?.bidirectional) {
      const existingReverse = targetNode.connections.find(
        (c) => c.targetNodeId === args.sourceNodeId
      );

      if (!existingReverse) {
        await ctx.db.patch(args.targetNodeId, {
          connections: [
            ...targetNode.connections,
            {
              targetNodeId: args.sourceNodeId,
              relationshipType: args.edgeType,
              weight: args.weight,
            },
          ],
          updatedAt: Date.now(),
        });
      }
    }

    return { success: true };
  },
});

/**
 * Update edge weight based on interaction
 */
export const strengthenEdge = mutation({
  args: {
    clerkId: v.string(),
    sourceNodeId: v.id("knowledgeGraphNodes"),
    targetNodeId: v.id("knowledgeGraphNodes"),
    interactionType: v.string(),
    interactionWeight: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", args.clerkId))
      .unique();

    if (!user) {
      throw new Error("User not found");
    }

    const sourceNode = await ctx.db.get(args.sourceNodeId);
    if (!sourceNode || sourceNode.userId !== user._id) {
      throw new Error("Node not found or unauthorized");
    }

    const interactionWeight = args.interactionWeight ?? 0.05;
    const decay = 0.99; // Slight decay on other connections

    const updatedConnections = sourceNode.connections.map((c) => {
      if (c.targetNodeId === args.targetNodeId) {
        // Strengthen this connection
        return {
          ...c,
          weight: Math.min(1, c.weight + interactionWeight),
        };
      } else {
        // Slight decay on other connections
        return {
          ...c,
          weight: c.weight * decay,
        };
      }
    });

    await ctx.db.patch(args.sourceNodeId, {
      connections: updatedConnections,
      updatedAt: Date.now(),
    });

    return { success: true };
  },
});

// ============================================================================
// Graph Traversal Queries
// ============================================================================

/**
 * Get nodes by type
 */
export const getNodesByType = query({
  args: {
    clerkId: v.string(),
    nodeType: graphNodeTypes,
    limit: v.optional(v.number()),
    minConfidence: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", args.clerkId))
      .unique();

    if (!user) {
      return [];
    }

    const legacyType = mapToLegacyNodeType(args.nodeType);
    const limit = args.limit ?? 50;
    const minConfidence = args.minConfidence ?? 0;

    const nodes = await ctx.db
      .query("knowledgeGraphNodes")
      .withIndex("by_userId_nodeType", (q) =>
        q.eq("userId", user._id).eq("nodeType", legacyType)
      )
      .collect();

    return nodes
      .filter((n) => n.confidence >= minConfidence)
      .slice(0, limit)
      .map((n) => ({
        ...n,
        graphNodeType: n.metadata?.graphNodeType ?? n.nodeType,
        label: n.metadata?.label ?? n.content,
        properties: n.metadata?.properties,
      }));
  },
});

/**
 * Traverse graph from a starting node
 */
export const traverseGraph = query({
  args: {
    clerkId: v.string(),
    startNodeId: v.id("knowledgeGraphNodes"),
    maxDepth: v.optional(v.number()),
    edgeTypes: v.optional(v.array(graphEdgeTypes)),
    minWeight: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", args.clerkId))
      .unique();

    if (!user) {
      return null;
    }

    const startNode = await ctx.db.get(args.startNodeId);
    if (!startNode || startNode.userId !== user._id) {
      return null;
    }

    const maxDepth = args.maxDepth ?? 2;
    const minWeight = args.minWeight ?? 0.1;

    interface TraversalResult {
      node: typeof startNode;
      depth: number;
      path: Array<{ nodeId: string; edgeType: string; weight: number }>;
    }

    const visited = new Set<string>();
    const results: TraversalResult[] = [];

    // BFS traversal
    const queue: Array<{
      nodeId: Id<"knowledgeGraphNodes">;
      depth: number;
      path: Array<{ nodeId: string; edgeType: string; weight: number }>;
    }> = [{ nodeId: args.startNodeId, depth: 0, path: [] }];

    while (queue.length > 0) {
      const current = queue.shift()!;

      if (visited.has(current.nodeId)) continue;
      visited.add(current.nodeId);

      const currentNode = await ctx.db.get(current.nodeId);
      if (!currentNode) continue;

      if (current.depth > 0) {
        results.push({
          node: currentNode,
          depth: current.depth,
          path: current.path,
        });
      }

      if (current.depth < maxDepth) {
        for (const connection of currentNode.connections) {
          // Filter by edge type if specified
          if (args.edgeTypes && !args.edgeTypes.includes(connection.relationshipType as GraphEdgeType)) {
            continue;
          }

          // Filter by minimum weight
          if (connection.weight < minWeight) {
            continue;
          }

          if (!visited.has(connection.targetNodeId)) {
            queue.push({
              nodeId: connection.targetNodeId,
              depth: current.depth + 1,
              path: [
                ...current.path,
                {
                  nodeId: connection.targetNodeId,
                  edgeType: connection.relationshipType,
                  weight: connection.weight,
                },
              ],
            });
          }
        }
      }
    }

    return {
      startNode,
      traversedNodes: results,
      totalVisited: visited.size,
    };
  },
});

/**
 * Find shortest path between two nodes
 */
export const findShortestPath = query({
  args: {
    clerkId: v.string(),
    sourceNodeId: v.id("knowledgeGraphNodes"),
    targetNodeId: v.id("knowledgeGraphNodes"),
    maxDepth: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", args.clerkId))
      .unique();

    if (!user) {
      return null;
    }

    const sourceNode = await ctx.db.get(args.sourceNodeId);
    const targetNode = await ctx.db.get(args.targetNodeId);

    if (!sourceNode || !targetNode) {
      return null;
    }

    if (sourceNode.userId !== user._id || targetNode.userId !== user._id) {
      return null;
    }

    const maxDepth = args.maxDepth ?? 5;

    interface PathNode {
      nodeId: Id<"knowledgeGraphNodes">;
      path: Array<{
        nodeId: Id<"knowledgeGraphNodes">;
        edgeType: string;
        weight: number;
      }>;
    }

    const visited = new Set<string>();
    const queue: PathNode[] = [{ nodeId: args.sourceNodeId, path: [] }];

    while (queue.length > 0) {
      const current = queue.shift()!;

      if (current.nodeId === args.targetNodeId) {
        return {
          found: true,
          path: current.path,
          length: current.path.length,
        };
      }

      if (current.path.length >= maxDepth) {
        continue;
      }

      if (visited.has(current.nodeId)) continue;
      visited.add(current.nodeId);

      const node = await ctx.db.get(current.nodeId);
      if (!node) continue;

      for (const connection of node.connections) {
        if (!visited.has(connection.targetNodeId)) {
          queue.push({
            nodeId: connection.targetNodeId,
            path: [
              ...current.path,
              {
                nodeId: connection.targetNodeId,
                edgeType: connection.relationshipType,
                weight: connection.weight,
              },
            ],
          });
        }
      }
    }

    return {
      found: false,
      path: [],
      length: -1,
    };
  },
});

/**
 * Get strongly connected subgraph
 */
export const getConnectedSubgraph = query({
  args: {
    clerkId: v.string(),
    seedNodeId: v.id("knowledgeGraphNodes"),
    minWeight: v.optional(v.number()),
    maxNodes: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", args.clerkId))
      .unique();

    if (!user) {
      return null;
    }

    const minWeight = args.minWeight ?? 0.3;
    const maxNodes = args.maxNodes ?? 50;

    const visited = new Set<string>();
    const nodes: Array<{
      id: Id<"knowledgeGraphNodes">;
      content: string;
      nodeType: string;
      confidence: number;
    }> = [];
    const edges: Array<{
      source: Id<"knowledgeGraphNodes">;
      target: Id<"knowledgeGraphNodes">;
      type: string;
      weight: number;
    }> = [];

    const queue: Id<"knowledgeGraphNodes">[] = [args.seedNodeId];

    while (queue.length > 0 && nodes.length < maxNodes) {
      const currentId = queue.shift()!;

      if (visited.has(currentId)) continue;
      visited.add(currentId);

      const node = await ctx.db.get(currentId);
      if (!node || node.userId !== user._id) continue;

      nodes.push({
        id: node._id,
        content: node.content,
        nodeType: node.nodeType,
        confidence: node.confidence,
      });

      for (const connection of node.connections) {
        if (connection.weight >= minWeight) {
          edges.push({
            source: currentId,
            target: connection.targetNodeId,
            type: connection.relationshipType,
            weight: connection.weight,
          });

          if (!visited.has(connection.targetNodeId)) {
            queue.push(connection.targetNodeId);
          }
        }
      }
    }

    return {
      nodes,
      edges,
      nodeCount: nodes.length,
      edgeCount: edges.length,
    };
  },
});

// ============================================================================
// Relationship Strength Scoring
// ============================================================================

/**
 * Calculate relationship strength between nodes
 */
export const calculateRelationshipStrength = query({
  args: {
    clerkId: v.string(),
    sourceNodeId: v.id("knowledgeGraphNodes"),
    targetNodeId: v.id("knowledgeGraphNodes"),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", args.clerkId))
      .unique();

    if (!user) {
      return null;
    }

    const sourceNode = await ctx.db.get(args.sourceNodeId);
    const targetNode = await ctx.db.get(args.targetNodeId);

    if (!sourceNode || !targetNode) {
      return null;
    }

    // Direct connection weight
    const directConnection = sourceNode.connections.find(
      (c) => c.targetNodeId === args.targetNodeId
    );
    const directWeight = directConnection?.weight ?? 0;

    // Reverse connection weight
    const reverseConnection = targetNode.connections.find(
      (c) => c.targetNodeId === args.sourceNodeId
    );
    const reverseWeight = reverseConnection?.weight ?? 0;

    // Common neighbors (Jaccard similarity)
    const sourceNeighbors = new Set(sourceNode.connections.map((c) => c.targetNodeId));
    const targetNeighbors = new Set(targetNode.connections.map((c) => c.targetNodeId));

    const intersection = [...sourceNeighbors].filter((n) => targetNeighbors.has(n)).length;
    const union = new Set([...sourceNeighbors, ...targetNeighbors]).size;
    const jaccardSimilarity = union > 0 ? intersection / union : 0;

    // Combined strength score
    const strength =
      directWeight * 0.4 +
      reverseWeight * 0.3 +
      jaccardSimilarity * 0.3;

    return {
      directWeight,
      reverseWeight,
      jaccardSimilarity,
      commonNeighbors: intersection,
      totalStrength: strength,
      relationshipType: directConnection?.relationshipType ?? "none",
    };
  },
});

/**
 * Find most influential nodes (highest centrality)
 */
export const findInfluentialNodes = query({
  args: {
    clerkId: v.string(),
    limit: v.optional(v.number()),
    nodeType: v.optional(graphNodeTypes),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", args.clerkId))
      .unique();

    if (!user) {
      return [];
    }

    let nodes = await ctx.db
      .query("knowledgeGraphNodes")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .collect();

    if (args.nodeType) {
      const legacyType = mapToLegacyNodeType(args.nodeType);
      nodes = nodes.filter((n) => n.nodeType === legacyType);
    }

    // Calculate degree centrality for each node
    const nodeCentrality = nodes.map((node) => {
      const outDegree = node.connections.length;
      const weightedOutDegree = node.connections.reduce((sum, c) => sum + c.weight, 0);

      // Count incoming connections
      const inDegree = nodes.filter((n) =>
        n.connections.some((c) => c.targetNodeId === node._id)
      ).length;

      const weightedInDegree = nodes
        .flatMap((n) => n.connections)
        .filter((c) => c.targetNodeId === node._id)
        .reduce((sum, c) => sum + c.weight, 0);

      const totalCentrality = (weightedOutDegree + weightedInDegree) / 2;

      return {
        node,
        outDegree,
        inDegree,
        weightedOutDegree,
        weightedInDegree,
        totalCentrality,
      };
    });

    // Sort by centrality and return top nodes
    nodeCentrality.sort((a, b) => b.totalCentrality - a.totalCentrality);

    const limit = args.limit ?? 10;
    return nodeCentrality.slice(0, limit).map((nc) => ({
      nodeId: nc.node._id,
      content: nc.node.content,
      nodeType: nc.node.nodeType,
      outDegree: nc.outDegree,
      inDegree: nc.inDegree,
      centrality: nc.totalCentrality,
    }));
  },
});

// ============================================================================
// Graph Analytics
// ============================================================================

/**
 * Get comprehensive graph statistics
 */
export const getGraphStatistics = query({
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

    // Node type distribution
    const nodeTypeDistribution: Record<string, number> = {};
    for (const node of nodes) {
      const type = node.metadata?.graphNodeType ?? node.nodeType;
      nodeTypeDistribution[type] = (nodeTypeDistribution[type] ?? 0) + 1;
    }

    // Edge statistics
    let totalEdges = 0;
    let totalWeight = 0;
    const edgeTypeDistribution: Record<string, number> = {};

    for (const node of nodes) {
      totalEdges += node.connections.length;
      for (const conn of node.connections) {
        totalWeight += conn.weight;
        edgeTypeDistribution[conn.relationshipType] =
          (edgeTypeDistribution[conn.relationshipType] ?? 0) + 1;
      }
    }

    // Calculate graph density
    const maxPossibleEdges = nodes.length * (nodes.length - 1);
    const density = maxPossibleEdges > 0 ? totalEdges / maxPossibleEdges : 0;

    // Average confidence
    const avgConfidence =
      nodes.length > 0
        ? nodes.reduce((sum, n) => sum + n.confidence, 0) / nodes.length
        : 0;

    // Average edge weight
    const avgEdgeWeight = totalEdges > 0 ? totalWeight / totalEdges : 0;

    // Recent activity
    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
    const recentNodes = nodes.filter((n) => n.createdAt >= oneDayAgo).length;

    return {
      totalNodes: nodes.length,
      totalEdges,
      density,
      averageConfidence: avgConfidence,
      averageEdgeWeight: avgEdgeWeight,
      nodeTypeDistribution,
      edgeTypeDistribution,
      recentNodes24h: recentNodes,
      averageConnectionsPerNode:
        nodes.length > 0 ? totalEdges / nodes.length : 0,
    };
  },
});

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Map extended node type to legacy node type
 */
function mapToLegacyNodeType(
  nodeType: GraphNodeType
): "topic" | "entity" | "concept" | "action" | "preference" {
  const mapping: Record<GraphNodeType, "topic" | "entity" | "concept" | "action" | "preference"> = {
    user: "entity",
    content: "entity",
    contact: "entity",
    session: "action",
    task: "action",
    event: "action",
    location: "entity",
    topic: "topic",
    entity: "entity",
    concept: "concept",
    preference: "preference",
    skill: "concept",
    project: "entity",
    organization: "entity",
  };

  return mapping[nodeType] ?? "entity";
}

/**
 * Map entity type to graph node type
 */
function mapEntityToGraphType(entityType: string): GraphNodeType {
  const mapping: Record<string, GraphNodeType> = {
    person: "contact",
    organization: "organization",
    location: "location",
    event: "event",
    product: "entity",
    technology: "concept",
    date: "event",
    time: "event",
  };

  return mapping[entityType.toLowerCase()] ?? "entity";
}

/**
 * Map entity type to legacy node type
 */
function mapEntityTypeToNodeType(
  entityType: string
): "topic" | "entity" | "concept" | "action" | "preference" {
  const type = entityType.toLowerCase();

  if (["person", "organization", "location", "product"].includes(type)) {
    return "entity";
  }
  if (["event", "action", "task"].includes(type)) {
    return "action";
  }
  if (["topic", "technology", "concept"].includes(type)) {
    return "concept";
  }

  return "entity";
}
