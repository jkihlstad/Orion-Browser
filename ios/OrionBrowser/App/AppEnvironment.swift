/**
 * AppEnvironment.swift
 * Unified environment object for app-wide services
 * SUB-AGENT B: Edge Capture + Local Buffer + Background Upload
 *
 * Provides a centralized container for all app services,
 * injected into the SwiftUI view hierarchy.
 */

import SwiftUI
import Combine

// MARK: - UI Preferences

/// User interface preferences
public struct UIPreferences: Equatable {
    public var colorScheme: ColorScheme?
    public var hapticFeedbackEnabled: Bool
    public var animationsEnabled: Bool
    public var compactMode: Bool
    public var fontSize: FontSize

    public enum FontSize: String, CaseIterable {
        case small = "small"
        case medium = "medium"
        case large = "large"
        case extraLarge = "extraLarge"

        public var scaleFactor: CGFloat {
            switch self {
            case .small: return 0.85
            case .medium: return 1.0
            case .large: return 1.15
            case .extraLarge: return 1.3
            }
        }
    }

    public init(
        colorScheme: ColorScheme? = nil,
        hapticFeedbackEnabled: Bool = true,
        animationsEnabled: Bool = true,
        compactMode: Bool = false,
        fontSize: FontSize = .medium
    ) {
        self.colorScheme = colorScheme
        self.hapticFeedbackEnabled = hapticFeedbackEnabled
        self.animationsEnabled = animationsEnabled
        self.compactMode = compactMode
        self.fontSize = fontSize
    }

    public static var `default`: UIPreferences {
        UIPreferences()
    }
}

// MARK: - App Environment

/// Unified environment object containing all app services
@MainActor
public final class AppEnvironment: ObservableObject {
    // MARK: - Core Services

    /// Clerk authentication manager
    let clerk: ClerkAuthManager

    /// Consent service for data capture gating
    public let consent: ConsentService

    /// Convex backend client
    let convex: ConvexManager

    /// Local event queue (CoreData-based)
    public let eventQueue: LocalEventQueue

    /// Upload scheduler for background uploads
    public let uploadScheduler: UploadScheduler

    /// Background task manager
    public let backgroundTasks: BackgroundTaskManager

    /// CoreData stack
    public let coreDataStack: CoreDataStack

    // MARK: - Published State

    /// UI preferences
    @Published public var uiPrefs: UIPreferences = .default {
        didSet {
            saveUIPreferences()
        }
    }

    /// Whether the environment is fully initialized
    @Published public private(set) var isInitialized: Bool = false

    /// Current initialization step (for splash screen)
    @Published public private(set) var initializationStep: String = ""

    /// Last initialization error
    @Published public private(set) var initializationError: Error?

    // MARK: - Private Properties

    private var cancellables = Set<AnyCancellable>()
    private let userDefaultsKey = "app_environment_ui_prefs"

    // MARK: - Initialization

    /// Private initializer - use bootstrap() to create
    private init(
        clerk: ClerkAuthManager,
        consent: ConsentService,
        convex: ConvexManager,
        eventQueue: LocalEventQueue,
        uploadScheduler: UploadScheduler,
        backgroundTasks: BackgroundTaskManager,
        coreDataStack: CoreDataStack
    ) {
        self.clerk = clerk
        self.consent = consent
        self.convex = convex
        self.eventQueue = eventQueue
        self.uploadScheduler = uploadScheduler
        self.backgroundTasks = backgroundTasks
        self.coreDataStack = coreDataStack

        loadUIPreferences()
        setupObservers()
    }

    // MARK: - Shared Instance

    /// Shared singleton instance of the app environment
    public static let shared: AppEnvironment = bootstrap()

    // MARK: - Bootstrap

    /// Bootstrap the app environment with all services
    public static func bootstrap() -> AppEnvironment {
        // 1. Core services that don't depend on others
        let coreDataStack = CoreDataStack.shared
        let clerk = ClerkAuthManager.shared
        let convex = ConvexManager.shared

        // 2. Create consent service (depends on convex)
        let consent = ConsentService(
            neuralConsentManager: NeuralConsentManager.shared,
            convexClient: convex
        )

        // 3. Create event queue (depends on coreData)
        let eventQueue = LocalEventQueue(coreDataStack: coreDataStack)

        // 4. Create upload scheduler (depends on eventQueue, consent)
        let uploadScheduler = UploadScheduler(
            eventQueue: eventQueue,
            consentService: consent,
            convexClient: convex
        )

        // 5. Get background task manager and configure it
        let backgroundTasks = BackgroundTaskManager.shared
        backgroundTasks.configure(
            uploadScheduler: uploadScheduler,
            eventQueue: eventQueue
        )

        // 6. Create environment
        let environment = AppEnvironment(
            clerk: clerk,
            consent: consent,
            convex: convex,
            eventQueue: eventQueue,
            uploadScheduler: uploadScheduler,
            backgroundTasks: backgroundTasks,
            coreDataStack: coreDataStack
        )

        return environment
    }

