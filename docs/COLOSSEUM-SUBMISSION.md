# Road to Colosseum — what to paste, and what only you can fill

Listing: Superteam Germany, “Road to Colosseum Hackathon: Build your MVP”.
Sponsor comment moved the deadline to **9:59 PM, October 5, 2026 (UTC)**.
Winner announcement is scheduled by **October 13, 2026**.
Register at [arena.colosseum.org/?ref=germany](https://arena.colosseum.org/?ref=germany) and set the country to Germany.

Checked on October 2, 2026 from this workspace.

## Fill these before you submit

The form rejects a listing that is missing any of these. The repo cannot do them for you.

1. **You are submitting from Germany.** The listing says it is only open for people in Germany.
2. **Colosseum project page.** Sign up at the link above, country **Germany**, then create the project page and paste that URL into the form.
3. **Make the GitHub repo public.** `lilaclilac09/keyshield` is **private** today. Judges must be able to open it without an invite. GitHub → Settings → General → Change repository visibility → Public.
4. **Point judges at the branch that has the MVP**, or merge it to `main` first. The Spend workspace, plans, and walkthrough are on `cursor/subscription-plans-dashboard-7557`. A clone of `main` does not include that work until it is merged.
5. **Paste a live URL you have opened yourself.** On October 2 these hosts did not serve the app: `https://app.ks.aileena.xyz` (DNS did not resolve), `https://ks.aileena.xyz` (DNS did not resolve), `https://keyshield-production.up.railway.app` (Railway: Application not found). Do not paste them until a browser loads the dashboard.
6. **Replace the demo video with a 2–3 minute cut.** The file in the repo, `src/web/public/demo/spend-walkthrough.mp4`, is **1 minute 20 seconds**. The listing asks for 2–3 minutes. A shot list is at the bottom of this page.

## Paste into the form

### Project name

KeyShield

### Tagline

API keys stay in your vault. Agents call upstreams with a session. The month settles as a plan, and agent spend settles on Solana devnet.

### Problem and product

Agents ship with raw provider keys in environment variables. Those keys show up in logs, and rotating one means redeploying every bot. KeyShield stores the key encrypted on the device, gives the agent a session token, and injects the key once inside the proxy. Spend is three monthly plans (Personal $29, Operate $89, Floor $240). The breakdown ranks providers by share of the included calls and keeps a rating column filled from measured latency. Calls on your own keys stay outside the plan.

### Solana integration

Solana is the settlement and control layer for agent spend, not a badge on the login screen.

The KeyShield program is deployed on **devnet** and is executable under the BPF upgradeable loader:

- Program: `41P2wHKAr69aSgLgt1QdKH6VVgK6uFYKM7hpKAyBxr9j`
- Explorer: https://explorer.solana.com/address/41P2wHKAr69aSgLgt1QdKH6VVgK6uFYKM7hpKAyBxr9j?cluster=devnet
- MPP stream PDA: `E5sMx86o3MWV562BxbWk6SxfqTFBWpCitj3AU9i6DgfR`
- Open-stream transaction (slot 461386827): https://explorer.solana.com/tx/678bqTSq4gYspz2TWwdK3wCzZwEHuuDqseDUS2NcEPVQ45472iNPRykVh6K1zGEbq4nPmbLfDKKSiUx2nrT6XTQc?cluster=devnet
- Devnet USDC mint: `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU`
- Platform USDC token account: `6QtooE6QVFF9pJ9Pa9DgAFAWpEWkB8VtjEytc5FyFtBH`

Instructions: `CreateUniversalVault`, `GrantAgentAccess`, `RevokeAgentAccess`, `UpdateVaultConfig`, `OpenStream`, `MppSettle`, `CloseStream`.

An open MPP stream lets a platform call skip the extra HTTP 402 round trip. Settlement of that stream is the on-chain `MppSettle` path. The owner can revoke an agent with `RevokeAgentAccess`. The product also accepts a Tempo session voucher on the proxy. Tempo is a separate chain (chain id 4217) for wallet-session payment. The Solana program above is the devnet deployment this MVP asks judges to inspect.

### Live MVP / test link

Paste the URL you verified in a browser today.

Until that host is up, a judge can run the MVP locally. From a public clone:

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -r src/backend/requirements.txt
cd src/web && npm install && cd ../..
node dev.cjs
```

Dashboard: http://localhost:3000
Python API: http://127.0.0.1:8001
Rust proxy: the `ks-proxy` process started by `dev.cjs`

Full notes: [DEVELOPMENT.md](../DEVELOPMENT.md).

### Demo video

Upload a **2–3 minute** walkthrough. The clip already in the repo is the product tour (Spend, rank and rating, plan switch, Sharing, new secret) and is too short for this listing. Record the shot list below, then replace `src/web/public/demo/spend-walkthrough.mp4` or attach the new file directly on the form.

### Public GitHub

After you make it public:

https://github.com/lilaclilac09/keyshield

If `main` does not yet contain this branch, send judges:

https://github.com/lilaclilac09/keyshield/tree/cursor/subscription-plans-dashboard-7557

README setup is the quickstart. Devnet addresses are in the README and under Docs → Solana devnet in the dashboard.

### Deployment details

**Devnet.** Not mainnet.

| What | Value |
|---|---|
| Cluster | Solana devnet (`https://api.devnet.solana.com`) |
| Program | `41P2wHKAr69aSgLgt1QdKH6VVgK6uFYKM7hpKAyBxr9j` |
| Stream PDA | `E5sMx86o3MWV562BxbWk6SxfqTFBWpCitj3AU9i6DgfR` |
| Open-stream tx | `678bqTSq4gYspz2TWwdK3wCzZwEHuuDqseDUS2NcEPVQ45472iNPRykVh6K1zGEbq4nPmbLfDKKSiUx2nrT6XTQc` |
| USDC mint | `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU` |

## Two to three minute shot list

Aim for about 2 minutes 30 seconds. Speak, or leave each frame long enough to read.

| Time | Show |
|---|---|
| 0:00–0:20 | Dashboard Spend. Read the headline: this month is included in one plan. |
| 0:20–0:45 | Breakdown. Rank 1 and rank 2, share bars, rating stars. |
| 0:45–1:05 | Calls. Included versus Own key. |
| 1:05–1:25 | Plans. Switch Personal, then back to Operate. The headline price changes. |
| 1:25–1:50 | Docs → Solana devnet. Open the program on Explorer and show the open-stream transaction. |
| 1:50–2:20 | README quickstart on GitHub: `node dev.cjs`, then http://localhost:3000 |
| 2:20–2:40 | One sentence on why you would keep building this at Colosseum. |

## How the listing scores this MVP

| They ask | Where it shows |
|---|---|
| Clear problem | Keys in agent env vars, and a monthly plan instead of a per-call invoice |
| It works | Spend tabs, plan switch, local `node dev.cjs` |
| Solana is load-bearing | Devnet program, stream PDA, open-stream transaction, revoke and settle instructions |
| Easy to understand | Spend summary, three plan cards, Docs walkthrough |
| Differentiated | Device-encrypted vault plus a plan, with Solana settlement for the agent |
| Worth continuing | Colosseum page is yours to write. Say what you will harden next: a public URL, mainnet when you mean it, and the 2–3 minute video |
