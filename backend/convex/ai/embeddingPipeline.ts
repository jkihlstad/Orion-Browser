/**
 * Embedding Pipeline for Orion Browser Neural Intelligence
 * SUB-AGENT 3: AI & Data Pipeline Engineer
 *
 * Handles multimodal embedding generation:
 * - Text embeddings (OpenAI/Anthropic)
 * - Audio embedding hooks (speaker diarization)
 * - Image embedding hooks (CLIP-style)
 * - Video frame embeddings
 * - Multimodal fusion
 */

import { v } from "convex/values";
import { action, internalAction, internalMutation } from "../_generated/server";
import { internal } from "../_generated/api";
import type { Id } from "../id";

// ============================================================================
// Constants and Configuration
// ============================================================================

const EMBEDDING_DIMENSIONS = 1536; // OpenAI text-embedding-3-small
const CLIP_DIMENSIONS = 512; // CLIP image embeddings
const AUDIO_DIMENSIONS = 768; // Whisper/speaker embedding dimensions
const MULTIMODAL_DIMENSIONS = 2048; // Fused multimodal embedding

// Embedding model configuration
const EMBEDDING_CONFIG = {
  text: {
    model: "text-embedding-3-small",
    dimensions: EMBEDDING_DIMENSIONS,
    maxTokens: 8191,
  },
  image: {
    model: "clip-vit-base-patch32",
    dimensions: CLIP_DIMENSIONS,
  },
  audio: {
    model: "whisper-large-v3",
    dimensions: AUDIO_DIMENSIONS,
  },
  multimodal: {
    fusionMethod: "weighted_concat" as const,
    dimensions: MULTIMODAL_DIMENSIONS,
  },
};

// ============================================================================
// Types
// ============================================================================

export interface EmbeddingResult {
  embedding: number[];
  dimensions: number;
  model: string;
  confidence: number;
  metadata: {
    inputType: "text" | "image" | "audio" | "video" | "multimodal";
    processingTimeMs: number;
    tokenCount?: number;
    frameCount?: number;
  };
}

export interface MultimodalFusionInput {
  textEmbedding?: number[];
  imageEmbedding?: number[];
  audioEmbedding?: number[];
  videoEmbedding?: number[];
  weights?: {
    text?: number;
    image?: number;
    audio?: number;
    video?: number;
  };
}

export interface TextEmbeddingInput {
  content: string;
  contentType: "plain" | "html" | "markdown";
  chunkSize?: number;
  extractEntities?: boolean;
}

export interface AudioEmbeddingInput {
  transcription: string;
  speakerSegments?: Array<{
    speaker: string;
    startTime: number;
    endTime: number;
    text: string;
  }>;
  emotionalTone?: string;
}

export interface ImageEmbeddingInput {
  imageUrl?: string;
  base64Data?: string;
  detectedObjects?: string[];
  ocrText?: string;
  altText?: string;
}

export interface VideoEmbeddingInput {
  frames: Array<{
    timestamp: number;
    embedding?: number[];
    description?: string;
  }>;
  audioTranscript?: string;
  duration: number;
}

// ============================================================================
// Text Embedding Functions
// ============================================================================

/**
 * Generate text embedding using OpenAI API
 */
