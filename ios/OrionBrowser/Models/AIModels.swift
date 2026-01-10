/**
 * AIModels.swift
 * AI Intelligence, Knowledge Graph, and Timeline data models
 */

import Foundation

// MARK: - AI Timeline Event
struct AITimelineEvent: Identifiable, Codable, Equatable {
    let id: UUID
    let timestamp: Date
    let type: AIEventType
    let description: String
    let details: [String: String]
    let sources: [String]
    let impact: Impact
    let confidence: Double
    var relatedEvents: [UUID]

    enum Impact: String, Codable {
        case learned, ignored, exported, influenced
    }

    init(
        type: AIEventType,
        description: String,
        details: [String: String] = [:],
        sources: [String] = [],
        impact: Impact = .learned,
        confidence: Double = 0.8
    ) {
        self.id = UUID()
        self.timestamp = Date()
        self.type = type
        self.description = description
        self.details = details
        self.sources = sources
        self.impact = impact
        self.confidence = confidence
        self.relatedEvents = []
    }
}

// MARK: - AI Event Type
enum AIEventType: String, Codable, CaseIterable {
    case contentAnalyzed = "content_analyzed"
    case patternDetected = "pattern_detected"
    case knowledgeCreated = "knowledge_created"
    case knowledgeUpdated = "knowledge_updated"
    case inferenceMade = "inference_made"
    case recommendationGenerated = "recommendation_generated"
    case contradictionDetected = "contradiction_detected"
    case exportTriggered = "export_triggered"
    case suppressionApplied = "suppression_applied"
    case userCorrection = "user_correction"

    var displayName: String {
        switch self {
        case .contentAnalyzed: return "Content Analyzed"
        case .patternDetected: return "Pattern Detected"
        case .knowledgeCreated: return "Knowledge Created"
        case .knowledgeUpdated: return "Knowledge Updated"
        case .inferenceMade: return "Inference Made"
        case .recommendationGenerated: return "Recommendation"
        case .contradictionDetected: return "Contradiction Found"
        case .exportTriggered: return "Data Exported"
        case .suppressionApplied: return "Suppression Applied"
        case .userCorrection: return "User Correction"
        }
    }

    var iconName: String {
        switch self {
        case .contentAnalyzed: return "doc.text.magnifyingglass"
        case .patternDetected: return "waveform.path.ecg"
        case .knowledgeCreated: return "plus.circle"
        case .knowledgeUpdated: return "arrow.triangle.2.circlepath"
        case .inferenceMade: return "brain"
        case .recommendationGenerated: return "lightbulb"
        case .contradictionDetected: return "exclamationmark.triangle"
        case .exportTriggered: return "square.and.arrow.up"
        case .suppressionApplied: return "eye.slash"
        case .userCorrection: return "pencil"
        }
    }
}

// MARK: - Knowledge Node
struct KnowledgeNode: Identifiable, Codable, Equatable {
    let id: UUID
    let type: NodeType
    var content: String
    var confidence: Double
    let createdAt: Date
    var updatedAt: Date
    var sources: [String]
    var contradictions: [Contradiction]
    var userEdited: Bool
    var metadata: [String: String]
    var approvalStatus: ApprovalStatus

    enum NodeType: String, Codable {
        case entity, concept, belief, fact, question, preference
    }

    enum ApprovalStatus: String, Codable {
        case pending, approved, rejected, edited
    }

    init(
        type: NodeType,
        content: String,
        confidence: Double = 0.7,
        sources: [String] = []
    ) {
        self.id = UUID()
        self.type = type
        self.content = content
        self.confidence = confidence
        self.createdAt = Date()
        self.updatedAt = Date()
        self.sources = sources
        self.contradictions = []
        self.userEdited = false
        self.metadata = [:]
        self.approvalStatus = .pending
    }
}

// MARK: - Knowledge Edge
struct KnowledgeEdge: Identifiable, Codable, Equatable {
    let id: UUID
    let sourceId: UUID
    let targetId: UUID
    let relationship: String
    var weight: Double
    var confidence: Double
    let createdAt: Date
    var bidirectional: Bool

