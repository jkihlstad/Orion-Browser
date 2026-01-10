/**
 * BrainClient.swift
 * SSE streaming client for AI brain backend
 * Handles Perplexity-style streaming responses
 * Integrates with ConvexHTTPClient and StreamingSSEClient
 */

import Foundation

actor BrainClient {
    // MARK: - Singleton
    static let shared = BrainClient()

    // MARK: - Properties
    private let convexClient: ConvexHTTPClient
    private let logger = Logger(subsystem: "BrainClient")

    // Active streaming clients (for cancellation)
    private var activeStreams: [UUID: StreamingSSEClient] = [:]

    // MARK: - Initialization
    private init() {
        self.convexClient = ConvexHTTPClient.shared
    }

    // MARK: - Stream Answer
    func streamAnswer(
        query: String,
        context: QueryContext? = nil
    ) -> AsyncThrowingStream<StreamChunk, Error> {
        AsyncThrowingStream { continuation in
            Task {
                do {
                    let streamId = UUID()
                    var citations: [Citation] = []
                    var followUps: [FollowUp] = []

                    // Create streaming client
                    let sseClient = StreamingSSEClient(
                        maxReconnectAttempts: 3,
                        baseReconnectDelay: 1.0,
                        heartbeatTimeout: 30.0
                    )

                    await registerStream(id: streamId, client: sseClient)

                    // Build request
                    let url = APIEndpoints.convexActionURL(APIEndpoints.aiStream)
                    let headers = await convexClient.authHeaders()

                    let body: [String: Any] = [
                        "query": query,
                        "context": await buildContextDict(context),
                        "options": [
                            "includeSources": true,
                            "includeFollowUps": true,
                            "maxTokens": 2000
                        ]
                    ]

                    logger.debug("Starting brain stream for query: \(query)")

                    // Start streaming
                    sseClient.start(
                        url: url,
                        headers: headers,
                        bodyJSON: body
                    ) { [weak self] event in
                        guard let self = self else { return }

                        Task {
                            switch event {
                            case .connected:
                                self.logger.debug("Brain stream connected")

                            case .delta(let text):
                                continuation.yield(.text(text))

                            case .sources(let sources):
                                // Convert AISource to Citation
                                for source in sources {
                                    let citation = Citation(
                                        url: source.url,
                                        title: source.title,
                                        snippet: source.snippet ?? "",
                                        domain: URL(string: source.url)?.host ?? source.url,
                                        relevanceScore: source.relevance ?? 0.7
                                    )
                                    citations.append(citation)
                                    continuation.yield(.citation(citation))
                                }

                            case .done:
                                self.logger.debug("Brain stream completed")
                                // Create final answer
                                let answer = AIAnswer(
                                    id: UUID(),
                                    content: "", // Will be populated by ViewModel from accumulated text
                                    citations: citations,
                                    followUps: followUps,
                                    createdAt: Date(),
                                    query: query
                                )
                                continuation.yield(.done(answer))
                                await self.unregisterStream(id: streamId)
                                continuation.finish()

                            case .error(let message):
                                self.logger.error("Brain stream error: \(message)")
                                continuation.yield(.error(message))
                                await self.unregisterStream(id: streamId)
                                continuation.finish(throwing: BrainClientError.streamingFailed(message))

                            case .reconnecting(let attempt):
                                self.logger.warning("Brain stream reconnecting (attempt \(attempt))")
                            }
                        }
                    }

                    // Handle cancellation
                    continuation.onTermination = { [weak self] _ in
                        Task {
                            await self?.cancelStream(id: streamId)
                        }
                    }

                } catch {
                    logger.error("Brain stream setup failed: \(error.localizedDescription)")
                    continuation.finish(throwing: error)
                }
            }
        }
    }

    // MARK: - Stream with Page Context
    func streamWithPageContext(
        query: String,
        pageURL: String,
        pageHTML: String
    ) -> AsyncThrowingStream<StreamChunk, Error> {
        let context = QueryContext(
            pageContent: String(pageHTML.prefix(15000)),
            pageURL: pageURL,
            recentHistory: nil
        )

        return streamAnswer(query: query, context: context)
    }

    // MARK: - Stream via Convex HTTP Client
    func streamViaConvex(
        query: String,
        url: String,
        html: String
    ) -> AsyncThrowingStream<StreamChunk, Error> {
        AsyncThrowingStream { continuation in
            Task {
                do {
                    var citations: [Citation] = []

                    for try await event in convexClient.streamAIResponse(
                        url: url,
                        query: query,
                        html: html
                    ) {
                        switch event {
                        case .delta(let text):
                            continuation.yield(.text(text))

                        case .sources(let sources):
                            for source in sources {
                                let citation = Citation(
                                    url: source.url,
                                    title: source.title,
                                    snippet: source.snippet ?? "",
                                    domain: URL(string: source.url)?.host ?? source.url,
                                    relevanceScore: source.relevance ?? 0.7
                                )
                                citations.append(citation)
                                continuation.yield(.citation(citation))
                            }

                        case .done:
                            let answer = AIAnswer(
                                id: UUID(),
                                content: "",
                                citations: citations,
                                followUps: [],
                                createdAt: Date(),
                                query: query
                            )
                            continuation.yield(.done(answer))
                            continuation.finish()

                        case .error(let message):
                            continuation.yield(.error(message))
                            continuation.finish(throwing: BrainClientError.streamingFailed(message))
                        }
                    }
                } catch {
                    logger.error("Convex stream error: \(error.localizedDescription)")
                    continuation.finish(throwing: error)
                }
            }
        }
    }

    // MARK: - Non-Streaming Query
    func query(query: String, context: QueryContext? = nil) async throws -> AIAnswer {
        let args: [String: Any] = [
            "query": query,
            "context": await buildContextDict(context)
        ]

        let response: AIQueryResponse = try await convexClient.executeAction(
            "browser/ai/query",
            args: args
        )

        return AIAnswer(
            id: UUID(),
            content: response.content,
            citations: response.citations.map { source in
                Citation(
                    url: source.url,
                    title: source.title,
                    snippet: source.snippet ?? "",
                    domain: URL(string: source.url)?.host ?? source.url,
                    relevanceScore: source.relevance ?? 0.7
                )
            },
            followUps: response.followUps?.map { text in
                FollowUp(text: text, type: .related)
            } ?? [],
            createdAt: Date(),
            query: query
        )
    }

    // MARK: - Summarize Page
    func summarizePage(url: String, content: String) async throws -> String {
        let args: [String: Any] = [
            "url": url,
            "content": String(content.prefix(15000))
        ]

        let response: SummarizeResponse = try await convexClient.executeAction(
            "browser/ai/summarize",
            args: args
        )

        return response.summary
    }

    // MARK: - Stream Management
    private func registerStream(id: UUID, client: StreamingSSEClient) {
        activeStreams[id] = client
    }

    private func unregisterStream(id: UUID) {
        activeStreams.removeValue(forKey: id)
    }

    func cancelStream(id: UUID) {
        if let client = activeStreams[id] {
            client.cancel()
            activeStreams.removeValue(forKey: id)
        }
    }

    func cancelAllStreams() {
        for (_, client) in activeStreams {
            client.cancel()
        }
        activeStreams.removeAll()
    }

    // MARK: - Helpers
    private func buildContextDict(_ context: QueryContext?) async -> [String: Any] {
        guard let context = context else { return [:] }

        var dict: [String: Any] = [:]

        if let pageContent = context.pageContent {
            dict["pageContent"] = pageContent
        }
        if let pageURL = context.pageURL {
            dict["pageURL"] = pageURL
        }
        if let history = context.recentHistory {
            dict["recentHistory"] = history
        }

        return dict
    }
}

