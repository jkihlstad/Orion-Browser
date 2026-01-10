/**
 * Orchestration Agent for Orion Browser
 * LangGraph supervisor that coordinates all sub-agents with privacy-first routing
 */

import { ChatOpenAI } from "@langchain/openai";
import { HumanMessage, SystemMessage, AIMessage, BaseMessage } from "@langchain/core/messages";
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";

import type {
  OrchestratorState,
  ConsentState,
  ConsentLevel,
  PrivacyContext,
  SystemResources,
  IntelligenceThrottling,
  UserIntelligenceProfile,
  AgentType,
  AgentInvocation,
  AgentError,
  SharedMemory,
  Alert,
  BrowsingSession,
  VoiceSession,
} from "../shared/types.js";

import { getMemoryManager, CrossAgentMemoryManager } from "../shared/memory.js";
import {
  getComplianceChecker,
  getIntelligenceThrottler,
  ComplianceChecker,
  IntelligenceThrottler,
} from "../shared/compliance.js";

import { BrowserIntelligenceAgent, browserTools } from "../browser/index.js";
import { VoiceIntelligenceAgent, voiceTools } from "../voice/index.js";
import { DataExportAgent, getExportAgent, exportTools } from "../export/index.js";

// ============================================================================
// Orchestrator Configuration
// ============================================================================

export interface OrchestratorConfig {
  modelName: string;
  temperature: number;
  maxTokens: number;
  enableKillSwitch: boolean;
  enableEmergencySuppression: boolean;
  maxAgentRetries: number;
  agentTimeoutMs: number;
}

const DEFAULT_CONFIG: OrchestratorConfig = {
  modelName: "gpt-4o",
  temperature: 0.2,
  maxTokens: 4096,
  enableKillSwitch: true,
  enableEmergencySuppression: true,
  maxAgentRetries: 3,
  agentTimeoutMs: 30000,
};

// ============================================================================
// Consent State Machine
// ============================================================================

export type ConsentStateType =
  | "uninitialized"
  | "pending_consent"
  | "consent_granted"
  | "consent_denied"
  | "consent_revoked"
  | "consent_expired";

export interface ConsentStateMachine {
  currentState: ConsentStateType;
  consent: ConsentState | null;
  transitions: ConsentTransition[];
}

interface ConsentTransition {
  from: ConsentStateType;
  to: ConsentStateType;
  trigger: string;
  timestamp: Date;
}

export class ConsentManager {
  private state: ConsentStateMachine;
  private readonly validTransitions: Map<ConsentStateType, ConsentStateType[]>;

  constructor() {
    this.state = {
      currentState: "uninitialized",
      consent: null,
      transitions: [],
    };

    this.validTransitions = new Map([
      ["uninitialized", ["pending_consent"]],
      ["pending_consent", ["consent_granted", "consent_denied"]],
      ["consent_granted", ["consent_revoked", "consent_expired", "consent_granted"]],
      ["consent_denied", ["pending_consent"]],
      ["consent_revoked", ["pending_consent"]],
      ["consent_expired", ["pending_consent"]],
    ]);
  }

  /**
   * Transition to a new consent state
   */
  transition(to: ConsentStateType, trigger: string): boolean {
    const validTargets = this.validTransitions.get(this.state.currentState);
    if (!validTargets?.includes(to)) {
      console.error(
        `Invalid consent transition from ${this.state.currentState} to ${to}`
      );
      return false;
    }

    this.state.transitions.push({
      from: this.state.currentState,
      to,
      trigger,
      timestamp: new Date(),
    });

    this.state.currentState = to;
    return true;
  }

  /**
   * Set consent details
   */
  setConsent(consent: ConsentState): void {
    this.state.consent = consent;
    if (consent.level !== "none") {
      this.transition("consent_granted", "user_consent_provided");
    } else {
      this.transition("consent_denied", "user_declined_consent");
    }
  }

