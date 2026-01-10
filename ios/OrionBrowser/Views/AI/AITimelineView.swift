/**
 * AITimelineView.swift
 * AI activity timeline and knowledge graph visualization
 * SUB-AGENT 1: SwiftUI & UX Architect
 */

import SwiftUI

struct AITimelineView: View {
    @EnvironmentObject var appState: AppState
    @StateObject private var viewModel = AITimelineViewModel()
    @State private var selectedTab: TimelineTab = .timeline
    @State private var selectedEvent: AITimelineEvent?

    enum TimelineTab: String, CaseIterable {
        case timeline = "Timeline"
        case knowledge = "Knowledge"
        case approvals = "Approvals"
    }

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                // Tab Selector
                Picker("View", selection: $selectedTab) {
                    ForEach(TimelineTab.allCases, id: \.self) { tab in
                        Text(tab.rawValue).tag(tab)
                    }
                }
                .pickerStyle(.segmented)
                .padding()

                // Content
                Group {
                    switch selectedTab {
                    case .timeline:
                        timelineContent
                    case .knowledge:
                        knowledgeGraphContent
                    case .approvals:
                        approvalsContent
                    }
                }
            }
            .background(Color.orionBackground)
            .navigationTitle("AI Activity")
            .navigationBarTitleDisplayMode(.large)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Menu {
                        Button {
                            viewModel.exportTimeline()
                        } label: {
                            Label("Export Timeline", systemImage: "square.and.arrow.up")
                        }

                        Button {
                            viewModel.clearTimeline()
                        } label: {
                            Label("Clear Timeline", systemImage: "trash")
                        }
                    } label: {
                        Image(systemName: "ellipsis.circle")
                    }
                }
            }
            .sheet(item: $selectedEvent) { event in
                TimelineEventDetailView(event: event)
            }
        }
        .onAppear {
            viewModel.loadTimeline()
        }
    }

    // MARK: - Timeline Content
    private var timelineContent: some View {
        ScrollView {
            LazyVStack(spacing: 16) {
                // Stats Header
                timelineStats

                // Filter Pills
                filterPills

                // Events
                if viewModel.filteredEvents.isEmpty {
                    emptyTimelineState
                } else {
                    ForEach(viewModel.filteredEvents) { event in
                        TimelineEventCard(event: event) {
                            selectedEvent = event
                        }
                    }
                }
            }
            .padding()
        }
    }

    private var timelineStats: some View {
        HStack(spacing: 12) {
            StatPill(value: "\(viewModel.stats.totalEvents)", label: "Total", color: .blue)
            StatPill(value: "\(viewModel.stats.learnedCount)", label: "Learned", color: .green)
            StatPill(value: "\(viewModel.stats.ignoredCount)", label: "Ignored", color: .orange)
        }
    }

    private var filterPills: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                FilterPill(
                    title: "All",
                    isSelected: viewModel.selectedTypes.isEmpty,
                    action: { viewModel.clearFilters() }
                )

                ForEach(AIEventType.allCases, id: \.self) { type in
                    FilterPill(
                        title: type.displayName,
                        isSelected: viewModel.selectedTypes.contains(type),
                        action: { viewModel.toggleFilter(type) }
                    )
                }
            }
        }
    }

    private var emptyTimelineState: some View {
        VStack(spacing: 16) {
            Image(systemName: "sparkles")
                .font(.system(size: 48))
                .foregroundColor(.orionTextTertiary)

            Text("No AI Activity Yet")
                .font(.headline)
                .foregroundColor(.orionTextSecondary)

            Text("AI events will appear here as you browse")
                .font(.caption)
                .foregroundColor(.orionTextTertiary)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 60)
    }

    // MARK: - Knowledge Graph Content
    private var knowledgeGraphContent: some View {
        VStack(spacing: 16) {
            // Graph Stats
            HStack(spacing: 12) {
                StatPill(
                    value: "\(viewModel.knowledgeGraph.statistics.totalNodes)",
                    label: "Nodes",
                    color: .purple
                )
                StatPill(
                    value: "\(viewModel.knowledgeGraph.statistics.totalEdges)",
                    label: "Connections",
                    color: .blue
                )
                StatPill(
                    value: "\(viewModel.knowledgeGraph.statistics.contradictionCount)",
                    label: "Conflicts",
                    color: .orange
                )
            }
            .padding(.horizontal)

            // Graph Visualization
            KnowledgeGraphVisualization(graph: viewModel.knowledgeGraph)

            // Node List
            ScrollView {
                LazyVStack(spacing: 12) {
                    ForEach(viewModel.knowledgeGraph.nodes) { node in
                        KnowledgeNodeCard(node: node) {
                            viewModel.selectNode(node)
                        }
                    }
                }
                .padding()
            }
        }
    }

    // MARK: - Approvals Content
    private var approvalsContent: some View {
        ScrollView {
            LazyVStack(spacing: 12) {
                if viewModel.pendingApprovals.isEmpty {
                    VStack(spacing: 16) {
                        Image(systemName: "checkmark.circle")
                            .font(.system(size: 48))
                            .foregroundColor(.green)

                        Text("All Caught Up!")
                            .font(.headline)
                            .foregroundColor(.orionTextSecondary)

                        Text("No pending approvals")
                            .font(.caption)
                            .foregroundColor(.orionTextTertiary)
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 60)
                } else {
                    ForEach(viewModel.pendingApprovals) { node in
                        ApprovalCard(
                            node: node,
                            onApprove: { viewModel.approveNode(node.id) },
                            onReject: { viewModel.rejectNode(node.id) },
                            onEdit: { content in viewModel.editNode(node.id, content: content) }
                        )
                    }
                }
            }
            .padding()
        }
    }
}

