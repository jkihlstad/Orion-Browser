/**
 * Motion.swift
 * Glass morphism animation helpers and transitions
 * Provides smooth glass interactions with accessibility support
 */

import SwiftUI

// MARK: - Glass Animation Namespace
public enum GlassMotion {

    // MARK: - Spring Configurations
    public enum Spring {
        /// Quick, snappy spring for button presses
        public static let quick = SwiftUI.Animation.spring(response: 0.2, dampingFraction: 0.7)

        /// Standard spring for most interactions
        public static let standard = SwiftUI.Animation.spring(response: 0.35, dampingFraction: 0.75)

        /// Smooth spring for larger movements
        public static let smooth = SwiftUI.Animation.spring(response: 0.45, dampingFraction: 0.8)

        /// Bouncy spring for playful interactions
        public static let bouncy = SwiftUI.Animation.spring(response: 0.4, dampingFraction: 0.6)

        /// Gentle spring for subtle effects
        public static let gentle = SwiftUI.Animation.spring(response: 0.5, dampingFraction: 0.85)
    }

    // MARK: - Timing Curves
    public enum Timing {
        /// Quick ease out for fast exits
        public static let quickOut = SwiftUI.Animation.easeOut(duration: GlassTokens.Duration.quick)

        /// Standard ease in-out
        public static let standard = SwiftUI.Animation.easeInOut(duration: GlassTokens.Duration.standard)

        /// Slow ease for emphasis
        public static let slow = SwiftUI.Animation.easeInOut(duration: GlassTokens.Duration.slow)

        /// Morph timing for glass morphism effects
        public static let morph = SwiftUI.Animation.easeInOut(duration: GlassTokens.Duration.morph)
    }
}

// MARK: - Glass Morph Transition
/// A custom transition that morphs with blur and scale
public struct GlassMorphTransition: ViewModifier {
    let isActive: Bool

    public func body(content: Content) -> some View {
        content
            .blur(radius: isActive ? 0 : GlassTokens.BlurRadius.subtle)
            .scaleEffect(isActive ? 1 : 0.95)
            .opacity(isActive ? 1 : 0)
    }
}

public extension AnyTransition {
    /// Glass morph transition with blur and scale
    static var glassMorph: AnyTransition {
        .modifier(
            active: GlassMorphTransition(isActive: false),
            identity: GlassMorphTransition(isActive: true)
        )
    }

    /// Fade with blur effect
    static var fadeBlur: AnyTransition {
        .asymmetric(
            insertion: .modifier(
                active: FadeBlurModifier(blur: GlassTokens.BlurRadius.subtle, opacity: 0),
                identity: FadeBlurModifier(blur: 0, opacity: 1)
            ),
            removal: .modifier(
                active: FadeBlurModifier(blur: GlassTokens.BlurRadius.subtle, opacity: 0),
                identity: FadeBlurModifier(blur: 0, opacity: 1)
            )
        )
    }

    /// Scale with fade for glass cards
    static var glassScale: AnyTransition {
        .asymmetric(
            insertion: .scale(scale: 0.9).combined(with: .opacity),
            removal: .scale(scale: 0.95).combined(with: .opacity)
        )
    }

    /// Slide up with fade for overlays
    static var slideUpFade: AnyTransition {
        .asymmetric(
            insertion: .move(edge: .bottom).combined(with: .opacity),
            removal: .move(edge: .bottom).combined(with: .opacity)
        )
    }

    /// Glass chip insertion
    static var chipInsert: AnyTransition {
        .asymmetric(
            insertion: .scale(scale: 0.8).combined(with: .opacity),
            removal: .scale(scale: 0.9).combined(with: .opacity)
        )
    }
}

// MARK: - Fade Blur Modifier
private struct FadeBlurModifier: ViewModifier {
    let blur: CGFloat
    let opacity: Double

    func body(content: Content) -> some View {
        content
            .blur(radius: blur)
            .opacity(opacity)
    }
}

