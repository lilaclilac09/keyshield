# KeyShield Frontend - Test Instructions

## Current Status
✅ Running on: **http://localhost:3000/**

## What This Version Does
This is a **UI demo** of KeyShield that:
- Uses **localStorage** (browser storage) for key management
- Shows the cyberpunk-themed interface you designed in Google AI Studio
- Demonstrates vault management, search, and key operations
- **NO blockchain/oracle integration** (pure frontend)

## How to Test

### 1. Access the App
Open http://localhost:3000/ in your browser

### 2. Login Options
- **Connect Wallet**: Use Burner Wallet (auto-generates for testing)
- **OVERRIDE Button**: Skip wallet connection (instant access)

### 3. Test Features

#### View Vault Items
- 4 demo keys are pre-loaded (OpenAI, Helius, GitHub, Stripe)
- Keys displayed in cyberpunk-themed cards
- Shows domain, tags, and creation time

#### Add New Key
1. Click the **"NEW"** button (top right)
2. Fill in:
   - Name (e.g., "My API Key")
   - Value (the actual key)
   - Domain (e.g., "api.example.com")
   - Tags (comma-separated, e.g., "PROD, API")
   - Notes (optional)
3. Click **"SAVE"**

#### Reveal/Hide Keys
- Click the eye icon on any key card
- Key is revealed for **30 seconds** with countdown timer
- Auto-hides after timer expires

#### Copy Keys
- Click the copy icon to copy to clipboard
- Shows "Copied!" confirmation

#### Search Keys
- Click the search icon (top right)
- Type to filter by name, domain, or tags
- Press ESC to close search

#### Delete Keys
- Click trash icon on any key card
- Key is immediately removed

## What's Different from Your Solana Program

This frontend version:
- ❌ Does NOT connect to your Solana KeyShield program
- ❌ Does NOT use Lit Protocol encryption
- ❌ Does NOT store keys on-chain
- ✅ Pure UI/UX demonstration
- ✅ Uses localStorage (resets if you clear browser data)

## To Connect to Your Solana Program

You would need to:
1. Add back the `KeyShieldClient` from the old frontend
2. Replace `useVaults` hook to call Solana program
3. Integrate Lit Protocol for encryption
4. Add transaction signing with wallet

## Current File Structure
```
frontend/
├── App.tsx              # Main app component
├── components/
│   ├── AuthScreen.tsx   # Login screen
│   ├── VaultItemCard.tsx # Key display card
│   ├── AddKeyModal.tsx  # Add key dialog
│   ├── WalletConnector.tsx
│   └── SolanaProvider.tsx
├── hooks/
│   └── useVaults.ts     # localStorage vault management
├── constants.tsx        # Theme colors
└── types.ts             # TypeScript types
```

## Need Help?
Tell me specifically what's not working:
- Is the page blank?
- Any error messages in browser console?
- Which feature isn't working?
- What did you expect to happen?
