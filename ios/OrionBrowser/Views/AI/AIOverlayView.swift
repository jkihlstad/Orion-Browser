/**
 * AIOverlayView.swift
 * Glass-styled AI overlay sheet with URL context, query input,
 * streaming answer display, and sources chips
 * Uses Liquid Glass Design System components
 */

import SwiftUI

// MARK: - AIOverlayView
public struct AIOverlayView: View {
    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.dismiss) private var dismiss

    // MARK: - Properties
    @Binding var isPresented: Bool
    let currentURL: URL?
    let pageTitle: String?
    let onSubmitQuery: (String) async -> Void
    let onSourceTapped: (Citation) -> Void

    // MARK: - State
    @State private var query: String = ""
    @State private var isStreaming: Bool = false
    @State private var streamingText: String = ""
    @State private var answer: AIAnswer?
    @State private var error: Error?
    @FocusState private var isQueryFocused: Bool

    // MARK: - Initialization
    init(
        isPresented: Binding<Bool>,
        currentURL: URL? = nil,
        pageTitle: String? = nil,
        onSubmitQuery: @escaping (String) async -> Void,
        onSourceTapped: @escaping (Citation) -> Void
    ) {
        self._isPresented = isPresented
        self.currentURL = currentURL
        self.pageTitle = pageTitle
        self.onSubmitQuery = onSubmitQuery
        self.onSourceTapped = onSourceTapped
    }

    // MARK: - Body
    public var body: some View {
        GlassOverlay(cornerRadius: GlassTokens.CornerRadius.modal) {
            VStack(spacing: 0) {
                headerSection

                ScrollView {
                    VStack(spacing: GlassTokens.Spacing.lg) {
                        if let url = currentURL {
                            contextCard(url: url)
                        }

                        queryInputCard

                        if isStreaming {
                            streamingAnswerCard
                        } else if let answer = answer {
                            answerCard(answer)
                        } else if error == nil {
                            suggestionsView
                        }

                        if let error = error {
                            errorCard(error)
                        }
                    }
                    .padding(GlassTokens.Spacing.lg)
                }
            }
        }
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.hidden)
        .onAppear {
            isQueryFocused = true
        }
    }

    // MARK: - Header Section
    private var headerSection: some View {
        HStack {
            Button {
                withAnimation(GlassMotion.Spring.standard) {
                    isPresented = false
                }
            } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundColor(.secondary)
                    .frame(width: 32, height: 32)
                    .background(
                        Circle()
                            .fill(colorScheme == .dark ? Material.ultraThinMaterial : Material.thinMaterial)
                    )
                    .overlay(
                        Circle()
                            .stroke(Color.glassStroke(for: colorScheme), lineWidth: GlassTokens.Stroke.thin)
                    )
            }

            Spacer()

            HStack(spacing: GlassTokens.Spacing.sm) {
                Image(systemName: "sparkles")
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(Color.neonGradient)
                Text("Ask AI")
                    .font(.system(size: 17, weight: .semibold))
            }

            Spacer()

            // Placeholder for symmetry
            Color.clear.frame(width: 32, height: 32)
        }
        .padding(.horizontal, GlassTokens.Spacing.lg)
        .padding(.vertical, GlassTokens.Spacing.md)
    }

    // MARK: - Context Card
    private func contextCard(url: URL) -> some View {
        GlassCard(cornerRadius: GlassTokens.CornerRadius.button, padding: GlassTokens.Spacing.md) {
            HStack(spacing: GlassTokens.Spacing.md) {
                Image(systemName: "globe")
                    .font(.system(size: 14, weight: .medium))
                    .foregroundColor(.secondary)

                VStack(alignment: .leading, spacing: 2) {
                    if let title = pageTitle, !title.isEmpty {
                        Text(title)
                            .font(.system(size: 14, weight: .medium))
                            .lineLimit(1)
                    }
                    Text(url.host ?? url.absoluteString)
                        .font(.system(size: 12))
                        .foregroundColor(.secondary)
                        .lineLimit(1)
                }

                Spacer()

                Text("Context")
                    .font(.system(size: 11, weight: .medium))
                    .foregroundColor(.neonBlue)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 4)
                    .background(
                        Capsule()
                            .fill(Color.neonBlue.opacity(0.15))
                    )
            }
        }
        .transition(.glassMorph)
    }

    // MARK: - Query Input Card
    private var queryInputCard: some View {
        GlassCard(cornerRadius: GlassTokens.CornerRadius.card, padding: GlassTokens.Spacing.lg) {
            VStack(spacing: GlassTokens.Spacing.md) {
                HStack(spacing: GlassTokens.Spacing.md) {
                    Image(systemName: "sparkles")
                        .font(.system(size: 18, weight: .medium))
                        .foregroundStyle(Color.neonGradient)

                    TextField("Ask anything about this page...", text: $query, axis: .vertical)
                        .textFieldStyle(.plain)
                        .font(.system(size: 16))
                        .lineLimit(1...5)
                        .focused($isQueryFocused)
                        .submitLabel(.send)
                        .onSubmit {
                            submitQuery()
                        }
                }

                HStack {
                    Spacer()

                    if isStreaming {
                        Button {
                            cancelStream()
                        } label: {
                            HStack(spacing: 6) {
                                Image(systemName: "stop.circle.fill")
                                Text("Stop")
                            }
                            .font(.system(size: 14, weight: .medium))
                            .foregroundColor(.red)
                        }
                    } else {
                        Button {
                            submitQuery()
                        } label: {
                            Image(systemName: "arrow.up.circle.fill")
                                .font(.system(size: 28))
                                .foregroundStyle(
                                    query.isEmpty
                                        ? AnyShapeStyle(Color.secondary.opacity(0.5))
                                        : AnyShapeStyle(Color.neonGradient)
                                )
                        }
                        .disabled(query.isEmpty)
                    }
                }
            }
        }
        .glassAnimation(value: isQueryFocused)
    }

    // MARK: - Streaming Answer Card
    private var streamingAnswerCard: some View {
        GlassCard {
            VStack(alignment: .leading, spacing: GlassTokens.Spacing.md) {
                HStack(spacing: GlassTokens.Spacing.sm) {
                    Image(systemName: "sparkles")
                        .font(.system(size: 16, weight: .medium))
                        .foregroundStyle(Color.neonGradient)
                        .symbolEffect(.pulse)

                    Text("Thinking...")
                        .font(.system(size: 14, weight: .medium))
                        .foregroundColor(.secondary)

                    Spacer()
                }

                GlassDivider()

                Text(streamingText)
                    .font(.system(size: 16))
                    .glassContentTransition()

                HStack(spacing: GlassTokens.Spacing.sm) {
                    ProgressView()
                        .scaleEffect(0.8)
                    Text("Generating response...")
                        .font(.system(size: 12))
                        .foregroundColor(.secondary)
                }
            }
        }
        .transition(.glassMorph)
        .glassMorphOnAppear()
    }

    // MARK: - Answer Card
    private func answerCard(_ answer: AIAnswer) -> some View {
        GlassCard {
            VStack(alignment: .leading, spacing: GlassTokens.Spacing.lg) {
                // Header
                HStack(spacing: GlassTokens.Spacing.sm) {
                    Image(systemName: "sparkles")
                        .font(.system(size: 16, weight: .medium))
                        .foregroundStyle(Color.neonGradient)

                    Text("Answer")
                        .font(.system(size: 14, weight: .semibold))

                    Spacer()

                    // Copy button
                    Button {
                        UIPasteboard.general.string = answer.content
                    } label: {
                        Image(systemName: "doc.on.doc")
                            .font(.system(size: 14))
                            .foregroundColor(.secondary)
                    }
                }

                GlassDivider()

                // Answer content
                Text(answer.content)
                    .font(.system(size: 16))
                    .textSelection(.enabled)

                // Sources chips
                if !answer.citations.isEmpty {
                    VStack(alignment: .leading, spacing: GlassTokens.Spacing.sm) {
                        Text("Sources")
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundColor(.secondary)

                        AISourcesChipsView(
                            citations: answer.citations,
                            onSourceTapped: onSourceTapped
                        )
                    }
                }

                // Follow-up suggestions
                if !answer.followUps.isEmpty {
                    VStack(alignment: .leading, spacing: GlassTokens.Spacing.sm) {
                        Text("Related questions")
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundColor(.secondary)

                        ForEach(answer.followUps) { followUp in
                            Button {
                                query = followUp.text
                                submitQuery()
                            } label: {
                                HStack {
                                    Image(systemName: "arrow.turn.down.right")
                                        .font(.system(size: 12))
                                        .foregroundColor(.neonBlue)

                                    Text(followUp.text)
                                        .font(.system(size: 14))
                                        .foregroundColor(.primary)
                                        .multilineTextAlignment(.leading)

                                    Spacer()
                                }
                                .padding(GlassTokens.Spacing.md)
                                .background(
                                    RoundedRectangle(cornerRadius: GlassTokens.CornerRadius.small, style: .continuous)
                                        .fill(colorScheme == .dark ? Material.ultraThinMaterial : Material.thinMaterial)
                                )
                                .overlay(
                                    RoundedRectangle(cornerRadius: GlassTokens.CornerRadius.small, style: .continuous)
                                        .stroke(Color.glassStroke(for: colorScheme), lineWidth: GlassTokens.Stroke.thin)
                                )
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
            }
        }
        .transition(.glassMorph)
    }

    // MARK: - Suggestions View
    private var suggestionsView: some View {
        VStack(spacing: GlassTokens.Spacing.lg) {
            Image(systemName: "sparkles")
                .font(.system(size: 48, weight: .thin))
                .foregroundStyle(Color.neonGradient.opacity(0.6))

            VStack(spacing: GlassTokens.Spacing.sm) {
                Text("Ask me anything")
                    .font(.system(size: 20, weight: .semibold))

                Text("I can help you understand, summarize, or answer questions about this page")
                    .font(.system(size: 14))
                    .foregroundColor(.secondary)
                    .multilineTextAlignment(.center)
            }

            VStack(spacing: GlassTokens.Spacing.sm) {
                ForEach(suggestedQueries, id: \.self) { suggestion in
                    Button {
                        query = suggestion
                        submitQuery()
                    } label: {
                        HStack {
                            Text(suggestion)
                                .font(.system(size: 14))
                                .foregroundColor(.primary)
                            Spacer()
                            Image(systemName: "arrow.right")
                                .font(.system(size: 12))
                                .foregroundColor(.secondary)
                        }
                        .padding(GlassTokens.Spacing.md)
                        .background(
                            RoundedRectangle(cornerRadius: GlassTokens.CornerRadius.button, style: .continuous)
                                .fill(colorScheme == .dark ? Material.ultraThinMaterial : Material.thinMaterial)
                        )
                        .overlay(
                            RoundedRectangle(cornerRadius: GlassTokens.CornerRadius.button, style: .continuous)
                                .stroke(Color.glassStroke(for: colorScheme), lineWidth: GlassTokens.Stroke.thin)
                        )
                    }
                    .buttonStyle(.plain)
                }
            }
        }
        .padding(.top, GlassTokens.Spacing.xl)
    }

    // MARK: - Error Card
    private func errorCard(_ error: Error) -> some View {
        GlassCard {
            HStack(spacing: GlassTokens.Spacing.md) {
                Image(systemName: "exclamationmark.triangle.fill")
                    .font(.system(size: 24))
                    .foregroundColor(.orange)

                VStack(alignment: .leading, spacing: 4) {
                    Text("Something went wrong")
                        .font(.system(size: 14, weight: .semibold))

                    Text(error.localizedDescription)
                        .font(.system(size: 12))
                        .foregroundColor(.secondary)
                }

                Spacer()

                Button {
                    self.error = nil
                    submitQuery()
                } label: {
                    Text("Retry")
                        .font(.system(size: 14, weight: .medium))
                        .foregroundColor(.neonBlue)
                }
            }
        }
        .transition(.glassMorph)
    }

    // MARK: - Helpers
    private var suggestedQueries: [String] {
        if currentURL != nil {
            return [
                "Summarize this page",
                "What are the key points?",
                "Explain this in simple terms"
            ]
        }
        return [
            "What did I read about recently?",
            "Find articles I saved about Swift",
            "Show my browsing history from today"
        ]
    }

    private func submitQuery() {
        guard !query.isEmpty else { return }

        isStreaming = true
        streamingText = ""
        error = nil

        Task {
            do {
                await onSubmitQuery(query)
                // The parent view should update answer through binding or callback
            } catch {
                self.error = error
            }
            isStreaming = false
        }
    }

    private func cancelStream() {
        isStreaming = false
        // Parent should handle actual cancellation
    }
}

// MARK: - AIOverlayView with ViewModel binding
public struct AIOverlayViewWithViewModel: View {
    @Binding var isPresented: Bool
    let currentURL: URL?
    let pageTitle: String?
    @ObservedObject var viewModel: AIResultsViewModel

    public var body: some View {
        AIOverlayView(
            isPresented: $isPresented,
            currentURL: currentURL,
            pageTitle: pageTitle,
            onSubmitQuery: { query in
                await viewModel.search(query: query)
            },
            onSourceTapped: { citation in
                if let url = URL(string: citation.url) {
                    UIApplication.shared.open(url)
                }
            }
        )
    }
}

// MARK: - Previews
#if DEBUG
#Preview("AIOverlayView - Empty") {
    Color.gray.opacity(0.3)
        .ignoresSafeArea()
        .sheet(isPresented: .constant(true)) {
            AIOverlayView(
                isPresented: .constant(true),
                currentURL: URL(string: "https://apple.com/iphone"),
                pageTitle: "iPhone - Apple",
                onSubmitQuery: { _ in },
                onSourceTapped: { _ in }
            )
        }
}

#Preview("AIOverlayView - Dark") {
    Color.black
        .ignoresSafeArea()
        .sheet(isPresented: .constant(true)) {
            AIOverlayView(
                isPresented: .constant(true),
                currentURL: URL(string: "https://developer.apple.com/swift"),
                pageTitle: "Swift - Apple Developer",
                onSubmitQuery: { _ in },
                onSourceTapped: { _ in }
            )
        }
        .preferredColorScheme(.dark)
}
#endif
