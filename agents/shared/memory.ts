/**
 * Cross-agent memory sharing system for Orion Browser
 * Provides persistent and ephemeral memory across agent invocations
 */

import { v4 as uuidv4 } from "uuid";
import type {
  SharedMemory,
  CrossAgentData,
  AgentType,
  BrowsingSession,
  VoiceSession,
  ExportPayload,
  Alert,
  KnowledgeGraphNode,
  UserIntelligenceProfile,
  ConsentLevel,
} from "./types.js";

// ============================================================================
// Memory Store Implementation
// ============================================================================

interface MemoryEntry<T> {
  key: string;
  value: T;
  createdAt: Date;
  expiresAt?: Date;
  accessCount: number;
  lastAccessed: Date;
  agentSource: AgentType;
  consentLevel: ConsentLevel;
}

class MemoryStore<T> {
  private store: Map<string, MemoryEntry<T>> = new Map();
  private maxSize: number;

  constructor(maxSize: number = 1000) {
    this.maxSize = maxSize;
  }

  set(
    key: string,
    value: T,
    options: {
      agentSource: AgentType;
      consentLevel: ConsentLevel;
      ttlMs?: number;
    }
  ): void {
    // Evict old entries if at capacity
    if (this.store.size >= this.maxSize) {
      this.evictLRU();
    }

    const now = new Date();
    const entry: MemoryEntry<T> = {
      key,
      value,
      createdAt: now,
      expiresAt: options.ttlMs ? new Date(now.getTime() + options.ttlMs) : undefined,
      accessCount: 0,
      lastAccessed: now,
      agentSource: options.agentSource,
      consentLevel: options.consentLevel,
    };

    this.store.set(key, entry);
  }

  get(key: string): T | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;

    // Check expiration
    if (entry.expiresAt && new Date() > entry.expiresAt) {
      this.store.delete(key);
      return undefined;
    }

    // Update access metadata
    entry.accessCount++;
    entry.lastAccessed = new Date();

    return entry.value;
  }

  delete(key: string): boolean {
    return this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }

  /**
   * Clear all entries that require a consent level higher than specified
   */
  clearByConsentLevel(maxAllowedLevel: ConsentLevel): void {
    const levelOrder: ConsentLevel[] = ["none", "minimal", "standard", "enhanced", "full"];
    const maxIndex = levelOrder.indexOf(maxAllowedLevel);

    for (const [key, entry] of this.store.entries()) {
      const entryIndex = levelOrder.indexOf(entry.consentLevel);
      if (entryIndex > maxIndex) {
        this.store.delete(key);
      }
    }
  }

  /**
   * Clear all entries from a specific agent
   */
  clearByAgent(agent: AgentType): void {
    for (const [key, entry] of this.store.entries()) {
      if (entry.agentSource === agent) {
        this.store.delete(key);
      }
    }
  }

  /**
   * Get all keys matching a pattern
   */
  getKeysByPattern(pattern: RegExp): string[] {
    return Array.from(this.store.keys()).filter((key) => pattern.test(key));
  }

  /**
   * Evict least recently used entry
   */
  private evictLRU(): void {
    let oldestKey: string | null = null;
    let oldestTime = new Date();

    for (const [key, entry] of this.store.entries()) {
      if (entry.lastAccessed < oldestTime) {
        oldestTime = entry.lastAccessed;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.store.delete(oldestKey);
    }
  }

  /**
   * Get memory statistics
   */
  getStats(): {
    size: number;
    maxSize: number;
    agentBreakdown: Record<AgentType, number>;
  } {
    const agentBreakdown: Record<AgentType, number> = {
      browser: 0,
      voice: 0,
      export: 0,
      orchestrator: 0,
    };

    for (const entry of this.store.values()) {
      agentBreakdown[entry.agentSource]++;
    }

    return {
      size: this.store.size,
      maxSize: this.maxSize,
      agentBreakdown,
    };
  }
}

// ============================================================================
// Cross-Agent Memory Manager
// ============================================================================

export class CrossAgentMemoryManager {
  private shortTermMemory: MemoryStore<unknown>;
  private contextWindow: unknown[] = [];
  private crossAgentData: CrossAgentData;
  private knowledgeGraph: Map<string, KnowledgeGraphNode> = new Map();
  private userProfile: UserIntelligenceProfile | null = null;

  private readonly maxContextWindowSize = 50;
  private readonly maxKnowledgeGraphNodes = 10000;

