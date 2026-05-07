# KeyShield — Operator Runbook

Procedures for anyone running a KeyShield instance. Covers initial deploy,
secrets rotation, log retention, incident response, and graceful upgrades.

---

## 1. Initial deploy

### Prerequisites

- Docker + Docker Compose (v2 syntax, i.e. `docker compose`)
- A server with ports 80 (frontend) and 8000 (Rust proxy) open
- `openssl` or equivalent to generate random secrets

### Steps

```bash
# 1. Clone
git clone https://github.com/your-org/keyshield
cd keyshield

# 2. Create .env from example
cp .env.example .env
# Edit .env — at minimum, set:
#   KS_INTERNAL_SECRET   (REQUIRED — change before first start)
#   HELIUS_API_KEY        (REQUIRED for Solana billing)

# 3. Build & start
docker compose up -d --build

# 4. Verify
docker compose ps           # all three services should be "Up"
curl http://localhost:8000/health   # Rust proxy health
curl http://localhost:8001/health   # Python plane (only reachable from within the internal network or the proxy)
```

### Environment variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `KS_INTERNAL_SECRET` | **YES** | (none) | 32-byte hex secret shared between Rust proxy and Python. Generate: `openssl rand -hex 32`. **Rotate immediately if leaked.** |
| `HELIUS_API_KEY` | YES for Solana billing | (none) | Helius RPC key for balance lookups and Solana topup. |
| `KS_DEMO_MODE` | NO | `0` | Set to `1` to bypass x402 `payment_proof` requirement. **Never set in production.** |
| `KS_STEALTH` | NO | `0` | Set to `1` so the Rust proxy returns nginx 404 for unauthenticated requests. |
| `KS_DB_PATH` | NO | `/app/data/keyshield.db` | Path to the passkey credential SQLite DB inside the Python container. |
| `KS_VAULT_DIR` | NO | `/app/vault` | Directory where per-user encrypted vault files are stored. |

---

## 2. Secret rotation

### `KS_INTERNAL_SECRET`

The internal secret authenticates the Rust proxy → Python control plane bridge.
Leaking it lets anyone call `/_internal/*` endpoints (balance, log) directly.

Rotation procedure (zero-downtime):

```bash
# 1. Generate new secret
NEW_SECRET=$(openssl rand -hex 32)

# 2. Update .env
sed -i "s/^KS_INTERNAL_SECRET=.*/KS_INTERNAL_SECRET=$NEW_SECRET/" .env

# 3. Restart (both proxy + python must have the same value)
docker compose restart proxy python

# 4. Verify
curl http://localhost:8000/health   # still 200?
```

### Helius API key

```bash
# 1. Generate new key in Helius dashboard
# 2. Update .env
# 3. Restart only the python service (Rust caches Helius responses, not the key)
docker compose restart python
```

### User vault passphrases

Vault files are encrypted with the user's own passphrase (PBKDF2 + AES-256-GCM).
KeyShield never stores plaintext passphrases — only salted session tokens.
If a user forgets their passphrase, their vault is **unrecoverable**. There is
no operator reset path by design.

---

## 3. Data locations

Inside the Python container:

| Path | Contents | Backed up? |
|---|---|---|
| `/app/data/keyshield.db` | Passkey credentials | **YES — daily** |
| `/app/data/agents.db` | Agent pubkeys | **YES — daily** |
| `/app/data/usage.db` | Usage logs + balances | **YES — daily** |
| `/app/data/mpp.db` | MPP payment streams | **YES — daily** |
| `/app/data/shares.db` | One-time secret shares | NO — ephemeral |
| `/app/vault/{user_id}/*.enc` | Encrypted vault files | **YES — daily** |
| `/app/sessions.db` | Active sessions (temp) | NO — regenerated on login |

### Backup script

```bash
#!/bin/bash
# Run as a daily cron on the host

BACKUP_DIR=/var/backups/keyshield/$(date +%Y-%m-%d)
mkdir -p "$BACKUP_DIR"

# Copy SQLite DBs out of the container
docker cp keyshield-python-1:/app/data/ "$BACKUP_DIR/data"
docker cp keyshield-python-1:/app/vault/ "$BACKUP_DIR/vault"

# Compress
tar -czf "$BACKUP_DIR.tar.gz" "$BACKUP_DIR" && rm -rf "$BACKUP_DIR"
echo "Backup written to $BACKUP_DIR.tar.gz"
```

Add to crontab: `0 3 * * * /usr/local/bin/keyshield-backup.sh`

### Restore from backup

