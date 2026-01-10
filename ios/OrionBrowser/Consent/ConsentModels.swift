/**
 * ConsentModels.swift
 * Consent types and models for data capture gating
 * SUB-AGENT B: Edge Capture + Local Buffer + Background Upload
 *
 * Defines modalities, consent levels, and consent state structures
 * used throughout the consent service layer.
 */

import Foundation

// MARK: - Consent Modality

/// Data capture modalities that require user consent
/// Each modality represents a distinct type of data collection
public enum ConsentModality: String, CaseIterable, Codable, Sendable {
    case behavioral = "behavioral"
    case visual = "visual"
    case audio = "audio"
    case location = "location"
    case keystroke = "keystroke"
    case biometric = "biometric"
    case eyeTracking = "eye_tracking"
    case screenCapture = "screen_capture"
    case clipboard = "clipboard"
    case formData = "form_data"
    case analytics = "analytics"
    case crossSession = "cross_session"
    case thirdParty = "third_party"

    /// Human-readable display name
    public var displayName: String {
        switch self {
        case .behavioral: return "Behavioral Tracking"
        case .visual: return "Visual Capture"
        case .audio: return "Audio Recording"
        case .location: return "Location Tracking"
        case .keystroke: return "Keystroke Tracking"
        case .biometric: return "Biometric Data"
        case .eyeTracking: return "Eye Tracking"
        case .screenCapture: return "Screen Capture"
        case .clipboard: return "Clipboard Access"
        case .formData: return "Form Data"
        case .analytics: return "Analytics"
        case .crossSession: return "Cross-Session Learning"
        case .thirdParty: return "Third-Party Sharing"
        }
    }

    /// Detailed description of what this modality captures
    public var description: String {
        switch self {
        case .behavioral:
            return "Track scrolling, clicks, and navigation patterns"
        case .visual:
            return "Capture screenshots and visual content"
        case .audio:
            return "Record audio for voice commands and transcription"
        case .location:
            return "Track device location for context-aware features"
        case .keystroke:
            return "Monitor typing patterns and text input"
        case .biometric:
            return "Access biometric sensors and health data"
        case .eyeTracking:
            return "Track eye movement and gaze patterns"
        case .screenCapture:
            return "Capture screen content for AI analysis"
        case .clipboard:
            return "Access clipboard content for context"
        case .formData:
            return "Capture form submissions and input data"
        case .analytics:
            return "Collect usage analytics and performance metrics"
        case .crossSession:
            return "Learn and remember patterns across sessions"
        case .thirdParty:
            return "Share anonymized data with trusted partners"
        }
    }

    /// SF Symbols icon name
    public var iconName: String {
        switch self {
        case .behavioral: return "hand.tap.fill"
        case .visual: return "camera.viewfinder"
        case .audio: return "mic.fill"
        case .location: return "location.fill"
        case .keystroke: return "keyboard"
        case .biometric: return "waveform.path.ecg"
        case .eyeTracking: return "eye.fill"
        case .screenCapture: return "rectangle.on.rectangle"
        case .clipboard: return "doc.on.clipboard"
        case .formData: return "doc.text.fill"
        case .analytics: return "chart.bar.fill"
        case .crossSession: return "arrow.triangle.2.circlepath"
        case .thirdParty: return "person.2.fill"
        }
    }

    /// Whether this modality requires iOS system permission
    public var requiresSystemPermission: Bool {
        switch self {
        case .audio, .location, .eyeTracking:
            return true
        case .visual, .screenCapture:
            return true // Screen recording requires permission
        default:
            return false
        }
    }

    /// Whether this is a high-sensitivity modality requiring extra caution
    public var isHighSensitivity: Bool {
        switch self {
        case .audio, .visual, .keystroke, .biometric, .eyeTracking, .screenCapture, .formData:
            return true
        default:
            return false
        }
    }

    /// Privacy impact level (1-5, 5 being highest)
    public var privacyImpact: Int {
        switch self {
        case .thirdParty: return 5
        case .biometric, .keystroke, .audio: return 4
        case .visual, .screenCapture, .eyeTracking, .formData: return 3
        case .location, .crossSession: return 2
        case .behavioral, .analytics, .clipboard: return 1
        }
    }
}

