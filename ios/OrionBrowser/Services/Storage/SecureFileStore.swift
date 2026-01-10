/**
 * SecureFileStore.swift
 * Secure file storage with encryption
 */

import Foundation
import CryptoKit
import Security

actor SecureFileStore {
    // MARK: - Singleton
    static let shared = SecureFileStore()

    // MARK: - Properties
    private let fileManager = FileManager.default
    private let documentsURL: URL
    private let secureDirectoryURL: URL
    private var encryptionKey: SymmetricKey?

    // MARK: - Initialization
    private init() {
        documentsURL = fileManager.urls(for: .documentDirectory, in: .userDomainMask)[0]
        secureDirectoryURL = documentsURL.appendingPathComponent("secure", isDirectory: true)

        // Create secure directory
        try? fileManager.createDirectory(at: secureDirectoryURL, withIntermediateDirectories: true)

        // Get or create encryption key - deferred to first use via ensureEncryptionKey()
    }

    /// Ensure encryption key is loaded (called lazily on first use)
    private func ensureEncryptionKey() async {
        if encryptionKey == nil {
            encryptionKey = await getOrCreateEncryptionKey()
        }
    }

    // MARK: - Save Encrypted Data
    func saveEncrypted(data: Data, filename: String) async throws {
        await ensureEncryptionKey()
        guard let key = encryptionKey else {
            throw SecureStoreError.noEncryptionKey
        }

        // Encrypt data
        let encryptedData = try encryptData(data, using: key)

        // Save to file
        let fileURL = secureDirectoryURL.appendingPathComponent(filename)
        try encryptedData.write(to: fileURL, options: [.atomic, .completeFileProtection])
    }

    // MARK: - Load Encrypted Data
    func loadEncrypted(filename: String) async throws -> Data {
        await ensureEncryptionKey()
        guard let key = encryptionKey else {
            throw SecureStoreError.noEncryptionKey
        }

        let fileURL = secureDirectoryURL.appendingPathComponent(filename)

        guard fileManager.fileExists(atPath: fileURL.path) else {
            throw SecureStoreError.fileNotFound
        }

        let encryptedData = try Data(contentsOf: fileURL)
        return try decryptData(encryptedData, using: key)
    }

    // MARK: - Save JSON
    func saveJSON<T: Encodable>(_ object: T, filename: String) async throws {
        let data = try JSONEncoder().encode(object)
        try await saveEncrypted(data: data, filename: filename)
    }

    // MARK: - Load JSON
    func loadJSON<T: Decodable>(_ type: T.Type, filename: String) async throws -> T {
        let data = try await loadEncrypted(filename: filename)
        return try JSONDecoder().decode(type, from: data)
    }

    // MARK: - Delete File
    func delete(filename: String) async throws {
        let fileURL = secureDirectoryURL.appendingPathComponent(filename)
        try fileManager.removeItem(at: fileURL)
    }

    // MARK: - File Exists
    func exists(filename: String) -> Bool {
        let fileURL = secureDirectoryURL.appendingPathComponent(filename)
        return fileManager.fileExists(atPath: fileURL.path)
    }

    // MARK: - List Files
    func listFiles() async throws -> [String] {
        let contents = try fileManager.contentsOfDirectory(at: secureDirectoryURL, includingPropertiesForKeys: nil)
        return contents.map(\.lastPathComponent)
    }

    // MARK: - Clear All
    func clearAll() async throws {
        let contents = try fileManager.contentsOfDirectory(at: secureDirectoryURL, includingPropertiesForKeys: nil)
        for fileURL in contents {
            try fileManager.removeItem(at: fileURL)
        }
    }

    // MARK: - Encryption
    private func encryptData(_ data: Data, using key: SymmetricKey) throws -> Data {
        let sealedBox = try AES.GCM.seal(data, using: key)
        guard let combined = sealedBox.combined else {
            throw SecureStoreError.encryptionFailed
        }
        return combined
    }

    private func decryptData(_ data: Data, using key: SymmetricKey) throws -> Data {
        let sealedBox = try AES.GCM.SealedBox(combined: data)
        return try AES.GCM.open(sealedBox, using: key)
    }

    // MARK: - Key Management
    private func getOrCreateEncryptionKey() async -> SymmetricKey {
        let keychainKey = "com.orion.browser.encryptionKey"

        // Try to retrieve existing key
        if let keyData = getKeychainData(for: keychainKey) {
            return SymmetricKey(data: keyData)
        }

        // Create new key
        let newKey = SymmetricKey(size: .bits256)
        let keyData = newKey.withUnsafeBytes { Data($0) }

        // Store in keychain
        setKeychainData(keyData, for: keychainKey)

        return newKey
    }

    private func getKeychainData(for key: String) -> Data? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrAccount as String: key,
            kSecReturnData as String: true
        ]

        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)

        guard status == errSecSuccess else { return nil }
        return result as? Data
    }

    private func setKeychainData(_ data: Data, for key: String) {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrAccount as String: key,
            kSecValueData as String: data,
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlock
        ]

        SecItemDelete(query as CFDictionary)
        SecItemAdd(query as CFDictionary, nil)
    }
}

// MARK: - Secure Store Error
enum SecureStoreError: LocalizedError {
    case noEncryptionKey
    case fileNotFound
    case encryptionFailed
    case decryptionFailed

    var errorDescription: String? {
        switch self {
        case .noEncryptionKey: return "No encryption key available"
        case .fileNotFound: return "File not found"
        case .encryptionFailed: return "Encryption failed"
        case .decryptionFailed: return "Decryption failed"
        }
    }
}
