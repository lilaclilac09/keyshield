/** Colosseum 2-minute battle — English What you hear and see. 15 × ~8s. */

export type ColosseumSection =
  | 'home'
  | 'activity'
  | 'agents'
  | 'trust'
  | 'developer';

export type ColosseumBeat = {
  n: number;
  section: ColosseumSection;
  tab?: 'mpp' | 'topup';
  target: string;
  caption: string;
  vo: string;
};

export const COLOSSEUM_BEATS: ColosseumBeat[] = [
  {
    n: 1,
    section: 'home',
    target: 'wallet',
    caption: 'Wallet after settle — zoom SOL / USDC / Credit. Live wallet after settle, not a mock.',
    vo: 'Live wallet after settle. Zoom SOL, USDC, and Credit. Not a mock.',
  },
  {
    n: 2,
    section: 'home',
    target: 'key-page',
    caption: 'Open free key page — sk-or- on the OpenRouter Nemotron page.',
    vo: 'Open the free OpenRouter Nemotron key page. The shape is sk-or-.',
  },
  {
    n: 3,
    section: 'home',
    target: 'detect',
    caption: 'Detect and store — zoom Detected openrouter + Save. Detect the shape, store ciphertext only.',
    vo: 'Detect the shape. Save ciphertext only. The server never holds the raw key.',
  },
  {
    n: 4,
    section: 'home',
    target: 'universal',
    caption: 'Vercel + GitHub universal keys — same detector. Universal keys, one vault.',
    vo: 'Same detector reads vercel_ and github_pat_. One vault. Universal keys.',
  },
  {
    n: 5,
    section: 'home',
    target: 'autofill',
    caption: 'New page autofill — zoom the Cursor / Devin API Key field.',
    vo: 'A new page that needs an API key. Zoom the Cursor and Devin field.',
  },
  {
    n: 6,
    section: 'home',
    target: 'fill',
    caption: 'Fill button — the agent holds KS_TOKEN, never the raw key.',
    vo: 'Fill injects KS_TOKEN. The agent never holds the raw secret.',
  },
  {
    n: 7,
    section: 'activity',
    tab: 'mpp',
    target: 'devnet',
    caption: 'Devnet buy — Hold / Verify / Capture, mpp_settle ix 26.',
    vo: 'Devnet buy. Hold, verify, capture. On-chain mpp_settle instruction 26.',
  },
  {
    n: 8,
    section: 'home',
    target: 'rpc',
    caption: 'RPC flash handshake — zoom the RPC pill. First hop is slower, then near zero. Not redb.',
    vo: 'RPC flash handshake. First hop costs. Cache then near zero. Not redb.',
  },
  {
    n: 9,
    section: 'activity',
    tab: 'mpp',
    target: 'fail',
    caption: 'Failed pay — .env plus 502 can debit empty. A wrong hash does not Capture.',
    vo: 'Failed pay. A 502 after a raw .env debit can empty the ledger. A wrong hash does not Capture.',
  },
  {
    n: 10,
    section: 'home',
    target: 'onepassword',
    caption: 'vs 1Password CLI — detect, fill, x402, on-chain settle. Jobs 1Password does not do.',
    vo: 'Versus 1Password CLI. Detect, fill, x402, on-chain settle. Jobs it does not do.',
  },
  {
    n: 11,
    section: 'agents',
    target: 'wired',
    caption: 'All wired — OpenClaw, x402, Pyth Hermes SSE prices, Cursor / Devin.',
    vo: 'All wired. OpenClaw, x402, Pyth Hermes as SSE prices in this repo, Cursor and Devin.',
  },
  {
    n: 12,
    section: 'activity',
    tab: 'topup',
    target: 'topup',
    caption: 'Top Up — a payable rail credits the ledger.',
    vo: 'Top Up. A payable rail credits the ledger before the agent spends.',
  },
  {
    n: 13,
    section: 'activity',
    tab: 'mpp',
    target: 'meter',
    caption: 'Stream Meter — open Devnet stream. Agent column is Cursor.',
    vo: 'Stream Meter. Open a Devnet stream. Agent column is Cursor.',
  },
  {
    n: 14,
    section: 'trust',
    target: 'x402',
    caption: 'x402 auto-pay — trusted domain hits 402, it pays.',
    vo: 'x402 auto-pay. A trusted domain hits 402 and it pays.',
  },
  {
    n: 15,
    section: 'agents',
    target: 'agents',
    caption: 'Agent registry — Cursor / Devin / OpenClaw already registered.',
    vo: 'Agent registry. Cursor, Devin, and OpenClaw already registered.',
  },
];

export const COLOSSEUM_BEAT_MS = 8000;
