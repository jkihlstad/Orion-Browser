/**
 * BackgroundUploader.swift
 * Handles background uploads for reliability with full BGTaskScheduler integration
 * Required for App Store compliance
 */

import Foundation
import BackgroundTasks
import Combine

// MARK: - Background Uploader Observable Wrapper
/// ObservableObject wrapper for SwiftUI integration since actors can't directly conform to ObservableObject
@MainActor
final class BackgroundUploaderObservable: ObservableObject {
    // MARK: - Published Properties
    @Published var totalPending: Int = 0
    @Published var currentProgress: Double = 0.0
    @Published var isProcessing: Bool = false

    // MARK: - Singleton
    static let shared = BackgroundUploaderObservable()

    private init() {
        // Start periodic sync
        startPeriodicSync()
    }

    // MARK: - Sync with Actor
    func syncFromActor() async {
        let pending = await BackgroundUploader.shared.queueCount
        let progress = await BackgroundUploader.shared.overallProgress
        let processing = await BackgroundUploader.shared.isCurrentlyProcessing

        await MainActor.run {
            self.totalPending = pending
            self.currentProgress = progress
            self.isProcessing = processing
        }
    }

    private func startPeriodicSync() {
        Task {
            while true {
                await syncFromActor()
                try? await Task.sleep(nanoseconds: 1_000_000_000) // 1 second
            }
        }
    }
}

