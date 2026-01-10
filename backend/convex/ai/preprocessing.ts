/**
 * Preprocessing Layer for Orion Browser Neural Intelligence
 * SUB-AGENT 3: AI & Data Pipeline Engineer
 *
 * Handles preprocessing for all modalities:
 * - Text NLP preprocessing (tokenization, entity extraction)
 * - Audio preprocessing (diarization, transcription hooks)
 * - Image preprocessing (object detection, OCR)
 * - Input normalization for embedding generation
 */

import { v } from "convex/values";
import { action, internalAction } from "../_generated/server";
import { internal } from "../_generated/api";

// ============================================================================
// Types
// ============================================================================

export interface TextPreprocessingResult {
  cleanedText: string;
  tokens: string[];
  sentences: string[];
  entities: ExtractedEntity[];
  keywords: string[];
  language: string;
  sentiment: SentimentResult;
  topics: string[];
  readabilityScore: number;
  metadata: {
    originalLength: number;
    cleanedLength: number;
    tokenCount: number;
    sentenceCount: number;
    entityCount: number;
    processingTimeMs: number;
  };
}

export interface ExtractedEntity {
  text: string;
  type: EntityType;
  startIndex: number;
  endIndex: number;
  confidence: number;
  normalizedValue?: string;
  metadata?: Record<string, unknown>;
}

export type EntityType =
  | "person"
  | "organization"
  | "location"
  | "date"
  | "time"
  | "money"
  | "percent"
  | "email"
  | "phone"
  | "url"
  | "product"
  | "event"
  | "concept"
  | "technology";

export interface SentimentResult {
  score: number; // -1 to 1
  magnitude: number; // 0 to infinity
  label: "positive" | "negative" | "neutral" | "mixed";
  confidence: number;
}

export interface AudioPreprocessingResult {
  transcription: string;
  segments: TranscriptionSegment[];
  speakers: SpeakerInfo[];
  emotionalTone: EmotionalAnalysis;
  language: string;
  audioQuality: AudioQualityMetrics;
  metadata: {
    duration: number;
    wordCount: number;
    speakerCount: number;
    processingTimeMs: number;
  };
}

export interface TranscriptionSegment {
  text: string;
  startTime: number;
  endTime: number;
  speaker?: string;
  confidence: number;
  emotion?: string;
}

export interface SpeakerInfo {
  id: string;
  label: string;
  totalSpeakingTime: number;
  segments: number[];
  voiceCharacteristics?: {
    pitch: number;
    pace: number;
    energy: number;
  };
}

export interface EmotionalAnalysis {
  primaryEmotion: string;
  emotions: Array<{
    emotion: string;
    score: number;
  }>;
  trajectory: Array<{
    timestamp: number;
    emotion: string;
    intensity: number;
  }>;
  overallSentiment: SentimentResult;
}

export interface AudioQualityMetrics {
  signalToNoise: number;
  clarity: number;
  volumeConsistency: number;
  backgroundNoise: "none" | "low" | "medium" | "high";
}

export interface ImagePreprocessingResult {
  description: string;
  objects: DetectedObject[];
  ocrText: string;
  faces: DetectedFace[];
  colors: ColorInfo[];
  safetyLabels: SafetyLabel[];
  imageType: ImageType;
  metadata: {
    width: number;
    height: number;
    format: string;
    fileSize: number;
    processingTimeMs: number;
  };
}

export interface DetectedObject {
  name: string;
  confidence: number;
  boundingBox: BoundingBox;
  attributes?: Record<string, string>;
}

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DetectedFace {
  boundingBox: BoundingBox;
  confidence: number;
  emotions?: Record<string, number>;
  landmarks?: Record<string, { x: number; y: number }>;
}

export interface ColorInfo {
  hex: string;
  name: string;
  percentage: number;
}

export interface SafetyLabel {
  category: string;
  likelihood: "unlikely" | "possible" | "likely" | "very_likely";
}

export type ImageType = "photo" | "screenshot" | "diagram" | "chart" | "illustration" | "text" | "mixed" | "unknown";

