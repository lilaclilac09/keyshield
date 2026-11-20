import { execFileSync } from 'node:child_process';
import type { Plugin } from 'vite';

export function rendererProfilePlugin(profile: string): Plugin {
  if (profile !== 'standard' && profile !== 'mas-fixture') throw new Error('Unknown renderer profile');
  return {
    name: 'keyshield-renderer-profile',
    config: () => ({ define: { __KEYSHIELD_RENDERER_PROFILE__: JSON.stringify(profile) }, ...(profile === 'mas-fixture' ? { publicDir: false } : {}) }),
    transformIndexHtml: {
      order: 'pre',
      handler: html => profile === 'standard' ? html : `<!doctype html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'none'; img-src data:; font-src 'none'; base-uri 'none'; form-action 'none'; object-src 'none'; frame-src 'none'">
<link rel="icon" href="data:,"><title>KeyShield synthetic fixture</title>
<style>body{margin:0;background:#0b1226;color:#e8ecff;font:16px system-ui,sans-serif}main{max-width:680px;margin:10vh auto;padding:32px;background:#131c39;border:1px solid #243365;border-radius:16px}p{line-height:1.6;color:#a8b3d8}button{padding:12px 18px;margin:12px 12px 12px 0;border:1px solid #8a96c2;border-radius:8px;background:#e8ecff;color:#0b1226;font:inherit;cursor:pointer}button:disabled{opacity:.5;cursor:default}</style>
</head><body><div id="root"></div><script type="module" src="/mas-fixture/index.tsx"></script></body></html>`,
    },
    generateBundle() {
      const commit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
      this.emitFile({ type: 'asset', fileName: 'renderer-profile.json', source: JSON.stringify({ profile, commit }) });
    },
  };
}
