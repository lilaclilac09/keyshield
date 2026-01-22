#!/bin/bash
# Build script for Chrome/Edge extension

echo "Building Chrome/Edge extension..."

# Build with webpack
npm run build

# Copy Chrome manifest (default)
cp manifest.json dist/manifest.json

# Create Chrome package
cd dist
zip -r ../keyshield-chrome.zip . -x "*.map" "*.ts"
cd ..

echo "Chrome/Edge extension built: keyshield-chrome.zip"
