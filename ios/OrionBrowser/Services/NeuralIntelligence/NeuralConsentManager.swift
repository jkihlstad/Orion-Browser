/**
 * NeuralConsentManager.swift
 * Consent enforcement for the Neural Intelligence SDK
 * SUB-AGENT 1: iOS Neural SDK Engineer
 *
 * Manages consent flags per modality, persists to UserDefaults,
 * syncs with Convex backend, and enforces consent checks before
 * any data capture operation.
 */

import Foundation
import Combine

// MARK: - Neural Consent Modality
/// Data collection modalities that require consent
enum NeuralConsentModality: String, CaseIterable, Codable {
    case location = "location"
    case audio = "audio"
    case video = "video"
    case eyeTracking = "eye_tracking"
    case analytics = "analytics"
    case social = "social"
    case biometrics = "biometrics"
    case screenCapture = "screen_capture"
    case keystroke = "keystroke"

    var displayName: String {
        switch self {
        case .location: return "Location"
        case .audio: return "Audio Recording"
        case .video: return "Video Recording"
        case .eyeTracking: return "Eye Tracking"
        case .analytics: return "Analytics"
        case .social: return "Social Data"
        case .biometrics: return "Biometrics"
        case .screenCapture: return "Screen Capture"
        case .keystroke: return "Keystroke Tracking"
        }
    }

    var description: String {
        switch self {
        case .location: return "Track your location for context-aware features"
        case .audio: return "Record audio for voice commands and transcription"
        case .video: return "Record video for visual context capture"
        case .eyeTracking: return "Track eye movement and gaze patterns"
        case .analytics: return "Collect browsing and interaction analytics"
        case .social: return "Access social media activity data"
        case .biometrics: return "Use biometric data for authentication"
        case .screenCapture: return "Capture screenshots for visual context"
        case .keystroke: return "Track typing patterns and input"
        }
    }

    var iconName: String {
        switch self {
        case .location: return "location.fill"
        case .audio: return "mic.fill"
        case .video: return "video.fill"
        case .eyeTracking: return "eye.fill"
        case .analytics: return "chart.bar.fill"
        case .social: return "person.2.fill"
        case .biometrics: return "faceid"
        case .screenCapture: return "camera.viewfinder"
        case .keystroke: return "keyboard"
        }
    }

    var requiresSystemPermission: Bool {
        switch self {
        case .location, .audio, .video, .eyeTracking:
            return true
        default:
            return false
        }
    }

    var isHighSensitivity: Bool {
        switch self {
        case .audio, .video, .eyeTracking, .biometrics, .keystroke:
            return true
        default:
            return false
        }
    }
}

// MARK: - Consent State
/// Represents the consent state for all modalities
struct NeuralConsentState: Codable, Equatable {
    /// Consent version identifier
    var version: String

    /// Last update timestamp
    var lastUpdated: Date

    /// Individual modality consent flags
    var modalities: [NeuralConsentModality: Bool]

    /// Global data collection enabled
    var globalEnabled: Bool

    /// Whether user has completed onboarding consent
    var hasCompletedOnboarding: Bool

    /// Minimum age verified
    var ageVerified: Bool

    /// Terms accepted date
    var termsAcceptedDate: Date?

    /// Privacy policy accepted date
    var privacyPolicyAcceptedDate: Date?

    /// Default consent state (everything disabled)
    static var `default`: NeuralConsentState {
        var modalities: [NeuralConsentModality: Bool] = [:]
        for modality in NeuralConsentModality.allCases {
            modalities[modality] = false
        }

        return NeuralConsentState(
            version: "1.0",
            lastUpdated: Date(),
            modalities: modalities,
            globalEnabled: false,
            hasCompletedOnboarding: false,
            ageVerified: false,
            termsAcceptedDate: nil,
            privacyPolicyAcceptedDate: nil
        )
    }

    /// Check if a specific modality is consented
    func isConsented(_ modality: NeuralConsentModality) -> Bool {
        globalEnabled && (modalities[modality] ?? false)
    }