// ============================================================================
// Text Preprocessing
// ============================================================================

/**
 * Comprehensive text preprocessing for NLP tasks
 */
export const preprocessText = action({
  args: {
    text: v.string(),
    contentType: v.optional(v.union(
      v.literal("plain"),
      v.literal("html"),
      v.literal("markdown"),
      v.literal("json")
    )),
    options: v.optional(v.object({
      extractEntities: v.optional(v.boolean()),
      extractKeywords: v.optional(v.boolean()),
      analyzeSentiment: v.optional(v.boolean()),
      extractTopics: v.optional(v.boolean()),
      calculateReadability: v.optional(v.boolean()),
      language: v.optional(v.string()),
    })),
  },
  handler: async (ctx, args): Promise<TextPreprocessingResult> => {
    const startTime = Date.now();
    const contentType = args.contentType ?? "plain";
    const options = args.options ?? {};

    // Step 1: Clean and normalize text
    const cleanedText = cleanText(args.text, contentType);

    // Step 2: Tokenization
    const tokens = tokenize(cleanedText);
    const sentences = splitSentences(cleanedText);

    // Step 3: Language detection
    const language = detectLanguage(cleanedText);

    // Step 4: Entity extraction
    const entities = options.extractEntities !== false
      ? extractEntities(cleanedText)
      : [];

    // Step 5: Keyword extraction
    const keywords = options.extractKeywords !== false
      ? extractKeywords(cleanedText, tokens)
      : [];

    // Step 6: Sentiment analysis
    const sentiment = options.analyzeSentiment !== false
      ? analyzeSentiment(cleanedText)
      : { score: 0, magnitude: 0, label: "neutral" as const, confidence: 0 };

    // Step 7: Topic extraction
    const topics = options.extractTopics !== false
      ? extractTopics(cleanedText, keywords, entities)
      : [];

    // Step 8: Readability calculation
    const readabilityScore = options.calculateReadability !== false
      ? calculateReadability(cleanedText, sentences, tokens)
      : 0;

    return {
      cleanedText,
      tokens,
      sentences,
      entities,
      keywords,
      language,
      sentiment,
      topics,
      readabilityScore,
      metadata: {
        originalLength: args.text.length,
        cleanedLength: cleanedText.length,
        tokenCount: tokens.length,
        sentenceCount: sentences.length,
        entityCount: entities.length,
        processingTimeMs: Date.now() - startTime,
      },
    };
  },
});

/**
 * Extract named entities from text
 */
export const extractNamedEntities = action({
  args: {
    text: v.string(),
    entityTypes: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args): Promise<ExtractedEntity[]> => {
    const entities = extractEntities(args.text);

    if (args.entityTypes && args.entityTypes.length > 0) {
      return entities.filter((e) => args.entityTypes!.includes(e.type));
    }

    return entities;
  },
});

// ============================================================================
// Audio Preprocessing
// ============================================================================

/**
 * Preprocess audio transcription with diarization and emotion analysis
 */
export const preprocessAudio = action({
  args: {
    transcription: v.string(),
    segments: v.optional(v.array(v.object({
      text: v.string(),
      startTime: v.number(),
      endTime: v.number(),
      speaker: v.optional(v.string()),
      confidence: v.optional(v.number()),
    }))),
    audioMetadata: v.optional(v.object({
      duration: v.number(),
      sampleRate: v.optional(v.number()),
      channels: v.optional(v.number()),
    })),
  },
  handler: async (ctx, args): Promise<AudioPreprocessingResult> => {
    const startTime = Date.now();

    // Process segments or create from transcription
    const segments: TranscriptionSegment[] = args.segments
      ? args.segments.map((seg) => ({
          ...seg,
          confidence: seg.confidence ?? 0.9,
        }))
      : [{
          text: args.transcription,
          startTime: 0,
          endTime: args.audioMetadata?.duration ?? 0,
          confidence: 0.9,
        }];

    // Extract speaker information
    const speakers = extractSpeakerInfo(segments);

    // Analyze emotional tone
    const emotionalTone = analyzeEmotionalTone(segments);

    // Detect language
    const language = detectLanguage(args.transcription);

    // Calculate word count
    const wordCount = args.transcription.split(/\s+/).filter(Boolean).length;

    return {
      transcription: args.transcription,
      segments,
      speakers,
      emotionalTone,
      language,
      audioQuality: {
        signalToNoise: 0.85, // Placeholder - would come from actual audio analysis
        clarity: 0.9,
        volumeConsistency: 0.8,
        backgroundNoise: "low",
      },
      metadata: {
        duration: args.audioMetadata?.duration ?? 0,
        wordCount,
        speakerCount: speakers.length,
        processingTimeMs: Date.now() - startTime,
      },
    };
  },
});

