/**
 * ConvexManager.swift
 * Convex backend client for real-time data sync
 * Integrates with ConvexHTTPClient for HTTP actions
 *
 * Uses the official Convex Swift SDK:
 * https://github.com/get-convex/convex-swift
 */

import Foundation
import Combine

// MARK: - Convex Manager
@MainActor
final class ConvexManager: ObservableObject {
    // MARK: - Singleton
    static let shared = ConvexManager()

    // MARK: - Properties
    private var client: ConvexClient?
    private let httpClient: ConvexHTTPClient
    private var cancellables = Set<AnyCancellable>()
    private let logger = Logger(subsystem: "ConvexManager")

    @Published private(set) var isConnected: Bool = false
    @Published private(set) var syncState: SyncState = .disconnected

    enum SyncState: Equatable {
        case disconnected
        case connecting
        case connected
        case syncing
        case error(String)

        static func == (lhs: SyncState, rhs: SyncState) -> Bool {
            switch (lhs, rhs) {
            case (.disconnected, .disconnected),
                 (.connecting, .connecting),
                 (.connected, .connected),
                 (.syncing, .syncing):
                return true
            case (.error(let a), .error(let b)):
                return a == b
            default:
                return false
            }
        }
    }

    // MARK: - Initialization
    private init() {
        self.httpClient = ConvexHTTPClient.shared
    }

    func initialize() async {
        syncState = .connecting
        logger.debug("Initializing Convex connection")

        do {
            client = try ConvexClient(deploymentURL: Configuration.convexDeploymentURL)
            isConnected = true
            syncState = .connected
            logger.debug("Convex connected successfully")
        } catch {
            syncState = .error(error.localizedDescription)
            logger.error("Convex initialization failed: \(error)")
        }
    }

    // MARK: - Authentication
    func setAuthToken(_ token: String) async {
        await client?.setAuth(token: token)
        logger.debug("Auth token set")
    }

    func clearAuth() async {
        await client?.clearAuth()
        logger.debug("Auth cleared")
    }

    // MARK: - Push Notifications
    func registerPushToken(_ token: String) async {
        guard isConnected else { return }

        do {
            try await client?.mutation("users:registerPushToken", args: [
                "token": token,
                "platform": "ios",
                "timestamp": Date().timeIntervalSince1970 * 1000
            ])
            logger.debug("Push token registered")
        } catch {
            logger.error("Failed to register push token: \(error)")
        }
    }

    // MARK: - Browsing Events
    func logBrowsingEvent(type: BrowsingEventType, url: String, metadata: [String: Any] = [:]) async {
        guard isConnected else { return }

        let args: [String: Any] = [
            "type": type.rawValue,
            "url": url,
            "timestamp": Date().timeIntervalSince1970 * 1000,
            "metadata": metadata
        ]

        do {
            try await client?.mutation(APIEndpoints.logEvent, args: args)
            logger.debug("Logged browsing event: \(type.rawValue)")
        } catch {
            logger.error("Failed to log browsing event: \(error)")
        }
    }

    enum BrowsingEventType: String {
        case navigation
        case scroll
        case click
        case pageLoad
        case tabCreate
        case tabClose
    }

    // MARK: - Batch Insert Events (via HTTP Client)
    func insertBatch(_ events: [any EventPayloadProtocol]) async throws -> Int {
        let response = try await httpClient.insertBatch(events)
        logger.debug("Inserted \(response.inserted) events")
        return response.inserted
    }

    // MARK: - Search (via HTTP Client)
    func searchMulti(query: String, options: SearchOptions? = nil) async throws -> [SearchResult] {
        let results = try await httpClient.searchMulti(query: query, options: options)
        logger.debug("Search returned \(results.count) results")
        return results
    }

