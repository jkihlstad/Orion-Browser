/**
 * BGTasks.swift
 * Background task configuration and management
 * SUB-AGENT B: Edge Capture + Local Buffer + Background Upload
 *
 * Registers and handles background tasks for periodic uploads,
 * data sync, and cleanup operations.
 */

import Foundation
import BackgroundTasks
import UIKit

// MARK: - Background Task Manager

/// Manages background task registration and execution
public final class BackgroundTaskManager: @unchecked Sendable {
    // MARK: - Singleton

    public static let shared = BackgroundTaskManager()

    // MARK: - Task Identifiers

    public enum TaskID: String, CaseIterable {
        case upload = "com.orion.browser.upload"
        case sync = "com.orion.browser.sync"
        case cleanup = "com.orion.browser.cleanup"
        case orchestratorSync = "com.orion.browser.orchestrator.sync"
        case eventProcessing = "com.orion.browser.eventProcessing"

        public var isProcessingTask: Bool {
            switch self {
            case .upload, .cleanup, .orchestratorSync, .eventProcessing:
                return true
            case .sync:
                return false
            }
        }
    }

    // MARK: - Properties

    private var isRegistered = false
    private weak var uploadScheduler: UploadScheduler?
    private weak var eventQueue: LocalEventQueue?

    // MARK: - Initialization

    private init() {}

    // MARK: - Registration

    /// Register all background tasks - must be called early in app lifecycle
    public func registerTasks() {
        guard !isRegistered else { return }

        for taskID in TaskID.allCases {
            registerTask(taskID)
        }

        isRegistered = true
        print("[BackgroundTaskManager] Registered \(TaskID.allCases.count) background tasks")
    }

    /// Configure dependencies for task execution
    public func configure(
        uploadScheduler: UploadScheduler,
        eventQueue: LocalEventQueue
    ) {
        self.uploadScheduler = uploadScheduler
        self.eventQueue = eventQueue
    }

    private func registerTask(_ taskID: TaskID) {
        BGTaskScheduler.shared.register(
            forTaskWithIdentifier: taskID.rawValue,
            using: nil
        ) { [weak self] task in
            self?.handleTask(task, taskID: taskID)
        }
    }

    // MARK: - Scheduling

    /// Schedule the upload background task
    public func scheduleUploadTask(earliestBeginDate: Date? = nil) {
        let request = BGProcessingTaskRequest(identifier: TaskID.upload.rawValue)
        request.requiresNetworkConnectivity = true
        request.requiresExternalPower = false
        request.earliestBeginDate = earliestBeginDate ?? Date(timeIntervalSinceNow: 60)

        submitTask(request)
    }

    /// Schedule the sync background task
    public func scheduleSyncTask(earliestBeginDate: Date? = nil) {
        let request = BGAppRefreshTaskRequest(identifier: TaskID.sync.rawValue)
        request.earliestBeginDate = earliestBeginDate ?? Date(timeIntervalSinceNow: 15 * 60)

        submitTask(request)
    }

    /// Schedule the cleanup background task
    public func scheduleCleanupTask(earliestBeginDate: Date? = nil) {
        let request = BGProcessingTaskRequest(identifier: TaskID.cleanup.rawValue)
        request.requiresNetworkConnectivity = false
        request.requiresExternalPower = true // Only when charging
        request.earliestBeginDate = earliestBeginDate ?? Date(timeIntervalSinceNow: 24 * 60 * 60) // Daily

        submitTask(request)
    }

    /// Schedule the orchestrator sync task
    public func scheduleOrchestratorSyncTask(earliestBeginDate: Date? = nil) {
        let request = BGProcessingTaskRequest(identifier: TaskID.orchestratorSync.rawValue)
        request.requiresNetworkConnectivity = true
        request.requiresExternalPower = false
        request.earliestBeginDate = earliestBeginDate ?? Date(timeIntervalSinceNow: 5 * 60)

        submitTask(request)
    }

    /// Schedule the event processing task
    public func scheduleEventProcessingTask(earliestBeginDate: Date? = nil) {
        let request = BGProcessingTaskRequest(identifier: TaskID.eventProcessing.rawValue)
        request.requiresNetworkConnectivity = true
        request.requiresExternalPower = false
        request.earliestBeginDate = earliestBeginDate ?? Date(timeIntervalSinceNow: 30)

        submitTask(request)
    }

