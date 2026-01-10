/**
 * OnboardingView.swift
 * First-time user onboarding flow
 * SUB-AGENT 1: SwiftUI & UX Architect
 */

import SwiftUI

struct OnboardingView: View {
    @EnvironmentObject var appState: AppState
    @State private var currentPage = 0
    @State private var showConsentFlow = false

    private let pages: [OnboardingPage] = [
        OnboardingPage(
            icon: "globe",
            title: "Welcome to Orion",
            subtitle: "An AI-powered browser that learns with you",
            description: "Experience intelligent browsing that adapts to your interests while keeping you in complete control."
        ),
        OnboardingPage(
            icon: "brain.head.profile",
            title: "AI That Learns",
            subtitle: "Your personal browsing assistant",
            description: "Orion builds a knowledge graph from your browsing, surfacing insights and connections you might miss."
        ),
        OnboardingPage(
            icon: "hand.raised.fill",
            title: "Privacy First",
            subtitle: "You're always in control",
            description: "Choose what Orion learns. Review, edit, or delete any information. Your data stays on your device and secure cloud."
        ),
        OnboardingPage(
            icon: "mic.fill",
            title: "Voice & Vision",
            subtitle: "Hands-free browsing",
            description: "Use voice commands to navigate, search, and interact. Capture moments with intelligent media recording."
        )
    ]

    var body: some View {
        VStack(spacing: 0) {
            // Skip button
            HStack {
                Spacer()
                Button("Skip") {
                    completeOnboarding()
                }
                .foregroundColor(.orionTextSecondary)
                .padding()
            }

            // Page content
            TabView(selection: $currentPage) {
                ForEach(Array(pages.enumerated()), id: \.offset) { index, page in
                    OnboardingPageView(page: page)
                        .tag(index)
                }
            }
            .tabViewStyle(.page(indexDisplayMode: .never))

            // Page indicators
            HStack(spacing: 8) {
                ForEach(0..<pages.count, id: \.self) { index in
                    Circle()
                        .fill(index == currentPage ? Color.orionAccent : Color.orionBorder)
                        .frame(width: 8, height: 8)
                        .animation(.easeInOut(duration: 0.2), value: currentPage)
                }
            }
            .padding(.vertical, 24)

            // Navigation buttons
            VStack(spacing: 12) {
                Button {
                    if currentPage < pages.count - 1 {
                        withAnimation {
                            currentPage += 1
                        }
                    } else {
                        showConsentFlow = true
                    }
                } label: {
                    Text(currentPage < pages.count - 1 ? "Continue" : "Get Started")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.orionPrimary)

                if currentPage > 0 {
                    Button {
                        withAnimation {
                            currentPage -= 1
                        }
                    } label: {
                        Text("Back")
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.orionSecondary)
                }
            }
            .padding(.horizontal, 32)
            .padding(.bottom, 48)
        }
        .background(Color.orionBackground)
        .sheet(isPresented: $showConsentFlow) {
            ConsentOnboardingView {
                completeOnboarding()
            }
        }
    }

    private func completeOnboarding() {
        appState.hasCompletedOnboarding = true
    }
}

// MARK: - Onboarding Page Model
struct OnboardingPage: Identifiable {
    let id = UUID()
    let icon: String
    let title: String
    let subtitle: String
    let description: String
}

// MARK: - Onboarding Page View
struct OnboardingPageView: View {
    let page: OnboardingPage

    var body: some View {
        VStack(spacing: 24) {
            Spacer()

            // Icon
            Image(systemName: page.icon)
                .font(.system(size: 80, weight: .thin))
                .foregroundColor(.orionAccent)
                .frame(height: 120)

            // Title
            Text(page.title)
                .font(.largeTitle)
                .fontWeight(.bold)
                .multilineTextAlignment(.center)

            // Subtitle
            Text(page.subtitle)
                .font(.title3)
                .foregroundColor(.orionAccent)
                .multilineTextAlignment(.center)

            // Description
            Text(page.description)
                .font(.body)
                .foregroundColor(.orionTextSecondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 32)

            Spacer()
            Spacer()
        }
        .padding()
    }
}

