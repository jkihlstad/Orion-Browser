/**
 * BrowserViewModel.swift
 * Business logic for browser operations
 * SUB-AGENT 1: SwiftUI & UX Architect
 *
 * Enhanced with Neural Intelligence tab activity tracking
 */

import SwiftUI
import Combine

@MainActor
final class BrowserViewModel: ObservableObject {
    // MARK: - Properties
    private weak var appState: AppState?
    private var cancellables = Set<AnyCancellable>()

    @Published var isNavigating: Bool = false
    @Published var searchSuggestions: [String] = []

    // Tab activity tracking
    private var tabOpenTimes: [UUID: Date] = [:]
    private var lastActiveTabId: UUID?
    private var tabSwitchCount: Int = 0

    // MARK: - Setup
    func setup(appState: AppState) {
        self.appState = appState

        // Create initial tab if none exist
        if appState.tabs.isEmpty {
            _ = appState.createTab(url: URL(string: "https://www.google.com")!)
        }
    }

    // MARK: - Navigation
    func navigate(to urlString: String) {
        guard let appState = appState,
              let tabId = appState.activeTabId,
              let index = appState.tabs.firstIndex(where: { $0.id == tabId }),
              let url = URL(string: urlString) else { return }

        isNavigating = true

        // Update tab URL
        appState.tabs[index].url = url
        appState.tabs[index].isLoading = true

        // Record in history
        let entry = HistoryEntry(url: url, title: url.host ?? urlString)
        appState.tabs[index].historyStack.append(entry)
        appState.tabs[index].historyIndex = appState.tabs[index].historyStack.count - 1

        // Log navigation event
        Task {
            await ConvexManager.shared.logBrowsingEvent(
                type: .navigation,
                url: url.absoluteString,
                metadata: ["source": "address_bar"]
            )
        }

        triggerHaptic(.light)
    }

    func goBack() {
        guard let appState = appState,
              let tabId = appState.activeTabId,
              let index = appState.tabs.firstIndex(where: { $0.id == tabId }),
              appState.tabs[index].canGoBack else { return }

        let historyIndex = appState.tabs[index].historyIndex - 1
        if historyIndex >= 0 {
            appState.tabs[index].historyIndex = historyIndex
            appState.tabs[index].url = appState.tabs[index].historyStack[historyIndex].url
        }

        triggerHaptic(.light)
    }

    func goForward() {
        guard let appState = appState,
              let tabId = appState.activeTabId,
              let index = appState.tabs.firstIndex(where: { $0.id == tabId }),
              appState.tabs[index].canGoForward else { return }

        let historyIndex = appState.tabs[index].historyIndex + 1
        if historyIndex < appState.tabs[index].historyStack.count {
            appState.tabs[index].historyIndex = historyIndex
            appState.tabs[index].url = appState.tabs[index].historyStack[historyIndex].url
        }

        triggerHaptic(.light)
    }

    func reload() {
        guard let appState = appState,
              let tabId = appState.activeTabId,
              let index = appState.tabs.firstIndex(where: { $0.id == tabId }) else { return }

        appState.tabs[index].isLoading = true
        // WebView will automatically reload when url is set

        triggerHaptic(.light)
    }

    // MARK: - Navigation State Handling
    func handleNavigationChange(_ state: WebViewNavigationState) {
        guard let appState = appState,
              let tabId = appState.activeTabId,
              let index = appState.tabs.firstIndex(where: { $0.id == tabId }) else { return }

        appState.tabs[index].url = state.url
        appState.tabs[index].title = state.title.isEmpty ? state.url.host ?? "Untitled" : state.title
        appState.tabs[index].canGoBack = state.canGoBack
        appState.tabs[index].canGoForward = state.canGoForward
        appState.tabs[index].isLoading = state.isLoading
        appState.tabs[index].lastActiveAt = Date()

        isNavigating = state.isLoading
    }

    // MARK: - Page Content Processing
    func processPageContent(content: String, metadata: PageMetadata) {
        guard let appState = appState else { return }

        // Only process if user has consented and not in private mode
        guard !appState.isPrivateBrowsing,
              !appState.isKillSwitchActive else { return }

        Task {
            // Send to backend for AI processing
            await ConvexManager.shared.processPageContent(
                content: content,
                title: metadata.title,
                url: metadata.url
            )

            // Update AI activity indicator
            await MainActor.run {
                appState.isAIActive = true

                // Hide after delay
                Task {
                    try? await Task.sleep(nanoseconds: 2_000_000_000)
                    await MainActor.run {
                        appState.isAIActive = false
                    }
                }
            }
        }
    }

    // MARK: - Tab Management
    func createNewTab(url: URL? = nil) {
        guard let appState = appState else { return }
        let newTab = appState.createTab(url: url ?? URL(string: "https://www.google.com")!)

        // Track tab open time
        tabOpenTimes[newTab.id] = Date()

        // Create neural event for tab opened
        Task {
            await trackTabActivity(
                eventType: "tab_opened",
                tabId: newTab.id,
                url: newTab.url.absoluteString,
                tabCount: appState.tabs.count
            )
        }

        triggerHaptic(.medium)
    }

