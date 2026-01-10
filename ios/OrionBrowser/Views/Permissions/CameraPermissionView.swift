/**
 * CameraPermissionView.swift
 * Camera permission request view
 */

import SwiftUI
import AVFoundation

struct CameraPermissionView: View {
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

                Image(systemName: "camera.fill")
                    .font(.system(size: 40))
                    .foregroundColor(.orionAccent)
            }

            // Content
            VStack(spacing: 16) {
                Text("Camera Access")
                    .font(.title2)
                    .fontWeight(.bold)

                Text("Enable camera access to scan QR codes, capture screenshots, and use visual search features.")
                    .font(.body)
                    .foregroundColor(.orionTextSecondary)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 32)
            }

            // Features list
            VStack(alignment: .leading, spacing: 12) {
                FeatureRow(icon: "qrcode.viewfinder", title: "QR Code Scanner", description: "Quickly open links from QR codes")
                FeatureRow(icon: "camera.viewfinder", title: "Visual Search", description: "Search using images")
                FeatureRow(icon: "doc.viewfinder", title: "Document Capture", description: "Scan documents and receipts")
            }
            .padding(.horizontal, 32)

            Spacer()

            // Privacy note
            HStack(spacing: 8) {
                Image(systemName: "lock.shield")
                    .foregroundColor(.green)

                Text("Camera access is only used when you initiate it. No background capture.")
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
                            Text("Allow Camera Access")
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
            let status = await permissionManager.request(.camera)
            await MainActor.run {
                isRequestingPermission = false
                onComplete(status == .authorized)
            }
        }
    }
}

#Preview {
    CameraPermissionView(onComplete: { _ in })
}
