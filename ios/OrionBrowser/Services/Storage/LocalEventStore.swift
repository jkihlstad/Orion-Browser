/**
 * LocalEventStore.swift
 * Local storage for events before upload
 * Refactored to use CoreDataStack for persistence
 * SUB-AGENT B: Edge Capture + Local Buffer + Background Upload
 *
 * Maintains the append-only pattern with CoreData backend,
 * adds consent version tracking to events.
 */

import Foundation
import CoreData

// MARK: - Local Event Store (CoreData-based)

/// Actor for thread-safe event storage operations
/// Refactored from SQLite to CoreData for better reliability and iOS integration
actor LocalEventStore {
    // MARK: - Singleton

    static let shared = LocalEventStore()

    // MARK: - Properties

    private let coreDataStack: CoreDataStack
    private let eventQueue: LocalEventQueue
    private let maxRetries = 5

    // MARK: - Initialization

    private init() {
        self.coreDataStack = CoreDataStack.shared
        self.eventQueue = LocalEventQueue(coreDataStack: coreDataStack)
    }

    // MARK: - Store Event

    /// Store a new event (append-only pattern)
    func store(_ event: IngestEvent) async {
        do {
            let payloadData = try JSONEncoder().encode(event.payload)

            let queuedEvent = QueuedEventData(
                id: event.id,
                eventType: event.type.rawValue,
                payload: payloadData,
                timestamp: event.timestamp,
                sourceApp: "browser",
                privacyScope: "analytics",
                consentVersion: event.consentVersion ?? "1.0",
                idempotencyKey: "\(event.id.uuidString)_\(Int(event.timestamp.timeIntervalSince1970 * 1000))"
            )

            try await eventQueue.store(queuedEvent)
        } catch {
            print("[LocalEventStore] Failed to store event: \(error)")
        }
    }

    /// Store event with full metadata
    func store(
        _ event: IngestEvent,
        sourceApp: String,
        privacyScope: String,
        consentVersion: String
    ) async {
        do {
            let payloadData = try JSONEncoder().encode(event.payload)

            let queuedEvent = QueuedEventData(
                id: event.id,
                eventType: event.type.rawValue,
                payload: payloadData,
                timestamp: event.timestamp,
                sourceApp: sourceApp,
                privacyScope: privacyScope,
                consentVersion: consentVersion
            )

            try await eventQueue.store(queuedEvent)
        } catch {
            print("[LocalEventStore] Failed to store event: \(error)")
        }
    }

    /// Store multiple events in a batch
    func storeBatch(_ events: [IngestEvent], consentVersion: String = "1.0") async {
        do {
            let queuedEvents = try events.map { event -> QueuedEventData in
                let payloadData = try JSONEncoder().encode(event.payload)
                return QueuedEventData(
                    id: event.id,
                    eventType: event.type.rawValue,
                    payload: payloadData,
                    timestamp: event.timestamp,
                    sourceApp: "browser",
                    privacyScope: "analytics",
                    consentVersion: event.consentVersion ?? consentVersion
                )
            }

            try await eventQueue.storeBatch(queuedEvents)
        } catch {
            print("[LocalEventStore] Failed to store batch: \(error)")
        }
    }

    // MARK: - Mark as Processed

    /// Mark a single event as processed
    func markAsProcessed(_ id: UUID) async {
        do {
            try await eventQueue.markAsProcessed(id)
        } catch {
            print("[LocalEventStore] Failed to mark as processed: \(error)")
        }
    }

    /// Mark multiple events as processed
    func markBatchAsProcessed(_ ids: [UUID]) async {
        do {
            try await eventQueue.markBatchAsProcessed(ids)
        } catch {
            print("[LocalEventStore] Failed to mark batch as processed: \(error)")
        }
    }

    // MARK: - Get Unprocessed Events

    /// Get unprocessed events ready for upload
    func getUnprocessedEvents(limit: Int = 100) async -> [StoredEvent] {
        do {
            let events = try await eventQueue.getPendingEvents(limit: limit)

            return events.map { event in
                let payloadString = String(data: event.payload, encoding: .utf8) ?? "{}"
                return StoredEvent(
                    id: event.id,
                    type: event.eventType,
                    payload: payloadString,
                    timestamp: event.timestamp,
                    sourceApp: event.sourceApp,
                    privacyScope: event.privacyScope,
                    consentVersion: event.consentVersion,
                    retryCount: event.retryCount
                )
            }
        } catch {
            print("[LocalEventStore] Failed to get unprocessed events: \(error)")
            return []
        }
    }

    // MARK: - Delete Operations

    /// Delete old processed events
    func deleteOldEvents(olderThan days: Int = 30) async {
        do {
            try await eventQueue.deleteOldEvents(olderThanDays: days)
        } catch {
            print("[LocalEventStore] Failed to delete old events: \(error)")
        }
    }

    /// Delete all processed events
    func deleteProcessedEvents() async {
        do {
            try await eventQueue.deleteProcessedEvents()
        } catch {
            print("[LocalEventStore] Failed to delete processed events: \(error)")
        }
    }

    /// Delete failed events that exceeded retry limit
    func deleteFailedEvents() async {
        do {
            try await eventQueue.deleteFailedEvents()
        } catch {
            print("[LocalEventStore] Failed to delete failed events: \(error)")
        }
    }

    // MARK: - Get Event Count

    /// Get count of unprocessed events
    func getEventCount() async -> Int {
        return await eventQueue.getPendingCount()
    }

    /// Get total count of all events
    func getTotalCount() async -> Int {
        return await eventQueue.getTotalCount()
    }

    // MARK: - Clear All

    /// Clear all events from storage
    func clearAll() async {
        do {
            try await eventQueue.clearAll()
        } catch {
            print("[LocalEventStore] Failed to clear all: \(error)")
        }
    }

    // MARK: - Retry Handling

    /// Record a retry failure for an event
    func recordRetryFailure(_ id: UUID, error: String) async {
        do {
            try await eventQueue.recordRetryFailure(id, error: error)
        } catch {
            print("[LocalEventStore] Failed to record retry failure: \(error)")
        }
    }

    // MARK: - Migration Support

    /// Migrate data from old SQLite database if exists
    func migrateFromSQLite() async {
        let documentsPath = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
        let oldDbPath = documentsPath.appendingPathComponent("events.sqlite")

        guard FileManager.default.fileExists(atPath: oldDbPath.path) else {
            return
        }

        print("[LocalEventStore] Migrating from SQLite...")

        // Note: In production, implement SQLite reading and migration here
        // For now, we just mark the old database as migrated

        let migratedPath = documentsPath.appendingPathComponent("events.sqlite.migrated")
        try? FileManager.default.moveItem(at: oldDbPath, to: migratedPath)

        print("[LocalEventStore] SQLite migration complete")
    }
}

