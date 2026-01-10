/**
 * Export Contract Types for Orion Browser
 *
 * Defines types for data portability and export functionality:
 * - Export formats (JSON, CSV, ZIP archive)
 * - Export schemas
 * - Import contracts
 * - Migration formats
 *
 * @module types/export
 */

// ============================================================================
// Export Format Types
// ============================================================================

/**
 * Supported export formats
 */
export type ExportFormat = "json" | "csv" | "zip";

/**
 * Export scope options
 */
export type ExportScope =
  | "full" // All user data
  | "browsing" // Browsing history only
  | "bookmarks" // Bookmarks only
  | "preferences" // Settings and preferences
  | "vectors" // Vector embeddings
  | "audit" // Audit logs
  | "custom"; // Custom selection

/**
 * Export options
 */
export interface ExportOptions {
  /** Export format */
  format: ExportFormat;
  /** Export scope */
  scope: ExportScope;
  /** Specific namespaces (for custom scope) */
  namespaces?: string[];
  /** Include vector embeddings */
  includeEmbeddings?: boolean;
  /** Include metadata */
  includeMetadata?: boolean;
  /** Include timestamps */
  includeTimestamps?: boolean;
  /** Time range filter */
  timeRange?: {
    after?: number;
    before?: number;
  };
  /** Encryption options */
  encryption?: ExportEncryptionOptions;
  /** Compression level (1-9) */
  compressionLevel?: number;
}

/**
 * Export encryption options
 */
export interface ExportEncryptionOptions {
  /** Encrypt the export */
  enabled: boolean;
  /** Encryption algorithm */
  algorithm: "aes-256-gcm" | "chacha20-poly1305";
  /** Password for encryption */
  password?: string;
  /** Key derivation function */
  kdf: "pbkdf2" | "argon2id";
  /** KDF iterations */
  iterations?: number;
}

// ============================================================================
// Export Manifest
// ============================================================================

/**
 * Export manifest (included in every export)
 */
export interface ExportManifest {
  /** Export version */
  version: string;
  /** Export format */
  format: ExportFormat;
  /** Created timestamp */
  createdAt: number;
  /** User ID (hashed) */
  userIdHash: string;
  /** Export scope */
  scope: ExportScope;
  /** Included sections */
  sections: ExportSection[];
  /** Total item counts */
  counts: ExportCounts;
  /** Checksum for integrity */
  checksum: string;
  /** Encryption metadata (if encrypted) */
  encryption?: ExportEncryptionMetadata;
  /** Schema versions */
  schemas: Record<string, string>;
}

/**
 * Export section metadata
 */
export interface ExportSection {
  /** Section name */
  name: string;
  /** File path in archive */
  path: string;
  /** Item count */
  count: number;
  /** Size in bytes */
  sizeBytes: number;
  /** Schema version */
  schemaVersion: string;
}

/**
 * Export counts
 */
export interface ExportCounts {
  /** Total items */
  total: number;
  /** By section */
  bySection: Record<string, number>;
  /** Embeddings count */
  embeddings?: number;
}

/**
 * Encryption metadata in manifest
 */
export interface ExportEncryptionMetadata {
  /** Algorithm used */
  algorithm: string;
  /** KDF used */
  kdf: string;
  /** Salt (base64) */
  salt: string;
  /** IV/Nonce (base64) */
  iv: string;
  /** Tag length */
  tagLength: number;
}

// ============================================================================
// Export Data Schemas
// ============================================================================

/**
 * Exported user profile
 */
export interface ExportedUserProfile {
  /** Schema version */
  _schema: "user_profile_v1";
  /** Export timestamp */
  _exportedAt: number;
  /** User data */
  data: {
    email: string;
    firstName: string | null;
    lastName: string | null;
    createdAt: number;
    settings: {
      theme: string;
      language: string;
      consentLevel: number;
      intelligenceLevel: string;
    };
    privacy: {
      dataRetentionDays: number;
      allowAnalytics: boolean;
      allowPersonalization: boolean;
    };
  };
}

/**
 * Exported bookmarks
 */
export interface ExportedBookmarks {
  /** Schema version */
  _schema: "bookmarks_v1";
  /** Export timestamp */
  _exportedAt: number;
  /** Bookmarks data */
  data: ExportedBookmark[];
}

/**
 * Single exported bookmark
 */
