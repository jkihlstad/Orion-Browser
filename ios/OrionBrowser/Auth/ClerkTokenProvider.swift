/**
 * ClerkTokenProvider.swift
 * Token provider for authenticated API requests
 */

import Foundation

protocol TokenProvider {
    func getToken() async -> String?
    func refreshToken() async -> String?
}

final class ClerkTokenProvider: TokenProvider {
    // MARK: - Singleton
    static let shared = ClerkTokenProvider()

    // MARK: - Properties
    private let tokenKey = "clerkSessionToken"
    private var cachedToken: String?
    private var tokenExpiry: Date?

    // MARK: - Initialization
    private init() {
        loadCachedToken()
    }

    // MARK: - Get Token
    func getToken() async -> String? {
        // Check if cached token is valid
        if let token = cachedToken, let expiry = tokenExpiry, expiry > Date() {
            return token
        }

        // Try to refresh
        return await refreshToken()
    }

    // MARK: - Refresh Token
    func refreshToken() async -> String? {
        let newToken = await ClerkAuthManager.shared.refreshToken()

        if let token = newToken {
            cachedToken = token
            tokenExpiry = Date().addingTimeInterval(3600) // 1 hour
            saveToken(token)
        }

        return newToken
    }

    // MARK: - Clear Token
    func clearToken() {
        cachedToken = nil
        tokenExpiry = nil
        UserDefaults.standard.removeObject(forKey: tokenKey)
    }

    // MARK: - Persistence
    private func loadCachedToken() {
        if let data = UserDefaults.standard.data(forKey: tokenKey),
           let token = String(data: data, encoding: .utf8) {
            cachedToken = token
            // Assume token is valid for 1 hour
            tokenExpiry = Date().addingTimeInterval(3600)
        }
    }

    private func saveToken(_ token: String) {
        if let data = token.data(using: .utf8) {
            UserDefaults.standard.set(data, forKey: tokenKey)
        }
    }

    // MARK: - Token Validation
    func isTokenValid() -> Bool {
        guard let _ = cachedToken, let expiry = tokenExpiry else {
            return false
        }
        return expiry > Date()
    }

    // MARK: - Authorization Header
    func authorizationHeader() async -> [String: String]? {
        guard let token = await getToken() else {
            return nil
        }
        return ["Authorization": "Bearer \(token)"]
    }
}

// MARK: - Token Refresh Interceptor
actor TokenRefreshInterceptor {
    private var isRefreshing = false
    private var pendingRequests: [CheckedContinuation<String?, Never>] = []

    func getValidToken() async -> String? {
        // If already refreshing, wait for result
        if isRefreshing {
            return await withCheckedContinuation { continuation in
                pendingRequests.append(continuation)
            }
        }

        // Check if current token is valid
        let provider = ClerkTokenProvider.shared
        if provider.isTokenValid() {
            return await provider.getToken()
        }

        // Start refresh
        isRefreshing = true
        let newToken = await provider.refreshToken()

        // Resume all pending requests
        for continuation in pendingRequests {
            continuation.resume(returning: newToken)
        }
        pendingRequests.removeAll()
        isRefreshing = false

        return newToken
    }
}