    init(
        sourceId: UUID,
        targetId: UUID,
        relationship: String,
        weight: Double = 1.0,
        confidence: Double = 0.7
    ) {
        self.id = UUID()
        self.sourceId = sourceId
        self.targetId = targetId
        self.relationship = relationship
        self.weight = weight
        self.confidence = confidence
        self.createdAt = Date()
        self.bidirectional = false
    }
}

// MARK: - Contradiction
struct Contradiction: Identifiable, Codable, Equatable {
    let id: UUID
    let claimA: String
    let claimB: String
    let sourceA: String
    let sourceB: String
    let detectedAt: Date
    var resolved: Bool
    var resolution: String?
}

// MARK: - Knowledge Graph
struct KnowledgeGraph: Codable {
    var nodes: [KnowledgeNode]
    var edges: [KnowledgeEdge]
    var lastUpdated: Date

    var statistics: GraphStatistics {
        GraphStatistics(
            totalNodes: nodes.count,
            totalEdges: edges.count,
            averageConnections: nodes.isEmpty ? 0 : Double(edges.count * 2) / Double(nodes.count),
            recentAdditions: nodes.filter { $0.createdAt > Date().addingTimeInterval(-86400) }.count,
            contradictionCount: nodes.flatMap(\.contradictions).filter { !$0.resolved }.count
        )
    }

    static var empty: KnowledgeGraph {
        KnowledgeGraph(nodes: [], edges: [], lastUpdated: Date())
    }
}

// MARK: - Graph Statistics
struct GraphStatistics: Codable {
    let totalNodes: Int
    let totalEdges: Int
    let averageConnections: Double
    let recentAdditions: Int
    let contradictionCount: Int
}

// MARK: - Cognitive Profile
struct CognitiveProfile: Codable {
    var userId: String
    var attentionSpan: AttentionMetrics
    var curiosityMetrics: CuriosityMetrics
    var learningVelocity: LearningMetrics
    var fatigueState: FatigueState
    var biasTracking: BiasMetrics
    var lastUpdated: Date
}

struct AttentionMetrics: Codable {
    var averageSessionDuration: TimeInterval
    var focusScore: Double
    var distractionFrequency: Double
    var deepReadingRatio: Double
    var multitaskingTendency: Double
    var peakAttentionHours: [Int]
}

struct CuriosityMetrics: Codable {
    var explorationScore: Double
    var topicDiversity: Double
    var questionFrequency: Double
    var deepDiveRatio: Double
    var noveltySeekingScore: Double
    var avoidancePatterns: [String]
}

struct LearningMetrics: Codable {
    var acquisitionRate: Double
    var retentionScore: Double
    var connectionMakingRate: Double
    var conceptRevisitFrequency: Double
    var preferredContentTypes: [String]
    var optimalSessionLength: TimeInterval
}

struct FatigueState: Codable {
    var currentLevel: FatigueLevel
    var indicators: [FatigueIndicator]
    var recommendedBreakIn: TimeInterval
    var lastBreak: Date

    enum FatigueLevel: String, Codable {
        case fresh, mild, moderate, high, severe
    }
}

struct FatigueIndicator: Codable {
    let type: IndicatorType
    var value: Double
    let threshold: Double
    var trend: Trend

    enum IndicatorType: String, Codable {
        case scrollSpeed, readTime, clickPattern, typos, backtracking
    }

    enum Trend: String, Codable {
        case increasing, stable, decreasing
    }
}

struct BiasMetrics: Codable {
    var confirmationBiasScore: Double
    var sourceHomogeneity: Double
    var politicalSkew: Double
    var topicBlindSpots: [String]
    var driftDetected: Bool
    var driftDirection: String?
}

// MARK: - Suppression Rule
struct SuppressionRule: Identifiable, Codable, Equatable {
    let id: UUID
    let type: RuleType
    let value: String
    var isActive: Bool
    let createdAt: Date
    var matchCount: Int

    enum RuleType: String, Codable {
        case topic, domain, pattern, keyword
    }

    init(type: RuleType, value: String) {
        self.id = UUID()
        self.type = type
        self.value = value
        self.isActive = true
        self.createdAt = Date()
        self.matchCount = 0
    }
}
