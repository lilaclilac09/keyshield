'use strict';

const { execFileSync } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function git(root, args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function sourceRevision(root, directory) {
  return {
    commit: git(root, ['rev-parse', 'HEAD']),
    commitTree: git(root, ['rev-parse', 'HEAD^{tree}']),
    parents: git(root, ['show', '-s', '--format=%P', 'HEAD']).split(' ').filter(Boolean),
    tree: git(root, ['rev-parse', `HEAD:${directory}`]),
    dirty: Boolean(git(root, ['status', '--porcelain', '--untracked-files=all', '--', directory, `:(exclude)${directory}/dist`])),
    repositoryDirty: Boolean(git(root, ['status', '--porcelain', '--untracked-files=all'])),
  };
}

function withRendererSource(root, ref, build) {
  if (!ref) return build(root, null);
  const commit = git(root, ['rev-parse', '--verify', `${ref}^{commit}`]);
  const container = fs.mkdtempSync(path.join(os.tmpdir(), 'keyshield-renderer-'));
  const worktree = path.join(container, 'source');
  let added = false;
  try {
    git(root, ['worktree', 'add', '--detach', worktree, commit]);
    added = true;
    return build(worktree, path.join(container, 'dist'));
  } finally {
    if (added) git(root, ['worktree', 'remove', worktree]);
    fs.rmSync(container, { recursive: true, force: true });
  }
}

function validatePinShape(pin) {
  const sha = (value) => typeof value === 'string' && /^[a-f0-9]{40}$/.test(value);
  if (!pin || pin.schemaVersion !== 1 || !pin.inputs || !Object.values(pin.inputs).length || !Object.values(pin.inputs).every(sha) || !Array.isArray(pin.merges)) throw new Error('Invalid renderer pin');
  for (const node of [pin, ...pin.merges]) {
    if (!sha(node.commit) || !sha(node.tree) || !Array.isArray(node.parents) || node.parents.length < 2 || !node.parents.every(sha)) throw new Error('Invalid renderer pin merge');
  }
}

function verifyRendererPin(root, pin) {
  validatePinShape(pin);
  const nodes = new Map([pin, ...pin.merges].map((node) => [node.commit, node]));
  if (nodes.size !== pin.merges.length + 1) throw new Error('Duplicate renderer pin merge');
  const visited = new Set();
  const leaves = [];
  const visit = (commit) => {
    const node = nodes.get(commit);
    if (!node) { leaves.push(commit); return; }
    if (visited.has(commit)) throw new Error('Repeated renderer pin merge');
    visited.add(commit);
    if (git(root, ['rev-parse', `${commit}^{tree}`]) !== node.tree) throw new Error('Renderer pin tree mismatch');
    const parents = git(root, ['show', '-s', '--format=%P', commit]).split(' ').filter(Boolean);
    if (JSON.stringify(parents) !== JSON.stringify(node.parents)) throw new Error('Renderer pin parents mismatch');
    node.parents.forEach(visit);
  };
  visit(pin.commit);
  if (visited.size !== nodes.size || JSON.stringify(leaves.sort()) !== JSON.stringify(Object.values(pin.inputs).sort())) throw new Error('Renderer pin inputs mismatch');
  return pin.commit;
}

function fetchPinnedRenderer(root, pin) {
  validatePinShape(pin);
  git(root, ['fetch', '--no-tags', 'origin', pin.commit]);
  return verifyRendererPin(root, pin);
}

function writeDmgBuildInfo(dmg, sources) {
  const info = {
    schemaVersion: 1,
    ...sources,
    artifact: path.basename(dmg),
    sha256: crypto.createHash('sha256').update(fs.readFileSync(dmg)).digest('hex'),
  };
  fs.writeFileSync(`${dmg}.build-info.json`, `${JSON.stringify(info, null, 2)}\n`);
  return info;
}

module.exports = { sourceRevision, withRendererSource, writeDmgBuildInfo, verifyRendererPin, fetchPinnedRenderer };