// MARK: - Consent Onboarding View
struct ConsentOnboardingView: View {
    @State private var selectedLevel: ConsentLevel = .standard
    let onComplete: () -> Void

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 24) {
                    // Header
                    VStack(spacing: 12) {
                        Image(systemName: "shield.checkered")
                            .font(.system(size: 60, weight: .thin))
                            .foregroundColor(.orionAccent)

                        Text("Choose Your Privacy Level")
                            .font(.title2)
                            .fontWeight(.bold)

                        Text("You can change this anytime in Settings")
                            .font(.subheadline)
                            .foregroundColor(.orionTextSecondary)
                    }
                    .padding(.top, 24)

                    // Consent options
                    VStack(spacing: 16) {
                        ConsentOptionCard(
                            level: .minimal,
                            isSelected: selectedLevel == .minimal,
                            onSelect: { selectedLevel = .minimal }
                        )

                        ConsentOptionCard(
                            level: .standard,
                            isSelected: selectedLevel == .standard,
                            onSelect: { selectedLevel = .standard }
                        )

                        ConsentOptionCard(
                            level: .full,
                            isSelected: selectedLevel == .full,
                            onSelect: { selectedLevel = .full }
                        )
                    }
                    .padding(.horizontal)

                    // Info box
                    VStack(alignment: .leading, spacing: 8) {
                        Label("Your Data Rights", systemImage: "info.circle")
                            .font(.headline)

                        Text("• View everything Orion learns about you")
                        Text("• Edit or delete any information")
                        Text("• Export your data anytime")
                        Text("• Request complete data deletion")
                    }
                    .font(.caption)
                    .foregroundColor(.orionTextSecondary)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding()
                    .background(Color.orionSurface)
                    .cornerRadius(12)
                    .padding(.horizontal)
                }
            }
            .navigationTitle("Privacy Setup")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") {
                        saveConsentAndComplete()
                    }
                }
            }
        }
    }

    private func saveConsentAndComplete() {
        // Save consent level
        Task {
            // Build modalities dictionary based on selected consent level
            var modalities: [ConsentModality: Bool] = [:]
            for modality in ConsentModality.allCases {
                modalities[modality] = selectedLevel.enabledModalities.contains(modality)
            }

            let state = ConsentState(
                level: selectedLevel,
                modalities: modalities,
                globalEnabled: selectedLevel != .none,
                version: "1.0",
                lastUpdated: Date(),
                hasCompletedOnboarding: true,
                ageVerified: true,
                termsAcceptedDate: Date(),
                privacyPolicyAcceptedDate: Date()
            )
            await ConvexManager.shared.updateConsentState(state)
        }
        onComplete()
    }
}

// MARK: - Consent Option Card
struct ConsentOptionCard: View {
    let level: ConsentLevel
    let isSelected: Bool
    let onSelect: () -> Void

    var body: some View {
        Button(action: onSelect) {
            HStack(spacing: 16) {
                // Selection indicator
                Image(systemName: isSelected ? "checkmark.circle.fill" : "circle")
                    .font(.title2)
                    .foregroundColor(isSelected ? .orionAccent : .orionBorder)

                // Content
                VStack(alignment: .leading, spacing: 4) {
                    Text(level.displayName)
                        .font(.headline)
                        .foregroundColor(.orionText)

                    Text(level.description)
                        .font(.caption)
                        .foregroundColor(.orionTextSecondary)
                        .multilineTextAlignment(.leading)
                }

                Spacer()
            }
            .padding()
            .background(
                RoundedRectangle(cornerRadius: 12)
                    .fill(Color.orionSurface)
                    .overlay(
                        RoundedRectangle(cornerRadius: 12)
                            .stroke(isSelected ? Color.orionAccent : Color.clear, lineWidth: 2)
                    )
            )
        }
        .buttonStyle(.plain)
    }
}

#Preview {
    OnboardingView()
        .environmentObject(AppState())
}
