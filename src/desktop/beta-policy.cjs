'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { serveDashboardRequest } = require('./renderer-server.cjs');

const BUNDLED_ORIGIN = 'https://app.ks.aileena.xyz';

function syntheticOnly({ mas = process.mas, resourcesPath = process.resourcesPath } = {}) {
  return Boolean(mas || (resourcesPath && fs.existsSync(path.join(resourcesPath, 'beta-policy.json'))));
}

function bundledRequest(url, method = 'GET') {
  try {
    const parsed = new URL(url);
    return parsed.origin === BUNDLED_ORIGIN && !parsed.username && !parsed.password && ['GET', 'HEAD'].includes(method.toUpperCase());
  } catch { return false; }
}

function createBetaBoundary({ rendererRoot, log }) {
  const installed = new WeakSet();
  function blocked(url) {
    let host = 'invalid';
    try { host = new URL(url).hostname; } catch { /* malformed requests are denied */ }
    log(`host ${host} blocked`);
  }
  async function fetchBundled(input, options = {}) {
    const url = typeof input === 'string' || input instanceof URL ? String(input) : input.url;
    const method = options.method || input.method || 'GET';
    if (!bundledRequest(url, method)) {
      blocked(url);
      throw new Error('Synthetic beta: network access blocked');
    }
    return serveDashboardRequest(rendererRoot(), new Request(url, { method, headers: options.headers || input.headers }));
  }
  function installSession(ses) {
    if (installed.has(ses)) return;
    installed.add(ses);
    ses.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*', 'ws://*/*', 'wss://*/*'] }, (details, callback) => {
      const cancel = !bundledRequest(details.url, details.method);
      if (cancel) blocked(details.url);
      callback({ cancel });
    });
    for (const scheme of ['http', 'https']) {
      ses.protocol.handle(scheme, async (request) => {
        if (bundledRequest(request.url, request.method)) return fetchBundled(request);
        blocked(request.url);
        return new Response('Synthetic beta: network access blocked', { status: 403 });
      });
    }
  }
  function installMainNetwork(net, globals = globalThis) {
    net.fetch = fetchBundled;
    globals.fetch = fetchBundled;
    net.request = (input) => {
      blocked(typeof input === 'string' ? input : input?.url);
      throw new Error('Synthetic beta: network access blocked');
    };
  }
  return { installSession, installMainNetwork, blocked };
}

module.exports = { syntheticOnly, bundledRequest, createBetaBoundary };
