/**
 * ConvexHTTPClient.swift
 * Convex-specific HTTP client with proper authentication
 * Handles mutations, queries, and SSE streaming for AI responses
 */

import Foundation

// MARK: - Convex HTTP Client
actor ConvexHTTPClient {
    // MARK: - Singleton
    static let shared = ConvexHTTPClient()

    // MARK: - Properties
    let baseURL: URL
    private let session: URLSession
    private let decoder: JSONDecoder
    private let encoder: JSONEncoder
    private let logger = Logger(subsystem: "ConvexHTTPClient")

    // Retry configuration
    private let maxRetries: Int = 3
    private let baseRetryDelay: TimeInterval = 1.0

    // MARK: - Initialization
    private init() {
        self.baseURL = APIEndpoints.convexHTTPBaseURL

        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 30
        config.timeoutIntervalForResource = 120
        config.waitsForConnectivity = true
        self.session = URLSession(configuration: config)

        self.decoder = JSONDecoder()
        self.decoder.dateDecodingStrategy = .millisecondsSince1970

        self.encoder = JSONEncoder()
        self.encoder.dateEncodingStrategy = .millisecondsSince1970
    }

    // MARK: - Auth Headers
    func authHeaders() async -> [String: String] {
        var headers: [String: String] = [
            "Content-Type": "application/json",
            "Accept": "application/json"
        ]

        if let token = await ClerkAuthManager.shared.sessionToken {
            headers["Authorization"] = "Bearer \(token)"
        }

        return headers
    }

    // MARK: - URL Builder
    func makeURL(path: String) -> URL {
        baseURL.appendingPathComponent(path)
    }

    // MARK: - Batch Insert Events
    func insertBatch(_ events: [any EventPayloadProtocol]) async throws -> InsertBatchResponse {
        let endpoint = makeURL(path: APIEndpoints.insertBatch)

        // Convert events to dictionaries
        let eventDicts = try events.map { event -> [String: Any] in
            let data = try encoder.encode(AnyEncodable(event))
            guard let dict = try JSONSerialization.jsonObject(with: data) as? [String: Any] else {
                throw ConvexHTTPError.encodingFailed
            }
            return dict
        }

        let body: [String: Any] = [
            "events": eventDicts,
            "timestamp": Date().timeIntervalSince1970 * 1000
        ]

        return try await executeWithRetry(
            url: endpoint,
            method: "POST",
            body: body
        )
    }

    // MARK: - Multi-Search
    func searchMulti(query: String, options: SearchOptions? = nil) async throws -> [SearchResult] {
        let endpoint = makeURL(path: APIEndpoints.searchMulti)

        var body: [String: Any] = [
            "query": query
        ]

        if let options = options {
            body["limit"] = options.limit
            body["namespaces"] = options.namespaces
            body["minScore"] = options.minScore
        }

        let response: SearchMultiResponse = try await executeWithRetry(
            url: endpoint,
            method: "POST",
            body: body
        )

        return response.results
    }

    // MARK: - Stream AI Response
    nonisolated func streamAIResponse(
        url: String,
        query: String,
        html: String,
        context: QueryContext? = nil
    ) -> AsyncThrowingStream<AIStreamEvent, Error> {
        AsyncThrowingStream { continuation in
            Task {
                do {
                    let endpoint = await self.makeURL(path: APIEndpoints.aiStream)
                    let headers = await self.authHeaders()

                    let body = AIStreamRequest(
                        query: query,
                        pageURL: url,
                        pageContent: String(html.prefix(15000)), // Limit content size
                        context: context
                    )

                    var request = URLRequest(url: endpoint)
                    request.httpMethod = "POST"
                    request.setValue("text/event-stream", forHTTPHeaderField: "Accept")

                    for (key, value) in headers {
                        request.setValue(value, forHTTPHeaderField: key)
                    }

                    request.httpBody = try await self.encoder.encode(body)

                    await self.logger.debug("Starting AI stream for query: \(query)")

                    let (bytes, response) = try await self.session.bytes(for: request)

                    guard let httpResponse = response as? HTTPURLResponse else {
                        continuation.finish(throwing: ConvexHTTPError.invalidResponse)
                        return
                    }

                    guard 200..<300 ~= httpResponse.statusCode else {
                        await self.logger.error("AI stream failed with status: \(httpResponse.statusCode)")
                        continuation.finish(throwing: ConvexHTTPError.httpError(httpResponse.statusCode))
                        return
                    }

                    var buffer = ""
                    var sources: [AISource] = []

                    for try await byte in bytes {
                        let char = Character(UnicodeScalar(byte))
                        buffer.append(char)

                        // Process complete SSE messages (ended by double newline)
                        while let range = buffer.range(of: "\n\n") {
                            let message = String(buffer[..<range.lowerBound])
                            buffer = String(buffer[range.upperBound...])

                            if let event = await self.parseSSEMessage(message, sources: &sources) {
                                continuation.yield(event)

                                if case .done = event {
                                    continuation.finish()
                                    return
                                }
                            }
                        }
                    }

                    // Send final done event if not already sent
                    continuation.yield(.done)
                    continuation.finish()

                } catch {
                    await self.logger.error("AI stream error: \(error.localizedDescription)")
                    continuation.finish(throwing: error)
                }
            }
        }
    }

    // MARK: - Execute Mutation
    func executeMutation<T: Decodable>(
        _ functionPath: String,
        args: [String: Any]
    ) async throws -> T {
        let endpoint = makeURL(path: "/api/mutation/\(functionPath)")
        return try await executeWithRetry(url: endpoint, method: "POST", body: args)
    }

    // MARK: - Execute Query
    func executeQuery<T: Decodable>(
        _ functionPath: String,
        args: [String: Any]
    ) async throws -> T {
        let endpoint = makeURL(path: "/api/query/\(functionPath)")
        return try await executeWithRetry(url: endpoint, method: "POST", body: args)
    }

    // MARK: - Execute Action
    func executeAction<T: Decodable>(
        _ functionPath: String,
        args: [String: Any]
    ) async throws -> T {
        let endpoint = makeURL(path: "/api/action/\(functionPath)")
        return try await executeWithRetry(url: endpoint, method: "POST", body: args)
    }

    // MARK: - Private: Execute with Retry
    private func executeWithRetry<T: Decodable>(
        url: URL,
        method: String,
        body: [String: Any],
        attempt: Int = 1
    ) async throws -> T {
        do {
            return try await execute(url: url, method: method, body: body)
        } catch let error as ConvexHTTPError {
            // Determine if error is retryable
            guard attempt < maxRetries, error.isRetryable else {
                throw error
            }

            // Exponential backoff with jitter
            let delay = baseRetryDelay * pow(2.0, Double(attempt - 1))
            let jitter = Double.random(in: 0...0.3) * delay
            let totalDelay = delay + jitter

            logger.warning("Retrying request (attempt \(attempt + 1)/\(maxRetries)) after \(totalDelay)s")

            try await Task.sleep(nanoseconds: UInt64(totalDelay * 1_000_000_000))

            return try await executeWithRetry(
                url: url,
                method: method,
                body: body,
                attempt: attempt + 1
            )
        }
    }

    // MARK: - Private: Execute Request
    private func execute<T: Decodable>(
        url: URL,
        method: String,
        body: [String: Any]
    ) async throws -> T {
        var request = URLRequest(url: url)
        request.httpMethod = method

        let headers = await authHeaders()
        for (key, value) in headers {
            request.setValue(value, forHTTPHeaderField: key)
        }

        request.httpBody = try JSONSerialization.data(withJSONObject: body)

        logger.debug("\(method) \(url.path)")

        let (data, response) = try await session.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse else {
            throw ConvexHTTPError.invalidResponse
        }

        logger.debug("Response: \(httpResponse.statusCode)")

        switch httpResponse.statusCode {
        case 200..<300:
            return try decoder.decode(T.self, from: data)

        case 401:
            throw ConvexHTTPError.unauthorized

        case 429:
            throw ConvexHTTPError.rateLimited

        case 500..<600:
            throw ConvexHTTPError.serverError(httpResponse.statusCode)

        default:
            throw ConvexHTTPError.httpError(httpResponse.statusCode)
        }
    }

    // MARK: - Private: Parse SSE Message
    private func parseSSEMessage(_ message: String, sources: inout [AISource]) -> AIStreamEvent? {
        let lines = message.split(separator: "\n")

        var eventType = "message"
        var data = ""

        for line in lines {
            if line.hasPrefix("event:") {
                eventType = String(line.dropFirst(6)).trimmingCharacters(in: .whitespaces)
            } else if line.hasPrefix("data:") {
                data = String(line.dropFirst(5)).trimmingCharacters(in: .whitespaces)
            }
        }

        guard !data.isEmpty else { return nil }

        switch eventType {
        case "delta", "text", "message":
            return .delta(data)

        case "sources", "citation":
            if let sourceData = data.data(using: .utf8),
               let newSources = try? decoder.decode([AISource].self, from: sourceData) {
                sources.append(contentsOf: newSources)
                return .sources(newSources)
            }
            // Try single source
            if let sourceData = data.data(using: .utf8),
               let source = try? decoder.decode(AISource.self, from: sourceData) {
                sources.append(source)
                return .sources([source])
            }

        case "done", "end", "complete":
            return .done

        case "error":
            return .error(data)

        default:
            // Treat unknown events as delta text
            return .delta(data)
        }

        return nil
    }
}

