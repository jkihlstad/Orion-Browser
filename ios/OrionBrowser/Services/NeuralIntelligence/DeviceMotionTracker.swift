/**
 * DeviceMotionTracker.swift
 * Device motion and orientation tracking for the Neural Intelligence SDK
 * Lab environment feature - tracks accelerometer and gyroscope data
 *
 * Uses CoreMotion framework for sensor access
 * Useful for detecting user attention and engagement patterns
 */

import Foundation
import CoreMotion
import Combine

// MARK: - Device Motion Data
/// Captured device motion information
struct DeviceMotionData: Codable {
    let timestamp: Date

    // Attitude (orientation)
    let pitch: Double // Rotation around x-axis (-π to π)
    let roll: Double // Rotation around y-axis (-π/2 to π/2)
    let yaw: Double // Rotation around z-axis (-π to π)

    // User acceleration (excluding gravity)
    let userAccelerationX: Double
    let userAccelerationY: Double
    let userAccelerationZ: Double

    // Gravity vector
    let gravityX: Double
    let gravityY: Double
    let gravityZ: Double

    // Rotation rate (radians/second)
    let rotationRateX: Double
    let rotationRateY: Double
    let rotationRateZ: Double

    // Computed properties
    var totalAcceleration: Double {
        sqrt(pow(userAccelerationX, 2) + pow(userAccelerationY, 2) + pow(userAccelerationZ, 2))
    }

    var totalRotation: Double {
        sqrt(pow(rotationRateX, 2) + pow(rotationRateY, 2) + pow(rotationRateZ, 2))
    }

    var isDeviceFlat: Bool {
        abs(pitch) < 0.3 && abs(roll) < 0.3
    }

    var isDevicePortrait: Bool {
        abs(pitch) > 1.0 && abs(roll) < 0.5
    }

    var isDeviceLandscape: Bool {
        abs(roll) > 1.0 && abs(pitch) < 0.5
    }
}

// MARK: - Motion Activity State
/// Detected activity state
enum MotionActivityState: String, Codable {
    case stationary = "stationary"
    case walking = "walking"
    case running = "running"
    case driving = "driving"
    case unknown = "unknown"
}

// MARK: - Device Motion Metrics
/// Aggregated motion metrics over a time window
struct DeviceMotionMetrics: Codable {
    let windowStart: Date
    let windowEnd: Date
    let sampleCount: Int

    // Average values
    let avgPitch: Double
    let avgRoll: Double
    let avgYaw: Double
    let avgAcceleration: Double
    let avgRotation: Double

    // Variance (for stability detection)
    let pitchVariance: Double
    let rollVariance: Double
    let accelerationVariance: Double

    // Detected state
    let activityState: MotionActivityState
    let stabilityScore: Double // 0-1, higher = more stable
}

// MARK: - Device Motion Configuration
/// Configuration for motion tracking
struct DeviceMotionConfiguration {
    /// Update interval in seconds
    let updateInterval: TimeInterval

    /// Metrics aggregation window in seconds
    let metricsWindow: TimeInterval

    /// Minimum acceleration to record (filters noise)
    let accelerationThreshold: Double

    /// Whether to track activity (walking, driving, etc.)
    let trackActivity: Bool

    /// Default configuration
    static var `default`: DeviceMotionConfiguration {
        DeviceMotionConfiguration(
            updateInterval: 0.1, // 10 Hz
            metricsWindow: 5.0, // 5 second windows
            accelerationThreshold: 0.01,
            trackActivity: true
        )
    }

    /// Battery-saving configuration
    static var lowPower: DeviceMotionConfiguration {
        DeviceMotionConfiguration(
            updateInterval: 0.5, // 2 Hz
            metricsWindow: 10.0,
            accelerationThreshold: 0.05,
            trackActivity: false
        )
    }
}

// MARK: - Device Motion Tracker Delegate
/// Delegate protocol for motion events
protocol DeviceMotionTrackerDelegate: AnyObject {
    func motionTracker(_ tracker: DeviceMotionTracker, didUpdateMotion data: DeviceMotionData)
    func motionTracker(_ tracker: DeviceMotionTracker, didCalculateMetrics metrics: DeviceMotionMetrics)
    func motionTracker(_ tracker: DeviceMotionTracker, didDetectActivity state: MotionActivityState)
}

extension DeviceMotionTrackerDelegate {
    func motionTracker(_ tracker: DeviceMotionTracker, didUpdateMotion data: DeviceMotionData) {}
    func motionTracker(_ tracker: DeviceMotionTracker, didCalculateMetrics metrics: DeviceMotionMetrics) {}
    func motionTracker(_ tracker: DeviceMotionTracker, didDetectActivity state: MotionActivityState) {}
}

