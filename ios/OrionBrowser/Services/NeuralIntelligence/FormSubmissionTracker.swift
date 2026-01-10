/**
 * FormSubmissionTracker.swift
 * Form submission tracking for the Neural Intelligence SDK
 * Lab environment feature - tracks form interactions and submissions
 *
 * Privacy: Excludes password fields and sensitive data
 * Captures form structure, field types, and submission metadata
 */

import Foundation
import WebKit
import Combine

// MARK: - Form Field Type
/// Types of form fields
enum FormFieldType: String, Codable {
    case text = "text"
    case email = "email"
    case password = "password"
    case number = "number"
    case tel = "tel"
    case url = "url"
    case search = "search"
    case date = "date"
    case time = "time"
    case datetime = "datetime"
    case checkbox = "checkbox"
    case radio = "radio"
    case select = "select"
    case textarea = "textarea"
    case hidden = "hidden"
    case file = "file"
    case submit = "submit"
    case button = "button"
    case unknown = "unknown"

    /// Whether this field type contains sensitive data
    var isSensitive: Bool {
        switch self {
        case .password, .hidden:
            return true
        default:
            return false
        }
    }
}

// MARK: - Form Field Info
/// Information about a form field (metadata only, no values)
struct FormFieldInfo: Codable {
    let fieldType: FormFieldType
    let fieldName: String?
    let fieldId: String?
    let isRequired: Bool
    let hasAutocomplete: Bool
    let autocompleteType: String?
    let placeholder: String?
    let maxLength: Int?

    /// Whether to exclude this field from tracking
    var shouldExclude: Bool {
        // Exclude password fields
        if fieldType.isSensitive { return true }

        // Exclude fields that look like they contain sensitive data
        let sensitivePatterns = ["password", "passwd", "secret", "token", "cvv", "ssn", "credit", "card"]
        let name = (fieldName ?? "").lowercased()
        let id = (fieldId ?? "").lowercased()
        let autocomplete = (autocompleteType ?? "").lowercased()

        for pattern in sensitivePatterns {
            if name.contains(pattern) || id.contains(pattern) || autocomplete.contains(pattern) {
                return true
            }
        }

        return false
    }
}

// MARK: - Form Submission Event
/// Represents a form submission event
struct FormSubmissionEvent: Codable {
    let id: UUID
    let timestamp: Date
    let formAction: String?
    let formMethod: String
    let formId: String?
    let formName: String?
    let pageURL: String
    let fields: [FormFieldInfo]
    let fieldCount: Int
    let sensitiveFieldCount: Int // Number of fields excluded for privacy
    let submissionDuration: TimeInterval? // Time from first interaction to submit

    init(
        formAction: String?,
        formMethod: String,
        formId: String?,
        formName: String?,
        pageURL: String,
        fields: [FormFieldInfo],
        sensitiveFieldCount: Int,
        submissionDuration: TimeInterval?
    ) {
        self.id = UUID()
        self.timestamp = Date()
        self.formAction = formAction
        self.formMethod = formMethod
        self.formId = formId
        self.formName = formName
        self.pageURL = pageURL
        self.fields = fields
        self.fieldCount = fields.count
        self.sensitiveFieldCount = sensitiveFieldCount
        self.submissionDuration = submissionDuration
    }
}

// MARK: - Form Interaction Event
/// Tracks interactions with form fields
struct FormInteractionEvent: Codable {
    let timestamp: Date
    let eventType: InteractionType
    let fieldType: FormFieldType
    let fieldName: String?
    let pageURL: String

    enum InteractionType: String, Codable {
        case focus = "focus"
        case blur = "blur"
        case change = "change"
        case input = "input"
    }
}

// MARK: - Form Submission Tracker Configuration
/// Configuration for form tracking
struct FormSubmissionTrackerConfiguration {
    /// Track field interactions (focus, blur, change)
    let trackInteractions: Bool

    /// Track field names (vs just types)
    let trackFieldNames: Bool

    /// Maximum fields to track per form
    let maxFieldsPerForm: Int