// MARK: - Timeline Event Card
struct TimelineEventCard: View {
    let event: AITimelineEvent
    let onTap: () -> Void

    var body: some View {
        Button(action: onTap) {
            HStack(alignment: .top, spacing: 12) {
                // Icon
                Image(systemName: event.type.iconName)
                    .font(.title3)
                    .foregroundColor(impactColor)
                    .frame(width: 40, height: 40)
                    .background(impactColor.opacity(0.15))
                    .cornerRadius(10)

                // Content
                VStack(alignment: .leading, spacing: 4) {
                    HStack {
                        Text(event.type.displayName)
                            .font(.subheadline)
                            .fontWeight(.medium)
                            .foregroundColor(.orionText)

                        Spacer()

                        Text(event.timestamp, style: .relative)
                            .font(.caption)
                            .foregroundColor(.orionTextTertiary)
                    }

                    Text(event.description)
                        .font(.caption)
                        .foregroundColor(.orionTextSecondary)
                        .lineLimit(2)

                    // Confidence Badge
                    HStack(spacing: 8) {
                        TimelineConfidenceBadge(confidence: event.confidence)

                        if !event.sources.isEmpty {
                            Text("\(event.sources.count) sources")
                                .font(.caption2)
                                .foregroundColor(.orionTextTertiary)
                        }
                    }
                }
            }
            .padding()
            .background(Color.orionSurface)
            .cornerRadius(12)
        }
    }

    private var impactColor: Color {
        switch event.impact {
        case .learned: return .green
        case .ignored: return .orange
        case .exported: return .blue
        case .influenced: return .purple
        }
    }
}

// MARK: - Knowledge Node Card
struct KnowledgeNodeCard: View {
    let node: KnowledgeNode
    let onTap: () -> Void

    var body: some View {
        Button(action: onTap) {
            VStack(alignment: .leading, spacing: 8) {
                HStack {
                    Text(node.type.rawValue.capitalized)
                        .font(.caption)
                        .fontWeight(.medium)
                        .foregroundColor(.white)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 4)
                        .background(nodeTypeColor)
                        .cornerRadius(6)

                    Spacer()

                    TimelineConfidenceBadge(confidence: node.confidence)
                }

                Text(node.content)
                    .font(.subheadline)
                    .foregroundColor(.orionText)
                    .lineLimit(3)

                if !node.contradictions.isEmpty {
                    HStack {
                        Image(systemName: "exclamationmark.triangle")
                            .foregroundColor(.orange)
                        Text("\(node.contradictions.count) contradictions")
                            .font(.caption)
                            .foregroundColor(.orange)
                    }
                }
            }
            .padding()
            .background(Color.orionSurface)
            .cornerRadius(12)
        }
    }

    private var nodeTypeColor: Color {
        switch node.type {
        case .entity: return .blue
        case .concept: return .purple
        case .belief: return .pink
        case .fact: return .green
        case .question: return .orange
        case .preference: return .teal
        }
    }
}

// MARK: - Approval Card
struct ApprovalCard: View {
    let node: KnowledgeNode
    let onApprove: () -> Void
    let onReject: () -> Void
    let onEdit: (String) -> Void

    @State private var isEditing = false
    @State private var editedContent: String = ""

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            // Header
            HStack {
                Image(systemName: "brain")
                    .foregroundColor(.purple)

                Text("New Knowledge")
                    .font(.subheadline)
                    .fontWeight(.medium)
                    .foregroundColor(.orionText)

                Spacer()

                Text(node.createdAt, style: .relative)
                    .font(.caption)
                    .foregroundColor(.orionTextTertiary)
            }

            // Content
            if isEditing {
                TextField("Edit content", text: $editedContent, axis: .vertical)
                    .textFieldStyle(.roundedBorder)
                    .lineLimit(3...6)
            } else {
                Text(node.content)
                    .font(.body)
                    .foregroundColor(.orionText)
            }