// MARK: - Supporting Types
struct StreamRequest: Encodable {
    let query: String
    let context: QueryContext?
    let options: StreamOptions
}

struct StreamOptions: Encodable {
    let includeSources: Bool
    let includeFollowUps: Bool
    let maxTokens: Int
}

struct QueryContext: Encodable {
    let pageContent: String?
    let pageURL: String?
    let recentHistory: [String]?
}

struct AIQueryResponse: Decodable {
    let content: String
    let citations: [AISource]
    let followUps: [String]?
}

struct SummarizeResponse: Decodable {
    let summary: String
}

// MARK: - Errors
enum BrainClientError: LocalizedError {
    case invalidURL
    case invalidResponse
    case streamingFailed(String)
    case networkError(Error)
    case unauthorized
    case rateLimited

    var errorDescription: String? {
        switch self {
        case .invalidURL:
            return "Invalid API URL"
        case .invalidResponse:
            return "Invalid response from server"
        case .streamingFailed(let message):
            return "Streaming failed: \(message)"
        case .networkError(let error):
            return "Network error: \(error.localizedDescription)"
        case .unauthorized:
            return "Unauthorized - please sign in again"
        case .rateLimited:
            return "Rate limited - please try again later"
        }
    }
}

// MARK: - Stream Chunk
enum StreamChunk {
    case text(String)
    case citation(Citation)
    case followUp(FollowUp)
    case done(AIAnswer)
    case error(String)
}
