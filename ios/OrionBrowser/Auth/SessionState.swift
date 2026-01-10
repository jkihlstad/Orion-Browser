/**
 * SessionState.swift
 * Session state management
 */

import Foundation
import Combine

@MainActor
final class SessionState: ObservableObject {
    // MARK: - Singleton
    static let shared = SessionState()

    // MARK: - Published Properties
    @Published private(set) var currentSession: Session?
    @Published private(set) var sessionHistory: [Session] = []
    @Published private(set) var isSessionActive: Bool = false

    // MARK: - Properties
    private var sessionTimer: Timer?
    private let maxSessionDuration: TimeInterval = 24 * 60 * 60 // 24 hours
    private let sessionWarningThreshold: TimeInterval = 23 * 60 * 60 // 23 hours

    // MARK: - Session Model
    struct Session: Identifiable, Codable {
        let id: UUID
        let userId: String
        let startTime: Date
        var lastActivityTime: Date
        var expiresAt: Date
        var deviceInfo: DeviceInfo
        var ipAddress: String?

        struct DeviceInfo: Codable {
            let model: String
            let osVersion: String
            let appVersion: String
        }

        var isExpired: Bool {
            Date() > expiresAt
        }

        var timeRemaining: TimeInterval {
            expiresAt.timeIntervalSinceNow
        }

        var duration: TimeInterval {
            Date().timeIntervalSince(startTime)
        }
    }

    // MARK: - Initialization
    private init() {
        loadSessionHistory()
        checkExistingSession()
    }

    // MARK: - Start Session
    func startSession(userId: String) {
        let session = Session(
            id: UUID(),
            userId: userId,
            startTime: Date(),
            lastActivityTime: Date(),
            expiresAt: Date().addingTimeInterval(maxSessionDuration),
            deviceInfo: Session.DeviceInfo(
                model: UIDevice.current.model,
                osVersion: UIDevice.current.systemVersion,
                appVersion: Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "1.0"
            ),
            ipAddress: nil
        )

        currentSession = session
        isSessionActive = true
        saveCurrentSession()
        startSessionTimer()

        // Log session start
        Task {
            await ConvexManager.shared.logAuditEvent(
                action: "session_started",
                details: ["sessionId": session.id.uuidString]
            )
        }
    }

    // MARK: - End Session
    func endSession() {
        guard let session = currentSession else { return }

        // Add to history
        sessionHistory.insert(session, at: 0)
        if sessionHistory.count > 10 {
            sessionHistory = Array(sessionHistory.prefix(10))
        }
        saveSessionHistory()

        // Clear current session
        currentSession = nil
        isSessionActive = false
        clearCurrentSession()
        stopSessionTimer()

        // Log session end
        Task {
            await ConvexManager.shared.logAuditEvent(
                action: "session_ended",
                details: [
                    "sessionId": session.id.uuidString,
                    "duration": "\(session.duration)"
                ]
            )
        }
    }

    // MARK: - Update Activity
    func updateActivity() {
        guard var session = currentSession else { return }

        session.lastActivityTime = Date()
        currentSession = session
        saveCurrentSession()
    }

    // MARK: - Extend Session
    func extendSession() {
        guard var session = currentSession else { return }

        session.expiresAt = Date().addingTimeInterval(maxSessionDuration)
        currentSession = session
        saveCurrentSession()
    }

    // MARK: - Session Timer
    private func startSessionTimer() {
        sessionTimer?.invalidate()
        sessionTimer = Timer.scheduledTimer(withTimeInterval: 60, repeats: true) { [weak self] _ in
            Task { @MainActor in
                self?.checkSessionExpiry()
            }
        }
    }

    private func stopSessionTimer() {
        sessionTimer?.invalidate()
        sessionTimer = nil
    }

    private func checkSessionExpiry() {
        guard let session = currentSession else { return }

        if session.isExpired {
            endSession()
            NotificationCenter.default.post(name: .sessionExpired, object: nil)
        } else if session.timeRemaining < sessionWarningThreshold {
            NotificationCenter.default.post(name: .sessionExpiringSoon, object: nil)
        }
    }

    // MARK: - Persistence
    private func saveCurrentSession() {
        guard let session = currentSession,
              let data = try? JSONEncoder().encode(session) else { return }
        UserDefaults.standard.set(data, forKey: "currentSession")
    }

    private func clearCurrentSession() {
        UserDefaults.standard.removeObject(forKey: "currentSession")
    }

    private func checkExistingSession() {
        guard let data = UserDefaults.standard.data(forKey: "currentSession"),
              var session = try? JSONDecoder().decode(Session.self, from: data) else { return }

        if session.isExpired {
            clearCurrentSession()
        } else {
            session.lastActivityTime = Date()
            currentSession = session
            isSessionActive = true
            startSessionTimer()
        }
    }

    private func loadSessionHistory() {
        guard let data = UserDefaults.standard.data(forKey: "sessionHistory"),
              let history = try? JSONDecoder().decode([Session].self, from: data) else { return }
        sessionHistory = history
    }

    private func saveSessionHistory() {
        guard let data = try? JSONEncoder().encode(sessionHistory) else { return }
        UserDefaults.standard.set(data, forKey: "sessionHistory")
    }
}

// MARK: - Notification Names
extension Notification.Name {
    static let sessionExpired = Notification.Name("sessionExpired")
    static let sessionExpiringSoon = Notification.Name("sessionExpiringSoon")
}

import UIKit
