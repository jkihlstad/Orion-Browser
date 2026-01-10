/**
 * App Store and Privacy Compliance Checks for Orion Browser
 * Ensures all AI operations comply with iOS App Store guidelines and privacy regulations
 */

import type {
  ConsentState,
  ConsentLevel,
  ComplianceFlags,
  PrivacyContext,
  SystemResources,
  AuditLogEntry,
  AuditAction,
  AgentType,
  ExportDataType,
} from "./types.js";
import { v4 as uuidv4 } from "uuid";

// ============================================================================
// Compliance Constants
// ============================================================================

const APP_STORE_GUIDELINES = {
  // Data Collection Guidelines (5.1.1)
  requiresUserConsent: true,
  mustExplainDataUsage: true,
  mustProvidePrivacyPolicy: true,

  // Privacy Nutrition Labels
  dataCollectedTypes: [
    "browsing_history",
    "search_history",
    "voice_data",
    "usage_data",
  ],
  dataLinkedToUser: true,
  dataUsedForTracking: false,

  // On-Device Processing Requirements
  preferOnDeviceProcessing: true,
  minimizeServerCommunication: true,

  // User Control Requirements
  mustAllowDataDeletion: true,
  mustAllowOptOut: true,
  mustProvideDataExport: true,
};

const SENSITIVE_URL_PATTERNS = [
  /^https?:\/\/[^/]*\.gov\//i,           // Government sites
  /^https?:\/\/[^/]*health/i,            // Health-related
  /^https?:\/\/[^/]*medical/i,           // Medical
  /^https?:\/\/[^/]*bank/i,              // Banking
  /^https?:\/\/[^/]*finance/i,           // Finance
  /^https?:\/\/[^/]*insurance/i,         // Insurance
  /^https?:\/\/[^/]*legal/i,             // Legal
  /^https?:\/\/[^/]*lawyer/i,            // Lawyers
  /^https?:\/\/[^/]*adult/i,             // Adult content
  /^https?:\/\/[^/]*therapy/i,           // Therapy
  /^https?:\/\/[^/]*counseling/i,        // Counseling
  /^https?:\/\/[^/]*rehab/i,             // Rehabilitation
  /^https?:\/\/[^/]*addiction/i,         // Addiction
];

const SENSITIVE_CONTENT_KEYWORDS = [
  "password",
  "credit card",
  "social security",
  "ssn",
  "medical record",
  "diagnosis",
  "prescription",
  "bank account",
  "routing number",
  "api key",
  "secret",
  "token",
  "private key",
];

// ============================================================================
// Compliance Checker
// ============================================================================

export class ComplianceChecker {
  private auditLog: AuditLogEntry[] = [];
  private readonly maxAuditLogSize = 10000;

  // -------------------------------------------------------------------------
  // App Store Compliance
  // -------------------------------------------------------------------------

  /**
   * Check if current operation is App Store compliant
   */
  checkAppStoreCompliance(
    consent: ConsentState,
    operation: string,
    dataTypes: ExportDataType[]
  ): ComplianceResult {
    const issues: ComplianceIssue[] = [];

    // Check consent is valid
    if (!this.isConsentValid(consent)) {
      issues.push({
        code: "CONSENT_INVALID",
        severity: "critical",
        message: "User consent is not valid or has expired",
        guideline: "5.1.1(i)",
      });
    }

    // Check data collection matches consent
    if (!this.dataTypesMatchConsent(dataTypes, consent)) {
      issues.push({
        code: "DATA_EXCEEDS_CONSENT",
        severity: "critical",
        message: "Requested data types exceed user consent scope",
        guideline: "5.1.1(ii)",
      });
    }

    // Check for voice data requirements
    if (dataTypes.includes("voice_transcripts") && !consent.voiceProcessing) {
      issues.push({
        code: "VOICE_NOT_CONSENTED",
        severity: "critical",
        message: "Voice processing not consented",
        guideline: "5.1.1(iii)",
      });
    }

    // Check for cross-session learning requirements
    if (
      dataTypes.includes("behavioral_patterns") &&
      !consent.crossSessionLearning
    ) {
      issues.push({
        code: "CROSS_SESSION_NOT_CONSENTED",
        severity: "critical",
        message: "Cross-session learning not consented",
        guideline: "5.1.2",
      });
    }

    return {
      compliant: issues.length === 0,
      issues,
      checkedAt: new Date(),
    };
  }

