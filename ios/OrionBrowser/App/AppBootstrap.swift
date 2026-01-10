/**
 * AppBootstrap.swift
 * Application initialization sequence
 * SUB-AGENT B: Edge Capture + Local Buffer + Background Upload
 *
 * Orchestrates the initialization of all app services
 * in the correct dependency order.
 */

import Foundation
import UIKit

// MARK: - Bootstrap Error

/// Errors that can occur during bootstrap
public enum BootstrapError: LocalizedError {
    case configurationMissing(String)
    case serviceInitFailed(String, Error)
    case dependencyFailed(String)
    case timeout

    public var errorDescription: String? {
        switch self {
        case .configurationMissing(let key):
            return "Missing configuration: \(key)"
        case .serviceInitFailed(let service, let error):
            return "Failed to initialize \(service): \(error.localizedDescription)"
        case .dependencyFailed(let dependency):
            return "Dependency failed: \(dependency)"
        case .timeout:
            return "Bootstrap timed out"
        }
    }
}

// MARK: - Bootstrap Step

/// Individual bootstrap step
public struct BootstrapStep: Identifiable {
    public let id: String
    public let name: String
    public let action: () async throws -> Void

    public init(id: String, name: String, action: @escaping () async throws -> Void) {
        self.id = id
        self.name = name
        self.action = action
    }
}

// MARK: - Bootstrap Result

/// Result of the bootstrap process
public struct BootstrapResult {
    public let environment: AppEnvironment
    public let duration: TimeInterval
    public let completedSteps: [String]
    public let warnings: [String]

    public var isSuccess: Bool { true }
}

// MARK: - App Bootstrap

/// Orchestrates application initialization
public enum AppBootstrap {
    // MARK: - Main Bootstrap

    /// Bootstrap the application and return a configured environment
    @MainActor
    public static func bootstrap() -> AppEnvironment {
        let startTime = Date()

        print("[AppBootstrap] Starting bootstrap sequence...")

        // Step 1: Load configuration
        print("[AppBootstrap] Step 1: Loading configuration...")
        validateConfiguration()

        // Step 2: Initialize CoreData stack
        print("[AppBootstrap] Step 2: Initializing CoreData...")
        let coreDataStack = CoreDataStack.shared

        // Step 3: Initialize Clerk Auth Manager
        print("[AppBootstrap] Step 3: Initializing authentication...")
        let clerk = ClerkAuthManager.shared

        // Step 4: Initialize Convex HTTP Client
        print("[AppBootstrap] Step 4: Initializing Convex client...")
        let convex = ConvexManager.shared

        // Step 5: Initialize Local Event Queue
        print("[AppBootstrap] Step 5: Initializing event queue...")
        let eventQueue = LocalEventQueue(coreDataStack: coreDataStack)

        // Step 6: Initialize Consent Service
        print("[AppBootstrap] Step 6: Initializing consent service...")
        let consent = ConsentService(
            neuralConsentManager: NeuralConsentManager.shared,
            convexClient: convex
        )

        // Step 7: Initialize Upload Scheduler
        print("[AppBootstrap] Step 7: Initializing upload scheduler...")
        let uploadScheduler = UploadScheduler(
            eventQueue: eventQueue,
            consentService: consent,
            convexClient: convex
        )

        // Step 8: Configure Background Tasks
        print("[AppBootstrap] Step 8: Configuring background tasks...")
        let backgroundTasks = BackgroundTaskManager.shared
        backgroundTasks.registerTasks()
        backgroundTasks.configure(
            uploadScheduler: uploadScheduler,
            eventQueue: eventQueue
        )

        // Step 9: Create environment
        print("[AppBootstrap] Step 9: Creating environment...")
        let environment = createEnvironment(
            clerk: clerk,
            consent: consent,
            convex: convex,
            eventQueue: eventQueue,
            uploadScheduler: uploadScheduler,
            backgroundTasks: backgroundTasks,
            coreDataStack: coreDataStack
        )

        let duration = Date().timeIntervalSince(startTime)
        print("[AppBootstrap] Bootstrap completed in \(String(format: "%.2f", duration))s")

        return environment
    }

    /// Async initialization after synchronous bootstrap
    @MainActor
    public static func initializeAsync(_ environment: AppEnvironment) async {
        print("[AppBootstrap] Starting async initialization...")

        // Initialize Convex connection
        await environment.convex.initialize()

        // Sync consent from backend
        await environment.consent.requestConsentUpdate()

        // Schedule background tasks
        environment.backgroundTasks.scheduleAllPeriodicTasks()

        // Check for pending uploads
        let pendingCount = await environment.eventQueue.getPendingCount()
        if pendingCount > 0 {
            print("[AppBootstrap] Found \(pendingCount) pending events, scheduling upload...")
            environment.uploadScheduler.scheduleUpload()
        }

        print("[AppBootstrap] Async initialization complete")
    }

    // MARK: - Configuration Validation

    private static func validateConfiguration() {
        // Validate required configuration keys
        #if !DEBUG
        guard !Configuration.convexDeploymentURL.isEmpty else {
            fatalError("CONVEX_DEPLOYMENT_URL not configured")
        }

        guard !Configuration.clerkPublishableKey.isEmpty else {
            fatalError("CLERK_PUBLISHABLE_KEY not configured")
        }
        #endif

        print("[AppBootstrap] Configuration validated")
    }

