/**
 * Voice Intelligence Agent for Orion Browser
 * Handles transcription processing, emotion detection, and conversational intent extraction
 *
 * Enhanced with:
 * - Privacy controls (VoicePrivacyController)
 * - Emotional trajectory tracking (EmotionalTrajectoryAnalyzer)
 * - Voice intent memory (VoiceIntentMemory)
 * - Conversation intelligence
 * - App Store safety controls
 */

import { ChatOpenAI } from "@langchain/openai";
import { tool } from "@langchain/core/tools";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";

import type {
  VoiceSession,
  TranscriptionSegment,
  SemanticChunk,
  SentimentScore,
  EmotionLabel,
  VoiceIntent,
  VoiceIntentType,
  CognitiveState,
  FrictionPoint,
  FrictionType,
  NamedEntity,
  AudioProcessingInput,
  AudioProcessingOutput,
  SentimentAnalysisInput,
  SentimentAnalysisOutput,
  IntentExtractionInput,
  IntentExtractionOutput,
  ConsentState,
  IntelligenceThrottling,
  // New imports for enhanced features
  VoiceCaptureMode,
  SensitiveDataType,
  RedactionPattern,
  RedactionResult,
  RedactionMatch,
  VoicePrivacyConfig,
  MicPermissionState,
  RecordingIndicatorState,
  AppStoreSafetyState,
  EmotionalDataPoint,
  EmotionalTrajectory,
  EmotionalTrend,
  DecisionConfidenceMarker,
  UncertaintyIndicator,
  CognitiveFrictionImprovement,
  CognitiveFrictionCategory,
  QuestionAnalysisResult,
  QuestionType,
  EmotionalSessionSummary,
  EmotionalTrigger,
  StoredVoiceIntent,
  VoiceCommandPattern,
  UserVoiceInteractionStyle,
  IntentHistoryEntry,
  ForgettingCurveData,
  VoiceIntentMemoryConfig,
  ConversationTurn,
  MultiTurnConversation,
  ConversationContext,
  ConversationSummary,
  DecisionPoint,
  SessionContextCarryover,
  RedactionFilterInput,
  RedactionFilterOutput,
  EmotionalTrajectoryInput,
  EmotionalTrajectoryOutput,
  VoiceIntentMemoryInput,
  VoiceIntentMemoryOutput,
  ConversationSummaryInput,
  ConversationSummaryOutput,
} from "../shared/types.js";

import { getMemoryManager } from "../shared/memory.js";
import { getEmbeddingManager, SemanticChunker } from "../shared/embedding.js";

// ============================================================================
// Logging Utility
// ============================================================================

const logger = {
  info: (message: string, data?: Record<string, unknown>) => {
    console.log(`[VoiceAgent:INFO] ${message}`, data ?? "");
  },
  warn: (message: string, data?: Record<string, unknown>) => {
    console.warn(`[VoiceAgent:WARN] ${message}`, data ?? "");
  },
  error: (message: string, error?: Error | unknown) => {
    console.error(`[VoiceAgent:ERROR] ${message}`, error ?? "");
  },
  debug: (message: string, data?: Record<string, unknown>) => {
    if (process.env.NODE_ENV === "development") {
      console.log(`[VoiceAgent:DEBUG] ${message}`, data ?? "");
    }
  },
};

// ============================================================================
// Voice Agent Configuration
// ============================================================================

export interface VoiceAgentConfig {
  modelName: string;
  temperature: number;
  maxTokens: number;
  enableEmotionDetection: boolean;
  enableCognitiveAnalysis: boolean;
  enableSemanticChunking: boolean;
  frictionDetectionThreshold: number;
}

const DEFAULT_CONFIG: VoiceAgentConfig = {
  modelName: "gpt-4o-mini",
  temperature: 0.3,
  maxTokens: 2048,
  enableEmotionDetection: true,
  enableCognitiveAnalysis: true,
  enableSemanticChunking: true,
  frictionDetectionThreshold: 0.6,
};

// ============================================================================
// Voice Intelligence Tools
// ============================================================================

/**
 * Audio Processing Tool - Processes audio data for transcription
 * Note: In production, this would integrate with a speech-to-text service
 */
const audioProcessingTool = tool(
  async (input: AudioProcessingInput): Promise<AudioProcessingOutput> => {
    // In production, this would call a speech-to-text API
    // For now, we return a structured placeholder
    return {
      transcription: [],
      totalDuration: 0,
      audioQuality: "medium",
    };
  },
  {
    name: "audio_processing",
    description: "Processes audio data and returns transcription segments",
    schema: z.object({
      audioData: z.string().describe("Base64 encoded audio data"),
      sampleRate: z.number().describe("Audio sample rate in Hz"),
      channels: z.number().describe("Number of audio channels"),
      format: z.enum(["wav", "mp3", "m4a", "webm"]).describe("Audio format"),
    }),
  }
);

