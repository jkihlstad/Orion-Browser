/**
 * CoreDataStack.swift
 * CoreData setup for persistent event storage
 * SUB-AGENT B: Edge Capture + Local Buffer + Background Upload
 *
 * Provides append-only event storage with query helpers
 * and batch deletion for processed events.
 */

import Foundation
import CoreData

// MARK: - Core Data Stack

/// CoreData persistent container and context management
public final class CoreDataStack: @unchecked Sendable {
    // MARK: - Singleton

    public static let shared = CoreDataStack()

    // MARK: - Properties

    /// The persistent container
    public let persistentContainer: NSPersistentContainer

    /// Main context for UI operations
    public var viewContext: NSManagedObjectContext {
        persistentContainer.viewContext
    }

    /// Background context for async operations
    public func newBackgroundContext() -> NSManagedObjectContext {
        let context = persistentContainer.newBackgroundContext()
        context.mergePolicy = NSMergeByPropertyObjectTrumpMergePolicy
        context.automaticallyMergesChangesFromParent = true
        return context
    }

    // MARK: - Initialization

    private init(inMemory: Bool = false) {
        // Create model programmatically
        let model = Self.createManagedObjectModel()

        persistentContainer = NSPersistentContainer(
            name: "OrionEventStore",
            managedObjectModel: model
        )

        if inMemory {
            let description = NSPersistentStoreDescription()
            description.type = NSInMemoryStoreType
            persistentContainer.persistentStoreDescriptions = [description]
        } else {
            // Configure for documents directory with encryption
            let storeURL = Self.storeURL()
            let description = NSPersistentStoreDescription(url: storeURL)
            description.setOption(
                FileProtectionType.complete as NSObject,
                forKey: NSPersistentStoreFileProtectionKey
            )
            description.shouldMigrateStoreAutomatically = true
            description.shouldInferMappingModelAutomatically = true
            persistentContainer.persistentStoreDescriptions = [description]
        }

        persistentContainer.loadPersistentStores { description, error in
            if let error = error {
                fatalError("Failed to load CoreData store: \(error)")
            }
            print("[CoreDataStack] Loaded store at: \(description.url?.path ?? "unknown")")
        }

        // Configure view context
        viewContext.automaticallyMergesChangesFromParent = true
        viewContext.mergePolicy = NSMergeByPropertyObjectTrumpMergePolicy
    }

    /// For testing with in-memory store
    public static func forTesting() -> CoreDataStack {
        return CoreDataStack(inMemory: true)
    }

    // MARK: - Store URL

    private static func storeURL() -> URL {
        let documentsURL = FileManager.default.urls(
            for: .documentDirectory,
            in: .userDomainMask
        ).first!
        return documentsURL.appendingPathComponent("OrionEvents.sqlite")
    }

    // MARK: - Model Creation

