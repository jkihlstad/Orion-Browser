/**
 * IngestionOrchestrator.swift
 * Edge-side orchestrator for consent-gated data capture
 */

import Foundation
import UIKit

@MainActor
final class IngestionOrchestrator: ObservableObject {
    // MARK: - Shared Instance

    /// Shared singleton instance - lazily initialized with default dependencies
    static let shared: IngestionOrchestrator = {
        return IngestionOrchestrator(
            mediaRecorder: MediaRecorder.shared,
            consent: ConsentService(
                neuralConsentManager: NeuralConsentManager.shared
            ),
            queue: LocalEventQueue()
        )
    }()

    // MARK: - Properties

    private let mediaRecorder: MediaRecorder
    private let consent: ConsentService
    private let queue: LocalEventQueue

    init(
        mediaRecorder: MediaRecorder,
        consent: ConsentService,
        queue: LocalEventQueue
    ) {
        self.mediaRecorder = mediaRecorder
        self.consent = consent
        self.queue = queue
    }

    // MARK: - Browser Events

    func trackPageView(url: URL, title: String) async {
        guard consent.canCapture(modality: .analytics) else { return }
        // Enqueue page view event
    }

    func trackSearchQuery(query: String, sourceApp: SourceApp = .browser) async {
        guard consent.canCapture(modality: .analytics) else { return }
        // Enqueue search event
    }

    // MARK: - Voice Recording

    func startVoiceRecording() async throws {
        guard consent.canCapture(modality: .audio) else { return }
        _ = try await mediaRecorder.startAudioRecording()
    }

    func stopVoiceRecording() {
        guard consent.canCapture(modality: .audio) else { return }
        mediaRecorder.stopAudioRecording()
        // Recording URL is delivered via MediaRecorderDelegate
    }

    // MARK: - Screenshot

    func captureUserInitiatedScreenshot() async -> UIImage? {
        guard consent.canCapture(modality: .screenCapture) else { return nil }
        // Screenshot capture is handled by ScreenCaptureHelper or system APIs
        // MediaRecorder focuses on audio/video recording
        return nil
    }

    // MARK: - View Tracking

    func trackViewAppeared(viewName: String, sourceApp: SourceApp = .browser) async {
        guard consent.canCapture(modality: .analytics) else { return }
        // Track view appearance
    }

    func trackViewDisappeared(viewName: String, dwellTime: TimeInterval, sourceApp: SourceApp = .browser) async {
        guard consent.canCapture(modality: .analytics) else { return }
        // Track view disappearance with dwell time
    }

    // MARK: - Background Upload

    func triggerBackgroundUpload() async {
        await BackgroundUploader.shared.flushImmediately()
    }

    // MARK: - Background Task Support

    /// Flush pending events to backend - called by background tasks
    func flush() async -> Bool {
        await BackgroundUploader.shared.flushImmediately()
        return true
    }

    /// Process background uploads - called by background tasks
    func processBackgroundUploads() async {
        await BackgroundUploader.shared.flushImmediately()
    }

    /// Schedule background sync task
    func scheduleBackgroundSync() {
        BackgroundTaskManager.shared.scheduleOrchestratorSyncTask()
    }
}
