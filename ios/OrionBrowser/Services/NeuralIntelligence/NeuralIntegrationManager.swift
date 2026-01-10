/**
 * NeuralIntegrationManager.swift
 * Unified integration manager for the Neural Intelligence SDK
 * SUB-AGENT 1: iOS Neural SDK Engineer
 *
 * Coordinates all input sources including location, gestures, scroll depth,
 * session timing, and engagement metrics. Central hub for Neural data collection.
 */

import UIKit
import CoreLocation
import Combine

// MARK: - Session State
/// Current state of a tracking session
enum NeuralSessionState {
    case inactive
    case active
    case paused
    case backgrounded
}

// MARK: - Session Metrics
/// Aggregated metrics for a tracking session
struct NeuralSessionMetrics: Codable {
    /// Session identifier
    let sessionId: UUID

    /// Session start time
    let startTime: Date

    /// Session end time (nil if still active)
    var endTime: Date?

    /// Total session duration in seconds
    var duration: TimeInterval

    /// Number of page views
    var pageViewCount: Int

    /// Number of interactions (taps, scrolls, etc.)
    var interactionCount: Int

    /// Total scroll distance in points
    var totalScrollDistance: CGFloat

    /// Maximum scroll depth reached (0-1)
    var maxScrollDepth: CGFloat

    /// Number of unique URLs visited
    var uniqueUrlCount: Int

    /// Average time on page in seconds
    var avgTimeOnPage: TimeInterval

    /// Number of events generated
    var eventCount: Int

    /// Background time in seconds
    var backgroundTime: TimeInterval

    /// Active time in seconds
    var activeTime: TimeInterval { duration - backgroundTime }

    /// Engagement score (0-1)
    var engagementScore: Double {
        // Simple engagement calculation based on interactions and time
        let interactionRate = Double(interactionCount) / max(1, duration / 60) // per minute
        let pageViewRate = Double(pageViewCount) / max(1, duration / 60)
        let scrollEngagement = Double(maxScrollDepth)

        return min(1.0, (interactionRate * 0.3 + pageViewRate * 0.3 + scrollEngagement * 0.4) / 10)
    }

    static func new() -> NeuralSessionMetrics {
        NeuralSessionMetrics(
            sessionId: UUID(),
            startTime: Date(),
            endTime: nil,
            duration: 0,
            pageViewCount: 0,
            interactionCount: 0,
            totalScrollDistance: 0,
            maxScrollDepth: 0,
            uniqueUrlCount: 0,
            avgTimeOnPage: 0,
            eventCount: 0,
            backgroundTime: 0
        )
    }
}

// MARK: - Scroll Tracking
/// Tracks scroll depth and velocity
struct ScrollTrackingData: Codable {
    var currentDepth: CGFloat // 0-1
    var maxDepth: CGFloat // 0-1
    var velocity: CGFloat // points per second
    var direction: ScrollDirection
    var contentHeight: CGFloat
    var viewportHeight: CGFloat

    enum ScrollDirection: String, Codable {
        case up, down, none
    }
}

// MARK: - Gesture Data
/// Captured gesture information
struct GestureData: Codable {
    let type: GestureType
    let location: CGPoint
    let timestamp: Date
    var force: CGFloat?
    var velocity: CGPoint?
    var scale: CGFloat?
    var rotation: CGFloat?

    enum GestureType: String, Codable {
        case tap
        case doubleTap
        case longPress
        case pan
        case swipe
        case pinch
        case rotation
    }
}

// MARK: - Integration Manager Delegate
/// Delegate protocol for receiving integration events
protocol NeuralIntegrationManagerDelegate: AnyObject {
    func integrationManager(_ manager: NeuralIntegrationManager, didUpdateSessionMetrics metrics: NeuralSessionMetrics)
    func integrationManager(_ manager: NeuralIntegrationManager, didUpdateLocation location: CLLocation)
    func integrationManager(_ manager: NeuralIntegrationManager, didDetectGesture gesture: GestureData)
    func integrationManager(_ manager: NeuralIntegrationManager, didUpdateScrollDepth depth: CGFloat)
    func integrationManager(_ manager: NeuralIntegrationManager, sessionDidEnd metrics: NeuralSessionMetrics)
}

