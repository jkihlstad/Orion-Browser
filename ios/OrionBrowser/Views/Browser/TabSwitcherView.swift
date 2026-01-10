/**
 * TabSwitcherView.swift
 * Tab management and switching interface
 * SUB-AGENT 1: SwiftUI & UX Architect
 */

import SwiftUI

struct TabSwitcherView: View {
    @EnvironmentObject var appState: AppState
    @ObservedObject var viewModel: BrowserViewModel
    @Binding var isPresented: Bool

    private let columns = [
        GridItem(.flexible(), spacing: 12),
        GridItem(.flexible(), spacing: 12)
    ]

    var body: some View {
        NavigationStack {
            ZStack {
                Color.orionBackground
                    .ignoresSafeArea()

                if viewModel.tabs.isEmpty {
                    emptyStateView
                } else {
                    tabGridView
                }
            }
            .navigationTitle("Tabs")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Done") {
                        isPresented = false
                    }
                }
                ToolbarItem(placement: .primaryAction) {
                    Button {
                        viewModel.createNewTab()
                        isPresented = false
                    } label: {
                        Image(systemName: "plus")
                    }
                }
            }
        }
    }

    // MARK: - Empty State
    @ViewBuilder
    private var emptyStateView: some View {
        VStack(spacing: 24) {
            Image(systemName: "square.on.square.dashed")
                .font(.system(size: 60, weight: .thin))
                .foregroundColor(.orionTextTertiary)

            Text("No Open Tabs")
                .font(.title2)
                .fontWeight(.semibold)

            Button {
                viewModel.createNewTab()
                isPresented = false
            } label: {
                Text("New Tab")
            }
            .buttonStyle(.borderedProminent)
            .tint(.orionAccent)
        }
    }

    // MARK: - Tab Grid
    @ViewBuilder
    private var tabGridView: some View {
        ScrollView {
            LazyVGrid(columns: columns, spacing: 12) {
                ForEach(viewModel.tabs) { tab in
                    TabCardView(
                        tab: tab,
                        isActive: tab.id == viewModel.activeTabId,
                        onSelect: { selectTab(tab.id) },
                        onClose: { closeTab(tab.id) }
                    )
                }
            }
            .padding()
        }
    }

    private func selectTab(_ id: UUID) {
        viewModel.switchToTab(id)
        isPresented = false
    }

    private func closeTab(_ id: UUID) {
        withAnimation {
            viewModel.closeTab(id)
        }
    }
}

// MARK: - Tab Card View
struct TabCardView: View {
    let tab: BrowserTab
    let isActive: Bool
    let onSelect: () -> Void
    let onClose: () -> Void

    var body: some View {
        VStack(spacing: 0) {
            // Preview area
            ZStack(alignment: .topTrailing) {
                previewArea
                closeButton
            }
            // Tab info
            tabInfo
        }
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .overlay(borderOverlay)
        .onTapGesture(perform: onSelect)
    }

    @ViewBuilder
    private var previewArea: some View {
        RoundedRectangle(cornerRadius: 8)
            .fill(Color.orionSurface)
            .frame(height: 140)
            .overlay(previewContent)
    }

    @ViewBuilder
    private var previewContent: some View {
        if tab.isLoading {
            ProgressView()
        } else {
            Image(systemName: "globe")
                .font(.largeTitle)
                .foregroundColor(.orionTextTertiary)
        }
    }

    @ViewBuilder
    private var closeButton: some View {
        Button(action: onClose) {
            Image(systemName: "xmark.circle.fill")
                .font(.title3)
                .foregroundColor(.orionTextSecondary)
        }
        .padding(8)
    }

    @ViewBuilder
    private var tabInfo: some View {
        HStack(spacing: 8) {
            Image(systemName: "globe")
                .font(.caption)
                .foregroundColor(.orionTextSecondary)
                .frame(width: 16, height: 16)

            Text(tab.title.isEmpty ? "New Tab" : tab.title)
                .font(.caption)
                .foregroundColor(.orionText)
                .lineLimit(1)

            Spacer()
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 8)
        .background(Color.orionSurfaceElevated)
    }

    @ViewBuilder
    private var borderOverlay: some View {
        RoundedRectangle(cornerRadius: 12)
            .stroke(isActive ? Color.orionAccent : Color.orionBorder, lineWidth: isActive ? 2 : 1)
    }
}

// MARK: - Tab Count Badge
struct TabCountBadge: View {
    let count: Int

    var body: some View {
        Text("\(min(count, 99))")
            .font(.caption2)
            .fontWeight(.bold)
            .foregroundColor(.orionAccent)
            .frame(width: 24, height: 24)
            .background(
                RoundedRectangle(cornerRadius: 6)
                    .stroke(Color.orionAccent, lineWidth: 1.5)
            )
    }
}

#Preview {
    TabSwitcherView(
        viewModel: BrowserViewModel(),
        isPresented: .constant(true)
    )
    .environmentObject(AppState())
}
