# 17 — Agent permissions: owner / collaborator / viewer

> **Status: design v1 (not yet shipped).** Written 2026-05-10.
> Companion to spec 13 (Agent Access — how agents authenticate) and
> spec 16 (Path A vault — how vault encryption works). Documents the
> **target permission model** for the dashboard's `/app/agents` and
> `/app/sharing` pages, and the gap between today's single-owner code
> and the multi-role design.
>
> **Today**: agents are single-owner (`owner_wallet` column on
> `agent_keys`). Sharing routes exist (`/share/grant`,
> `/share/incoming`, `/share/outgoing`) but `encrypted_dek=None` —
> grant is recorded, the DEK isn't actually re-wrapped, so the
> grantee has no way to decrypt the shared vault. This spec is the
> design we'd land to remove the stub.

---

## What the user does (target state)

### Owner workflow

1. Logs in, navigates to `/app/agents`. Sees a row per agent with
   columns: name, public key, scopes, **role**, last used, on-chain
   actions.
2. Clicks **Share** on an agent row. Modal: "Add collaborator". Pastes
   a Solana wallet address (or selects from a contact list). Picks a
   role (Collaborator or Viewer). Optional: expiry date.
3. Clicks **Grant**. Wallet pops a sign-tx prompt (the share itself is
   off-chain, but the grant signs an attestation that gets stored
   alongside the re-wrapped DEK).
4. Browser fetches the grantee's public key, ECDH-derives a shared
   secret, AES-GCM-wraps the agent's master key, and PUTs the
   resulting envelope to `/share/grant`.

### Collaborator workflow

5. Grantee logs in. `/app/sharing → Incoming` shows the new grant.
6. Clicks **Accept**. WebAuthn unlock → derives their own master key →
   ECDH with the owner's public key → unwraps the shared agent's DEK.
7. The shared agent now appears in the grantee's `/app/agents` page,
   marked with a "Shared by <owner-handle>" badge.
8. Collaborator can: trigger `/proxy/*` calls, view usage stats,
   open MPP streams. **Cannot**: revoke the agent, transfer
   ownership, or share with a third party.

### Viewer workflow

Same as Collaborator, except: cannot trigger any side-effecting
action — just sees usage stats + key metadata. Useful for an
auditor / observer pattern.

### Owner revocation

9. Owner clicks **Remove** on a collaborator row. Re-wrapped DEK is
   deleted from the share registry (the collaborator can't decrypt
   future ciphertexts), and the agent's master key is **rotated**
   (a new DEK encrypts the next vault state).
10. Until rotation completes, the revoked collaborator can still
    decrypt the **last** ciphertext they have cached locally —
    revocation is immediate for *new* writes only. This is documented
    on the revoke confirm dialog.

---

## Permission matrix

| Action | Owner | Collaborator | Viewer |
|---|---|---|---|
| List agent | ✅ | ✅ | ✅ |
| Show agent metadata (name, scopes, last_used) | ✅ | ✅ | ✅ |
| Trigger `/proxy/*` calls using this agent | ✅ | ✅ | ❌ |
| Run `/agent/execute` coding turn (spec 19) | ✅ | ✅ | ❌ |
| Open MPP stream (spec 15) | ✅ | ✅ | ❌ |
| `record_units` to existing stream | ✅ | ✅ | ❌ |
| Close MPP stream | ✅ | owner-of-stream only | ❌ |
| Show usage stats | ✅ | ✅ | ✅ |
| Add API key to agent's vault | ✅ | ❌ | ❌ |
| Delete API key from agent's vault | ✅ | ❌ | ❌ |
| Share agent with third party | ✅ | ❌ | ❌ |
| Revoke own access | ✅ | ✅ | ✅ |
| Revoke other collaborator | ✅ | ❌ | ❌ |
| Transfer ownership | ✅ | ❌ | ❌ |
| Delete agent | ✅ | ❌ | ❌ |

The matrix is enforced at **two** layers:

1. **Backend route guards** — every mutating endpoint reads the
   session's `user_id`, looks up the role for `(user_id, agent_id)`,
   and returns 403 on insufficient role.
2. **Frontend UI affordances** — buttons disappear (or show as
   disabled with a tooltip) for actions the user lacks role for.

