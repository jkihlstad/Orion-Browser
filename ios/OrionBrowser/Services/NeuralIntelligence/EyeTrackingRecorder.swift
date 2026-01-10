/**
 * EyeTrackingRecorder.swift
 * ARKit face and eye tracking for the Neural Intelligence SDK
 * SUB-AGENT 1: iOS Neural SDK Engineer
 *
 * Captures gaze data using ARKit's face tracking capabilities.
 * Only available on devices with TrueDepth camera (iPhone X and later).
 */

import ARKit
import UIKit
import Combine
import simd

// MARK: - Eye Tracking Error
/// Errors that can occur during eye tracking
enum EyeTrackingError: Error, LocalizedError {
    case notSupported
    case sessionFailed(String)
    case consentNotGranted
    case alreadyTracking
    case notTracking

    var errorDescription: String? {
        switch self {
        case .notSupported:
            return "Eye tracking requires a device with TrueDepth camera"
        case .sessionFailed(let reason):
            return "AR session failed: \(reason)"
        case .consentNotGranted:
            return "User consent not granted for eye tracking"
        case .alreadyTracking:
            return "Eye tracking is already active"
        case .notTracking:
            return "Eye tracking is not active"
        }
    }
}

// MARK: - Gaze Data
/// Represents captured gaze data from eye tracking
struct GazeData: Codable, Equatable {
    /// Timestamp of the measurement
    let timestamp: Date

    /// Left eye look-at point (normalized screen coordinates 0-1)
    let leftEyeLookAt: SIMD2<Float>?

    /// Right eye look-at point (normalized screen coordinates 0-1)
    let rightEyeLookAt: SIMD2<Float>?

    /// Combined gaze point (average of both eyes)
    let combinedGaze: SIMD2<Float>?

    /// Left eye blink amount (0 = open, 1 = closed)
    let leftEyeBlink: Float

    /// Right eye blink amount (0 = open, 1 = closed)
    let rightEyeBlink: Float

    /// Head orientation (pitch, yaw, roll in radians)
    let headOrientation: SIMD3<Float>

    /// Head position relative to camera
    let headPosition: SIMD3<Float>

    /// Confidence score (0-1)
    let confidence: Float

    /// Whether both eyes are visible
    var hasBothEyes: Bool {
        leftEyeLookAt != nil && rightEyeLookAt != nil
    }

    /// Whether user appears to be blinking
    var isBlinking: Bool {
        leftEyeBlink > 0.5 || rightEyeBlink > 0.5
    }
}

// MARK: - Gaze Metrics
/// Aggregated gaze metrics over a session
struct GazeMetrics: Codable {
    var totalSamples: Int
    var averageConfidence: Float
    var blinkCount: Int
    var blinkRate: Float // blinks per minute
    var gazeStabilityScore: Float // 0-1, higher is more stable
    var attentionScore: Float // 0-1, based on gaze focus
    var screenRegionHeatmap: [[Float]] // 3x3 grid of attention distribution
    var sessionDuration: TimeInterval

    static var empty: GazeMetrics {
        GazeMetrics(
            totalSamples: 0,
            averageConfidence: 0,
            blinkCount: 0,
            blinkRate: 0,
            gazeStabilityScore: 0,
            attentionScore: 0,
            screenRegionHeatmap: Array(repeating: Array(repeating: 0, count: 3), count: 3),
            sessionDuration: 0
        )
    }
}

// MARK: - Eye Tracking Recorder Delegate
/// Delegate protocol for receiving eye tracking events
protocol EyeTrackingRecorderDelegate: AnyObject {
    func eyeTrackingRecorder(_ recorder: EyeTrackingRecorder, didUpdateGaze gaze: GazeData)
    func eyeTrackingRecorder(_ recorder: EyeTrackingRecorder, didDetectBlink isLeft: Bool)
    func eyeTrackingRecorder(_ recorder: EyeTrackingRecorder, didEncounterError error: EyeTrackingError)
    func eyeTrackingRecorder(_ recorder: EyeTrackingRecorder, didFinishWithMetrics metrics: GazeMetrics)
}

