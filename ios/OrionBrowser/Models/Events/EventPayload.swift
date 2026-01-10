/**
 * EventPayload.swift
 * Event payload models for data collection
 */

import Foundation

// MARK: - Base Event Payload
protocol EventPayloadProtocol: Codable {
    var eventType: EventType { get }
    var timestamp: Date { get }
}

// MARK: - Event Type
enum EventType: String, Codable {
    case pageView
    case pageContent
    case scrollDepth
    case click
    case search
    case tabCreate
    case tabClose
    case bookmark
    case download
    case mediaCapture
    case aiQuery
    case aiResponse
}

// MARK: - Page View Payload
struct PageViewPayload: EventPayloadProtocol {
    let eventType: EventType = .pageView
    let timestamp: Date
    let url: String
    let title: String
    let referrer: String?
    let loadTime: TimeInterval?
    let isSecure: Bool

    init(url: String, title: String, referrer: String? = nil, loadTime: TimeInterval? = nil, isSecure: Bool = false) {
        self.timestamp = Date()
        self.url = url
        self.title = title
        self.referrer = referrer
        self.loadTime = loadTime
        self.isSecure = isSecure
    }
}

// MARK: - Page Content Payload
struct PageContentPayload: EventPayloadProtocol {
    let eventType: EventType = .pageContent
    let timestamp: Date
    let url: String
    let content: String
    let wordCount: Int
    let language: String?
    let keywords: [String]

    init(url: String, content: String, language: String? = nil, keywords: [String] = []) {
        self.timestamp = Date()
        self.url = url
        self.content = String(content.prefix(10000))
        self.wordCount = content.split(separator: " ").count
        self.language = language
        self.keywords = keywords
    }
}

// MARK: - Scroll Depth Payload
struct ScrollDepthPayload: EventPayloadProtocol {
    let eventType: EventType = .scrollDepth
    let timestamp: Date
    let url: String
    let maxDepth: Double // 0.0 to 1.0
    let timeOnPage: TimeInterval
    let scrollEvents: Int

    init(url: String, maxDepth: Double, timeOnPage: TimeInterval, scrollEvents: Int) {
        self.timestamp = Date()
        self.url = url
        self.maxDepth = min(1.0, max(0.0, maxDepth))
        self.timeOnPage = timeOnPage
        self.scrollEvents = scrollEvents
    }
}

// MARK: - Click Payload
struct ClickPayload: EventPayloadProtocol {
    let eventType: EventType = .click
    let timestamp: Date
    let url: String
    let elementType: String
    let elementText: String?
    let elementHref: String?
    let position: ClickPosition?

    struct ClickPosition: Codable {
        let x: Double
        let y: Double
    }

    init(url: String, elementType: String, elementText: String? = nil, elementHref: String? = nil, position: ClickPosition? = nil) {
        self.timestamp = Date()
        self.url = url
        self.elementType = elementType
        self.elementText = elementText
        self.elementHref = elementHref
        self.position = position
    }
}

// MARK: - Search Payload
struct SearchPayload: EventPayloadProtocol {
    let eventType: EventType = .search
    let timestamp: Date
    let query: String
    let source: SearchSource
    let resultsCount: Int?

    enum SearchSource: String, Codable {
        case addressBar
        case searchEngine
        case inPage
        case ai
    }

    init(query: String, source: SearchSource, resultsCount: Int? = nil) {
        self.timestamp = Date()
        self.query = query
        self.source = source
        self.resultsCount = resultsCount
    }
}

// MARK: - Tab Payload
struct TabPayload: EventPayloadProtocol {
    let eventType: EventType
    let timestamp: Date
    let tabId: UUID
    let url: String?
    let title: String?
    let tabCount: Int

    init(type: EventType, tabId: UUID, url: String? = nil, title: String? = nil, tabCount: Int) {
        self.eventType = type
        self.timestamp = Date()
        self.tabId = tabId
        self.url = url
        self.title = title
        self.tabCount = tabCount
    }
}

// MARK: - AI Query Payload
struct AIQueryPayload: EventPayloadProtocol {
    let eventType: EventType = .aiQuery
    let timestamp: Date
    let query: String
    let contextURL: String?
    let queryType: QueryType

    enum QueryType: String, Codable {
        case search
        case summarize
        case analyze
        case followUp
    }

    init(query: String, contextURL: String? = nil, queryType: QueryType) {
        self.timestamp = Date()
        self.query = query
        self.contextURL = contextURL
        self.queryType = queryType
    }
}

// MARK: - AI Response Payload
struct AIResponsePayload: EventPayloadProtocol {
    let eventType: EventType = .aiResponse
    let timestamp: Date
    let queryId: UUID
    let responseLength: Int
    let citationsCount: Int
    let latency: TimeInterval
    let wasStreamed: Bool

    init(queryId: UUID, responseLength: Int, citationsCount: Int, latency: TimeInterval, wasStreamed: Bool) {
        self.timestamp = Date()
        self.queryId = queryId
        self.responseLength = responseLength
        self.citationsCount = citationsCount
        self.latency = latency
        self.wasStreamed = wasStreamed
    }
}
