/**
 * End-to-End Encryption Helpers for Orion Browser
 *
 * Provides encryption utilities for:
 * - Data at rest encryption
 * - Field-level encryption
 * - Key derivation
 * - Encryption key management
 *
 * Note: For production, use a proper cryptography library like
 * @noble/ciphers or WebCrypto API. This implementation provides
 * the structure and types for integration.
 *
 * @module security/encryption
 */

// ============================================================================
// Types
// ============================================================================

/**
 * Supported encryption algorithms
 */
export type EncryptionAlgorithm = "aes-256-gcm" | "chacha20-poly1305";

/**
 * Key derivation functions
 */
export type KeyDerivationFunction = "pbkdf2" | "argon2id" | "scrypt";

/**
 * Encrypted data wrapper
 */
export interface EncryptedData {
  /** Encryption algorithm used */
  algorithm: EncryptionAlgorithm;
  /** Initialization vector (base64) */
  iv: string;
  /** Encrypted data (base64) */
  ciphertext: string;
  /** Authentication tag (base64) */
  tag: string;
  /** Key version used */
  keyVersion: number;
  /** Timestamp of encryption */
  encryptedAt: number;
}

/**
 * Encryption key metadata
 */
export interface EncryptionKeyMetadata {
  /** Key ID */
  keyId: string;
  /** Key version */
  version: number;
  /** Algorithm the key is for */
  algorithm: EncryptionAlgorithm;
  /** Created timestamp */
  createdAt: number;
  /** Expires at (optional) */
  expiresAt?: number;
  /** Is this the active key */
  isActive: boolean;
  /** Key derivation info (if derived) */
  derivation?: KeyDerivationInfo;
}

/**
 * Key derivation information
 */
export interface KeyDerivationInfo {
  /** KDF used */
  function: KeyDerivationFunction;
  /** Salt (base64) */
  salt: string;
  /** Iterations (for PBKDF2) */
  iterations?: number;
  /** Memory cost (for Argon2) */
  memoryCost?: number;
  /** Time cost (for Argon2) */
  timeCost?: number;
  /** Parallelism (for Argon2) */
  parallelism?: number;
}

/**
 * Encryption context for operations
 */
export interface EncryptionContext {
  /** User ID */
  userId: string;
  /** Data type being encrypted */
  dataType: string;
  /** Additional authenticated data */
  aad?: string;
}

/**
 * Key rotation result
 */
export interface KeyRotationResult {
  /** New key version */
  newVersion: number;
  /** Old key version */
  oldVersion: number;
  /** Items re-encrypted */
  itemsReEncrypted: number;
  /** Items failed */
  itemsFailed: number;
  /** Duration in ms */
  durationMs: number;
}

// ============================================================================
// Constants
// ============================================================================

/** Key size in bytes for AES-256 */
const AES_KEY_SIZE = 32;

/** IV size for AES-GCM */
const AES_GCM_IV_SIZE = 12;

/** Tag size for AES-GCM */
const AES_GCM_TAG_SIZE = 16;

/** Default PBKDF2 iterations */
const PBKDF2_ITERATIONS = 100000;

/** Default Argon2 parameters */
const ARGON2_MEMORY_COST = 65536;
const ARGON2_TIME_COST = 3;
const ARGON2_PARALLELISM = 4;

// ============================================================================
// Encryption Operations
// ============================================================================

/**
 * Encrypts data using the specified algorithm
 *
 * @param plaintext - Data to encrypt
 * @param key - Encryption key
 * @param context - Encryption context
 * @param algorithm - Algorithm to use
 * @returns Encrypted data wrapper
 *
 * @example
 * ```typescript
 * const encrypted = await encrypt(
 *   "sensitive data",
 *   encryptionKey,
 *   { userId: "user123", dataType: "bookmark" }
 * );
 * ```
 */
export async function encrypt(
  plaintext: string,
  key: Uint8Array,
  context: EncryptionContext,
  algorithm: EncryptionAlgorithm = "aes-256-gcm"
): Promise<EncryptedData> {
  // Validate key size
  if (key.length !== AES_KEY_SIZE) {
    throw new Error(`Invalid key size: expected ${AES_KEY_SIZE}, got ${key.length}`);
  }

  // Generate random IV
  const iv = generateRandomBytes(AES_GCM_IV_SIZE);

  // Build additional authenticated data
  const aad = buildAAD(context);

  // Perform encryption
  // Note: In production, use WebCrypto or @noble/ciphers
  const { ciphertext, tag } = await performEncryption(
    plaintext,
    key,
    iv,
    aad,
    algorithm
  );

  return {
    algorithm,
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(ciphertext),
    tag: bytesToBase64(tag),
    keyVersion: 1, // Should come from key management
    encryptedAt: Date.now(),
  };
}

/**
 * Decrypts data
 *
 * @param encrypted - Encrypted data wrapper
 * @param key - Decryption key
 * @param context - Encryption context (must match encryption)
 * @returns Decrypted plaintext
 */
