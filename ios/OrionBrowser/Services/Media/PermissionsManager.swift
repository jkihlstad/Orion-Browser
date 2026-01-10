/**
 * PermissionsManager.swift
 * Centralized permission handling for all system capabilities
 * SUB-AGENT 2: Media & Sensor Engineer
 */

import AVFoundation
import CoreLocation
import UserNotifications
import LocalAuthentication
import Photos
import UIKit

// MARK: - Permission Type
enum PermissionType: String, CaseIterable {
    case microphone
    case camera
    case location
    case notifications
    case photos
    case faceID

    var displayName: String {
        switch self {
        case .microphone: return "Microphone"
        case .camera: return "Camera"
        case .location: return "Location"
        case .notifications: return "Notifications"
        case .photos: return "Photos"
        case .faceID: return "Face ID"
        }
    }

    var description: String {
        switch self {
        case .microphone: return "Voice commands and audio capture"
        case .camera: return "Video recording and QR scanning"
        case .location: return "Location-aware browsing"
        case .notifications: return "Alerts and updates"
        case .photos: return "Save images and screenshots"
        case .faceID: return "Secure authentication"
        }
    }

    var iconName: String {
        switch self {
        case .microphone: return "mic.fill"
        case .camera: return "camera.fill"
        case .location: return "location.fill"
        case .notifications: return "bell.fill"
        case .photos: return "photo.fill"
        case .faceID: return "faceid"
        }
    }

    var infoKey: String {
        switch self {
        case .microphone: return "NSMicrophoneUsageDescription"
        case .camera: return "NSCameraUsageDescription"
        case .location: return "NSLocationWhenInUseUsageDescription"
        case .notifications: return ""
        case .photos: return "NSPhotoLibraryUsageDescription"
        case .faceID: return "NSFaceIDUsageDescription"
        }
    }
}

// MARK: - Permission Status
enum PermissionStatus {
    case notDetermined
    case authorized
    case denied
    case restricted
    case limited

    var color: String {
        switch self {
        case .authorized: return "green"
        case .denied, .restricted: return "red"
        case .notDetermined: return "orange"
        case .limited: return "yellow"
        }
    }
}

// MARK: - Permissions Manager
@MainActor
final class PermissionsManager: ObservableObject {
    // MARK: - Properties
    @Published private(set) var permissionStatuses: [PermissionType: PermissionStatus] = [:]

    private let locationManager = CLLocationManager()

    // MARK: - Singleton
    static let shared = PermissionsManager()

    private init() {
        refreshAllStatuses()
    }

    // MARK: - Status Checking
    func refreshAllStatuses() {
        for type in PermissionType.allCases {
            permissionStatuses[type] = getStatus(for: type)
        }
    }

    func getStatus(for type: PermissionType) -> PermissionStatus {
        switch type {
        case .microphone:
            return microphoneStatus
        case .camera:
            return cameraStatus
        case .location:
            return locationStatus
        case .notifications:
            // This needs to be async, return cached or notDetermined
            return permissionStatuses[.notifications] ?? .notDetermined
        case .photos:
            return photosStatus
        case .faceID:
            return faceIDStatus
        }
    }

    private var microphoneStatus: PermissionStatus {
        switch AVAudioSession.sharedInstance().recordPermission {
        case .undetermined: return .notDetermined
        case .granted: return .authorized
        case .denied: return .denied
        @unknown default: return .notDetermined
        }
    }

    private var cameraStatus: PermissionStatus {
        switch AVCaptureDevice.authorizationStatus(for: .video) {
        case .notDetermined: return .notDetermined
        case .authorized: return .authorized
        case .denied: return .denied
        case .restricted: return .restricted
        @unknown default: return .notDetermined
        }
    }

    private var locationStatus: PermissionStatus {
        switch locationManager.authorizationStatus {
        case .notDetermined: return .notDetermined
        case .authorizedAlways, .authorizedWhenInUse: return .authorized
        case .denied: return .denied
        case .restricted: return .restricted
        @unknown default: return .notDetermined
        }
    }

