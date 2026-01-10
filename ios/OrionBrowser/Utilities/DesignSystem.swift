/**
 * DesignSystem.swift
 * App-wide design tokens and color palette
 */

import SwiftUI

// MARK: - Color Extensions
extension Color {
    // Primary Colors
    static let orionPrimary = Color("OrionPrimary", bundle: nil)
    static let orionAccent = Color("OrionAccent", bundle: nil)

    // Background Colors
    static let orionBackground = Color("OrionBackground", bundle: nil)
    static let orionSurface = Color("OrionSurface", bundle: nil)
    static let orionSurfaceElevated = Color("OrionSurfaceElevated", bundle: nil)

    // Text Colors
    static let orionText = Color("OrionText", bundle: nil)
    static let orionTextSecondary = Color("OrionTextSecondary", bundle: nil)
    static let orionTextTertiary = Color("OrionTextTertiary", bundle: nil)

    // Border Colors
    static let orionBorder = Color("OrionBorder", bundle: nil)

    // Semantic Colors
    static let orionSuccess = Color.green
    static let orionWarning = Color.orange
    static let orionError = Color.red

    // Fallback implementations when asset catalog colors not available
    static func dynamicColor(light: Color, dark: Color) -> Color {
        Color(UIColor { traits in
            traits.userInterfaceStyle == .dark ? UIColor(dark) : UIColor(light)
        })
    }
}

// Default color values when asset catalog not present
extension Color {
    static var orionPrimaryDefault: Color {
        dynamicColor(
            light: Color(red: 0.25, green: 0.47, blue: 0.96),
            dark: Color(red: 0.38, green: 0.58, blue: 1.0)
        )
    }

    static var orionAccentDefault: Color {
        dynamicColor(
            light: Color(red: 0.55, green: 0.36, blue: 0.96),
            dark: Color(red: 0.68, green: 0.51, blue: 1.0)
        )
    }

    static var orionBackgroundDefault: Color {
        dynamicColor(
            light: Color(white: 0.98),
            dark: Color(red: 0.06, green: 0.06, blue: 0.08)
        )
    }

    static var orionSurfaceDefault: Color {
        dynamicColor(
            light: Color.white,
            dark: Color(red: 0.11, green: 0.11, blue: 0.13)
        )
    }

    static var orionSurfaceElevatedDefault: Color {
        dynamicColor(
            light: Color(white: 0.96),
            dark: Color(red: 0.16, green: 0.16, blue: 0.18)
        )
    }

    static var orionTextDefault: Color {
        dynamicColor(
            light: Color(white: 0.1),
            dark: Color(white: 0.95)
        )
    }

    static var orionTextSecondaryDefault: Color {
        dynamicColor(
            light: Color(white: 0.4),
            dark: Color(white: 0.6)
        )
    }

    static var orionTextTertiaryDefault: Color {
        dynamicColor(
            light: Color(white: 0.6),
            dark: Color(white: 0.4)
        )
    }

    static var orionBorderDefault: Color {
        dynamicColor(
            light: Color(white: 0.9),
            dark: Color(white: 0.2)
        )
    }
}

// MARK: - Typography
struct Typography {
    static let largeTitle = Font.system(size: 34, weight: .bold, design: .rounded)
    static let title = Font.system(size: 28, weight: .bold, design: .rounded)
    static let title2 = Font.system(size: 22, weight: .bold, design: .rounded)
    static let title3 = Font.system(size: 20, weight: .semibold, design: .rounded)
    static let headline = Font.system(size: 17, weight: .semibold)
    static let body = Font.system(size: 17, weight: .regular)
    static let callout = Font.system(size: 16, weight: .regular)
    static let subheadline = Font.system(size: 15, weight: .regular)
    static let footnote = Font.system(size: 13, weight: .regular)
    static let caption = Font.system(size: 12, weight: .regular)
    static let caption2 = Font.system(size: 11, weight: .regular)
}