export const generateTextEmbedding = action({
  args: {
    content: v.string(),
    contentType: v.optional(v.union(
      v.literal("plain"),
      v.literal("html"),
      v.literal("markdown")
    )),
    namespace: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<EmbeddingResult> => {
    const startTime = Date.now();
    const contentType = args.contentType ?? "plain";

    // Preprocess content based on type
    const processedContent = preprocessText(args.content, contentType);

    // Truncate to max tokens (rough estimate: 4 chars per token)
    const maxChars = EMBEDDING_CONFIG.text.maxTokens * 4;
    const truncatedContent = processedContent.slice(0, maxChars);

    // Call OpenAI API
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
        model: EMBEDDING_CONFIG.text.model,
        input: truncatedContent,
        dimensions: EMBEDDING_CONFIG.text.dimensions,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenAI API error: ${error}`);
    }

    const data = await response.json();
    const embedding = data.data[0].embedding;

    return {
      embedding,
      dimensions: EMBEDDING_CONFIG.text.dimensions,
      model: EMBEDDING_CONFIG.text.model,
      confidence: 0.95,
      metadata: {
        inputType: "text",
        processingTimeMs: Date.now() - startTime,
        tokenCount: data.usage?.total_tokens ?? Math.ceil(truncatedContent.length / 4),
      },
    };
  },
});

/**
 * Batch generate text embeddings
 */
export const generateTextEmbeddingsBatch = action({
  args: {
    texts: v.array(v.string()),
    contentType: v.optional(v.union(
      v.literal("plain"),
      v.literal("html"),
      v.literal("markdown")
    )),
  },
  handler: async (ctx, args): Promise<EmbeddingResult[]> => {
    const startTime = Date.now();
    const contentType = args.contentType ?? "plain";

    // Preprocess all texts
    const processedTexts = args.texts.map((text) =>
      preprocessText(text, contentType).slice(0, EMBEDDING_CONFIG.text.maxTokens * 4)
    );

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
        model: EMBEDDING_CONFIG.text.model,
        input: processedTexts,
        dimensions: EMBEDDING_CONFIG.text.dimensions,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenAI API error: ${error}`);
    }

    const data = await response.json();
    const processingTime = Date.now() - startTime;

    return data.data.map((item: { embedding: number[]; index: number }) => ({
      embedding: item.embedding,
      dimensions: EMBEDDING_CONFIG.text.dimensions,
      model: EMBEDDING_CONFIG.text.model,
      confidence: 0.95,
      metadata: {
        inputType: "text" as const,
        processingTimeMs: processingTime / args.texts.length,
        tokenCount: Math.ceil(processedTexts[item.index].length / 4),
      },
    }));
  },
});

// ============================================================================
// Audio Embedding Functions
// ============================================================================

/**
 * Generate audio embedding from transcription with speaker diarization
 */
