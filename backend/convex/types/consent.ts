/**
 * Consent State Types for Orion Browser
 *
 * Implements a 5-step consent flow based on progressive disclosure:
 * - Level 0: No consent (basic functionality only)
 * - Level 1: Basic consent (essential personalization)
 * - Level 2: Standard consent (analytics and history)
 * - Level 3: Enhanced consent (AI features)
 * - Level 4: Full consent (all features including explicit content)
 *
 * @module types/consent
 */

// ============================================================================
// Core Consent Types
// ============================================================================

/**
 * Consent level enum (0-4)
 */
export type ConsentLevel = 0 | 1 | 2 | 3 | 4;

/**
 * Consent level names for display
 */
export const CONSENT_LEVEL_NAMES: Record<ConsentLevel, string> = {
  0: "No Consent",
  1: "Basic",
  2: "Standard",
  3: "Enhanced",
  4: "Full",
};

/**
 * Consent level descriptions
 */
export const CONSENT_LEVEL_DESCRIPTIONS: Record<ConsentLevel, string> = {
  0: "Essential browser functionality only. No data collection or personalization.",
  1: "Basic personalization with bookmarks and settings sync.",
  2: "Includes browsing history and search analytics for better recommendations.",
  3: "AI-powered features including advisory suggestions and voice commands.",
  4: "Full access to all features including proactive AI and explicit content handling.",
};

/**
 * Features available at each consent level
 */
export const CONSENT_LEVEL_FEATURES: Record<ConsentLevel, string[]> = {
  0: [
    "Basic browsing",
    "Tabs and windows",
    "Private mode",
    "Local bookmarks",
  ],
  1: [
    "...all previous features",
    "Cloud bookmark sync",
    "Settings sync",
    "Basic preferences",
  ],
  2: [
    "...all previous features",
    "Browsing history sync",
    "Search suggestions",
    "Site recommendations",
    "Usage analytics",
  ],
  3: [
    "...all previous features",
    "AI advisory suggestions",
    "Voice commands",
    "Smart autocomplete",
    "Pattern recognition",
  ],
  4: [
    "...all previous features",
    "Proactive AI assistance",
    "Explicit content handling",
    "Cross-domain intelligence",
    "Advanced personalization",
  ],
};

/**
 * Complete consent state
 */
export interface ConsentState {
  /** Current consent level */
  level: ConsentLevel;
  /** Timestamp of last consent update */
  updatedAt: number;
  /** Consent history */
  history: ConsentHistoryEntry[];
  /** Granular permissions */
  permissions: ConsentPermissions;
  /** Pending consent changes */
  pendingChanges?: PendingConsentChange;
  /** Withdrawal requests */
  withdrawalRequests: ConsentWithdrawalRequest[];
}

/**
 * Consent history entry
 */
export interface ConsentHistoryEntry {
  /** Previous level */
  fromLevel: ConsentLevel;
  /** New level */
  toLevel: ConsentLevel;
  /** Timestamp of change */
  timestamp: number;
  /** Method of consent */
  method: ConsentMethod;
  /** Source of change */
  source: ConsentSource;
  /** IP address (for audit) */
  ipAddress?: string;
  /** User agent (for audit) */
  userAgent?: string;
}

/**
 * Method of consent collection
 */
export type ConsentMethod =
  | "explicit_click" // User clicked consent button
  | "checkbox" // User checked consent checkbox
  | "modal_accept" // User accepted modal dialog
  | "settings_change" // Changed in settings
  | "onboarding" // During onboarding flow
  | "api" // Via API call
  | "import"; // Imported from external source

/**
 * Source of consent change
 */
export type ConsentSource =
  | "ios_app"
  | "macos_app"
  | "web_app"
  | "settings_page"
  | "onboarding_flow"
  | "privacy_center"
  | "admin_panel"
  | "automated";

/**
 * Granular consent permissions
 */
