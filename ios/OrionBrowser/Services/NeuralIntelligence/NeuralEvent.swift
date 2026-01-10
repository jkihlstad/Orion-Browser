/**
 * NeuralEvent.swift
 * Event models for the Neural Intelligence data collection SDK
 * SUB-AGENT 1: iOS Neural SDK Engineer
 *
 * Defines the core data structures for capturing and transmitting
 * user behavior, context, and multi-modal data to the backend.
 */

import Foundation
import UIKit

// MARK: - Source Application
/// Identifies the source application or context from which an event originated
enum SourceApp: String, Codable, CaseIterable {
    case browser = "browser"
    case social = "social"
    case tasks = "tasks"
    case calendar = "calendar"
    case fitness = "fitness"
    case dating = "dating"
    case sleep = "sleep"
    case email = "email"
    case workouts = "workouts"
    case location = "location"
    case device = "device"
    case media = "media"
    case analytics = "analytics"
    case health = "health"
    case communication = "communication"

    var displayName: String {
        switch self {
        case .browser: return "Browser"
        case .social: return "Social"
        case .tasks: return "Tasks"
        case .calendar: return "Calendar"
        case .fitness: return "Fitness"
        case .dating: return "Dating"
        case .sleep: return "Sleep"
        case .email: return "Email"
        case .workouts: return "Workouts"
        case .location: return "Location"
        case .device: return "Device"
        case .media: return "Media"
        case .analytics: return "Analytics"
        case .health: return "Health"
        case .communication: return "Communication"
        }
    }

    var iconName: String {
        switch self {
        case .browser: return "globe"
        case .social: return "person.2.fill"
        case .tasks: return "checklist"
        case .calendar: return "calendar"
        case .fitness: return "heart.fill"
        case .dating: return "heart.circle.fill"
        case .sleep: return "moon.fill"
        case .email: return "envelope.fill"
        case .workouts: return "figure.run"
        case .location: return "location.fill"
        case .device: return "iphone"
        case .media: return "play.rectangle.fill"
        case .analytics: return "chart.bar.fill"
        case .health: return "cross.fill"
        case .communication: return "message.fill"
        }
    }
}

// MARK: - Privacy Scope
/// Defines the privacy scope for event data
enum PrivacyScope: String, Codable, CaseIterable {
    case `private` = "private"
    case shared = "shared"
    case `public` = "public"

    var displayName: String {
        switch self {
        case .private: return "Private"
        case .shared: return "Shared"
        case .public: return "Public"
        }
    }

    var description: String {
        switch self {
        case .private: return "Only visible to the user, never shared"
        case .shared: return "Can be shared with trusted services"
        case .public: return "Can be used for aggregate analytics"
        }
    }

    /// Whether this scope allows cross-device sync
    var allowsCrossDeviceSync: Bool {
        self != .private
    }

    /// Whether this scope allows third-party sharing
    var allowsThirdPartySharing: Bool {
        self == .public
    }
}

// MARK: - Event Modality
/// Represents the multi-modal content of an event
struct EventModality: Codable, Equatable {
    /// Textual content associated with the event
    var text: String?

    /// Reference path to an image file (stored locally)
    var imageRef: String?

    /// Reference path to an audio file (stored locally)
    var audioRef: String?

    /// Reference path to a video file (stored locally)
    var videoRef: String?

    /// Arbitrary metrics associated with the event
    var metrics: [String: AnyCodable]?

    /// Check if this modality contains any data
    var isEmpty: Bool {
        text == nil && imageRef == nil && audioRef == nil && videoRef == nil && (metrics?.isEmpty ?? true)
    }

    /// Create a text-only modality
    static func text(_ content: String) -> EventModality {
        EventModality(text: content)
    }

    /// Create an image reference modality
    static func image(_ path: String) -> EventModality {
        EventModality(imageRef: path)
    }

    /// Create an audio reference modality
    static func audio(_ path: String) -> EventModality {
        EventModality(audioRef: path)
    }

    /// Create a video reference modality
    static func video(_ path: String) -> EventModality {
        EventModality(videoRef: path)
    }

    /// Create a metrics-only modality
    static func metrics(_ data: [String: Any]) -> EventModality {
        let codableMetrics = data.mapValues { AnyCodable($0) }
        return EventModality(metrics: codableMetrics)
    }
}

