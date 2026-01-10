/**
 * HTTPClient.swift
 * Generic HTTP client for API requests
 * Includes retry logic, request/response logging, and improved error handling
 */

import Foundation

actor HTTPClient {
    // MARK: - Singleton
    static let shared = HTTPClient()

    // MARK: - Properties
    private let session: URLSession
    private let decoder: JSONDecoder
    private let encoder: JSONEncoder
    private let logger = Logger(subsystem: "HTTPClient")

    // Retry configuration
    private let maxRetries: Int = 3
    private let baseRetryDelay: TimeInterval = 1.0
    private let retryableStatusCodes: Set<Int> = [408, 429, 500, 502, 503, 504]

    // Request tracking
    private var requestCounter: Int = 0

    // MARK: - Initialization
    private init() {
        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 30
        config.timeoutIntervalForResource = 60
        config.waitsForConnectivity = true
        self.session = URLSession(configuration: config)

        self.decoder = JSONDecoder()
        self.decoder.dateDecodingStrategy = .iso8601

        self.encoder = JSONEncoder()
        self.encoder.dateEncodingStrategy = .iso8601
    }

    // MARK: - GET
    func get<T: Decodable>(
        _ path: String,
        headers: [String: String] = [:],
        queryParams: [String: String] = [:],
        retries: Int? = nil
    ) async throws -> T {
        let request = try await buildRequest(
            path: path,
            method: "GET",
            headers: headers,
            queryParams: queryParams
        )
        return try await executeWithRetry(request, maxRetries: retries ?? maxRetries)
    }

    // MARK: - POST
    func post<T: Decodable, B: Encodable>(
        _ path: String,
        body: B,
        headers: [String: String] = [:],
        retries: Int? = nil
    ) async throws -> T {
        var request = try await buildRequest(
            path: path,
            method: "POST",
            headers: headers
        )
        request.httpBody = try encoder.encode(body)
        return try await executeWithRetry(request, maxRetries: retries ?? maxRetries)
    }

    // MARK: - POST with Dictionary Body
    func post<T: Decodable>(
        _ path: String,
        bodyDict: [String: Any],
        headers: [String: String] = [:],
        retries: Int? = nil
    ) async throws -> T {
        var request = try await buildRequest(
            path: path,
            method: "POST",
            headers: headers
        )
        request.httpBody = try JSONSerialization.data(withJSONObject: bodyDict)
        return try await executeWithRetry(request, maxRetries: retries ?? maxRetries)
    }

    // MARK: - PUT
    func put<T: Decodable, B: Encodable>(
        _ path: String,
        body: B,
        headers: [String: String] = [:],
        retries: Int? = nil
    ) async throws -> T {
        var request = try await buildRequest(
            path: path,
            method: "PUT",
            headers: headers
        )
        request.httpBody = try encoder.encode(body)
        return try await executeWithRetry(request, maxRetries: retries ?? maxRetries)
    }

    // MARK: - PATCH
    func patch<T: Decodable, B: Encodable>(
        _ path: String,
        body: B,
        headers: [String: String] = [:],
        retries: Int? = nil
    ) async throws -> T {
        var request = try await buildRequest(
            path: path,
            method: "PATCH",
            headers: headers
        )
        request.httpBody = try encoder.encode(body)
        return try await executeWithRetry(request, maxRetries: retries ?? maxRetries)
    }

    // MARK: - DELETE
    func delete(
        _ path: String,
        headers: [String: String] = [:],
        retries: Int? = nil
    ) async throws {
        let request = try await buildRequest(
            path: path,
            method: "DELETE",
            headers: headers
        )
        let _: EmptyResponse = try await executeWithRetry(request, maxRetries: retries ?? maxRetries)
    }

    // MARK: - Build Request
    private func buildRequest(
        path: String,
        method: String,
        headers: [String: String] = [:],
        queryParams: [String: String] = [:]
    ) async throws -> URLRequest {
        // Determine base URL
        let baseURL: String
        if path.hasPrefix("http://") || path.hasPrefix("https://") {
            baseURL = ""
        } else {
            baseURL = Configuration.apiBaseURL
        }

        var components = URLComponents(string: "\(baseURL)\(path)")

        if !queryParams.isEmpty {
            components?.queryItems = queryParams.map {
                URLQueryItem(name: $0.key, value: $0.value)
            }
        }

        guard let url = components?.url else {
            throw HTTPError.invalidURL
        }

        var request = URLRequest(url: url)
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("OrionBrowser/\(Configuration.appVersion)", forHTTPHeaderField: "User-Agent")

        // Add auth token
        if let token = await ClerkAuthManager.shared.sessionToken {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }

        // Add custom headers
        for (key, value) in headers {
            request.setValue(value, forHTTPHeaderField: key)
        }

        return request
    }

    // MARK: - Execute with Retry
    private func executeWithRetry<T: Decodable>(
        _ request: URLRequest,
        maxRetries: Int,
        attempt: Int = 1
    ) async throws -> T {
        do {
            return try await execute(request)
        } catch let error as HTTPError {
            // Check if error is retryable
            guard attempt < maxRetries, error.isRetryable else {
                throw error
            }

            // Calculate delay with exponential backoff and jitter
            let delay = calculateRetryDelay(attempt: attempt, error: error)

            logger.warning("Retry \(attempt)/\(maxRetries) for \(request.url?.path ?? "?") after \(String(format: "%.2f", delay))s")

            try await Task.sleep(nanoseconds: UInt64(delay * 1_000_000_000))

            return try await executeWithRetry(request, maxRetries: maxRetries, attempt: attempt + 1)
        } catch {
            // Network errors are retryable
            let nsError = error as NSError
            if nsError.domain == NSURLErrorDomain && attempt < maxRetries {
                let delay = calculateRetryDelay(attempt: attempt, error: nil)

                logger.warning("Network error, retry \(attempt)/\(maxRetries) after \(String(format: "%.2f", delay))s")

                try await Task.sleep(nanoseconds: UInt64(delay * 1_000_000_000))

                return try await executeWithRetry(request, maxRetries: maxRetries, attempt: attempt + 1)
            }

            throw error
        }
    }

    // MARK: - Calculate Retry Delay
    private func calculateRetryDelay(attempt: Int, error: HTTPError?) -> TimeInterval {
        var delay = baseRetryDelay * pow(2.0, Double(attempt - 1))

        // Use Retry-After header if rate limited
        if case .rateLimited(let retryAfter) = error, let retryAfter = retryAfter {
            delay = max(delay, retryAfter)
        }

        // Add jitter (0-30% of delay)
        let jitter = Double.random(in: 0...0.3) * delay

        return delay + jitter
    }

    // MARK: - Execute Request
    private func execute<T: Decodable>(_ request: URLRequest) async throws -> T {
        requestCounter += 1
        let requestId = requestCounter

        // Log request
        logRequest(request, id: requestId)

        let startTime = Date()
        let (data, response) = try await session.data(for: request)
        let duration = Date().timeIntervalSince(startTime)

        guard let httpResponse = response as? HTTPURLResponse else {
            throw HTTPError.invalidResponse
        }

        // Log response
        logResponse(httpResponse, data: data, duration: duration, id: requestId)

        switch httpResponse.statusCode {
        case 200..<300:
            if data.isEmpty {
                if T.self == EmptyResponse.self {
                    return EmptyResponse() as! T
                }
                throw HTTPError.emptyResponse
            }
            do {
                return try decoder.decode(T.self, from: data)
            } catch {
                logger.error("Decoding error: \(error)")
                throw HTTPError.decodingFailed(error)
            }

        case 401:
            throw HTTPError.unauthorized

        case 403:
            throw HTTPError.forbidden

        case 404:
            throw HTTPError.notFound

        case 429:
            let retryAfter = parseRetryAfter(httpResponse)
            throw HTTPError.rateLimited(retryAfter: retryAfter)

        case 500..<600:
            throw HTTPError.serverError(httpResponse.statusCode)

        default:
            throw HTTPError.unknown(httpResponse.statusCode)
        }
    }

    // MARK: - Parse Retry-After Header
    private func parseRetryAfter(_ response: HTTPURLResponse) -> TimeInterval? {
        guard let retryAfter = response.value(forHTTPHeaderField: "Retry-After") else {
            return nil
        }

        // Try parsing as seconds
        if let seconds = Double(retryAfter) {
            return seconds
        }

        // Try parsing as HTTP date
        let formatter = DateFormatter()
        formatter.dateFormat = "EEE, dd MMM yyyy HH:mm:ss zzz"
        if let date = formatter.date(from: retryAfter) {
            return date.timeIntervalSinceNow
        }

        return nil
    }

    // MARK: - Upload File
    func uploadFile(
        _ path: String,
        fileURL: URL,
        mimeType: String,
        headers: [String: String] = [:],
        progressHandler: ((Double) -> Void)? = nil
    ) async throws -> UploadResponse {
        var request = try await buildRequest(
            path: path,
            method: "POST",
            headers: headers
        )

        let boundary = UUID().uuidString
        request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")

        let data = try createMultipartBody(fileURL: fileURL, mimeType: mimeType, boundary: boundary)
        request.httpBody = data

        logger.debug("Uploading file: \(fileURL.lastPathComponent) (\(data.count) bytes)")

        return try await executeWithRetry(request, maxRetries: 2)
    }

    private func createMultipartBody(fileURL: URL, mimeType: String, boundary: String) throws -> Data {
        var body = Data()

        let filename = fileURL.lastPathComponent
        let fileData = try Data(contentsOf: fileURL)

        body.append("--\(boundary)\r\n".data(using: .utf8)!)
        body.append("Content-Disposition: form-data; name=\"file\"; filename=\"\(filename)\"\r\n".data(using: .utf8)!)
        body.append("Content-Type: \(mimeType)\r\n\r\n".data(using: .utf8)!)
        body.append(fileData)
        body.append("\r\n--\(boundary)--\r\n".data(using: .utf8)!)

        return body
    }

    // MARK: - Logging
    private func logRequest(_ request: URLRequest, id: Int) {
        #if DEBUG
        let method = request.httpMethod ?? "?"
        let path = request.url?.path ?? "?"
        let bodySize = request.httpBody?.count ?? 0

        logger.debug("[\(id)] --> \(method) \(path) (\(bodySize) bytes)")

        // Log headers in verbose mode
        if let headers = request.allHTTPHeaderFields {
            for (key, value) in headers where !key.lowercased().contains("authorization") {
                logger.debug("[\(id)]     \(key): \(value)")
            }
        }
        #endif
    }

    private func logResponse(_ response: HTTPURLResponse, data: Data, duration: TimeInterval, id: Int) {
        #if DEBUG
        let status = response.statusCode
        let size = data.count
        let durationMs = Int(duration * 1000)

        let statusEmoji: String
        switch status {
        case 200..<300: statusEmoji = "OK"
        case 400..<500: statusEmoji = "ERR"
        case 500..<600: statusEmoji = "FAIL"
        default: statusEmoji = "?"
        }

        logger.debug("[\(id)] <-- \(status) \(statusEmoji) (\(size) bytes, \(durationMs)ms)")

        // Log response body preview for errors
        if status >= 400, let bodyString = String(data: data.prefix(500), encoding: .utf8) {
            logger.debug("[\(id)]     Response: \(bodyString)")
        }
        #endif
    }
}

