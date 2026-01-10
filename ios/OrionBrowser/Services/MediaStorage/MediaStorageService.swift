/**
 * MediaStorageService.swift
 * Handles media file storage (S3/R2 compatible)
 */

import Foundation

actor MediaStorageService {
    // MARK: - Singleton
    static let shared = MediaStorageService()

    // MARK: - Properties
    private let localCacheURL: URL
    private let maxCacheSize: Int64 = 100 * 1024 * 1024 // 100 MB

    // MARK: - Initialization
    private init() {
        let cacheURL = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
        localCacheURL = cacheURL.appendingPathComponent("media", isDirectory: true)

        // Create cache directory
        try? FileManager.default.createDirectory(at: localCacheURL, withIntermediateDirectories: true)
    }

    // MARK: - Upload Media
    func upload(
        fileURL: URL,
        mimeType: String,
        onProgress: ((Double) -> Void)? = nil
    ) async throws -> MediaUploadResult {
        // Get presigned URL
        let presigned = try await getPresignedUploadURL(
            filename: fileURL.lastPathComponent,
            mimeType: mimeType
        )

        // Upload file
        try await uploadToStorage(
            fileURL: fileURL,
            presignedURL: presigned.uploadURL,
            onProgress: onProgress
        )

        // Cache locally
        try cacheFile(fileURL, with: presigned.key)

        return MediaUploadResult(
            key: presigned.key,
            url: presigned.publicURL,
            size: try FileManager.default.attributesOfItem(atPath: fileURL.path)[.size] as? Int64 ?? 0
        )
    }

    // MARK: - Download Media
    func download(key: String) async throws -> URL {
        // Check cache first
        if let cachedURL = getCachedFile(key) {
            return cachedURL
        }

        // Get download URL
        let downloadURL = try await getDownloadURL(key: key)

        // Download file
        let localURL = localCacheURL.appendingPathComponent(key)
        let (tempURL, _) = try await URLSession.shared.download(from: downloadURL)

        // Move to cache
        try FileManager.default.moveItem(at: tempURL, to: localURL)

        return localURL
    }

    // MARK: - Delete Media
    func delete(key: String) async throws {
        // Delete from remote
        try await deleteFromStorage(key: key)

        // Delete from cache
        deleteCachedFile(key)
    }

    // MARK: - Get Presigned URL
    private func getPresignedUploadURL(filename: String, mimeType: String) async throws -> PresignedUpload {
        let response: PresignedUploadResponse = try await HTTPClient.shared.post(
            "/api/media/presigned-upload",
            body: PresignedUploadRequest(filename: filename, mimeType: mimeType)
        )

        guard let uploadURL = URL(string: response.uploadURL),
              let publicURL = URL(string: response.publicURL) else {
            throw MediaStorageError.invalidURL
        }

        return PresignedUpload(
            key: response.key,
            uploadURL: uploadURL,
            publicURL: publicURL
        )
    }

    private func getDownloadURL(key: String) async throws -> URL {
        let response: PresignedDownloadResponse = try await HTTPClient.shared.get(
            "/api/media/presigned-download",
            queryParams: ["key": key]
        )

        guard let url = URL(string: response.url) else {
            throw MediaStorageError.invalidURL
        }

        return url
    }

    // MARK: - Upload to Storage
    private func uploadToStorage(
        fileURL: URL,
        presignedURL: URL,
        onProgress: ((Double) -> Void)?
    ) async throws {
        let data = try Data(contentsOf: fileURL)

        var request = URLRequest(url: presignedURL)
        request.httpMethod = "PUT"

        let (_, response) = try await URLSession.shared.upload(for: request, from: data)

        guard let httpResponse = response as? HTTPURLResponse,
              200..<300 ~= httpResponse.statusCode else {
            throw MediaStorageError.uploadFailed
        }
    }

    private func deleteFromStorage(key: String) async throws {
        try await HTTPClient.shared.delete("/api/media/\(key)")
    }

    // MARK: - Cache Management
    private func cacheFile(_ fileURL: URL, with key: String) throws {
        let cacheURL = localCacheURL.appendingPathComponent(key)
        try FileManager.default.copyItem(at: fileURL, to: cacheURL)

        // Cleanup if needed
        Task {
            await cleanupCacheIfNeeded()
        }
    }

    private func getCachedFile(_ key: String) -> URL? {
        let cacheURL = localCacheURL.appendingPathComponent(key)
        return FileManager.default.fileExists(atPath: cacheURL.path) ? cacheURL : nil
    }

    private func deleteCachedFile(_ key: String) {
        let cacheURL = localCacheURL.appendingPathComponent(key)
        try? FileManager.default.removeItem(at: cacheURL)
    }

    private func cleanupCacheIfNeeded() async {
        guard let files = try? FileManager.default.contentsOfDirectory(
            at: localCacheURL,
            includingPropertiesForKeys: [.fileSizeKey, .contentModificationDateKey]
        ) else { return }

        // Calculate total size
        var totalSize: Int64 = 0
        var fileInfos: [(URL, Date, Int64)] = []

        for file in files {
            let attributes = try? file.resourceValues(forKeys: [.fileSizeKey, .contentModificationDateKey])
            let size = Int64(attributes?.fileSize ?? 0)
            let date = attributes?.contentModificationDate ?? Date.distantPast
            totalSize += size
            fileInfos.append((file, date, size))
        }

        // Delete oldest files if over limit
        if totalSize > maxCacheSize {
            let sortedFiles = fileInfos.sorted { $0.1 < $1.1 }
            var sizeToFree = totalSize - maxCacheSize

            for (fileURL, _, size) in sortedFiles {
                guard sizeToFree > 0 else { break }
                try? FileManager.default.removeItem(at: fileURL)
                sizeToFree -= size
            }
        }
    }
}

// MARK: - Supporting Types
struct MediaUploadResult {
    let key: String
    let url: URL
    let size: Int64
}

struct PresignedUpload {
    let key: String
    let uploadURL: URL
    let publicURL: URL
}

struct PresignedUploadRequest: Encodable {
    let filename: String
    let mimeType: String
}

struct PresignedUploadResponse: Decodable {
    let key: String
    let uploadURL: String
    let publicURL: String
}

struct PresignedDownloadResponse: Decodable {
    let url: String
}

// MARK: - Errors
enum MediaStorageError: LocalizedError {
    case invalidURL
    case uploadFailed
    case downloadFailed
    case deleteFailed

    var errorDescription: String? {
        switch self {
        case .invalidURL: return "Invalid storage URL"
        case .uploadFailed: return "Upload failed"
        case .downloadFailed: return "Download failed"
        case .deleteFailed: return "Delete failed"
        }
    }
}