    /// Debounce interval for interaction events
    let interactionDebounce: TimeInterval

    /// Default configuration
    static var `default`: FormSubmissionTrackerConfiguration {
        FormSubmissionTrackerConfiguration(
            trackInteractions: true,
            trackFieldNames: true,
            maxFieldsPerForm: 50,
            interactionDebounce: 0.5
        )
    }
}

// MARK: - Form Submission Tracker Delegate
/// Delegate protocol for form events
protocol FormSubmissionTrackerDelegate: AnyObject {
    func formTracker(_ tracker: FormSubmissionTracker, didDetectSubmission event: FormSubmissionEvent)
    func formTracker(_ tracker: FormSubmissionTracker, didDetectInteraction event: FormInteractionEvent)
}

extension FormSubmissionTrackerDelegate {
    func formTracker(_ tracker: FormSubmissionTracker, didDetectInteraction event: FormInteractionEvent) {}
}

// MARK: - Form Submission Tracker
/// Tracks form submissions for the Neural Intelligence SDK
@MainActor
final class FormSubmissionTracker: NSObject, ObservableObject {
    // MARK: - Singleton
    static let shared = FormSubmissionTracker()

    // MARK: - Properties
    weak var delegate: FormSubmissionTrackerDelegate?

    @Published private(set) var isTracking = false
    @Published private(set) var lastSubmission: FormSubmissionEvent?
    @Published private(set) var submissionCount: Int = 0

    // Configuration
    private(set) var configuration: FormSubmissionTrackerConfiguration = .default

    // Session
    private var userId: String?
    private var consentVersion: String?
    private var currentPageURL: String = ""

    // Form interaction timing
    private var formInteractionStart: [String: Date] = [:] // formId -> first interaction time
    private var lastInteractionTime: [String: Date] = [:] // fieldId -> last event time

    // MARK: - Initialization
    private override init() {
        super.init()
    }

    // MARK: - Configuration
    /// Configure the tracker for a user session
    func configure(
        userId: String,
        consentVersion: String,
        configuration: FormSubmissionTrackerConfiguration = .default
    ) {
        self.userId = userId
        self.consentVersion = consentVersion
        self.configuration = configuration
    }

    /// Update current page URL
    func updatePageURL(_ url: String) {
        currentPageURL = url
    }

    // MARK: - Tracking Control
    /// Start tracking form submissions
    func startTracking() async {
        guard !isTracking else { return }

        // Check consent
        guard await NeuralConsentManager.shared.canCollect(modality: .analytics) else {
            print("[FormSubmissionTracker] Analytics consent not granted")
            return
        }

        isTracking = true
        submissionCount = 0
        formInteractionStart.removeAll()

        print("[FormSubmissionTracker] Started tracking")
    }

    /// Stop tracking form submissions
    func stopTracking() {
        guard isTracking else { return }

        isTracking = false

        print("[FormSubmissionTracker] Stopped tracking. Submissions: \(submissionCount)")
    }

    // MARK: - JavaScript Injection
    /// Get JavaScript to inject into WebView for form tracking
    func getTrackingScript() -> String {
        return """
        (function() {
            // Track form submissions
            document.addEventListener('submit', function(e) {
                var form = e.target;
                var fields = [];
                var sensitiveCount = 0;

                var inputs = form.querySelectorAll('input, select, textarea');
                inputs.forEach(function(input) {
                    var fieldType = input.type || input.tagName.toLowerCase();
                    var isSensitive = fieldType === 'password' ||
                                     input.name.toLowerCase().includes('password') ||
                                     input.name.toLowerCase().includes('secret') ||
                                     input.name.toLowerCase().includes('token');

                    if (isSensitive) {
                        sensitiveCount++;
                    } else {
                        fields.push({
                            fieldType: fieldType,
                            fieldName: input.name || null,
                            fieldId: input.id || null,
                            isRequired: input.required || false,
                            hasAutocomplete: input.autocomplete !== 'off',
                            autocompleteType: input.autocomplete || null,
                            placeholder: input.placeholder || null,
                            maxLength: input.maxLength > 0 ? input.maxLength : null
                        });
                    }
                });

                window.webkit.messageHandlers.formSubmission.postMessage({
                    type: 'submission',
                    formAction: form.action || null,
                    formMethod: form.method || 'get',
                    formId: form.id || null,
                    formName: form.name || null,
                    fields: fields,
                    sensitiveFieldCount: sensitiveCount
                });
            }, true);

            // Track field interactions
            \(configuration.trackInteractions ? getInteractionTrackingScript() : "")
        })();
        """
    }