// MARK: - Default Delegate Implementation
extension NeuralIntegrationManagerDelegate {
    func integrationManager(_ manager: NeuralIntegrationManager, didUpdateSessionMetrics metrics: NeuralSessionMetrics) {}
    func integrationManager(_ manager: NeuralIntegrationManager, didUpdateLocation location: CLLocation) {}
    func integrationManager(_ manager: NeuralIntegrationManager, didDetectGesture gesture: GestureData) {}
    func integrationManager(_ manager: NeuralIntegrationManager, didUpdateScrollDepth depth: CGFloat) {}
    func integrationManager(_ manager: NeuralIntegrationManager, sessionDidEnd metrics: NeuralSessionMetrics) {}
}

// MARK: - Neural Integration Manager
/// Central manager coordinating all Neural input sources
@MainActor
final class NeuralIntegrationManager: NSObject, ObservableObject {
    // MARK: - Singleton
    static let shared = NeuralIntegrationManager()

    // MARK: - Properties
    weak var delegate: NeuralIntegrationManagerDelegate?

    @Published private(set) var sessionState: NeuralSessionState = .inactive
    @Published private(set) var sessionMetrics: NeuralSessionMetrics = .new()
    @Published private(set) var currentLocation: CLLocation?
    @Published private(set) var currentScrollDepth: CGFloat = 0

    // Location
    private let locationManager = CLLocationManager()
    private var lastLocationUpdate: Date?
    private let locationUpdateInterval: TimeInterval = 60 // Update every minute

    // Session Timing
    private var sessionTimer: Timer?
    private var backgroundEntryTime: Date?
    private var pageStartTime: Date?
    private var visitedUrls: Set<String> = []

    // Scroll Tracking
    private var scrollTrackingData: ScrollTrackingData?

    // Reading Time Tracking
    private var currentPageContentLength: Int = 0
    private var currentPageWordCount: Int = 0
    private var currentPageURL: String?
    private var readingStartTime: Date?
    private var totalActiveReadingTime: TimeInterval = 0
    private var lastScrollTime: Date?
    private var scrollPauseCount: Int = 0
    private let scrollPauseThreshold: TimeInterval = 2.0 // Consider paused if no scroll for 2 seconds

    // Cancellables
    private var cancellables = Set<AnyCancellable>()

    // Configuration
    private var userId: String?
    private var consentVersion: String?

    // MARK: - Initialization
    private override init() {
        super.init()
        setupLocationManager()
        setupLifecycleObservers()
    }

    // MARK: - Configuration
    /// Configure the integration manager for a user session
    /// - Parameters:
    ///   - userId: User identifier for events
    ///   - consentVersion: Current consent version
    func configure(userId: String, consentVersion: String) {
        self.userId = userId
        self.consentVersion = consentVersion

        // Configure all child components
        NeuralMediaRecorder.shared.configure(userId: userId, consentVersion: consentVersion)
        EyeTrackingRecorder.shared.configure(userId: userId, consentVersion: consentVersion)
        ScreenCaptureHelper.shared.configure(userId: userId, consentVersion: consentVersion)
        KeystrokeTracker.shared.configure(userId: userId, consentVersion: consentVersion)
    }

    // MARK: - Session Control
    /// Start a new tracking session
    func startSession() async {
        guard sessionState == .inactive else { return }

        // Check consent
        guard await NeuralConsentManager.shared.canCollect(modality: .analytics) else {
            print("[NeuralIntegrationManager] Analytics consent not granted")
            return
        }

        sessionMetrics = .new()
        sessionState = .active
        visitedUrls.removeAll()
        pageStartTime = Date()

        // Start session timer
        startSessionTimer()

        // Start keystroke tracking
        KeystrokeTracker.shared.startTracking()

        // Start location updates if consented
        if await NeuralConsentManager.shared.canCollect(modality: .location) {
            startLocationUpdates()
        }

        // Initialize ingestion client
        await NeuralIngestionClient.shared.initialize(authToken: nil)

        print("[NeuralIntegrationManager] Session started: \(sessionMetrics.sessionId)")

        // Create session start event
        await createSessionEvent(type: "session_start")
    }

