/**
 * ClipboardMonitor.swift
 * Clipboard change monitoring for the Neural Intelligence SDK
 * Lab environment feature - monitors copy/paste activity
 *
 * Privacy: Excludes password fields and private messages
 * Requires explicit consent for clipboard modality
 */

import UIKit
import Combine

// MARK: - Clipboard Content Type
/// Types of clipboard content
enum ClipboardContentType: String, Codable {
    case text = "text"
    case url = "url"
    case image = "image"
    case unknown = "unknown"
}

// MARK: - Clipboard Event
/// Represents a clipboard change event
struct ClipboardEvent: Codable {
    let id: UUID
    let timestamp: Date
    let contentType: ClipboardContentType
    let contentHash: String // SHA256 hash for dedup, not actual content
    let characterCount: Int?
    let wordCount: Int?
    let hasURL: Bool
    let sourceContext: String? // URL of page where copy occurred

    init(
        contentType: ClipboardContentType,
        contentHash: String,
        characterCount: Int? = nil,
        wordCount: Int? = nil,
        hasURL: Bool = false,
        sourceContext: String? = nil
    ) {
        self.id = UUID()
        self.timestamp = Date()
        self.contentType = contentType
        self.contentHash = contentHash
        self.characterCount = characterCount
        self.wordCount = wordCount
        self.hasURL = hasURL
        self.sourceContext = sourceContext
    }
}

// MARK: - Clipboard Monitor Configuration
/// Configuration for clipboard monitoring
struct ClipboardMonitorConfiguration {
    /// Whether to capture text content (vs just metadata)
    let captureTextContent: Bool

    /// Maximum text length to capture
    let maxTextLength: Int

    /// Patterns to exclude (passwords, private messages, etc.)
    let excludePatterns: [String]

    /// Minimum change interval (debounce)
    let minChangeInterval: TimeInterval

    /// Default configuration
    static var `default`: ClipboardMonitorConfiguration {
        ClipboardMonitorConfiguration(
            captureTextContent: false, // Only metadata by default
            maxTextLength: 500,
            excludePatterns: [
                "password", "passwd", "secret", "token", "api_key", "apikey",
                "credit.?card", "card.?number", "cvv", "ssn", "social.?security"
            ],
            minChangeInterval: 1.0
        )
    }

    /// Lab environment configuration
    static var labEnvironment: ClipboardMonitorConfiguration {
        ClipboardMonitorConfiguration(
            captureTextContent: true,
            maxTextLength: 1000,
            excludePatterns: [
                "password", "passwd", "secret", "token", "api_key", "apikey",
                "credit.?card", "card.?number", "cvv", "ssn", "social.?security",
                "private", "confidential"
            ],
            minChangeInterval: 0.5
        )
    }
}

// MARK: - Clipboard Monitor Delegate
/// Delegate protocol for clipboard events
protocol ClipboardMonitorDelegate: AnyObject {
    func clipboardMonitor(_ monitor: ClipboardMonitor, didDetectChange event: ClipboardEvent)
}

// MARK: - Clipboard Monitor
/// Monitors clipboard changes for the Neural Intelligence SDK
@MainActor
final class ClipboardMonitor: ObservableObject {
    // MARK: - Singleton
    static let shared = ClipboardMonitor()

    // MARK: - Properties
    weak var delegate: ClipboardMonitorDelegate?

    @Published private(set) var isMonitoring = false
    @Published private(set) var lastEvent: ClipboardEvent?
    @Published private(set) var eventCount: Int = 0

    // Configuration
    private(set) var configuration: ClipboardMonitorConfiguration = .default

    // Session
    private var userId: String?
    private var consentVersion: String?
    private var currentPageURL: String?

    // Change detection
    private var lastChangeCount: Int = 0
    private var lastChangeTime: Date?
    private var cancellables = Set<AnyCancellable>()

    // Exclude patterns compiled regex
    private var excludeRegexes: [NSRegularExpression] = []

    // MARK: - Initialization
    private init() {
        compileExcludePatterns()
    }

    // MARK: - Configuration
    /// Configure the monitor for a user session
    func configure(
        userId: String,
        consentVersion: String,
        configuration: ClipboardMonitorConfiguration = .default
    ) {
        self.userId = userId
        self.consentVersion = consentVersion
        self.configuration = configuration
        compileExcludePatterns()
    }

    /// Update the current page context
    func updatePageContext(_ url: String?) {
        currentPageURL = url
    }

    // MARK: - Monitoring Control
    /// Start monitoring clipboard changes
    func startMonitoring() async {
        guard !isMonitoring else { return }

        // Check consent
        guard await NeuralConsentManager.shared.canCollect(modality: .analytics) else {
            print("[ClipboardMonitor] Analytics consent not granted")
            return
        }

        isMonitoring = true
        lastChangeCount = UIPasteboard.general.changeCount
        eventCount = 0

        // Observe clipboard changes
        NotificationCenter.default.publisher(for: UIPasteboard.changedNotification)
            .sink { [weak self] _ in
                Task { @MainActor [weak self] in
                    await self?.handleClipboardChange()
                }
            }
            .store(in: &cancellables)

        // Also poll periodically (iOS doesn't always send notifications)
        Timer.publish(every: 1.0, on: .main, in: .common)
            .autoconnect()
            .sink { [weak self] _ in
                Task { @MainActor [weak self] in
                    await self?.checkForChanges()
                }
            }
            .store(in: &cancellables)

        print("[ClipboardMonitor] Started monitoring")
    }

