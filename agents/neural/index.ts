/**
 * Neural Processing Agent for Orion Browser
 * SUB-AGENT 3: AI & Data Pipeline Engineer
 *
 * TypeScript agent for neural processing:
 * - Event processing agent
 * - Embedding generation orchestration
 * - Graph update coordination
 * - LLM reasoning calls
 */

import { ChatOpenAI } from "@langchain/openai";
import { HumanMessage, SystemMessage, AIMessage } from "@langchain/core/messages";
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";

import type {
  ConsentState,
  IntelligenceThrottling,
  SemanticChunk,
  ContentCategory,
  IntentCategory,
  KnowledgeGraphNode,
  KnowledgeConnection,
  NamedEntity,
} from "../shared/types.js";

// ============================================================================
// Types
// ============================================================================

export interface NeuralAgentConfig {
  modelName: string;
  temperature: number;
  maxTokens: number;
  embeddingModel: string;
  embeddingDimensions: number;
  maxConcurrentOperations: number;
  batchSize: number;
  enableCaching: boolean;
}

export interface NeuralEvent {
  id: string;
  type: NeuralEventType;
  timestamp: Date;
  userId: string;
  data: Record<string, unknown>;
  metadata?: {
    source: string;
    priority: "low" | "medium" | "high";
    processedAt?: Date;
    processingStatus?: "pending" | "processing" | "completed" | "failed";
    error?: string;
  };
}

export type NeuralEventType =
  | "page_visit"
  | "content_extracted"
  | "voice_transcribed"
  | "entity_detected"
  | "topic_identified"
  | "relationship_discovered"
  | "pattern_detected"
  | "insight_generated"
  | "user_correction"
  | "graph_update";

export interface ProcessingResult {
  eventId: string;
  success: boolean;
  outputs: {
    embeddings?: EmbeddingOutput[];
    entities?: NamedEntity[];
    topics?: string[];
    graphUpdates?: GraphUpdate[];
    insights?: string[];
  };
  processingTime: number;
  tokensUsed?: number;
}

export interface EmbeddingOutput {
  id: string;
  embedding: number[];
  dimensions: number;
  text: string;
  metadata?: Record<string, unknown>;
}

export interface GraphUpdate {
  operation: "create_node" | "update_node" | "create_edge" | "update_edge" | "delete";
  nodeId?: string;
  edgeId?: string;
  data: Record<string, unknown>;
}

export interface ProcessingContext {
  userId: string;
  sessionId?: string;
  consent: ConsentState;
  throttling: IntelligenceThrottling;
  recentEvents: NeuralEvent[];
  knowledgeGraphSummary?: {
    nodeCount: number;
    topTopics: string[];
    recentUpdates: number;
  };
}

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_CONFIG: NeuralAgentConfig = {
  modelName: "gpt-4o-mini",
  temperature: 0.3,
  maxTokens: 2048,
  embeddingModel: "text-embedding-3-small",
  embeddingDimensions: 1536,
  maxConcurrentOperations: 5,
  batchSize: 10,
  enableCaching: true,
};

// ============================================================================
// Neural Processing Agent
// ============================================================================

export class NeuralProcessingAgent {
  private model: ChatOpenAI;
  private config: NeuralAgentConfig;
  private eventQueue: NeuralEvent[] = [];
  private processingLock: boolean = false;
  private embeddingCache: Map<string, number[]> = new Map();
  private readonly maxCacheSize = 1000;

  constructor(config: Partial<NeuralAgentConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };

    this.model = new ChatOpenAI({
      modelName: this.config.modelName,
      temperature: this.config.temperature,
      maxTokens: this.config.maxTokens,
    });
  }

  // =========================================================================
  // Event Processing
  // =========================================================================

  /**
   * Queue a neural event for processing
   */
  queueEvent(event: Omit<NeuralEvent, "id" | "timestamp">): string {
    const id = uuidv4();
    const neuralEvent: NeuralEvent = {
      ...event,
      id,
      timestamp: new Date(),
      metadata: {
        ...event.metadata,
        source: event.metadata?.source ?? "unknown",
        priority: event.metadata?.priority ?? "medium",
        processingStatus: "pending",
      },
    };

    this.eventQueue.push(neuralEvent);
    this.sortEventQueue();

    return id;
  }

  /**
   * Process queued events
   */
  async processQueue(context: ProcessingContext): Promise<ProcessingResult[]> {
    if (this.processingLock) {
      return [];
    }

    this.processingLock = true;
    const results: ProcessingResult[] = [];

    try {
      // Get batch of events to process
      const batch = this.eventQueue
        .filter((e) => e.metadata?.processingStatus === "pending")
        .slice(0, this.config.batchSize);

      // Process events in parallel with concurrency limit
      const chunks = this.chunkArray(batch, this.config.maxConcurrentOperations);

      for (const chunk of chunks) {
        const chunkResults = await Promise.all(
          chunk.map((event) => this.processEvent(event, context))
        );
        results.push(...chunkResults);
      }

      // Clean up processed events
      this.cleanupProcessedEvents();
    } finally {
      this.processingLock = false;
    }

    return results;
  }

  /**
   * Process a single neural event
   */
  async processEvent(
    event: NeuralEvent,
    context: ProcessingContext
  ): Promise<ProcessingResult> {
    const startTime = Date.now();

    // Update status
    event.metadata = {
      ...event.metadata,
      processingStatus: "processing",
    };

    try {
      let outputs: ProcessingResult["outputs"] = {};

      switch (event.type) {
        case "page_visit":
          outputs = await this.processPageVisit(event, context);
          break;

        case "content_extracted":
          outputs = await this.processContentExtraction(event, context);
          break;

        case "voice_transcribed":
          outputs = await this.processVoiceTranscription(event, context);
          break;

        case "entity_detected":
          outputs = await this.processEntityDetection(event, context);
          break;

        case "topic_identified":
          outputs = await this.processTopicIdentification(event, context);
          break;

        case "relationship_discovered":
          outputs = await this.processRelationshipDiscovery(event, context);
          break;

        case "pattern_detected":
          outputs = await this.processPatternDetection(event, context);
          break;

        case "insight_generated":
          outputs = await this.processInsightGeneration(event, context);
          break;

        case "user_correction":
          outputs = await this.processUserCorrection(event, context);
          break;

        case "graph_update":
          outputs = await this.processGraphUpdate(event, context);
          break;

        default:
          throw new Error(`Unknown event type: ${event.type}`);
      }

      event.metadata = {
        ...event.metadata,
        processingStatus: "completed",
        processedAt: new Date(),
      };

      return {
        eventId: event.id,
        success: true,
        outputs,
        processingTime: Date.now() - startTime,
      };
    } catch (error) {
      event.metadata = {
        ...event.metadata,
        processingStatus: "failed",
        error: error instanceof Error ? error.message : "Unknown error",
      };

      return {
        eventId: event.id,
        success: false,
        outputs: {},
        processingTime: Date.now() - startTime,
      };
    }
  }

  // =========================================================================
  // Event Type Handlers
  // =========================================================================

  private async processPageVisit(
    event: NeuralEvent,
    context: ProcessingContext
  ): Promise<ProcessingResult["outputs"]> {
    const { url, title, content } = event.data as {
      url: string;
      title?: string;
      content?: string;
    };

    const outputs: ProcessingResult["outputs"] = {};

    // Generate embedding if content is available and consent allows
    if (content && context.consent.browsingAnalysis && context.throttling.embeddingEnabled) {
      const textToEmbed = `${title ?? ""} ${content}`.slice(0, 8000);
      const embedding = await this.generateEmbedding(textToEmbed);

      outputs.embeddings = [{
        id: uuidv4(),
        embedding,
        dimensions: this.config.embeddingDimensions,
        text: textToEmbed.slice(0, 500),
        metadata: { url, title },
      }];
    }

    // Extract entities
    if (content && context.consent.browsingAnalysis) {
      outputs.entities = this.extractEntitiesBasic(content);
    }

    // Generate graph updates
    outputs.graphUpdates = [{
      operation: "create_node",
      data: {
        nodeType: "content",
        label: title ?? url,
        properties: { url, timestamp: event.timestamp },
      },
    }];

    return outputs;
  }

  private async processContentExtraction(
    event: NeuralEvent,
    context: ProcessingContext
  ): Promise<ProcessingResult["outputs"]> {
    const { content, contentType, source } = event.data as {
      content: string;
      contentType: string;
      source: string;
    };

    const outputs: ProcessingResult["outputs"] = {};

    // Generate embeddings for chunks
    if (context.throttling.embeddingEnabled) {
      const chunks = this.chunkText(content, 500);
      const embeddings: EmbeddingOutput[] = [];

      for (const chunk of chunks.slice(0, 5)) {
        const embedding = await this.generateEmbedding(chunk);
        embeddings.push({
          id: uuidv4(),
          embedding,
          dimensions: this.config.embeddingDimensions,
          text: chunk,
          metadata: { contentType, source },
        });
      }

      outputs.embeddings = embeddings;
    }

    // Extract topics using LLM
    outputs.topics = await this.extractTopicsWithLLM(content);

    // Extract entities
    outputs.entities = this.extractEntitiesBasic(content);

    return outputs;
  }

  private async processVoiceTranscription(
    event: NeuralEvent,
    context: ProcessingContext
  ): Promise<ProcessingResult["outputs"]> {
    if (!context.consent.voiceProcessing) {
      return {};
    }

    const { transcription, speakers, emotionalTone } = event.data as {
      transcription: string;
      speakers?: string[];
      emotionalTone?: string;
    };

    const outputs: ProcessingResult["outputs"] = {};

    // Generate embedding for voice content
    if (context.throttling.embeddingEnabled) {
      const enrichedText = emotionalTone
        ? `[Tone: ${emotionalTone}] ${transcription}`
        : transcription;

      const embedding = await this.generateEmbedding(enrichedText);

      outputs.embeddings = [{
        id: uuidv4(),
        embedding,
        dimensions: this.config.embeddingDimensions,
        text: transcription.slice(0, 500),
        metadata: { speakers, emotionalTone },
      }];
    }

    // Extract entities from transcription
    outputs.entities = this.extractEntitiesBasic(transcription);

    // Extract insights from voice content
    outputs.insights = await this.extractVoiceInsights(transcription, emotionalTone);

    return outputs;
  }

  private async processEntityDetection(
    event: NeuralEvent,
    context: ProcessingContext
  ): Promise<ProcessingResult["outputs"]> {
    const { entities, source } = event.data as {
      entities: NamedEntity[];
      source: string;
    };

    const graphUpdates: GraphUpdate[] = [];

    // Create nodes for significant entities
    for (const entity of entities) {
      if (entity.confidence > 0.7) {
        graphUpdates.push({
          operation: "create_node",
          data: {
            nodeType: this.mapEntityTypeToNodeType(entity.type),
            label: entity.text,
            properties: {
              entityType: entity.type,
              confidence: entity.confidence,
              source,
            },
          },
        });
      }
    }

    return { graphUpdates };
  }

  private async processTopicIdentification(
    event: NeuralEvent,
    context: ProcessingContext
  ): Promise<ProcessingResult["outputs"]> {
    const { topics, source, confidence } = event.data as {
      topics: string[];
      source: string;
      confidence: number;
    };

    const graphUpdates: GraphUpdate[] = [];

    for (const topic of topics) {
      graphUpdates.push({
        operation: "create_node",
        data: {
          nodeType: "topic",
          label: topic,
          properties: { source, confidence },
        },
      });
    }

    return { graphUpdates, topics };
  }

  private async processRelationshipDiscovery(
    event: NeuralEvent,
    context: ProcessingContext
  ): Promise<ProcessingResult["outputs"]> {
    const { sourceNode, targetNode, relationshipType, weight } = event.data as {
      sourceNode: string;
      targetNode: string;
      relationshipType: string;
      weight: number;
    };

    const graphUpdates: GraphUpdate[] = [{
      operation: "create_edge",
      data: {
        sourceNode,
        targetNode,
        relationshipType,
        weight,
      },
    }];

    return { graphUpdates };
  }

  private async processPatternDetection(
    event: NeuralEvent,
    context: ProcessingContext
  ): Promise<ProcessingResult["outputs"]> {
    const { pattern, frequency, timeRange } = event.data as {
      pattern: string;
      frequency: number;
      timeRange: { start: Date; end: Date };
    };

    const insights = await this.analyzePatternWithLLM(pattern, frequency);

    const graphUpdates: GraphUpdate[] = [{
      operation: "create_node",
      data: {
        nodeType: "concept",
        label: `Pattern: ${pattern}`,
        properties: { frequency, timeRange, insights },
      },
    }];

    return { graphUpdates, insights };
  }

  private async processInsightGeneration(
    event: NeuralEvent,
    context: ProcessingContext
  ): Promise<ProcessingResult["outputs"]> {
    const { query, contextData } = event.data as {
      query: string;
      contextData: string[];
    };

    const insights = await this.generateInsightsWithLLM(query, contextData);

    return { insights };
  }

  private async processUserCorrection(
    event: NeuralEvent,
    context: ProcessingContext
  ): Promise<ProcessingResult["outputs"]> {
    const { nodeId, correctionType, newValue, feedback } = event.data as {
      nodeId: string;
      correctionType: string;
      newValue: unknown;
      feedback?: string;
    };

    const graphUpdates: GraphUpdate[] = [{
      operation: "update_node",
      nodeId,
      data: {
        correctedValue: newValue,
        correctionType,
        feedback,
        userCorrected: true,
      },
    }];

    return { graphUpdates };
  }

  private async processGraphUpdate(
    event: NeuralEvent,
    context: ProcessingContext
  ): Promise<ProcessingResult["outputs"]> {
    const { updates } = event.data as { updates: GraphUpdate[] };

    // Validate and filter updates based on consent
    const validUpdates = updates.filter((update) => {
      // All updates allowed with cross-session learning consent
      return context.consent.crossSessionLearning;
    });

    return { graphUpdates: validUpdates };
  }

  // =========================================================================
  // Embedding Generation
  // =========================================================================

  /**
   * Generate embedding for text
   */
  async generateEmbedding(text: string): Promise<number[]> {
    // Check cache
    const cacheKey = this.getCacheKey(text);
    if (this.config.enableCaching && this.embeddingCache.has(cacheKey)) {
      return this.embeddingCache.get(cacheKey)!;
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY not configured");
    }

    const response = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: this.config.embeddingModel,
        input: text.slice(0, 8000),
        dimensions: this.config.embeddingDimensions,
      }),
    });

    if (!response.ok) {
      throw new Error(`Embedding API error: ${response.statusText}`);
    }

    const data = await response.json();
    const embedding = data.data[0].embedding;

    // Cache result
    if (this.config.enableCaching) {
      this.addToCache(cacheKey, embedding);
    }

    return embedding;
  }

  /**
   * Generate embeddings in batch
   */
  async generateEmbeddingsBatch(texts: string[]): Promise<number[][]> {
    const results: number[][] = [];

    // Check cache for each text
    const uncached: { index: number; text: string }[] = [];

    for (let i = 0; i < texts.length; i++) {
      const cacheKey = this.getCacheKey(texts[i]);
      if (this.config.enableCaching && this.embeddingCache.has(cacheKey)) {
        results[i] = this.embeddingCache.get(cacheKey)!;
      } else {
        uncached.push({ index: i, text: texts[i] });
      }
    }

    if (uncached.length === 0) {
      return results;
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY not configured");
    }

    // Process in batches of 100 (API limit)
    for (let i = 0; i < uncached.length; i += 100) {
      const batch = uncached.slice(i, i + 100);
      const batchTexts = batch.map((item) => item.text.slice(0, 8000));

      const response = await fetch("https://api.openai.com/v1/embeddings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: this.config.embeddingModel,
          input: batchTexts,
          dimensions: this.config.embeddingDimensions,
        }),
      });

      if (!response.ok) {
        throw new Error(`Embedding API error: ${response.statusText}`);
      }

      const data = await response.json();

      for (let j = 0; j < data.data.length; j++) {
        const embedding = data.data[j].embedding;
        const originalIndex = batch[j].index;
        results[originalIndex] = embedding;

        // Cache result
        if (this.config.enableCaching) {
          this.addToCache(this.getCacheKey(batch[j].text), embedding);
        }
      }
    }

    return results;
  }

  // =========================================================================
  // Graph Coordination
  // =========================================================================

  /**
   * Coordinate graph updates from multiple sources
   */
  async coordinateGraphUpdates(
    updates: GraphUpdate[],
    context: ProcessingContext
  ): Promise<{
    applied: GraphUpdate[];
    rejected: Array<{ update: GraphUpdate; reason: string }>;
  }> {
    const applied: GraphUpdate[] = [];
    const rejected: Array<{ update: GraphUpdate; reason: string }> = [];

    for (const update of updates) {
      // Validate update
      const validation = this.validateGraphUpdate(update, context);

      if (validation.valid) {
        applied.push(update);
      } else {
        rejected.push({ update, reason: validation.reason! });
      }
    }

    return { applied, rejected };
  }

  private validateGraphUpdate(
    update: GraphUpdate,
    context: ProcessingContext
  ): { valid: boolean; reason?: string } {
    // Check consent
    if (!context.consent.crossSessionLearning && update.operation === "create_node") {
      return { valid: false, reason: "Cross-session learning not consented" };
    }

    // Check throttling
    if (!context.throttling.backgroundProcessingEnabled) {
      return { valid: false, reason: "Background processing disabled" };
    }

    return { valid: true };
  }

  // =========================================================================
  // LLM Reasoning
  // =========================================================================

  /**
   * Extract topics using LLM
   */
  async extractTopicsWithLLM(content: string): Promise<string[]> {
    try {
      const response = await this.model.invoke([
        new SystemMessage(
          "You are a topic extraction assistant. Extract 3-5 main topics from the given content. Return only the topics as a comma-separated list, nothing else."
        ),
        new HumanMessage(content.slice(0, 4000)),
      ]);

      const topicsText = response.content as string;
      return topicsText.split(",").map((t) => t.trim()).filter(Boolean);
    } catch {
      return [];
    }
  }

  /**
   * Extract insights from voice content
   */
  async extractVoiceInsights(
    transcription: string,
    emotionalTone?: string
  ): Promise<string[]> {
    try {
      const prompt = emotionalTone
        ? `The speaker's tone is ${emotionalTone}. Analyze this transcription and provide 2-3 key insights: ${transcription}`
        : `Analyze this voice transcription and provide 2-3 key insights: ${transcription}`;

      const response = await this.model.invoke([
        new SystemMessage(
          "You are an analyst providing brief, actionable insights from voice transcriptions. Return insights as bullet points."
        ),
        new HumanMessage(prompt.slice(0, 4000)),
      ]);

      const insightsText = response.content as string;
      return insightsText
        .split("\n")
        .filter((line) => line.trim().startsWith("-") || line.trim().startsWith("*"))
        .map((line) => line.replace(/^[-*]\s*/, "").trim());
    } catch {
      return [];
    }
  }

  /**
   * Analyze pattern with LLM
   */
  async analyzePatternWithLLM(pattern: string, frequency: number): Promise<string[]> {
    try {
      const response = await this.model.invoke([
        new SystemMessage(
          "You are a behavioral analyst. Analyze the given pattern and provide 2-3 insights about what it might indicate."
        ),
        new HumanMessage(
          `Pattern: "${pattern}" observed ${frequency} times. What does this suggest?`
        ),
      ]);

      const insightsText = response.content as string;
      return insightsText
        .split("\n")
        .filter((line) => line.trim().length > 10)
        .slice(0, 3);
    } catch {
      return [];
    }
  }

  /**
   * Generate insights with LLM
   */
  async generateInsightsWithLLM(
    query: string,
    contextData: string[]
  ): Promise<string[]> {
    try {
      const context = contextData.join("\n").slice(0, 4000);

      const response = await this.model.invoke([
        new SystemMessage(
          "You are an AI assistant providing insights based on user data. Be concise and actionable."
        ),
        new HumanMessage(`Context:\n${context}\n\nQuestion: ${query}`),
      ]);

      const insightsText = response.content as string;
      return [insightsText];
    } catch {
      return [];
    }
  }

  // =========================================================================
  // Helper Methods
  // =========================================================================

  private sortEventQueue(): void {
    const priorityOrder = { high: 0, medium: 1, low: 2 };
    this.eventQueue.sort((a, b) => {
      const aPriority = priorityOrder[a.metadata?.priority ?? "medium"];
      const bPriority = priorityOrder[b.metadata?.priority ?? "medium"];
      if (aPriority !== bPriority) return aPriority - bPriority;
      return a.timestamp.getTime() - b.timestamp.getTime();
    });
  }

  private cleanupProcessedEvents(): void {
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    this.eventQueue = this.eventQueue.filter(
      (e) =>
        e.metadata?.processingStatus !== "completed" ||
        e.timestamp.getTime() > oneHourAgo
    );
  }

  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  private chunkText(text: string, maxLength: number): string[] {
    const sentences = text.split(/(?<=[.!?])\s+/);
    const chunks: string[] = [];
    let currentChunk = "";

    for (const sentence of sentences) {
      if (currentChunk.length + sentence.length > maxLength) {
        if (currentChunk) chunks.push(currentChunk.trim());
        currentChunk = sentence;
      } else {
        currentChunk += " " + sentence;
      }
    }

    if (currentChunk.trim()) {
      chunks.push(currentChunk.trim());
    }

    return chunks;
  }

  private extractEntitiesBasic(text: string): NamedEntity[] {
    const entities: NamedEntity[] = [];

    // Simple pattern-based entity extraction
    const patterns: Array<{ pattern: RegExp; type: NamedEntity["type"] }> = [
      { pattern: /\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+\b/g, type: "person" },
      { pattern: /\$[\d,]+(?:\.\d{2})?/g, type: "money" },
      { pattern: /\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/g, type: "date" },
      {
        pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
        type: "person", // emails indicate people
      },
    ];

    for (const { pattern, type } of patterns) {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        entities.push({
          text: match[0],
          type,
          confidence: 0.7,
          startIndex: match.index,
          endIndex: match.index + match[0].length,
        });
      }
    }

    return entities;
  }

  private mapEntityTypeToNodeType(entityType: string): string {
    const mapping: Record<string, string> = {
      person: "contact",
      organization: "organization",
      location: "location",
      date: "event",
      money: "entity",
      product: "entity",
    };
    return mapping[entityType] ?? "entity";
  }

  private getCacheKey(text: string): string {
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      const char = text.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return `embed_${hash}_${text.length}`;
  }

  private addToCache(key: string, embedding: number[]): void {
    if (this.embeddingCache.size >= this.maxCacheSize) {
      const firstKey = this.embeddingCache.keys().next().value;
      if (firstKey) {
        this.embeddingCache.delete(firstKey);
      }
    }
    this.embeddingCache.set(key, embedding);
  }

  /**
   * Get event queue status
   */
  getQueueStatus(): {
    pending: number;
    processing: number;
    completed: number;
    failed: number;
  } {
    const status = { pending: 0, processing: 0, completed: 0, failed: 0 };

    for (const event of this.eventQueue) {
      const s = event.metadata?.processingStatus ?? "pending";
      status[s]++;
    }

    return status;
  }

  /**
   * Clear the event queue
   */
  clearQueue(): void {
    this.eventQueue = [];
  }

  /**
   * Clear the embedding cache
   */
  clearCache(): void {
    this.embeddingCache.clear();
  }
}

