# Top up with SOL or USDC (Solana on-chain payment)

> Pay for KeyShield credit using your Solana wallet — SOL native or
> USDC SPL. Server verifies the transaction on-chain via the Solana
> RPC + Pyth price oracle before crediting. Idempotent on
> `tx_signature`, so retrying a payment never double-charges.

## What you'll have at the end

- Frontend "Top up with SOL" button that:
  1. Asks the server how many lamports = $X.
  2. Pops up the connected Solana wallet to sign a transfer.
  3. Submits the resulting `tx_signature` back to the server.
  4. Sees the credited balance in the response.
- Same flow available for USDC SPL (1 USDC = $1, no oracle).

---

## Prerequisites

- v2-mvp server running with these env vars set:
  ```bash
  export PAYMENT_ADDRESS_SOLANA="<your base58 receiver pubkey>"
  export SOLANA_RPC_URL="https://mainnet.helius-rpc.com/?api-key=$HELIUS_KEY"
  # Optional: tighter or looser SOL/USD price slippage tolerance
  export SOL_PRICE_SLIPPAGE="0.05"
  ```
- A frontend already integrated with `@solana/wallet-adapter-react`
  (you have this — `WalletConnector.tsx` already uses it).
- A logged-in user (Bearer token from `/auth/wallet-login` or
  `/auth/login`).

---

## Server endpoints

```
GET  /billing/sol-quote?amount_usd=5
POST /billing/topup-solana       Bearer
POST /billing/topup-solana-usdc  Bearer
GET  /billing/topup-history      Bearer
```

### `GET /billing/sol-quote?amount_usd=5`

Open (no auth). Returns:

```json
{
  "amount_usd":      5.00,
  "amount_sol":      0.0312,
  "amount_lamports": 31200000,
  "sol_usd_price":   160.25,
  "price_publish_time": 1714291200,
  "valid_for_secs":  60,
  "payment_address": "<your PAYMENT_ADDRESS_SOLANA>"
}
```

Frontend uses `amount_lamports` and `payment_address` to construct
the `SystemProgram.transfer` instruction.

### `POST /billing/topup-solana`

```json
// Request (Bearer required)
{
  "tx_signature": "5J7sX...",
  "expected_amount_usd": 5.00     // optional; rejects if slippage > 5%
}

// 200 OK
{
  "credited_atoms": 31200000,
  "credited_unit":  "lamports",
  "credited_usd":   5.00,
  "balance_usd":    5.10,
  "tx_signature":   "5J7sX...",
  "sol_usd_price":  160.25
}
```

Errors:

| Status | When |
|---|---|
| 401 | No Bearer token |
| 404 | tx not found / not yet confirmed (retry in a few seconds) |
| 400 | tx reverted, or didn't send to PAYMENT_ADDRESS_SOLANA, or sent from a different wallet, or slippage > tolerance |
| 409 | this `tx_signature` was already credited (idempotent) |
| 502 | Pyth oracle or Solana RPC unreachable |

### `POST /billing/topup-solana-usdc`

```json
{
  "tx_signature": "5J7sX...",
  "network":      "mainnet"   // or "devnet"
}

// 200 OK
{
  "credited_atoms": 5000000,   // 6 decimals → 5 USDC
  "credited_unit":  "usdc-6dp",
  "credited_usd":   5.00,
  "balance_usd":    10.10,
  "tx_signature":   "5J7sX..."
}
```

USDC is 1:1 with USD — no oracle needed.

---

## Frontend integration (~50 lines of TypeScript)

Add a `TopupButton.tsx` next to your existing `WalletConnector.tsx`.
Reuses the same wallet adapter you already have wired up.