    /// Get all consented modalities
    var consentedModalities: [NeuralConsentModality] {
        guard globalEnabled else { return [] }
        return modalities.filter { $0.value }.map { $0.key }
    }

    /// Check if all required consents are in place
    var isFullyConsented: Bool {
        globalEnabled && hasCompletedOnboarding && ageVerified &&
        termsAcceptedDate != nil && privacyPolicyAcceptedDate != nil
    }
}

// MARK: - Consent Change
/// Represents a consent change for audit logging
struct ConsentChange: Codable {
    let timestamp: Date
    let modality: NeuralConsentModality?
    let previousValue: Bool
    let newValue: Bool
    let source: ChangeSource

    enum ChangeSource: String, Codable {
        case user
        case system
        case policy
        case expiration
    }
}

// MARK: - Neural Consent Manager
/// Manages user consent for data collection modalities
@MainActor
final class NeuralConsentManager: ObservableObject {
    // MARK: - Singleton
    static let shared = NeuralConsentManager()

    // MARK: - Published Properties
    @Published private(set) var consentState: NeuralConsentState = .default
    @Published private(set) var isSyncing = false
    @Published private(set) var lastSyncError: Error?

    // MARK: - Private Properties
    private let userDefaultsKey = "neural_consent_state"
    private let consentHistoryKey = "neural_consent_history"
    private var consentHistory: [ConsentChange] = []
    private var cancellables = Set<AnyCancellable>()

    // MARK: - Initialization
    private init() {
        loadConsentState()
        loadConsentHistory()
        setupAutoSync()
    }

    // MARK: - Public API
    /// Check if collection is allowed for a specific modality
    /// - Parameter modality: The modality to check
    /// - Returns: Whether collection is allowed
    func canCollect(modality: NeuralConsentModality) -> Bool {
        consentState.isConsented(modality)
    }

    /// Check if any high-sensitivity modality is enabled
    var hasHighSensitivityConsent: Bool {
        NeuralConsentModality.allCases
            .filter { $0.isHighSensitivity }
            .contains { consentState.isConsented($0) }
    }

    /// Get the current consent version
    var currentConsentVersion: String {
        consentState.version
    }

    /// Update consent for a specific modality
    /// - Parameters:
    ///   - modality: The modality to update
    ///   - granted: Whether consent is granted
    func updateConsent(for modality: NeuralConsentModality, granted: Bool) {
        let previousValue = consentState.modalities[modality] ?? false

        guard previousValue != granted else { return }

        consentState.modalities[modality] = granted
        consentState.lastUpdated = Date()

        // Record change
        let change = ConsentChange(
            timestamp: Date(),
            modality: modality,
            previousValue: previousValue,
            newValue: granted,
            source: .user
        )
        recordConsentChange(change)

        // Persist
        saveConsentState()

        // Sync to backend
        Task {
            await syncToBackend()
        }

        print("[NeuralConsentManager] Updated \(modality.rawValue) consent to \(granted)")
    }

    /// Update global data collection enabled state
    /// - Parameter enabled: Whether global collection is enabled
    func setGlobalEnabled(_ enabled: Bool) {
        let previousValue = consentState.globalEnabled

        guard previousValue != enabled else { return }

        consentState.globalEnabled = enabled
        consentState.lastUpdated = Date()

        // Record change
        let change = ConsentChange(
            timestamp: Date(),
            modality: nil,
            previousValue: previousValue,
            newValue: enabled,
            source: .user
        )
        recordConsentChange(change)

        // Persist
        saveConsentState()

        // Sync to backend
        Task {
            await syncToBackend()
        }

        print("[NeuralConsentManager] Updated global consent to \(enabled)")
    }

