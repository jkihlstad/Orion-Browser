/**
 * OpenRouterClient.swift
 * OpenRouter API client for direct LLM access
 * Provides streaming responses and model selection
 */

import Foundation

// MARK: - OpenRouter Client
actor OpenRouterClient {
    // MARK: - Singleton
    static let shared = OpenRouterClient()

    // MARK: - Properties
    private let baseURL: URL
    private let session: URLSession
    private let decoder: JSONDecoder
    private let encoder: JSONEncoder
    private let logger = Logger(subsystem: "OpenRouterClient")

    // API key management
    private var apiKey: String? {
        // First check Keychain (most secure)
        if let key = KeychainHelper.shared.get(key: "openrouter_api_key") {
            return key
        }
        // Fall back to plist config (less secure, for development)
        return APIEndpoints.fromPlist().openRouterAPIKey
    }

    // Available models
    enum Model: String, CaseIterable {
        case claudeOpus = "anthropic/claude-3-opus"
        case claudeSonnet = "anthropic/claude-3-sonnet"
        case claudeHaiku = "anthropic/claude-3-haiku"
        case gpt4Turbo = "openai/gpt-4-turbo"
        case gpt4 = "openai/gpt-4"
        case gpt35Turbo = "openai/gpt-3.5-turbo"
        case geminiPro = "google/gemini-pro"
        case mistralLarge = "mistralai/mistral-large"
        case mixtral = "mistralai/mixtral-8x7b-instruct"
        case llama370b = "meta-llama/llama-3-70b-instruct"

        var displayName: String {
            switch self {
            case .claudeOpus: return "Claude 3 Opus"
            case .claudeSonnet: return "Claude 3 Sonnet"
            case .claudeHaiku: return "Claude 3 Haiku"
            case .gpt4Turbo: return "GPT-4 Turbo"
            case .gpt4: return "GPT-4"
            case .gpt35Turbo: return "GPT-3.5 Turbo"
            case .geminiPro: return "Gemini Pro"
            case .mistralLarge: return "Mistral Large"
            case .mixtral: return "Mixtral 8x7B"
            case .llama370b: return "Llama 3 70B"
            }
        }

        var maxTokens: Int {
            switch self {
            case .claudeOpus, .claudeSonnet, .claudeHaiku:
                return 4096
            case .gpt4Turbo, .gpt4:
                return 4096
            case .gpt35Turbo:
                return 4096
            case .geminiPro:
                return 8192
            case .mistralLarge, .mixtral:
                return 4096
            case .llama370b:
                return 4096
            }
        }
    }

    // Default model
    private var defaultModel: Model = .claudeSonnet

    // MARK: - Initialization
    private init() {
        self.baseURL = APIEndpoints.openRouterBaseURL

        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 60
        config.timeoutIntervalForResource = 300
        self.session = URLSession(configuration: config)

        self.decoder = JSONDecoder()
        self.decoder.dateDecodingStrategy = .iso8601

        self.encoder = JSONEncoder()
    }

    // MARK: - Set API Key
    func setAPIKey(_ key: String) {
        KeychainHelper.shared.save(key: "openrouter_api_key", value: key)
    }

    // MARK: - Clear API Key
    func clearAPIKey() {
        KeychainHelper.shared.delete(key: "openrouter_api_key")
    }

    // MARK: - Set Default Model
    func setDefaultModel(_ model: Model) {
        defaultModel = model
    }

    // MARK: - Check API Key
    var hasAPIKey: Bool {
        apiKey != nil && !apiKey!.isEmpty
    }

    // MARK: - Chat Completion
    func chatCompletion(
        messages: [ChatMessage],
        model: Model? = nil,
        temperature: Double = 0.7,
        maxTokens: Int? = nil
    ) async throws -> ChatResponse {
        guard let apiKey = apiKey else {
            throw OpenRouterError.missingAPIKey
        }

        let selectedModel = model ?? defaultModel
        let url = baseURL.appendingPathComponent("chat/completions")

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(apiKey)", forHTTPHeaderField: "Authorization")
        request.setValue("OrionBrowser/\(Configuration.appVersion)", forHTTPHeaderField: "HTTP-Referer")
        request.setValue("Orion Browser", forHTTPHeaderField: "X-Title")

        let body = ChatRequest(
            model: selectedModel.rawValue,
            messages: messages,
            temperature: temperature,
            max_tokens: maxTokens ?? selectedModel.maxTokens,
            stream: false
        )

        request.httpBody = try encoder.encode(body)

        logger.debug("Chat completion with model: \(selectedModel.rawValue)")

        let (data, response) = try await session.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse else {
            throw OpenRouterError.invalidResponse
        }

        guard 200..<300 ~= httpResponse.statusCode else {
            if let errorResponse = try? decoder.decode(OpenRouterErrorResponse.self, from: data) {
                throw OpenRouterError.apiError(errorResponse.error.message)
            }
            throw OpenRouterError.httpError(httpResponse.statusCode)
        }

        return try decoder.decode(ChatResponse.self, from: data)
    }

    // MARK: - Streaming Chat Completion
    func streamChatCompletion(
        messages: [ChatMessage],
        model: Model? = nil,
        temperature: Double = 0.7,
        maxTokens: Int? = nil
    ) -> AsyncThrowingStream<StreamDelta, Error> {
        AsyncThrowingStream { continuation in
            Task {
                do {
                    guard let apiKey = self.apiKey else {
                        continuation.finish(throwing: OpenRouterError.missingAPIKey)
                        return
                    }

                    let selectedModel = model ?? self.defaultModel
                    let url = self.baseURL.appendingPathComponent("chat/completions")

                    var request = URLRequest(url: url)
                    request.httpMethod = "POST"
                    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
                    request.setValue("text/event-stream", forHTTPHeaderField: "Accept")
                    request.setValue("Bearer \(apiKey)", forHTTPHeaderField: "Authorization")
                    request.setValue("OrionBrowser/\(Configuration.appVersion)", forHTTPHeaderField: "HTTP-Referer")
                    request.setValue("Orion Browser", forHTTPHeaderField: "X-Title")

                    let body = ChatRequest(
                        model: selectedModel.rawValue,
                        messages: messages,
                        temperature: temperature,
                        max_tokens: maxTokens ?? selectedModel.maxTokens,
                        stream: true
                    )

                    request.httpBody = try self.encoder.encode(body)

                    self.logger.debug("Streaming chat with model: \(selectedModel.rawValue)")

                    let (bytes, response) = try await self.session.bytes(for: request)

                    guard let httpResponse = response as? HTTPURLResponse else {
                        continuation.finish(throwing: OpenRouterError.invalidResponse)
                        return
                    }

                    guard 200..<300 ~= httpResponse.statusCode else {
                        continuation.finish(throwing: OpenRouterError.httpError(httpResponse.statusCode))
                        return
                    }

                    var buffer = ""

                    for try await byte in bytes {
                        let char = Character(UnicodeScalar(byte))
                        buffer.append(char)

                        // Process complete SSE messages
                        while let range = buffer.range(of: "\n\n") {
                            let message = String(buffer[..<range.lowerBound])
                            buffer = String(buffer[range.upperBound...])

                            // Parse SSE data
                            for line in message.split(separator: "\n") {
                                if line.hasPrefix("data:") {
                                    let data = String(line.dropFirst(5)).trimmingCharacters(in: .whitespaces)

                                    if data == "[DONE]" {
                                        continuation.yield(.done)
                                        continuation.finish()
                                        return
                                    }

                                    if let jsonData = data.data(using: .utf8),
                                       let chunk = try? self.decoder.decode(StreamChunkResponse.self, from: jsonData),
                                       let delta = chunk.choices.first?.delta {
                                        if let content = delta.content {
                                            continuation.yield(.content(content))
                                        }
                                        if let role = delta.role {
                                            continuation.yield(.role(role))
                                        }
                                    }
                                }
                            }
                        }
                    }

                    continuation.finish()

                } catch {
                    self.logger.error("Stream error: \(error.localizedDescription)")
                    continuation.finish(throwing: error)
                }
            }
        }
    }

    // MARK: - List Models
    func listModels() async throws -> [ModelInfo] {
        guard let apiKey = apiKey else {
            throw OpenRouterError.missingAPIKey
        }

        let url = baseURL.appendingPathComponent("models")

        var request = URLRequest(url: url)
        request.httpMethod = "GET"
        request.setValue("Bearer \(apiKey)", forHTTPHeaderField: "Authorization")

        let (data, response) = try await session.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse,
              200..<300 ~= httpResponse.statusCode else {
            throw OpenRouterError.invalidResponse
        }

        let modelsResponse = try decoder.decode(ModelsResponse.self, from: data)
        return modelsResponse.data
    }
}

