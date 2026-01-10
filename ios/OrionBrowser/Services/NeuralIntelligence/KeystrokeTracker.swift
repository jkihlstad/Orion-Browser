/**
 * KeystrokeTracker.swift
 * Text input tracking for the Neural Intelligence SDK
 * SUB-AGENT 1: iOS Neural SDK Engineer
 *
 * Provides NeuralTextField and NeuralTextView subclasses that track
 * text input changes with configurable debouncing and event creation.
 */

import UIKit
import Combine

// MARK: - Keystroke Event Type
/// Types of keystroke events
enum KeystrokeEventType: String, Codable {
    case textChanged = "text_changed"
    case textCleared = "text_cleared"
    case focusGained = "focus_gained"
    case focusLost = "focus_lost"
    case copyAction = "copy_action"
    case pasteAction = "paste_action"
    case cutAction = "cut_action"
    case selectAll = "select_all"
    case returnPressed = "return_pressed"
}

// MARK: - Keystroke Metrics
/// Metrics captured for keystroke analysis
struct KeystrokeMetrics: Codable {
    /// Total character count at time of event
    let characterCount: Int

    /// Word count at time of event
    let wordCount: Int

    /// Characters added since last event
    let charactersAdded: Int

    /// Characters deleted since last event
    let charactersDeleted: Int

    /// Time since last keystroke (in seconds)
    let timeSinceLastKeystroke: TimeInterval

    /// Typing speed (characters per minute)
    let typingSpeed: Double

    /// Field identifier (for distinguishing multiple fields)
    let fieldIdentifier: String?

    /// Field type (e.g., "email", "password", "search")
    let fieldType: String?

    /// Whether the field is secure (password)
    let isSecure: Bool
}

// MARK: - Keystroke Tracker Configuration
/// Configuration options for keystroke tracking
struct KeystrokeTrackerConfiguration {
    /// Debounce interval in seconds (events are batched within this window)
    let debounceInterval: TimeInterval

    /// Minimum characters changed to trigger an event
    let minCharactersChanged: Int

    /// Whether to track secure text fields
    let trackSecureFields: Bool

    /// Whether to include text content in events (privacy consideration)
    let includeTextContent: Bool

    /// Maximum text length to include in events
    let maxTextLength: Int

    /// Default configuration
    static var `default`: KeystrokeTrackerConfiguration {
        KeystrokeTrackerConfiguration(
            debounceInterval: 0.5,
            minCharactersChanged: 1,
            trackSecureFields: false,
            includeTextContent: false,
            maxTextLength: 500
        )
    }

    /// Development configuration with all tracking
    static var development: KeystrokeTrackerConfiguration {
        KeystrokeTrackerConfiguration(
            debounceInterval: 0.2,
            minCharactersChanged: 1,
            trackSecureFields: false,
            includeTextContent: true,
            maxTextLength: 1000
        )
    }
}

// MARK: - Keystroke Tracker Delegate
/// Delegate protocol for receiving keystroke events
protocol KeystrokeTrackerDelegate: AnyObject {
    func keystrokeTracker(_ tracker: KeystrokeTracker, didRecordEvent type: KeystrokeEventType, metrics: KeystrokeMetrics)
    func keystrokeTracker(_ tracker: KeystrokeTracker, didCalculateTypingSpeed speed: Double)
}

// MARK: - Default Delegate Implementation
extension KeystrokeTrackerDelegate {
    func keystrokeTracker(_ tracker: KeystrokeTracker, didRecordEvent type: KeystrokeEventType, metrics: KeystrokeMetrics) {}
    func keystrokeTracker(_ tracker: KeystrokeTracker, didCalculateTypingSpeed speed: Double) {}
}

// MARK: - Keystroke Tracker
/// Central manager for keystroke tracking
@MainActor
final class KeystrokeTracker: ObservableObject {
    // MARK: - Singleton
    static let shared = KeystrokeTracker()

    // MARK: - Properties
    weak var delegate: KeystrokeTrackerDelegate?

    @Published private(set) var isTracking = false
    @Published private(set) var currentTypingSpeed: Double = 0
    @Published private(set) var totalCharactersTyped: Int = 0

    // Configuration
    private(set) var configuration: KeystrokeTrackerConfiguration = .default

    // Session tracking
    private var userId: String?
    private var consentVersion: String?
    private var sessionStartTime: Date?

