# 18 — Audit log + retention: client trail today, server log tomorrow

> **Status: client v1 shipped, server v1 designed.** Written 2026-05-10.
> Companion to spec 17 (Agent permissions — collaborator audit).
> Documents the in-browser audit log that ships with `/app/settings →
> Audit retention`, the policy-enforced retention behaviour, and the
> server-side design that would let a vault owner see what
> collaborators did with their agents (the "who used my OpenAI key
> last Tuesday" question).
>
> **Today**: every meaningful client action — vault unlock, key add,
> share grant, share revoke, agent rotate — gets a timestamped entry
> in `localStorage['ks_audit_log']`. User can export, view, or purge.
> **No server log.** A collaborator's actions are invisible to the
> owner unless the collaborator self-reports.

---

## What the user does (client side, shipped)

1. Logs in. Every notable action (`vault.unlock`, `key.add`,
   `key.delete`, `share.grant`, `share.revoke`, `agent.rotate`,
   `auth.login`, `auth.logout`) implicitly emits an audit entry via
   `addAuditEntry(event, details)`.
2. Navigates to `/app/settings → Audit retention`. Sees:
   - Current policy: `{ max_age_days: 30, max_entries: 1000 }`
   - Total entries in log
   - "View log" toggle (renders the entries chronologically)
   - "Save policy" button (writes to localStorage + immediately
     enforces by trimming over-quota entries)
   - "Purge log" button (clears localStorage entry)
3. Changes the policy, e.g. to `{ max_age_days: 7, max_entries: 100 }`
   for tighter retention. Save → trim runs immediately.
4. Optional: clicks "Export" to download a `keyshield-audit-{ts}.json`
   for offline review.

The log is **per-device** — switching browsers loses history. The
server has no copy.

---

## What the user wants (server side, designed)

Three personas with different needs:

### Owner

5. Wants to see who used their agents' API keys + when, especially
   for collaborators. Today they can't.
6. Should see: `{user, agent, action, ts, request_id}` rows for any
   `/proxy/*` call, share-grant, share-revoke, key-rotate.

### Collaborator

7. Wants their own log of what they did, both for self-audit and to
   demonstrate good behaviour to the owner. Today only their own
   browser knows.

### Compliance / regulatory

8. Wants tamper-evident logs (append-only, hash-chained). Today's
   localStorage trivially fails this — user can edit the log or any
   single entry. Server side gets us at least append-only via DB
   schema.

---

## Where it lives

| Layer | File | Status | What runs here |
|---|---|---|---|
| **Browser (`packages/shared/`)** | `lib/audit-retention.ts` | ✅ shipped | `addAuditEntry()`, `getAuditLog()`, `clearAuditLog()`, `getAuditPolicy()`, `setAuditPolicy()` + UI aliases (`getPolicy/setPolicy/purgeAuditLog/DEFAULT_POLICY/AuditRetentionPolicy`) |
| | `types.ts` | ✅ shipped | `AuditRetention` type (max_age_days + max_entries) |
| **UI (`src/web/`)** | `components/AuditRetentionSettings.tsx` | ✅ shipped | Settings card: view + edit policy + view log + purge |
| | `components/ReportPage.tsx` | ✅ shipped | Calls `getAuditLog()` + renders chronological list with filters |
| **Storage (today)** | `localStorage['ks_audit_log']` | ✅ shipped | JSON array of `{ts, event, details}` |
| | `localStorage['ks_audit_policy']` | ✅ shipped | JSON `{max_age_days, max_entries}` |
| **Server (designed, NOT shipped)** | `src/backend/audit/log.py` | 📋 designed | `record(user_id, event, details)` writes to `audit_events` table |
| | DB: `audit_events` table | 📋 designed | `(id, user_id, agent_id, event, details_json, ts, request_id)` |
| | `src/backend/routes/audit.py` | 📋 designed | `GET /audit/events` (filter by agent / user / time range) |

---

## Wire format — client log entry

```ts
interface AuditEntry {
  ts: string;                              // ISO 8601
  event: string;                           // 'vault.unlock', 'key.add', etc.
  details: Record<string, unknown>;        // event-specific payload
}
```

Conventionally `details` includes:

- `event_id`: stable UUID for the entry (so deduping across server
  sync is possible later).
- `agent_id` / `key_name` / `share_id`: relevant resource keys.
- `result`: `'success'` | `'failure'` | `'denied'`.
- `error`: short string on failure.

No PII (passwords, plaintext keys, full request bodies). Best-effort
on the client side; server-side spec will enforce a redaction layer.

## Wire format — retention policy

```ts
interface AuditRetention {
  max_age_days: number;     // 0 = unlimited
  max_entries: number;      // 0 = unlimited
}

const DEFAULT_POLICY: AuditRetention = {
  max_age_days: 30,
  max_entries: 1000,
};
```

Enforcement runs on every `addAuditEntry()` and on `setAuditPolicy()`:

```ts
function enforce(log: AuditEntry[], policy: AuditRetention) {
  const cutoff = Date.now() - policy.max_age_days * 86400_000;
  while (log.length && new Date(log[0].ts).getTime() < cutoff) log.shift();
  while (log.length > policy.max_entries) log.shift();
}
```

Trim is FIFO — oldest entries go first. No retention against the tail
(no "keep last 100 high-severity events" logic in v1).

---

## Wire format — server log entry (designed)

```ts
interface ServerAuditEvent {
  id: string;              // ULID — sortable + stable
  ts: string;              // ISO 8601, server clock
  user_id: string;         // who initiated; for /proxy/* this is the calling user (owner OR collaborator)
  agent_id: string | null; // which agent's keys / wallet were touched (null for global events like /auth/login)
  event: string;           // canonical name; same registry as client (proxy.call, share.grant, ...)
  details: Record<string, unknown>;
  request_id: string;      // X-Request-Id header from the originating HTTP call
}
```

Stored in `audit_events` table:

```sql
CREATE TABLE audit_events (
  id          TEXT PRIMARY KEY,           -- ULID
  ts          INTEGER NOT NULL,           -- unix ms
  user_id     TEXT NOT NULL,
  agent_id    TEXT,
  event       TEXT NOT NULL,
  details     TEXT NOT NULL,              -- JSON
  request_id  TEXT,
  -- partition / index hints
  INDEX (user_id, ts DESC),
  INDEX (agent_id, ts DESC)
);
```

`id` is ULID rather than auto-increment so we can sort by id =
chronological without index gymnastics, and so distributed writers
don't collide.

### `GET /audit/events` (designed)

```http
GET /audit/events?agent_id=ag_01HW...&since=2026-05-01&limit=200
Authorization: Bearer <session>
```

Authorization rules (cross-ref spec 17):

- Owner can read all events for any agent they own (collaborators'
  actions included).
- Collaborator can read events where `user_id == self`, scoped by
  `agent_id`. **Cannot** see other collaborators' actions.
- Viewer can read aggregate metrics (count by event type) but not
  individual rows.

Response:

```json
{
  "events": [
    { "id": "01HW...", "ts": "...", "user_id": "...", "agent_id": "...", "event": "proxy.call", "details": {...}, "request_id": "..." },
    ...
  ],
  "next_cursor": "01HW...",
  "has_more": true
}
```

---

## Why these choices (alternatives considered)

### Why localStorage today (not IndexedDB)

The volume is small (1000 entries × ~200 bytes ≈ 200 KB max under
default policy). localStorage is simpler — no async API, no schema
migrations, no browser-quota negotiation dialogs.

If we ever need to keep more than ~5 MB of audit data client-side,
the move to IndexedDB is straightforward; the API surface in
`audit-retention.ts` already abstracts the storage backend.

### Why no server log v0.1 (today)

Three reasons we punted the server log to v1.1:

1. **Schema still moving.** Path A migration just landed
   (2026-05-09); audit on top of an unstable schema would mean
   double-migration work. Wait one cycle.
2. **Retention is a UX problem too.** What does "show me all events"
   mean when there are millions? Pagination, faceted filters,
   tamper-evidence — these need product design before code.
3. **Compliance scope unclear.** SOC 2 / GDPR / HIPAA each want
   slightly different shapes. We'd rather ship one shape that hits
   all three than ship soon and rebuild.

The client log gets us to "demo-quality audit" today; the server log
is a v1.1 PR.

### Why ULID not UUID

- Sortable: lexical sort = chronological sort, so `ORDER BY id` is
  free index work.
- Same 128-bit space as UUID, same collision-resistance.
- Roughly 26 chars instead of 36 — modestly more compact.

### Why FIFO trim, not severity-weighted

A "keep all severity=critical even after 30 days" rule sounds
obviously correct, until you realise:

- Defining severity per event is its own bikeshed.
- An attacker could spam high-severity events to crowd out genuine
  ones (an inversion: more important events lose to noise).

FIFO is uncontroversial. Severity-weighted retention is an option
in a v1.2 spec.

### Why one events table (not table-per-event-type)

Cardinality risk: agents.scope changes ≠ proxy.call. Different
shapes. But:

- `details` is JSON, which absorbs schema variation.
- One table = one query for "everything this user did" without UNIONs.
- Indexes are per-column, not per-table; no perf penalty.

If a single event type's volume dominates (e.g. proxy.call on a busy
agent is 99% of rows), we partition by `event` later. Premature today.

