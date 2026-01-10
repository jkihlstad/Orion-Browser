/**
 * ConsentService.swift
 * Consent checking and management service
 * SUB-AGENT B: Edge Capture + Local Buffer + Background Upload
 *
 * Provides consent gating for data capture operations.
 * Integrates with NeuralConsentManager and syncs with backend.
 */

import Foundation
import Combine

// MARK: - Consent Service Protocol

/// Protocol for consent checking operations
public protocol ConsentChecking: Sendable {
    /// Check if capture is allowed for a given modality
    func canCapture(modality: ConsentModality) -> Bool

    /// Check if a consent request is satisfied
    func isSatisfied(_ request: ConsentRequest) -> Bool

    /// Get current consent state
    var currentState: ConsentState { get }
}

// MARK: - Consent Service

/// Main consent service for gating data capture operations
@MainActor
public final class ConsentService: ObservableObject, ConsentChecking {
    // MARK: - Published State

    @Published public private(set) var currentState: ConsentState = .default
    @Published public private(set) var isSyncing: Bool = false
    @Published public private(set) var lastSyncError: Error?
    @Published public private(set) var validationResult: ConsentValidationResult = .valid

    // MARK: - Private Properties

    private let userDefaultsKey = "consent_service_state"
    private let historyKey = "consent_service_history"
    private var consentHistory: [ConsentChangeRecord] = []
    private var cancellables = Set<AnyCancellable>()
    private let neuralConsentManager: NeuralConsentManager

    /// Convex client for backend sync
    private weak var convexClient: ConvexManager?

    // MARK: - Initialization

    init(
        neuralConsentManager: NeuralConsentManager,
        convexClient: ConvexManager? = nil
    ) {
        self.neuralConsentManager = neuralConsentManager
        self.convexClient = convexClient

        loadState()
        loadHistory()
        syncFromNeuralConsentManager()
        setupObservers()
    }

    // MARK: - ConsentChecking Protocol

    /// Check if capture is allowed for a specific modality
    /// This is the primary gating function for data capture
    public func canCapture(modality: ConsentModality) -> Bool {
        // First check validation
        guard validationResult.isValid else {
            return false
        }

        // Then check consent state
        return currentState.isConsented(modality)
    }

    /// Check if a consent request is satisfied
    public func isSatisfied(_ request: ConsentRequest) -> Bool {
        return request.isSatisfied(by: currentState)
    }

    /// Batch check multiple modalities
    public func canCapture(modalities: Set<ConsentModality>) -> Bool {
        return modalities.allSatisfy { canCapture(modality: $0) }
    }

    /// Get missing consents for a request
    public func missingConsents(for request: ConsentRequest) -> Set<ConsentModality> {
        return request.modalities.filter { !currentState.isConsented($0) }
    }

    // MARK: - State Management

    /// Update consent for a specific modality
    public func updateConsent(for modality: ConsentModality, granted: Bool) {
        let previousValue = currentState.modalities[modality] ?? false
        guard previousValue != granted else { return }

        // Record change
        let change = ConsentChangeRecord(
            modality: modality,
            previousValue: previousValue,
            newValue: granted,
            source: .user,
            version: currentState.version
        )
        recordChange(change)

        // Update state
        currentState.modalities[modality] = granted
        currentState.lastUpdated = Date()
        currentState.hasPendingChanges = true

        // Persist and sync
        saveState()
        syncToNeuralConsentManager()

        Task {
            await syncToBackend()
        }
    }

    /// Update the overall consent level
    public func updateLevel(_ level: ConsentLevel) {
        guard currentState.level != level else { return }

        let previousLevel = currentState.level
        currentState.level = level
        currentState.lastUpdated = Date()
        currentState.hasPendingChanges = true

        // Record change
        let change = ConsentChangeRecord(
            modality: nil,
            previousValue: previousLevel >= .minimal,
            newValue: level >= .minimal,
            source: .user,
            version: currentState.version
        )
        recordChange(change)

        saveState()
        syncToNeuralConsentManager()

        Task {
            await syncToBackend()
        }
    }

