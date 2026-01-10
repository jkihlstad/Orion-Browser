/**
 * Data Export Agent for Orion Browser
 * Handles schema-versioned exports, encryption, and audit logging
 */

import { ChatOpenAI } from "@langchain/openai";
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";
import * as crypto from "crypto";

import type {
  ExportPayload,
  ExportDataType,
  EncryptionMetadata,
  AuditLogEntry,
  ConsentState,
  ConsentLevel,
  UserIntelligenceProfile,
  KnowledgeGraphNode,
  BrowsingSession,
  VoiceSession,
  VoiceIntent,
} from "../shared/types.js";

import { getMemoryManager } from "../shared/memory.js";
import { getComplianceChecker } from "../shared/compliance.js";

// ============================================================================
// Export Agent Configuration
// ============================================================================

export interface ExportAgentConfig {
  schemaVersion: string;
  encryptionAlgorithm: string;
  compressionEnabled: boolean;
  maxPayloadSize: number;
  auditRetentionDays: number;
}

const DEFAULT_CONFIG: ExportAgentConfig = {
  schemaVersion: "1.0.0",
  encryptionAlgorithm: "aes-256-gcm",
  compressionEnabled: true,
  maxPayloadSize: 50 * 1024 * 1024, // 50MB
  auditRetentionDays: 90,
};

// ============================================================================
// Schema Definitions
// ============================================================================

const EXPORT_SCHEMAS: Record<string, ExportSchema> = {
  "1.0.0": {
    version: "1.0.0",
    supportedTypes: [
      "embeddings",
      "summaries",
      "knowledge_graph",
      "intent_timeline",
      "behavioral_patterns",
      "voice_transcripts",
      "preferences",
    ],
    fields: {
      embeddings: ["id", "text", "vector", "metadata"],
      summaries: ["id", "content", "timestamp", "source"],
      knowledge_graph: ["nodes", "edges", "metadata"],
      intent_timeline: ["intents", "timestamps", "contexts"],
      behavioral_patterns: ["patterns", "frequencies", "timeRanges"],
      voice_transcripts: ["segments", "sentiments", "intents"],
      preferences: ["settings", "customizations", "history"],
    },
  },
};

interface ExportSchema {
  version: string;
  supportedTypes: ExportDataType[];
  fields: Record<ExportDataType, string[]>;
}

// ============================================================================
// Encryption Key Manager
// ============================================================================

export class EncryptionKeyManager {
  private keys: Map<string, Buffer> = new Map();
  private keyMetadata: Map<string, KeyMetadata> = new Map();

  /**
   * Generate a new encryption key
   */
  generateKey(userId: string): string {
    const keyId = `key_${userId}_${Date.now()}`;
    const key = crypto.randomBytes(32); // 256 bits for AES-256

    this.keys.set(keyId, key);
    this.keyMetadata.set(keyId, {
      keyId,
      userId,
      createdAt: new Date(),
      algorithm: "aes-256-gcm",
      rotationDue: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000), // 90 days
    });

    return keyId;
  }

  /**
   * Get an encryption key
   */
  getKey(keyId: string): Buffer | undefined {
    return this.keys.get(keyId);
  }

  /**
   * Rotate a key
   */
  rotateKey(oldKeyId: string, userId: string): string {
    // Mark old key as deprecated but keep for decryption
    const oldMeta = this.keyMetadata.get(oldKeyId);
    if (oldMeta) {
      oldMeta.deprecated = true;
      oldMeta.deprecatedAt = new Date();
    }

    // Generate new key
    return this.generateKey(userId);
  }

  /**
   * Delete a key (for data deletion requests)
   */
  deleteKey(keyId: string): boolean {
    this.keyMetadata.delete(keyId);
    return this.keys.delete(keyId);
  }

  /**
   * Get all keys for a user
   */
  getKeysForUser(userId: string): KeyMetadata[] {
    return Array.from(this.keyMetadata.values()).filter(
      (meta) => meta.userId === userId
    );
  }

  /**
   * Check if key rotation is needed
   */
  needsRotation(keyId: string): boolean {
    const meta = this.keyMetadata.get(keyId);
    if (!meta) return false;
    return new Date() >= meta.rotationDue;
  }
}