    /// Schedule all periodic tasks
    public func scheduleAllPeriodicTasks() {
        scheduleUploadTask()
        scheduleSyncTask()
        scheduleCleanupTask()
    }

    private func submitTask(_ request: BGTaskRequest) {
        do {
            try BGTaskScheduler.shared.submit(request)
            print("[BackgroundTaskManager] Scheduled task: \(request.identifier)")
        } catch BGTaskScheduler.Error.unavailable {
            print("[BackgroundTaskManager] Background tasks unavailable (simulator or restricted)")
        } catch BGTaskScheduler.Error.tooManyPendingTaskRequests {
            print("[BackgroundTaskManager] Too many pending task requests for: \(request.identifier)")
        } catch BGTaskScheduler.Error.notPermitted {
            print("[BackgroundTaskManager] Not permitted to schedule: \(request.identifier)")
        } catch {
            print("[BackgroundTaskManager] Failed to schedule task \(request.identifier): \(error)")
        }
    }

    // MARK: - Task Handling

    private func handleTask(_ task: BGTask, taskID: TaskID) {
        switch taskID {
        case .upload:
            if let processingTask = task as? BGProcessingTask {
                handleUploadTask(processingTask)
            }

        case .sync:
            if let refreshTask = task as? BGAppRefreshTask {
                handleSyncTask(refreshTask)
            }

        case .cleanup:
            if let processingTask = task as? BGProcessingTask {
                handleCleanupTask(processingTask)
            }

        case .orchestratorSync:
            if let processingTask = task as? BGProcessingTask {
                handleOrchestratorSyncTask(processingTask)
            }

        case .eventProcessing:
            if let processingTask = task as? BGProcessingTask {
                handleEventProcessingTask(processingTask)
            }
        }
    }

    private func handleUploadTask(_ task: BGProcessingTask) {
        // Set expiration handler
        task.expirationHandler = {
            task.setTaskCompleted(success: false)
        }

        // Schedule next task
        scheduleUploadTask()

        // Execute upload
        Task { @MainActor in
            guard let scheduler = uploadScheduler else {
                task.setTaskCompleted(success: false)
                return
            }

            let result = await scheduler.flush()
            task.setTaskCompleted(success: result.isSuccess)
        }
    }

    private func handleSyncTask(_ task: BGAppRefreshTask) {
        task.expirationHandler = {
            task.setTaskCompleted(success: false)
        }

        // Schedule next sync
        scheduleSyncTask()

        // Quick check for pending work
        Task {
            guard let queue = eventQueue else {
                task.setTaskCompleted(success: true)
                return
            }

            let pendingCount = await queue.getPendingCount()

            if pendingCount > 0 {
                // Schedule immediate upload task
                scheduleUploadTask(earliestBeginDate: Date(timeIntervalSinceNow: 5))
            }

            task.setTaskCompleted(success: true)
        }
    }

    private func handleCleanupTask(_ task: BGProcessingTask) {
        task.expirationHandler = {
            task.setTaskCompleted(success: false)
        }

        // Schedule next cleanup
        scheduleCleanupTask()

        // Execute cleanup
        Task {
            guard let queue = eventQueue else {
                task.setTaskCompleted(success: false)
                return
            }

            do {
                // Delete old processed events
                try await queue.deleteOldEvents(olderThanDays: 30)

                // Delete failed events
                try await queue.deleteFailedEvents()

                // Delete processed events
                try await queue.deleteProcessedEvents()

                task.setTaskCompleted(success: true)
            } catch {
                print("[BackgroundTaskManager] Cleanup failed: \(error)")
                task.setTaskCompleted(success: false)
            }
        }
    }

    private func handleOrchestratorSyncTask(_ task: BGProcessingTask) {
        task.expirationHandler = {
            task.setTaskCompleted(success: false)
        }

        // Schedule next sync
        scheduleOrchestratorSyncTask()

        Task { @MainActor in
            // Flush pending events through orchestrator
            let success = await IngestionOrchestrator.shared.flush()
            await IngestionOrchestrator.shared.processBackgroundUploads()
            IngestionOrchestrator.shared.scheduleBackgroundSync()

            task.setTaskCompleted(success: success)
        }
    }

