/**
 * AIResultsViewModel.swift
 * Business logic for AI results and SSE streaming
 * Handles stream events: delta, sources, done, error
 */

import SwiftUI
import Combine

@MainActor
final class AIResultsViewModel: ObservableObject {
    // MARK: - Published Properties
    @Published var currentAnswer: AIAnswer?
    @Published var streamingText: String = ""
    @Published var citations: [Citation] = []
    @Published var followUps: [FollowUp] = []
    @Published var isStreaming: Bool = false
    @Published var lastQuery: String?
    @Published var error: Error?
    @Published var streamingState: StreamingState = .idle

    // Stream progress
    @Published var characterCount: Int = 0
    @Published var wordCount: Int = 0
    @Published var streamDuration: TimeInterval = 0

    // MARK: - Streaming State
    enum StreamingState: Equatable {
        case idle
        case connecting
        case streaming
        case completed
        case failed(String)

        var isActive: Bool {
            switch self {
            case .connecting, .streaming:
                return true
            default:
                return false
            }
        }
    }

    // MARK: - Private Properties
    private var streamTask: Task<Void, Never>?
    private var brainClient = BrainClient.shared
    private var cancellables = Set<AnyCancellable>()
    private var streamStartTime: Date?
    private var streamTimer: Timer?
    private let logger = Logger(subsystem: "AIResultsViewModel")

    // MARK: - Configuration
    private let maxStreamDuration: TimeInterval = 120  // 2 minutes timeout

    // MARK: - Initialization
    init() {
        setupObservers()
    }

    deinit {
        streamTimer?.invalidate()
    }

    // MARK: - Setup
    private func setupObservers() {
        // Update word count when streaming text changes
        $streamingText
            .map { text in
                text.split(separator: " ").count
            }
            .assign(to: &$wordCount)

        $streamingText
            .map(\.count)
            .assign(to: &$characterCount)
    }

    // MARK: - Search (Simple)
    func search(query: String) async {
        await searchWithContext(query: query, pageURL: nil, pageContent: nil)
    }

    // MARK: - Search with Page Context
    func searchWithContext(
        query: String,
        pageURL: String?,
        pageContent: String?
    ) async {
        // Reset state
        resetState()
        lastQuery = query
        streamingState = .connecting
        isStreaming = true
        streamStartTime = Date()

        // Start duration timer
        startStreamTimer()

        // Cancel any existing stream
        streamTask?.cancel()

        streamTask = Task {
            do {
                logger.debug("Starting search for: \(query)")

                // Build context if available
                let context: QueryContext?
                if let url = pageURL {
                    context = QueryContext(
                        pageContent: pageContent,
                        pageURL: url,
                        recentHistory: nil
                    )
                } else {
                    context = nil
                }

                // Start SSE stream
                let stream = await brainClient.streamAnswer(query: query, context: context)
                for try await chunk in stream {
                    guard !Task.isCancelled else {
                        logger.debug("Stream cancelled")
                        break
                    }

                    handleStreamChunk(chunk)
                }

                // Finalize answer if stream completed normally
                if !Task.isCancelled {
                    finalizeAnswer()
                }

            } catch {
                logger.error("Stream error: \(error.localizedDescription)")
                handleError(error)
            }
        }
    }

    // MARK: - Search via Convex
    func searchViaConvex(
        query: String,
        url: String,
        html: String
    ) async {
        // Reset state
        resetState()
        lastQuery = query
        streamingState = .connecting
        isStreaming = true
        streamStartTime = Date()

        startStreamTimer()

        streamTask?.cancel()

        streamTask = Task {
            do {
                logger.debug("Starting Convex search for: \(query)")

                let stream = await brainClient.streamViaConvex(
                    query: query,
                    url: url,
                    html: html
                )
                for try await chunk in stream {
                    guard !Task.isCancelled else { break }
                    handleStreamChunk(chunk)
                }

                if !Task.isCancelled {
                    finalizeAnswer()
                }

            } catch {
                logger.error("Convex stream error: \(error.localizedDescription)")
                handleError(error)
            }
        }
    }

    // MARK: - Follow-Up Question
    func askFollowUp(_ followUp: FollowUp) async {
        await search(query: followUp.text)
    }

