/**
 * NeuralMediaRecorder.swift
 * AVFoundation media capture for the Neural Intelligence SDK
 * SUB-AGENT 1: iOS Neural SDK Engineer
 *
 * Provides audio and video recording capabilities with automatic
 * NeuralEvent creation and integration with the ingestion pipeline.
 */

import AVFoundation
import UIKit
import Combine

// MARK: - Neural Media Recorder Delegate
/// Delegate protocol for receiving media recording events
protocol NeuralMediaRecorderDelegate: AnyObject {
    func mediaRecorder(_ recorder: NeuralMediaRecorder, didStartRecording type: NeuralMediaRecorder.MediaType)
    func mediaRecorder(_ recorder: NeuralMediaRecorder, didStopRecording type: NeuralMediaRecorder.MediaType, event: NeuralEvent?)
    func mediaRecorder(_ recorder: NeuralMediaRecorder, didUpdateAudioLevel level: Float)
    func mediaRecorder(_ recorder: NeuralMediaRecorder, didEncounterError error: NeuralMediaRecorderError)
    func mediaRecorder(_ recorder: NeuralMediaRecorder, didDetectSpeakers speakers: [SpeakerSegment])
}

// MARK: - Default Delegate Implementation
extension NeuralMediaRecorderDelegate {
    func mediaRecorder(_ recorder: NeuralMediaRecorder, didStartRecording type: NeuralMediaRecorder.MediaType) {}
    func mediaRecorder(_ recorder: NeuralMediaRecorder, didStopRecording type: NeuralMediaRecorder.MediaType, event: NeuralEvent?) {}
    func mediaRecorder(_ recorder: NeuralMediaRecorder, didUpdateAudioLevel level: Float) {}
    func mediaRecorder(_ recorder: NeuralMediaRecorder, didEncounterError error: NeuralMediaRecorderError) {}
    func mediaRecorder(_ recorder: NeuralMediaRecorder, didDetectSpeakers speakers: [SpeakerSegment]) {}
}

// MARK: - Media Recorder Error
/// Errors that can occur during media recording
enum NeuralMediaRecorderError: Error, LocalizedError {
    case permissionDenied(NeuralMediaRecorder.MediaType)
    case consentNotGranted
    case setupFailed(String)
    case recordingFailed(String)
    case exportFailed(String)
    case interrupted
    case deviceNotAvailable
    case alreadyRecording
    case notRecording

    var errorDescription: String? {
        switch self {
        case .permissionDenied(let type):
            return "\(type.displayName) permission denied"
        case .consentNotGranted:
            return "User consent not granted for recording"
        case .setupFailed(let reason):
            return "Setup failed: \(reason)"
        case .recordingFailed(let reason):
            return "Recording failed: \(reason)"
        case .exportFailed(let reason):
            return "Export failed: \(reason)"
        case .interrupted:
            return "Recording was interrupted"
        case .deviceNotAvailable:
            return "Recording device not available"
        case .alreadyRecording:
            return "Already recording"
        case .notRecording:
            return "Not currently recording"
        }
    }
}

// MARK: - Speaker Segment
/// Represents a detected speaker segment for diarization
struct SpeakerSegment: Codable, Identifiable {
    let id: UUID
    let speakerId: String
    let startTime: TimeInterval
    let endTime: TimeInterval
    let confidence: Double

    var duration: TimeInterval { endTime - startTime }
}

// MARK: - Recording Metadata
/// Metadata captured during recording
struct RecordingMetadata: Codable {
    let duration: TimeInterval
    let fileSize: Int64
    let format: String
    let sampleRate: Double?
    let channels: Int?
    let resolution: CGSize?
    let frameRate: Double?
    let speakerSegments: [SpeakerSegment]?
}

// MARK: - Neural Media Recorder
/// Media recorder with NeuralEvent integration
@MainActor
final class NeuralMediaRecorder: NSObject, ObservableObject {
    // MARK: - Types
    enum MediaType: String {
        case audio
        case video

