/**
 * LoadingView.swift
 * Reusable loading indicator
 */

import SwiftUI

struct LoadingView: View {
    let message: String?

    init(message: String? = nil) {
        self.message = message
    }

    var body: some View {
        VStack(spacing: 16) {
            ProgressView()
                .scaleEffect(1.2)

            if let message = message {
                Text(message)
                    .font(.subheadline)
                    .foregroundColor(.orionTextSecondary)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color.orionBackground)
    }
}

// MARK: - Shimmer Loading View
struct ShimmerLoadingView: View {
    @State private var isAnimating = false

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            ForEach(0..<3) { _ in
                ShimmerRow()
            }
        }
        .padding()
    }
}

struct ShimmerRow: View {
    @State private var isAnimating = false

    var body: some View {
        HStack(spacing: 12) {
            Circle()
                .fill(Color.orionSurface)
                .frame(width: 44, height: 44)

            VStack(alignment: .leading, spacing: 8) {
                RoundedRectangle(cornerRadius: 4)
                    .fill(Color.orionSurface)
                    .frame(width: 200, height: 14)

                RoundedRectangle(cornerRadius: 4)
                    .fill(Color.orionSurface)
                    .frame(width: 120, height: 10)
            }
        }
        .shimmer(isAnimating: isAnimating)
        .onAppear {
            isAnimating = true
        }
    }
}

// MARK: - Shimmer Effect
extension View {
    func shimmer(isAnimating: Bool) -> some View {
        self
            .redacted(reason: .placeholder)
            .overlay {
                GeometryReader { geometry in
                    if isAnimating {
                        LinearGradient(
                            colors: [
                                .clear,
                                Color.white.opacity(0.3),
                                .clear
                            ],
                            startPoint: .leading,
                            endPoint: .trailing
                        )
                        .frame(width: geometry.size.width * 0.6)
                        .offset(x: isAnimating ? geometry.size.width : -geometry.size.width * 0.6)
                        .animation(
                            .linear(duration: 1.5)
                            .repeatForever(autoreverses: false),
                            value: isAnimating
                        )
                    }
                }
                .mask(self)
            }
    }
}

// MARK: - Skeleton Loading View
struct SkeletonView: View {
    let width: CGFloat?
    let height: CGFloat

    init(width: CGFloat? = nil, height: CGFloat = 20) {
        self.width = width
        self.height = height
    }

    var body: some View {
        RoundedRectangle(cornerRadius: 4)
            .fill(Color.orionSurface)
            .frame(width: width, height: height)
    }
}

#Preview {
    VStack(spacing: 32) {
        LoadingView(message: "Loading content...")

        ShimmerLoadingView()
    }
}
