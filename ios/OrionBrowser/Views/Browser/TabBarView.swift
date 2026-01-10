/**
 * TabBarView.swift
 * Tab switcher interface
 */

import SwiftUI

struct TabBarView: View {
    @EnvironmentObject var appState: AppState
    @ObservedObject var viewModel: BrowserViewModel
    @Binding var isPresented: Bool
    @State private var showingNewTabSheet = false

    private let columns = [
        GridItem(.flexible(), spacing: 16),
        GridItem(.flexible(), spacing: 16)
    ]

    var body: some View {
        NavigationStack {
            ScrollView {
                LazyVGrid(columns: columns, spacing: 16) {
                    ForEach(viewModel.tabs) { tab in
                        TabBarCardView(
                            tab: tab,
                            isActive: tab.id == viewModel.activeTabId,
                            onSelect: {
                                viewModel.switchToTab(tab.id)
                                isPresented = false
                            },
                            onClose: {
                                viewModel.closeTab(tab.id)
                            }
                        )
                    }
                }
                .padding()
            }
            .background(Color.orionBackground)
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

                ToolbarItem(placement: .bottomBar) {
                    HStack {
                        Button("Close All") {
                            viewModel.closeAllTabs()
                        }
                        .foregroundColor(.red)

                        Spacer()

                        Text("\(viewModel.tabs.count) tabs")
                            .font(.caption)
                            .foregroundColor(.orionTextSecondary)
                    }
                }
            }
        }
    }
}

// MARK: - Tab Bar Card View
struct TabBarCardView: View {
    let tab: BrowserTab
    let isActive: Bool
    let onSelect: () -> Void
    let onClose: () -> Void

    var body: some View {
        Button(action: onSelect) {
            VStack(alignment: .leading, spacing: 8) {
                // Screenshot or placeholder
                Group {
                    if let screenshotData = tab.screenshot,
                       let uiImage = UIImage(data: screenshotData) {
                        Image(uiImage: uiImage)
                            .resizable()
                            .aspectRatio(contentMode: .fill)
                    } else {
                        Rectangle()
                            .fill(Color.orionSurface)
                            .overlay {
                                Image(systemName: "globe")
                                    .font(.largeTitle)
                                    .foregroundColor(.orionTextTertiary)
                            }
                    }
                }
                .frame(height: 120)
                .clipShape(RoundedRectangle(cornerRadius: 8))

                // Title and URL
                VStack(alignment: .leading, spacing: 2) {
                    Text(tab.title)
                        .font(.subheadline)
                        .fontWeight(.medium)
                        .lineLimit(1)
                        .foregroundColor(.orionText)

                    Text(tab.url.host ?? tab.url.absoluteString)
                        .font(.caption)
                        .foregroundColor(.orionTextSecondary)
                        .lineLimit(1)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .padding(8)
            .background(
                RoundedRectangle(cornerRadius: 12)
                    .fill(Color.orionSurface)
                    .stroke(isActive ? Color.orionAccent : Color.orionBorder, lineWidth: isActive ? 2 : 1)
            )
        }
        .buttonStyle(.plain)
        .overlay(alignment: .topTrailing) {
            Button(action: onClose) {
                Image(systemName: "xmark.circle.fill")
                    .font(.title3)
                    .foregroundStyle(.white, Color.orionTextTertiary)
            }
            .padding(4)
        }
    }
}

#Preview {
    TabBarView(
        viewModel: BrowserViewModel(),
        isPresented: .constant(true)
    )
    .environmentObject(AppState())
}