/**
 * Perform speaker diarization on transcription segments
 */
export const diarizeSpeakers = action({
  args: {
    segments: v.array(v.object({
      text: v.string(),
      startTime: v.number(),
      endTime: v.number(),
      speaker: v.optional(v.string()),
    })),
  },
  handler: async (ctx, args): Promise<SpeakerInfo[]> => {
    return extractSpeakerInfo(args.segments.map((seg) => ({
      ...seg,
      confidence: 0.9,
    })));
  },
});

// ============================================================================
// Image Preprocessing
// ============================================================================

/**
 * Preprocess image for embedding generation
 */
export const preprocessImage = action({
  args: {
    imageUrl: v.optional(v.string()),
    base64Data: v.optional(v.string()),
    altText: v.optional(v.string()),
    context: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<ImagePreprocessingResult> => {
    const startTime = Date.now();

    // In production, this would call actual vision APIs
    // For now, we provide a structured result based on available metadata

    const description = args.altText || "Image content";

    // Placeholder object detection (would use Vision API)
    const objects: DetectedObject[] = [];

    // Placeholder OCR (would use OCR API)
    const ocrText = "";

    // Placeholder face detection
    const faces: DetectedFace[] = [];

    // Placeholder color analysis
    const colors: ColorInfo[] = [];

    // Placeholder safety labels
    const safetyLabels: SafetyLabel[] = [];

    // Determine image type from context
    const imageType = inferImageType(args.context, args.altText);

    return {
      description,
      objects,
      ocrText,
      faces,
      colors,
      safetyLabels,
      imageType,
      metadata: {
        width: 0,
        height: 0,
        format: "unknown",
        fileSize: 0,
        processingTimeMs: Date.now() - startTime,
      },
    };
  },
});

/**
 * Extract text from image using OCR
 */
export const extractImageText = action({
  args: {
    imageUrl: v.optional(v.string()),
    base64Data: v.optional(v.string()),
    language: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<{
    text: string;
    blocks: Array<{ text: string; confidence: number; boundingBox: BoundingBox }>;
    language: string;
  }> => {
    // Placeholder for OCR integration
    // In production, would use Google Cloud Vision, AWS Textract, or similar

    return {
      text: "",
      blocks: [],
      language: args.language ?? "en",
    };
  },
});

/**
 * Detect objects in image
 */
export const detectObjects = action({
  args: {
    imageUrl: v.optional(v.string()),
    base64Data: v.optional(v.string()),
    minConfidence: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<DetectedObject[]> => {
    // Placeholder for object detection
    // In production, would use YOLO, Detectron2, or cloud vision APIs

    return [];
  },
});

// ============================================================================
// Normalization Functions
// ============================================================================

/**
 * Normalize input for consistent embedding generation
 */
export const normalizeForEmbedding = action({
  args: {
    input: v.object({
      type: v.union(
        v.literal("text"),
        v.literal("audio"),
        v.literal("image"),
        v.literal("video")
      ),
      text: v.optional(v.string()),
      transcription: v.optional(v.string()),
      imageDescription: v.optional(v.string()),
      videoFrameDescriptions: v.optional(v.array(v.string())),
      entities: v.optional(v.array(v.object({
        text: v.string(),
        type: v.string(),
      }))),
      keywords: v.optional(v.array(v.string())),
      sentiment: v.optional(v.object({
        score: v.number(),
        label: v.string(),
      })),
    }),
    targetLength: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<{
    normalizedText: string;
    metadata: Record<string, unknown>;
  }> => {
    const targetLength = args.targetLength ?? 8000;
    let normalizedText = "";

    switch (args.input.type) {
      case "text":
        normalizedText = args.input.text ?? "";
        break;

      case "audio":
        normalizedText = buildAudioContext(args.input);
        break;

      case "image":
        normalizedText = buildImageContext(args.input);
        break;

      case "video":
        normalizedText = buildVideoContext(args.input);
        break;
    }

    // Truncate if necessary
    if (normalizedText.length > targetLength) {
      normalizedText = truncateIntelligently(normalizedText, targetLength);
    }

    return {
      normalizedText,
      metadata: {
        originalType: args.input.type,
        normalizedLength: normalizedText.length,
        entityCount: args.input.entities?.length ?? 0,
        keywordCount: args.input.keywords?.length ?? 0,
      },
    };
  },
});

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Clean text based on content type
 */
function cleanText(text: string, contentType: string): string {
  let cleaned = text;

  switch (contentType) {
    case "html":
      // Remove script and style tags
      cleaned = cleaned.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "");
      cleaned = cleaned.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "");
      // Remove HTML tags but keep content
      cleaned = cleaned.replace(/<[^>]+>/g, " ");
      // Decode common HTML entities
      cleaned = cleaned
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&mdash;/g, "-")
        .replace(/&ndash;/g, "-")
        .replace(/&hellip;/g, "...");
      break;

    case "markdown":
      // Remove markdown formatting
      cleaned = cleaned
        .replace(/#{1,6}\s/g, "")
        .replace(/\*\*([^*]+)\*\*/g, "$1")
        .replace(/\*([^*]+)\*/g, "$1")
        .replace(/_([^_]+)_/g, "$1")
        .replace(/~~([^~]+)~~/g, "$1")
        .replace(/`([^`]+)`/g, "$1")
        .replace(/```[\s\S]*?```/g, "")
        .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
        .replace(/!\[([^\]]*)\]\([^)]+\)/g, "")
        .replace(/^\s*[-*+]\s/gm, "")
        .replace(/^\s*\d+\.\s/gm, "")
        .replace(/^\s*>\s/gm, "");
      break;

    case "json":
      try {
        const parsed = JSON.parse(text);
        cleaned = extractTextFromJson(parsed);
      } catch {
        // If parsing fails, treat as plain text
      }
      break;
  }

  // Normalize whitespace
  cleaned = cleaned
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\t/g, " ")
    .replace(/  +/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return cleaned;
}

/**
 * Tokenize text into words
 */
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s'-]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 0);
}

/**
 * Split text into sentences
 */
function splitSentences(text: string): string[] {
  // Simple sentence splitting - handles common abbreviations
  const abbreviations = new Set([
    "mr", "mrs", "ms", "dr", "prof", "sr", "jr", "vs", "etc", "inc", "ltd",
    "corp", "co", "st", "ave", "blvd", "rd", "apt", "no", "vol", "pp",
  ]);

  const sentences: string[] = [];
  let current = "";

  const words = text.split(/\s+/);
  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    current += (current ? " " : "") + word;

    // Check if this word ends a sentence
    if (/[.!?]$/.test(word)) {
      const cleanWord = word.replace(/[.!?]+$/, "").toLowerCase();

      // Check if it's an abbreviation
      if (!abbreviations.has(cleanWord)) {
        // Check if next word starts with capital (indicating new sentence)
        const nextWord = words[i + 1];
        if (!nextWord || /^[A-Z]/.test(nextWord)) {
          sentences.push(current.trim());
          current = "";
        }
      }
    }
  }

  // Add remaining text as last sentence
  if (current.trim()) {
    sentences.push(current.trim());
  }

  return sentences;
}

/**
 * Detect language from text
 */
function detectLanguage(text: string): string {
  // Simple language detection based on common words
  // In production, use a proper language detection library

  const sample = text.toLowerCase().slice(0, 1000);

  const languagePatterns: Record<string, RegExp[]> = {
    en: [/\bthe\b/, /\band\b/, /\bof\b/, /\bto\b/, /\bis\b/],
    es: [/\bel\b/, /\bla\b/, /\bde\b/, /\bque\b/, /\by\b/],
    fr: [/\ble\b/, /\bla\b/, /\bde\b/, /\bet\b/, /\best\b/],
    de: [/\bder\b/, /\bdie\b/, /\bund\b/, /\bist\b/, /\bein\b/],
    pt: [/\bo\b/, /\ba\b/, /\bde\b/, /\bque\b/, /\be\b/],
    it: [/\bil\b/, /\bla\b/, /\bdi\b/, /\bche\b/, /\be\b/],
    nl: [/\bde\b/, /\bhet\b/, /\been\b/, /\bvan\b/, /\bis\b/],
    sv: [/\boch\b/, /\batt\b/, /\bdet\b/, /\bi\b/, /\ben\b/],
  };

  let maxScore = 0;
  let detectedLang = "en";

  for (const [lang, patterns] of Object.entries(languagePatterns)) {
    const score = patterns.filter((p) => p.test(sample)).length;
    if (score > maxScore) {
      maxScore = score;
      detectedLang = lang;
    }
  }

  return detectedLang;
}

/**
 * Extract named entities from text
 */
function extractEntities(text: string): ExtractedEntity[] {
  const entities: ExtractedEntity[] = [];

  const patterns: Array<{ pattern: RegExp; type: EntityType }> = [
    // Email
    {
      pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
      type: "email",
    },
    // URL
    {
      pattern: /https?:\/\/[^\s<>"{}|\\^`\[\]]+/g,
      type: "url",
    },
    // Phone
    {
      pattern: /\b(?:\+?1[-.\s]?)?\(?[0-9]{3}\)?[-.\s]?[0-9]{3}[-.\s]?[0-9]{4}\b/g,
      type: "phone",
    },
    // Date (various formats)
    {
      pattern: /\b(?:\d{1,2}\/\d{1,2}\/\d{2,4}|\d{4}-\d{2}-\d{2}|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2},?\s*\d{4})\b/gi,
      type: "date",
    },
    // Time
    {
      pattern: /\b\d{1,2}:\d{2}(?::\d{2})?(?:\s*[AaPp][Mm])?\b/g,
      type: "time",
    },
    // Money
    {
      pattern: /\$[\d,]+(?:\.\d{2})?|\d+(?:\.\d{2})?\s*(?:USD|EUR|GBP|dollars?|euros?|pounds?)/gi,
      type: "money",
    },
    // Percent
    {
      pattern: /\b\d+(?:\.\d+)?%|\b\d+(?:\.\d+)?\s*percent\b/gi,
      type: "percent",
    },
    // Organizations (capitalized multi-word phrases)
    {
      pattern: /\b(?:[A-Z][a-z]+\s+){1,3}(?:Inc|Corp|LLC|Ltd|Company|Co|Group|Holdings|Industries|Technologies|Solutions|Services|Systems)\b/g,
      type: "organization",
    },
    // People (Title + Name pattern)
    {
      pattern: /\b(?:Mr|Mrs|Ms|Dr|Prof|Sir|Dame|Lord|Lady)\.?\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?\b/g,
      type: "person",
    },
    // Locations (common patterns)
    {
      pattern: /\b(?:New York|Los Angeles|San Francisco|Chicago|London|Paris|Tokyo|Berlin|Sydney|Toronto|Mumbai|Beijing|Shanghai|Seoul|Singapore)\b/g,
      type: "location",
    },
    // Technology terms
    {
      pattern: /\b(?:JavaScript|TypeScript|Python|React|Node\.js|AWS|Azure|Google Cloud|Docker|Kubernetes|GraphQL|REST API|Machine Learning|AI|Artificial Intelligence)\b/gi,
      type: "technology",
    },
  ];

  for (const { pattern, type } of patterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      entities.push({
        text: match[0],
        type,
        startIndex: match.index,
        endIndex: match.index + match[0].length,
        confidence: 0.85,
      });
    }
  }

  // Sort by position
  entities.sort((a, b) => a.startIndex - b.startIndex);

  // Remove overlapping entities (keep longer match)
  const filtered: ExtractedEntity[] = [];
  for (const entity of entities) {
    const overlapping = filtered.find(
      (e) =>
        (entity.startIndex >= e.startIndex && entity.startIndex < e.endIndex) ||
        (entity.endIndex > e.startIndex && entity.endIndex <= e.endIndex)
    );

    if (!overlapping) {
      filtered.push(entity);
    } else if (entity.text.length > overlapping.text.length) {
      const index = filtered.indexOf(overlapping);
      filtered[index] = entity;
    }
  }

  return filtered;
}