            // Sources
            if !node.sources.isEmpty {
                Text("From: \(node.sources.joined(separator: ", "))")
                    .font(.caption)
                    .foregroundColor(.orionTextSecondary)
            }

            // Actions
            HStack(spacing: 12) {
                Button {
                    onReject()
                } label: {
                    Label("Reject", systemImage: "xmark")
                        .font(.subheadline)
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.bordered)
                .tint(.red)

                Button {
                    if isEditing {
                        onEdit(editedContent)
                        isEditing = false
                    } else {
                        editedContent = node.content
                        isEditing = true
                    }
                } label: {
                    Label(isEditing ? "Save" : "Edit", systemImage: isEditing ? "checkmark" : "pencil")
                        .font(.subheadline)
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.bordered)
                .tint(.orange)

                Button {
                    onApprove()
                } label: {
                    Label("Approve", systemImage: "checkmark")
                        .font(.subheadline)
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .tint(.green)
            }
        }
        .padding()
        .background(Color.orionSurface)
        .cornerRadius(12)
        .overlay(
            RoundedRectangle(cornerRadius: 12)
                .stroke(Color.orange.opacity(0.5), lineWidth: 1)
        )
    }
}

// MARK: - Supporting Views
struct StatPill: View {
    let value: String
    let label: String
    let color: Color

    var body: some View {
        VStack(spacing: 4) {
            Text(value)
                .font(.title2)
                .fontWeight(.bold)
                .foregroundColor(color)

            Text(label)
                .font(.caption)
                .foregroundColor(.orionTextSecondary)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 12)
        .background(color.opacity(0.1))
        .cornerRadius(12)
    }
}

struct FilterPill: View {
    let title: String
    let isSelected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(title)
                .font(.caption)
                .fontWeight(.medium)
                .foregroundColor(isSelected ? .white : .orionTextSecondary)
                .padding(.horizontal, 12)
                .padding(.vertical, 6)
                .background(isSelected ? Color.orionAccent : Color.orionSurface)
                .cornerRadius(16)
        }
    }
}

struct TimelineConfidenceBadge: View {
    let confidence: Double

    var body: some View {
        Text("\(Int(confidence * 100))%")
            .font(.caption2)
            .fontWeight(.medium)
            .foregroundColor(confidenceColor)
            .padding(.horizontal, 6)
            .padding(.vertical, 2)
            .background(confidenceColor.opacity(0.15))
            .cornerRadius(4)
    }

    private var confidenceColor: Color {
        if confidence >= 0.8 { return .green }
        if confidence >= 0.5 { return .orange }
        return .red
    }
}

struct KnowledgeGraphVisualization: View {
    let graph: KnowledgeGraph

    var body: some View {
        ZStack {
            // Placeholder for actual graph visualization
            // In production, use a proper graph rendering library
            RoundedRectangle(cornerRadius: 16)
                .fill(Color.orionSurface)
                .frame(height: 200)
                .overlay(
                    VStack {
                        Image(systemName: "point.3.connected.trianglepath.dotted")
                            .font(.system(size: 48))
                            .foregroundColor(.orionAccent.opacity(0.5))

                        Text("Knowledge Graph")
                            .font(.caption)
                            .foregroundColor(.orionTextTertiary)
                    }
                )
        }
        .padding(.horizontal)
    }
}

struct TimelineEventDetailView: View {
    let event: AITimelineEvent
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    // Header
                    HStack {
                        Image(systemName: event.type.iconName)
                            .font(.title)
                            .foregroundColor(.orionAccent)

                        VStack(alignment: .leading) {
                            Text(event.type.displayName)
                                .font(.headline)
                            Text(event.timestamp, style: .date)
                                .font(.caption)
                                .foregroundColor(.orionTextSecondary)
                        }
                    }

                    Divider()

                    // Description
                    Text(event.description)
                        .font(.body)

                    // Details
                    if !event.details.isEmpty {
                        VStack(alignment: .leading, spacing: 8) {
                            Text("Details")
                                .font(.headline)

                            ForEach(Array(event.details.keys.sorted()), id: \.self) { key in
                                HStack {
                                    Text(key)
                                        .foregroundColor(.orionTextSecondary)
                                    Spacer()
                                    Text(event.details[key] ?? "")
                                }
                                .font(.caption)
                            }
                        }
                    }

                    // Sources
                    if !event.sources.isEmpty {
                        VStack(alignment: .leading, spacing: 8) {
                            Text("Sources")
                                .font(.headline)

                            ForEach(event.sources, id: \.self) { source in
                                Text(source)
                                    .font(.caption)
                                    .foregroundColor(.orionTextSecondary)
                            }
                        }
                    }
                }
                .padding()
            }
            .navigationTitle("Event Details")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") { dismiss() }
                }
            }
        }
    }
}

#Preview {
    AITimelineView()
        .environmentObject(AppState())
}
