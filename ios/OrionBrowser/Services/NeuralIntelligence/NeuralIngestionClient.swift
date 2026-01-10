/**
 * NeuralIngestionClient.swift
 * Main ingestion client for the Neural Intelligence SDK
 * SUB-AGENT 1: iOS Neural SDK Engineer
 *
 * Handles event queuing, persistence, batch uploads, and background
 * task scheduling for reliable event delivery to the backend.
 */

import Foundation
import BackgroundTasks
import UIKit
import Combine

// MARK: - Ingestion Configuration
/// Configuration options for the Neural Ingestion Client
struct NeuralIngestionConfiguration {
    /// Maximum number of events to include in a single batch upload
    let batchSize: Int

    /// Maximum time interval between automatic flushes (in seconds)
    let flushInterval: TimeInterval

    /// Maximum number of events to store locally before forcing a flush
    let maxQueueSize: Int

    /// Number of retry attempts for failed uploads
    let maxRetryAttempts: Int

    /// Base URL for the ingestion endpoint
    let ingestionEndpoint: URL

    /// Whether to enable background task scheduling
    let enableBackgroundTasks: Bool

    /// Default configuration
    static var `default`: NeuralIngestionConfiguration {
        NeuralIngestionConfiguration(
            batchSize: 50,
            flushInterval: 60.0,
            maxQueueSize: 500,
            maxRetryAttempts: 3,
            ingestionEndpoint: URL(string: Configuration.convexDeploymentURL)!,
            enableBackgroundTasks: true
        )
    }

    /// Development configuration with more aggressive flushing
    static var development: NeuralIngestionConfiguration {
        NeuralIngestionConfiguration(
            batchSize: 10,
            flushInterval: 15.0,
            maxQueueSize: 100,
            maxRetryAttempts: 1,
            ingestionEndpoint: URL(string: Configuration.convexDeploymentURL)!,
            enableBackgroundTasks: false
        )
    }
}

// MARK: - Ingestion Error
/// Errors that can occur during event ingestion
enum NeuralIngestionError: Error, LocalizedError {
    case notInitialized
    case consentNotGranted
    case queueFull
    case serializationFailed(String)
    case networkError(Error)
    case serverError(Int, String)
    case persistenceFailed(String)

    var errorDescription: String? {
        switch self {
        case .notInitialized:
            return "Neural Ingestion Client not initialized"
        case .consentNotGranted:
            return "User consent not granted for data collection"
        case .queueFull:
            return "Event queue is full, please flush"
        case .serializationFailed(let reason):
            return "Failed to serialize event: \(reason)"
        case .networkError(let error):
            return "Network error: \(error.localizedDescription)"
        case .serverError(let code, let message):
            return "Server error (\(code)): \(message)"
        case .persistenceFailed(let reason):
            return "Persistence error: \(reason)"
        }
    }
}

// MARK: - Ingestion State
/// Current state of the ingestion client
enum NeuralIngestionState: Equatable {
    case idle
    case uploading
    case paused
    case error(NeuralIngestionError)

    static func == (lhs: NeuralIngestionState, rhs: NeuralIngestionState) -> Bool {
        switch (lhs, rhs) {
        case (.idle, .idle), (.uploading, .uploading), (.paused, .paused):
            return true
        case (.error, .error):
            return true
        default:
            return false
        }
    }
}

// MARK: - Neural Ingestion Client
/// Singleton client for managing Neural event ingestion
@MainActor
final class NeuralIngestionClient: ObservableObject {
    // MARK: - Singleton
    static let shared = NeuralIngestionClient()

    // MARK: - Published Properties
    @Published private(set) var state: NeuralIngestionState = .idle
    @Published private(set) var queuedEventCount: Int = 0
    @Published private(set) var lastUploadTime: Date?
    @Published private(set) var totalEventsUploaded: Int = 0

    // MARK: - Configuration
    private(set) var configuration: NeuralIngestionConfiguration = .default
    private var isInitialized = false

    // MARK: - Queue Management
    private var eventQueue: [NeuralEvent] = []
    private let queueLock = NSLock()

    // MARK: - Persistence
    private let fileManager = FileManager.default
    private lazy var persistenceURL: URL = {
        let paths = fileManager.urls(for: .documentDirectory, in: .userDomainMask)
        return paths[0].appendingPathComponent("neural_events_queue.json")
    }()
    private lazy var statsURL: URL = {
        let paths = fileManager.urls(for: .documentDirectory, in: .userDomainMask)
        return paths[0].appendingPathComponent("neural_ingestion_stats.json")
    }()