    /// Enable or disable global data collection
    public func setGlobalEnabled(_ enabled: Bool) {
        guard currentState.globalEnabled != enabled else { return }

        let previousValue = currentState.globalEnabled
        currentState.globalEnabled = enabled
        currentState.lastUpdated = Date()
        currentState.hasPendingChanges = true

        let change = ConsentChangeRecord(
            modality: nil,
            previousValue: previousValue,
            newValue: enabled,
            source: .user,
            version: currentState.version
        )
        recordChange(change)

        saveState()
        syncToNeuralConsentManager()

        Task {
            await syncToBackend()
        }
    }

    /// Grant consent for multiple modalities at once
    public func grantConsent(for modalities: Set<ConsentModality>) {
        for modality in modalities {
            let previousValue = currentState.modalities[modality] ?? false
            currentState.modalities[modality] = true

            let change = ConsentChangeRecord(
                modality: modality,
                previousValue: previousValue,
                newValue: true,
                source: .user,
                version: currentState.version
            )
            recordChange(change)
        }

        currentState.lastUpdated = Date()
        currentState.hasPendingChanges = true

        saveState()
        syncToNeuralConsentManager()

        Task {
            await syncToBackend()
        }
    }

    /// Revoke all consents
    public func revokeAllConsents() {
        for modality in ConsentModality.allCases {
            if currentState.modalities[modality] == true {
                let change = ConsentChangeRecord(
                    modality: modality,
                    previousValue: true,
                    newValue: false,
                    source: .user,
                    version: currentState.version
                )
                recordChange(change)
            }
            currentState.modalities[modality] = false
        }

        currentState.globalEnabled = false
        currentState.level = .none
        currentState.lastUpdated = Date()
        currentState.hasPendingChanges = true

        saveState()
        syncToNeuralConsentManager()

        Task {
            await syncToBackend()
        }
    }

    // MARK: - Onboarding Flow

    /// Mark onboarding consent as completed
    public func completeOnboarding() {
        currentState.hasCompletedOnboarding = true
        currentState.lastUpdated = Date()
        saveState()
        revalidate()
    }

    /// Mark age verification as passed
    public func verifyAge() {
        currentState.ageVerified = true
        currentState.lastUpdated = Date()
        saveState()
        revalidate()
    }

    /// Accept terms of service
    public func acceptTerms() {
        currentState.termsAcceptedDate = Date()
        currentState.lastUpdated = Date()
        saveState()
        revalidate()
    }

    /// Accept privacy policy
    public func acceptPrivacyPolicy() {
        currentState.privacyPolicyAcceptedDate = Date()
        currentState.lastUpdated = Date()
        saveState()
        revalidate()
    }

    // MARK: - Validation

    /// Validate current consent state
    public func validate() -> ConsentValidationResult {
        var issues: [ConsentValidationResult.ConsentIssue] = []

        if currentState.isExpired {
            issues.append(.expired)
        }

        if !currentState.hasCompletedOnboarding {
            issues.append(.onboardingIncomplete)
        }

        if !currentState.ageVerified {
            issues.append(.ageNotVerified)
        }

        if currentState.termsAcceptedDate == nil {
            issues.append(.termsNotAccepted)
        }

        if currentState.privacyPolicyAcceptedDate == nil {
            issues.append(.privacyPolicyNotAccepted)
        }

        if !currentState.globalEnabled && currentState.level > .none {
            issues.append(.globalDisabled)
        }

        if issues.isEmpty {
            return .valid
        } else {
            return .invalid(issues)
        }
    }

    /// Revalidate and update published result
    private func revalidate() {
        validationResult = validate()
    }

    /// Check if re-consent is needed
    public func requiresReconsent() -> Bool {
        return currentState.isExpired || !validationResult.isValid
    }

