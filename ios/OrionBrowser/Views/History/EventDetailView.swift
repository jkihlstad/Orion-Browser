/**
 * EventDetailView.swift
 * Detailed view of an AI timeline event
 */

import SwiftUI

struct EventDetailView: View {
    let event: AITimelineEvent
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 24) {
                    // Header
                    headerSection

                    Divider()

                    // Description
                    descriptionSection

                    // Details
                    if !event.details.isEmpty {
                        detailsSection
                    }

                    // Sources
                    if !event.sources.isEmpty {
                        sourcesSection
                    }

                    // Metadata
                    metadataSection
                }
                .padding()
            }
            .background(Color.orionBackground)
            .navigationTitle("Event Details")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Done") {
                        dismiss()
                    }
                }

                ToolbarItem(placement: .primaryAction) {
                    Menu {
                        Button {
                            copyEventDetails()
                        } label: {
                            Label("Copy Details", systemImage: "doc.on.doc")
                        }

                        Button {
                            shareEvent()
                        } label: {
                            Label("Share", systemImage: "square.and.arrow.up")
                        }
                    } label: {
                        Image(systemName: "ellipsis.circle")
                    }
                }
            }
        }
    }

    // MARK: - Header Section
    private var headerSection: some View {
        HStack(spacing: 16) {
            // Icon
            Image(systemName: event.type.iconName)
                .font(.system(size: 24, weight: .medium))
                .foregroundColor(.white)
                .frame(width: 56, height: 56)
                .background(
                    RoundedRectangle(cornerRadius: 12)
                        .fill(
                            LinearGradient(
                                colors: [.orionAccent, .orionPrimary],
                                startPoint: .topLeading,
                                endPoint: .bottomTrailing
                            )
                        )
                )

            VStack(alignment: .leading, spacing: 4) {
                Text(event.type.displayName)
                    .font(.headline)

                Text(formatDate(event.timestamp))
                    .font(.subheadline)
                    .foregroundColor(.orionTextSecondary)

                // Impact badge
                ImpactBadge(impact: event.impact)
            }

            Spacer()

            // Confidence ring
            ZStack {
                Circle()
                    .stroke(Color.orionBorder, lineWidth: 4)
                    .frame(width: 60, height: 60)

                Circle()
                    .trim(from: 0, to: event.confidence)
                    .stroke(confidenceColor, style: StrokeStyle(lineWidth: 4, lineCap: .round))
                    .frame(width: 60, height: 60)
                    .rotationEffect(.degrees(-90))

                VStack(spacing: 0) {
                    Text("\(Int(event.confidence * 100))%")
                        .font(.system(size: 14, weight: .bold))
                    Text("conf")
                        .font(.system(size: 8))
                        .foregroundColor(.orionTextSecondary)
                }
            }
        }
    }

    // MARK: - Description Section
    private var descriptionSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Description")
                .font(.caption)
                .fontWeight(.semibold)
                .foregroundColor(.orionTextSecondary)

            Text(event.description)
                .font(.body)
        }
    }

    // MARK: - Details Section
    private var detailsSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Details")
                .font(.caption)
                .fontWeight(.semibold)
                .foregroundColor(.orionTextSecondary)

            VStack(spacing: 8) {
                ForEach(Array(event.details.keys.sorted()), id: \.self) { key in
                    DetailRow(key: key, value: event.details[key] ?? "")
                }
            }
            .padding()
            .background(
                RoundedRectangle(cornerRadius: 12)
                    .fill(Color.orionSurface)
            )
        }
    }

    // MARK: - Sources Section
    private var sourcesSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Sources")
                .font(.caption)
                .fontWeight(.semibold)
                .foregroundColor(.orionTextSecondary)

            VStack(spacing: 8) {
                ForEach(event.sources, id: \.self) { source in
                    SourceLinkRow(source: source)
                }
            }
        }
    }

    // MARK: - Metadata Section
    private var metadataSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Metadata")
                .font(.caption)
                .fontWeight(.semibold)
                .foregroundColor(.orionTextSecondary)

            VStack(spacing: 8) {
                DetailRow(key: "Event ID", value: event.id.uuidString.prefix(8).description)
                DetailRow(key: "Timestamp", value: formatFullDate(event.timestamp))
                DetailRow(key: "Related Events", value: "\(event.relatedEvents.count)")
            }
            .padding()
            .background(
                RoundedRectangle(cornerRadius: 12)
                    .fill(Color.orionSurface)
            )
        }
    }

    // MARK: - Helpers
    private var confidenceColor: Color {
        switch event.confidence {
        case 0.8...: return .green
        case 0.6..<0.8: return .orange
        default: return .red
        }
    }

    private func formatDate(_ date: Date) -> String {
        let formatter = RelativeDateTimeFormatter()
        formatter.unitsStyle = .full
        return formatter.localizedString(for: date, relativeTo: Date())
    }

    private func formatFullDate(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.dateStyle = .medium
        formatter.timeStyle = .medium
        return formatter.string(from: date)
    }

    private func copyEventDetails() {
        let details = """
        Event: \(event.type.displayName)
        Date: \(formatFullDate(event.timestamp))
        Description: \(event.description)
        Confidence: \(Int(event.confidence * 100))%
        """
        UIPasteboard.general.string = details
    }

    private func shareEvent() {
        // Would show share sheet
    }
}

// MARK: - Impact Badge
struct ImpactBadge: View {
    let impact: AITimelineEvent.Impact

    var body: some View {
        Text(impact.rawValue.capitalized)
            .font(.caption2)
            .fontWeight(.medium)
            .foregroundColor(impactColor)
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(
                Capsule()
                    .fill(impactColor.opacity(0.15))
            )
    }

    private var impactColor: Color {
        switch impact {
        case .learned: return .green
        case .ignored: return .gray
        case .exported: return .blue
        case .influenced: return .purple
        }
    }
}

// MARK: - Detail Row
struct DetailRow: View {
    let key: String
    let value: String

    var body: some View {
        HStack {
            Text(key)
                .font(.subheadline)
                .foregroundColor(.orionTextSecondary)

            Spacer()

            Text(value)
                .font(.subheadline)
                .fontWeight(.medium)
                .foregroundColor(.orionText)
        }
    }
}

// MARK: - Source Link Row
struct SourceLinkRow: View {
    let source: String

    var body: some View {
        if let url = URL(string: source) {
            Link(destination: url) {
                HStack {
                    Image(systemName: "link")
                        .foregroundColor(.orionAccent)

                    Text(url.host ?? source)
                        .font(.subheadline)
                        .foregroundColor(.orionAccent)

                    Spacer()

                    Image(systemName: "arrow.up.right")
                        .font(.caption)
                        .foregroundColor(.orionTextTertiary)
                }
                .padding()
                .background(
                    RoundedRectangle(cornerRadius: 8)
                        .fill(Color.orionSurface)
                )
            }
        } else {
            HStack {
                Image(systemName: "doc.text")
                    .foregroundColor(.orionTextSecondary)

                Text(source)
                    .font(.subheadline)
            }
            .padding()
            .background(
                RoundedRectangle(cornerRadius: 8)
                    .fill(Color.orionSurface)
            )
        }
    }
}

#Preview {
    EventDetailView(
        event: AITimelineEvent(
            type: .contentAnalyzed,
            description: "Analyzed article about Swift programming and memory management patterns",
            details: [
                "Words": "1,234",
                "Reading Time": "5 min",
                "Topics": "Swift, iOS, Memory"
            ],
            sources: ["https://swift.org/documentation"],
            impact: .learned,
            confidence: 0.85
        )
    )
}
