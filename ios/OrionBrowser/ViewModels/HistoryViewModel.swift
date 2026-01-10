/**
 * HistoryViewModel.swift
 * Business logic for history and timeline
 */

import SwiftUI
import Combine

@MainActor
final class HistoryViewModel: ObservableObject {
    // MARK: - Published Properties
    @Published var events: [AITimelineEvent] = []
    @Published var isLoading: Bool = false
    @Published var error: Error?

    // MARK: - Private Properties
    private var cancellables = Set<AnyCancellable>()

    // MARK: - Load Events
    func loadEvents() async {
        isLoading = true
        error = nil

        events = await ConvexManager.shared.getTimelineEvents(limit: 500)
        isLoading = false
    }

    // MARK: - Clear History
    func clearHistory() {
        Task {
            await ConvexManager.shared.clearTimeline()
            events = []
        }
    }

    // MARK: - Export History
    func exportHistory() async -> URL? {
        return await ConvexManager.shared.exportTimeline()
    }

    // MARK: - Delete Event
    func deleteEvent(_ event: AITimelineEvent) {
        events.removeAll { $0.id == event.id }
        // Also delete from backend
        Task {
            // await ConvexManager.shared.deleteTimelineEvent(event.id)
        }
    }

    // MARK: - Search Events
    func searchEvents(query: String) -> [AITimelineEvent] {
        guard !query.isEmpty else { return events }

        return events.filter { event in
            event.description.localizedCaseInsensitiveContains(query) ||
            event.type.displayName.localizedCaseInsensitiveContains(query) ||
            event.sources.contains { $0.localizedCaseInsensitiveContains(query) }
        }
    }

    // MARK: - Filter by Type
    func filterEvents(by types: [AIEventType]) -> [AITimelineEvent] {
        guard !types.isEmpty else { return events }
        return events.filter { types.contains($0.type) }
    }

    // MARK: - Filter by Date Range
    func filterEvents(from startDate: Date, to endDate: Date) -> [AITimelineEvent] {
        events.filter { event in
            event.timestamp >= startDate && event.timestamp <= endDate
        }
    }

    // MARK: - Group by Date
    var eventsByDate: [Date: [AITimelineEvent]] {
        Dictionary(grouping: events) { event in
            Calendar.current.startOfDay(for: event.timestamp)
        }
    }

    // MARK: - Statistics
    var totalEvents: Int { events.count }

    var eventsToday: Int {
        let today = Calendar.current.startOfDay(for: Date())
        return events.filter { $0.timestamp >= today }.count
    }

    var eventsByType: [AIEventType: Int] {
        Dictionary(grouping: events, by: \.type)
            .mapValues(\.count)
    }
}
