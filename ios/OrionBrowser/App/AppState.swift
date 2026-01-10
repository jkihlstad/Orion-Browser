/**
 * AppState.swift
 * Global application state management
 */

import SwiftUI
import Combine

@MainActor
final class AppState: ObservableObject {
    // MARK: - App Lifecycle
    @Published var isInitialized: Bool = false
    @Published var hasCompletedOnboarding: Bool = UserDefaults.standard.bool(forKey: "hasCompletedOnboarding")

    // MARK: - Appearance
    @Published var colorScheme: ColorScheme? = nil
    @Published var useDarkMode: Bool = UserDefaults.standard.bool(forKey: "useDarkMode") {
        didSet {
            UserDefaults.standard.set(useDarkMode, forKey: "useDarkMode")
            colorScheme = useDarkMode ? .dark : .light
        }
    }

    // MARK: - Privacy
    @Published var isPrivateBrowsing: Bool = false
    @Published var isKillSwitchActive: Bool = false
    @Published var isSafeModeActive: Bool = false

    // MARK: - AI State
    @Published var aiLevel: Configuration.AILevel = .advisory
    @Published var isAIActive: Bool = false
    @Published var pendingApprovals: Int = 0

    // MARK: - Network
    @Published var isOnline: Bool = true
    @Published var networkType: NetworkType = .unknown

    enum NetworkType {
        case wifi, cellular, ethernet, unknown
    }

    // MARK: - System Resources
    @Published var batteryLevel: Float = 1.0
    @Published var isLowPowerMode: Bool = false
    @Published var thermalState: ProcessInfo.ThermalState = .nominal

    // MARK: - Tabs
    @Published var tabs: [BrowserTab] = []
    @Published var activeTabId: UUID?

    var activeTab: BrowserTab? {
        guard let id = activeTabId else { return nil }
        return tabs.first { $0.id == id }
    }

    var tabCount: Int { tabs.count }

    // MARK: - Initialization
    init() {
        setupSystemMonitoring()
        loadPersistedState()
    }

    private func setupSystemMonitoring() {
        // Monitor battery
        UIDevice.current.isBatteryMonitoringEnabled = true
        NotificationCenter.default.addObserver(
            forName: UIDevice.batteryLevelDidChangeNotification,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            self?.batteryLevel = UIDevice.current.batteryLevel
        }

        // Monitor low power mode
        NotificationCenter.default.addObserver(
            forName: .NSProcessInfoPowerStateDidChange,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            self?.isLowPowerMode = ProcessInfo.processInfo.isLowPowerModeEnabled
        }

        // Monitor thermal state
        NotificationCenter.default.addObserver(
            forName: ProcessInfo.thermalStateDidChangeNotification,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            self?.thermalState = ProcessInfo.processInfo.thermalState
        }
    }

    private func loadPersistedState() {
        // Load persisted tabs if not in private mode
        if let data = UserDefaults.standard.data(forKey: "persistedTabs"),
           let tabs = try? JSONDecoder().decode([BrowserTab].self, from: data) {
            self.tabs = tabs
            self.activeTabId = tabs.first?.id
        }
    }

    // MARK: - Tab Management
    func createTab(url: URL? = nil) -> BrowserTab {
        let tab = BrowserTab(url: url ?? URL(string: "about:blank")!)
        tabs.append(tab)
        activeTabId = tab.id
        persistTabs()
        return tab
    }

    func closeTab(_ id: UUID) {
        tabs.removeAll { $0.id == id }
        if activeTabId == id {
            activeTabId = tabs.last?.id
        }
        persistTabs()
    }

    func switchToTab(_ id: UUID) {
        if tabs.contains(where: { $0.id == id }) {
            activeTabId = id
        }
    }

    private func persistTabs() {
        guard !isPrivateBrowsing else { return }
        if let data = try? JSONEncoder().encode(tabs) {
            UserDefaults.standard.set(data, forKey: "persistedTabs")
        }
    }

    // MARK: - Onboarding
    func completeOnboarding() {
        hasCompletedOnboarding = true
        UserDefaults.standard.set(true, forKey: "hasCompletedOnboarding")
    }

    // MARK: - Safety Controls
    func activateKillSwitch(reason: String) {
        isKillSwitchActive = true
        isAIActive = false
        // Log to audit
        Task {
            await ConvexManager.shared.logAuditEvent(
                action: "kill_switch_activated",
                details: ["reason": reason]
            )
        }
    }

    func deactivateKillSwitch() {
        isKillSwitchActive = false
    }

    func activateSafeMode(reason: String) {
        isSafeModeActive = true
        aiLevel = .passive
    }

    func deactivateSafeMode() {
        isSafeModeActive = false
    }
}