// MARK: - Animation View Modifiers
public extension View {
    /// Apply glass spring animation
    func glassAnimation<V: Equatable>(_ animation: Animation = GlassMotion.Spring.standard, value: V) -> some View {
        self.animation(GlassAccessibility.reduceMotion ? .none : animation, value: value)
    }

    /// Apply glass morph effect when appearing
    func glassMorphOnAppear() -> some View {
        modifier(GlassMorphOnAppearModifier())
    }

    /// Animate with blur transition
    func blurTransition(isPresented: Bool) -> some View {
        self
            .blur(radius: isPresented ? 0 : GlassTokens.BlurRadius.subtle)
            .opacity(isPresented ? 1 : 0)
            .animation(GlassMotion.Timing.standard, value: isPresented)
    }

    /// Press effect for glass buttons
    func glassPressEffect(isPressed: Bool) -> some View {
        self
            .scaleEffect(isPressed ? 0.96 : 1.0)
            .opacity(isPressed ? 0.9 : 1.0)
            .animation(GlassMotion.Spring.quick, value: isPressed)
    }

    /// Hover/focus glow effect
    func glassGlowEffect(isActive: Bool, color: Color = .neonBlue) -> some View {
        self
            .shadow(
                color: isActive ? color.opacity(0.4) : .clear,
                radius: isActive ? 12 : 0
            )
            .animation(GlassMotion.Spring.standard, value: isActive)
    }

    /// Shimmer loading effect
    func glassShimmer(isLoading: Bool) -> some View {
        modifier(GlassShimmerModifier(isLoading: isLoading))
    }

    /// Pulsing highlight effect
    func glassPulse(isActive: Bool) -> some View {
        modifier(GlassPulseModifier(isActive: isActive))
    }
}

// MARK: - Glass Morph On Appear Modifier
private struct GlassMorphOnAppearModifier: ViewModifier {
    @State private var isVisible = false

    func body(content: Content) -> some View {
        content
            .blur(radius: isVisible ? 0 : GlassTokens.BlurRadius.subtle)
            .scaleEffect(isVisible ? 1 : 0.95)
            .opacity(isVisible ? 1 : 0)
            .onAppear {
                withAnimation(GlassMotion.Spring.smooth) {
                    isVisible = true
                }
            }
    }
}

// MARK: - Glass Shimmer Modifier
private struct GlassShimmerModifier: ViewModifier {
    let isLoading: Bool
    @State private var phase: CGFloat = 0

    func body(content: Content) -> some View {
        content
            .overlay {
                if isLoading && !GlassAccessibility.reduceMotion {
                    GeometryReader { geometry in
                        LinearGradient(
                            colors: [
                                .clear,
                                .white.opacity(0.3),
                                .clear
                            ],
                            startPoint: .leading,
                            endPoint: .trailing
                        )
                        .frame(width: geometry.size.width * 0.5)
                        .offset(x: -geometry.size.width * 0.25 + (geometry.size.width * 1.5 * phase))
                        .animation(
                            .linear(duration: 1.5)
                            .repeatForever(autoreverses: false),
                            value: phase
                        )
                    }
                    .mask(content)
                    .onAppear {
                        phase = 1
                    }
                }
            }
    }
}

// MARK: - Glass Pulse Modifier
private struct GlassPulseModifier: ViewModifier {
    let isActive: Bool
    @State private var isPulsing = false

    func body(content: Content) -> some View {
        content
            .scaleEffect(isActive && isPulsing ? 1.02 : 1.0)
            .opacity(isActive && isPulsing ? 0.9 : 1.0)
            .onChange(of: isActive) { _, newValue in
                if newValue && !GlassAccessibility.reduceMotion {
                    withAnimation(
                        .easeInOut(duration: 0.8)
                        .repeatForever(autoreverses: true)
                    ) {
                        isPulsing = true
                    }
                } else {
                    withAnimation {
                        isPulsing = false
                    }
                }
            }
    }
}

