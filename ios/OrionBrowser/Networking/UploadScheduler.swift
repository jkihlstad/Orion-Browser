/**
 * UploadScheduler.swift
 * Upload coordination and scheduling
 * SUB-AGENT B: Edge Capture + Local Buffer + Background Upload
 *
 * Coordinates batch uploads with retry logic, exponential backoff,
 * and integration with BGTaskScheduler.
 */

import Foundation
import BackgroundTasks
import Combine

// MARK: - Upload State

/// Current state of the upload scheduler
public enum UploadSchedulerState: Sendable, Equatable {
    case idle
    case processing
    case waitingForNetwork
    case rateLimited(until: Date)
    case paused
}

// MARK: - Upload Result

/// Result of an upload operation
public struct UploadResult: Sendable {
    public let successCount: Int
    public let failedCount: Int
    public let errors: [String]
    public let duration: TimeInterval

    public var isSuccess: Bool { failedCount == 0 }
}

// MARK: - Upload Scheduler

/// Coordinates uploads with retry logic and background task integration
@MainActor
public final class UploadScheduler: ObservableObject {
    // MARK: - Published State

    @Published public private(set) var state: UploadSchedulerState = .idle
    @Published public private(set) var pendingCount: Int = 0
    @Published public private(set) var lastUploadTime: Date?
    @Published public private(set) var lastError: Error?
    @Published public private(set) var uploadProgress: Double = 0.0

    // MARK: - Configuration

    public struct Configuration: Sendable {
        public let batchSize: Int
        public let maxRetries: Int
        public let baseRetryDelay: TimeInterval
        public let maxRetryDelay: TimeInterval
        public let uploadInterval: TimeInterval
        public let requiresNetwork: Bool
        public let requiresPower: Bool

        public static let `default` = Configuration(
            batchSize: 50,
            maxRetries: 5,
            baseRetryDelay: 2.0,
            maxRetryDelay: 300.0,
            uploadInterval: 60.0,
            requiresNetwork: true,
            requiresPower: false
        )
    }

    // MARK: - Properties

    private let configuration: Configuration
    private let eventQueue: LocalEventQueue
    private let consentService: ConsentService
    private var uploadTask: Task<Void, Never>?
    private var periodicTimer: Timer?
    private var cancellables = Set<AnyCancellable>()
    private var isProcessing = false

    /// Convex client for backend uploads
    private weak var convexClient: ConvexManager?

    /// HTTP client for direct uploads
    private let httpClient: URLSession

    /// Base URL for uploads
    private let baseURL: String

    // MARK: - Initialization

    init(
        configuration: Configuration = .default,
        eventQueue: LocalEventQueue,
        consentService: ConsentService,
        convexClient: ConvexManager? = nil,
        baseURL: String? = nil
    ) {
        self.configuration = configuration
        self.eventQueue = eventQueue
        self.consentService = consentService
        self.convexClient = convexClient
        self.baseURL = baseURL ?? Configuration_App.convexDeploymentURL
        self.httpClient = URLSession.shared

        setupObservers()
    }

    deinit {
        periodicTimer?.invalidate()
        uploadTask?.cancel()
    }

    // MARK: - Public Methods

    /// Schedule an upload (will be processed when conditions are met)
    public func scheduleUpload() {
        guard state != .processing else { return }

        Task {
            await updatePendingCount()

            if pendingCount > 0 {
                await processQueue()
            }
        }
    }

    /// Process the queue immediately
    public func processQueue() async {
        guard !isProcessing else { return }
        guard state != .rateLimited(until: Date()) else { return }

        isProcessing = true
        state = .processing
        uploadProgress = 0.0

        defer {
            isProcessing = false
            state = .idle
            uploadProgress = 1.0
        }

        do {
            let result = try await uploadPendingEvents()

            if result.isSuccess {
                lastUploadTime = Date()
                lastError = nil
            } else if !result.errors.isEmpty {
                lastError = UploadError.batchFailed(result.errors)
            }

            await updatePendingCount()

        } catch {
            lastError = error
            print("[UploadScheduler] Upload failed: \(error)")
        }
    }

    /// Pause uploads
    public func pause() {
        state = .paused
        uploadTask?.cancel()
        periodicTimer?.invalidate()
    }

    /// Resume uploads
    public func resume() {
        state = .idle
        startPeriodicUpload()
        scheduleUpload()
    }

