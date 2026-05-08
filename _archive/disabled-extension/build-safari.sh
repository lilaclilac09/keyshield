#!/bin/bash
# Build script for Safari extension
# Note: Safari extensions require additional Xcode setup

echo "Building Safari extension..."

# Build with webpack
npm run build:dev

# Copy Safari-specific manifest
cp manifest.safari.json dist/manifest.json

echo "Safari extension built in dist/ directory"
echo "Note: Safari extensions require Xcode and additional setup."
echo "See: https://developer.apple.com/documentation/safariservices/safari-web-extensions"
