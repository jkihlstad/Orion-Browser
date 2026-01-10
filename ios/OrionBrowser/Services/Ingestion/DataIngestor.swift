/**
 * DataIngestor.swift
 * Production-ready neural event ingestion for Orion Browser
 * Supports multi-app sources, privacy scopes, multimodal data, and offline buffering
 */

import Foundation
import UIKit
import Combine

// NOTE: AnyCodable is defined in NeuralEvent.swift - using that version
// NOTE: SourceApp is defined in NeuralEvent.swift - using extended version below

// MARK: - Data Privacy Scope Enum (renamed to avoid conflict with NeuralEvent.PrivacyScope)

/// Privacy scopes for consent management in data ingestion
/// This represents consent categories, different from NeuralEvent.PrivacyScope which represents visibility levels
enum DataPrivacyScope: String, Codable, CaseIterable {
    case essential
    case functional
    case analytics
    case personalization
    case biometric
    case location
    case media
    case social
    case behavioral

    var displayName: String {
        switch self {
        case .essential: return "Essential"
        case .functional: return "Functional"
        case .analytics: return "Analytics"
        case .personalization: return "Personalization"
        case .biometric: return "Biometric"
        case .location: return "Location"
        case .media: return "Media"
        case .social: return "Social"
        case .behavioral: return "Behavioral"
        }
    }

    var description: String {
        switch self {
        case .essential: return "Required for core functionality"
        case .functional: return "Enhances user experience"
        case .analytics: return "Usage analytics and insights"
        case .personalization: return "AI personalization features"
        case .biometric: return "Biometric data (health, voice, etc.)"
        case .location: return "Location tracking"
        case .media: return "Audio/video/screenshot capture"
        case .social: return "Social interactions"
        case .behavioral: return "Behavioral patterns"
        }
    }
}

// MARK: - Modality Struct

/// Multimodal data support
struct Modality: Codable, Equatable {
    var text: String?
    var imageRef: String?
    var audioRef: String?
    var videoRef: String?
    var metrics: [String: AnyCodable]?

    init(
        text: String? = nil,
        imageRef: String? = nil,
        audioRef: String? = nil,
        videoRef: String? = nil,
        metrics: [String: AnyCodable]? = nil
    ) {
        self.text = text
        self.imageRef = imageRef
        self.audioRef = audioRef
        self.videoRef = videoRef
        self.metrics = metrics
    }

    /// Create modality flags for backend compatibility
    var modalityFlags: ModalityFlags {
        ModalityFlags(
            text: text != nil,
            audio: audioRef != nil,
            video: videoRef != nil,
            image: imageRef != nil,
            numeric: metrics != nil,
            biometric: false,
            location: false,
            interaction: false
        )
    }
}

/// Modality flags matching backend schema
struct ModalityFlags: Codable, Equatable {
    let text: Bool
    let audio: Bool
    let video: Bool
    let image: Bool
    let numeric: Bool
    let biometric: Bool
    let location: Bool
    let interaction: Bool

    init(
        text: Bool = false,
        audio: Bool = false,
        video: Bool = false,
        image: Bool = false,
        numeric: Bool = false,
        biometric: Bool = false,
        location: Bool = false,
        interaction: Bool = false
    ) {
        self.text = text
        self.audio = audio
        self.video = video
        self.image = image
        self.numeric = numeric
        self.biometric = biometric
        self.location = location
        self.interaction = interaction
    }
}

// MARK: - Event Context

/// Device and app context for events (renamed to avoid conflict with EventContext in Events/EventContext.swift)
struct IngestorEventContext: Codable, Equatable {
    let deviceModel: String
    let osVersion: String
    let appVersion: String
    let locale: String
    let timezone: String
    let network: String

    init(
        deviceModel: String? = nil,
        osVersion: String? = nil,
        appVersion: String? = nil,
        locale: String? = nil,
        timezone: String? = nil,
        network: String? = nil
    ) {
        self.deviceModel = deviceModel ?? Self.currentDeviceModel()
        self.osVersion = osVersion ?? Self.currentOSVersion()
        self.appVersion = appVersion ?? Self.currentAppVersion()
        self.locale = locale ?? Locale.current.identifier
        self.timezone = timezone ?? TimeZone.current.identifier
        self.network = network ?? "unknown"
    }

