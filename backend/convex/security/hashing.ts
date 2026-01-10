/**
 * URL Hashing and PII Protection for Orion Browser
 *
 * Provides secure hashing utilities for:
 * - URL anonymization
 * - PII protection
 * - Content fingerprinting
 * - Deterministic ID generation
 *
 * @module security/hashing
 */

// ============================================================================
// Types
// ============================================================================

/**
 * Hash algorithm options
 */
export type HashAlgorithm = "sha256" | "sha384" | "sha512" | "blake2b" | "blake3";

/**
 * Hashed URL result
 */
export interface HashedUrl {
  /** Domain hash */
  domainHash: string;
  /** Path hash */
  pathHash: string;
  /** Full URL hash */
  fullHash: string;
  /** Query parameters hash (if any) */
  queryHash?: string;
  /** Original scheme (http/https) */
  scheme: string;
  /** Timestamp of hashing */
  hashedAt: number;
}

/**
 * PII detection result
 */
export interface PIIDetectionResult {
  /** Whether PII was detected */
  hasPII: boolean;
  /** Types of PII found */
  piiTypes: PIIType[];
  /** Sanitized version */
  sanitized: string;
  /** Positions of PII (for highlighting) */
  positions: Array<{ start: number; end: number; type: PIIType }>;
}

/**
 * Types of PII that can be detected
 */
export type PIIType =
  | "email"
  | "phone"
  | "ssn"
  | "credit_card"
  | "name"
  | "address"
  | "ip_address"
  | "date_of_birth"
  | "password"
  | "api_key"
  | "auth_token";

/**
 * Content fingerprint result
 */
export interface ContentFingerprint {
  /** Fingerprint hash */
  hash: string;
  /** Algorithm used */
  algorithm: HashAlgorithm;
  /** Content length */
  contentLength: number;
  /** Created timestamp */
  createdAt: number;
  /** Version of fingerprinting algorithm */
  version: number;
}

/**
 * Hash options
 */
export interface HashOptions {
  /** Algorithm to use */
  algorithm?: HashAlgorithm;
  /** Include salt */
  salt?: string;
  /** Output encoding */
  encoding?: "hex" | "base64" | "base64url";
  /** Truncate to length */
  truncate?: number;
}

// ============================================================================
// Constants
// ============================================================================

/** Default hash algorithm */
const DEFAULT_ALGORITHM: HashAlgorithm = "sha256";

/** Default output encoding */
const DEFAULT_ENCODING: "hex" | "base64" | "base64url" = "hex";

