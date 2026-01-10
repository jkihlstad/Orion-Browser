/**
 * API Request/Response Types for Orion Browser
 *
 * Defines the contract for all API endpoints including:
 * - Request payload schemas
 * - Response structures
 * - Error types
 * - Pagination
 * - Common patterns
 *
 * @module types/api
 */

// ============================================================================
// Base Types
// ============================================================================

/**
 * Base API response wrapper
 */
export interface ApiResponse<T> {
  /** Whether the request was successful */
  success: boolean;
  /** Response data (present on success) */
  data?: T;
  /** Error information (present on failure) */
  error?: ApiError;
  /** Request metadata */
  meta: ResponseMeta;
}

/**
 * API error structure
 */
export interface ApiError {
  /** Error code for programmatic handling */
  code: ErrorCode;
  /** Human-readable error message */
  message: string;
  /** Additional error details */
  details?: Record<string, unknown>;
  /** Stack trace (development only) */
  stack?: string;
  /** Suggested action for the client */
  suggestedAction?: string;
  /** Documentation link for the error */
  docsUrl?: string;
}

/**
 * Response metadata
 */
export interface ResponseMeta {
  /** Request ID for tracing */
  requestId: string;
  /** Server timestamp */
  timestamp: number;
  /** Response time in ms */
  responseTimeMs: number;
  /** API version */
  version: string;
  /** Rate limit information */
  rateLimit?: RateLimitInfo;
}

/**
 * Rate limit information
 */
export interface RateLimitInfo {
  /** Maximum requests in window */
  limit: number;
  /** Remaining requests in window */
  remaining: number;
  /** Window reset timestamp */
  resetAt: number;
  /** Window duration in seconds */
  windowSeconds: number;
}

/**
 * Error codes
 */
export type ErrorCode =
  // Authentication errors
  | "AUTH_REQUIRED"
  | "AUTH_INVALID_TOKEN"
  | "AUTH_EXPIRED_TOKEN"
  | "AUTH_INSUFFICIENT_PERMISSIONS"
  // Validation errors
  | "VALIDATION_ERROR"
  | "INVALID_INPUT"
  | "MISSING_REQUIRED_FIELD"
  | "INVALID_FORMAT"
  // Resource errors
  | "NOT_FOUND"
  | "ALREADY_EXISTS"
  | "CONFLICT"
  // Rate limiting
  | "RATE_LIMITED"
  | "QUOTA_EXCEEDED"
  // Consent errors
  | "CONSENT_REQUIRED"
  | "CONSENT_LEVEL_INSUFFICIENT"
  // Server errors
  | "INTERNAL_ERROR"
  | "SERVICE_UNAVAILABLE"
  | "TIMEOUT"
  // Feature errors
  | "FEATURE_DISABLED"
  | "NOT_IMPLEMENTED";

// ============================================================================
// Pagination
// ============================================================================

/**
 * Pagination parameters for requests
 */
export interface PaginationParams {
  /** Number of items per page (default: 20, max: 100) */
  limit?: number;
  /** Cursor for next page */
  cursor?: string;
  /** Sort field */
  sortBy?: string;
  /** Sort direction */
  sortOrder?: "asc" | "desc";
}

/**
 * Pagination information in responses
 */
export interface PaginationInfo {
  /** Total items (if available) */
  total?: number;
  /** Items in current page */
  count: number;
  /** Cursor for next page */
  nextCursor?: string;
  /** Cursor for previous page */
  prevCursor?: string;
  /** Whether there are more items */
  hasMore: boolean;
}

/**
 * Paginated response wrapper
 */
export interface PaginatedResponse<T> {
  /** Items in current page */
  items: T[];
  /** Pagination information */
  pagination: PaginationInfo;
}

// ============================================================================
// Authentication Endpoints
// ============================================================================

/**
 * Token refresh request
 */
export interface TokenRefreshRequest {
  /** Refresh token */
  refreshToken: string;
}

/**
 * Token refresh response
 */
export interface TokenRefreshResponse {
  /** New access token */
  accessToken: string;
  /** New refresh token */
  refreshToken: string;
  /** Token expiration timestamp */
  expiresAt: number;
}