// MARK: - Staggered Animation Helper
public struct StaggeredAnimation {
    public let delay: Double
    public let animation: Animation

    public init(
        index: Int,
        baseDelay: Double = 0.05,
        animation: Animation = GlassMotion.Spring.standard
    ) {
        self.delay = Double(index) * baseDelay
        self.animation = animation.delay(self.delay)
    }
}

public extension View {
    /// Apply staggered animation based on index
    func staggeredAnimation(index: Int, baseDelay: Double = 0.05) -> some View {
        let stagger = StaggeredAnimation(index: index, baseDelay: baseDelay)
        return self.animation(stagger.animation, value: index)
    }
}

// MARK: - Glass Content Transition
public extension View {
    /// Apply glass content transition
    func glassContentTransition() -> some View {
        self.contentTransition(.interpolate)
    }

    /// Apply numbered content transition for streaming text
    func streamingTextTransition() -> some View {
        self.contentTransition(.numericText())
    }
}

// MARK: - Matched Geometry Effect Helper
public struct GlassMatchedGeometryEffect: ViewModifier {
    let id: String
    let namespace: Namespace.ID
    let isSource: Bool

    public func body(content: Content) -> some View {
        content
            .matchedGeometryEffect(id: id, in: namespace, isSource: isSource)
    }
}

public extension View {
    func glassMatchedGeometry(
        id: String,
        namespace: Namespace.ID,
        isSource: Bool = true
    ) -> some View {
        modifier(GlassMatchedGeometryEffect(id: id, namespace: namespace, isSource: isSource))
    }
}

// MARK: - Phase Animator for Complex Sequences
@available(iOS 17.0, *)
public struct GlassPhaseAnimator<Phase: Equatable>: ViewModifier {
    let phases: [Phase]
    let trigger: Bool
    let content: (Phase) -> any ShapeStyle

    public func body(content view: Content) -> some View {
        view
    }
}

// MARK: - Previews
#if DEBUG
#Preview("Glass Transitions") {
    struct TransitionDemo: View {
        @State private var showCard = false

        var body: some View {
            GlassPreviewContainer {
                VStack(spacing: 30) {
                    Button("Toggle Card") {
                        withAnimation(GlassMotion.Spring.smooth) {
                            showCard.toggle()
                        }
                    }
                    .padding()
                    .background(.thinMaterial)
                    .cornerRadius(12)

                    if showCard {
                        GlassCard {
                            VStack {
                                Text("Glass Morph")
                                    .font(.headline)
                                Text("Animated with blur and scale")
                                    .font(.caption)
                                    .foregroundColor(.secondary)
                            }
                        }
                        .transition(.glassMorph)
                    }

                    Spacer()
                }
                .padding()
            }
        }
    }

    return TransitionDemo()
}

#Preview("Shimmer Effect") {
    GlassPreviewContainer {
        VStack(spacing: 20) {
            GlassCard {
                VStack(alignment: .leading, spacing: 8) {
                    RoundedRectangle(cornerRadius: 4)
                        .fill(Color.secondary.opacity(0.3))
                        .frame(height: 16)
                        .frame(width: 120)

                    RoundedRectangle(cornerRadius: 4)
                        .fill(Color.secondary.opacity(0.3))
                        .frame(height: 12)

                    RoundedRectangle(cornerRadius: 4)
                        .fill(Color.secondary.opacity(0.3))
                        .frame(height: 12)
                        .frame(width: 180)
                }
            }
            .glassShimmer(isLoading: true)
        }
        .padding()
    }
}

#Preview("Press Effect") {
    struct PressDemo: View {
        @State private var isPressed = false

        var body: some View {
            GlassPreviewContainer {
                GlassCard {
                    Text("Press and hold")
                        .font(.headline)
                }
                .glassPressEffect(isPressed: isPressed)
                .onLongPressGesture(minimumDuration: .infinity, pressing: { pressing in
                    isPressed = pressing
                }, perform: {})
                .padding()
            }
        }
    }

    return PressDemo()
}
#endif
