/**
 * StreamingSSEClient.swift
 * Enhanced SSE client wrapper with auto-reconnection
 * Supports heartbeat detection and proper SSE parsing
 */

import Foundation

// MARK: - Streaming SSE Client
final class StreamingSSEClient: NSObject {
    // MARK: - Event Types
    enum Event {
        case delta(String)
        case sources([AISource])
        case done
        case error(String)
        case connected
        case reconnecting(attempt: Int)
    }

    // MARK: - State
    enum State {
        case idle
        case connecting
        case connected
        case reconnecting
        case disconnected
        case failed(Error)
    }

    // MARK: - Properties
    private var session: URLSession?
    private var dataTask: URLSessionDataTask?
    private var eventBuffer = ""
    private let logger = Logger(subsystem: "StreamingSSEClient")

    // Configuration
    private let maxReconnectAttempts: Int
    private let baseReconnectDelay: TimeInterval
    private let heartbeatTimeout: TimeInterval

    // State
    private(set) var state: State = .idle
    private var reconnectAttempt = 0
    private var heartbeatTimer: Timer?
    private var lastEventTime: Date?

    // Callbacks
    private var onEvent: ((Event) -> Void)?
    private var onStateChange: ((State) -> Void)?

    // Request info for reconnection
    private var currentURL: URL?
    private var currentHeaders: [String: String]?
    private var currentBodyJSON: [String: Any]?

    // MARK: - Initialization
    init(
        maxReconnectAttempts: Int = 3,
        baseReconnectDelay: TimeInterval = 1.0,
        heartbeatTimeout: TimeInterval = 30.0
    ) {
        self.maxReconnectAttempts = maxReconnectAttempts
        self.baseReconnectDelay = baseReconnectDelay
        self.heartbeatTimeout = heartbeatTimeout
        super.init()
    }

    // MARK: - Start Streaming
    func start(
        url: URL,
        headers: [String: String],
        bodyJSON: [String: Any],
        onEvent: @escaping (Event) -> Void
    ) {
        // Store for potential reconnection
        self.currentURL = url
        self.currentHeaders = headers
        self.currentBodyJSON = bodyJSON
        self.onEvent = onEvent
        self.reconnectAttempt = 0

        connect()
    }

    // MARK: - Connect
    private func connect() {
        guard let url = currentURL else { return }

        updateState(.connecting)

        // Create session with delegate
        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 300
        config.timeoutIntervalForResource = 600

        session = URLSession(
            configuration: config,
            delegate: self,
            delegateQueue: OperationQueue()
        )

        // Build request
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("text/event-stream", forHTTPHeaderField: "Accept")
        request.setValue("no-cache", forHTTPHeaderField: "Cache-Control")
        request.setValue("keep-alive", forHTTPHeaderField: "Connection")

        // Add custom headers
        for (key, value) in currentHeaders ?? [:] {
            request.setValue(value, forHTTPHeaderField: key)
        }

        // Add body
        if let body = currentBodyJSON {
            request.httpBody = try? JSONSerialization.data(withJSONObject: body)
        }

        logger.debug("Connecting to SSE stream: \(url.absoluteString)")

        dataTask = session?.dataTask(with: request)
        dataTask?.resume()

        // Start heartbeat monitoring
        startHeartbeatMonitor()
    }

    // MARK: - Cancel
    func cancel() {
        logger.debug("Cancelling SSE stream")

        heartbeatTimer?.invalidate()
        heartbeatTimer = nil

        dataTask?.cancel()
        dataTask = nil

        session?.invalidateAndCancel()
        session = nil

        eventBuffer = ""
        updateState(.disconnected)
    }

    // MARK: - Reconnect
    private func reconnect() {
        guard reconnectAttempt < maxReconnectAttempts else {
            logger.error("Max reconnect attempts reached")
            updateState(.failed(SSEStreamError.maxReconnectAttemptsReached))
            onEvent?(.error("Connection lost. Max reconnect attempts reached."))
            return
        }

        reconnectAttempt += 1
        let delay = baseReconnectDelay * pow(2.0, Double(reconnectAttempt - 1))

        logger.warning("Reconnecting (attempt \(reconnectAttempt)/\(maxReconnectAttempts)) in \(delay)s")

        updateState(.reconnecting)
        onEvent?(.reconnecting(attempt: reconnectAttempt))

        // Clean up current connection
        dataTask?.cancel()
        session?.invalidateAndCancel()
        eventBuffer = ""

        // Reconnect after delay
        DispatchQueue.main.asyncAfter(deadline: .now() + delay) { [weak self] in
            self?.connect()
        }
    }

