/**
 * PermissionIntroView.swift
 * Introduction to permissions during onboarding
 */

import SwiftUI

struct PermissionIntroView: View {
    let onContinue: () -> Void
    let onSkip: () -> Void

    var body: some View {
        VStack(spacing: 32) {
            Spacer()

            // Icon
            Image(systemName: "hand.raised.fill")
                .font(.system(size: 64))
                .foregroundStyle(
                    LinearGradient(
                        colors: [.orionAccent, .orionPrimary],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                )

            // Title & Description
            VStack(spacing: 16) {
                Text("Permissions")
                    .font(.title)
                    .fontWeight(.bold)

                Text("Orion needs certain permissions to provide the best experience. You control what data is collected.")
                    .font(.body)
                    .foregroundColor(.orionTextSecondary)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 32)
            }

            // Permission list
            VStack(spacing: 16) {
                PermissionPreviewRow(
                    icon: "mic.fill",
                    title: "Microphone",
                    description: "For voice commands and audio notes",
                    isRequired: false
                )

                PermissionPreviewRow(
                    icon: "camera.fill",
                    title: "Camera",
                    description: "For QR codes and visual search",
                    isRequired: false
                )

                PermissionPreviewRow(
                    icon: "bell.fill",
                    title: "Notifications",
                    description: "For AI insights and reminders",
                    isRequired: false
                )
            }
            .padding(.horizontal)

            Spacer()

            // Buttons
            VStack(spacing: 12) {
                Button(action: onContinue) {
                    Text("Set Up Permissions")
                        .font(.headline)
                        .frame(maxWidth: .infinity)
                        .padding()
                        .background(Color.orionAccent)
                        .foregroundColor(.white)
                        .clipShape(RoundedRectangle(cornerRadius: 14))
                }

                Button(action: onSkip) {
                    Text("Skip for Now")
                        .font(.subheadline)
                        .foregroundColor(.orionTextSecondary)
                }
            }
            .padding(.horizontal, 32)
            .padding(.bottom, 32)
        }
        .background(Color.orionBackground)
    }
}

// MARK: - Permission Preview Row
struct PermissionPreviewRow: View {
    let icon: String
    let title: String
    let description: String
    let isRequired: Bool

    var body: some View {
        HStack(spacing: 16) {
            Image(systemName: icon)
                .font(.system(size: 20))
                .foregroundColor(.orionAccent)
                .frame(width: 44, height: 44)
                .background(
                    RoundedRectangle(cornerRadius: 10)
                        .fill(Color.orionAccent.opacity(0.1))
                )

            VStack(alignment: .leading, spacing: 2) {
                HStack {
                    Text(title)
                        .font(.subheadline)
                        .fontWeight(.semibold)

                    if isRequired {
                        Text("Required")
                            .font(.caption2)
                            .foregroundColor(.orange)
                    }
                }

                Text(description)
                    .font(.caption)
                    .foregroundColor(.orionTextSecondary)
            }

            Spacer()
        }
        .padding()
        .background(
            RoundedRectangle(cornerRadius: 12)
                .fill(Color.orionSurface)
        )
    }
}

#Preview {
    PermissionIntroView(
        onContinue: {},
        onSkip: {}
    )
}
