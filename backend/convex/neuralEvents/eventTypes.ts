/**
 * Neural Events - Central Event Type Registry
 *
 * This module defines all event types that can be captured by the Orion Browser
 * Neural Intelligence Platform across multiple source applications and modalities.
 */

// Source applications that generate neural events
export const SourceApps = [
  "browser",
  "social",
  "tasks",
  "calendar",
  "fitness",
  "dating",
  "sleep",
  "email",
  "workouts",
  "location",
  "device",
  "media",
  "analytics",
  "health",
  "communication",
] as const;

export type SourceApp = (typeof SourceApps)[number];

// Privacy scopes for data collection consent
export const PrivacyScopes = [
  "essential",      // Required for core functionality
  "functional",     // Enhances user experience
  "analytics",      // Usage analytics and insights
  "personalization", // AI personalization features
  "biometric",      // Biometric data (health, voice, etc.)
  "location",       // Location tracking
  "media",          // Audio/video/screenshot capture
  "social",         // Social interactions
  "behavioral",     // Behavioral patterns
] as const;

export type PrivacyScope = (typeof PrivacyScopes)[number];

// Modality flags for different data types
export interface ModalityFlags {
  text: boolean;
  audio: boolean;
  video: boolean;
  image: boolean;
  numeric: boolean;
  biometric: boolean;
  location: boolean;
  interaction: boolean;
}

// Event type definition interface
export interface EventTypeDefinition {
  id: string;
  app: SourceApp;
  eventType: string;
  displayName: string;
  description: string;
  modality: ModalityFlags;
  requiredScopes: PrivacyScope[];
  dataRetentionDays: number;
  isHighFrequency: boolean;
  vectorizable: boolean;
  sensitivityLevel: "low" | "medium" | "high" | "critical";
}

// Helper to create modality flags with defaults
const createModality = (
  overrides: Partial<ModalityFlags> = {}
): ModalityFlags => ({
  text: false,
  audio: false,
  video: false,
  image: false,
  numeric: false,
  biometric: false,
  location: false,
  interaction: false,
  ...overrides,
});

/**
 * Complete Event Types Registry
 *
 * Contains all 37+ event types across different source applications
 * organized by category for the neural intelligence platform.
 */
