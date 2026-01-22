# KeyShield Extension - Test Checklist

Use this checklist to verify the extension works correctly after installation.

## Pre-Installation Checks

- [ ] Node.js 18+ installed
- [ ] Dependencies installed (`npm install`)
- [ ] Build completed successfully (`npm run build:all`)
- [ ] No TypeScript errors (`npm run type-check`)

## Installation Tests

### Chrome/Edge
- [ ] Extension loads without errors
- [ ] Extension icon appears in toolbar
- [ ] Extension popup opens when clicking icon
- [ ] No console errors in extension background page
- [ ] No console errors in extension popup

### Firefox
- [ ] Extension loads as temporary add-on
- [ ] Extension icon appears in toolbar
- [ ] Extension popup opens
- [ ] No console errors

### Safari
- [ ] Extension loads (if Xcode setup complete)
- [ ] Extension appears in Safari Extensions preferences
- [ ] Extension popup opens

## Authentication Tests

- [ ] WebAuthn authentication works (if available)
- [ ] Master password authentication works
- [ ] Session persists after browser restart
- [ ] Session expires after timeout
- [ ] Re-authentication works after expiration

## Detection Tests

### Clipboard Detection
- [ ] Copy GitHub token → Save dialog appears
- [ ] Copy Helius API key → Save dialog appears
- [ ] Copy Google Gemini key → Save dialog appears
- [ ] Copy generic API key → Save dialog appears
- [ ] Dialog appears within 1-2 seconds of paste

### Form Field Detection
- [ ] Enter API key in form field → Save dialog appears
- [ ] Paste API key in form field → Save dialog appears
- [ ] Detection works on GitHub settings page
- [ ] Detection works on Helius dashboard
- [ ] Detection works on Google AI Studio

### Manual Detection
- [ ] Click "Detect Keys on Page" → Keys detected
- [ ] Manual detection finds keys in form fields
- [ ] Manual detection finds keys in page content

## Save Dialog Tests

- [ ] Dialog appears in bottom-right corner
- [ ] Dialog shows correct key type icon
- [ ] Dialog shows masked key preview
- [ ] Dialog shows source (form/clipboard)
- [ ] "Save to Vault" button works
- [ ] "Dismiss" button closes dialog
- [ ] "Don't ask again" checkbox works
- [ ] Dialog auto-dismisses after 30 seconds
- [ ] Dialog can be closed with X button
- [ ] Dialog styling matches cyberpunk theme

## Save Flow Tests

### With Wallet Connected
- [ ] Click "Save to Vault" → Key encrypts
- [ ] Key stored off-chain (IndexedDB)
- [ ] Transaction instruction created
- [ ] Success message shown
- [ ] Key appears in vault list

### Without Wallet Connected
- [ ] Click "Save to Vault" → Wallet connection prompt
- [ ] Connect wallet → Save flow continues
- [ ] Key saved successfully

### Error Handling
- [ ] Network error handled gracefully
- [ ] Transaction failure shows error message
- [ ] Invalid key format shows error
- [ ] Session expired shows re-auth prompt

## Vault Management Tests

- [ ] Saved keys appear in vault list
- [ ] Keys show correct domain
- [ ] Keys show correct key type
- [ ] Keys show creation timestamp
- [ ] Auto-fill works for saved keys
- [ ] Key decryption works

## Domain Blocking Tests

- [ ] Check "Don't ask again" → Domain blocked
- [ ] Blocked domain doesn't show dialog
- [ ] Can unblock domain in settings
- [ ] Blocked domains persist after restart

## Cross-Browser Tests

- [ ] Chrome: All features work
- [ ] Firefox: All features work
- [ ] Safari: All features work (if applicable)
- [ ] Edge: All features work

## Performance Tests

- [ ] Extension doesn't slow down page loading
- [ ] Detection doesn't cause lag
- [ ] Dialog animations are smooth
- [ ] No memory leaks after extended use

## Security Tests

- [ ] Keys encrypted before storage
- [ ] Keys not visible in plaintext
- [ ] Wallet connection secure
- [ ] Session tokens expire correctly
- [ ] No sensitive data in console logs

## Edge Cases

- [ ] Multiple keys detected simultaneously
- [ ] Keys detected in iframes
- [ ] Keys detected in SPA (single-page apps)
- [ ] Extension disabled/enabled scenarios
- [ ] Browser restart with pending saves
- [ ] Network offline during save
- [ ] Very long API keys (>1000 chars)
- [ ] Special characters in API keys

## Regression Tests

- [ ] Previous functionality still works
- [ ] No breaking changes from updates
- [ ] Backward compatibility maintained

## Notes

- Test on actual websites (GitHub, Helius, Google AI Studio)
- Test with real API keys (use test/development keys)
- Test on different network conditions
- Test with different wallet providers

## Known Issues

Document any issues found during testing:

1. [Issue description]
2. [Issue description]

---

**Test Date:** _______________
**Tester:** _______________
**Browser:** _______________
**Version:** _______________