/**
 * Extract keywords from text
 */
function extractKeywords(text: string, tokens: string[]): string[] {
  // Stop words to filter out
  const stopWords = new Set([
    "a", "an", "the", "and", "or", "but", "in", "on", "at", "to", "for", "of",
    "with", "by", "from", "as", "is", "was", "are", "were", "be", "been",
    "being", "have", "has", "had", "do", "does", "did", "will", "would",
    "could", "should", "may", "might", "must", "shall", "can", "this", "that",
    "these", "those", "i", "you", "he", "she", "it", "we", "they", "what",
    "which", "who", "whom", "when", "where", "why", "how", "all", "each",
    "every", "both", "few", "more", "most", "other", "some", "such", "no",
    "not", "only", "own", "same", "so", "than", "too", "very", "just", "also",
  ]);

  // Count word frequencies
  const wordFreq = new Map<string, number>();
  for (const token of tokens) {
    if (token.length > 2 && !stopWords.has(token)) {
      wordFreq.set(token, (wordFreq.get(token) ?? 0) + 1);
    }
  }

  // Sort by frequency and take top keywords
  const sorted = [...wordFreq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([word]) => word);

  return sorted;
}

/**
 * Analyze sentiment of text
 */
function analyzeSentiment(text: string): SentimentResult {
  // Simple lexicon-based sentiment analysis
  // In production, use a proper sentiment analysis model

  const positiveWords = new Set([
    "good", "great", "excellent", "amazing", "wonderful", "fantastic", "love",
    "happy", "joy", "beautiful", "awesome", "perfect", "best", "brilliant",
    "outstanding", "superb", "delightful", "positive", "success", "win",
  ]);

  const negativeWords = new Set([
    "bad", "terrible", "awful", "horrible", "hate", "sad", "angry", "fear",
    "ugly", "worst", "poor", "negative", "fail", "failure", "wrong", "problem",
    "issue", "error", "bug", "broken", "disappointing", "frustrated",
  ]);

  const tokens = text.toLowerCase().split(/\s+/);
  let positiveCount = 0;
  let negativeCount = 0;

  for (const token of tokens) {
    if (positiveWords.has(token)) positiveCount++;
    if (negativeWords.has(token)) negativeCount++;
  }

  const total = positiveCount + negativeCount;
  if (total === 0) {
    return { score: 0, magnitude: 0, label: "neutral", confidence: 0.5 };
  }

  const score = (positiveCount - negativeCount) / total;
  const magnitude = total / tokens.length * 10;

  let label: "positive" | "negative" | "neutral" | "mixed";
  if (score > 0.2) label = "positive";
  else if (score < -0.2) label = "negative";
  else if (positiveCount > 0 && negativeCount > 0) label = "mixed";
  else label = "neutral";

  return {
    score: Math.max(-1, Math.min(1, score)),
    magnitude,
    label,
    confidence: Math.min(0.9, 0.5 + (total / 100)),
  };
}

