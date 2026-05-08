/**
 * dev.cjs — Cross-platform dev launcher
 * Starts KeyShield services on Windows, macOS, and Linux.
 * Usage: node dev.cjs [service]
 *   service: web | proxy | backend | all (default: all)
 */
const { spawn } = require('child_process');
const os = require('os');
const path = require('path');

const isWindows = os.platform() === 'win32';
const root = __dirname;

function run(cmd, args, cwd, label) {
  console.log(`[${label}] Starting: ${cmd} ${args.join(' ')}`);
  const proc = spawn(cmd, args, {
    cwd: path.resolve(root, cwd),
    stdio: 'inherit',
    shell: true,
    env: { ...process.env, FORCE_COLOR: '1' },
  });
  proc.on('exit', (code) => {
    console.log(`[${label}] Exited with code ${code}`);
  });
  return proc;
}

const services = process.argv.slice(2);
const runAll = services.length === 0 || services.includes('all');

// Check node_modules exists for web
const webNodeModules = path.join(root, 'src', 'web', 'node_modules');
const fs = require('fs');
if (!fs.existsSync(webNodeModules) || !fs.existsSync(path.join(webNodeModules, 'vite'))) {
  console.error('');
  console.error('❌ node_modules not found for web frontend.');
  console.error('');
  console.error('  Run: npm install');
  console.error('');
  console.error('  If switching between WSL/Windows/macOS, delete node_modules first:');
  if (isWindows) {
    console.error('    Remove-Item -Recurse -Force src\\web\\node_modules');
  } else {
    console.error('    rm -rf src/web/node_modules');
  }
  console.error('    npm install');
  console.error('');
  process.exit(1);
}

if (runAll || services.includes('web')) {
  run(isWindows ? 'npx.cmd' : 'npx', ['vite', '--host', '0.0.0.0'], 'src/web', 'WEB');
}

if (runAll || services.includes('backend')) {
  run('python3', ['-m', 'uvicorn', 'app:app', '--port', '8001', '--reload'], 'src/backend', 'BACKEND');
}

if (runAll || services.includes('proxy')) {
  run('cargo', ['run', '--bin', 'ks-proxy'], 'src/proxy', 'PROXY');
}