    /// Grant consent for multiple modalities at once
    /// - Parameter modalities: Modalities to grant consent for
    func grantConsent(for modalities: [NeuralConsentModality]) {
        for modality in modalities {
            consentState.modalities[modality] = true

            let change = ConsentChange(
                timestamp: Date(),
                modality: modality,
                previousValue: false,
                newValue: true,
                source: .user
            )
            recordConsentChange(change)
        }

        consentState.lastUpdated = Date()
        saveConsentState()

        Task {
            await syncToBackend()
        }
    }

    /// Revoke all consents
    func revokeAllConsents() {
        for modality in NeuralConsentModality.allCases {
            if consentState.modalities[modality] == true {
                let change = ConsentChange(
                    timestamp: Date(),
                    modality: modality,
                    previousValue: true,
                    newValue: false,
                    source: .user
                )
                recordConsentChange(change)
            }
            consentState.modalities[modality] = false
        }

        consentState.globalEnabled = false
        consentState.lastUpdated = Date()
        saveConsentState()

        Task {
            await syncToBackend()
        }

        print("[NeuralConsentManager] Revoked all consents")
    }

    /// Mark onboarding consent as completed
    func completeOnboarding() {
        consentState.hasCompletedOnboarding = true
        consentState.lastUpdated = Date()
        saveConsentState()
    }

    /// Mark age verification as completed
    func verifyAge() {
        consentState.ageVerified = true
        consentState.lastUpdated = Date()
        saveConsentState()
    }

    /// Accept terms of service
    func acceptTerms() {
        consentState.termsAcceptedDate = Date()
        consentState.lastUpdated = Date()
        saveConsentState()
    }

    /// Accept privacy policy
    func acceptPrivacyPolicy() {
        consentState.privacyPolicyAcceptedDate = Date()
        consentState.lastUpdated = Date()
        saveConsentState()
    }

    /// Get consent history for audit purposes
    func getConsentHistory() -> [ConsentChange] {
        consentHistory
    }

    /// Export consent state as JSON
    func exportConsentState() -> Data? {
        try? JSONEncoder().encode(consentState)
    }

    // MARK: - Persistence
    private func saveConsentState() {
        do {
            let data = try JSONEncoder().encode(consentState)
            UserDefaults.standard.set(data, forKey: userDefaultsKey)
        } catch {
            print("[NeuralConsentManager] Failed to save consent state: \(error)")
        }
    }

    private func loadConsentState() {
        guard let data = UserDefaults.standard.data(forKey: userDefaultsKey) else {
            return
        }

        do {
            consentState = try JSONDecoder().decode(NeuralConsentState.self, from: data)
        } catch {
            print("[NeuralConsentManager] Failed to load consent state: \(error)")
            consentState = .default
        }
    }

    private func recordConsentChange(_ change: ConsentChange) {
        consentHistory.append(change)

        // Keep only last 100 changes
        if consentHistory.count > 100 {
            consentHistory.removeFirst(consentHistory.count - 100)
        }

        saveConsentHistory()
    }

    private func saveConsentHistory() {
        do {
            let data = try JSONEncoder().encode(consentHistory)
            UserDefaults.standard.set(data, forKey: consentHistoryKey)
        } catch {
            print("[NeuralConsentManager] Failed to save consent history: \(error)")
        }
    }

    private func loadConsentHistory() {
        guard let data = UserDefaults.standard.data(forKey: consentHistoryKey) else {
            return
        }

        do {
            consentHistory = try JSONDecoder().decode([ConsentChange].self, from: data)
        } catch {
            print("[NeuralConsentManager] Failed to load consent history: \(error)")
            consentHistory = []
        }
    }

    // MARK: - Backend Sync
    private func setupAutoSync() {
        // Sync consent state periodically
        Timer.publish(every: 300, on: .main, in: .common)
            .autoconnect()
            .sink { [weak self] _ in
                Task { @MainActor [weak self] in
                    await self?.syncToBackend()
                }
            }
            .store(in: &cancellables)
    }