    private static func createManagedObjectModel() -> NSManagedObjectModel {
        let model = NSManagedObjectModel()

        // Create QueuedEvent entity
        let eventEntity = NSEntityDescription()
        eventEntity.name = "QueuedEvent"
        eventEntity.managedObjectClassName = "QueuedEvent"

        // Define attributes
        let idAttribute = NSAttributeDescription()
        idAttribute.name = "id"
        idAttribute.attributeType = .UUIDAttributeType
        idAttribute.isOptional = false

        let eventTypeAttribute = NSAttributeDescription()
        eventTypeAttribute.name = "eventType"
        eventTypeAttribute.attributeType = .stringAttributeType
        eventTypeAttribute.isOptional = false

        let payloadAttribute = NSAttributeDescription()
        payloadAttribute.name = "payload"
        payloadAttribute.attributeType = .binaryDataAttributeType
        payloadAttribute.isOptional = false

        let timestampAttribute = NSAttributeDescription()
        timestampAttribute.name = "timestamp"
        timestampAttribute.attributeType = .dateAttributeType
        timestampAttribute.isOptional = false

        let processedAttribute = NSAttributeDescription()
        processedAttribute.name = "processed"
        processedAttribute.attributeType = .booleanAttributeType
        processedAttribute.isOptional = false
        processedAttribute.defaultValue = false

        let createdAtAttribute = NSAttributeDescription()
        createdAtAttribute.name = "createdAt"
        createdAtAttribute.attributeType = .dateAttributeType
        createdAtAttribute.isOptional = false

        let sourceAppAttribute = NSAttributeDescription()
        sourceAppAttribute.name = "sourceApp"
        sourceAppAttribute.attributeType = .stringAttributeType
        sourceAppAttribute.isOptional = false

        let privacyScopeAttribute = NSAttributeDescription()
        privacyScopeAttribute.name = "privacyScope"
        privacyScopeAttribute.attributeType = .stringAttributeType
        privacyScopeAttribute.isOptional = false

        let consentVersionAttribute = NSAttributeDescription()
        consentVersionAttribute.name = "consentVersion"
        consentVersionAttribute.attributeType = .stringAttributeType
        consentVersionAttribute.isOptional = false

        let idempotencyKeyAttribute = NSAttributeDescription()
        idempotencyKeyAttribute.name = "idempotencyKey"
        idempotencyKeyAttribute.attributeType = .stringAttributeType
        idempotencyKeyAttribute.isOptional = false

        let retryCountAttribute = NSAttributeDescription()
        retryCountAttribute.name = "retryCount"
        retryCountAttribute.attributeType = .integer16AttributeType
        retryCountAttribute.isOptional = false
        retryCountAttribute.defaultValue = 0

        let lastErrorAttribute = NSAttributeDescription()
        lastErrorAttribute.name = "lastError"
        lastErrorAttribute.attributeType = .stringAttributeType
        lastErrorAttribute.isOptional = true

        let nextRetryTimeAttribute = NSAttributeDescription()
        nextRetryTimeAttribute.name = "nextRetryTime"
        nextRetryTimeAttribute.attributeType = .dateAttributeType
        nextRetryTimeAttribute.isOptional = true

        eventEntity.properties = [
            idAttribute,
            eventTypeAttribute,
            payloadAttribute,
            timestampAttribute,
            processedAttribute,
            createdAtAttribute,
            sourceAppAttribute,
            privacyScopeAttribute,
            consentVersionAttribute,
            idempotencyKeyAttribute,
            retryCountAttribute,
            lastErrorAttribute,
            nextRetryTimeAttribute
        ]

        // Create ProcessedKey entity for deduplication
        let processedKeyEntity = NSEntityDescription()
        processedKeyEntity.name = "ProcessedKey"
        processedKeyEntity.managedObjectClassName = "ProcessedKey"

        let keyAttribute = NSAttributeDescription()
        keyAttribute.name = "key"
        keyAttribute.attributeType = .stringAttributeType
        keyAttribute.isOptional = false

        let processedAtAttribute = NSAttributeDescription()
        processedAtAttribute.name = "processedAt"
        processedAtAttribute.attributeType = .dateAttributeType
        processedAtAttribute.isOptional = false

        processedKeyEntity.properties = [keyAttribute, processedAtAttribute]

        model.entities = [eventEntity, processedKeyEntity]
        return model
    }

    // MARK: - Save Context

    public func saveContext() {
        let context = viewContext
        if context.hasChanges {
            do {
                try context.save()
            } catch {
                print("[CoreDataStack] Failed to save context: \(error)")
            }
        }
    }

    public func saveBackgroundContext(_ context: NSManagedObjectContext) {
        if context.hasChanges {
            do {
                try context.save()
            } catch {
                print("[CoreDataStack] Failed to save background context: \(error)")
            }
        }
    }
}

// MARK: - QueuedEvent Managed Object

@objc(QueuedEvent)
public class QueuedEvent: NSManagedObject {
    @NSManaged public var id: UUID
    @NSManaged public var eventType: String
    @NSManaged public var payload: Data
    @NSManaged public var timestamp: Date
    @NSManaged public var processed: Bool
    @NSManaged public var createdAt: Date
    @NSManaged public var sourceApp: String
    @NSManaged public var privacyScope: String
    @NSManaged public var consentVersion: String
    @NSManaged public var idempotencyKey: String
    @NSManaged public var retryCount: Int16
    @NSManaged public var lastError: String?
    @NSManaged public var nextRetryTime: Date?
}

