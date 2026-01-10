/**
 * GlassComponents.swift
 * Backward-compatible glass surface components with shadow style support.
 * Uses GlassShadowStyle from GlassTokens.swift
 */

import SwiftUI

// MARK: - GlassCard (back-compat init signature)
// Supports: cornerRadius, padding, shadowStyle, plus plain init.
struct GlassCard<Content: View>: View {
    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.accessibilityReduceTransparency) private var reduceTransparency

    let cornerRadius: CGFloat
    let padding: CGFloat
    let shadowStyle: GlassShadowStyle
    let content: Content

    init(
        cornerRadius: CGFloat = 18,
        padding: CGFloat = 12,
        shadowStyle: GlassShadowStyle = .standard,
        @ViewBuilder content: () -> Content
    ) {
        self.cornerRadius = cornerRadius
        self.padding = padding
        self.shadowStyle = shadowStyle
        self.content = content()
    }

    var body: some View {
        content
            .padding(padding)
            .background(backgroundLayer)
            .clipShape(RoundedRectangle(cornerRadius: cornerRadius, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                    .stroke(strokeColor, lineWidth: 1)
            )
            .glassShadow(for: colorScheme, style: shadowStyle)
    }

    @ViewBuilder
    private var backgroundLayer: some View {
        if reduceTransparency {
            Color(.secondarySystemBackground)
        } else {
            Rectangle().fill(colorScheme == .dark ? .ultraThinMaterial : .regularMaterial)
        }
    }

    private var strokeColor: Color {
        colorScheme == .dark ? Color.white.opacity(0.12) : Color.black.opacity(0.08)
    }
}

// MARK: - GlassSurface (alias for GlassCard)
typealias GlassSurface<Content: View> = GlassCard<Content>

// MARK: - GlassDivider (back-compat)
struct GlassDivider: View {
    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        Rectangle()
            .fill(colorScheme == .dark ? Color.white.opacity(0.10) : Color.black.opacity(0.08))
            .frame(height: 1 / UIScreen.main.scale)
    }
}

// MARK: - Glass Button
struct GlassButton: View {
    @Environment(\.colorScheme) private var scheme

    let title: String
    let icon: String?
    let action: () -> Void

    init(_ title: String, icon: String? = nil, action: @escaping () -> Void) {
        self.title = title
        self.icon = icon
        self.action = action
    }

    var body: some View {
        Button(action: action) {
            GlassCard(cornerRadius: 12, padding: 10) {
                HStack(spacing: 8) {
                    if let icon = icon {
                        Image(systemName: icon)
                    }
                    Text(title)
                }
            }
        }
        .buttonStyle(.plain)
    }
}

// MARK: - Glass TextField
struct GlassTextField: View {
    @Environment(\.colorScheme) private var scheme

    @Binding var text: String
    let placeholder: String
    let icon: String?

    init(_ placeholder: String, text: Binding<String>, icon: String? = nil) {
        self.placeholder = placeholder
        self._text = text
        self.icon = icon
    }

    var body: some View {
        GlassCard(cornerRadius: 12, padding: 10) {
            HStack(spacing: 8) {
                if let icon = icon {
                    Image(systemName: icon)
                        .foregroundStyle(.secondary)
                }
                TextField(placeholder, text: $text)
            }
        }
    }
}

// MARK: - Glass Overlay
struct GlassOverlay<Content: View>: View {
    @Environment(\.colorScheme) private var scheme
    @Environment(\.accessibilityReduceTransparency) private var reduceTransparency

    let cornerRadius: CGFloat
    let content: Content

    init(cornerRadius: CGFloat = 0, @ViewBuilder content: () -> Content) {
        self.cornerRadius = cornerRadius
        self.content = content()
    }

    var body: some View {
        ZStack {
            if reduceTransparency {
                Color(.systemBackground).opacity(0.95)
            } else {
                Rectangle().fill(.ultraThinMaterial)
            }
            content
        }
        .clipShape(RoundedRectangle(cornerRadius: cornerRadius, style: .continuous))
    }
}

// NOTE: GlassTokens, GlassMotion, and GlassShadowStyle are defined in GlassTokens.swift
