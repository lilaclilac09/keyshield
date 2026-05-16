# KeyShield — Demo Script

Three versions:

- **30-second elevator** — hallway / elevator pitch
- **3-minute judging** — Colosseum / judges demo
- **5–7-minute deep dive** — full live demo session

Core line (always open with this):

> **Your agent never holds the key. Your wallet sets the budget. Solana settles the bill.**

---

## 30-second elevator

> KeyShield is a zero-trust API key proxy for AI agents. Problem: agents today have raw OpenAI and Helius keys in their `.env` files — one leak is a $40k bill overnight. We encrypt every key client-side with a passkey-derived AES-256 master key. The server only ever sees ciphertext. When an agent calls OpenAI, the proxy injects the key once, discards it immediately, and writes a USDC micropayment to a Solana stream. You pay per actual call, and you revoke any rogue agent with one on-chain instruction. Live on devnet, ~35k lines, Solana program ships seven instructions. Built in 14 days for Privacy Hack 2026.

---

## 3-minute judging (Colosseum judges)

**Structure:** pain → solution → 3 demo highlights → why now → invite to try

### 0:00 – 0:30 — Pain + one-liner

Open slide 1 (KeyShield title).

> "Agents are the biggest trend of 2026, but agentic AI key security is still a blind spot. Today OpenAI keys are managed like it's 2015 — `.env` files, Docker images, CI environment variables. Once an agent has a key, it might log it in a context window, dump it in a log file. One billing spike and you're out $40k with no idea which agent did it.
>
> KeyShield in three lines: **Your agent never holds the key. Your wallet sets the budget. Solana settles the bill.**"

Switch to slide 3 (KeyShield in one line).

### 0:30 – 1:00 — How it works (architecture)

Switch to slide 4 (architecture diagram). Walk through 4 layers:

> "1. **User device:** passkey derives a master key via WebAuthn PRF. Every API key is AES-256-GCM encrypted in the browser before it leaves the device.
>
> 2. **Cloudflare Worker:** stores only ciphertext. Physically cannot decrypt — it never has the key.
>
> 3. **Rust proxy:** on every call, the frontend sends the plaintext key to the proxy; the proxy uses it once and immediately discards it. Never written to disk.
>
> 4. **Solana program:** every call also writes a USDC micropayment to an on-chain MPP stream. Billed per token."

Emphasize: "The server, from startup to shutdown, has never had a raw API key touch disk or cold storage. Physical guarantee, not a promise."

### 1:00 – 2:30 — Live demo (3 highlights)

Switch to browser at `https://app.ks.aileena.xyz` (or localhost).

**Highlight 1 (30 sec) — Passkey enrollment + vault encryption**

- Click "Connect Wallet" → Phantom popup → sign
- Go to Device Vault → "Enroll passkey" → Touch ID
- Add an OpenAI key → open DevTools Network tab, point at the PUT request:
  > "See — what's sent is a base64 encrypted blob, not the raw key. This is the result of AES-GCM encryption in the browser."

**Highlight 2 (30 sec) — Proxy call + on-chain settlement**

- Switch to Activity tab
- Run in terminal: `python examples/bot.py "tell me a joke"`
  ```python
  from keyshield_sdk import KeyShield
  ks = KeyShield(token=os.environ["KS_TOKEN"])
  print(ks.openai_client().chat.completions.create(...))
  ```
- One row appears in Activity: upstream=openai, tokens=42, cost=$0.0008
- Click the tx hash → Solana Explorer:
  > "This is a real `MppSettle` instruction. On-chain you can see 0.8 milli-USDC transferred out of my stream PDA. One call, one on-chain debit."

**Highlight 3 (30 sec) — Agent revocation**

- Switch to Agents tab
- Click "Revoke" on an agent → Phantom popup → sign
- Run the same bot again with the same agent token:
  > "Immediate 403. Revocation is one Solana instruction — not three database updates plus a cache invalidation."

### 2:30 – 3:00 — Why now + close

Switch to slide 11 (Why we win comparison table):

> "Why now? Three things converged:
> 1. AI agents are going live at scale and need OpenAI / Anthropic / RPC keys to function.
> 2. The x402 standard on Solana is mature — HTTP-native per-request micropayments.
> 3. WebAuthn PRF is now mainstream — passkey-derived client-side encryption no longer requires a cryptography PhD.
>
> MIT open source, devnet live, SDK in three languages — scan the QR to try it now."

Switch to last slide (QR / links).

---

## 5–7 minute deep dive

Same opening as the 3-minute version, then add these three extensions to the demo:

### Extension A — Let a judge sign in with their own wallet

Open Phantom on your phone, let a judge scan the connect QR from the dashboard. Their wallet logs straight into your demo. Memorable because judges see 30 projects a day — the ones they can touch stick.

### Extension B — DevTools proof that the key never appears

DevTools → Network → find a `/proxy/openai/v1/chat/completions` POST → Request Headers → point at the `X-Upstream-API-Key` row:

> "This is the key the proxy received. Now look at the server log (SSH terminal with tail running) — no trace of the key. The proxy passes it as a function argument once, and it's garbage collected when the function returns."

Run `grep "sk-proj" /var/log/*` in the backend terminal → 0 lines.

### Extension C — Show the Solana program source

> "This isn't a stub — this is a real on-chain program."

Open `src/programs/keyshield/src/instructions/mpp_settle.rs`, point at the `transfer_checked` line:

> "USDC moves from the stream PDA to the settler's ATA. Every line is auditable on-chain."

Open Solana Explorer for a historical `MppSettle` tx → expand inner instructions.

---

## Judge FAQ

**Q: What's different from Vault.dev or 1Password?**
A: Their servers can decrypt. Ours physically cannot. Physical guarantee vs. a promise. Plus we're agent-native (ed25519 signing built in) with on-chain settlement.

**Q: What if the Cloudflare Worker is compromised?**
A: It only holds ciphertext — it physically has no decryption key. A breach leaks encrypted blobs only. An attacker still needs the passkey to decrypt.

**Q: Who uses x402?**
A: Helius is building on it, Coinbase standardized it, OpenAI is engaged. It's an HTTP-level protocol standard, not vendor-locked.

**Q: Can this work without Solana?**
A: Current architecture is Solana-first (USDC micropayments + low gas). The protocol layer is chain-agnostic and can extend to Base + USDC.

**Q: Real agent demo?**
A: SDK supports OpenAI / Anthropic / Helius RPC today. One-line swap: `from keyshield_sdk import KeyShield`.

**Q: Business model?**
A: Self-hosted open source is free. Hosted takes 2% of micropayment throughput (industry standard) + enterprise SaaS monthly.

**Q: Team?**
A: 14 days, solo, ~35k lines. Proving it works first, then scaling the team.

---

## Materials checklist

- [ ] Laptop + charger
- [ ] Backup hotspot (phone tethering)
- [ ] Phantom wallet installed + devnet USDC ≥ $20
- [ ] Backup demo video (if live demo network fails) — see `docs/internal/demo-script.md`
- [ ] PDF pitch deck (build with `npm run docs:pitch-pdf`)
- [ ] Business cards + QR (GitHub + landing page)
- [ ] Arrive 30 min early — test projector + network

---

## Build the PDF

```bash
npm run docs:pitch-pdf
# output: docs/pitch/PITCH_DECK.pdf
```
