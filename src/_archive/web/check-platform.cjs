/**
 * check-platform.cjs — Cross-platform esbuild/rollup binary check
 *
 * Detects when node_modules was installed on a different platform
 * (e.g., WSL → Windows, macOS → Docker) and provides fix instructions.
 *
 * Run automatically before `npm run dev` and `npm run build`.
 */
const os = require('os');
const path = require('path');
const fs = require('fs');

const platform = os.platform();
const arch = os.arch();

// Map platform+arch to expected esbuild/rollup package names
const expectedPackages = {
  win32: {
    x64: ['@esbuild/win32-x64', '@rollup/rollup-win32-x64-msvc'],
    arm64: ['@esbuild/win32-arm64', '@rollup/rollup-win32-arm64-msvc'],
  },
  darwin: {
    x64: ['@esbuild/darwin-x64', '@rollup/rollup-darwin-x64'],
    arm64: ['@esbuild/darwin-arm64', '@rollup/rollup-darwin-arm64'],
  },
  linux: {
    x64: ['@esbuild/linux-x64', '@rollup/rollup-linux-x64-gnu'],
    arm64: ['@esbuild/linux-arm64', '@rollup/rollup-linux-arm64-gnu'],
  },
};

const expected = expectedPackages[platform]?.[arch === 'arm64' ? 'arm64' : 'x64'];
if (!expected) {
  console.warn(`⚠️  Unsupported platform: ${platform}/${arch}. Skipping binary check.`);
  process.exit(0);
}

const missing = expected.filter(pkg => {
  const pkgPath = path.join(__dirname, 'node_modules', pkg);
  return !fs.existsSync(pkgPath);
});

if (missing.length > 0) {
  const isWSL = fs.existsSync('/proc/version') &&
    fs.readFileSync('/proc/version', 'utf8').toLowerCase().includes('microsoft');

  console.error('');
  console.error('❌ Platform mismatch detected in node_modules');
  console.error('');
  console.error(`  Expected: ${missing.join(', ')}`);
  console.error(`  Platform: ${platform} ${arch}`);
  console.error('');
  console.error('  This happens when node_modules was installed on a different');
  console.error('  OS (e.g., WSL → Windows, macOS → Docker, or copied between machines).');
  console.error('');
  console.error('  Fix:');
  console.error('');

  if (isWSL) {
    console.error('    # In WSL:');
    console.error('    rm -rf node_modules');
    console.error('    npm install');
  } else if (platform === 'win32') {
    console.error('    # In PowerShell:');
    console.error('    Remove-Item -Recurse -Force node_modules');
    console.error('    npm install');
  } else if (platform === 'darwin') {
    console.error('    # In Terminal:');
    console.error('    rm -rf node_modules');
    console.error('    npm install');
  } else {
    console.error('    rm -rf node_modules');
    console.error('    npm install');
  }

  console.error('');
  console.error('  Tip: Never copy node_modules between different OS environments.');
  console.error('  Each platform needs its own native binaries.');
  console.error('');

  // Don't block the build if it's just a warning
  // The actual error will be thrown by vite/esbuild if binaries are missing
  console.warn('⚠️  Continuing (vite will fail if binaries are truly missing)...\n');
  process.exit(0);
}
