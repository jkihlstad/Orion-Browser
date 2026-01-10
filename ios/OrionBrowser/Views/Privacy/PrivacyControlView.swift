/**
 * PrivacyControlView.swift
 * Privacy dashboard and controls
 * SUB-AGENT 1: SwiftUI & UX Architect
 */

import SwiftUI

struct PrivacyControlView: View {
    @EnvironmentObject var appState: AppState
    @StateObject private var viewModel = PrivacyViewModel()
    @State private var showingConsentSheet = false
    @State private var showingDataExport = false
    @State private var showingDeleteConfirmation = false

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 24) {
                    // Quick Stats
                    statsSection

                    // Active Indicators
                    if !viewModel.activeIndicators.isEmpty {
                        activeIndicatorsSection
                    }

                    // Consent Level
                    consentSection

                    // Kill Switch
                    killSwitchSection

                    // Site Permissions
                    sitePermissionsSection

                    // Data Management
                    dataManagementSection

                    // Privacy Nutrition Labels
                    nutritionLabelsSection
                }
                .padding()
            }
            .background(Color.orionBackground)
            .navigationTitle("Privacy")
            .navigationBarTitleDisplayMode(.large)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Menu {
                        Button {
                            showingDataExport = true
                        } label: {
                            Label("Export My Data", systemImage: "square.and.arrow.up")
                        }

                        Button(role: .destructive) {
                            showingDeleteConfirmation = true
                        } label: {
                            Label("Delete All Data", systemImage: "trash")
                        }
                    } label: {
                        Image(systemName: "ellipsis.circle")
                    }
                }
            }
            .sheet(isPresented: $showingConsentSheet) {
                ConsentFlowView(currentLevel: viewModel.consentState.level) { newLevel in
                    viewModel.updateConsentLevel(newLevel)
                }
            }
            .alert("Delete All Data?", isPresented: $showingDeleteConfirmation) {
                Button("Cancel", role: .cancel) {}
                Button("Delete", role: .destructive) {
                    viewModel.requestDataDeletion()
                }
            } message: {
                Text("This will permanently delete all your browsing data, knowledge graph, and AI learning. This cannot be undone.")
            }
        }
        .onAppear {
            viewModel.loadState()
        }
    }

    // MARK: - Stats Section
    private var statsSection: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Privacy Overview")
                .font(.headline)
                .foregroundColor(.orionText)

            LazyVGrid(columns: [
                GridItem(.flexible()),
                GridItem(.flexible())
            ], spacing: 12) {
                StatCard(
                    title: "Data Points",
                    value: "\(viewModel.totalDataPoints)",
                    icon: "chart.bar.doc.horizontal",
                    color: .blue
                )

                StatCard(
                    title: "Days Retained",
                    value: "\(viewModel.retentionPolicy.autoDeleteDays)",
                    icon: "calendar",
                    color: .orange
                )

                StatCard(
                    title: "Sites Tracked",
                    value: "\(viewModel.sitePermissions.count)",
                    icon: "globe",
                    color: .green
                )

                StatCard(
                    title: "AI Events",
                    value: "\(viewModel.aiEventCount)",
                    icon: "sparkles",
                    color: .purple
                )
            }
        }
    }

    // MARK: - Active Indicators Section
    private var activeIndicatorsSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Active Now")
                .font(.headline)
                .foregroundColor(.orionText)

            ForEach(viewModel.activeIndicators) { indicator in
                HStack(spacing: 12) {
                    Circle()
                        .fill(indicatorColor(for: indicator.type))
                        .frame(width: 8, height: 8)
                        .overlay(
                            Circle()
                                .stroke(indicatorColor(for: indicator.type).opacity(0.5), lineWidth: 4)
                                .scaleEffect(indicator.isActive ? 1.5 : 1.0)
                                .opacity(indicator.isActive ? 0 : 1)
                                .animation(.easeOut(duration: 1).repeatForever(autoreverses: false), value: indicator.isActive)
                        )

                    VStack(alignment: .leading, spacing: 2) {
                        Text(indicator.type.rawValue.capitalized)
                            .font(.subheadline)
                            .fontWeight(.medium)
                            .foregroundColor(.orionText)

                        Text(indicator.description)
                            .font(.caption)
                            .foregroundColor(.orionTextSecondary)
                    }

                    Spacer()

                    if let domain = indicator.domain {
                        Text(domain)
                            .font(.caption)
                            .foregroundColor(.orionTextTertiary)
                    }
                }
                .padding()
                .background(Color.orionSurface)
                .cornerRadius(12)
            }
        }
    }

    // MARK: - Consent Section
    private var consentSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("AI Learning Level")
                .font(.headline)
                .foregroundColor(.orionText)

            Button {
                showingConsentSheet = true
            } label: {
                HStack {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(viewModel.consentState.level.displayName)
                            .font(.title3)
                            .fontWeight(.semibold)
                            .foregroundColor(.orionText)

                        Text(viewModel.consentState.level.description)
                            .font(.caption)
                            .foregroundColor(.orionTextSecondary)
                    }

                    Spacer()

                    Image(systemName: "chevron.right")
                        .foregroundColor(.orionTextTertiary)
                }
                .padding()
                .background(Color.orionSurface)
                .cornerRadius(12)
            }

            // Feature toggles based on consent
            if viewModel.consentState.level != .none {
                VStack(spacing: 0) {
                    ToggleRow(
                        title: "Browsing Analysis",
                        subtitle: "Analyze pages you visit",
                        isOn: $viewModel.consentState.browsingAnalysis
                    )
                    Divider()
                    ToggleRow(
                        title: "Voice Processing",
                        subtitle: "Process voice commands",
                        isOn: $viewModel.consentState.voiceProcessing
                    )
                    Divider()
                    ToggleRow(
                        title: "Cross-Session Learning",
                        subtitle: "Learn across sessions",
                        isOn: $viewModel.consentState.crossSessionLearning
                    )
                }
                .background(Color.orionSurface)
                .cornerRadius(12)
            }
        }
    }

    // MARK: - Kill Switch Section
    private var killSwitchSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Emergency Controls")
                .font(.headline)
                .foregroundColor(.orionText)

            Button {
                if appState.isKillSwitchActive {
                    appState.deactivateKillSwitch()
                } else {
                    appState.activateKillSwitch(reason: "User activated")
                }
            } label: {
                HStack {
                    Image(systemName: appState.isKillSwitchActive ? "power.circle.fill" : "power.circle")
                        .font(.title2)
                        .foregroundColor(appState.isKillSwitchActive ? .red : .orionTextSecondary)

                    VStack(alignment: .leading, spacing: 2) {
                        Text("Kill Switch")
                            .font(.subheadline)
                            .fontWeight(.medium)
                            .foregroundColor(.orionText)

                        Text(appState.isKillSwitchActive ? "All AI features disabled" : "Instantly stop all AI activity")
                            .font(.caption)
                            .foregroundColor(.orionTextSecondary)
                    }

                    Spacer()

                    Text(appState.isKillSwitchActive ? "Active" : "Off")
                        .font(.caption)
                        .fontWeight(.medium)
                        .foregroundColor(appState.isKillSwitchActive ? .red : .orionTextTertiary)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 4)
                        .background(appState.isKillSwitchActive ? Color.red.opacity(0.15) : Color.orionSurface)
                        .cornerRadius(6)
                }
                .padding()
                .background(Color.orionSurface)
                .cornerRadius(12)
            }
        }
    }

    // MARK: - Site Permissions Section
    private var sitePermissionsSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text("Site Permissions")
                    .font(.headline)
                    .foregroundColor(.orionText)

                Spacer()

                NavigationLink {
                    SitePermissionsListView(permissions: viewModel.sitePermissions)
                } label: {
                    Text("See All")
                        .font(.subheadline)
                        .foregroundColor(.orionAccent)
                }
            }

            ForEach(viewModel.sitePermissions.prefix(3)) { permission in
                SitePermissionRow(permission: permission)
            }
        }
    }

    // MARK: - Data Management Section
    private var dataManagementSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Data Management")
                .font(.headline)
                .foregroundColor(.orionText)

            VStack(spacing: 0) {
                NavigationLink {
                    RetentionPolicyView(policy: $viewModel.retentionPolicy)
                } label: {
                    SettingsRow(
                        icon: "clock.arrow.circlepath",
                        title: "Retention Policy",
                        subtitle: "\(viewModel.retentionPolicy.autoDeleteDays) days"
                    )
                }

                Divider()

                NavigationLink {
                    AuditLogView()
                } label: {
                    SettingsRow(
                        icon: "list.bullet.rectangle",
                        title: "Audit Log",
                        subtitle: "View all data access"
                    )
                }
            }
            .background(Color.orionSurface)
            .cornerRadius(12)
        }
    }

    // MARK: - Nutrition Labels Section
    private var nutritionLabelsSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("App Privacy")
                .font(.headline)
                .foregroundColor(.orionText)

            Text("Data types collected by this app")
                .font(.caption)
                .foregroundColor(.orionTextSecondary)

            ForEach(NutritionLabel.appStoreLabels) { label in
                NutritionLabelRow(label: label)
            }
        }
    }

    // MARK: - Helpers
    private func indicatorColor(for type: PrivacyIndicator.IndicatorType) -> Color {
        switch type {
        case .learning: return .purple
        case .voice: return .blue
        case .tracking: return .orange
        case .export: return .green
        }
    }
}

