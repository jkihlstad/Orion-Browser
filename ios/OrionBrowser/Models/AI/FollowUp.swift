/**
 * FollowUp.swift
 * Follow-up questions for AI answers
 */

import Foundation

struct FollowUp: Identifiable, Codable, Equatable {
    let id: UUID
    let text: String
    let type: FollowUpType

    // MARK: - Follow-Up Type
    enum FollowUpType: String, Codable {
        case deepDive
        case comparison
        case example
        case clarification
        case related

        var displayName: String {
            switch self {
            case .deepDive: return "Deep Dive"
            case .comparison: return "Compare"
            case .example: return "Example"
            case .clarification: return "Clarify"
            case .related: return "Related"
            }
        }

        var icon: String {
            switch self {
            case .deepDive: return "arrow.down.right.circle"
            case .comparison: return "arrow.left.arrow.right"
            case .example: return "doc.text"
            case .clarification: return "questionmark.circle"
            case .related: return "link"
            }
        }
    }

    // MARK: - Initialization
    init(id: UUID = UUID(), text: String, type: FollowUpType) {
        self.id = id
        self.text = text
        self.type = type
    }
}

// MARK: - Suggested Follow-Ups
struct SuggestedFollowUps {
    /// Generate follow-up questions based on answer content
    static func generate(from answer: AIAnswer) -> [FollowUp] {
        var suggestions: [FollowUp] = []

        // Deep dive suggestion
        suggestions.append(FollowUp(
            text: "Can you explain this in more detail?",
            type: .deepDive
        ))

        // Example suggestion
        suggestions.append(FollowUp(
            text: "Can you give me a specific example?",
            type: .example
        ))

        // Clarification if answer is complex
        if answer.wordCount > 200 {
            suggestions.append(FollowUp(
                text: "Can you summarize the key points?",
                type: .clarification
            ))
        }

        // Related topics
        suggestions.append(FollowUp(
            text: "What related topics should I know about?",
            type: .related
        ))

        return suggestions
    }

    /// Generate comparison questions
    static func generateComparison(topic1: String, topic2: String) -> FollowUp {
        FollowUp(
            text: "How does \(topic1) compare to \(topic2)?",
            type: .comparison
        )
    }
}

// MARK: - Follow-Up Selection History
struct FollowUpHistory: Codable {
    var selectedFollowUps: [SelectedFollowUp] = []

    struct SelectedFollowUp: Codable {
        let followUp: FollowUp
        let originalAnswerId: UUID
        let selectedAt: Date
    }

    mutating func record(_ followUp: FollowUp, for answerId: UUID) {
        let selected = SelectedFollowUp(
            followUp: followUp,
            originalAnswerId: answerId,
            selectedAt: Date()
        )
        selectedFollowUps.append(selected)

        // Keep last 100
        if selectedFollowUps.count > 100 {
            selectedFollowUps.removeFirst(selectedFollowUps.count - 100)
        }
    }

    /// Most frequently used follow-up types
    var frequentTypes: [FollowUp.FollowUpType] {
        let counts = Dictionary(grouping: selectedFollowUps, by: \.followUp.type)
            .mapValues(\.count)
        return counts.sorted { $0.value > $1.value }.map(\.key)
    }
}