/**
 * Sentiment Analysis Tool - Analyzes text for sentiment and emotions
 */
const sentimentAnalysisTool = tool(
  async (input: SentimentAnalysisInput): Promise<SentimentAnalysisOutput> => {
    const model = new ChatOpenAI({
      modelName: "gpt-4o-mini",
      temperature: 0.1,
    });

    const systemPrompt = `Analyze the following text for sentiment and emotions.
Return JSON with this structure:
{
  "sentiment": {
    "positive": 0.0-1.0,
    "negative": 0.0-1.0,
    "neutral": 0.0-1.0,
    "compound": -1.0 to 1.0
  },
  "emotions": ["neutral", "happy", "sad", "angry", "fearful", "surprised", "disgusted", "confused", "curious", "frustrated"],
  "confidence": 0.0-1.0
}
Only include detected emotions in the array.`;

    try {
      const response = await model.invoke([
        new SystemMessage(systemPrompt),
        new HumanMessage(input.text),
      ]);

      const content = response.content as string;
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const result = JSON.parse(jsonMatch[0]);
        return {
          sentiment: result.sentiment,
          emotions: result.emotions,
          confidence: result.confidence,
        };
      }
    } catch (error) {
      console.error("Error in sentiment analysis:", error);
    }

    // Default neutral response
    return {
      sentiment: { positive: 0, negative: 0, neutral: 1, compound: 0 },
      emotions: ["neutral"],
      confidence: 0.5,
    };
  },
  {
    name: "sentiment_analysis",
    description: "Analyzes text for sentiment and emotional content",
    schema: z.object({
      text: z.string().describe("Text to analyze"),
      includeEmotions: z.boolean().describe("Whether to include emotion labels"),
    }),
  }
);

/**
 * Intent Extraction Tool - Extracts intents and entities from text
 */
const intentExtractionTool = tool(
  async (input: IntentExtractionInput): Promise<IntentExtractionOutput> => {
    const model = new ChatOpenAI({
      modelName: "gpt-4o-mini",
      temperature: 0.1,
    });

    const systemPrompt = `Extract intents and entities from the following text.
Return JSON with this structure:
{
  "primaryIntent": {
    "type": "question|command|statement|clarification|confirmation|rejection|navigation|search|dictation",
    "confidence": 0.0-1.0,
    "parameters": {}
  },
  "secondaryIntents": [],
  "entities": [
    {
      "text": "entity text",
      "type": "person|organization|location|date|time|money|product|event|concept",
      "confidence": 0.0-1.0,
      "startIndex": 0,
      "endIndex": 0
    }
  ]
}`;

    const userPrompt = input.context
      ? `Context: ${input.context}\n\nText: ${input.text}`
      : input.text;

    try {
      const response = await model.invoke([
        new SystemMessage(systemPrompt),
        new HumanMessage(userPrompt),
      ]);

      const content = response.content as string;
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const result = JSON.parse(jsonMatch[0]);
        return {
          primaryIntent: {
            ...result.primaryIntent,
            timestamp: new Date(),
          },
          secondaryIntents: result.secondaryIntents.map((i: VoiceIntent) => ({
            ...i,
            timestamp: new Date(),
          })),
          entities: result.entities,
        };
      }
    } catch (error) {
      console.error("Error in intent extraction:", error);
    }

    // Default response
    return {
      primaryIntent: {
        type: "statement",
        confidence: 0.5,
        parameters: {},
        timestamp: new Date(),
      },
      secondaryIntents: [],
      entities: [],
    };
  },
  {
    name: "intent_extraction",
    description: "Extracts intents and named entities from text",
    schema: z.object({
      text: z.string().describe("Text to analyze"),
      context: z.string().optional().describe("Optional context for better extraction"),
    }),
  }
);

// ============================================================================
// Voice Intelligence Agent
// ============================================================================

export class VoiceIntelligenceAgent {
  private model: ChatOpenAI;
  private config: VoiceAgentConfig;
  private chunker: SemanticChunker;
  private currentSession: VoiceSession | null = null;
  private questionHistory: Map<string, number> = new Map();
  private frictionPoints: FrictionPoint[] = [];