    // MARK: - Stream Handling
    private func handleStreamChunk(_ chunk: StreamChunk) {
        // Update state on first chunk
        if streamingState == .connecting {
            streamingState = .streaming
        }

        switch chunk {
        case .text(let text):
            streamingText += text
            logger.debug("Received text chunk: \(text.prefix(50))...")

        case .citation(let citation):
            if !citations.contains(where: { $0.url == citation.url }) {
                citations.append(citation)
                logger.debug("Received citation: \(citation.title)")
            }

        case .followUp(let followUp):
            if !followUps.contains(where: { $0.text == followUp.text }) {
                followUps.append(followUp)
                logger.debug("Received follow-up: \(followUp.text)")
            }

        case .done(var answer):
            logger.debug("Stream done")
            // Populate answer with accumulated data
            answer.content = streamingText
            answer.citations = citations
            answer.followUps = followUps.isEmpty ? generateDefaultFollowUps() : followUps
            currentAnswer = answer
            streamingState = .completed
            isStreaming = false
            stopStreamTimer()

        case .error(let message):
            logger.error("Stream error event: \(message)")
            error = NSError(
                domain: "AIResultsViewModel",
                code: -1,
                userInfo: [NSLocalizedDescriptionKey: message]
            )
            streamingState = .failed(message)
            isStreaming = false
            stopStreamTimer()
        }
    }

    private func finalizeAnswer() {
        stopStreamTimer()

        if currentAnswer == nil && !streamingText.isEmpty {
            // Create answer from streamed text if not received via done event
            currentAnswer = AIAnswer(
                id: UUID(),
                content: streamingText,
                citations: citations,
                followUps: followUps.isEmpty ? generateDefaultFollowUps() : followUps,
                createdAt: Date(),
                query: lastQuery ?? ""
            )
        }

        streamingState = .completed
        isStreaming = false

        logger.debug("Answer finalized: \(streamingText.count) chars, \(citations.count) citations")
    }

    private func handleError(_ error: Error) {
        stopStreamTimer()
        self.error = error
        streamingState = .failed(error.localizedDescription)
        isStreaming = false
    }

    // MARK: - Stream Timer
    private func startStreamTimer() {
        streamTimer?.invalidate()
        streamDuration = 0

        streamTimer = Timer.scheduledTimer(withTimeInterval: 0.1, repeats: true) { [weak self] _ in
            guard let self = self,
                  let startTime = self.streamStartTime else { return }

            Task { @MainActor in
                self.streamDuration = Date().timeIntervalSince(startTime)

                // Timeout protection
                if self.streamDuration > self.maxStreamDuration {
                    self.logger.warning("Stream timeout reached")
                    self.cancelStream()
                }
            }
        }
    }

    private func stopStreamTimer() {
        streamTimer?.invalidate()
        streamTimer = nil
    }

    // MARK: - Cancel
    func cancelStream() {
        logger.debug("Cancelling stream")
        streamTask?.cancel()
        streamTask = nil
        stopStreamTimer()

        if streamingState.isActive {
            streamingState = .idle
        }
        isStreaming = false
    }

    // MARK: - Clear
    func clear() {
        cancelStream()
        resetState()
    }

    private func resetState() {
        currentAnswer = nil
        streamingText = ""
        citations = []
        followUps = []
        lastQuery = nil
        error = nil
        streamingState = .idle
        characterCount = 0
        wordCount = 0
        streamDuration = 0
        streamStartTime = nil
    }

    // MARK: - Default Follow-Ups
    private func generateDefaultFollowUps() -> [FollowUp] {
        guard let query = lastQuery else { return [] }

        return [
            FollowUp(
                text: "Can you explain this in more detail?",
                type: .deepDive
            ),
            FollowUp(
                text: "What are the key points?",
                type: .clarification
            ),
            FollowUp(
                text: "Give me a practical example",
                type: .example
            )
        ]
    }

    // MARK: - Retry
    func retry() async {
        guard let query = lastQuery else { return }
        await search(query: query)
    }

    // MARK: - Computed Properties
    var hasAnswer: Bool {
        currentAnswer != nil || !streamingText.isEmpty
    }

    var hasCitations: Bool {
        !citations.isEmpty
    }

    var hasFollowUps: Bool {
        !followUps.isEmpty
    }

    var hasError: Bool {
        error != nil
    }

    var displayText: String {
        currentAnswer?.content ?? streamingText
    }

    var topCitations: [Citation] {
        citations.top(5)
    }

    var estimatedReadingTime: Int {
        max(1, wordCount / 200)
    }

    var formattedDuration: String {
        let seconds = Int(streamDuration)
        return String(format: "%d:%02d", seconds / 60, seconds % 60)
    }
}

// MARK: - Preview Helper
extension AIResultsViewModel {
    static var preview: AIResultsViewModel {
        let vm = AIResultsViewModel()
        vm.streamingText = "This is a sample AI response that demonstrates the streaming functionality. The text appears character by character as it's received from the backend."
        vm.citations = [
            Citation(
                url: "https://example.com/article",
                title: "Example Article",
                snippet: "This is a snippet from the example article...",
                domain: "example.com",
                relevanceScore: 0.95
            )
        ]
        vm.followUps = [
            FollowUp(text: "Tell me more about this topic", type: .deepDive),
            FollowUp(text: "What are the alternatives?", type: .comparison)
        ]
        return vm
    }
}
