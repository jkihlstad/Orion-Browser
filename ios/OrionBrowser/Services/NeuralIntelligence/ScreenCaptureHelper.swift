/**
 * ScreenCaptureHelper.swift
 * Screen snapshot capture for the Neural Intelligence SDK
 * SUB-AGENT 1: iOS Neural SDK Engineer
 *
 * Provides screen and view hierarchy capture capabilities with
 * automatic NeuralEvent creation for visual context tracking.
 */

import UIKit
import Combine

// MARK: - Screen Capture Error
/// Errors that can occur during screen capture
enum ScreenCaptureError: Error, LocalizedError {
    case noWindow
    case captureFailed(String)
    case saveFailed(String)
    case consentNotGranted
    case invalidView

    var errorDescription: String? {
        switch self {
        case .noWindow:
            return "No window available for capture"
        case .captureFailed(let reason):
            return "Screen capture failed: \(reason)"
        case .saveFailed(let reason):
            return "Failed to save screenshot: \(reason)"
        case .consentNotGranted:
            return "User consent not granted for screen capture"
        case .invalidView:
            return "Invalid view for capture"
        }
    }
}

// MARK: - Capture Configuration
/// Configuration options for screen capture
struct ScreenCaptureConfiguration {
    /// Image compression quality (0.0 to 1.0)
    let compressionQuality: CGFloat

    /// Whether to capture only the visible portion
    let captureVisibleOnly: Bool

    /// Whether to redact sensitive fields
    let redactSensitiveFields: Bool

    /// Scale factor for the captured image
    let scaleFactor: CGFloat

    /// Maximum dimension for the captured image
    let maxDimension: CGFloat?

    /// Default configuration
    static var `default`: ScreenCaptureConfiguration {
        ScreenCaptureConfiguration(
            compressionQuality: 0.8,
            captureVisibleOnly: true,
            redactSensitiveFields: true,
            scaleFactor: 1.0,
            maxDimension: 1920
        )
    }

    /// High quality configuration
    static var highQuality: ScreenCaptureConfiguration {
        ScreenCaptureConfiguration(
            compressionQuality: 1.0,
            captureVisibleOnly: false,
            redactSensitiveFields: true,
            scaleFactor: UIScreen.main.scale,
            maxDimension: nil
        )
    }

    /// Low bandwidth configuration
    static var lowBandwidth: ScreenCaptureConfiguration {
        ScreenCaptureConfiguration(
            compressionQuality: 0.5,
            captureVisibleOnly: true,
            redactSensitiveFields: true,
            scaleFactor: 0.5,
            maxDimension: 800
        )
    }
}

// MARK: - Capture Result
/// Result of a screen capture operation
struct ScreenCaptureResult {
    /// URL where the screenshot is saved
    let url: URL

    /// Size of the captured image
    let size: CGSize

    /// File size in bytes
    let fileSize: Int64

    /// Timestamp of capture
    let timestamp: Date

    /// Configuration used for capture
    let configuration: ScreenCaptureConfiguration

    /// Areas that were redacted
    let redactedAreas: [CGRect]
}

// MARK: - Screen Capture Helper
/// Helper class for capturing screen content
@MainActor
final class ScreenCaptureHelper: ObservableObject {
    // MARK: - Singleton
    static let shared = ScreenCaptureHelper()

    // MARK: - Properties
    @Published private(set) var isCapturing = false
    @Published private(set) var lastCaptureResult: ScreenCaptureResult?

    // Storage
    private let fileManager = FileManager.default
    private lazy var screenshotsDirectory: URL = {
        let paths = fileManager.urls(for: .documentDirectory, in: .userDomainMask)
        let screenshotsDir = paths[0].appendingPathComponent("NeuralScreenshots", isDirectory: true)
        try? fileManager.createDirectory(at: screenshotsDir, withIntermediateDirectories: true)
        return screenshotsDir
    }()

