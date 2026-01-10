/**
 * AIAnswer.swift
 * AI-generated answer model
 */

import Foundation

struct AIAnswer: Identifiable, Codable {
    let id: UUID
    var content: String
    var citations: [Citation]
    var followUps: [FollowUp]
    let createdAt: Date
    let query: String

    // MARK: - Computed Properties
    var wordCount: Int {
        content.split(separator: " ").count
    }

    var estimatedReadingTime: Int {
        max(1, wordCount / 200)
    }

    var hasCitations: Bool {
        !citations.isEmpty
    }

    var hasFollowUps: Bool {
        !followUps.isEmpty
    }

    // MARK: - Initialization
    init(
        id: UUID = UUID(),
        content: String,
        citations: [Citation] = [],
        followUps: [FollowUp] = [],
        createdAt: Date = Date(),
        query: String
    ) {
        self.id = id
        self.content = content
        self.citations = citations
        self.followUps = followUps
        self.createdAt = createdAt
        self.query = query
    }
}

// MARK: - AI Conversation
struct AIConversation: Identifiable, Codable {
    let id: UUID
    var messages: [ConversationMessage]
    let createdAt: Date
    var updatedAt: Date

    struct ConversationMessage: Identifiable, Codable {
        let id: UUID
        let role: MessageRole
        let content: String
        let timestamp: Date
        var citations: [Citation]?

        enum MessageRole: String, Codable {
            case user
            case assistant
        }
    }

    init() {
        self.id = UUID()
        self.messages = []
        self.createdAt = Date()
        self.updatedAt = Date()
    }

    mutating func addUserMessage(_ content: String) {
        let message = ConversationMessage(
            id: UUID(),
            role: .user,
            content: content,
            timestamp: Date(),
            citations: nil
        )
        messages.append(message)
        updatedAt = Date()
    }

    mutating func addAssistantMessage(_ content: String, citations: [Citation]? = nil) {
        let message = ConversationMessage(
            id: UUID(),
            role: .assistant,
            content: content,
            timestamp: Date(),
            citations: citations
        )
        messages.append(message)
        updatedAt = Date()
    }
}

// MARK: - AI Response Status
enum AIResponseStatus: String, Codable {
    case pending
    case streaming
    case completed
    case failed
    case cancelled
}

// MARK: - AI Error
enum AIError: LocalizedError {
    case noResponse
    case streamingFailed
    case invalidQuery
    case quotaExceeded
    case networkError

    var errorDescription: String? {
        switch self {
        case .noResponse: return "No response from AI"
        case .streamingFailed: return "Streaming failed"
        case .invalidQuery: return "Invalid query"
        case .quotaExceeded: return "AI quota exceeded"
        case .networkError: return "Network error"
        }
    }
}
