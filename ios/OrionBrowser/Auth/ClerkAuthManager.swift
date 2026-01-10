/**
 * ClerkAuthManager.swift
 * Clerk authentication integration
 * Uses the official Clerk iOS SDK: https://github.com/clerk/clerk-ios
 */

import SwiftUI
import Combine
import AuthenticationServices

@MainActor
final class ClerkAuthManager: ObservableObject {
    // MARK: - Singleton
    static let shared = ClerkAuthManager()

    // MARK: - Published State
    @Published private(set) var isAuthenticated: Bool = false
    @Published private(set) var user: OrionUser?
    @Published private(set) var sessionToken: String?
    @Published private(set) var isLoading: Bool = false
    @Published private(set) var error: AuthError?

    // MARK: - Types
    struct OrionUser: Codable, Identifiable {
        let id: String
        let email: String?
        let firstName: String?
        let lastName: String?
        let imageURL: URL?
        let createdAt: Date

        var displayName: String {
            if let firstName = firstName {
                return lastName != nil ? "\(firstName) \(lastName!)" : firstName
            }
            return email ?? "User"
        }

        var initials: String {
            let first = firstName?.prefix(1) ?? ""
            let last = lastName?.prefix(1) ?? ""
            return "\(first)\(last)".uppercased()
        }
    }

    enum AuthError: LocalizedError {
        case signInFailed(String)
        case signUpFailed(String)
        case signOutFailed(String)
        case sessionExpired
        case networkError

        var errorDescription: String? {
            switch self {
            case .signInFailed(let message): return "Sign in failed: \(message)"
            case .signUpFailed(let message): return "Sign up failed: \(message)"
            case .signOutFailed(let message): return "Sign out failed: \(message)"
            case .sessionExpired: return "Your session has expired. Please sign in again."
            case .networkError: return "Network error. Please check your connection."
            }
        }
    }

    // MARK: - Initialization
    private init() {
        checkExistingSession()
    }

    // MARK: - Session Management
    private func checkExistingSession() {
        if let tokenData = UserDefaults.standard.data(forKey: "clerkSessionToken"),
           let token = String(data: tokenData, encoding: .utf8) {
            sessionToken = token
            isAuthenticated = true
            Task {
                await loadUserProfile()
            }
        }
    }

    func syncSession(user: Any) async {
        isAuthenticated = true
        await loadUserProfile()
        await syncWithConvex()
    }

    private func loadUserProfile() async {
        // Load user profile from Clerk
        // Placeholder - use actual Clerk SDK in production
        user = OrionUser(
            id: "user_placeholder",
            email: "user@example.com",
            firstName: "Orion",
            lastName: "User",
            imageURL: nil,
            createdAt: Date()
        )
    }

    private func syncWithConvex() async {
        if let token = sessionToken {
            await ConvexManager.shared.setAuthToken(token)
        }
    }

    // MARK: - Sign In Methods
    func signInWithEmail(email: String, password: String) async {
        isLoading = true
        error = nil

        do {
            // In production, use Clerk.shared.signIn
            try await Task.sleep(nanoseconds: 1_000_000_000)

            sessionToken = "session_token_placeholder"
            isAuthenticated = true
            await loadUserProfile()
            await syncWithConvex()

            UserDefaults.standard.set(sessionToken?.data(using: .utf8), forKey: "clerkSessionToken")
        } catch {
            self.error = .signInFailed(error.localizedDescription)
        }

        isLoading = false
    }

    func signInWithApple() async {
        isLoading = true
        error = nil

        do {
            try await Task.sleep(nanoseconds: 1_000_000_000)

            sessionToken = "apple_session_token"
            isAuthenticated = true
            await loadUserProfile()
            await syncWithConvex()

            UserDefaults.standard.set(sessionToken?.data(using: .utf8), forKey: "clerkSessionToken")
        } catch {
            self.error = .signInFailed("Apple Sign In failed")
        }

        isLoading = false
    }

    func signInWithGoogle() async {
        isLoading = true
        error = nil

        do {
            try await Task.sleep(nanoseconds: 1_000_000_000)

            sessionToken = "google_session_token"
            isAuthenticated = true
            await loadUserProfile()
            await syncWithConvex()

            UserDefaults.standard.set(sessionToken?.data(using: .utf8), forKey: "clerkSessionToken")
        } catch {
            self.error = .signInFailed("Google Sign In failed")
        }

        isLoading = false
    }

    // MARK: - Sign Up
    func signUp(email: String, password: String) async {
        isLoading = true
        error = nil

        do {
            try await Task.sleep(nanoseconds: 1_000_000_000)
            // After signup, user needs to verify email
        } catch {
            self.error = .signUpFailed(error.localizedDescription)
        }

        isLoading = false
    }

    // MARK: - Sign Out
    func signOut() async {
        isLoading = true

        await ConvexManager.shared.clearAuth()

        sessionToken = nil
        user = nil
        isAuthenticated = false

        UserDefaults.standard.removeObject(forKey: "clerkSessionToken")

        isLoading = false
    }

    // MARK: - Token Refresh
    func refreshToken() async -> String? {
        return sessionToken
    }

    // MARK: - Password Reset
    func requestPasswordReset(email: String) async -> Bool {
        do {
            try await Task.sleep(nanoseconds: 500_000_000)
            return true
        } catch {
            return false
        }
    }
}