// MARK: - Spacing
struct Spacing {
    static let xxs: CGFloat = 2
    static let xs: CGFloat = 4
    static let sm: CGFloat = 8
    static let md: CGFloat = 12
    static let lg: CGFloat = 16
    static let xl: CGFloat = 24
    static let xxl: CGFloat = 32
    static let xxxl: CGFloat = 48
}

// MARK: - Corner Radius
struct CornerRadius {
    static let sm: CGFloat = 4
    static let md: CGFloat = 8
    static let lg: CGFloat = 12
    static let xl: CGFloat = 16
    static let xxl: CGFloat = 24
    static let full: CGFloat = 9999
}

// MARK: - Shadow Level
enum ShadowLevel {
    case subtle, light, medium, heavy

    var opacity: Double {
        switch self {
        case .subtle: return 0.05
        case .light: return 0.1
        case .medium: return 0.15
        case .heavy: return 0.25
        }
    }

    var radius: CGFloat {
        switch self {
        case .subtle: return 2
        case .light: return 4
        case .medium: return 8
        case .heavy: return 16
        }
    }

    var y: CGFloat {
        switch self {
        case .subtle: return 1
        case .light: return 2
        case .medium: return 4
        case .heavy: return 8
        }
    }
}

// MARK: - Shadows
extension View {
    func orionShadow(level: ShadowLevel = .medium) -> some View {
        self.shadow(
            color: Color.black.opacity(level.opacity),
            radius: level.radius,
            x: 0,
            y: level.y
        )
    }
}

// MARK: - Button Modifiers
extension View {
    func orionPrimaryButtonStyle() -> some View {
        self
            .font(.headline)
            .foregroundColor(.white)
            .padding(.horizontal, Spacing.xl)
            .padding(.vertical, Spacing.md)
            .background(
                RoundedRectangle(cornerRadius: CornerRadius.lg)
                    .fill(Color.orionAccent)
            )
    }

    func orionSecondaryButtonStyle() -> some View {
        self
            .font(.headline)
            .foregroundColor(.orionAccent)
            .padding(.horizontal, Spacing.xl)
            .padding(.vertical, Spacing.md)
            .background(
                RoundedRectangle(cornerRadius: CornerRadius.lg)
                    .stroke(Color.orionAccent, lineWidth: 1.5)
            )
    }
}

// MARK: - Button Style Wrappers (for .buttonStyle usage)
struct OrionPrimaryButtonStyle: ButtonStyle {
    func makeBody(configuration: ButtonStyleConfiguration) -> some View {
        configuration.label
            .orionPrimaryButtonStyle()
            .opacity(configuration.isPressed ? 0.8 : 1.0)
    }
}

struct OrionSecondaryButtonStyle: ButtonStyle {
    func makeBody(configuration: ButtonStyleConfiguration) -> some View {
        configuration.label
            .orionSecondaryButtonStyle()
            .opacity(configuration.isPressed ? 0.8 : 1.0)
    }
}

extension ButtonStyle where Self == OrionPrimaryButtonStyle {
    static var orionPrimary: OrionPrimaryButtonStyle { OrionPrimaryButtonStyle() }
}

extension ButtonStyle where Self == OrionSecondaryButtonStyle {
    static var orionSecondary: OrionSecondaryButtonStyle { OrionSecondaryButtonStyle() }
}

// MARK: - Card Style
struct CardStyle: ViewModifier {
    let padding: CGFloat
    let cornerRadius: CGFloat

    init(padding: CGFloat = Spacing.lg, cornerRadius: CGFloat = CornerRadius.lg) {
        self.padding = padding
        self.cornerRadius = cornerRadius
    }

    func body(content: Content) -> some View {
        content
            .padding(padding)
            .background(Color.orionSurface)
            .cornerRadius(cornerRadius)
            .orionShadow(level: .subtle)
    }
}

extension View {
    func cardStyle(padding: CGFloat = Spacing.lg, cornerRadius: CGFloat = CornerRadius.lg) -> some View {
        modifier(CardStyle(padding: padding, cornerRadius: cornerRadius))
    }
}