  constructor() {
    this.shortTermMemory = new MemoryStore(5000);
    this.crossAgentData = {
      pendingExports: [],
      activeAlerts: [],
    };
  }

  // -------------------------------------------------------------------------
  // Short-term Memory Operations
  // -------------------------------------------------------------------------

  setShortTerm(
    key: string,
    value: unknown,
    agentSource: AgentType,
    consentLevel: ConsentLevel,
    ttlMs?: number
  ): void {
    this.shortTermMemory.set(key, value, {
      agentSource,
      consentLevel,
      ttlMs: ttlMs ?? 30 * 60 * 1000, // Default 30 minutes
    });
  }

  getShortTerm<T>(key: string): T | undefined {
    return this.shortTermMemory.get(key) as T | undefined;
  }

  deleteShortTerm(key: string): boolean {
    return this.shortTermMemory.delete(key);
  }

  // -------------------------------------------------------------------------
  // Context Window Operations
  // -------------------------------------------------------------------------

  pushToContext(item: unknown): void {
    this.contextWindow.push(item);
    if (this.contextWindow.length > this.maxContextWindowSize) {
      this.contextWindow.shift();
    }
  }

  getContext(): unknown[] {
    return [...this.contextWindow];
  }

  getRecentContext(count: number): unknown[] {
    return this.contextWindow.slice(-count);
  }

  clearContext(): void {
    this.contextWindow = [];
  }

  // -------------------------------------------------------------------------
  // Cross-Agent Data Operations
  // -------------------------------------------------------------------------

  setBrowsingContext(session: BrowsingSession): void {
    this.crossAgentData.lastBrowsingContext = session;
    this.pushToContext({
      type: "browsing_session",
      sessionId: session.sessionId,
      timestamp: new Date(),
    });
  }

  getBrowsingContext(): BrowsingSession | undefined {
    return this.crossAgentData.lastBrowsingContext;
  }

  setVoiceContext(session: VoiceSession): void {
    this.crossAgentData.lastVoiceContext = session;
    this.pushToContext({
      type: "voice_session",
      sessionId: session.sessionId,
      timestamp: new Date(),
    });
  }

  getVoiceContext(): VoiceSession | undefined {
    return this.crossAgentData.lastVoiceContext;
  }

  addPendingExport(payload: ExportPayload): void {
    this.crossAgentData.pendingExports.push(payload);
  }

  getPendingExports(): ExportPayload[] {
    return [...this.crossAgentData.pendingExports];
  }

  clearPendingExports(): void {
    this.crossAgentData.pendingExports = [];
  }

  // -------------------------------------------------------------------------
  // Alert Operations
  // -------------------------------------------------------------------------

  addAlert(alert: Omit<Alert, "id" | "timestamp" | "dismissed">): Alert {
    const fullAlert: Alert = {
      ...alert,
      id: uuidv4(),
      timestamp: new Date(),
      dismissed: false,
    };
    this.crossAgentData.activeAlerts.push(fullAlert);
    return fullAlert;
  }

  getActiveAlerts(): Alert[] {
    return this.crossAgentData.activeAlerts.filter((a) => !a.dismissed);
  }

  dismissAlert(alertId: string): boolean {
    const alert = this.crossAgentData.activeAlerts.find((a) => a.id === alertId);
    if (alert) {
      alert.dismissed = true;
      return true;
    }
    return false;
  }

  clearAllAlerts(): void {
    this.crossAgentData.activeAlerts = [];
  }

  // -------------------------------------------------------------------------
  // Knowledge Graph Operations
  // -------------------------------------------------------------------------

  addKnowledgeNode(node: KnowledgeGraphNode): void {
    // Evict old nodes if at capacity
    if (this.knowledgeGraph.size >= this.maxKnowledgeGraphNodes) {
      this.evictOldestKnowledgeNodes(100);
    }
    this.knowledgeGraph.set(node.id, node);
  }

  getKnowledgeNode(id: string): KnowledgeGraphNode | undefined {
    const node = this.knowledgeGraph.get(id);
    if (node) {
      node.lastAccessed = new Date();
    }
    return node;
  }

  findRelatedNodes(concept: string, limit: number = 10): KnowledgeGraphNode[] {
    const results: KnowledgeGraphNode[] = [];
    const conceptLower = concept.toLowerCase();

    for (const node of this.knowledgeGraph.values()) {
      if (
        node.concept.toLowerCase().includes(conceptLower) ||
        conceptLower.includes(node.concept.toLowerCase())
      ) {
        results.push(node);
        if (results.length >= limit) break;
      }
    }

    return results;
  }

