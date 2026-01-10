/**
 * AISourcesChipsView.swift
 * Horizontal scrolling glass-styled source/citation chips
 * Each chip displays source title and is tappable to open the source URL
 * Uses Liquid Glass Design System components
 */

import SwiftUI

// MARK: - AISourcesChipsView
public struct AISourcesChipsView: View {
    @Environment(\.colorScheme) private var colorScheme

    // MARK: - Properties
    let citations: [Citation]
    let onSourceTapped: (Citation) -> Void
    let maxVisibleChips: Int
    let showAllAction: (() -> Void)?

    // MARK: - Initialization
    init(
        citations: [Citation],
        maxVisibleChips: Int = 5,
        showAllAction: (() -> Void)? = nil,
        onSourceTapped: @escaping (Citation) -> Void
    ) {
        self.citations = citations
        self.maxVisibleChips = maxVisibleChips
        self.showAllAction = showAllAction
        self.onSourceTapped = onSourceTapped
    }

    // MARK: - Body
    public var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: GlassTokens.Spacing.sm) {
                ForEach(Array(visibleCitations.enumerated()), id: \.element.id) { index, citation in
                    SourceChip(
                        citation: citation,
                        index: index + 1,
                        onTap: { onSourceTapped(citation) }
                    )
                    .transition(.chipInsert)
                }

                if citations.count > maxVisibleChips {
                    moreChip
                }
            }
            .padding(.horizontal, GlassTokens.Spacing.xxs)
            .padding(.vertical, GlassTokens.Spacing.xs)
        }
    }

    // MARK: - Visible Citations
    private var visibleCitations: [Citation] {
        Array(citations.prefix(maxVisibleChips))
    }

    // MARK: - More Chip
    private var moreChip: some View {
        Button {
            showAllAction?()
        } label: {
            HStack(spacing: GlassTokens.Spacing.xs) {
                Text("+\(citations.count - maxVisibleChips)")
                    .font(.system(size: 13, weight: .semibold))
                Image(systemName: "chevron.right")
                    .font(.system(size: 10, weight: .bold))
            }
            .foregroundColor(.neonBlue)
            .padding(.horizontal, GlassTokens.Spacing.md)
            .padding(.vertical, GlassTokens.Spacing.sm)
            .background(
                Capsule()
                    .fill(Color.neonBlue.opacity(0.15))
            )
            .overlay(
                Capsule()
                    .stroke(Color.neonBlue.opacity(0.3), lineWidth: GlassTokens.Stroke.thin)
            )
        }
        .buttonStyle(.plain)
    }
}

// MARK: - SourceChip
/// Individual source chip with glass styling
public struct SourceChip: View {
    @Environment(\.colorScheme) private var colorScheme

    let citation: Citation
    let index: Int
    let onTap: () -> Void

    @State private var isPressed = false
    @State private var isHovered = false

    public var body: some View {
        Button(action: onTap) {
            HStack(spacing: GlassTokens.Spacing.sm) {
                // Index badge
                indexBadge

                // Domain/title
                VStack(alignment: .leading, spacing: 1) {
                    Text(citation.title.isEmpty ? citation.domain : citation.title)
                        .font(.system(size: 13, weight: .medium))
                        .lineLimit(1)

                    if !citation.title.isEmpty {
                        Text(citation.domain)
                            .font(.system(size: 10))
                            .foregroundColor(.secondary)
                            .lineLimit(1)
                    }
                }
                .frame(maxWidth: 150, alignment: .leading)

                // External link indicator
                Image(systemName: "arrow.up.right")
                    .font(.system(size: 10, weight: .bold))
                    .foregroundColor(.secondary.opacity(0.7))
            }
            .foregroundColor(.primary)
            .padding(.horizontal, GlassTokens.Spacing.md)
            .padding(.vertical, GlassTokens.Spacing.sm)
            .background(chipBackground)
            .overlay(chipStroke)
            .glassShadow(for: colorScheme, style: .subtle)
            .scaleEffect(isPressed ? 0.96 : 1.0)
        }
        .buttonStyle(SourceChipButtonStyle(isPressed: $isPressed))
    }

    // MARK: - Index Badge
    private var indexBadge: some View {
        Text("\(index)")
            .font(.system(size: 10, weight: .bold, design: .rounded))
            .foregroundColor(.white)
            .frame(width: 20, height: 20)
            .background(
                Circle()
                    .fill(badgeGradient)
            )
    }

    private var badgeGradient: LinearGradient {
        LinearGradient(
            colors: [.neonBlue, .neonPurple],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        )
    }