// MARK: - Consent Level

/// Overall consent level representing the degree of data collection
public enum ConsentLevel: String, CaseIterable, Codable, Comparable, Sendable {
    case none = "none"
    case minimal = "minimal"
    case standard = "standard"
    case enhanced = "enhanced"
    case full = "full"

    public var displayName: String {
        switch self {
        case .none: return "No Collection"
        case .minimal: return "Minimal"
        case .standard: return "Standard"
        case .enhanced: return "Enhanced"
        case .full: return "Full"
        }
    }

    public var description: String {
        switch self {
        case .none:
            return "No data is collected or analyzed. AI features are disabled."
        case .minimal:
            return "Only essential browsing data. Basic functionality only."
        case .standard:
            return "Browsing patterns and preferences for personalization."
        case .enhanced:
            return "Full learning with cognitive modeling and proactive AI."
        case .full:
            return "Complete AI assistance with cross-context learning and all modalities."
        }
    }

    /// Modalities enabled at this consent level
    public var enabledModalities: Set<ConsentModality> {
        switch self {
        case .none:
            return []
        case .minimal:
            return [.analytics]
        case .standard:
            return [.analytics, .behavioral, .crossSession]
        case .enhanced:
            return [.analytics, .behavioral, .crossSession, .visual, .screenCapture, .location]
        case .full:
            return Set(ConsentModality.allCases)
        }
    }

    public static func < (lhs: ConsentLevel, rhs: ConsentLevel) -> Bool {
        let order: [ConsentLevel] = [.none, .minimal, .standard, .enhanced, .full]
        guard let lhsIndex = order.firstIndex(of: lhs),
              let rhsIndex = order.firstIndex(of: rhs) else {
            return false
        }
        return lhsIndex < rhsIndex
    }
}

// MARK: - Consent State

/// Complete consent state for a user
public struct ConsentState: Codable, Equatable, Sendable {
    /// Overall consent level
    public var level: ConsentLevel

    /// Individual modality consent flags (overrides level defaults)
    public var modalities: [ConsentModality: Bool]

    /// Whether global data collection is enabled
    public var globalEnabled: Bool

    /// Consent version identifier for tracking changes
    public var version: String

    /// Timestamp of last update
    public var lastUpdated: Date

    /// Whether onboarding consent flow is complete
    public var hasCompletedOnboarding: Bool

    /// Whether age verification passed
    public var ageVerified: Bool

    /// Date terms of service were accepted
    public var termsAcceptedDate: Date?

    /// Date privacy policy was accepted
    public var privacyPolicyAcceptedDate: Date?

    /// Server sync timestamp (nil if never synced)
    public var lastSyncedAt: Date?

    /// Whether there are unsaved local changes
    public var hasPendingChanges: Bool

    // MARK: - Initialization

    public init(
        level: ConsentLevel = .minimal,
        modalities: [ConsentModality: Bool] = [:],
        globalEnabled: Bool = false,
        version: String = "1.0",
        lastUpdated: Date = Date(),
        hasCompletedOnboarding: Bool = false,
        ageVerified: Bool = false,
        termsAcceptedDate: Date? = nil,
        privacyPolicyAcceptedDate: Date? = nil,
        lastSyncedAt: Date? = nil,
        hasPendingChanges: Bool = false
    ) {
        self.level = level
        self.modalities = modalities
        self.globalEnabled = globalEnabled
        self.version = version
        self.lastUpdated = lastUpdated
        self.hasCompletedOnboarding = hasCompletedOnboarding
        self.ageVerified = ageVerified
        self.termsAcceptedDate = termsAcceptedDate
        self.privacyPolicyAcceptedDate = privacyPolicyAcceptedDate
        self.lastSyncedAt = lastSyncedAt
        self.hasPendingChanges = hasPendingChanges
    }

    /// Default consent state with everything disabled
    public static var `default`: ConsentState {
        var modalities: [ConsentModality: Bool] = [:]
        for modality in ConsentModality.allCases {
            modalities[modality] = false
        }
        return ConsentState(
            level: .none,
            modalities: modalities,
            globalEnabled: false
        )
    }

    // MARK: - Query Methods