export async function decrypt(
  encrypted: EncryptedData,
  key: Uint8Array,
  context: EncryptionContext
): Promise<string> {
  // Validate key size
  if (key.length !== AES_KEY_SIZE) {
    throw new Error(`Invalid key size: expected ${AES_KEY_SIZE}, got ${key.length}`);
  }

  const iv = base64ToBytes(encrypted.iv);
  const ciphertext = base64ToBytes(encrypted.ciphertext);
  const tag = base64ToBytes(encrypted.tag);
  const aad = buildAAD(context);

  // Perform decryption
  const plaintext = await performDecryption(
    ciphertext,
    key,
    iv,
    tag,
    aad,
    encrypted.algorithm
  );

  return plaintext;
}

/**
 * Encrypts a JSON object
 */
export async function encryptJSON<T>(
  data: T,
  key: Uint8Array,
  context: EncryptionContext
): Promise<EncryptedData> {
  const plaintext = JSON.stringify(data);
  return encrypt(plaintext, key, context);
}

/**
 * Decrypts to a JSON object
 */
export async function decryptJSON<T>(
  encrypted: EncryptedData,
  key: Uint8Array,
  context: EncryptionContext
): Promise<T> {
  const plaintext = await decrypt(encrypted, key, context);
  return JSON.parse(plaintext) as T;
}

// ============================================================================
// Key Derivation
// ============================================================================

/**
 * Derives an encryption key from a password
 *
 * @param password - User password
 * @param salt - Salt for derivation (or generates new)
 * @param kdf - Key derivation function
 * @returns Derived key and derivation info
 */
export async function deriveKey(
  password: string,
  salt?: Uint8Array,
  kdf: KeyDerivationFunction = "pbkdf2"
): Promise<{ key: Uint8Array; info: KeyDerivationInfo }> {
  const derivedSalt = salt ?? generateRandomBytes(32);

  let key: Uint8Array;
  let info: KeyDerivationInfo;

  switch (kdf) {
    case "pbkdf2":
      key = await derivePBKDF2(password, derivedSalt, PBKDF2_ITERATIONS);
      info = {
        function: "pbkdf2",
        salt: bytesToBase64(derivedSalt),
        iterations: PBKDF2_ITERATIONS,
      };
      break;

    case "argon2id":
      key = await deriveArgon2(
        password,
        derivedSalt,
        ARGON2_MEMORY_COST,
        ARGON2_TIME_COST,
        ARGON2_PARALLELISM
      );
      info = {
        function: "argon2id",
        salt: bytesToBase64(derivedSalt),
        memoryCost: ARGON2_MEMORY_COST,
        timeCost: ARGON2_TIME_COST,
        parallelism: ARGON2_PARALLELISM,
      };
      break;

    case "scrypt":
      key = await deriveScrypt(password, derivedSalt);
      info = {
        function: "scrypt",
        salt: bytesToBase64(derivedSalt),
      };
      break;

    default:
      throw new Error(`Unsupported KDF: ${kdf}`);
  }

  return { key, info };
}

/**
 * Derives a key using PBKDF2
 */
async function derivePBKDF2(
  password: string,
  salt: Uint8Array,
  iterations: number
): Promise<Uint8Array> {
  // In production, use WebCrypto:
  // const encoder = new TextEncoder();
  // const keyMaterial = await crypto.subtle.importKey(
  //   "raw",
  //   encoder.encode(password),
  //   "PBKDF2",
  //   false,
  //   ["deriveBits"]
  // );
  // const derivedBits = await crypto.subtle.deriveBits(
  //   { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
  //   keyMaterial,
  //   256
  // );
  // return new Uint8Array(derivedBits);

  // Placeholder implementation
  console.warn("Using placeholder PBKDF2 - implement with WebCrypto in production");
  return new Uint8Array(32);
}

/**
 * Derives a key using Argon2id
 */
async function deriveArgon2(
  _password: string,
  _salt: Uint8Array,
  _memoryCost: number,
  _timeCost: number,
  _parallelism: number
): Promise<Uint8Array> {
  // In production, use a library like argon2-browser or argon2id
  console.warn("Using placeholder Argon2 - implement with proper library in production");
  return new Uint8Array(32);
}

/**
 * Derives a key using scrypt
 */
async function deriveScrypt(
  _password: string,
  _salt: Uint8Array
): Promise<Uint8Array> {
  // In production, use a scrypt library
  console.warn("Using placeholder scrypt - implement with proper library in production");
  return new Uint8Array(32);
}

// ============================================================================
// Field-Level Encryption
// ============================================================================

/**
 * Field encryption configuration
 */
export interface FieldEncryptionConfig {
  /** Fields to encrypt */
  encryptedFields: string[];
  /** Key for this entity type */
  keyId: string;
}

/**
 * Encrypts specific fields in an object
 */
export async function encryptFields<T extends Record<string, unknown>>(
  obj: T,
  fields: string[],
  key: Uint8Array,
  context: EncryptionContext
): Promise<T & { _encrypted: string[] }> {
  const result = { ...obj, _encrypted: fields };

  for (const field of fields) {
    if (field in obj && obj[field] !== undefined) {
      const value = JSON.stringify(obj[field]);
      const encrypted = await encrypt(value, key, {
        ...context,
        dataType: `${context.dataType}.${field}`,
      });
      (result as Record<string, unknown>)[field] = encrypted;
    }
  }

  return result;
}

