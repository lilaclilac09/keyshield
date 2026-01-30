# KeyShield Extension - Debugging Guide

## Quick Debugging Steps

### 1. Check Extension is Loaded

1. Open browser extensions page:
   - Chrome: `chrome://extensions/`
   - Firefox: `about:debugging#/runtime/this-firefox`
2. Find KeyShield extension
3. Ensure it's **enabled**
4. Check for any error messages (red text)

### 2. Check Console for Errors

**Background Script (Service Worker):**
1. Chrome: Go to `chrome://extensions/` → Find KeyShield → Click "service worker" link
2. Check console for errors

**Content Script (Web Page):**
1. Open any webpage
2. Press F12 to open Developer Tools
3. Go to Console tab
4. Look for `[KeyShield]` messages
5. Check for any red error messages

**Extension Popup:**
1. Right-click extension icon → "Inspect popup"
2. Check console for errors

### 3. Test Detection Manually

1. Open any webpage (e.g., `https://example.com`)
2. Open Developer Tools (F12) → Console
3. Type this to test detection:
   ```javascript
   // Simulate pasting a GitHub token
   navigator.clipboard.writeText('ghp_test1234567890abcdefghijklmnopqrstuvwxyz').then(() => {
     console.log('Copied test token');
     // Now paste it (Ctrl+V or Cmd+V)
   });
   ```
4. Or manually copy a test API key: `ghp_test1234567890abcdefghijklmnopqrstuvwxyz`
5. Paste it somewhere on the page
6. Check console for `[KeyShield]` messages

### 4. Check Permissions

1. Go to extension settings
2. Ensure these permissions are granted:
   - Storage
   - Active Tab
   - Tabs
   - Scripting
   - Clipboard Read
   - Clipboard Write
   - All URLs (host permissions)

### 5. Test Save Dialog Directly

Open any webpage console and run:
```javascript
// This will test if save dialog can be shown
if (typeof saveDialog !== 'undefined') {
  saveDialog.show({
    detectedKey: {
      key: 'ghp_test1234567890abcdefghijklmnopqrstuvwxyz',
      source: 'clipboard',
      domain: window.location.hostname,
      timestamp: Date.now()
    },
    onSave: () => console.log('Save clicked'),
    onDismiss: () => console.log('Dismiss clicked')
  });
} else {
  console.error('saveDialog not found - content script may not be loaded');
}
```

## Common Issues

### Issue: Extension Not Detecting Keys

**Symptoms:**
- No save dialog appears
- No console messages

**Solutions:**
1. Check if content script is injected:
   - Open DevTools → Sources tab
   - Look for `content/content-script.js` in the file tree
2. Check if script is blocked:
   - Some sites block content scripts
   - Try on a simple site like `example.com`
3. Check clipboard permissions:
   - Some browsers require explicit permission
   - Try pasting manually instead of copying

### Issue: Save Dialog Not Appearing

**Symptoms:**
- Keys detected (console shows `[KeyShield] Keys detected`)
- But no dialog appears

**Solutions:**
1. Check if domain is blocked:
   ```javascript
   chrome.storage.local.get(['blockedDomains'], (result) => {
     console.log('Blocked domains:', result.blockedDomains);
   });
   ```
2. Clear blocked domains:
   ```javascript
   chrome.storage.local.set({ blockedDomains: [] });
   ```
3. Check for CSS conflicts:
   - Some sites have high z-index elements
   - Dialog might be behind other elements
4. Check console for errors:
   - Look for `[KeyShield SaveDialog]` error messages

### Issue: Save Button Not Working

**Symptoms:**
- Dialog appears
- But clicking "Save" does nothing

**Solutions:**
1. Check if wallet is connected:
   - Open extension popup
   - Check authentication status
2. Check background script console for errors
3. Check if session is valid:
   - Try re-authenticating
4. Check network connection:
   - Ensure RPC endpoint is accessible

### Issue: Extension Crashes/Reloads

**Symptoms:**
- Extension icon disappears
- Service worker shows "Error" status

**Solutions:**
1. Check service worker console for errors
2. Check for memory issues:
   - Background script is large (8MB)
   - May need to optimize
3. Try reloading extension:
   - Go to extensions page
   - Click reload icon

## Debug Console Commands

Run these in the webpage console (F12):

```javascript
// Check if content script is loaded
console.log('KeyShield loaded:', typeof saveDialog !== 'undefined');

// Check detection state
console.log('Last detected keys:', lastDetectedKeys);

// Manually trigger detection
KeyDetector.detectFormFields();
KeyDetector.detectClipboard();

// Check blocked domains
chrome.storage.local.get(['blockedDomains'], console.log);

// Clear all storage
chrome.storage.local.clear();

// Check extension ID
console.log('Extension ID:', chrome.runtime.id);
```

## Getting Help

If still not working:

1. **Collect Information:**
   - Browser name and version
   - Extension version
   - Console errors (screenshot)
   - Steps to reproduce

2. **Check Logs:**
   - Background script console
   - Content script console (webpage)
   - Extension popup console

3. **Test on Simple Site:**
   - Try on `https://example.com`
   - If it works there, issue is site-specific

4. **Reinstall Extension:**
   - Remove extension
   - Rebuild: `npm run build`
   - Reload extension

## Expected Console Output

When working correctly, you should see:

```
[KeyShield] Paste event detected
[KeyShield] Key detected from clipboard: ghp_test12...
[KeyShield] Showing save dialog for key: ghp_test12...
[KeyShield SaveDialog] Showing dialog for key type: ghp_test12...
[KeyShield SaveDialog] Dialog shown successfully
```

If you see errors instead, note them down and check the solutions above.