  constructor(config: Partial<VoiceAgentConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.model = new ChatOpenAI({
      modelName: this.config.modelName,
      temperature: this.config.temperature,
      maxTokens: this.config.maxTokens,
    });
    this.chunker = new SemanticChunker(256, 25);
  }

  /**
   * Start a new voice session
   */
  startSession(userId: string): VoiceSession {
    this.currentSession = {
      sessionId: uuidv4(),
      startTime: new Date(),
      transcriptions: [],
      overallSentiment: { positive: 0, negative: 0, neutral: 1, compound: 0 },
      intents: [],
      cognitiveState: {
        cognitiveLoad: 0,
        frustrationLevel: 0,
        engagementLevel: 0.5,
        questionFrequency: 0,
        frictionPoints: [],
      },
    };

    this.questionHistory.clear();
    this.frictionPoints = [];

    getMemoryManager().setVoiceContext(this.currentSession);

    return this.currentSession;
  }

  /**
   * Process a transcription segment
   */
  async processTranscription(
    text: string,
    startTime: number,
    endTime: number,
    consent: ConsentState,
    throttling: IntelligenceThrottling
  ): Promise<TranscriptionSegment> {
    if (!this.currentSession) {
      throw new Error("No active voice session");
    }

    if (!consent.voiceProcessing) {
      throw new Error("Voice processing not consented");
    }

    // Create base segment
    const segment: TranscriptionSegment = {
      id: uuidv4(),
      text,
      startTime,
      endTime,
      confidence: 0.9, // Would come from STT service
      emotion: "neutral",
    };

    // Analyze sentiment and emotions if enabled
    if (this.config.enableEmotionDetection && throttling.voiceProcessingEnabled) {
      const sentimentResult = await sentimentAnalysisTool.invoke({
        text,
        includeEmotions: true,
      });

      segment.emotion = (sentimentResult.emotions[0] as EmotionLabel) ?? "neutral";

      // Update session sentiment
      this.updateSessionSentiment(sentimentResult.sentiment);
    }

    // Extract intents
    if (throttling.voiceProcessingEnabled) {
      const intentResult = await intentExtractionTool.invoke({
        text,
        context: this.getRecentContext(),
      });

      this.currentSession.intents.push(intentResult.primaryIntent);

      // Track questions for pattern detection
      if (intentResult.primaryIntent.type === "question") {
        this.trackQuestion(text);
      }
    }

    // Create semantic chunk if enabled
    if (this.config.enableSemanticChunking && throttling.embeddingEnabled) {
      segment.semanticChunk = await this.createSemanticChunk(text);
    }

    // Add to session
    this.currentSession.transcriptions.push(segment);

    // Detect cognitive friction if enabled
    if (this.config.enableCognitiveAnalysis) {
      await this.detectCognitiveFriction(segment);
    }

    // Update cognitive state
    this.updateCognitiveState();

    // Update memory
    getMemoryManager().setVoiceContext(this.currentSession);

    return segment;
  }

  /**
   * Detect question-asking patterns
   */
  detectQuestionPatterns(): QuestionPatternResult {
    if (!this.currentSession) {
      return { patterns: [], insights: [] };
    }

    const patterns: QuestionPattern[] = [];
    const insights: string[] = [];

    const questions = this.currentSession.intents.filter(
      (i) => i.type === "question"
    );

    // High question frequency
    const questionRate = questions.length / this.currentSession.transcriptions.length;
    if (questionRate > 0.5) {
      patterns.push({
        type: "high_frequency",
        description: "User is asking many questions",
        frequency: questionRate,
      });
      insights.push("User may be in learning or research mode");
    }

    // Repeated questions (potential confusion)
    for (const [question, count] of this.questionHistory) {
      if (count > 1) {
        patterns.push({
          type: "repeated",
          description: `Question asked ${count} times: "${question.slice(0, 50)}..."`,
          frequency: count,
        });
        insights.push("Repeated questions may indicate confusion or unclear responses");
      }
    }

    // Clarification questions
    const clarifications = this.currentSession.intents.filter(
      (i) => i.type === "clarification"
    );
    if (clarifications.length > 2) {
      patterns.push({
        type: "seeking_clarification",
        description: "Multiple clarification requests detected",
        frequency: clarifications.length,
      });
      insights.push("User may need more detailed or clearer explanations");
    }

    return { patterns, insights };
  }

  /**
   * Identify cognitive friction points
   */
  getCognitiveFrictionPoints(): FrictionPoint[] {
    return [...this.frictionPoints];
  }

  /**
   * Get current cognitive state
   */
  getCognitiveState(): CognitiveState | null {
    return this.currentSession?.cognitiveState ?? null;
  }