    static func currentDeviceModel() -> String {
        var systemInfo = utsname()
        uname(&systemInfo)
        let modelCode = withUnsafePointer(to: &systemInfo.machine) {
            $0.withMemoryRebound(to: CChar.self, capacity: 1) {
                String(validatingUTF8: $0)
            }
        }
        return modelCode ?? UIDevice.current.model
    }

    static func currentOSVersion() -> String {
        UIDevice.current.systemVersion
    }

    static func currentAppVersion() -> String {
        Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "1.0.0"
    }

    /// Device info for backend API
    var deviceInfo: DeviceInfo {
        DeviceInfo(
            deviceId: UIDevice.current.identifierForVendor?.uuidString ?? UUID().uuidString,
            platform: "iOS",
            osVersion: osVersion,
            appVersion: appVersion
        )
    }
}

/// Device info matching backend schema
struct DeviceInfo: Codable, Equatable {
    let deviceId: String
    let platform: String
    let osVersion: String
    let appVersion: String
}

// MARK: - Event Payload

/// Comprehensive event payload matching backend neuralEvents schema
struct EventPayload: Codable, Identifiable, Equatable {
    let id: UUID
    let eventType: String
    let eventTypeId: String
    let timestamp: Int64
    let modality: Modality
    let context: IngestorEventContext
    let sourceApp: SourceApp
    let privacyScope: DataPrivacyScope
    let consentVersion: String
    let idempotencyKey: String
    let schemaVersion: String
    let payload: [String: AnyCodable]?
    let sessionId: String?

    init(
        eventType: String,
        eventTypeId: String? = nil,
        modality: Modality = Modality(),
        context: IngestorEventContext? = nil,
        sourceApp: SourceApp,
        privacyScope: DataPrivacyScope,
        consentVersion: String = "1.0",
        payload: [String: AnyCodable]? = nil,
        sessionId: String? = nil
    ) {
        self.id = UUID()
        self.eventType = eventType
        self.eventTypeId = eventTypeId ?? "\(sourceApp.rawValue).\(eventType)"
        self.timestamp = Int64(Date().timeIntervalSince1970 * 1000)
        self.modality = modality
        self.context = context ?? IngestorEventContext()
        self.sourceApp = sourceApp
        self.privacyScope = privacyScope
        self.consentVersion = consentVersion
        self.idempotencyKey = UUID().uuidString
        self.schemaVersion = "1.0.0"
        self.payload = payload
        self.sessionId = sessionId
    }

    static func == (lhs: EventPayload, rhs: EventPayload) -> Bool {
        lhs.id == rhs.id
    }

    /// Convert to backend API format
    func toAPIFormat() -> [String: Any] {
        var result: [String: Any] = [
            "eventId": idempotencyKey,
            "eventTypeId": eventTypeId,
            "clientTimestamp": timestamp,
            "timezoneOffset": TimeZone.current.secondsFromGMT() / 60,
            "payload": payload?.mapValues { $0.value } ?? [:],
            "deviceInfo": [
                "deviceId": context.deviceInfo.deviceId,
                "platform": context.deviceInfo.platform,
                "osVersion": context.deviceInfo.osVersion,
                "appVersion": context.deviceInfo.appVersion
            ]
        ]

        if let sessionId = sessionId {
            result["sessionId"] = sessionId
        }

        return result
    }
}

// MARK: - Batch Upload Result

/// Result of a batch upload operation
struct BatchUploadResult: Codable {
    let success: Bool
    let totalReceived: Int
    let totalIngested: Int
    let totalSkipped: Int
    let totalFailed: Int
    let results: [EventResult]?
    let error: APIError?

    struct EventResult: Codable {
        let eventId: String
        let status: String
        let error: String?
    }

    struct APIError: Codable {
        let code: String
        let message: String
    }
}

// MARK: - Ingestion Error

enum IngestionError: Error, LocalizedError {
    case noAuthToken
    case networkError(Error)
    case serverError(Int, String)
    case encodingError(Error)
    case decodingError(Error)
    case invalidURL
    case offline
    case consentRequired(scopes: [String])

    var errorDescription: String? {
        switch self {
        case .noAuthToken:
            return "No authentication token available"
        case .networkError(let error):
            return "Network error: \(error.localizedDescription)"
        case .serverError(let code, let message):
            return "Server error (\(code)): \(message)"
        case .encodingError(let error):
            return "Encoding error: \(error.localizedDescription)"
        case .decodingError(let error):
            return "Decoding error: \(error.localizedDescription)"
        case .invalidURL:
            return "Invalid URL"
        case .offline:
            return "Device is offline"
        case .consentRequired(let scopes):
            return "Consent required for scopes: \(scopes.joined(separator: ", "))"
        }
    }
}

