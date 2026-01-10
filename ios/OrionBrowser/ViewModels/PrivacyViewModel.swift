/**
 * PrivacyViewModel.swift
 * Privacy and consent management logic
 * SUB-AGENT 1: SwiftUI & UX Architect
 */

import SwiftUI
import Combine

@MainActor
final class PrivacyViewModel: ObservableObject {
    // MARK: - Published State
    @Published var consentState: BasicConsentState = .default
    @Published var sitePermissions: [SitePermission] = []
    @Published var retentionPolicy: RetentionPolicy = .default
    @Published var complianceState: ComplianceState = .default
    @Published var activeIndicators: [PrivacyIndicator] = []
    @Published var auditLogs: [AuditLogEntry] = []

    @Published var totalDataPoints: Int = 0
    @Published var aiEventCount: Int = 0

    private var cancellables = Set<AnyCancellable>()

    // MARK: - Load State
    func loadState() {
        Task {
            await loadConsentState()
            await loadSitePermissions()
            await loadStats()
        }
    }

    private func loadConsentState() async {
        // Load from UserDefaults or Convex
        if let data = UserDefaults.standard.data(forKey: "consentState"),
           let state = try? JSONDecoder().decode(BasicConsentState.self, from: data) {
            consentState = state
        }

        // Sync with backend - convert from ConsentState to BasicConsentState
        if let serverState = await ConvexManager.shared.getConsentState() {
            consentState = BasicConsentState(
                level: serverState.level,
                browsingAnalysis: serverState.isConsented(.analytics),
                voiceProcessing: serverState.isConsented(.audio),
                crossSessionLearning: serverState.isConsented(.crossSession),
                dataExport: true,
                thirdPartySharing: serverState.isConsented(.thirdParty),
                lastUpdated: serverState.lastUpdated,
                version: serverState.version
            )
        }
    }

    private func loadSitePermissions() async {
        // Load from local storage
        if let data = UserDefaults.standard.data(forKey: "sitePermissions"),
           let permissions = try? JSONDecoder().decode([SitePermission].self, from: data) {
            sitePermissions = permissions
        }

        // Sync with backend
        let serverPermissions = await ConvexManager.shared.getSitePermissions()
        if !serverPermissions.isEmpty {
            sitePermissions = serverPermissions
        }
    }

    private func loadStats() async {
        let stats = await ConvexManager.shared.getPrivacyStats()
        totalDataPoints = stats.totalDataPoints
        aiEventCount = stats.aiEventCount
    }

    // MARK: - Consent Management
    func updateConsentLevel(_ level: ConsentLevel) {
        consentState.level = level
        consentState.lastUpdated = Date()

        // Update dependent toggles
        switch level {
        case .none:
            consentState.browsingAnalysis = false
            consentState.voiceProcessing = false
            consentState.crossSessionLearning = false
        case .minimal:
            consentState.browsingAnalysis = true
            consentState.voiceProcessing = false
            consentState.crossSessionLearning = false
        case .standard:
            consentState.browsingAnalysis = true
            consentState.voiceProcessing = true
            consentState.crossSessionLearning = false
        case .enhanced, .full:
            consentState.browsingAnalysis = true
            consentState.voiceProcessing = true
            consentState.crossSessionLearning = true
        }

        persistConsentState()
    }

    private func persistConsentState() {
        if let data = try? JSONEncoder().encode(consentState) {
            UserDefaults.standard.set(data, forKey: "consentState")
        }

        Task {
            // Convert BasicConsentState to ConsentState for backend
            var backendState = ConsentState.default
            backendState.level = consentState.level
            backendState.globalEnabled = consentState.level != .none
            backendState.modalities[.analytics] = consentState.browsingAnalysis
            backendState.modalities[.audio] = consentState.voiceProcessing
            backendState.modalities[.crossSession] = consentState.crossSessionLearning
            backendState.modalities[.thirdParty] = consentState.thirdPartySharing
            backendState.lastUpdated = consentState.lastUpdated
            backendState.version = consentState.version
            await ConvexManager.shared.updateConsentState(backendState)
        }
    }

    // MARK: - Site Permissions
    func updateSitePermission(_ permission: SitePermission) {
        if let index = sitePermissions.firstIndex(where: { $0.domain == permission.domain }) {
            sitePermissions[index] = permission
        } else {
            sitePermissions.append(permission)
        }

        persistSitePermissions()
    }

    private func persistSitePermissions() {
        if let data = try? JSONEncoder().encode(sitePermissions) {
            UserDefaults.standard.set(data, forKey: "sitePermissions")
        }

        Task {
            await ConvexManager.shared.updateSitePermissions(sitePermissions)
        }
    }

    // MARK: - Data Management
    func requestDataDeletion() {
        Task {
            await ConvexManager.shared.requestDataDeletion()

            // Clear local data
            UserDefaults.standard.removeObject(forKey: "consentState")
            UserDefaults.standard.removeObject(forKey: "sitePermissions")
            UserDefaults.standard.removeObject(forKey: "persistedTabs")

            // Reset state
            consentState = .default
            sitePermissions = []
            totalDataPoints = 0
            aiEventCount = 0
        }
    }

    func exportData() async -> URL? {
        return await ConvexManager.shared.exportUserData()
    }
}