    /// Force flush all pending events
    public func flush() async -> UploadResult {
        guard !isProcessing else {
            return UploadResult(successCount: 0, failedCount: 0, errors: ["Already processing"], duration: 0)
        }

        isProcessing = true
        state = .processing
        uploadProgress = 0.0

        defer {
            isProcessing = false
            state = .idle
            uploadProgress = 1.0
        }

        var totalSuccess = 0
        var totalFailed = 0
        var allErrors: [String] = []
        let startTime = Date()

        // Keep uploading until queue is empty
        while true {
            let pending = await eventQueue.getPendingCount()
            if pending == 0 { break }

            do {
                let result = try await uploadPendingEvents()
                totalSuccess += result.successCount
                totalFailed += result.failedCount
                allErrors.append(contentsOf: result.errors)

                uploadProgress = Double(totalSuccess) / Double(totalSuccess + pending)

            } catch {
                allErrors.append(error.localizedDescription)
                break
            }

            // Small delay between batches
            try? await Task.sleep(nanoseconds: 100_000_000)
        }

        await updatePendingCount()
        lastUploadTime = Date()

        return UploadResult(
            successCount: totalSuccess,
            failedCount: totalFailed,
            errors: allErrors,
            duration: Date().timeIntervalSince(startTime)
        )
    }

    /// Schedule background upload task
    public func scheduleBackgroundTask() {
        let request = BGProcessingTaskRequest(identifier: BGTaskIdentifiers.upload)
        request.requiresNetworkConnectivity = configuration.requiresNetwork
        request.requiresExternalPower = configuration.requiresPower
        request.earliestBeginDate = Date(timeIntervalSinceNow: configuration.uploadInterval)

        do {
            try BGTaskScheduler.shared.submit(request)
            print("[UploadScheduler] Scheduled background upload task")
        } catch {
            print("[UploadScheduler] Failed to schedule background task: \(error)")
        }
    }

    // MARK: - Background Task Handler

    /// Handle background task execution
    public func handleBackgroundTask(_ task: BGProcessingTask) async {
        task.expirationHandler = { [weak self] in
            self?.isProcessing = false
            task.setTaskCompleted(success: false)
        }

        // Schedule next task
        scheduleBackgroundTask()

        // Process uploads
        let result = await flush()

        task.setTaskCompleted(success: result.isSuccess)
    }

    // MARK: - Private Methods

    private func uploadPendingEvents() async throws -> UploadResult {
        let startTime = Date()
        var successCount = 0
        var failedCount = 0
        var errors: [String] = []

        // Get pending events
        let events = try await eventQueue.getPendingEvents(limit: configuration.batchSize)

        guard !events.isEmpty else {
            return UploadResult(successCount: 0, failedCount: 0, errors: [], duration: 0)
        }

        // Check consent for each event
        let validEvents = events.filter { event in
            guard let modality = mapPrivacyScopeToModality(event.privacyScope) else {
                return true // Allow if no specific modality mapping
            }
            return consentService.canCapture(modality: modality)
        }

        // Upload batch
        do {
            try await uploadBatch(validEvents)

            // Mark as processed
            let ids = validEvents.map { $0.id }
            try await eventQueue.markBatchAsProcessed(ids)

            successCount = validEvents.count

        } catch let error as UploadError {
            // Handle specific upload errors
            switch error {
            case .serverError(let code, _):
                if code == 429 {
                    // Rate limited
                    let retryAfter = Date(timeIntervalSinceNow: 60)
                    state = .rateLimited(until: retryAfter)
                }
                fallthrough
            default:
                // Record failures
                for event in validEvents {
                    try? await eventQueue.recordRetryFailure(event.id, error: error.localizedDescription)
                }
                failedCount = validEvents.count
                errors.append(error.localizedDescription)
            }

        } catch {
            for event in validEvents {
                try? await eventQueue.recordRetryFailure(event.id, error: error.localizedDescription)
            }
            failedCount = validEvents.count
            errors.append(error.localizedDescription)
        }

        return UploadResult(
            successCount: successCount,
            failedCount: failedCount,
            errors: errors,
            duration: Date().timeIntervalSince(startTime)
        )
    }

