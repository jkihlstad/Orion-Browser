/**
 * Intelligence Level Types for Orion Browser
 *
 * Defines the three intelligence levels for AI features:
 * - Passive: AI only responds when explicitly asked
 * - Advisory: AI provides suggestions but waits for confirmation
 * - Proactive: AI takes actions automatically when confident
 *
 * @module types/intelligence
 */

// ============================================================================
// Core Intelligence Types
// ============================================================================

/**
 * Intelligence level enum
 */
export type IntelligenceLevel = "passive" | "advisory" | "proactive";

/**
 * Intelligence level configuration
 */
export interface IntelligenceLevelConfig {
  /** Level identifier */
  level: IntelligenceLevel;
  /** Display name */
  name: string;
  /** Description */
  description: string;
  /** Required consent level */
  requiredConsentLevel: number;
  /** Features available */
  features: IntelligenceFeature[];
  /** Automation level */
  automationLevel: AutomationLevel;
  /** Notification style */
  notificationStyle: NotificationStyle;
  /** Action confirmation required */
  requiresConfirmation: boolean;
  /** Maximum confidence for auto-action */
  maxAutoActionConfidence: number;
}

/**
 * Intelligence feature
 */
export interface IntelligenceFeature {
  /** Feature ID */
  id: string;
  /** Feature name */
  name: string;
  /** Description */
  description: string;
  /** Is enabled at this level */
  enabled: boolean;
  /** Is automatic at this level */
  isAutomatic: boolean;
  /** Confidence threshold for activation */
  confidenceThreshold: number;
}

/**
 * Automation level
 */
export type AutomationLevel = "none" | "suggested" | "semi-auto" | "full-auto";

/**
 * Notification style for AI actions
 */
export type NotificationStyle =
  | "silent" // No notification
  | "subtle" // Small indicator
  | "standard" // Normal notification
  | "prominent" // Requires attention
  | "blocking"; // Must acknowledge

// ============================================================================
// Intelligence Level Configurations
// ============================================================================

/**
 * Passive intelligence configuration
 */
export const PASSIVE_CONFIG: IntelligenceLevelConfig = {
  level: "passive",
  name: "Passive",
  description:
    "AI only responds when you explicitly ask. Maximum privacy and control.",
  requiredConsentLevel: 2,
  features: [
    {
      id: "explicit_search",
      name: "Explicit Search",
      description: "Search your history when you ask",
      enabled: true,
      isAutomatic: false,
      confidenceThreshold: 0,
    },
    {
      id: "manual_summary",
      name: "Manual Summary",
      description: "Summarize content on request",
      enabled: true,
      isAutomatic: false,
      confidenceThreshold: 0,
    },
    {
      id: "direct_questions",
      name: "Direct Questions",
      description: "Answer questions when asked",
      enabled: true,
      isAutomatic: false,
      confidenceThreshold: 0,
    },
  ],
  automationLevel: "none",
  notificationStyle: "silent",
  requiresConfirmation: false,
  maxAutoActionConfidence: 0,
};

/**
 * Advisory intelligence configuration
 */
export const ADVISORY_CONFIG: IntelligenceLevelConfig = {
  level: "advisory",
  name: "Advisory",
  description:
    "AI provides helpful suggestions and waits for your approval before acting.",
  requiredConsentLevel: 3,
  features: [
    {
      id: "explicit_search",
      name: "Explicit Search",
      description: "Search your history when you ask",
      enabled: true,
      isAutomatic: false,
      confidenceThreshold: 0,
    },
    {
      id: "manual_summary",
      name: "Manual Summary",
      description: "Summarize content on request",
      enabled: true,
      isAutomatic: false,
      confidenceThreshold: 0,
    },
    {
      id: "direct_questions",
      name: "Direct Questions",
      description: "Answer questions when asked",
      enabled: true,
      isAutomatic: false,
      confidenceThreshold: 0,
    },
    {
      id: "navigation_suggestions",
      name: "Navigation Suggestions",
      description: "Suggest relevant pages to visit",
      enabled: true,
      isAutomatic: false,
      confidenceThreshold: 0.6,
    },
    {
      id: "content_recommendations",
      name: "Content Recommendations",
      description: "Recommend related content",
      enabled: true,
      isAutomatic: false,
      confidenceThreshold: 0.6,
    },
    {
      id: "form_suggestions",
      name: "Form Suggestions",
      description: "Suggest form field values",
      enabled: true,
      isAutomatic: false,
      confidenceThreshold: 0.7,
    },
    {
      id: "voice_commands",
      name: "Voice Commands",
      description: "Execute voice commands with confirmation",
      enabled: true,
      isAutomatic: false,
      confidenceThreshold: 0.8,
    },
  ],
  automationLevel: "suggested",
  notificationStyle: "subtle",
  requiresConfirmation: true,
  maxAutoActionConfidence: 0,
};

/**
 * Proactive intelligence configuration
 */
