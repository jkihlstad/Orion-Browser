/**
 * GlassTokens.swift
 * Apple-style Liquid Glass Design System tokens
 * Provides adaptive materials, colors, and dimensional constants
 */

import SwiftUI

// MARK: - Glass Design Tokens
public enum GlassTokens {

    // MARK: - Corner Radius
    public enum CornerRadius {
        /// Card corner radius - 18pt
        public static let card: CGFloat = 18
        /// Button corner radius - 12pt
        public static let button: CGFloat = 12
        /// Small elements - 8pt
        public static let small: CGFloat = 8
        /// Pill/capsule shape
        public static let pill: CGFloat = 9999
        /// Input field radius - 14pt
        public static let input: CGFloat = 14
        /// Modal/sheet radius - 24pt
        public static let modal: CGFloat = 24
    }

    // MARK: - Stroke
    public enum Stroke {
        /// Standard stroke width - 1pt
        public static let standard: CGFloat = 1
        /// Thick stroke width - 1.5pt
        public static let thick: CGFloat = 1.5
        /// Thin stroke width - 0.5pt
        public static let thin: CGFloat = 0.5
    }

    // MARK: - Shadow Opacity
    public enum ShadowOpacity {
        /// Dark mode shadow opacity - 0.35
        public static let dark: Double = 0.35
        /// Light mode shadow opacity - 0.12
        public static let light: Double = 0.12
        /// Glow effect opacity
        public static let glow: Double = 0.25
    }

    // MARK: - Blur Radius
    public enum BlurRadius {
        /// Standard glass blur
        public static let standard: CGFloat = 20
        /// Subtle glass blur
        public static let subtle: CGFloat = 10
        /// Heavy glass blur
        public static let heavy: CGFloat = 40
    }

    // MARK: - Animation Durations
    public enum Duration {
        /// Quick interactions - 0.2s
        public static let quick: Double = 0.2
        /// Standard transitions - 0.3s
        public static let standard: Double = 0.3
        /// Slow/emphasis transitions - 0.5s
        public static let slow: Double = 0.5
        /// Morph effect - 0.4s
        public static let morph: Double = 0.4
    }

    // MARK: - Spacing
    public enum Spacing {
        public static let xxs: CGFloat = 2
        public static let xs: CGFloat = 4
        public static let sm: CGFloat = 8
        public static let md: CGFloat = 12
        public static let lg: CGFloat = 16
        public static let xl: CGFloat = 24
        public static let xxl: CGFloat = 32
        public static let xxxl: CGFloat = 48
    }
}

// MARK: - Glass Material Configuration
public struct GlassMaterialConfig {
    let material: Material
    let strokeColor: Color
    let strokeOpacity: Double
    let shadowRadius: CGFloat
    let shadowOpacity: Double

    public static func adaptive(colorScheme: ColorScheme, reduceTransparency: Bool) -> GlassMaterialConfig {
        if reduceTransparency {
            return GlassMaterialConfig(
                material: .bar,
                strokeColor: .primary,
                strokeOpacity: 0.2,
                shadowRadius: 8,
                shadowOpacity: colorScheme == .dark ? 0.3 : 0.1
            )
        }

        return GlassMaterialConfig(
            material: colorScheme == .dark ? .ultraThinMaterial : .thinMaterial,
            strokeColor: .white,
            strokeOpacity: colorScheme == .dark ? 0.15 : 0.5,
            shadowRadius: 16,
            shadowOpacity: colorScheme == .dark ? GlassTokens.ShadowOpacity.dark : GlassTokens.ShadowOpacity.light
        )
    }
}

// MARK: - Neon Accent Colors
public extension Color {
    // Primary neon accents
    static let neonBlue = Color(red: 0.0, green: 0.48, blue: 1.0)
    static let neonPurple = Color(red: 0.69, green: 0.35, blue: 1.0)
    static let neonPink = Color(red: 1.0, green: 0.35, blue: 0.69)
    static let neonCyan = Color(red: 0.0, green: 0.89, blue: 0.89)
    static let neonGreen = Color(red: 0.35, green: 1.0, blue: 0.55)
    static let neonOrange = Color(red: 1.0, green: 0.62, blue: 0.0)

    // Glass-specific colors
    static let glassStrokeLight = Color.white.opacity(0.5)
    static let glassStrokeDark = Color.white.opacity(0.15)
    static let glassFillLight = Color.white.opacity(0.7)
    static let glassFillDark = Color.white.opacity(0.08)

    // Gradient helpers
    static var neonGradient: LinearGradient {
        LinearGradient(
            colors: [.neonBlue, .neonPurple],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        )
    }

    static var neonAccentGradient: LinearGradient {
        LinearGradient(
            colors: [.neonCyan, .neonBlue],
            startPoint: .leading,
            endPoint: .trailing
        )
    }

    // Adaptive glass stroke
    static func glassStroke(for colorScheme: ColorScheme) -> Color {
        colorScheme == .dark ? glassStrokeDark : glassStrokeLight
    }

