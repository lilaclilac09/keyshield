import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { sourceRevision, withRendererSource, writeDmgBuildInfo } = require('../src/desktop/scripts/build-provenance.cjs');
const { writeBuildInfo } = require('../src/desktop/scripts/pack-mac.cjs');

describe('desktop / renderer build provenance', () => {
  let root: string;
  let rendererCommit: string;
  let desktopCommit: string;
  const git = (...args: string[]) => execFileSync('git', args, {
    cwd: root, encoding: 'utf8',
    env: { ...process.env, GIT_AUTHOR_NAME: 'Synthetic test', GIT_AUTHOR_EMAIL: 'fixture@example.invalid', GIT_COMMITTER_NAME: 'Synthetic test', GIT_COMMITTER_EMAIL: 'fixture@example.invalid' },
  }).trim();

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'desktop-provenance-'));
    git('init', '-q', '--initial-branch=main');
    mkdirSync(join(root, 'src/web'), { recursive: true });
    mkdirSync(join(root, 'src/desktop'), { recursive: true });
    writeFileSync(join(root, '.gitignore'), 'node_modules/\ndist/\n');
    writeFileSync(join(root, 'src/web/entry.js'), 'renderer revision one');
    writeFileSync(join(root, 'src/desktop/main.cjs'), 'desktop revision one');
    git('add', '.gitignore', 'src/web/entry.js', 'src/desktop/main.cjs');
    git('commit', '-qm', 'renderer fixture');
    rendererCommit = git('rev-parse', 'HEAD');
    writeFileSync(join(root, 'src/desktop/main.cjs'), 'desktop revision two');
    git('add', 'src/desktop/main.cjs');
    git('commit', '-qm', 'desktop fixture');
    desktopCommit = git('rev-parse', 'HEAD');
  });

  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('records full distinct revisions and builds the selected renderer in an isolated worktree', () => {
    const desktop = sourceRevision(root, 'src/desktop');
    const renderer = withRendererSource(root, rendererCommit, (source: string, dist: string) => {
      expect(source).not.toBe(root);
      expect(dist.startsWith(source)).toBe(false);
      expect(readFileSync(join(source, 'src/desktop/main.cjs'), 'utf8')).toBe('desktop revision one');
      expect(readFileSync(join(source, 'src/web/entry.js'), 'utf8')).toBe('renderer revision one');
      // npm's ignored dependency directories must not prevent worktree cleanup.
      mkdirSync(join(source, 'node_modules'));
      writeFileSync(join(source, 'node_modules/fixture'), 'dependency');
      return sourceRevision(source, 'src/web');
    });
    expect(desktop).toMatchObject({ commit: desktopCommit, dirty: false });
    expect(desktop.parents).toEqual([rendererCommit]);
    expect(renderer.parents).toEqual([]);
    expect(renderer.commitTree).toBe(git('rev-parse', `${rendererCommit}^{tree}`));
    expect(renderer).toMatchObject({ commit: rendererCommit, dirty: false });
    expect(renderer.commit).toHaveLength(40);
    expect(renderer.tree).toBe(git('rev-parse', `${rendererCommit}:src/web`));
    expect(git('rev-parse', 'HEAD')).toBe(desktopCommit);
    expect(git('worktree', 'list', '--porcelain').match(/^worktree /gm)).toHaveLength(1);
  });

  it('uses the current tree without an override and scopes dirty flags to source inputs', () => {
    expect(withRendererSource(root, '', (source: string, dist: null) => ({ source, dist }))).toEqual({ source: root, dist: null });
    mkdirSync(join(root, 'src/web/dist'));
    writeFileSync(join(root, 'src/web/dist/index.html'), 'generated');
    expect(sourceRevision(root, 'src/web').dirty).toBe(false);
    writeFileSync(join(root, 'src/web/new-source.ts'), 'untracked renderer edit');
    expect(sourceRevision(root, 'src/web').dirty).toBe(true);
    expect(sourceRevision(root, 'src/desktop').dirty).toBe(false);
    writeFileSync(join(root, 'src/desktop/main.cjs'), 'desktop dirty');
    expect(sourceRevision(root, 'src/desktop').dirty).toBe(true);
  });

  it('cleans up a failed renderer build and rejects unknown refs without falling back', () => {
    expect(() => withRendererSource(root, rendererCommit, () => { throw new Error('fixture build failed'); })).toThrow('fixture build failed');
    expect(() => withRendererSource(root, 'missing-renderer-ref', () => {})).toThrow();
    expect(git('worktree', 'list', '--porcelain').match(/^worktree /gm)).toHaveLength(1);
    expect(git('rev-parse', 'HEAD')).toBe(desktopCommit);
  });

  it('writes a detached DMG SHA-256 plus both revisions and dirty flags in release BUILD-INFO', () => {
    const dmg = join(root, 'KeyShield.dmg');
    writeFileSync(dmg, 'abc');
    const sources = { createdAt: '2026-11-19T00:00:00.000Z', desktop: sourceRevision(root, 'src/desktop'), renderer: { ...sourceRevision(root, 'src/web'), commit: rendererCommit, dirty: true } };
    const info = writeDmgBuildInfo(dmg, sources);
    expect(info.sha256).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(JSON.parse(readFileSync(`${dmg}.build-info.json`, 'utf8'))).toEqual({ schemaVersion: 1, ...sources, artifact: 'KeyShield.dmg', sha256: info.sha256 });
    const file = join(root, 'BUILD-INFO.txt');
    writeBuildInfo([], 3, sources, info.sha256, file);
    const text = readFileSync(file, 'utf8');
    expect(text).toContain(`desktop commit: ${desktopCommit}`);
    expect(text).toContain(`renderer commit: ${rendererCommit}`);
    expect(text).toContain('desktop dirty: false');
    expect(text).toContain('renderer dirty: true');
    expect(text).toContain(`dmg sha256: ${info.sha256}`);
  });
});