    // MARK: - Page Content Processing
    func processPageContent(content: String, title: String, url: String) async {
        guard isConnected else { return }

        let args: [String: Any] = [
            "content": String(content.prefix(10000)),
            "title": title,
            "url": url,
            "timestamp": Date().timeIntervalSince1970 * 1000
        ]

        do {
            try await client?.mutation(APIEndpoints.processPage, args: args)
            logger.debug("Processed page content for: \(title)")
        } catch {
            logger.error("Failed to process page content: \(error)")
        }
    }

    // MARK: - Consent
    func getConsentState() async -> ConsentState? {
        guard isConnected else { return nil }

        do {
            let result = try await client?.query(APIEndpoints.getConsentState, args: [:])
            return try decodeResult(result, as: ConsentState.self)
        } catch {
            logger.error("Failed to get consent state: \(error)")
            return nil
        }
    }

    func updateConsentState(_ state: ConsentState) async {
        guard isConnected else { return }

        do {
            let args = try encodeToDict(state)
            try await client?.mutation(APIEndpoints.updateConsent, args: args)
            logger.debug("Updated consent state")
        } catch {
            logger.error("Failed to update consent state: \(error)")
        }
    }

    // MARK: - Site Permissions
    func getSitePermissions() async -> [SitePermission] {
        guard isConnected else { return [] }

        do {
            let result = try await client?.query(APIEndpoints.getSitePermissions, args: [:])
            return try decodeResult(result, as: [SitePermission].self) ?? []
        } catch {
            logger.error("Failed to get site permissions: \(error)")
            return []
        }
    }

    func updateSitePermissions(_ permissions: [SitePermission]) async {
        guard isConnected else { return }

        do {
            let args = try permissions.map { try encodeToDict($0) }
            try await client?.mutation(APIEndpoints.updateSitePermissions, args: ["permissions": args])
            logger.debug("Updated \(permissions.count) site permissions")
        } catch {
            logger.error("Failed to update site permissions: \(error)")
        }
    }

    // MARK: - Privacy Stats
    func getPrivacyStats() async -> PrivacyStats {
        guard isConnected else {
            return PrivacyStats(totalDataPoints: 0, aiEventCount: 0)
        }

        do {
            let result = try await client?.query("consent:getStats", args: [:])
            return try decodeResult(result, as: PrivacyStats.self) ?? PrivacyStats(totalDataPoints: 0, aiEventCount: 0)
        } catch {
            logger.error("Failed to get privacy stats: \(error)")
            return PrivacyStats(totalDataPoints: 0, aiEventCount: 0)
        }
    }

    struct PrivacyStats: Codable {
        let totalDataPoints: Int
        let aiEventCount: Int
    }

    // MARK: - Timeline Events
    func getTimelineEvents(limit: Int = 100) async -> [AITimelineEvent] {
        guard isConnected else { return [] }

        do {
            let result = try await client?.query(APIEndpoints.getTimeline, args: ["limit": limit])
            return try decodeResult(result, as: [AITimelineEvent].self) ?? []
        } catch {
            logger.error("Failed to get timeline events: \(error)")
            return []
        }
    }

    func clearTimeline() async {
        guard isConnected else { return }

        do {
            try await client?.mutation(APIEndpoints.clearTimeline, args: [:])
            logger.debug("Timeline cleared")
        } catch {
            logger.error("Failed to clear timeline: \(error)")
        }
    }

    func exportTimeline() async -> URL? {
        guard isConnected else { return nil }

        do {
            let result = try await client?.action(APIEndpoints.exportTimeline, args: [:])
            guard let urlString = result as? String,
                  let url = URL(string: urlString) else { return nil }
            logger.debug("Timeline exported: \(urlString)")
            return url
        } catch {
            logger.error("Failed to export timeline: \(error)")
            return nil
        }
    }

    // MARK: - Knowledge Graph
    func getKnowledgeGraph() async -> KnowledgeGraph {
        guard isConnected else { return .empty }

        do {
            let result = try await client?.query(APIEndpoints.getKnowledgeGraph, args: [:])
            return try decodeResult(result, as: KnowledgeGraph.self) ?? .empty
        } catch {
            logger.error("Failed to get knowledge graph: \(error)")
            return .empty
        }
    }

