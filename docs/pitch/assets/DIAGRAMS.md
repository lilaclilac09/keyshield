# KeyShield Diagrams (Mermaid)

All diagrams for slides and documentation. Render with Mermaid (e.g. GitHub, VS Code, or mermaid-cli).

---

## 1. How It Works (Pitch Slide 3)

```mermaid
flowchart LR
  Detection[Browser Extension<br/>Auto-Detects Keys] --> Encrypt[Lit Protocol<br/>Threshold Encryption]
  Encrypt --> Store[Solana Vault<br/>32-byte Hash OnChain]
  Store --> Access[Conditional Decrypt<br/>Wallet + Time + Proof]
  Access --> MPC[MPC Coordination<br/>Agent-to-Agent Sharing]
```

---

## 2. Architecture — Privacy Layers (Pitch Slide 6)

```mermaid
flowchart TD
  subgraph Layer1 [Client Encryption]
    LitEncrypt[Lit Protocol Threshold Crypto]
  end
  subgraph Layer2 [OnChain Storage]
    Solana[Solana Vault<br/>Hash Reference Only]
  end
  subgraph Layer3 [Access Control]
    ZK[Bonsol ZK Proofs<br/>Verify Without Reveal]
  end
  subgraph Layer4 [Agent Coordination]
    MPC[Arcium MPC<br/>Secure Sharing]
  end
  LitEncrypt --> Solana
  Solana --> ZK
  ZK --> MPC
```

---

## 3. Detection Flow vs Password Managers

```mermaid
flowchart TB
  subgraph Bitwarden [Bitwarden - Password Flow]
    B1[DOM Scan] --> B2[Match Login Form]
    B2 --> B3[Auto-Fill Password]
  end

  subgraph KeyShield [KeyShield - API Key Flow]
    K1[Multi-Source Detection] --> K2[Pattern Match]
    K2 --> K3[Lit Encrypt]
    K3 --> K4[Store Hash OnChain]
    K4 --> K5[Conditional Decrypt]

    K1 -.->|Sources| S1[Clipboard]
    K1 -.->|Sources| S2[Form Fields]
    K1 -.->|Sources| S3[HTTP Headers]
    K1 -.->|Sources| S4[OCR]
  end
```

---

## 4. Full Architecture with All Components

```mermaid
flowchart TD
  subgraph Client [Client Layer]
    Browser[Browser Extension] --> Detection[Auto-Detection<br/>10+ Providers]
    Dashboard[Next.js Dashboard] --> UI[React UI]
  end

  subgraph Privacy [Privacy Services]
    Detection --> Lit[Lit Protocol<br/>Threshold Encryption]
    UI --> Lit
    Lit --> MPC[Arcium MPC<br/>Agent Coordination]
    MPC --> ZK[Bonsol ZK<br/>Access Proofs]
  end

  subgraph Blockchain [Solana Blockchain]
    ZK --> Program[KeyShield Program]
    Program --> Vault[Vault PDA<br/>32-byte Hash]
    Program --> Share[Share PDA<br/>Agent Access]
  end

  subgraph Routing [API Routing]
    MPC --> Proxy[Proxy Endpoint<br/>/api/proxy]
    Proxy --> APIs[External APIs<br/>OpenAI, Helius, AWS]
  end
```

---

## 5. MPC Agent Coordination (Sequence)

```mermaid
sequenceDiagram
  participant A1 as Agent1 Detection
  participant Lit as Lit Network
  participant Solana as Solana
  participant Arc as Arcium MPC
  participant A2 as Agent2 API Caller
  participant API as External API

  A1->>Lit: Encrypt API key with conditions
  Lit->>A1: Return ciphertext + hash
  A1->>Solana: Store hash on-chain

  A2->>Solana: Request access to vault
  Solana->>A2: Return encrypted hash
  A2->>Arc: MPC compute request hash + proof
  Arc->>Lit: Threshold decrypt A2 proof
  Lit->>Arc: Partial decryption shares
  Arc->>A2: MPC result key never fully revealed
  A2->>API: Call API with key
  API->>A2: Response
  A2->>Arc: Encrypt response optional
  Arc->>A1: Return encrypted result optional
```

---

## 6. API Routing Bridge

```mermaid
flowchart LR
  Agent[AI Agent] -->|Encrypted Intent| Proxy[/api/proxy]
  Proxy -->|Decrypt with Lit| Lit[Lit Protocol]
  Lit -->|API Key| Proxy
  Proxy -->|Real Call| API[OpenAI / Helius]
  API -->|Response| Proxy
  Proxy -->|Encrypt Response| Agent
```

---

## Export to PNG/SVG (mermaid-cli)

```bash
# Install
npm i -g @mermaid-js/mermaid-cli

# Export (from repo root)
mmdc -i docs/pitch/assets/DIAGRAMS.md -o docs/pitch/assets/diagrams_output
# Or export each diagram separately; mmdc accepts single .mmd files with one graph each.
```

For PDF export of the full pitch deck with embedded diagrams, use Marp, md-to-pdf, or a Markdown-to-PDF tool that supports Mermaid (e.g. Pandoc + mermaid-filter).
