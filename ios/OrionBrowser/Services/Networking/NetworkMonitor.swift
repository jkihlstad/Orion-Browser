/**
 * NetworkMonitor.swift
 * Monitors network connectivity status
 */

import Foundation
import Network
import Combine

@MainActor
final class NetworkMonitor: ObservableObject {
    // MARK: - Singleton
    static let shared = NetworkMonitor()

    // MARK: - Published Properties
    @Published private(set) var isConnected: Bool = true
    @Published private(set) var connectionType: ConnectionType = .unknown
    @Published private(set) var isExpensive: Bool = false
    @Published private(set) var isConstrained: Bool = false

    // MARK: - Properties
    private let monitor: NWPathMonitor
    private let queue = DispatchQueue(label: "NetworkMonitor")

    // MARK: - Connection Type
    enum ConnectionType {
        case wifi
        case cellular
        case ethernet
        case unknown

        var description: String {
            switch self {
            case .wifi: return "Wi-Fi"
            case .cellular: return "Cellular"
            case .ethernet: return "Ethernet"
            case .unknown: return "Unknown"
            }
        }

        var icon: String {
            switch self {
            case .wifi: return "wifi"
            case .cellular: return "antenna.radiowaves.left.and.right"
            case .ethernet: return "cable.connector"
            case .unknown: return "questionmark.circle"
            }
        }
    }

    // MARK: - Initialization
    private init() {
        monitor = NWPathMonitor()
        startMonitoring()
    }

    deinit {
        // NWPathMonitor.cancel() is thread-safe
        monitor.cancel()
    }

    // MARK: - Start Monitoring
    private func startMonitoring() {
        monitor.pathUpdateHandler = { [weak self] path in
            Task { @MainActor in
                self?.updateStatus(path)
            }
        }
        monitor.start(queue: queue)
    }

    // MARK: - Stop Monitoring
    func stopMonitoring() {
        monitor.cancel()
    }

    // MARK: - Update Status
    private func updateStatus(_ path: NWPath) {
        isConnected = path.status == .satisfied
        isExpensive = path.isExpensive
        isConstrained = path.isConstrained

        if path.usesInterfaceType(.wifi) {
            connectionType = .wifi
        } else if path.usesInterfaceType(.cellular) {
            connectionType = .cellular
        } else if path.usesInterfaceType(.wiredEthernet) {
            connectionType = .ethernet
        } else {
            connectionType = .unknown
        }

        // Post notification
        NotificationCenter.default.post(
            name: .networkStatusChanged,
            object: nil,
            userInfo: [
                "isConnected": isConnected,
                "connectionType": connectionType
            ]
        )
    }

    // MARK: - Check Specific Interface
    func checkConnection(for interface: NWInterface.InterfaceType) -> Bool {
        let specificMonitor = NWPathMonitor(requiredInterfaceType: interface)
        var result = false

        let semaphore = DispatchSemaphore(value: 0)

        specificMonitor.pathUpdateHandler = { path in
            result = path.status == .satisfied
            semaphore.signal()
        }

        specificMonitor.start(queue: queue)
        _ = semaphore.wait(timeout: .now() + 1)
        specificMonitor.cancel()

        return result
    }

    // MARK: - Wait for Connection
    func waitForConnection() async -> Bool {
        if isConnected { return true }

        return await withCheckedContinuation { continuation in
            var cancellable: AnyCancellable?
            cancellable = $isConnected
                .filter { $0 }
                .first()
                .sink { _ in
                    continuation.resume(returning: true)
                    cancellable?.cancel()
                }

            // Timeout after 30 seconds
            Task {
                try? await Task.sleep(nanoseconds: 30_000_000_000)
                if !isConnected {
                    continuation.resume(returning: false)
                    cancellable?.cancel()
                }
            }
        }
    }
}

// MARK: - Notification Names
extension Notification.Name {
    static let networkStatusChanged = Notification.Name("networkStatusChanged")
}