    // MARK: - Timing
    private var flushTimer: Timer?
    private var cancellables = Set<AnyCancellable>()

    // MARK: - Network
    private let session: URLSession
    private var authToken: String?

    // MARK: - Background Tasks
    private static let backgroundTaskIdentifier = "com.orion.browser.neuralIngestion"
    private static let backgroundRefreshIdentifier = "com.orion.browser.neuralRefresh"

    // MARK: - Device Identifier
    private lazy var deviceId: String = {
        if let id = UserDefaults.standard.string(forKey: "neural_device_id") {
            return id
        }
        let newId = UUID().uuidString
        UserDefaults.standard.set(newId, forKey: "neural_device_id")
        return newId
    }()

    // MARK: - Initialization
    private init() {
        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 30
        config.timeoutIntervalForResource = 60
        config.waitsForConnectivity = true
        self.session = URLSession(configuration: config)
    }

    // MARK: - Setup
    /// Initialize the ingestion client with configuration
    /// - Parameters:
    ///   - configuration: Configuration options
    ///   - authToken: Optional authentication token
    func initialize(
        configuration: NeuralIngestionConfiguration = .default,
        authToken: String? = nil
    ) async {
        self.configuration = configuration
        self.authToken = authToken

        // Load persisted queue and stats
        await loadPersistedQueue()
        loadStats()

        // Register background tasks
        if configuration.enableBackgroundTasks {
            registerBackgroundTasks()
        }

        // Start flush timer
        startFlushTimer()

        // Monitor app lifecycle
        setupLifecycleObservers()

        isInitialized = true

        print("[NeuralIngestionClient] Initialized with \(queuedEventCount) queued events")
    }

    /// Update authentication token
    /// - Parameter token: New authentication token
    func setAuthToken(_ token: String?) {
        self.authToken = token
    }

    // MARK: - Event Enqueueing
    /// Enqueue an event for upload
    /// - Parameter event: The event to enqueue
    /// - Throws: NeuralIngestionError if consent not granted or queue full
    func enqueue(_ event: NeuralEvent) async throws {
        guard isInitialized else {
            throw NeuralIngestionError.notInitialized
        }

        // Check consent
        guard await NeuralConsentManager.shared.canCollect(modality: modalityFromEvent(event)) else {
            throw NeuralIngestionError.consentNotGranted
        }

        queueLock.lock()
        defer { queueLock.unlock() }

        // Check queue capacity
        if eventQueue.count >= configuration.maxQueueSize {
            // Try to flush first
            queueLock.unlock()
            await flush()
            queueLock.lock()

            // If still full, reject
            if eventQueue.count >= configuration.maxQueueSize {
                throw NeuralIngestionError.queueFull
            }
        }

        eventQueue.append(event)
        queuedEventCount = eventQueue.count

        // Persist queue
        try? await persistQueue()

        // Auto-flush if batch size reached
        if eventQueue.count >= configuration.batchSize {
            queueLock.unlock()
            await flush()
        }
    }

    /// Enqueue multiple events
    /// - Parameter events: Array of events to enqueue
    func enqueue(_ events: [NeuralEvent]) async throws {
        for event in events {
            try await enqueue(event)
        }
    }

    // MARK: - Flush
    /// Immediately upload all queued events
    @discardableResult
    func flush() async -> Bool {
        guard isInitialized else { return false }
        guard state != .uploading else { return false }

        queueLock.lock()
        guard !eventQueue.isEmpty else {
            queueLock.unlock()
            return true
        }

        // Take events for upload
        let eventsToUpload = Array(eventQueue.prefix(configuration.batchSize))
        queueLock.unlock()

        state = .uploading

        do {
            let batch = NeuralEventBatch(events: eventsToUpload, deviceId: deviceId)
            try await uploadBatch(batch)

            // Remove uploaded events from queue
            queueLock.lock()
            eventQueue.removeFirst(min(eventsToUpload.count, eventQueue.count))
            queuedEventCount = eventQueue.count
            queueLock.unlock()

            // Update stats
            totalEventsUploaded += eventsToUpload.count
            lastUploadTime = Date()
            saveStats()

            // Persist remaining queue
            try? await persistQueue()

            state = .idle

            // Continue flushing if more events remain
            if queuedEventCount >= configuration.batchSize {
                return await flush()
            }

            return true
        } catch {
            print("[NeuralIngestionClient] Flush failed: \(error)")
            state = .error(error as? NeuralIngestionError ?? .networkError(error))
            return false
        }
    }