    // MARK: - State Management
    private func updateState(_ newState: State) {
        state = newState
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            self.onStateChange?(self.state)
        }
    }

    // MARK: - Heartbeat Monitor
    private func startHeartbeatMonitor() {
        heartbeatTimer?.invalidate()
        lastEventTime = Date()

        heartbeatTimer = Timer.scheduledTimer(withTimeInterval: 5.0, repeats: true) { [weak self] _ in
            self?.checkHeartbeat()
        }
    }

    private func checkHeartbeat() {
        guard let lastEvent = lastEventTime else { return }

        let elapsed = Date().timeIntervalSince(lastEvent)

        if elapsed > heartbeatTimeout {
            logger.warning("Heartbeat timeout - no events for \(elapsed)s")
            reconnect()
        }
    }

    private func recordEvent() {
        lastEventTime = Date()
    }

    // MARK: - Parse SSE Data
    private func processData(_ data: Data) {
        guard let string = String(data: data, encoding: .utf8) else { return }

        eventBuffer += string

        // Process complete events (ended by double newline)
        while let range = eventBuffer.range(of: "\n\n") {
            let eventString = String(eventBuffer[..<range.lowerBound])
            eventBuffer = String(eventBuffer[range.upperBound...])

            if let event = parseEvent(eventString) {
                recordEvent()
                DispatchQueue.main.async { [weak self] in
                    self?.onEvent?(event)
                }

                // Handle done event
                if case .done = event {
                    cancel()
                }
            }
        }
    }

    private func parseEvent(_ string: String) -> Event? {
        var eventType = "message"
        var data = ""

        let lines = string.split(separator: "\n", omittingEmptySubsequences: false)

        for line in lines {
            let lineStr = String(line)

            if lineStr.hasPrefix("event:") {
                eventType = lineStr.dropFirst(6).trimmingCharacters(in: .whitespaces)
            } else if lineStr.hasPrefix("data:") {
                let content = lineStr.dropFirst(5).trimmingCharacters(in: .whitespaces)
                if !data.isEmpty {
                    data += "\n"
                }
                data += content
            } else if lineStr.hasPrefix(":") {
                // Comment/heartbeat - ignore but record for heartbeat
                recordEvent()
            }
        }

        // Empty data after heartbeat comment
        if data.isEmpty && eventType == "message" {
            return nil
        }

        switch eventType {
        case "delta", "text", "message":
            guard !data.isEmpty else { return nil }
            return .delta(data)

        case "sources", "citation", "citations":
            return parseSourcesEvent(data)

        case "done", "end", "complete", "finish":
            return .done

        case "error":
            return .error(data)

        case "heartbeat", "ping":
            // Just record for heartbeat monitoring
            return nil

        default:
            // Treat unknown events with data as delta
            if !data.isEmpty {
                return .delta(data)
            }
            return nil
        }
    }

    private func parseSourcesEvent(_ data: String) -> Event? {
        guard let jsonData = data.data(using: .utf8) else { return nil }

        // Try parsing as array
        if let sources = try? JSONDecoder().decode([AISource].self, from: jsonData) {
            return .sources(sources)
        }

        // Try parsing as single source
        if let source = try? JSONDecoder().decode(AISource.self, from: jsonData) {
            return .sources([source])
        }

        return nil
    }
}

// MARK: - URLSessionDataDelegate
extension StreamingSSEClient: URLSessionDataDelegate {
    func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive data: Data) {
        processData(data)
    }

    func urlSession(
        _ session: URLSession,
        dataTask: URLSessionDataTask,
        didReceive response: URLResponse,
        completionHandler: @escaping (URLSession.ResponseDisposition) -> Void
    ) {
        guard let httpResponse = response as? HTTPURLResponse else {
            completionHandler(.cancel)
            updateState(.failed(SSEStreamError.invalidResponse))
            return
        }

        if 200..<300 ~= httpResponse.statusCode {
            logger.debug("SSE stream connected")
            updateState(.connected)
            reconnectAttempt = 0  // Reset on successful connection
            DispatchQueue.main.async { [weak self] in
                self?.onEvent?(.connected)
            }
            completionHandler(.allow)
        } else {
            logger.error("SSE stream failed with status: \(httpResponse.statusCode)")
            completionHandler(.cancel)

            // Retry on server errors
            if httpResponse.statusCode >= 500 {
                reconnect()
            } else {
                updateState(.failed(SSEStreamError.httpError(httpResponse.statusCode)))
                DispatchQueue.main.async { [weak self] in
                    self?.onEvent?(.error("HTTP error: \(httpResponse.statusCode)"))
                }
            }
        }
    }

    func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
        heartbeatTimer?.invalidate()

        if let error = error {
            let nsError = error as NSError

            // Check if cancelled
            if nsError.code == NSURLErrorCancelled {
                logger.debug("SSE stream cancelled")
                updateState(.disconnected)
                return
            }

            // Network errors - try to reconnect
            if nsError.domain == NSURLErrorDomain {
                logger.error("Network error: \(error.localizedDescription)")
                reconnect()
                return
            }

            logger.error("SSE stream error: \(error.localizedDescription)")
            updateState(.failed(error))
            DispatchQueue.main.async { [weak self] in
                self?.onEvent?(.error(error.localizedDescription))
            }
        } else {
            logger.debug("SSE stream completed")
            updateState(.disconnected)
        }
    }
}

// MARK: - SSE Stream Error
enum SSEStreamError: LocalizedError {
    case invalidResponse
    case httpError(Int)
    case maxReconnectAttemptsReached
    case heartbeatTimeout
    case connectionFailed

    var errorDescription: String? {
        switch self {
        case .invalidResponse:
            return "Invalid response from server"
        case .httpError(let code):
            return "HTTP error: \(code)"
        case .maxReconnectAttemptsReached:
            return "Connection lost after maximum reconnect attempts"
        case .heartbeatTimeout:
            return "Connection timed out"
        case .connectionFailed:
            return "Failed to establish connection"
        }
    }
}

// MARK: - Async Stream Extension
extension StreamingSSEClient {
    /// Convert to AsyncThrowingStream for modern async/await usage
    func asAsyncStream(
        url: URL,
        headers: [String: String],
        bodyJSON: [String: Any]
    ) -> AsyncThrowingStream<Event, Error> {
        AsyncThrowingStream { continuation in
            self.start(
                url: url,
                headers: headers,
                bodyJSON: bodyJSON
            ) { event in
                switch event {
                case .done:
                    continuation.finish()
                case .error(let message):
                    continuation.finish(throwing: SSEStreamError.connectionFailed)
                default:
                    continuation.yield(event)
                }
            }

            continuation.onTermination = { [weak self] _ in
                self?.cancel()
            }
        }
    }
}
