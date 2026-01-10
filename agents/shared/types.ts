/**
 * Shared TypeScript interfaces for Orion Browser AI Agents
 */

import { z } from "zod";

// ============================================================================
// Consent & Privacy Types
// ============================================================================

export const ConsentLevelSchema = z.enum([
  "none",           // No AI processing
  "minimal",        // Basic functionality only
  "standard",       // Standard AI features
  "enhanced",       // Enhanced AI with cross-session learning
  "full"            // Full AI capabilities including voice
]);

export type ConsentLevel = z.infer<typeof ConsentLevelSchema>;

export interface ConsentState {
  level: ConsentLevel;
  browsingAnalysis: boolean;
  voiceProcessing: boolean;
  crossSessionLearning: boolean;
  dataExport: boolean;
  thirdPartySharing: boolean;
  lastUpdated: Date;
  version: string;
}

export interface PrivacyContext {
  isPrivateBrowsing: boolean;
  sensitiveContentDetected: boolean;
  complianceFlags: ComplianceFlags;
}

export interface ComplianceFlags {
  gdprApplicable: boolean;
  ccpaApplicable: boolean;
  coppaApplicable: boolean;
  hipaaRelevant: boolean;
  appStoreCompliant: boolean;
}

// ============================================================================
// System Resource Types
// ============================================================================

export interface SystemResources {
  batteryLevel: number;        // 0-100
  batteryCharging: boolean;
  networkType: NetworkType;
  cpuUsage: number;            // 0-100
  memoryUsage: number;         // 0-100
  thermalState: ThermalState;
}

export type NetworkType = "wifi" | "cellular" | "ethernet" | "none";
export type ThermalState = "nominal" | "fair" | "serious" | "critical";

export interface IntelligenceThrottling {
  maxTokensPerRequest: number;
  embeddingEnabled: boolean;
  voiceProcessingEnabled: boolean;
  backgroundProcessingEnabled: boolean;
  updateFrequency: "realtime" | "batched" | "minimal";
}

// ============================================================================
// User Intelligence Profile
// ============================================================================

export interface UserIntelligenceProfile {
  userId: string;
  interests: InterestNode[];
  browsingPatterns: BrowsingPattern[];
  cognitiveProfile: CognitiveProfile;
  knowledgeGraph: KnowledgeGraphNode[];
  lastUpdated: Date;
}

export interface InterestNode {
  topic: string;
  category: ContentCategory;
  confidence: number;
  frequency: number;
  lastSeen: Date;
  relatedTopics: string[];
}

export interface BrowsingPattern {
  patternType: PatternType;
  timeOfDay: number[];      // Hours when pattern occurs
  dayOfWeek: number[];      // Days when pattern occurs
  averageDuration: number;  // In seconds
  frequency: number;
}

export type PatternType =
  | "research_deep_dive"
  | "quick_lookup"
  | "entertainment_binge"
  | "news_consumption"
  | "social_browsing"
  | "shopping"
  | "learning"
  | "problem_solving";

export interface CognitiveProfile {
  preferredContentLength: "short" | "medium" | "long";
  readingSpeed: number;       // Words per minute
  attentionSpan: number;      // Estimated seconds
  multitaskingTendency: number; // 0-1
  questionAskingFrequency: number;
  contradictionSensitivity: number;
}

export interface KnowledgeGraphNode {
  id: string;
  concept: string;
  category: string;
  connections: KnowledgeConnection[];
  confidence: number;
  sources: string[];
  createdAt: Date;
  lastAccessed: Date;
}

export interface KnowledgeConnection {
  targetId: string;
  relationshipType: string;
  strength: number;
}

// ============================================================================
// Browser Intelligence Types
// ============================================================================

export const IntentCategorySchema = z.enum([
  "research",
  "entertainment",
  "problem_solving",
  "shopping",
  "communication",
  "learning",
  "news",
  "navigation",
  "unknown"
]);

export type IntentCategory = z.infer<typeof IntentCategorySchema>;

export const ContentCategorySchema = z.enum([
  "news",
  "technology",
  "finance",
  "health",
  "entertainment",
  "sports",
  "science",
  "education",
  "shopping",
  "social",
  "government",
  "reference",
  "other"
]);