// MARK: - Empty Response
struct EmptyResponse: Decodable {}

// MARK: - Upload Response
struct UploadResponse: Decodable {
    let url: String
    let id: String?
    let size: Int?
    let contentType: String?
}

// MARK: - HTTP Error
enum HTTPError: LocalizedError {
    case invalidURL
    case invalidResponse
    case emptyResponse
    case decodingFailed(Error)
    case unauthorized
    case forbidden
    case notFound
    case rateLimited(retryAfter: TimeInterval?)
    case serverError(Int)
    case unknown(Int)
    case networkError(Error)

    var errorDescription: String? {
        switch self {
        case .invalidURL:
            return "Invalid URL"
        case .invalidResponse:
            return "Invalid response"
        case .emptyResponse:
            return "Empty response"
        case .decodingFailed(let error):
            return "Decoding failed: \(error.localizedDescription)"
        case .unauthorized:
            return "Unauthorized - please sign in again"
        case .forbidden:
            return "Access forbidden"
        case .notFound:
            return "Resource not found"
        case .rateLimited(let retryAfter):
            if let seconds = retryAfter {
                return "Rate limited - please try again in \(Int(seconds)) seconds"
            }
            return "Rate limited - please try again later"
        case .serverError(let code):
            return "Server error (\(code))"
        case .unknown(let code):
            return "Unknown error (\(code))"
        case .networkError(let error):
            return "Network error: \(error.localizedDescription)"
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

// MARK: - Configuration Extension
extension Configuration {
    static var apiBaseURL: String {
        convexDeploymentURL
    }

    static var brainAPIEndpoint: String {
        "\(convexDeploymentURL)/api/action"
    }
}
