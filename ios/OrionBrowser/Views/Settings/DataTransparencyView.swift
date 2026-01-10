/**
 * DataTransparencyView.swift
 * Complete visibility into collected data
 */

import SwiftUI

struct DataTransparencyView: View {
    @StateObject private var viewModel = DataTransparencyViewModel()

    var body: some View {
        List {
            // Summary
            Section {
                dataSummaryCard
            }

            // Data Categories
            Section("Data Categories") {
                ForEach(viewModel.categories) { category in
                    NavigationLink {
                        DataCategoryDetailView(category: category)
                    } label: {
                        DataCategoryRow(category: category)
                    }
                }
            }

            // Recent Activity
            Section("Recent Activity") {
                if viewModel.recentEvents.isEmpty {
                    Text("No recent activity")
                        .font(.subheadline)
                        .foregroundColor(.orionTextSecondary)
                } else {
                    ForEach(viewModel.recentEvents.prefix(5)) { event in
                        RecentActivityRow(event: event)
                    }

                    NavigationLink {
                        HistoryListView()
                    } label: {
                        Text("View All Activity")
                            .font(.subheadline)
                            .foregroundColor(.orionAccent)
                    }
                }
            }

            // Storage
            Section("Storage") {
                HStack {
                    Text("Local Storage")
                    Spacer()
                    Text(viewModel.localStorageSize)
                        .foregroundColor(.orionTextSecondary)
                }

                HStack {
                    Text("Cloud Storage")
                    Spacer()
                    Text(viewModel.cloudStorageSize)
                        .foregroundColor(.orionTextSecondary)
                }
            }
        }
        .navigationTitle("Data Transparency")
        .refreshable {
            await viewModel.refresh()
        }
        .onAppear {
            Task {
                await viewModel.load()
            }
        }
    }

    // MARK: - Summary Card
    private var dataSummaryCard: some View {
        VStack(spacing: 16) {
            HStack(spacing: 24) {
                StatBox(
                    value: "\(viewModel.totalDataPoints)",
                    label: "Data Points",
                    icon: "doc.text"
                )

                StatBox(
                    value: "\(viewModel.aiEventsCount)",
                    label: "AI Events",
                    icon: "sparkles"
                )

                StatBox(
                    value: "\(viewModel.knowledgeNodes)",
                    label: "Knowledge",
                    icon: "brain"
                )
            }

            // Last update
            HStack {
                Image(systemName: "clock")
                    .foregroundColor(.orionTextTertiary)
                Text("Last updated \(viewModel.lastUpdated, style: .relative)")
                    .font(.caption)
                    .foregroundColor(.orionTextSecondary)
            }
        }
        .padding()
        .background(
            RoundedRectangle(cornerRadius: 12)
                .fill(Color.orionSurface)
        )
        .listRowInsets(EdgeInsets())
        .listRowBackground(Color.clear)
    }
}

// MARK: - Stat Box
struct StatBox: View {
    let value: String
    let label: String
    let icon: String

    var body: some View {
        VStack(spacing: 8) {
            Image(systemName: icon)
                .font(.system(size: 20))
                .foregroundColor(.orionAccent)

            Text(value)
                .font(.title2)
                .fontWeight(.bold)

            Text(label)
                .font(.caption)
                .foregroundColor(.orionTextSecondary)
        }
        .frame(maxWidth: .infinity)
    }
}

// MARK: - Data Category Row
struct DataCategoryRow: View {
    let category: DataCategory

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: category.icon)
                .foregroundColor(.orionAccent)
                .frame(width: 28)

            VStack(alignment: .leading, spacing: 2) {
                Text(category.name)
                    .font(.subheadline)
                    .fontWeight(.medium)

                Text("\(category.itemCount) items")
                    .font(.caption)
                    .foregroundColor(.orionTextSecondary)
            }

            Spacer()

            Text(category.storageSize)
                .font(.caption)
                .foregroundColor(.orionTextTertiary)
        }
    }
}

// MARK: - Recent Activity Row
struct RecentActivityRow: View {
    let event: AITimelineEvent

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: event.type.iconName)
                .foregroundColor(.orionAccent)
                .frame(width: 24)

            VStack(alignment: .leading, spacing: 2) {
                Text(event.description)
                    .font(.caption)
                    .lineLimit(1)

                Text(event.timestamp, style: .relative)
                    .font(.caption2)
                    .foregroundColor(.orionTextTertiary)
            }
        }
    }
}

// MARK: - Data Category Detail View
struct DataCategoryDetailView: View {
    let category: DataCategory

    var body: some View {
        List {
            Section {
                Text(category.description)
                    .font(.subheadline)
                    .foregroundColor(.orionTextSecondary)
            }

            Section("Data Points") {
                ForEach(category.samples, id: \.self) { sample in
                    Text(sample)
                        .font(.caption)
                }
            }

            Section {
                Button(role: .destructive) {
                    // Delete category data
                } label: {
                    HStack {
                        Spacer()
                        Text("Delete \(category.name) Data")
                        Spacer()
                    }
                }
            }
        }
        .navigationTitle(category.name)
    }
}

// MARK: - View Model
@MainActor
class DataTransparencyViewModel: ObservableObject {
    @Published var totalDataPoints: Int = 0
    @Published var aiEventsCount: Int = 0
    @Published var knowledgeNodes: Int = 0
    @Published var lastUpdated: Date = Date()
    @Published var localStorageSize: String = "0 MB"
    @Published var cloudStorageSize: String = "0 MB"
    @Published var categories: [DataCategory] = []
    @Published var recentEvents: [AITimelineEvent] = []

    func load() async {
        let stats = await ConvexManager.shared.getPrivacyStats()
        totalDataPoints = stats.totalDataPoints
        aiEventsCount = stats.aiEventCount

        let graph = await ConvexManager.shared.getKnowledgeGraph()
        knowledgeNodes = graph.nodes.count

        recentEvents = await ConvexManager.shared.getTimelineEvents(limit: 5)

        categories = [
            DataCategory(name: "Browsing History", icon: "clock", itemCount: 234, storageSize: "1.2 MB", description: "URLs and page titles you've visited", samples: ["google.com", "swift.org"]),
            DataCategory(name: "Page Content", icon: "doc.text", itemCount: 156, storageSize: "4.5 MB", description: "Text content extracted from visited pages", samples: ["Article text...", "Documentation..."]),
            DataCategory(name: "AI Insights", icon: "sparkles", itemCount: aiEventsCount, storageSize: "800 KB", description: "AI-generated insights and patterns", samples: ["Interest in Swift", "Learning patterns"]),
            DataCategory(name: "Media", icon: "photo", itemCount: 12, storageSize: "15 MB", description: "Screenshots and captured media", samples: ["screenshot_1.png"])
        ]

        lastUpdated = Date()
    }

    func refresh() async {
        await load()
    }
}

// MARK: - Data Category Model
struct DataCategory: Identifiable {
    let id = UUID()
    let name: String
    let icon: String
    let itemCount: Int
    let storageSize: String
    let description: String
    let samples: [String]
}

#Preview {
    NavigationStack {
        DataTransparencyView()
    }
}
