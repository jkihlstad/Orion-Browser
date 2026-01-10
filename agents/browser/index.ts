/**
 * Browser Intelligence Agent for Orion Browser
 * Handles browsing analysis, intent classification, and behavioral pattern detection
 */

import { ChatOpenAI } from "@langchain/openai";
import { tool } from "@langchain/core/tools";
import { HumanMessage, SystemMessage, AIMessage } from "@langchain/core/messages";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";

import type {
  BrowsingSession,
  URLVisit,
  ScrollPattern,
  DoomscrollingAlert,
  ContradictionDetection,
  ContradictoryClaim,
  IntentCategory,
  ContentCategory,
  KnowledgeGraphNode,
  URLAnalysisInput,
  URLAnalysisOutput,
  ContentEmbeddingInput,
  ContentEmbeddingOutput,
  ScrollPatternInput,
  ScrollPatternOutput,
  ScrollEvent,
  EngagementMetrics,
  ConsentState,
  IntelligenceThrottling,
} from "../shared/types.js";

import {
  getEmbeddingManager,
  SemanticChunker,
  KnowledgeGraphBuilder,
} from "../shared/embedding.js";
import { getMemoryManager } from "../shared/memory.js";
import { getComplianceChecker } from "../shared/compliance.js";

// ============================================================================
// Browser Agent Configuration
// ============================================================================

export interface BrowserAgentConfig {
  modelName: string;
  temperature: number;
  maxTokens: number;
  enableContentAnalysis: boolean;
  enablePatternDetection: boolean;
  enableKnowledgeGraph: boolean;
}

const DEFAULT_CONFIG: BrowserAgentConfig = {
  modelName: "gpt-4o-mini",
  temperature: 0.3,
  maxTokens: 2048,
  enableContentAnalysis: true,
  enablePatternDetection: true,
  enableKnowledgeGraph: true,
};

// ============================================================================
// Browser Intelligence Tools
// ============================================================================

/**
 * URL Analysis Tool - Analyzes URLs for categorization and intent
 */
const urlAnalysisTool = tool(
  async (input: URLAnalysisInput): Promise<URLAnalysisOutput> => {
    const url = new URL(input.url);
    const domain = url.hostname;

    // Domain-based category inference
    const category = inferCategoryFromDomain(domain);
    const intent = inferIntentFromURL(input.url);
    const isSensitive = getComplianceChecker().isSensitiveURL(input.url);

    // Calculate trust score based on domain characteristics
    const trustScore = calculateTrustScore(domain);

    return {
      url: input.url,
      domain,
      category,
      intent,
      isSensitive,
      trustScore,
    };
  },
  {
    name: "url_analysis",
    description: "Analyzes a URL to determine its category, intent, and sensitivity",
    schema: z.object({
      url: z.string().url().describe("The URL to analyze"),
      includeContent: z.boolean().describe("Whether to include content analysis"),
      maxContentLength: z.number().optional().describe("Maximum content length to analyze"),
    }),
  }
);

/**
 * Content Embedding Tool - Creates embeddings for web content
 */
const contentEmbeddingTool = tool(
  async (input: ContentEmbeddingInput): Promise<ContentEmbeddingOutput> => {
    const embeddingManager = getEmbeddingManager();
    return embeddingManager.embedContent(input);
  },
  {
    name: "content_embedding",
    description: "Creates semantic embeddings for web content",
    schema: z.object({
      content: z.string().describe("The content to embed"),
      contentType: z.enum(["text", "html", "markdown"]).describe("Type of content"),
      chunkSize: z.number().optional().describe("Size of chunks for embedding"),
    }),
  }
);

/**
 * Scroll Pattern Analysis Tool - Detects scrolling behaviors
 */