    private func uploadBatch(_ events: [QueuedEventData]) async throws {
        guard !events.isEmpty else { return }

        guard let url = URL(string: "\(baseURL)/neural/ingest-batch") else {
            throw UploadError.invalidURL
        }

        // Get auth token
        guard let token = await ClerkAuthManager.shared.sessionToken else {
            throw UploadError.noAuthToken
        }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")

        // Build request body
        let eventDicts = try events.map { event -> [String: Any] in
            guard let payloadDict = try? JSONSerialization.jsonObject(with: event.payload) as? [String: Any] else {
                throw UploadError.encodingFailed
            }

            return [
                "eventId": event.idempotencyKey,
                "eventType": event.eventType,
                "payload": payloadDict,
                "timestamp": Int64(event.timestamp.timeIntervalSince1970 * 1000),
                "sourceApp": event.sourceApp,
                "privacyScope": event.privacyScope,
                "consentVersion": event.consentVersion
            ]
        }

        let body: [String: Any] = ["events": eventDicts]
        request.httpBody = try JSONSerialization.data(withJSONObject: body)

        // Send request
        let (data, response) = try await httpClient.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse else {
            throw UploadError.invalidResponse
        }

        switch httpResponse.statusCode {
        case 200..<300:
            // Success
            return

        case 401:
            throw UploadError.noAuthToken

        case 429:
            throw UploadError.rateLimited

        case 400..<500:
            let message = String(data: data, encoding: .utf8) ?? "Client error"
            throw UploadError.serverError(httpResponse.statusCode, message)

        case 500..<600:
            let message = String(data: data, encoding: .utf8) ?? "Server error"
            throw UploadError.serverError(httpResponse.statusCode, message)

        default:
            throw UploadError.serverError(httpResponse.statusCode, "Unknown error")
        }
    }

    private func setupObservers() {
        // Start periodic upload timer
        startPeriodicUpload()

        // Observe network changes
        NotificationCenter.default.publisher(for: .networkReachabilityChanged)
            .sink { [weak self] notification in
                if let isReachable = notification.userInfo?["isReachable"] as? Bool, isReachable {
                    self?.scheduleUpload()
                }
            }
            .store(in: &cancellables)
    }

    private func startPeriodicUpload() {
        periodicTimer?.invalidate()

        periodicTimer = Timer.scheduledTimer(
            withTimeInterval: configuration.uploadInterval,
            repeats: true
        ) { [weak self] _ in
            Task { @MainActor in
                self?.scheduleUpload()
            }
        }
    }

    private func updatePendingCount() async {
        pendingCount = await eventQueue.getPendingCount()
    }

    private func mapPrivacyScopeToModality(_ scope: String) -> ConsentModality? {
        switch scope {
        case "behavioral": return .behavioral
        case "visual": return .visual
        case "audio": return .audio
        case "location": return .location
        case "biometric": return .biometric
        case "analytics": return .analytics
        default: return nil
        }
    }
}

// MARK: - Upload Error

/// Errors that can occur during upload
public enum UploadError: LocalizedError {
    case invalidURL
    case noAuthToken
    case encodingFailed
    case invalidResponse
    case rateLimited
    case serverError(Int, String)
    case networkError(Error)
    case batchFailed([String])

    public var errorDescription: String? {
        switch self {
        case .invalidURL:
            return "Invalid upload URL"
        case .noAuthToken:
            return "No authentication token available"
        case .encodingFailed:
            return "Failed to encode request"
        case .invalidResponse:
            return "Invalid server response"
        case .rateLimited:
            return "Rate limited - please wait"
        case .serverError(let code, let message):
            return "Server error (\(code)): \(message)"
        case .networkError(let error):
            return "Network error: \(error.localizedDescription)"
        case .batchFailed(let errors):
            return "Batch upload failed: \(errors.joined(separator: ", "))"
        }
    }
}

// MARK: - BGTask Identifiers

/// Background task identifiers
public enum BGTaskIdentifiers {
    public static let upload = "com.orion.browser.upload"
    public static let sync = "com.orion.browser.sync"
    public static let cleanup = "com.orion.browser.cleanup"
}

// MARK: - Configuration App Type Alias

/// Type alias to avoid naming conflict with Configuration
typealias Configuration_App = Configuration

// MARK: - Notification Names

extension Notification.Name {
    static let networkReachabilityChanged = Notification.Name("networkReachabilityChanged")
}

// MARK: - Upload Scheduler Observable Extension

extension UploadScheduler {
    /// Create status summary for display
    public var statusSummary: String {
        switch state {
        case .idle:
            if pendingCount > 0 {
                return "\(pendingCount) events pending"
            } else {
                return "Up to date"
            }
        case .processing:
            return "Uploading..."
        case .waitingForNetwork:
            return "Waiting for network"
        case .rateLimited(let until):
            let formatter = RelativeDateTimeFormatter()
            return "Rate limited \(formatter.localizedString(for: until, relativeTo: Date()))"
        case .paused:
            return "Paused"
        }
    }

    /// Whether upload is currently in progress
    public var isUploading: Bool {
        state == .processing
    }
}