/**
 * Decrypts specific fields in an object
 */
export async function decryptFields<T extends Record<string, unknown>>(
  obj: T & { _encrypted?: string[] },
  key: Uint8Array,
  context: EncryptionContext
): Promise<T> {
  const fields = obj._encrypted ?? [];
  const result = { ...obj };
  delete (result as Record<string, unknown>)._encrypted;

  for (const field of fields) {
    if (field in obj && obj[field] !== undefined) {
      const encrypted = obj[field] as EncryptedData;
      const decrypted = await decrypt(encrypted, key, {
        ...context,
        dataType: `${context.dataType}.${field}`,
      });
      (result as Record<string, unknown>)[field] = JSON.parse(decrypted);
    }
  }

  return result as T;
}

// ============================================================================
// Key Management
// ============================================================================

/**
 * Generates a new encryption key
 */
export function generateEncryptionKey(): Uint8Array {
  return generateRandomBytes(AES_KEY_SIZE);
}

/**
 * Wraps a key for storage (key encryption key)
 */
export async function wrapKey(
  keyToWrap: Uint8Array,
  wrappingKey: Uint8Array,
  context: EncryptionContext
): Promise<EncryptedData> {
  const keyAsString = bytesToBase64(keyToWrap);
  return encrypt(keyAsString, wrappingKey, {
    ...context,
    dataType: "key",
  });
}

/**
 * Unwraps a key from storage
 */
export async function unwrapKey(
  wrappedKey: EncryptedData,
  wrappingKey: Uint8Array,
  context: EncryptionContext
): Promise<Uint8Array> {
  const keyAsString = await decrypt(wrappedKey, wrappingKey, {
    ...context,
    dataType: "key",
  });
  return base64ToBytes(keyAsString);
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Performs the actual encryption (placeholder)
 */
async function performEncryption(
  _plaintext: string,
  _key: Uint8Array,
  _iv: Uint8Array,
  _aad: Uint8Array,
  _algorithm: EncryptionAlgorithm
): Promise<{ ciphertext: Uint8Array; tag: Uint8Array }> {
  // In production, implement using WebCrypto or @noble/ciphers
  // Example with WebCrypto:
  // const cryptoKey = await crypto.subtle.importKey("raw", key, { name: "AES-GCM" }, false, ["encrypt"]);
  // const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: aad }, cryptoKey, encoder.encode(plaintext));
  // return { ciphertext: new Uint8Array(encrypted.slice(0, -16)), tag: new Uint8Array(encrypted.slice(-16)) };

  console.warn("Using placeholder encryption - implement with WebCrypto in production");
  return {
    ciphertext: new Uint8Array(0),
    tag: new Uint8Array(AES_GCM_TAG_SIZE),
  };
}

/**
 * Performs the actual decryption (placeholder)
 */
async function performDecryption(
  _ciphertext: Uint8Array,
  _key: Uint8Array,
  _iv: Uint8Array,
  _tag: Uint8Array,
  _aad: Uint8Array,
  _algorithm: EncryptionAlgorithm
): Promise<string> {
  console.warn("Using placeholder decryption - implement with WebCrypto in production");
  return "";
}

/**
 * Builds additional authenticated data
 */
function buildAAD(context: EncryptionContext): Uint8Array {
  const aadString = JSON.stringify({
    userId: context.userId,
    dataType: context.dataType,
    aad: context.aad,
  });
  return new TextEncoder().encode(aadString);
}

/**
 * Generates cryptographically secure random bytes
 */
function generateRandomBytes(length: number): Uint8Array {
  // In production, use crypto.getRandomValues or Node.js crypto.randomBytes
  // return crypto.getRandomValues(new Uint8Array(length));

  // Placeholder for development
  const bytes = new Uint8Array(length);
  for (let i = 0; i < length; i++) {
    bytes[i] = Math.floor(Math.random() * 256);
  }
  return bytes;
}

/**
 * Converts bytes to base64 string
 */
export function bytesToBase64(bytes: Uint8Array): string {
  // In browser: btoa(String.fromCharCode(...bytes))
  // In Node.js: Buffer.from(bytes).toString('base64')
  return Buffer.from(bytes).toString("base64");
}

/**
 * Converts base64 string to bytes
 */
export function base64ToBytes(base64: string): Uint8Array {
  // In browser: new Uint8Array(atob(base64).split('').map(c => c.charCodeAt(0)))
  // In Node.js: new Uint8Array(Buffer.from(base64, 'base64'))
  return new Uint8Array(Buffer.from(base64, "base64"));
}

/**
 * Securely compares two byte arrays (constant-time)
 */
export function secureCompare(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) {
    return false;
  }

  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a[i] ^ b[i];
  }

  return result === 0;
}

/**
 * Zeros out a byte array (for key cleanup)
 */
export function zeroize(bytes: Uint8Array): void {
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = 0;
  }
}