    private func handleEventProcessingTask(_ task: BGProcessingTask) {
        task.expirationHandler = {
            task.setTaskCompleted(success: false)
        }

        // Schedule next processing
        scheduleEventProcessingTask(earliestBeginDate: Date(timeIntervalSinceNow: 5 * 60))

        Task { @MainActor in
            guard let scheduler = uploadScheduler else {
                task.setTaskCompleted(success: false)
                return
            }

            await scheduler.processQueue()
            task.setTaskCompleted(success: true)
        }
    }

    // MARK: - Cancel Tasks

    /// Cancel all pending background tasks
    public func cancelAllTasks() {
        BGTaskScheduler.shared.cancelAllTaskRequests()
        print("[BackgroundTaskManager] Cancelled all background tasks")
    }

    /// Cancel a specific task
    public func cancelTask(_ taskID: TaskID) {
        BGTaskScheduler.shared.cancel(taskRequestWithIdentifier: taskID.rawValue)
        print("[BackgroundTaskManager] Cancelled task: \(taskID.rawValue)")
    }

    // MARK: - Debug Support

    /// Get pending task requests (for debugging)
    public func getPendingTaskRequests() async -> [BGTaskRequest] {
        return await withCheckedContinuation { continuation in
            BGTaskScheduler.shared.getPendingTaskRequests { requests in
                continuation.resume(returning: requests)
            }
        }
    }

    /// Simulate task execution (for debugging in simulator)
    #if DEBUG
    @MainActor
    public func simulateTask(_ taskID: TaskID) async {
        print("[BackgroundTaskManager] Simulating task: \(taskID.rawValue)")

        switch taskID {
        case .upload:
            if let scheduler = uploadScheduler {
                _ = await scheduler.flush()
            }

        case .sync:
            if let queue = eventQueue {
                let count = await queue.getPendingCount()
                print("[BackgroundTaskManager] Pending events: \(count)")
            }

        case .cleanup:
            if let queue = eventQueue {
                try? await queue.deleteProcessedEvents()
                try? await queue.deleteFailedEvents()
            }

        case .orchestratorSync:
            _ = await IngestionOrchestrator.shared.flush()

        case .eventProcessing:
            if let scheduler = uploadScheduler {
                await scheduler.processQueue()
            }
        }
    }
    #endif
}

// MARK: - App Lifecycle Integration

extension BackgroundTaskManager {
    /// Called when app enters background
    public func applicationDidEnterBackground() {
        // Schedule tasks when entering background
        scheduleUploadTask(earliestBeginDate: Date(timeIntervalSinceNow: 10))
        scheduleSyncTask()
    }

    /// Called when app will terminate
    public func applicationWillTerminate() {
        // Try to schedule immediate tasks
        scheduleUploadTask(earliestBeginDate: Date())
    }

    /// Called when scene enters background
    public func sceneDidEnterBackground() {
        applicationDidEnterBackground()
    }
}

// MARK: - Info.plist Configuration

/*
 Add these to Info.plist for background task support:

 <key>BGTaskSchedulerPermittedIdentifiers</key>
 <array>
     <string>com.orion.browser.upload</string>
     <string>com.orion.browser.sync</string>
     <string>com.orion.browser.cleanup</string>
     <string>com.orion.browser.orchestrator.sync</string>
     <string>com.orion.browser.eventProcessing</string>
 </array>

 <key>UIBackgroundModes</key>
 <array>
     <string>fetch</string>
     <string>processing</string>
 </array>
*/

// MARK: - Background Task Status

/// Status information for background tasks
public struct BackgroundTaskStatus: Sendable {
    public let taskID: BackgroundTaskManager.TaskID
    public let isScheduled: Bool
    public let nextScheduledDate: Date?
    public let lastExecutionDate: Date?
    public let lastSuccess: Bool?

    public var description: String {
        if isScheduled, let nextDate = nextScheduledDate {
            let formatter = RelativeDateTimeFormatter()
            return "Scheduled \(formatter.localizedString(for: nextDate, relativeTo: Date()))"
        } else {
            return "Not scheduled"
        }
    }
}

// MARK: - Extension for Debug Triggering

#if DEBUG
extension BGTaskScheduler {
    /// Convenience for testing - triggers a task immediately
    /// Run in debugger: e -l objc -- (void)[[BGTaskScheduler sharedScheduler] _simulateLaunchForTaskWithIdentifier:@"com.orion.browser.upload"]
    public func simulateTask(_ identifier: String) {
        // This is a debug-only hook
        print("Simulating task: \(identifier)")
    }
}
#endif