/**
 * Extract topics from text
 */
function extractTopics(
  text: string,
  keywords: string[],
  entities: ExtractedEntity[]
): string[] {
  const topics = new Set<string>();

  // Add entity types as topics
  const entityTopics = new Map<EntityType, string>([
    ["technology", "Technology"],
    ["money", "Finance"],
    ["organization", "Business"],
    ["person", "People"],
    ["location", "Places"],
    ["date", "Events"],
  ]);

  for (const entity of entities) {
    const topic = entityTopics.get(entity.type);
    if (topic) topics.add(topic);
  }

  // Infer topics from keywords
  const topicPatterns: Array<{ keywords: string[]; topic: string }> = [
    { keywords: ["software", "code", "programming", "developer"], topic: "Software Development" },
    { keywords: ["machine", "learning", "ai", "neural", "model"], topic: "AI/ML" },
    { keywords: ["health", "medical", "doctor", "hospital"], topic: "Healthcare" },
    { keywords: ["finance", "money", "investment", "stock"], topic: "Finance" },
    { keywords: ["sport", "game", "team", "player"], topic: "Sports" },
    { keywords: ["politics", "government", "election", "policy"], topic: "Politics" },
    { keywords: ["science", "research", "study", "discovery"], topic: "Science" },
    { keywords: ["education", "school", "learning", "student"], topic: "Education" },
    { keywords: ["travel", "trip", "vacation", "destination"], topic: "Travel" },
    { keywords: ["food", "restaurant", "recipe", "cooking"], topic: "Food" },
  ];

  for (const { keywords: topicKeywords, topic } of topicPatterns) {
    if (keywords.some((k) => topicKeywords.includes(k))) {
      topics.add(topic);
    }
  }

  return [...topics];
}

