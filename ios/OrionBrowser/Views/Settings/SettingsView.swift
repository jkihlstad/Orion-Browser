/**
 * SettingsView.swift
 * App settings and preferences
 * SUB-AGENT 1: SwiftUI & UX Architect
 */

import SwiftUI

struct SettingsView: View {
    @EnvironmentObject var appState: AppState
    @EnvironmentObject var authManager: ClerkAuthManager
    @State private var showingSignOutAlert = false

    var body: some View {
        NavigationStack {
            List {
                // User Section
                if let user = authManager.user {
                    userSection(user)
                }

                // Appearance
                appearanceSection

                // AI Settings
                aiSection

                // Browser Settings
                browserSection

                // About
                aboutSection

                // Account Actions
                accountSection
            }
            .navigationTitle("Settings")
            .navigationBarTitleDisplayMode(.large)
            .alert("Sign Out?", isPresented: $showingSignOutAlert) {
                Button("Cancel", role: .cancel) {}
                Button("Sign Out", role: .destructive) {
                    Task {
                        await authManager.signOut()
                    }
                }
            } message: {
                Text("You will need to sign in again to sync your data.")
            }
        }
    }

    // MARK: - User Section
    private func userSection(_ user: ClerkAuthManager.OrionUser) -> some View {
        Section {
            HStack(spacing: 16) {
                // Avatar
                if let imageURL = user.imageURL {
                    AsyncImage(url: imageURL) { image in
                        image.resizable()
                    } placeholder: {
                        initialsAvatar(user.initials)
                    }
                    .frame(width: 60, height: 60)
                    .clipShape(Circle())
                } else {
                    initialsAvatar(user.initials)
                }

                // User Info
                VStack(alignment: .leading, spacing: 4) {
                    Text(user.displayName)
                        .font(.headline)

                    if let email = user.email {
                        Text(email)
                            .font(.subheadline)
                            .foregroundColor(.orionTextSecondary)
                    }
                }
            }
            .padding(.vertical, 8)
        }
    }

    private func initialsAvatar(_ initials: String) -> some View {
        Circle()
            .fill(Color.orionAccent)
            .frame(width: 60, height: 60)
            .overlay(
                Text(initials)
                    .font(.title2)
                    .fontWeight(.semibold)
                    .foregroundColor(.white)
            )
    }

    // MARK: - Appearance Section
    private var appearanceSection: some View {
        Section("Appearance") {
            Toggle("Dark Mode", isOn: $appState.useDarkMode)

            NavigationLink {
                Text("Theme Settings")
            } label: {
                Label("Theme", systemImage: "paintbrush")
            }

            NavigationLink {
                Text("Font Settings")
            } label: {
                Label("Font Size", systemImage: "textformat.size")
            }
        }
    }

    // MARK: - AI Section
    private var aiSection: some View {
        Section("AI Intelligence") {
            Picker("AI Level", selection: $appState.aiLevel) {
                ForEach(Configuration.enabledAILevels, id: \.self) { level in
                    Text(level.rawValue.capitalized).tag(level)
                }
            }

            NavigationLink {
                SuppressionRulesView()
            } label: {
                Label("Suppression Rules", systemImage: "eye.slash")
            }

            NavigationLink {
                Text("Model Preferences")
            } label: {
                Label("Model Preferences", systemImage: "cpu")
            }
        }
    }

    // MARK: - Browser Section
    private var browserSection: some View {
        Section("Browser") {
            NavigationLink {
                SearchEngineSettingsView()
            } label: {
                HStack {
                    Label("Search Engine", systemImage: "magnifyingglass")
                    Spacer()
                    Text("Google")
                        .foregroundColor(.orionTextSecondary)
                }
            }

            NavigationLink {
                Text("Downloads")
            } label: {
                Label("Downloads", systemImage: "arrow.down.circle")
            }

            NavigationLink {
                Text("Content Blockers")
            } label: {
                Label("Content Blockers", systemImage: "shield")
            }

            Toggle("Request Desktop Site", isOn: .constant(false))
        }
    }

    // MARK: - About Section
    private var aboutSection: some View {
        Section("About") {
            HStack {
                Text("Version")
                Spacer()
                Text("\(Configuration.appVersion) (\(Configuration.buildNumber))")
                    .foregroundColor(.orionTextSecondary)
            }

            NavigationLink {
                LicensesView()
            } label: {
                Label("Licenses", systemImage: "doc.text")
            }

            Link(destination: URL(string: "https://orion.browser/privacy")!) {
                Label("Privacy Policy", systemImage: "hand.raised")
            }

            Link(destination: URL(string: "https://orion.browser/terms")!) {
                Label("Terms of Service", systemImage: "doc.plaintext")
            }
        }
    }

