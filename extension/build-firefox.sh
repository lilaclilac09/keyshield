#!/bin/bash
# Build script for Firefox extension

echo "Building Firefox extension..."

# Build with webpack
npm run build:dev

# Copy Firefox-specific manifest
cp manifest.firefox.json dist/manifest.json

# Create Firefox package
cd dist
zip -r ../keyshield-firefox.zip . -x "*.map" "*.ts"
cd ..

echo "Firefox extension built: keyshield-firefox.zip"