    // Adaptive glass fill (for non-material contexts)
    static func glassFill(for colorScheme: ColorScheme) -> Color {
        colorScheme == .dark ? glassFillDark : glassFillLight
    }
}

// MARK: - Glass Shadow Configuration
public struct GlassShadow {
    public let color: Color
    public let radius: CGFloat
    public let x: CGFloat
    public let y: CGFloat

    public static func standard(for colorScheme: ColorScheme) -> GlassShadow {
        GlassShadow(
            color: .black.opacity(colorScheme == .dark ? GlassTokens.ShadowOpacity.dark : GlassTokens.ShadowOpacity.light),
            radius: 16,
            x: 0,
            y: 8
        )
    }

    public static func subtle(for colorScheme: ColorScheme) -> GlassShadow {
        GlassShadow(
            color: .black.opacity(colorScheme == .dark ? 0.2 : 0.08),
            radius: 8,
            x: 0,
            y: 4
        )
    }

    public static func glow(color: Color) -> GlassShadow {
        GlassShadow(
            color: color.opacity(GlassTokens.ShadowOpacity.glow),
            radius: 20,
            x: 0,
            y: 0
        )
    }
}

// MARK: - View Modifier for Shadow Application
public extension View {
    func glassShadow(_ shadow: GlassShadow) -> some View {
        self.shadow(color: shadow.color, radius: shadow.radius, x: shadow.x, y: shadow.y)
    }

    func glassShadow(for colorScheme: ColorScheme, style: GlassShadowStyle = .standard) -> some View {
        let shadow: GlassShadow
        switch style {
        case .standard:
            shadow = .standard(for: colorScheme)
        case .subtle:
            shadow = .subtle(for: colorScheme)
        case .glow(let color):
            shadow = .glow(color: color)
        }
        return self.shadow(color: shadow.color, radius: shadow.radius, x: shadow.x, y: shadow.y)
    }
}

public enum GlassShadowStyle {
    case standard
    case subtle
    case glow(Color)
}

// MARK: - Accessibility Support
public struct GlassAccessibility {
    /// Returns true if reduce transparency is enabled
    public static var reduceTransparency: Bool {
        UIAccessibility.isReduceTransparencyEnabled
    }

    /// Returns true if reduce motion is enabled
    public static var reduceMotion: Bool {
        UIAccessibility.isReduceMotionEnabled
    }

    /// Returns appropriate material based on accessibility settings
    public static func adaptiveMaterial(for colorScheme: ColorScheme) -> Material {
        if reduceTransparency {
            return .bar
        }
        return colorScheme == .dark ? .ultraThinMaterial : .thinMaterial
    }
}

// MARK: - Environment Key for Glass Configuration
private struct GlassConfigurationKey: EnvironmentKey {
    static let defaultValue: GlassMaterialConfig = .adaptive(colorScheme: .light, reduceTransparency: false)
}

public extension EnvironmentValues {
    var glassConfig: GlassMaterialConfig {
        get { self[GlassConfigurationKey.self] }
        set { self[GlassConfigurationKey.self] = newValue }
    }
}

// MARK: - Preview Helpers
#if DEBUG
/// Top-level preview container to avoid Swift visibility issues with nested types in extensions
public struct GlassPreviewContainer<Content: View>: View {
    let content: Content
    @Environment(\.colorScheme) private var colorScheme

    public init(@ViewBuilder content: () -> Content) {
        self.content = content()
    }

    public var body: some View {
        ZStack {
            // Dynamic background
            LinearGradient(
                colors: colorScheme == .dark
                    ? [Color(white: 0.1), Color(white: 0.05)]
                    : [Color(white: 0.95), Color(white: 0.85)],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
            .ignoresSafeArea()

            content
        }
    }
}

public extension GlassTokens {
    /// Typealias for backward compatibility
    typealias PreviewContainer = GlassPreviewContainer
}

#Preview("Glass Tokens - Light") {
    GlassPreviewContainer {
        VStack(spacing: 20) {
            RoundedRectangle(cornerRadius: GlassTokens.CornerRadius.card)
                .fill(.thinMaterial)
                .frame(height: 100)
                .overlay(
                    RoundedRectangle(cornerRadius: GlassTokens.CornerRadius.card)
                        .stroke(Color.glassStrokeLight, lineWidth: GlassTokens.Stroke.standard)
                )
                .padding()

            Text("Liquid Glass Design")
                .font(.title2)
                .fontWeight(.semibold)
        }
    }
    .preferredColorScheme(.light)
}

#Preview("Glass Tokens - Dark") {
    GlassPreviewContainer {
        VStack(spacing: 20) {
            RoundedRectangle(cornerRadius: GlassTokens.CornerRadius.card)
                .fill(.ultraThinMaterial)
                .frame(height: 100)
                .overlay(
                    RoundedRectangle(cornerRadius: GlassTokens.CornerRadius.card)
                        .stroke(Color.glassStrokeDark, lineWidth: GlassTokens.Stroke.standard)
                )
                .padding()

            Text("Liquid Glass Design")
                .font(.title2)
                .fontWeight(.semibold)
        }
    }
    .preferredColorScheme(.dark)
}
#endif
