/**
 * SSEClient.swift
 * Server-Sent Events client for real-time streaming
 */

import Foundation

actor SSEClient {
    // MARK: - Properties
    private var session: URLSession
    private var dataTask: URLSessionDataTask?
    private var eventBuffer = ""

    // MARK: - Initialization
    init(configuration: URLSessionConfiguration = .default) {
        configuration.timeoutIntervalForRequest = 60
        configuration.timeoutIntervalForResource = 300
        self.session = URLSession(configuration: configuration)
    }

    // MARK: - Connect
    func connect(
        to url: URL,
        headers: [String: String] = [:],
        onEvent: @escaping (SSEEvent) -> Void,
        onError: @escaping (Error) -> Void
    ) {
        var request = URLRequest(url: url)
        request.setValue("text/event-stream", forHTTPHeaderField: "Accept")
        request.setValue("no-cache", forHTTPHeaderField: "Cache-Control")

        for (key, value) in headers {
            request.setValue(value, forHTTPHeaderField: key)
        }

        let delegate = SSEDelegate(
            onData: { [weak self] data in
                Task {
                    await self?.processData(data, onEvent: onEvent)
                }
            },
            onError: onError
        )

        let session = URLSession(
            configuration: .default,
            delegate: delegate,
            delegateQueue: nil
        )

        dataTask = session.dataTask(with: request)
        dataTask?.resume()
    }

    // MARK: - Disconnect
    func disconnect() {
        dataTask?.cancel()
        dataTask = nil
        eventBuffer = ""
    }

    // MARK: - Process Data
    private func processData(_ data: Data, onEvent: @escaping (SSEEvent) -> Void) {
        guard let string = String(data: data, encoding: .utf8) else { return }
        eventBuffer += string

        // Process complete events
        while let range = eventBuffer.range(of: "\n\n") {
            let eventString = String(eventBuffer[..<range.lowerBound])
            eventBuffer = String(eventBuffer[range.upperBound...])

            if let event = parseEvent(eventString) {
                onEvent(event)
            }
        }
    }

    // MARK: - Parse Event
    private func parseEvent(_ string: String) -> SSEEvent? {
        var eventType = "message"
        var data = ""
        var id: String?
        var retry: Int?

        let lines = string.split(separator: "\n", omittingEmptySubsequences: false)

        for line in lines {
            if line.hasPrefix("event:") {
                eventType = String(line.dropFirst(6)).trimmingCharacters(in: .whitespaces)
            } else if line.hasPrefix("data:") {
                let content = String(line.dropFirst(5)).trimmingCharacters(in: .whitespaces)
                if !data.isEmpty {
                    data += "\n"
                }
                data += content
            } else if line.hasPrefix("id:") {
                id = String(line.dropFirst(3)).trimmingCharacters(in: .whitespaces)
            } else if line.hasPrefix("retry:") {
                let retryString = String(line.dropFirst(6)).trimmingCharacters(in: .whitespaces)
                retry = Int(retryString)
            }
        }

        guard !data.isEmpty else { return nil }

        return SSEEvent(
            type: eventType,
            data: data,
            id: id,
            retry: retry
        )
    }
}

// MARK: - SSE Event
struct SSEEvent {
    let type: String
    let data: String
    let id: String?
    let retry: Int?

    // Parse JSON data
    func json<T: Decodable>(_ type: T.Type) throws -> T {
        guard let data = data.data(using: .utf8) else {
            throw SSEError.invalidData
        }
        return try JSONDecoder().decode(type, from: data)
    }
}

// MARK: - SSE Delegate
class SSEDelegate: NSObject, URLSessionDataDelegate {
    let onData: (Data) -> Void
    let onError: (Error) -> Void

    init(onData: @escaping (Data) -> Void, onError: @escaping (Error) -> Void) {
        self.onData = onData
        self.onError = onError
    }

    func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive data: Data) {
        onData(data)
    }

    func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
        if let error = error {
            onError(error)
        }
    }
}

// MARK: - SSE Error
enum SSEError: LocalizedError {
    case invalidData
    case connectionFailed
    case disconnected

    var errorDescription: String? {
        switch self {
        case .invalidData: return "Invalid SSE data"
        case .connectionFailed: return "SSE connection failed"
        case .disconnected: return "SSE disconnected"
        }
    }
}