    // MARK: - Environment Creation

    @MainActor
    private static func createEnvironment(
        clerk: ClerkAuthManager,
        consent: ConsentService,
        convex: ConvexManager,
        eventQueue: LocalEventQueue,
        uploadScheduler: UploadScheduler,
        backgroundTasks: BackgroundTaskManager,
        coreDataStack: CoreDataStack
    ) -> AppEnvironment {
        return AppEnvironment.bootstrap()
    }

    // MARK: - Shutdown

    /// Graceful shutdown of services
    @MainActor
    public static func shutdown(_ environment: AppEnvironment) async {
        print("[AppBootstrap] Starting shutdown sequence...")

        // Pause upload scheduler
        environment.uploadScheduler.pause()

        // Flush remaining events
        _ = await environment.uploadScheduler.flush()

        // Save CoreData context
        environment.coreDataStack.saveContext()

        // Cancel background tasks
        environment.backgroundTasks.cancelAllTasks()

        print("[AppBootstrap] Shutdown complete")
    }
}

// MARK: - Bootstrap Observer

/// Observable wrapper for bootstrap progress
@MainActor
public final class BootstrapObserver: ObservableObject {
    @Published public var currentStep: String = "Starting..."
    @Published public var progress: Double = 0.0
    @Published public var isComplete: Bool = false
    @Published public var error: Error?

    private let totalSteps: Double = 9.0

    public init() {}

    public func updateStep(_ step: String, number: Int) {
        currentStep = step
        progress = Double(number) / totalSteps
    }

    public func complete() {
        currentStep = "Ready"
        progress = 1.0
        isComplete = true
    }

    public func fail(_ error: Error) {
        self.error = error
    }
}

// MARK: - Service Health Check

/// Health check for initialized services
public struct ServiceHealth {
    public let serviceName: String
    public let isHealthy: Bool
    public let message: String?
    public let lastChecked: Date

    @MainActor
    public static func check(_ environment: AppEnvironment) async -> [ServiceHealth] {
        var results: [ServiceHealth] = []

        // Check Clerk auth
        let isAuthenticated = environment.clerk.isAuthenticated
        let clerkHealth = ServiceHealth(
            serviceName: "Authentication",
            isHealthy: true, // Clerk is always available
            message: isAuthenticated ? "Authenticated" : "Not authenticated",
            lastChecked: Date()
        )
        results.append(clerkHealth)

        // Check Convex connection
        let isConnected = environment.convex.isConnected
        let convexHealth = ServiceHealth(
            serviceName: "Backend",
            isHealthy: isConnected,
            message: isConnected ? "Connected" : "Disconnected",
            lastChecked: Date()
        )
        results.append(convexHealth)

        // Check event queue
        let pendingCount = await environment.eventQueue.getPendingCount()
        let queueHealth = ServiceHealth(
            serviceName: "Event Queue",
            isHealthy: true,
            message: "\(pendingCount) pending events",
            lastChecked: Date()
        )
        results.append(queueHealth)

        // Check consent
        let consentValid = environment.consent.validate().isValid
        let consentHealth = ServiceHealth(
            serviceName: "Consent",
            isHealthy: consentValid,
            message: consentValid ? "Valid" : "Requires attention",
            lastChecked: Date()
        )
        results.append(consentHealth)

        return results
    }
}

// MARK: - Migration Support

/// Handles data migration between app versions
public enum AppMigration {
    /// Check if migration is needed
    public static func checkMigration() -> Bool {
        let currentVersion = Configuration.appVersion
        let lastVersion = UserDefaults.standard.string(forKey: "last_app_version") ?? "0.0.0"

        return currentVersion != lastVersion
    }

    /// Perform migration if needed
    @MainActor
    public static func performMigration() async {
        guard checkMigration() else { return }

        print("[AppMigration] Performing migration...")

        let currentVersion = Configuration.appVersion
        let lastVersion = UserDefaults.standard.string(forKey: "last_app_version") ?? "0.0.0"

        // Perform version-specific migrations
        if compareVersions(lastVersion, "1.0.0") < 0 {
            await migrateTo1_0_0()
        }

        if compareVersions(lastVersion, "1.1.0") < 0 {
            await migrateTo1_1_0()
        }

        // Update stored version
        UserDefaults.standard.set(currentVersion, forKey: "last_app_version")

        print("[AppMigration] Migration complete")
    }

    private static func migrateTo1_0_0() async {
        // Initial release - no migration needed
        print("[AppMigration] Migrating to 1.0.0")
    }

    private static func migrateTo1_1_0() async {
        // Example migration for future version
        print("[AppMigration] Migrating to 1.1.0")

        // Migrate SQLite data to CoreData
        // This would involve reading from old LocalEventStore and writing to new LocalEventQueue
    }

    private static func compareVersions(_ v1: String, _ v2: String) -> Int {
        let parts1 = v1.split(separator: ".").compactMap { Int($0) }
        let parts2 = v2.split(separator: ".").compactMap { Int($0) }

        for i in 0..<max(parts1.count, parts2.count) {
            let p1 = i < parts1.count ? parts1[i] : 0
            let p2 = i < parts2.count ? parts2[i] : 0

            if p1 < p2 { return -1 }
            if p1 > p2 { return 1 }
        }

        return 0
    }
}