// MARK: - Default Delegate Implementation
extension EyeTrackingRecorderDelegate {
    func eyeTrackingRecorder(_ recorder: EyeTrackingRecorder, didUpdateGaze gaze: GazeData) {}
    func eyeTrackingRecorder(_ recorder: EyeTrackingRecorder, didDetectBlink isLeft: Bool) {}
    func eyeTrackingRecorder(_ recorder: EyeTrackingRecorder, didEncounterError error: EyeTrackingError) {}
    func eyeTrackingRecorder(_ recorder: EyeTrackingRecorder, didFinishWithMetrics metrics: GazeMetrics) {}
}

// MARK: - Eye Tracking Recorder
/// Records eye and gaze tracking data using ARKit
@MainActor
final class EyeTrackingRecorder: NSObject, ObservableObject {
    // MARK: - Singleton
    static let shared = EyeTrackingRecorder()

    // MARK: - Properties
    weak var delegate: EyeTrackingRecorderDelegate?

    @Published private(set) var isTracking = false
    @Published private(set) var currentGaze: GazeData?
    @Published private(set) var metrics: GazeMetrics = .empty

    // ARKit
    private var arSession: ARSession?
    private var arView: ARSCNView?

    // Data Collection
    private var gazeHistory: [GazeData] = []
    private var sampleInterval: TimeInterval = 1.0 / 30.0 // 30 Hz
    private var lastSampleTime: Date?
    private var sessionStartTime: Date?

    // Blink Detection
    private var wasLeftEyeClosed = false
    private var wasRightEyeClosed = false
    private let blinkThreshold: Float = 0.5

    // Screen Calibration
    private var screenSize: CGSize = UIScreen.main.bounds.size
    private let phoneScreenPointsZ: Float = 0.0639 // Approximate distance to phone screen

    // Configuration
    private var userId: String?
    private var consentVersion: String?
    private var maxHistorySize = 1000

    // MARK: - Computed Properties
    /// Check if device supports face tracking
    static var isSupported: Bool {
        ARFaceTrackingConfiguration.isSupported
    }

    // MARK: - Initialization
    private override init() {
        super.init()
    }

    // MARK: - Configuration
    /// Configure the recorder for a user session
    /// - Parameters:
    ///   - userId: User identifier for events
    ///   - consentVersion: Current consent version
    ///   - sampleRate: Sample rate in Hz (default 30)
    func configure(userId: String, consentVersion: String, sampleRate: Double = 30) {
        self.userId = userId
        self.consentVersion = consentVersion
        self.sampleInterval = 1.0 / sampleRate
    }

    // MARK: - Tracking Control
    /// Start eye tracking
    /// - Parameter view: Optional ARSCNView to use (creates one if nil)
    /// - Throws: EyeTrackingError on failure
    func startTracking(in view: ARSCNView? = nil) async throws {
        guard Self.isSupported else {
            throw EyeTrackingError.notSupported
        }

        guard !isTracking else {
            throw EyeTrackingError.alreadyTracking
        }

        // Check consent
        guard await NeuralConsentManager.shared.canCollect(modality: .eyeTracking) else {
            throw EyeTrackingError.consentNotGranted
        }

        // Setup AR session
        if let view = view {
            arView = view
        } else {
            arView = ARSCNView(frame: .zero)
        }

        arSession = arView?.session ?? ARSession()
        arSession?.delegate = self

        // Configure face tracking
        let configuration = ARFaceTrackingConfiguration()
        configuration.isLightEstimationEnabled = true

        if #available(iOS 13.0, *) {
            configuration.maximumNumberOfTrackedFaces = 1
        }

        // Run session
        arSession?.run(configuration, options: [.resetTracking, .removeExistingAnchors])

        isTracking = true
        sessionStartTime = Date()
        gazeHistory.removeAll()
        metrics = .empty

