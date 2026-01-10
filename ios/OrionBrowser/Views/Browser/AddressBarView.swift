/**
 * AddressBarView.swift
 * Glass-styled address bar with globe icon, URL input, and AI sparkles button
 * Uses Liquid Glass Design System components
 */

import SwiftUI

// MARK: - AddressBarView
public struct AddressBarView: View {
    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.accessibilityReduceTransparency) private var reduceTransparency

    // MARK: - Properties
    @Binding var urlString: String
    let isLoading: Bool
    let isSecure: Bool
    let isAIActive: Bool
    let onSubmit: (String) -> Void
    let onAskAI: () -> Void

    // MARK: - State
    @State private var inputValue: String = ""
    @State private var isFocused: Bool = false
    @FocusState private var isTextFieldFocused: Bool

    // MARK: - Initialization
    public init(
        urlString: Binding<String>,
        isLoading: Bool = false,
        isSecure: Bool = false,
        isAIActive: Bool = false,
        onSubmit: @escaping (String) -> Void,
        onAskAI: @escaping () -> Void
    ) {
        self._urlString = urlString
        self.isLoading = isLoading
        self.isSecure = isSecure
        self.isAIActive = isAIActive
        self.onSubmit = onSubmit
        self.onAskAI = onAskAI
    }

    // MARK: - Body
    public var body: some View {
        HStack(spacing: GlassTokens.Spacing.md) {
            statusIcon

            urlTextField

            trailingButtons
        }
        .padding(.horizontal, GlassTokens.Spacing.lg)
        .padding(.vertical, GlassTokens.Spacing.md)
        .background(glassBackground)
        .overlay(glassStroke)
        .glassShadow(for: colorScheme, style: isFocused ? .glow(.neonBlue) : .subtle)
        .glassAnimation(value: isFocused)
        .onAppear {
            inputValue = formatDisplayURL(urlString)
        }
        .onChange(of: urlString) { _, newURL in
            if !isFocused {
                inputValue = formatDisplayURL(newURL)
            }
        }
    }

    // MARK: - Status Icon
    @ViewBuilder
    private var statusIcon: some View {
        Group {
            if isLoading {
                ProgressView()
                    .scaleEffect(0.8)
                    .tint(colorScheme == .dark ? .white : .primary)
            } else if isAIActive {
                Image(systemName: "sparkles")
                    .font(.system(size: 16, weight: .medium))
                    .foregroundStyle(Color.neonGradient)
                    .symbolEffect(.pulse)
            } else {
                Image(systemName: isSecure ? "lock.fill" : "globe")
                    .font(.system(size: 16, weight: .medium))
                    .foregroundColor(isSecure ? .green : .secondary)
            }
        }
        .frame(width: 24)
        .transition(.scale.combined(with: .opacity))
        .animation(GlassMotion.Spring.quick, value: isLoading)
        .animation(GlassMotion.Spring.quick, value: isAIActive)
    }

    // MARK: - URL TextField
    private var urlTextField: some View {
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
                withAnimation(GlassMotion.Spring.standard) {
                    isFocused = focused
                }
                if focused {
                    inputValue = urlString
                }
            }
    }

    // MARK: - Trailing Buttons
    @ViewBuilder
    private var trailingButtons: some View {
        HStack(spacing: GlassTokens.Spacing.sm) {
            // Clear button when focused and has text
            if isFocused && !inputValue.isEmpty {
                Button {
                    withAnimation(GlassMotion.Spring.quick) {
                        inputValue = ""
                    }
                } label: {
                    Image(systemName: "xmark.circle.fill")
                        .font(.system(size: 18))
                        .foregroundColor(.secondary)
                }
                .transition(.scale.combined(with: .opacity))
            }

            // AI Sparkles button
            aiButton
        }
    }

    // MARK: - AI Button
    private var aiButton: some View {
        Button {
            onAskAI()
        } label: {
            ZStack {
                // Glow background when AI is active
                if isAIActive {
                    Circle()
                        .fill(Color.neonPurple.opacity(0.3))
                        .frame(width: 36, height: 36)
                        .blur(radius: 8)
                }

                Image(systemName: "sparkles")
                    .font(.system(size: 18, weight: .medium))
                    .foregroundStyle(
                        isAIActive
                            ? AnyShapeStyle(Color.neonGradient)
                            : AnyShapeStyle(Color.secondary)
                    )
                    .frame(width: 36, height: 36)
                    .background(
                        Circle()
                            .fill(colorScheme == .dark ? Material.ultraThinMaterial : Material.thinMaterial)
                    )
                    .overlay(
                        Circle()
                            .stroke(
                                isAIActive ? Color.neonPurple.opacity(0.5) : Color.glassStroke(for: colorScheme),
                                lineWidth: GlassTokens.Stroke.thin
                            )
                    )
            }
        }
        .buttonStyle(.plain)
        .glassPressEffect(isPressed: false)
    }

    // MARK: - Glass Background
    @ViewBuilder
    private var glassBackground: some View {
        if reduceTransparency {
            RoundedRectangle(cornerRadius: GlassTokens.CornerRadius.input, style: .continuous)
                .fill(Color(.secondarySystemBackground))
        } else {
            RoundedRectangle(cornerRadius: GlassTokens.CornerRadius.input, style: .continuous)
                .fill(colorScheme == .dark ? .ultraThinMaterial : .regularMaterial)
        }
    }

    // MARK: - Glass Stroke
    private var glassStroke: some View {
        RoundedRectangle(cornerRadius: GlassTokens.CornerRadius.input, style: .continuous)
            .stroke(strokeColor, lineWidth: GlassTokens.Stroke.standard)
    }

    private var strokeColor: Color {
        if isFocused {
            return .neonBlue.opacity(0.6)
        }
        return Color.glassStroke(for: colorScheme)
    }

    // MARK: - URL Formatting
    private func formatDisplayURL(_ urlString: String) -> String {
        urlString
            .replacingOccurrences(of: "https://", with: "")
            .replacingOccurrences(of: "http://", with: "")
            .trimmingCharacters(in: CharacterSet(charactersIn: "/"))
    }

    // MARK: - Submit URL
    private func submitURL() {
        var finalURL = inputValue.trimmingCharacters(in: .whitespacesAndNewlines)

        if !finalURL.contains("://") {
            if finalURL.contains(".") && !finalURL.contains(" ") {
                finalURL = "https://\(finalURL)"
            } else {
                let encoded = finalURL.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? finalURL
                finalURL = "https://www.google.com/search?q=\(encoded)"
            }
        }

        onSubmit(finalURL)
        isTextFieldFocused = false
    }
}