/**
 * Calculate readability score (Flesch-Kincaid)
 */
function calculateReadability(text: string, sentences: string[], tokens: string[]): number {
  if (sentences.length === 0 || tokens.length === 0) return 0;

  // Count syllables (simplified)
  const syllableCount = tokens.reduce((count, word) => {
    return count + countSyllables(word);
  }, 0);

  const avgSentenceLength = tokens.length / sentences.length;
  const avgSyllablesPerWord = syllableCount / tokens.length;

  // Flesch Reading Ease
  const score = 206.835 - (1.015 * avgSentenceLength) - (84.6 * avgSyllablesPerWord);

  // Normalize to 0-100 range
  return Math.max(0, Math.min(100, score));
}

/**
 * Count syllables in a word (simplified)
 */
function countSyllables(word: string): number {
  word = word.toLowerCase();
  if (word.length <= 3) return 1;

  word = word.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, "");
  word = word.replace(/^y/, "");

  const matches = word.match(/[aeiouy]{1,2}/g);
  return matches ? matches.length : 1;
}

/**
 * Extract speaker information from segments
 */
function extractSpeakerInfo(segments: TranscriptionSegment[]): SpeakerInfo[] {
  const speakerMap = new Map<string, SpeakerInfo>();

  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    const speaker = segment.speaker ?? "Unknown";

    if (!speakerMap.has(speaker)) {
      speakerMap.set(speaker, {
        id: speaker,
        label: speaker,
        totalSpeakingTime: 0,
        segments: [],
      });
    }

    const info = speakerMap.get(speaker)!;
    info.totalSpeakingTime += segment.endTime - segment.startTime;
    info.segments.push(i);
  }

  return [...speakerMap.values()];
}

