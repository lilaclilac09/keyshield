# KeyShield Browser Extension - Installation Guide

This guide will help you install the KeyShield browser extension in Chrome, Firefox, and Safari.

## Prerequisites

- Node.js 18+ and npm installed
- Git (to clone the repository)
- A Solana wallet (Phantom, Solflare, etc.) for saving keys

## Building the Extension

1. **Navigate to the extension directory:**
   ```bash
   cd extension
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Build the extension:**
   ```bash
   npm run build:all
   ```
   
   This will create:
   - `dist/` - Default build folder (Chrome/Edge)
   - `dist-chrome/` - Chrome/Edge specific build
   - `dist-firefox/` - Firefox specific build
   - `dist-safari/` - Safari specific build
   - `keyshield-chrome.zip` - Chrome/Edge package
   - `keyshield-firefox.zip` - Firefox package

## Installation Instructions

### Chrome / Edge (Chromium-based browsers)

1. **Open Chrome Extensions page:**
   - Go to `chrome://extensions/` (or `edge://extensions/` for Edge)
   - Or click the three-dot menu → More tools → Extensions

2. **Enable Developer Mode:**
   - Toggle the "Developer mode" switch in the top-right corner

3. **Load the extension:**
   - Click "Load unpacked"
   - Navigate to the `extension/dist-chrome/` folder (or `extension/dist/`)
   - Click "Select Folder"

4. **Verify installation:**
   - You should see the KeyShield extension icon in your toolbar
   - Click the icon to open the extension popup

### Firefox

1. **Open Firefox Add-ons page:**
   - Go to `about:debugging#/runtime/this-firefox`
   - Or press `Ctrl+Shift+A` (Windows/Linux) or `Cmd+Shift+A` (Mac)

2. **Load temporary add-on:**
   - Click "Load Temporary Add-on..."
   - Navigate to the `extension/dist-firefox/` folder
   - Select `manifest.json`

3. **Verify installation:**
   - The extension should appear in your add-ons list
   - You should see the KeyShield icon in your toolbar

**Note:** Firefox extensions loaded this way are temporary and will be removed when you restart Firefox. For a permanent installation, you'll need to package and sign the extension (requires Firefox Developer account).

### Safari

Safari extensions require additional setup with Xcode:

1. **Install Xcode:**
   - Download Xcode from the Mac App Store
   - Open Xcode and accept the license agreement

2. **Enable Safari Web Extension development:**
   - Open Safari → Preferences → Advanced
   - Check "Show Develop menu in menu bar"

3. **Load the extension:**
   - In Safari, go to Develop → Allow Unsigned Extensions
   - Go to Safari → Preferences → Extensions
   - Click "Show Extension Development" or use Xcode to build

4. **Alternative: Use Xcode project:**
   - Create a new Safari App Extension project in Xcode
   - Copy the contents of `extension/dist-safari/` to your Xcode project
   - Build and run from Xcode

**Note:** Safari extensions require macOS and an Apple Developer account for distribution.

## First-Time Setup

After installing the extension:

1. **Open the extension:**
   - Click the KeyShield icon in your browser toolbar

2. **Authenticate:**
   - Choose authentication method:
     - **Biometric** (WebAuthn): Use Face ID, Touch ID, or Windows Hello
     - **Master Password**: Set a master password for authentication

3. **Connect your wallet:**
   - The extension will prompt you to connect your Solana wallet
   - Approve the connection in your wallet

4. **Start using:**
   - The extension will automatically detect API keys as you browse
   - When a key is detected, a save dialog will appear
   - Click "Save to Vault" to securely store the key

## Testing the Extension

### Test Key Detection

1. **Copy an API key to clipboard:**
   - Go to GitHub, Helius, or Google Gemini
   - Generate or copy an API key
   - The save dialog should appear automatically

2. **Enter a key in a form:**
   - Navigate to a website with an API key input field
   - Type or paste an API key
   - The save dialog should appear after a few seconds

3. **Manual detection:**
   - Click the extension icon
   - Click "Detect Keys on Page"
   - The extension will scan the current page for API keys

### Test Save Flow

1. **Detect a key** (see above)

2. **Click "Save to Vault":**
   - If wallet is not connected, you'll be prompted to connect
   - The key will be encrypted and stored

3. **Verify storage:**
   - Open the extension popup
   - Your saved keys should appear in the vault list

## Troubleshooting

### Extension Not Loading

- **Check browser console:**
  - Open Developer Tools (F12)
  - Check the Console tab for errors
  - Check the Extensions page for error messages

- **Verify build:**
  - Ensure `npm run build` completed successfully
  - Check that `dist/` folder contains all necessary files

- **Check permissions:**
  - Ensure the extension has required permissions
  - Check browser settings for extension permissions

### Detection Not Working

- **Check clipboard permissions:**
  - Some browsers require explicit clipboard access
  - Grant clipboard permissions in browser settings

- **Check content script:**
  - Open Developer Tools on a webpage
  - Check Console for content script errors
  - Verify content script is injected (check Sources tab)

- **Domain blocking:**
  - If you clicked "Don't ask again" for a domain, detection is disabled
  - Reset in extension settings or reinstall extension

### Save Dialog Not Appearing

- **Check if domain is blocked:**
  - Extension settings → Blocked domains
  - Remove domain from blocked list

- **Check detection:**
  - Try manual detection from extension popup
  - Verify key matches detection patterns

- **Check console:**
  - Open Developer Tools → Console
  - Look for errors from content script

### Wallet Connection Issues

- **Check wallet extension:**
  - Ensure Phantom/Solflare is installed and unlocked
  - Try disconnecting and reconnecting

- **Check network:**
  - Ensure you're on the correct Solana network (devnet/mainnet)
  - Check RPC endpoint in extension settings

## Uninstallation

### Chrome/Edge:
1. Go to `chrome://extensions/`
2. Find KeyShield extension
3. Click "Remove"

### Firefox:
1. Go to `about:debugging#/runtime/this-firefox`
2. Find KeyShield extension
3. Click "Remove"

### Safari:
1. Go to Safari → Preferences → Extensions
2. Find KeyShield extension
3. Click "Uninstall"

## Development Mode

For development and testing:

```bash
# Watch mode (auto-rebuild on changes)
npm run dev

# Development build
npm run build:dev

# Type checking
npm run type-check

# Clean build artifacts
npm run clean
```

## Support

For issues or questions:
- Check the main KeyShield README
- Open an issue on GitHub
- Check browser console for error messages

## Security Notes

- **Never share your master password or wallet private keys**
- **The extension stores keys encrypted locally and on-chain**
- **Keys are encrypted with Lit Protocol before storage**
- **Only you can decrypt your keys with your wallet**

---

**Note:** This extension is for development/testing. For production use, the extension should be signed and distributed through browser stores (Chrome Web Store, Firefox Add-ons, Safari App Store).