    /// Check if a specific modality is consented
    public func isConsented(_ modality: ConsentModality) -> Bool {
        guard globalEnabled else { return false }

        // Check explicit modality setting first
        if let explicit = modalities[modality] {
            return explicit
        }

        // Fall back to level defaults
        return level.enabledModalities.contains(modality)
    }

    /// Get all currently consented modalities
    public var consentedModalities: [ConsentModality] {
        guard globalEnabled else { return [] }
        return ConsentModality.allCases.filter { isConsented($0) }
    }

    /// Check if consent is fully valid (all requirements met)
    public var isFullyConsented: Bool {
        globalEnabled &&
        hasCompletedOnboarding &&
        ageVerified &&
        termsAcceptedDate != nil &&
        privacyPolicyAcceptedDate != nil
    }

    /// Check if consent has expired (older than 1 year)
    public var isExpired: Bool {
        let maxAge: TimeInterval = 365 * 24 * 60 * 60
        return Date().timeIntervalSince(lastUpdated) > maxAge
    }

    /// Calculate privacy score (0-100, higher = more privacy)
    public var privacyScore: Int {
        guard globalEnabled else { return 100 }

        let totalImpact = ConsentModality.allCases.reduce(0) { total, modality in
            isConsented(modality) ? total + modality.privacyImpact : total
        }
        let maxImpact = ConsentModality.allCases.reduce(0) { $0 + $1.privacyImpact }

        return max(0, 100 - Int((Double(totalImpact) / Double(maxImpact)) * 100))
    }
}

// MARK: - Consent Change Record

/// Audit record for consent changes
public struct ConsentChangeRecord: Codable, Identifiable, Sendable {
    public let id: UUID
    public let timestamp: Date
    public let modality: ConsentModality?
    public let previousValue: Bool
    public let newValue: Bool
    public let source: ChangeSource
    public let version: String

    public enum ChangeSource: String, Codable, Sendable {
        case user = "user"
        case system = "system"
        case policy = "policy"
        case expiration = "expiration"
        case sync = "sync"
    }

    public init(
        modality: ConsentModality?,
        previousValue: Bool,
        newValue: Bool,
        source: ChangeSource,
        version: String
    ) {
        self.id = UUID()
        self.timestamp = Date()
        self.modality = modality
        self.previousValue = previousValue
        self.newValue = newValue
        self.source = source
        self.version = version
    }
}

// MARK: - Consent Validation Result

/// Result of consent validation
public struct ConsentValidationResult: Sendable {
    public let isValid: Bool
    public let issues: [ConsentIssue]

    public enum ConsentIssue: String, Sendable {
        case expired = "Consent has expired and needs renewal"
        case onboardingIncomplete = "Onboarding consent flow not completed"
        case ageNotVerified = "Age verification required"
        case termsNotAccepted = "Terms of service not accepted"
        case privacyPolicyNotAccepted = "Privacy policy not accepted"
        case globalDisabled = "Global data collection is disabled"
        case versionMismatch = "Consent version mismatch"
    }

    public static var valid: ConsentValidationResult {
        ConsentValidationResult(isValid: true, issues: [])
    }

    public static func invalid(_ issues: [ConsentIssue]) -> ConsentValidationResult {
        ConsentValidationResult(isValid: false, issues: issues)
    }
}

// MARK: - Consent Request

/// Request to check or update consent for specific modalities
public struct ConsentRequest: Sendable {
    public let modalities: Set<ConsentModality>
    public let purpose: String
    public let requiredLevel: ConsentLevel

    public init(
        modalities: Set<ConsentModality>,
        purpose: String,
        requiredLevel: ConsentLevel = .minimal
    ) {
        self.modalities = modalities
        self.purpose = purpose
        self.requiredLevel = requiredLevel
    }

    /// Single modality request
    public static func forModality(_ modality: ConsentModality, purpose: String) -> ConsentRequest {
        ConsentRequest(modalities: [modality], purpose: purpose)
    }

    /// Check if the given state satisfies this request
    public func isSatisfied(by state: ConsentState) -> Bool {
        guard state.level >= requiredLevel else { return false }
        return modalities.allSatisfy { state.isConsented($0) }
    }
}