  /**
   * Revoke consent
   */
  revokeConsent(): void {
    if (this.state.consent) {
      this.state.consent.level = "none";
      this.state.consent.lastUpdated = new Date();
    }
    this.transition("consent_revoked", "user_revoked_consent");
  }

  /**
   * Check if consent is valid for an operation
   */
  isValidForOperation(requiredLevel: ConsentLevel): boolean {
    if (this.state.currentState !== "consent_granted") {
      return false;
    }

    if (!this.state.consent) {
      return false;
    }

    const levels: ConsentLevel[] = ["none", "minimal", "standard", "enhanced", "full"];
    const currentIndex = levels.indexOf(this.state.consent.level);
    const requiredIndex = levels.indexOf(requiredLevel);

    return currentIndex >= requiredIndex;
  }

  /**
   * Get current consent state
   */
  getState(): ConsentStateMachine {
    return { ...this.state };
  }

  /**
   * Get consent details
   */
  getConsent(): ConsentState | null {
    return this.state.consent;
  }
}

// ============================================================================
// Orchestrator Tools
// ============================================================================

/**
 * Kill Switch Tool - Immediately stops all AI processing
 */
const killSwitchTool = tool(
  async (input: { reason: string }): Promise<{ activated: boolean; message: string }> => {
    const orchestrator = getOrchestratorInstance();
    if (orchestrator) {
      orchestrator.activateKillSwitch(input.reason);
      return {
        activated: true,
        message: `Kill switch activated: ${input.reason}`,
      };
    }
    return {
      activated: false,
      message: "Orchestrator not initialized",
    };
  },
  {
    name: "kill_switch",
    description: "Immediately stops all AI processing",
    schema: z.object({
      reason: z.string().describe("Reason for activating kill switch"),
    }),
  }
);

/**
 * Emergency Suppression Tool - Clears all sensitive data
 */
const emergencySuppressionTool = tool(
  async (input: { userId: string }): Promise<{ success: boolean; message: string }> => {
    const orchestrator = getOrchestratorInstance();
    if (orchestrator) {
      orchestrator.activateEmergencySuppression(input.userId);
      return {
        success: true,
        message: "Emergency data suppression completed",
      };
    }
    return {
      success: false,
      message: "Orchestrator not initialized",
    };
  },
  {
    name: "emergency_suppression",
    description: "Clears all sensitive data from memory",
    schema: z.object({
      userId: z.string().describe("User ID for data suppression"),
    }),
  }
);

/**
 * Route to Agent Tool - Routes a request to the appropriate agent
 */
const routeToAgentTool = tool(
  async (input: {
    agent: AgentType;
    action: string;
    payload: string;
  }): Promise<{ success: boolean; result: unknown }> => {
    const orchestrator = getOrchestratorInstance();
    if (!orchestrator) {
      return { success: false, result: "Orchestrator not initialized" };
    }

    try {
      const result = await orchestrator.routeToAgent(
        input.agent,
        input.action,
        JSON.parse(input.payload)
      );
      return { success: true, result };
    } catch (error) {
      return {
        success: false,
        result: error instanceof Error ? error.message : "Unknown error",
      };
    }
  },
  {
    name: "route_to_agent",
    description: "Routes a request to a specific agent for processing",
    schema: z.object({
      agent: z.enum(["browser", "voice", "export"]).describe("Target agent"),
      action: z.string().describe("Action to perform"),
      payload: z.string().describe("JSON payload for the action"),
    }),
  }
);

// ============================================================================
// Main Orchestrator Agent
// ============================================================================

export class OrchestratorAgent {
  private model: ChatOpenAI;
  private config: OrchestratorConfig;
  private state: OrchestratorState;
  private consentManager: ConsentManager;
  private memoryManager: CrossAgentMemoryManager;
  private complianceChecker: ComplianceChecker;
  private throttler: IntelligenceThrottler;

  // Sub-agents
  private browserAgent: BrowserIntelligenceAgent;
  private voiceAgent: VoiceIntelligenceAgent;
  private exportAgent: DataExportAgent;

