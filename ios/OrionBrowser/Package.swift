// swift-tools-version:5.9
// The swift-tools-version declares the minimum version of Swift required to build this package.

import PackageDescription

let package = Package(
    name: "OrionBrowser",
    platforms: [
        .iOS(.v17)
    ],
    products: [
        .library(
            name: "OrionBrowser",
            targets: ["OrionBrowser"]
        ),
    ],
    dependencies: [
        // Convex Swift SDK - Real-time backend
        // https://github.com/get-convex/convex-swift
        .package(url: "https://github.com/get-convex/convex-swift.git", from: "0.5.0"),

        // Clerk iOS SDK - Authentication
        // https://github.com/clerk/clerk-ios
        .package(url: "https://github.com/clerk/clerk-ios.git", from: "1.0.0"),
    ],
    targets: [
        .target(
            name: "OrionBrowser",
            dependencies: [
                .product(name: "Convex", package: "convex-swift"),
                .product(name: "ClerkSDK", package: "clerk-ios"),
            ],
            path: ".",
            exclude: ["Package.swift", "Info.plist"],
            resources: [
                .process("Resources")
            ]
        ),
        .testTarget(
            name: "OrionBrowserTests",
            dependencies: ["OrionBrowser"],
            path: "Tests"
        ),
    ]
)