// MARK: - Request/Response Types
struct ChatMessage: Codable {
    let role: String
    let content: String

    static func system(_ content: String) -> ChatMessage {
        ChatMessage(role: "system", content: content)
    }

    static func user(_ content: String) -> ChatMessage {
        ChatMessage(role: "user", content: content)
    }

    static func assistant(_ content: String) -> ChatMessage {
        ChatMessage(role: "assistant", content: content)
    }
}

struct ChatRequest: Codable {
    let model: String
    let messages: [ChatMessage]
    let temperature: Double
    let max_tokens: Int
    let stream: Bool
}

struct ChatResponse: Codable {
    let id: String
    let model: String
    let choices: [Choice]
    let usage: Usage?

    struct Choice: Codable {
        let index: Int
        let message: ResponseMessage
        let finish_reason: String?
    }

    struct ResponseMessage: Codable {
        let role: String
        let content: String
    }

    struct Usage: Codable {
        let prompt_tokens: Int
        let completion_tokens: Int
        let total_tokens: Int
    }
}

struct StreamChunkResponse: Codable {
    let id: String
    let model: String
    let choices: [StreamChoice]

    struct StreamChoice: Codable {
        let index: Int
        let delta: Delta
        let finish_reason: String?
    }

    struct Delta: Codable {
        let role: String?
        let content: String?
    }
}