    /// Async initialization for services that require async setup
    public func initialize() async {
        do {
            initializationStep = "Loading configuration..."
            try await Task.sleep(nanoseconds: 100_000_000) // Brief pause for UI

            initializationStep = "Connecting to backend..."
            await convex.initialize()

            initializationStep = "Syncing consent..."
            await consent.requestConsentUpdate()

            initializationStep = "Setting up background tasks..."
            backgroundTasks.registerTasks()
            backgroundTasks.scheduleAllPeriodicTasks()

            initializationStep = "Ready"
            isInitialized = true
            initializationError = nil

            print("[AppEnvironment] Initialization complete")

        } catch {
            initializationError = error
            print("[AppEnvironment] Initialization failed: \(error)")
        }
    }

    // MARK: - Convenience Accessors

    /// Check if user is authenticated
    public var isAuthenticated: Bool {
        clerk.isAuthenticated
    }

    /// Get current user
    var currentUser: ClerkAuthManager.OrionUser? {
        clerk.user
    }

    /// Get pending upload count
    public var pendingUploads: Int {
        uploadScheduler.pendingCount
    }

    /// Check if uploads are in progress
    public var isUploading: Bool {
        uploadScheduler.isUploading
    }

    // MARK: - Actions

    /// Trigger manual sync
    public func syncNow() async {
        await consent.requestConsentUpdate()
        uploadScheduler.scheduleUpload()
    }

    /// Flush all pending data
    public func flushData() async -> UploadResult {
        return await uploadScheduler.flush()
    }

    /// Clear all local data
    public func clearLocalData() async throws {
        try await eventQueue.clearAll()
        consent.revokeAllConsents()
    }

    /// Sign out and clear session
    public func signOut() async {
        await clerk.signOut()
        uploadScheduler.pause()
        try? await eventQueue.clearAll()
    }

    // MARK: - UI Preferences

    private func loadUIPreferences() {
        guard let data = UserDefaults.standard.data(forKey: userDefaultsKey),
              let prefs = try? JSONDecoder().decode(UIPreferencesDTO.self, from: data) else {
            return
        }

        uiPrefs = UIPreferences(
            colorScheme: prefs.darkMode ? .dark : (prefs.lightMode ? .light : nil),
            hapticFeedbackEnabled: prefs.hapticFeedbackEnabled,
            animationsEnabled: prefs.animationsEnabled,
            compactMode: prefs.compactMode,
            fontSize: UIPreferences.FontSize(rawValue: prefs.fontSize) ?? .medium
        )
    }

    private func saveUIPreferences() {
        let dto = UIPreferencesDTO(
            darkMode: uiPrefs.colorScheme == .dark,
            lightMode: uiPrefs.colorScheme == .light,
            hapticFeedbackEnabled: uiPrefs.hapticFeedbackEnabled,
            animationsEnabled: uiPrefs.animationsEnabled,
            compactMode: uiPrefs.compactMode,
            fontSize: uiPrefs.fontSize.rawValue
        )

        if let data = try? JSONEncoder().encode(dto) {
            UserDefaults.standard.set(data, forKey: userDefaultsKey)
        }
    }

    // MARK: - Observers

    private func setupObservers() {
        // Observe auth changes
        clerk.$isAuthenticated
            .dropFirst()
            .sink { [weak self] isAuthenticated in
                if isAuthenticated {
                    self?.uploadScheduler.resume()
                } else {
                    self?.uploadScheduler.pause()
                }
            }
            .store(in: &cancellables)

        // Observe consent changes
        consent.$currentState
            .dropFirst()
            .sink { [weak self] state in
                // Trigger re-validation when consent changes
                if !state.globalEnabled {
                    self?.uploadScheduler.pause()
                }
            }
            .store(in: &cancellables)
    }
}

// MARK: - UI Preferences DTO

/// Data transfer object for persisting UI preferences
private struct UIPreferencesDTO: Codable {
    let darkMode: Bool
    let lightMode: Bool
    let hapticFeedbackEnabled: Bool
    let animationsEnabled: Bool
    let compactMode: Bool
    let fontSize: String
}

// MARK: - Environment Key

/// Environment key for accessing AppEnvironment
private struct AppEnvironmentKey: EnvironmentKey {
    static let defaultValue: AppEnvironment? = nil
}

extension EnvironmentValues {
    public var appEnvironment: AppEnvironment? {
        get { self[AppEnvironmentKey.self] }
        set { self[AppEnvironmentKey.self] = newValue }
    }
}

// MARK: - View Extension

extension View {
    /// Inject app environment into view hierarchy
    public func withAppEnvironment(_ environment: AppEnvironment) -> some View {
        self
            .environmentObject(environment)
            .environmentObject(environment.clerk)
            .environmentObject(environment.consent)
            .environmentObject(environment.uploadScheduler)
            .environment(\.appEnvironment, environment)
    }
}

// MARK: - Preview Support

#if DEBUG
extension AppEnvironment {
    /// Create a preview environment for SwiftUI previews
    public static var preview: AppEnvironment {
        bootstrap()
    }
}
#endif