export type ContentCategory = z.infer<typeof ContentCategorySchema>;

export interface BrowsingSession {
  sessionId: string;
  startTime: Date;
  urls: URLVisit[];
  currentIntent: IntentCategory;
  contentCategories: ContentCategory[];
  scrollPatterns: ScrollPattern[];
  tabSwitches: number;
  searchQueries: string[];
}

export interface URLVisit {
  url: string;
  title: string;
  timestamp: Date;
  duration: number;
  scrollDepth: number;
  engagement: EngagementMetrics;
}

export interface EngagementMetrics {
  timeOnPage: number;
  scrollDepth: number;
  interactions: number;
  readingTime: number;
  bounced: boolean;
}

export interface ScrollPattern {
  type: ScrollPatternType;
  startTime: Date;
  duration: number;
  velocity: number;
  depth: number;
}

export type ScrollPatternType =
  | "reading"
  | "scanning"
  | "seeking"
  | "doomscrolling"
  | "idle";

export interface DoomscrollingAlert {
  detected: boolean;
  duration: number;
  contentType: ContentCategory;
  severity: "mild" | "moderate" | "severe";
  suggestion: string;
}

export interface ContradictionDetection {
  detected: boolean;
  claims: ContradictoryClaim[];
  confidence: number;
}

export interface ContradictoryClaim {
  claim1: string;
  source1: string;
  claim2: string;
  source2: string;
  contradictionType: string;
  severity: "minor" | "significant" | "major";
}

// ============================================================================
// Voice Intelligence Types
// ============================================================================

export interface VoiceSession {
  sessionId: string;
  startTime: Date;
  transcriptions: TranscriptionSegment[];
  overallSentiment: SentimentScore;
  intents: VoiceIntent[];
  cognitiveState: CognitiveState;
}

export interface TranscriptionSegment {
  id: string;
  text: string;
  startTime: number;
  endTime: number;
  confidence: number;
  speaker?: string;
  emotion: EmotionLabel;
  semanticChunk?: SemanticChunk;
}

export interface SemanticChunk {
  id: string;
  text: string;
  topic: string;
  intent: string;
  entities: NamedEntity[];
  embedding?: number[];
}

export interface NamedEntity {
  text: string;
  type: EntityType;
  confidence: number;
  startIndex: number;
  endIndex: number;
}

export type EntityType =
  | "person"
  | "organization"
  | "location"
  | "date"
  | "time"
  | "money"
  | "product"
  | "event"
  | "concept";

export interface SentimentScore {
  positive: number;
  negative: number;
  neutral: number;
  compound: number;
}

export type EmotionLabel =
  | "neutral"
  | "happy"
  | "sad"
  | "angry"
  | "fearful"
  | "surprised"
  | "disgusted"
  | "confused"
  | "curious"
  | "frustrated";

export interface VoiceIntent {
  type: VoiceIntentType;
  confidence: number;
  parameters: Record<string, unknown>;
  timestamp: Date;
}

export type VoiceIntentType =
  | "question"
  | "command"
  | "statement"
  | "clarification"
  | "confirmation"
  | "rejection"
  | "navigation"
  | "search"
  | "dictation";

export interface CognitiveState {
  cognitiveLoad: number;        // 0-1
  frustrationLevel: number;     // 0-1
  engagementLevel: number;      // 0-1
  questionFrequency: number;
  frictionPoints: FrictionPoint[];
}

export interface FrictionPoint {
  type: FrictionType;
  context: string;
  timestamp: Date;
  resolution?: string;
}

export type FrictionType =
  | "repeated_question"
  | "voice_command_failure"
  | "confusion_indicator"
  | "frustration_expression"
  | "navigation_difficulty"
  | "comprehension_issue";

// ============================================================================
// Data Export Types
// ============================================================================

export interface ExportPayload {
  version: string;
  schemaVersion: string;
  exportedAt: Date;
  userId: string;
  consentScope: ConsentLevel;
  dataTypes: ExportDataType[];
  encryption: EncryptionMetadata;
  checksum: string;
}

export type ExportDataType =
  | "embeddings"
  | "summaries"
  | "knowledge_graph"
  | "intent_timeline"
  | "behavioral_patterns"
  | "voice_transcripts"
  | "preferences";