// MARK: - Supporting Views
struct StatCard: View {
    let title: String
    let value: String
    let icon: String
    let color: Color

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Image(systemName: icon)
                .font(.title2)
                .foregroundColor(color)

            Text(value)
                .font(.title2)
                .fontWeight(.bold)
                .foregroundColor(.orionText)

            Text(title)
                .font(.caption)
                .foregroundColor(.orionTextSecondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding()
        .background(Color.orionSurface)
        .cornerRadius(12)
    }
}

struct ToggleRow: View {
    let title: String
    let subtitle: String
    @Binding var isOn: Bool

    var body: some View {
        Toggle(isOn: $isOn) {
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(.subheadline)
                    .foregroundColor(.orionText)
                Text(subtitle)
                    .font(.caption)
                    .foregroundColor(.orionTextSecondary)
            }
        }
        .tint(.orionAccent)
        .padding()
    }
}

struct SettingsRow: View {
    let icon: String
    let title: String
    let subtitle: String

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: icon)
                .font(.title3)
                .foregroundColor(.orionAccent)
                .frame(width: 28)

            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(.subheadline)
                    .foregroundColor(.orionText)
                Text(subtitle)
                    .font(.caption)
                    .foregroundColor(.orionTextSecondary)
            }

            Spacer()

            Image(systemName: "chevron.right")
                .font(.caption)
                .foregroundColor(.orionTextTertiary)
        }
        .padding()
    }
}