// MARK: - Device Motion Tracker
/// Tracks device motion and orientation for the Neural Intelligence SDK
@MainActor
final class DeviceMotionTracker: ObservableObject {
    // MARK: - Singleton
    static let shared = DeviceMotionTracker()

    // MARK: - Properties
    weak var delegate: DeviceMotionTrackerDelegate?

    @Published private(set) var isTracking = false
    @Published private(set) var currentMotion: DeviceMotionData?
    @Published private(set) var currentMetrics: DeviceMotionMetrics?
    @Published private(set) var activityState: MotionActivityState = .unknown

    // Configuration
    private(set) var configuration: DeviceMotionConfiguration = .default

    // CoreMotion
    private let motionManager = CMMotionManager()
    private let activityManager = CMMotionActivityManager()
    private let operationQueue = OperationQueue()

    // Session
    private var userId: String?
    private var consentVersion: String?

    // Data collection
    private var motionSamples: [DeviceMotionData] = []
    private var windowStartTime: Date?
    private var metricsTimer: Timer?

    // MARK: - Initialization
    private init() {
        operationQueue.name = "DeviceMotionTracker"
        operationQueue.maxConcurrentOperationCount = 1
    }

    // MARK: - Configuration
    /// Configure the tracker for a user session
    func configure(
        userId: String,
        consentVersion: String,
        configuration: DeviceMotionConfiguration = .default
    ) {
        self.userId = userId
        self.consentVersion = consentVersion
        self.configuration = configuration
    }

    // MARK: - Availability Check
    /// Check if device motion is available
    var isDeviceMotionAvailable: Bool {
        motionManager.isDeviceMotionAvailable
    }

    /// Check if activity tracking is available
    var isActivityTrackingAvailable: Bool {
        CMMotionActivityManager.isActivityAvailable()
    }

    // MARK: - Tracking Control
    /// Start tracking device motion
    func startTracking() async {
        guard !isTracking else { return }
        guard motionManager.isDeviceMotionAvailable else {
            print("[DeviceMotionTracker] Device motion not available")
            return
        }

        // Check consent
        guard await NeuralConsentManager.shared.canCollect(modality: .analytics) else {
            print("[DeviceMotionTracker] Analytics consent not granted")
            return
        }

        isTracking = true
        motionSamples.removeAll()
        windowStartTime = Date()

        // Configure motion manager
        motionManager.deviceMotionUpdateInterval = configuration.updateInterval

        // Start device motion updates
        motionManager.startDeviceMotionUpdates(to: operationQueue) { [weak self] motion, error in
            guard let self = self, let motion = motion else {
                if let error = error {
                    print("[DeviceMotionTracker] Error: \(error.localizedDescription)")
                }
                return
            }

            Task { @MainActor in
                self.handleMotionUpdate(motion)
            }
        }

        // Start activity tracking if configured
        if configuration.trackActivity && CMMotionActivityManager.isActivityAvailable() {
            activityManager.startActivityUpdates(to: operationQueue) { [weak self] activity in
                guard let activity = activity else { return }
                Task { @MainActor in
                    self?.handleActivityUpdate(activity)
                }
            }
        }

        // Start metrics aggregation timer
        metricsTimer = Timer.scheduledTimer(withTimeInterval: configuration.metricsWindow, repeats: true) { [weak self] _ in
            Task { @MainActor in
                await self?.calculateAndEmitMetrics()
            }
        }

        print("[DeviceMotionTracker] Started tracking")
    }

    /// Stop tracking device motion
    func stopTracking() {
        guard isTracking else { return }

        isTracking = false

        motionManager.stopDeviceMotionUpdates()
        activityManager.stopActivityUpdates()
        metricsTimer?.invalidate()
        metricsTimer = nil

        // Emit final metrics
        Task {
            await calculateAndEmitMetrics()
        }

        print("[DeviceMotionTracker] Stopped tracking. Samples collected: \(motionSamples.count)")
    }

    // MARK: - Motion Handling
    private func handleMotionUpdate(_ motion: CMDeviceMotion) {
        let data = DeviceMotionData(
            timestamp: Date(),
            pitch: motion.attitude.pitch,
            roll: motion.attitude.roll,
            yaw: motion.attitude.yaw,
            userAccelerationX: motion.userAcceleration.x,
            userAccelerationY: motion.userAcceleration.y,
            userAccelerationZ: motion.userAcceleration.z,
            gravityX: motion.gravity.x,
            gravityY: motion.gravity.y,
            gravityZ: motion.gravity.z,
            rotationRateX: motion.rotationRate.x,
            rotationRateY: motion.rotationRate.y,
            rotationRateZ: motion.rotationRate.z
        )

        // Filter noise
        if data.totalAcceleration < configuration.accelerationThreshold {
            // Still record orientation data even if acceleration is low
            currentMotion = data
            motionSamples.append(data)
            return
        }

        currentMotion = data
        motionSamples.append(data)

        delegate?.motionTracker(self, didUpdateMotion: data)
    }

