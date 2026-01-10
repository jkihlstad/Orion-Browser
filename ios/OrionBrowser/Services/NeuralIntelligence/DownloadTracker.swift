/**
 * DownloadTracker.swift
 * Download tracking for the Neural Intelligence SDK
 * Lab environment feature - tracks file downloads from browser
 *
 * Uses WKDownloadDelegate (iOS 14.5+) for download interception
 * Captures metadata only - file type, size, source domain
 */

import Foundation
import WebKit
import Combine

// MARK: - Download State
/// State of a download
enum DownloadState: String, Codable {
    case started = "started"
    case inProgress = "in_progress"
    case completed = "completed"
    case failed = "failed"
    case cancelled = "cancelled"
}

// MARK: - Download Info
/// Information about a download (metadata only, not file content)
struct DownloadInfo: Codable, Identifiable {
    let id: UUID
    let startTime: Date
    var endTime: Date?
    let sourceURL: String
    let sourceDomain: String
    let filename: String
    let mimeType: String?
    let expectedSize: Int64?
    var downloadedSize: Int64
    var state: DownloadState
    var errorDescription: String?

    // Computed
    var duration: TimeInterval? {
        guard let end = endTime else { return nil }
        return end.timeIntervalSince(startTime)
    }

    var progress: Double {
        guard let expected = expectedSize, expected > 0 else { return 0 }
        return Double(downloadedSize) / Double(expected)
    }

    var fileExtension: String {
        (filename as NSString).pathExtension.lowercased()
    }

    var fileCategory: FileCategory {
        FileCategory.from(extension: fileExtension, mimeType: mimeType)
    }
}

// MARK: - File Category
/// Category of downloaded file
enum FileCategory: String, Codable {
    case document = "document"
    case image = "image"
    case video = "video"
    case audio = "audio"
    case archive = "archive"
    case executable = "executable"
    case code = "code"
    case other = "other"

    static func from(extension ext: String, mimeType: String?) -> FileCategory {
        // Check by extension first
        switch ext {
        case "pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "txt", "rtf", "odt", "ods", "odp":
            return .document
        case "jpg", "jpeg", "png", "gif", "webp", "svg", "bmp", "ico", "tiff":
            return .image
        case "mp4", "mov", "avi", "mkv", "webm", "m4v", "wmv":
            return .video
        case "mp3", "wav", "m4a", "aac", "flac", "ogg", "wma":
            return .audio
        case "zip", "rar", "7z", "tar", "gz", "bz2", "dmg", "iso":
            return .archive
        case "exe", "msi", "app", "pkg", "deb", "rpm":
            return .executable
        case "js", "ts", "py", "rb", "java", "swift", "c", "cpp", "h", "css", "html", "json", "xml", "yaml":
            return .code
        default:
            break
        }

        // Check by MIME type
        if let mime = mimeType?.lowercased() {
            if mime.contains("image") { return .image }
            if mime.contains("video") { return .video }
            if mime.contains("audio") { return .audio }
            if mime.contains("pdf") || mime.contains("document") || mime.contains("text") { return .document }
            if mime.contains("zip") || mime.contains("compressed") || mime.contains("archive") { return .archive }
            if mime.contains("application/x-") { return .executable }
        }

        return .other
    }
}

// MARK: - Download Event
/// Represents a download event for analytics
struct DownloadEvent: Codable {
    let downloadId: UUID
    let timestamp: Date
    let eventType: DownloadState
    let sourceDomain: String
    let filename: String
    let fileExtension: String
    let fileCategory: FileCategory
    let mimeType: String?
    let expectedSize: Int64?
    let downloadedSize: Int64
    let duration: TimeInterval?
    let errorDescription: String?
}

// MARK: - Download Tracker Configuration
/// Configuration for download tracking
struct DownloadTrackerConfiguration {
    /// Maximum concurrent downloads to track
    let maxConcurrentDownloads: Int

    /// Whether to track progress updates
    let trackProgress: Bool

    /// Progress update interval (as fraction 0-1)
    let progressUpdateInterval: Double

    /// Whether to track failed downloads
    let trackFailures: Bool

