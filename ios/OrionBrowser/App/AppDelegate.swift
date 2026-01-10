/**
 * AppDelegate.swift
 * UIKit App Delegate for background tasks and system callbacks
 *
 * Integrates the Neural Ingestion SDK components:
 * - DataIngestor: Event collection and batching
 * - MediaRecorder: Audio/video/screenshot capture
 * - BackgroundUploader: Reliable background uploads
 * - IngestionOrchestrator: Coordination layer
 */

import UIKit
import BackgroundTasks

class AppDelegate: NSObject, UIApplicationDelegate {
    // MARK: - App Lifecycle
    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
    ) -> Bool {
        // Register background tasks for ingestion SDK
        registerBackgroundTasks()

        // Configure appearance
        configureAppearance()

        // Initialize network reachability observer
        _ = NetworkReachabilityObserver()

        return true
    }

    // MARK: - Background Tasks Registration
    private func registerBackgroundTasks() {
        // Register BackgroundUploader tasks (primary upload mechanism)
        BackgroundUploader.registerBackgroundTasks()

        // Register legacy upload task (backward compatibility)
        BGTaskScheduler.shared.register(
            forTaskWithIdentifier: "com.orion.browser.upload",
            using: nil
        ) { task in
            self.handleBackgroundUpload(task: task as! BGProcessingTask)
        }

        // Register sync task
        BGTaskScheduler.shared.register(
            forTaskWithIdentifier: "com.orion.browser.sync",
            using: nil
        ) { task in
            self.handleBackgroundSync(task: task as! BGAppRefreshTask)
        }

        // Register orchestrator sync task
        BGTaskScheduler.shared.register(
            forTaskWithIdentifier: "com.orion.browser.orchestrator.sync",
            using: nil
        ) { task in
            self.handleOrchestratorSync(task: task as! BGProcessingTask)
        }
    }

    private func handleBackgroundUpload(task: BGProcessingTask) {
        task.expirationHandler = {
            task.setTaskCompleted(success: false)
        }

        Task {
            await BackgroundUploader.shared.flushImmediately()
            task.setTaskCompleted(success: true)
            scheduleBackgroundUpload()
        }
    }

    private func handleBackgroundSync(task: BGAppRefreshTask) {
        task.expirationHandler = {
            task.setTaskCompleted(success: false)
        }

        Task {
            await ConvexManager.shared.initialize()
            task.setTaskCompleted(success: true)
            scheduleBackgroundSync()
        }
    }

    private func handleOrchestratorSync(task: BGProcessingTask) {
        task.expirationHandler = {
            task.setTaskCompleted(success: false)
        }

        Task { @MainActor in
            // Flush all pending events and uploads
            let success = await IngestionOrchestrator.shared.flush()
            await IngestionOrchestrator.shared.processBackgroundUploads()
            IngestionOrchestrator.shared.scheduleBackgroundSync()
            task.setTaskCompleted(success: success)
        }
    }

    func scheduleBackgroundUpload() {
        let request = BGProcessingTaskRequest(identifier: "com.orion.browser.upload")
        request.requiresNetworkConnectivity = true
        request.requiresExternalPower = false

        do {
            try BGTaskScheduler.shared.submit(request)
        } catch {
            print("Failed to schedule background upload: \(error)")
        }
    }

    func scheduleBackgroundSync() {
        let request = BGAppRefreshTaskRequest(identifier: "com.orion.browser.sync")
        request.earliestBeginDate = Date(timeIntervalSinceNow: 15 * 60) // 15 minutes

        do {
            try BGTaskScheduler.shared.submit(request)
        } catch {
            print("Failed to schedule background sync: \(error)")
        }
    }

    // MARK: - Appearance
    private func configureAppearance() {
        // Tab bar appearance
        let tabBarAppearance = UITabBarAppearance()
        tabBarAppearance.configureWithDefaultBackground()
        UITabBar.appearance().standardAppearance = tabBarAppearance
        UITabBar.appearance().scrollEdgeAppearance = tabBarAppearance

        // Navigation bar appearance
        let navBarAppearance = UINavigationBarAppearance()
        navBarAppearance.configureWithDefaultBackground()
        UINavigationBar.appearance().standardAppearance = navBarAppearance
        UINavigationBar.appearance().scrollEdgeAppearance = navBarAppearance
    }

    // MARK: - URL Handling
    func application(
        _ app: UIApplication,
        open url: URL,
        options: [UIApplication.OpenURLOptionsKey: Any] = [:]
    ) -> Bool {
        // Handle custom URL schemes (orion://)
        if url.scheme == "orion" {
            handleCustomURL(url)
            return true
        }
        return false
    }

    private func handleCustomURL(_ url: URL) {
        // Parse and route custom URLs
        guard let host = url.host else { return }

        switch host {
        case "open":
            if let targetURL = url.queryParameters?["url"],
               let webURL = URL(string: targetURL) {
                NotificationCenter.default.post(
                    name: .openURLInBrowser,
                    object: nil,
                    userInfo: ["url": webURL]
                )
            }
        case "search":
            if let query = url.queryParameters?["q"] {
                NotificationCenter.default.post(
                    name: .performSearch,
                    object: nil,
                    userInfo: ["query": query]
                )
            }
        default:
            break
        }
    }

    // MARK: - Push Notifications
    func application(
        _ application: UIApplication,
        didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data
    ) {
        let token = deviceToken.map { String(format: "%02.2hhx", $0) }.joined()
        Task {
            await ConvexManager.shared.registerPushToken(token)
        }
    }

    func application(
        _ application: UIApplication,
        didFailToRegisterForRemoteNotificationsWithError error: Error
    ) {
        print("Failed to register for remote notifications: \(error)")
    }
}

// MARK: - Notification Names
extension Notification.Name {
    static let openURLInBrowser = Notification.Name("openURLInBrowser")
    static let performSearch = Notification.Name("performSearch")
}