    /// Pause event uploads
    func pause() {
        state = .paused
        flushTimer?.invalidate()
        flushTimer = nil
    }

    /// Resume event uploads
    func resume() {
        state = .idle
        startFlushTimer()
    }

    // MARK: - Network Upload
    private func uploadBatch(_ batch: NeuralEventBatch, attempt: Int = 1) async throws {
        guard let url = URL(string: "\(configuration.ingestionEndpoint)/mutation") else {
            throw NeuralIngestionError.serializationFailed("Invalid endpoint URL")
        }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        if let token = authToken {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }

        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .millisecondsSince1970

        let body: [String: Any] = [
            "path": "intelligence:ingestEvents",
            "args": [
                "batchId": batch.batchId.uuidString,
                "events": try JSONSerialization.jsonObject(with: encoder.encode(batch.events)),
                "deviceId": batch.deviceId,
                "timestamp": batch.createdAt.timeIntervalSince1970 * 1000
            ]
        ]

        request.httpBody = try JSONSerialization.data(withJSONObject: body)

        do {
            let (data, response) = try await session.data(for: request)

            guard let httpResponse = response as? HTTPURLResponse else {
                throw NeuralIngestionError.networkError(NSError(domain: "Invalid response", code: -1))
            }

            if 200..<300 ~= httpResponse.statusCode {
                return // Success
            }

            let errorMessage = String(data: data, encoding: .utf8) ?? "Unknown error"

            // Retry on certain status codes
            if attempt < configuration.maxRetryAttempts && [429, 500, 502, 503, 504].contains(httpResponse.statusCode) {
                let delay = Double(attempt) * 2.0 // Exponential backoff
                try await Task.sleep(nanoseconds: UInt64(delay * 1_000_000_000))
                return try await uploadBatch(batch, attempt: attempt + 1)
            }

            throw NeuralIngestionError.serverError(httpResponse.statusCode, errorMessage)
        } catch let error as NeuralIngestionError {
            throw error
        } catch {
            // Retry on network errors
            if attempt < configuration.maxRetryAttempts {
                let delay = Double(attempt) * 2.0
                try await Task.sleep(nanoseconds: UInt64(delay * 1_000_000_000))
                return try await uploadBatch(batch, attempt: attempt + 1)
            }
            throw NeuralIngestionError.networkError(error)
        }
    }

    // MARK: - Persistence
    private func persistQueue() async throws {
        queueLock.lock()
        let eventsToSave = eventQueue
        queueLock.unlock()

        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .millisecondsSince1970

        do {
            let data = try encoder.encode(eventsToSave)
            try data.write(to: persistenceURL, options: .atomic)
        } catch {
            throw NeuralIngestionError.persistenceFailed(error.localizedDescription)
        }
    }

    private func loadPersistedQueue() async {
        guard fileManager.fileExists(atPath: persistenceURL.path) else { return }

        do {
            let data = try Data(contentsOf: persistenceURL)
            let decoder = JSONDecoder()
            decoder.dateDecodingStrategy = .millisecondsSince1970
            let events = try decoder.decode([NeuralEvent].self, from: data)

            queueLock.lock()
            eventQueue = events
            queuedEventCount = events.count
            queueLock.unlock()
        } catch {
            print("[NeuralIngestionClient] Failed to load persisted queue: \(error)")
        }
    }

    // MARK: - Stats Persistence
    private struct IngestionStats: Codable {
        var totalEventsUploaded: Int
        var lastUploadTime: Date?
    }

    private func saveStats() {
        let stats = IngestionStats(
            totalEventsUploaded: totalEventsUploaded,
            lastUploadTime: lastUploadTime
        )
        if let data = try? JSONEncoder().encode(stats) {
            try? data.write(to: statsURL, options: .atomic)
        }
    }

    private func loadStats() {
        guard let data = try? Data(contentsOf: statsURL),
              let stats = try? JSONDecoder().decode(IngestionStats.self, from: data) else {
            return
        }
        totalEventsUploaded = stats.totalEventsUploaded
        lastUploadTime = stats.lastUploadTime
    }

