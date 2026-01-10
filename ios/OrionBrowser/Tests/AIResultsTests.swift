/**
 * AIResultsTests.swift
 * Unit tests for AI results functionality
 */

import XCTest
@testable import OrionBrowser

final class AIResultsTests: XCTestCase {
    // MARK: - Setup
    override func setUpWithError() throws {
        // Setup code
    }

    override func tearDownWithError() throws {
        // Cleanup code
    }

    // MARK: - AI Answer Tests
    func testAIAnswerCreation() throws {
        let answer = AIAnswer(
            content: "This is a test answer with multiple words.",
            query: "Test query"
        )

        XCTAssertFalse(answer.content.isEmpty)
        XCTAssertGreaterThan(answer.wordCount, 0)
        XCTAssertFalse(answer.hasCitations)
        XCTAssertFalse(answer.hasFollowUps)
    }

    func testAIAnswerWithCitations() throws {
        let citations = [
            Citation(
                url: "https://example.com",
                title: "Example Source",
                snippet: "Example snippet",
                domain: "example.com",
                relevanceScore: 0.9
            )
        ]

        let answer = AIAnswer(
            content: "Test answer",
            citations: citations,
            query: "Test"
        )

        XCTAssertTrue(answer.hasCitations)
        XCTAssertEqual(answer.citations.count, 1)
    }

    func testReadingTimeCalculation() throws {
        // Short answer
        let shortAnswer = AIAnswer(
            content: "Short answer.",
            query: "Test"
        )
        XCTAssertEqual(shortAnswer.estimatedReadingTime, 1)

        // Long answer (200+ words)
        let longContent = String(repeating: "word ", count: 500)
        let longAnswer = AIAnswer(
            content: longContent,
            query: "Test"
        )
        XCTAssertGreaterThan(longAnswer.estimatedReadingTime, 1)
    }

    // MARK: - Citation Tests
    func testCitationCreation() throws {
        let citation = Citation(
            url: "https://www.example.com/article",
            title: "Example Article",
            snippet: "This is a snippet",
            domain: "example.com",
            relevanceScore: 0.85
        )

        XCTAssertEqual(citation.displayURL, "www.example.com/article")
        XCTAssertTrue(citation.isHighRelevance)
        XCTAssertEqual(citation.relevanceLabel, "High")
    }

    func testCitationRelevanceScoreClamping() throws {
        // Test score above 1.0
        let highCitation = Citation(
            url: "https://example.com",
            title: "Test",
            snippet: "",
            domain: "example.com",
            relevanceScore: 1.5
        )
        XCTAssertEqual(highCitation.relevanceScore, 1.0)

        // Test score below 0.0
        let lowCitation = Citation(
            url: "https://example.com",
            title: "Test",
            snippet: "",
            domain: "example.com",
            relevanceScore: -0.5
        )
        XCTAssertEqual(lowCitation.relevanceScore, 0.0)
    }

    func testCitationGrouping() throws {
        let citations = [
            Citation(url: "https://a.com/1", title: "A1", snippet: "", domain: "a.com", relevanceScore: 0.9),
            Citation(url: "https://a.com/2", title: "A2", snippet: "", domain: "a.com", relevanceScore: 0.8),
            Citation(url: "https://b.com/1", title: "B1", snippet: "", domain: "b.com", relevanceScore: 0.7)
        ]

        let grouped = citations.groupedByDomain
        XCTAssertEqual(grouped.count, 2)
    }

    func testTopCitations() throws {
        let citations = [
            Citation(url: "https://a.com", title: "A", snippet: "", domain: "a.com", relevanceScore: 0.5),
            Citation(url: "https://b.com", title: "B", snippet: "", domain: "b.com", relevanceScore: 0.9),
            Citation(url: "https://c.com", title: "C", snippet: "", domain: "c.com", relevanceScore: 0.7)
        ]

        let top2 = citations.top(2)
        XCTAssertEqual(top2.count, 2)
        XCTAssertEqual(top2.first?.domain, "b.com")
    }

    // MARK: - Follow-Up Tests
    func testFollowUpCreation() throws {
        let followUp = FollowUp(
            text: "Can you explain more?",
            type: .deepDive
        )

        XCTAssertEqual(followUp.type, .deepDive)
        XCTAssertEqual(followUp.type.displayName, "Deep Dive")
    }

    func testSuggestedFollowUps() throws {
        let answer = AIAnswer(
            content: String(repeating: "word ", count: 300),
            query: "Complex topic"
        )

        let suggestions = SuggestedFollowUps.generate(from: answer)
        XCTAssertGreaterThan(suggestions.count, 0)
    }

    // MARK: - Conversation Tests
    func testConversationFlow() throws {
        var conversation = AIConversation()

        conversation.addUserMessage("What is Swift?")
        XCTAssertEqual(conversation.messages.count, 1)
        XCTAssertEqual(conversation.messages.first?.role, .user)

        conversation.addAssistantMessage("Swift is a programming language.")
        XCTAssertEqual(conversation.messages.count, 2)
        XCTAssertEqual(conversation.messages.last?.role, .assistant)
    }
}
