"""Run the extension's own zk-v1 helpers (src/extension/background.js)
against docs/zk/vectors.json under Node, so the browser side stays in step
with the spec and the Python SDK. Skipped when node is not installed."""

import json
import shutil
import subprocess
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parents[3]

SCRIPT = r"""
const fs = require('fs');
const { webcrypto } = require('crypto');
const bg = fs.readFileSync(process.argv[2], 'utf8');
const vec = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));
function fn(name) {
  const i = bg.search(new RegExp('(async )?function ' + name + '\\('));
  if (i < 0) throw new Error('missing ' + name);
  return bg.slice(i, bg.indexOf('\n}\n', i) + 2);
}
const h = new Function('crypto', [fn('_zkB64u'), fn('_zkUnb64u'), fn('zkRootId'), fn('_zkItemKey'),
  'return { _zkB64u, _zkUnb64u, zkRootId, _zkItemKey };'].join('\n'))(webcrypto);
(async () => {
  const rootBytes = h._zkUnb64u(vec.root);
  const rootId = await h.zkRootId(rootBytes);
  const root = await webcrypto.subtle.importKey('raw', rootBytes, 'HKDF', false, ['deriveBits']);
  const key = await h._zkItemKey(root, h._zkUnb64u(vec.share), vec.item_id, vec.upstream);
  const pt = await webcrypto.subtle.decrypt(
    { name: 'AES-GCM', iv: h._zkUnb64u(vec.iv), additionalData: new TextEncoder().encode(vec.aad) },
    key, h._zkUnb64u(vec.cipher));
  console.log(JSON.stringify({ rootId, plaintext: new TextDecoder().decode(pt) }));
})().catch((e) => { console.error(e); process.exit(1); });
"""


@pytest.mark.skipif(shutil.which("node") is None, reason="node not installed")
def test_extension_matches_zk_vectors(tmp_path):
    script = tmp_path / "zkvec.js"
    script.write_text(SCRIPT)
    vec_path = REPO / "docs" / "zk" / "vectors.json"
    out = subprocess.run(
        ["node", str(script), str(REPO / "src" / "extension" / "background.js"), str(vec_path)],
        capture_output=True,
        text=True,
        timeout=60,
        check=True,
    )
    got = json.loads(out.stdout.strip().splitlines()[-1])
    vec = json.loads(vec_path.read_text())
    assert got == {"rootId": vec["root_id"], "plaintext": vec["plaintext"]}


def test_extension_keeps_raw_pending_off_disk():
    bg = (REPO / "src" / "extension" / "background.js").read_text()
    assert "chrome.storage.session" in bg
    assert "ks_pending_vault: trimmed" in bg
    # the only storage.local touch of the old key is the one-time migration removal
    assert "chrome.storage.local.set({ ks_pending_vault" not in bg
    assert "chrome.storage.local.remove('ks_pending_vault')" in bg