    /// Pause the tracking session
    func pauseSession() {
        guard sessionState == .active else { return }

        sessionState = .paused
        stopSessionTimer()
        KeystrokeTracker.shared.stopTracking()

        print("[NeuralIntegrationManager] Session paused")
    }

    /// Resume the tracking session
    func resumeSession() async {
        guard sessionState == .paused else { return }

        sessionState = .active
        startSessionTimer()
        KeystrokeTracker.shared.startTracking()

        print("[NeuralIntegrationManager] Session resumed")
    }

    /// End the tracking session
    func endSession() async {
        guard sessionState != .inactive else { return }

        sessionState = .inactive
        stopSessionTimer()
        KeystrokeTracker.shared.stopTracking()
        stopLocationUpdates()

        // Emit reading time for current page before ending
        await emitCurrentPageReadingTime()

        // Finalize metrics
        sessionMetrics.endTime = Date()
        sessionMetrics.duration = sessionMetrics.endTime!.timeIntervalSince(sessionMetrics.startTime)

        // Create session end event
        await createSessionEvent(type: "session_end")

        // Flush all pending events
        await NeuralIngestionClient.shared.flush()

        delegate?.integrationManager(self, sessionDidEnd: sessionMetrics)

        print("[NeuralIntegrationManager] Session ended. Duration: \(sessionMetrics.duration)s, Events: \(sessionMetrics.eventCount)")
    }

    // MARK: - Page Tracking
    /// Record a page view
    /// - Parameters:
    ///   - url: URL of the page
    ///   - title: Title of the page
    ///   - contentLength: Character count of page content (optional)
    ///   - wordCount: Word count of page content (optional)
    func recordPageView(url: String, title: String?, contentLength: Int? = nil, wordCount: Int? = nil) async {
        guard sessionState == .active else { return }

        // Emit reading time event for previous page before switching
        if let previousURL = currentPageURL, let startTime = readingStartTime {
            await emitReadingTimeEvent(
                url: previousURL,
                timeSpent: Date().timeIntervalSince(startTime),
                scrollDepthReached: sessionMetrics.maxScrollDepth,
                contentLength: currentPageContentLength,
                wordCount: currentPageWordCount
            )
        }

        // Update page timing
        if let startTime = pageStartTime {
            let timeOnPage = Date().timeIntervalSince(startTime)
            let totalTime = sessionMetrics.avgTimeOnPage * Double(sessionMetrics.pageViewCount) + timeOnPage
            sessionMetrics.avgTimeOnPage = totalTime / Double(sessionMetrics.pageViewCount + 1)
        }
        pageStartTime = Date()

        // Reset reading time tracking for new page
        currentPageURL = url
        currentPageContentLength = contentLength ?? 0
        currentPageWordCount = wordCount ?? 0
        readingStartTime = Date()
        totalActiveReadingTime = 0
        lastScrollTime = nil
        scrollPauseCount = 0

        // Update metrics
        sessionMetrics.pageViewCount += 1
        if !visitedUrls.contains(url) {
            visitedUrls.insert(url)
            sessionMetrics.uniqueUrlCount = visitedUrls.count
        }

        // Reset scroll depth for new page
        currentScrollDepth = 0
        scrollTrackingData = nil

        // Create navigation event
        guard let userId = userId, let consentVersion = consentVersion else { return }

        let event = NeuralEvent.navigation(
            userId: userId,
            url: url,
            title: title,
            consentVersion: consentVersion
        )

        try? await NeuralIngestionClient.shared.enqueue(event)
        sessionMetrics.eventCount += 1

        delegate?.integrationManager(self, didUpdateSessionMetrics: sessionMetrics)
    }