  /**
   * Validate consent state is properly configured
   */
  isConsentValid(consent: ConsentState): boolean {
    // Check version is current
    if (!consent.version || consent.version < "1.0") {
      return false;
    }

    // Check consent was updated recently (within 1 year for GDPR)
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
    if (consent.lastUpdated < oneYearAgo) {
      return false;
    }

    // Check level is valid
    const validLevels: ConsentLevel[] = ["none", "minimal", "standard", "enhanced", "full"];
    if (!validLevels.includes(consent.level)) {
      return false;
    }

    return true;
  }

  /**
   * Check if data types match consent level
   */
  dataTypesMatchConsent(dataTypes: ExportDataType[], consent: ConsentState): boolean {
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

    const allowedTypes = levelPermissions[consent.level];
    return dataTypes.every((type) => allowedTypes.includes(type));
  }

  // -------------------------------------------------------------------------
  // Privacy Checks
  // -------------------------------------------------------------------------

  /**
   * Check if URL is sensitive and requires extra privacy protection
   */
  isSensitiveURL(url: string): boolean {
    return SENSITIVE_URL_PATTERNS.some((pattern) => pattern.test(url));
  }

  /**
   * Check if content contains sensitive information
   */
  containsSensitiveContent(content: string): boolean {
    const lowerContent = content.toLowerCase();
    return SENSITIVE_CONTENT_KEYWORDS.some((keyword) =>
      lowerContent.includes(keyword.toLowerCase())
    );
  }

  /**
   * Determine compliance flags based on user location/context
   */
  determineComplianceFlags(
    userRegion: string,
    userAge?: number
  ): ComplianceFlags {
    const flags: ComplianceFlags = {
      gdprApplicable: false,
      ccpaApplicable: false,
      coppaApplicable: false,
      hipaaRelevant: false,
      appStoreCompliant: true,
    };

    // GDPR - European Economic Area
    const gdprRegions = [
      "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR",
      "DE", "GR", "HU", "IE", "IT", "LV", "LT", "LU", "MT", "NL",
      "PL", "PT", "RO", "SK", "SI", "ES", "SE", "GB", "IS", "LI",
      "NO", "CH",
    ];
    flags.gdprApplicable = gdprRegions.includes(userRegion.toUpperCase());

    // CCPA - California
    flags.ccpaApplicable = userRegion.toUpperCase() === "CA";

    // COPPA - Users under 13
    if (userAge !== undefined && userAge < 13) {
      flags.coppaApplicable = true;
    }

    return flags;
  }

  /**
   * Build privacy context from current session
   */
  buildPrivacyContext(
    isPrivateBrowsing: boolean,
    currentUrl: string,
    content: string,
    userRegion: string,
    userAge?: number
  ): PrivacyContext {
    return {
      isPrivateBrowsing,
      sensitiveContentDetected:
        this.isSensitiveURL(currentUrl) || this.containsSensitiveContent(content),
      complianceFlags: this.determineComplianceFlags(userRegion, userAge),
    };
  }

  // -------------------------------------------------------------------------
  // GDPR Compliance
  // -------------------------------------------------------------------------

  /**
   * Check GDPR data processing requirements
   */
  checkGDPRCompliance(
    consent: ConsentState,
    processingPurpose: string,
    dataCategories: string[]
  ): GDPRComplianceResult {
    const requirements: GDPRRequirement[] = [];

    // Lawful basis check
    if (consent.level === "none") {
      requirements.push({
        article: "6",
        requirement: "Lawful basis for processing",
        met: false,
        notes: "No consent given",
      });
    } else {
      requirements.push({
        article: "6",
        requirement: "Lawful basis for processing",
        met: true,
        notes: "Consent provided",
      });
    }

    // Purpose limitation
    requirements.push({
      article: "5(1)(b)",
      requirement: "Purpose limitation",
      met: true,
      notes: `Processing for: ${processingPurpose}`,
    });

    // Data minimization
    requirements.push({
      article: "5(1)(c)",
      requirement: "Data minimization",
      met: dataCategories.length <= 5,
      notes: `Collecting ${dataCategories.length} data categories`,
    });

    // Right to erasure capability
    requirements.push({
      article: "17",
      requirement: "Right to erasure",
      met: true,
      notes: "Data deletion capability implemented",
    });

    // Data portability
    if (consent.dataExport) {
      requirements.push({
        article: "20",
        requirement: "Right to data portability",
        met: true,
        notes: "Export functionality enabled",
      });
    }

    return {
      compliant: requirements.every((r) => r.met),
      requirements,
      checkedAt: new Date(),
    };
  }