export const generateAudioEmbedding = action({
  args: {
    transcription: v.string(),
    speakerSegments: v.optional(v.array(v.object({
      speaker: v.string(),
      startTime: v.number(),
      endTime: v.number(),
      text: v.string(),
    }))),
    emotionalTone: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<EmbeddingResult> => {
    const startTime = Date.now();

    // Build enriched text for embedding
    let enrichedText = args.transcription;

    // Add speaker context if available
    if (args.speakerSegments && args.speakerSegments.length > 0) {
      const speakerSummary = summarizeSpeakerDiarization(args.speakerSegments);
      enrichedText = `[Speakers: ${speakerSummary}] ${enrichedText}`;
    }

    // Add emotional context if available
    if (args.emotionalTone) {
      enrichedText = `[Tone: ${args.emotionalTone}] ${enrichedText}`;
    }

    // Generate text embedding for the enriched audio transcript
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
        model: EMBEDDING_CONFIG.text.model,
        input: enrichedText.slice(0, EMBEDDING_CONFIG.text.maxTokens * 4),
        dimensions: AUDIO_DIMENSIONS,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenAI API error: ${error}`);
    }

    const data = await response.json();

    return {
      embedding: data.data[0].embedding,
      dimensions: AUDIO_DIMENSIONS,
      model: "audio-text-hybrid",
      confidence: 0.85,
      metadata: {
        inputType: "audio",
        processingTimeMs: Date.now() - startTime,
        tokenCount: data.usage?.total_tokens,
      },
    };
  },
});

/**
 * Generate speaker-specific embeddings for diarization
 */
export const generateSpeakerEmbeddings = action({
  args: {
    speakerSegments: v.array(v.object({
      speaker: v.string(),
      startTime: v.number(),
      endTime: v.number(),
      text: v.string(),
    })),
  },
  handler: async (ctx, args): Promise<Map<string, number[]>> => {
    // Group segments by speaker
    const speakerTexts = new Map<string, string[]>();

    for (const segment of args.speakerSegments) {
      const existing = speakerTexts.get(segment.speaker) ?? [];
      existing.push(segment.text);
      speakerTexts.set(segment.speaker, existing);
    }

    // Generate embedding for each speaker
    const speakerEmbeddings = new Map<string, number[]>();
    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
      throw new Error("OPENAI_API_KEY not configured");
    }

    for (const [speaker, texts] of speakerTexts.entries()) {
      const combinedText = texts.join(" ");

      const response = await fetch("https://api.openai.com/v1/embeddings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: EMBEDDING_CONFIG.text.model,
          input: combinedText.slice(0, EMBEDDING_CONFIG.text.maxTokens * 4),
          dimensions: AUDIO_DIMENSIONS,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        speakerEmbeddings.set(speaker, data.data[0].embedding);
      }
    }

    return speakerEmbeddings;
  },
});

// ============================================================================
// Image Embedding Functions
// ============================================================================

/**
 * Generate image embedding using CLIP-style model
 */
export const generateImageEmbedding = action({
  args: {
    imageUrl: v.optional(v.string()),
    base64Data: v.optional(v.string()),
    detectedObjects: v.optional(v.array(v.string())),
    ocrText: v.optional(v.string()),
    altText: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<EmbeddingResult> => {
    const startTime = Date.now();

    // Build text description of the image for text-based embedding
    // In production, use a proper CLIP model
    const descriptions: string[] = [];

    if (args.altText) {
      descriptions.push(`Image: ${args.altText}`);
    }

    if (args.detectedObjects && args.detectedObjects.length > 0) {
      descriptions.push(`Objects: ${args.detectedObjects.join(", ")}`);
    }

    if (args.ocrText) {
      descriptions.push(`Text in image: ${args.ocrText}`);
    }

    const descriptionText = descriptions.join(". ") || "Unidentified image content";

    // Generate text embedding for image description
    // In production, replace with actual CLIP vision encoder
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
        model: EMBEDDING_CONFIG.text.model,
        input: descriptionText,
        dimensions: CLIP_DIMENSIONS,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenAI API error: ${error}`);
    }

    const data = await response.json();

    return {
      embedding: data.data[0].embedding,
      dimensions: CLIP_DIMENSIONS,
      model: "clip-text-proxy",
      confidence: args.altText || args.detectedObjects ? 0.8 : 0.5,
      metadata: {
        inputType: "image",
        processingTimeMs: Date.now() - startTime,
      },
    };
  },
});

// ============================================================================
// Video Embedding Functions
// ============================================================================

/**
 * Generate video embedding from frame embeddings and audio
 */
export const generateVideoEmbedding = action({
  args: {
    frames: v.array(v.object({
      timestamp: v.number(),
      embedding: v.optional(v.array(v.float64())),
      description: v.optional(v.string()),
    })),
    audioTranscript: v.optional(v.string()),
    duration: v.number(),
  },
  handler: async (ctx, args): Promise<EmbeddingResult> => {
    const startTime = Date.now();

    // Aggregate frame embeddings using temporal pooling
    const frameEmbeddings = args.frames
      .filter((f) => f.embedding && f.embedding.length > 0)
      .map((f) => f.embedding as number[]);

    let videoEmbedding: number[];

    if (frameEmbeddings.length > 0) {
      // Average pooling across frames
      videoEmbedding = averagePoolEmbeddings(frameEmbeddings);
    } else {
      // Fall back to text descriptions
      const descriptions = args.frames
        .filter((f) => f.description)
        .map((f) => f.description as string);

      if (descriptions.length === 0 && !args.audioTranscript) {
        throw new Error("No frame embeddings, descriptions, or audio transcript provided");
      }

      // Generate embedding from descriptions
      const combinedText = descriptions.join(". ");
      const textForEmbedding = args.audioTranscript
        ? `${combinedText}. Audio: ${args.audioTranscript}`
        : combinedText;

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
          model: EMBEDDING_CONFIG.text.model,
          input: textForEmbedding.slice(0, EMBEDDING_CONFIG.text.maxTokens * 4),
          dimensions: CLIP_DIMENSIONS,
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`OpenAI API error: ${error}`);
      }

      const data = await response.json();
      videoEmbedding = data.data[0].embedding;
    }

    return {
      embedding: videoEmbedding,
      dimensions: videoEmbedding.length,
      model: "video-temporal-pooling",
      confidence: 0.75,
      metadata: {
        inputType: "video",
        processingTimeMs: Date.now() - startTime,
        frameCount: args.frames.length,
      },
    };
  },
});