        var displayName: String {
            switch self {
            case .audio: return "Audio"
            case .video: return "Video"
            }
        }

        var consentModality: NeuralConsentModality {
            switch self {
            case .audio: return .audio
            case .video: return .video
            }
        }
    }

    enum RecordingState {
        case idle
        case preparing
        case recording
        case paused
        case finishing
    }

    // MARK: - Singleton
    static let shared = NeuralMediaRecorder()

    // MARK: - Properties
    weak var delegate: NeuralMediaRecorderDelegate?

    @Published private(set) var state: RecordingState = .idle
    @Published private(set) var currentType: MediaType?
    @Published private(set) var recordingDuration: TimeInterval = 0
    @Published private(set) var audioLevel: Float = 0

    // Audio Recording
    private var audioRecorder: AVAudioRecorder?
    private var audioSession: AVAudioSession { AVAudioSession.sharedInstance() }
    private var audioLevelTimer: Timer?
    private var durationTimer: Timer?
    private var recordingStartTime: Date?

    // Video Recording
    private var captureSession: AVCaptureSession?
    private var videoOutput: AVCaptureMovieFileOutput?
    private var previewLayer: AVCaptureVideoPreviewLayer?

    // Storage
    private let fileManager = FileManager.default
    private lazy var recordingsDirectory: URL = {
        let paths = fileManager.urls(for: .documentDirectory, in: .userDomainMask)
        let recordingsDir = paths[0].appendingPathComponent("NeuralRecordings", isDirectory: true)
        try? fileManager.createDirectory(at: recordingsDir, withIntermediateDirectories: true)
        return recordingsDir
    }()

    // Speaker Diarization
    private var speakerSegments: [SpeakerSegment] = []
    private var currentSpeakerId: String?
    private var lastSpeakerChangeTime: TimeInterval = 0

    // Current Recording
    private var currentRecordingURL: URL?
    private var userId: String?
    private var consentVersion: String?

    // MARK: - Initialization
    private override init() {
        super.init()
        setupNotifications()
    }

    // MARK: - Setup
    private func setupNotifications() {
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(handleInterruption(_:)),
            name: AVAudioSession.interruptionNotification,
            object: nil
        )