struct SitePermissionRow: View {
    let permission: SitePermission

    var body: some View {
        HStack {
            VStack(alignment: .leading, spacing: 2) {
                Text(permission.domain)
                    .font(.subheadline)
                    .fontWeight(.medium)
                    .foregroundColor(.orionText)

                Text(permission.lastVisited, style: .relative)
                    .font(.caption)
                    .foregroundColor(.orionTextSecondary)
            }

            Spacer()

            HStack(spacing: 8) {
                PermissionBadge(state: permission.tracking, icon: "eye")
                PermissionBadge(state: permission.aiLearning ? .allow : .block, icon: "brain")
            }
        }
        .padding()
        .background(Color.orionSurface)
        .cornerRadius(12)
    }
}

struct PermissionBadge: View {
    let state: SitePermission.PermissionState
    let icon: String

    var body: some View {
        Image(systemName: icon)
            .font(.caption)
            .foregroundColor(badgeColor)
            .padding(6)
            .background(badgeColor.opacity(0.15))
            .cornerRadius(6)
    }

    private var badgeColor: Color {
        switch state {
        case .allow: return .green
        case .block: return .red
        case .ask: return .orange
        }
    }
}

struct NutritionLabelRow: View {
    let label: NutritionLabel

    var body: some View {
        HStack {
            VStack(alignment: .leading, spacing: 4) {
                Text(label.category)
                    .font(.subheadline)
                    .fontWeight(.medium)
                    .foregroundColor(.orionText)

                Text(label.purpose)
                    .font(.caption)
                    .foregroundColor(.orionTextSecondary)
            }

            Spacer()

            VStack(alignment: .trailing, spacing: 4) {
                if label.linkedToIdentity {
                    Label("Linked", systemImage: "link")
                        .font(.caption2)
                        .foregroundColor(.orange)
                }
                if label.usedForTracking {
                    Label("Tracking", systemImage: "location")
                        .font(.caption2)
                        .foregroundColor(.red)
                }
            }
        }
        .padding()
        .background(Color.orionSurface)
        .cornerRadius(12)
    }
}