/**
 * Analyze emotional tone from transcription segments
 */
function analyzeEmotionalTone(segments: TranscriptionSegment[]): EmotionalAnalysis {
  const emotions: Map<string, number> = new Map();
  const trajectory: Array<{ timestamp: number; emotion: string; intensity: number }> = [];

  for (const segment of segments) {
    const sentiment = analyzeSentiment(segment.text);
    const emotion = sentiment.label === "positive" ? "happy"
      : sentiment.label === "negative" ? "frustrated"
      : "neutral";

    emotions.set(emotion, (emotions.get(emotion) ?? 0) + 1);

    trajectory.push({
      timestamp: segment.startTime,
      emotion,
      intensity: Math.abs(sentiment.score),
    });
  }

  // Find primary emotion
  let primaryEmotion = "neutral";
  let maxCount = 0;
  for (const [emotion, count] of emotions.entries()) {
    if (count > maxCount) {
      maxCount = count;
      primaryEmotion = emotion;
    }
  }

  return {
    primaryEmotion,
    emotions: [...emotions.entries()].map(([emotion, score]) => ({ emotion, score })),
    trajectory,
    overallSentiment: analyzeSentiment(segments.map((s) => s.text).join(" ")),
  };
}

/**
 * Infer image type from context
 */
function inferImageType(context?: string, altText?: string): ImageType {
  const combined = `${context ?? ""} ${altText ?? ""}`.toLowerCase();

  if (/screenshot|screen\s*shot|capture/i.test(combined)) return "screenshot";
  if (/chart|graph|plot|data\s*viz/i.test(combined)) return "chart";
  if (/diagram|flow|architecture|schematic/i.test(combined)) return "diagram";
  if (/illustration|drawing|art|cartoon/i.test(combined)) return "illustration";
  if (/photo|photograph|picture|image/i.test(combined)) return "photo";
  if (/text|document|page|article/i.test(combined)) return "text";

  return "unknown";
}

