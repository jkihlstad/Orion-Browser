/**
 * LangGraph Workflow for Orion Browser AI System
 * Connects all agents with state transitions and conditional routing
 */

import { StateGraph, END, START, Annotation } from "@langchain/langgraph";
import { ChatOpenAI } from "@langchain/openai";
import { HumanMessage, SystemMessage, AIMessage, BaseMessage } from "@langchain/core/messages";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import { v4 as uuidv4 } from "uuid";

import type {
  ConsentState,
  ConsentLevel,
  PrivacyContext,
  SystemResources,
  IntelligenceThrottling,
  AgentType,
  BrowsingSession,
  VoiceSession,
  ExportPayload,
  Alert,
} from "./shared/types.js";

import {
  OrchestratorAgent,
  createOrchestrator,
  getOrchestratorInstance,
  orchestratorTools,
  ConsentManager,
} from "./orchestrator/index.js";

import { BrowserIntelligenceAgent, browserTools } from "./browser/index.js";
import { VoiceIntelligenceAgent, voiceTools } from "./voice/index.js";
import { DataExportAgent, exportTools, getExportAgent } from "./export/index.js";
import { getMemoryManager } from "./shared/memory.js";
import { getComplianceChecker, getIntelligenceThrottler } from "./shared/compliance.js";

// ============================================================================
// Graph State Definition
// ============================================================================

/**
 * The state that flows through the graph
 */
const GraphState = Annotation.Root({
  // Session identification
  sessionId: Annotation<string>({
    reducer: (_, y) => y,
    default: () => uuidv4(),
  }),
  userId: Annotation<string>({
    reducer: (_, y) => y,
    default: () => "",
  }),

  // Messages for LLM interaction
  messages: Annotation<BaseMessage[]>({
    reducer: (x, y) => x.concat(y),
    default: () => [],
  }),

  // Consent and privacy
  consent: Annotation<ConsentState>({
    reducer: (_, y) => y,
    default: () => ({
      level: "none" as ConsentLevel,
      browsingAnalysis: false,
      voiceProcessing: false,
      crossSessionLearning: false,
      dataExport: false,
      thirdPartySharing: false,
      lastUpdated: new Date(),
      version: "1.0",
    }),
  }),
  privacy: Annotation<PrivacyContext>({
    reducer: (_, y) => y,
    default: () => ({
      isPrivateBrowsing: false,
      sensitiveContentDetected: false,
      complianceFlags: {
        gdprApplicable: false,
        ccpaApplicable: false,
        coppaApplicable: false,
        hipaaRelevant: false,
        appStoreCompliant: true,
      },
    }),
  }),

  // System resources and throttling
  resources: Annotation<SystemResources>({
    reducer: (_, y) => y,
    default: () => ({
      batteryLevel: 100,
      batteryCharging: true,
      networkType: "wifi" as const,
      cpuUsage: 20,
      memoryUsage: 30,
      thermalState: "nominal" as const,
    }),
  }),
  throttling: Annotation<IntelligenceThrottling>({
    reducer: (_, y) => y,
    default: () => ({
      maxTokensPerRequest: 4096,
      embeddingEnabled: true,
      voiceProcessingEnabled: true,
      backgroundProcessingEnabled: true,
      updateFrequency: "realtime" as const,
    }),
  }),

  // Current request context
  currentRequest: Annotation<RequestContext | null>({
    reducer: (_, y) => y,
    default: () => null,
  }),

  // Agent states
  currentAgent: Annotation<AgentType | null>({
    reducer: (_, y) => y,
    default: () => null,
  }),
  browserSession: Annotation<BrowsingSession | null>({
    reducer: (_, y) => y,
    default: () => null,
  }),
  voiceSession: Annotation<VoiceSession | null>({
    reducer: (_, y) => y,
    default: () => null,
  }),

  // Results and outputs
  result: Annotation<unknown>({
    reducer: (_, y) => y,
    default: () => null,
  }),
  pendingExports: Annotation<ExportPayload[]>({
    reducer: (x, y) => x.concat(y),
    default: () => [],
  }),
  alerts: Annotation<Alert[]>({
    reducer: (x, y) => x.concat(y),
    default: () => [],
  }),

  // Control flags
  killSwitchActive: Annotation<boolean>({
    reducer: (_, y) => y,
    default: () => false,
  }),
  emergencySuppressionActive: Annotation<boolean>({
    reducer: (_, y) => y,
    default: () => false,
  }),

  // Error handling
  error: Annotation<string | null>({
    reducer: (_, y) => y,
    default: () => null,
  }),
});