export interface ExportedBookmark {
  /** Bookmark ID */
  id: string;
  /** Title */
  title: string;
  /** URL */
  url: string;
  /** Folder path */
  folder: string[];
  /** Tags */
  tags: string[];
  /** Created timestamp */
  createdAt: number;
  /** Last modified */
  modifiedAt: number;
  /** Favicon URL */
  favicon?: string;
  /** Notes */
  notes?: string;
}

/**
 * Exported browsing history
 */
export interface ExportedHistory {
  /** Schema version */
  _schema: "history_v1";
  /** Export timestamp */
  _exportedAt: number;
  /** History entries */
  data: ExportedHistoryEntry[];
}

/**
 * Single history entry
 */
export interface ExportedHistoryEntry {
  /** Entry ID */
  id: string;
  /** URL (may be hashed based on privacy settings) */
  url: string;
  /** Title */
  title: string;
  /** Visit timestamp */
  visitedAt: number;
  /** Visit count */
  visitCount: number;
  /** Duration on page (seconds) */
  duration?: number;
  /** Referrer URL */
  referrer?: string;
}

/**
 * Exported vectors
 */
export interface ExportedVectors {
  /** Schema version */
  _schema: "vectors_v1";
  /** Export timestamp */
  _exportedAt: number;
  /** Vector dimension */
  dimension: number;
  /** Namespace */
  namespace: string;
  /** Vectors */
  data: ExportedVector[];
}

/**
 * Single exported vector
 */
export interface ExportedVector {
  /** Vector ID */
  id: string;
  /** Content */
  content: string;
  /** Embedding (optional based on export options) */
  embedding?: number[];
  /** Metadata */
  metadata: {
    source: string;
    contentType: string;
    domain: string;
    title?: string;
    tags: string[];
  };
  /** Created timestamp */
  createdAt: number;
  /** Confidence score */
  confidence: number;
}

/**
 * Exported preferences
 */
export interface ExportedPreferences {
  /** Schema version */
  _schema: "preferences_v1";
  /** Export timestamp */
  _exportedAt: number;
  /** Preferences */
  data: {
    theme: string;
    language: string;
    notifications: boolean;
    voiceEnabled: boolean;
    hapticFeedback: boolean;
    searchEngine: string;
    homepage: string;
    customSettings: Record<string, unknown>;
  };
}

/**
 * Exported consent history
 */
export interface ExportedConsentHistory {
  /** Schema version */
  _schema: "consent_history_v1";
  /** Export timestamp */
  _exportedAt: number;
  /** Consent events */
  data: Array<{
    fromLevel: number;
    toLevel: number;
    timestamp: number;
    method: string;
  }>;
}

// ============================================================================
// Import Types
// ============================================================================

/**
 * Import source type
 */
export type ImportSource =
  | "orion" // Orion export
  | "safari" // Safari bookmarks
  | "chrome" // Chrome data
  | "firefox" // Firefox data
  | "edge" // Edge data
  | "other"; // Other/generic

/**
 * Import options
 */
export interface ImportOptions {
  /** Source type */
  source: ImportSource;
  /** Merge strategy */
  mergeStrategy: MergeStrategy;
  /** Sections to import */
  sections: string[];
  /** Validate before import */
  validateFirst: boolean;
  /** Dry run (don't actually import) */
  dryRun: boolean;
  /** Decryption password (if encrypted) */
  password?: string;
}

/**
 * Merge strategy for imports
 */
export type MergeStrategy =
  | "replace" // Replace existing data
  | "merge" // Merge with existing
  | "skip_duplicates" // Keep existing on conflict
  | "prefer_import"; // Prefer imported on conflict

/**
 * Import validation result
 */
export interface ImportValidationResult {
  /** Is valid */
  valid: boolean;
  /** Errors */
  errors: ImportValidationError[];
  /** Warnings */
  warnings: ImportValidationWarning[];
  /** Preview of what will be imported */
  preview: ImportPreview;
}

/**
 * Import validation error
 */
export interface ImportValidationError {
  /** Error code */
  code: string;
  /** Error message */
  message: string;
  /** Section with error */
  section?: string;
  /** Item index */
  itemIndex?: number;
  /** Field with error */
  field?: string;
}

/**
 * Import validation warning
 */
export interface ImportValidationWarning {
  /** Warning code */
  code: string;
  /** Warning message */
  message: string;
  /** Section */
  section?: string;
  /** Suggestion */
  suggestion?: string;
}

/**
 * Import preview
 */