    // Configuration
    private var userId: String?
    private var consentVersion: String?
    private var defaultConfiguration: ScreenCaptureConfiguration = .default

    // Sensitive field detection
    private let sensitiveFieldTypes: [AnyClass] = [
        UITextField.self,
        UITextView.self
    ]

    // MARK: - Initialization
    private init() {}

    // MARK: - Configuration
    /// Configure the capture helper for a user session
    /// - Parameters:
    ///   - userId: User identifier for events
    ///   - consentVersion: Current consent version
    ///   - configuration: Default capture configuration
    func configure(
        userId: String,
        consentVersion: String,
        configuration: ScreenCaptureConfiguration = .default
    ) {
        self.userId = userId
        self.consentVersion = consentVersion
        self.defaultConfiguration = configuration
    }

    // MARK: - Capture Methods
    /// Capture the entire screen
    /// - Parameter configuration: Optional configuration override
    /// - Returns: ScreenCaptureResult with capture details
    /// - Throws: ScreenCaptureError on failure
    func captureScreen(configuration: ScreenCaptureConfiguration? = nil) async throws -> ScreenCaptureResult {
        // Check consent
        guard await NeuralConsentManager.shared.canCollect(modality: .analytics) else {
            throw ScreenCaptureError.consentNotGranted
        }

        guard let window = UIApplication.shared.connectedScenes
            .compactMap({ $0 as? UIWindowScene })
            .flatMap({ $0.windows })
            .first(where: { $0.isKeyWindow }) else {
            throw ScreenCaptureError.noWindow
        }

        return try await captureView(window, configuration: configuration)
    }

    /// Capture a specific view
    /// - Parameters:
    ///   - view: View to capture
    ///   - configuration: Optional configuration override
    /// - Returns: ScreenCaptureResult with capture details
    /// - Throws: ScreenCaptureError on failure
    func captureView(_ view: UIView, configuration: ScreenCaptureConfiguration? = nil) async throws -> ScreenCaptureResult {
        // Check consent
        guard await NeuralConsentManager.shared.canCollect(modality: .analytics) else {
            throw ScreenCaptureError.consentNotGranted
        }

        isCapturing = true
        defer { isCapturing = false }

        let config = configuration ?? defaultConfiguration

        // Find sensitive fields to redact
        var redactedAreas: [CGRect] = []
        if config.redactSensitiveFields {
            redactedAreas = findSensitiveFields(in: view)
        }

        // Render the view
        let renderer = UIGraphicsImageRenderer(
            size: CGSize(
                width: view.bounds.width * config.scaleFactor,
                height: view.bounds.height * config.scaleFactor
            )
        )

        let image = renderer.image { context in
            // Apply scale transform
            context.cgContext.scaleBy(x: config.scaleFactor, y: config.scaleFactor)

            // Render the view hierarchy
            if config.captureVisibleOnly {
                view.drawHierarchy(in: view.bounds, afterScreenUpdates: true)
            } else {
                view.layer.render(in: context.cgContext)
            }

            // Redact sensitive areas
            if config.redactSensitiveFields {
                context.cgContext.setFillColor(UIColor.black.cgColor)
                for area in redactedAreas {
                    let scaledArea = CGRect(
                        x: area.origin.x * config.scaleFactor,
                        y: area.origin.y * config.scaleFactor,
                        width: area.width * config.scaleFactor,
                        height: area.height * config.scaleFactor
                    )
                    context.cgContext.fill(scaledArea)
                }
            }
        }

        // Resize if needed
        let finalImage: UIImage
        if let maxDim = config.maxDimension {
            finalImage = resizeImage(image, maxDimension: maxDim)
        } else {
            finalImage = image
        }

        // Save to disk
        let filename = "screenshot_\(Int(Date().timeIntervalSince1970 * 1000)).png"
        let url = screenshotsDirectory.appendingPathComponent(filename)

        guard let imageData = finalImage.pngData() else {
            throw ScreenCaptureError.captureFailed("Failed to generate PNG data")
        }

        do {
            try imageData.write(to: url, options: .atomic)
        } catch {
            throw ScreenCaptureError.saveFailed(error.localizedDescription)
        }

        let result = ScreenCaptureResult(
            url: url,
            size: finalImage.size,
            fileSize: Int64(imageData.count),
            timestamp: Date(),
            configuration: config,
            redactedAreas: redactedAreas
        )

        lastCaptureResult = result

        // Create and enqueue NeuralEvent
        if let event = await createScreenCaptureEvent(result: result) {
            try? await NeuralIngestionClient.shared.enqueue(event)
        }

        return result
    }