// MARK: - Observable Ingestion State

/// SwiftUI-compatible observable state for ingestion
@MainActor
final class IngestionState: ObservableObject {
    @Published var queueCount: Int = 0
    @Published var isProcessing: Bool = false
    @Published var lastUploadTime: Date?
    @Published var lastError: IngestionError?
    @Published var isOnline: Bool = true
    @Published var totalEventsIngested: Int = 0

    func update(queueCount: Int, isProcessing: Bool) {
        self.queueCount = queueCount
        self.isProcessing = isProcessing
    }

    func recordUpload() {
        lastUploadTime = Date()
    }

    func recordError(_ error: IngestionError?) {
        lastError = error
    }

    func incrementIngested(by count: Int) {
        totalEventsIngested += count
    }
}

// MARK: - Data Ingestor Actor

actor DataIngestor {
    // MARK: - Singleton
    static let shared = DataIngestor()

    // MARK: - Configuration
    private let maxQueueSize = 500
    private let batchSize = 50
    private let persistenceKey = "orion.neural.eventQueue"
    private let baseURL: String

    // MARK: - State
    private var eventQueue: [EventPayload] = []
    private var isProcessing = false
    private var clerkJWTToken: String?
    private var currentSessionId: String?
    private var currentUserId: String?

    // MARK: - Observable State (MainActor)
    @MainActor let state = IngestionState()

    // MARK: - Initialization
    private init() {
        // Configure base URL from environment or use default
        if let envURL = ProcessInfo.processInfo.environment["CONVEX_URL"] {
            self.baseURL = envURL
        } else if let plistURL = Bundle.main.infoDictionary?["CONVEX_URL"] as? String {
            self.baseURL = plistURL
        } else {
            // Default Convex deployment URL - should be configured per environment
            self.baseURL = "https://your-convex-deployment.convex.site"
        }

        // Load persisted queue
        Task {
            await loadPersistedQueue()
        }
    }

    // MARK: - Authentication

    /// Set the Clerk JWT token for authenticated API calls
    func setClerkToken(_ token: String) {
        self.clerkJWTToken = token
    }

    /// Clear the authentication token
    func clearToken() {
        self.clerkJWTToken = nil
    }

    /// Set the current user ID
    func setUserId(_ userId: String) {
        self.currentUserId = userId
    }

    /// Set the current session ID
    func setSessionId(_ sessionId: String) {
        self.currentSessionId = sessionId
    }

    // MARK: - Event Ingestion

    /// Ingest a generic neural event
    func ingestEvent(
        eventType: String,
        sourceApp: SourceApp,
        privacyScope: DataPrivacyScope,
        modality: Modality = Modality(),
        payload: [String: AnyCodable]? = nil,
        consentVersion: String = "1.0"
    ) async {
        let event = EventPayload(
            eventType: eventType,
            modality: modality,
            sourceApp: sourceApp,
            privacyScope: privacyScope,
            consentVersion: consentVersion,
            payload: payload,
            sessionId: currentSessionId
        )

        await queueEvent(event)
    }

    /// Ingest a page visit event
    func ingestPageVisit(
        url: URL,
        title: String,
        content: String?,
        metadata: [String: String] = [:]
    ) async {
        var payloadDict: [String: AnyCodable] = [
            "url": AnyCodable(url.absoluteString),
            "title": AnyCodable(title)
        ]

        if let content = content {
            payloadDict["content"] = AnyCodable(String(content.prefix(10000)))
        }

        for (key, value) in metadata {
            payloadDict["metadata_\(key)"] = AnyCodable(value)
        }

        let modality = Modality(text: content)

        await ingestEvent(
            eventType: "page_visit",
            sourceApp: .browser,
            privacyScope: .analytics,
            modality: modality,
            payload: payloadDict
        )
    }

    /// Ingest a scroll event
    func ingestScrollEvent(
        url: URL,
        scrollDepth: Double,
        timeOnPage: TimeInterval
    ) async {
        let payload: [String: AnyCodable] = [
            "url": AnyCodable(url.absoluteString),
            "scrollDepth": AnyCodable(scrollDepth),
            "timeOnPage": AnyCodable(timeOnPage)
        ]

        let modality = Modality(metrics: [
            "scrollDepth": AnyCodable(scrollDepth),
            "timeOnPage": AnyCodable(timeOnPage)
        ])

        await ingestEvent(
            eventType: "scroll_depth",
            sourceApp: .browser,
            privacyScope: .behavioral,
            modality: modality,
            payload: payload
        )
    }

    /// Ingest a click event
    func ingestClickEvent(
        url: URL,
        elementType: String,
        elementText: String?
    ) async {
        var payload: [String: AnyCodable] = [
            "url": AnyCodable(url.absoluteString),
            "elementType": AnyCodable(elementType)
        ]

        if let elementText = elementText {
            payload["elementText"] = AnyCodable(elementText)
        }

        let modality = Modality(text: elementText)

        await ingestEvent(
            eventType: "click_interaction",
            sourceApp: .browser,
            privacyScope: .behavioral,
            modality: modality,
            payload: payload
        )
    }

    /// Ingest a search event
    func ingestSearchEvent(
        query: String,
        source: String
    ) async {
        let payload: [String: AnyCodable] = [
            "query": AnyCodable(query),
            "source": AnyCodable(source)
        ]

        let modality = Modality(text: query)

        await ingestEvent(
            eventType: "search_query",
            sourceApp: .browser,
            privacyScope: .personalization,
            modality: modality,
            payload: payload
        )
    }

    /// Ingest a health event (heart rate, sleep, etc.)
    func ingestHealthEvent(
        eventType: String,
        metrics: [String: Double],
        privacyScope: DataPrivacyScope = .biometric
    ) async {
        let payload = metrics.mapValues { AnyCodable($0) }
        let modality = Modality(metrics: payload)

        await ingestEvent(
            eventType: eventType,
            sourceApp: .health,
            privacyScope: privacyScope,
            modality: modality,
            payload: payload
        )
    }

    /// Ingest a location event
    func ingestLocationEvent(
        latitude: Double,
        longitude: Double,
        accuracy: Double,
        altitude: Double? = nil
    ) async {
        var payload: [String: AnyCodable] = [
            "latitude": AnyCodable(latitude),
            "longitude": AnyCodable(longitude),
            "accuracy": AnyCodable(accuracy)
        ]

        if let altitude = altitude {
            payload["altitude"] = AnyCodable(altitude)
        }

        let modality = Modality(metrics: payload)

        await ingestEvent(
            eventType: "location_update",
            sourceApp: .location,
            privacyScope: .location,
            modality: modality,
            payload: payload
        )
    }

    /// Ingest a media event (screenshot, photo, etc.)
    func ingestMediaEvent(
        eventType: String,
        mediaRef: String,
        mediaType: String,
        ocrText: String? = nil
    ) async {
        var payload: [String: AnyCodable] = [
            "mediaRef": AnyCodable(mediaRef),
            "mediaType": AnyCodable(mediaType)
        ]

        if let ocrText = ocrText {
            payload["ocrText"] = AnyCodable(ocrText)
        }

        var modality = Modality(text: ocrText)

        switch mediaType {
        case "image", "screenshot":
            modality = Modality(text: ocrText, imageRef: mediaRef)
        case "audio":
            modality = Modality(text: ocrText, audioRef: mediaRef)
        case "video":
            modality = Modality(text: ocrText, videoRef: mediaRef)
        default:
            break
        }

        await ingestEvent(
            eventType: eventType,
            sourceApp: .media,
            privacyScope: .media,
            modality: modality,
            payload: payload
        )
    }

    // MARK: - Queue Management

    private func queueEvent(_ event: EventPayload) async {
        eventQueue.append(event)

        // Update observable state
        await updateState()

        // Persist to local storage
        await persistQueue()

        // Process batch if threshold reached
        if eventQueue.count >= batchSize && !isProcessing {
            await processBatch()
        }

        // Trim queue if too large
        if eventQueue.count > maxQueueSize {
            eventQueue.removeFirst(eventQueue.count - maxQueueSize)
            await persistQueue()
        }
    }

    // MARK: - Batch Processing

    /// Process and upload a batch of events
    func processBatch() async {
        guard !eventQueue.isEmpty, !isProcessing else { return }

        isProcessing = true
        await updateState()

        let batch = Array(eventQueue.prefix(batchSize))

        do {
            let result = try await uploadBatch(events: batch)

            if result.success {
                // Remove successfully processed events
                eventQueue.removeFirst(min(batchSize, eventQueue.count))
                await persistQueue()

                await MainActor.run {
                    state.recordUpload()
                    state.incrementIngested(by: result.totalIngested)
                    state.recordError(nil)
                }
            } else if let error = result.error {
                let ingestionError = IngestionError.serverError(400, error.message)
                await MainActor.run {
                    state.recordError(ingestionError)
                }
            }
        } catch let error as IngestionError {
            await MainActor.run {
                state.recordError(error)
            }

            // If offline, events remain in queue for retry
            if case .offline = error {
                await MainActor.run {
                    state.isOnline = false
                }
            }
        } catch {
            let ingestionError = IngestionError.networkError(error)
            await MainActor.run {
                state.recordError(ingestionError)
            }
        }

        isProcessing = false
        await updateState()
    }

    // MARK: - Network Upload

    private func uploadBatch(events: [EventPayload]) async throws -> BatchUploadResult {
        guard let token = clerkJWTToken else {
            throw IngestionError.noAuthToken
        }

        guard let userId = currentUserId else {
            throw IngestionError.noAuthToken
        }

        guard let url = URL(string: "\(baseURL)/neural/ingest-batch") else {
            throw IngestionError.invalidURL
        }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.setValue(userId, forHTTPHeaderField: "X-User-ID")

        if let sessionId = currentSessionId {
            request.setValue(sessionId, forHTTPHeaderField: "X-Session-ID")
        }

        // Convert events to API format
        let apiEvents = events.map { $0.toAPIFormat() }
        let requestBody: [String: Any] = ["events": apiEvents]

        do {
            request.httpBody = try JSONSerialization.data(withJSONObject: requestBody)
        } catch {
            throw IngestionError.encodingError(error)
        }

        let (data, response) = try await URLSession.shared.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse else {
            throw IngestionError.networkError(NSError(domain: "DataIngestor", code: -1, userInfo: [NSLocalizedDescriptionKey: "Invalid response"]))
        }

        if httpResponse.statusCode == 401 {
            throw IngestionError.noAuthToken
        }

        if httpResponse.statusCode == 403 {
            // Parse consent error
            if let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
               let errorInfo = json["error"] as? [String: Any],
               let code = errorInfo["code"] as? String,
               code == "CONSENT_REQUIRED" {
                let message = errorInfo["message"] as? String ?? ""
                let scopes = message.components(separatedBy: ": ").last?.components(separatedBy: ", ") ?? []
                throw IngestionError.consentRequired(scopes: scopes)
            }
        }

        guard (200...299).contains(httpResponse.statusCode) else {
            let errorMessage = String(data: data, encoding: .utf8) ?? "Unknown error"
            throw IngestionError.serverError(httpResponse.statusCode, errorMessage)
        }

        // Parse response
        do {
            let decoder = JSONDecoder()
            let responseWrapper = try decoder.decode(APIResponseWrapper.self, from: data)
            return responseWrapper.data ?? BatchUploadResult(
                success: true,
                totalReceived: events.count,
                totalIngested: events.count,
                totalSkipped: 0,
                totalFailed: 0,
                results: nil,
                error: nil
            )
        } catch {
            throw IngestionError.decodingError(error)
        }
    }

    // MARK: - Persistence

    private func persistQueue() async {
        do {
            let encoder = JSONEncoder()
            let data = try encoder.encode(eventQueue)

            // Save to file in Documents directory for larger storage
            if let documentsURL = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first {
                let fileURL = documentsURL.appendingPathComponent("neural_event_queue.json")
                try data.write(to: fileURL, options: [.atomic, .completeFileProtection])
            }
        } catch {
            print("Failed to persist event queue: \(error)")
        }
    }

    private func loadPersistedQueue() async {
        do {
            if let documentsURL = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first {
                let fileURL = documentsURL.appendingPathComponent("neural_event_queue.json")

                if FileManager.default.fileExists(atPath: fileURL.path) {
                    let data = try Data(contentsOf: fileURL)
                    let decoder = JSONDecoder()
                    eventQueue = try decoder.decode([EventPayload].self, from: data)
                    await updateState()
                }
            }
        } catch {
            print("Failed to load persisted event queue: \(error)")
            eventQueue = []
        }
    }

    private func clearPersistedQueue() async {
        if let documentsURL = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first {
            let fileURL = documentsURL.appendingPathComponent("neural_event_queue.json")
            try? FileManager.default.removeItem(at: fileURL)
        }
    }

    // MARK: - State Updates

    private func updateState() async {
        let queueCount = eventQueue.count
        let processing = isProcessing
        await MainActor.run {
            state.update(queueCount: queueCount, isProcessing: processing)
        }
    }

    // MARK: - Public Methods

    /// Flush all queued events
    func flush() async {
        while !eventQueue.isEmpty {
            await processBatch()

            // Break if processing fails to prevent infinite loop
            if !eventQueue.isEmpty && !isProcessing {
                try? await Task.sleep(nanoseconds: 1_000_000_000) // 1 second delay before retry
            }
        }
    }

    /// Clear all queued events
    func clear() async {
        eventQueue.removeAll()
        await clearPersistedQueue()
        await updateState()
    }

    /// Get current queue count
    func getQueueCount() -> Int {
        eventQueue.count
    }

    /// Check if processing
    func getIsProcessing() -> Bool {
        isProcessing
    }

    /// Retry failed uploads (called when network becomes available)
    func retryPendingUploads() async {
        await MainActor.run {
            state.isOnline = true
        }

        if !eventQueue.isEmpty && !isProcessing {
            await processBatch()
        }
    }

    // MARK: - Session Management

    /// Start a new neural session
    func startSession() async throws -> String {
        guard let token = clerkJWTToken, let userId = currentUserId else {
            throw IngestionError.noAuthToken
        }

        guard let url = URL(string: "\(baseURL)/neural/session/start") else {
            throw IngestionError.invalidURL
        }

        let sessionId = UUID().uuidString
        let context = IngestorEventContext()

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.setValue(userId, forHTTPHeaderField: "X-User-ID")

        let requestBody: [String: Any] = [
            "sessionId": sessionId,
            "deviceInfo": [
                "deviceId": context.deviceInfo.deviceId,
                "platform": context.deviceInfo.platform,
                "osVersion": context.deviceInfo.osVersion,
                "appVersion": context.deviceInfo.appVersion
            ],
            "locationContext": [
                "timezone": context.timezone
            ]
        ]

        request.httpBody = try JSONSerialization.data(withJSONObject: requestBody)

        let (data, response) = try await URLSession.shared.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse,
              (200...299).contains(httpResponse.statusCode) else {
            let errorMessage = String(data: data, encoding: .utf8) ?? "Unknown error"
            throw IngestionError.serverError((response as? HTTPURLResponse)?.statusCode ?? 500, errorMessage)
        }

        self.currentSessionId = sessionId
        return sessionId
    }

    /// End the current session
    func endSession(reason: String = "app_close") async throws {
        guard let token = clerkJWTToken, let sessionId = currentSessionId else {
            return
        }

        guard let url = URL(string: "\(baseURL)/neural/session/end") else {
            throw IngestionError.invalidURL
        }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.setValue(sessionId, forHTTPHeaderField: "X-Session-ID")

        let requestBody: [String: Any] = ["reason": reason]
        request.httpBody = try JSONSerialization.data(withJSONObject: requestBody)

        _ = try await URLSession.shared.data(for: request)

        self.currentSessionId = nil
    }
}

