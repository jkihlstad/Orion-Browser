/**
 * AIResultsView.swift
 * Perplexity-style AI results with SSE streaming
 */

import SwiftUI

struct AIResultsView: View {
    @EnvironmentObject var appState: AppState
    @StateObject private var viewModel = AIResultsViewModel()
    @State private var showingSourcesSheet = false
    @State private var query: String = ""

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 20) {
                    // Search input
                    searchInputView

                    // Current answer or empty state
                    if viewModel.isStreaming {
                        streamingAnswerView
                    } else if let answer = viewModel.currentAnswer {
                        answerView(answer)
                    } else {
                        emptyStateView
                    }
                }
                .padding()
            }
            .background(Color.orionBackground)
            .navigationTitle("AI Assistant")
            .navigationBarTitleDisplayMode(.inline)
            .sheet(isPresented: $showingSourcesSheet) {
                if let answer = viewModel.currentAnswer {
                    SourcesSheetView(citations: answer.citations)
                }
            }
            .refreshable {
                if let lastQuery = viewModel.lastQuery {
                    await viewModel.search(query: lastQuery)
                }
            }
        }
    }

    // MARK: - Search Input
    private var searchInputView: some View {
        HStack(spacing: 12) {
            Image(systemName: "sparkles")
                .foregroundColor(.orionAccent)

            TextField("Ask anything...", text: $query)
                .textFieldStyle(.plain)
                .submitLabel(.search)
                .onSubmit {
                    submitSearch()
                }

            if viewModel.isStreaming {
                Button {
                    viewModel.cancelStream()
                } label: {
                    Image(systemName: "stop.circle.fill")
                        .foregroundColor(.red)
                }
            } else if !query.isEmpty {
                Button {
                    submitSearch()
                } label: {
                    Image(systemName: "arrow.up.circle.fill")
                        .foregroundColor(.orionAccent)
                        .font(.title2)
                }
            }
        }
        .padding()
        .background(
            RoundedRectangle(cornerRadius: 16)
                .fill(Color.orionSurface)
                .stroke(Color.orionBorder, lineWidth: 1)
        )
    }

    // MARK: - Empty State
    private var emptyStateView: some View {
        VStack(spacing: 24) {
            Image(systemName: "sparkles")
                .font(.system(size: 64, weight: .thin))
                .foregroundColor(.orionTextTertiary)

            VStack(spacing: 8) {
                Text("Ask me anything")
                    .font(.title2)
                    .fontWeight(.semibold)

                Text("I'll search your browsing history and the web to find answers")
                    .font(.subheadline)
                    .foregroundColor(.orionTextSecondary)
                    .multilineTextAlignment(.center)
            }

            // Suggested queries
            VStack(spacing: 12) {
                ForEach(suggestedQueries, id: \.self) { suggestion in
                    Button {
                        query = suggestion
                        submitSearch()
                    } label: {
                        Text(suggestion)
                            .font(.subheadline)
                            .foregroundColor(.orionPrimary)
                            .padding(.horizontal, 16)
                            .padding(.vertical, 10)
                            .background(
                                RoundedRectangle(cornerRadius: 20)
                                    .fill(Color.orionSurface)
                                    .stroke(Color.orionBorder, lineWidth: 1)
                            )
                    }
                }
            }
        }
        .padding(.top, 60)
    }

    // MARK: - Streaming Answer
    private var streamingAnswerView: some View {
        VStack(alignment: .leading, spacing: 16) {
            // Query header
            HStack {
                Image(systemName: "person.circle.fill")
                    .foregroundColor(.orionTextSecondary)
                Text(viewModel.lastQuery ?? "")
                    .fontWeight(.medium)
            }

            Divider()

            // Streaming content
            HStack(alignment: .top, spacing: 12) {
                Image(systemName: "sparkles")
                    .foregroundColor(.orionAccent)
                    .symbolEffect(.pulse)

                VStack(alignment: .leading, spacing: 8) {
                    Text(viewModel.streamingText)
                        .font(.body)

                    ProgressView()
                        .scaleEffect(0.8)
                }
            }
        }
        .padding()
        .background(
            RoundedRectangle(cornerRadius: 16)
                .fill(Color.orionSurface)
        )
    }

    // MARK: - Answer View
    private func answerView(_ answer: AIAnswer) -> some View {
        VStack(alignment: .leading, spacing: 16) {
            // Query header
            HStack {
                Image(systemName: "person.circle.fill")
                    .foregroundColor(.orionTextSecondary)
                Text(viewModel.lastQuery ?? "")
                    .fontWeight(.medium)
                Spacer()
            }

            Divider()

            // Answer content
            HStack(alignment: .top, spacing: 12) {
                Image(systemName: "sparkles")
                    .foregroundColor(.orionAccent)

                VStack(alignment: .leading, spacing: 16) {
                    Text(answer.content)
                        .font(.body)

                    // Evidence chips
                    if !answer.citations.isEmpty {
                        EvidenceChipsView(
                            citations: answer.citations,
                            onShowAll: { showingSourcesSheet = true }
                        )
                    }

                    // Follow-up questions
                    if !answer.followUps.isEmpty {
                        FollowUpQuestionsView(
                            questions: answer.followUps,
                            onSelect: { question in
                                query = question.text
                                submitSearch()
                            }
                        )
                    }
                }
            }
        }
        .padding()
        .background(
            RoundedRectangle(cornerRadius: 16)
                .fill(Color.orionSurface)
        )
    }

    // MARK: - Helpers
    private func submitSearch() {
        guard !query.isEmpty else { return }
        Task {
            await viewModel.search(query: query)
        }
    }

    private var suggestedQueries: [String] {
        [
            "What did I read about AI last week?",
            "Summarize my recent browsing",
            "Find articles I bookmarked about Swift"
        ]
    }
}

#Preview {
    AIResultsView()
        .environmentObject(AppState())
}