        NotificationCenter.default.addObserver(
            self,
            selector: #selector(handleRouteChange(_:)),
            name: AVAudioSession.routeChangeNotification,
            object: nil
        )
    }

    // MARK: - Configuration
    /// Configure the recorder for a user session
    /// - Parameters:
    ///   - userId: User identifier for events
    ///   - consentVersion: Current consent version
    func configure(userId: String, consentVersion: String) {
        self.userId = userId
        self.consentVersion = consentVersion
    }

    // MARK: - Permissions
    /// Check if audio permission is granted
    var hasAudioPermission: Bool {
        AVAudioSession.sharedInstance().recordPermission == .granted
    }

    /// Check if video permission is granted
    var hasVideoPermission: Bool {
        AVCaptureDevice.authorizationStatus(for: .video) == .authorized
    }

    /// Request audio recording permission
    func requestAudioPermission() async -> Bool {
        await withCheckedContinuation { continuation in
            AVAudioSession.sharedInstance().requestRecordPermission { granted in
                continuation.resume(returning: granted)
            }
        }
    }

    /// Request video recording permission
    func requestVideoPermission() async -> Bool {
        let status = AVCaptureDevice.authorizationStatus(for: .video)

        switch status {
        case .authorized:
            return true
        case .notDetermined:
            return await AVCaptureDevice.requestAccess(for: .video)
        default:
            return false
        }
    }

    // MARK: - Audio Recording
    /// Start audio recording
    /// - Returns: URL of the recording file
    /// - Throws: NeuralMediaRecorderError on failure
    func startAudioRecording() async throws -> URL {
        guard state == .idle else {
            throw NeuralMediaRecorderError.alreadyRecording
        }

        guard hasAudioPermission else {
            throw NeuralMediaRecorderError.permissionDenied(.audio)
        }

        // Check consent
        guard await NeuralConsentManager.shared.canCollect(modality: .audio) else {
            throw NeuralMediaRecorderError.consentNotGranted
        }

        state = .preparing
        currentType = .audio

        // Configure audio session
        do {
            try audioSession.setCategory(.playAndRecord, mode: .default, options: [.defaultToSpeaker, .allowBluetooth])
            try audioSession.setActive(true)
        } catch {
            state = .idle
            currentType = nil
            throw NeuralMediaRecorderError.setupFailed(error.localizedDescription)
        }

        // Create recording URL
        let filename = "audio_\(Int(Date().timeIntervalSince1970 * 1000)).m4a"
        let url = recordingsDirectory.appendingPathComponent(filename)

        // Configure recorder
        let settings: [String: Any] = [
            AVFormatIDKey: Int(kAudioFormatMPEG4AAC),
            AVSampleRateKey: 44100.0,
            AVNumberOfChannelsKey: 2,
            AVEncoderAudioQualityKey: AVAudioQuality.high.rawValue
        ]

        do {
            audioRecorder = try AVAudioRecorder(url: url, settings: settings)
            audioRecorder?.delegate = self
            audioRecorder?.isMeteringEnabled = true
            audioRecorder?.prepareToRecord()
            audioRecorder?.record()

            currentRecordingURL = url
            recordingStartTime = Date()
            state = .recording
            speakerSegments = []

            startAudioLevelMonitoring()
            startDurationTimer()
            startSpeakerDiarization()

            delegate?.mediaRecorder(self, didStartRecording: .audio)

            return url
        } catch {
            state = .idle
            currentType = nil
            throw NeuralMediaRecorderError.setupFailed(error.localizedDescription)
        }
    }

    /// Stop audio recording
    /// - Returns: NeuralEvent created from the recording
    func stopAudioRecording() async -> NeuralEvent? {
        guard state == .recording || state == .paused, currentType == .audio else { return nil }

        state = .finishing
        stopAudioLevelMonitoring()
        stopDurationTimer()

        let url = audioRecorder?.url
        let duration = recordingDuration

        audioRecorder?.stop()
        audioRecorder = nil

        try? audioSession.setActive(false)

        // Finalize speaker diarization
        finalizeSpeakerDiarization()

        state = .idle
        currentType = nil

        // Create NeuralEvent
        let event = await createMediaEvent(
            type: .audio,
            url: url,
            duration: duration
        )

        delegate?.mediaRecorder(self, didStopRecording: .audio, event: event)

        // Enqueue event if created
        if let event = event {
            try? await NeuralIngestionClient.shared.enqueue(event)
        }

        recordingDuration = 0
        currentRecordingURL = nil

        return event
    }

    /// Pause audio recording
    func pauseAudioRecording() {
        guard state == .recording, currentType == .audio else { return }
        audioRecorder?.pause()
        state = .paused
        stopDurationTimer()
    }

    /// Resume audio recording
    func resumeAudioRecording() {
        guard state == .paused, currentType == .audio else { return }
        audioRecorder?.record()
        state = .recording
        startDurationTimer()
    }

    // MARK: - Video Recording
    /// Setup video capture session
    /// - Parameter previewView: View to display camera preview
    func setupVideoCapture(in previewView: UIView) async throws {
        guard hasVideoPermission else {
            throw NeuralMediaRecorderError.permissionDenied(.video)
        }

        // Check consent
        guard await NeuralConsentManager.shared.canCollect(modality: .video) else {
            throw NeuralMediaRecorderError.consentNotGranted
        }

        captureSession = AVCaptureSession()
        captureSession?.sessionPreset = .high

        // Add video input
        guard let videoDevice = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .back),
              let videoInput = try? AVCaptureDeviceInput(device: videoDevice),
              captureSession?.canAddInput(videoInput) == true else {
            throw NeuralMediaRecorderError.deviceNotAvailable
        }
        captureSession?.addInput(videoInput)

        // Add audio input
        if hasAudioPermission,
           let audioDevice = AVCaptureDevice.default(for: .audio),
           let audioInput = try? AVCaptureDeviceInput(device: audioDevice),
           captureSession?.canAddInput(audioInput) == true {
            captureSession?.addInput(audioInput)
        }

        // Add movie output
        videoOutput = AVCaptureMovieFileOutput()
        if let output = videoOutput, captureSession?.canAddOutput(output) == true {
            captureSession?.addOutput(output)
        }

        // Setup preview layer
        previewLayer = AVCaptureVideoPreviewLayer(session: captureSession!)
        previewLayer?.videoGravity = .resizeAspectFill
        previewLayer?.frame = previewView.bounds

        await MainActor.run {
            previewView.layer.insertSublayer(previewLayer!, at: 0)
        }

        // Start session on background thread
        let session = captureSession
        await Task.detached {
            session?.startRunning()
        }.value
    }

    /// Start video recording
    /// - Returns: URL of the recording file
    func startVideoRecording() async throws -> URL {
        guard state == .idle else {
            throw NeuralMediaRecorderError.alreadyRecording
        }

        guard let output = videoOutput, captureSession?.isRunning == true else {
            throw NeuralMediaRecorderError.setupFailed("Capture session not ready")
        }

        // Check consent
        guard await NeuralConsentManager.shared.canCollect(modality: .video) else {
            throw NeuralMediaRecorderError.consentNotGranted
        }

        state = .preparing
        currentType = .video

        let filename = "video_\(Int(Date().timeIntervalSince1970 * 1000)).mov"
        let url = recordingsDirectory.appendingPathComponent(filename)

        output.startRecording(to: url, recordingDelegate: self)

        currentRecordingURL = url
        recordingStartTime = Date()
        state = .recording
        speakerSegments = []

        startDurationTimer()
        startSpeakerDiarization()

        return url
    }

    /// Stop video recording
    func stopVideoRecording() async {
        guard state == .recording, currentType == .video else { return }

        state = .finishing
        stopDurationTimer()
        videoOutput?.stopRecording()
    }

    /// Cleanup video capture resources
    func cleanupVideoCapture() {
        captureSession?.stopRunning()
        previewLayer?.removeFromSuperlayer()
        captureSession = nil
        videoOutput = nil
        previewLayer = nil
    }

    // MARK: - Speaker Diarization
    private func startSpeakerDiarization() {
        // Initialize diarization
        // In production, this would integrate with a speech recognition service
        // For now, we simulate basic voice activity detection
        currentSpeakerId = "speaker_1"
        lastSpeakerChangeTime = 0
    }

    private func finalizeSpeakerDiarization() {
        // Close any open speaker segment
        if let currentSpeaker = currentSpeakerId {
            let segment = SpeakerSegment(
                id: UUID(),
                speakerId: currentSpeaker,
                startTime: lastSpeakerChangeTime,
                endTime: recordingDuration,
                confidence: 0.8
            )
            speakerSegments.append(segment)
        }

        delegate?.mediaRecorder(self, didDetectSpeakers: speakerSegments)
    }

    /// Simulate speaker change (called by external voice activity detector)
    func notifySpeakerChange(speakerId: String, confidence: Double) {
        guard state == .recording else { return }

        // Close previous segment
        if let currentSpeaker = currentSpeakerId, currentSpeaker != speakerId {
            let segment = SpeakerSegment(
                id: UUID(),
                speakerId: currentSpeaker,
                startTime: lastSpeakerChangeTime,
                endTime: recordingDuration,
                confidence: confidence
            )
            speakerSegments.append(segment)
        }

        // Start new segment
        currentSpeakerId = speakerId
        lastSpeakerChangeTime = recordingDuration
    }

    // MARK: - Audio Level Monitoring
    private func startAudioLevelMonitoring() {
        audioLevelTimer = Timer.scheduledTimer(withTimeInterval: 0.05, repeats: true) { [weak self] _ in
            Task { @MainActor [weak self] in
                guard let self = self, let recorder = self.audioRecorder else { return }
                recorder.updateMeters()
                let level = recorder.averagePower(forChannel: 0)
                // Normalize level from -160...0 to 0...1
                let normalizedLevel = max(0, min(1, (level + 50) / 50))
                self.audioLevel = Float(normalizedLevel)
                self.delegate?.mediaRecorder(self, didUpdateAudioLevel: Float(normalizedLevel))
            }
        }
    }

    private func stopAudioLevelMonitoring() {
        audioLevelTimer?.invalidate()
        audioLevelTimer = nil
        audioLevel = 0
    }

    // MARK: - Duration Timer
    private func startDurationTimer() {
        durationTimer = Timer.scheduledTimer(withTimeInterval: 0.1, repeats: true) { [weak self] _ in
            Task { @MainActor [weak self] in
                guard let self = self, let startTime = self.recordingStartTime else { return }
                self.recordingDuration = Date().timeIntervalSince(startTime)
            }
        }
    }

    private func stopDurationTimer() {
        durationTimer?.invalidate()
        durationTimer = nil
    }

    // MARK: - Event Creation
    private func createMediaEvent(type: MediaType, url: URL?, duration: TimeInterval) async -> NeuralEvent? {
        guard let url = url,
              let userId = userId,
              let consentVersion = consentVersion else {
            return nil
        }

        // Get file size
        let fileSize: Int64 = (try? fileManager.attributesOfItem(atPath: url.path)[.size] as? Int64) ?? 0

        // Create metadata
        let metadata = RecordingMetadata(
            duration: duration,
            fileSize: fileSize,
            format: type == .audio ? "m4a" : "mov",
            sampleRate: type == .audio ? 44100.0 : nil,
            channels: type == .audio ? 2 : nil,
            resolution: type == .video ? CGSize(width: 1920, height: 1080) : nil,
            frameRate: type == .video ? 30.0 : nil,
            speakerSegments: speakerSegments.isEmpty ? nil : speakerSegments
        )

        // Create modality
        let modality: EventModality
        if type == .audio {
            modality = EventModality(
                audioRef: url.path,
                metrics: [
                    "duration": AnyCodable(duration),
                    "fileSize": AnyCodable(fileSize),
                    "format": AnyCodable("m4a"),
                    "speakerCount": AnyCodable(Set(speakerSegments.map(\.speakerId)).count)
                ]
            )
        } else {
            modality = EventModality(
                videoRef: url.path,
                metrics: [
                    "duration": AnyCodable(duration),
                    "fileSize": AnyCodable(fileSize),
                    "format": AnyCodable("mov")
                ]
            )
        }

        return NeuralEvent(
            userId: userId,
            sourceApp: .browser,
            eventType: type == .audio ? "audio_recording" : "video_recording",
            modality: modality,
            context: EventContext.current(),
            privacyScope: .private,
            consentVersion: consentVersion
        )
    }

    // MARK: - Interruption Handling
    @objc private func handleInterruption(_ notification: Notification) {
        guard let userInfo = notification.userInfo,
              let typeValue = userInfo[AVAudioSessionInterruptionTypeKey] as? UInt,
              let type = AVAudioSession.InterruptionType(rawValue: typeValue) else {
            return
        }

        Task { @MainActor in
            switch type {
            case .began:
                if state == .recording {
                    if currentType == .audio {
                        pauseAudioRecording()
                    }
                    delegate?.mediaRecorder(self, didEncounterError: .interrupted)
                }
            case .ended:
                if let optionsValue = userInfo[AVAudioSessionInterruptionOptionKey] as? UInt {
                    let options = AVAudioSession.InterruptionOptions(rawValue: optionsValue)
                    if options.contains(.shouldResume) && currentType == .audio {
                        resumeAudioRecording()
                    }
                }
            @unknown default:
                break
            }
        }
    }

    @objc private func handleRouteChange(_ notification: Notification) {
        guard let userInfo = notification.userInfo,
              let reasonValue = userInfo[AVAudioSessionRouteChangeReasonKey] as? UInt,
              let reason = AVAudioSession.RouteChangeReason(rawValue: reasonValue) else {
            return
        }

        Task { @MainActor in
            switch reason {
            case .oldDeviceUnavailable:
                if state == .recording && currentType == .audio {
                    _ = await stopAudioRecording()
                }
            default:
                break
            }
        }
    }

    // MARK: - Cleanup
    /// Delete a recording at the specified URL
    func deleteRecording(at url: URL) {
        try? fileManager.removeItem(at: url)
    }

    /// Get all recordings in the recordings directory
    func getAllRecordings() -> [URL] {
        (try? fileManager.contentsOfDirectory(
            at: recordingsDirectory,
            includingPropertiesForKeys: [.creationDateKey, .fileSizeKey],
            options: [.skipsHiddenFiles]
        )) ?? []
    }

    /// Clear all recordings
    func clearAllRecordings() {
        for url in getAllRecordings() {
            try? fileManager.removeItem(at: url)
        }
    }

    /// Get total storage used by recordings
    func getStorageUsed() -> Int64 {
        getAllRecordings().reduce(0) { total, url in
            let size = (try? fileManager.attributesOfItem(atPath: url.path)[.size] as? Int64) ?? 0
            return total + size
        }
    }
}

