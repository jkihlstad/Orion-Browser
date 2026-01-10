/**
 * HistoryListView.swift
 * Browsing history and AI event timeline
 */

import SwiftUI

struct HistoryListView: View {
    @EnvironmentObject var appState: AppState
    @StateObject private var viewModel = HistoryViewModel()
    @State private var searchText = ""
    @State private var selectedFilter: HistoryFilter = .all
    @State private var selectedEvent: AITimelineEvent?

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                // Filter chips
                filterChips

                // Event list
                if viewModel.isLoading {
                    LoadingView(message: "Loading history...")
                } else if filteredEvents.isEmpty {
                    EmptyStateView(
                        icon: "clock",
                        title: "No history yet",
                        message: "Your browsing activity will appear here"
                    )
                } else {
                    eventList
                }
            }
            .background(Color.orionBackground)
            .navigationTitle("History")
            .searchable(text: $searchText, prompt: "Search history")
            .toolbar {
                ToolbarItem(placement: .primaryAction) {
                    Menu {
                        Button(role: .destructive) {
                            viewModel.clearHistory()
                        } label: {
                            Label("Clear History", systemImage: "trash")
                        }

                        Button {
                            Task {
                                await viewModel.exportHistory()
                            }
                        } label: {
                            Label("Export History", systemImage: "square.and.arrow.up")
                        }
                    } label: {
                        Image(systemName: "ellipsis.circle")
                    }
                }
            }
            .sheet(item: $selectedEvent) { event in
                EventDetailView(event: event)
            }
        }
        .onAppear {
            Task {
                await viewModel.loadEvents()
            }
        }
    }

    // MARK: - Filter Chips
    private var filterChips: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(HistoryFilter.allCases, id: \.self) { filter in
                    FilterChip(
                        title: filter.title,
                        isSelected: selectedFilter == filter,
                        onTap: { selectedFilter = filter }
                    )
                }
            }
            .padding(.horizontal)
            .padding(.vertical, 12)
        }
        .background(Color.orionSurface.opacity(0.5))
    }

    // MARK: - Event List
    private var eventList: some View {
        List {
            ForEach(groupedEvents.keys.sorted().reversed(), id: \.self) { date in
                Section {
                    ForEach(groupedEvents[date] ?? []) { event in
                        EventRowView(event: event)
                            .onTapGesture {
                                selectedEvent = event
                            }
                    }
                } header: {
                    Text(formatSectionDate(date))
                        .font(.caption)
                        .fontWeight(.semibold)
                        .foregroundColor(.orionTextSecondary)
                }
            }
        }
        .listStyle(.insetGrouped)
    }

    // MARK: - Computed Properties
    private var filteredEvents: [AITimelineEvent] {
        var events = viewModel.events

        // Apply filter
        switch selectedFilter {
        case .all:
            break
        case .pages:
            events = events.filter { $0.type == .contentAnalyzed }
        case .ai:
            events = events.filter {
                [.inferenceMade, .knowledgeCreated, .patternDetected].contains($0.type)
            }
        case .exports:
            events = events.filter { $0.type == .exportTriggered }
        }

        // Apply search
        if !searchText.isEmpty {
            events = events.filter {
                $0.description.localizedCaseInsensitiveContains(searchText) ||
                $0.sources.contains { $0.localizedCaseInsensitiveContains(searchText) }
            }
        }

        return events
    }

    private var groupedEvents: [Date: [AITimelineEvent]] {
        Dictionary(grouping: filteredEvents) { event in
            Calendar.current.startOfDay(for: event.timestamp)
        }
    }

    private func formatSectionDate(_ date: Date) -> String {
        let calendar = Calendar.current
        if calendar.isDateInToday(date) {
            return "Today"
        } else if calendar.isDateInYesterday(date) {
            return "Yesterday"
        } else {
            let formatter = DateFormatter()
            formatter.dateStyle = .medium
            return formatter.string(from: date)
        }
    }
}

// MARK: - History Filter
enum HistoryFilter: CaseIterable {
    case all, pages, ai, exports

    var title: String {
        switch self {
        case .all: return "All"
        case .pages: return "Pages"
        case .ai: return "AI Activity"
        case .exports: return "Exports"
        }
    }
}

// MARK: - Filter Chip
struct FilterChip: View {
    let title: String
    let isSelected: Bool
    let onTap: () -> Void

    var body: some View {
        Button(action: onTap) {
            Text(title)
                .font(.subheadline)
                .fontWeight(isSelected ? .semibold : .regular)
                .foregroundColor(isSelected ? .white : .orionText)
                .padding(.horizontal, 16)
                .padding(.vertical, 8)
                .background(
                    Capsule()
                        .fill(isSelected ? Color.orionAccent : Color.orionSurface)
                )
        }
    }
}

// MARK: - Event Row View
struct EventRowView: View {
    let event: AITimelineEvent

    var body: some View {
        HStack(spacing: 12) {
            // Icon
            Image(systemName: event.type.iconName)
                .font(.system(size: 16, weight: .medium))
                .foregroundColor(.orionAccent)
                .frame(width: 32, height: 32)
                .background(
                    Circle()
                        .fill(Color.orionAccent.opacity(0.1))
                )

            // Content
            VStack(alignment: .leading, spacing: 4) {
                Text(event.description)
                    .font(.subheadline)
                    .lineLimit(2)

                HStack(spacing: 8) {
                    Text(event.type.displayName)
                        .font(.caption2)
                        .foregroundColor(.orionTextSecondary)

                    Text("•")
                        .foregroundColor(.orionTextTertiary)

                    Text(event.timestamp, style: .time)
                        .font(.caption2)
                        .foregroundColor(.orionTextTertiary)
                }
            }

            Spacer()

            // Confidence indicator
            if event.confidence > 0 {
                CircularProgressView(progress: event.confidence)
                    .frame(width: 28, height: 28)
            }
        }
        .padding(.vertical, 4)
    }
}

// MARK: - Circular Progress
struct CircularProgressView: View {
    let progress: Double

    var body: some View {
        ZStack {
            Circle()
                .stroke(Color.orionBorder, lineWidth: 2)

            Circle()
                .trim(from: 0, to: progress)
                .stroke(progressColor, style: StrokeStyle(lineWidth: 2, lineCap: .round))
                .rotationEffect(.degrees(-90))

            Text("\(Int(progress * 100))")
                .font(.system(size: 8, weight: .bold))
                .foregroundColor(progressColor)
        }
    }

    private var progressColor: Color {
        switch progress {
        case 0.8...: return .green
        case 0.6..<0.8: return .orange
        default: return .red
        }
    }
}

#Preview {
    HistoryListView()
        .environmentObject(AppState())
}