    func approveKnowledgeNode(_ id: UUID) async {
        guard isConnected else { return }

        do {
            try await client?.mutation(APIEndpoints.approveNode, args: ["nodeId": id.uuidString])
            logger.debug("Approved node: \(id)")
        } catch {
            logger.error("Failed to approve node: \(error)")
        }
    }

    func rejectKnowledgeNode(_ id: UUID) async {
        guard isConnected else { return }

        do {
            try await client?.mutation(APIEndpoints.rejectNode, args: ["nodeId": id.uuidString])
            logger.debug("Rejected node: \(id)")
        } catch {
            logger.error("Failed to reject node: \(error)")
        }
    }

    func editKnowledgeNode(_ id: UUID, content: String) async {
        guard isConnected else { return }

        do {
            try await client?.mutation(APIEndpoints.editNode, args: [
                "nodeId": id.uuidString,
                "content": content
            ])
            logger.debug("Edited node: \(id)")
        } catch {
            logger.error("Failed to edit node: \(error)")
        }
    }

    // MARK: - Bookmarks
    func addBookmark(url: String, title: String) async {
        guard isConnected else { return }

        do {
            try await client?.mutation("browsing:addBookmark", args: [
                "url": url,
                "title": title,
                "createdAt": Date().timeIntervalSince1970 * 1000
            ])
            logger.debug("Added bookmark: \(title)")
        } catch {
            logger.error("Failed to add bookmark: \(error)")
        }
    }

    // MARK: - Audit Logging
    func logAuditEvent(action: String, details: [String: Any] = [:]) async {
        guard isConnected else { return }

        do {
            try await client?.mutation(APIEndpoints.logAudit, args: [
                "action": action,
                "details": details,
                "timestamp": Date().timeIntervalSince1970 * 1000
            ])
        } catch {
            logger.error("Failed to log audit event: \(error)")
        }
    }

    // MARK: - Data Export & Deletion
    func exportUserData() async -> URL? {
        guard isConnected else { return nil }

        do {
            let result = try await client?.action(APIEndpoints.exportUserData, args: [:])
            guard let urlString = result as? String,
                  let url = URL(string: urlString) else { return nil }
            logger.debug("User data exported: \(urlString)")
            return url
        } catch {
            logger.error("Failed to export user data: \(error)")
            return nil
        }
    }

    func requestDataDeletion() async {
        guard isConnected else { return }

        do {
            try await client?.mutation(APIEndpoints.requestDeletion, args: [:])
            logger.debug("Data deletion requested")
        } catch {
            logger.error("Failed to request data deletion: \(error)")
        }
    }

    // MARK: - Real-time Subscriptions
    func subscribeToTimeline() -> AnyPublisher<[AITimelineEvent], Never> {
        guard let client = client else {
            return Just([]).eraseToAnyPublisher()
        }

        return client.subscribe(APIEndpoints.getTimeline, args: ["limit": 100])
            .compactMap { [weak self] result in
                try? self?.decodeResult(result, as: [AITimelineEvent].self)
            }
            .replaceError(with: [])
            .eraseToAnyPublisher()
    }

    // MARK: - AI Stream (via HTTP Client)
    func streamAIResponse(
        query: String,
        url: String,
        html: String
    ) -> AsyncThrowingStream<AIStreamEvent, Error> {
        httpClient.streamAIResponse(
            url: url,
            query: query,
            html: html
        )
    }

    // MARK: - Execute Custom Query/Mutation
    func executeQuery<T: Decodable>(
        _ functionPath: String,
        args: [String: Any]
    ) async throws -> T {
        try await httpClient.executeQuery(functionPath, args: args)
    }

    func executeMutation<T: Decodable>(
        _ functionPath: String,
        args: [String: Any]
    ) async throws -> T {
        try await httpClient.executeMutation(functionPath, args: args)
    }