// MARK: - Background Uploader Actor
actor BackgroundUploader {
    // MARK: - Singleton
    static let shared = BackgroundUploader()

    // MARK: - Task Identifiers
    static let backgroundTaskIdentifier = "com.orion.browser.backgroundUploader"
    static let appRefreshTaskIdentifier = "com.orion.browser.backgroundSync"

    // MARK: - Properties
    private var uploadQueue: [UploadTask] = []
    private let maxRetries = 5
    private var backgroundSession: URLSession?
    private var isProcessing = false
    private var processedIdempotencyKeys: Set<String> = []

    // MARK: - Queue File Path
    private var queueFileURL: URL {
        let documentsURL = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
        return documentsURL.appendingPathComponent("uploadQueue.json")
    }

    private var processedKeysFileURL: URL {
        let documentsURL = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
        return documentsURL.appendingPathComponent("processedIdempotencyKeys.json")
    }

    // MARK: - Computed Properties
    var queueCount: Int { uploadQueue.count }
    var hasPendingUploads: Bool { !uploadQueue.isEmpty }
    var isCurrentlyProcessing: Bool { isProcessing }

    var overallProgress: Double {
        guard !uploadQueue.isEmpty else { return 1.0 }
        let totalProgress = uploadQueue.reduce(0.0) { $0 + $1.uploadProgress }
        return totalProgress / Double(uploadQueue.count)
    }

    // MARK: - Initialization
    private init() {
        setupBackgroundSession()
        loadQueue()
        loadProcessedKeys()
    }

    // MARK: - BGTaskScheduler Registration
    /// Call this from AppDelegate's didFinishLaunchingWithOptions
    static func registerBackgroundTasks() {
        // Register processing task for uploads
        BGTaskScheduler.shared.register(
            forTaskWithIdentifier: backgroundTaskIdentifier,
            using: nil
        ) { task in
            guard let processingTask = task as? BGProcessingTask else { return }
            Task {
                await BackgroundUploader.shared.handleBackgroundTask(task: processingTask)
            }
        }

        // Register app refresh task for sync
        BGTaskScheduler.shared.register(
            forTaskWithIdentifier: appRefreshTaskIdentifier,
            using: nil
        ) { task in
            guard let refreshTask = task as? BGAppRefreshTask else { return }
            Task {
                await BackgroundUploader.shared.handleAppRefreshTask(task: refreshTask)
            }
        }
    }

    // MARK: - Schedule Background Upload
    func scheduleBackgroundUpload() {
        let request = BGProcessingTaskRequest(identifier: Self.backgroundTaskIdentifier)
        request.requiresNetworkConnectivity = true
        request.requiresExternalPower = false
        request.earliestBeginDate = Date(timeIntervalSinceNow: 10)

        do {
            try BGTaskScheduler.shared.submit(request)
            print("[BackgroundUploader] Scheduled background upload task")
        } catch {
            print("[BackgroundUploader] Failed to schedule background upload: \(error)")
        }
    }

    // MARK: - Schedule App Refresh
    func scheduleAppRefresh() {
        let request = BGAppRefreshTaskRequest(identifier: Self.appRefreshTaskIdentifier)
        request.earliestBeginDate = Date(timeIntervalSinceNow: 15 * 60) // 15 minutes

        do {
            try BGTaskScheduler.shared.submit(request)
            print("[BackgroundUploader] Scheduled app refresh task")
        } catch {
            print("[BackgroundUploader] Failed to schedule app refresh: \(error)")
        }
    }

    // MARK: - Handle Background Task
    func handleBackgroundTask(task: BGProcessingTask) async {
        // Set expiration handler
        task.expirationHandler = { [weak self] in
            Task {
                await self?.handleTaskExpiration()
            }
        }

        // Schedule next task before processing
        scheduleBackgroundUpload()

        // Process all queued uploads
        let success = await processAllQueuedUploads()

        // Complete the task
        task.setTaskCompleted(success: success)
    }

    // MARK: - Handle App Refresh Task
    func handleAppRefreshTask(task: BGAppRefreshTask) async {
        task.expirationHandler = { [weak self] in
            Task {
                await self?.handleTaskExpiration()
            }
        }

        // Schedule next refresh
        scheduleAppRefresh()

        // Quick sync - just check for pending uploads and schedule processing if needed
        if hasPendingUploads {
            scheduleBackgroundUpload()
        }

        task.setTaskCompleted(success: true)
    }

    // MARK: - Handle Task Expiration
    private func handleTaskExpiration() {
        isProcessing = false
        persistQueue()
        print("[BackgroundUploader] Background task expired, will retry later")
    }

    // MARK: - Setup
    private func setupBackgroundSession() {
        let config = URLSessionConfiguration.background(
            withIdentifier: "com.orion.browser.background.upload"
        )
        config.isDiscretionary = false
        config.sessionSendsLaunchEvents = true
        config.allowsCellularAccess = true
        config.waitsForConnectivity = true

        backgroundSession = URLSession(
            configuration: config,
            delegate: nil,
            delegateQueue: nil
        )
    }

    // MARK: - Queue Upload
    func queueUpload(_ task: UploadTask) {
        // Check for duplicate idempotency key
        guard !processedIdempotencyKeys.contains(task.idempotencyKey) else {
            print("[BackgroundUploader] Skipping duplicate upload with key: \(task.idempotencyKey)")
            return
        }

        // Check if task with same idempotency key is already in queue
        guard !uploadQueue.contains(where: { $0.idempotencyKey == task.idempotencyKey }) else {
            print("[BackgroundUploader] Task already queued with key: \(task.idempotencyKey)")
            return
        }

        uploadQueue.append(task)
        persistQueue()

        // Schedule background processing if not already running
        if !isProcessing {
            scheduleBackgroundUpload()
        }
    }

    // MARK: - Flush Methods

    /// Process uploads in background with completion callback
    func flushInBackground(completion: @escaping () -> Void) {
        Task {
            _ = await processAllQueuedUploads()
            completion()
        }
    }

    /// Process all uploads immediately (for foreground use)
    func flushImmediately() async {
        _ = await processAllQueuedUploads()
    }

    // MARK: - Process All Queued Uploads
    private func processAllQueuedUploads() async -> Bool {
        guard !isProcessing else { return false }

        isProcessing = true
        loadQueue()

        var allSuccessful = true

        // Process tasks that are ready for retry
        let readyTasks = uploadQueue.filter { task in
            guard let nextRetryTime = task.nextRetryTime else { return true }
            return Date() >= nextRetryTime
        }

        for task in readyTasks {
            let success = await processTask(task)
            if !success {
                allSuccessful = false
            }
        }

        isProcessing = false
        return allSuccessful
    }

    // MARK: - Process Single Task
    private func processTask(_ task: UploadTask) async -> Bool {
        guard task.retryCount < maxRetries else {
            markAsFailed(task)
            return false
        }

        do {
            switch task.type {
            case .event:
                try await uploadEvent(task)
            case .media:
                try await uploadMediaWithEventLogging(task)
            case .batch:
                try await uploadBatch(task)
            }

            // Mark as processed
            processedIdempotencyKeys.insert(task.idempotencyKey)
            saveProcessedKeys()

            // Remove from queue
            uploadQueue.removeAll { $0.id == task.id }
            persistQueue()

            print("[BackgroundUploader] Successfully uploaded task: \(task.id)")
            return true

        } catch {
            // Apply exponential backoff
            if let index = uploadQueue.firstIndex(where: { $0.id == task.id }) {
                uploadQueue[index].retryCount += 1
                uploadQueue[index].lastError = error.localizedDescription
                uploadQueue[index].nextRetryTime = calculateNextRetryTime(retryCount: uploadQueue[index].retryCount)
            }
            persistQueue()

            print("[BackgroundUploader] Failed to upload task: \(task.id), error: \(error)")
            return false
        }
    }

    // MARK: - Exponential Backoff
    private func calculateNextRetryTime(retryCount: Int) -> Date {
        let backoffSeconds = min(300.0, pow(2.0, Double(retryCount)))
        return Date(timeIntervalSinceNow: backoffSeconds)
    }

    // MARK: - Upload Event
    private func uploadEvent(_ task: UploadTask) async throws {
        guard let data = task.data else {
            throw BackgroundUploadError.noData
        }

        let request = try buildRequest(
            endpoint: "/api/events",
            method: "POST",
            body: data
        )

        let (_, response) = try await URLSession.shared.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse,
              200..<300 ~= httpResponse.statusCode else {
            throw BackgroundUploadError.serverError
        }

        updateProgress(for: task.id, progress: 1.0)
    }

    // MARK: - Upload Media with Event Logging (Media-First Flow)
    private func uploadMediaWithEventLogging(_ task: UploadTask) async throws {
        guard let fileURL = task.fileURL else {
            throw BackgroundUploadError.noFile
        }

        // Step 1: Upload to object storage via MediaStorageService
        updateProgress(for: task.id, progress: 0.1)

        let mimeType = getMimeType(for: fileURL)
        let uploadResult = try await MediaStorageService.shared.upload(
            fileURL: fileURL,
            mimeType: mimeType
        ) { [weak self] progress in
            Task {
                await self?.updateProgress(for: task.id, progress: 0.1 + (progress * 0.7))
            }
        }

        updateProgress(for: task.id, progress: 0.8)

        // Step 2: Log the event to DataIngestor with the storage key
        let eventData = MediaUploadEventData(
            storageKey: uploadResult.key,
            storageURL: uploadResult.url.absoluteString,
            fileSize: uploadResult.size,
            filename: task.filename ?? fileURL.lastPathComponent,
            sourceApp: task.sourceApp.rawValue,
            privacyScope: task.privacyScope.rawValue,
            timestamp: Date()
        )

        let eventPayload = try JSONEncoder().encode(eventData)
        let request = try buildRequest(
            endpoint: "/api/events/media-upload",
            method: "POST",
            body: eventPayload
        )

        let (_, response) = try await URLSession.shared.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse,
              200..<300 ~= httpResponse.statusCode else {
            throw BackgroundUploadError.serverError
        }

        updateProgress(for: task.id, progress: 1.0)
    }

    // MARK: - Upload Media (Legacy)
    private func uploadMedia(_ task: UploadTask) async throws {
        guard let fileURL = task.fileURL else {
            throw BackgroundUploadError.noFile
        }

        // Get presigned URL
        let presignedURL = try await getPresignedURL(for: task)

        // Upload file
        var request = URLRequest(url: presignedURL)
        request.httpMethod = "PUT"

        guard let session = backgroundSession else {
            throw BackgroundUploadError.noSession
        }

        let (_, response) = try await session.upload(for: request, fromFile: fileURL)

        guard let httpResponse = response as? HTTPURLResponse,
              200..<300 ~= httpResponse.statusCode else {
            throw BackgroundUploadError.serverError
        }

        updateProgress(for: task.id, progress: 1.0)
    }

    // MARK: - Upload Batch
    private func uploadBatch(_ task: UploadTask) async throws {
        guard let data = task.data else {
            throw BackgroundUploadError.noData
        }

        let request = try buildRequest(
            endpoint: "/api/events/batch",
            method: "POST",
            body: data
        )

        let (_, response) = try await URLSession.shared.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse,
              200..<300 ~= httpResponse.statusCode else {
            throw BackgroundUploadError.serverError
        }

        updateProgress(for: task.id, progress: 1.0)
    }

    // MARK: - Progress Update
    private func updateProgress(for taskId: UUID, progress: Double) {
        if let index = uploadQueue.firstIndex(where: { $0.id == taskId }) {
            uploadQueue[index].uploadProgress = progress
        }
    }

    // MARK: - Helpers
    private func buildRequest(endpoint: String, method: String, body: Data) throws -> URLRequest {
        guard let url = URL(string: "\(Configuration.convexDeploymentURL)\(endpoint)") else {
            throw BackgroundUploadError.invalidURL
        }

        var request = URLRequest(url: url)
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = body

        return request
    }

    private func getPresignedURL(for task: UploadTask) async throws -> URL {
        let request = try buildRequest(
            endpoint: "/api/media/presigned",
            method: "POST",
            body: try JSONEncoder().encode(["filename": task.filename ?? "upload"])
        )

        let (data, _) = try await URLSession.shared.data(for: request)
        let response = try JSONDecoder().decode(PresignedResponse.self, from: data)

        guard let url = URL(string: response.url) else {
            throw BackgroundUploadError.invalidURL
        }

        return url
    }

    private func getMimeType(for fileURL: URL) -> String {
        let ext = fileURL.pathExtension.lowercased()
        switch ext {
        case "jpg", "jpeg": return "image/jpeg"
        case "png": return "image/png"
        case "gif": return "image/gif"
        case "webp": return "image/webp"
        case "heic": return "image/heic"
        case "mp4": return "video/mp4"
        case "mov": return "video/quicktime"
        case "m4a": return "audio/m4a"
        case "mp3": return "audio/mpeg"
        case "wav": return "audio/wav"
        case "pdf": return "application/pdf"
        default: return "application/octet-stream"
        }
    }

    // MARK: - Persistence (Documents Directory JSON)
    private func persistQueue() {
        do {
            let encoder = JSONEncoder()
            encoder.dateEncodingStrategy = .iso8601
            let data = try encoder.encode(uploadQueue)
            try data.write(to: queueFileURL, options: [.atomic])
        } catch {
            print("[BackgroundUploader] Failed to persist queue: \(error)")
        }
    }

    private func loadQueue() {
        do {
            guard FileManager.default.fileExists(atPath: queueFileURL.path) else { return }
            let data = try Data(contentsOf: queueFileURL)
            let decoder = JSONDecoder()
            decoder.dateDecodingStrategy = .iso8601
            uploadQueue = try decoder.decode([UploadTask].self, from: data)
        } catch {
            print("[BackgroundUploader] Failed to load queue: \(error)")
            uploadQueue = []
        }
    }

    private func saveProcessedKeys() {
        do {
            let data = try JSONEncoder().encode(Array(processedIdempotencyKeys))
            try data.write(to: processedKeysFileURL, options: [.atomic])

            // Trim old keys if too many (keep last 10000)
            if processedIdempotencyKeys.count > 10000 {
                let keysArray = Array(processedIdempotencyKeys)
                processedIdempotencyKeys = Set(keysArray.suffix(10000))
            }
        } catch {
            print("[BackgroundUploader] Failed to save processed keys: \(error)")
        }
    }

    private func loadProcessedKeys() {
        do {
            guard FileManager.default.fileExists(atPath: processedKeysFileURL.path) else { return }
            let data = try Data(contentsOf: processedKeysFileURL)
            let keys = try JSONDecoder().decode([String].self, from: data)
            processedIdempotencyKeys = Set(keys)
        } catch {
            print("[BackgroundUploader] Failed to load processed keys: \(error)")
            processedIdempotencyKeys = []
        }
    }

    private func markAsFailed(_ task: UploadTask) {
        uploadQueue.removeAll { $0.id == task.id }

        // Store in failed queue for later inspection
        let failedQueueURL = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("failedUploads.json")

        do {
            var failedTasks: [FailedUploadRecord] = []
            if FileManager.default.fileExists(atPath: failedQueueURL.path) {
                let data = try Data(contentsOf: failedQueueURL)
                failedTasks = try JSONDecoder().decode([FailedUploadRecord].self, from: data)
            }

            let record = FailedUploadRecord(
                taskId: task.id,
                idempotencyKey: task.idempotencyKey,
                type: task.type,
                lastError: task.lastError,
                failedAt: Date()
            )
            failedTasks.append(record)

            // Keep only last 100 failed records
            if failedTasks.count > 100 {
                failedTasks = Array(failedTasks.suffix(100))
            }

            let data = try JSONEncoder().encode(failedTasks)
            try data.write(to: failedQueueURL, options: [.atomic])
        } catch {
            print("[BackgroundUploader] Failed to save failed upload record: \(error)")
        }

        persistQueue()
    }

    // MARK: - Clear Queue
    func clearQueue() {
        uploadQueue.removeAll()
        persistQueue()
    }

    // MARK: - Get Queue Status
    func getQueueStatus() -> QueueStatus {
        QueueStatus(
            totalPending: uploadQueue.count,
            processing: isProcessing,
            oldestTask: uploadQueue.min(by: { $0.createdAt < $1.createdAt })?.createdAt,
            tasksAwaitingRetry: uploadQueue.filter { $0.nextRetryTime != nil && $0.nextRetryTime! > Date() }.count
        )
    }
}