    // MARK: - Account Section
    private var accountSection: some View {
        Section {
            Button(role: .destructive) {
                showingSignOutAlert = true
            } label: {
                HStack {
                    Spacer()
                    Text("Sign Out")
                    Spacer()
                }
            }
        }
    }
}

// MARK: - Supporting Views
struct SuppressionRulesView: View {
    @State private var rules: [SuppressionRule] = []
    @State private var showingAddRule = false
    @State private var newRuleValue = ""
    @State private var newRuleType: SuppressionRule.RuleType = .keyword

    var body: some View {
        List {
            Section {
                ForEach(rules) { rule in
                    HStack {
                        VStack(alignment: .leading, spacing: 4) {
                            Text(rule.value)
                                .font(.body)

                            Text(rule.type.rawValue.capitalized)
                                .font(.caption)
                                .foregroundColor(.orionTextSecondary)
                        }

                        Spacer()

                        Toggle("", isOn: Binding(
                            get: { rule.isActive },
                            set: { _ in toggleRule(rule) }
                        ))
                        .labelsHidden()
                    }
                }
                .onDelete(perform: deleteRules)
            } header: {
                Text("Active Rules")
            } footer: {
                Text("AI will not learn from content matching these rules.")
            }
        }
        .navigationTitle("Suppression Rules")
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button {
                    showingAddRule = true
                } label: {
                    Image(systemName: "plus")
                }
            }
        }
        .sheet(isPresented: $showingAddRule) {
            NavigationStack {
                Form {
                    Picker("Type", selection: $newRuleType) {
                        ForEach([SuppressionRule.RuleType.keyword, .topic, .domain, .pattern], id: \.self) { type in
                            Text(type.rawValue.capitalized).tag(type)
                        }
                    }

                    TextField("Value", text: $newRuleValue)
                }
                .navigationTitle("Add Rule")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) {
                        Button("Cancel") {
                            showingAddRule = false
                        }
                    }
                    ToolbarItem(placement: .confirmationAction) {
                        Button("Add") {
                            addRule()
                        }
                        .disabled(newRuleValue.isEmpty)
                    }
                }
            }
            .presentationDetents([.medium])
        }
    }

    private func addRule() {
        let rule = SuppressionRule(type: newRuleType, value: newRuleValue)
        rules.append(rule)
        newRuleValue = ""
        showingAddRule = false
    }

    private func toggleRule(_ rule: SuppressionRule) {
        if let index = rules.firstIndex(where: { $0.id == rule.id }) {
            rules[index].isActive.toggle()
        }
    }

    private func deleteRules(at offsets: IndexSet) {
        rules.remove(atOffsets: offsets)
    }
}

struct SearchEngineSettingsView: View {
    @State private var selectedEngine = "Google"

    let engines = ["Google", "DuckDuckGo", "Bing", "Ecosia", "Brave"]

    var body: some View {
        List {
            ForEach(engines, id: \.self) { engine in
                Button {
                    selectedEngine = engine
                } label: {
                    HStack {
                        Text(engine)
                            .foregroundColor(.orionText)

                        Spacer()

                        if selectedEngine == engine {
                            Image(systemName: "checkmark")
                                .foregroundColor(.orionAccent)
                        }
                    }
                }
            }
        }
        .navigationTitle("Search Engine")
    }
}

struct LicensesView: View {
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                Text("Open Source Licenses")
                    .font(.title2)
                    .fontWeight(.bold)

                LicenseItem(
                    name: "Convex Swift",
                    license: "Apache 2.0",
                    url: "https://github.com/get-convex/convex-swift"
                )

                LicenseItem(
                    name: "Clerk iOS SDK",
                    license: "MIT",
                    url: "https://github.com/clerk/clerk-ios"
                )
            }
            .padding()
        }
        .navigationTitle("Licenses")
    }
}

struct LicenseItem: View {
    let name: String
    let license: String
    let url: String

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(name)
                .font(.headline)

            Text(license)
                .font(.subheadline)
                .foregroundColor(.orionTextSecondary)

            if let url = URL(string: url) {
                Link(destination: url) {
                    Text("View on GitHub")
                        .font(.caption)
                        .foregroundColor(.orionAccent)
                }
            }
        }
        .padding()
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.orionSurface)
        .cornerRadius(12)
    }
}

#Preview {
    SettingsView()
        .environmentObject(AppState())
        .environmentObject(ClerkAuthManager.shared)
}
