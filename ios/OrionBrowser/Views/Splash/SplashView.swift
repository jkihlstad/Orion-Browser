/**
 * SplashView.swift
 * App launch splash screen with animation
 * SUB-AGENT 1: SwiftUI & UX Architect
 */

import SwiftUI

struct SplashView: View {
    @State private var isAnimating = false
    @State private var showTagline = false

    var body: some View {
        ZStack {
            // Background gradient
            LinearGradient(
                colors: [
                    Color.orionBackground,
                    Color.orionSurface
                ],
                startPoint: .top,
                endPoint: .bottom
            )
            .ignoresSafeArea()

            VStack(spacing: 24) {
                // Logo
                ZStack {
                    // Outer ring
                    Circle()
                        .stroke(
                            AngularGradient(
                                colors: [.orionAccent, .orionPrimary, .orionAccent],
                                center: .center
                            ),
                            lineWidth: 3
                        )
                        .frame(width: 120, height: 120)
                        .rotationEffect(.degrees(isAnimating ? 360 : 0))
                        .animation(
                            .linear(duration: 3).repeatForever(autoreverses: false),
                            value: isAnimating
                        )

                    // Inner globe
                    Image(systemName: "globe")
                        .font(.system(size: 50, weight: .thin))
                        .foregroundColor(.orionAccent)
                        .scaleEffect(isAnimating ? 1.0 : 0.8)
                        .animation(
                            .easeInOut(duration: 1.5).repeatForever(autoreverses: true),
                            value: isAnimating
                        )
                }

                // App name
                Text("Orion")
                    .font(.system(size: 48, weight: .bold, design: .rounded))
                    .foregroundColor(.orionText)

                // Tagline
                if showTagline {
                    Text("Browse Intelligently")
                        .font(.subheadline)
                        .foregroundColor(.orionTextSecondary)
                        .transition(.opacity.combined(with: .move(edge: .bottom)))
                }
            }
        }
        .onAppear {
            isAnimating = true
            withAnimation(.easeIn(duration: 0.5).delay(0.5)) {
                showTagline = true
            }
        }
    }
}

// MARK: - Loading Indicator
struct OrionLoadingIndicator: View {
    @State private var isAnimating = false

    var body: some View {
        ZStack {
            Circle()
                .stroke(Color.orionBorder, lineWidth: 2)
                .frame(width: 40, height: 40)

            Circle()
                .trim(from: 0, to: 0.25)
                .stroke(Color.orionAccent, lineWidth: 2)
                .frame(width: 40, height: 40)
                .rotationEffect(.degrees(isAnimating ? 360 : 0))
                .animation(
                    .linear(duration: 1).repeatForever(autoreverses: false),
                    value: isAnimating
                )
        }
        .onAppear {
            isAnimating = true
        }
    }
}

#Preview {
    SplashView()
}
