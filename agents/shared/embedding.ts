/**
 * Vector Embedding Utilities for Orion Browser
 * Handles text embedding, chunking, and similarity operations
 */

import { OpenAIEmbeddings } from "@langchain/openai";
import { Document } from "@langchain/core/documents";
import type {
  SemanticChunk,
  NamedEntity,
  ContentEmbeddingInput,
  ContentEmbeddingOutput,
  KnowledgeGraphNode,
  KnowledgeConnection,
} from "./types.js";
import { v4 as uuidv4 } from "uuid";

// ============================================================================
// Embedding Configuration
// ============================================================================

export interface EmbeddingConfig {
  model: string;
  dimensions: number;
  maxTokensPerChunk: number;
  chunkOverlap: number;
  batchSize: number;
}

const DEFAULT_CONFIG: EmbeddingConfig = {
  model: "text-embedding-3-small",
  dimensions: 1536,
  maxTokensPerChunk: 512,
  chunkOverlap: 50,
  batchSize: 100,
};

// ============================================================================
// Text Chunker
// ============================================================================

export class SemanticChunker {
  private readonly maxChunkSize: number;
  private readonly overlapSize: number;

  constructor(maxChunkSize: number = 512, overlapSize: number = 50) {
    this.maxChunkSize = maxChunkSize;
    this.overlapSize = overlapSize;
  }

  /**
   * Split text into semantic chunks
   */
  chunkText(text: string, contentType: "text" | "html" | "markdown"): string[] {
    // Preprocess based on content type
    const cleanText = this.preprocessContent(text, contentType);

    // Split into sentences
    const sentences = this.splitIntoSentences(cleanText);

    // Group sentences into chunks
    const chunks: string[] = [];
    let currentChunk = "";
    let currentTokens = 0;

    for (const sentence of sentences) {
      const sentenceTokens = this.estimateTokens(sentence);

      if (currentTokens + sentenceTokens > this.maxChunkSize) {
        if (currentChunk) {
          chunks.push(currentChunk.trim());

          // Add overlap from end of current chunk
          const overlapText = this.getOverlapText(currentChunk);
          currentChunk = overlapText + " " + sentence;
          currentTokens = this.estimateTokens(currentChunk);
        } else {
          // Single sentence exceeds max size, split it
          const splitSentence = this.splitLongSentence(sentence);
          chunks.push(...splitSentence.slice(0, -1));
          currentChunk = splitSentence[splitSentence.length - 1] ?? "";
          currentTokens = this.estimateTokens(currentChunk);
        }
      } else {
        currentChunk += (currentChunk ? " " : "") + sentence;
        currentTokens += sentenceTokens;
      }
    }

    if (currentChunk.trim()) {
      chunks.push(currentChunk.trim());
    }

    return chunks;
  }

  /**
   * Create semantic chunks with metadata
   */
  createSemanticChunks(
    text: string,
    contentType: "text" | "html" | "markdown",
    extractEntities: boolean = true
  ): SemanticChunk[] {
    const chunks = this.chunkText(text, contentType);

    return chunks.map((chunkText, index) => {
      const chunk: SemanticChunk = {
        id: uuidv4(),
        text: chunkText,
        topic: this.extractTopic(chunkText),
        intent: this.extractIntent(chunkText),
        entities: extractEntities ? this.extractEntities(chunkText) : [],
      };
      return chunk;
    });
  }