    /// Update page content information (for reading time calculation)
    /// - Parameters:
    ///   - contentLength: Character count of visible content
    ///   - wordCount: Word count of visible content
    func updatePageContent(contentLength: Int, wordCount: Int) {
        currentPageContentLength = contentLength
        currentPageWordCount = wordCount
    }

    // MARK: - Scroll Tracking
    /// Update scroll position
    /// - Parameters:
    ///   - scrollView: The scroll view being tracked
    func updateScrollPosition(_ scrollView: UIScrollView) async {
        guard sessionState == .active else { return }

        let contentHeight = scrollView.contentSize.height
        let viewportHeight = scrollView.bounds.height
        let offset = scrollView.contentOffset.y

        guard contentHeight > viewportHeight else { return }

        let depth = (offset + viewportHeight) / contentHeight
        let clampedDepth = min(1.0, max(0.0, depth))

        // Update tracking data
        let previousDepth = scrollTrackingData?.currentDepth ?? 0
        let direction: ScrollTrackingData.ScrollDirection = clampedDepth > previousDepth ? .down : (clampedDepth < previousDepth ? .up : .none)

        let velocity = abs(clampedDepth - previousDepth) * CGFloat(sessionMetrics.duration > 0 ? 1 : 0)

        scrollTrackingData = ScrollTrackingData(
            currentDepth: clampedDepth,
            maxDepth: max(scrollTrackingData?.maxDepth ?? 0, clampedDepth),
            velocity: velocity,
            direction: direction,
            contentHeight: contentHeight,
            viewportHeight: viewportHeight
        )

        currentScrollDepth = clampedDepth
        sessionMetrics.maxScrollDepth = max(sessionMetrics.maxScrollDepth, clampedDepth)
        sessionMetrics.totalScrollDistance += abs(offset - (scrollTrackingData?.currentDepth ?? 0) * contentHeight)

        delegate?.integrationManager(self, didUpdateScrollDepth: clampedDepth)

        // Create scroll event at significant milestones (25%, 50%, 75%, 100%)
        let milestones: [CGFloat] = [0.25, 0.5, 0.75, 1.0]
        for milestone in milestones {
            if previousDepth < milestone && clampedDepth >= milestone {
                await createScrollMilestoneEvent(depth: milestone)
                break
            }
        }
    }

    /// Record a scroll event
    /// - Parameters:
    ///   - depth: Current scroll depth (0-1)
    ///   - velocity: Scroll velocity
    func recordScroll(depth: CGFloat, velocity: CGFloat) async {
        guard sessionState == .active else { return }
        guard let userId = userId, let consentVersion = consentVersion else { return }

        sessionMetrics.interactionCount += 1

        let event = NeuralEvent.scroll(
            userId: userId,
            depth: Double(depth),
            velocity: Double(velocity),
            consentVersion: consentVersion
        )

        try? await NeuralIngestionClient.shared.enqueue(event)
        sessionMetrics.eventCount += 1
    }

    // MARK: - Gesture Tracking
    /// Record a gesture
    /// - Parameter gesture: Gesture data
    func recordGesture(_ gesture: GestureData) async {
        guard sessionState == .active else { return }
        guard let userId = userId, let consentVersion = consentVersion else { return }

        sessionMetrics.interactionCount += 1

        var metrics: [String: Any] = [
            "type": gesture.type.rawValue,
            "x": gesture.location.x,
            "y": gesture.location.y
        ]

        if let force = gesture.force {
            metrics["force"] = force
        }

        if let velocity = gesture.velocity {
            metrics["velocityX"] = velocity.x
            metrics["velocityY"] = velocity.y
        }

        if let scale = gesture.scale {
            metrics["scale"] = scale
        }

        if let rotation = gesture.rotation {
            metrics["rotation"] = rotation
        }

        let event = NeuralEvent(
            userId: userId,
            sourceApp: .browser,
            eventType: "gesture_\(gesture.type.rawValue)",
            modality: .metrics(metrics),
            context: EventContext.current(),
            privacyScope: .private,
            consentVersion: consentVersion
        )

        try? await NeuralIngestionClient.shared.enqueue(event)
        sessionMetrics.eventCount += 1

        delegate?.integrationManager(self, didDetectGesture: gesture)
    }