        print("[EyeTrackingRecorder] Started eye tracking")
    }

    /// Stop eye tracking
    /// - Returns: Aggregated metrics from the session
    func stopTracking() async -> GazeMetrics {
        guard isTracking else { return metrics }

        arSession?.pause()
        isTracking = false

        // Calculate final metrics
        calculateMetrics()

        // Create and enqueue NeuralEvent
        if let event = await createEyeTrackingEvent() {
            try? await NeuralIngestionClient.shared.enqueue(event)
        }

        delegate?.eyeTrackingRecorder(self, didFinishWithMetrics: metrics)

        print("[EyeTrackingRecorder] Stopped eye tracking with \(metrics.totalSamples) samples")

        let finalMetrics = metrics
        gazeHistory.removeAll()
        currentGaze = nil

        return finalMetrics
    }

    // MARK: - Gaze Processing
    private func processGazeData(from faceAnchor: ARFaceAnchor) {
        // Rate limiting
        let now = Date()
        if let lastSample = lastSampleTime, now.timeIntervalSince(lastSample) < sampleInterval {
            return
        }
        lastSampleTime = now

        // Extract eye transforms
        let leftEyeTransform = faceAnchor.leftEyeTransform
        let rightEyeTransform = faceAnchor.rightEyeTransform

        // Calculate gaze points
        let leftGaze = calculateScreenGaze(from: leftEyeTransform, faceTransform: faceAnchor.transform)
        let rightGaze = calculateScreenGaze(from: rightEyeTransform, faceTransform: faceAnchor.transform)

        // Combined gaze (average of both eyes)
        var combinedGaze: SIMD2<Float>?
        if let left = leftGaze, let right = rightGaze {
            combinedGaze = (left + right) / 2.0
        } else {
            combinedGaze = leftGaze ?? rightGaze
        }

        // Get blend shapes for blink detection
        let leftBlink = faceAnchor.blendShapes[.eyeBlinkLeft]?.floatValue ?? 0
        let rightBlink = faceAnchor.blendShapes[.eyeBlinkRight]?.floatValue ?? 0

        // Extract head orientation from face transform
        let faceMatrix = faceAnchor.transform
        let headOrientation = extractEulerAngles(from: faceMatrix)
        let headPosition = SIMD3<Float>(faceMatrix.columns.3.x, faceMatrix.columns.3.y, faceMatrix.columns.3.z)

        // Calculate confidence based on tracking state
        let confidence: Float = faceAnchor.isTracked ? 1.0 : 0.5

        let gazeData = GazeData(
            timestamp: now,
            leftEyeLookAt: leftGaze,
            rightEyeLookAt: rightGaze,
            combinedGaze: combinedGaze,
            leftEyeBlink: leftBlink,
            rightEyeBlink: rightBlink,
            headOrientation: headOrientation,
            headPosition: headPosition,
            confidence: confidence
        )

        // Store and notify
        Task { @MainActor in
            self.currentGaze = gazeData
            self.addToHistory(gazeData)
            self.detectBlinks(leftBlink: leftBlink, rightBlink: rightBlink)
            self.delegate?.eyeTrackingRecorder(self, didUpdateGaze: gazeData)
        }
    }

    private func calculateScreenGaze(from eyeTransform: simd_float4x4, faceTransform: simd_float4x4) -> SIMD2<Float>? {
        // Get eye position in world space
        let eyePosition = faceTransform * eyeTransform

        // Get eye look direction (negative Z in eye space)
        let lookDirection = normalize(SIMD3<Float>(
            -eyePosition.columns.2.x,
            -eyePosition.columns.2.y,
            -eyePosition.columns.2.z
        ))

        // Eye origin
        let eyeOrigin = SIMD3<Float>(
            eyePosition.columns.3.x,
            eyePosition.columns.3.y,
            eyePosition.columns.3.z
        )

        // Intersect with screen plane (at z = phoneScreenPointsZ)
        guard lookDirection.z != 0 else { return nil }

        let t = (phoneScreenPointsZ - eyeOrigin.z) / lookDirection.z
        guard t > 0 else { return nil }

        let intersection = eyeOrigin + lookDirection * t

        // Convert to normalized screen coordinates
        // Assuming screen is roughly 0.07m wide and 0.15m tall centered at origin
        let screenWidth: Float = 0.07
        let screenHeight: Float = 0.15

        let normalizedX = (intersection.x / screenWidth) + 0.5
        let normalizedY = 1.0 - ((intersection.y / screenHeight) + 0.5)

        // Clamp to valid range
        let clampedX = max(0, min(1, normalizedX))
        let clampedY = max(0, min(1, normalizedY))

        return SIMD2<Float>(clampedX, clampedY)
    }

    private func extractEulerAngles(from matrix: simd_float4x4) -> SIMD3<Float> {
        let pitch = asin(-matrix.columns.2.y)
        let yaw = atan2(matrix.columns.2.x, matrix.columns.2.z)
        let roll = atan2(matrix.columns.0.y, matrix.columns.1.y)
        return SIMD3<Float>(pitch, yaw, roll)
    }

    // MARK: - Blink Detection
    private func detectBlinks(leftBlink: Float, rightBlink: Float) {
        // Detect left eye blink
        if leftBlink > blinkThreshold && !wasLeftEyeClosed {
            wasLeftEyeClosed = true
        } else if leftBlink < blinkThreshold && wasLeftEyeClosed {
            wasLeftEyeClosed = false
            delegate?.eyeTrackingRecorder(self, didDetectBlink: true)
        }

        // Detect right eye blink
        if rightBlink > blinkThreshold && !wasRightEyeClosed {
            wasRightEyeClosed = true
        } else if rightBlink < blinkThreshold && wasRightEyeClosed {
            wasRightEyeClosed = false
            delegate?.eyeTrackingRecorder(self, didDetectBlink: false)
        }
    }

    // MARK: - History Management
    private func addToHistory(_ gaze: GazeData) {
        gazeHistory.append(gaze)

        // Trim history if needed
        if gazeHistory.count > maxHistorySize {
            gazeHistory.removeFirst(gazeHistory.count - maxHistorySize)
        }
    }

    // MARK: - Metrics Calculation
    private func calculateMetrics() {
        guard !gazeHistory.isEmpty, let startTime = sessionStartTime else { return }

        let sessionDuration = Date().timeIntervalSince(startTime)

        // Average confidence
        let totalConfidence = gazeHistory.reduce(0) { $0 + $1.confidence }
        let averageConfidence = totalConfidence / Float(gazeHistory.count)

        // Blink detection and rate
        var blinkCount = 0
        var wasBlinking = false
        for gaze in gazeHistory {
            if gaze.isBlinking && !wasBlinking {
                blinkCount += 1
            }
            wasBlinking = gaze.isBlinking
        }
        let blinkRate = sessionDuration > 0 ? Float(blinkCount) / Float(sessionDuration / 60.0) : 0

        // Gaze stability (based on variance in gaze position)
        var gazeVariance: Float = 0
        if gazeHistory.count > 1 {
            var prevGaze: SIMD2<Float>?
            var totalMovement: Float = 0
            var moveCount = 0

            for gaze in gazeHistory {
                if let combined = gaze.combinedGaze, let prev = prevGaze {
                    totalMovement += distance(combined, prev)
                    moveCount += 1
                }
                prevGaze = gaze.combinedGaze
            }

            if moveCount > 0 {
                gazeVariance = totalMovement / Float(moveCount)
            }
        }
        let gazeStabilityScore = max(0, min(1, 1.0 - gazeVariance * 10))

        // Screen region heatmap (3x3 grid)
        var heatmap = Array(repeating: Array(repeating: Float(0), count: 3), count: 3)
        var validSamples = 0

        for gaze in gazeHistory {
            if let combined = gaze.combinedGaze {
                let gridX = min(2, Int(combined.x * 3))
                let gridY = min(2, Int(combined.y * 3))
                heatmap[gridY][gridX] += 1
                validSamples += 1
            }
        }

        // Normalize heatmap
        if validSamples > 0 {
            for y in 0..<3 {
                for x in 0..<3 {
                    heatmap[y][x] /= Float(validSamples)
                }
            }
        }

        // Attention score (based on center focus)
        let centerAttention = heatmap[1][1]
        let attentionScore = min(1, centerAttention * 3)

        metrics = GazeMetrics(
            totalSamples: gazeHistory.count,
            averageConfidence: averageConfidence,
            blinkCount: blinkCount,
            blinkRate: blinkRate,
            gazeStabilityScore: gazeStabilityScore,
            attentionScore: attentionScore,
            screenRegionHeatmap: heatmap,
            sessionDuration: sessionDuration
        )
    }

    // MARK: - Event Creation
    private func createEyeTrackingEvent() async -> NeuralEvent? {
        guard let userId = userId, let consentVersion = consentVersion else { return nil }

        return NeuralEvent(
            userId: userId,
            sourceApp: .browser,
            eventType: "eye_tracking",
            modality: .metrics([
                "totalSamples": metrics.totalSamples,
                "sessionDuration": metrics.sessionDuration,
                "averageConfidence": metrics.averageConfidence,
                "blinkCount": metrics.blinkCount,
                "blinkRate": metrics.blinkRate,
                "gazeStabilityScore": metrics.gazeStabilityScore,
                "attentionScore": metrics.attentionScore,
                "heatmap": metrics.screenRegionHeatmap.flatMap { $0 }
            ]),
            context: EventContext.current(),
            privacyScope: .private,
            consentVersion: consentVersion
        )
    }

    // MARK: - Utility
    /// Get the gaze point on a specific view
    func gazePoint(in view: UIView) -> CGPoint? {
        guard let gaze = currentGaze?.combinedGaze else { return nil }

        let viewBounds = view.bounds
        return CGPoint(
            x: CGFloat(gaze.x) * viewBounds.width,
            y: CGFloat(gaze.y) * viewBounds.height
        )
    }

    /// Check if user is looking at a specific rect in normalized coordinates
    func isLookingAt(rect: CGRect) -> Bool {
        guard let gaze = currentGaze?.combinedGaze else { return false }
        return rect.contains(CGPoint(x: CGFloat(gaze.x), y: CGFloat(gaze.y)))
    }
}