type GraphStateType = typeof GraphState.State;

interface RequestContext {
  type: "browser" | "voice" | "export" | "system";
  action: string;
  payload: Record<string, unknown>;
  timestamp: Date;
}

// ============================================================================
// Node Functions
// ============================================================================

/**
 * Entry node - initializes the graph state
 */
async function entryNode(state: GraphStateType): Promise<Partial<GraphStateType>> {
  // Initialize orchestrator if needed
  if (!getOrchestratorInstance() && state.userId) {
    createOrchestrator(state.userId);
  }

  return {
    sessionId: state.sessionId || uuidv4(),
  };
}

/**
 * Consent validation node - checks if operation is allowed
 */
async function consentValidationNode(
  state: GraphStateType
): Promise<Partial<GraphStateType>> {
  if (!state.currentRequest) {
    return { error: "No request context provided" };
  }

  const { type, action } = state.currentRequest;
  const consent = state.consent;

  // Check kill switch
  if (state.killSwitchActive) {
    return { error: "AI processing is disabled (kill switch active)" };
  }

  // Check consent levels
  if (type === "voice" && !consent.voiceProcessing) {
    return { error: "Voice processing not consented" };
  }

  if (type === "browser" && !consent.browsingAnalysis) {
    if (action !== "start_session" && action !== "end_session") {
      return { error: "Browsing analysis not consented" };
    }
  }

  if (type === "export" && !consent.dataExport) {
    if (action !== "request_deletion") {
      return { error: "Data export not consented" };
    }
  }

  // Check privacy context
  if (state.privacy.isPrivateBrowsing) {
    if (type === "voice" || type === "export") {
      return { error: "Operation not available in private browsing mode" };
    }
  }

  // Check compliance
  const complianceChecker = getComplianceChecker();
  const complianceResult = complianceChecker.checkAppStoreCompliance(
    consent,
    `${type}:${action}`,
    []
  );

  if (!complianceResult.compliant) {
    return {
      error: `Compliance check failed: ${complianceResult.issues
        .map((i) => i.message)
        .join(", ")}`,
    };
  }

  return { error: null };
}

/**
 * Throttling node - adjusts processing based on resources
 */
async function throttlingNode(
  state: GraphStateType
): Promise<Partial<GraphStateType>> {
  const throttler = getIntelligenceThrottler();
  const throttlingConfig = throttler.calculateThrottling(state.resources);

  const throttling: IntelligenceThrottling = {
    maxTokensPerRequest: throttlingConfig.maxTokensPerRequest,
    embeddingEnabled: throttlingConfig.embeddingEnabled,
    voiceProcessingEnabled: throttlingConfig.voiceProcessingEnabled,
    backgroundProcessingEnabled: throttlingConfig.backgroundProcessingEnabled,
    updateFrequency: throttlingConfig.updateFrequency,
  };

  // Adjust for privacy context
  if (state.privacy.sensitiveContentDetected) {
    throttling.embeddingEnabled = false;
  }

  return { throttling };
}

/**
 * Browser agent node
 */
async function browserAgentNode(
  state: GraphStateType
): Promise<Partial<GraphStateType>> {
  if (!state.currentRequest || state.currentRequest.type !== "browser") {
    return { error: "Invalid request for browser agent" };
  }

  const orchestrator = getOrchestratorInstance();
  if (!orchestrator) {
    return { error: "Orchestrator not initialized" };
  }

  try {
    const result = await orchestrator.routeToAgent(
      "browser",
      state.currentRequest.action,
      state.currentRequest.payload
    );

    // Update browser session if applicable
    let browserSession = state.browserSession;
    if (
      state.currentRequest.action === "start_session" ||
      state.currentRequest.action === "get_summary"
    ) {
      browserSession = result as BrowsingSession;
    }

    return {
      result,
      browserSession,
      currentAgent: "browser",
      error: null,
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Browser agent error",
      currentAgent: "browser",
    };
  }
}