    private var photosStatus: PermissionStatus {
        switch PHPhotoLibrary.authorizationStatus(for: .readWrite) {
        case .notDetermined: return .notDetermined
        case .authorized: return .authorized
        case .denied: return .denied
        case .restricted: return .restricted
        case .limited: return .limited
        @unknown default: return .notDetermined
        }
    }

    private var faceIDStatus: PermissionStatus {
        let context = LAContext()
        var error: NSError?

        if context.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: &error) {
            return .authorized
        } else if let error = error as? LAError {
            switch error.code {
            case .biometryNotAvailable, .biometryNotEnrolled:
                return .restricted
            case .biometryLockout:
                return .denied
            default:
                return .notDetermined
            }
        }
        return .notDetermined
    }

    // MARK: - Permission Requests
    func request(_ type: PermissionType) async -> PermissionStatus {
        switch type {
        case .microphone:
            return await requestMicrophone()
        case .camera:
            return await requestCamera()
        case .location:
            return await requestLocation()
        case .notifications:
            return await requestNotifications()
        case .photos:
            return await requestPhotos()
        case .faceID:
            return await requestFaceID()
        }
    }

    private func requestMicrophone() async -> PermissionStatus {
        await withCheckedContinuation { continuation in
            AVAudioSession.sharedInstance().requestRecordPermission { granted in
                let status: PermissionStatus = granted ? .authorized : .denied
                Task { @MainActor in
                    self.permissionStatuses[.microphone] = status
                }
                continuation.resume(returning: status)
            }
        }
    }

    private func requestCamera() async -> PermissionStatus {
        let granted = await AVCaptureDevice.requestAccess(for: .video)
        let status: PermissionStatus = granted ? .authorized : .denied
        permissionStatuses[.camera] = status
        return status
    }

    private func requestLocation() async -> PermissionStatus {
        locationManager.requestWhenInUseAuthorization()

        // Wait for authorization change
        try? await Task.sleep(nanoseconds: 500_000_000)
        let status = locationStatus
        permissionStatuses[.location] = status
        return status
    }

    private func requestNotifications() async -> PermissionStatus {
        do {
            let granted = try await UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .badge, .sound])
            let status: PermissionStatus = granted ? .authorized : .denied
            permissionStatuses[.notifications] = status
            return status
        } catch {
            permissionStatuses[.notifications] = .denied
            return .denied
        }
    }

    private func requestPhotos() async -> PermissionStatus {
        let status = await PHPhotoLibrary.requestAuthorization(for: .readWrite)
        let permStatus: PermissionStatus = switch status {
        case .authorized: .authorized
        case .limited: .limited
        case .denied: .denied
        case .restricted: .restricted
        default: .notDetermined
        }
        permissionStatuses[.photos] = permStatus
        return permStatus
    }

    private func requestFaceID() async -> PermissionStatus {
        let context = LAContext()
        context.localizedReason = "Authenticate to access secure features"

        do {
            let success = try await context.evaluatePolicy(
                .deviceOwnerAuthenticationWithBiometrics,
                localizedReason: "Authenticate to enable Face ID"
            )
            let status: PermissionStatus = success ? .authorized : .denied
            permissionStatuses[.faceID] = status
            return status
        } catch {
            permissionStatuses[.faceID] = .denied
            return .denied
        }
    }

    // MARK: - Convenience Methods

    /// Request microphone permission and return a boolean result
    func requestMicrophonePermission() async -> Bool {
        let status = await request(.microphone)
        return status == .authorized
    }

    /// Request camera permission and return a boolean result
    func requestCameraPermission() async -> Bool {
        let status = await request(.camera)
        return status == .authorized
    }

    // MARK: - Helpers
    func openSettings() {
        guard let url = URL(string: UIApplication.openSettingsURLString) else { return }
        UIApplication.shared.open(url)
    }

    func isAuthorized(_ type: PermissionType) -> Bool {
        permissionStatuses[type] == .authorized || permissionStatuses[type] == .limited
    }

    func allRequired(types: [PermissionType]) -> Bool {
        types.allSatisfy { isAuthorized($0) }
    }
}
