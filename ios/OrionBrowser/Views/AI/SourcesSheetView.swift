/**
 * SourcesSheetView.swift
 * Full list of sources/citations for AI answers
 */

import SwiftUI

struct SourcesSheetView: View {
    let citations: [Citation]
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            List {
                ForEach(citations) { citation in
                    SourceRowView(citation: citation)
                }
            }
            .listStyle(.insetGrouped)
            .navigationTitle("Sources")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Done") {
                        dismiss()
                    }
                }
            }
        }
    }
}

// MARK: - Source Row
struct SourceRowView: View {
    let citation: Citation
    @State private var isExpanded = false

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            // Header
            HStack(spacing: 12) {
                // Favicon placeholder
                Circle()
                    .fill(Color.orionSurface)
                    .frame(width: 32, height: 32)
                    .overlay {
                        Text(citation.domain.prefix(1).uppercased())
                            .font(.caption)
                            .fontWeight(.bold)
                            .foregroundColor(.orionAccent)
                    }

                VStack(alignment: .leading, spacing: 2) {
                    Text(citation.title)
                        .font(.subheadline)
                        .fontWeight(.medium)
                        .lineLimit(2)

                    Text(citation.domain)
                        .font(.caption)
                        .foregroundColor(.orionTextSecondary)
                }

                Spacer()

                // Confidence indicator
                ConfidenceBadge(score: citation.relevanceScore)
            }

            // Snippet (expandable)
            if !citation.snippet.isEmpty {
                Button {
                    withAnimation(.spring(response: 0.3)) {
                        isExpanded.toggle()
                    }
                } label: {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(citation.snippet)
                            .font(.caption)
                            .foregroundColor(.orionTextSecondary)
                            .lineLimit(isExpanded ? nil : 2)
                            .frame(maxWidth: .infinity, alignment: .leading)

                        Text(isExpanded ? "Show less" : "Show more")
                            .font(.caption2)
                            .foregroundColor(.orionAccent)
                    }
                }
                .buttonStyle(.plain)
            }

            // Open link button
            if let url = URL(string: citation.url) {
                Link(destination: url) {
                    HStack(spacing: 4) {
                        Text("Open source")
                            .font(.caption)
                        Image(systemName: "arrow.up.right")
                            .font(.caption2)
                    }
                    .foregroundColor(.orionAccent)
                }
            }
        }
        .padding(.vertical, 4)
    }
}

// MARK: - Confidence Badge
struct ConfidenceBadge: View {
    let score: Double

    var body: some View {
        Text("\(Int(score * 100))%")
            .font(.caption2)
            .fontWeight(.medium)
            .foregroundColor(confidenceColor)
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(
                Capsule()
                    .fill(confidenceColor.opacity(0.15))
            )
    }

    private var confidenceColor: Color {
        switch score {
        case 0.8...: return .green
        case 0.6..<0.8: return .orange
        default: return .red
        }
    }
}

#Preview {
    SourcesSheetView(citations: [
        Citation(
            id: UUID(),
            url: "https://example.com/article",
            title: "Example Article About AI",
            snippet: "This is a snippet from the article that provides context about the citation and why it was included.",
            domain: "example.com",
            relevanceScore: 0.92
        ),
        Citation(
            id: UUID(),
            url: "https://docs.swift.org",
            title: "Swift Documentation",
            snippet: "Official Swift programming language documentation with guides and references.",
            domain: "swift.org",
            relevanceScore: 0.78
        )
    ])
}