export interface ImportPreview {
  /** Items to add */
  toAdd: Record<string, number>;
  /** Items to update */
  toUpdate: Record<string, number>;
  /** Items to skip */
  toSkip: Record<string, number>;
  /** Conflicts detected */
  conflicts: number;
}

/**
 * Import result
 */
export interface ImportResult {
  /** Was successful */
  success: boolean;
  /** Items imported */
  imported: Record<string, number>;
  /** Items skipped */
  skipped: Record<string, number>;
  /** Items failed */
  failed: Record<string, number>;
  /** Errors */
  errors: ImportValidationError[];
  /** Duration in ms */
  durationMs: number;
}

// ============================================================================
// Migration Types
// ============================================================================

/**
 * Migration format for app updates
 */
export interface MigrationBundle {
  /** Migration version */
  version: string;
  /** Source version */
  fromVersion: string;
  /** Target version */
  toVersion: string;
  /** Created timestamp */
  createdAt: number;
  /** Migrations to apply */
  migrations: Migration[];
  /** Rollback available */
  canRollback: boolean;
}

/**
 * Single migration
 */
export interface Migration {
  /** Migration ID */
  id: string;
  /** Description */
  description: string;
  /** Type */
  type: "schema" | "data" | "transform";
  /** Target section */
  section: string;
  /** Breaking change */
  isBreaking: boolean;
}

// ============================================================================
// Export Job Types
// ============================================================================

/**
 * Export job status
 */
export interface ExportJob {
  /** Job ID */
  id: string;
  /** User ID */
  userId: string;
  /** Status */
  status: "queued" | "processing" | "completed" | "failed";
  /** Progress (0-100) */
  progress: number;
  /** Options used */
  options: ExportOptions;
  /** Created at */
  createdAt: number;
  /** Started at */
  startedAt?: number;
  /** Completed at */
  completedAt?: number;
  /** Download URL (if completed) */
  downloadUrl?: string;
  /** URL expiration */
  urlExpiresAt?: number;
  /** Error (if failed) */
  error?: string;
  /** Size in bytes */
  sizeBytes?: number;
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Gets the file extension for a format
 */
export function getFormatExtension(format: ExportFormat): string {
  const extensions: Record<ExportFormat, string> = {
    json: "json",
    csv: "csv",
    zip: "zip",
  };
  return extensions[format];
}

/**
 * Gets the MIME type for a format
 */
export function getFormatMimeType(format: ExportFormat): string {
  const mimeTypes: Record<ExportFormat, string> = {
    json: "application/json",
    csv: "text/csv",
    zip: "application/zip",
  };
  return mimeTypes[format];
}

/**
 * Validates an export manifest
 */
export function validateManifest(
  manifest: unknown
): manifest is ExportManifest {
  if (typeof manifest !== "object" || manifest === null) {
    return false;
  }

  const m = manifest as Record<string, unknown>;

  return (
    typeof m.version === "string" &&
    typeof m.format === "string" &&
    typeof m.createdAt === "number" &&
    typeof m.userIdHash === "string" &&
    typeof m.checksum === "string" &&
    Array.isArray(m.sections)
  );
}

/**
 * Creates a default export manifest
 */
export function createExportManifest(
  options: ExportOptions,
  userId: string
): Partial<ExportManifest> {
  return {
    version: "1.0.0",
    format: options.format,
    createdAt: Date.now(),
    userIdHash: hashUserId(userId),
    scope: options.scope,
    sections: [],
    counts: { total: 0, bySection: {} },
    schemas: {
      user_profile: "v1",
      bookmarks: "v1",
      history: "v1",
      vectors: "v1",
      preferences: "v1",
      consent_history: "v1",
    },
  };
}

/**
 * Simple hash function for user ID (placeholder)
 */
function hashUserId(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    const char = userId.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16);
}

/**
 * Calculates checksum for export data
 */
export function calculateChecksum(data: string): string {
  let hash = 0;
  for (let i = 0; i < data.length; i++) {
    const char = data.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return hash.toString(16);
}

/**
 * Gets sections included in a scope
 */
export function getSectionsForScope(scope: ExportScope): string[] {
  const scopeSections: Record<ExportScope, string[]> = {
    full: [
      "profile",
      "bookmarks",
      "history",
      "vectors",
      "preferences",
      "consent",
    ],
    browsing: ["history"],
    bookmarks: ["bookmarks"],
    preferences: ["preferences", "consent"],
    vectors: ["vectors"],
    audit: ["audit"],
    custom: [],
  };
  return scopeSections[scope];
}