    // Typing metrics
    private var keystrokeTimestamps: [Date] = []
    private var typingSpeedWindow: TimeInterval = 60.0 // 1 minute window

    // Debouncing
    private var debounceWorkItems: [String: DispatchWorkItem] = [:]
    private var pendingChanges: [String: (oldText: String, newText: String, timestamp: Date)] = [:]

    // MARK: - Initialization
    private init() {}

    // MARK: - Configuration
    /// Configure the tracker for a user session
    /// - Parameters:
    ///   - userId: User identifier for events
    ///   - consentVersion: Current consent version
    ///   - configuration: Tracker configuration
    func configure(
        userId: String,
        consentVersion: String,
        configuration: KeystrokeTrackerConfiguration = .default
    ) {
        self.userId = userId
        self.consentVersion = consentVersion
        self.configuration = configuration
    }

    /// Start tracking keystrokes
    func startTracking() {
        guard !isTracking else { return }

        isTracking = true
        sessionStartTime = Date()
        keystrokeTimestamps.removeAll()
        totalCharactersTyped = 0

        print("[KeystrokeTracker] Started tracking")
    }

    /// Stop tracking keystrokes
    func stopTracking() {
        guard isTracking else { return }

        isTracking = false

        // Cancel pending debounce work items
        for (_, workItem) in debounceWorkItems {
            workItem.cancel()
        }
        debounceWorkItems.removeAll()
        pendingChanges.removeAll()

        print("[KeystrokeTracker] Stopped tracking. Total characters: \(totalCharactersTyped)")
    }

    // MARK: - Event Recording
    /// Record a text change event
    /// - Parameters:
    ///   - fieldIdentifier: Unique identifier for the text field
    ///   - oldText: Previous text content
    ///   - newText: New text content
    ///   - fieldType: Type of field (optional)
    ///   - isSecure: Whether the field is secure
    func recordTextChange(
        fieldIdentifier: String,
        oldText: String,
        newText: String,
        fieldType: String? = nil,
        isSecure: Bool = false
    ) {
        guard isTracking else { return }

        // Skip secure fields if configured
        if isSecure && !configuration.trackSecureFields {
            return
        }

        // Record keystroke timestamp for typing speed calculation
        keystrokeTimestamps.append(Date())
        cleanupOldKeystrokeTimestamps()
        calculateTypingSpeed()

        // Store pending change for debouncing
        pendingChanges[fieldIdentifier] = (oldText, newText, Date())

        // Cancel existing debounce work item
        debounceWorkItems[fieldIdentifier]?.cancel()

        // Create new debounce work item
        let workItem = DispatchWorkItem { [weak self] in
            Task { @MainActor [weak self] in
                self?.flushPendingChange(for: fieldIdentifier, fieldType: fieldType, isSecure: isSecure)
            }
        }

        debounceWorkItems[fieldIdentifier] = workItem

        // Schedule debounced execution
        DispatchQueue.main.asyncAfter(
            deadline: .now() + configuration.debounceInterval,
            execute: workItem
        )
    }

    /// Record a focus event
    /// - Parameters:
    ///   - fieldIdentifier: Unique identifier for the text field
    ///   - gained: Whether focus was gained (true) or lost (false)
    ///   - fieldType: Type of field
    ///   - isSecure: Whether the field is secure
    func recordFocusEvent(
        fieldIdentifier: String,
        gained: Bool,
        fieldType: String? = nil,
        isSecure: Bool = false
    ) {
        guard isTracking else { return }

        let eventType: KeystrokeEventType = gained ? .focusGained : .focusLost

        let metrics = KeystrokeMetrics(
            characterCount: 0,
            wordCount: 0,
            charactersAdded: 0,
            charactersDeleted: 0,
            timeSinceLastKeystroke: 0,
            typingSpeed: currentTypingSpeed,
            fieldIdentifier: fieldIdentifier,
            fieldType: fieldType,
            isSecure: isSecure
        )

        Task {
            await createAndEnqueueEvent(type: eventType, metrics: metrics, text: nil)
        }

        delegate?.keystrokeTracker(self, didRecordEvent: eventType, metrics: metrics)
    }