// MARK: - AVAudioRecorderDelegate
extension NeuralMediaRecorder: AVAudioRecorderDelegate {
    nonisolated func audioRecorderDidFinishRecording(_ recorder: AVAudioRecorder, successfully flag: Bool) {
        Task { @MainActor in
            if !flag {
                delegate?.mediaRecorder(self, didEncounterError: .recordingFailed("Recording ended unexpectedly"))
            }
        }
    }

    nonisolated func audioRecorderEncodeErrorDidOccur(_ recorder: AVAudioRecorder, error: Error?) {
        Task { @MainActor in
            if let error = error {
                delegate?.mediaRecorder(self, didEncounterError: .recordingFailed(error.localizedDescription))
            }
        }
    }
}

// MARK: - AVCaptureFileOutputRecordingDelegate
extension NeuralMediaRecorder: AVCaptureFileOutputRecordingDelegate {
    nonisolated func fileOutput(_ output: AVCaptureFileOutput, didStartRecordingTo fileURL: URL, from connections: [AVCaptureConnection]) {
        Task { @MainActor in
            delegate?.mediaRecorder(self, didStartRecording: .video)
        }
    }

    nonisolated func fileOutput(_ output: AVCaptureFileOutput, didFinishRecordingTo outputFileURL: URL, from connections: [AVCaptureConnection], error: Error?) {
        Task { @MainActor in
            stopDurationTimer()
            finalizeSpeakerDiarization()

            let duration = recordingDuration

            state = .idle
            currentType = nil

            if let error = error {
                delegate?.mediaRecorder(self, didEncounterError: .recordingFailed(error.localizedDescription))
                delegate?.mediaRecorder(self, didStopRecording: .video, event: nil)
            } else {
                let event = await createMediaEvent(
                    type: .video,
                    url: outputFileURL,
                    duration: duration
                )

                delegate?.mediaRecorder(self, didStopRecording: .video, event: event)

                // Enqueue event if created
                if let event = event {
                    try? await NeuralIngestionClient.shared.enqueue(event)
                }
            }

            recordingDuration = 0
            currentRecordingURL = nil
        }
    }
}