export interface ConsentPermissions {
  // Data Collection
  collectBrowsingHistory: boolean;
  collectSearchQueries: boolean;
  collectBookmarks: boolean;
  collectVoiceData: boolean;
  collectInteractionData: boolean;

  // Data Usage
  useForRecommendations: boolean;
  useForPersonalization: boolean;
  useForAnalytics: boolean;
  useForAITraining: boolean;
  useForImprovement: boolean;

  // Features
  enableAISuggestions: boolean;
  enableVoiceCommands: boolean;
  enableProactiveAssistance: boolean;
  enableExplicitContent: boolean;
  enableCrossDeviceSync: boolean;

  // Third Party
  shareWithPartners: boolean;
  enableThirdPartyIntegrations: boolean;
}

/**
 * Default permissions for each consent level
 */
export const DEFAULT_PERMISSIONS: Record<ConsentLevel, ConsentPermissions> = {
  0: {
    collectBrowsingHistory: false,
    collectSearchQueries: false,
    collectBookmarks: false,
    collectVoiceData: false,
    collectInteractionData: false,
    useForRecommendations: false,
    useForPersonalization: false,
    useForAnalytics: false,
    useForAITraining: false,
    useForImprovement: false,
    enableAISuggestions: false,
    enableVoiceCommands: false,
    enableProactiveAssistance: false,
    enableExplicitContent: false,
    enableCrossDeviceSync: false,
    shareWithPartners: false,
    enableThirdPartyIntegrations: false,
  },
  1: {
    collectBrowsingHistory: false,
    collectSearchQueries: false,
    collectBookmarks: true,
    collectVoiceData: false,
    collectInteractionData: false,
    useForRecommendations: false,
    useForPersonalization: true,
    useForAnalytics: false,
    useForAITraining: false,
    useForImprovement: false,
    enableAISuggestions: false,
    enableVoiceCommands: false,
    enableProactiveAssistance: false,
    enableExplicitContent: false,
    enableCrossDeviceSync: true,
    shareWithPartners: false,
    enableThirdPartyIntegrations: false,
  },
  2: {
    collectBrowsingHistory: true,
    collectSearchQueries: true,
    collectBookmarks: true,
    collectVoiceData: false,
    collectInteractionData: true,
    useForRecommendations: true,
    useForPersonalization: true,
    useForAnalytics: true,
    useForAITraining: false,
    useForImprovement: true,
    enableAISuggestions: false,
    enableVoiceCommands: false,
    enableProactiveAssistance: false,
    enableExplicitContent: false,
    enableCrossDeviceSync: true,
    shareWithPartners: false,
    enableThirdPartyIntegrations: false,
  },
  3: {
    collectBrowsingHistory: true,
    collectSearchQueries: true,
    collectBookmarks: true,
    collectVoiceData: true,
    collectInteractionData: true,
    useForRecommendations: true,
    useForPersonalization: true,
    useForAnalytics: true,
    useForAITraining: true,
    useForImprovement: true,
    enableAISuggestions: true,
    enableVoiceCommands: true,
    enableProactiveAssistance: false,
    enableExplicitContent: false,
    enableCrossDeviceSync: true,
    shareWithPartners: false,
    enableThirdPartyIntegrations: true,
  },
  4: {
    collectBrowsingHistory: true,
    collectSearchQueries: true,
    collectBookmarks: true,
    collectVoiceData: true,
    collectInteractionData: true,
    useForRecommendations: true,
    useForPersonalization: true,
    useForAnalytics: true,
    useForAITraining: true,
    useForImprovement: true,
    enableAISuggestions: true,
    enableVoiceCommands: true,
    enableProactiveAssistance: true,
    enableExplicitContent: true,
    enableCrossDeviceSync: true,
    shareWithPartners: true,
    enableThirdPartyIntegrations: true,
  },
};

// ============================================================================
// 5-Step Consent Flow
// ============================================================================