    private func getInteractionTrackingScript() -> String {
        return """
            document.addEventListener('focus', function(e) {
                if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') {
                    var input = e.target;
                    if (input.type !== 'password') {
                        window.webkit.messageHandlers.formSubmission.postMessage({
                            type: 'interaction',
                            eventType: 'focus',
                            fieldType: input.type || input.tagName.toLowerCase(),
                            fieldName: input.name || null,
                            formId: input.form ? input.form.id : null
                        });
                    }
                }
            }, true);

            document.addEventListener('blur', function(e) {
                if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') {
                    var input = e.target;
                    if (input.type !== 'password') {
                        window.webkit.messageHandlers.formSubmission.postMessage({
                            type: 'interaction',
                            eventType: 'blur',
                            fieldType: input.type || input.tagName.toLowerCase(),
                            fieldName: input.name || null,
                            formId: input.form ? input.form.id : null
                        });
                    }
                }
            }, true);
        """
    }

    // MARK: - Message Handling
    /// Handle messages from WebView JavaScript
    func handleMessage(_ message: [String: Any]) {
        guard isTracking else { return }

        guard let type = message["type"] as? String else { return }

        switch type {
        case "submission":
            handleSubmissionMessage(message)
        case "interaction":
            handleInteractionMessage(message)
        default:
            break
        }
    }

    private func handleSubmissionMessage(_ message: [String: Any]) {
        let formAction = message["formAction"] as? String
        let formMethod = (message["formMethod"] as? String) ?? "get"
        let formId = message["formId"] as? String
        let formName = message["formName"] as? String
        let sensitiveCount = (message["sensitiveFieldCount"] as? Int) ?? 0

        // Parse fields
        var fields: [FormFieldInfo] = []
        if let fieldsArray = message["fields"] as? [[String: Any]] {
            for fieldDict in fieldsArray.prefix(configuration.maxFieldsPerForm) {
                let fieldType = FormFieldType(rawValue: fieldDict["fieldType"] as? String ?? "unknown") ?? .unknown

                let field = FormFieldInfo(
                    fieldType: fieldType,
                    fieldName: configuration.trackFieldNames ? fieldDict["fieldName"] as? String : nil,
                    fieldId: fieldDict["fieldId"] as? String,
                    isRequired: fieldDict["isRequired"] as? Bool ?? false,
                    hasAutocomplete: fieldDict["hasAutocomplete"] as? Bool ?? false,
                    autocompleteType: fieldDict["autocompleteType"] as? String,
                    placeholder: fieldDict["placeholder"] as? String,
                    maxLength: fieldDict["maxLength"] as? Int
                )

                // Skip sensitive fields
                if !field.shouldExclude {
                    fields.append(field)
                }
            }
        }

        // Calculate submission duration
        var duration: TimeInterval? = nil
        if let formIdKey = formId ?? formName,
           let startTime = formInteractionStart[formIdKey] {
            duration = Date().timeIntervalSince(startTime)
        }

        let event = FormSubmissionEvent(
            formAction: formAction,
            formMethod: formMethod,
            formId: formId,
            formName: formName,
            pageURL: currentPageURL,
            fields: fields,
            sensitiveFieldCount: sensitiveCount,
            submissionDuration: duration
        )

        lastSubmission = event
        submissionCount += 1

        // Clear interaction tracking for this form
        if let formIdKey = formId ?? formName {
            formInteractionStart.removeValue(forKey: formIdKey)
        }

        delegate?.formTracker(self, didDetectSubmission: event)

        // Create neural event
        Task {
            await createSubmissionNeuralEvent(event: event)
        }
    }

