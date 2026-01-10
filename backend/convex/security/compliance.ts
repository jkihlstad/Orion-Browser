/**
 * Privacy Nutrition Label Data for Orion Browser
 *
 * Implements Apple's App Privacy ("nutrition label") requirements
 * and provides compliance utilities for:
 * - GDPR (EU)
 * - CCPA (California)
 * - COPPA (Children's privacy)
 * - App Store privacy labels
 *
 * @module security/compliance
 */

// ============================================================================
// Apple Privacy Label Types
// ============================================================================

/**
 * Data types collected (Apple Privacy Label categories)
 */
export type AppleDataType =
  // Contact Info
  | "name"
  | "email_address"
  | "phone_number"
  | "physical_address"
  | "other_contact_info"
  // Health & Fitness
  | "health"
  | "fitness"
  // Financial Info
  | "payment_info"
  | "credit_info"
  | "other_financial_info"
  // Location
  | "precise_location"
  | "coarse_location"
  // Sensitive Info
  | "sensitive_info"
  // Contacts
  | "contacts"
  // User Content
  | "emails_or_text_messages"
  | "photos_or_videos"
  | "audio_data"
  | "gameplay_content"
  | "customer_support"
  | "other_user_content"
  // Browsing History
  | "browsing_history"
  // Search History
  | "search_history"
  // Identifiers
  | "user_id"
  | "device_id"
  // Purchases
  | "purchase_history"
  // Usage Data
  | "product_interaction"
  | "advertising_data"
  | "other_usage_data"
  // Diagnostics
  | "crash_data"
  | "performance_data"
  | "other_diagnostic_data";

/**
 * Data usage purposes (Apple Privacy Label)
 */
export type DataUsagePurpose =
  | "third_party_advertising"
  | "developer_advertising"
  | "analytics"
  | "product_personalization"
  | "app_functionality"
  | "other_purposes";

/**
 * Data linkage status
 */
export type DataLinkage = "linked" | "not_linked";

/**
 * Data tracking status
 */
export type DataTracking = "tracking" | "not_tracking";

/**
 * Privacy label data item
 */
export interface PrivacyLabelItem {
  /** Data type */
  dataType: AppleDataType;
  /** Is collected */
  collected: boolean;
  /** Collection is optional */
  optional: boolean;
  /** Linkage to user identity */
  linkage: DataLinkage;
  /** Used for tracking */
  tracking: DataTracking;
  /** Purposes for collection */
  purposes: DataUsagePurpose[];
  /** Description of collection */
  description: string;
  /** Required consent level */
  requiredConsentLevel: number;
}

/**
 * Complete privacy nutrition label
 */
export interface PrivacyNutritionLabel {
  /** App identifier */
  appId: string;
  /** Version of this label */
  version: string;
  /** Last updated */
  lastUpdated: number;
  /** Data collected */
  dataCollected: PrivacyLabelItem[];
  /** Data not collected (for transparency) */
  dataNotCollected: AppleDataType[];
  /** Privacy policy URL */
  privacyPolicyUrl: string;
  /** Support URL */
  supportUrl: string;
}

// ============================================================================
// Orion Browser Privacy Label
// ============================================================================

/**
 * Complete privacy label for Orion Browser
 */