const scrollPatternTool = tool(
  async (input: ScrollPatternInput): Promise<ScrollPatternOutput> => {
    const patterns = analyzeScrollEvents(input.events);
    const doomscrollingAlert = detectDoomscrolling(patterns, input.sessionDuration);
    const engagementScore = calculateEngagementScore(patterns);

    return {
      patterns,
      doomscrollingAlert,
      engagementScore,
    };
  },
  {
    name: "scroll_pattern_analysis",
    description: "Analyzes scroll events to detect patterns and behaviors",
    schema: z.object({
      events: z.array(
        z.object({
          timestamp: z.number(),
          scrollTop: z.number(),
          scrollHeight: z.number(),
          viewportHeight: z.number(),
        })
      ).describe("Array of scroll events"),
      sessionDuration: z.number().describe("Total session duration in seconds"),
    }),
  }
);

// ============================================================================
// Browser Intelligence Agent
// ============================================================================

export class BrowserIntelligenceAgent {
  private model: ChatOpenAI;
  private config: BrowserAgentConfig;
  private chunker: SemanticChunker;
  private knowledgeBuilder: KnowledgeGraphBuilder;
  private currentSession: BrowsingSession | null = null;

  constructor(config: Partial<BrowserAgentConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.model = new ChatOpenAI({
      modelName: this.config.modelName,
      temperature: this.config.temperature,
      maxTokens: this.config.maxTokens,
    });
    this.chunker = new SemanticChunker();
    this.knowledgeBuilder = new KnowledgeGraphBuilder(getEmbeddingManager());
  }

  /**
   * Start a new browsing session
   */
  startSession(userId: string): BrowsingSession {
    this.currentSession = {
      sessionId: uuidv4(),
      startTime: new Date(),
      urls: [],
      currentIntent: "unknown",
      contentCategories: [],
      scrollPatterns: [],
      tabSwitches: 0,
      searchQueries: [],
    };

    getMemoryManager().setBrowsingContext(this.currentSession);

    return this.currentSession;
  }

  /**
   * Record a URL visit
   */
  async recordVisit(
    url: string,
    title: string,
    content: string,
    consent: ConsentState,
    throttling: IntelligenceThrottling
  ): Promise<URLVisit> {
    if (!this.currentSession) {
      throw new Error("No active session");
    }

    // Analyze URL
    const urlAnalysis = await urlAnalysisTool.invoke({
      url,
      includeContent: consent.browsingAnalysis && throttling.embeddingEnabled,
    });

    // Create visit record
    const visit: URLVisit = {
      url,
      title,
      timestamp: new Date(),
      duration: 0,
      scrollDepth: 0,
      engagement: {
        timeOnPage: 0,
        scrollDepth: 0,
        interactions: 0,
        readingTime: 0,
        bounced: true,
      },
    };

    this.currentSession.urls.push(visit);

    // Update session categories
    if (!this.currentSession.contentCategories.includes(urlAnalysis.category)) {
      this.currentSession.contentCategories.push(urlAnalysis.category);
    }

    // Classify intent if enough data
    if (this.currentSession.urls.length >= 3) {
      this.currentSession.currentIntent = await this.classifySessionIntent();
    }

    // Build knowledge graph if enabled and consented
    if (
      this.config.enableKnowledgeGraph &&
      consent.browsingAnalysis &&
      consent.crossSessionLearning &&
      throttling.embeddingEnabled &&
      !urlAnalysis.isSensitive
    ) {
      await this.updateKnowledgeGraph(url, content);
    }

    // Update memory
    getMemoryManager().setBrowsingContext(this.currentSession);

    return visit;
  }

  /**
   * Record scroll events and detect patterns
   */
  async analyzeScrollBehavior(
    events: ScrollEvent[],
    consent: ConsentState
  ): Promise<ScrollPatternOutput | null> {
    if (!this.currentSession || !consent.browsingAnalysis) {
      return null;
    }

    const sessionDuration =
      (new Date().getTime() - this.currentSession.startTime.getTime()) / 1000;

    const result = await scrollPatternTool.invoke({
      events,
      sessionDuration,
    });

    // Store patterns
    this.currentSession.scrollPatterns.push(...result.patterns);

    // Alert on doomscrolling
    if (result.doomscrollingAlert?.detected) {
      getMemoryManager().addAlert({
        type: "doomscrolling",
        severity: result.doomscrollingAlert.severity === "severe" ? "warning" : "info",
        message: result.doomscrollingAlert.suggestion,
      });
    }

    return result;
  }