export const EventTypes: EventTypeDefinition[] = [
  // ============================================================
  // BROWSER EVENTS (9 types)
  // ============================================================
  {
    id: "browser.page_visit",
    app: "browser",
    eventType: "page_visit",
    displayName: "Page Visit",
    description: "Records a visit to a web page including URL, title, and metadata",
    modality: createModality({ text: true }),
    requiredScopes: ["essential", "analytics"],
    dataRetentionDays: 365,
    isHighFrequency: false,
    vectorizable: true,
    sensitivityLevel: "medium",
  },
  {
    id: "browser.scroll_depth",
    app: "browser",
    eventType: "scroll_depth",
    displayName: "Scroll Depth",
    description: "Tracks how far user scrolled on a page as percentage",
    modality: createModality({ numeric: true, interaction: true }),
    requiredScopes: ["analytics", "behavioral"],
    dataRetentionDays: 90,
    isHighFrequency: true,
    vectorizable: false,
    sensitivityLevel: "low",
  },
  {
    id: "browser.click_interaction",
    app: "browser",
    eventType: "click_interaction",
    displayName: "Click Interaction",
    description: "Records user clicks on page elements with coordinates and targets",
    modality: createModality({ interaction: true, text: true }),
    requiredScopes: ["analytics", "behavioral"],
    dataRetentionDays: 90,
    isHighFrequency: true,
    vectorizable: false,
    sensitivityLevel: "low",
  },
  {
    id: "browser.keystroke",
    app: "browser",
    eventType: "keystroke",
    displayName: "Keystroke",
    description: "Captures keystroke patterns for behavioral analysis (not actual keys)",
    modality: createModality({ interaction: true, biometric: true }),
    requiredScopes: ["behavioral", "biometric"],
    dataRetentionDays: 30,
    isHighFrequency: true,
    vectorizable: false,
    sensitivityLevel: "high",
  },
  {
    id: "browser.eye_tracking",
    app: "browser",
    eventType: "eye_tracking",
    displayName: "Eye Tracking",
    description: "Records eye gaze positions and focus areas on screen",
    modality: createModality({ biometric: true, numeric: true }),
    requiredScopes: ["biometric", "behavioral"],
    dataRetentionDays: 30,
    isHighFrequency: true,
    vectorizable: false,
    sensitivityLevel: "critical",
  },
  {
    id: "browser.form_interaction",
    app: "browser",
    eventType: "form_interaction",
    displayName: "Form Interaction",
    description: "Tracks interactions with form fields (not content)",
    modality: createModality({ interaction: true }),
    requiredScopes: ["analytics", "behavioral"],
    dataRetentionDays: 90,
    isHighFrequency: false,
    vectorizable: false,
    sensitivityLevel: "medium",
  },
  {
    id: "browser.search_query",
    app: "browser",
    eventType: "search_query",
    displayName: "Search Query",
    description: "Records search queries across search engines",
    modality: createModality({ text: true }),
    requiredScopes: ["analytics", "personalization"],
    dataRetentionDays: 365,
    isHighFrequency: false,
    vectorizable: true,
    sensitivityLevel: "medium",
  },
  {
    id: "browser.tab_activity",
    app: "browser",
    eventType: "tab_activity",
    displayName: "Tab Activity",
    description: "Records tab opens, closes, and switches",
    modality: createModality({ interaction: true }),
    requiredScopes: ["analytics"],
    dataRetentionDays: 90,
    isHighFrequency: false,
    vectorizable: false,
    sensitivityLevel: "low",
  },
  {
    id: "browser.download",
    app: "browser",
    eventType: "download",
    displayName: "Download",
    description: "Tracks file downloads with type and source",
    modality: createModality({ text: true }),
    requiredScopes: ["analytics"],
    dataRetentionDays: 365,
    isHighFrequency: false,
    vectorizable: true,
    sensitivityLevel: "medium",
  },

  // ============================================================
  // SOCIAL/COMMUNICATION EVENTS (5 types)
  // ============================================================
  {
    id: "social.message_sent",
    app: "social",
    eventType: "message_sent",
    displayName: "Message Sent",
    description: "Records outgoing messages across platforms",
    modality: createModality({ text: true }),
    requiredScopes: ["social", "analytics"],
    dataRetentionDays: 365,
    isHighFrequency: false,
    vectorizable: true,
    sensitivityLevel: "high",
  },
  {
    id: "social.media_shared",
    app: "social",
    eventType: "media_shared",
    displayName: "Media Shared",
    description: "Tracks media content shared on social platforms",
    modality: createModality({ image: true, video: true }),
    requiredScopes: ["social", "media"],
    dataRetentionDays: 365,
    isHighFrequency: false,
    vectorizable: true,
    sensitivityLevel: "high",
  },
  {
    id: "social.reaction",
    app: "social",
    eventType: "reaction",
    displayName: "Reaction",
    description: "Records likes, emojis, and other reactions",
    modality: createModality({ interaction: true, text: true }),
    requiredScopes: ["social", "behavioral"],
    dataRetentionDays: 180,
    isHighFrequency: false,
    vectorizable: false,
    sensitivityLevel: "medium",
  },
  {
    id: "social.contact_audio_sample",
    app: "social",
    eventType: "contact_audio_sample",
    displayName: "Contact Audio Sample",
    description: "Voice sample from a contact for voice recognition",
    modality: createModality({ audio: true, biometric: true }),
    requiredScopes: ["biometric", "social", "media"],
    dataRetentionDays: 365,
    isHighFrequency: false,
    vectorizable: true,
    sensitivityLevel: "critical",
  },
  {
    id: "communication.call_log",
    app: "communication",
    eventType: "call_log",
    displayName: "Call Log",
    description: "Records phone and video call metadata",
    modality: createModality({ numeric: true, text: true }),
    requiredScopes: ["social", "analytics"],
    dataRetentionDays: 365,
    isHighFrequency: false,
    vectorizable: false,
    sensitivityLevel: "high",
  },

  // ============================================================
  // HEALTH & FITNESS EVENTS (6 types)
  // ============================================================
  {
    id: "sleep.sleep_record",
    app: "sleep",
    eventType: "sleep_record",
    displayName: "Sleep Record",
    description: "Records sleep duration, quality, and stages",
    modality: createModality({ numeric: true, biometric: true }),
    requiredScopes: ["biometric", "analytics"],
    dataRetentionDays: 730,
    isHighFrequency: false,
    vectorizable: false,
    sensitivityLevel: "high",
  },
  {
    id: "fitness.exercise_completed",
    app: "fitness",
    eventType: "exercise_completed",
    displayName: "Exercise Completed",
    description: "Records completed workout sessions with metrics",
    modality: createModality({ numeric: true, biometric: true }),
    requiredScopes: ["biometric", "analytics"],
    dataRetentionDays: 730,
    isHighFrequency: false,
    vectorizable: true,
    sensitivityLevel: "medium",
  },
  {
    id: "health.heart_rate_sample",
    app: "health",
    eventType: "heart_rate_sample",
    displayName: "Heart Rate Sample",
    description: "Real-time heart rate measurements",
    modality: createModality({ numeric: true, biometric: true }),
    requiredScopes: ["biometric"],
    dataRetentionDays: 730,
    isHighFrequency: true,
    vectorizable: false,
    sensitivityLevel: "critical",
  },
  {
    id: "workouts.workout_plan",
    app: "workouts",
    eventType: "workout_plan",
    displayName: "Workout Plan",
    description: "Tracks planned workout routines",
    modality: createModality({ text: true, numeric: true }),
    requiredScopes: ["personalization", "analytics"],
    dataRetentionDays: 365,
    isHighFrequency: false,
    vectorizable: true,
    sensitivityLevel: "low",
  },
  {
    id: "health.blood_oxygen",
    app: "health",
    eventType: "blood_oxygen",
    displayName: "Blood Oxygen",
    description: "SpO2 measurements from wearables",
    modality: createModality({ numeric: true, biometric: true }),
    requiredScopes: ["biometric"],
    dataRetentionDays: 730,
    isHighFrequency: false,
    vectorizable: false,
    sensitivityLevel: "critical",
  },
  {
    id: "health.stress_level",
    app: "health",
    eventType: "stress_level",
    displayName: "Stress Level",
    description: "Calculated stress levels from biometric signals",
    modality: createModality({ numeric: true, biometric: true }),
    requiredScopes: ["biometric", "analytics"],
    dataRetentionDays: 365,
    isHighFrequency: false,
    vectorizable: false,
    sensitivityLevel: "high",
  },

  // ============================================================
  // PRODUCTIVITY EVENTS (4 types)
  // ============================================================
  {
    id: "tasks.task_created",
    app: "tasks",
    eventType: "task_created",
    displayName: "Task Created",
    description: "Records new task creation with details",
    modality: createModality({ text: true }),
    requiredScopes: ["analytics", "personalization"],
    dataRetentionDays: 365,
    isHighFrequency: false,
    vectorizable: true,
    sensitivityLevel: "low",
  },
  {
    id: "tasks.task_completed",
    app: "tasks",
    eventType: "task_completed",
    displayName: "Task Completed",
    description: "Records task completion with timing metrics",
    modality: createModality({ text: true, numeric: true }),
    requiredScopes: ["analytics", "personalization"],
    dataRetentionDays: 365,
    isHighFrequency: false,
    vectorizable: true,
    sensitivityLevel: "low",
  },
  {
    id: "calendar.calendar_event",
    app: "calendar",
    eventType: "calendar_event",
    displayName: "Calendar Event",
    description: "Synced calendar events and appointments",
    modality: createModality({ text: true }),
    requiredScopes: ["personalization", "analytics"],
    dataRetentionDays: 365,
    isHighFrequency: false,
    vectorizable: true,
    sensitivityLevel: "medium",
  },
  {
    id: "email.email_interaction",
    app: "email",
    eventType: "email_interaction",
    displayName: "Email Interaction",
    description: "Tracks email opens, reads, and responses",
    modality: createModality({ text: true, interaction: true }),
    requiredScopes: ["analytics", "personalization"],
    dataRetentionDays: 365,
    isHighFrequency: false,
    vectorizable: true,
    sensitivityLevel: "high",
  },

  // ============================================================
  // LOCATION & MOTION EVENTS (4 types)
  // ============================================================
  {
    id: "location.location_update",
    app: "location",
    eventType: "location_update",
    displayName: "Location Update",
    description: "GPS coordinates with accuracy and altitude",
    modality: createModality({ location: true, numeric: true }),
    requiredScopes: ["location"],
    dataRetentionDays: 180,
    isHighFrequency: true,
    vectorizable: false,
    sensitivityLevel: "critical",
  },
  {
    id: "device.motion_steps",
    app: "device",
    eventType: "motion_steps",
    displayName: "Motion Steps",
    description: "Step count from device motion sensors",
    modality: createModality({ numeric: true }),
    requiredScopes: ["analytics"],
    dataRetentionDays: 365,
    isHighFrequency: false,
    vectorizable: false,
    sensitivityLevel: "low",
  },
  {
    id: "device.device_orientation",
    app: "device",
    eventType: "device_orientation",
    displayName: "Device Orientation",
    description: "Device accelerometer and gyroscope data",
    modality: createModality({ numeric: true }),
    requiredScopes: ["analytics", "behavioral"],
    dataRetentionDays: 30,
    isHighFrequency: true,
    vectorizable: false,
    sensitivityLevel: "low",
  },
  {
    id: "location.geofence_event",
    app: "location",
    eventType: "geofence_event",
    displayName: "Geofence Event",
    description: "Entry/exit from defined geographic zones",
    modality: createModality({ location: true }),
    requiredScopes: ["location", "personalization"],
    dataRetentionDays: 365,
    isHighFrequency: false,
    vectorizable: false,
    sensitivityLevel: "high",
  },

  // ============================================================
  // MEDIA CAPTURE EVENTS (4 types)
  // ============================================================
  {
    id: "media.screenshot",
    app: "media",
    eventType: "screenshot",
    displayName: "Screenshot",
    description: "Screen captures with optional OCR text",
    modality: createModality({ image: true, text: true }),
    requiredScopes: ["media", "analytics"],
    dataRetentionDays: 90,
    isHighFrequency: false,
    vectorizable: true,
    sensitivityLevel: "high",
  },
  {
    id: "media.audio_recording",
    app: "media",
    eventType: "audio_recording",
    displayName: "Audio Recording",
    description: "Ambient audio recordings with transcription",
    modality: createModality({ audio: true, text: true }),
    requiredScopes: ["media", "biometric"],
    dataRetentionDays: 90,
    isHighFrequency: false,
    vectorizable: true,
    sensitivityLevel: "critical",
  },
  {
    id: "media.video_recording",
    app: "media",
    eventType: "video_recording",
    displayName: "Video Recording",
    description: "Video captures with scene analysis",
    modality: createModality({ video: true, audio: true }),
    requiredScopes: ["media", "biometric"],
    dataRetentionDays: 90,
    isHighFrequency: false,
    vectorizable: true,
    sensitivityLevel: "critical",
  },
  {
    id: "media.photo_captured",
    app: "media",
    eventType: "photo_captured",
    displayName: "Photo Captured",
    description: "Camera photos with metadata and analysis",
    modality: createModality({ image: true }),
    requiredScopes: ["media"],
    dataRetentionDays: 365,
    isHighFrequency: false,
    vectorizable: true,
    sensitivityLevel: "high",
  },

  // ============================================================
  // ANALYTICS & COMPUTED SCORES (5 types)
  // ============================================================
  {
    id: "analytics.engagement_score",
    app: "analytics",
    eventType: "engagement_score",
    displayName: "Engagement Score",
    description: "Computed score for content engagement level",
    modality: createModality({ numeric: true }),
    requiredScopes: ["analytics", "personalization"],
    dataRetentionDays: 365,
    isHighFrequency: false,
    vectorizable: false,
    sensitivityLevel: "low",
  },
  {
    id: "analytics.focus_index",
    app: "analytics",
    eventType: "focus_index",
    displayName: "Focus Index",
    description: "Computed focus/attention score from multiple signals",
    modality: createModality({ numeric: true }),
    requiredScopes: ["analytics", "behavioral"],
    dataRetentionDays: 365,
    isHighFrequency: false,
    vectorizable: false,
    sensitivityLevel: "medium",
  },
  {
    id: "analytics.social_interaction_score",
    app: "analytics",
    eventType: "social_interaction_score",
    displayName: "Social Interaction Score",
    description: "Aggregated score for social activity levels",
    modality: createModality({ numeric: true }),
    requiredScopes: ["social", "analytics"],
    dataRetentionDays: 365,
    isHighFrequency: false,
    vectorizable: false,
    sensitivityLevel: "medium",
  },
  {
    id: "analytics.productivity_score",
    app: "analytics",
    eventType: "productivity_score",
    displayName: "Productivity Score",
    description: "Daily productivity metrics from tasks and focus",
    modality: createModality({ numeric: true }),
    requiredScopes: ["analytics", "personalization"],
    dataRetentionDays: 365,
    isHighFrequency: false,
    vectorizable: false,
    sensitivityLevel: "low",
  },
  {
    id: "analytics.wellness_score",
    app: "analytics",
    eventType: "wellness_score",
    displayName: "Wellness Score",
    description: "Computed wellness index from health signals",
    modality: createModality({ numeric: true, biometric: true }),
    requiredScopes: ["biometric", "analytics"],
    dataRetentionDays: 365,
    isHighFrequency: false,
    vectorizable: false,
    sensitivityLevel: "high",
  },

  // ============================================================
  // DATING APP EVENTS (3 types)
  // ============================================================
  {
    id: "dating.profile_view",
    app: "dating",
    eventType: "profile_view",
    displayName: "Profile View",
    description: "Records viewed dating profiles",
    modality: createModality({ text: true, interaction: true }),
    requiredScopes: ["social", "analytics"],
    dataRetentionDays: 180,
    isHighFrequency: false,
    vectorizable: true,
    sensitivityLevel: "high",
  },
  {
    id: "dating.match_event",
    app: "dating",
    eventType: "match_event",
    displayName: "Match Event",
    description: "Records matches and mutual interests",
    modality: createModality({ interaction: true }),
    requiredScopes: ["social"],
    dataRetentionDays: 365,
    isHighFrequency: false,
    vectorizable: false,
    sensitivityLevel: "high",
  },
  {
    id: "dating.conversation_started",
    app: "dating",
    eventType: "conversation_started",
    displayName: "Conversation Started",
    description: "Tracks new conversations initiated",
    modality: createModality({ text: true, interaction: true }),
    requiredScopes: ["social"],
    dataRetentionDays: 365,
    isHighFrequency: false,
    vectorizable: true,
    sensitivityLevel: "high",
  },
];

// Event type lookup map for efficient access
export const EventTypeMap = new Map<string, EventTypeDefinition>(
  EventTypes.map((et) => [et.id, et])
);

// Get event types by app
export const getEventTypesByApp = (app: SourceApp): EventTypeDefinition[] =>
  EventTypes.filter((et) => et.app === app);

// Get event types by scope
export const getEventTypesByScope = (scope: PrivacyScope): EventTypeDefinition[] =>
  EventTypes.filter((et) => et.requiredScopes.includes(scope));

// Get vectorizable event types
export const getVectorizableEventTypes = (): EventTypeDefinition[] =>
  EventTypes.filter((et) => et.vectorizable);

// Get high-frequency event types
export const getHighFrequencyEventTypes = (): EventTypeDefinition[] =>
  EventTypes.filter((et) => et.isHighFrequency);

// Validate event type exists
export const isValidEventType = (eventTypeId: string): boolean =>
  EventTypeMap.has(eventTypeId);

// Get event type definition
export const getEventTypeDefinition = (
  eventTypeId: string
): EventTypeDefinition | undefined => EventTypeMap.get(eventTypeId);

// Total event types count
export const EVENT_TYPES_COUNT = EventTypes.length;