export const ORION_PRIVACY_LABEL: PrivacyNutritionLabel = {
  appId: "com.orion.browser",
  version: "1.0.0",
  lastUpdated: Date.now(),
  privacyPolicyUrl: "https://orion.browser/privacy",
  supportUrl: "https://orion.browser/support",

  dataCollected: [
    // User ID
    {
      dataType: "user_id",
      collected: true,
      optional: false,
      linkage: "linked",
      tracking: "not_tracking",
      purposes: ["app_functionality"],
      description: "Anonymous user identifier for account functionality",
      requiredConsentLevel: 0,
    },

    // Email (for auth)
    {
      dataType: "email_address",
      collected: true,
      optional: false,
      linkage: "linked",
      tracking: "not_tracking",
      purposes: ["app_functionality"],
      description: "Email address for authentication and account recovery",
      requiredConsentLevel: 0,
    },

    // Device ID
    {
      dataType: "device_id",
      collected: true,
      optional: false,
      linkage: "linked",
      tracking: "not_tracking",
      purposes: ["app_functionality"],
      description: "Device identifier for multi-device sync",
      requiredConsentLevel: 1,
    },

    // Browsing History
    {
      dataType: "browsing_history",
      collected: true,
      optional: true,
      linkage: "linked",
      tracking: "not_tracking",
      purposes: ["product_personalization", "app_functionality"],
      description: "Browsing history for personalization (hashed URLs)",
      requiredConsentLevel: 2,
    },

    // Search History
    {
      dataType: "search_history",
      collected: true,
      optional: true,
      linkage: "linked",
      tracking: "not_tracking",
      purposes: ["product_personalization", "app_functionality"],
      description: "Search queries for improved suggestions",
      requiredConsentLevel: 2,
    },

    // Product Interaction
    {
      dataType: "product_interaction",
      collected: true,
      optional: true,
      linkage: "linked",
      tracking: "not_tracking",
      purposes: ["analytics", "product_personalization"],
      description: "App usage patterns for improvement",
      requiredConsentLevel: 2,
    },

    // Audio Data (Voice)
    {
      dataType: "audio_data",
      collected: true,
      optional: true,
      linkage: "not_linked",
      tracking: "not_tracking",
      purposes: ["app_functionality"],
      description: "Voice commands processed locally, not stored",
      requiredConsentLevel: 3,
    },

    // Crash Data
    {
      dataType: "crash_data",
      collected: true,
      optional: true,
      linkage: "not_linked",
      tracking: "not_tracking",
      purposes: ["analytics"],
      description: "Crash reports for stability improvement",
      requiredConsentLevel: 2,
    },

    // Performance Data
    {
      dataType: "performance_data",
      collected: true,
      optional: true,
      linkage: "not_linked",
      tracking: "not_tracking",
      purposes: ["analytics"],
      description: "Performance metrics for optimization",
      requiredConsentLevel: 2,
    },
  ],

  dataNotCollected: [
    "name",
    "phone_number",
    "physical_address",
    "other_contact_info",
    "health",
    "fitness",
    "payment_info",
    "credit_info",
    "other_financial_info",
    "precise_location",
    "coarse_location",
    "sensitive_info",
    "contacts",
    "emails_or_text_messages",
    "photos_or_videos",
    "gameplay_content",
    "customer_support",
    "purchase_history",
    "advertising_data",
  ],
};

// ============================================================================
// GDPR Compliance
// ============================================================================

/**
 * GDPR lawful basis for processing
 */
export type GDPRLawfulBasis =
  | "consent"
  | "contract"
  | "legal_obligation"
  | "vital_interests"
  | "public_task"
  | "legitimate_interests";

/**
 * GDPR data subject rights
 */
export type GDPRRight =
  | "access"
  | "rectification"
  | "erasure"
  | "restrict_processing"
  | "data_portability"
  | "object"
  | "automated_decision_making";

/**
 * GDPR compliance record
 */
export interface GDPRComplianceRecord {
  /** Data processing activity */
  activity: string;
  /** Lawful basis */
  lawfulBasis: GDPRLawfulBasis;
  /** Data categories processed */
  dataCategories: AppleDataType[];
  /** Purpose of processing */
  purposes: string[];
  /** Data retention period (days) */
  retentionPeriod: number;
  /** Third parties data is shared with */
  thirdParties: string[];
  /** Security measures */
  securityMeasures: string[];
  /** Rights applicable */
  applicableRights: GDPRRight[];
}

/**
 * GDPR compliance configuration for Orion
 */
export const GDPR_COMPLIANCE: GDPRComplianceRecord[] = [
  {
    activity: "User Authentication",
    lawfulBasis: "contract",
    dataCategories: ["user_id", "email_address", "device_id"],
    purposes: ["Provide account access and sync functionality"],
    retentionPeriod: -1, // Until account deletion
    thirdParties: ["Clerk (authentication provider)"],
    securityMeasures: [
      "End-to-end encryption",
      "Secure token storage",
      "Rate limiting",
    ],
    applicableRights: [
      "access",
      "rectification",
      "erasure",
      "data_portability",
    ],
  },
  {
    activity: "Browsing History Sync",
    lawfulBasis: "consent",
    dataCategories: ["browsing_history", "search_history"],
    purposes: ["Sync browsing data across devices", "Personalization"],
    retentionPeriod: 90,
    thirdParties: ["Convex (database provider)"],
    securityMeasures: [
      "URL hashing",
      "End-to-end encryption",
      "User-controlled retention",
    ],
    applicableRights: [
      "access",
      "rectification",
      "erasure",
      "restrict_processing",
      "data_portability",
      "object",
    ],
  },
  {
    activity: "AI Personalization",
    lawfulBasis: "consent",
    dataCategories: ["browsing_history", "search_history", "product_interaction"],
    purposes: ["Provide AI-powered suggestions and assistance"],
    retentionPeriod: 30,
    thirdParties: ["OpenAI (AI processing)"],
    securityMeasures: [
      "Data anonymization",
      "Minimal data sharing",
      "No training on user data",
    ],
    applicableRights: [
      "access",
      "erasure",
      "restrict_processing",
      "object",
      "automated_decision_making",
    ],
  },
  {
    activity: "Analytics and Improvement",
    lawfulBasis: "consent",
    dataCategories: ["product_interaction", "crash_data", "performance_data"],
    purposes: ["Improve app stability and performance"],
    retentionPeriod: 365,
    thirdParties: [],
    securityMeasures: ["Data aggregation", "Anonymization", "No PII"],
    applicableRights: ["access", "erasure", "object"],
  },
];

