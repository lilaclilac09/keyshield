# KeyShield Decision Log

**Architecture and product decisions**

---

## 1. Why Lit Protocol over Local AES

- **Threshold**: No single point of failure; N/M nodes must agree for decryption.
- **Conditions**: Wallet + time-lock + on-chain state (not possible with local crypto alone).
- **Trade-off**: Network dependency, ~1–2s latency (acceptable for API key access).

---

## 2. Why Arcium MPC over Direct Sharing

- **Confidentiality**: Agents never see plaintext; MPC compute only.
- **Coordination**: Multi-agent workflows (e.g. Agent1 detects, Agent2 uses).
- **Trade-off**: Arcium testnet only today; mainnet later; requires circuit definition.

---

## 3. Why API Routing Proxy

- **Problem**: Agents need keys for API calls but must not store them.
- **Solution**: Proxy decrypts on-demand, calls API, returns (optionally encrypted) response.
- **Trade-off**: Centralized proxy; mitigate with multi-region deployment and audit.

---

## 4. Why Hybrid On-Chain + Local Metadata

- **On-chain**: Source of truth for vault existence (prevents local drift).
- **Local**: Searchable metadata (name, domain) — privacy and cost-efficient.
- **Trade-off**: Metadata can desync across devices; mitigate with sync hash or future on-chain metadata hash.

---

## 5. Why 32-Byte Hash On-Chain (Not Full Ciphertext)

- **Size**: Lit ciphertext is 1–5 KB; storing on-chain is expensive.
- **Need**: Only hash needed for verification and lookup; full ciphertext for decryption only.
- **Benefit**: ~96% storage reduction on-chain; cost-efficient.

---

## 6. Why One Vault Per Owner (Current)

- **Simplicity**: Single PDA per owner (`seeds: ["vault", owner]`).
- **Cost**: Lower rent and fewer accounts.
- **Trade-off**: Limits scalability; future: add index seed for multiple vaults per owner.

---

## Related

- [PRODUCT_ROADMAP.md](PRODUCT_ROADMAP.md)
- [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md)
- [../technical/TECHNICAL_ARCHITECTURE.md](../technical/TECHNICAL_ARCHITECTURE.md)
