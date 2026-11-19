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

module.exports = { sourceRevision, withRendererSource, writeDmgBuildInfo };