interface KeyMetadata {
  keyId: string;
  userId: string;
  createdAt: Date;
  algorithm: string;
  rotationDue: Date;
  deprecated?: boolean;
  deprecatedAt?: Date;
}

// ============================================================================
// Export Tools
// ============================================================================

/**
 * Generate Export Payload Tool
 */
const generateExportTool = tool(
  async (input: {
    userId: string;
    dataTypes: ExportDataType[];
    consentLevel: ConsentLevel;
    format: "json" | "encrypted";
  }): Promise<ExportPayload> => {
    const exportAgent = getExportAgent();
    return exportAgent.generateExport(
      input.userId,
      input.dataTypes,
      input.consentLevel,
      input.format
    );
  },
  {
    name: "generate_export",
    description: "Generates an export payload with specified data types",
    schema: z.object({
      userId: z.string().describe("User ID for the export"),
      dataTypes: z.array(
        z.enum([
          "embeddings",
          "summaries",
          "knowledge_graph",
          "intent_timeline",
          "behavioral_patterns",
          "voice_transcripts",
          "preferences",
        ])
      ).describe("Types of data to export"),
      consentLevel: z.enum(["none", "minimal", "standard", "enhanced", "full"])
        .describe("Consent level for scoping the export"),
      format: z.enum(["json", "encrypted"]).describe("Export format"),
    }),
  }
);

/**
 * Verify Export Integrity Tool
 */
const verifyExportTool = tool(
  async (input: {
    payload: string;
    checksum: string;
  }): Promise<{ valid: boolean; errors: string[] }> => {
    const exportAgent = getExportAgent();
    return exportAgent.verifyExport(input.payload, input.checksum);
  },
  {
    name: "verify_export",
    description: "Verifies the integrity of an export payload",
    schema: z.object({
      payload: z.string().describe("The export payload to verify"),
      checksum: z.string().describe("Expected checksum"),
    }),
  }
);

/**
 * Get Audit Log Tool
 */
const getAuditLogTool = tool(
  async (input: {
    userId: string;
    fromDate?: string;
    toDate?: string;
    limit?: number;
  }): Promise<AuditLogEntry[]> => {
    const compliance = getComplianceChecker();
    return compliance.getAuditLog(
      {
        userId: input.userId,
        fromDate: input.fromDate ? new Date(input.fromDate) : undefined,
        toDate: input.toDate ? new Date(input.toDate) : undefined,
      },
      input.limit ?? 100
    );
  },
  {
    name: "get_audit_log",
    description: "Retrieves audit log entries for a user",
    schema: z.object({
      userId: z.string().describe("User ID to get audit log for"),
      fromDate: z.string().optional().describe("Start date (ISO format)"),
      toDate: z.string().optional().describe("End date (ISO format)"),
      limit: z.number().optional().describe("Maximum entries to return"),
    }),
  }
);

// ============================================================================
// Data Export Agent
// ============================================================================

export class DataExportAgent {
  private config: ExportAgentConfig;
  private keyManager: EncryptionKeyManager;
  private pendingExports: Map<string, ExportJob> = new Map();

  constructor(config: Partial<ExportAgentConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.keyManager = new EncryptionKeyManager();
  }

  /**
   * Generate an export with consent-scoped data
   */
  async generateExport(
    userId: string,
    requestedTypes: ExportDataType[],
    consentLevel: ConsentLevel,
    format: "json" | "encrypted"
  ): Promise<ExportPayload> {
    // Validate against consent
    const allowedTypes = this.getAllowedDataTypes(consentLevel);
    const dataTypes = requestedTypes.filter((t) => allowedTypes.includes(t));

    if (dataTypes.length === 0) {
      throw new Error("No data types allowed for current consent level");
    }

    // Collect data from memory
    const exportData = await this.collectExportData(userId, dataTypes);

    // Create payload
    let payloadContent = JSON.stringify(exportData);
    let encryption: EncryptionMetadata = {
      algorithm: "none",
      keyId: "",
    };

    // Encrypt if requested
    if (format === "encrypted") {
      const keyId =
        this.keyManager.getKeysForUser(userId)[0]?.keyId ??
        this.keyManager.generateKey(userId);
      const encrypted = this.encrypt(payloadContent, keyId);
      payloadContent = encrypted.ciphertext;
      encryption = {
        algorithm: this.config.encryptionAlgorithm,
        keyId,
        iv: encrypted.iv,
        authTag: encrypted.authTag,
      };
    }

    // Calculate checksum
    const checksum = this.calculateChecksum(payloadContent);

    const payload: ExportPayload = {
      version: "1.0.0",
      schemaVersion: this.config.schemaVersion,
      exportedAt: new Date(),
      userId,
      consentScope: consentLevel,
      dataTypes,
      encryption,
      checksum,
    };

    // Log audit event
    getComplianceChecker().logAuditEvent(
      "data_export",
      "export",
      userId,
      {
        dataTypes,
        format,
        payloadSize: payloadContent.length,
      },
      "success"
    );

    // Add to pending exports in memory
    getMemoryManager().addPendingExport(payload);

    return payload;
  }