    // MARK: - Sync Operations

    /// Request consent update from backend
    public func requestConsentUpdate() async {
        guard !isSyncing else { return }

        isSyncing = true
        lastSyncError = nil

        do {
            if let backendState = await convexClient?.getConsentState() {
                // Merge backend state with local state
                mergeBackendState(backendState)
                currentState.lastSyncedAt = Date()
                currentState.hasPendingChanges = false
                saveState()
            }
        } catch {
            lastSyncError = error
        }

        isSyncing = false
    }

    /// Sync local state to backend
    public func syncToBackend() async {
        guard !isSyncing else { return }

        isSyncing = true
        lastSyncError = nil

        do {
            // Convert to backend format
            var backendModalities: [ConsentModality: Bool] = [:]
            backendModalities[.analytics] = currentState.isConsented(.analytics)
            backendModalities[.audio] = currentState.isConsented(.audio)
            backendModalities[.crossSession] = currentState.isConsented(.crossSession)
            backendModalities[.thirdParty] = currentState.isConsented(.thirdParty)

            let backendState = ConsentState_Privacy(
                level: currentState.level,
                modalities: backendModalities,
                globalEnabled: currentState.globalEnabled,
                version: currentState.version,
                lastUpdated: currentState.lastUpdated
            )

            await convexClient?.updateConsentState(backendState)
            currentState.lastSyncedAt = Date()
            currentState.hasPendingChanges = false
            saveState()
        } catch {
            lastSyncError = error
        }

        isSyncing = false
    }

    // MARK: - History

    /// Get consent change history
    public func getHistory() -> [ConsentChangeRecord] {
        return consentHistory
    }

    /// Export consent state as JSON data
    public func exportState() -> Data? {
        return try? JSONEncoder().encode(currentState)
    }

    // MARK: - Private Methods

    private func syncFromNeuralConsentManager() {
        // Import state from NeuralConsentManager
        let neuralState = neuralConsentManager.consentState

        currentState.globalEnabled = neuralState.globalEnabled
        currentState.hasCompletedOnboarding = neuralState.hasCompletedOnboarding
        currentState.ageVerified = neuralState.ageVerified
        currentState.termsAcceptedDate = neuralState.termsAcceptedDate
        currentState.privacyPolicyAcceptedDate = neuralState.privacyPolicyAcceptedDate
        currentState.version = neuralState.version
        currentState.lastUpdated = neuralState.lastUpdated

        // Map NeuralConsentModality to ConsentModality
        for (neuralModality, value) in neuralState.modalities {
            if let modality = mapNeuralModality(neuralModality) {
                currentState.modalities[modality] = value
            }
        }

        revalidate()
    }

    private func syncToNeuralConsentManager() {
        // Update NeuralConsentManager from our state
        if neuralConsentManager.consentState.globalEnabled != currentState.globalEnabled {
            neuralConsentManager.setGlobalEnabled(currentState.globalEnabled)
        }

        // Map and sync individual modalities
        for (modality, value) in currentState.modalities {
            if let neuralModality = mapToNeuralModality(modality) {
                if neuralConsentManager.consentState.modalities[neuralModality] != value {
                    neuralConsentManager.updateConsent(for: neuralModality, granted: value)
                }
            }
        }
    }

    private func setupObservers() {
        // Observe NeuralConsentManager changes
        neuralConsentManager.$consentState
            .sink { [weak self] _ in
                self?.syncFromNeuralConsentManager()
            }
            .store(in: &cancellables)
    }

    private func recordChange(_ change: ConsentChangeRecord) {
        consentHistory.append(change)

        // Keep only last 200 changes
        if consentHistory.count > 200 {
            consentHistory.removeFirst(consentHistory.count - 200)
        }

        saveHistory()
    }