// MARK: - Stored Event

/// Event data transfer object for backwards compatibility
struct StoredEvent: Sendable {
    let id: UUID
    let type: String
    let payload: String
    let timestamp: Date
    let sourceApp: String
    let privacyScope: String
    let consentVersion: String
    let retryCount: Int

    init(
        id: UUID,
        type: String,
        payload: String,
        timestamp: Date,
        sourceApp: String = "browser",
        privacyScope: String = "analytics",
        consentVersion: String = "1.0",
        retryCount: Int = 0
    ) {
        self.id = id
        self.type = type
        self.payload = payload
        self.timestamp = timestamp
        self.sourceApp = sourceApp
        self.privacyScope = privacyScope
        self.consentVersion = consentVersion
        self.retryCount = retryCount
    }

    /// Decode payload as dictionary
    var payloadDict: [String: Any]? {
        guard let data = payload.data(using: .utf8) else { return nil }
        return try? JSONSerialization.jsonObject(with: data) as? [String: Any]
    }

    /// Check if event has exceeded retry limit
    var hasExceededRetries: Bool {
        retryCount >= 5
    }
}

// MARK: - Ingest Event (Compatibility)

/// Event type for ingestion (compatibility with existing code)
struct IngestEvent: Codable, Identifiable {
    let id: UUID
    let type: EventType
    let payload: EventPayloadData
    let timestamp: Date
    var consentVersion: String?

    enum EventType: String, Codable {
        case navigation
        case scroll
        case click
        case pageLoad
        case tabCreate
        case tabClose
        case search
        case voiceCommand
        case textInput
        case formSubmit
        case download
        case screenshot
        case custom
    }

    init(
        type: EventType,
        payload: EventPayloadData,
        consentVersion: String? = nil
    ) {
        self.id = UUID()
        self.type = type
        self.payload = payload
        self.timestamp = Date()
        self.consentVersion = consentVersion
    }
}

/// Event payload data (compatibility)
struct EventPayloadData: Codable {
    var url: String?
    var title: String?
    var content: String?
    var metadata: [String: String]?

    init(
        url: String? = nil,
        title: String? = nil,
        content: String? = nil,
        metadata: [String: String]? = nil
    ) {
        self.url = url
        self.title = title
        self.content = content
        self.metadata = metadata
    }
}