    /// Create gesture recognizers for a view
    /// - Parameter view: View to add gesture recognizers to
    func addGestureTracking(to view: UIView) {
        // Tap
        let tapGesture = UITapGestureRecognizer(target: self, action: #selector(handleTap(_:)))
        view.addGestureRecognizer(tapGesture)

        // Long press
        let longPressGesture = UILongPressGestureRecognizer(target: self, action: #selector(handleLongPress(_:)))
        view.addGestureRecognizer(longPressGesture)

        // Pan
        let panGesture = UIPanGestureRecognizer(target: self, action: #selector(handlePan(_:)))
        view.addGestureRecognizer(panGesture)

        // Pinch
        let pinchGesture = UIPinchGestureRecognizer(target: self, action: #selector(handlePinch(_:)))
        view.addGestureRecognizer(pinchGesture)

        // Rotation
        let rotationGesture = UIRotationGestureRecognizer(target: self, action: #selector(handleRotation(_:)))
        view.addGestureRecognizer(rotationGesture)
    }

    @objc private func handleTap(_ gesture: UITapGestureRecognizer) {
        let location = gesture.location(in: gesture.view)
        let data = GestureData(type: .tap, location: location, timestamp: Date())
        Task { await recordGesture(data) }
    }

    @objc private func handleLongPress(_ gesture: UILongPressGestureRecognizer) {
        guard gesture.state == .began else { return }
        let location = gesture.location(in: gesture.view)
        let data = GestureData(type: .longPress, location: location, timestamp: Date())
        Task { await recordGesture(data) }
    }

    @objc private func handlePan(_ gesture: UIPanGestureRecognizer) {
        guard gesture.state == .ended else { return }
        let location = gesture.location(in: gesture.view)
        let velocity = gesture.velocity(in: gesture.view)
        var data = GestureData(type: .pan, location: location, timestamp: Date())
        data.velocity = velocity
        Task { await recordGesture(data) }
    }

    @objc private func handlePinch(_ gesture: UIPinchGestureRecognizer) {
        guard gesture.state == .ended else { return }
        let location = gesture.location(in: gesture.view)
        var data = GestureData(type: .pinch, location: location, timestamp: Date())
        data.scale = gesture.scale
        Task { await recordGesture(data) }
    }

    @objc private func handleRotation(_ gesture: UIRotationGestureRecognizer) {
        guard gesture.state == .ended else { return }
        let location = gesture.location(in: gesture.view)
        var data = GestureData(type: .rotation, location: location, timestamp: Date())
        data.rotation = gesture.rotation
        Task { await recordGesture(data) }
    }

    // MARK: - Location Tracking
    private func setupLocationManager() {
        locationManager.delegate = self
        locationManager.desiredAccuracy = kCLLocationAccuracyHundredMeters
        locationManager.distanceFilter = 100 // Update every 100 meters
    }

    private func startLocationUpdates() {
        guard CLLocationManager.locationServicesEnabled() else { return }

        switch locationManager.authorizationStatus {
        case .authorizedWhenInUse, .authorizedAlways:
            locationManager.startUpdatingLocation()
        case .notDetermined:
            locationManager.requestWhenInUseAuthorization()
        default:
            break
        }
    }

    private func stopLocationUpdates() {
        locationManager.stopUpdatingLocation()
    }

    // MARK: - Session Timer
    private func startSessionTimer() {
        sessionTimer = Timer.scheduledTimer(withTimeInterval: 1.0, repeats: true) { [weak self] _ in
            Task { @MainActor [weak self] in
                self?.updateSessionDuration()
            }
        }
    }

    private func stopSessionTimer() {
        sessionTimer?.invalidate()
        sessionTimer = nil
    }

    private func updateSessionDuration() {
        guard sessionState == .active else { return }

        sessionMetrics.duration = Date().timeIntervalSince(sessionMetrics.startTime) - sessionMetrics.backgroundTime

        delegate?.integrationManager(self, didUpdateSessionMetrics: sessionMetrics)
    }

    // MARK: - Lifecycle Observers
    private func setupLifecycleObservers() {
        NotificationCenter.default.publisher(for: UIApplication.didEnterBackgroundNotification)
            .sink { [weak self] _ in
                Task { @MainActor [weak self] in
                    self?.handleEnterBackground()
                }
            }
            .store(in: &cancellables)

        NotificationCenter.default.publisher(for: UIApplication.willEnterForegroundNotification)
            .sink { [weak self] _ in
                Task { @MainActor [weak self] in
                    self?.handleEnterForeground()
                }
            }
            .store(in: &cancellables)

        NotificationCenter.default.publisher(for: UIApplication.willTerminateNotification)
            .sink { [weak self] _ in
                Task { @MainActor [weak self] in
                    await self?.endSession()
                }
            }
            .store(in: &cancellables)
    }

    private func handleEnterBackground() {
        guard sessionState == .active else { return }

        sessionState = .backgrounded
        backgroundEntryTime = Date()
        stopSessionTimer()

        Task {
            await NeuralIngestionClient.shared.flush()
        }
    }

    private func handleEnterForeground() {
        guard sessionState == .backgrounded else { return }

        if let entryTime = backgroundEntryTime {
            sessionMetrics.backgroundTime += Date().timeIntervalSince(entryTime)
        }
        backgroundEntryTime = nil

        sessionState = .active
        startSessionTimer()
    }

    // MARK: - Event Creation
    private func createSessionEvent(type: String) async {
        guard let userId = userId, let consentVersion = consentVersion else { return }

        let metricsDict: [String: Any] = [
            "sessionId": sessionMetrics.sessionId.uuidString,
            "duration": sessionMetrics.duration,
            "pageViewCount": sessionMetrics.pageViewCount,
            "interactionCount": sessionMetrics.interactionCount,
            "maxScrollDepth": sessionMetrics.maxScrollDepth,
            "uniqueUrlCount": sessionMetrics.uniqueUrlCount,
            "avgTimeOnPage": sessionMetrics.avgTimeOnPage,
            "eventCount": sessionMetrics.eventCount,
            "engagementScore": sessionMetrics.engagementScore
        ]

        let event = NeuralEvent(
            userId: userId,
            sourceApp: .browser,
            eventType: type,
            modality: .metrics(metricsDict),
            context: EventContext.current(),
            privacyScope: .private,
            consentVersion: consentVersion
        )

        try? await NeuralIngestionClient.shared.enqueue(event)
        sessionMetrics.eventCount += 1
    }

    private func createScrollMilestoneEvent(depth: CGFloat) async {
        guard let userId = userId, let consentVersion = consentVersion else { return }

        let event = NeuralEvent(
            userId: userId,
            sourceApp: .browser,
            eventType: "scroll_milestone",
            modality: .metrics([
                "milestone": Int(depth * 100),
                "totalScrollDistance": sessionMetrics.totalScrollDistance
            ]),
            context: EventContext.current(),
            privacyScope: .private,
            consentVersion: consentVersion
        )

        try? await NeuralIngestionClient.shared.enqueue(event)
        sessionMetrics.eventCount += 1
    }

    // MARK: - Reading Time Events
    /// Emit a reading time event for a page
    private func emitReadingTimeEvent(
        url: String,
        timeSpent: TimeInterval,
        scrollDepthReached: CGFloat,
        contentLength: Int,
        wordCount: Int
    ) async {
        guard let userId = userId, let consentVersion = consentVersion else { return }

        // Calculate reading metrics
        let estimatedWordsRead = Int(Double(wordCount) * Double(scrollDepthReached))
        let readingSpeed: Double = timeSpent > 0 ? Double(estimatedWordsRead) / (timeSpent / 60.0) : 0 // WPM

        // Calculate engagement score based on time, scroll, and content
        let expectedReadingTime = Double(wordCount) / 200.0 * 60.0 // Assume 200 WPM average
        let timeEngagement = min(1.0, timeSpent / max(1, expectedReadingTime))
        let scrollEngagement = Double(scrollDepthReached)
        let engagementScore = (timeEngagement * 0.5 + scrollEngagement * 0.5)

        var metricsDict: [String: Any] = [
            "timeSpent": timeSpent,
            "scrollDepthReached": scrollDepthReached,
            "scrollPauseCount": scrollPauseCount,
            "engagementScore": engagementScore
        ]

        // Only include domain for privacy
        if let urlObj = URL(string: url) {
            metricsDict["domain"] = urlObj.host ?? "unknown"
        }

        if contentLength > 0 {
            metricsDict["contentLength"] = contentLength
        }

        if wordCount > 0 {
            metricsDict["wordCount"] = wordCount
            metricsDict["estimatedWordsRead"] = estimatedWordsRead
            metricsDict["readingSpeed"] = readingSpeed
        }

        let event = NeuralEvent(
            userId: userId,
            sourceApp: .browser,
            eventType: "reading_time",
            modality: .metrics(metricsDict),
            context: EventContext.current(),
            privacyScope: .private,
            consentVersion: consentVersion
        )

        try? await NeuralIngestionClient.shared.enqueue(event)
        sessionMetrics.eventCount += 1
    }

    /// Track scroll activity for reading time calculation
    func trackScrollActivity() {
        let now = Date()

        // Check if this is a scroll pause (resumed scrolling after pause)
        if let lastScroll = lastScrollTime {
            let timeSinceLastScroll = now.timeIntervalSince(lastScroll)
            if timeSinceLastScroll > scrollPauseThreshold {
                scrollPauseCount += 1
            }
        }

        lastScrollTime = now
    }

    /// Manually emit reading time for current page (e.g., when session ends)
    func emitCurrentPageReadingTime() async {
        guard let url = currentPageURL, let startTime = readingStartTime else { return }

        await emitReadingTimeEvent(
            url: url,
            timeSpent: Date().timeIntervalSince(startTime),
            scrollDepthReached: sessionMetrics.maxScrollDepth,
            contentLength: currentPageContentLength,
            wordCount: currentPageWordCount
        )
    }

    private func createLocationEvent(_ location: CLLocation) async {
        guard let userId = userId, let consentVersion = consentVersion else { return }

        let event = NeuralEvent(
            userId: userId,
            sourceApp: .browser,
            eventType: "location_update",
            modality: .metrics([
                "latitude": location.coordinate.latitude,
                "longitude": location.coordinate.longitude,
                "accuracy": location.horizontalAccuracy,
                "altitude": location.altitude,
                "speed": location.speed
            ]),
            context: EventContext.current(),
            privacyScope: .private,
            consentVersion: consentVersion
        )

        try? await NeuralIngestionClient.shared.enqueue(event)
        sessionMetrics.eventCount += 1
    }
}

// MARK: - CLLocationManagerDelegate
extension NeuralIntegrationManager: CLLocationManagerDelegate {
    nonisolated func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard let location = locations.last else { return }

        Task { @MainActor in
            // Rate limit location updates
            if let lastUpdate = lastLocationUpdate,
               Date().timeIntervalSince(lastUpdate) < locationUpdateInterval {
                return
            }

            lastLocationUpdate = Date()
            currentLocation = location

            delegate?.integrationManager(self, didUpdateLocation: location)

            // Create location event
            await createLocationEvent(location)
        }
    }

    nonisolated func locationManager(_ manager: CLLocationManager, didChangeAuthorization status: CLAuthorizationStatus) {
        Task { @MainActor in
            switch status {
            case .authorizedWhenInUse, .authorizedAlways:
                if sessionState == .active {
                    startLocationUpdates()
                }
            default:
                stopLocationUpdates()
            }
        }
    }

    nonisolated func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        print("[NeuralIntegrationManager] Location error: \(error.localizedDescription)")
    }
}