// MARK: - Compact Address Bar Variant
/// A more compact version of the address bar for space-constrained layouts
public struct CompactAddressBarView: View {
    @Environment(\.colorScheme) private var colorScheme

    let displayURL: String
    let isSecure: Bool
    let isAIActive: Bool
    let onTap: () -> Void
    let onAskAI: () -> Void

    public var body: some View {
        HStack(spacing: GlassTokens.Spacing.sm) {
            // Status icon
            Image(systemName: isSecure ? "lock.fill" : "globe")
                .font(.system(size: 12, weight: .medium))
                .foregroundColor(isSecure ? .green : .secondary)

            // Truncated URL
            Text(displayURL)
                .font(.system(size: 14))
                .lineLimit(1)
                .truncationMode(.middle)
                .foregroundColor(.primary)

            Spacer()

            // AI button
            Button(action: onAskAI) {
                Image(systemName: "sparkles")
                    .font(.system(size: 14, weight: .medium))
                    .foregroundStyle(
                        isAIActive
                            ? AnyShapeStyle(Color.neonGradient)
                            : AnyShapeStyle(Color.secondary)
                    )
            }
        }
        .padding(.horizontal, GlassTokens.Spacing.md)
        .padding(.vertical, GlassTokens.Spacing.sm)
        .background(
            RoundedRectangle(cornerRadius: GlassTokens.CornerRadius.small, style: .continuous)
                .fill(colorScheme == .dark ? Material.ultraThinMaterial : Material.thinMaterial)
        )
        .overlay(
            RoundedRectangle(cornerRadius: GlassTokens.CornerRadius.small, style: .continuous)
                .stroke(Color.glassStroke(for: colorScheme), lineWidth: GlassTokens.Stroke.thin)
        )
        .contentShape(Rectangle())
        .onTapGesture {
            onTap()
        }
    }
}

// MARK: - Previews
#if DEBUG
#Preview("AddressBarView - Empty") {
    GlassPreviewContainer {
        VStack(spacing: 20) {
            AddressBarView(
                urlString: .constant(""),
                isLoading: false,
                isSecure: false,
                isAIActive: false,
                onSubmit: { _ in },
                onAskAI: { }
            )

            AddressBarView(
                urlString: .constant("https://apple.com/iphone"),
                isLoading: false,
                isSecure: true,
                isAIActive: false,
                onSubmit: { _ in },
                onAskAI: { }
            )

            AddressBarView(
                urlString: .constant("https://github.com"),
                isLoading: true,
                isSecure: true,
                isAIActive: false,
                onSubmit: { _ in },
                onAskAI: { }
            )

            AddressBarView(
                urlString: .constant("https://openai.com"),
                isLoading: false,
                isSecure: true,
                isAIActive: true,
                onSubmit: { _ in },
                onAskAI: { }
            )
        }
        .padding()
    }
}

#Preview("AddressBarView - Dark") {
    GlassPreviewContainer {
        VStack(spacing: 20) {
            AddressBarView(
                urlString: .constant("https://apple.com"),
                isLoading: false,
                isSecure: true,
                isAIActive: false,
                onSubmit: { _ in },
                onAskAI: { }
            )

            AddressBarView(
                urlString: .constant("https://developer.apple.com/swift"),
                isLoading: false,
                isSecure: true,
                isAIActive: true,
                onSubmit: { _ in },
                onAskAI: { }
            )
        }
        .padding()
    }
    .preferredColorScheme(.dark)
}

#Preview("CompactAddressBarView") {
    GlassPreviewContainer {
        VStack(spacing: 16) {
            CompactAddressBarView(
                displayURL: "apple.com/iphone/compare",
                isSecure: true,
                isAIActive: false,
                onTap: { },
                onAskAI: { }
            )

            CompactAddressBarView(
                displayURL: "github.com/apple/swift",
                isSecure: true,
                isAIActive: true,
                onTap: { },
                onAskAI: { }
            )
        }
        .padding()
    }
}
#endif
