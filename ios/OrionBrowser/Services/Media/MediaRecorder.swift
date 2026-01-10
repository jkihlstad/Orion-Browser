/**
 * MediaRecorder.swift
 * Audio and video capture using AVFoundation
 * SUB-AGENT 2: Media & Sensor Engineer
 */

import AVFoundation
import UIKit

// MARK: - Media Recorder Delegate
protocol MediaRecorderDelegate: AnyObject {
    func mediaRecorder(_ recorder: MediaRecorder, didStartRecording type: MediaRecorder.RecordingType)
    func mediaRecorder(_ recorder: MediaRecorder, didStopRecording type: MediaRecorder.RecordingType, url: URL?)
    func mediaRecorder(_ recorder: MediaRecorder, didUpdateAudioLevel level: Float)
    func mediaRecorder(_ recorder: MediaRecorder, didEncounterError error: MediaRecorderError)
}

// MARK: - Media Recorder Error
enum MediaRecorderError: Error, LocalizedError {
    case permissionDenied
    case setupFailed(String)
    case recordingFailed(String)
    case exportFailed(String)
    case interrupted
    case deviceNotAvailable

    var errorDescription: String? {
        switch self {
        case .permissionDenied:
            return "Permission denied for recording"
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
        }
    }
}

// NOTE: RecordingResult is defined in MediaRecorderProtocol.swift

// MARK: - Media Recorder
final class MediaRecorder: NSObject {
    // MARK: - Types
    enum RecordingType {
        case audio
        case video
    }

    enum RecordingState {
        case idle
        case preparing
        case recording
        case paused
        case finishing
    }

    // MARK: - Properties
    weak var delegate: MediaRecorderDelegate?

    private(set) var state: RecordingState = .idle
    private(set) var currentType: RecordingType?

    // Audio Recording
    private var audioRecorder: AVAudioRecorder?
    private var audioSession: AVAudioSession { AVAudioSession.sharedInstance() }
    private var audioLevelTimer: Timer?

    // Video Recording
    private var captureSession: AVCaptureSession?
    private var videoOutput: AVCaptureMovieFileOutput?
    private var previewLayer: AVCaptureVideoPreviewLayer?

    // Storage
    private let fileManager = FileManager.default
    private lazy var recordingsDirectory: URL = {
        let paths = fileManager.urls(for: .documentDirectory, in: .userDomainMask)
        let recordingsDir = paths[0].appendingPathComponent("Recordings", isDirectory: true)
        try? fileManager.createDirectory(at: recordingsDir, withIntermediateDirectories: true)
        return recordingsDir
    }()

    // MARK: - Singleton
    static let shared = MediaRecorder()

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

    // MARK: - Permissions
    func requestAudioPermission() async -> Bool {
        await withCheckedContinuation { continuation in
            AVAudioSession.sharedInstance().requestRecordPermission { granted in
                continuation.resume(returning: granted)
            }
        }
    }

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

    var hasAudioPermission: Bool {
        AVAudioSession.sharedInstance().recordPermission == .granted
    }

    var hasVideoPermission: Bool {
        AVCaptureDevice.authorizationStatus(for: .video) == .authorized
    }

    // MARK: - Audio Recording
    func startAudioRecording() async throws -> URL {
        guard hasAudioPermission else {
            throw MediaRecorderError.permissionDenied
        }

        guard state == .idle else {
            throw MediaRecorderError.recordingFailed("Already recording")
        }

        state = .preparing
        currentType = .audio

        // Configure audio session
        try audioSession.setCategory(.playAndRecord, mode: .default, options: [.defaultToSpeaker, .allowBluetooth])
        try audioSession.setActive(true)

        // Create recording URL
        let filename = "audio_\(Date().timeIntervalSince1970).m4a"
        let url = recordingsDirectory.appendingPathComponent(filename)

        // Configure recorder
        let settings: [String: Any] = [
            AVFormatIDKey: Int(kAudioFormatMPEG4AAC),
            AVSampleRateKey: 44100.0,
            AVNumberOfChannelsKey: 1,
            AVEncoderAudioQualityKey: AVAudioQuality.high.rawValue
        ]

        do {
            audioRecorder = try AVAudioRecorder(url: url, settings: settings)
            audioRecorder?.delegate = self
            audioRecorder?.isMeteringEnabled = true
            audioRecorder?.prepareToRecord()
            audioRecorder?.record()

            state = .recording
            startAudioLevelMonitoring()
            delegate?.mediaRecorder(self, didStartRecording: .audio)

            return url
        } catch {
            state = .idle
            currentType = nil
            throw MediaRecorderError.setupFailed(error.localizedDescription)
        }
    }

    func stopAudioRecording() {
        guard state == .recording, currentType == .audio else { return }

        state = .finishing
        stopAudioLevelMonitoring()

        let url = audioRecorder?.url
        audioRecorder?.stop()
        audioRecorder = nil

        try? audioSession.setActive(false)

        state = .idle
        currentType = nil
        delegate?.mediaRecorder(self, didStopRecording: .audio, url: url)
    }

    func pauseAudioRecording() {
        guard state == .recording, currentType == .audio else { return }
        audioRecorder?.pause()
        state = .paused
    }

    func resumeAudioRecording() {
        guard state == .paused, currentType == .audio else { return }
        audioRecorder?.record()
        state = .recording
    }

