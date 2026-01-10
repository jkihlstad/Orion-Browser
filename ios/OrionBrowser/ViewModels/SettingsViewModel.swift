/**
 * SettingsViewModel.swift
 * Business logic for settings management
 */

import SwiftUI
import Combine

@MainActor
final class SettingsViewModel: ObservableObject {
    // MARK: - Published Properties
    @Published var searchEngine: SearchEngine = .google
    @Published var contentBlockersEnabled: Bool = true
    @Published var requestDesktopSite: Bool = false
    @Published var autoPlayVideos: Bool = false
    @Published var blockPopups: Bool = true

    // MARK: - Notification Settings
    @Published var notificationsEnabled: Bool = false
    @Published var aiInsightNotifications: Bool = true
    @Published var downloadNotifications: Bool = true

    // MARK: - Privacy Settings
    @Published var saveHistory: Bool = true
    @Published var allowCookies: Bool = true
    @Published var sendUsageData: Bool = false

    // MARK: - Private Properties
    private let defaults = UserDefaults.standard

    // MARK: - Initialization
    init() {
        loadSettings()
    }

    // MARK: - Load Settings
    func loadSettings() {
        searchEngine = SearchEngine(rawValue: defaults.string(forKey: "searchEngine") ?? "") ?? .google
        contentBlockersEnabled = defaults.bool(forKey: "contentBlockersEnabled")
        requestDesktopSite = defaults.bool(forKey: "requestDesktopSite")
        autoPlayVideos = defaults.bool(forKey: "autoPlayVideos")
        blockPopups = defaults.bool(forKey: "blockPopups")

        notificationsEnabled = defaults.bool(forKey: "notificationsEnabled")
        aiInsightNotifications = defaults.bool(forKey: "aiInsightNotifications")
        downloadNotifications = defaults.bool(forKey: "downloadNotifications")

        saveHistory = defaults.bool(forKey: "saveHistory")
        allowCookies = defaults.bool(forKey: "allowCookies")
        sendUsageData = defaults.bool(forKey: "sendUsageData")
    }

    // MARK: - Save Settings
    func saveSettings() {
        defaults.set(searchEngine.rawValue, forKey: "searchEngine")
        defaults.set(contentBlockersEnabled, forKey: "contentBlockersEnabled")
        defaults.set(requestDesktopSite, forKey: "requestDesktopSite")
        defaults.set(autoPlayVideos, forKey: "autoPlayVideos")
        defaults.set(blockPopups, forKey: "blockPopups")

        defaults.set(notificationsEnabled, forKey: "notificationsEnabled")
        defaults.set(aiInsightNotifications, forKey: "aiInsightNotifications")
        defaults.set(downloadNotifications, forKey: "downloadNotifications")

        defaults.set(saveHistory, forKey: "saveHistory")
        defaults.set(allowCookies, forKey: "allowCookies")
        defaults.set(sendUsageData, forKey: "sendUsageData")
    }

    // MARK: - Reset Settings
    func resetToDefaults() {
        searchEngine = .google
        contentBlockersEnabled = true
        requestDesktopSite = false
        autoPlayVideos = false
        blockPopups = true

        notificationsEnabled = false
        aiInsightNotifications = true
        downloadNotifications = true

        saveHistory = true
        allowCookies = true
        sendUsageData = false

        saveSettings()
    }

    // MARK: - Clear Data
    func clearBrowsingData() async {
        // Clear history
        await ConvexManager.shared.clearTimeline()

        // Clear cookies
        let dataStore = WKWebsiteDataStore.default()
        let dataTypes = WKWebsiteDataStore.allWebsiteDataTypes()
        let date = Date(timeIntervalSince1970: 0)
        await dataStore.removeData(ofTypes: dataTypes, modifiedSince: date)
    }

    func clearCookies() async {
        let dataStore = WKWebsiteDataStore.default()
        let dataTypes: Set<String> = [WKWebsiteDataTypeCookies]
        let date = Date(timeIntervalSince1970: 0)
        await dataStore.removeData(ofTypes: dataTypes, modifiedSince: date)
    }

    func clearCache() async {
        let dataStore = WKWebsiteDataStore.default()
        let dataTypes: Set<String> = [
            WKWebsiteDataTypeDiskCache,
            WKWebsiteDataTypeMemoryCache
        ]
        let date = Date(timeIntervalSince1970: 0)
        await dataStore.removeData(ofTypes: dataTypes, modifiedSince: date)
    }
}

// MARK: - Search Engine
enum SearchEngine: String, CaseIterable {
    case google = "Google"
    case duckduckgo = "DuckDuckGo"
    case bing = "Bing"
    case ecosia = "Ecosia"
    case brave = "Brave"

    var searchURL: String {
        switch self {
        case .google: return "https://www.google.com/search?q="
        case .duckduckgo: return "https://duckduckgo.com/?q="
        case .bing: return "https://www.bing.com/search?q="
        case .ecosia: return "https://www.ecosia.org/search?q="
        case .brave: return "https://search.brave.com/search?q="
        }
    }
}

import WebKit