    /// Sync consent state to Convex backend
    func syncToBackend() async {
        guard !isSyncing else { return }

        isSyncing = true
        lastSyncError = nil

        do {
            // Convert modalities to dictionary for backend
            var modalitiesDict: [String: Bool] = [:]
            for (modality, value) in consentState.modalities {
                modalitiesDict[modality.rawValue] = value
            }

            let backendModalities: [ConsentModality: Bool] = [
                .analytics: consentState.modalities[.analytics] ?? false,
                .audio: consentState.modalities[.audio] ?? false,
                .crossSession: consentState.globalEnabled,
                .thirdParty: false
            ]

            await ConvexManager.shared.updateConsentState(ConsentState(
                level: consentState.globalEnabled ? .standard : .minimal,
                modalities: backendModalities,
                globalEnabled: consentState.globalEnabled,
                version: consentState.version,
                lastUpdated: consentState.lastUpdated
            ))

            print("[NeuralConsentManager] Synced consent to backend")
        } catch {
            lastSyncError = error
            print("[NeuralConsentManager] Failed to sync consent: \(error)")
        }

        isSyncing = false
    }

    /// Fetch consent state from backend
    func fetchFromBackend() async {
        guard !isSyncing else { return }

        isSyncing = true
        lastSyncError = nil

        do {
            if let backendState = await ConvexManager.shared.getConsentState() {
                // Update local state from backend
                consentState.globalEnabled = backendState.level != .none && backendState.level != .minimal
                consentState.modalities[.analytics] = backendState.modalities[.analytics] ?? false
                consentState.modalities[.audio] = backendState.modalities[.audio] ?? false
                consentState.version = backendState.version
                consentState.lastUpdated = backendState.lastUpdated

                saveConsentState()
                print("[NeuralConsentManager] Fetched consent from backend")
            }
        } catch {
            lastSyncError = error
            print("[NeuralConsentManager] Failed to fetch consent: \(error)")
        }

        isSyncing = false
    }

    // MARK: - Consent Prompts
    /// Get modalities that need consent prompts
    func modalitiesNeedingConsent() -> [NeuralConsentModality] {
        NeuralConsentModality.allCases.filter { !consentState.isConsented($0) }
    }

    /// Get high-sensitivity modalities that need consent
    func highSensitivityModalitiesNeedingConsent() -> [NeuralConsentModality] {
        NeuralConsentModality.allCases
            .filter { $0.isHighSensitivity && !consentState.isConsented($0) }
    }

    /// Check if consent is valid (not expired, version matches, etc.)
    var isConsentValid: Bool {
        // Check if consent is too old (e.g., older than 1 year)
        let maxAge: TimeInterval = 365 * 24 * 60 * 60
        let consentAge = Date().timeIntervalSince(consentState.lastUpdated)

        if consentAge > maxAge {
            return false
        }

        // Check required acknowledgments
        if !consentState.hasCompletedOnboarding || !consentState.ageVerified {
            return false
        }

        if consentState.termsAcceptedDate == nil || consentState.privacyPolicyAcceptedDate == nil {
            return false
        }

        return true
    }

    /// Force re-consent if needed
    func requireReconsentIfNeeded() -> Bool {
        if !isConsentValid {
            // Mark onboarding as incomplete to trigger re-consent flow
            consentState.hasCompletedOnboarding = false
            saveConsentState()
            return true
        }
        return false
    }
}

// MARK: - Consent UI Helpers
extension NeuralConsentManager {
    /// Get a summary of current consent status
    var consentSummary: String {
        let consentedCount = consentState.consentedModalities.count
        let totalCount = NeuralConsentModality.allCases.count

        if !consentState.globalEnabled {
            return "Data collection disabled"
        }

        if consentedCount == 0 {
            return "No modalities enabled"
        }

        if consentedCount == totalCount {
            return "All modalities enabled"
        }

        return "\(consentedCount) of \(totalCount) modalities enabled"
    }

    /// Get detailed consent status for display
    var consentDetails: [(modality: NeuralConsentModality, isConsented: Bool)] {
        NeuralConsentModality.allCases.map { ($0, consentState.isConsented($0)) }
    }
}