    /// Record a special action (copy, paste, cut, etc.)
    /// - Parameters:
    ///   - action: Type of action
    ///   - fieldIdentifier: Unique identifier for the text field
    ///   - fieldType: Type of field
    func recordAction(
        _ action: KeystrokeEventType,
        fieldIdentifier: String,
        fieldType: String? = nil
    ) {
        guard isTracking else { return }

        let metrics = KeystrokeMetrics(
            characterCount: 0,
            wordCount: 0,
            charactersAdded: 0,
            charactersDeleted: 0,
            timeSinceLastKeystroke: 0,
            typingSpeed: currentTypingSpeed,
            fieldIdentifier: fieldIdentifier,
            fieldType: fieldType,
            isSecure: false
        )

        Task {
            await createAndEnqueueEvent(type: action, metrics: metrics, text: nil)
        }

        delegate?.keystrokeTracker(self, didRecordEvent: action, metrics: metrics)
    }

    // MARK: - Private Methods
    private func flushPendingChange(for fieldIdentifier: String, fieldType: String?, isSecure: Bool) {
        guard let change = pendingChanges.removeValue(forKey: fieldIdentifier) else { return }
        debounceWorkItems.removeValue(forKey: fieldIdentifier)

        let (oldText, newText, timestamp) = change

        // Calculate metrics
        let charactersAdded = max(0, newText.count - oldText.count)
        let charactersDeleted = max(0, oldText.count - newText.count)

        // Skip if below minimum threshold
        let totalChanged = charactersAdded + charactersDeleted
        if totalChanged < configuration.minCharactersChanged {
            return
        }

        totalCharactersTyped += charactersAdded

        let lastKeystrokeTime = keystrokeTimestamps.dropLast().last ?? sessionStartTime ?? Date()
        let timeSinceLastKeystroke = timestamp.timeIntervalSince(lastKeystrokeTime)

        let metrics = KeystrokeMetrics(
            characterCount: newText.count,
            wordCount: countWords(in: newText),
            charactersAdded: charactersAdded,
            charactersDeleted: charactersDeleted,
            timeSinceLastKeystroke: timeSinceLastKeystroke,
            typingSpeed: currentTypingSpeed,
            fieldIdentifier: fieldIdentifier,
            fieldType: fieldType,
            isSecure: isSecure
        )

        let eventType: KeystrokeEventType = newText.isEmpty ? .textCleared : .textChanged

        // Determine text to include
        var textToInclude: String? = nil
        if configuration.includeTextContent && !isSecure {
            textToInclude = String(newText.prefix(configuration.maxTextLength))
        }

        Task {
            await createAndEnqueueEvent(type: eventType, metrics: metrics, text: textToInclude)
        }

        delegate?.keystrokeTracker(self, didRecordEvent: eventType, metrics: metrics)
    }

    private func cleanupOldKeystrokeTimestamps() {
        let cutoff = Date().addingTimeInterval(-typingSpeedWindow)
        keystrokeTimestamps.removeAll { $0 < cutoff }
    }

    private func calculateTypingSpeed() {
        guard keystrokeTimestamps.count >= 2 else {
            currentTypingSpeed = 0
            return
        }

        let sortedTimestamps = keystrokeTimestamps.sorted()
        guard let first = sortedTimestamps.first,
              let last = sortedTimestamps.last else {
            currentTypingSpeed = 0
            return
        }

        let duration = last.timeIntervalSince(first)
        guard duration > 0 else {
            currentTypingSpeed = 0
            return
        }

        // Characters per minute
        currentTypingSpeed = Double(keystrokeTimestamps.count) / (duration / 60.0)
        delegate?.keystrokeTracker(self, didCalculateTypingSpeed: currentTypingSpeed)
    }

    private func countWords(in text: String) -> Int {
        let words = text.components(separatedBy: .whitespacesAndNewlines)
            .filter { !$0.isEmpty }
        return words.count
    }

    // MARK: - Event Creation
    private func createAndEnqueueEvent(type: KeystrokeEventType, metrics: KeystrokeMetrics, text: String?) async {
        guard let userId = userId, let consentVersion = consentVersion else { return }

        // Check consent
        guard await NeuralConsentManager.shared.canCollect(modality: .analytics) else { return }

        var metricsDict: [String: Any] = [
            "characterCount": metrics.characterCount,
            "wordCount": metrics.wordCount,
            "charactersAdded": metrics.charactersAdded,
            "charactersDeleted": metrics.charactersDeleted,
            "timeSinceLastKeystroke": metrics.timeSinceLastKeystroke,
            "typingSpeed": metrics.typingSpeed,
            "isSecure": metrics.isSecure
        ]

        if let fieldId = metrics.fieldIdentifier {
            metricsDict["fieldIdentifier"] = fieldId
        }

        if let fieldType = metrics.fieldType {
            metricsDict["fieldType"] = fieldType
        }

        let modality = EventModality(
            text: text,
            metrics: metricsDict.mapValues { AnyCodable($0) }
        )

        let event = NeuralEvent(
            userId: userId,
            sourceApp: .browser,
            eventType: "keystroke_\(type.rawValue)",
            modality: modality,
            context: EventContext.current(),
            privacyScope: .private,
            consentVersion: consentVersion
        )

        try? await NeuralIngestionClient.shared.enqueue(event)
    }
}