// MARK: - Supporting Types
struct AIStreamRequest: Encodable {
    let query: String
    let pageURL: String
    let pageContent: String
    let context: QueryContext?
}

enum AIStreamEvent {
    case delta(String)
    case sources([AISource])
    case done
    case error(String)
}

struct AISource: Codable, Identifiable {
    var id: UUID { UUID() }
    let url: String
    let title: String
    let snippet: String?
    let relevance: Double?

    enum CodingKeys: String, CodingKey {
        case url, title, snippet, relevance
    }
}

struct SearchOptions {
    let limit: Int
    let namespaces: [String]
    let minScore: Double

    init(limit: Int = 20, namespaces: [String] = [], minScore: Double = 0.5) {
        self.limit = limit
        self.namespaces = namespaces
        self.minScore = minScore
    }
}

struct SearchResult: Codable, Identifiable {
    let id: String
    let content: String
    let score: Double
    let metadata: SearchMetadata?
}

struct SearchMetadata: Codable {
    let url: String?
    let title: String?
    let timestamp: Double?
}

struct SearchMultiResponse: Codable {
    let results: [SearchResult]
}

struct InsertBatchResponse: Codable {
    let success: Bool
    let inserted: Int
    let errors: [String]?
}

// MARK: - Any Encodable Wrapper
struct AnyEncodable: Encodable {
    private let encode: (Encoder) throws -> Void

