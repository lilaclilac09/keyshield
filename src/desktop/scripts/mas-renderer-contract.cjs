'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const forbiddenHosts = [
  'keyshield-production.up.railway.app', 'sync.ks.aileena.xyz',
  'app.ks.aileena.xyz', 'accounts.google.com', 'unpkg.com', 'fonts.googleapis.com',
];
const bridgeIdentifiers = /\bbroker\b|\b(?:beginApproval|pinApprovalPasskey|invalidateApprovals|approvalStatus|approveRequestWithPasskey)\b|ks[-:]approval/i;

function verifyMasRendererProfile(root, commit) {
  const marker = path.join(root, 'renderer-profile.json');
  let bytes;
  let profile;
  try {
    if (!fs.lstatSync(marker).isFile()) throw new Error('not a regular file');
    bytes = fs.readFileSync(marker);
    profile = JSON.parse(bytes.toString('utf8'));
  } catch {
    throw new Error('MAS renderer requires a valid renderer-profile.json');
  }
  if (!profile || profile.profile !== 'mas-fixture' || !/^[a-f0-9]{40}$/.test(commit) || profile.commit !== commit) {
    throw new Error('MAS renderer profile/commit does not match the pinned mas-fixture build');
  }
  const visit = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) visit(file);
      else {
        if (!entry.isFile()) throw new Error('MAS renderer contains a non-regular asset');
        const text = fs.readFileSync(file).toString('utf8');
        if (forbiddenHosts.some((host) => text.toLowerCase().includes(host)) || bridgeIdentifiers.test(text)) {
          throw new Error(`MAS renderer contains forbidden host/bridge content: ${path.relative(root, file)}`);
        }
      }
    }
  };
  visit(root);
  return { profile: profile.profile, commit, manifestSha256: crypto.createHash('sha256').update(bytes).digest('hex') };
}

module.exports = { verifyMasRendererProfile };