    func closeCurrentTab() {
        guard let appState = appState,
              let tabId = appState.activeTabId else { return }

        closeTab(tabId)
    }

    func closeTab(_ id: UUID) {
        guard let appState = appState else { return }

        // Calculate time active before closing
        let timeActive = tabOpenTimes[id].map { Date().timeIntervalSince($0) }
        let closedTab = appState.tabs.first { $0.id == id }

        // Create neural event for tab closed
        Task {
            await trackTabActivity(
                eventType: "tab_closed",
                tabId: id,
                url: closedTab?.url.absoluteString,
                tabCount: appState.tabs.count - 1,
                timeActive: timeActive
            )
        }

        // Clean up tracking
        tabOpenTimes.removeValue(forKey: id)

        appState.closeTab(id)
        triggerHaptic(.light)
    }

    func switchToTab(_ id: UUID) {
        guard let appState = appState else { return }

        // Calculate time on previous tab
        var timeOnPreviousTab: TimeInterval? = nil
        if let previousTabId = lastActiveTabId,
           let openTime = tabOpenTimes[previousTabId] {
            timeOnPreviousTab = Date().timeIntervalSince(openTime)
        }

        let newTab = appState.tabs.first { $0.id == id }
        tabSwitchCount += 1

        // Create neural event for tab switch
        Task {
            await trackTabActivity(
                eventType: "tab_switched",
                tabId: id,
                url: newTab?.url.absoluteString,
                tabCount: appState.tabs.count,
                previousTabId: lastActiveTabId,
                timeOnPreviousTab: timeOnPreviousTab
            )
        }

        lastActiveTabId = id
        appState.switchToTab(id)
        triggerHaptic(.selection)
    }

    // MARK: - Tab Activity Tracking
    private func trackTabActivity(
        eventType: String,
        tabId: UUID,
        url: String?,
        tabCount: Int,
        previousTabId: UUID? = nil,
        timeOnPreviousTab: TimeInterval? = nil,
        timeActive: TimeInterval? = nil
    ) async {
        // Check consent
        guard await NeuralConsentManager.shared.canCollect(modality: .analytics) else { return }

        var metricsDict: [String: Any] = [
            "tabId": tabId.uuidString,
            "tabCount": tabCount,
            "sessionSwitchCount": tabSwitchCount
        ]

        if let url = url {
            // Only include domain for privacy
            if let urlObj = URL(string: url) {
                metricsDict["domain"] = urlObj.host ?? "unknown"
            }
        }

        if let prevId = previousTabId {
            metricsDict["previousTabId"] = prevId.uuidString
        }

        if let time = timeOnPreviousTab {
            metricsDict["timeOnPreviousTab"] = time
        }

        if let time = timeActive {
            metricsDict["timeActive"] = time
        }

        // Get userId and consentVersion from NeuralIntegrationManager
        let userId = await MainActor.run {
            UserDefaults.standard.string(forKey: "neural_user_id") ?? "anonymous"
        }
        let consentVersion = await NeuralConsentManager.shared.currentConsentVersion

        let event = NeuralEvent(
            userId: userId,
            sourceApp: .browser,
            eventType: eventType,
            modality: .metrics(metricsDict),
            context: EventContext.current(),
            privacyScope: .private,
            consentVersion: consentVersion
        )

        try? await NeuralIngestionClient.shared.enqueue(event)
    }

    // MARK: - Tab Accessors (delegates to AppState)
    var tabs: [BrowserTab] {
        appState?.tabs ?? []
    }

    var activeTabId: UUID? {
        appState?.activeTabId
    }

    func closeAllTabs() {
        appState?.tabs.removeAll()
        createNewTab()
    }

    // MARK: - Bookmarks
    func bookmarkCurrentPage() {
        guard let appState = appState,
              let tab = appState.activeTab else { return }

        Task {
            await ConvexManager.shared.addBookmark(
                url: tab.url.absoluteString,
                title: tab.title
            )
        }

        triggerHaptic(.success)
    }

    // MARK: - Helpers
    private func triggerHaptic(_ style: HapticStyle) {
        let generator: UIFeedbackGenerator

        switch style {
        case .light:
            let impact = UIImpactFeedbackGenerator(style: .light)
            impact.impactOccurred()
            return
        case .medium:
            let impact = UIImpactFeedbackGenerator(style: .medium)
            impact.impactOccurred()
            return
        case .heavy:
            let impact = UIImpactFeedbackGenerator(style: .heavy)
            impact.impactOccurred()
            return
        case .selection:
            let selection = UISelectionFeedbackGenerator()
            selection.selectionChanged()
            return
        case .success:
            let notification = UINotificationFeedbackGenerator()
            notification.notificationOccurred(.success)
            return
        case .error:
            let notification = UINotificationFeedbackGenerator()
            notification.notificationOccurred(.error)
            return
        }
    }

    enum HapticStyle {
        case light, medium, heavy, selection, success, error
    }
}