    func executeAction<T: Decodable>(
        _ functionPath: String,
        args: [String: Any]
    ) async throws -> T {
        try await httpClient.executeAction(functionPath, args: args)
    }

    // MARK: - Helpers
    private func encodeToDict<T: Encodable>(_ value: T) throws -> [String: Any] {
        let data = try JSONEncoder().encode(value)
        guard let dict = try JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            throw NSError(domain: "ConvexManager", code: -1, userInfo: [NSLocalizedDescriptionKey: "Failed to encode"])
        }
        return dict
    }

    private func decodeResult<T: Decodable>(_ result: Any?, as type: T.Type) throws -> T? {
        guard let result = result else { return nil }
        let data = try JSONSerialization.data(withJSONObject: result)
        return try JSONDecoder().decode(type, from: data)
    }
}

// MARK: - Convex Client (WebSocket-based)
// Note: In production, use the actual convex-swift package
// This is a simplified interface matching the SDK
class ConvexClient {
    private let deploymentURL: String
    private var authToken: String?
    private let session: URLSession
    private let logger = Logger(subsystem: "ConvexClient")

    init(deploymentURL: String) throws {
        self.deploymentURL = deploymentURL
        self.session = URLSession.shared
    }

    func setAuth(token: String) async {
        self.authToken = token
    }

    func clearAuth() async {
        self.authToken = nil
    }

    func query(_ functionPath: String, args: [String: Any]) async throws -> Any? {
        return try await callFunction(type: "query", path: functionPath, args: args)
    }

    func mutation(_ functionPath: String, args: [String: Any]) async throws -> Any? {
        return try await callFunction(type: "mutation", path: functionPath, args: args)
    }

    func action(_ functionPath: String, args: [String: Any]) async throws -> Any? {
        return try await callFunction(type: "action", path: functionPath, args: args)
    }

    func subscribe(_ functionPath: String, args: [String: Any]) -> AnyPublisher<Any?, Error> {
        // Real implementation would use WebSockets for real-time updates
        // This is a placeholder that polls periodically
        Timer.publish(every: 5.0, on: .main, in: .common)
            .autoconnect()
            .flatMap { [weak self] _ -> AnyPublisher<Any?, Error> in
                guard let self = self else {
                    return Just(nil as Any?)
                        .setFailureType(to: Error.self)
                        .eraseToAnyPublisher()
                }
                return Future { promise in
                    Task {
                        do {
                            let result = try await self.query(functionPath, args: args)
                            promise(.success(result))
                        } catch {
                            promise(.failure(error))
                        }
                    }
                }.eraseToAnyPublisher()
            }
            .eraseToAnyPublisher()
    }

    private func callFunction(type: String, path: String, args: [String: Any]) async throws -> Any? {
        guard let url = URL(string: "\(deploymentURL)/api/\(type)/\(path)") else {
            throw ConvexClientError.invalidURL
        }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        if let token = authToken {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }

        request.httpBody = try JSONSerialization.data(withJSONObject: ["args": args])

        logger.debug("\(type.uppercased()) \(path)")

        let (data, response) = try await session.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse else {
            throw ConvexClientError.invalidResponse
        }

        logger.debug("Response: \(httpResponse.statusCode)")

        guard 200..<300 ~= httpResponse.statusCode else {
            if httpResponse.statusCode == 401 {
                throw ConvexClientError.unauthorized
            }
            throw ConvexClientError.httpError(httpResponse.statusCode)
        }

        return try JSONSerialization.jsonObject(with: data)
    }
}

// MARK: - Convex Client Error
enum ConvexClientError: LocalizedError {
    case invalidURL
    case invalidResponse
    case unauthorized
    case httpError(Int)

    var errorDescription: String? {
        switch self {
        case .invalidURL: return "Invalid URL"
        case .invalidResponse: return "Invalid response"
        case .unauthorized: return "Unauthorized"
        case .httpError(let code): return "HTTP error \(code)"
        }
    }
}