    private func mergeBackendState(_ backendState: ConsentState_Privacy) {
        // Only update if backend is newer
        if backendState.lastUpdated > currentState.lastUpdated {
            currentState.globalEnabled = backendState.globalEnabled
            currentState.modalities[.analytics] = backendState.modalities[.analytics] ?? false
            currentState.modalities[.audio] = backendState.modalities[.audio] ?? false
            currentState.modalities[.crossSession] = backendState.modalities[.crossSession] ?? false
            currentState.modalities[.thirdParty] = backendState.modalities[.thirdParty] ?? false
            currentState.version = backendState.version
            currentState.lastUpdated = backendState.lastUpdated
        }
    }

    // MARK: - Mapping Helpers

    private func mapLevel(_ level: ConsentLevel) -> ConsentLevel_Privacy {
        switch level {
        case .none: return .none
        case .minimal: return .minimal
        case .standard: return .standard
        case .enhanced: return .enhanced
        case .full: return .full
        }
    }

    private func mapNeuralModality(_ modality: NeuralConsentModality) -> ConsentModality? {
        switch modality {
        case .location: return .location
        case .audio: return .audio
        case .video: return .visual
        case .eyeTracking: return .eyeTracking
        case .analytics: return .analytics
        case .social: return nil
        case .biometrics: return .biometric
        case .screenCapture: return .screenCapture
        case .keystroke: return .keystroke
        }
    }

    private func mapToNeuralModality(_ modality: ConsentModality) -> NeuralConsentModality? {
        switch modality {
        case .location: return .location
        case .audio: return .audio
        case .visual: return .video
        case .eyeTracking: return .eyeTracking
        case .analytics: return .analytics
        case .biometric: return .biometrics
        case .screenCapture: return .screenCapture
        case .keystroke: return .keystroke
        default: return nil
        }
    }

    // MARK: - Persistence

    private func saveState() {
        do {
            let data = try JSONEncoder().encode(currentState)
            UserDefaults.standard.set(data, forKey: userDefaultsKey)
        } catch {
            print("[ConsentService] Failed to save state: \(error)")
        }
    }

    private func loadState() {
        guard let data = UserDefaults.standard.data(forKey: userDefaultsKey) else {
            return
        }

        do {
            currentState = try JSONDecoder().decode(ConsentState.self, from: data)
            revalidate()
        } catch {
            print("[ConsentService] Failed to load state: \(error)")
            currentState = .default
        }
    }

    private func saveHistory() {
        do {
            let data = try JSONEncoder().encode(consentHistory)
            UserDefaults.standard.set(data, forKey: historyKey)
        } catch {
            print("[ConsentService] Failed to save history: \(error)")
        }
    }

    private func loadHistory() {
        guard let data = UserDefaults.standard.data(forKey: historyKey) else {
            return
        }

        do {
            consentHistory = try JSONDecoder().decode([ConsentChangeRecord].self, from: data)
        } catch {
            print("[ConsentService] Failed to load history: \(error)")
            consentHistory = []
        }
    }
}

// MARK: - Type Aliases for Backend Compatibility

/// Type alias to avoid naming conflict with PrivacyModels.ConsentState
typealias ConsentState_Privacy = ConsentState

/// Type alias to avoid naming conflict with PrivacyModels.ConsentLevel
typealias ConsentLevel_Privacy = ConsentLevel

// MARK: - Thread-Safe Consent Checker

/// Thread-safe wrapper for consent checking from background threads
public actor ConsentChecker {
    private let service: ConsentService

    public init(service: ConsentService) {
        self.service = service
    }

    public func canCapture(modality: ConsentModality) async -> Bool {
        await MainActor.run {
            service.canCapture(modality: modality)
        }
    }

    public func canCapture(modalities: Set<ConsentModality>) async -> Bool {
        await MainActor.run {
            service.canCapture(modalities: modalities)
        }
    }

    public func currentState() async -> ConsentState {
        await MainActor.run {
            service.currentState
        }
    }

    public func consentVersion() async -> String {
        await MainActor.run {
            service.currentState.version
        }
    }
}