    // MARK: - Chip Background
    @ViewBuilder
    private var chipBackground: some View {
        Capsule()
            .fill(colorScheme == .dark ? Material.ultraThinMaterial : Material.thinMaterial)
    }

    // MARK: - Chip Stroke
    private var chipStroke: some View {
        Capsule()
            .stroke(Color.glassStroke(for: colorScheme), lineWidth: GlassTokens.Stroke.thin)
    }
}

// MARK: - Source Chip Button Style
private struct SourceChipButtonStyle: ButtonStyle {
    @Binding var isPressed: Bool

    func makeBody(configuration: ButtonStyleConfiguration) -> some View {
        configuration.label
            .onChange(of: configuration.isPressed) { _, newValue in
                withAnimation(GlassMotion.Spring.quick) {
                    isPressed = newValue
                }
            }
    }
}

// MARK: - Compact Source Chip
/// A more compact version showing only the domain initial and number
public struct CompactSourceChip: View {
    @Environment(\.colorScheme) private var colorScheme

    let citation: Citation
    let index: Int
    let onTap: () -> Void

    @State private var isPressed = false

    public var body: some View {
        Button(action: onTap) {
            HStack(spacing: GlassTokens.Spacing.xs) {
                // Domain initial
                Text(String(citation.domain.prefix(1)).uppercased())
                    .font(.system(size: 11, weight: .bold))
                    .foregroundColor(.neonBlue)
                    .frame(width: 18, height: 18)
                    .background(
                        Circle()
                            .fill(Color.neonBlue.opacity(0.15))
                    )

                // Superscript index
                Text("\(index)")
                    .font(.system(size: 10, weight: .semibold, design: .rounded))
                    .foregroundColor(.secondary)
            }
            .padding(.horizontal, GlassTokens.Spacing.sm)
            .padding(.vertical, GlassTokens.Spacing.xs)
            .background(
                Capsule()
                    .fill(colorScheme == .dark ? Material.ultraThinMaterial : Material.thinMaterial)
            )
            .overlay(
                Capsule()
                    .stroke(Color.glassStroke(for: colorScheme), lineWidth: GlassTokens.Stroke.thin)
            )
            .scaleEffect(isPressed ? 0.94 : 1.0)
        }
        .buttonStyle(SourceChipButtonStyle(isPressed: $isPressed))
    }
}

// MARK: - Inline Citation Marker
/// A small inline citation marker for use within text
public struct InlineCitationMarker: View {
    let index: Int
    let onTap: () -> Void

    public var body: some View {
        Button(action: onTap) {
            Text("[\(index)]")
                .font(.system(size: 11, weight: .semibold))
                .foregroundColor(.neonBlue)
                .baselineOffset(4)
        }
        .buttonStyle(.plain)
    }
}

// MARK: - Sources Grid View
/// A grid layout for displaying sources in a sheet or expanded view
public struct SourcesGridView: View {
    @Environment(\.colorScheme) private var colorScheme

    let citations: [Citation]
    let onSourceTapped: (Citation) -> Void

    private let columns = [
        GridItem(.flexible(), spacing: GlassTokens.Spacing.md),
        GridItem(.flexible(), spacing: GlassTokens.Spacing.md)
    ]

    public var body: some View {
        LazyVGrid(columns: columns, spacing: GlassTokens.Spacing.md) {
            ForEach(Array(citations.enumerated()), id: \.element.id) { index, citation in
                SourceGridItem(
                    citation: citation,
                    index: index + 1,
                    onTap: { onSourceTapped(citation) }
                )
            }
        }
    }
}

// MARK: - Source Grid Item
public struct SourceGridItem: View {
    @Environment(\.colorScheme) private var colorScheme

    let citation: Citation
    let index: Int
    let onTap: () -> Void

    @State private var isPressed = false