export interface EncryptionMetadata {
  algorithm: string;
  keyId: string;
  iv?: string;
  authTag?: string;
}

export interface AuditLogEntry {
  id: string;
  timestamp: Date;
  action: AuditAction;
  agentId: string;
  userId: string;
  details: Record<string, unknown>;
  outcome: "success" | "failure" | "partial";
}

export type AuditAction =
  | "data_access"
  | "data_export"
  | "consent_change"
  | "kill_switch_activated"
  | "emergency_suppression"
  | "agent_invoked"
  | "intelligence_throttled";

// ============================================================================
// Orchestrator State Types
// ============================================================================

export interface OrchestratorState {
  sessionId: string;
  userId: string;
  consent: ConsentState;
  privacy: PrivacyContext;
  resources: SystemResources;
  throttling: IntelligenceThrottling;
  userProfile: UserIntelligenceProfile;
  currentAgent: AgentType | null;
  agentHistory: AgentInvocation[];
  sharedMemory: SharedMemory;
  killSwitchActive: boolean;
  emergencySuppressionActive: boolean;
  errors: AgentError[];
}

export type AgentType = "browser" | "voice" | "export" | "orchestrator";

export interface AgentInvocation {
  agent: AgentType;
  timestamp: Date;
  duration: number;
  input: Record<string, unknown>;
  output: Record<string, unknown>;
  success: boolean;
}

export interface SharedMemory {
  shortTerm: Map<string, unknown>;
  contextWindow: unknown[];
  crossAgentData: CrossAgentData;
}

export interface CrossAgentData {
  lastBrowsingContext?: BrowsingSession;
  lastVoiceContext?: VoiceSession;
  pendingExports: ExportPayload[];
  activeAlerts: Alert[];
}

export interface Alert {
  id: string;
  type: AlertType;
  severity: "info" | "warning" | "critical";
  message: string;
  timestamp: Date;
  dismissed: boolean;
}

export type AlertType =
  | "doomscrolling"
  | "privacy_concern"
  | "resource_constraint"
  | "compliance_issue"
  | "contradiction_detected"
  | "cognitive_overload";

export interface AgentError {
  agent: AgentType;
  timestamp: Date;
  code: string;
  message: string;
  recoverable: boolean;
}

// ============================================================================
// Tool Input/Output Types
// ============================================================================

export interface URLAnalysisInput {
  url: string;
  includeContent: boolean;
  maxContentLength?: number;
}

export interface URLAnalysisOutput {
  url: string;
  domain: string;
  category: ContentCategory;
  intent: IntentCategory;
  isSensitive: boolean;
  trustScore: number;
  summary?: string;
}

export interface ContentEmbeddingInput {
  content: string;
  contentType: "text" | "html" | "markdown";
  chunkSize?: number;
}

export interface ContentEmbeddingOutput {
  chunks: SemanticChunk[];
  totalTokens: number;
}

export interface ScrollPatternInput {
  events: ScrollEvent[];
  sessionDuration: number;
}

export interface ScrollEvent {
  timestamp: number;
  scrollTop: number;
  scrollHeight: number;
  viewportHeight: number;
}

export interface ScrollPatternOutput {
  patterns: ScrollPattern[];
  doomscrollingAlert?: DoomscrollingAlert;
  engagementScore: number;
}

export interface AudioProcessingInput {
  audioData: ArrayBuffer | string;  // Base64 or binary
  sampleRate: number;
  channels: number;
  format: "wav" | "mp3" | "m4a" | "webm";
}

export interface AudioProcessingOutput {
  transcription: TranscriptionSegment[];
  totalDuration: number;
  audioQuality: "low" | "medium" | "high";
}

export interface SentimentAnalysisInput {
  text: string;
  includeEmotions: boolean;
}

export interface SentimentAnalysisOutput {
  sentiment: SentimentScore;
  emotions: EmotionLabel[];
  confidence: number;
}

export interface IntentExtractionInput {
  text: string;
  context?: string;
}

export interface IntentExtractionOutput {
  primaryIntent: VoiceIntent;
  secondaryIntents: VoiceIntent[];
  entities: NamedEntity[];
}

// ============================================================================
// Voice Privacy Types
// ============================================================================

export type VoiceCaptureMode = "wake_word" | "manual" | "continuous";

