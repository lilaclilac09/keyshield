# This journey — vault keys + payment methods to present

Aileen asked: *I saved keys but Vault showed none; show me everything I did
here, which payment methods I am on, and a video of those payments.*

This file is the one-page brief. It does **not** invent a shop token. It
does **not** send you to Raydium / Pump.fun `$X402` / `$M32`.

Open the dashboard at
`http://127.0.0.1:5173/?local=1&ext=1&demo=shop`
(or hosted `https://app.ks.aileena.xyz/?ext=1&demo=shop`).
Bare `:5173` without `?local=1` bounces to hosted.

---

## 1. What you present on camera

Lead with **one live Solana Devnet shop SKU** and **one receipt**.

| Say this | Do not say |
|---|---|
| Circle Devnet USDC `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU` | “We bought $X402 on Raydium” |
| Program `41P2wHKAr69aSgLgt1QdKH6VVgK6uFYKM7hpKAyBxr9j` ix **26** `mpp_settle` | “private mempool” |
| SKU **2.00 USDC MPP capture** — open 5.00 escrow, capture 2.00 | “OpenRouter sold us credit” |
| Receipt **KS-MPP-509959477** | A made-up shop token |
| Owner `GHpmxvrXbAfc5XWG7mPrJFqchWEQC6mc2hyStP5P4bhq` | Settler secret / keystore JSON |
| Extension **1.2.4** `ok 1.2.4 <all_urls>` | “Load 1.1.7” |

Home already shows this receipt (`LAST_LIVE_MPP_RECEIPT` in
`src/web/lib/mpp-receipt.ts`). Do **not** buy again on `:8001` (wrong vault
PDA). The live capture ran on isolated `:8011`.

---

## 2. Why Vault was empty after you saved

You saved. The toast said saved. **Vault tab listed none.**

The Chrome extension writes **only** `POST /manage/store` on the Python
shim (`vault_shim.db`). It does **not** write Path A / Cloudflare Device
Vault. The Vault tab lists `/manage/vault` for **this session’s
`user_id`**.

What actually happened on this machine:

| Session `user_id` | Rows in shim | What you see if you log in as that user |
|---|---|---|
| `vault-demo-user` | **5** — openai, anthropic, openrouter, groq, helius | The five extension saves |
| `filldemo` | **3** — openai / anthropic / openrouter `*LOCALONLY` | Autofill demo keys |
| `GHpmxvrXbAfc5XWG7mPrJFqchWEQC6mc2hyStP5P4bhq` | **3** — openrouter, github, vercel | Owner wallet session |
| `default` | 2–3 orphan openai rows (some cipher-only) | Only claimed on loopback if that user has zero rows |

If the popup said **Sign-in** first, or the extension token ≠ dashboard
token, or the extension API base was Railway while the tab read
`127.0.0.1:8001`, saves landed in **another bucket**. Hosted Railway will
**not** claim `user_id=default`.

Fix already in this stack (`c933a0eea`):

- bad Bearer + `X-Dev-Mode` no longer writes `default`
- Vault refetches on tab visit / focus / `ks-vault-changed`
- loopback can claim orphan `default` rows for an empty signed-in user

**How to see the five keys now:** same Chrome profile, Sign-in so popup
badge leaves `no token`, then Vault. Same API host as the save
(local `:8001` or Railway — not mixed). Load unpacked **1.2.4**.

---

## 3. Everything done in this Cloud journey

| Step | What | Live? | Where |
|---|---|---|---|
| 1 | Extension detect + auto-save after login (`ok 1.2.4 <all_urls>`) | local / hosted | `src/extension` |
| 2 | Five provider keys saved via extension | **yes, in shim** under `vault-demo-user` | `vault_shim.db` |
| 3 | Vault looked empty | **session mismatch**, not “lost keys” | Vault tab |
| 4 | Autofill saved keys into Cursor Settings black box | **1.2.4** | `content.js` + popup Fill / Copy |
| 5 | Tiny Devnet capture, then a **bigger** shop SKU | **live Devnet** on `:8011` | MPP ix 26 |
| 6 | Shop card + downloadable receipt | **yes** | Home `shop-demo-card` |
| 7 | Popup merge markers broke Sign-in | **fixed** — parse + `bootPopup` | `popup.js` |
| 8 | Load unpacked version stamp | **1.2.4** not 1.1.7 / 1.1.9 | `manifest.json` |

### Live shop receipt (present this)

| Field | Value |
|---|---|
| Receipt | **KS-MPP-509959477** |
| SKU | 2.00 USDC MPP capture |
| Network | Solana Devnet |
| Open tx | `4YW8ffsbMHhthcCrbfcHbqvi2Aw5B5V7pRa9bEUQAdsTUNNtcfhxJG7hgJP93hsit6YnyUSeHyLyaZ1eDaP12ici` · slot 509959472 |
| Settle tx | `3tGEtZ65Hop8mB4EYadBhq4QxgBNfjRBTQufS6hjD4Tb7i7ZXQ6n6VwCggT9bSjuuRLouRs9Q16RbXAasYVDm8Yb` · slot 509959477 · 1986 CU · err=null |
| Stream PDA | `jhgpjSE2unJyjTGzFPfJLPu7zxbiTHCWAsiNvmUiwzj` |
| Stream USDC ATA | `HEmJmhGCum3SupCfVwDaCt2WuJPyeoy1NJ21HYjHGYnS` |
| Owner USDC | 17.89 → **12.89** |
| Escrow | 5.00 → 3.00 |
| Platform USDC | 0.60001 → 2.60001 |