```tsx
// components/TopupButton.tsx
import React, { useState } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import {
  PublicKey,
  SystemProgram,
  Transaction,
} from '@solana/web3.js';
import { authedFetch, getApiBase } from '../lib/auth';

interface Props {
  amountUsd: number;
}

export const TopupButton: React.FC<Props> = ({ amountUsd }) => {
  const { publicKey, sendTransaction } = useWallet();
  const { connection } = useConnection();
  const [phase, setPhase] = useState<'idle' | 'quoting' | 'signing' | 'confirming' | 'crediting' | 'done' | 'error'>('idle');
  const [msg, setMsg] = useState('');

  const onClick = async () => {
    if (!publicKey) {
      setMsg('Connect your wallet first.');
      setPhase('error');
      return;
    }

    try {
      setPhase('quoting');
      // 1. Get a fresh quote.
      const quoteRes = await fetch(
        `${getApiBase()}/billing/sol-quote?amount_usd=${amountUsd}`,
      );
      if (!quoteRes.ok) throw new Error(`quote failed: ${quoteRes.status}`);
      const quote = await quoteRes.json();
      const recipient = new PublicKey(quote.payment_address);
      const lamports = quote.amount_lamports;

      // 2. Build + send a SystemProgram.transfer.
      setPhase('signing');
      const tx = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: publicKey,
          toPubkey:   recipient,
          lamports,
        }),
      );
      const sig = await sendTransaction(tx, connection);

      // 3. Wait for the network to confirm before submitting to KeyShield.
      setPhase('confirming');
      await connection.confirmTransaction(sig, 'confirmed');

      // 4. Submit the signature to /billing/topup-solana.
      setPhase('crediting');
      const credit = await authedFetch('/billing/topup-solana', {
        method: 'POST',
        body: JSON.stringify({
          tx_signature: sig,
          expected_amount_usd: amountUsd,
        }),
      });
      if (!credit.ok) {
        const err = await credit.json().catch(() => ({}));
        throw new Error(err.detail ?? `credit failed: ${credit.status}`);
      }
      const body = await credit.json();
      setMsg(`Credited $${body.credited_usd}. New balance: $${body.balance_usd}.`);
      setPhase('done');
    } catch (e: any) {
      setMsg(e?.message ?? 'top up failed');
      setPhase('error');
    }
  };

  const labels: Record<typeof phase, string> = {
    idle:       `Top up $${amountUsd} with SOL`,
    quoting:    'Getting price quote…',
    signing:    'Approve in wallet…',
    confirming: 'Waiting for confirmation…',
    crediting:  'Verifying on-chain…',
    done:       msg,
    error:      `Failed: ${msg}`,
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={phase !== 'idle' && phase !== 'done' && phase !== 'error'}
      className="px-5 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white"
    >
      {labels[phase]}
    </button>
  );
};
```

For USDC: replace step 2 with an `@solana/spl-token` `createTransferCheckedInstruction`
and POST to `/billing/topup-solana-usdc` instead. The rest is identical.

---

## How the verifier knows your payment is real

The server-side flow inside `POST /billing/topup-solana`:

1. Calls Solana RPC `getTransaction(sig, jsonParsed, commitment=confirmed)`.
2. Confirms `meta.err === null` (tx didn't revert).
3. Walks the tx's top-level instructions looking for one where:
   - `programId === "11111111111111111111111111111111"` (System Program)
   - `parsed.type === "transfer"`
   - `info.source === <session user_id>` (i.e. your wallet pubkey)
   - `info.destination === PAYMENT_ADDRESS_SOLANA`
4. Reads `info.lamports`.
5. Calls Pyth Hermes for the current SOL/USD price.
6. Computes `usd_amount = lamports / 1e9 * price_usd`.
7. If you supplied `expected_amount_usd`, rejects when slippage > 5%.
8. INSERTs into `topup_tx (tx_signature PRIMARY KEY)`. Second
   submission of the same signature → 409.
9. Credits `usage.user_balance.balance_usd`.

Inner instructions (CPI children) are NOT scanned. If your wallet
batches the transfer through a smart-contract wrapper, the verifier
won't see it. Use a direct `SystemProgram.transfer` from your wallet's
own pubkey.

For USDC, step 3 looks for a Token Program `transferChecked` (or
`transfer` with the ATAs cross-referenced via `postTokenBalances`)
where the mint matches `EPjFWdd5...` (mainnet) or
`4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU` (devnet).

---

## Agent-side: nothing changes

Once an agent has authenticated via `/auth/agent-login`, the
agent's session shares the owner's `user_id` (= owner wallet
address). So the same balance the human user just topped up is
what the agent draws against on `/proxy/openai/...` calls. There's
no separate "agent topup" flow — by design.

---

## Threat model notes

- **Re-org safety**: we read at `commitment=confirmed`. A 32-slot
  re-org could in theory invalidate a credited tx; in practice the
  cluster reorgs at confirmed depth are extremely rare. If you
  need stronger guarantees use `finalized` (slower).
- **Slippage**: the `SOL_PRICE_SLIPPAGE` env var (default 5%) is the
  width of the price-tolerance window. A user submitting an old
  quote will see a 400. Tune lower for tighter UX, higher to absorb
  Solana's ~13s confirmation latency in volatile markets.
- **Idempotency**: the `topup_tx` table has tx_signature as PRIMARY
  KEY. Concurrent double-submits get rejected by the unique
  constraint, not by a check-then-insert race.
- **No private-key handling**: the server NEVER sees the user's
  private key. It only reads public on-chain state via the RPC.