    public var body: some View {
        Button(action: onTap) {
            VStack(alignment: .leading, spacing: GlassTokens.Spacing.sm) {
                HStack {
                    // Index badge
                    Text("\(index)")
                        .font(.system(size: 10, weight: .bold, design: .rounded))
                        .foregroundColor(.white)
                        .frame(width: 20, height: 20)
                        .background(
                            Circle()
                                .fill(
                                    LinearGradient(
                                        colors: [.neonBlue, .neonPurple],
                                        startPoint: .topLeading,
                                        endPoint: .bottomTrailing
                                    )
                                )
                        )

                    Spacer()

                    // Relevance indicator
                    if citation.isHighRelevance {
                        HStack(spacing: 2) {
                            Image(systemName: "star.fill")
                                .font(.system(size: 8))
                            Text("High")
                                .font(.system(size: 9, weight: .medium))
                        }
                        .foregroundColor(.neonGreen)
                    }
                }

                // Title
                Text(citation.title.isEmpty ? citation.domain : citation.title)
                    .font(.system(size: 14, weight: .medium))
                    .lineLimit(2)
                    .multilineTextAlignment(.leading)

                // Snippet
                if !citation.snippet.isEmpty {
                    Text(citation.snippet)
                        .font(.system(size: 12))
                        .foregroundColor(.secondary)
                        .lineLimit(2)
                        .multilineTextAlignment(.leading)
                }

                // Domain
                HStack(spacing: 4) {
                    Image(systemName: "globe")
                        .font(.system(size: 10))
                    Text(citation.domain)
                        .font(.system(size: 11))
                }
                .foregroundColor(.secondary)
            }
            .padding(GlassTokens.Spacing.md)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(
                RoundedRectangle(cornerRadius: GlassTokens.CornerRadius.button, style: .continuous)
                    .fill(colorScheme == .dark ? Material.ultraThinMaterial : Material.thinMaterial)
            )
            .overlay(
                RoundedRectangle(cornerRadius: GlassTokens.CornerRadius.button, style: .continuous)
                    .stroke(Color.glassStroke(for: colorScheme), lineWidth: GlassTokens.Stroke.thin)
            )
            .glassShadow(for: colorScheme, style: .subtle)
            .scaleEffect(isPressed ? 0.97 : 1.0)
        }
        .buttonStyle(SourceChipButtonStyle(isPressed: $isPressed))
    }
}

// MARK: - Previews
#if DEBUG
private let mockCitations: [Citation] = [
    Citation(
        url: "https://apple.com/iphone",
        title: "iPhone - Apple",
        snippet: "Explore the world of iPhone. Check out iPhone 15 Pro and iPhone 15.",
        domain: "apple.com",
        relevanceScore: 0.95
    ),
    Citation(
        url: "https://developer.apple.com/swift",
        title: "Swift - Apple Developer",
        snippet: "Swift is a powerful and intuitive programming language.",
        domain: "developer.apple.com",
        relevanceScore: 0.88
    ),
    Citation(
        url: "https://github.com/apple/swift",
        title: "apple/swift: The Swift Programming Language",
        snippet: "The Swift Programming Language repository.",
        domain: "github.com",
        relevanceScore: 0.82
    ),
    Citation(
        url: "https://swift.org",
        title: "Swift.org",
        snippet: "Swift is a general-purpose programming language.",
        domain: "swift.org",
        relevanceScore: 0.75
    ),
    Citation(
        url: "https://stackoverflow.com/questions/swift",
        title: "Swift Questions - Stack Overflow",
        snippet: "Questions tagged with swift.",
        domain: "stackoverflow.com",
        relevanceScore: 0.65
    ),
    Citation(
        url: "https://medium.com/swift-programming",
        title: "Swift Programming",
        snippet: "Articles about Swift development.",
        domain: "medium.com",
        relevanceScore: 0.55
    )
]

#Preview("AISourcesChipsView") {
    GlassPreviewContainer {
        VStack(spacing: 30) {
            VStack(alignment: .leading, spacing: 8) {
                Text("Sources")
                    .font(.caption)
                    .fontWeight(.semibold)
                    .foregroundColor(.secondary)

                AISourcesChipsView(
                    citations: mockCitations,
                    maxVisibleChips: 4,
                    showAllAction: { },
                    onSourceTapped: { _ in }
                )
            }
        }
        .padding()
    }
}

#Preview("AISourcesChipsView - Dark") {
    GlassPreviewContainer {
        VStack(alignment: .leading, spacing: 8) {
            Text("Sources")
                .font(.caption)
                .fontWeight(.semibold)
                .foregroundColor(.secondary)

            AISourcesChipsView(
                citations: mockCitations,
                onSourceTapped: { _ in }
            )
        }
        .padding()
    }
    .preferredColorScheme(.dark)
}

#Preview("Compact Source Chips") {
    GlassPreviewContainer {
        HStack(spacing: 6) {
            ForEach(Array(mockCitations.prefix(3).enumerated()), id: \.element.id) { index, citation in
                CompactSourceChip(
                    citation: citation,
                    index: index + 1,
                    onTap: { }
                )
            }
        }
        .padding()
    }
}

#Preview("Sources Grid") {
    GlassPreviewContainer {
        ScrollView {
            SourcesGridView(
                citations: mockCitations,
                onSourceTapped: { _ in }
            )
            .padding()
        }
    }
}

#Preview("Source Grid Item") {
    GlassPreviewContainer {
        SourceGridItem(
            citation: mockCitations[0],
            index: 1,
            onTap: { }
        )
        .frame(width: 180)
        .padding()
    }
}
#endif
