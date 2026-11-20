'use strict';

/**
 * Serves the bundled src/web dashboard (the "renderer") for the desktop
 * shell's https intercept, and answers everything else by passing the
 * request through to the network untouched.
 *
 * Two rules keep a broken build visible instead of silent:
 *
 * 1. Files are read from disk and answered with an explicit Content-Type.
 *    The previous version proxied through net.fetch(file:), which left the
 *    MIME type to the fetch implementation; a wrong or missing type can make
 *    the browser download the page instead of rendering it.
 * 2. The single-page-app fallback (serve index.html) applies ONLY to page
 *    navigations, recognised by an Accept header containing text/html. A
 *    missing script, style or other asset gets a plain 404. Serving
 *    index.html for a missing JS chunk makes the browser parse HTML as
 *    JavaScript, so React never mounts and the app sits on a blank window
 *    with no error anywhere.
 */

const fs = require('node:fs');
const path = require('node:path');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.wasm': 'application/wasm',
};

function contentTypeFor(filePath) {
  const ext = path.extname(String(filePath || '')).toLowerCase();
  return MIME_TYPES[ext] || 'application/octet-stream';
}

/**
 * Map a request pathname to a file under the renderer root. Returns null
 * when the path would escape the root (a traversal attempt), so the caller
 * can answer 403 instead of reading outside the bundle.
 */
function resolveRendererFile(root, requestPath) {
  let rel = decodeURIComponent(String(requestPath || '/'));
  if (rel === '/' || rel === '') rel = '/index.html';
  const file = path.normalize(path.join(root, rel));
  const prefix = root.endsWith(path.sep) ? root : `${root}${path.sep}`;
  if (file !== root && !file.startsWith(prefix)) return null;
  return file;
}

/** True when the request is a page navigation (it wants HTML back). */
function isNavigationRequest(request) {
  try {
    const accept = String(request.headers.get('accept') || '');
    return accept.includes('text/html');
  } catch {
    return false;
  }
}

function readFileResponse(file) {
  const body = fs.readFileSync(file);
  return new Response(body, {
    status: 200,
    headers: {
      'content-type': contentTypeFor(file),
      'content-length': String(body.length),
    },
  });
}

function textResponse(text, status) {
  return new Response(text, {
    status,
    headers: { 'content-type': 'text/plain; charset=utf-8' },
  });
}

/**
 * Answer one request for the dashboard origin. Returns a Response, or null
 * when the caller should fetch the request from the network instead (the
 * caller decides that from the hostname, not from here).
 */
function serveDashboardRequest(root, request) {
  let url;
  try {
    url = new URL(request.url);
  } catch {
    return textResponse('bad request', 400);
  }
  const file = resolveRendererFile(root, url.pathname);
  if (file === null) return textResponse('forbidden', 403);
  try {
    if (fs.existsSync(file) && !fs.statSync(file).isDirectory()) {
      return readFileResponse(file);
    }
  } catch {
    // A read error is treated like a missing file below.
  }
  if (isNavigationRequest(request)) {
    const index = path.join(root, 'index.html');
    try {
      if (fs.existsSync(index)) return readFileResponse(index);
    } catch {
      // Fall through to the 404 below.
    }
  }
  return textResponse('not found', 404);
}

/** True when the renderer directory holds a usable entry page. */
function hasRenderer(root) {
  try {
    return fs.existsSync(path.join(root, 'index.html'));
  } catch {
    return false;
  }
}

module.exports = {
  MIME_TYPES,
  contentTypeFor,
  resolveRendererFile,
  isNavigationRequest,
  serveDashboardRequest,
  hasRenderer,
};