// MARK: - API Response Wrapper

private struct APIResponseWrapper: Codable {
    let success: Bool
    let data: BatchUploadResult?
    let error: BatchUploadResult.APIError?
}

// MARK: - Network Reachability Observer

/// Observe network changes to retry pending uploads
@MainActor
final class NetworkReachabilityObserver: ObservableObject {
    @Published var isReachable = true

    private var timer: Timer?

    init() {
        startMonitoring()
    }

    deinit {
        timer?.invalidate()
    }

    private func startMonitoring() {
        // Simple polling-based reachability check
        // In production, use NWPathMonitor for more efficient monitoring
        timer = Timer.scheduledTimer(withTimeInterval: 5.0, repeats: true) { [weak self] _ in
            Task {
                await self?.checkReachability()
            }
        }
    }

    private func checkReachability() async {
        let wasReachable = isReachable

        // Simple connectivity check
        guard let url = URL(string: "https://www.apple.com/library/test/success.html") else { return }

        do {
            let (_, response) = try await URLSession.shared.data(from: url)
            isReachable = (response as? HTTPURLResponse)?.statusCode == 200
        } catch {
            isReachable = false
        }

        // Retry pending uploads when network becomes available
        if !wasReachable && isReachable {
            await DataIngestor.shared.retryPendingUploads()
        }
    }
}
