/**
 * Configuration.swift
 * Environment configuration for Orion Browser
 */

import Foundation

enum Configuration {
    // MARK: - Convex
    static let convexDeploymentURL: String = {
        guard let url = Bundle.main.infoDictionary?["CONVEX_DEPLOYMENT_URL"] as? String,
              !url.isEmpty else {
            #if DEBUG
            return "https://your-dev-deployment.convex.cloud"
            #else
            fatalError("CONVEX_DEPLOYMENT_URL not configured in Info.plist")
            #endif
        }
        return url
    }()

    // MARK: - Clerk
    static let clerkPublishableKey: String = {
        guard let key = Bundle.main.infoDictionary?["CLERK_PUBLISHABLE_KEY"] as? String,
              !key.isEmpty else {
            #if DEBUG
            return "pk_test_your-key-here"
            #else
            fatalError("CLERK_PUBLISHABLE_KEY not configured in Info.plist")
            #endif
        }
        return key
    }()

    // MARK: - Feature Flags
    static let isVoiceEnabled: Bool = true
    static let isAIProactiveEnabled: Bool = true
    static let isCrossDeviceSyncEnabled: Bool = true

    // MARK: - AI Levels
    enum AILevel: String, CaseIterable {
        case passive = "passive"
        case advisory = "advisory"
        case proactive = "proactive"
    }

    static let enabledAILevels: [AILevel] = [.passive, .advisory, .proactive]

    // MARK: - Data Retention
    static let defaultRetentionDays: Int = 90
    static let maxRetentionDays: Int = 365
    static let deletionGracePeriodDays: Int = 30

    // MARK: - Vector DB
    static let vectorDimension: Int = 1536
    static let maxVectorsPerNamespace: Int = 100_000
    static let defaultSimilarityThreshold: Float = 0.5

    // MARK: - App Info
    static var appVersion: String {
        Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "1.0.0"
    }

    static var buildNumber: String {
        Bundle.main.infoDictionary?["CFBundleVersion"] as? String ?? "1"
    }

    static var bundleIdentifier: String {
        Bundle.main.bundleIdentifier ?? "com.orion.browser"
    }
}