// MARK: - Upload Task
struct UploadTask: Identifiable, Codable {
    let id: UUID
    let type: UploadType
    var data: Data?
    var fileURL: URL?
    var filename: String?
    var retryCount: Int
    var lastError: String?
    let createdAt: Date

    // Enhanced properties
    let sourceApp: SourceApp
    let privacyScope: PrivacyScope
    let idempotencyKey: String
    var nextRetryTime: Date?
    var uploadProgress: Double

    init(
        type: UploadType,
        data: Data? = nil,
        fileURL: URL? = nil,
        filename: String? = nil,
        sourceApp: SourceApp = .browser,
        privacyScope: PrivacyScope = .private
    ) {
        self.id = UUID()
        self.type = type
        self.data = data
        self.fileURL = fileURL
        self.filename = filename
        self.retryCount = 0
        self.lastError = nil
        self.createdAt = Date()
        self.sourceApp = sourceApp
        self.privacyScope = privacyScope
        self.idempotencyKey = "\(UUID().uuidString)_\(Int(Date().timeIntervalSince1970 * 1000))"
        self.nextRetryTime = nil
        self.uploadProgress = 0.0
    }

    /// Create with explicit idempotency key for deduplication
    init(
        type: UploadType,
        data: Data? = nil,
        fileURL: URL? = nil,
        filename: String? = nil,
        sourceApp: SourceApp = .browser,
        privacyScope: PrivacyScope = .private,
        idempotencyKey: String
    ) {
        self.id = UUID()
        self.type = type
        self.data = data
        self.fileURL = fileURL
        self.filename = filename
        self.retryCount = 0
        self.lastError = nil
        self.createdAt = Date()
        self.sourceApp = sourceApp
        self.privacyScope = privacyScope
        self.idempotencyKey = idempotencyKey
        self.nextRetryTime = nil
        self.uploadProgress = 0.0
    }

