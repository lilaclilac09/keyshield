# KeyShield Implementation Plan

**Technical priorities and sequencing**

---

## Phase 1: Documentation (Current)

1. Create pitch deck (executive-friendly).
2. Write technical architecture document.
3. Document API routing implementation.
4. Create product roadmap with timeline.

---

## Phase 2: Technical Implementation

1. **Lit conditional decryption with time-locks**  
   - Extend Lit integration with time-lock and optional NFT/token conditions.  
   - Unblocks MPC and proxy flows.

2. **Arcium MPC for agent coordination**  
   - Integrate Arcium SDK; define/use circuit for conditional decrypt.  
   - Agent1 share + Agent2 proof → MPC compute → encrypted result.

3. **API routing proxy endpoint**  
   - Implement `/api/proxy` (or equivalent backend route).  
   - Verify wallet, decrypt key with Lit, call target API, return (optionally encrypted) response.

4. **Jupyter testing notebooks**  
   - Set up `tests/notebooks/`; encryption, store, decrypt, (optional) MPC flows.  
   - Document in JUPYTER_SETUP.md.

---

## Phase 3: Polish & Distribution

1. Export pitch deck to PDF with rendered diagrams.
2. Create demo video: detection → encryption → (optional) MPC flow.
3. Publish docs (e.g. GitHub Pages or Notion).
4. Prepare hackathon/grant applications.

---

## Dependency Order

```
Lit conditional decrypt
    → API proxy (can use Lit only)
    → Arcium MPC (uses Lit + circuit)
Jupyter notebooks (parallel; can use existing Lit/on-chain flows)
Multi-browser extension (parallel)
```

---

## Related

- [PRODUCT_ROADMAP.md](PRODUCT_ROADMAP.md) — Feature timeline.
- [DECISION_LOG.md](DECISION_LOG.md) — Architecture decisions.
