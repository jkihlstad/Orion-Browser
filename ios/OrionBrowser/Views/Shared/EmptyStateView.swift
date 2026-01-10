/**
 * EmptyStateView.swift
 * Reusable empty state display
 */

import SwiftUI

struct EmptyStateView: View {
    let icon: String
    let title: String
    let message: String?
    let actionTitle: String?
    let action: (() -> Void)?

    init(
        icon: String,
        title: String,
        message: String? = nil,
        actionTitle: String? = nil,
        action: (() -> Void)? = nil
    ) {
        self.icon = icon
        self.title = title
        self.message = message
        self.actionTitle = actionTitle
        self.action = action
    }

    var body: some View {
        VStack(spacing: 24) {
            // Icon
            Image(systemName: icon)
                .font(.system(size: 64, weight: .thin))
                .foregroundColor(.orionTextTertiary)

            // Content
            VStack(spacing: 8) {
                Text(title)
                    .font(.title3)
                    .fontWeight(.semibold)

                if let message = message {
                    Text(message)
                        .font(.subheadline)
                        .foregroundColor(.orionTextSecondary)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, 32)
                }
            }

            // Action button
            if let actionTitle = actionTitle, let action = action {
                Button(action: action) {
                    Label(actionTitle, systemImage: "plus")
                        .font(.headline)
                        .padding(.horizontal, 24)
                        .padding(.vertical, 12)
                }
                .buttonStyle(.borderedProminent)
                .tint(.orionAccent)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color.orionBackground)
    }
}

// MARK: - Search Empty State
struct SearchEmptyStateView: View {
    let searchText: String

    var body: some View {
        EmptyStateView(
            icon: "magnifyingglass",
            title: "No Results",
            message: "No results found for \"\(searchText)\". Try a different search term."
        )
    }
}

// MARK: - No Content Empty State
struct NoContentEmptyStateView: View {
    let contentType: String
    let actionTitle: String?
    let action: (() -> Void)?

    init(contentType: String, actionTitle: String? = nil, action: (() -> Void)? = nil) {
        self.contentType = contentType
        self.actionTitle = actionTitle
        self.action = action
    }

    var body: some View {
        EmptyStateView(
            icon: iconForContentType,
            title: "No \(contentType)",
            message: messageForContentType,
            actionTitle: actionTitle,
            action: action
        )
    }

    private var iconForContentType: String {
        switch contentType.lowercased() {
        case "bookmarks": return "bookmark"
        case "downloads": return "arrow.down.circle"
        case "history": return "clock"
        case "tabs": return "square.on.square"
        default: return "doc"
        }
    }

    private var messageForContentType: String {
        switch contentType.lowercased() {
        case "bookmarks": return "Save your favorite pages for quick access"
        case "downloads": return "Downloaded files will appear here"
        case "history": return "Your browsing history will appear here"
        case "tabs": return "Open a new tab to start browsing"
        default: return "Content will appear here"
        }
    }
}

// MARK: - Animated Empty State
struct AnimatedEmptyStateView: View {
    let icon: String
    let title: String
    let message: String

    @State private var isAnimating = false

    var body: some View {
        VStack(spacing: 24) {
            Image(systemName: icon)
                .font(.system(size: 64, weight: .thin))
                .foregroundColor(.orionTextTertiary)
                .symbolEffect(.pulse, options: .repeating, value: isAnimating)

            VStack(spacing: 8) {
                Text(title)
                    .font(.title3)
                    .fontWeight(.semibold)

                Text(message)
                    .font(.subheadline)
                    .foregroundColor(.orionTextSecondary)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 32)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color.orionBackground)
        .onAppear {
            isAnimating = true
        }
    }
}

#Preview {
    VStack {
        EmptyStateView(
            icon: "globe",
            title: "No tabs open",
            message: "Start browsing the web",
            actionTitle: "New Tab",
            action: {}
        )
    }
}
