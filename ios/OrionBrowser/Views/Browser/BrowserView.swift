/**
 * BrowserView.swift
 * Main browser interface with URL bar, WebView, and navigation
 */

import SwiftUI
import WebKit

struct BrowserView: View {
    @EnvironmentObject var appState: AppState
    @StateObject private var viewModel = BrowserViewModel()
    @State private var showingTabSwitcher = false
    @State private var showingShareSheet = false

    var body: some View {
        NavigationStack {
            ZStack {
                Color.orionBackground
                    .ignoresSafeArea()

                VStack(spacing: 0) {
                    BrowserToolbarView(
                        viewModel: viewModel,
                        showingTabSwitcher: $showingTabSwitcher,
                        showingShareSheet: $showingShareSheet
                    )

                    webViewContent

                    if appState.isAIActive {
                        aiActivityIndicator
                    }
                }
            }
            .sheet(isPresented: $showingTabSwitcher) {
                TabBarView(viewModel: viewModel, isPresented: $showingTabSwitcher)
            }
            .sheet(isPresented: $showingShareSheet) {
                if let url = appState.activeTab?.url {
                    ShareSheet(items: [url])
                }
            }
        }
        .onAppear {
            viewModel.setup(appState: appState)
        }
    }

    @ViewBuilder
    private var webViewContent: some View {
        if let activeTab = appState.activeTab {
            WebViewContainer(
                tab: activeTab,
                onNavigationChange: { state in
                    viewModel.handleNavigationChange(state)
                },
                onPageContentLoaded: { content, metadata in
                    viewModel.processPageContent(content: content, metadata: metadata)
                }
            )
        } else {
            EmptyStateView(
                icon: "globe",
                title: "No tabs open",
                message: "Start browsing the web",
                actionTitle: "New Tab",
                action: {
                    _ = appState.createTab(url: URL(string: "https://www.google.com"))
                }
            )
        }
    }

    private var aiActivityIndicator: some View {
        HStack(spacing: 8) {
            Image(systemName: "sparkles")
                .font(.system(size: 14, weight: .medium))
                .symbolEffect(.pulse)

            Text("AI analyzing")
                .font(.caption)
                .fontWeight(.medium)
        }
        .foregroundColor(.white)
        .padding(.horizontal, 16)
        .padding(.vertical, 8)
        .background(
            Capsule()
                .fill(
                    LinearGradient(
                        colors: [.orionAccent, .orionPrimary],
                        startPoint: .leading,
                        endPoint: .trailing
                    )
                )
        )
        .shadow(color: .orionAccent.opacity(0.3), radius: 10)
        .padding(.bottom, 8)
        .transition(.move(edge: .bottom).combined(with: .opacity))
    }
}

// MARK: - Share Sheet
struct ShareSheet: UIViewControllerRepresentable {
    let items: [Any]

    func makeUIViewController(context: Context) -> UIActivityViewController {
        UIActivityViewController(activityItems: items, applicationActivities: nil)
    }

    func updateUIViewController(_ uiViewController: UIActivityViewController, context: Context) {}
}

#Preview {
    BrowserView()
        .environmentObject(AppState())
}
