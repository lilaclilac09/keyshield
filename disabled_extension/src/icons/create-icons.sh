#!/bin/bash
# Create simple placeholder icons using ImageMagick or a simple SVG to PNG conversion
# If ImageMagick is not available, we'll create simple colored squares

if command -v convert &> /dev/null; then
  # Create icons using ImageMagick
  convert -size 16x16 xc:#667eea -pointsize 10 -fill white -gravity center -annotate +0+0 "KS" icon16.png
  convert -size 48x48 xc:#667eea -pointsize 24 -fill white -gravity center -annotate +0+0 "KS" icon48.png
  convert -size 128x128 xc:#667eea -pointsize 64 -fill white -gravity center -annotate +0+0 "KS" icon128.png
  echo "Icons created with ImageMagick"
else
  echo "ImageMagick not found. Please create icon files manually:"
  echo "  - icon16.png (16x16 pixels)"
  echo "  - icon48.png (48x48 pixels)"
  echo "  - icon128.png (128x128 pixels)"
  echo "You can use any image editor or online tool to create these icons."
fi
