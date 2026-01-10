/**
 * APIEndpoints.swift
 * Centralized API endpoint configuration
 * Loads from Configuration or Info.plist
 */

import Foundation

// MARK: - API Endpoints
enum APIEndpoints {
    // MARK: - Base URLs
    static let convexHTTPBaseURL: URL = {
        guard let urlString = Bundle.main.infoDictionary?["CONVEX_HTTP_URL"] as? String,
              !urlString.isEmpty,
              let url = URL(string: urlString) else {
            #if DEBUG
            // Development fallback
            return URL(string: "https://your-dev-deployment.convex.site")!
            #else
            fatalError("CONVEX_HTTP_URL not configured in Info.plist")
            #endif
        }
        return url
    }()

    static let openRouterBaseURL: URL = {
        guard let urlString = Bundle.main.infoDictionary?["OPENROUTER_BASE_URL"] as? String,
              !urlString.isEmpty,
              let url = URL(string: urlString) else {
            return URL(string: "https://openrouter.ai/api/v1")!
        }
        return url
    }()

    // MARK: - Browser Event Endpoints (Convex Mutations/Queries)
    static let insertBatch = "browsing:insertBatch"
    static let searchMulti = "browsing:searchMulti"
    static let logEvent = "browsing:logEvent"
    static let processPage = "intelligence:processPage"

    // MARK: - AI Endpoints
    static let aiStream = "browser/ai/stream"
    static let aiQuery = "browser/ai/query"
    static let aiSummarize = "browser/ai/summarize"

    // MARK: - Intelligence Endpoints
    static let getTimeline = "intelligence:getTimeline"
    static let clearTimeline = "intelligence:clearTimeline"
    static let getInsights = "intelligence:getInsights"

    // MARK: - Consent Endpoints
    static let getConsentState = "consent:getState"
    static let updateConsent = "consent:update"
    static let getSitePermissions = "consent:getSitePermissions"
    static let updateSitePermissions = "consent:updateSitePermissions"
    static let requestDeletion = "consent:requestDeletion"

    // MARK: - Knowledge Graph Endpoints
    static let getKnowledgeGraph = "knowledgeGraph:get"
    static let approveNode = "knowledgeGraph:approveNode"
    static let rejectNode = "knowledgeGraph:rejectNode"
    static let editNode = "knowledgeGraph:editNode"

    // MARK: - Export Endpoints
    static let exportTimeline = "export:timeline"
    static let exportUserData = "export:userData"

    // MARK: - Security Endpoints
    static let logAudit = "security:logAudit"

    // MARK: - Neural Events Endpoints
    static let insertNeuralBatch = "neuralEvents:insertBatch"
    static let getNeuralTimeline = "neuralEvents:getTimeline"

    // MARK: - Embedding Endpoints
    static let generateEmbedding = "ai:generateEmbedding"
    static let searchSimilar = "vectorDb:search"

    // MARK: - OpenRouter Endpoints
    static let openRouterChat = "/chat/completions"
    static let openRouterModels = "/models"

    // MARK: - Plist Configuration
    struct PlistConfig {
        let convexHTTPURL: URL
        let convexDeploymentURL: String
        let openRouterBaseURL: URL
        let clerkPublishableKey: String
        let openRouterAPIKey: String?

        init() {
            let bundle = Bundle.main.infoDictionary ?? [:]

            // Convex HTTP URL
            if let urlString = bundle["CONVEX_HTTP_URL"] as? String,
               let url = URL(string: urlString) {
                self.convexHTTPURL = url
            } else {
                #if DEBUG
                self.convexHTTPURL = URL(string: "https://your-dev-deployment.convex.site")!
                #else
                fatalError("CONVEX_HTTP_URL not configured")
                #endif
            }

            // Convex Deployment URL
            if let url = bundle["CONVEX_DEPLOYMENT_URL"] as? String {
                self.convexDeploymentURL = url
            } else {
                #if DEBUG
                self.convexDeploymentURL = "https://your-dev-deployment.convex.cloud"
                #else
                fatalError("CONVEX_DEPLOYMENT_URL not configured")
                #endif
            }

            // OpenRouter Base URL
            if let urlString = bundle["OPENROUTER_BASE_URL"] as? String,
               let url = URL(string: urlString) {
                self.openRouterBaseURL = url
            } else {
                self.openRouterBaseURL = URL(string: "https://openrouter.ai/api/v1")!
            }

            // Clerk Publishable Key
            if let key = bundle["CLERK_PUBLISHABLE_KEY"] as? String {
                self.clerkPublishableKey = key
            } else {
                #if DEBUG
                self.clerkPublishableKey = "pk_test_placeholder"
                #else
                fatalError("CLERK_PUBLISHABLE_KEY not configured")
                #endif
            }

            // OpenRouter API Key (optional, may use Convex backend)
            self.openRouterAPIKey = bundle["OPENROUTER_API_KEY"] as? String
        }
    }

    // MARK: - Load from Plist
    static func fromPlist() -> PlistConfig {
        PlistConfig()
    }

    // MARK: - Full URL Builders
    static func convexMutationURL(_ path: String) -> URL {
        convexHTTPBaseURL.appendingPathComponent("api/mutation/\(path)")
    }

    static func convexQueryURL(_ path: String) -> URL {
        convexHTTPBaseURL.appendingPathComponent("api/query/\(path)")
    }

    static func convexActionURL(_ path: String) -> URL {
        convexHTTPBaseURL.appendingPathComponent("api/action/\(path)")
    }

    static func openRouterURL(_ path: String) -> URL {
        openRouterBaseURL.appendingPathComponent(path)
    }
}

// MARK: - API Version
extension APIEndpoints {
    static let apiVersion = "v1"

    static var versionedBaseURL: URL {
        convexHTTPBaseURL.appendingPathComponent(apiVersion)
    }
}

// MARK: - Environment
extension APIEndpoints {
    enum Environment: String {
        case development
        case staging
        case production

        static var current: Environment {
            #if DEBUG
            return .development
            #else
            if let env = Bundle.main.infoDictionary?["APP_ENVIRONMENT"] as? String {
                return Environment(rawValue: env) ?? .production
            }
            return .production
            #endif
        }
    }

    static var environment: Environment {
        Environment.current
    }

    static var isProduction: Bool {
        environment == .production
    }
}

// MARK: - Timeout Configuration
extension APIEndpoints {
    struct Timeouts {
        static let defaultRequest: TimeInterval = 30
        static let uploadRequest: TimeInterval = 120
        static let streamingRequest: TimeInterval = 300
        static let aiRequest: TimeInterval = 60
    }
}

// MARK: - Headers
extension APIEndpoints {
    struct Headers {
        static let contentType = "Content-Type"
        static let accept = "Accept"
        static let authorization = "Authorization"
        static let userAgent = "User-Agent"
        static let acceptLanguage = "Accept-Language"

        static let jsonContentType = "application/json"
        static let sseAccept = "text/event-stream"

        static var defaultHeaders: [String: String] {
            [
                contentType: jsonContentType,
                accept: jsonContentType,
                userAgent: "OrionBrowser/\(Configuration.appVersion) iOS"
            ]
        }

        static var streamingHeaders: [String: String] {
            [
                contentType: jsonContentType,
                accept: sseAccept,
                userAgent: "OrionBrowser/\(Configuration.appVersion) iOS"
            ]
        }
    }
}