Trust boundary: the **backend is authoritative**. UI affordances are a
courtesy. A malicious client can hit the API directly; the route
guards must catch it.

---

## Where it lives

| Layer | File | What runs here |
|---|---|---|
| **DB (`src/backend/`)** | `agents/agents.py` (extended) | new column `agent_collaborators(agent_id, user_id, role, granted_at, expires_at, encrypted_dek BLOB)` |
| | `sharing/sharing.py` (extended) | `grant()` now requires `encrypted_dek != None`; `revoke()` deletes the row + triggers rotation |
| | `sharing/dek_rotation.py` (new) | re-encrypts the agent's vault under a fresh DEK; called from `revoke()` |
| **Backend routes (`src/backend/routes/`)** | `agents.py` middleware | `_require_role(agent_id, min_role: 'viewer'|'collaborator'|'owner')` decorator on every endpoint |
| | `sharing.py` | `POST /share/grant` validates `encrypted_dek`, refuses None |
| **Crypto (`packages/shared/`)** | `lib/share-envelope.ts` (new) | `wrapDekFor(recipientPubkey, dek)` and `unwrapDek(envelope, ownPrivKey)` — ECDH + HKDF + AES-KW |
| **UI (`src/web/`)** | `pages/Agents.tsx` (extended) | adds Role column + Share button + per-row affordance gating |
| | `components/ShareAgentModal.tsx` (new) | grantee picker, role select, expiry, calls `wrapDekFor()` then POSTs `/share/grant` |
| | `pages/Sharing.tsx` (extended) | Accept/decline incoming, list outgoing, revoke |

---

## Wire shape

### `POST /share/grant` (target — current is stub)

```http
POST /share/grant
Authorization: Bearer <session>
Content-Type: application/json

{
  "agent_id": "ag_01HW...",
  "grantee_address": "F6AhYT67tiCkY8we5MJRNiUJCBLQNiaFjeQvYxTpJ52R",
  "role": "collaborator",
  "expires_at": "2026-12-31T23:59:59Z",   // optional
  "encrypted_dek": "BASE64URL_ECDH_AES_KW_ENVELOPE"
}
```

The `encrypted_dek` is computed **client-side** by `wrapDekFor()`:

```ts
async function wrapDekFor(recipientPubkey: PublicKey, dek: CryptoKey): Promise<string> {
  // 1. ECDH(owner_priv, recipient_pub) → 32-byte shared secret
  // 2. HKDF(shared_secret, info='ks-share-envelope-v1') → 256-bit wrapping key
  // 3. AES-KW(wrapping_key, dek) → wrapped envelope
  // 4. Concat: [ephemeral_pub_64B || iv_12B || envelope_40B]
  // 5. base64url
}
```

Server stores this blob opaquely. It only knows `(agent_id,
grantee_pubkey, role, expires_at, encrypted_dek_blob)`. The blob is
unwrappable only by holders of the recipient's private key.

### `GET /share/incoming` (existing, returns the new shape)

```json
[
  {
    "id": "sh_01HW...",
    "agent_id": "ag_01HW...",
    "agent_name": "trader-bot",
    "owner_handle": "alice.sol",
    "role": "collaborator",
    "granted_at": "2026-05-10T18:30:00Z",
    "expires_at": "2026-12-31T23:59:59Z",
    "encrypted_dek": "BASE64URL..."
  },
  ...
]
```

### `POST /share/{share_id}/accept` (new)

```http
POST /share/sh_01HW.../accept
Authorization: Bearer <session>
```