export const PROACTIVE_CONFIG: IntelligenceLevelConfig = {
  level: "proactive",
  name: "Proactive",
  description:
    "AI anticipates your needs and takes actions automatically when confident.",
  requiredConsentLevel: 4,
  features: [
    {
      id: "explicit_search",
      name: "Explicit Search",
      description: "Search your history when you ask",
      enabled: true,
      isAutomatic: false,
      confidenceThreshold: 0,
    },
    {
      id: "manual_summary",
      name: "Manual Summary",
      description: "Summarize content on request",
      enabled: true,
      isAutomatic: false,
      confidenceThreshold: 0,
    },
    {
      id: "direct_questions",
      name: "Direct Questions",
      description: "Answer questions when asked",
      enabled: true,
      isAutomatic: false,
      confidenceThreshold: 0,
    },
    {
      id: "navigation_suggestions",
      name: "Navigation Suggestions",
      description: "Suggest relevant pages to visit",
      enabled: true,
      isAutomatic: true,
      confidenceThreshold: 0.5,
    },
    {
      id: "content_recommendations",
      name: "Content Recommendations",
      description: "Recommend related content",
      enabled: true,
      isAutomatic: true,
      confidenceThreshold: 0.5,
    },
    {
      id: "form_suggestions",
      name: "Form Suggestions",
      description: "Suggest and auto-fill form fields",
      enabled: true,
      isAutomatic: true,
      confidenceThreshold: 0.7,
    },
    {
      id: "voice_commands",
      name: "Voice Commands",
      description: "Execute voice commands automatically",
      enabled: true,
      isAutomatic: true,
      confidenceThreshold: 0.85,
    },
    {
      id: "predictive_loading",
      name: "Predictive Loading",
      description: "Pre-load pages you're likely to visit",
      enabled: true,
      isAutomatic: true,
      confidenceThreshold: 0.7,
    },
    {
      id: "smart_notifications",
      name: "Smart Notifications",
      description: "Proactively notify about relevant content",
      enabled: true,
      isAutomatic: true,
      confidenceThreshold: 0.6,
    },
    {
      id: "auto_organize",
      name: "Auto Organize",
      description: "Automatically organize tabs and bookmarks",
      enabled: true,
      isAutomatic: true,
      confidenceThreshold: 0.8,
    },
    {
      id: "context_switching",
      name: "Context Switching",
      description: "Automatically adjust based on activity context",
      enabled: true,
      isAutomatic: true,
      confidenceThreshold: 0.75,
    },
  ],
  automationLevel: "semi-auto",
  notificationStyle: "subtle",
  requiresConfirmation: false,
  maxAutoActionConfidence: 0.95,
};

/**
 * All intelligence level configurations
 */
export const INTELLIGENCE_CONFIGS: Record<
  IntelligenceLevel,
  IntelligenceLevelConfig
> = {
  passive: PASSIVE_CONFIG,
  advisory: ADVISORY_CONFIG,
  proactive: PROACTIVE_CONFIG,
};

// ============================================================================
// AI Action Types
// ============================================================================

/**
 * AI action category
 */
export type AIActionCategory =
  | "navigation"
  | "content"
  | "form"
  | "organization"
  | "notification"
  | "search"
  | "voice"
  | "system";

/**
 * AI action
 */
export interface AIAction {
  /** Action ID */
  id: string;
  /** Action category */
  category: AIActionCategory;
  /** Action type */
  type: string;
  /** Confidence score */
  confidence: number;
  /** Action payload */
  payload: Record<string, unknown>;
  /** Reasoning for the action */
  reasoning: string;
  /** Whether confirmation is required */
  requiresConfirmation: boolean;
  /** Suggested at timestamp */
  suggestedAt: number;
  /** Executed at timestamp */
  executedAt?: number;
  /** User feedback */
  feedback?: AIActionFeedback;
}

/**
 * AI action feedback
 */
export interface AIActionFeedback {
  /** Was the action accepted */
  accepted: boolean;
  /** Was it helpful */
  helpful?: boolean;
  /** User rating (1-5) */
  rating?: number;
  /** User comment */
  comment?: string;
  /** Feedback timestamp */
  timestamp: number;
}

/**
 * AI action result
 */
export interface AIActionResult {
  /** Action ID */
  actionId: string;
  /** Was successful */
  success: boolean;
  /** Result data */
  data?: Record<string, unknown>;
  /** Error message if failed */
  error?: string;
  /** Duration in ms */
  durationMs: number;
}

// ============================================================================
// Intelligence State
// ============================================================================

/**
 * Current intelligence state
 */
export interface IntelligenceState {
  /** Current level */
  level: IntelligenceLevel;
  /** Is AI currently active */
  isActive: boolean;
  /** Current context */
  context: IntelligenceContext;
  /** Pending actions */
  pendingActions: AIAction[];
  /** Recent actions */
  recentActions: AIAction[];
  /** Performance metrics */
  metrics: IntelligenceMetrics;
}

/**
 * Intelligence context
 */
export interface IntelligenceContext {
  /** Current URL */
  currentUrl?: string;
  /** Current page title */
  currentTitle?: string;
  /** Active domain */
  activeDomain?: string;
  /** Recent navigation */
  recentNavigation: string[];
  /** Recent searches */
  recentSearches: string[];
  /** Time of day context */
  timeContext: "morning" | "afternoon" | "evening" | "night";
  /** Day type */
  dayType: "weekday" | "weekend";
  /** Session duration (minutes) */
  sessionDuration: number;
  /** Activity level */
  activityLevel: "low" | "medium" | "high";
}