// ============================================================================
// LangGraph Tools
// ============================================================================

/**
 * Tool for processing neural events
 */
export const processNeuralEventTool = tool(
  async (input: {
    eventType: string;
    eventData: string;
    userId: string;
    priority: string;
  }): Promise<{ success: boolean; eventId: string }> => {
    const agent = getNeuralAgentInstance();

    const eventId = agent.queueEvent({
      type: input.eventType as NeuralEventType,
      userId: input.userId,
      data: JSON.parse(input.eventData),
      metadata: {
        source: "tool_invocation",
        priority: input.priority as "low" | "medium" | "high",
      },
    });

    return { success: true, eventId };
  },
  {
    name: "process_neural_event",
    description: "Queue a neural event for processing",
    schema: z.object({
      eventType: z.string().describe("Type of neural event"),
      eventData: z.string().describe("JSON string of event data"),
      userId: z.string().describe("User ID"),
      priority: z.enum(["low", "medium", "high"]).describe("Event priority"),
    }),
  }
);

/**
 * Tool for generating embeddings
 */
export const generateEmbeddingTool = tool(
  async (input: { text: string }): Promise<{ embedding: number[]; dimensions: number }> => {
    const agent = getNeuralAgentInstance();
    const embedding = await agent.generateEmbedding(input.text);

    return {
      embedding,
      dimensions: embedding.length,
    };
  },
  {
    name: "generate_embedding",
    description: "Generate an embedding vector for text",
    schema: z.object({
      text: z.string().describe("Text to embed"),
    }),
  }
);