    /// Capture a specific region of a view
    /// - Parameters:
    ///   - view: View to capture from
    ///   - rect: Region to capture in view coordinates
    ///   - configuration: Optional configuration override
    /// - Returns: ScreenCaptureResult with capture details
    /// - Throws: ScreenCaptureError on failure
    func captureRegion(
        of view: UIView,
        rect: CGRect,
        configuration: ScreenCaptureConfiguration? = nil
    ) async throws -> ScreenCaptureResult {
        // Check consent
        guard await NeuralConsentManager.shared.canCollect(modality: .analytics) else {
            throw ScreenCaptureError.consentNotGranted
        }

        guard view.bounds.intersects(rect) else {
            throw ScreenCaptureError.invalidView
        }

        isCapturing = true
        defer { isCapturing = false }

        let config = configuration ?? defaultConfiguration

        let renderer = UIGraphicsImageRenderer(
            size: CGSize(
                width: rect.width * config.scaleFactor,
                height: rect.height * config.scaleFactor
            )
        )

        let image = renderer.image { context in
            context.cgContext.scaleBy(x: config.scaleFactor, y: config.scaleFactor)
            context.cgContext.translateBy(x: -rect.origin.x, y: -rect.origin.y)
            view.drawHierarchy(in: view.bounds, afterScreenUpdates: true)
        }

        // Save to disk
        let filename = "screenshot_region_\(Int(Date().timeIntervalSince1970 * 1000)).png"
        let url = screenshotsDirectory.appendingPathComponent(filename)

        guard let imageData = image.pngData() else {
            throw ScreenCaptureError.captureFailed("Failed to generate PNG data")
        }

        do {
            try imageData.write(to: url, options: .atomic)
        } catch {
            throw ScreenCaptureError.saveFailed(error.localizedDescription)
        }

        let result = ScreenCaptureResult(
            url: url,
            size: image.size,
            fileSize: Int64(imageData.count),
            timestamp: Date(),
            configuration: config,
            redactedAreas: []
        )

        lastCaptureResult = result

        return result
    }

    // MARK: - Sensitive Field Detection
    private func findSensitiveFields(in view: UIView) -> [CGRect] {
        var sensitiveRects: [CGRect] = []

        func searchSubviews(_ view: UIView, in rootView: UIView) {
            for subview in view.subviews {
                // Check if this is a sensitive field type
                if sensitiveFieldTypes.contains(where: { subview.isKind(of: $0) }) {
                    // Check for secure text entry
                    if let textField = subview as? UITextField, textField.isSecureTextEntry {
                        let rect = subview.convert(subview.bounds, to: rootView)
                        sensitiveRects.append(rect)
                    } else if let textField = subview as? UITextField {
                        // Check for password-like content types
                        if textField.textContentType == .password ||
                           textField.textContentType == .newPassword ||
                           textField.textContentType == .oneTimeCode {
                            let rect = subview.convert(subview.bounds, to: rootView)
                            sensitiveRects.append(rect)
                        }
                    }
                }

                // Recursively search subviews
                searchSubviews(subview, in: rootView)
            }
        }

        searchSubviews(view, in: view)
        return sensitiveRects
    }