  private preprocessContent(
    text: string,
    contentType: "text" | "html" | "markdown"
  ): string {
    let processed = text;

    if (contentType === "html") {
      // Remove HTML tags
      processed = processed.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "");
      processed = processed.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "");
      processed = processed.replace(/<[^>]+>/g, " ");
      processed = processed.replace(/&nbsp;/g, " ");
      processed = processed.replace(/&amp;/g, "&");
      processed = processed.replace(/&lt;/g, "<");
      processed = processed.replace(/&gt;/g, ">");
      processed = processed.replace(/&quot;/g, '"');
    } else if (contentType === "markdown") {
      // Remove markdown formatting
      processed = processed.replace(/#{1,6}\s/g, "");
      processed = processed.replace(/\*\*([^*]+)\*\*/g, "$1");
      processed = processed.replace(/\*([^*]+)\*/g, "$1");
      processed = processed.replace(/`([^`]+)`/g, "$1");
      processed = processed.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
      processed = processed.replace(/!\[([^\]]*)\]\([^)]+\)/g, "");
    }

    // Normalize whitespace
    processed = processed.replace(/\s+/g, " ").trim();

    return processed;
  }

  private splitIntoSentences(text: string): string[] {
    // Split on sentence boundaries
    const sentencePattern = /[.!?]+[\s]+|[.!?]+$/g;
    const sentences: string[] = [];
    let lastIndex = 0;

    let match;
    while ((match = sentencePattern.exec(text)) !== null) {
      const sentence = text.slice(lastIndex, match.index + match[0].length).trim();
      if (sentence) {
        sentences.push(sentence);
      }
      lastIndex = match.index + match[0].length;
    }

    // Add remaining text
    const remaining = text.slice(lastIndex).trim();
    if (remaining) {
      sentences.push(remaining);
    }

    return sentences;
  }

  private splitLongSentence(sentence: string): string[] {
    const words = sentence.split(/\s+/);
    const chunks: string[] = [];
    let currentChunk: string[] = [];
    let currentTokens = 0;

    for (const word of words) {
      const wordTokens = this.estimateTokens(word);

      if (currentTokens + wordTokens > this.maxChunkSize && currentChunk.length > 0) {
        chunks.push(currentChunk.join(" "));
        currentChunk = [word];
        currentTokens = wordTokens;
      } else {
        currentChunk.push(word);
        currentTokens += wordTokens;
      }
    }

    if (currentChunk.length > 0) {
      chunks.push(currentChunk.join(" "));
    }

    return chunks;
  }

  private getOverlapText(chunk: string): string {
    const words = chunk.split(/\s+/);
    const overlapWords = words.slice(-Math.ceil(this.overlapSize / 4));
    return overlapWords.join(" ");
  }

  private estimateTokens(text: string): number {
    // Rough estimate: ~4 characters per token
    return Math.ceil(text.length / 4);
  }

  private extractTopic(text: string): string {
    // Simple topic extraction - first noun phrase or key terms
    const words = text.split(/\s+/).slice(0, 10);
    const significantWords = words.filter(
      (w) => w.length > 4 && !/^(the|and|but|for|with|from|this|that|have|been)$/i.test(w)
    );
    return significantWords.slice(0, 3).join(" ") || "general";
  }

  private extractIntent(text: string): string {
    const lowerText = text.toLowerCase();

    if (/\?/.test(text)) return "question";
    if (/^(how|what|why|when|where|who|which)/i.test(text)) return "inquiry";
    if (/^(do|does|can|could|would|should|is|are|was|were)/i.test(text)) return "verification";
    if (/(step|guide|tutorial|learn|understand)/i.test(lowerText)) return "learning";
    if (/(buy|price|cost|order|purchase)/i.test(lowerText)) return "transactional";
    if (/(news|update|latest|breaking)/i.test(lowerText)) return "informational";

    return "general";
  }

  private extractEntities(text: string): NamedEntity[] {
    const entities: NamedEntity[] = [];

    // Simple entity extraction patterns
    const patterns: Array<{ pattern: RegExp; type: NamedEntity["type"] }> = [
      // Dates
      {
        pattern: /\b(\d{1,2}\/\d{1,2}\/\d{2,4}|\d{4}-\d{2}-\d{2}|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2},?\s*\d{4})\b/gi,
        type: "date",
      },
      // Times
      {
        pattern: /\b(\d{1,2}:\d{2}(?::\d{2})?\s*(?:AM|PM)?)\b/gi,
        type: "time",
      },
      // Money
      {
        pattern: /(\$[\d,]+(?:\.\d{2})?|\d+(?:\.\d{2})?\s*(?:USD|EUR|GBP|dollars?|euros?))/gi,
        type: "money",
      },
      // Capitalized phrases (potential names/organizations)
      {
        pattern: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\b/g,
        type: "person",
      },
    ];

    for (const { pattern, type } of patterns) {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        entities.push({
          text: match[1] ?? match[0],
          type,
          confidence: 0.7,
          startIndex: match.index,
          endIndex: match.index + match[0].length,
        });
      }
    }

    return entities;
  }
}

// ============================================================================
// Embedding Manager
// ============================================================================

export class EmbeddingManager {
  private embeddings: OpenAIEmbeddings;
  private config: EmbeddingConfig;
  private chunker: SemanticChunker;
  private cache: Map<string, number[]> = new Map();
  private readonly maxCacheSize = 1000;

  constructor(config: Partial<EmbeddingConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.embeddings = new OpenAIEmbeddings({
      modelName: this.config.model,
      dimensions: this.config.dimensions,
    });
    this.chunker = new SemanticChunker(
      this.config.maxTokensPerChunk,
      this.config.chunkOverlap
    );
  }

  /**
   * Generate embeddings for text content
   */
  async embedContent(input: ContentEmbeddingInput): Promise<ContentEmbeddingOutput> {
    const chunks = this.chunker.createSemanticChunks(
      input.content,
      input.contentType,
      true
    );

    // Generate embeddings in batches
    const texts = chunks.map((c) => c.text);
    const embeddings = await this.embedInBatches(texts);

    // Attach embeddings to chunks
    chunks.forEach((chunk, index) => {
      chunk.embedding = embeddings[index];
    });

    return {
      chunks,
      totalTokens: texts.reduce((sum, t) => sum + this.estimateTokens(t), 0),
    };
  }

  /**
   * Generate embedding for a single text
   */
  async embedText(text: string): Promise<number[]> {
    // Check cache
    const cacheKey = this.getCacheKey(text);
    const cached = this.cache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const [embedding] = await this.embeddings.embedDocuments([text]);

    if (!embedding) {
      throw new Error("Failed to generate embedding");
    }

    // Cache result
    this.addToCache(cacheKey, embedding);

    return embedding;
  }

  /**
   * Generate embeddings for multiple texts
   */
  async embedTexts(texts: string[]): Promise<number[][]> {
    return this.embedInBatches(texts);
  }

  /**
   * Calculate cosine similarity between two embeddings
   */
  cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
      throw new Error("Embedding dimensions must match");
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      const aVal = a[i] ?? 0;
      const bVal = b[i] ?? 0;
      dotProduct += aVal * bVal;
      normA += aVal * aVal;
      normB += bVal * bVal;
    }

    if (normA === 0 || normB === 0) {
      return 0;
    }

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  /**
   * Find most similar chunks to a query
   */
  async findSimilar(
    query: string,
    chunks: SemanticChunk[],
    topK: number = 5
  ): Promise<Array<{ chunk: SemanticChunk; similarity: number }>> {
    const queryEmbedding = await this.embedText(query);

    const results = chunks
      .filter((chunk) => chunk.embedding)
      .map((chunk) => ({
        chunk,
        similarity: this.cosineSimilarity(queryEmbedding, chunk.embedding!),
      }))
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, topK);

    return results;
  }

  /**
   * Cluster similar chunks together
   */
  clusterChunks(
    chunks: SemanticChunk[],
    similarityThreshold: number = 0.8
  ): SemanticChunk[][] {
    const clusters: SemanticChunk[][] = [];
    const assigned = new Set<string>();

    for (const chunk of chunks) {
      if (assigned.has(chunk.id) || !chunk.embedding) {
        continue;
      }

      const cluster = [chunk];
      assigned.add(chunk.id);

      for (const other of chunks) {
        if (assigned.has(other.id) || !other.embedding) {
          continue;
        }

        const similarity = this.cosineSimilarity(chunk.embedding, other.embedding);
        if (similarity >= similarityThreshold) {
          cluster.push(other);
          assigned.add(other.id);
        }
      }

      clusters.push(cluster);
    }

    return clusters;
  }

  private async embedInBatches(texts: string[]): Promise<number[][]> {
    const results: number[][] = [];

    for (let i = 0; i < texts.length; i += this.config.batchSize) {
      const batch = texts.slice(i, i + this.config.batchSize);
      const batchEmbeddings = await this.embeddings.embedDocuments(batch);
      results.push(...batchEmbeddings);
    }

    return results;
  }

  private getCacheKey(text: string): string {
    // Simple hash for cache key
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      const char = text.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return `embed_${hash}_${text.length}`;
  }

  private addToCache(key: string, embedding: number[]): void {
    if (this.cache.size >= this.maxCacheSize) {
      // Remove oldest entry
      const firstKey = this.cache.keys().next().value;
      if (firstKey) {
        this.cache.delete(firstKey);
      }
    }
    this.cache.set(key, embedding);
  }

  private estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  clearCache(): void {
    this.cache.clear();
  }
}

// ============================================================================
// Knowledge Graph Builder
// ============================================================================

export class KnowledgeGraphBuilder {
  private embeddingManager: EmbeddingManager;

  constructor(embeddingManager: EmbeddingManager) {
    this.embeddingManager = embeddingManager;
  }

  /**
   * Build knowledge graph nodes from semantic chunks
   */
  async buildNodes(
    chunks: SemanticChunk[],
    sourceUrl: string
  ): Promise<KnowledgeGraphNode[]> {
    const nodes: KnowledgeGraphNode[] = [];

    for (const chunk of chunks) {
      const node: KnowledgeGraphNode = {
        id: uuidv4(),
        concept: chunk.topic,
        category: this.categorizeChunk(chunk),
        connections: [],
        confidence: 0.8,
        sources: [sourceUrl],
        createdAt: new Date(),
        lastAccessed: new Date(),
      };
      nodes.push(node);
    }

    // Build connections between related nodes
    await this.buildConnections(nodes, chunks);

    return nodes;
  }

  /**
   * Build connections between nodes based on similarity
   */
  private async buildConnections(
    nodes: KnowledgeGraphNode[],
    chunks: SemanticChunk[]
  ): Promise<void> {
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      const chunk = chunks[i];

      if (!node || !chunk?.embedding) continue;

      for (let j = i + 1; j < nodes.length; j++) {
        const otherNode = nodes[j];
        const otherChunk = chunks[j];

        if (!otherNode || !otherChunk?.embedding) continue;

        const similarity = this.embeddingManager.cosineSimilarity(
          chunk.embedding,
          otherChunk.embedding
        );

        if (similarity > 0.5) {
          const connection: KnowledgeConnection = {
            targetId: otherNode.id,
            relationshipType: this.inferRelationship(chunk, otherChunk),
            strength: similarity,
          };
          node.connections.push(connection);

          // Bidirectional connection
          otherNode.connections.push({
            targetId: node.id,
            relationshipType: connection.relationshipType,
            strength: similarity,
          });
        }
      }
    }
  }

  private categorizeChunk(chunk: SemanticChunk): string {
    const intent = chunk.intent.toLowerCase();
    const topic = chunk.topic.toLowerCase();

    if (intent === "question" || intent === "inquiry") return "question";
    if (intent === "learning") return "educational";
    if (intent === "transactional") return "commercial";

    // Topic-based categorization
    if (/tech|software|code|programming/i.test(topic)) return "technology";
    if (/health|medical|wellness/i.test(topic)) return "health";
    if (/finance|money|investment/i.test(topic)) return "finance";
    if (/news|politics|government/i.test(topic)) return "news";

    return "general";
  }

  private inferRelationship(
    chunk1: SemanticChunk,
    chunk2: SemanticChunk
  ): string {
    // Check for shared entities
    const entities1 = new Set(chunk1.entities.map((e) => e.text.toLowerCase()));
    const entities2 = new Set(chunk2.entities.map((e) => e.text.toLowerCase()));
    const shared = [...entities1].filter((e) => entities2.has(e));

    if (shared.length > 0) return "shares_entity";

    // Check for topic similarity
    if (chunk1.topic === chunk2.topic) return "same_topic";

    // Check for intent similarity
    if (chunk1.intent === chunk2.intent) return "same_intent";

    return "related";
  }

  /**
   * Merge new nodes into existing graph
   */
  mergeNodes(
    existingNodes: KnowledgeGraphNode[],
    newNodes: KnowledgeGraphNode[],
    similarityThreshold: number = 0.85
  ): KnowledgeGraphNode[] {
    const merged: KnowledgeGraphNode[] = [...existingNodes];

    for (const newNode of newNodes) {
      // Find if similar node exists
      const existingMatch = existingNodes.find(
        (existing) =>
          existing.concept.toLowerCase() === newNode.concept.toLowerCase() &&
          existing.category === newNode.category
      );

      if (existingMatch) {
        // Merge sources and update confidence
        existingMatch.sources = [
          ...new Set([...existingMatch.sources, ...newNode.sources]),
        ];
        existingMatch.confidence = Math.min(
          1,
          existingMatch.confidence + 0.1
        );
        existingMatch.lastAccessed = new Date();

        // Merge connections
        for (const conn of newNode.connections) {
          if (!existingMatch.connections.find((c) => c.targetId === conn.targetId)) {
            existingMatch.connections.push(conn);
          }
        }
      } else {
        merged.push(newNode);
      }
    }

    return merged;
  }
}

// ============================================================================
// Singleton Instances
// ============================================================================

let embeddingManagerInstance: EmbeddingManager | null = null;

export function getEmbeddingManager(
  config?: Partial<EmbeddingConfig>
): EmbeddingManager {
  if (!embeddingManagerInstance) {
    embeddingManagerInstance = new EmbeddingManager(config);
  }
  return embeddingManagerInstance;
}

export function resetEmbeddingManager(): void {
  if (embeddingManagerInstance) {
    embeddingManagerInstance.clearCache();
  }
  embeddingManagerInstance = null;
}
