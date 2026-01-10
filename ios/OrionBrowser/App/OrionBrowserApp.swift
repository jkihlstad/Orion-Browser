/**
 * OrionBrowserApp.swift
 * Main entry point for Orion Browser iOS
 * Native SwiftUI application with Convex backend
 *
 * Uses AppEnvironment for centralized service management
 * SUB-AGENT B: Edge Capture + Local Buffer + Background Upload
 */

import SwiftUI

@main
struct OrionBrowserApp: App {
    @StateObject private var env = AppEnvironment.shared
    @StateObject private var appState = AppState()

    var body: some Scene {
        WindowGroup {
            AuthView()
                .environmentObject(env)
                .environmentObject(appState)
                .environmentObject(env.clerk)
                .environmentObject(env.consent)
        }
    }
}