/**
 * Session info request
 */
export interface SessionInfoRequest {
  /** Include device info */
  includeDevices?: boolean;
}

/**
 * Session info response
 */
export interface SessionInfoResponse {
  /** Session ID */
  sessionId: string;
  /** User ID */
  userId: string;
  /** Session creation time */
  createdAt: number;
  /** Last activity time */
  lastActiveAt: number;
  /** Session expiration time */
  expiresAt: number;
  /** Device information */
  device?: DeviceInfo;
  /** Active devices (if requested) */
  devices?: DeviceInfo[];
}

/**
 * Device information
 */
export interface DeviceInfo {
  /** Device ID */
  deviceId: string;
  /** Device name */
  name: string;
  /** Device type */
  type: "ios" | "macos" | "web";
  /** OS version */
  osVersion: string;
  /** App version */
  appVersion: string;
  /** Last seen timestamp */
  lastSeenAt: number;
  /** Is current device */
  isCurrent: boolean;
}

// ============================================================================
// Vector Database Endpoints
// ============================================================================

/**
 * Vector upsert request
 */
export interface VectorUpsertRequest {
  /** Namespace for the vector */
  namespace: string;
  /** Content to embed */
  content: string;
  /** Pre-computed embedding (optional) */
  embedding?: number[];
  /** Metadata */
  metadata: VectorMetadataInput;
  /** Confidence score (0-1) */
  confidence?: number;
}

/**
 * Vector metadata input
 */
export interface VectorMetadataInput {
  /** Source URL or identifier */
  source: string;
  /** Content type */
  contentType: "page" | "voice" | "search" | "interaction" | "preference";
  /** Domain */
  domain: string;
  /** Title */
  title?: string;
  /** Summary */
  summary?: string;
  /** Tags */
  tags?: string[];
  /** Language */
  language?: string;
  /** Sensitivity level */
  sensitivity?: "public" | "private" | "sensitive" | "explicit";
  /** Custom metadata */
  custom?: Record<string, unknown>;
}

/**
 * Vector upsert response
 */
export interface VectorUpsertResponse {
  /** Vector ID */
  id: string;
  /** Whether a new vector was created */
  isNew: boolean;
  /** New confidence score */
  confidence: number;
}

/**
 * Similarity search request
 */
export interface SimilaritySearchRequest {
  /** Query text (will be embedded) */
  query?: string;
  /** Pre-computed query embedding */
  queryEmbedding?: number[];
  /** Namespaces to search */
  namespaces: string[];
  /** Search options */
  options?: SearchOptionsInput;
}

/**
 * Search options input
 */
export interface SearchOptionsInput {
  /** Maximum results */
  limit?: number;
  /** Minimum similarity threshold */
  minSimilarity?: number;
  /** Minimum confidence threshold */
  minConfidence?: number;
  /** Apply time decay */
  applyTimeDecay?: boolean;
  /** Filter by content types */
  contentTypes?: string[];
  /** Filter by domains */
  domains?: string[];
  /** Filter by tags */
  tags?: string[];
  /** Filter by language */
  language?: string;
  /** Time range filter */
  timeRange?: {
    after?: number;
    before?: number;
  };
}

/**
 * Search result item
 */
export interface SearchResultItem {
  /** Vector ID */
  id: string;
  /** Similarity score */
  similarity: number;
  /** Weighted score */
  weightedScore: number;
  /** Content */
  content: string;
  /** Metadata */
  metadata: {
    source: string;
    contentType: string;
    domain: string;
    title?: string;
    summary?: string;
    tags: string[];
  };
  /** Created timestamp */
  createdAt: number;
  /** Namespace */
  namespace: string;
}

/**
 * Similarity search response
 */
export interface SimilaritySearchResponse {
  /** Search results */
  results: SearchResultItem[];
  /** Total matches */
  totalMatches: number;
  /** Search duration */
  searchDurationMs: number;
}

// ============================================================================
// User Endpoints
// ============================================================================

/**
 * User profile request
 */