  getConnectedNodes(nodeId: string, depth: number = 1): KnowledgeGraphNode[] {
    const visited = new Set<string>();
    const results: KnowledgeGraphNode[] = [];

    const traverse = (id: string, currentDepth: number): void => {
      if (currentDepth > depth || visited.has(id)) return;
      visited.add(id);

      const node = this.knowledgeGraph.get(id);
      if (!node) return;

      results.push(node);
      for (const connection of node.connections) {
        traverse(connection.targetId, currentDepth + 1);
      }
    };

    traverse(nodeId, 0);
    return results.slice(1); // Exclude the starting node
  }

  private evictOldestKnowledgeNodes(count: number): void {
    const sortedNodes = Array.from(this.knowledgeGraph.values()).sort(
      (a, b) => a.lastAccessed.getTime() - b.lastAccessed.getTime()
    );

    for (let i = 0; i < count && i < sortedNodes.length; i++) {
      const node = sortedNodes[i];
      if (node) {
        this.knowledgeGraph.delete(node.id);
      }
    }
  }

  // -------------------------------------------------------------------------
  // User Profile Operations
  // -------------------------------------------------------------------------

  setUserProfile(profile: UserIntelligenceProfile): void {
    this.userProfile = profile;
  }

  getUserProfile(): UserIntelligenceProfile | null {
    return this.userProfile;
  }

  updateUserProfile(
    updates: Partial<Omit<UserIntelligenceProfile, "userId">>
  ): void {
    if (this.userProfile) {
      Object.assign(this.userProfile, updates, { lastUpdated: new Date() });
    }
  }

  // -------------------------------------------------------------------------
  // Emergency Operations
  // -------------------------------------------------------------------------

  /**
   * Emergency data suppression - clears all sensitive data
   */
  emergencySuppression(): void {
    this.shortTermMemory.clear();
    this.contextWindow = [];
    this.crossAgentData = {
      pendingExports: [],
      activeAlerts: [],
    };
    // Keep knowledge graph and user profile as they're non-sensitive
  }

  /**
   * Full data wipe - removes everything
   */
  fullDataWipe(): void {
    this.emergencySuppression();
    this.knowledgeGraph.clear();
    this.userProfile = null;
  }

  /**
   * Consent-based data pruning
   */
  pruneByConsent(maxAllowedLevel: ConsentLevel): void {
    this.shortTermMemory.clearByConsentLevel(maxAllowedLevel);

    // Clear voice data if not allowed
    if (maxAllowedLevel === "none" || maxAllowedLevel === "minimal") {
      this.crossAgentData.lastVoiceContext = undefined;
    }

    // Clear browsing data if none
    if (maxAllowedLevel === "none") {
      this.crossAgentData.lastBrowsingContext = undefined;
    }
  }

  // -------------------------------------------------------------------------
  // Serialization
  // -------------------------------------------------------------------------

  toSharedMemory(): SharedMemory {
    const shortTerm = new Map<string, unknown>();
    // Note: In a real implementation, we'd serialize the MemoryStore

    return {
      shortTerm,
      contextWindow: [...this.contextWindow],
      crossAgentData: { ...this.crossAgentData },
    };
  }

  getMemoryStats(): {
    shortTermStats: ReturnType<MemoryStore<unknown>["getStats"]>;
    contextWindowSize: number;
    knowledgeGraphSize: number;
    activeAlerts: number;
    pendingExports: number;
  } {
    return {
      shortTermStats: this.shortTermMemory.getStats(),
      contextWindowSize: this.contextWindow.length,
      knowledgeGraphSize: this.knowledgeGraph.size,
      activeAlerts: this.crossAgentData.activeAlerts.filter((a) => !a.dismissed).length,
      pendingExports: this.crossAgentData.pendingExports.length,
    };
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let memoryManagerInstance: CrossAgentMemoryManager | null = null;

export function getMemoryManager(): CrossAgentMemoryManager {
  if (!memoryManagerInstance) {
    memoryManagerInstance = new CrossAgentMemoryManager();
  }
  return memoryManagerInstance;
}

export function resetMemoryManager(): void {
  if (memoryManagerInstance) {
    memoryManagerInstance.fullDataWipe();
  }
  memoryManagerInstance = new CrossAgentMemoryManager();
}