/**
 * Step in the consent flow
 */
export interface ConsentFlowStep {
  /** Step number (1-5) */
  step: 1 | 2 | 3 | 4 | 5;
  /** Step name */
  name: string;
  /** Step description */
  description: string;
  /** Corresponding consent level */
  consentLevel: ConsentLevel;
  /** Features unlocked at this step */
  featuresUnlocked: string[];
  /** Data collected at this step */
  dataCollected: string[];
  /** Required acknowledgments */
  requiredAcknowledgments: string[];
  /** Is this step optional */
  isOptional: boolean;
  /** Can skip to end */
  canSkip: boolean;
}

/**
 * The 5-step consent flow definition
 */
export const CONSENT_FLOW_STEPS: ConsentFlowStep[] = [
  {
    step: 1,
    name: "Essential Privacy",
    description: "Start with maximum privacy. No data is collected or shared.",
    consentLevel: 0,
    featuresUnlocked: [
      "Basic browsing",
      "Tabs management",
      "Private mode",
      "Local storage only",
    ],
    dataCollected: [],
    requiredAcknowledgments: [
      "I understand this browser can work without collecting my data",
    ],
    isOptional: false,
    canSkip: false,
  },
  {
    step: 2,
    name: "Basic Personalization",
    description: "Enable cloud sync for bookmarks and settings across devices.",
    consentLevel: 1,
    featuresUnlocked: [
      "Bookmark sync",
      "Settings sync",
      "Device handoff",
    ],
    dataCollected: [
      "Bookmarks (encrypted)",
      "Browser settings",
      "Device identifiers",
    ],
    requiredAcknowledgments: [
      "I consent to syncing my bookmarks and settings",
      "I understand my data is encrypted end-to-end",
    ],
    isOptional: true,
    canSkip: true,
  },
  {
    step: 3,
    name: "Smart Browsing",
    description: "Get personalized recommendations based on your browsing habits.",
    consentLevel: 2,
    featuresUnlocked: [
      "Browsing history sync",
      "Search suggestions",
      "Site recommendations",
      "Reading list",
    ],
    dataCollected: [
      "Browsing history (hashed URLs)",
      "Search queries",
      "Interaction patterns",
    ],
    requiredAcknowledgments: [
      "I consent to my browsing history being stored",
      "I understand how my data improves recommendations",
    ],
    isOptional: true,
    canSkip: true,
  },
  {
    step: 4,
    name: "AI Assistant",
    description: "Enable AI-powered features for a smarter browsing experience.",
    consentLevel: 3,
    featuresUnlocked: [
      "AI suggestions",
      "Voice commands",
      "Smart autocomplete",
      "Content summaries",
    ],
    dataCollected: [
      "Voice recordings (processed, not stored)",
      "Content context",
      "AI interaction patterns",
    ],
    requiredAcknowledgments: [
      "I consent to AI analysis of my browsing context",
      "I understand voice data is processed for commands",
    ],
    isOptional: true,
    canSkip: true,
  },
  {
    step: 5,
    name: "Full Experience",
    description: "Unlock all features including proactive assistance.",
    consentLevel: 4,
    featuresUnlocked: [
      "Proactive AI suggestions",
      "Predictive navigation",
      "Advanced personalization",
      "Explicit content handling",
    ],
    dataCollected: [
      "Extended interaction data",
      "Preference patterns",
      "Cross-site context",
    ],
    requiredAcknowledgments: [
      "I consent to proactive AI assistance",
      "I verify I am 18+ for explicit content features",
      "I understand the full scope of data collection",
    ],
    isOptional: true,
    canSkip: true,
  },
];

/**
 * Consent flow state
 */