export interface UserProfileRequest {
  /** Include preferences */
  includePreferences?: boolean;
  /** Include statistics */
  includeStats?: boolean;
}

/**
 * User profile response
 */
export interface UserProfileResponse {
  /** User ID */
  userId: string;
  /** Email */
  email: string;
  /** Full name */
  fullName: string | null;
  /** Profile image URL */
  imageUrl: string | null;
  /** Consent level */
  consentLevel: number;
  /** Intelligence level */
  intelligenceLevel: "passive" | "advisory" | "proactive";
  /** Privacy settings */
  privacySettings: {
    dataRetentionDays: number;
    allowAnalytics: boolean;
    allowPersonalization: boolean;
  };
  /** Preferences (if requested) */
  preferences?: UserPreferences;
  /** Statistics (if requested) */
  stats?: UserStats;
  /** Account creation time */
  createdAt: number;
  /** Last activity time */
  lastActiveAt: number;
}

/**
 * User preferences
 */
export interface UserPreferences {
  /** UI theme */
  theme: "light" | "dark" | "system";
  /** Language */
  language: string;
  /** Notifications enabled */
  notifications: boolean;
  /** Voice features enabled */
  voiceEnabled: boolean;
  /** Haptic feedback enabled */
  hapticFeedback: boolean;
  /** Custom preferences */
  custom: Record<string, unknown>;
}

/**
 * User statistics
 */
export interface UserStats {
  /** Total vectors stored */
  totalVectors: number;
  /** Vectors by namespace */
  vectorsByNamespace: Record<string, number>;
  /** Total searches performed */
  totalSearches: number;
  /** Account age in days */
  accountAgeDays: number;
}

/**
 * Update preferences request
 */
export interface UpdatePreferencesRequest {
  /** Preferences to update */
  preferences: Partial<UserPreferences>;
}

/**
 * Update consent request
 */
export interface UpdateConsentRequest {
  /** New consent level */
  consentLevel: number;
  /** Consent details */
  consentDetails?: {
    /** Consent timestamp */
    timestamp: number;
    /** Consent method */
    method: "explicit" | "settings" | "onboarding";
    /** IP address (for audit) */
    ipAddress?: string;
    /** User agent (for audit) */
    userAgent?: string;
  };
}

// ============================================================================
// AI/Intelligence Endpoints
// ============================================================================

/**
 * AI suggestion request
 */
export interface AISuggestionRequest {
  /** Current context */
  context: {
    /** Current URL */
    currentUrl?: string;
    /** Current page content */
    pageContent?: string;
    /** Recent history */
    recentHistory?: string[];
    /** Current selection */
    selection?: string;
  };
  /** Suggestion type */
  type: "navigation" | "content" | "action" | "search";
  /** Maximum suggestions */
  maxSuggestions?: number;
}

/**
 * AI suggestion item
 */
export interface AISuggestionItem {
  /** Suggestion ID */
  id: string;
  /** Suggestion type */
  type: "navigation" | "content" | "action" | "search";
  /** Suggestion text */
  text: string;
  /** Confidence score */
  confidence: number;
  /** Action to take */
  action: {
    /** Action type */
    type: "navigate" | "fill" | "click" | "search" | "copy";
    /** Action target */
    target?: string;
    /** Action data */
    data?: Record<string, unknown>;
  };
  /** Reasoning */
  reasoning?: string;
}

/**
 * AI suggestion response
 */
export interface AISuggestionResponse {
  /** Suggestions */
  suggestions: AISuggestionItem[];
  /** Processing time */
  processingTimeMs: number;
  /** Model used */
  model: string;
}

/**
 * Voice command request
 */
export interface VoiceCommandRequest {
  /** Audio data (base64) */
  audioData?: string;
  /** Transcription (if already transcribed) */
  transcription?: string;
  /** Audio format */
  format?: "wav" | "mp3" | "m4a";
  /** Language hint */
  language?: string;
}

/**
 * Voice command response
 */