/**
 * Extract text from JSON recursively
 */
function extractTextFromJson(obj: unknown): string {
  if (typeof obj === "string") return obj;
  if (typeof obj !== "object" || obj === null) return "";

  if (Array.isArray(obj)) {
    return obj.map(extractTextFromJson).join(" ");
  }

  return Object.values(obj).map(extractTextFromJson).join(" ");
}

/**
 * Build enriched context for audio
 */
function buildAudioContext(input: {
  transcription?: string;
  entities?: Array<{ text: string; type: string }>;
  keywords?: Array<string>;
  sentiment?: { score: number; label: string };
}): string {
  const parts: string[] = [];

  if (input.transcription) {
    parts.push(input.transcription);
  }

  if (input.entities && input.entities.length > 0) {
    const entityText = input.entities.map((e) => `${e.type}: ${e.text}`).join(", ");
    parts.push(`[Entities: ${entityText}]`);
  }

  if (input.keywords && input.keywords.length > 0) {
    parts.push(`[Keywords: ${input.keywords.join(", ")}]`);
  }

  if (input.sentiment) {
    parts.push(`[Sentiment: ${input.sentiment.label}]`);
  }

  return parts.join(" ");
}

/**
 * Build enriched context for image
 */
function buildImageContext(input: {
  imageDescription?: string;
  entities?: Array<{ text: string; type: string }>;
  keywords?: Array<string>;
}): string {
  const parts: string[] = [];

  if (input.imageDescription) {
    parts.push(input.imageDescription);
  }

  if (input.entities && input.entities.length > 0) {
    const objects = input.entities.map((e) => e.text).join(", ");
    parts.push(`[Contains: ${objects}]`);
  }

  return parts.join(" ");
}

/**
 * Build enriched context for video
 */
function buildVideoContext(input: {
  videoFrameDescriptions?: string[];
  transcription?: string;
  entities?: Array<{ text: string; type: string }>;
}): string {
  const parts: string[] = [];

  if (input.videoFrameDescriptions && input.videoFrameDescriptions.length > 0) {
    parts.push(`Video content: ${input.videoFrameDescriptions.join(". ")}`);
  }

  if (input.transcription) {
    parts.push(`Audio: ${input.transcription}`);
  }

  return parts.join(" ");
}

/**
 * Truncate text intelligently at sentence boundaries
 */
function truncateIntelligently(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;

  // Find last sentence boundary before maxLength
  const truncated = text.slice(0, maxLength);
  const lastPeriod = truncated.lastIndexOf(".");
  const lastQuestion = truncated.lastIndexOf("?");
  const lastExclamation = truncated.lastIndexOf("!");

  const lastBoundary = Math.max(lastPeriod, lastQuestion, lastExclamation);

  if (lastBoundary > maxLength * 0.5) {
    return text.slice(0, lastBoundary + 1);
  }

  // Fall back to word boundary
  const lastSpace = truncated.lastIndexOf(" ");
  return lastSpace > 0 ? text.slice(0, lastSpace) + "..." : truncated + "...";
}