// MARK: - NeuralTextField
/// UITextField subclass with automatic keystroke tracking
class NeuralTextField: UITextField {
    // MARK: - Properties
    /// Unique identifier for this field
    var fieldIdentifier: String?

    /// Field type for categorization
    var fieldType: String?

    /// Whether to track this field
    var trackingEnabled: Bool = true

    // Private
    private var previousText: String = ""

    // MARK: - Initialization
    override init(frame: CGRect) {
        super.init(frame: frame)
        setupTracking()
    }

    required init?(coder: NSCoder) {
        super.init(coder: coder)
        setupTracking()
    }

    // MARK: - Setup
    private func setupTracking() {
        addTarget(self, action: #selector(textDidChange), for: .editingChanged)
        addTarget(self, action: #selector(didBeginEditing), for: .editingDidBegin)
        addTarget(self, action: #selector(didEndEditing), for: .editingDidEnd)

        // Generate default identifier
        fieldIdentifier = "textfield_\(ObjectIdentifier(self).hashValue)"
    }

    // MARK: - Event Handlers
    @objc private func textDidChange() {
        guard trackingEnabled else { return }

        let newText = text ?? ""
        let identifier = fieldIdentifier ?? "unknown"

        Task { @MainActor in
            KeystrokeTracker.shared.recordTextChange(
                fieldIdentifier: identifier,
                oldText: previousText,
                newText: newText,
                fieldType: fieldType,
                isSecure: isSecureTextEntry
            )
        }

        previousText = newText
    }

    @objc private func didBeginEditing() {
        guard trackingEnabled else { return }

        previousText = text ?? ""
        let identifier = fieldIdentifier ?? "unknown"

        Task { @MainActor in
            KeystrokeTracker.shared.recordFocusEvent(
                fieldIdentifier: identifier,
                gained: true,
                fieldType: fieldType,
                isSecure: isSecureTextEntry
            )
        }
    }

    @objc private func didEndEditing() {
        guard trackingEnabled else { return }

        let identifier = fieldIdentifier ?? "unknown"

        Task { @MainActor in
            KeystrokeTracker.shared.recordFocusEvent(
                fieldIdentifier: identifier,
                gained: false,
                fieldType: fieldType,
                isSecure: isSecureTextEntry
            )
        }
    }

    // MARK: - Menu Actions
    override func copy(_ sender: Any?) {
        super.copy(sender)

        if trackingEnabled, let identifier = fieldIdentifier {
            Task { @MainActor in
                KeystrokeTracker.shared.recordAction(.copyAction, fieldIdentifier: identifier, fieldType: fieldType)
            }
        }
    }

    override func paste(_ sender: Any?) {
        let oldText = text ?? ""
        super.paste(sender)

        if trackingEnabled, let identifier = fieldIdentifier {
            Task { @MainActor in
                KeystrokeTracker.shared.recordAction(.pasteAction, fieldIdentifier: identifier, fieldType: fieldType)
                KeystrokeTracker.shared.recordTextChange(
                    fieldIdentifier: identifier,
                    oldText: oldText,
                    newText: self.text ?? "",
                    fieldType: self.fieldType,
                    isSecure: self.isSecureTextEntry
                )
            }
        }
    }

    override func cut(_ sender: Any?) {
        let oldText = text ?? ""
        super.cut(sender)

        if trackingEnabled, let identifier = fieldIdentifier {
            Task { @MainActor in
                KeystrokeTracker.shared.recordAction(.cutAction, fieldIdentifier: identifier, fieldType: fieldType)
                KeystrokeTracker.shared.recordTextChange(
                    fieldIdentifier: identifier,
                    oldText: oldText,
                    newText: self.text ?? "",
                    fieldType: self.fieldType,
                    isSecure: self.isSecureTextEntry
                )
            }
        }
    }

    override func selectAll(_ sender: Any?) {
        super.selectAll(sender)

        if trackingEnabled, let identifier = fieldIdentifier {
            Task { @MainActor in
                KeystrokeTracker.shared.recordAction(.selectAll, fieldIdentifier: identifier, fieldType: fieldType)
            }
        }
    }
}

// MARK: - NeuralTextView
/// UITextView subclass with automatic keystroke tracking
class NeuralTextView: UITextView {
    // MARK: - Properties
    /// Unique identifier for this field
    var fieldIdentifier: String?

    /// Field type for categorization
    var fieldType: String?

    /// Whether to track this field
    var trackingEnabled: Bool = true

    // Private
    private var previousText: String = ""

    // MARK: - Initialization
    override init(frame: CGRect, textContainer: NSTextContainer?) {
        super.init(frame: frame, textContainer: textContainer)
        setupTracking()
    }

    required init?(coder: NSCoder) {
        super.init(coder: coder)
        setupTracking()
    }

    // MARK: - Setup
    private func setupTracking() {
        delegate = self

        // Generate default identifier
        fieldIdentifier = "textview_\(ObjectIdentifier(self).hashValue)"
    }

    // MARK: - Menu Actions
    override func copy(_ sender: Any?) {
        super.copy(sender)

        if trackingEnabled, let identifier = fieldIdentifier {
            Task { @MainActor in
                KeystrokeTracker.shared.recordAction(.copyAction, fieldIdentifier: identifier, fieldType: fieldType)
            }
        }
    }

    override func paste(_ sender: Any?) {
        let oldText = text ?? ""
        super.paste(sender)

        if trackingEnabled, let identifier = fieldIdentifier {
            Task { @MainActor in
                KeystrokeTracker.shared.recordAction(.pasteAction, fieldIdentifier: identifier, fieldType: fieldType)
                KeystrokeTracker.shared.recordTextChange(
                    fieldIdentifier: identifier,
                    oldText: oldText,
                    newText: self.text ?? "",
                    fieldType: self.fieldType,
                    isSecure: self.isSecureTextEntry
                )
            }
        }
    }

    override func cut(_ sender: Any?) {
        let oldText = text ?? ""
        super.cut(sender)

        if trackingEnabled, let identifier = fieldIdentifier {
            Task { @MainActor in
                KeystrokeTracker.shared.recordAction(.cutAction, fieldIdentifier: identifier, fieldType: fieldType)
                KeystrokeTracker.shared.recordTextChange(
                    fieldIdentifier: identifier,
                    oldText: oldText,
                    newText: self.text ?? "",
                    fieldType: self.fieldType,
                    isSecure: self.isSecureTextEntry
                )
            }
        }
    }

    override func selectAll(_ sender: Any?) {
        super.selectAll(sender)

        if trackingEnabled, let identifier = fieldIdentifier {
            Task { @MainActor in
                KeystrokeTracker.shared.recordAction(.selectAll, fieldIdentifier: identifier, fieldType: fieldType)
            }
        }
    }
}

// MARK: - UITextViewDelegate
extension NeuralTextView: UITextViewDelegate {
    func textViewDidChange(_ textView: UITextView) {
        guard trackingEnabled else { return }

        let newText = textView.text ?? ""
        let identifier = fieldIdentifier ?? "unknown"

        Task { @MainActor in
            KeystrokeTracker.shared.recordTextChange(
                fieldIdentifier: identifier,
                oldText: previousText,
                newText: newText,
                fieldType: fieldType,
                isSecure: isSecureTextEntry
            )
        }

        previousText = newText
    }

    func textViewDidBeginEditing(_ textView: UITextView) {
        guard trackingEnabled else { return }

        previousText = textView.text ?? ""
        let identifier = fieldIdentifier ?? "unknown"

        Task { @MainActor in
            KeystrokeTracker.shared.recordFocusEvent(
                fieldIdentifier: identifier,
                gained: true,
                fieldType: fieldType,
                isSecure: isSecureTextEntry
            )
        }
    }

    func textViewDidEndEditing(_ textView: UITextView) {
        guard trackingEnabled else { return }

        let identifier = fieldIdentifier ?? "unknown"

        Task { @MainActor in
            KeystrokeTracker.shared.recordFocusEvent(
                fieldIdentifier: identifier,
                gained: false,
                fieldType: fieldType,
                isSecure: isSecureTextEntry
            )
        }
    }
}