// ============================================================================
// Multimodal Fusion Functions
// ============================================================================

/**
 * Fuse multiple modality embeddings into a single multimodal embedding
 */
export const fuseMultimodalEmbeddings = action({
  args: {
    textEmbedding: v.optional(v.array(v.float64())),
    imageEmbedding: v.optional(v.array(v.float64())),
    audioEmbedding: v.optional(v.array(v.float64())),
    videoEmbedding: v.optional(v.array(v.float64())),
    weights: v.optional(v.object({
      text: v.optional(v.number()),
      image: v.optional(v.number()),
      audio: v.optional(v.number()),
      video: v.optional(v.number()),
    })),
    fusionMethod: v.optional(v.union(
      v.literal("weighted_concat"),
      v.literal("attention"),
      v.literal("average")
    )),
  },
  handler: async (ctx, args): Promise<EmbeddingResult> => {
    const startTime = Date.now();
    const method = args.fusionMethod ?? "weighted_concat";

    // Collect available embeddings with their modalities
    const embeddings: Array<{ embedding: number[]; modality: string; weight: number }> = [];

    const defaultWeights = {
      text: 0.4,
      image: 0.3,
      audio: 0.2,
      video: 0.1,
    };

    if (args.textEmbedding && args.textEmbedding.length > 0) {
      embeddings.push({
        embedding: args.textEmbedding,
        modality: "text",
        weight: args.weights?.text ?? defaultWeights.text,
      });
    }

    if (args.imageEmbedding && args.imageEmbedding.length > 0) {
      embeddings.push({
        embedding: args.imageEmbedding,
        modality: "image",
        weight: args.weights?.image ?? defaultWeights.image,
      });
    }

    if (args.audioEmbedding && args.audioEmbedding.length > 0) {
      embeddings.push({
        embedding: args.audioEmbedding,
        modality: "audio",
        weight: args.weights?.audio ?? defaultWeights.audio,
      });
    }

    if (args.videoEmbedding && args.videoEmbedding.length > 0) {
      embeddings.push({
        embedding: args.videoEmbedding,
        modality: "video",
        weight: args.weights?.video ?? defaultWeights.video,
      });
    }

    if (embeddings.length === 0) {
      throw new Error("At least one embedding must be provided");
    }

    let fusedEmbedding: number[];

    switch (method) {
      case "weighted_concat":
        fusedEmbedding = weightedConcatFusion(embeddings);
        break;
      case "attention":
        fusedEmbedding = attentionFusion(embeddings);
        break;
      case "average":
        fusedEmbedding = averageFusion(embeddings);
        break;
      default:
        fusedEmbedding = weightedConcatFusion(embeddings);
    }

    // Normalize the fused embedding
    fusedEmbedding = normalizeEmbedding(fusedEmbedding);

    return {
      embedding: fusedEmbedding,
      dimensions: fusedEmbedding.length,
      model: `multimodal-${method}`,
      confidence: calculateFusionConfidence(embeddings),
      metadata: {
        inputType: "multimodal",
        processingTimeMs: Date.now() - startTime,
      },
    };
  },
});

/**
 * Cross-modal similarity search
 */
