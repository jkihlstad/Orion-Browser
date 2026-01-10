/**
 * IngestionTests.swift
 * Unit tests for data ingestion functionality
 */

import XCTest
@testable import OrionBrowser

final class IngestionTests: XCTestCase {
    // MARK: - Setup
    override func setUpWithError() throws {
        // Setup code
    }

    override func tearDownWithError() throws {
        // Cleanup code
    }

    // MARK: - Event Payload Tests
    func testPageViewPayload() throws {
        let payload = PageViewPayload(
            url: "https://example.com",
            title: "Example Page",
            referrer: "https://google.com",
            loadTime: 1.5,
            isSecure: true
        )

        XCTAssertEqual(payload.eventType, .pageView)
        XCTAssertEqual(payload.url, "https://example.com")
        XCTAssertTrue(payload.isSecure)
        XCTAssertNotNil(payload.timestamp)
    }

    func testPageContentPayload() throws {
        let longContent = String(repeating: "word ", count: 5000)
        let payload = PageContentPayload(
            url: "https://example.com",
            content: longContent,
            language: "en",
            keywords: ["test", "example"]
        )

        XCTAssertEqual(payload.eventType, .pageContent)
        XCTAssertLessThanOrEqual(payload.content.count, 10000)
        XCTAssertGreaterThan(payload.wordCount, 0)
    }

    func testScrollDepthPayload() throws {
        let payload = ScrollDepthPayload(
            url: "https://example.com",
            maxDepth: 0.75,
            timeOnPage: 120,
            scrollEvents: 15
        )

        XCTAssertEqual(payload.eventType, .scrollDepth)
        XCTAssertEqual(payload.maxDepth, 0.75)
    }

    func testScrollDepthClamping() throws {
        let overflowPayload = ScrollDepthPayload(
            url: "https://example.com",
            maxDepth: 1.5,
            timeOnPage: 60,
            scrollEvents: 10
        )
        XCTAssertEqual(overflowPayload.maxDepth, 1.0)

        let underflowPayload = ScrollDepthPayload(
            url: "https://example.com",
            maxDepth: -0.5,
            timeOnPage: 60,
            scrollEvents: 10
        )
        XCTAssertEqual(underflowPayload.maxDepth, 0.0)
    }

    func testSearchPayload() throws {
        let payload = SearchPayload(
            query: "test search",
            source: .addressBar,
            resultsCount: 10
        )

        XCTAssertEqual(payload.eventType, .search)
        XCTAssertEqual(payload.source, .addressBar)
    }

    // MARK: - Event Context Tests
    func testDeviceContext() throws {
        let context = DeviceContext.current

        XCTAssertFalse(context.model.isEmpty)
        XCTAssertFalse(context.osVersion.isEmpty)
        XCTAssertGreaterThan(context.screenWidth, 0)
        XCTAssertGreaterThan(context.screenHeight, 0)
    }

    func testAppContext() throws {
        let context = AppContext.current

        XCTAssertFalse(context.version.isEmpty)
        XCTAssertFalse(context.bundleId.isEmpty)
    }

    func testSessionContext() throws {
        var session = SessionContext()

        XCTAssertEqual(session.eventCount, 0)
        XCTAssertEqual(session.pageViews, 0)

        session.recordEvent(type: .pageView)
        XCTAssertEqual(session.eventCount, 1)
        XCTAssertEqual(session.pageViews, 1)

        session.recordEvent(type: .aiQuery)
        XCTAssertEqual(session.eventCount, 2)
        XCTAssertEqual(session.aiQueries, 1)
    }

    // MARK: - Extended Metadata Tests
    func testExtendedPageMetadata() throws {
        let metadata = ExtendedPageMetadata(
            url: "https://example.com/article",
            title: "Test Article",
            description: "This is a test article",
            keywords: ["test", "article"],
            author: "Test Author",
            ogTitle: "OG Title",
            ogDescription: "OG Description",
            wordCount: 500,
            readingTime: 3,
            hasVideo: false,
            hasAudio: false,
            links: [],
            headings: [
                PageHeading(level: 1, text: "Main Title"),
                PageHeading(level: 2, text: "Subtitle")
            ]
        )

        XCTAssertEqual(metadata.displayTitle, "OG Title")
        XCTAssertEqual(metadata.displayDescription, "OG Description")
        XCTAssertTrue(metadata.isArticle)
        XCTAssertEqual(metadata.headings.count, 2)
    }

    // MARK: - Debouncer Tests
    func testDebouncer() throws {
        let expectation = XCTestExpectation(description: "Debounce")
        var callCount = 0

        let debouncer = Debouncer(delay: 0.1)

        // Rapid calls
        for _ in 0..<5 {
            debouncer.debounce {
                callCount += 1
            }
        }

        DispatchQueue.main.asyncAfter(deadline: .now() + 0.2) {
            XCTAssertEqual(callCount, 1)
            expectation.fulfill()
        }

        wait(for: [expectation], timeout: 1.0)
    }

    func testThrottler() throws {
        let expectation = XCTestExpectation(description: "Throttle")
        var callCount = 0

        let throttler = Throttler(interval: 0.1)

        // Rapid calls
        for _ in 0..<5 {
            throttler.throttle {
                callCount += 1
            }
        }

        DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
            // Should have at least 1 call (leading) and possibly trailing
            XCTAssertGreaterThanOrEqual(callCount, 1)
            expectation.fulfill()
        }

        wait(for: [expectation], timeout: 1.0)
    }

    // MARK: - Date Formatting Tests
    func testDateFormatting() throws {
        let date = Date()

        XCTAssertFalse(date.shortDateString.isEmpty)
        XCTAssertFalse(date.mediumDateString.isEmpty)
        XCTAssertFalse(date.relativeString.isEmpty)
        XCTAssertFalse(date.smartString.isEmpty)
    }

    func testTimeIntervalFormatting() throws {
        let shortDuration: TimeInterval = 45 // 45 seconds
        XCTAssertEqual(shortDuration.durationString, "45s")

        let mediumDuration: TimeInterval = 125 // 2 min 5 sec
        XCTAssertEqual(mediumDuration.durationString, "2m 5s")

        let longDuration: TimeInterval = 7500 // 2 hours 5 min
        XCTAssertEqual(longDuration.durationString, "2h 5m")
    }
}