    private func startAudioLevelMonitoring() {
        audioLevelTimer = Timer.scheduledTimer(withTimeInterval: 0.1, repeats: true) { [weak self] _ in
            guard let self = self, let recorder = self.audioRecorder else { return }
            recorder.updateMeters()
            let level = recorder.averagePower(forChannel: 0)
            // Normalize level from -160...0 to 0...1
            let normalizedLevel = max(0, (level + 50) / 50)
            self.delegate?.mediaRecorder(self, didUpdateAudioLevel: Float(normalizedLevel))
        }
    }

    private func stopAudioLevelMonitoring() {
        audioLevelTimer?.invalidate()
        audioLevelTimer = nil
    }

    // MARK: - Video Recording
    func setupVideoCapture(in view: UIView) throws {
        guard hasVideoPermission else {
            throw MediaRecorderError.permissionDenied
        }

        captureSession = AVCaptureSession()
        captureSession?.sessionPreset = .high

        // Add video input
        guard let videoDevice = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .back),
              let videoInput = try? AVCaptureDeviceInput(device: videoDevice),
              captureSession?.canAddInput(videoInput) == true else {
            throw MediaRecorderError.deviceNotAvailable
        }
        captureSession?.addInput(videoInput)

        // Add audio input
        if let audioDevice = AVCaptureDevice.default(for: .audio),
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
        previewLayer?.frame = view.bounds
        view.layer.insertSublayer(previewLayer!, at: 0)

        // Start session on background thread
        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            self?.captureSession?.startRunning()
        }
    }

    func startVideoRecording() throws -> URL {
        guard state == .idle else {
            throw MediaRecorderError.recordingFailed("Already recording")
        }

        guard let output = videoOutput, captureSession?.isRunning == true else {
            throw MediaRecorderError.setupFailed("Capture session not ready")
        }

        state = .preparing
        currentType = .video

        let filename = "video_\(Date().timeIntervalSince1970).mov"
        let url = recordingsDirectory.appendingPathComponent(filename)

        output.startRecording(to: url, recordingDelegate: self)
        state = .recording

        return url
    }

    func stopVideoRecording() {
        guard state == .recording, currentType == .video else { return }

        state = .finishing
        videoOutput?.stopRecording()
    }

    func cleanupVideoCapture() {
        captureSession?.stopRunning()
        previewLayer?.removeFromSuperlayer()
        captureSession = nil
        videoOutput = nil
        previewLayer = nil
    }

    // MARK: - Interruption Handling
    @objc private func handleInterruption(_ notification: Notification) {
        guard let userInfo = notification.userInfo,
              let typeValue = userInfo[AVAudioSessionInterruptionTypeKey] as? UInt,
              let type = AVAudioSession.InterruptionType(rawValue: typeValue) else {
            return
        }

        switch type {
        case .began:
            if state == .recording {
                pauseAudioRecording()
                delegate?.mediaRecorder(self, didEncounterError: .interrupted)
            }
        case .ended:
            if let optionsValue = userInfo[AVAudioSessionInterruptionOptionKey] as? UInt {
                let options = AVAudioSession.InterruptionOptions(rawValue: optionsValue)
                if options.contains(.shouldResume) {
                    resumeAudioRecording()
                }
            }
        @unknown default:
            break
        }
    }

    @objc private func handleRouteChange(_ notification: Notification) {
        guard let userInfo = notification.userInfo,
              let reasonValue = userInfo[AVAudioSessionRouteChangeReasonKey] as? UInt,
              let reason = AVAudioSession.RouteChangeReason(rawValue: reasonValue) else {
            return
        }

        switch reason {
        case .oldDeviceUnavailable:
            if state == .recording && currentType == .audio {
                stopAudioRecording()
            }
        default:
            break
        }
    }

    // MARK: - Cleanup
    func deleteRecording(at url: URL) {
        try? fileManager.removeItem(at: url)
    }

    func getAllRecordings() -> [URL] {
        (try? fileManager.contentsOfDirectory(
            at: recordingsDirectory,
            includingPropertiesForKeys: [.creationDateKey],
            options: [.skipsHiddenFiles]
        )) ?? []
    }

    func clearAllRecordings() {
        for url in getAllRecordings() {
            try? fileManager.removeItem(at: url)
        }
    }
}

// MARK: - AVAudioRecorderDelegate
extension MediaRecorder: AVAudioRecorderDelegate {
    func audioRecorderDidFinishRecording(_ recorder: AVAudioRecorder, successfully flag: Bool) {
        if !flag {
            delegate?.mediaRecorder(self, didEncounterError: .recordingFailed("Recording ended unexpectedly"))
        }
    }

    func audioRecorderEncodeErrorDidOccur(_ recorder: AVAudioRecorder, error: Error?) {
        if let error = error {
            delegate?.mediaRecorder(self, didEncounterError: .recordingFailed(error.localizedDescription))
        }
    }
}

// MARK: - AVCaptureFileOutputRecordingDelegate
extension MediaRecorder: AVCaptureFileOutputRecordingDelegate {
    func fileOutput(_ output: AVCaptureFileOutput, didStartRecordingTo fileURL: URL, from connections: [AVCaptureConnection]) {
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            self.delegate?.mediaRecorder(self, didStartRecording: .video)
        }
    }

    func fileOutput(_ output: AVCaptureFileOutput, didFinishRecordingTo outputFileURL: URL, from connections: [AVCaptureConnection], error: Error?) {
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }

            self.state = .idle
            self.currentType = nil

            if let error = error {
                self.delegate?.mediaRecorder(self, didEncounterError: .recordingFailed(error.localizedDescription))
                self.delegate?.mediaRecorder(self, didStopRecording: .video, url: nil)
            } else {
                self.delegate?.mediaRecorder(self, didStopRecording: .video, url: outputFileURL)
            }
        }
    }
}