export type SensitiveDataType =
  | "phone_number"
  | "email_address"
  | "credit_card"
  | "ssn"
  | "medical_term"
  | "financial_amount"
  | "address"
  | "name";

export interface RedactionPattern {
  type: SensitiveDataType;
  pattern: RegExp;
  replacement: string;
  enabled: boolean;
}

export interface RedactionResult {
  originalText: string;
  redactedText: string;
  redactions: RedactionMatch[];
  redactionCount: number;
}

export interface RedactionMatch {
  type: SensitiveDataType;
  originalValue: string;
  startIndex: number;
  endIndex: number;
  replacement: string;
}

export interface VoicePrivacyConfig {
  captureMode: VoiceCaptureMode;
  wakeWord: string;
  sessionScopedMemory: boolean;
  autoDeleteOnSessionEnd: boolean;
  redactionEnabled: boolean;
  enabledRedactionTypes: SensitiveDataType[];
  medicalTermsList: string[];
}

export interface MicPermissionState {
  granted: boolean;
  explicitlyRequested: boolean;
  lastRequestTime: Date | null;
  deniedCount: number;
}

export interface RecordingIndicatorState {
  isRecording: boolean;
  recordingStartTime: Date | null;
  userInitiated: boolean;
  indicatorVisible: boolean;
}

export interface AppStoreSafetyState {
  micPermission: MicPermissionState;
  recordingIndicator: RecordingIndicatorState;
  backgroundAudioDisabled: boolean;
  userInitiatedSessionOnly: boolean;
}

// ============================================================================
// Emotional Trajectory Types
// ============================================================================

export interface EmotionalDataPoint {
  timestamp: Date;
  emotion: EmotionLabel;
  intensity: number;  // 0-1
  confidence: number; // 0-1
  trigger?: string;
  context?: string;
}

export interface EmotionalTrajectory {
  sessionId: string;
  startTime: Date;
  dataPoints: EmotionalDataPoint[];
  overallTrend: EmotionalTrend;
  volatility: number;  // 0-1, how much emotion changes
  dominantEmotion: EmotionLabel;
}

export type EmotionalTrend = "improving" | "declining" | "stable" | "volatile";

export interface DecisionConfidenceMarker {
  timestamp: Date;
  utterance: string;
  confidenceLevel: "high" | "medium" | "low" | "uncertain";
  indicators: UncertaintyIndicator[];
}

export type UncertaintyIndicator =
  | "hedging_language"
  | "questioning_tone"
  | "hesitation_words"
  | "self_correction"
  | "seeking_confirmation"
  | "filler_words";

export interface CognitiveFrictionImprovement {
  originalFriction: FrictionPoint;
  enhancedAnalysis: {
    severity: "low" | "medium" | "high" | "critical";
    category: CognitiveFrictionCategory;
    suggestedIntervention: string;
    relatedEmotions: EmotionLabel[];
  };
}

export type CognitiveFrictionCategory =
  | "information_overload"
  | "unclear_navigation"
  | "feature_discovery"
  | "error_recovery"
  | "task_complexity"
  | "memory_burden";

export interface QuestionAnalysisResult {
  questionType: QuestionType;
  intent: string;
  urgency: "low" | "medium" | "high";
  requiresFollowUp: boolean;
  relatedTopics: string[];
}

export type QuestionType =
  | "clarification"
  | "information_seeking"
  | "confirmation"
  | "procedural"
  | "rhetorical"
  | "comparative";

export interface EmotionalSessionSummary {
  sessionId: string;
  duration: number;
  emotionalJourney: EmotionalDataPoint[];
  keyEmotionalMoments: EmotionalDataPoint[];
  triggers: EmotionalTrigger[];
  overallSentiment: SentimentScore;
  recommendedFollowUp: string[];
}

export interface EmotionalTrigger {
  timestamp: Date;
  triggerType: "positive" | "negative" | "neutral";
  description: string;
  associatedEmotion: EmotionLabel;
  context: string;
}

// ============================================================================
// Voice Intent Memory Types
// ============================================================================

export interface StoredVoiceIntent {
  id: string;
  intent: VoiceIntent;
  utterance: string;
  sessionId: string;
  timestamp: Date;
  successfulExecution: boolean;
  executionResult?: string;
  forgettingScore: number;  // 0-1, higher = more likely to forget
}