---

## Demo verification

### Client log smoke

```ts
import { addAuditEntry, getAuditLog, getAuditPolicy } from '@keyshield/shared/lib/audit-retention';

addAuditEntry('vault.unlock', { agent_id: 'ag_01HW...', result: 'success' });
console.log(getAuditLog());           // [{ ts, event, details }, ...]
console.log(getAuditPolicy());        // { max_age_days: 30, max_entries: 1000 }
```

### Manual end-to-end (no automated test yet)

1. Log in, do a couple of actions (add a key, share an agent).
2. Open DevTools → Application → localStorage → `ks_audit_log`. The
   entries should be visible.
3. Navigate to `/app/settings → Audit retention`. Set
   `max_entries = 5`. Save. Re-check `ks_audit_log` — only the 5
   most recent entries remain.

---

## Out of scope (future)

- **Server audit log** — see the design above; needs a v1.1 PR.
- **Tamper-evidence** — hash-chain entries (each entry hashes the
  previous one + own contents). Standard append-only ledger pattern.
  Not in v1.
- **Sync client → server** — when the server log ships, client should
  flush its localStorage to the server on every login (and clear it
  after success). That's an ADR's worth of trade-off (privacy implications
  of pushing every client action server-side).
- **Real-time stream** — for "live tail" of an active agent's
  actions, server-sent events or websockets on `/audit/events?live`.
- **Severity-aware retention** + **per-agent retention overrides** —
  finer-grained policy. v1.2 onwards.
