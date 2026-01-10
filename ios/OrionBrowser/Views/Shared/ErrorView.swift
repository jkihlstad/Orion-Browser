/**
 * ErrorView.swift
 * Reusable error display
 */

import SwiftUI

struct ErrorView: View {
    let error: Error
    let retryAction: (() async -> Void)?

    init(error: Error, retryAction: (() async -> Void)? = nil) {
        self.error = error
        self.retryAction = retryAction
    }

    var body: some View {
        VStack(spacing: 24) {
            // Icon
            Image(systemName: "exclamationmark.triangle")
                .font(.system(size: 48, weight: .thin))
                .foregroundColor(.orange)

            // Content
            VStack(spacing: 8) {
                Text("Something went wrong")
                    .font(.title3)
                    .fontWeight(.semibold)

                Text(error.localizedDescription)
                    .font(.subheadline)
                    .foregroundColor(.orionTextSecondary)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 32)
            }

            // Retry button
            if let retryAction = retryAction {
                Button {
                    Task {
                        await retryAction()
                    }
                } label: {
                    Label("Try Again", systemImage: "arrow.clockwise")
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

// MARK: - Network Error View
struct NetworkErrorView: View {
    let retryAction: () async -> Void

    var body: some View {
        VStack(spacing: 24) {
            Image(systemName: "wifi.slash")
                .font(.system(size: 48, weight: .thin))
                .foregroundColor(.orionTextTertiary)

            VStack(spacing: 8) {
                Text("No Connection")
                    .font(.title3)
                    .fontWeight(.semibold)

                Text("Please check your internet connection and try again.")
                    .font(.subheadline)
                    .foregroundColor(.orionTextSecondary)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 32)
            }

            Button {
                Task {
                    await retryAction()
                }
            } label: {
                Label("Retry", systemImage: "arrow.clockwise")
                    .font(.headline)
            }
            .buttonStyle(.borderedProminent)
            .tint(.orionAccent)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color.orionBackground)
    }
}

// MARK: - Inline Error Banner
struct ErrorBanner: View {
    let message: String
    let onDismiss: () -> Void

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: "exclamationmark.circle.fill")
                .foregroundColor(.red)

            Text(message)
                .font(.subheadline)
                .foregroundColor(.white)

            Spacer()

            Button(action: onDismiss) {
                Image(systemName: "xmark")
                    .foregroundColor(.white.opacity(0.7))
            }
        }
        .padding()
        .background(Color.red.opacity(0.9))
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .shadow(color: .black.opacity(0.1), radius: 8)
    }
}

#Preview {
    VStack(spacing: 32) {
        ErrorView(
            error: NSError(domain: "Preview", code: -1, userInfo: [NSLocalizedDescriptionKey: "This is a preview error message"]),
            retryAction: {}
        )

        ErrorBanner(message: "Failed to save changes", onDismiss: {})
            .padding()
    }
}
