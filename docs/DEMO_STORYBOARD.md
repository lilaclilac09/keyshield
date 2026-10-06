# Demo storyboard

Takes are **local mock SSE + live Devnet RPC reads**. They do not unlock a
real WebAuthn authenticator. STEP 5 does not submit a new chain
transaction; STEP 4 reads the latest confirmed program signature.

| ID | Time | Screen | Action | Expected visible result | Caption | Evidence | Fallback |
|---|---|---|---|---|---|---|---|
| S1 | 0:00–0:25 | Terminal | STEP 1 | Local wallet pubkey, SOL + USDC from Devnet RPC, `ksv2_sess_…` | RPC balances, not `240.50 USDC` | harness stdout | `KS_RECORD_WALLET` |
| S2 | 0:25–0:50 | Terminal | STEP 2 | Ciphertext prefix; clipboard `0 bytes` | SHA-256 PRF stand-in, not Secure Enclave | same | skip if no xclip |
| S3 | 0:50–1:20 | Terminal | STEP 3 | Measured TTFT / total through `ks-proxy` | Quote the clock. No canned `68ms` | same | WARN if ≥80ms |
| S4 | 1:20–1:50 | Terminal + Explorer | STEP 4 | Program id, latest confirmed sig, CU, dashboard match | Ignore 84-char `678bq…` (WrongSize) | RPC `getTransaction` | Explorer |
| S5 | 1:50–2:20 | Terminal | STEP 5 | HOLD 0.05 USDC → 502 → hash FAILED → clawback 0.00 lost | Local ledger clawback; live analog is STEP 4 Withdraw | `test:fault` | `--fast` |
| SD | 2:20–2:30 | Terminal | scene D | Nemotron mock or masked live key | MOCK unless OpenRouter 200 | console | skip live key |

Voiceover text: [DEMO_RECORDING_SCRIPT.md](DEMO_RECORDING_SCRIPT.md).
Playback files: [EVIDENCE_INDEX.md](EVIDENCE_INDEX.md).