  constructor(
    userId: string,
    config: Partial<OrchestratorConfig> = {}
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };

    this.model = new ChatOpenAI({
      modelName: this.config.modelName,
      temperature: this.config.temperature,
      maxTokens: this.config.maxTokens,
    });

    this.consentManager = new ConsentManager();
    this.memoryManager = getMemoryManager();
    this.complianceChecker = getComplianceChecker();
    this.throttler = getIntelligenceThrottler();

    // Initialize sub-agents
    this.browserAgent = new BrowserIntelligenceAgent();
    this.voiceAgent = new VoiceIntelligenceAgent();
    this.exportAgent = getExportAgent();

    // Initialize state
    this.state = this.initializeState(userId);

    // Set as singleton
    setOrchestratorInstance(this);
  }

  /**
   * Initialize orchestrator state
   */
  private initializeState(userId: string): OrchestratorState {
    return {
      sessionId: uuidv4(),
      userId,
      consent: {
        level: "none",
        browsingAnalysis: false,
        voiceProcessing: false,
        crossSessionLearning: false,
        dataExport: false,
        thirdPartySharing: false,
        lastUpdated: new Date(),
        version: "1.0",
      },
      privacy: {
        isPrivateBrowsing: false,
        sensitiveContentDetected: false,
        complianceFlags: {
          gdprApplicable: false,
          ccpaApplicable: false,
          coppaApplicable: false,
          hipaaRelevant: false,
          appStoreCompliant: true,
        },
      },
      resources: {
        batteryLevel: 100,
        batteryCharging: true,
        networkType: "wifi",
        cpuUsage: 20,
        memoryUsage: 30,
        thermalState: "nominal",
      },
      throttling: {
        maxTokensPerRequest: 4096,
        embeddingEnabled: true,
        voiceProcessingEnabled: true,
        backgroundProcessingEnabled: true,
        updateFrequency: "realtime",
      },
      userProfile: {
        userId,
        interests: [],
        browsingPatterns: [],
        cognitiveProfile: {
          preferredContentLength: "medium",
          readingSpeed: 250,
          attentionSpan: 300,
          multitaskingTendency: 0.5,
          questionAskingFrequency: 0.3,
          contradictionSensitivity: 0.5,
        },
        knowledgeGraph: [],
        lastUpdated: new Date(),
      },
      currentAgent: null,
      agentHistory: [],
      sharedMemory: {
        shortTerm: new Map(),
        contextWindow: [],
        crossAgentData: {
          pendingExports: [],
          activeAlerts: [],
        },
      },
      killSwitchActive: false,
      emergencySuppressionActive: false,
      errors: [],
    };
  }

  /**
   * Update consent settings
   */
  updateConsent(consent: ConsentState): void {
    this.state.consent = consent;
    this.consentManager.setConsent(consent);

    // Log consent change
    this.complianceChecker.logAuditEvent(
      "consent_change",
      "orchestrator",
      this.state.userId,
      {
        newLevel: consent.level,
        browsingAnalysis: consent.browsingAnalysis,
        voiceProcessing: consent.voiceProcessing,
      },
      "success"
    );

    // Prune memory based on new consent
    this.memoryManager.pruneByConsent(consent.level);
  }

  /**
   * Update system resources and recalculate throttling
   */
  updateResources(resources: SystemResources): void {
    this.state.resources = resources;
    const throttlingConfig = this.throttler.calculateThrottling(resources);

    this.state.throttling = {
      maxTokensPerRequest: throttlingConfig.maxTokensPerRequest,
      embeddingEnabled: throttlingConfig.embeddingEnabled,
      voiceProcessingEnabled: throttlingConfig.voiceProcessingEnabled,
      backgroundProcessingEnabled: throttlingConfig.backgroundProcessingEnabled,
      updateFrequency: throttlingConfig.updateFrequency,
    };

    // Log if significant throttling applied
    if (
      !throttlingConfig.embeddingEnabled ||
      !throttlingConfig.voiceProcessingEnabled
    ) {
      this.complianceChecker.logAuditEvent(
        "intelligence_throttled",
        "orchestrator",
        this.state.userId,
        { reason: throttlingConfig.reason, config: throttlingConfig },
        "success"
      );
    }
  }

  /**
   * Update privacy context
   */
  updatePrivacyContext(privacy: PrivacyContext): void {
    this.state.privacy = privacy;

    // Auto-throttle for sensitive content
    if (privacy.sensitiveContentDetected) {
      this.state.throttling.embeddingEnabled = false;
    }

    // Handle private browsing
    if (privacy.isPrivateBrowsing) {
      this.state.throttling.backgroundProcessingEnabled = false;
    }
  }

  /**
   * Route request to appropriate agent with privacy-first logic
   */
  async routeToAgent(
    agent: AgentType,
    action: string,
    payload: Record<string, unknown>
  ): Promise<unknown> {
    // Check kill switch
    if (this.state.killSwitchActive) {
      throw new Error("AI processing is disabled (kill switch active)");
    }

    // Check consent
    const requiredConsent = this.getRequiredConsentLevel(agent, action);
    if (!this.consentManager.isValidForOperation(requiredConsent)) {
      throw new Error(
        `Insufficient consent for ${agent}:${action}. Required: ${requiredConsent}`
      );
    }

    // Check privacy context
    if (this.shouldBlockForPrivacy(agent, action)) {
      throw new Error("Operation blocked due to privacy context");
    }

    // Check App Store compliance
    const complianceResult = this.complianceChecker.checkAppStoreCompliance(
      this.state.consent,
      `${agent}:${action}`,
      []
    );
    if (!complianceResult.compliant) {
      throw new Error(
        `Compliance check failed: ${complianceResult.issues.map((i) => i.message).join(", ")}`
      );
    }

    // Record agent invocation start
    const invocationStart = new Date();
    this.state.currentAgent = agent;

    try {
      let result: unknown;

      switch (agent) {
        case "browser":
          result = await this.invokeBrowserAgent(action, payload);
          break;
        case "voice":
          result = await this.invokeVoiceAgent(action, payload);
          break;
        case "export":
          result = await this.invokeExportAgent(action, payload);
          break;
        default:
          throw new Error(`Unknown agent: ${agent}`);
      }

      // Record successful invocation
      this.recordAgentInvocation(agent, invocationStart, payload, result, true);

      return result;
    } catch (error) {
      // Record failed invocation
      this.recordAgentInvocation(
        agent,
        invocationStart,
        payload,
        { error: error instanceof Error ? error.message : "Unknown error" },
        false
      );

      // Record error
      this.state.errors.push({
        agent,
        timestamp: new Date(),
        code: "AGENT_ERROR",
        message: error instanceof Error ? error.message : "Unknown error",
        recoverable: true,
      });

      throw error;
    } finally {
      this.state.currentAgent = null;
    }
  }

  /**
   * Invoke browser intelligence agent
   */
  private async invokeBrowserAgent(
    action: string,
    payload: Record<string, unknown>
  ): Promise<unknown> {
    switch (action) {
      case "start_session":
        return this.browserAgent.startSession(this.state.userId);

      case "record_visit":
        return this.browserAgent.recordVisit(
          payload.url as string,
          payload.title as string,
          payload.content as string,
          this.state.consent,
          this.state.throttling
        );

      case "analyze_scroll":
        return this.browserAgent.analyzeScrollBehavior(
          payload.events as unknown[],
          this.state.consent
        );

      case "detect_contradictions":
        return this.browserAgent.detectContradictions(
          payload.content1 as string,
          payload.source1 as string,
          payload.content2 as string,
          payload.source2 as string,
          this.state.consent
        );

      case "detect_patterns":
        return this.browserAgent.detectBehavioralPatterns(this.state.consent);

      case "get_summary":
        return this.browserAgent.getSessionSummary();

      case "end_session":
        return this.browserAgent.endSession();

      default:
        throw new Error(`Unknown browser action: ${action}`);
    }
  }

  /**
   * Invoke voice intelligence agent
   */
  private async invokeVoiceAgent(
    action: string,
    payload: Record<string, unknown>
  ): Promise<unknown> {
    // Check voice consent specifically
    if (!this.state.consent.voiceProcessing) {
      throw new Error("Voice processing not consented");
    }

    switch (action) {
      case "start_session":
        return this.voiceAgent.startSession(this.state.userId);

      case "process_transcription":
        return this.voiceAgent.processTranscription(
          payload.text as string,
          payload.startTime as number,
          payload.endTime as number,
          this.state.consent,
          this.state.throttling
        );

      case "detect_question_patterns":
        return this.voiceAgent.detectQuestionPatterns();

      case "get_friction_points":
        return this.voiceAgent.getCognitiveFrictionPoints();

      case "get_cognitive_state":
        return this.voiceAgent.getCognitiveState();

      case "extract_intent":
        return this.voiceAgent.extractConversationalIntent();

      case "get_summary":
        return this.voiceAgent.getSessionSummary();

      case "end_session":
        return this.voiceAgent.endSession();

      default:
        throw new Error(`Unknown voice action: ${action}`);
    }
  }

  /**
   * Invoke data export agent
   */
  private async invokeExportAgent(
    action: string,
    payload: Record<string, unknown>
  ): Promise<unknown> {
    // Check export consent
    if (!this.state.consent.dataExport) {
      throw new Error("Data export not consented");
    }

    switch (action) {
      case "generate_export":
        return this.exportAgent.generateExport(
          this.state.userId,
          payload.dataTypes as unknown[],
          this.state.consent.level,
          (payload.format as "json" | "encrypted") ?? "json"
        );

      case "export_embeddings":
        return this.exportAgent.exportEmbeddings(this.state.userId);

      case "export_summaries":
        return this.exportAgent.exportSummaries(this.state.userId);

      case "export_knowledge_graph":
        return this.exportAgent.exportKnowledgeGraph(this.state.userId);

      case "export_intent_timeline":
        return this.exportAgent.exportIntentTimeline(this.state.userId);

      case "request_deletion":
        return this.exportAgent.requestDataDeletion(this.state.userId);

      case "verify_export":
        return this.exportAgent.verifyExport(
          payload.payload as string,
          payload.checksum as string
        );

      default:
        throw new Error(`Unknown export action: ${action}`);
    }
  }

  /**
   * Activate kill switch
   */
  activateKillSwitch(reason: string): void {
    if (!this.config.enableKillSwitch) {
      throw new Error("Kill switch is disabled in configuration");
    }

    this.state.killSwitchActive = true;

    // Log the activation
    this.complianceChecker.logAuditEvent(
      "kill_switch_activated",
      "orchestrator",
      this.state.userId,
      { reason },
      "success"
    );

    // Add alert
    this.memoryManager.addAlert({
      type: "privacy_concern",
      severity: "critical",
      message: `Kill switch activated: ${reason}`,
    });
  }

  /**
   * Deactivate kill switch
   */
  deactivateKillSwitch(): void {
    this.state.killSwitchActive = false;
  }

  /**
   * Activate emergency data suppression
   */
  activateEmergencySuppression(userId: string): void {
    if (!this.config.enableEmergencySuppression) {
      throw new Error("Emergency suppression is disabled in configuration");
    }

    this.state.emergencySuppressionActive = true;

    // Clear all sensitive data
    this.memoryManager.emergencySuppression();

    // Log the activation
    this.complianceChecker.logAuditEvent(
      "emergency_suppression",
      "orchestrator",
      userId,
      { action: "data_suppression_activated" },
      "success"
    );
  }

  /**
   * Get orchestrator state
   */
  getState(): OrchestratorState {
    return { ...this.state };
  }

  /**
   * Get user intelligence profile
   */
  getUserProfile(): UserIntelligenceProfile {
    return this.state.userProfile;
  }

  /**
   * Update user intelligence profile
   */
  updateUserProfile(updates: Partial<UserIntelligenceProfile>): void {
    Object.assign(this.state.userProfile, updates, { lastUpdated: new Date() });
    this.memoryManager.setUserProfile(this.state.userProfile);
  }

  /**
   * Get active alerts
   */
  getActiveAlerts(): Alert[] {
    return this.memoryManager.getActiveAlerts();
  }

  /**
   * Dismiss an alert
   */
  dismissAlert(alertId: string): boolean {
    return this.memoryManager.dismissAlert(alertId);
  }

  /**
   * Get agent invocation history
   */
  getAgentHistory(): AgentInvocation[] {
    return [...this.state.agentHistory];
  }

  /**
   * Get errors
   */
  getErrors(): AgentError[] {
    return [...this.state.errors];
  }

  /**
   * Clear errors
   */
  clearErrors(): void {
    this.state.errors = [];
  }

  // -------------------------------------------------------------------------
  // Private Helper Methods
  // -------------------------------------------------------------------------

  private getRequiredConsentLevel(
    agent: AgentType,
    action: string
  ): ConsentLevel {
    // Voice always requires full consent
    if (agent === "voice") {
      return "full";
    }

    // Export requires enhanced for most operations
    if (agent === "export" && action !== "request_deletion") {
      return "enhanced";
    }

    // Browser operations
    if (agent === "browser") {
      if (action === "detect_patterns" || action === "detect_contradictions") {
        return "enhanced";
      }
      return "standard";
    }

    return "minimal";
  }

  private shouldBlockForPrivacy(agent: AgentType, action: string): boolean {
    // Block all processing in private browsing except minimal
    if (this.state.privacy.isPrivateBrowsing) {
      if (agent === "voice") return true;
      if (agent === "export") return true;
      if (agent === "browser" && action !== "start_session") return true;
    }

    // Block voice processing when sensitive content detected
    if (this.state.privacy.sensitiveContentDetected && agent === "voice") {
      return true;
    }

    return false;
  }

  private recordAgentInvocation(
    agent: AgentType,
    startTime: Date,
    input: Record<string, unknown>,
    output: unknown,
    success: boolean
  ): void {
    const invocation: AgentInvocation = {
      agent,
      timestamp: startTime,
      duration: new Date().getTime() - startTime.getTime(),
      input,
      output: output as Record<string, unknown>,
      success,
    };

    this.state.agentHistory.push(invocation);

    // Keep only last 100 invocations
    if (this.state.agentHistory.length > 100) {
      this.state.agentHistory = this.state.agentHistory.slice(-100);
    }

    // Log audit event
    this.complianceChecker.logAuditEvent(
      "agent_invoked",
      agent,
      this.state.userId,
      {
        action: input.action ?? "unknown",
        duration: invocation.duration,
        success,
      },
      success ? "success" : "failure"
    );
  }
}

// ============================================================================
// Singleton Management
// ============================================================================

let orchestratorInstance: OrchestratorAgent | null = null;

function setOrchestratorInstance(instance: OrchestratorAgent): void {
  orchestratorInstance = instance;
}

export function getOrchestratorInstance(): OrchestratorAgent | null {
  return orchestratorInstance;
}

export function createOrchestrator(
  userId: string,
  config?: Partial<OrchestratorConfig>
): OrchestratorAgent {
  orchestratorInstance = new OrchestratorAgent(userId, config);
  return orchestratorInstance;
}

export function resetOrchestrator(): void {
  orchestratorInstance = null;
}

// ============================================================================
// Export Tools for LangGraph
// ============================================================================

export const orchestratorTools = [
  killSwitchTool,
  emergencySuppressionTool,
  routeToAgentTool,
];

export { killSwitchTool, emergencySuppressionTool, routeToAgentTool };