// ============================================================================
// CCPA Compliance
// ============================================================================

/**
 * CCPA consumer rights
 */
export type CCPARight =
  | "know"
  | "delete"
  | "opt_out"
  | "non_discrimination"
  | "correct"
  | "limit_use";

/**
 * CCPA data sale status
 */
export type CCPADataSaleStatus = "not_sold" | "sold" | "shared";

/**
 * CCPA compliance notice
 */
export interface CCPAComplianceNotice {
  /** Do Not Sell link */
  doNotSellUrl: string;
  /** Privacy policy URL */
  privacyPolicyUrl: string;
  /** Data categories collected */
  dataCategories: AppleDataType[];
  /** Business purposes */
  businessPurposes: string[];
  /** Data sale status */
  saleStatus: CCPADataSaleStatus;
  /** Consumer rights */
  consumerRights: CCPARight[];
  /** Contact for requests */
  contactEmail: string;
  /** Verification method */
  verificationMethod: string;
}

/**
 * CCPA compliance configuration
 */
export const CCPA_COMPLIANCE: CCPAComplianceNotice = {
  doNotSellUrl: "https://orion.browser/do-not-sell",
  privacyPolicyUrl: "https://orion.browser/privacy",
  dataCategories: [
    "user_id",
    "email_address",
    "device_id",
    "browsing_history",
    "search_history",
    "product_interaction",
  ],
  businessPurposes: [
    "Providing the browsing service",
    "Account authentication and sync",
    "Personalization of user experience",
    "Service improvement and debugging",
  ],
  saleStatus: "not_sold",
  consumerRights: [
    "know",
    "delete",
    "opt_out",
    "non_discrimination",
    "correct",
    "limit_use",
  ],
  contactEmail: "privacy@orion.browser",
  verificationMethod: "Email verification to account email address",
};

// ============================================================================
// Compliance Utilities
// ============================================================================

/**
 * Gets the privacy label item for a data type
 */
export function getPrivacyLabelItem(
  dataType: AppleDataType
): PrivacyLabelItem | undefined {
  return ORION_PRIVACY_LABEL.dataCollected.find(
    (item) => item.dataType === dataType
  );
}

/**
 * Checks if a data type is collected
 */
export function isDataTypeCollected(dataType: AppleDataType): boolean {
  return ORION_PRIVACY_LABEL.dataCollected.some(
    (item) => item.dataType === dataType && item.collected
  );
}

/**
 * Gets data types collected at a consent level
 */
export function getDataTypesForConsentLevel(
  level: number
): AppleDataType[] {
  return ORION_PRIVACY_LABEL.dataCollected
    .filter((item) => item.requiredConsentLevel <= level)
    .map((item) => item.dataType);
}

/**
 * Gets GDPR compliance record for an activity
 */
export function getGDPRComplianceForActivity(
  activity: string
): GDPRComplianceRecord | undefined {
  return GDPR_COMPLIANCE.find((record) =>
    record.activity.toLowerCase().includes(activity.toLowerCase())
  );
}

/**
 * Generates a data processing notice for a user
 */
export function generateDataProcessingNotice(
  consentLevel: number,
  locale: string = "en"
): string {
  const collectedTypes = getDataTypesForConsentLevel(consentLevel);

  // This would be internationalized in production
  const notices = {
    en: {
      intro: "We collect the following data at your current consent level:",
      purposes: "This data is used for:",
      rights: "You have the right to:",
      contact: "For questions, contact:",
    },
  };

  const t = notices[locale as keyof typeof notices] ?? notices.en;

  let notice = `${t.intro}\n`;
  notice += collectedTypes.map((type) => `- ${formatDataType(type)}`).join("\n");
  notice += `\n\n${t.purposes}\n`;

  const purposes = new Set<string>();
  ORION_PRIVACY_LABEL.dataCollected
    .filter((item) => collectedTypes.includes(item.dataType))
    .forEach((item) => item.purposes.forEach((p) => purposes.add(p)));

  notice += Array.from(purposes)
    .map((p) => `- ${formatPurpose(p)}`)
    .join("\n");

  notice += `\n\n${t.rights}\n`;
  notice += "- Access your data\n";
  notice += "- Request deletion\n";
  notice += "- Export your data\n";
  notice += "- Withdraw consent\n";

  notice += `\n${t.contact} ${CCPA_COMPLIANCE.contactEmail}`;

  return notice;
}

