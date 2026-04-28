import type { PlasmoManifest, PlasmoWatchImmediate } from 'plasmoid';

const manifest: PlasmoManifest = {
  manifest_version: 3,
  name: "KeyShield Agentic",
  version: "2.0.0",
  description: "Universal API Key + Payment Vault - Secure key management for humans and AI agents",
  permissions: [
    "storage",
    "activeTab",
    "tabs",
    "scripting",
    "clipboardRead",
    "clipboardWrite",
    "notifications",
    "webRequest",
    "webNavigation"
  ],
  host_permissions: [
    "<all_urls>"
  ],
  background: {
    service_worker: "background.ts",
    type: "module"
  },
  content_scripts: [
    {
      matches: ["<all_urls>"],
      js: ["content.ts"],
      run_at: "document_idle",
      all_frames: true
    }
  ],
  action: {
    default_popup: "popup.html",
    default_icon: {
      "16": "icons/icon16.png",
      "48": "icons/icon48.png",
      "128": "icons/icon128.png"
    },
    default_title: "KeyShield Agentic"
  },
  icons: {
    "16": "icons/icon16.png",
    "48": "icons/icon48.png",
    "128": "icons/icon128.png"
  },
  web_accessible_resources: [
    {
      resources: ["injected.js"],
      matches: ["<all_urls>"]
    }
  ],
  options_page: "options.html",
  // x402 payment support
  declarations: [
    {
      "resources": ["*"],
      "matches": ["<all_urls>"]
    }
  ]
};

export const getManifest = () => {
  // Log manifest for debugging
  console.log('[KeyShield] Extension manifest loaded:', manifest.name);
  return manifest;
};

export default manifest;