    /// Default configuration
    static var `default`: DownloadTrackerConfiguration {
        DownloadTrackerConfiguration(
            maxConcurrentDownloads: 10,
            trackProgress: false, // Only track start/complete/fail
            progressUpdateInterval: 0.25,
            trackFailures: true
        )
    }
}

// MARK: - Download Tracker Delegate
/// Delegate protocol for download events
protocol DownloadTrackerDelegate: AnyObject {
    func downloadTracker(_ tracker: DownloadTracker, didStartDownload info: DownloadInfo)
    func downloadTracker(_ tracker: DownloadTracker, didUpdateProgress info: DownloadInfo)
    func downloadTracker(_ tracker: DownloadTracker, didCompleteDownload info: DownloadInfo)
    func downloadTracker(_ tracker: DownloadTracker, didFailDownload info: DownloadInfo, error: Error?)
}

extension DownloadTrackerDelegate {
    func downloadTracker(_ tracker: DownloadTracker, didUpdateProgress info: DownloadInfo) {}
}

// MARK: - Download Tracker
/// Tracks file downloads for the Neural Intelligence SDK
@MainActor
final class DownloadTracker: NSObject, ObservableObject {
    // MARK: - Singleton
    static let shared = DownloadTracker()

    // MARK: - Properties
    weak var delegate: DownloadTrackerDelegate?

    @Published private(set) var isTracking = false
    @Published private(set) var activeDownloads: [UUID: DownloadInfo] = [:]
    @Published private(set) var completedDownloads: [DownloadInfo] = []
    @Published private(set) var downloadCount: Int = 0

    // Configuration
    private(set) var configuration: DownloadTrackerConfiguration = .default

    // Session
    private var userId: String?
    private var consentVersion: String?

    // Download mapping
    private var downloadMapping: [ObjectIdentifier: UUID] = [:] // WKDownload -> DownloadInfo ID

    // Progress tracking
    private var lastProgressUpdate: [UUID: Double] = [:]

    // MARK: - Initialization
    private override init() {
        super.init()
    }

    // MARK: - Configuration
    /// Configure the tracker for a user session
    func configure(
        userId: String,
        consentVersion: String,
        configuration: DownloadTrackerConfiguration = .default
    ) {
        self.userId = userId
        self.consentVersion = consentVersion
        self.configuration = configuration
    }

    // MARK: - Tracking Control
    /// Start tracking downloads
    func startTracking() async {
        guard !isTracking else { return }

        // Check consent
        guard await NeuralConsentManager.shared.canCollect(modality: .analytics) else {
            print("[DownloadTracker] Analytics consent not granted")
            return
        }

        isTracking = true
        downloadCount = 0
        activeDownloads.removeAll()

        print("[DownloadTracker] Started tracking")
    }

    /// Stop tracking downloads
    func stopTracking() {
        guard isTracking else { return }

        isTracking = false

        print("[DownloadTracker] Stopped tracking. Total downloads: \(downloadCount)")
    }

    // MARK: - Download Lifecycle
    /// Track a download start
    @available(iOS 14.5, *)
    func trackDownloadStart(download: WKDownload, response: URLResponse) {
        guard isTracking else { return }
        guard activeDownloads.count < configuration.maxConcurrentDownloads else {
            print("[DownloadTracker] Max concurrent downloads reached")
            return
        }

        let id = UUID()
        let sourceURL = response.url?.absoluteString ?? "unknown"
        let sourceDomain = response.url?.host ?? "unknown"
        let filename = response.suggestedFilename ?? "unknown"
        let mimeType = response.mimeType
        let expectedSize = response.expectedContentLength > 0 ? response.expectedContentLength : nil

        let info = DownloadInfo(
            id: id,
            startTime: Date(),
            endTime: nil,
            sourceURL: sourceURL,
            sourceDomain: sourceDomain,
            filename: filename,
            mimeType: mimeType,
            expectedSize: expectedSize,
            downloadedSize: 0,
            state: .started,
            errorDescription: nil
        )

        activeDownloads[id] = info
        downloadMapping[ObjectIdentifier(download)] = id
        downloadCount += 1

        delegate?.downloadTracker(self, didStartDownload: info)

        // Create neural event
        Task {
            await createDownloadEvent(info: info, eventType: .started)
        }
    }

