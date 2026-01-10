/**
 * Logger.swift
 * Thread-safe OSLog-backed logger
 */

import Foundation
import os.log

final class AppLogger {
    static let shared = AppLogger()

    private let logger: os.Logger

    private init() {
        self.logger = os.Logger(subsystem: Bundle.main.bundleIdentifier ?? "com.orion.browser", category: "app")
    }

    func debug(_ message: String) {
        logger.debug("\(message, privacy: .public)")
    }

    func info(_ message: String) {
        logger.info("\(message, privacy: .public)")
    }

    func warning(_ message: String) {
        logger.warning("\(message, privacy: .public)")
    }

    func error(_ message: String) {
        logger.error("\(message, privacy: .public)")
    }
}

// MARK: - Legacy Logger Compatibility
/// Wrapper for backward compatibility with existing Logger usage
final class Logger {
    let subsystem: String
    private let osLogger: os.Logger

    init(subsystem: String) {
        self.subsystem = subsystem
        self.osLogger = os.Logger(subsystem: subsystem, category: "general")
    }

    func debug(_ message: String) {
        osLogger.debug("\(message, privacy: .public)")
    }

    func info(_ message: String) {
        osLogger.info("\(message, privacy: .public)")
    }

    func warning(_ message: String) {
        osLogger.warning("\(message, privacy: .public)")
    }

    func error(_ message: String) {
        osLogger.error("\(message, privacy: .public)")
    }
}