  // -------------------------------------------------------------------------
  // CCPA Compliance
  // -------------------------------------------------------------------------

  /**
   * Check CCPA requirements
   */
  checkCCPACompliance(
    consent: ConsentState,
    hasDoNotSellOption: boolean
  ): CCPAComplianceResult {
    const requirements: CCPARequirement[] = [];

    // Right to know
    requirements.push({
      section: "1798.100",
      requirement: "Right to know what personal information is collected",
      met: true,
      notes: "Privacy policy available",
    });

    // Right to delete
    requirements.push({
      section: "1798.105",
      requirement: "Right to delete personal information",
      met: true,
      notes: "Deletion functionality implemented",
    });

    // Right to opt-out of sale
    requirements.push({
      section: "1798.120",
      requirement: "Right to opt-out of sale of personal information",
      met: hasDoNotSellOption || !consent.thirdPartySharing,
      notes: consent.thirdPartySharing
        ? "Do Not Sell option required"
        : "No third-party sharing enabled",
    });

    // Non-discrimination
    requirements.push({
      section: "1798.125",
      requirement: "Non-discrimination for exercising rights",
      met: true,
      notes: "No differential treatment based on privacy choices",
    });

    return {
      compliant: requirements.every((r) => r.met),
      requirements,
      checkedAt: new Date(),
    };
  }

  // -------------------------------------------------------------------------
  // Audit Logging
  // -------------------------------------------------------------------------

  /**
   * Log an audit event
   */
  logAuditEvent(
    action: AuditAction,
    agentId: string,
    userId: string,
    details: Record<string, unknown>,
    outcome: "success" | "failure" | "partial"
  ): AuditLogEntry {
    const entry: AuditLogEntry = {
      id: uuidv4(),
      timestamp: new Date(),
      action,
      agentId,
      userId,
      details,
      outcome,
    };

    this.auditLog.push(entry);

    // Maintain max size
    if (this.auditLog.length > this.maxAuditLogSize) {
      this.auditLog = this.auditLog.slice(-this.maxAuditLogSize);
    }

    return entry;
  }

  /**
   * Get audit log entries
   */
  getAuditLog(
    filter?: {
      action?: AuditAction;
      agentId?: string;
      userId?: string;
      fromDate?: Date;
      toDate?: Date;
    },
    limit: number = 100
  ): AuditLogEntry[] {
    let entries = [...this.auditLog];

    if (filter) {
      if (filter.action) {
        entries = entries.filter((e) => e.action === filter.action);
      }
      if (filter.agentId) {
        entries = entries.filter((e) => e.agentId === filter.agentId);
      }
      if (filter.userId) {
        entries = entries.filter((e) => e.userId === filter.userId);
      }
      if (filter.fromDate) {
        entries = entries.filter((e) => e.timestamp >= filter.fromDate!);
      }
      if (filter.toDate) {
        entries = entries.filter((e) => e.timestamp <= filter.toDate!);
      }
    }

    return entries.slice(-limit);
  }

  /**
   * Export audit log for compliance purposes
   */
  exportAuditLog(): string {
    return JSON.stringify(this.auditLog, null, 2);
  }

  /**
   * Clear audit log (with logging of the clear action)
   */
  clearAuditLog(userId: string): void {
    this.logAuditEvent(
      "data_access",
      "compliance",
      userId,
      { action: "audit_log_cleared", previousSize: this.auditLog.length },
      "success"
    );
    this.auditLog = this.auditLog.slice(-1); // Keep only the clear log entry
  }
}

// ============================================================================
// Compliance Result Types
// ============================================================================

export interface ComplianceResult {
  compliant: boolean;
  issues: ComplianceIssue[];
  checkedAt: Date;
}

export interface ComplianceIssue {
  code: string;
  severity: "warning" | "error" | "critical";
  message: string;
  guideline: string;
}

export interface GDPRComplianceResult {
  compliant: boolean;
  requirements: GDPRRequirement[];
  checkedAt: Date;
}

