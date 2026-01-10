/**
 * MicrophonePermissionView.swift
 * Microphone permission request view
 */

import SwiftUI
import AVFoundation

struct MicrophonePermissionView: View {
    @StateObject private var permissionManager = PermissionsManager.shared
    let onComplete: (Bool) -> Void

    @State private var isRequestingPermission = false

    var body: some View {
        VStack(spacing: 32) {
            Spacer()

            // Animated icon
            ZStack {
                Circle()
                    .fill(Color.orionAccent.opacity(0.1))
                    .frame(width: 120, height: 120)

                Circle()
                    .fill(Color.orionAccent.opacity(0.2))
                    .frame(width: 100, height: 100)

                Image(systemName: "mic.fill")
                    .font(.system(size: 40))
                    .foregroundColor(.orionAccent)
            }

            // Content
            VStack(spacing: 16) {
                Text("Microphone Access")
                    .font(.title2)
                    .fontWeight(.bold)

                Text("Enable microphone access to use voice commands, create audio notes, and have hands-free browsing.")
                    .font(.body)
                    .foregroundColor(.orionTextSecondary)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 32)
            }

            // Features list
            VStack(alignment: .leading, spacing: 12) {
                FeatureRow(icon: "waveform", title: "Voice commands", description: "Control the browser with your voice")
                FeatureRow(icon: "mic.badge.plus", title: "Audio notes", description: "Record thoughts while browsing")
                FeatureRow(icon: "text.bubble", title: "Dictation", description: "Speak to type in any field")
            }
            .padding(.horizontal, 32)

            Spacer()

            // Privacy note
            HStack(spacing: 8) {
                Image(systemName: "lock.shield")
                    .foregroundColor(.green)

                Text("Audio is processed locally and never stored without your consent.")
                    .font(.caption)
                    .foregroundColor(.orionTextSecondary)
            }
            .padding(.horizontal, 32)

            // Buttons
            VStack(spacing: 12) {
                Button {
                    requestPermission()
                } label: {
                    HStack {
                        if isRequestingPermission {
                            ProgressView()
                                .tint(.white)
                        } else {
                            Text("Allow Microphone Access")
                        }
                    }
                    .font(.headline)
                    .frame(maxWidth: .infinity)
                    .padding()
                    .background(Color.orionAccent)
                    .foregroundColor(.white)
                    .clipShape(RoundedRectangle(cornerRadius: 14))
                }
                .disabled(isRequestingPermission)

                Button {
                    onComplete(false)
                } label: {
                    Text("Not Now")
                        .font(.subheadline)
                        .foregroundColor(.orionTextSecondary)
                }
            }
            .padding(.horizontal, 32)
            .padding(.bottom, 32)
        }
        .background(Color.orionBackground)
    }

    private func requestPermission() {
        isRequestingPermission = true

        Task {
            let granted = await permissionManager.requestMicrophonePermission()
            await MainActor.run {
                isRequestingPermission = false
                onComplete(granted)
            }
        }
    }
}

// MARK: - Feature Row
struct FeatureRow: View {
    let icon: String
    let title: String
    let description: String

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: icon)
                .font(.system(size: 16))
                .foregroundColor(.orionAccent)
                .frame(width: 32)

            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(.subheadline)
                    .fontWeight(.medium)

                Text(description)
                    .font(.caption)
                    .foregroundColor(.orionTextSecondary)
            }
        }
    }
}

#Preview {
    MicrophonePermissionView(onComplete: { _ in })
}
