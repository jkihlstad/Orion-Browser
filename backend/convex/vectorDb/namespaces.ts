/**
 * Vector Namespace Management for Orion Browser
 *
 * Provides namespace isolation for different types of data:
 * - Browsing: Web page content and history
 * - Voice: Voice interaction transcripts and commands
 * - Explicit: Age-verified explicit content (isolated)
 * - Preferences: User preferences and settings
 * - Interactions: UI interactions and patterns
 *
 * @module vectorDb/namespaces
 */

import { ConsentLevel } from "../types/consent";

// ============================================================================
// Types
// ============================================================================

/**
 * Available vector namespaces
 */
export type VectorNamespace =
  | "browsing"
  | "voice"
  | "explicit"
  | "preferences"
  | "interactions";

/**
 * Namespace configuration
 */
export interface NamespaceConfig {
  /** Display name */
  name: string;
  /** Description */
  description: string;
  /** Minimum consent level required */
  requiredConsentLevel: ConsentLevel;
  /** Maximum vectors allowed */
  maxVectors: number;
  /** Default retention period in days */
  defaultRetentionDays: number;
  /** Whether this namespace can be exported */
  exportable: boolean;
  /** Whether this namespace requires encryption */
  requiresEncryption: boolean;
  /** Isolation level */
  isolationLevel: "standard" | "strict" | "maximum";
  /** Allowed content types */
  allowedContentTypes: ContentType[];
  /** Cross-namespace linking allowed */
  allowCrossNamespaceLinks: boolean;
}

/**
 * Content types for vector entries
 */
export type ContentType =
  | "page"
  | "voice"
  | "search"
  | "interaction"
  | "preference";

/**
 * Namespace access result
 */
export interface NamespaceAccessResult {
  allowed: boolean;
  reason: string | null;
  namespace: VectorNamespace;
  config: NamespaceConfig;
}

/**
 * Namespace statistics
 */
export interface NamespaceStats {
  namespace: VectorNamespace;
  vectorCount: number;
  avgConfidence: number;
  oldestEntry: number | null;
  newestEntry: number | null;
  totalSize: number;
}

// ============================================================================
// Namespace Configuration
// ============================================================================

/**
 * Configuration for each namespace
 */
export const NAMESPACE_CONFIG: Record<VectorNamespace, NamespaceConfig> = {
  browsing: {
    name: "Browsing",
    description: "Web page content, browsing history, and search patterns",
    requiredConsentLevel: 2,
    maxVectors: 100000,
    defaultRetentionDays: 90,
    exportable: true,
    requiresEncryption: true,
    isolationLevel: "standard",
    allowedContentTypes: ["page", "search"],
    allowCrossNamespaceLinks: true,
  },
  voice: {
    name: "Voice",
    description: "Voice interaction transcripts, commands, and preferences",
    requiredConsentLevel: 3,
    maxVectors: 50000,
    defaultRetentionDays: 30,
    exportable: true,
    requiresEncryption: true,
    isolationLevel: "strict",
    allowedContentTypes: ["voice"],
    allowCrossNamespaceLinks: false,
  },
  explicit: {
    name: "Explicit Content",
    description: "Age-verified adult content (strictly isolated)",
    requiredConsentLevel: 4,
    maxVectors: 10000,
    defaultRetentionDays: 7,
    exportable: false,
    requiresEncryption: true,
    isolationLevel: "maximum",
    allowedContentTypes: ["page"],
    allowCrossNamespaceLinks: false,
  },
  preferences: {
    name: "Preferences",
    description: "User preferences, settings, and personalization data",
    requiredConsentLevel: 1,
    maxVectors: 10000,
    defaultRetentionDays: 365,
    exportable: true,
    requiresEncryption: false,
    isolationLevel: "standard",
    allowedContentTypes: ["preference"],
    allowCrossNamespaceLinks: true,
  },
  interactions: {
    name: "Interactions",
    description: "UI interactions, click patterns, and usage analytics",
    requiredConsentLevel: 2,
    maxVectors: 50000,
    defaultRetentionDays: 30,
    exportable: true,
    requiresEncryption: false,
    isolationLevel: "standard",
    allowedContentTypes: ["interaction"],
    allowCrossNamespaceLinks: true,
  },
};

// ============================================================================
// Namespace Access Control
// ============================================================================

/**
 * Checks if a user can access a specific namespace
 *
 * @param namespace - The namespace to check
 * @param userConsentLevel - The user's current consent level
 * @returns Access result with details
 *
 * @example
 * ```typescript
 * const result = canAccessNamespace("voice", 2);
 * if (!result.allowed) {
 *   console.log(`Cannot access: ${result.reason}`);
 * }
 * ```
 */
