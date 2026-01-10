/**
 * EventContext.swift
 * Context information for browser/session events
 * NOTE: This is BrowserEventContext to avoid conflict with EventContext in NeuralEvent.swift
 */

import Foundation
import UIKit

// MARK: - Browser Event Context (renamed to avoid conflict with NeuralEvent.EventContext)
struct BrowserEventContext: Codable {
    let sessionId: UUID
    let userId: String?
    let device: DeviceContext
    let app: AppContext
    let timestamp: Date

    init(
        sessionId: UUID,
        userId: String? = nil,
        device: DeviceContext = .current,
        app: AppContext = .current
    ) {
        self.sessionId = sessionId
        self.userId = userId
        self.device = device
        self.app = app
        self.timestamp = Date()
    }
}

// MARK: - Device Context
struct DeviceContext: Codable {
    let model: String
    let osVersion: String
    let screenWidth: Int
    let screenHeight: Int
    let language: String
    let timezone: String
    let isLowPowerMode: Bool

    static var current: DeviceContext {
        let screen = UIScreen.main.bounds
        return DeviceContext(
            model: UIDevice.current.model,
            osVersion: UIDevice.current.systemVersion,
            screenWidth: Int(screen.width),
            screenHeight: Int(screen.height),
            language: Locale.current.language.languageCode?.identifier ?? "en",
            timezone: TimeZone.current.identifier,
            isLowPowerMode: ProcessInfo.processInfo.isLowPowerModeEnabled
        )
    }
}

// MARK: - App Context
struct AppContext: Codable {
    let version: String
    let build: String
    let bundleId: String
    let isDebug: Bool

    static var current: AppContext {
        let info = Bundle.main.infoDictionary ?? [:]
        return AppContext(
            version: info["CFBundleShortVersionString"] as? String ?? "1.0",
            build: info["CFBundleVersion"] as? String ?? "1",
            bundleId: Bundle.main.bundleIdentifier ?? "com.orion.browser",
            isDebug: {
                #if DEBUG
                return true
                #else
                return false
                #endif
            }()
        )
    }
}

// MARK: - Session Context
struct SessionContext: Codable {
    let id: UUID
    let startTime: Date
    var endTime: Date?
    var eventCount: Int
    var pageViews: Int
    var tabsOpened: Int
    var aiQueries: Int

    init() {
        self.id = UUID()
        self.startTime = Date()
        self.endTime = nil
        self.eventCount = 0
        self.pageViews = 0
        self.tabsOpened = 0
        self.aiQueries = 0
    }

    var duration: TimeInterval {
        (endTime ?? Date()).timeIntervalSince(startTime)
    }

    mutating func recordEvent(type: EventType) {
        eventCount += 1

        switch type {
        case .pageView:
            pageViews += 1
        case .tabCreate:
            tabsOpened += 1
        case .aiQuery:
            aiQueries += 1
        default:
            break
        }
    }

    mutating func end() {
        endTime = Date()
    }
}

// MARK: - Privacy Context
struct PrivacyContext: Codable {
    let isPrivateBrowsing: Bool
    let aiEnabled: Bool
    let dataCollectionEnabled: Bool
    let consentVersion: String?

    static var current: PrivacyContext {
        PrivacyContext(
            isPrivateBrowsing: false, // Would be set from AppState
            aiEnabled: true,
            dataCollectionEnabled: true,
            consentVersion: "1.0"
        )
    }
}

// MARK: - Network Context
struct NetworkContext: Codable {
    let isConnected: Bool
    let connectionType: String
    let isExpensive: Bool

    @MainActor
    static var current: NetworkContext {
        let monitor = NetworkMonitor.shared
        return NetworkContext(
            isConnected: monitor.isConnected,
            connectionType: monitor.connectionType.description,
            isExpensive: monitor.isExpensive
        )
    }
}

// MARK: - Complete Event Wrapper
struct ContextualEvent<P: EventPayloadProtocol>: Codable {
    let payload: P
    let context: BrowserEventContext

    init(payload: P, context: BrowserEventContext = BrowserEventContext(sessionId: UUID())) {
        self.payload = payload
        self.context = context
    }
}