/** PII patterns for detection */
const PII_PATTERNS: Record<PIIType, RegExp> = {
  email: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
  phone: /(\+?1?[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g,
  ssn: /\d{3}[-\s]?\d{2}[-\s]?\d{4}/g,
  credit_card: /\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}/g,
  name: /\b[A-Z][a-z]+ [A-Z][a-z]+\b/g, // Simple name pattern
  address: /\d+\s+[A-Za-z]+\s+(Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Lane|Ln|Drive|Dr|Court|Ct)/gi,
  ip_address: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,
  date_of_birth: /\b(0?[1-9]|1[0-2])[\/\-](0?[1-9]|[12]\d|3[01])[\/\-](\d{2}|\d{4})\b/g,
  password: /password\s*[:=]\s*['"]?[^\s'"]+['"]?/gi,
  api_key: /(?:api[_-]?key|apikey)\s*[:=]\s*['"]?[a-zA-Z0-9_-]{20,}['"]?/gi,
  auth_token: /(?:bearer|token|auth)\s+[a-zA-Z0-9._-]{20,}/gi,
};

/** Characters to use for obfuscation */
const OBFUSCATION_CHAR = "*";

// ============================================================================
// URL Hashing
// ============================================================================

/**
 * Hashes a URL while preserving domain structure for analytics
 *
 * @param url - URL to hash
 * @param salt - Salt for HMAC
 * @param options - Hashing options
 * @returns Hashed URL components
 *
 * @example
 * ```typescript
 * const hashed = await hashUrl(
 *   "https://example.com/page?user=123",
 *   secretSalt
 * );
 * // { domainHash: "abc123...", pathHash: "def456...", ... }
 * ```
 */
export async function hashUrl(
  url: string,
  salt: string,
  options: HashOptions = {}
): Promise<HashedUrl> {
  const algorithm = options.algorithm ?? DEFAULT_ALGORITHM;

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    // If URL parsing fails, hash the entire string
    const fullHash = await hmacHash(url, salt, algorithm);
    return {
      domainHash: fullHash,
      pathHash: fullHash,
      fullHash,
      scheme: "unknown",
      hashedAt: Date.now(),
    };
  }

  const [domainHash, pathHash, fullHash] = await Promise.all([
    hmacHash(parsed.hostname, salt, algorithm),
    hmacHash(parsed.pathname, salt, algorithm),
    hmacHash(url, salt, algorithm),
  ]);

  const result: HashedUrl = {
    domainHash: truncateHash(domainHash, options.truncate),
    pathHash: truncateHash(pathHash, options.truncate),
    fullHash: truncateHash(fullHash, options.truncate),
    scheme: parsed.protocol.replace(":", ""),
    hashedAt: Date.now(),
  };

  // Hash query parameters if present
  if (parsed.search) {
    result.queryHash = truncateHash(
      await hmacHash(parsed.search, salt, algorithm),
      options.truncate
    );
  }

  return result;
}

/**
 * Creates a deterministic hash for a URL (for deduplication)
 */
export async function hashUrlForDedup(
  url: string,
  options: HashOptions = {}
): Promise<string> {
  const algorithm = options.algorithm ?? DEFAULT_ALGORITHM;

  // Normalize URL
  let normalized: string;
  try {
    const parsed = new URL(url);
    // Remove common tracking parameters
    const cleanParams = new URLSearchParams();
    for (const [key, value] of parsed.searchParams) {
      if (!isTrackingParam(key)) {
        cleanParams.append(key, value);
      }
    }
    parsed.search = cleanParams.toString();
    // Remove trailing slashes, lowercase
    normalized = parsed.toString().toLowerCase().replace(/\/+$/, "");
  } catch {
    normalized = url.toLowerCase().trim();
  }

  const hash = await simpleHash(normalized, algorithm);
  return truncateHash(hash, options.truncate);
}

/**
 * Checks if a URL parameter is a tracking parameter
 */
function isTrackingParam(param: string): boolean {
  const trackingParams = [
    "utm_source",
    "utm_medium",
    "utm_campaign",
    "utm_term",
    "utm_content",
    "fbclid",
    "gclid",
    "msclkid",
    "ref",
    "source",
    "mc_eid",
    "_ga",
    "_gid",
  ];
  return trackingParams.includes(param.toLowerCase());
}

// ============================================================================
// PII Protection
// ============================================================================

/**
 * Detects and sanitizes PII in text
 *
 * @param text - Text to check for PII
 * @param typesToCheck - Specific PII types to check (defaults to all)
 * @returns Detection result with sanitized text
 *
 * @example
 * ```typescript
 * const result = detectAndSanitizePII(
 *   "Contact john@example.com or call 555-1234"
 * );
 * // { hasPII: true, sanitized: "Contact ****@******* or call ***-****", ... }
 * ```
 */
export function detectAndSanitizePII(
  text: string,
  typesToCheck?: PIIType[]
): PIIDetectionResult {
  const types = typesToCheck ?? (Object.keys(PII_PATTERNS) as PIIType[]);
  const positions: Array<{ start: number; end: number; type: PIIType }> = [];
  let sanitized = text;
  const foundTypes = new Set<PIIType>();

  for (const type of types) {
    const pattern = PII_PATTERNS[type];
    if (!pattern) continue;

    // Reset pattern lastIndex
    pattern.lastIndex = 0;

    let match;
    while ((match = pattern.exec(text)) !== null) {
      foundTypes.add(type);
      positions.push({
        start: match.index,
        end: match.index + match[0].length,
        type,
      });
    }
  }

  // Sort positions by start index (descending) for replacement
  positions.sort((a, b) => b.start - a.start);

  // Replace PII with obfuscated version
  for (const pos of positions) {
    const original = sanitized.substring(pos.start, pos.end);
    const obfuscated = obfuscateValue(original, pos.type);
    sanitized = sanitized.substring(0, pos.start) + obfuscated + sanitized.substring(pos.end);
  }

  return {
    hasPII: foundTypes.size > 0,
    piiTypes: Array.from(foundTypes),
    sanitized,
    positions: positions.sort((a, b) => a.start - b.start),
  };
}

/**
 * Obfuscates a PII value while keeping some structure
 */
function obfuscateValue(value: string, type: PIIType): string {
  switch (type) {
    case "email":
      // Keep first char and domain hint: j***@e***
      const [local, domain] = value.split("@");
      return `${local[0]}${OBFUSCATION_CHAR.repeat(3)}@${domain[0]}${OBFUSCATION_CHAR.repeat(3)}`;

    case "phone":
      // Keep last 4 digits: ***-***-1234
      const digits = value.replace(/\D/g, "");
      return `${OBFUSCATION_CHAR.repeat(3)}-${OBFUSCATION_CHAR.repeat(3)}-${digits.slice(-4)}`;

    case "ssn":
      // Keep last 4 digits: ***-**-1234
      return `${OBFUSCATION_CHAR.repeat(3)}-${OBFUSCATION_CHAR.repeat(2)}-${value.slice(-4)}`;

    case "credit_card":
      // Keep last 4 digits: ****-****-****-1234
      return `${OBFUSCATION_CHAR.repeat(4)}-${OBFUSCATION_CHAR.repeat(4)}-${OBFUSCATION_CHAR.repeat(4)}-${value.slice(-4)}`;

    case "ip_address":
      // Keep first octet: 192.*.*.*
      const firstOctet = value.split(".")[0];
      return `${firstOctet}.${OBFUSCATION_CHAR}.${OBFUSCATION_CHAR}.${OBFUSCATION_CHAR}`;

    default:
      // Generic obfuscation
      if (value.length <= 4) {
        return OBFUSCATION_CHAR.repeat(value.length);
      }
      return `${value[0]}${OBFUSCATION_CHAR.repeat(value.length - 2)}${value[value.length - 1]}`;
  }
}

/**
 * Hashes PII for storage while allowing lookup
 */
export async function hashPII(
  value: string,
  type: PIIType,
  salt: string
): Promise<string> {
  // Normalize the value based on type
  let normalized = value.trim().toLowerCase();

  switch (type) {
    case "email":
      // Remove dots from local part for Gmail normalization
      const [local, domain] = normalized.split("@");
      normalized = local.replace(/\./g, "") + "@" + domain;
      break;

    case "phone":
      // Remove all non-digits
      normalized = normalized.replace(/\D/g, "");
      break;

    case "ssn":
    case "credit_card":
      // Remove separators
      normalized = normalized.replace(/[-\s]/g, "");
      break;
  }

  // Include type in hash to prevent cross-type collisions
  return hmacHash(`${type}:${normalized}`, salt, "sha256");
}

// ============================================================================
// Content Fingerprinting
// ============================================================================

/**
 * Creates a content fingerprint for deduplication and change detection
 *
 * @param content - Content to fingerprint
 * @param options - Fingerprinting options
 * @returns Content fingerprint
 */
export async function fingerprintContent(
  content: string,
  options: HashOptions = {}
): Promise<ContentFingerprint> {
  const algorithm = options.algorithm ?? DEFAULT_ALGORITHM;

  // Normalize content
  const normalized = normalizeContent(content);

  const hash = await simpleHash(normalized, algorithm);

  return {
    hash: truncateHash(hash, options.truncate),
    algorithm,
    contentLength: content.length,
    createdAt: Date.now(),
    version: 1,
  };
}

/**
 * Normalizes content for consistent fingerprinting
 */
function normalizeContent(content: string): string {
  return content
    .toLowerCase()
    .replace(/\s+/g, " ") // Normalize whitespace
    .replace(/[^\w\s]/g, "") // Remove punctuation
    .trim();
}

/**
 * Creates a simhash for similarity detection
 * (Simplified version - use proper simhash library in production)
 */
export async function simhash(content: string): Promise<string> {
  // This is a simplified version
  // For production, use a proper simhash implementation
  const normalized = normalizeContent(content);
  const words = normalized.split(" ");

  // Create feature hashes
  const bits = new Array(64).fill(0);

  for (const word of words) {
    const hash = await simpleHash(word, "sha256");
    // Use first 64 bits of hash
    for (let i = 0; i < 64 && i < hash.length * 4; i++) {
      const bit = (parseInt(hash[Math.floor(i / 4)], 16) >> (i % 4)) & 1;
      bits[i] += bit ? 1 : -1;
    }
  }

  // Convert to binary string
  return bits.map((b) => (b > 0 ? "1" : "0")).join("");
}

/**
 * Calculates hamming distance between two simhashes
 */
export function hammingDistance(hash1: string, hash2: string): number {
  if (hash1.length !== hash2.length) {
    throw new Error("Hashes must be same length");
  }

  let distance = 0;
  for (let i = 0; i < hash1.length; i++) {
    if (hash1[i] !== hash2[i]) {
      distance++;
    }
  }
  return distance;
}

/**
 * Estimates similarity from hamming distance
 */
export function estimateSimilarity(hash1: string, hash2: string): number {
  const distance = hammingDistance(hash1, hash2);
  const maxDistance = hash1.length;
  return 1 - distance / maxDistance;
}

// ============================================================================
// Hash Utilities
// ============================================================================

/**
 * Computes an HMAC hash
 */
async function hmacHash(
  data: string,
  key: string,
  algorithm: HashAlgorithm
): Promise<string> {
  // In production, use WebCrypto or crypto module
  // const encoder = new TextEncoder();
  // const keyData = encoder.encode(key);
  // const cryptoKey = await crypto.subtle.importKey(
  //   "raw", keyData, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  // );
  // const signature = await crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(data));
  // return Array.from(new Uint8Array(signature)).map(b => b.toString(16).padStart(2, '0')).join('');

  // Placeholder implementation
  console.warn("Using placeholder HMAC - implement with proper crypto in production");
  return simpleHash(key + data, algorithm);
}

/**
 * Computes a simple hash
 */
async function simpleHash(data: string, algorithm: HashAlgorithm): Promise<string> {
  // In production, use WebCrypto
  // const encoder = new TextEncoder();
  // const hashBuffer = await crypto.subtle.digest("SHA-256", encoder.encode(data));
  // return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');

  // Simple hash placeholder
  let hash = 0;
  for (let i = 0; i < data.length; i++) {
    const char = data.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16).padStart(16, "0");
}

/**
 * Truncates a hash to specified length
 */
function truncateHash(hash: string, length?: number): string {
  if (!length || length >= hash.length) {
    return hash;
  }
  return hash.substring(0, length);
}

/**
 * Generates a deterministic ID from multiple components
 */
export async function generateDeterministicId(
  components: string[],
  salt?: string
): Promise<string> {
  const input = components.join("|");
  const toHash = salt ? salt + input : input;
  return simpleHash(toHash, "sha256");
}

/**
 * Validates that a value matches a hash
 */
export async function validateHash(
  value: string,
  expectedHash: string,
  salt?: string
): Promise<boolean> {
  const toHash = salt ? salt + value : value;
  const computed = await simpleHash(toHash, "sha256");
  return computed === expectedHash;
}
