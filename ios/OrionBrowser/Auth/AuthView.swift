/**
 * AuthView.swift
 * Authentication gate view
 */

import SwiftUI

struct AuthView: View {
    @EnvironmentObject private var env: AppEnvironment
    @State private var isAuthenticated = false

    var body: some View {
        Group {
            if isAuthenticated {
                MainTabView()
            } else {
                AuthGateContent()
            }
        }
        .task {
            // Check auth state
            await checkAuthState()
        }
    }

    private func checkAuthState() async {
        // For now, auto-authenticate to allow app to run
        // Replace with actual Clerk auth check
        isAuthenticated = true
    }
}

// MARK: - Auth Gate Content
private struct AuthGateContent: View {
    var body: some View {
        VStack(spacing: 24) {
            Image(systemName: "person.circle.fill")
                .font(.system(size: 80))
                .foregroundStyle(.secondary)

            Text("Welcome to Orion")
                .font(.largeTitle.bold())

            Text("Sign in to continue")
                .foregroundStyle(.secondary)

            Button {
                // Handle sign in
            } label: {
                Text("Sign In")
                    .frame(maxWidth: .infinity)
                    .padding()
                    .background(.blue)
                    .foregroundStyle(.white)
                    .clipShape(RoundedRectangle(cornerRadius: 12))
            }
            .padding(.horizontal, 40)
        }
        .padding()
    }
}

// MARK: - Main Tab View (placeholder if not exists)
struct MainTabView: View {
    var body: some View {
        TabView {
            BrowserView()
                .tabItem {
                    Label("Browse", systemImage: "globe")
                }

            SettingsView()
                .tabItem {
                    Label("Settings", systemImage: "gear")
                }
        }
    }
}
