/**
 * PrivacyControlsView.swift
 * Privacy controls UI using PrivacyControlsViewModel
 */

import SwiftUI

struct PrivacyControlsView: View {
    @StateObject private var viewModel = PrivacyControlsViewModel()

    var body: some View {
        List {
            Section("Data Collection") {
                Toggle("Collect Browsing History", isOn: $viewModel.collectBrowsingHistory)
                    .onChange(of: viewModel.collectBrowsingHistory) { _, newValue in
                        viewModel.updateConsent(for: .analytics, granted: newValue)
                    }
            }

            Section("Site Permissions") {
                NavigationLink("Manage Site Permissions") {
                    SettingsSitePermissionsListView(viewModel: viewModel)
                }
            }

            Section("Data Management") {
                NavigationLink("Data Transparency") {
                    Text("Data Transparency View")
                }

                Button("Export My Data") {
                    // Handle export
                }

                Button("Delete All Data", role: .destructive) {
                    viewModel.showDeleteConfirmation = true
                }
            }
        }
        .navigationTitle("Privacy Controls")
        .alert("Delete All Data?", isPresented: $viewModel.showDeleteConfirmation) {
            Button("Cancel", role: .cancel) { }
            Button("Delete", role: .destructive) {
                Task { await viewModel.deleteAllData() }
            }
        } message: {
            Text("This will permanently delete all your data. This action cannot be undone.")
        }
        .task {
            await viewModel.loadSettings()
        }
    }
}

// MARK: - Site Permissions List (Settings)
private struct SettingsSitePermissionsListView: View {
    @ObservedObject var viewModel: PrivacyControlsViewModel

    var body: some View {
        List {
            ForEach(viewModel.sitePermissions) { permission in
                SettingsSitePermissionRow(permission: permission) { updated in
                    viewModel.updateSitePermission(updated)
                }
            }
            .onDelete { offsets in
                viewModel.deleteSitePermissions(at: offsets)
            }
        }
        .navigationTitle("Site Permissions")
        .task {
            await viewModel.loadSitePermissions()
        }
    }
}

// MARK: - Site Permission Row (Settings)
private struct SettingsSitePermissionRow: View {
    let permission: SitePermission
    let onUpdate: (SitePermission) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(permission.domain)
                .font(.headline)

            HStack(spacing: 12) {
                SettingsPermissionBadge(
                    title: "AI",
                    isAllowed: permission.aiLearning
                )
                SettingsPermissionBadge(
                    title: "Tracking",
                    isAllowed: permission.tracking == .allow
                )
            }
            .font(.caption)
        }
        .padding(.vertical, 4)
    }
}

// MARK: - Permission Badge (Settings)
private struct SettingsPermissionBadge: View {
    let title: String
    let isAllowed: Bool

    var body: some View {
        HStack(spacing: 4) {
            Image(systemName: isAllowed ? "checkmark.circle.fill" : "xmark.circle.fill")
                .foregroundStyle(isAllowed ? .green : .red)
            Text(title)
        }
    }
}

#Preview {
    NavigationStack {
        PrivacyControlsView()
    }
}