export function canAccessNamespace(
  namespace: VectorNamespace,
  userConsentLevel: ConsentLevel
): NamespaceAccessResult {
  const config = NAMESPACE_CONFIG[namespace];

  if (!config) {
    return {
      allowed: false,
      reason: `Unknown namespace: ${namespace}`,
      namespace,
      config: NAMESPACE_CONFIG.browsing, // Fallback config
    };
  }

  if (userConsentLevel < config.requiredConsentLevel) {
    return {
      allowed: false,
      reason: `Namespace '${config.name}' requires consent level ${config.requiredConsentLevel}, user has level ${userConsentLevel}`,
      namespace,
      config,
    };
  }

  return {
    allowed: true,
    reason: null,
    namespace,
    config,
  };
}

/**
 * Gets all namespaces accessible to a user
 *
 * @param userConsentLevel - The user's current consent level
 * @returns Array of accessible namespace configs
 */
export function getAccessibleNamespaces(
  userConsentLevel: ConsentLevel
): Array<{ namespace: VectorNamespace; config: NamespaceConfig }> {
  const namespaces = Object.entries(NAMESPACE_CONFIG) as Array<
    [VectorNamespace, NamespaceConfig]
  >;

  return namespaces
    .filter(([_, config]) => userConsentLevel >= config.requiredConsentLevel)
    .map(([namespace, config]) => ({ namespace, config }));
}

/**
 * Checks if a content type is allowed in a namespace
 *
 * @param namespace - The namespace to check
 * @param contentType - The content type to validate
 * @returns Whether the content type is allowed
 */
export function isContentTypeAllowed(
  namespace: VectorNamespace,
  contentType: ContentType
): boolean {
  const config = NAMESPACE_CONFIG[namespace];
  return config?.allowedContentTypes.includes(contentType) ?? false;
}

/**
 * Checks if cross-namespace linking is allowed
 *
 * @param sourceNamespace - Source namespace
 * @param targetNamespace - Target namespace
 * @returns Whether linking is allowed
 */
export function canLinkNamespaces(
  sourceNamespace: VectorNamespace,
  targetNamespace: VectorNamespace
): boolean {
  const sourceConfig = NAMESPACE_CONFIG[sourceNamespace];
  const targetConfig = NAMESPACE_CONFIG[targetNamespace];

  if (!sourceConfig || !targetConfig) {
    return false;
  }

  // Both must allow cross-namespace links
  return (
    sourceConfig.allowCrossNamespaceLinks &&
    targetConfig.allowCrossNamespaceLinks
  );
}

// ============================================================================
// Namespace Isolation
// ============================================================================

/**
 * Isolation levels and their properties
 */
export const ISOLATION_LEVELS = {
  standard: {
    description: "Basic isolation with encrypted storage",
    features: ["encrypted_at_rest", "user_scoped", "audit_logging"],
  },
  strict: {
    description: "Enhanced isolation with no cross-namespace access",
    features: [
      "encrypted_at_rest",
      "encrypted_in_transit",
      "user_scoped",
      "no_cross_namespace",
      "audit_logging",
      "access_logging",
    ],
  },
  maximum: {
    description: "Maximum isolation for sensitive content",
    features: [
      "encrypted_at_rest",
      "encrypted_in_transit",
      "user_scoped",
      "no_cross_namespace",
      "no_export",
      "audit_logging",
      "access_logging",
      "separate_encryption_key",
      "auto_expire",
    ],
  },
};

/**
 * Gets the isolation requirements for a namespace
 */
export function getIsolationRequirements(
  namespace: VectorNamespace
): string[] {
  const config = NAMESPACE_CONFIG[namespace];
  if (!config) {
    return [];
  }

  return ISOLATION_LEVELS[config.isolationLevel].features;
}

/**
 * Validates that an operation respects isolation requirements
 */
export function validateIsolation(
  namespace: VectorNamespace,
  operation: "read" | "write" | "export" | "link",
  targetNamespace?: VectorNamespace
): { valid: boolean; violations: string[] } {
  const config = NAMESPACE_CONFIG[namespace];
  const violations: string[] = [];

  if (!config) {
    return { valid: false, violations: ["Unknown namespace"] };
  }

  const requirements = getIsolationRequirements(namespace);

  // Check export restrictions
  if (
    operation === "export" &&
    (requirements.includes("no_export") || !config.exportable)
  ) {
    violations.push(
      `Namespace '${config.name}' does not allow data export`
    );
  }

  // Check cross-namespace linking
  if (operation === "link" && targetNamespace) {
    if (
      requirements.includes("no_cross_namespace") ||
      !config.allowCrossNamespaceLinks
    ) {
      violations.push(
        `Namespace '${config.name}' does not allow cross-namespace linking`
      );
    }
  }

  return {
    valid: violations.length === 0,
    violations,
  };
}