export interface ConsentFlowState {
  /** Current step in the flow */
  currentStep: 1 | 2 | 3 | 4 | 5;
  /** Completed steps */
  completedSteps: number[];
  /** Skipped steps */
  skippedSteps: number[];
  /** Acknowledgments given */
  acknowledgments: Map<number, string[]>;
  /** Flow started at */
  startedAt: number;
  /** Flow completed at */
  completedAt?: number;
  /** Is flow complete */
  isComplete: boolean;
}

// ============================================================================
// Consent Withdrawal
// ============================================================================

/**
 * Pending consent change
 */
export interface PendingConsentChange {
  /** New requested level */
  requestedLevel: ConsentLevel;
  /** Requested at */
  requestedAt: number;
  /** Effective at */
  effectiveAt: number;
  /** Reason for pending (e.g., data deletion in progress) */
  reason: string;
}

/**
 * Consent withdrawal request
 */
export interface ConsentWithdrawalRequest {
  /** Request ID */
  id: string;
  /** Requested at */
  requestedAt: number;
  /** Previous level */
  fromLevel: ConsentLevel;
  /** New level */
  toLevel: ConsentLevel;
  /** Status */
  status: "pending" | "processing" | "completed" | "failed";
  /** Data deletion status */
  dataDeletionStatus: DataDeletionStatus;
  /** Completed at */
  completedAt?: number;
  /** Error message if failed */
  error?: string;
}

/**
 * Data deletion status during withdrawal
 */
export interface DataDeletionStatus {
  /** Vectors deleted */
  vectorsDeleted: number;
  /** Vectors remaining */
  vectorsRemaining: number;
  /** Namespaces processed */
  namespacesProcessed: string[];
  /** Namespaces remaining */
  namespacesRemaining: string[];
  /** Estimated completion */
  estimatedCompletionAt?: number;
}

// ============================================================================
// Consent Validation
// ============================================================================

/**
 * Validates if a consent level is valid
 */
export function isValidConsentLevel(level: number): level is ConsentLevel {
  return [0, 1, 2, 3, 4].includes(level);
}

/**
 * Gets the minimum consent level required for a permission
 */
export function getRequiredConsentLevel(
  permission: keyof ConsentPermissions
): ConsentLevel {
  for (let level = 0 as ConsentLevel; level <= 4; level++) {
    if (DEFAULT_PERMISSIONS[level][permission]) {
      return level;
    }
  }
  return 4; // Default to highest if not found
}

/**
 * Checks if a permission is granted at a consent level
 */
export function hasPermission(
  level: ConsentLevel,
  permission: keyof ConsentPermissions
): boolean {
  return DEFAULT_PERMISSIONS[level][permission];
}

/**
 * Gets all permissions granted at a consent level
 */
export function getGrantedPermissions(
  level: ConsentLevel
): (keyof ConsentPermissions)[] {
  const permissions = DEFAULT_PERMISSIONS[level];
  return (Object.keys(permissions) as (keyof ConsentPermissions)[]).filter(
    (key) => permissions[key]
  );
}

/**
 * Calculates what permissions would be lost when downgrading
 */
export function getPermissionsLost(
  fromLevel: ConsentLevel,
  toLevel: ConsentLevel
): (keyof ConsentPermissions)[] {
  if (toLevel >= fromLevel) {
    return [];
  }

  const fromPermissions = getGrantedPermissions(fromLevel);
  const toPermissions = new Set(getGrantedPermissions(toLevel));

  return fromPermissions.filter((p) => !toPermissions.has(p));
}

/**
 * Creates a default consent state
 */
export function createDefaultConsentState(): ConsentState {
  return {
    level: 0,
    updatedAt: Date.now(),
    history: [],
    permissions: DEFAULT_PERMISSIONS[0],
    withdrawalRequests: [],
  };
}

/**
 * Gets the consent flow step for a level
 */
export function getConsentFlowStep(level: ConsentLevel): ConsentFlowStep {
  const step = CONSENT_FLOW_STEPS.find((s) => s.consentLevel === level);
  return step ?? CONSENT_FLOW_STEPS[0];
}