/**
 * Tool for extracting topics
 */
export const extractTopicsTool = tool(
  async (input: { content: string }): Promise<{ topics: string[] }> => {
    const agent = getNeuralAgentInstance();
    const topics = await agent.extractTopicsWithLLM(input.content);

    return { topics };
  },
  {
    name: "extract_topics",
    description: "Extract topics from content using LLM",
    schema: z.object({
      content: z.string().describe("Content to analyze"),
    }),
  }
);

// ============================================================================
// Singleton Management
// ============================================================================

let neuralAgentInstance: NeuralProcessingAgent | null = null;

export function getNeuralAgentInstance(): NeuralProcessingAgent {
  if (!neuralAgentInstance) {
    neuralAgentInstance = new NeuralProcessingAgent();
  }
  return neuralAgentInstance;
}

export function createNeuralAgent(
  config?: Partial<NeuralAgentConfig>
): NeuralProcessingAgent {
  neuralAgentInstance = new NeuralProcessingAgent(config);
  return neuralAgentInstance;
}

export function resetNeuralAgent(): void {
  if (neuralAgentInstance) {
    neuralAgentInstance.clearQueue();
    neuralAgentInstance.clearCache();
  }
  neuralAgentInstance = null;
}

// ============================================================================
// Exports
// ============================================================================

export const neuralTools = [
  processNeuralEventTool,
  generateEmbeddingTool,
  extractTopicsTool,
];

export {
  processNeuralEventTool,
  generateEmbeddingTool,
  extractTopicsTool,
};