  /**
   * Detect contradictions across visited pages
   */
  async detectContradictions(
    content1: string,
    source1: string,
    content2: string,
    source2: string,
    consent: ConsentState
  ): Promise<ContradictionDetection> {
    if (!consent.browsingAnalysis) {
      return { detected: false, claims: [], confidence: 0 };
    }

    const systemPrompt = `You are an expert at detecting contradictory information across different sources.
Analyze the following two pieces of content and identify any contradictory claims.
Return your analysis in JSON format with the following structure:
{
  "detected": boolean,
  "claims": [
    {
      "claim1": "first claim text",
      "claim2": "contradicting claim text",
      "contradictionType": "factual|temporal|statistical|opinion",
      "severity": "minor|significant|major"
    }
  ],
  "confidence": number between 0 and 1
}`;

    const userPrompt = `Source 1 (${source1}):
${content1.slice(0, 2000)}

Source 2 (${source2}):
${content2.slice(0, 2000)}

Analyze for contradictions.`;

    try {
      const response = await this.model.invoke([
        new SystemMessage(systemPrompt),
        new HumanMessage(userPrompt),
      ]);

      const content = response.content as string;
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const result = JSON.parse(jsonMatch[0]);

        if (result.detected) {
          getMemoryManager().addAlert({
            type: "contradiction_detected",
            severity: "info",
            message: `Potential contradictions detected between ${source1} and ${source2}`,
          });
        }

        return {
          detected: result.detected,
          claims: result.claims.map((c: Partial<ContradictoryClaim>) => ({
            claim1: c.claim1 ?? "",
            source1,
            claim2: c.claim2 ?? "",
            source2,
            contradictionType: c.contradictionType ?? "factual",
            severity: c.severity ?? "minor",
          })),
          confidence: result.confidence,
        };
      }
    } catch (error) {
      console.error("Error detecting contradictions:", error);
    }