// MARK: - Placeholder Views
struct SitePermissionsListView: View {
    let permissions: [SitePermission]

    var body: some View {
        List(permissions) { permission in
            SitePermissionRow(permission: permission)
                .listRowBackground(Color.clear)
                .listRowSeparator(.hidden)
        }
        .listStyle(.plain)
        .navigationTitle("Site Permissions")
    }
}

struct RetentionPolicyView: View {
    @Binding var policy: RetentionPolicy

    var body: some View {
        Form {
            Section("Auto-Delete") {
                Stepper("Delete after \(policy.autoDeleteDays) days", value: $policy.autoDeleteDays, in: 7...365)
            }

            Section("Keep Data") {
                Toggle("Bookmarks", isOn: $policy.keepBookmarks)
                Toggle("Downloads", isOn: $policy.keepDownloads)
                Toggle("AI Knowledge", isOn: $policy.keepKnowledgeGraph)
            }
        }
        .navigationTitle("Retention Policy")
    }
}

struct AuditLogView: View {
    var body: some View {
        Text("Audit Log")
            .navigationTitle("Audit Log")
    }
}

struct ConsentFlowView: View {
    let currentLevel: ConsentLevel
    let onComplete: (ConsentLevel) -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var selectedLevel: ConsentLevel

    init(currentLevel: ConsentLevel, onComplete: @escaping (ConsentLevel) -> Void) {
        self.currentLevel = currentLevel
        self.onComplete = onComplete
        self._selectedLevel = State(initialValue: currentLevel)
    }

    var body: some View {
        NavigationStack {
            VStack(spacing: 24) {
                ForEach(ConsentLevel.allCases, id: \.self) { level in
                    Button {
                        selectedLevel = level
                    } label: {
                        HStack {
                            VStack(alignment: .leading, spacing: 4) {
                                Text(level.displayName)
                                    .font(.headline)
                                    .foregroundColor(.orionText)
                                Text(level.description)
                                    .font(.caption)
                                    .foregroundColor(.orionTextSecondary)
                            }

                            Spacer()

                            if selectedLevel == level {
                                Image(systemName: "checkmark.circle.fill")
                                    .foregroundColor(.orionAccent)
                            }
                        }
                        .padding()
                        .background(Color.orionSurface)
                        .cornerRadius(12)
                        .overlay(
                            RoundedRectangle(cornerRadius: 12)
                                .stroke(selectedLevel == level ? Color.orionAccent : Color.clear, lineWidth: 2)
                        )
                    }
                }

                Spacer()

                Button {
                    onComplete(selectedLevel)
                    dismiss()
                } label: {
                    Text("Confirm")
                        .font(.headline)
                        .frame(maxWidth: .infinity)
                        .padding()
                        .background(Color.orionAccent)
                        .foregroundColor(.white)
                        .cornerRadius(12)
                }
            }
            .padding()
            .navigationTitle("AI Learning Level")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Cancel") {
                        dismiss()
                    }
                }
            }
        }
    }
}

#Preview {
    PrivacyControlView()
        .environmentObject(AppState())
}