// ============================================================================
// Namespace Management
// ============================================================================

/**
 * Creates a namespace-scoped key for storage
 *
 * @param userId - The user ID
 * @param namespace - The namespace
 * @param key - The key within the namespace
 * @returns Scoped key string
 */
export function createNamespacedKey(
  userId: string,
  namespace: VectorNamespace,
  key: string
): string {
  return `${userId}:${namespace}:${key}`;
}

/**
 * Parses a namespaced key back to components
 *
 * @param namespacedKey - The full namespaced key
 * @returns Parsed components or null if invalid
 */
export function parseNamespacedKey(
  namespacedKey: string
): { userId: string; namespace: VectorNamespace; key: string } | null {
  const parts = namespacedKey.split(":");
  if (parts.length !== 3) {
    return null;
  }

  const [userId, namespace, key] = parts;
  if (!NAMESPACE_CONFIG[namespace as VectorNamespace]) {
    return null;
  }

  return {
    userId,
    namespace: namespace as VectorNamespace,
    key,
  };
}

/**
 * Gets the retention policy for a namespace
 */
export function getRetentionPolicy(
  namespace: VectorNamespace
): {
  retentionDays: number;
  autoDelete: boolean;
  canExtend: boolean;
} {
  const config = NAMESPACE_CONFIG[namespace];
  if (!config) {
    return { retentionDays: 30, autoDelete: true, canExtend: false };
  }

  return {
    retentionDays: config.defaultRetentionDays,
    autoDelete: config.isolationLevel === "maximum",
    canExtend: config.isolationLevel !== "maximum",
  };
}

/**
 * Calculates storage quota for a namespace
 */
export function getStorageQuota(
  namespace: VectorNamespace
): { maxVectors: number; maxSizeBytes: number } {
  const config = NAMESPACE_CONFIG[namespace];
  if (!config) {
    return { maxVectors: 10000, maxSizeBytes: 100 * 1024 * 1024 }; // 100MB default
  }

  // Estimate ~4KB per vector (embedding + metadata)
  const estimatedBytesPerVector = 4096;

  return {
    maxVectors: config.maxVectors,
    maxSizeBytes: config.maxVectors * estimatedBytesPerVector,
  };
}

// ============================================================================
// Domain-Specific Namespace Helpers
// ============================================================================

/**
 * Gets the appropriate namespace for a content type and sensitivity
 */
export function selectNamespace(
  contentType: ContentType,
  sensitivity: "public" | "private" | "sensitive" | "explicit"
): VectorNamespace {
  // Explicit content always goes to explicit namespace
  if (sensitivity === "explicit") {
    return "explicit";
  }

  // Map content types to default namespaces
  const namespaceMap: Record<ContentType, VectorNamespace> = {
    page: "browsing",
    search: "browsing",
    voice: "voice",
    interaction: "interactions",
    preference: "preferences",
  };

  return namespaceMap[contentType] ?? "browsing";
}

/**
 * Validates namespace configuration consistency
 */
export function validateNamespaceConfig(): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  for (const [namespace, config] of Object.entries(NAMESPACE_CONFIG)) {
    // Check retention days
    if (config.defaultRetentionDays < 1) {
      errors.push(`${namespace}: Invalid retention days`);
    }

    // Check max vectors
    if (config.maxVectors < 1) {
      errors.push(`${namespace}: Invalid max vectors`);
    }

    // Check consent level
    if (config.requiredConsentLevel < 0 || config.requiredConsentLevel > 4) {
      errors.push(`${namespace}: Invalid consent level`);
    }

    // Maximum isolation should not allow export
    if (config.isolationLevel === "maximum" && config.exportable) {
      errors.push(
        `${namespace}: Maximum isolation should not allow export`
      );
    }

    // Strict/maximum isolation should not allow cross-namespace links
    if (
      config.isolationLevel !== "standard" &&
      config.allowCrossNamespaceLinks
    ) {
      errors.push(
        `${namespace}: ${config.isolationLevel} isolation should not allow cross-namespace links`
      );
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