extension QueuedEvent {
    @nonobjc public class func fetchRequest() -> NSFetchRequest<QueuedEvent> {
        return NSFetchRequest<QueuedEvent>(entityName: "QueuedEvent")
    }
}

// MARK: - ProcessedKey Managed Object

@objc(ProcessedKey)
public class ProcessedKey: NSManagedObject {
    @NSManaged public var key: String
    @NSManaged public var processedAt: Date
}

extension ProcessedKey {
    @nonobjc public class func fetchRequest() -> NSFetchRequest<ProcessedKey> {
        return NSFetchRequest<ProcessedKey>(entityName: "ProcessedKey")
    }
}

// MARK: - Local Event Queue (CoreData-based)

/// Actor for thread-safe event queue operations
public actor LocalEventQueue {
    // MARK: - Properties

    private let coreDataStack: CoreDataStack
    private let maxRetries: Int = 5
    private let maxQueueSize: Int = 1000

    // MARK: - Initialization

    public init(coreDataStack: CoreDataStack = .shared) {
        self.coreDataStack = coreDataStack
    }

    // MARK: - Event Storage

    /// Store a new event in the queue (append-only)
    public func store(_ event: QueuedEventData) async throws {
        let context = coreDataStack.newBackgroundContext()

        try await context.perform {
            // Check for duplicate idempotency key
            let keyRequest = ProcessedKey.fetchRequest()
            keyRequest.predicate = NSPredicate(format: "key == %@", event.idempotencyKey)
            keyRequest.fetchLimit = 1

            if let _ = try? context.fetch(keyRequest).first {
                // Already processed, skip
                return
            }

            // Check if already in queue
            let queueRequest = QueuedEvent.fetchRequest()
            queueRequest.predicate = NSPredicate(format: "idempotencyKey == %@", event.idempotencyKey)
            queueRequest.fetchLimit = 1

            if let _ = try? context.fetch(queueRequest).first {
                // Already queued, skip
                return
            }

            // Create new event
            let queuedEvent = QueuedEvent(context: context)
            queuedEvent.id = event.id
            queuedEvent.eventType = event.eventType
            queuedEvent.payload = event.payload
            queuedEvent.timestamp = event.timestamp
            queuedEvent.processed = false
            queuedEvent.createdAt = Date()
            queuedEvent.sourceApp = event.sourceApp
            queuedEvent.privacyScope = event.privacyScope
            queuedEvent.consentVersion = event.consentVersion
            queuedEvent.idempotencyKey = event.idempotencyKey
            queuedEvent.retryCount = 0
            queuedEvent.lastError = nil
            queuedEvent.nextRetryTime = nil

            try context.save()
        }

        // Trim queue if needed
        await trimQueue()
    }

    /// Store multiple events in a batch
    public func storeBatch(_ events: [QueuedEventData]) async throws {
        let context = coreDataStack.newBackgroundContext()

        try await context.perform {
            for event in events {
                // Check for duplicate
                let keyRequest = ProcessedKey.fetchRequest()
                keyRequest.predicate = NSPredicate(format: "key == %@", event.idempotencyKey)
                keyRequest.fetchLimit = 1

                if (try? context.fetch(keyRequest).first) != nil {
                    continue
                }

                let queueRequest = QueuedEvent.fetchRequest()
                queueRequest.predicate = NSPredicate(format: "idempotencyKey == %@", event.idempotencyKey)
                queueRequest.fetchLimit = 1

                if (try? context.fetch(queueRequest).first) != nil {
                    continue
                }

                let queuedEvent = QueuedEvent(context: context)
                queuedEvent.id = event.id
                queuedEvent.eventType = event.eventType
                queuedEvent.payload = event.payload
                queuedEvent.timestamp = event.timestamp
                queuedEvent.processed = false
                queuedEvent.createdAt = Date()
                queuedEvent.sourceApp = event.sourceApp
                queuedEvent.privacyScope = event.privacyScope
                queuedEvent.consentVersion = event.consentVersion
                queuedEvent.idempotencyKey = event.idempotencyKey
                queuedEvent.retryCount = 0
            }

            try context.save()
        }

        await trimQueue()
    }

    // MARK: - Query Helpers

    /// Get pending (unprocessed) events ready for upload
    public func getPendingEvents(limit: Int = 50) async throws -> [QueuedEventData] {
        let context = coreDataStack.newBackgroundContext()

        return try await context.perform {
            let request = QueuedEvent.fetchRequest()
            request.predicate = NSPredicate(
                format: "processed == NO AND (nextRetryTime == nil OR nextRetryTime <= %@)",
                Date() as NSDate
            )
            request.sortDescriptors = [NSSortDescriptor(key: "timestamp", ascending: true)]
            request.fetchLimit = limit

            let results = try context.fetch(request)

            return results.map { event in
                QueuedEventData(
                    id: event.id,
                    eventType: event.eventType,
                    payload: event.payload,
                    timestamp: event.timestamp,
                    sourceApp: event.sourceApp,
                    privacyScope: event.privacyScope,
                    consentVersion: event.consentVersion,
                    idempotencyKey: event.idempotencyKey,
                    retryCount: Int(event.retryCount)
                )
            }
        }
    }

    /// Get count of pending events
    public func getPendingCount() async -> Int {
        let context = coreDataStack.newBackgroundContext()

        return await context.perform {
            let request = QueuedEvent.fetchRequest()
            request.predicate = NSPredicate(format: "processed == NO")

            return (try? context.count(for: request)) ?? 0
        }
    }

    /// Get total count of all events
    public func getTotalCount() async -> Int {
        let context = coreDataStack.newBackgroundContext()

        return await context.perform {
            let request = QueuedEvent.fetchRequest()
            return (try? context.count(for: request)) ?? 0
        }
    }

    // MARK: - Event Processing

    /// Mark an event as processed
    public func markAsProcessed(_ id: UUID) async throws {
        let context = coreDataStack.newBackgroundContext()

        try await context.perform {
            let request = QueuedEvent.fetchRequest()
            request.predicate = NSPredicate(format: "id == %@", id as CVarArg)
            request.fetchLimit = 1

            guard let event = try context.fetch(request).first else {
                return
            }

            // Add to processed keys
            let processedKey = ProcessedKey(context: context)
            processedKey.key = event.idempotencyKey
            processedKey.processedAt = Date()

            // Mark as processed
            event.processed = true

            try context.save()
        }
    }

    /// Mark multiple events as processed
    public func markBatchAsProcessed(_ ids: [UUID]) async throws {
        let context = coreDataStack.newBackgroundContext()

        try await context.perform {
            let request = QueuedEvent.fetchRequest()
            request.predicate = NSPredicate(format: "id IN %@", ids)

            let events = try context.fetch(request)

            for event in events {
                let processedKey = ProcessedKey(context: context)
                processedKey.key = event.idempotencyKey
                processedKey.processedAt = Date()

                event.processed = true
            }

            try context.save()
        }
    }

    /// Record a retry failure
    public func recordRetryFailure(_ id: UUID, error: String) async throws {
        let context = coreDataStack.newBackgroundContext()

        try await context.perform {
            let request = QueuedEvent.fetchRequest()
            request.predicate = NSPredicate(format: "id == %@", id as CVarArg)
            request.fetchLimit = 1

            guard let event = try context.fetch(request).first else {
                return
            }

            event.retryCount += 1
            event.lastError = error
            event.nextRetryTime = self.calculateNextRetryTime(retryCount: Int(event.retryCount))

            try context.save()
        }
    }

    // MARK: - Batch Deletion

    /// Delete all processed events
    public func deleteProcessedEvents() async throws {
        let context = coreDataStack.newBackgroundContext()

        try await context.perform {
            let request = NSFetchRequest<NSFetchRequestResult>(entityName: "QueuedEvent")
            request.predicate = NSPredicate(format: "processed == YES")

            let deleteRequest = NSBatchDeleteRequest(fetchRequest: request)
            deleteRequest.resultType = .resultTypeCount

            let result = try context.execute(deleteRequest) as? NSBatchDeleteResult
            print("[LocalEventQueue] Deleted \(result?.result ?? 0) processed events")
        }
    }

    /// Delete events older than specified days
    public func deleteOldEvents(olderThanDays days: Int) async throws {
        let cutoffDate = Date().addingTimeInterval(-Double(days * 24 * 60 * 60))
        let context = coreDataStack.newBackgroundContext()

        try await context.perform {
            let request = NSFetchRequest<NSFetchRequestResult>(entityName: "QueuedEvent")
            request.predicate = NSPredicate(
                format: "timestamp < %@ AND processed == YES",
                cutoffDate as NSDate
            )

            let deleteRequest = NSBatchDeleteRequest(fetchRequest: request)
            try context.execute(deleteRequest)
        }

        // Also clean old processed keys
        try await cleanOldProcessedKeys(olderThan: cutoffDate)
    }

    /// Delete failed events that exceeded max retries
    public func deleteFailedEvents() async throws {
        let context = coreDataStack.newBackgroundContext()

        try await context.perform {
            let request = NSFetchRequest<NSFetchRequestResult>(entityName: "QueuedEvent")
            request.predicate = NSPredicate(format: "retryCount >= %d", self.maxRetries)

            let deleteRequest = NSBatchDeleteRequest(fetchRequest: request)
            try context.execute(deleteRequest)
        }
    }

    /// Clear all events
    public func clearAll() async throws {
        let context = coreDataStack.newBackgroundContext()

        try await context.perform {
            let eventRequest = NSFetchRequest<NSFetchRequestResult>(entityName: "QueuedEvent")
            let eventDeleteRequest = NSBatchDeleteRequest(fetchRequest: eventRequest)
            try context.execute(eventDeleteRequest)

            let keyRequest = NSFetchRequest<NSFetchRequestResult>(entityName: "ProcessedKey")
            let keyDeleteRequest = NSBatchDeleteRequest(fetchRequest: keyRequest)
            try context.execute(keyDeleteRequest)
        }
    }

    // MARK: - Private Helpers

    private func calculateNextRetryTime(retryCount: Int) -> Date {
        let backoffSeconds = min(300.0, pow(2.0, Double(retryCount)))
        return Date(timeIntervalSinceNow: backoffSeconds)
    }

    private func trimQueue() async {
        let count = await getTotalCount()
        guard count > maxQueueSize else { return }

        let context = coreDataStack.newBackgroundContext()

        await context.perform {
            // Delete oldest processed events first
            let request = QueuedEvent.fetchRequest()
            request.predicate = NSPredicate(format: "processed == YES")
            request.sortDescriptors = [NSSortDescriptor(key: "timestamp", ascending: true)]
            request.fetchLimit = count - self.maxQueueSize

            if let eventsToDelete = try? context.fetch(request) {
                for event in eventsToDelete {
                    context.delete(event)
                }
                try? context.save()
            }
        }
    }

    private func cleanOldProcessedKeys(olderThan date: Date) async throws {
        let context = coreDataStack.newBackgroundContext()

        try await context.perform {
            let request = NSFetchRequest<NSFetchRequestResult>(entityName: "ProcessedKey")
            request.predicate = NSPredicate(format: "processedAt < %@", date as NSDate)

            let deleteRequest = NSBatchDeleteRequest(fetchRequest: request)
            try context.execute(deleteRequest)
        }
    }
}

// MARK: - Queued Event Data Transfer Object

/// Data transfer object for queued events
public struct QueuedEventData: Sendable {
    public let id: UUID
    public let eventType: String
    public let payload: Data
    public let timestamp: Date
    public let sourceApp: String
    public let privacyScope: String
    public let consentVersion: String
    public let idempotencyKey: String
    public let retryCount: Int

    public init(
        id: UUID = UUID(),
        eventType: String,
        payload: Data,
        timestamp: Date = Date(),
        sourceApp: String,
        privacyScope: String,
        consentVersion: String,
        idempotencyKey: String? = nil,
        retryCount: Int = 0
    ) {
        self.id = id
        self.eventType = eventType
        self.payload = payload
        self.timestamp = timestamp
        self.sourceApp = sourceApp
        self.privacyScope = privacyScope
        self.consentVersion = consentVersion
        self.idempotencyKey = idempotencyKey ?? "\(id.uuidString)_\(Int(timestamp.timeIntervalSince1970 * 1000))"
        self.retryCount = retryCount
    }
}
