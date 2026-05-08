# KeyShield Browser Extension

Browser extension for KeyShield that provides auto-detection, secure auto-fill, and off-chain authentication for API key management.

## Features

- **Auto-Detection**: Automatically detects API keys from form fields, clipboard, and screen (OCR)
- **Secure Auto-Fill**: Safely injects keys into form fields without exposing plaintext
- **Off-Chain Authentication**: WebAuthn (biometric) and master password support
- **Encrypted Storage**: Secure local storage using IndexedDB and Web Crypto API
- **Solana Integration**: Works with existing KeyShield Solana program

## Setup

### 1. Install Dependencies

```bash
cd extension
npm install
```

### 2. Build Extension

```bash
npm run build
```

This will compile TypeScript files and create the `dist/` directory.

### 3. Load Extension in Browser

#### Chrome/Edge:
1. Open `chrome://extensions/`
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select the `extension/` directory

#### Firefox:
1. Open `about:debugging`
2. Click "This Firefox"
3. Click "Load Temporary Add-on"
4. Select `extension/manifest.json`

#### Safari:
1. Enable Safari Web Extension development
2. Build using Xcode (requires macOS development setup)

## Configuration

### Environment Variables

Create a `.env` file in the `extension/` directory:

```env
LIT_NETWORK=datil
RPC_URL=https://api.devnet.solana.com
PROGRAM_ID=your_program_id_here
```

Or configure in extension settings after installation.

## Development

### Watch Mode

```bash
npm run dev
```

This will watch for file changes and rebuild automatically.

### Project Structure

```
extension/
├── src/
│   ├── background/
│   │   └── service-worker.ts    # Background service worker
│   ├── content/
│   │   └── content-script.ts   # Content script for page interaction
│   ├── popup/
│   │   ├── popup.html           # Popup UI
│   │   └── popup.ts             # Popup controller
│   ├── lib/
│   │   ├── auth.ts              # Authentication service
│   │   ├── key-detector.ts      # Key detection logic
│   │   ├── key-injector.ts      # Secure key injection
│   │   ├── ocr-service.ts       # OCR for screen capture
│   │   └── vault-client.ts      # Solana vault integration
│   └── storage/
│       └── secure-storage.ts    # Encrypted storage layer
├── manifest.json                # Extension manifest
├── package.json
├── tsconfig.json
└── webpack.config.js
```

## Usage

### First Time Setup

1. Install and load the extension
2. Click the extension icon
3. Choose authentication method:
   - **Biometric**: Use WebAuthn (Face ID/Touch ID)
   - **Master Password**: Set a master password

### Detecting Keys

- **Automatic**: Extension monitors form fields and clipboard
- **Manual**: Click "Detect Keys on Page" in popup
- **OCR**: Click "Capture Screen (OCR)" to scan screen for keys

### Auto-Fill

1. Navigate to a page with API key fields
2. Click extension icon
3. Click "Auto-Fill Keys"
4. Or use keyboard shortcut: `Ctrl+Shift+K` (Windows/Linux) or `Cmd+Shift+K` (Mac)

## Security

- **Zero-Knowledge**: Keys encrypted before leaving device
- **Off-Chain Auth**: No Solana transactions for authentication
- **Secure Storage**: All sensitive data encrypted with AES-GCM
- **Session Management**: Sessions expire after 30 minutes of inactivity

## Browser Compatibility

- ✅ Chrome/Edge (Manifest V3)
- ✅ Firefox (WebExtensions)
- ⚠️ Safari (requires additional setup)

## Troubleshooting

### Extension Not Loading

- Check browser console for errors
- Verify all files are in `dist/` directory
- Ensure `manifest.json` is valid

### Authentication Failing

- Check if WebAuthn is supported in your browser
- Verify master password is at least 8 characters
- Check browser permissions for biometrics

### Keys Not Detecting

- Ensure extension has permission to access the page
- Check if page uses iframes (may need additional permissions)
- Verify key patterns match common API key formats

## License

Same as main KeyShield project.