Server marks the share `accepted=true` (so it shows up in the
collaborator's agent list). Doesn't return the DEK — the grantee
already has the `encrypted_dek` from the `incoming` listing.

Client unwraps locally:

```ts
const envelope = base64UrlToBytes(grant.encrypted_dek);
const dek = await unwrapDek(envelope, recipientPrivKey);
// store dek in vault-session for the duration of this session
```

### `DELETE /share/{share_id}` (existing)

Owner revokes. Server:
1. Deletes the row.
2. Generates a fresh DEK for the agent.
3. Re-encrypts the agent's vault with the new DEK.
4. For every *remaining* collaborator, re-wraps the new DEK against
   their pubkey (calls each grantee's `pubkey` from the share rows).

The revoked collaborator's cached envelope still works against the
**old** ciphertext, but every new write is unreadable to them. This is
the limit of revocation without changing wallets.

---

## Why these choices (alternatives considered)

### Why ECDH-AES-KW envelopes (not server-side re-encryption)

The naïve approach: server holds the DEK in plaintext, hands it to
each grantee. Defeats the entire Path A premise (server sees keys).

A second alternative: server holds the DEK encrypted under a master
KEK that the server controls. Better, but operator with backend
access still effectively has plaintext. Path A explicitly rejects
this in spec 16.

ECDH lets us use **the recipient's wallet pubkey** as the unwrapping
key. We get:

- Server never sees the DEK in any form.
- Each grantee has their own envelope (no shared secret across
  collaborators).
- Revocation is "delete the envelope" — simple, no key rotation
  required for the same recipient set, only for the changed set.

The downside: revocation requires re-wrapping for all *remaining*
collaborators. That's O(N_remaining) work per revoke, with N small in
practice (typically 1-3 collaborators per agent).

### Why a separate `agent_collaborators` table (not a JSON column)

Three reasons:
- **Indexing.** `WHERE user_id = X AND role >= 'collaborator'` is a
  hot query (every agents-list fetch runs it). Indexed column beats
  JSON scan.
- **Revoke atomicity.** `DELETE FROM agent_collaborators WHERE
  share_id = ?` is one statement; deleting a JSON entry is read-mod-write.
- **Foreign key cascade.** Dropping an agent (rare, but possible)
  cascades cleanly to its collaborators.

### Why three roles (and not more like SaaS does)

SaaS apps typically have ~6 roles (admin, editor, commenter, etc.).
Three was the minimum that captures the *security-relevant* axis:

- **Owner** — controls the agent's secrets + access matrix.
- **Collaborator** — uses the agent as if they were the owner, except
  for share-management operations.
- **Viewer** — no side-effects, observation only.

Anything finer (e.g. "can change scopes but not revoke") is out of
scope; users who need it can use multiple agents with different
default scopes and share each separately.

### Why client-side role gating in addition to server-side

Server-side gating is the security boundary. UI gating is for *UX* —
showing a disabled button with a tooltip is much better than letting
the user click and getting a confusing 403 toast. The frontend has no
authority to *grant* itself a permission, only to surface disabled
buttons.

---

## Migration from today

Today's state:
- `agent_keys.owner_wallet` is the single source of truth for "who
  controls this agent".
- `/share/grant` accepts `encrypted_dek=None` and stores no envelope.
- Frontend has no Share button.

Migration steps (sequenced PRs, not one big bang):

1. **Schema migration**: add `agent_collaborators` table. Backfill:
   for each row in `agent_keys`, insert
   `(agent_id, owner_wallet, role='owner')` so the new ACL system
   recognizes today's owners.
2. **Backend route guards**: introduce `_require_role()` decorator,
   apply to every mutating route. Map old paths to `role=owner`
   (no behavior change for owners; collaborators don't exist yet).
3. **Refactor `/share/grant`**: require `encrypted_dek`, validate
   shape, store envelope. Old None-dek requests get 400.
4. **Implement `wrapDekFor()` / `unwrapDek()`** in
   `packages/shared/src/lib/share-envelope.ts`.
5. **Ship `ShareAgentModal.tsx`** + extend Agents.tsx with Share
   button.
6. **Implement DEK rotation on revoke** in
   `sharing/dek_rotation.py`.

Each step is independently shippable + reversible.

---

## Out of scope (future)

- **Time-bound access.** `expires_at` is recorded but not enforced
  yet. Cron job to expire shares is a separate spec.
- **Audit log of access.** Each `/proxy/*` call by a collaborator
  should emit a record visible to the owner. Builds on top of spec
  15's `record_units` shape.
- **Agent transfer.** "Make Bob the new owner". Requires re-wrapping
  for Bob + retiring Alice's owner row + updating
  `agent_keys.owner_wallet`. Edge case: what if Alice goes offline
  mid-transfer? Two-phase commit needed.
- **Group permissions.** "Anyone in `engineering@`". Requires a
  groups table and grant resolution at runtime. Larger feature, own
  spec.
- **Read-only API tokens.** Granting a token (not a wallet) viewer
  access for a CI script. Today the token is implicitly owner; we'd
  need scoped tokens.
