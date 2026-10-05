# Demo storyboard

Takes are **local mock + historical Devnet views**. They do not unlock a
real WebAuthn authenticator and they do not create new chain
transactions.

| ID | Time (overview / technical) | Screen | Action | Expected visible result | Caption | Evidence | Fallback |
|---|---|---|---|---|---|---|---|
| S0 | 0:00 / 0:00–0:06 | Desktop | none | Existing dashboard may flash; not claimed as a live vault unlock | MOCK harness about to start | uncut 2:34 | skip |
| S1 | 0:00–0:14 / 0:08–0:22 | Terminal | harness runs scene 1 | Fixture `.env` + HTTP 502 + `LOSS` | Pay-before-delivery contrast (fixture keys) | `record_demo_console_clean.log` | `--fast` |
| S2 | 0:14–0:27 / 0:37–0:50 | Terminal | scene 2 | `ksv2_…`, clipboard empty, ciphertext prefix | Session token only — **simulated PRF scaffold**, not live WebAuthn | same | skip clipboard line |
| S3 | 0:27–0:42 / 1:05–1:20 | Terminal | scene 3 | TTFT 1.2 ms, RTT 4 ms, `< 80ms` | Local mock + warm `ks-proxy`, not production RPC | same | print WARN if slow |
| S4 | 0:42–1:04 / 1:33–1:55 | Terminal | scene 4 | `HOLD → FAULT → UNILATERAL CLAWBACK`, settled=0 | **Simulated** clawback copy in the client; Stage 3 tests the proxy | `stage3_fault.log` | `npm run test:fault` |
| SD | 1:04–1:15 / 2:01–2:16 | Terminal | scene D + vitest | Nemotron via mock; 4/4 fault tests | MOCK OpenRouter plug-in | console + stage3 | skip live OpenRouter |
| E1 | — / 2:34–3:47 of V-B | Chrome | read-only attempt | **Failed:** `explorer.solana.com` Cloudflare “verifying your browser”. No account data rendered | Do not treat V-B as on-chain proof | RPC JSON is the proof | Solscan opened later; not in V-B |
| E2 | — / not in V-B | RPC + later Solscan tab | read-only | `t6B8V4Wg` ix **24**; `2CnCiiji` ix **26**; `u99eN5uh` ix **27** | Discriminators from RPC | `recent_program_sigs.json`, `onchain_verify_now.json` | Explorer.com video walk **blocked** |

Voiceover text: [DEMO_RECORDING_SCRIPT.md](DEMO_RECORDING_SCRIPT.md).
Playback files: [EVIDENCE_INDEX.md](EVIDENCE_INDEX.md).
