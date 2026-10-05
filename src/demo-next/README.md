# KeyShield demo UI (preview)

Single-screen industrial dashboard. Next.js App Router + Tailwind + Solana Wallet Adapter.

Does **not** replace `src/web`. Preview only — do not merge until reviewed.

```bash
# API (repo root)
KS_DEMO_MODE=1 python3 -m uvicorn src.backend.app:app --host 127.0.0.1 --port 8001

# UI
cd src/demo-next && npm install && npm run dev
# http://localhost:3100
```

`/ks/*` rewrites to `http://127.0.0.1:8001`.