/**
 * Formats a data type for display
 */
function formatDataType(type: AppleDataType): string {
  const formats: Record<AppleDataType, string> = {
    name: "Name",
    email_address: "Email Address",
    phone_number: "Phone Number",
    physical_address: "Physical Address",
    other_contact_info: "Other Contact Info",
    health: "Health Data",
    fitness: "Fitness Data",
    payment_info: "Payment Information",
    credit_info: "Credit Information",
    other_financial_info: "Other Financial Info",
    precise_location: "Precise Location",
    coarse_location: "Approximate Location",
    sensitive_info: "Sensitive Information",
    contacts: "Contacts",
    emails_or_text_messages: "Emails or Messages",
    photos_or_videos: "Photos or Videos",
    audio_data: "Audio Data",
    gameplay_content: "Gameplay Content",
    customer_support: "Customer Support",
    other_user_content: "Other User Content",
    browsing_history: "Browsing History",
    search_history: "Search History",
    user_id: "User Identifier",
    device_id: "Device Identifier",
    purchase_history: "Purchase History",
    product_interaction: "App Usage",
    advertising_data: "Advertising Data",
    other_usage_data: "Other Usage Data",
    crash_data: "Crash Reports",
    performance_data: "Performance Data",
    other_diagnostic_data: "Other Diagnostics",
  };

  return formats[type] ?? type;
}

/**
 * Formats a purpose for display
 */
function formatPurpose(purpose: DataUsagePurpose): string {
  const formats: Record<DataUsagePurpose, string> = {
    third_party_advertising: "Third-Party Advertising",
    developer_advertising: "First-Party Advertising",
    analytics: "Analytics",
    product_personalization: "Personalization",
    app_functionality: "App Functionality",
    other_purposes: "Other Purposes",
  };

  return formats[purpose] ?? purpose;
}

/**
 * Validates compliance with a regulation
 */
export function validateCompliance(
  regulation: "gdpr" | "ccpa" | "coppa"
): {
  compliant: boolean;
  issues: string[];
  recommendations: string[];
} {
  const issues: string[] = [];
  const recommendations: string[] = [];

  switch (regulation) {
    case "gdpr":
      // Check lawful basis for all processing
      if (
        !GDPR_COMPLIANCE.every(
          (record) => record.lawfulBasis && record.purposes.length > 0
        )
      ) {
        issues.push("All processing activities must have a lawful basis");
      }

      // Check retention periods
      if (GDPR_COMPLIANCE.some((record) => record.retentionPeriod === 0)) {
        issues.push("Retention periods must be defined");
      }

      // Check third party disclosure
      if (GDPR_COMPLIANCE.some((record) => record.thirdParties.length > 0)) {
        recommendations.push(
          "Ensure DPAs are in place with all third parties"
        );
      }
      break;

    case "ccpa":
      // Check Do Not Sell option
      if (!CCPA_COMPLIANCE.doNotSellUrl) {
        issues.push("Do Not Sell link is required");
      }

      // Check verification method
      if (!CCPA_COMPLIANCE.verificationMethod) {
        issues.push("Consumer verification method must be defined");
      }
      break;

    case "coppa":
      // Check for children's data collection
      recommendations.push(
        "Implement age gate if app may attract children under 13"
      );
      recommendations.push(
        "Do not collect personal information from children without verifiable parental consent"
      );
      break;
  }

  return {
    compliant: issues.length === 0,
    issues,
    recommendations,
  };
}

/**
 * Generates the App Store privacy label JSON
 */
export function generateAppStorePrivacyLabel(): Record<string, unknown> {
  return {
    NSPrivacyTracking: false,
    NSPrivacyTrackingUsageDescription: "We do not track users across apps",
    NSPrivacyCollectedDataTypes: ORION_PRIVACY_LABEL.dataCollected.map(
      (item) => ({
        NSPrivacyCollectedDataType: item.dataType,
        NSPrivacyCollectedDataTypeLinked: item.linkage === "linked",
        NSPrivacyCollectedDataTypeTracking: item.tracking === "tracking",
        NSPrivacyCollectedDataTypePurposes: item.purposes,
      })
    ),
    NSPrivacyAccessedAPITypes: [
      {
        NSPrivacyAccessedAPIType: "NSPrivacyAccessedAPICategoryUserDefaults",
        NSPrivacyAccessedAPITypeReasons: ["CA92.1"],
      },
    ],
  };
}