export interface VoiceCommandResponse {
  /** Transcription */
  transcription: string;
  /** Detected intent */
  intent: {
    /** Intent type */
    type: string;
    /** Confidence */
    confidence: number;
    /** Extracted entities */
    entities: Record<string, string>;
  };
  /** Suggested action */
  action?: {
    type: string;
    target?: string;
    data?: Record<string, unknown>;
  };
  /** Response text (for TTS) */
  responseText?: string;
}

// ============================================================================
// Export Endpoints
// ============================================================================

/**
 * Data export request
 */
export interface DataExportRequest {
  /** Export format */
  format: "json" | "csv" | "zip";
  /** Namespaces to export */
  namespaces?: string[];
  /** Include embeddings */
  includeEmbeddings?: boolean;
  /** Time range */
  timeRange?: {
    after?: number;
    before?: number;
  };
  /** Delivery method */
  deliveryMethod: "download" | "email";
}

/**
 * Data export response
 */
export interface DataExportResponse {
  /** Export ID */
  exportId: string;
  /** Export status */
  status: "pending" | "processing" | "completed" | "failed";
  /** Download URL (if completed) */
  downloadUrl?: string;
  /** Expiration time for download */
  expiresAt?: number;
  /** Estimated completion time */
  estimatedCompletionAt?: number;
}

// ============================================================================
// Deletion Endpoints
// ============================================================================

/**
 * Deletion request
 */
export interface DeletionRequest {
  /** Deletion type */
  type: "full" | "namespace" | "selective";
  /** Namespaces to delete (for namespace type) */
  namespaces?: string[];
  /** Vector IDs to delete (for selective type) */
  vectorIds?: string[];
  /** Immediate deletion (skip grace period) */
  immediate?: boolean;
  /** Confirmation phrase */
  confirmationPhrase?: string;
}

/**
 * Deletion response
 */
export interface DeletionResponse {
  /** Request ID */
  requestId: string;
  /** Status */
  status: "scheduled" | "processing" | "completed";
  /** Scheduled deletion time */
  scheduledFor?: number;
  /** Items to be deleted */
  itemCount: number;
  /** Cancellation deadline */
  cancellableUntil?: number;
}

// ============================================================================
// Batch Operations
// ============================================================================

/**
 * Batch operation request
 */
export interface BatchOperationRequest<T> {
  /** Operations to perform */
  operations: T[];
  /** Continue on error */
  continueOnError?: boolean;
  /** Transaction mode */
  transactional?: boolean;
}

/**
 * Batch operation result
 */
export interface BatchOperationResult<T> {
  /** Index of operation */
  index: number;
  /** Success status */
  success: boolean;
  /** Result (if successful) */
  result?: T;
  /** Error (if failed) */
  error?: ApiError;
}

/**
 * Batch operation response
 */
export interface BatchOperationResponse<T> {
  /** Total operations */
  total: number;
  /** Successful operations */
  successful: number;
  /** Failed operations */
  failed: number;
  /** Individual results */
  results: BatchOperationResult<T>[];
}

// ============================================================================
// Health & Status
// ============================================================================

/**
 * Health check response
 */
export interface HealthCheckResponse {
  /** Overall status */
  status: "healthy" | "degraded" | "unhealthy";
  /** Service checks */
  services: {
    /** Service name */
    name: string;
    /** Service status */
    status: "up" | "down" | "degraded";
    /** Response time */
    responseTimeMs?: number;
    /** Additional info */
    info?: Record<string, unknown>;
  }[];
  /** Server time */
  serverTime: number;
  /** Version info */
  version: {
    api: string;
    build: string;
  };
}

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Type guard for API error
 */
export function isApiError(value: unknown): value is ApiError {
  return (
    typeof value === "object" &&
    value !== null &&
    "code" in value &&
    "message" in value
  );
}

/**
 * Type guard for successful response
 */
export function isSuccessResponse<T>(
  response: ApiResponse<T>
): response is ApiResponse<T> & { success: true; data: T } {
  return response.success && response.data !== undefined;
}

/**
 * Type guard for error response
 */
export function isErrorResponse<T>(
  response: ApiResponse<T>
): response is ApiResponse<T> & { success: false; error: ApiError } {
  return !response.success && response.error !== undefined;
}
