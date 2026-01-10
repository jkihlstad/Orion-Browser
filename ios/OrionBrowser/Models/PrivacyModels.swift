/**
 * PrivacyModels.swift
 * Privacy, consent, and compliance data models
 */

import Foundation

// NOTE: ConsentLevel is defined in ConsentModels.swift - do not duplicate here
// NOTE: ConsentState is defined in ConsentModels.swift - use BasicConsentState for simple consent tracking

// MARK: - Basic Consent State (for simple consent tracking in ViewModels)
struct BasicConsentState: Codable, Equatable {
    var level: ConsentLevel
    var browsingAnalysis: Bool
    var voiceProcessing: Bool
    var crossSessionLearning: Bool
    var dataExport: Bool
    var thirdPartySharing: Bool
    var lastUpdated: Date
    var version: String

    static var `default`: BasicConsentState {
        BasicConsentState(
            level: .minimal,
            browsingAnalysis: false,
            voiceProcessing: false,
            crossSessionLearning: false,
            dataExport: false,
            thirdPartySharing: false,
            lastUpdated: Date(),
            version: "1.0"
        )
    }
}

// MARK: - Site Permission
struct SitePermission: Codable, Identifiable, Equatable {
    var id: String { domain }
    let domain: String
    var tracking: PermissionState
    var voice: PermissionState
    var notifications: PermissionState
    var camera: PermissionState
    var microphone: PermissionState
    var location: PermissionState
    var explicitContent: ContentPolicy
    var aiLearning: Bool
    var lastVisited: Date

    enum PermissionState: String, Codable {
        case allow, block, ask
    }

    enum ContentPolicy: String, Codable {
        case allow, block, warn
    }

    static func `default`(for domain: String) -> SitePermission {
        SitePermission(
            domain: domain,
            tracking: .ask,
            voice: .ask,
            notifications: .ask,
            camera: .ask,
            microphone: .ask,
            location: .ask,
            explicitContent: .warn,
            aiLearning: true,
            lastVisited: Date()
        )
    }
}

// MARK: - Privacy Indicator
struct PrivacyIndicator: Identifiable, Equatable {
    let id = UUID()
    let type: IndicatorType
    var isActive: Bool
    var description: String
    var domain: String?

    enum IndicatorType: String {
        case learning, voice, tracking, export
    }
}

// MARK: - Retention Policy
struct RetentionPolicy: Codable, Equatable {
    var autoDeleteDays: Int
    var keepBookmarks: Bool
    var keepDownloads: Bool
    var keepEmbeddings: Bool
    var keepKnowledgeGraph: Bool

    static var `default`: RetentionPolicy {
        RetentionPolicy(
            autoDeleteDays: 90,
            keepBookmarks: true,
            keepDownloads: true,
            keepEmbeddings: true,
            keepKnowledgeGraph: true
        )
    }
}

// MARK: - Compliance State
struct ComplianceState: Codable {
    var isReviewerMode: Bool
    var demoModeActive: Bool
    var nutritionLabels: [NutritionLabel]
    var dataMinimizationEnabled: Bool
    var backgroundRecordingDisabled: Bool
    var crossAppTrackingBlocked: Bool

    static var `default`: ComplianceState {
        ComplianceState(
            isReviewerMode: false,
            demoModeActive: false,
            nutritionLabels: NutritionLabel.appStoreLabels,
            dataMinimizationEnabled: true,
            backgroundRecordingDisabled: false,
            crossAppTrackingBlocked: true
        )
    }
}

// MARK: - Nutrition Label (App Store Privacy)
struct NutritionLabel: Codable, Identifiable {
    var id: String { "\(category)-\(dataType)" }
    let category: String
    let dataType: String
    let purpose: String
    let linkedToIdentity: Bool
    let usedForTracking: Bool

    static var appStoreLabels: [NutritionLabel] {
        [
            NutritionLabel(
                category: "Browsing History",
                dataType: "Web Browsing",
                purpose: "App Functionality, Personalization",
                linkedToIdentity: true,
                usedForTracking: false
            ),
            NutritionLabel(
                category: "User Content",
                dataType: "Audio Data",
                purpose: "App Functionality",
                linkedToIdentity: true,
                usedForTracking: false
            ),
            NutritionLabel(
                category: "Usage Data",
                dataType: "Product Interaction",
                purpose: "Analytics, App Functionality",
                linkedToIdentity: false,
                usedForTracking: false
            ),
            NutritionLabel(
                category: "Identifiers",
                dataType: "User ID",
                purpose: "App Functionality",
                linkedToIdentity: true,
                usedForTracking: false
            )
        ]
    }
}

// MARK: - Audit Log Entry
struct AuditLogEntry: Codable, Identifiable {
    let id: UUID
    let timestamp: Date
    let action: String
    let agent: String
    var userId: String?
    let details: [String: String]
    let status: AuditStatus

    enum AuditStatus: String, Codable {
        case success, failure
    }

    init(action: String, agent: String, userId: String? = nil, details: [String: String] = [:], status: AuditStatus = .success) {
        self.id = UUID()
        self.timestamp = Date()
        self.action = action
        self.agent = agent
        self.userId = userId
        self.details = details
        self.status = status
    }
}
