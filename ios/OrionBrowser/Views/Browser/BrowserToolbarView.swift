/**
 * BrowserToolbarView.swift
 * Address bar and navigation controls
 */

import SwiftUI

struct BrowserToolbarView: View {
    @EnvironmentObject var appState: AppState
    @ObservedObject var viewModel: BrowserViewModel
    @Binding var showingTabSwitcher: Bool
    @Binding var showingShareSheet: Bool

    var body: some View {
        VStack(spacing: 8) {
            AddressBar(
                url: appState.activeTab?.url.absoluteString ?? "",
                isLoading: appState.activeTab?.isLoading ?? false,
                isSecure: appState.activeTab?.url.scheme == "https",
                isAIActive: appState.isAIActive,
                onSubmit: { urlString in
                    viewModel.navigate(to: urlString)
                }
            )
            .padding(.horizontal)

            NavigationBarView(
                canGoBack: appState.activeTab?.canGoBack ?? false,
                canGoForward: appState.activeTab?.canGoForward ?? false,
                tabCount: appState.tabCount,
                onBack: { viewModel.goBack() },
                onForward: { viewModel.goForward() },
                onReload: { viewModel.reload() },
                onShare: { showingShareSheet = true },
                onTabs: { showingTabSwitcher = true }
            )
        }
        .padding(.vertical, 8)
        .background(.ultraThinMaterial)
    }
}

// MARK: - Address Bar
struct AddressBar: View {
    let url: String
    let isLoading: Bool
    let isSecure: Bool
    let isAIActive: Bool
    let onSubmit: (String) -> Void

    @State private var inputValue: String = ""
    @State private var isFocused: Bool = false
    @FocusState private var isTextFieldFocused: Bool

    var body: some View {
        HStack(spacing: 12) {
            statusIcon

            TextField("Search or enter URL", text: $inputValue)
                .textFieldStyle(.plain)
                .font(.system(size: 16))
                .autocapitalization(.none)
                .autocorrectionDisabled()
                .keyboardType(.webSearch)
                .submitLabel(.go)
                .focused($isTextFieldFocused)
                .onSubmit {
                    submitURL()
                }
                .onChange(of: isTextFieldFocused) { _, focused in
                    isFocused = focused
                    if focused {
                        inputValue = url
                    }
                }

            if isFocused && !inputValue.isEmpty {
                Button {
                    inputValue = ""
                } label: {
                    Image(systemName: "xmark.circle.fill")
                        .foregroundColor(.orionTextTertiary)
                }
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .background(
            RoundedRectangle(cornerRadius: 12)
                .fill(Color.orionSurface)
                .stroke(isFocused ? Color.orionAccent : Color.orionBorder, lineWidth: 1)
        )
        .onAppear {
            inputValue = formatDisplayURL(url)
        }
        .onChange(of: url) { _, newURL in
            if !isFocused {
                inputValue = formatDisplayURL(newURL)
            }
        }
    }

    private func formatDisplayURL(_ urlString: String) -> String {
        urlString
            .replacingOccurrences(of: "https://", with: "")
            .replacingOccurrences(of: "http://", with: "")
            .trimmingCharacters(in: CharacterSet(charactersIn: "/"))
    }

    @ViewBuilder
    private var statusIcon: some View {
        Group {
            if isLoading {
                ProgressView()
                    .scaleEffect(0.8)
            } else if isAIActive {
                Image(systemName: "sparkles")
                    .foregroundColor(.orionAccent)
                    .symbolEffect(.pulse)
            } else {
                Image(systemName: isSecure ? "lock.fill" : "globe")
                    .foregroundColor(isSecure ? .green : .orionTextSecondary)
            }
        }
        .frame(width: 20)
    }

    private func submitURL() {
        var finalURL = inputValue.trimmingCharacters(in: .whitespacesAndNewlines)

        if !finalURL.contains("://") {
            if finalURL.contains(".") && !finalURL.contains(" ") {
                finalURL = "https://\(finalURL)"
            } else {
                finalURL = "https://www.google.com/search?q=\(finalURL.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? finalURL)"
            }
        }

        onSubmit(finalURL)
        isTextFieldFocused = false
    }
}

// MARK: - Navigation Bar
struct NavigationBarView: View {
    let canGoBack: Bool
    let canGoForward: Bool
    let tabCount: Int
    let onBack: () -> Void
    let onForward: () -> Void
    let onReload: () -> Void
    let onShare: () -> Void
    let onTabs: () -> Void

    var body: some View {
        HStack(spacing: 0) {
            navigationButton(icon: "chevron.backward", enabled: canGoBack, action: onBack)
            navigationButton(icon: "chevron.forward", enabled: canGoForward, action: onForward)
            Spacer()
            navigationButton(icon: "square.and.arrow.up", enabled: true, action: onShare)
            tabsButton
            navigationButton(icon: "arrow.clockwise", enabled: true, action: onReload)
        }
        .padding(.horizontal)
    }

    private func navigationButton(icon: String, enabled: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: icon)
                .font(.system(size: 20, weight: .medium))
                .foregroundColor(enabled ? .orionPrimary : .orionTextTertiary)
                .frame(width: 44, height: 44)
        }
        .disabled(!enabled)
    }

    private var tabsButton: some View {
        Button(action: onTabs) {
            ZStack {
                RoundedRectangle(cornerRadius: 6)
                    .stroke(Color.orionPrimary, lineWidth: 2)
                    .frame(width: 24, height: 24)

                Text("\(tabCount)")
                    .font(.system(size: 12, weight: .bold))
                    .foregroundColor(.orionPrimary)
            }
            .frame(width: 44, height: 44)
        }
    }
}