/**
 * Voice agent node
 */
async function voiceAgentNode(
  state: GraphStateType
): Promise<Partial<GraphStateType>> {
  if (!state.currentRequest || state.currentRequest.type !== "voice") {
    return { error: "Invalid request for voice agent" };
  }

  // Additional voice-specific checks
  if (!state.throttling.voiceProcessingEnabled) {
    return { error: "Voice processing disabled due to resource constraints" };
  }

  const orchestrator = getOrchestratorInstance();
  if (!orchestrator) {
    return { error: "Orchestrator not initialized" };
  }

  try {
    const result = await orchestrator.routeToAgent(
      "voice",
      state.currentRequest.action,
      state.currentRequest.payload
    );

    // Update voice session if applicable
    let voiceSession = state.voiceSession;
    if (
      state.currentRequest.action === "start_session" ||
      state.currentRequest.action === "get_summary"
    ) {
      voiceSession = result as VoiceSession;
    }

    return {
      result,
      voiceSession,
      currentAgent: "voice",
      error: null,
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Voice agent error",
      currentAgent: "voice",
    };
  }
}

/**
 * Export agent node
 */
async function exportAgentNode(
  state: GraphStateType
): Promise<Partial<GraphStateType>> {
  if (!state.currentRequest || state.currentRequest.type !== "export") {
    return { error: "Invalid request for export agent" };
  }

  const orchestrator = getOrchestratorInstance();
  if (!orchestrator) {
    return { error: "Orchestrator not initialized" };
  }

  try {
    const result = await orchestrator.routeToAgent(
      "export",
      state.currentRequest.action,
      state.currentRequest.payload
    );

    // Track exports
    const pendingExports: ExportPayload[] = [];
    if (state.currentRequest.action === "generate_export") {
      pendingExports.push(result as ExportPayload);
    }

    return {
      result,
      pendingExports,
      currentAgent: "export",
      error: null,
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Export agent error",
      currentAgent: "export",
    };
  }
}

/**
 * System operations node - handles kill switch, emergency suppression
 */
async function systemNode(
  state: GraphStateType
): Promise<Partial<GraphStateType>> {
  if (!state.currentRequest || state.currentRequest.type !== "system") {
    return { error: "Invalid request for system node" };
  }

  const { action, payload } = state.currentRequest;
  const memoryManager = getMemoryManager();
  const complianceChecker = getComplianceChecker();

  switch (action) {
    case "activate_kill_switch": {
      complianceChecker.logAuditEvent(
        "kill_switch_activated",
        "system",
        state.userId,
        { reason: payload.reason },
        "success"
      );
      return {
        killSwitchActive: true,
        result: { success: true, message: "Kill switch activated" },
      };
    }

    case "deactivate_kill_switch": {
      return {
        killSwitchActive: false,
        result: { success: true, message: "Kill switch deactivated" },
      };
    }

    case "emergency_suppression": {
      memoryManager.emergencySuppression();
      complianceChecker.logAuditEvent(
        "emergency_suppression",
        "system",
        state.userId,
        {},
        "success"
      );
      return {
        emergencySuppressionActive: true,
        browserSession: null,
        voiceSession: null,
        result: { success: true, message: "Emergency suppression completed" },
      };
    }

    case "update_consent": {
      const orchestrator = getOrchestratorInstance();
      if (orchestrator) {
        orchestrator.updateConsent(payload.consent as ConsentState);
      }
      return {
        consent: payload.consent as ConsentState,
        result: { success: true, message: "Consent updated" },
      };
    }

    case "update_resources": {
      const orchestrator = getOrchestratorInstance();
      if (orchestrator) {
        orchestrator.updateResources(payload.resources as SystemResources);
      }
      return {
        resources: payload.resources as SystemResources,
        result: { success: true, message: "Resources updated" },
      };
    }

    case "update_privacy": {
      const orchestrator = getOrchestratorInstance();
      if (orchestrator) {
        orchestrator.updatePrivacyContext(payload.privacy as PrivacyContext);
      }
      return {
        privacy: payload.privacy as PrivacyContext,
        result: { success: true, message: "Privacy context updated" },
      };
    }

    default:
      return { error: `Unknown system action: ${action}` };
  }
}

