/**
 * BrowserTests.swift
 * Unit tests for browser functionality
 */

import XCTest
@testable import OrionBrowser

final class BrowserTests: XCTestCase {
    // MARK: - Setup
    override func setUpWithError() throws {
        // Setup code
    }

    override func tearDownWithError() throws {
        // Cleanup code
    }

    // MARK: - Browser Tab Tests
    func testTabCreation() throws {
        let url = URL(string: "https://example.com")!
        let tab = BrowserTab(url: url, title: "Example")

        XCTAssertEqual(tab.url, url)
        XCTAssertEqual(tab.title, "Example")
        XCTAssertFalse(tab.isLoading)
        XCTAssertFalse(tab.canGoBack)
        XCTAssertFalse(tab.canGoForward)
    }

    func testTabNavigation() throws {
        let initialURL = URL(string: "https://example.com")!
        var tab = BrowserTab(url: initialURL)

        // Navigate to new URL
        let newURL = URL(string: "https://example.com/page2")!
        tab.navigate(to: newURL, title: "Page 2")

        XCTAssertEqual(tab.url, newURL)
        XCTAssertEqual(tab.title, "Page 2")
        XCTAssertEqual(tab.historyStack.count, 1)
    }

    func testTabHistoryNavigation() throws {
        var tab = BrowserTab(url: URL(string: "https://example.com")!)

        // Navigate through multiple pages
        tab.navigate(to: URL(string: "https://example.com/page1")!, title: "Page 1")
        tab.navigate(to: URL(string: "https://example.com/page2")!, title: "Page 2")
        tab.navigate(to: URL(string: "https://example.com/page3")!, title: "Page 3")

        XCTAssertEqual(tab.historyStack.count, 3)

        // Go back
        tab.updateLoadingState(false)
        XCTAssertTrue(tab.canGoBack)

        if let backURL = tab.goBack() {
            XCTAssertEqual(backURL.absoluteString, "https://example.com/page2")
        }
    }

    // MARK: - URL Extension Tests
    func testURLExtensions() throws {
        let url = URL(string: "https://www.example.com/path?query=test")!

        XCTAssertEqual(url.cleanDomain, "example.com")
        XCTAssertTrue(url.isSecure)
        XCTAssertEqual(url.queryParameters?["query"], "test")
    }

    func testSearchURLDetection() throws {
        let googleURL = URL(string: "https://www.google.com/search?q=test")!
        let normalURL = URL(string: "https://example.com")!

        XCTAssertTrue(googleURL.isSearchQuery)
        XCTAssertFalse(normalURL.isSearchQuery)
        XCTAssertEqual(googleURL.searchQuery, "test")
    }

    func testURLCreation() throws {
        // Test URL from string
        XCTAssertNotNil(URL.from("example.com"))
        XCTAssertNotNil(URL.from("https://example.com"))

        // Test search URL creation
        XCTAssertNotNil(URL.searchURL(for: "test query"))
    }

    // MARK: - Performance Tests
    func testTabCreationPerformance() throws {
        measure {
            for _ in 0..<1000 {
                let _ = BrowserTab(url: URL(string: "https://example.com")!)
            }
        }
    }
}
