# ZK mode (zk-v1)

ZK mode is opt-in, one user at a time. When it's on, the KeyShield server stores provider keys it **cannot read**: not at rest, not in transit, and not in memory. Keys are encrypted on your device. Calls are made by a proxy that runs on your machine or your agent's machine. The hosted `/vproxy` is **not ZK**: it needs to see the key to inject it, so it refuses ZK items with `409 zk_item`.

## Keys

| Name | What | Where it lives |
|---|---|---|
| PRF | WebAuthn PRF output from your passkey | your authenticator, per sign-in |
| **R** (root) | `HKDF-SHA256(ikm=PRF, salt="", info="keyshield/zk/v1/root")`, 32 bytes | your devices only: the dashboard (memory), the extension (non-extractable WebCrypto key) and the local proxy (`~/.keyshield/zk-root`, mode 0600) |
| root_id | `b64url(SHA-256("keyshield/zk/v1/root-id" ‖ R)[:18])` | server (`zk_users`). It's a fingerprint, so a client can tell it's using the right root |
| **S** (share) | 32 random bytes per item, made by the client | server only (`zk_shares`). The client forgets it after saving |
| item key | `HKDF-SHA256(ikm=R, salt=S, info="keyshield/zk/v1/item:<id>:<upstream>")` | derived on demand, never stored |
| cipher | `AES-256-GCM(item key, iv, provider key, aad="<id>|<upstream>")`, iv is 12 random bytes | server (`vault_items.cipher`, `iv`, `cipher_v = 2`, `value = ''`) |

To decrypt you need both R (only on your devices) and S (only on the server). The server holds S and the ciphertext but never R, so it can't decrypt. Someone who steals R but has no valid token can't get S.

Test vectors: `docs/zk/vectors.json`. They are checked by `src/backend/tests/test_zk_mode.py` and by the SDK and extension tests.

## API

| Call | Token | Does |
|---|---|---|
| `GET /zk/status` | any | `{enabled, root_id, plaintext_items, zk_items}` |
| `POST /zk/enable {root_id}` | owner | turns ZK mode on. A different root afterwards → `409 root_mismatch` |
| `POST /zk/disable` | owner | turns ZK mode off. ZK rows stay, and stay unreadable |
| `POST /manage/store {id, upstream, cipher, iv, share, cipher_v: 2, hint?}` | owner | stores a ZK row. `hint` is an optional public prefix such as `sk-proj-` |
| `GET /zk/items` | any | your ZK rows: ciphertext only, no shares |
| `GET /zk/share/{id}` | any | releases S to a valid token for that user. Answers `no-store` |
| `POST /zk/purge-plaintext` | owner | deletes your remaining plaintext rows and runs `VACUUM` |

While ZK mode is on:
- `/manage/store` and `PUT /manage/vault/{id}` refuse plaintext with `409 zk_mode`.
- `/manage/decrypt/{id}` on a ZK row answers `409 zk_item`, and so does `/vproxy` for that upstream.

Kill switch: `KS_ZK_DISABLED=1` makes every `/zk/*` route return 404.

## Revocation

A local proxy fetches S for each item and caches it for **at most 60 seconds**. Revoking the proxy's token (`POST /sessions/{id}/revoke`) makes `/zk/share` answer 401. So within one cache window, the proxy can no longer derive any item key.

The limit, stated honestly: a machine that has already decrypted a key could have kept a copy. If you think an agent host was compromised, **rotate the provider key**.

## What the server can still see

- Which providers you use, item names, the public `hint` prefix, timestamps, and when your tokens fetch shares.
- It cannot see the keys.
- It also serves the dashboard and extension code. A malicious operator could ship a build that exfiltrates R. That's the usual limit of web-delivered crypto. Self-hosting, or pinning a reviewed extension build, removes it.

## Migrating existing keys

1. Sign in with your passkey and turn on ZK mode. This derives R and posts `root_id`.
2. For each plaintext row, the client reads it once (`/manage/decrypt`), encrypts it locally, stores it as a ZK row, and deletes the old row.
3. `POST /zk/purge-plaintext` deletes any leftovers and compacts the database file.
4. **Rotate your provider keys.** The old keys sat in plaintext on the server before ZK mode, and database backups or snapshots taken before the purge may still contain them.