/**
 * Output node - formats and returns results
 */
async function outputNode(
  state: GraphStateType
): Promise<Partial<GraphStateType>> {
  // Collect alerts from memory manager
  const memoryManager = getMemoryManager();
  const activeAlerts = memoryManager.getActiveAlerts();

  return {
    alerts: activeAlerts,
    currentAgent: null,
  };
}

/**
 * Error handling node
 */
async function errorNode(
  state: GraphStateType
): Promise<Partial<GraphStateType>> {
  const complianceChecker = getComplianceChecker();

  // Log the error
  if (state.error) {
    complianceChecker.logAuditEvent(
      "agent_invoked",
      state.currentAgent ?? "unknown",
      state.userId,
      { error: state.error },
      "failure"
    );
  }

  return {
    result: {
      success: false,
      error: state.error,
    },
    currentAgent: null,
  };
}

// ============================================================================
// Conditional Routing Functions
// ============================================================================

/**
 * Route after consent validation
 */
function routeAfterConsent(state: GraphStateType): string {
  if (state.error) {
    return "error";
  }
  return "throttling";
}

/**
 * Route to appropriate agent based on request type
 */
function routeToAgent(state: GraphStateType): string {
  if (!state.currentRequest) {
    return "error";
  }

  switch (state.currentRequest.type) {
    case "browser":
      return "browser_agent";
    case "voice":
      return "voice_agent";
    case "export":
      return "export_agent";
    case "system":
      return "system";
    default:
      return "error";
  }
}

/**
 * Route after agent execution
 */
function routeAfterAgent(state: GraphStateType): string {
  if (state.error) {
    return "error";
  }
  return "output";
}

// ============================================================================
// Graph Builder
// ============================================================================

/**
 * Build the complete LangGraph workflow
 */
export function buildOrionGraph() {
  const workflow = new StateGraph(GraphState)
    // Add nodes
    .addNode("entry", entryNode)
    .addNode("consent_validation", consentValidationNode)
    .addNode("throttling", throttlingNode)
    .addNode("browser_agent", browserAgentNode)
    .addNode("voice_agent", voiceAgentNode)
    .addNode("export_agent", exportAgentNode)
    .addNode("system", systemNode)
    .addNode("output", outputNode)
    .addNode("error", errorNode)

    // Entry edge
    .addEdge(START, "entry")
    .addEdge("entry", "consent_validation")

    // Consent validation routing
    .addConditionalEdges("consent_validation", routeAfterConsent, {
      throttling: "throttling",
      error: "error",
    })

    // Throttling to agent routing
    .addConditionalEdges("throttling", routeToAgent, {
      browser_agent: "browser_agent",
      voice_agent: "voice_agent",
      export_agent: "export_agent",
      system: "system",
      error: "error",
    })

    // Agent to output/error routing
    .addConditionalEdges("browser_agent", routeAfterAgent, {
      output: "output",
      error: "error",
    })
    .addConditionalEdges("voice_agent", routeAfterAgent, {
      output: "output",
      error: "error",
    })
    .addConditionalEdges("export_agent", routeAfterAgent, {
      output: "output",
      error: "error",
    })
    .addConditionalEdges("system", routeAfterAgent, {
      output: "output",
      error: "error",
    })

    // Terminal edges
    .addEdge("output", END)
    .addEdge("error", END);

  return workflow.compile();
}

// ============================================================================
// Graph Runner
// ============================================================================

export class OrionGraphRunner {
  private graph: ReturnType<typeof buildOrionGraph>;
  private userId: string;
  private initialState: Partial<GraphStateType>;

  constructor(userId: string, config?: Partial<GraphStateType>) {
    this.userId = userId;
    this.graph = buildOrionGraph();
    this.initialState = {
      userId,
      ...config,
    };

    // Initialize orchestrator
    createOrchestrator(userId);
  }

  /**
   * Run a browser operation
   */
  async browser(
    action: string,
    payload: Record<string, unknown> = {}
  ): Promise<GraphStateType> {
    return this.run({
      currentRequest: {
        type: "browser",
        action,
        payload,
        timestamp: new Date(),
      },
    });
  }

