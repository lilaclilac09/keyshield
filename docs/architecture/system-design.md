# System Design — KeyShield

> Comprehensive technical specification for Google L7-level engineering review.

## 1. System Context

### Business Requirements

1. **Zero-trust key management** — Clients never handle raw API keys
2. **Multi-upstream support** — OpenAI, Anthropic, Groq, 0x, Titan, Helius, etc.
3. **Solana integration** — Wallet auth, on-chain vault state, payment streams
4. **Agent framework** — AI agents with isolated key access
5. **Scalability** — Handle 10K+ req/s with < 50ms p99 latency on hot path

### Non-Functional Requirements

| Attribute | Target | Measurement |
|-----------|--------|-------------|
| Latency (hot path) | < 50ms p99 | ks-proxy to upstream |
| Throughput | 10K req/s | Sustained load |
| Availability | 99.9% | Monthly uptime |
| Security | Zero-trust | Third-party audit |
| Scalability | Horizontal | Add more ks-proxy instances |

## 2. Architecture Patterns

### 2.1 Reverse Proxy with Fallthrough

```
Client → ks-proxy (:8000)
            ├─ Hot path (auth + key inject + cache) → Upstream
            └─ Fallthrough (reverse proxy) → Python (:8001)
```

**Why this pattern?**
- Hot path MUST be fast (Rust)
- Control plane changes frequently (Python, faster iteration)
- Client sees single endpoint (:8000)

### 2.2 Vault Encryption at Rest

```
API Key (plaintext)
    ↓ AES-256-GCM encrypt (with user passphrase)
Encrypted Blob (stored in .keyshield-vault.json)
    ↓ On request:
Encrypted Blob + passphrase → AES-256-GCM decrypt → API Key (in memory, per request)
```

**Key Derivation:** scrypt (N=16384, r=8, p=1) → 32-byte key

### 2.3 Session-Based Authentication

```
1. Client: Sign challenge with Solana wallet (ed25519)
2. Server: Verify signature → Issue JWT (1-hour expiry)
3. Client: Send JWT in Authorization header
4. Server: Validate JWT → Decrypt vault key → Inject into request
```

### 2.4 Cache-Aside with TTL

```
Request → Check cache (ks-cache, LRU)
         ├─ HIT → Return cached response
         └─ MISS → Forward to upstream → Store in cache (if cacheable) → Return
```

**Cache key:** `json.dumps(request_body, sort_keys=True, separators=(',', ':'))`
**TTL by upstream:**
- Helius `getBalance`, `getAccountInfo`: 5s
- Helius `getAsset` (NFT): 300s
- Others: Per-spec TTL

## 3. Component Specifications

### 3.1 ks-proxy (Rust)

**Responsibilities:**
- Request authentication (wallet signature, JWT)
- Rate limiting (token bucket per user)
- API key decryption (AES-256-GCM, bridge to Python for heavy ops)
- Key injection (set `Authorization`, `X-API-Key`, etc. per upstream)
- Response caching (LRU, TTL by upstream + method)
- Fallthrough to Python for non-hot-path routes

**Dependencies:**
- `axum` — Web framework
- `tokio` — Async runtime
- `reqwest` — HTTP client (with connection pooling)
- `rusqlite` — SQLite for session store
- `aes-gcm` — Encryption/decryption

**Performance:** ~10K req/s on single core (measured)

### 3.2 Python Control Plane

**Responsibilities:**
- Vault CRUD (store, list, delete keys)
- Agent management (create, rotate, revoke)
- Passkey (FIDO2/WebAuthn) registration + login
- Billing (Pyth price feeds, SOL balance tracking)
- x402 micropayment verification
- MPP (Multi-Party Payment) settlement

**Dependencies:**
- `fastapi` — Web framework
- `cryptography` — AES-256-GCM encryption
- `ed25519` — Key signing/verification
- `pythclient` — Pyth price feed
- `solana` — Solana RPC, transaction building

### 3.3 KeyShield Solana Program

**On-chain Instructions:**
- `StoreKey` — Store encrypted key reference (PDA)
- `AccessKey` — Grant/revoke agent access
- `ShareKey` — Share vault with another user (new PDA)
- `OpenStream` — Open payment stream (x402 protocol)
- `PayX402` — Pay for API usage
- `MPPSettle` — Settle multi-party payment
- `Withdraw` — Withdraw SOL from vault

**PDAs (Program Derived Addresses):**
```
Vault:    [ "vault", user_wallet, vault_name ] → vault_account
Access:   [ "access", vault_account, agent_pubkey ] → access_account
Share:    [ "share", vault_account, recipient_wallet ] → share_account
Stream:   [ "stream", vault_account, stream_id ] → stream_account
```

## 4. Data Models

### 4.1 Vault (Python + Solana)

**Python (local JSON):**
```python
{
  "vault_name": {
    "iv": "hex_string",
    "tag": "hex_string", 
    "data": "hex_string"  # encrypted API key
  }
}
```

**Solana (on-chain PDA):**
```rust
struct VaultState {
    wallet: Pubkey,        // Owner wallet
    name: String,          // Vault name
    key_hash: [u8; 32],  // SHA-256 of encrypted key (for reference)
    agents: Vec<Pubkey>,   // Authorized agents
    created_at: i64,       // Unix timestamp
    bump: u8,             // PDA bump seed
}
```

### 4.2 Session (SQLite)

```sql
CREATE TABLE sessions (
    id INTEGER PRIMARY KEY,
    wallet TEXT NOT NULL,
    token_hash TEXT NOT NULL,  -- SHA-256 of JWT
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    last_used INTEGER NOT NULL
);
```