    private func handleInteractionMessage(_ message: [String: Any]) {
        guard configuration.trackInteractions else { return }

        let eventTypeStr = message["eventType"] as? String ?? "unknown"
        let fieldTypeStr = message["fieldType"] as? String ?? "unknown"
        let fieldName = message["fieldName"] as? String
        let formId = message["formId"] as? String

        // Skip password fields
        if fieldTypeStr == "password" { return }

        // Debounce
        let fieldKey = "\(formId ?? "")_\(fieldName ?? "")_\(fieldTypeStr)"
        if let lastTime = lastInteractionTime[fieldKey],
           Date().timeIntervalSince(lastTime) < configuration.interactionDebounce {
            return
        }
        lastInteractionTime[fieldKey] = Date()

        // Track first interaction for submission duration calculation
        if let formIdKey = formId, formInteractionStart[formIdKey] == nil {
            formInteractionStart[formIdKey] = Date()
        }

        let event = FormInteractionEvent(
            timestamp: Date(),
            eventType: FormInteractionEvent.InteractionType(rawValue: eventTypeStr) ?? .focus,
            fieldType: FormFieldType(rawValue: fieldTypeStr) ?? .unknown,
            fieldName: configuration.trackFieldNames ? fieldName : nil,
            pageURL: currentPageURL
        )

        delegate?.formTracker(self, didDetectInteraction: event)

        // Create neural event for significant interactions
        if event.eventType == .focus || event.eventType == .blur {
            Task {
                await createInteractionNeuralEvent(event: event)
            }
        }
    }

    // MARK: - Neural Event Creation
    private func createSubmissionNeuralEvent(event: FormSubmissionEvent) async {
        guard let userId = userId, let consentVersion = consentVersion else { return }

        // Build field type summary
        var fieldTypeCounts: [String: Int] = [:]
        for field in event.fields {
            let type = field.fieldType.rawValue
            fieldTypeCounts[type, default: 0] += 1
        }

        var metricsDict: [String: Any] = [
            "formMethod": event.formMethod,
            "fieldCount": event.fieldCount,
            "sensitiveFieldCount": event.sensitiveFieldCount,
            "fieldTypes": fieldTypeCounts,
            "pageURL": event.pageURL
        ]

        if let action = event.formAction {
            // Only include domain, not full URL
            if let url = URL(string: action) {
                metricsDict["formActionDomain"] = url.host ?? "unknown"
            }
        }

        if let formId = event.formId {
            metricsDict["formId"] = formId
        }

        if let duration = event.submissionDuration {
            metricsDict["submissionDuration"] = duration
        }

        let neuralEvent = NeuralEvent(
            userId: userId,
            sourceApp: .browser,
            eventType: "form_submission",
            modality: .metrics(metricsDict),
            context: EventContext.current(),
            privacyScope: .private,
            consentVersion: consentVersion
        )

        try? await NeuralIngestionClient.shared.enqueue(neuralEvent)
    }

    private func createInteractionNeuralEvent(event: FormInteractionEvent) async {
        guard let userId = userId, let consentVersion = consentVersion else { return }

        var metricsDict: [String: Any] = [
            "eventType": event.eventType.rawValue,
            "fieldType": event.fieldType.rawValue
        ]

        if let name = event.fieldName {
            metricsDict["fieldName"] = name
        }

        let neuralEvent = NeuralEvent(
            userId: userId,
            sourceApp: .browser,
            eventType: "form_interaction",
            modality: .metrics(metricsDict),
            context: EventContext.current(),
            privacyScope: .private,
            consentVersion: consentVersion
        )

        try? await NeuralIngestionClient.shared.enqueue(neuralEvent)
    }
}

// MARK: - WKScriptMessageHandler Extension
extension FormSubmissionTracker: WKScriptMessageHandler {
    nonisolated func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.name == "formSubmission",
              let body = message.body as? [String: Any] else { return }

        Task { @MainActor in
            self.handleMessage(body)
        }
    }
}
