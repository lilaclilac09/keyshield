# Demo storyboard

Takes are **local mock SSE + Unix-socket OpenClaw IPC + live Devnet RPC**.
They do not unlock a real WebAuthn authenticator. Scene 5 does not submit
a new chain transaction; it reads the latest confirmed program signature.

| ID | Time | Screen | Action | Expected visible result | Caption | Evidence | Fallback |
|---|---|---|---|---|---|---|---|
| S1 | 0:00–0:25 | Terminal | SCENE 1 | Fixture `.env` + blank template + HTTP 502 + local SOL/USDC | Anti-pattern, then real wallet | harness stdout | `--fast` |
| S2 | 0:25–0:50 | Terminal | SCENE 2 | Ciphertext; clipboard `0 bytes`; `ksv2_sess_…` | SHA-256 PRF stand-in | same | skip if no xclip |
| S3 | 0:50–1:20 | Terminal | SCENE 3 | IPC inject; spec `blanks=0`; runtime `KS_TOKEN`; clipboard still 0 | No paste, no form, no markdown blanks | `session-spec.json` + openclaw log | sock in workdir |
| S4 | 1:20–1:50 | Terminal | SCENE 4 | Measured TTFT / total through `ks-proxy` | Quote the clock. No canned `68.4ms` | same | WARN if ≥80ms |
| S5 | 1:50–2:30 | Terminal + Explorer | SCENE 5 | Confirmed sig + CU; HOLD → 502 → clawback 0.00 | Ignore WrongSize `678bq…` | RPC + `test:fault` | Explorer |
| SD | 2:30 | Terminal | scene D | Nemotron mock or masked live key | MOCK unless OpenRouter 200 | console | skip live key |

Voiceover text: [DEMO_RECORDING_SCRIPT.md](DEMO_RECORDING_SCRIPT.md).
Playback files: [EVIDENCE_INDEX.md](EVIDENCE_INDEX.md).
