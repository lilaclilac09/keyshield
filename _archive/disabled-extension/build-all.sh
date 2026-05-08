#!/bin/bash
# Build script for all browsers (Chrome, Firefox, Safari)

set -e

echo "=========================================="
echo "KeyShield Extension - Build All Browsers"
echo "=========================================="
echo ""

# Clean previous builds
echo "Cleaning previous builds..."
rm -rf dist dist-chrome dist-firefox dist-safari
mkdir -p dist dist-chrome dist-firefox dist-safari

# Build TypeScript and bundle with webpack
echo ""
echo "Building TypeScript and bundling..."
npm run build

# Copy common files
echo ""
echo "Copying common files..."

# Icons
mkdir -p dist/icons dist-chrome/icons dist-firefox/icons dist-safari/icons
cp -r src/icons/* dist/icons/ 2>/dev/null || true
cp -r src/icons/* dist-chrome/icons/ 2>/dev/null || true
cp -r src/icons/* dist-firefox/icons/ 2>/dev/null || true
cp -r src/icons/* dist-safari/icons/ 2>/dev/null || true

# Popup HTML
mkdir -p dist/popup dist-chrome/popup dist-firefox/popup dist-safari/popup
if [ -f "src/popup/popup.html" ]; then
  cp src/popup/popup.html dist/popup/ 2>/dev/null || true
  cp src/popup/popup.html dist-chrome/popup/ 2>/dev/null || true
  cp src/popup/popup.html dist-firefox/popup/ 2>/dev/null || true
  cp src/popup/popup.html dist-safari/popup/ 2>/dev/null || true
fi

# Build Chrome/Edge (Manifest V3)
echo ""
echo "Building Chrome/Edge extension..."
cp manifest.json dist-chrome/manifest.json
cp -r dist/* dist-chrome/ 2>/dev/null || true
cd dist-chrome
zip -r ../keyshield-chrome.zip . -x "*.map" "*.ts" "*.tsx" > /dev/null 2>&1
cd ..
echo "✓ Chrome/Edge extension built: keyshield-chrome.zip"

# Build Firefox (Manifest V2 for compatibility)
echo ""
echo "Building Firefox extension..."
if [ -f "manifest.firefox.json" ]; then
  cp manifest.firefox.json dist-firefox/manifest.json
else
  # Convert Manifest V3 to V2 for Firefox
  echo "Warning: manifest.firefox.json not found, using Chrome manifest"
  cp manifest.json dist-firefox/manifest.json
fi
cp -r dist/* dist-firefox/ 2>/dev/null || true
cd dist-firefox
zip -r ../keyshield-firefox.zip . -x "*.map" "*.ts" "*.tsx" > /dev/null 2>&1
cd ..
echo "✓ Firefox extension built: keyshield-firefox.zip"

# Build Safari (requires additional setup)
echo ""
echo "Building Safari extension..."
if [ -f "manifest.safari.json" ]; then
  cp manifest.safari.json dist-safari/manifest.json
else
  echo "Warning: manifest.safari.json not found, using Chrome manifest"
  cp manifest.json dist-safari/manifest.json
fi
cp -r dist/* dist-safari/ 2>/dev/null || true
echo "✓ Safari extension built (requires Xcode for full build)"
echo "  Location: dist-safari/"

# Default dist folder (Chrome/Edge)
echo ""
echo "Preparing default dist folder (Chrome/Edge)..."
cp manifest.json dist/manifest.json
echo "✓ Default dist folder ready: dist/"

echo ""
echo "=========================================="
echo "Build Complete!"
echo "=========================================="
echo ""
echo "Packages created:"
echo "  - keyshield-chrome.zip (Chrome/Edge)"
echo "  - keyshield-firefox.zip (Firefox)"
echo "  - dist-safari/ (Safari - requires Xcode)"
echo ""
echo "For manual installation, use the 'dist/' folder"
echo "or load unpacked extension from dist-chrome/, dist-firefox/, or dist-safari/"
echo ""