// MARK: - ARSessionDelegate
extension EyeTrackingRecorder: ARSessionDelegate {
    nonisolated func session(_ session: ARSession, didUpdate anchors: [ARAnchor]) {
        for anchor in anchors {
            guard let faceAnchor = anchor as? ARFaceAnchor else { continue }
            Task { @MainActor in
                processGazeData(from: faceAnchor)
            }
        }
    }

    nonisolated func session(_ session: ARSession, didFailWithError error: Error) {
        Task { @MainActor in
            isTracking = false
            delegate?.eyeTrackingRecorder(self, didEncounterError: .sessionFailed(error.localizedDescription))
        }
    }

    nonisolated func sessionWasInterrupted(_ session: ARSession) {
        Task { @MainActor in
            // Session was interrupted (e.g., by a phone call)
            print("[EyeTrackingRecorder] Session interrupted")
        }
    }

    nonisolated func sessionInterruptionEnded(_ session: ARSession) {
        Task { @MainActor in
            // Try to resume tracking
            if isTracking {
                let configuration = ARFaceTrackingConfiguration()
                session.run(configuration, options: [])
            }
        }
    }
}

// MARK: - SIMD Extensions for Codable
extension SIMD2: Codable where Scalar: Codable {
    public init(from decoder: Decoder) throws {
        var container = try decoder.unkeyedContainer()
        let x = try container.decode(Scalar.self)
        let y = try container.decode(Scalar.self)
        self.init(x, y)
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.unkeyedContainer()
        try container.encode(x)
        try container.encode(y)
    }
}

extension SIMD3: Codable where Scalar: Codable {
    public init(from decoder: Decoder) throws {
        var container = try decoder.unkeyedContainer()
        let x = try container.decode(Scalar.self)
        let y = try container.decode(Scalar.self)
        let z = try container.decode(Scalar.self)
        self.init(x, y, z)
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.unkeyedContainer()
        try container.encode(x)
        try container.encode(y)
        try container.encode(z)
    }
}
