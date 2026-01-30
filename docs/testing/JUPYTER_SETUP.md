# Jupyter Testing Setup

**Interactive testing of encryption, on-chain storage, and MPC flows**

This guide explains how to set up Jupyter notebooks for KeyShield: encrypt API keys, store hashes on Solana, decrypt with conditions, and (conceptually) test MPC coordination.

---

## 1. Use Case

- **Rapid prototyping**: Try Lit encrypt/decrypt and Solana flows without running the full app.
- **Visual debugging**: Inspect ciphertext, hashes, and account data step-by-step.
- **Shareable flows**: Notebooks document and replay test scenarios.
- **MPC/routing**: Simulate agent coordination and proxy flows (when SDKs are available in Python).

---

## 2. Setup

### 2.1 Directory

```bash
mkdir -p tests/notebooks
cd tests/notebooks
```

### 2.2 Environment (Python)

```bash
# Optional: create a venv
python3 -m venv .venv
source .venv/bin/activate   # or .venv\Scripts\activate on Windows

# Install dependencies
pip install jupyter solana lit-sdk arcium-sdk
```

**Note**: `lit-sdk` and `arcium-sdk` are placeholders. Use official Lit/Arcium Python SDKs if available; otherwise use Node/TS scripts or call REST APIs from Python.

### 2.3 Run Jupyter

```bash
jupyter notebook
# or
jupyter lab
```

Open `encryption_flow.ipynb` (or create it from the template below).

---

## 3. Sample Notebook: Encryption Flow

Create `tests/notebooks/encryption_flow.ipynb` with the following structure (cells below).

### Cell 1: Setup

```python
# Setup
from solana.rpc.api import Client
from solana.keypair import Keypair
import base64

# RPC and test wallet
RPC_URL = "https://api.devnet.solana.com"
connection = Client(RPC_URL)
wallet = Keypair()  # or load from file for reproducibility

print(f"Wallet: {wallet.public_key}")
```

### Cell 2: Encrypt API key (conceptual)

```python
# Encrypt API key — use Lit JS/TS in production; here we simulate hash
api_key = "sk-test123456789"
# In real flow: lit_sdk.encrypt(api_key, conditions) -> ciphertext, hash_bytes
# Placeholder: hash for demo
import hashlib
hash_bytes = hashlib.sha256(api_key.encode()).digest()
print(f"Hash (for on-chain): {hash_bytes.hex()}")
```

### Cell 3: Store on Solana (conceptual)

```python
# Store on Solana — use keyshield client in production
# from keyshield_client import store_key
# vault_pda = store_key(connection, wallet, hash_bytes)
# For notebook: derive PDA only (no actual tx without program deployment)
from solana.publickey import PublicKey
PROGRAM_ID = PublicKey("YOUR_PROGRAM_ID")
vault_pda, bump = PublicKey.find_program_address(
    [b"vault", bytes(wallet.public_key)],
    PROGRAM_ID
)
print(f"Vault PDA: {vault_pda}")
```

### Cell 4: Decrypt (conceptual)

```python
# Decrypt — in real flow: lit_sdk.decrypt(ciphertext, wallet)
# Here we only verify hash round-trip
decrypted_hash = hashlib.sha256(api_key.encode()).digest()
assert decrypted_hash == hash_bytes
print("Decryption (hash) check passed")
```

### Cell 5: MPC coordination (conceptual)

```python
# MPC coordination — when Arcium Python SDK is available
# agent1 = Keypair()
# agent2 = Keypair()
# mpc_result = arcium_sdk.mpc_compute(ciphertext, [agent1, agent2])
print("MPC flow: use Arcium SDK when available; see MPC_COORDINATION_GUIDE.md")
```

---

## 4. Notebooks Included

| Notebook | Purpose |
|----------|---------|
| `encryption_flow.ipynb` | Encrypt → hash → PDA derivation → decrypt check. |
| `mpc_coordination.ipynb` | Placeholder for Agent1/Agent2 MPC flow (when SDK ready). |
| `routing_test.ipynb` | Placeholder for calling `/api/proxy` from Python. |

Create the other two as copies of `encryption_flow.ipynb` with titles and one cell updated, or add minimal content; the repo can ship placeholders.

---

## 5. Integration with KeyShield

- **Lit**: Real encryption/decryption is in the frontend (TypeScript/Lit JS SDK). Use notebooks for hashing, PDA derivation, and Solana RPC; for full Lit flows use Node scripts or the app.
- **Solana**: Use `solana-py` (or similar) for RPC and keypair; use your program ID and instruction builders for real StoreKey/AccessKey.
- **Arcium**: When Python SDK exists, add cells that call MPC compute with test keypairs.

---

## 6. Relevant Docs

- [../technical/LIT_INTEGRATION_GUIDE.md](../technical/LIT_INTEGRATION_GUIDE.md) — Lit conditions and storage.
- [../technical/MPC_COORDINATION_GUIDE.md](../technical/MPC_COORDINATION_GUIDE.md) — MPC flow.
- [../technical/API_ROUTING_GUIDE.md](../technical/API_ROUTING_GUIDE.md) — Proxy; can call from notebook with `requests`.

---

## 7. Summary

- **Setup**: `tests/notebooks/`, `pip install jupyter solana`, optional Lit/Arcium Python SDKs.
- **Use**: Encryption flow (hash + PDA), decrypt check, and (when available) MPC and routing tests.
- **Limits**: Full Lit encrypt/decrypt lives in JS/TS; notebooks are for hashing, Solana, and high-level flow documentation.