    /// Track download progress
    @available(iOS 14.5, *)
    func trackDownloadProgress(download: WKDownload, bytesWritten: Int64, totalBytesWritten: Int64) {
        guard isTracking, configuration.trackProgress else { return }
        guard let id = downloadMapping[ObjectIdentifier(download)],
              var info = activeDownloads[id] else { return }

        info.downloadedSize = totalBytesWritten
        info.state = .inProgress
        activeDownloads[id] = info

        // Throttle progress updates
        let currentProgress = info.progress
        let lastProgress = lastProgressUpdate[id] ?? 0

        if currentProgress - lastProgress >= configuration.progressUpdateInterval {
            lastProgressUpdate[id] = currentProgress
            delegate?.downloadTracker(self, didUpdateProgress: info)
        }
    }

    /// Track download completion
    @available(iOS 14.5, *)
    func trackDownloadComplete(download: WKDownload, fileURL: URL?) {
        guard isTracking else { return }
        guard let id = downloadMapping[ObjectIdentifier(download)],
              var info = activeDownloads[id] else { return }

        info.endTime = Date()
        info.state = .completed

        // Get actual file size if available
        if let url = fileURL,
           let attributes = try? FileManager.default.attributesOfItem(atPath: url.path),
           let fileSize = attributes[.size] as? Int64 {
            info.downloadedSize = fileSize
        }

        activeDownloads.removeValue(forKey: id)
        downloadMapping.removeValue(forKey: ObjectIdentifier(download))
        lastProgressUpdate.removeValue(forKey: id)
        completedDownloads.append(info)

        // Keep only last 50 completed downloads
        if completedDownloads.count > 50 {
            completedDownloads.removeFirst(completedDownloads.count - 50)
        }

        delegate?.downloadTracker(self, didCompleteDownload: info)

        // Create neural event
        Task {
            await createDownloadEvent(info: info, eventType: .completed)
        }
    }

    /// Track download failure
    @available(iOS 14.5, *)
    func trackDownloadFailed(download: WKDownload, error: Error?) {
        guard isTracking, configuration.trackFailures else { return }
        guard let id = downloadMapping[ObjectIdentifier(download)],
              var info = activeDownloads[id] else { return }

        info.endTime = Date()
        info.state = .failed
        info.errorDescription = error?.localizedDescription

        activeDownloads.removeValue(forKey: id)
        downloadMapping.removeValue(forKey: ObjectIdentifier(download))
        lastProgressUpdate.removeValue(forKey: id)

        delegate?.downloadTracker(self, didFailDownload: info, error: error)

        // Create neural event
        Task {
            await createDownloadEvent(info: info, eventType: .failed)
        }
    }

    /// Track download cancellation
    @available(iOS 14.5, *)
    func trackDownloadCancelled(download: WKDownload) {
        guard isTracking else { return }
        guard let id = downloadMapping[ObjectIdentifier(download)],
              var info = activeDownloads[id] else { return }

        info.endTime = Date()
        info.state = .cancelled

        activeDownloads.removeValue(forKey: id)
        downloadMapping.removeValue(forKey: ObjectIdentifier(download))
        lastProgressUpdate.removeValue(forKey: id)

        // Create neural event
        Task {
            await createDownloadEvent(info: info, eventType: .cancelled)
        }
    }

    // MARK: - Manual Tracking (for non-WKDownload scenarios)
    /// Manually track a download start
    func trackManualDownloadStart(
        sourceURL: String,
        filename: String,
        mimeType: String?,
        expectedSize: Int64?
    ) -> UUID {
        let id = UUID()
        let sourceDomain = URL(string: sourceURL)?.host ?? "unknown"

        let info = DownloadInfo(
            id: id,
            startTime: Date(),
            endTime: nil,
            sourceURL: sourceURL,
            sourceDomain: sourceDomain,
            filename: filename,
            mimeType: mimeType,
            expectedSize: expectedSize,
            downloadedSize: 0,
            state: .started,
            errorDescription: nil
        )

        activeDownloads[id] = info
        downloadCount += 1

        delegate?.downloadTracker(self, didStartDownload: info)

        Task {
            await createDownloadEvent(info: info, eventType: .started)
        }

        return id
    }

