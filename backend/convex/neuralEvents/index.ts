/**
 * Neural Events Module Index
 *
 * Re-exports all neural events functionality for convenient imports.
 */

// Event type definitions and registry
export {
  SourceApps,
  SourceApp,
  PrivacyScopes,
  PrivacyScope,
  ModalityFlags,
  EventTypeDefinition,
  EventTypes,
  EventTypeMap,
  getEventTypesByApp,
  getEventTypesByScope,
  getVectorizableEventTypes,
  getHighFrequencyEventTypes,
  isValidEventType,
  getEventTypeDefinition,
  EVENT_TYPES_COUNT,
} from "./eventTypes";

// Ingestion mutations
export {
  ingestEvent,
  ingestBatch,
  startSession,
  endSession,
  markEventsProcessed,
  softDeleteEvents,
  attachMediaToEvent,
} from "./ingest";

// Query functions
export {
  getEventsByUser,
  getEventsByType,
  getEventsByTimeRange,
  getEventsByApp,
  getEventsBySession,
  getEventById,
  getEventWithMedia,
  getUserEventStats,
  getRecentActivity,
  getUnprocessedEvents,
  getEventsForDeletion,
  searchEvents,
  getUserDataExport,
} from "./query";