// MARK: - Event Context
/// Captures device and environment context for an event
struct EventContext: Codable, Equatable {
    /// Device model identifier (e.g., "iPhone15,2")
    let deviceModel: String

    /// Operating system version (e.g., "17.2.1")
    let osVersion: String

    /// Application version (e.g., "1.0.0")
    let appVersion: String

    /// User's locale identifier (e.g., "en_US")
    let locale: String

    /// User's timezone identifier (e.g., "America/Los_Angeles")
    let timezone: String

    /// Network connectivity type
    let network: NetworkType

    /// Battery level (0.0 to 1.0)
    var batteryLevel: Float?

    /// Whether the device is in low power mode
    var isLowPowerMode: Bool?

    /// Screen brightness (0.0 to 1.0)
    var screenBrightness: Float?

    /// Network connectivity type
    enum NetworkType: String, Codable {
        case wifi = "wifi"
        case cellular = "cellular"
        case ethernet = "ethernet"
        case offline = "offline"
        case unknown = "unknown"
    }

    /// Create context from current device state
    @MainActor
    static func current() -> EventContext {
        var systemInfo = utsname()
        uname(&systemInfo)
        let machineMirror = Mirror(reflecting: systemInfo.machine)
        let deviceModel = machineMirror.children.reduce("") { identifier, element in
            guard let value = element.value as? Int8, value != 0 else { return identifier }
            return identifier + String(UnicodeScalar(UInt8(value)))
        }

        let device = UIDevice.current
        device.isBatteryMonitoringEnabled = true

        return EventContext(
            deviceModel: deviceModel,
            osVersion: device.systemVersion,
            appVersion: Configuration.appVersion,
            locale: Locale.current.identifier,
            timezone: TimeZone.current.identifier,
            network: currentNetworkType(),
            batteryLevel: device.batteryLevel >= 0 ? device.batteryLevel : nil,
            isLowPowerMode: ProcessInfo.processInfo.isLowPowerModeEnabled,
            screenBrightness: Float(UIScreen.main.brightness)
        )
    }

    /// Determine current network type
    @MainActor
    private static func currentNetworkType() -> NetworkType {
        // In a production app, use NWPathMonitor for accurate network detection
        // This is a simplified implementation
        return .wifi
    }
}

// MARK: - Neural Event
/// Core event structure for the Neural Intelligence system
struct NeuralEvent: Codable, Identifiable, Equatable {
    /// Unique identifier for this event
    let id: UUID

    /// User identifier (from authentication)
    let userId: String

    /// Source application that generated this event
    let sourceApp: SourceApp

    /// Type of event (e.g., "navigation", "scroll", "click", "voice_command")
    let eventType: String

    /// Timestamp when the event occurred
    let timestamp: Date

    /// Multi-modal content of the event
    let modality: EventModality

    /// Device and environment context
    let context: EventContext

    /// Privacy scope for this event
    let privacyScope: PrivacyScope

    /// Version of consent when this event was created
    let consentVersion: String

    /// Unique key for deduplication (prevents duplicate processing)
    let idempotencyKey: String

    /// Schema version for backwards compatibility
    let schemaVersion: String

    /// Current schema version constant
    static let currentSchemaVersion = "1.0.0"

    /// Initialize a new Neural Event
    /// - Parameters:
    ///   - userId: User identifier
    ///   - sourceApp: Source application
    ///   - eventType: Type of event
    ///   - modality: Multi-modal content
    ///   - context: Device context
    ///   - privacyScope: Privacy scope
    ///   - consentVersion: Consent version
    init(
        userId: String,
        sourceApp: SourceApp,
        eventType: String,
        modality: EventModality,
        context: EventContext,
        privacyScope: PrivacyScope,
        consentVersion: String
    ) {
        self.id = UUID()
        self.userId = userId
        self.sourceApp = sourceApp
        self.eventType = eventType
        self.timestamp = Date()
        self.modality = modality
        self.context = context
        self.privacyScope = privacyScope
        self.consentVersion = consentVersion
        self.idempotencyKey = "\(userId)_\(eventType)_\(Int(Date().timeIntervalSince1970 * 1000))"
        self.schemaVersion = NeuralEvent.currentSchemaVersion
    }