    /// Manually track a download completion
    func trackManualDownloadComplete(id: UUID, downloadedSize: Int64) {
        guard var info = activeDownloads[id] else { return }

        info.endTime = Date()
        info.state = .completed
        info.downloadedSize = downloadedSize

        activeDownloads.removeValue(forKey: id)
        completedDownloads.append(info)

        delegate?.downloadTracker(self, didCompleteDownload: info)

        Task {
            await createDownloadEvent(info: info, eventType: .completed)
        }
    }

    // MARK: - Neural Event Creation
    private func createDownloadEvent(info: DownloadInfo, eventType: DownloadState) async {
        guard let userId = userId, let consentVersion = consentVersion else { return }

        var metricsDict: [String: Any] = [
            "downloadId": info.id.uuidString,
            "eventType": eventType.rawValue,
            "sourceDomain": info.sourceDomain,
            "filename": info.filename,
            "fileExtension": info.fileExtension,
            "fileCategory": info.fileCategory.rawValue
        ]

        if let mimeType = info.mimeType {
            metricsDict["mimeType"] = mimeType
        }

        if let expectedSize = info.expectedSize {
            metricsDict["expectedSize"] = expectedSize
        }

        metricsDict["downloadedSize"] = info.downloadedSize

        if let duration = info.duration {
            metricsDict["duration"] = duration
        }

        if let error = info.errorDescription {
            metricsDict["error"] = error
        }

        let event = NeuralEvent(
            userId: userId,
            sourceApp: .browser,
            eventType: "download_\(eventType.rawValue)",
            modality: .metrics(metricsDict),
            context: EventContext.current(),
            privacyScope: .private,
            consentVersion: consentVersion
        )

        try? await NeuralIngestionClient.shared.enqueue(event)
    }

    // MARK: - Statistics
    /// Get download statistics
    var statistics: DownloadStatistics {
        var categoryCount: [FileCategory: Int] = [:]
        var totalSize: Int64 = 0
        var totalDuration: TimeInterval = 0
        var durationCount = 0

        for download in completedDownloads {
            categoryCount[download.fileCategory, default: 0] += 1
            totalSize += download.downloadedSize

            if let duration = download.duration {
                totalDuration += duration
                durationCount += 1
            }
        }

        return DownloadStatistics(
            totalDownloads: downloadCount,
            completedDownloads: completedDownloads.count,
            activeDownloads: activeDownloads.count,
            categoryBreakdown: categoryCount,
            totalBytesDownloaded: totalSize,
            averageDuration: durationCount > 0 ? totalDuration / Double(durationCount) : 0
        )
    }
}

// MARK: - Download Statistics
/// Aggregated download statistics
struct DownloadStatistics {
    let totalDownloads: Int
    let completedDownloads: Int
    let activeDownloads: Int
    let categoryBreakdown: [FileCategory: Int]
    let totalBytesDownloaded: Int64
    let averageDuration: TimeInterval
}

// MARK: - WKDownloadDelegate
@available(iOS 14.5, *)
extension DownloadTracker: WKDownloadDelegate {
    nonisolated func download(_ download: WKDownload, decideDestinationUsing response: URLResponse, suggestedFilename: String) async -> URL? {
        await MainActor.run {
            trackDownloadStart(download: download, response: response)
        }

        // Return default downloads directory
        let documentsURL = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
        let downloadsURL = documentsURL.appendingPathComponent("Downloads", isDirectory: true)

        // Create directory if needed
        try? FileManager.default.createDirectory(at: downloadsURL, withIntermediateDirectories: true)

        return downloadsURL.appendingPathComponent(suggestedFilename)
    }

    nonisolated func download(_ download: WKDownload, didReceive challenge: URLAuthenticationChallenge) async -> (URLSession.AuthChallengeDisposition, URLCredential?) {
        return (.performDefaultHandling, nil)
    }

    nonisolated func downloadDidFinish(_ download: WKDownload) {
        Task { @MainActor in
            trackDownloadComplete(download: download, fileURL: nil)
        }
    }

    nonisolated func download(_ download: WKDownload, didFailWithError error: Error, resumeData: Data?) {
        Task { @MainActor in
            trackDownloadFailed(download: download, error: error)
        }
    }
}