    // MARK: - Flush Timer
    private func startFlushTimer() {
        flushTimer?.invalidate()
        flushTimer = Timer.scheduledTimer(
            withTimeInterval: configuration.flushInterval,
            repeats: true
        ) { [weak self] _ in
            Task { @MainActor [weak self] in
                await self?.flush()
            }
        }
    }

    // MARK: - Background Tasks
    private func registerBackgroundTasks() {
        BGTaskScheduler.shared.register(
            forTaskWithIdentifier: Self.backgroundTaskIdentifier,
            using: nil
        ) { [weak self] task in
            Task { @MainActor [weak self] in
                await self?.handleBackgroundTask(task as! BGProcessingTask)
            }
        }

        BGTaskScheduler.shared.register(
            forTaskWithIdentifier: Self.backgroundRefreshIdentifier,
            using: nil
        ) { [weak self] task in
            Task { @MainActor [weak self] in
                await self?.handleBackgroundRefresh(task as! BGAppRefreshTask)
            }
        }
    }

    private func scheduleBackgroundTask() {
        let request = BGProcessingTaskRequest(identifier: Self.backgroundTaskIdentifier)
        request.requiresNetworkConnectivity = true
        request.requiresExternalPower = false
        request.earliestBeginDate = Date(timeIntervalSinceNow: 15 * 60) // 15 minutes

        do {
            try BGTaskScheduler.shared.submit(request)
        } catch {
            print("[NeuralIngestionClient] Failed to schedule background task: \(error)")
        }
    }

    private func scheduleBackgroundRefresh() {
        let request = BGAppRefreshTaskRequest(identifier: Self.backgroundRefreshIdentifier)
        request.earliestBeginDate = Date(timeIntervalSinceNow: 60 * 60) // 1 hour

        do {
            try BGTaskScheduler.shared.submit(request)
        } catch {
            print("[NeuralIngestionClient] Failed to schedule background refresh: \(error)")
        }
    }

    private func handleBackgroundTask(_ task: BGProcessingTask) async {
        // Schedule next task
        scheduleBackgroundTask()

        task.expirationHandler = { [weak self] in
            Task { @MainActor [weak self] in
                self?.pause()
            }
        }

        let success = await flush()
        task.setTaskCompleted(success: success)
    }

    private func handleBackgroundRefresh(_ task: BGAppRefreshTask) async {
        // Schedule next refresh
        scheduleBackgroundRefresh()

        task.expirationHandler = { [weak self] in
            Task { @MainActor [weak self] in
                self?.pause()
            }
        }

        let success = await flush()
        task.setTaskCompleted(success: success)
    }

    // MARK: - Lifecycle Observers
    private func setupLifecycleObservers() {
        NotificationCenter.default.publisher(for: UIApplication.willResignActiveNotification)
            .sink { [weak self] _ in
                Task { @MainActor [weak self] in
                    await self?.flush()
                    self?.scheduleBackgroundTask()
                }
            }
            .store(in: &cancellables)

        NotificationCenter.default.publisher(for: UIApplication.didEnterBackgroundNotification)
            .sink { [weak self] _ in
                Task { @MainActor [weak self] in
                    try? await self?.persistQueue()
                }
            }
            .store(in: &cancellables)

        NotificationCenter.default.publisher(for: UIApplication.willTerminateNotification)
            .sink { [weak self] _ in
                Task { @MainActor [weak self] in
                    try? await self?.persistQueue()
                }
            }
            .store(in: &cancellables)
    }

    // MARK: - Helpers
    private func modalityFromEvent(_ event: NeuralEvent) -> NeuralConsentModality {
        if event.modality.audioRef != nil { return .audio }
        if event.modality.videoRef != nil { return .video }
        if event.modality.imageRef != nil { return .analytics }
        return .analytics
    }

    // MARK: - Cleanup
    /// Clear all queued events
    func clearQueue() async {
        queueLock.lock()
        eventQueue.removeAll()
        queuedEventCount = 0
        queueLock.unlock()

        try? fileManager.removeItem(at: persistenceURL)
    }

    /// Reset all stats
    func resetStats() {
        totalEventsUploaded = 0
        lastUploadTime = nil
        try? fileManager.removeItem(at: statsURL)
    }
}