    /// Create a navigation event
    @MainActor
    static func navigation(
        userId: String,
        url: String,
        title: String?,
        consentVersion: String,
        privacyScope: PrivacyScope = .private
    ) -> NeuralEvent {
        var metrics: [String: AnyCodable] = ["url": AnyCodable(url)]
        if let title = title {
            metrics["title"] = AnyCodable(title)
        }

        return NeuralEvent(
            userId: userId,
            sourceApp: .browser,
            eventType: "navigation",
            modality: EventModality(text: title, metrics: metrics),
            context: EventContext.current(),
            privacyScope: privacyScope,
            consentVersion: consentVersion
        )
    }

    /// Create a scroll event
    @MainActor
    static func scroll(
        userId: String,
        depth: Double,
        velocity: Double,
        consentVersion: String
    ) -> NeuralEvent {
        NeuralEvent(
            userId: userId,
            sourceApp: .browser,
            eventType: "scroll",
            modality: .metrics([
                "depth": depth,
                "velocity": velocity
            ]),
            context: EventContext.current(),
            privacyScope: .private,
            consentVersion: consentVersion
        )
    }

    /// Create a text input event
    @MainActor
    static func textInput(
        userId: String,
        text: String,
        fieldType: String,
        consentVersion: String
    ) -> NeuralEvent {
        NeuralEvent(
            userId: userId,
            sourceApp: .browser,
            eventType: "text_input",
            modality: EventModality(text: text, metrics: [
                "fieldType": AnyCodable(fieldType),
                "characterCount": AnyCodable(text.count)
            ]),
            context: EventContext.current(),
            privacyScope: .private,
            consentVersion: consentVersion
        )
    }
}

// MARK: - AnyCodable
/// Type-erased Codable wrapper for encoding arbitrary values
struct AnyCodable: Codable, Equatable {
    let value: Any

    init(_ value: Any) {
        self.value = value
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()

        if container.decodeNil() {
            value = NSNull()
        } else if let bool = try? container.decode(Bool.self) {
            value = bool
        } else if let int = try? container.decode(Int.self) {
            value = int
        } else if let double = try? container.decode(Double.self) {
            value = double
        } else if let string = try? container.decode(String.self) {
            value = string
        } else if let array = try? container.decode([AnyCodable].self) {
            value = array.map { $0.value }
        } else if let dictionary = try? container.decode([String: AnyCodable].self) {
            value = dictionary.mapValues { $0.value }
        } else {
            throw DecodingError.dataCorruptedError(
                in: container,
                debugDescription: "Unable to decode value"
            )
        }
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()

        switch value {
        case is NSNull:
            try container.encodeNil()
        case let bool as Bool:
            try container.encode(bool)
        case let int as Int:
            try container.encode(int)
        case let double as Double:
            try container.encode(double)
        case let float as Float:
            try container.encode(Double(float))
        case let string as String:
            try container.encode(string)
        case let date as Date:
            try container.encode(date.timeIntervalSince1970)
        case let array as [Any]:
            try container.encode(array.map { AnyCodable($0) })
        case let dictionary as [String: Any]:
            try container.encode(dictionary.mapValues { AnyCodable($0) })
        default:
            // Fallback: try to convert to string representation
            try container.encode(String(describing: value))
        }
    }

    static func == (lhs: AnyCodable, rhs: AnyCodable) -> Bool {
        // Simple equality check based on string representation
        String(describing: lhs.value) == String(describing: rhs.value)
    }

    /// Convenience accessors
    var stringValue: String? { value as? String }
    var intValue: Int? { value as? Int }
    var doubleValue: Double? { value as? Double }
    var boolValue: Bool? { value as? Bool }
    var arrayValue: [Any]? { value as? [Any] }
    var dictionaryValue: [String: Any]? { value as? [String: Any] }
}

// MARK: - Neural Event Batch
/// A batch of events for efficient transmission
struct NeuralEventBatch: Codable {
    let batchId: UUID
    let events: [NeuralEvent]
    let createdAt: Date
    let deviceId: String

    init(events: [NeuralEvent], deviceId: String) {
        self.batchId = UUID()
        self.events = events
        self.createdAt = Date()
        self.deviceId = deviceId
    }

    var eventCount: Int { events.count }
    var isEmpty: Bool { events.isEmpty }
}