  /**
   * Extract conversational intent summary
   */
  async extractConversationalIntent(): Promise<ConversationalIntentSummary> {
    if (!this.currentSession || this.currentSession.transcriptions.length === 0) {
      return {
        primaryGoal: "unknown",
        subGoals: [],
        completionStatus: "incomplete",
        confidence: 0,
      };
    }

    const fullTranscript = this.currentSession.transcriptions
      .map((t) => t.text)
      .join(" ");

    const systemPrompt = `Analyze the following voice conversation and extract the user's conversational intent.
Return JSON with this structure:
{
  "primaryGoal": "main goal description",
  "subGoals": ["sub-goal 1", "sub-goal 2"],
  "completionStatus": "complete|incomplete|abandoned",
  "confidence": 0.0-1.0
}`;

    try {
      const response = await this.model.invoke([
        new SystemMessage(systemPrompt),
        new HumanMessage(fullTranscript.slice(0, 3000)),
      ]);

      const content = response.content as string;
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch (error) {
      console.error("Error extracting conversational intent:", error);
    }

    return {
      primaryGoal: "unknown",
      subGoals: [],
      completionStatus: "incomplete",
      confidence: 0.5,
    };
  }

  /**
   * Get session summary
   */
  getSessionSummary(): VoiceSessionSummary | null {
    if (!this.currentSession) {
      return null;
    }

    const duration =
      (new Date().getTime() - this.currentSession.startTime.getTime()) / 1000;

    const questionPatterns = this.detectQuestionPatterns();

    return {
      sessionId: this.currentSession.sessionId,
      duration,
      transcriptionCount: this.currentSession.transcriptions.length,
      overallSentiment: this.currentSession.overallSentiment,
      dominantEmotion: this.getDominantEmotion(),
      intentBreakdown: this.getIntentBreakdown(),
      questionPatterns: questionPatterns.patterns.length,
      frictionPoints: this.frictionPoints.length,
      cognitiveLoad: this.currentSession.cognitiveState.cognitiveLoad,
      frustrationLevel: this.currentSession.cognitiveState.frustrationLevel,
    };
  }

  /**
   * End the current session
   */
  endSession(): VoiceSessionSummary | null {
    const summary = this.getSessionSummary();
    this.currentSession = null;
    this.questionHistory.clear();
    this.frictionPoints = [];
    return summary;
  }

  // -------------------------------------------------------------------------
  // Private Helper Methods
  // -------------------------------------------------------------------------

  private updateSessionSentiment(newSentiment: SentimentScore): void {
    if (!this.currentSession) return;

    const count = this.currentSession.transcriptions.length;
    const current = this.currentSession.overallSentiment;

    // Running average
    this.currentSession.overallSentiment = {
      positive: (current.positive * count + newSentiment.positive) / (count + 1),
      negative: (current.negative * count + newSentiment.negative) / (count + 1),
      neutral: (current.neutral * count + newSentiment.neutral) / (count + 1),
      compound: (current.compound * count + newSentiment.compound) / (count + 1),
    };
  }

  private getRecentContext(): string {
    if (!this.currentSession) return "";

    return this.currentSession.transcriptions
      .slice(-3)
      .map((t) => t.text)
      .join(" ");
  }

  private trackQuestion(questionText: string): void {
    // Normalize question for comparison
    const normalized = questionText.toLowerCase().trim();
    const current = this.questionHistory.get(normalized) ?? 0;
    this.questionHistory.set(normalized, current + 1);
  }

  private async createSemanticChunk(text: string): Promise<SemanticChunk> {
    const chunks = this.chunker.createSemanticChunks(text, "text", true);
    return chunks[0] ?? {
      id: uuidv4(),
      text,
      topic: "general",
      intent: "statement",
      entities: [],
    };
  }

  private async detectCognitiveFriction(segment: TranscriptionSegment): void {
    const frictionIndicators: Array<{
      pattern: RegExp;
      type: FrictionType;
    }> = [
      { pattern: /what\??$/i, type: "confusion_indicator" },
      { pattern: /i don't understand/i, type: "comprehension_issue" },
      { pattern: /say that again/i, type: "repeated_question" },
      { pattern: /this is frustrating|ugh|argh/i, type: "frustration_expression" },
      { pattern: /how do i|where is|can't find/i, type: "navigation_difficulty" },
      { pattern: /didn't work|not working|failed/i, type: "voice_command_failure" },
    ];

    for (const { pattern, type } of frictionIndicators) {
      if (pattern.test(segment.text)) {
        const frictionPoint: FrictionPoint = {
          type,
          context: segment.text,
          timestamp: new Date(),
        };
        this.frictionPoints.push(frictionPoint);

        // Add to memory as alert
        if (type === "frustration_expression") {
          getMemoryManager().addAlert({
            type: "cognitive_overload",
            severity: "info",
            message: "User frustration detected in voice interaction",
          });
        }
      }
    }

    // Detect frustration from emotion
    if (
      segment.emotion === "frustrated" ||
      segment.emotion === "angry" ||
      segment.emotion === "confused"
    ) {
      this.frictionPoints.push({
        type: "frustration_expression",
        context: `Emotion detected: ${segment.emotion}`,
        timestamp: new Date(),
      });
    }
  }

  private updateCognitiveState(): void {
    if (!this.currentSession) return;

    const state = this.currentSession.cognitiveState;

    // Calculate cognitive load based on various factors
    const questionRate =
      this.currentSession.intents.filter((i) => i.type === "question").length /
      Math.max(1, this.currentSession.transcriptions.length);
    const frictionRate =
      this.frictionPoints.length /
      Math.max(1, this.currentSession.transcriptions.length);
    const clarificationRate =
      this.currentSession.intents.filter((i) => i.type === "clarification").length /
      Math.max(1, this.currentSession.transcriptions.length);

    state.cognitiveLoad = Math.min(
      1,
      questionRate * 0.3 + frictionRate * 0.5 + clarificationRate * 0.2
    );

    // Calculate frustration level
    const negativeEmotions = this.currentSession.transcriptions.filter((t) =>
      ["frustrated", "angry", "confused", "sad"].includes(t.emotion)
    ).length;
    state.frustrationLevel =
      negativeEmotions / Math.max(1, this.currentSession.transcriptions.length);

    // Calculate engagement level
    const recentSegments = this.currentSession.transcriptions.slice(-5);
    const avgLength =
      recentSegments.reduce((sum, s) => sum + s.text.length, 0) /
      Math.max(1, recentSegments.length);
    state.engagementLevel = Math.min(1, avgLength / 100);

    // Update question frequency
    state.questionFrequency = questionRate;

    // Update friction points
    state.frictionPoints = this.frictionPoints.slice(-10);
  }

  private getDominantEmotion(): EmotionLabel {
    if (!this.currentSession || this.currentSession.transcriptions.length === 0) {
      return "neutral";
    }

    const emotionCounts = new Map<EmotionLabel, number>();
    for (const segment of this.currentSession.transcriptions) {
      emotionCounts.set(
        segment.emotion,
        (emotionCounts.get(segment.emotion) ?? 0) + 1
      );
    }

    let dominant: EmotionLabel = "neutral";
    let maxCount = 0;
    for (const [emotion, count] of emotionCounts) {
      if (count > maxCount) {
        maxCount = count;
        dominant = emotion;
      }
    }

    return dominant;
  }

  private getIntentBreakdown(): Record<VoiceIntentType, number> {
    const breakdown: Record<VoiceIntentType, number> = {
      question: 0,
      command: 0,
      statement: 0,
      clarification: 0,
      confirmation: 0,
      rejection: 0,
      navigation: 0,
      search: 0,
      dictation: 0,
    };

    if (!this.currentSession) return breakdown;

    for (const intent of this.currentSession.intents) {
      breakdown[intent.type]++;
    }

    return breakdown;
  }
}

// ============================================================================
// Types
// ============================================================================

interface QuestionPattern {
  type: "high_frequency" | "repeated" | "seeking_clarification";
  description: string;
  frequency: number;
}

interface QuestionPatternResult {
  patterns: QuestionPattern[];
  insights: string[];
}

interface ConversationalIntentSummary {
  primaryGoal: string;
  subGoals: string[];
  completionStatus: "complete" | "incomplete" | "abandoned";
  confidence: number;
}

interface VoiceSessionSummary {
  sessionId: string;
  duration: number;
  transcriptionCount: number;
  overallSentiment: SentimentScore;
  dominantEmotion: EmotionLabel;
  intentBreakdown: Record<VoiceIntentType, number>;
  questionPatterns: number;
  frictionPoints: number;
  cognitiveLoad: number;
  frustrationLevel: number;
}

// ============================================================================
// Export Tools for LangGraph
// ============================================================================

export const voiceTools = [
  audioProcessingTool,
  sentimentAnalysisTool,
  intentExtractionTool,
];

export { audioProcessingTool, sentimentAnalysisTool, intentExtractionTool };