    enum UploadType: String, Codable {
        case event
        case media
        case batch
    }
}

// MARK: - Media Upload Event Data
struct MediaUploadEventData: Codable {
    let storageKey: String
    let storageURL: String
    let fileSize: Int64
    let filename: String
    let sourceApp: String
    let privacyScope: String
    let timestamp: Date
}

// MARK: - Failed Upload Record
struct FailedUploadRecord: Codable {
    let taskId: UUID
    let idempotencyKey: String
    let type: UploadTask.UploadType
    let lastError: String?
    let failedAt: Date
}

// MARK: - Queue Status
struct QueueStatus {
    let totalPending: Int
    let processing: Bool
    let oldestTask: Date?
    let tasksAwaitingRetry: Int
}

// MARK: - Presigned Response
struct PresignedResponse: Codable {
    let url: String
    let fields: [String: String]?
}

// MARK: - Errors
enum BackgroundUploadError: LocalizedError {
    case noData
    case noFile
    case noSession
    case invalidURL
    case serverError
    case mediaUploadFailed
    case eventLoggingFailed

    var errorDescription: String? {
        switch self {
        case .noData: return "No data to upload"
        case .noFile: return "No file to upload"
        case .noSession: return "Background session not available"
        case .invalidURL: return "Invalid upload URL"
        case .serverError: return "Server error during upload"
        case .mediaUploadFailed: return "Media upload to storage failed"
        case .eventLoggingFailed: return "Event logging failed after media upload"
        }
    }
}
