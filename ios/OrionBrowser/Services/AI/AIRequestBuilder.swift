/**
 * AIRequestBuilder.swift
 * Builds AI requests with context and parameters
 */

import Foundation

struct AIRequestBuilder {
    // MARK: - Request Types
    enum RequestType {
        case search(query: String)
        case analyze(content: String)
        case summarize(url: String)
        case followUp(question: String, previousAnswer: AIAnswer)
    }

    // MARK: - Build Request
    static func build(
        type: RequestType,
        context: BrowsingContext? = nil,
        options: RequestOptions = .default
    ) -> AIRequest {
        switch type {
        case .search(let query):
            return buildSearchRequest(query: query, context: context, options: options)

        case .analyze(let content):
            return buildAnalyzeRequest(content: content, context: context, options: options)

        case .summarize(let url):
            return buildSummarizeRequest(url: url, context: context, options: options)

        case .followUp(let question, let previousAnswer):
            return buildFollowUpRequest(question: question, previousAnswer: previousAnswer, options: options)
        }
    }

    // MARK: - Search Request
    private static func buildSearchRequest(
        query: String,
        context: BrowsingContext?,
        options: RequestOptions
    ) -> AIRequest {
        AIRequest(
            type: "search",
            query: query,
            context: context.map { RequestContext(from: $0) },
            options: options,
            metadata: RequestMetadata()
        )
    }

    // MARK: - Analyze Request
    private static func buildAnalyzeRequest(
        content: String,
        context: BrowsingContext?,
        options: RequestOptions
    ) -> AIRequest {
        AIRequest(
            type: "analyze",
            query: nil,
            content: content,
            context: context.map { RequestContext(from: $0) },
            options: options,
            metadata: RequestMetadata()
        )
    }

    // MARK: - Summarize Request
    private static func buildSummarizeRequest(
        url: String,
        context: BrowsingContext?,
        options: RequestOptions
    ) -> AIRequest {
        AIRequest(
            type: "summarize",
            query: nil,
            url: url,
            context: context.map { RequestContext(from: $0) },
            options: options,
            metadata: RequestMetadata()
        )
    }

    // MARK: - Follow-Up Request
    private static func buildFollowUpRequest(
        question: String,
        previousAnswer: AIAnswer,
        options: RequestOptions
    ) -> AIRequest {
        AIRequest(
            type: "followup",
            query: question,
            previousAnswerId: previousAnswer.id.uuidString,
            options: options,
            metadata: RequestMetadata()
        )
    }
}

// MARK: - AI Request
struct AIRequest: Encodable {
    let type: String
    var query: String?
    var content: String?
    var url: String?
    var previousAnswerId: String?
    var context: RequestContext?
    let options: RequestOptions
    let metadata: RequestMetadata
}

// MARK: - Request Context
struct RequestContext: Encodable {
    let currentURL: String?
    let pageTitle: String?
    let recentURLs: [String]
    let sessionDuration: TimeInterval

    init(from context: BrowsingContext) {
        self.currentURL = context.currentURL?.absoluteString
        self.pageTitle = context.pageTitle
        self.recentURLs = context.recentURLs.map(\.absoluteString)
        self.sessionDuration = context.sessionDuration
    }
}

// MARK: - Request Options
struct RequestOptions: Encodable {
    let maxTokens: Int
    let temperature: Double
    let includeSources: Bool
    let includeFollowUps: Bool
    let responseFormat: ResponseFormat

    static let `default` = RequestOptions(
        maxTokens: 2000,
        temperature: 0.7,
        includeSources: true,
        includeFollowUps: true,
        responseFormat: .streaming
    )

    static let concise = RequestOptions(
        maxTokens: 500,
        temperature: 0.5,
        includeSources: true,
        includeFollowUps: false,
        responseFormat: .streaming
    )

    static let detailed = RequestOptions(
        maxTokens: 4000,
        temperature: 0.8,
        includeSources: true,
        includeFollowUps: true,
        responseFormat: .streaming
    )

    enum ResponseFormat: String, Encodable {
        case streaming
        case complete
    }
}

// MARK: - Request Metadata
struct RequestMetadata: Encodable {
    let timestamp: Date
    let deviceId: String
    let appVersion: String
    let platform: String

    init() {
        self.timestamp = Date()
        self.deviceId = UIDevice.current.identifierForVendor?.uuidString ?? "unknown"
        self.appVersion = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "1.0"
        self.platform = "ios"
    }
}

// MARK: - Browsing Context
struct BrowsingContext {
    let currentURL: URL?
    let pageTitle: String?
    let recentURLs: [URL]
    let sessionDuration: TimeInterval
}

import UIKit