export interface VoiceCommandPattern {
  id: string;
  pattern: string;
  intentType: VoiceIntentType;
  frequency: number;
  successRate: number;
  lastUsed: Date;
  firstUsed: Date;
  variations: string[];
}

export interface UserVoiceInteractionStyle {
  preferredCommandLength: "short" | "medium" | "verbose";
  usesNaturalLanguage: boolean;
  preferredWakeWord: string;
  commonPhrases: string[];
  averageUtteranceLength: number;
  prefersTerse: boolean;
  usesPoliteLanguage: boolean;
}

export interface IntentHistoryEntry {
  id: string;
  intent: VoiceIntent;
  createdAt: Date;
  lastAccessed: Date;
  accessCount: number;
  forgettingCurve: ForgettingCurveData;
}

export interface ForgettingCurveData {
  initialStrength: number;
  currentStrength: number;
  decayRate: number;
  reinforcements: Date[];
  nextReviewOptimal: Date;
}

export interface VoiceIntentMemoryConfig {
  maxStoredIntents: number;
  forgettingCurveEnabled: boolean;
  patternRecognitionEnabled: boolean;
  styleLearnEnabled: boolean;
  retentionDays: number;
}

// ============================================================================
// Conversation Intelligence Types
// ============================================================================

export interface ConversationTurn {
  id: string;
  speaker: "user" | "system";
  utterance: string;
  timestamp: Date;
  intent?: VoiceIntent;
  emotion?: EmotionLabel;
  entities: NamedEntity[];
}

export interface MultiTurnConversation {
  conversationId: string;
  sessionId: string;
  turns: ConversationTurn[];
  startTime: Date;
  endTime?: Date;
  topic: string;
  subTopics: string[];
  resolved: boolean;
}

export interface ConversationContext {
  currentTopic: string;
  mentionedEntities: NamedEntity[];
  unresolvedQuestions: string[];
  pendingActions: string[];
  previousTopics: string[];
  carryoverFromLastSession: boolean;
}

export interface ConversationSummary {
  conversationId: string;
  summary: string;
  keyPoints: string[];
  decisions: DecisionPoint[];
  actionItems: string[];
  unresolvedIssues: string[];
  participants: string[];
  duration: number;
}

export interface DecisionPoint {
  timestamp: Date;
  decision: string;
  context: string;
  confidence: number;
  alternatives: string[];
  outcome?: string;
}

export interface SessionContextCarryover {
  lastSessionId: string;
  lastSessionEndTime: Date;
  unresolvedTopics: string[];
  pendingQuestions: string[];
  userPreferences: Record<string, unknown>;
  relevantEntities: NamedEntity[];
}

// ============================================================================
// Voice Tool Input/Output Types
// ============================================================================

export interface RedactionFilterInput {
  text: string;
  redactionTypes?: SensitiveDataType[];
  customPatterns?: Array<{ pattern: string; replacement: string }>;
}

export interface RedactionFilterOutput {
  result: RedactionResult;
  processingTime: number;
}

export interface EmotionalTrajectoryInput {
  sessionId: string;
  includeDetails: boolean;
}

export interface EmotionalTrajectoryOutput {
  trajectory: EmotionalTrajectory;
  summary: EmotionalSessionSummary;
  decisionMarkers: DecisionConfidenceMarker[];
  frictionPoints: CognitiveFrictionImprovement[];
}

export interface VoiceIntentMemoryInput {
  action: "store" | "retrieve" | "analyze_patterns" | "get_style";
  intent?: VoiceIntent;
  utterance?: string;
  sessionId?: string;
  limit?: number;
}

export interface VoiceIntentMemoryOutput {
  success: boolean;
  storedIntents?: StoredVoiceIntent[];
  patterns?: VoiceCommandPattern[];
  interactionStyle?: UserVoiceInteractionStyle;
  message?: string;
}

export interface ConversationSummaryInput {
  conversationId?: string;
  sessionId?: string;
  includeDecisions: boolean;
  includeActionItems: boolean;
}

export interface ConversationSummaryOutput {
  summary: ConversationSummary;
  contextCarryover: SessionContextCarryover;
}
