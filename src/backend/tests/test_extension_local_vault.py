"""Exercise the extension-only local vault under Node, without provider traffic.

The extension does not implement the SDK's shared zk-v1 format or pending queue.
"""

import json
import shutil
import subprocess
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parents[3]

SCRIPT = r"""
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
const { LocalVault, audit, ITERATIONS } = await import(pathToFileURL(process.argv[2]));
const data = {};
const storage = {
  async get(key) { return { [key]: structuredClone(data[key]) }; },
  async set(update) { Object.assign(data, structuredClone(update)); },
};
const candidate = {
  provider: 'synthetic', origin: 'https://dashboard.provider.test',
  value: 'FAKE_LOCAL_VAULT_TEST_VALUE', preview: '••••ALUE',
};
const vault = new LocalVault(storage);
await assert.rejects(vault.save(candidate, 'test'), /Unlock the vault first/);
assert.deepEqual(data, {});
await vault.unlock('FAKE passphrase for local tests');
assert.equal(ITERATIONS, 310000);
assert.deepEqual(await vault.save(candidate, 'original'), { saved: true });
const firstWrite = structuredClone(data.vault);
assert.equal(firstWrite.version, 1);
assert.equal(firstWrite.iterations, 310000);
assert.equal(firstWrite.salt.length, 16);
assert.equal(firstWrite.iv.length, 12);
assert.equal(JSON.stringify(data).includes(candidate.value), false);
assert.equal(JSON.stringify(data).includes('FAKE passphrase'), false);
assert.deepEqual(await vault.save(candidate, 'not confirmed'), { duplicate: true });
assert.deepEqual(data.vault, firstWrite);
assert.equal(vault.list()[0].label, 'original');
await vault.save({ ...candidate, origin: 'https://other.test' }, 'updated', true);
assert.equal(vault.list().length, 1);
assert.equal(vault.list()[0].origin, candidate.origin);
assert.equal(vault.list()[0].label, 'updated');
assert.notDeepEqual(data.vault.iv, firstWrite.iv);
vault.lock();
assert.throws(() => vault.list(), /Unlock the vault first/);
await assert.rejects(vault.unlock('FAKE incorrect passphrase'), /Incorrect passphrase/);
assert.throws(() => vault.list(), /Unlock the vault first/);
await vault.unlock('FAKE passphrase for local tests');
assert.equal(vault.get(vault.list()[0].id).value, candidate.value);
await audit(storage, 'saved', candidate);
const { time, ...metadata } = data.auditLog[0];
assert.equal(Number.isFinite(Date.parse(time)), true);
assert.deepEqual(metadata, {
  action: 'saved', provider: candidate.provider, origin: candidate.origin,
});
assert.equal(JSON.stringify(data).includes(candidate.value), false);
vault.lock();
console.log(JSON.stringify({ encrypted: true, roundtrip: true, duplicateConsent: true }));
"""


@pytest.mark.skipif(shutil.which("node") is None, reason="node not installed")
def test_extension_local_vault_contract(tmp_path):
    script = tmp_path / "local-vault.mjs"
    script.write_text(SCRIPT)
    out = subprocess.run(
        ["node", str(script), str(REPO / "src/extension/lib/vault.js")],
        capture_output=True,
        text=True,
        timeout=60,
        check=True,
    )
    assert json.loads(out.stdout) == {
        "encrypted": True,
        "roundtrip": True,
        "duplicateConsent": True,
    }


def test_extension_has_no_shared_vault_bridge_or_pending_queue():
    bg = (REPO / "src/extension/background.js").read_text()
    for removed in (
        "ks_pending_vault",
        "queuePendingVault",
        "zkRootId",
        "_zkItemKey",
        "fetch(",
        "XMLHttpRequest",
        "chrome.tabs.sendMessage",
    ):
        assert removed not in bg
    assert "sender.id !== chrome.runtime.id" in bg
    assert "['popup.html', 'confirm.html']" in bg
    assert "sender.url === chrome.runtime.getURL(page)" in bg
    assert not (REPO / "src/extension/session-bridge.js").exists()
