/**
 * Manifest V3 source-of-truth.
 *
 * Exports a plain object so scripts/build-extension.mjs can write it as
 * `dist/manifest.json` after the vite build completes. We intentionally
 * avoid plasmoid / @crxjs / WXT — those frameworks impose conventions
 * the rest of this repo doesn't follow yet, and a 60-line build script
 * is cheaper than a fight with their config.
 */

export interface KeyShieldManifest {
  manifest_version: 3;
  name: string;
  version: string;
  description: string;
  permissions: string[];
  host_permissions: string[];
  background: { service_worker: string; type: 'module' };
  content_scripts: Array<{
    matches: string[];
    js: string[];
    run_at: 'document_idle' | 'document_start' | 'document_end';
    all_frames: boolean;
  }>;
  action: {
    default_popup: string;
    default_icon: Record<string, string>;
    default_title: string;
  };
  icons: Record<string, string>;
  web_accessible_resources?: Array<{ resources: string[]; matches: string[] }>;
}

const manifest: KeyShieldManifest = {
  manifest_version: 3,
  name: 'KeyShield Agentic',
  version: '2.0.0',
  description:
    'Universal API Key + Payment Vault — secure key management for humans and AI agents.',
  permissions: [
    'storage',
    'activeTab',
    'tabs',
    'scripting',
    'clipboardRead',
    'clipboardWrite',
    'notifications',
    'webRequest',
  ],
  host_permissions: ['<all_urls>'],
  background: {
    service_worker: 'background.js',
    type: 'module',
  },
  content_scripts: [
    {
      matches: ['<all_urls>'],
      js: ['content.js'],
      run_at: 'document_idle',
      all_frames: false,
    },
  ],
  action: {
    default_popup: 'popup.html',
    default_icon: {
      '16': 'icons/icon16.png',
      '48': 'icons/icon48.png',
      '128': 'icons/icon128.png',
    },
    default_title: 'KeyShield Agentic',
  },
  icons: {
    '16': 'icons/icon16.png',
    '48': 'icons/icon48.png',
    '128': 'icons/icon128.png',
  },
};

export default manifest;
