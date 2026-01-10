/**
 * PrivacyControlsViewModel.swift
 * ViewModel for privacy controls with clean API
 */

import Foundation
import SwiftUI

@MainActor
final class PrivacyControlsViewModel: ObservableObject {
    @Published var consentState: ConsentState = .default
    @Published var sitePermissions: [SitePermission] = []
    @Published var isBusy: Bool = false
    @Published var errorMessage: String?
    @Published var showDeleteConfirmation: Bool = false
    @Published var collectBrowsingHistory: Bool = true

    private let consentService: ConsentService?

    init(consentService: ConsentService? = nil) {
        self.consentService = consentService
    }

    func loadSettings() async {
        isBusy = true
        defer { isBusy = false }
        errorMessage = nil

        // Load from UserDefaults
        if let data = UserDefaults.standard.data(forKey: "consentState"),
           let state = try? JSONDecoder().decode(ConsentState.self, from: data) {
            consentState = state
        }

        // Load site permissions
        await loadSitePermissions()
    }

    func loadSitePermissions() async {
        if let data = UserDefaults.standard.data(forKey: "sitePermissions"),
           let permissions = try? JSONDecoder().decode([SitePermission].self, from: data) {
            sitePermissions = permissions
        }
    }

    func updateConsent(for modality: ConsentModality, granted: Bool) {
        consentState.modalities[modality] = granted
        consentState.lastUpdated = Date()
        saveConsentState()
    }

    func deleteAllData() async {
        isBusy = true
        defer { isBusy = false }

        // Clear local data
        UserDefaults.standard.removeObject(forKey: "consentState")
        UserDefaults.standard.removeObject(forKey: "sitePermissions")

        // Reset state
        consentState = .default
        sitePermissions = []
        showDeleteConfirmation = false
    }

    func deleteSitePermissions(at offsets: IndexSet) {
        sitePermissions.remove(atOffsets: offsets)
        saveSitePermissions()
    }

    func updateSitePermission(_ permission: SitePermission) {
        if let index = sitePermissions.firstIndex(where: { $0.domain == permission.domain }) {
            sitePermissions[index] = permission
        } else {
            sitePermissions.append(permission)
        }
        saveSitePermissions()
    }

    private func saveConsentState() {
        if let data = try? JSONEncoder().encode(consentState) {
            UserDefaults.standard.set(data, forKey: "consentState")
        }
    }

    private func saveSitePermissions() {
        if let data = try? JSONEncoder().encode(sitePermissions) {
            UserDefaults.standard.set(data, forKey: "sitePermissions")
        }
    }
}
