# KeyShield Implementation Plan

**Technical priorities and sequencing**

---

## Phase 1: Documentation (Complete)

1. ✅ Create pitch deck (executive-friendly).
2. ✅ Write technical architecture document.
3. ✅ Document API routing implementation.
4. ✅ Create product roadmap with timeline.

---

## Phase 1.5: Frontend Store Flow (Feb 2026) — Complete ✅

**Goal**: Implement complete encryption-to-chain pipeline with Lit Protocol and wallet signing.

**Completed**:
1. ✅ Lit Protocol client integration (`frontend /lib/lit-protocol.ts`)
   - `encryptWithLit()` - Encrypt with wallet conditions
   - `decryptWithLit()` - Decrypt with session signatures
   - `normalizeHashTo32Bytes()` - Ensure 32-byte hash for on-chain storage

2. ✅ IndexedDB ciphertext storage (`frontend /lib/ciphertext-storage.ts`)
   - `storeCiphertext()` - Store full ciphertext off-chain
   - `getCiphertext()` - Retrieve by hash
   - Database: `keyshield_ciphertext`

3. ✅ StoreKey transaction builder (`frontend /lib/store-transaction.ts`)
   - `buildStoreKeyTransaction()` - Build instruction (107 bytes)
   - `sendAndConfirmStoreKeyTransaction()` - Send and confirm
   - `vaultExists()` - Check vault existence
   - Proper instruction format matching program expectations

4. ✅ Wallet signing flow with UI feedback (`frontend /hooks/useVaults.ts`)
   - Complete `addItem()` implementation
   - Real-time status tracking (encrypting → signing → confirming → success)
   - Error handling with user-friendly messages
   - Signature return for verification

5. ✅ UI components with loading states (`frontend /components/AddKeyModal.tsx`)
   - Step-by-step status display
   - Wallet signature prompt indication
   - Success message with Solscan link
   - Error handling with retry option

6. ✅ Architecture documentation update (`ARCHITECTURE.md`)
   - Complete store flow diagram
   - Data flow explanation
   - Security considerations
   - Performance metrics

**Key Achievements**:
- Users can now store keys on-chain with wallet signatures
- Full Lit Protocol threshold encryption implemented
- 96%+ storage reduction (32 bytes on-chain vs 1-5 KB off-chain)
- Complete UI feedback during store process
- Transaction signatures viewable on Solscan

---

## Phase 2: Technical Implementation

1. **Lit conditional decryption with time-locks** (Next)
   - Extend Lit integration with time-lock and optional NFT/token conditions.  
   - Unblocks MPC and proxy flows.
   - Status: Ready to implement (basic encryption complete)

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