/**
 * Intelligence performance metrics
 */
export interface IntelligenceMetrics {
  /** Total suggestions made */
  totalSuggestions: number;
  /** Accepted suggestions */
  acceptedSuggestions: number;
  /** Rejected suggestions */
  rejectedSuggestions: number;
  /** Ignored suggestions */
  ignoredSuggestions: number;
  /** Average confidence of accepted suggestions */
  avgAcceptedConfidence: number;
  /** Average confidence of rejected suggestions */
  avgRejectedConfidence: number;
  /** Accuracy rate (accepted / total) */
  accuracyRate: number;
  /** User satisfaction (average rating) */
  userSatisfaction: number;
  /** Actions by category */
  actionsByCategory: Record<AIActionCategory, number>;
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Gets configuration for an intelligence level
 */
export function getIntelligenceConfig(
  level: IntelligenceLevel
): IntelligenceLevelConfig {
  return INTELLIGENCE_CONFIGS[level];
}

/**
 * Checks if a feature is available at a level
 */
export function isFeatureAvailable(
  level: IntelligenceLevel,
  featureId: string
): boolean {
  const config = INTELLIGENCE_CONFIGS[level];
  const feature = config.features.find((f) => f.id === featureId);
  return feature?.enabled ?? false;
}

/**
 * Checks if a feature is automatic at a level
 */
export function isFeatureAutomatic(
  level: IntelligenceLevel,
  featureId: string
): boolean {
  const config = INTELLIGENCE_CONFIGS[level];
  const feature = config.features.find((f) => f.id === featureId);
  return feature?.isAutomatic ?? false;
}

/**
 * Gets the confidence threshold for a feature
 */
export function getFeatureConfidenceThreshold(
  level: IntelligenceLevel,
  featureId: string
): number {
  const config = INTELLIGENCE_CONFIGS[level];
  const feature = config.features.find((f) => f.id === featureId);
  return feature?.confidenceThreshold ?? 1.0;
}

/**
 * Determines if an action should be auto-executed
 */
export function shouldAutoExecute(
  level: IntelligenceLevel,
  action: AIAction
): boolean {
  const config = INTELLIGENCE_CONFIGS[level];

  // Never auto-execute if level requires confirmation
  if (config.requiresConfirmation) {
    return false;
  }

  // Check if confidence exceeds max auto-action threshold
  if (action.confidence > config.maxAutoActionConfidence) {
    return false; // Too confident, might be a mistake
  }

  // Check feature-specific threshold
  const featureId = getFeatureIdForAction(action);
  const threshold = getFeatureConfidenceThreshold(level, featureId);

  return action.confidence >= threshold && isFeatureAutomatic(level, featureId);
}

/**
 * Gets the feature ID for an action
 */
function getFeatureIdForAction(action: AIAction): string {
  const categoryToFeature: Record<AIActionCategory, string> = {
    navigation: "navigation_suggestions",
    content: "content_recommendations",
    form: "form_suggestions",
    organization: "auto_organize",
    notification: "smart_notifications",
    search: "explicit_search",
    voice: "voice_commands",
    system: "context_switching",
  };

  return categoryToFeature[action.category] ?? "explicit_search";
}

/**
 * Calculates accuracy rate from metrics
 */
export function calculateAccuracyRate(
  accepted: number,
  rejected: number,
  ignored: number
): number {
  const total = accepted + rejected + ignored;
  if (total === 0) {
    return 0;
  }
  return accepted / total;
}

/**
 * Gets the notification style for an action
 */
export function getNotificationStyleForAction(
  level: IntelligenceLevel,
  action: AIAction
): NotificationStyle {
  const config = INTELLIGENCE_CONFIGS[level];

  // High-confidence proactive actions are silent
  if (
    level === "proactive" &&
    action.confidence > 0.9 &&
    !action.requiresConfirmation
  ) {
    return "silent";
  }

  // Actions requiring confirmation are prominent
  if (action.requiresConfirmation) {
    return "prominent";
  }

  return config.notificationStyle;
}

/**
 * Creates default intelligence metrics
 */
export function createDefaultMetrics(): IntelligenceMetrics {
  return {
    totalSuggestions: 0,
    acceptedSuggestions: 0,
    rejectedSuggestions: 0,
    ignoredSuggestions: 0,
    avgAcceptedConfidence: 0,
    avgRejectedConfidence: 0,
    accuracyRate: 0,
    userSatisfaction: 0,
    actionsByCategory: {
      navigation: 0,
      content: 0,
      form: 0,
      organization: 0,
      notification: 0,
      search: 0,
      voice: 0,
      system: 0,
    },
  };
}

/**
 * Validates an intelligence level
 */
export function isValidIntelligenceLevel(
  level: string
): level is IntelligenceLevel {
  return ["passive", "advisory", "proactive"].includes(level);
}
