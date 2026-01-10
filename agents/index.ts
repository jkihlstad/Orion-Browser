/**
 * Orion Browser AI Agents
 * LangGraph-based orchestration system for AI-powered iOS browser
 *
 * @module orion-browser-agents
 */

// ============================================================================
// Graph and Runner Exports
// ============================================================================

export {
  buildOrionGraph,
  OrionGraphRunner,
  createOrionRunner,
  createDevRunner,
  GraphState,
  type GraphStateType,
  type RequestContext,
} from "./graph.js";

// ============================================================================
// Orchestrator Exports
// ============================================================================

export {
  OrchestratorAgent,
  createOrchestrator,
  getOrchestratorInstance,
  resetOrchestrator,
  ConsentManager,
  orchestratorTools,
  killSwitchTool,
  emergencySuppressionTool,
  routeToAgentTool,
  type OrchestratorConfig,
  type ConsentStateType,
  type ConsentStateMachine,
} from "./orchestrator/index.js";

// ============================================================================
// Browser Agent Exports
// ============================================================================

export {
  BrowserIntelligenceAgent,
  browserTools,
  urlAnalysisTool,
  contentEmbeddingTool,
  scrollPatternTool,
  type BrowserAgentConfig,
} from "./browser/index.js";

// ============================================================================
// Voice Agent Exports
// ============================================================================

export {
  VoiceIntelligenceAgent,
  voiceTools,
  audioProcessingTool,
  sentimentAnalysisTool,
  intentExtractionTool,
  type VoiceAgentConfig,
} from "./voice/index.js";

// ============================================================================
// Export Agent Exports
// ============================================================================

export {
  DataExportAgent,
  getExportAgent,
  resetExportAgent,
  EncryptionKeyManager,
  exportTools,
  generateExportTool,
  verifyExportTool,
  getAuditLogTool,
  type ExportAgentConfig,
} from "./export/index.js";

// ============================================================================
// Shared Utilities Exports
// ============================================================================

export {
  // Memory
  CrossAgentMemoryManager,
  getMemoryManager,
  resetMemoryManager,

  // Compliance
  ComplianceChecker,
  getComplianceChecker,
  IntelligenceThrottler,
  getIntelligenceThrottler,
  type ComplianceResult,
  type ComplianceIssue,
  type GDPRComplianceResult,
  type CCPAComplianceResult,
  type ThrottlingConfig,

  // Embedding
  EmbeddingManager,
  getEmbeddingManager,
  resetEmbeddingManager,
  SemanticChunker,
  KnowledgeGraphBuilder,
  type EmbeddingConfig,
} from "./shared/index.js";

// ============================================================================
// Type Exports
// ============================================================================

export type {
  // Consent & Privacy
  ConsentLevel,
  ConsentState,
  PrivacyContext,
  ComplianceFlags,

  // System Resources
  SystemResources,
  NetworkType,
  ThermalState,
  IntelligenceThrottling,

  // User Profile
  UserIntelligenceProfile,
  InterestNode,
  BrowsingPattern,
  PatternType,
  CognitiveProfile,
  KnowledgeGraphNode,
  KnowledgeConnection,

  // Browser Intelligence
  IntentCategory,
  ContentCategory,
  BrowsingSession,
  URLVisit,
  EngagementMetrics,
  ScrollPattern,
  ScrollPatternType,
  DoomscrollingAlert,
  ContradictionDetection,
  ContradictoryClaim,

  // Voice Intelligence
  VoiceSession,
  TranscriptionSegment,
  SemanticChunk,
  NamedEntity,
  EntityType,
  SentimentScore,
  EmotionLabel,
  VoiceIntent,
  VoiceIntentType,
  CognitiveState,
  FrictionPoint,
  FrictionType,

  // Data Export
  ExportPayload,
  ExportDataType,
  EncryptionMetadata,
  AuditLogEntry,
  AuditAction,

  // Orchestrator State
  OrchestratorState,
  AgentType,
  AgentInvocation,
  SharedMemory,
  CrossAgentData,
  Alert,
  AlertType,
  AgentError,

  // Tool Types
  URLAnalysisInput,
  URLAnalysisOutput,
  ContentEmbeddingInput,
  ContentEmbeddingOutput,
  ScrollPatternInput,
  ScrollPatternOutput,
  ScrollEvent,
  AudioProcessingInput,
  AudioProcessingOutput,
  SentimentAnalysisInput,
  SentimentAnalysisOutput,
  IntentExtractionInput,
  IntentExtractionOutput,
} from "./shared/types.js";