    return { detected: false, claims: [], confidence: 0 };
  }

  /**
   * Classify the overall intent of the browsing session
   */
  async classifySessionIntent(): Promise<IntentCategory> {
    if (!this.currentSession || this.currentSession.urls.length < 2) {
      return "unknown";
    }

    const recentUrls = this.currentSession.urls.slice(-10);
    const urlSummary = recentUrls
      .map((u) => `${u.url} - ${u.title}`)
      .join("\n");

    const systemPrompt = `You are an expert at understanding browsing intent.
Based on the following browsing history, classify the primary intent.
Respond with ONLY one of: research, entertainment, problem_solving, shopping, communication, learning, news, navigation, unknown`;

    try {
      const response = await this.model.invoke([
        new SystemMessage(systemPrompt),
        new HumanMessage(urlSummary),
      ]);

      const intent = (response.content as string).trim().toLowerCase();
      const validIntents: IntentCategory[] = [
        "research", "entertainment", "problem_solving", "shopping",
        "communication", "learning", "news", "navigation", "unknown"
      ];

      if (validIntents.includes(intent as IntentCategory)) {
        return intent as IntentCategory;
      }
    } catch (error) {
      console.error("Error classifying intent:", error);
    }

    return "unknown";
  }

  /**
   * Detect behavioral patterns
   */
  async detectBehavioralPatterns(
    consent: ConsentState
  ): Promise<PatternDetectionResult> {
    if (!this.currentSession || !consent.browsingAnalysis) {
      return { patterns: [], recommendations: [] };
    }

    const patterns: DetectedPattern[] = [];
    const recommendations: string[] = [];

    // Check for research deep dive pattern
    if (this.isResearchDeepDive()) {
      patterns.push({
        type: "research_deep_dive",
        confidence: 0.8,
        description: "User is conducting in-depth research on a topic",
      });
      recommendations.push(
        "Consider saving key findings to your knowledge base"
      );
    }

    // Check for tab overload
    if (this.currentSession.tabSwitches > 20) {
      patterns.push({
        type: "tab_overload",
        confidence: 0.9,
        description: "High number of tab switches detected",
      });
      recommendations.push(
        "Consider organizing tabs into groups or saving some for later"
      );
    }

    // Check for repetitive searching
    if (this.hasRepetitiveSearches()) {
      patterns.push({
        type: "repetitive_searching",
        confidence: 0.75,
        description: "Similar searches being performed repeatedly",
      });
      recommendations.push(
        "Try refining your search terms or exploring related topics"
      );
    }

    return { patterns, recommendations };
  }

  /**
   * Update the knowledge graph with new content
   */
  private async updateKnowledgeGraph(
    url: string,
    content: string
  ): Promise<void> {
    try {
      const embeddingManager = getEmbeddingManager();
      const chunks = this.chunker.createSemanticChunks(content, "html", true);

      // Generate embeddings for chunks
      const embedResult = await embeddingManager.embedContent({
        content,
        contentType: "html",
      });

      // Build knowledge nodes
      const nodes = await this.knowledgeBuilder.buildNodes(
        embedResult.chunks,
        url
      );

      // Add to memory
      const memoryManager = getMemoryManager();
      for (const node of nodes) {
        memoryManager.addKnowledgeNode(node);
      }
    } catch (error) {
      console.error("Error updating knowledge graph:", error);
    }
  }

  /**
   * Get session summary
   */
  getSessionSummary(): SessionSummary | null {
    if (!this.currentSession) {
      return null;
    }

    const duration =
      (new Date().getTime() - this.currentSession.startTime.getTime()) / 1000;

    return {
      sessionId: this.currentSession.sessionId,
      duration,
      pagesVisited: this.currentSession.urls.length,
      primaryIntent: this.currentSession.currentIntent,
      categories: this.currentSession.contentCategories,
      tabSwitches: this.currentSession.tabSwitches,
      searchQueries: this.currentSession.searchQueries.length,
      scrollPatterns: summarizeScrollPatterns(this.currentSession.scrollPatterns),
    };
  }

  /**
   * End the current session
   */
  endSession(): SessionSummary | null {
    const summary = this.getSessionSummary();
    this.currentSession = null;
    return summary;
  }

  // -------------------------------------------------------------------------
  // Private Helper Methods
  // -------------------------------------------------------------------------

  private isResearchDeepDive(): boolean {
    if (!this.currentSession) return false;

    const recentUrls = this.currentSession.urls.slice(-5);
    if (recentUrls.length < 3) return false;

    // Check if URLs are on similar topics (same domain or related keywords)
    const domains = new Set(recentUrls.map((u) => new URL(u.url).hostname));
    return domains.size <= 2;
  }

  private hasRepetitiveSearches(): boolean {
    if (!this.currentSession) return false;

    const queries = this.currentSession.searchQueries;
    if (queries.length < 3) return false;

    // Check for similar queries
    for (let i = 0; i < queries.length - 1; i++) {
      for (let j = i + 1; j < queries.length; j++) {
        const q1 = queries[i]?.toLowerCase();
        const q2 = queries[j]?.toLowerCase();
        if (q1 && q2 && this.stringSimilarity(q1, q2) > 0.7) {
          return true;
        }
      }
    }
    return false;
  }

  private stringSimilarity(s1: string, s2: string): number {
    const words1 = new Set(s1.split(/\s+/));
    const words2 = new Set(s2.split(/\s+/));
    const intersection = new Set([...words1].filter((x) => words2.has(x)));
    const union = new Set([...words1, ...words2]);
    return intersection.size / union.size;
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

function inferCategoryFromDomain(domain: string): ContentCategory {
  const domainLower = domain.toLowerCase();

  if (/news|cnn|bbc|nytimes|reuters|wsj/i.test(domainLower)) return "news";
  if (/github|stackoverflow|dev\.to|medium/i.test(domainLower)) return "technology";
  if (/finance|bank|investing|trading/i.test(domainLower)) return "finance";
  if (/health|medical|webmd|mayoclinic/i.test(domainLower)) return "health";
  if (/youtube|netflix|twitch|spotify/i.test(domainLower)) return "entertainment";
  if (/espn|sports|nfl|nba/i.test(domainLower)) return "sports";
  if (/nature|science|arxiv|pubmed/i.test(domainLower)) return "science";
  if (/edu|coursera|udemy|khan/i.test(domainLower)) return "education";
  if (/amazon|ebay|shop|store/i.test(domainLower)) return "shopping";
  if (/facebook|twitter|instagram|linkedin/i.test(domainLower)) return "social";
  if (/\.gov/i.test(domainLower)) return "government";
  if (/wikipedia|wikihow|dictionary/i.test(domainLower)) return "reference";

  return "other";
}

function inferIntentFromURL(url: string): IntentCategory {
  const urlLower = url.toLowerCase();

  if (/search|query|q=/i.test(urlLower)) return "research";
  if (/buy|cart|checkout|order/i.test(urlLower)) return "shopping";
  if (/video|watch|stream|play/i.test(urlLower)) return "entertainment";
  if (/news|article|blog/i.test(urlLower)) return "news";
  if (/learn|course|tutorial|how-to/i.test(urlLower)) return "learning";
  if (/message|chat|mail|inbox/i.test(urlLower)) return "communication";
  if (/map|direction|route|navigate/i.test(urlLower)) return "navigation";
  if (/fix|solve|error|issue|problem/i.test(urlLower)) return "problem_solving";

  return "unknown";
}

function calculateTrustScore(domain: string): number {
  let score = 0.5; // Base score

  // Known trusted domains
  const trustedDomains = [
    "wikipedia.org", "github.com", "stackoverflow.com",
    "gov", "edu", "bbc.com", "nytimes.com", "reuters.com"
  ];
  if (trustedDomains.some((d) => domain.includes(d))) {
    score += 0.3;
  }

  // HTTPS is expected, but .gov and .edu get bonus
  if (domain.endsWith(".gov") || domain.endsWith(".edu")) {
    score += 0.1;
  }

  // Penalize suspicious patterns
  if (/\d{4,}/.test(domain) || domain.split(".").length > 4) {
    score -= 0.2;
  }

  return Math.max(0, Math.min(1, score));
}

function analyzeScrollEvents(events: ScrollEvent[]): ScrollPattern[] {
  const patterns: ScrollPattern[] = [];
  if (events.length < 2) return patterns;

  let currentPattern: Partial<ScrollPattern> | null = null;

  for (let i = 1; i < events.length; i++) {
    const prev = events[i - 1];
    const curr = events[i];

    if (!prev || !curr) continue;

    const timeDelta = curr.timestamp - prev.timestamp;
    const scrollDelta = curr.scrollTop - prev.scrollTop;
    const velocity = timeDelta > 0 ? Math.abs(scrollDelta) / timeDelta : 0;

    const patternType = classifyScrollPattern(velocity, scrollDelta, timeDelta);

    if (!currentPattern || currentPattern.type !== patternType) {
      // Save current pattern if exists
      if (currentPattern && currentPattern.startTime && currentPattern.type) {
        patterns.push(currentPattern as ScrollPattern);
      }

      // Start new pattern
      currentPattern = {
        type: patternType,
        startTime: new Date(prev.timestamp),
        duration: 0,
        velocity: 0,
        depth: curr.scrollTop / curr.scrollHeight,
      };
    }

    // Update current pattern
    if (currentPattern) {
      currentPattern.duration = (currentPattern.duration ?? 0) + timeDelta / 1000;
      currentPattern.velocity = velocity;
      currentPattern.depth = curr.scrollTop / curr.scrollHeight;
    }
  }

  // Save last pattern
  if (currentPattern && currentPattern.startTime && currentPattern.type) {
    patterns.push(currentPattern as ScrollPattern);
  }

  return patterns;
}

function classifyScrollPattern(
  velocity: number,
  scrollDelta: number,
  timeDelta: number
): ScrollPattern["type"] {
  if (timeDelta > 5000) return "idle";
  if (velocity > 500 && scrollDelta > 0) return "doomscrolling";
  if (velocity > 200) return "seeking";
  if (velocity > 50) return "scanning";
  return "reading";
}

function detectDoomscrolling(
  patterns: ScrollPattern[],
  sessionDuration: number
): DoomscrollingAlert | undefined {
  const doomscrollPatterns = patterns.filter((p) => p.type === "doomscrolling");
  const totalDoomscrollTime = doomscrollPatterns.reduce(
    (sum, p) => sum + p.duration,
    0
  );

  if (totalDoomscrollTime < 60) return undefined;

  let severity: DoomscrollingAlert["severity"] = "mild";
  if (totalDoomscrollTime > 300) severity = "severe";
  else if (totalDoomscrollTime > 120) severity = "moderate";

  return {
    detected: true,
    duration: totalDoomscrollTime,
    contentType: "social", // Default, could be improved
    severity,
    suggestion: getSuggestion(severity, totalDoomscrollTime),
  };
}

function getSuggestion(
  severity: DoomscrollingAlert["severity"],
  duration: number
): string {
  const minutes = Math.round(duration / 60);
  switch (severity) {
    case "mild":
      return `You've been scrolling for ${minutes} minutes. Consider taking a short break.`;
    case "moderate":
      return `Extended scrolling detected (${minutes} min). Time for a break?`;
    case "severe":
      return `You've been scrolling for over ${minutes} minutes. Taking a break would be beneficial.`;
  }
}

function calculateEngagementScore(patterns: ScrollPattern[]): number {
  if (patterns.length === 0) return 0;

  const weights = {
    reading: 1.0,
    scanning: 0.6,
    seeking: 0.4,
    doomscrolling: 0.1,
    idle: 0,
  };

  const totalDuration = patterns.reduce((sum, p) => sum + p.duration, 0);
  if (totalDuration === 0) return 0;

  const weightedSum = patterns.reduce(
    (sum, p) => sum + weights[p.type] * p.duration,
    0
  );

  return weightedSum / totalDuration;
}

function summarizeScrollPatterns(patterns: ScrollPattern[]): PatternSummary {
  const summary: PatternSummary = {
    totalPatterns: patterns.length,
    dominantPattern: "idle",
    averageVelocity: 0,
    maxDepth: 0,
  };

  if (patterns.length === 0) return summary;

  // Find dominant pattern
  const patternCounts = new Map<string, number>();
  let totalVelocity = 0;

  for (const pattern of patterns) {
    patternCounts.set(
      pattern.type,
      (patternCounts.get(pattern.type) ?? 0) + pattern.duration
    );
    totalVelocity += pattern.velocity;
    summary.maxDepth = Math.max(summary.maxDepth, pattern.depth);
  }

  let maxDuration = 0;
  for (const [type, duration] of patternCounts) {
    if (duration > maxDuration) {
      maxDuration = duration;
      summary.dominantPattern = type as ScrollPattern["type"];
    }
  }

  summary.averageVelocity = totalVelocity / patterns.length;

  return summary;
}

// ============================================================================
// Types
// ============================================================================

interface DetectedPattern {
  type: string;
  confidence: number;
  description: string;
}

interface PatternDetectionResult {
  patterns: DetectedPattern[];
  recommendations: string[];
}

interface SessionSummary {
  sessionId: string;
  duration: number;
  pagesVisited: number;
  primaryIntent: IntentCategory;
  categories: ContentCategory[];
  tabSwitches: number;
  searchQueries: number;
  scrollPatterns: PatternSummary;
}

interface PatternSummary {
  totalPatterns: number;
  dominantPattern: ScrollPattern["type"];
  averageVelocity: number;
  maxDepth: number;
}

// ============================================================================
// Export Tools for LangGraph
// ============================================================================

export const browserTools = [
  urlAnalysisTool,
  contentEmbeddingTool,
  scrollPatternTool,
];

export { urlAnalysisTool, contentEmbeddingTool, scrollPatternTool };