### 4.3 Usage Log (SQLite)

```sql
CREATE TABLE usage (
    id INTEGER PRIMARY KEY,
    wallet TEXT NOT NULL,
    upstream TEXT NOT NULL,
    method TEXT,
    tokens_in INTEGER,
    tokens_out INTEGER,
    cost_usd REAL,
    timestamp INTEGER NOT NULL
);
```

## 5. API Specifications

### 5.1 Hot Path (ks-proxy, :8000)

| Method | Path | Auth Required | Cached |
|--------|------|---------------|--------|
| POST | `/proxy/{upstream}/*` | Yes | Depends on upstream |
| POST | `/manage/batch` | Yes | No |
| GET | `/health` | No | No |

### 5.2 Control Plane (Python, :8001, via fallthrough)

| Method | Path | Auth Required | Description |
|--------|------|---------------|-------------|
| GET | `/manage/keys` | Yes | List vaults |
| POST | `/manage/store` | Yes | Store new key |
| DELETE | `/manage/delete/{name}` | Yes | Delete vault |
| POST | `/manage/login/wallet` | No | Wallet login |
| POST | `/manage/agent/create` | Yes | Create agent |
| GET | `/manage/decrypt/{upstream}` | Yes | Get raw key (careful!) |
| POST | `/billing/topup-solana` | Yes | Top up via SOL |

## 6. Security Model

### 6.1 Threat Model

| Threat | Mitigation |
|--------|------------|
| API key theft (client-side) | Keys never leave server (zero-trust) |
| API key theft (server-side) | AES-256-GCM encryption at rest |
| Session hijacking | JWT with short expiry, wallet re-auth required |
| Replay attacks | Nonce in wallet signature challenge |
| MITM | TLS (ACME/Let's Encrypt) |
| Rate limiting bypass | Token bucket per user, enforced in ks-proxy |
| Key sharing abuse | Explicit sharing UI, on-chain audit trail |

### 6.2 Cryptographic Primitives

| Use Case | Algorithm | Key Size | Notes |
|----------|-----------|----------|-------|
| Vault encryption | AES-256-GCM | 256 bits | scrypt KDF (N=16384) |
| Wallet signatures | Ed25519 | 256 bits | Solana standard |
| JWT signing | Ed25519 | 256 bits | Same as wallet |
| Key derivation | scrypt | 256 bits | Salt: `keyshield-salt-v1` |

## 7. Scalability & Performance

### 7.1 Horizontal Scaling

```
Load Balancer (e.g., Nginx)
    ├─ ks-proxy instance 1
    ├─ ks-proxy instance 2
    ├─ ks-proxy instance N
    └─ Python control plane (shared SQLite via NFS or migrate to Postgres)
```

**Shared state:**
- Sessions: SQLite (read-only for ks-proxy, written by Python)
- Cache: Currently in-memory (future: Redis)
- Vault: Local JSON (future: migrate to Postgres)

### 7.2 Caching Strategy

**Current:** LRU in-memory (max 10K entries, ~100MB)
**Future:** Redis cluster for distributed caching

**Cache invalidation:**
- TTL-based (automatic expiry)
- Manual: `DELETE /manage/cache/purge` (future)

### 7.3 Connection Pooling

- **Upstream connections:** reqwest with `Connection: keep-alive`, pool max 100 per upstream
- **SQLite:** WAL mode, read-only connections for ks-proxy

## 8. Monitoring & Observability

### 8.1 Metrics (Future)

| Metric | Type | Description |
|--------|------|-------------|
| `ks_proxy_requests_total` | Counter | Total requests |
| `ks_proxy_request_duration_seconds` | Histogram | Request latency |
| `ks_proxy_cache_hit_ratio` | Gauge | Cache hit ratio |
| `ks_proxy_upstream_errors_total` | Counter | Upstream errors |
| `python_vault_operations_total` | Counter | Vault CRUD ops |

### 8.2 Logging

- **ks-proxy:** Structured JSON logs (tracing crate)
- **Python:** Python logging module → JSON formatter
- **Frontend:** Browser console + sent to `/manage/log` endpoint

### 8.3 Health Checks

- `GET /health` → 200 OK (ks-proxy)
- `GET /health` → 200 OK (Python, checks SQLite connectivity)

## 9. Disaster Recovery

### 9.1 Backup Strategy

- **Vault:** `.keyshield-vault.json` → encrypted backup to S3 (future)
- **SQLite:** Daily dump via `sqlite3 .dump` → S3
- **Solana program:** Upgradeable program (via Buffer account)

### 9.2 Recovery Procedures

1. **Lost vault file:** Restore from backup, or re-store keys via UI
2. **SQLite corruption:** Restore from dump, regenerate sessions
3. **Solana program bug:** Deploy new version via upgrade instruction

## 10. Future Roadmap

See [ROADMAP.md](ROADMAP.md) for detailed timeline.

**Q3 2026:**
- Redis for distributed caching
- Postgres migration (from SQLite)
- TLS termination in ks-proxy (ACME)
- Mobile app (React Native)

**Q4 2026:**
- MPC (Multi-Party Computation) for key generation
- Arcium integration (FHE - Fully Homomorphic Encryption)
- Stealth mode (obfuscated traffic)
- Bonsol integration (ZK proofs for usage)

**2027:**
- Multi-region deployment
- OpenClaw marketplace integration
- Enterprise SSO (SAML, OIDC)
- HSM (Hardware Security Module) support