  /**
   * Generate embeddings export
   */
  async exportEmbeddings(userId: string): Promise<EmbeddingsExport> {
    const memoryManager = getMemoryManager();
    const profile = memoryManager.getUserProfile();

    if (!profile) {
      return { embeddings: [], totalCount: 0 };
    }

    // Collect all semantic chunks with embeddings from knowledge graph
    const embeddings: EmbeddingEntry[] = [];

    // This would typically query a vector store
    // For now, we extract from knowledge graph nodes
    const browsingContext = memoryManager.getBrowsingContext();
    const voiceContext = memoryManager.getVoiceContext();

    return {
      embeddings,
      totalCount: embeddings.length,
    };
  }

  /**
   * Generate summaries export
   */
  async exportSummaries(userId: string): Promise<SummariesExport> {
    const memoryManager = getMemoryManager();
    const summaries: SummaryEntry[] = [];

    const browsingContext = memoryManager.getBrowsingContext();
    if (browsingContext) {
      summaries.push({
        id: browsingContext.sessionId,
        type: "browsing_session",
        content: this.summarizeBrowsingSession(browsingContext),
        timestamp: browsingContext.startTime,
        source: "browser_agent",
      });
    }

    const voiceContext = memoryManager.getVoiceContext();
    if (voiceContext) {
      summaries.push({
        id: voiceContext.sessionId,
        type: "voice_session",
        content: this.summarizeVoiceSession(voiceContext),
        timestamp: voiceContext.startTime,
        source: "voice_agent",
      });
    }

    return {
      summaries,
      totalCount: summaries.length,
    };
  }

  /**
   * Generate knowledge graph export
   */
  async exportKnowledgeGraph(userId: string): Promise<KnowledgeGraphExport> {
    const memoryManager = getMemoryManager();

    // Note: In production, we'd have a method to get all nodes
    // For now, this is a placeholder structure
    return {
      nodes: [],
      edges: [],
      metadata: {
        nodeCount: 0,
        edgeCount: 0,
        lastUpdated: new Date(),
      },
    };
  }

  /**
   * Generate intent timeline export
   */
  async exportIntentTimeline(userId: string): Promise<IntentTimelineExport> {
    const memoryManager = getMemoryManager();
    const timeline: IntentEntry[] = [];

    const browsingContext = memoryManager.getBrowsingContext();
    if (browsingContext) {
      timeline.push({
        timestamp: browsingContext.startTime,
        intent: browsingContext.currentIntent,
        context: "browsing",
        confidence: 0.8,
      });
    }

    const voiceContext = memoryManager.getVoiceContext();
    if (voiceContext) {
      for (const intent of voiceContext.intents) {
        timeline.push({
          timestamp: intent.timestamp,
          intent: intent.type,
          context: "voice",
          confidence: intent.confidence,
        });
      }
    }

    // Sort by timestamp
    timeline.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

    return {
      timeline,
      totalCount: timeline.length,
    };
  }

  /**
   * Verify export integrity
   */
  verifyExport(
    payload: string,
    expectedChecksum: string
  ): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    const actualChecksum = this.calculateChecksum(payload);
    if (actualChecksum !== expectedChecksum) {
      errors.push("Checksum mismatch");
    }

