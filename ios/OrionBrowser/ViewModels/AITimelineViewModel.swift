/**
 * AITimelineViewModel.swift
 * AI activity and knowledge graph logic
 * SUB-AGENT 1: SwiftUI & UX Architect
 */

import SwiftUI
import Combine

@MainActor
final class AITimelineViewModel: ObservableObject {
    // MARK: - Published State
    @Published var events: [AITimelineEvent] = []
    @Published var knowledgeGraph: KnowledgeGraph = .empty
    @Published var pendingApprovals: [KnowledgeNode] = []
    @Published var selectedTypes: Set<AIEventType> = []
    @Published var stats: TimelineStats = TimelineStats(
        totalEvents: 0,
        learnedCount: 0,
        ignoredCount: 0,
        exportedCount: 0,
        topSources: []
    )

    var filteredEvents: [AITimelineEvent] {
        if selectedTypes.isEmpty {
            return events
        }
        return events.filter { selectedTypes.contains($0.type) }
    }

    private var cancellables = Set<AnyCancellable>()

    // MARK: - Loading
    func loadTimeline() {
        Task {
            await loadEvents()
            await loadKnowledgeGraph()
            await loadPendingApprovals()
            computeStats()
        }
    }

    private func loadEvents() async {
        events = await ConvexManager.shared.getTimelineEvents(limit: 100)
    }

    private func loadKnowledgeGraph() async {
        knowledgeGraph = await ConvexManager.shared.getKnowledgeGraph()
    }

    private func loadPendingApprovals() async {
        pendingApprovals = knowledgeGraph.nodes.filter { $0.approvalStatus == .pending }
    }

    private func computeStats() {
        stats = TimelineStats(
            totalEvents: events.count,
            learnedCount: events.filter { $0.impact == .learned }.count,
            ignoredCount: events.filter { $0.impact == .ignored }.count,
            exportedCount: events.filter { $0.impact == .exported }.count,
            topSources: computeTopSources()
        )
    }

    private func computeTopSources() -> [(source: String, count: Int)] {
        var sourceCounts: [String: Int] = [:]
        for event in events {
            for source in event.sources {
                sourceCounts[source, default: 0] += 1
            }
        }
        return sourceCounts
            .map { (source: $0.key, count: $0.value) }
            .sorted { $0.count > $1.count }
            .prefix(5)
            .map { $0 }
    }

    // MARK: - Filtering
    func toggleFilter(_ type: AIEventType) {
        if selectedTypes.contains(type) {
            selectedTypes.remove(type)
        } else {
            selectedTypes.insert(type)
        }
    }

    func clearFilters() {
        selectedTypes.removeAll()
    }

    // MARK: - Knowledge Node Actions
    func selectNode(_ node: KnowledgeNode) {
        // Navigate to node detail or highlight
    }

    func approveNode(_ id: UUID) {
        Task {
            await ConvexManager.shared.approveKnowledgeNode(id)
            await loadPendingApprovals()
            await loadKnowledgeGraph()
        }
    }

    func rejectNode(_ id: UUID) {
        Task {
            await ConvexManager.shared.rejectKnowledgeNode(id)
            await loadPendingApprovals()
            await loadKnowledgeGraph()
        }
    }

    func editNode(_ id: UUID, content: String) {
        Task {
            await ConvexManager.shared.editKnowledgeNode(id, content: content)
            await loadPendingApprovals()
            await loadKnowledgeGraph()
        }
    }

    // MARK: - Export & Clear
    func exportTimeline() {
        Task {
            if let url = await ConvexManager.shared.exportTimeline() {
                // Share the exported file
                await MainActor.run {
                    let activityVC = UIActivityViewController(
                        activityItems: [url],
                        applicationActivities: nil
                    )
                    if let windowScene = UIApplication.shared.connectedScenes.first as? UIWindowScene,
                       let window = windowScene.windows.first {
                        window.rootViewController?.present(activityVC, animated: true)
                    }
                }
            }
        }
    }

    func clearTimeline() {
        Task {
            await ConvexManager.shared.clearTimeline()
            events = []
            computeStats()
        }
    }
}

// MARK: - Timeline Stats
struct TimelineStats {
    let totalEvents: Int
    let learnedCount: Int
    let ignoredCount: Int
    let exportedCount: Int
    let topSources: [(source: String, count: Int)]
}