```bash
tar -xzf 2026-05-01.tar.gz
docker cp 2026-05-01/data/. keyshield-python-1:/app/data/
docker cp 2026-05-01/vault/. keyshield-python-1:/app/vault/
docker compose restart python
```

---

## 4. Log retention

### View live logs

```bash
docker compose logs -f           # all services
docker compose logs -f proxy     # Rust proxy only
docker compose logs -f python    # Python control plane only
```

### Structured log location

The Rust proxy emits JSON lines to stdout. Python emits uvicorn + FastAPI logs.
In production, ship logs to a collector (e.g., Vector → Loki or Datadog).

### Retention policy

- **Usage logs** (`usage_log` table): retained indefinitely by default.
  Prune with: `sqlite3 /app/data/usage.db "DELETE FROM usage_log WHERE created_at < strftime('%s','now') - 90*86400;"` (90-day retention).
- **Session DB**: sessions auto-expire; the cleanup runs at startup.
- **Vault shares**: expire by their `expires_at` column. Prune expired rows:
  `sqlite3 /app/data/shares.db "DELETE FROM vault_shares WHERE expires_at < strftime('%s','now');"`

---

## 5. Scaling considerations

### Current architecture

Single-node: all three containers on one host. The Rust proxy handles the hot
path; Python handles all auth and billing. Both are stateful (SQLite files),
which makes horizontal scaling non-trivial.

### Path to horizontal scaling

1. Move SQLite DBs to PostgreSQL (swap `sqlite3.connect` → `psycopg2`)
2. Move vault files to S3-compatible object storage
3. Run multiple Rust proxy replicas behind a load balancer (stateless after
   DB migration)
4. Keep one Python instance (or add read replicas once DB is Postgres)

This migration is tracked in TODOS.md as a P4 item.

---

## 6. Incident response

### Rust proxy is down (port 8000 not responding)

```bash
docker compose restart proxy
docker compose logs --tail=50 proxy   # look for panic / config error
```

Most common causes:
- `KS_INTERNAL_SECRET` mismatch after a rotation (proxy can't verify Python responses)
- `KS_PROXY_UPSTREAM` pointing at wrong Python address
- Port conflict (another process on 8000)

### Python control plane is down (502 from proxy)

```bash
docker compose restart python
docker compose logs --tail=50 python
```

Most common causes:
- SQLite locked (check for unclosed connections)
- Missing env var (`HELIUS_API_KEY` etc.)
- Import error after a bad deploy

### Vault file corruption

Symptom: decrypt returns 400 "decryption failed" for a user.

```bash
# List vault files for the user
ls /var/lib/docker/volumes/keyshield_ks_vault/_data/{user_id}/

# Each file is {upstream}.enc — a raw AES-256-GCM blob (96-byte header)
# If the file size < 96 bytes, it's truncated → unrecoverable without backup
```

Restore from backup: copy the affected `{upstream}.enc` file from the backup archive.

### Leaked `KS_INTERNAL_SECRET`

Treat as a full credential compromise:
1. Immediately rotate (`KS_INTERNAL_SECRET` — see §2)
2. Audit `/_internal/*` endpoint logs for unexpected calls
3. Consider invalidating all sessions: `sqlite3 /app/data/sessions.db "DELETE FROM sessions;"`

---

## 7. Graceful upgrade

```bash
# 1. Pull latest code
git pull origin main

# 2. Rebuild images (no downtime on the old containers while building)
docker compose build

# 3. Rolling restart — proxy first (stateless), then python
docker compose up -d --no-deps proxy
sleep 5
docker compose up -d --no-deps python

# 4. Verify
curl http://localhost:8000/health
```

For breaking DB schema changes, run migrations before step 3:
```bash
# Example: add column
docker compose run --rm python sqlite3 /app/data/keyshield.db "ALTER TABLE passkey_credentials ADD COLUMN display_name TEXT;"
```

---

## 8. Security checklist

Before going public:

- [ ] `KS_INTERNAL_SECRET` is a fresh 32-byte random hex (not the example value)
- [ ] `KS_DEMO_MODE` is `0` (or unset)
- [ ] Python service is NOT exposed to the internet (only the internal Docker network)
- [ ] TLS is terminated in front of the Rust proxy (nginx, Cloudflare, etc.)
- [ ] `HELIUS_API_KEY` has appropriate RPC rate limits set in the Helius dashboard
- [ ] Backups are running and a test restore has succeeded
- [ ] Log retention policy is configured

---

*Last updated: 2026-05-07*