    // MARK: - Image Processing
    private func resizeImage(_ image: UIImage, maxDimension: CGFloat) -> UIImage {
        let size = image.size
        let ratio = maxDimension / max(size.width, size.height)

        if ratio >= 1.0 {
            return image
        }

        let newSize = CGSize(width: size.width * ratio, height: size.height * ratio)

        let renderer = UIGraphicsImageRenderer(size: newSize)
        return renderer.image { _ in
            image.draw(in: CGRect(origin: .zero, size: newSize))
        }
    }

    // MARK: - Event Creation
    private func createScreenCaptureEvent(result: ScreenCaptureResult) async -> NeuralEvent? {
        guard let userId = userId, let consentVersion = consentVersion else { return nil }

        return NeuralEvent(
            userId: userId,
            sourceApp: .browser,
            eventType: "screen_capture",
            modality: EventModality(
                imageRef: result.url.path,
                metrics: [
                    "width": AnyCodable(result.size.width),
                    "height": AnyCodable(result.size.height),
                    "fileSize": AnyCodable(result.fileSize),
                    "redactedAreaCount": AnyCodable(result.redactedAreas.count),
                    "compressionQuality": AnyCodable(result.configuration.compressionQuality)
                ]
            ),
            context: EventContext.current(),
            privacyScope: .private,
            consentVersion: consentVersion
        )
    }

    // MARK: - Cleanup
    /// Delete a screenshot at the specified URL
    func deleteScreenshot(at url: URL) {
        try? fileManager.removeItem(at: url)
    }

    /// Get all screenshots in the screenshots directory
    func getAllScreenshots() -> [URL] {
        (try? fileManager.contentsOfDirectory(
            at: screenshotsDirectory,
            includingPropertiesForKeys: [.creationDateKey, .fileSizeKey],
            options: [.skipsHiddenFiles]
        )) ?? []
    }

    /// Clear all screenshots
    func clearAllScreenshots() {
        for url in getAllScreenshots() {
            try? fileManager.removeItem(at: url)
        }
    }

    /// Get total storage used by screenshots
    func getStorageUsed() -> Int64 {
        getAllScreenshots().reduce(0) { total, url in
            let size = (try? fileManager.attributesOfItem(atPath: url.path)[.size] as? Int64) ?? 0
            return total + size
        }
    }

    /// Clean up old screenshots beyond a certain age
    /// - Parameter maxAge: Maximum age in seconds
    func cleanupOldScreenshots(maxAge: TimeInterval) {
        let cutoffDate = Date().addingTimeInterval(-maxAge)

        for url in getAllScreenshots() {
            if let attributes = try? fileManager.attributesOfItem(atPath: url.path),
               let creationDate = attributes[.creationDate] as? Date,
               creationDate < cutoffDate {
                try? fileManager.removeItem(at: url)
            }
        }
    }
}

// MARK: - Continuous Capture
extension ScreenCaptureHelper {
    /// Capture screenshots at a regular interval
    /// - Parameters:
    ///   - interval: Capture interval in seconds
    ///   - duration: Total duration in seconds (nil for indefinite)
    ///   - configuration: Capture configuration
    /// - Returns: AsyncStream of capture results
    func continuousCapture(
        interval: TimeInterval,
        duration: TimeInterval? = nil,
        configuration: ScreenCaptureConfiguration? = nil
    ) -> AsyncStream<ScreenCaptureResult> {
        AsyncStream { continuation in
            Task {
                let startTime = Date()
                var captureCount = 0

                while true {
                    // Check duration limit
                    if let duration = duration,
                       Date().timeIntervalSince(startTime) >= duration {
                        continuation.finish()
                        break
                    }

                    // Capture
                    if let result = try? await captureScreen(configuration: configuration) {
                        continuation.yield(result)
                        captureCount += 1
                    }

                    // Wait for next interval
                    try? await Task.sleep(nanoseconds: UInt64(interval * 1_000_000_000))

                    // Check if task is cancelled
                    if Task.isCancelled {
                        continuation.finish()
                        break
                    }
                }
            }
        }
    }
}
