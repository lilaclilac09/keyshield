#!/bin/bash

echo "🔐 KeyShield Extension Test Setup"
echo "=================================="
echo ""

# Check if extension is built
if [ ! -d "extension/dist" ]; then
    echo "❌ Extension not built. Building now..."
    cd extension && npm run build && cd ..
    echo "✅ Build complete"
else
    echo "✅ Extension already built"
fi

# Check if frontend is running
if curl -s http://localhost:3000 > /dev/null 2>&1; then
    echo "✅ Frontend dashboard is running at http://localhost:3000"
else
    echo "⚠️  Frontend dashboard not running"
    echo "   Start it with: cd frontend && npm run dev"
fi

echo ""
echo "📋 Testing Steps:"
echo "1. Open Chrome and go to chrome://extensions"
echo "2. Enable 'Developer mode' (top right)"
echo "3. Click 'Load unpacked'"
echo "4. Select: $(pwd)/extension/dist"
echo "5. Open the test page: file://$(pwd)/extension/test-page.html"
echo "6. Wait for notifications (page scans every 5 seconds)"
echo "7. Click notification button to open dashboard"
echo ""
echo "🧪 Test Page Location:"
echo "   file://$(pwd)/extension/test-page.html"
echo ""