    private func handleActivityUpdate(_ activity: CMMotionActivity) {
        let newState: MotionActivityState

        if activity.stationary {
            newState = .stationary
        } else if activity.walking {
            newState = .walking
        } else if activity.running {
            newState = .running
        } else if activity.automotive {
            newState = .driving
        } else {
            newState = .unknown
        }

        if newState != activityState {
            activityState = newState
            delegate?.motionTracker(self, didDetectActivity: newState)

            // Create activity change event
            Task {
                await createActivityEvent(state: newState)
            }
        }
    }

    // MARK: - Metrics Calculation
    private func calculateAndEmitMetrics() async {
        guard !motionSamples.isEmpty else { return }

        let samples = motionSamples
        let windowStart = windowStartTime ?? samples.first!.timestamp
        let windowEnd = Date()

        // Reset for next window
        motionSamples.removeAll()
        windowStartTime = Date()

        // Calculate averages
        let avgPitch = samples.map { $0.pitch }.reduce(0, +) / Double(samples.count)
        let avgRoll = samples.map { $0.roll }.reduce(0, +) / Double(samples.count)
        let avgYaw = samples.map { $0.yaw }.reduce(0, +) / Double(samples.count)
        let avgAccel = samples.map { $0.totalAcceleration }.reduce(0, +) / Double(samples.count)
        let avgRotation = samples.map { $0.totalRotation }.reduce(0, +) / Double(samples.count)

        // Calculate variance
        let pitchVariance = calculateVariance(samples.map { $0.pitch }, mean: avgPitch)
        let rollVariance = calculateVariance(samples.map { $0.roll }, mean: avgRoll)
        let accelVariance = calculateVariance(samples.map { $0.totalAcceleration }, mean: avgAccel)

        // Calculate stability score (inverse of variance, normalized)
        let maxVariance = 1.0
        let combinedVariance = (pitchVariance + rollVariance + accelVariance) / 3
        let stabilityScore = max(0, min(1, 1 - (combinedVariance / maxVariance)))

        let metrics = DeviceMotionMetrics(
            windowStart: windowStart,
            windowEnd: windowEnd,
            sampleCount: samples.count,
            avgPitch: avgPitch,
            avgRoll: avgRoll,
            avgYaw: avgYaw,
            avgAcceleration: avgAccel,
            avgRotation: avgRotation,
            pitchVariance: pitchVariance,
            rollVariance: rollVariance,
            accelerationVariance: accelVariance,
            activityState: activityState,
            stabilityScore: stabilityScore
        )

        currentMetrics = metrics
        delegate?.motionTracker(self, didCalculateMetrics: metrics)

        // Create neural event
        await createMotionMetricsEvent(metrics: metrics)
    }

    private func calculateVariance(_ values: [Double], mean: Double) -> Double {
        guard values.count > 1 else { return 0 }
        let squaredDiffs = values.map { pow($0 - mean, 2) }
        return squaredDiffs.reduce(0, +) / Double(values.count - 1)
    }

    // MARK: - Neural Event Creation
    private func createMotionMetricsEvent(metrics: DeviceMotionMetrics) async {
        guard let userId = userId, let consentVersion = consentVersion else { return }

        let metricsDict: [String: Any] = [
            "sampleCount": metrics.sampleCount,
            "avgPitch": metrics.avgPitch,
            "avgRoll": metrics.avgRoll,
            "avgYaw": metrics.avgYaw,
            "avgAcceleration": metrics.avgAcceleration,
            "avgRotation": metrics.avgRotation,
            "pitchVariance": metrics.pitchVariance,
            "rollVariance": metrics.rollVariance,
            "accelerationVariance": metrics.accelerationVariance,
            "activityState": metrics.activityState.rawValue,
            "stabilityScore": metrics.stabilityScore,
            "windowDuration": metrics.windowEnd.timeIntervalSince(metrics.windowStart)
        ]

        let event = NeuralEvent(
            userId: userId,
            sourceApp: .browser,
            eventType: "device_motion_metrics",
            modality: .metrics(metricsDict),
            context: EventContext.current(),
            privacyScope: .private,
            consentVersion: consentVersion
        )

        try? await NeuralIngestionClient.shared.enqueue(event)
    }

    private func createActivityEvent(state: MotionActivityState) async {
        guard let userId = userId, let consentVersion = consentVersion else { return }

        let event = NeuralEvent(
            userId: userId,
            sourceApp: .browser,
            eventType: "activity_change",
            modality: .metrics([
                "activityState": state.rawValue,
                "previousState": activityState.rawValue
            ]),
            context: EventContext.current(),
            privacyScope: .private,
            consentVersion: consentVersion
        )

        try? await NeuralIngestionClient.shared.enqueue(event)
    }
}