    init<T: Encodable>(_ value: T) {
        self.encode = { encoder in
            try value.encode(to: encoder)
        }
    }

    func encode(to encoder: Encoder) throws {
        try encode(encoder)
    }
}

// MARK: - Convex HTTP Error
enum ConvexHTTPError: LocalizedError {
    case invalidURL
    case invalidResponse
    case encodingFailed
    case decodingFailed
    case unauthorized
    case forbidden
    case notFound
    case rateLimited
    case serverError(Int)
    case httpError(Int)
    case networkError(Error)

    var errorDescription: String? {
        switch self {
        case .invalidURL: return "Invalid URL"
        case .invalidResponse: return "Invalid response from server"
        case .encodingFailed: return "Failed to encode request"
        case .decodingFailed: return "Failed to decode response"
        case .unauthorized: return "Unauthorized - please sign in again"
        case .forbidden: return "Access forbidden"
        case .notFound: return "Resource not found"
        case .rateLimited: return "Rate limited - please try again later"
        case .serverError(let code): return "Server error (\(code))"
        case .httpError(let code): return "HTTP error (\(code))"
        case .networkError(let error): return "Network error: \(error.localizedDescription)"
        }
    }

    var isRetryable: Bool {
        switch self {
        case .rateLimited, .serverError:
            return true
        case .networkError:
            return true
        default:
            return false
        }
    }
}