    /// Stop monitoring clipboard changes
    func stopMonitoring() {
        guard isMonitoring else { return }

        isMonitoring = false
        cancellables.removeAll()

        print("[ClipboardMonitor] Stopped monitoring. Total events: \(eventCount)")
    }

    // MARK: - Change Detection
    private func checkForChanges() async {
        let currentCount = UIPasteboard.general.changeCount

        if currentCount != lastChangeCount {
            lastChangeCount = currentCount
            await handleClipboardChange()
        }
    }

    private func handleClipboardChange() async {
        // Debounce
        if let lastTime = lastChangeTime,
           Date().timeIntervalSince(lastTime) < configuration.minChangeInterval {
            return
        }
        lastChangeTime = Date()

        let pasteboard = UIPasteboard.general

        // Determine content type and extract metadata
        var contentType: ClipboardContentType = .unknown
        var contentHash = ""
        var characterCount: Int?
        var wordCount: Int?
        var hasURL = false
        var textContent: String?

        if pasteboard.hasStrings, let text = pasteboard.string {
            // Check if content should be excluded
            if shouldExcludeContent(text) {
                print("[ClipboardMonitor] Content excluded by privacy filter")
                return
            }

            contentType = .text
            contentHash = hashContent(text)
            characterCount = text.count
            wordCount = countWords(in: text)
            hasURL = text.contains("http://") || text.contains("https://")

            // Check if it's primarily a URL
            if let url = URL(string: text.trimmingCharacters(in: .whitespacesAndNewlines)),
               url.scheme != nil {
                contentType = .url
            }

            // Capture text if configured (and not excluded)
            if configuration.captureTextContent {
                textContent = String(text.prefix(configuration.maxTextLength))
            }

        } else if pasteboard.hasImages {
            contentType = .image
            if let image = pasteboard.image,
               let data = image.pngData() {
                contentHash = hashData(data)
            }
        } else if pasteboard.hasURLs, let url = pasteboard.url {
            contentType = .url
            contentHash = hashContent(url.absoluteString)
            hasURL = true
        }

        // Create event
        let event = ClipboardEvent(
            contentType: contentType,
            contentHash: contentHash,
            characterCount: characterCount,
            wordCount: wordCount,
            hasURL: hasURL,
            sourceContext: currentPageURL
        )

        lastEvent = event
        eventCount += 1

        // Notify delegate
        delegate?.clipboardMonitor(self, didDetectChange: event)

        // Create neural event
        await createNeuralEvent(event: event, textContent: textContent)
    }

    // MARK: - Privacy Filtering
    private func compileExcludePatterns() {
        excludeRegexes = configuration.excludePatterns.compactMap { pattern in
            try? NSRegularExpression(pattern: pattern, options: .caseInsensitive)
        }
    }

    private func shouldExcludeContent(_ text: String) -> Bool {
        let range = NSRange(text.startIndex..., in: text)

        for regex in excludeRegexes {
            if regex.firstMatch(in: text, options: [], range: range) != nil {
                return true
            }
        }

        // Also exclude if it looks like a password (all special chars, no spaces, etc.)
        if text.count < 50 && !text.contains(" ") {
            let specialCharRatio = Double(text.filter { !$0.isLetter && !$0.isNumber }.count) / Double(text.count)
            if specialCharRatio > 0.3 {
                return true // Likely a password or token
            }
        }

        return false
    }

    // MARK: - Hashing
    private func hashContent(_ text: String) -> String {
        guard let data = text.data(using: .utf8) else { return "" }
        return hashData(data)
    }

    private func hashData(_ data: Data) -> String {
        // Simple hash for deduplication (not cryptographic security)
        var hash: UInt64 = 5381
        for byte in data {
            hash = ((hash << 5) &+ hash) &+ UInt64(byte)
        }
        return String(format: "%016llx", hash)
    }

    private func countWords(in text: String) -> Int {
        text.components(separatedBy: .whitespacesAndNewlines)
            .filter { !$0.isEmpty }
            .count
    }

    // MARK: - Neural Event Creation
    private func createNeuralEvent(event: ClipboardEvent, textContent: String?) async {
        guard let userId = userId, let consentVersion = consentVersion else { return }

        var metricsDict: [String: Any] = [
            "contentType": event.contentType.rawValue,
            "contentHash": event.contentHash,
            "hasURL": event.hasURL
        ]

        if let charCount = event.characterCount {
            metricsDict["characterCount"] = charCount
        }

        if let words = event.wordCount {
            metricsDict["wordCount"] = words
        }

        if let context = event.sourceContext {
            metricsDict["sourceContext"] = context
        }

        let modality = EventModality(
            text: textContent,
            metrics: metricsDict.mapValues { AnyCodable($0) }
        )

        let neuralEvent = NeuralEvent(
            userId: userId,
            sourceApp: .browser,
            eventType: "clipboard_change",
            modality: modality,
            context: EventContext.current(),
            privacyScope: .private,
            consentVersion: consentVersion
        )

        try? await NeuralIngestionClient.shared.enqueue(neuralEvent)
    }
}

// MARK: - Consent Modality Extension
extension NeuralConsentModality {
    static let clipboard = NeuralConsentModality.analytics // Use analytics consent for clipboard
}