Explorer (Devnet):

- Open: https://explorer.solana.com/tx/4YW8ffsbMHhthcCrbfcHbqvi2Aw5B5V7pRa9bEUQAdsTUNNtcfhxJG7hgJP93hsit6YnyUSeHyLyaZ1eDaP12ici?cluster=devnet
- Settle: https://explorer.solana.com/tx/3tGEtZ65Hop8mB4EYadBhq4QxgBNfjRBTQufS6hjD4Tb7i7ZXQ6n6VwCggT9bSjuuRLouRs9Q16RbXAasYVDm8Yb?cluster=devnet
- Owner: https://explorer.solana.com/address/GHpmxvrXbAfc5XWG7mPrJFqchWEQC6mc2hyStP5P4bhq?cluster=devnet

Live `:8001` keychain for that owner (this VM, just now): SOL **1.636271**,
USDC **12.89**, ledger **$0.10**, plan Free, stored APIs openrouter /
github / vercel. USDC 12.89 matches the receipt after-balance.

---

## 4. Payment methods — which ones you are on

**Present these (product surfaces):**

| Method | Tab / card | Live? | What it is |
|---|---|---|---|
| **MPP shop $2.00 USDC** | Home → Shop | **LIVE Devnet** (already paid) | Open 5.00 / capture 2.00 ix 26. Receipt KS-MPP-509959477 |
| **RPC speed check** | Home → Shop | **LIVE read** | Two `GET /keychain/home` — handshake + cache |
| **Wallet SOL / USDC tiles** | Home | **LIVE read** | Owner funded on Devnet — do not airdrop on camera |
| **Proxy ledger + $0.10 credit** | Home / Payments → Billing | **DEMO ledger** | `POST /billing/topup` — **no Solana tx** |
| **Plans Free / Plugin / Accelerate** | Payments → Plans | **LIVE API** | Seats; extra calls still PAYG |
| **Phantom SOL top-up** | Payments → Top Up | **LIVE Devnet** when wallet connected | Quote + transfer + verify |
| **Paste Devnet USDC tx** | Payments → Top Up | **LIVE** if the tx is real Circle USDC | `/billing/topup-solana-usdc` |
| **MPP streams** | Payments → MPP Streams | **LIVE** with autosign / wallet | Open / meter / capture / withdraw |
| **Usage Payment column** | Payments → Usage Log | **LIVE** when proxy sends status | Paid / pending / failed |
| **x402 trust list** | nav **X402 Trust** | **LIVE config** | Domains the extension may auto-pay |
| **Extension x402 toast** | any 402 page | **LIVE** with 1.2.4 | HTTP 402 + `X-Payment-Required: x402` |
| **OpenRouter Connect / Nemotron paste** | Home card | **LIVE inference** | You bring `sk-or-…`. Not a purchased credit |

**Do not present as this product:**

| Name | Why |
|---|---|
| Raydium / Jupiter `$X402` / `$M32` | Not a KeyShield SKU. Home copy says so. |
| Tempo wallet vouchers | Archived, not compiled |
| “OpenRouter credit” as a shop item | User’s own key; `:free` model still needs a session |
| Buying again on `:8001` | Wrong vault PDA vs the paid stream |

---

## 5. How to walk the video (same order as the recording)

1. `http://127.0.0.1:5173/?local=1&ext=1&demo=shop` — Home shop card, green
   border, receipt **KS-MPP-509959477**, owner 17.89 → 12.89.
2. **Vault** — if this session is `vault-demo-user`, five rows
   (openai / anthropic / openrouter / groq / helius). If you are the owner
   wallet, you see *that* user’s rows, not the five, until you use the
   same token the extension used.
3. **Payments** → Usage Log (Payment column) → Billing → Top Up
   (Ledger / Phantom SOL / Credit USDC) → MPP Streams.
4. **X402 Trust** in More — trusted domains, not a token shop.
5. Extension: Remove + Load unpacked `src/extension` → `ok 1.2.4 <all_urls>`.
   Sign-in, leave the tab open, save, return to Vault.

---

## 6. Extension 1.2.4 (so Load unpacked is not 1.1.7)

Card name stays **KeyShield — Sovereign Vault**. Version **1.2.4**.
Popup first line `ok 1.2.4 <all_urls>`. Do not only Reload.

If `git pull` cannot resolve github.com, run the python3 patch in
`src/extension/LOCAL-DETECT.md` (now stamps **1.2.4**). Do not paste HTML
into zsh.

---

## 7. Artifacts

| File | What |
|---|---|
| `/opt/cursor/artifacts/journey-vault-and-payments.mp4` | Home shop + Vault keys + Payments tabs |
| `/opt/cursor/artifacts/journey-home-shop.png` | Receipt KS-MPP-509959477 |
| `/opt/cursor/artifacts/journey-vault-five.png` | Five extension saves |
| `/opt/cursor/artifacts/journey-payments.png` | Payments method tabs |
| `/opt/cursor/artifacts/keyshield-receipt-ks-mpp-509959477.html` | Downloadable receipt |

On-chain claims above are the last live GHpm buy already settled. This
document does not spend more operator USDC.