export const crossModalSimilaritySearch = action({
  args: {
    queryEmbedding: v.array(v.float64()),
    queryModality: v.union(
      v.literal("text"),
      v.literal("image"),
      v.literal("audio"),
      v.literal("video")
    ),
    targetModality: v.union(
      v.literal("text"),
      v.literal("image"),
      v.literal("audio"),
      v.literal("video"),
      v.literal("all")
    ),
    topK: v.optional(v.number()),
    minSimilarity: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<Array<{ id: string; similarity: number; modality: string }>> => {
    // This would query the vector database for cross-modal matches
    // For now, return placeholder indicating the search parameters
    const topK = args.topK ?? 10;
    const minSimilarity = args.minSimilarity ?? 0.5;

    // In production, this would:
    // 1. Project the query embedding to a shared latent space
    // 2. Search across target modality embeddings
    // 3. Return ranked results

    return [];
  },
});

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Preprocess text based on content type
 */
function preprocessText(text: string, contentType: "plain" | "html" | "markdown"): string {
  let processed = text;

  if (contentType === "html") {
    // Remove script and style tags
    processed = processed.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "");
    processed = processed.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "");
    // Remove HTML tags
    processed = processed.replace(/<[^>]+>/g, " ");
    // Decode HTML entities
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

/**
 * Summarize speaker diarization for embedding context
 */
function summarizeSpeakerDiarization(
  segments: Array<{ speaker: string; startTime: number; endTime: number; text: string }>
): string {
  const speakerTimes = new Map<string, number>();

  for (const segment of segments) {
    const duration = segment.endTime - segment.startTime;
    speakerTimes.set(segment.speaker, (speakerTimes.get(segment.speaker) ?? 0) + duration);
  }

  const sortedSpeakers = [...speakerTimes.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([speaker, time]) => `${speaker}(${Math.round(time)}s)`);

  return sortedSpeakers.join(", ");
}

/**
 * Average pool multiple embeddings
 */
function averagePoolEmbeddings(embeddings: number[][]): number[] {
  if (embeddings.length === 0) return [];

  const dimensions = embeddings[0].length;
  const result = new Array(dimensions).fill(0);

  for (const embedding of embeddings) {
    for (let i = 0; i < dimensions; i++) {
      result[i] += embedding[i] ?? 0;
    }
  }

  for (let i = 0; i < dimensions; i++) {
    result[i] /= embeddings.length;
  }

  return result;
}

/**
 * Weighted concatenation fusion
 */
function weightedConcatFusion(
  embeddings: Array<{ embedding: number[]; modality: string; weight: number }>
): number[] {
  const result: number[] = [];

  // Normalize weights
  const totalWeight = embeddings.reduce((sum, e) => sum + e.weight, 0);

  for (const { embedding, weight } of embeddings) {
    const normalizedWeight = weight / totalWeight;
    for (const value of embedding) {
      result.push(value * normalizedWeight);
    }
  }

  return result;
}

/**
 * Attention-based fusion (simplified)
 */
function attentionFusion(
  embeddings: Array<{ embedding: number[]; modality: string; weight: number }>
): number[] {
  // Simplified attention: use weights as attention scores
  // In production, use learned attention weights

  // First, project all embeddings to same dimension
  const targetDim = Math.max(...embeddings.map((e) => e.embedding.length));
  const projected = embeddings.map(({ embedding, weight }) => ({
    embedding: projectToDimension(embedding, targetDim),
    weight,
  }));

  // Apply attention-weighted sum
  const result = new Array(targetDim).fill(0);
  const totalWeight = projected.reduce((sum, e) => sum + e.weight, 0);

  for (const { embedding, weight } of projected) {
    const attention = weight / totalWeight;
    for (let i = 0; i < targetDim; i++) {
      result[i] += (embedding[i] ?? 0) * attention;
    }
  }

  return result;
}

/**
 * Average fusion
 */
function averageFusion(
  embeddings: Array<{ embedding: number[]; modality: string; weight: number }>
): number[] {
  // Project all embeddings to same dimension
  const targetDim = Math.max(...embeddings.map((e) => e.embedding.length));
  const projected = embeddings.map((e) => projectToDimension(e.embedding, targetDim));

  return averagePoolEmbeddings(projected);
}

/**
 * Project embedding to target dimension
 */
function projectToDimension(embedding: number[], targetDim: number): number[] {
  if (embedding.length === targetDim) {
    return embedding;
  }

  if (embedding.length < targetDim) {
    // Pad with zeros
    return [...embedding, ...new Array(targetDim - embedding.length).fill(0)];
  }

  // Downsample by averaging chunks
  const chunkSize = Math.ceil(embedding.length / targetDim);
  const result: number[] = [];

  for (let i = 0; i < targetDim; i++) {
    const start = i * chunkSize;
    const end = Math.min(start + chunkSize, embedding.length);
    const chunk = embedding.slice(start, end);
    result.push(chunk.reduce((a, b) => a + b, 0) / chunk.length);
  }

  return result;
}

/**
 * Normalize embedding to unit length
 */
function normalizeEmbedding(embedding: number[]): number[] {
  const norm = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
  if (norm === 0) return embedding;
  return embedding.map((val) => val / norm);
}

/**
 * Calculate fusion confidence based on input modalities
 */
function calculateFusionConfidence(
  embeddings: Array<{ embedding: number[]; modality: string; weight: number }>
): number {
  // More modalities = higher confidence, up to a point
  const modalityBonus = Math.min(embeddings.length * 0.1, 0.3);

  // Average weight indicates relative importance of inputs
  const avgWeight = embeddings.reduce((sum, e) => sum + e.weight, 0) / embeddings.length;

  return Math.min(0.7 + modalityBonus + (avgWeight * 0.1), 0.95);
}

/**
 * Cosine similarity between two embeddings
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    // Project to same dimension
    const targetDim = Math.min(a.length, b.length);
    a = projectToDimension(a, targetDim);
    b = projectToDimension(b, targetDim);
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

  if (normA === 0 || normB === 0) return 0;

  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

// ============================================================================
// Internal Actions for Processing Pipeline
// ============================================================================

/**
 * Internal action to process and store embeddings
 */
export const processAndStoreEmbedding = internalAction({
  args: {
    userId: v.id("users"),
    eventId: v.id("browsingEvents"),
    content: v.string(),
    contentType: v.union(
      v.literal("page"),
      v.literal("article"),
      v.literal("video"),
      v.literal("image"),
      v.literal("document"),
      v.literal("social"),
      v.literal("commerce")
    ),
    namespace: v.string(),
  },
  handler: async (ctx, args) => {
    // Generate embedding
    const result = await ctx.runAction(internal.ai.embeddingPipeline.generateTextEmbedding, {
      content: args.content,
      contentType: "plain",
      namespace: args.namespace,
    });

    // Store the embedding
    await ctx.runMutation(internal.ai.embeddingPipeline.storeEmbeddingInternal, {
      userId: args.userId,
      eventId: args.eventId,
      embedding: result.embedding,
      contentType: args.contentType,
      confidence: result.confidence,
      namespace: args.namespace,
      metadata: {
        extractedTopics: [],
        sentiment: undefined,
        readabilityScore: undefined,
      },
    });

    return result;
  },
});

/**
 * Internal mutation to store embedding
 */
export const storeEmbeddingInternal = internalMutation({
  args: {
    userId: v.id("users"),
    eventId: v.id("browsingEvents"),
    embedding: v.array(v.float64()),
    contentType: v.union(
      v.literal("page"),
      v.literal("article"),
      v.literal("video"),
      v.literal("image"),
      v.literal("document"),
      v.literal("social"),
      v.literal("commerce")
    ),
    confidence: v.number(),
    namespace: v.string(),
    metadata: v.optional(v.object({
      extractedTopics: v.optional(v.array(v.string())),
      sentiment: v.optional(v.number()),
      readabilityScore: v.optional(v.number()),
    })),
  },
  handler: async (ctx, args) => {
    // Check for existing embedding
    const existing = await ctx.db
      .query("contentEmbeddings")
      .withIndex("by_eventId", (q) => q.eq("eventId", args.eventId))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        embedding: args.embedding,
        contentType: args.contentType,
        confidence: args.confidence,
        namespace: args.namespace,
        metadata: args.metadata,
      });
      return existing._id;
    }

    return await ctx.db.insert("contentEmbeddings", {
      userId: args.userId,
      eventId: args.eventId,
      embedding: args.embedding,
      contentType: args.contentType,
      confidence: args.confidence,
      namespace: args.namespace,
      createdAt: Date.now(),
      metadata: args.metadata,
    });
  },
});
