/**
 * BrowserTab.swift
 * Browser tab model
 */

import Foundation

struct BrowserTab: Identifiable, Codable, Equatable {
    let id: UUID
    var url: URL
    var title: String
    var favicon: URL?
    var isLoading: Bool
    var canGoBack: Bool
    var canGoForward: Bool
    var progress: Double
    var isSuspended: Bool
    var lastActiveAt: Date
    let createdAt: Date
    var historyStack: [HistoryEntry]
    var historyIndex: Int
    var isReaderMode: Bool
    var userAgent: UserAgentType
    var screenshot: Data?

    // MARK: - User Agent Type
    enum UserAgentType: String, Codable {
        case mobile
        case desktop

        var userAgentString: String {
            switch self {
            case .mobile:
                return "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) OrionBrowser/1.0 Mobile/15E148 Safari/604.1"
            case .desktop:
                return "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) OrionBrowser/1.0 Safari/605.1.15"
            }
        }
    }

    // MARK: - Computed Properties
    var displayTitle: String {
        title.isEmpty ? url.host ?? "New Tab" : title
    }

    var isSecure: Bool {
        url.scheme == "https"
    }

    var domain: String {
        url.host ?? ""
    }

    var canNavigate: Bool {
        canGoBack || canGoForward
    }

    // MARK: - Initialization
    init(
        url: URL,
        title: String? = nil
    ) {
        self.id = UUID()
        self.url = url
        self.title = title ?? url.host ?? "New Tab"
        self.favicon = nil
        self.isLoading = false
        self.canGoBack = false
        self.canGoForward = false
        self.progress = 0
        self.isSuspended = false
        self.lastActiveAt = Date()
        self.createdAt = Date()
        self.historyStack = []
        self.historyIndex = -1
        self.isReaderMode = false
        self.userAgent = .mobile
        self.screenshot = nil
    }

    // MARK: - History Navigation
    mutating func goBack() -> URL? {
        guard canGoBack, historyIndex > 0 else { return nil }
        historyIndex -= 1
        return historyStack[historyIndex].url
    }

    mutating func goForward() -> URL? {
        guard canGoForward, historyIndex < historyStack.count - 1 else { return nil }
        historyIndex += 1
        return historyStack[historyIndex].url
    }

    mutating func navigate(to newURL: URL, title: String = "") {
        // Remove forward history
        if historyIndex < historyStack.count - 1 {
            historyStack.removeLast(historyStack.count - historyIndex - 1)
        }

        // Add new entry
        let entry = HistoryEntry(url: newURL, title: title)
        historyStack.append(entry)
        historyIndex = historyStack.count - 1

        // Update state
        url = newURL
        self.title = title.isEmpty ? newURL.host ?? "Untitled" : title
        isLoading = true
        lastActiveAt = Date()
    }

    mutating func updateLoadingState(_ loading: Bool, progress: Double = 0) {
        isLoading = loading
        self.progress = progress
        if !loading {
            canGoBack = historyIndex > 0
            canGoForward = historyIndex < historyStack.count - 1
        }
    }
}

// MARK: - History Entry
struct HistoryEntry: Identifiable, Codable, Equatable {
    let id: UUID
    let url: URL
    let title: String
    let timestamp: Date
    var scrollPosition: CGFloat

    init(url: URL, title: String, scrollPosition: CGFloat = 0) {
        self.id = UUID()
        self.url = url
        self.title = title
        self.timestamp = Date()
        self.scrollPosition = scrollPosition
    }
}

// MARK: - Tab Group
struct TabGroup: Identifiable, Codable {
    let id: UUID
    var name: String
    var tabIds: [UUID]
    var color: String
    let createdAt: Date

    init(name: String, tabIds: [UUID] = [], color: String = "blue") {
        self.id = UUID()
        self.name = name
        self.tabIds = tabIds
        self.color = color
        self.createdAt = Date()
    }

    var count: Int { tabIds.count }

    mutating func addTab(_ tabId: UUID) {
        if !tabIds.contains(tabId) {
            tabIds.append(tabId)
        }
    }

    mutating func removeTab(_ tabId: UUID) {
        tabIds.removeAll { $0 == tabId }
    }
}
