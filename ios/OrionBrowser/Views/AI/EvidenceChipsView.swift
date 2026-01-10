/**
 * EvidenceChipsView.swift
 * Inline citation chips for AI answers
 */

import SwiftUI

struct EvidenceChipsView: View {
    let citations: [Citation]
    let onShowAll: () -> Void

    private let maxVisibleChips = 3

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Sources")
                .font(.caption)
                .fontWeight(.semibold)
                .foregroundColor(.orionTextSecondary)

            FlowLayout(spacing: 8) {
                ForEach(visibleCitations) { citation in
                    EvidenceChip(citation: citation)
                }

                if citations.count > maxVisibleChips {
                    Button(action: onShowAll) {
                        Text("+\(citations.count - maxVisibleChips) more")
                            .font(.caption)
                            .fontWeight(.medium)
                            .foregroundColor(.orionAccent)
                            .padding(.horizontal, 12)
                            .padding(.vertical, 6)
                            .background(
                                Capsule()
                                    .fill(Color.orionAccent.opacity(0.1))
                            )
                    }
                }
            }
        }
    }

    private var visibleCitations: [Citation] {
        Array(citations.prefix(maxVisibleChips))
    }
}

// MARK: - Evidence Chip
struct EvidenceChip: View {
    let citation: Citation
    @State private var isPressed = false

    var body: some View {
        Button {
            if let url = URL(string: citation.url) {
                UIApplication.shared.open(url)
            }
        } label: {
            HStack(spacing: 6) {
                // Domain indicator
                Circle()
                    .fill(Color.orionSurface)
                    .frame(width: 20, height: 20)
                    .overlay {
                        Text(citation.domain.prefix(1).uppercased())
                            .font(.system(size: 10, weight: .bold))
                            .foregroundColor(.orionAccent)
                    }

                // Domain name
                Text(citation.domain)
                    .font(.caption)
                    .fontWeight(.medium)
                    .foregroundColor(.orionText)
                    .lineLimit(1)

                // External link indicator
                Image(systemName: "arrow.up.right")
                    .font(.system(size: 8, weight: .bold))
                    .foregroundColor(.orionTextTertiary)
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 6)
            .background(
                Capsule()
                    .fill(Color.orionSurface)
                    .stroke(Color.orionBorder, lineWidth: 1)
            )
        }
        .buttonStyle(.plain)
        .scaleEffect(isPressed ? 0.95 : 1.0)
        .animation(.spring(response: 0.2), value: isPressed)
    }
}

// MARK: - Flow Layout
struct FlowLayout: Layout {
    var spacing: CGFloat = 8

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let result = FlowResult(
            in: proposal.replacingUnspecifiedDimensions().width,
            subviews: subviews,
            spacing: spacing
        )
        return result.size
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        let result = FlowResult(
            in: bounds.width,
            subviews: subviews,
            spacing: spacing
        )

        for (index, subview) in subviews.enumerated() {
            subview.place(
                at: CGPoint(
                    x: bounds.minX + result.positions[index].x,
                    y: bounds.minY + result.positions[index].y
                ),
                proposal: ProposedViewSize(result.sizes[index])
            )
        }
    }

    struct FlowResult {
        var size: CGSize = .zero
        var positions: [CGPoint] = []
        var sizes: [CGSize] = []

        init(in maxWidth: CGFloat, subviews: Subviews, spacing: CGFloat) {
            var currentX: CGFloat = 0
            var currentY: CGFloat = 0
            var lineHeight: CGFloat = 0
            var maxWidth: CGFloat = 0

            for subview in subviews {
                let size = subview.sizeThatFits(.unspecified)

                if currentX + size.width > maxWidth, currentX > 0 {
                    currentX = 0
                    currentY += lineHeight + spacing
                    lineHeight = 0
                }

                positions.append(CGPoint(x: currentX, y: currentY))
                sizes.append(size)

                lineHeight = max(lineHeight, size.height)
                currentX += size.width + spacing
                maxWidth = max(maxWidth, currentX - spacing)
            }

            size = CGSize(width: maxWidth, height: currentY + lineHeight)
        }
    }
}

#Preview {
    EvidenceChipsView(
        citations: [
            Citation(id: UUID(), url: "https://apple.com", title: "Apple", snippet: "", domain: "apple.com", relevanceScore: 0.9),
            Citation(id: UUID(), url: "https://swift.org", title: "Swift", snippet: "", domain: "swift.org", relevanceScore: 0.85),
            Citation(id: UUID(), url: "https://github.com", title: "GitHub", snippet: "", domain: "github.com", relevanceScore: 0.8),
            Citation(id: UUID(), url: "https://stackoverflow.com", title: "Stack Overflow", snippet: "", domain: "stackoverflow.com", relevanceScore: 0.75)
        ],
        onShowAll: {}
    )
    .padding()
}