enum StreamDelta {
    case role(String)
    case content(String)
    case done
}

struct ModelInfo: Codable, Identifiable {
    let id: String
    let name: String?
    let description: String?
    let context_length: Int?
    let pricing: Pricing?

    struct Pricing: Codable {
        let prompt: String?
        let completion: String?
    }
}

struct ModelsResponse: Codable {
    let data: [ModelInfo]
}

struct OpenRouterErrorResponse: Codable {
    let error: ErrorDetail

    struct ErrorDetail: Codable {
        let message: String
        let type: String?
        let code: String?
    }
}

// MARK: - OpenRouter Error
enum OpenRouterError: LocalizedError {
    case missingAPIKey
    case invalidResponse
    case httpError(Int)
    case apiError(String)
    case streamingFailed

    var errorDescription: String? {
        switch self {
        case .missingAPIKey:
            return "OpenRouter API key not configured"
        case .invalidResponse:
            return "Invalid response from OpenRouter"
        case .httpError(let code):
            return "HTTP error \(code)"
        case .apiError(let message):
            return message
        case .streamingFailed:
            return "Streaming failed"
        }
    }
}

// MARK: - Keychain Helper
final class KeychainHelper {
    static let shared = KeychainHelper()

    private init() {}

    func save(key: String, value: String) {
        guard let data = value.data(using: .utf8) else { return }

        // Delete existing item first
        delete(key: key)

        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrAccount as String: key,
            kSecValueData as String: data,
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlock
        ]

        SecItemAdd(query as CFDictionary, nil)
    }

    func get(key: String) -> String? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrAccount as String: key,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne
        ]

        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)

        guard status == errSecSuccess,
              let data = result as? Data,
              let value = String(data: data, encoding: .utf8) else {
            return nil
        }

        return value
    }

    func delete(key: String) {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrAccount as String: key
        ]

        SecItemDelete(query as CFDictionary)
    }
}