  /**
   * Run a voice operation
   */
  async voice(
    action: string,
    payload: Record<string, unknown> = {}
  ): Promise<GraphStateType> {
    return this.run({
      currentRequest: {
        type: "voice",
        action,
        payload,
        timestamp: new Date(),
      },
    });
  }

  /**
   * Run an export operation
   */
  async export(
    action: string,
    payload: Record<string, unknown> = {}
  ): Promise<GraphStateType> {
    return this.run({
      currentRequest: {
        type: "export",
        action,
        payload,
        timestamp: new Date(),
      },
    });
  }

  /**
   * Run a system operation
   */
  async system(
    action: string,
    payload: Record<string, unknown> = {}
  ): Promise<GraphStateType> {
    return this.run({
      currentRequest: {
        type: "system",
        action,
        payload,
        timestamp: new Date(),
      },
    });
  }

  /**
   * Update consent
   */
  async updateConsent(consent: ConsentState): Promise<GraphStateType> {
    return this.system("update_consent", { consent });
  }

  /**
   * Update resources
   */
  async updateResources(resources: SystemResources): Promise<GraphStateType> {
    return this.system("update_resources", { resources });
  }

  /**
   * Update privacy context
   */
  async updatePrivacy(privacy: PrivacyContext): Promise<GraphStateType> {
    return this.system("update_privacy", { privacy });
  }

  /**
   * Activate kill switch
   */
  async activateKillSwitch(reason: string): Promise<GraphStateType> {
    return this.system("activate_kill_switch", { reason });
  }

  /**
   * Deactivate kill switch
   */
  async deactivateKillSwitch(): Promise<GraphStateType> {
    return this.system("deactivate_kill_switch", {});
  }

  /**
   * Trigger emergency suppression
   */
  async emergencySuppression(): Promise<GraphStateType> {
    return this.system("emergency_suppression", {});
  }

  /**
   * Run the graph with given state updates
   */
  private async run(
    stateUpdates: Partial<GraphStateType>
  ): Promise<GraphStateType> {
    const input = {
      ...this.initialState,
      ...stateUpdates,
    };

    const result = await this.graph.invoke(input);

    // Update initial state with any persistent changes
    if (result.consent) {
      this.initialState.consent = result.consent;
    }
    if (result.resources) {
      this.initialState.resources = result.resources;
    }
    if (result.privacy) {
      this.initialState.privacy = result.privacy;
    }
    if (result.throttling) {
      this.initialState.throttling = result.throttling;
    }
    if (result.killSwitchActive !== undefined) {
      this.initialState.killSwitchActive = result.killSwitchActive;
    }

    return result;
  }

  /**
   * Get the current state
   */
  getState(): Partial<GraphStateType> {
    return { ...this.initialState };
  }

  /**
   * Stream graph execution for real-time updates
   */
  async *stream(
    stateUpdates: Partial<GraphStateType>
  ): AsyncGenerator<{ node: string; state: Partial<GraphStateType> }> {
    const input = {
      ...this.initialState,
      ...stateUpdates,
    };

    for await (const event of await this.graph.stream(input)) {
      for (const [node, state] of Object.entries(event)) {
        yield { node, state: state as Partial<GraphStateType> };
      }
    }
  }
}

// ============================================================================
// Convenience Exports
// ============================================================================

export { GraphState };
export type { GraphStateType, RequestContext };

/**
 * Create a new Orion graph runner
 */
export function createOrionRunner(
  userId: string,
  config?: Partial<GraphStateType>
): OrionGraphRunner {
  return new OrionGraphRunner(userId, config);
}

/**
 * Quick start with full consent for development
 */
export function createDevRunner(userId: string): OrionGraphRunner {
  return new OrionGraphRunner(userId, {
    consent: {
      level: "full",
      browsingAnalysis: true,
      voiceProcessing: true,
      crossSessionLearning: true,
      dataExport: true,
      thirdPartySharing: false,
      lastUpdated: new Date(),
      version: "1.0",
    },
    resources: {
      batteryLevel: 100,
      batteryCharging: true,
      networkType: "wifi",
      cpuUsage: 10,
      memoryUsage: 20,
      thermalState: "nominal",
    },
  });
}