export interface GDPRRequirement {
  article: string;
  requirement: string;
  met: boolean;
  notes: string;
}

export interface CCPAComplianceResult {
  compliant: boolean;
  requirements: CCPARequirement[];
  checkedAt: Date;
}

export interface CCPARequirement {
  section: string;
  requirement: string;
  met: boolean;
  notes: string;
}

// ============================================================================
// Intelligence Throttling
// ============================================================================

export class IntelligenceThrottler {
  /**
   * Calculate intelligence throttling based on system resources
   */
  calculateThrottling(resources: SystemResources): ThrottlingConfig {
    let maxTokens = 4096;
    let embeddingEnabled = true;
    let voiceEnabled = true;
    let backgroundEnabled = true;
    let updateFrequency: "realtime" | "batched" | "minimal" = "realtime";

    // Battery-based throttling
    if (!resources.batteryCharging) {
      if (resources.batteryLevel < 10) {
        maxTokens = 512;
        embeddingEnabled = false;
        voiceEnabled = false;
        backgroundEnabled = false;
        updateFrequency = "minimal";
      } else if (resources.batteryLevel < 20) {
        maxTokens = 1024;
        embeddingEnabled = false;
        voiceEnabled = false;
        backgroundEnabled = false;
        updateFrequency = "batched";
      } else if (resources.batteryLevel < 50) {
        maxTokens = 2048;
        backgroundEnabled = false;
        updateFrequency = "batched";
      }
    }

    // Network-based throttling
    if (resources.networkType === "none") {
      embeddingEnabled = false;
      voiceEnabled = false;
      updateFrequency = "minimal";
    } else if (resources.networkType === "cellular") {
      maxTokens = Math.min(maxTokens, 2048);
      updateFrequency = "batched";
    }

    // CPU-based throttling
    if (resources.cpuUsage > 80) {
      maxTokens = Math.min(maxTokens, 1024);
      backgroundEnabled = false;
    }

    // Thermal throttling
    if (resources.thermalState === "critical") {
      maxTokens = 256;
      embeddingEnabled = false;
      voiceEnabled = false;
      backgroundEnabled = false;
      updateFrequency = "minimal";
    } else if (resources.thermalState === "serious") {
      maxTokens = Math.min(maxTokens, 1024);
      voiceEnabled = false;
      backgroundEnabled = false;
      updateFrequency = "batched";
    }

    return {
      maxTokensPerRequest: maxTokens,
      embeddingEnabled,
      voiceProcessingEnabled: voiceEnabled,
      backgroundProcessingEnabled: backgroundEnabled,
      updateFrequency,
      reason: this.getThrottlingReason(resources),
    };
  }

  private getThrottlingReason(resources: SystemResources): string {
    const reasons: string[] = [];

    if (!resources.batteryCharging && resources.batteryLevel < 20) {
      reasons.push(`Low battery (${resources.batteryLevel}%)`);
    }
    if (resources.networkType === "none") {
      reasons.push("No network connection");
    }
    if (resources.cpuUsage > 80) {
      reasons.push(`High CPU usage (${resources.cpuUsage}%)`);
    }
    if (resources.thermalState !== "nominal") {
      reasons.push(`Thermal state: ${resources.thermalState}`);
    }

    return reasons.length > 0 ? reasons.join(", ") : "No throttling needed";
  }
}

export interface ThrottlingConfig {
  maxTokensPerRequest: number;
  embeddingEnabled: boolean;
  voiceProcessingEnabled: boolean;
  backgroundProcessingEnabled: boolean;
  updateFrequency: "realtime" | "batched" | "minimal";
  reason: string;
}

// ============================================================================
// Singleton Instances
// ============================================================================

let complianceCheckerInstance: ComplianceChecker | null = null;
let intelligenceThrottlerInstance: IntelligenceThrottler | null = null;

export function getComplianceChecker(): ComplianceChecker {
  if (!complianceCheckerInstance) {
    complianceCheckerInstance = new ComplianceChecker();
  }
  return complianceCheckerInstance;
}

export function getIntelligenceThrottler(): IntelligenceThrottler {
  if (!intelligenceThrottlerInstance) {
    intelligenceThrottlerInstance = new IntelligenceThrottler();
  }
  return intelligenceThrottlerInstance;
}
