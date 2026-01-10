#!/bin/bash
# Orion Browser Development Runner
# Starts backend and runs iOS app on simulator

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SIMULATOR="iPhone 17 Pro"
BUNDLE_ID="com.orion.browser"

echo "🚀 Starting Orion Browser Development Environment..."

# 1. Start Convex backend in background
echo "📡 Starting Convex backend..."
cd "$SCRIPT_DIR/backend"
npx convex dev &
CONVEX_PID=$!
sleep 3

# 2. Boot simulator if not running
echo "📱 Booting iOS Simulator ($SIMULATOR)..."
xcrun simctl boot "$SIMULATOR" 2>/dev/null || true
open -a Simulator

# 3. Build iOS app (skip if --no-build flag)
if [[ "$1" != "--no-build" ]]; then
    echo "🔨 Building iOS app..."
    cd "$SCRIPT_DIR/ios"
    xcodebuild -project OrionBrowser.xcodeproj \
        -scheme OrionBrowser \
        -configuration Debug \
        -destination "platform=iOS Simulator,name=$SIMULATOR" \
        -derivedDataPath ./build \
        build 2>&1 | grep -E "(BUILD|error:|warning:.*error)" || true
fi

# 4. Install and launch
echo "📲 Installing and launching app..."
xcrun simctl install "$SIMULATOR" "$SCRIPT_DIR/ios/build/Build/Products/Debug-iphonesimulator/Orion Browser.app"
xcrun simctl launch "$SIMULATOR" "$BUNDLE_ID"

echo ""
echo "✅ Orion Browser is running!"
echo "   • Convex backend PID: $CONVEX_PID"
echo "   • Simulator: $SIMULATOR"
echo "   • Dashboard: https://dashboard.convex.dev/d/disciplined-otter-975"
echo ""
echo "Press Ctrl+C to stop the backend"

# Keep running until interrupted
wait $CONVEX_PID