    // Validate JSON structure
    try {
      JSON.parse(payload);
    } catch {
      errors.push("Invalid JSON structure");
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Request data deletion
   */
  async requestDataDeletion(userId: string): Promise<DeletionResult> {
    const memoryManager = getMemoryManager();
    const compliance = getComplianceChecker();

    // Perform full data wipe
    memoryManager.fullDataWipe();

    // Delete encryption keys
    const userKeys = this.keyManager.getKeysForUser(userId);
    for (const key of userKeys) {
      this.keyManager.deleteKey(key.keyId);
    }

    // Clear pending exports
    memoryManager.clearPendingExports();

    // Log audit event
    compliance.logAuditEvent(
      "data_access",
      "export",
      userId,
      { action: "data_deletion_completed" },
      "success"
    );

    return {
      success: true,
      deletedDataTypes: [
        "embeddings",
        "summaries",
        "knowledge_graph",
        "intent_timeline",
        "behavioral_patterns",
        "voice_transcripts",
        "preferences",
      ],
      deletedAt: new Date(),
      confirmationId: uuidv4(),
    };
  }

  /**
   * Get export job status
   */
  getExportJobStatus(jobId: string): ExportJob | undefined {
    return this.pendingExports.get(jobId);
  }

  // -------------------------------------------------------------------------
  // Private Helper Methods
  // -------------------------------------------------------------------------

  private getAllowedDataTypes(consentLevel: ConsentLevel): ExportDataType[] {
    const levelPermissions: Record<ConsentLevel, ExportDataType[]> = {
      none: [],
      minimal: ["preferences"],
      standard: ["preferences", "summaries"],
      enhanced: [
        "preferences",
        "summaries",
        "embeddings",
        "knowledge_graph",
        "behavioral_patterns",
        "intent_timeline",
      ],
      full: [
        "preferences",
        "summaries",
        "embeddings",
        "knowledge_graph",
        "behavioral_patterns",
        "intent_timeline",
        "voice_transcripts",
      ],
    };

    return levelPermissions[consentLevel];
  }

  private async collectExportData(
    userId: string,
    dataTypes: ExportDataType[]
  ): Promise<Record<string, unknown>> {
    const data: Record<string, unknown> = {};

    for (const type of dataTypes) {
      switch (type) {
        case "embeddings":
          data.embeddings = await this.exportEmbeddings(userId);
          break;
        case "summaries":
          data.summaries = await this.exportSummaries(userId);
          break;
        case "knowledge_graph":
          data.knowledgeGraph = await this.exportKnowledgeGraph(userId);
          break;
        case "intent_timeline":
          data.intentTimeline = await this.exportIntentTimeline(userId);
          break;
        case "behavioral_patterns":
          data.behavioralPatterns = await this.exportBehavioralPatterns(userId);
          break;
        case "voice_transcripts":
          data.voiceTranscripts = await this.exportVoiceTranscripts(userId);
          break;
        case "preferences":
          data.preferences = await this.exportPreferences(userId);
          break;
      }
    }

    return data;
  }

  private async exportBehavioralPatterns(
    userId: string
  ): Promise<BehavioralPatternsExport> {
    const memoryManager = getMemoryManager();
    const profile = memoryManager.getUserProfile();

    return {
      patterns: profile?.browsingPatterns ?? [],
      cognitiveProfile: profile?.cognitiveProfile ?? null,
    };
  }

  private async exportVoiceTranscripts(
    userId: string
  ): Promise<VoiceTranscriptsExport> {
    const memoryManager = getMemoryManager();
    const voiceContext = memoryManager.getVoiceContext();

    if (!voiceContext) {
      return { transcripts: [], totalDuration: 0 };
    }

    return {
      transcripts: voiceContext.transcriptions.map((t) => ({
        id: t.id,
        text: t.text,
        startTime: t.startTime,
        endTime: t.endTime,
        emotion: t.emotion,
      })),
      totalDuration: voiceContext.transcriptions.reduce(
        (sum, t) => sum + (t.endTime - t.startTime),
        0
      ),
    };
  }

  private async exportPreferences(userId: string): Promise<PreferencesExport> {
    const memoryManager = getMemoryManager();
    const profile = memoryManager.getUserProfile();

    return {
      interests: profile?.interests ?? [],
      cognitivePreferences: profile?.cognitiveProfile ?? null,
    };
  }

  private encrypt(
    plaintext: string,
    keyId: string
  ): { ciphertext: string; iv: string; authTag: string } {
    const key = this.keyManager.getKey(keyId);
    if (!key) {
      throw new Error("Encryption key not found");
    }

    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv(
      this.config.encryptionAlgorithm,
      key,
      iv
    ) as crypto.CipherGCM;

    let ciphertext = cipher.update(plaintext, "utf8", "base64");
    ciphertext += cipher.final("base64");

    const authTag = cipher.getAuthTag();

    return {
      ciphertext,
      iv: iv.toString("base64"),
      authTag: authTag.toString("base64"),
    };
  }

  private decrypt(
    ciphertext: string,
    keyId: string,
    iv: string,
    authTag: string
  ): string {
    const key = this.keyManager.getKey(keyId);
    if (!key) {
      throw new Error("Encryption key not found");
    }

    const decipher = crypto.createDecipheriv(
      this.config.encryptionAlgorithm,
      key,
      Buffer.from(iv, "base64")
    ) as crypto.DecipherGCM;

    decipher.setAuthTag(Buffer.from(authTag, "base64"));

    let plaintext = decipher.update(ciphertext, "base64", "utf8");
    plaintext += decipher.final("utf8");

    return plaintext;
  }

  private calculateChecksum(data: string): string {
    return crypto.createHash("sha256").update(data).digest("hex");
  }

  private summarizeBrowsingSession(session: BrowsingSession): string {
    return `Browsing session with ${session.urls.length} pages visited. ` +
      `Primary intent: ${session.currentIntent}. ` +
      `Categories: ${session.contentCategories.join(", ")}.`;
  }

  private summarizeVoiceSession(session: VoiceSession): string {
    return `Voice session with ${session.transcriptions.length} transcriptions. ` +
      `Overall sentiment: ${JSON.stringify(session.overallSentiment)}. ` +
      `Cognitive load: ${session.cognitiveState.cognitiveLoad.toFixed(2)}.`;
  }
}

// ============================================================================
// Export Types
// ============================================================================

interface ExportJob {
  id: string;
  userId: string;
  status: "pending" | "processing" | "completed" | "failed";
  dataTypes: ExportDataType[];
  createdAt: Date;
  completedAt?: Date;
  error?: string;
}

interface EmbeddingEntry {
  id: string;
  text: string;
  vector: number[];
  metadata: Record<string, unknown>;
}

interface EmbeddingsExport {
  embeddings: EmbeddingEntry[];
  totalCount: number;
}

interface SummaryEntry {
  id: string;
  type: string;
  content: string;
  timestamp: Date;
  source: string;
}

interface SummariesExport {
  summaries: SummaryEntry[];
  totalCount: number;
}

interface KnowledgeGraphExport {
  nodes: KnowledgeGraphNode[];
  edges: Array<{
    source: string;
    target: string;
    relationship: string;
    weight: number;
  }>;
  metadata: {
    nodeCount: number;
    edgeCount: number;
    lastUpdated: Date;
  };
}

interface IntentEntry {
  timestamp: Date;
  intent: string;
  context: string;
  confidence: number;
}

interface IntentTimelineExport {
  timeline: IntentEntry[];
  totalCount: number;
}

interface BehavioralPatternsExport {
  patterns: unknown[];
  cognitiveProfile: unknown | null;
}

interface VoiceTranscriptsExport {
  transcripts: Array<{
    id: string;
    text: string;
    startTime: number;
    endTime: number;
    emotion: string;
  }>;
  totalDuration: number;
}

interface PreferencesExport {
  interests: unknown[];
  cognitivePreferences: unknown | null;
}

interface DeletionResult {
  success: boolean;
  deletedDataTypes: ExportDataType[];
  deletedAt: Date;
  confirmationId: string;
}

// ============================================================================
// Singleton Instance
// ============================================================================

let exportAgentInstance: DataExportAgent | null = null;

export function getExportAgent(
  config?: Partial<ExportAgentConfig>
): DataExportAgent {
  if (!exportAgentInstance) {
    exportAgentInstance = new DataExportAgent(config);
  }
  return exportAgentInstance;
}

export function resetExportAgent(): void {
  exportAgentInstance = null;
}

// ============================================================================
// Export Tools for LangGraph
// ============================================================================

export const exportTools = [
  generateExportTool,
  verifyExportTool,
  getAuditLogTool,
];

export { generateExportTool, verifyExportTool, getAuditLogTool };
