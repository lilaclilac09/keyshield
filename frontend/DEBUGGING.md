# KeyShield Frontend Debugging Guide

## Quick Fixes for Blank Page

### 1. Check Browser Console
Open DevTools (F12 or Cmd+Option+I) → Console tab:
- Look for red errors
- Should see: `🚀 KeyShield: Initializing application...`
- Should see: `✅ KeyShield: Application mounted successfully`
- Should see: `🔐 KeyShield Auth State: { isAuthenticated: false, ... }`

### 2. Verify Server is Running
```bash
cd frontend
npm run dev
```
Should show: `VITE v6.x.x  ready in xxx ms` → `➜  Local:   http://localhost:3000/`

### 3. Clear Browser Cache
- Hard refresh: `Cmd+Shift+R` (Mac) or `Ctrl+Shift+R` (Windows)
- Or clear cache in DevTools → Application → Clear Storage

### 4. Check Network Tab
- Open DevTools → Network tab
- Refresh page
- Look for:
  - ✅ `index.html` (200 OK)
  - ✅ `main.js` or bundle files (200 OK)
  - ❌ Any 404s or failed requests

### 5. Expected Flow
1. **Initial Load**: Shows AuthScreen (wallet connect)
2. **After Connect**: Shows main vault dashboard
3. **Click FileText Icon**: Opens ReportViewer

## Common Issues

### Issue: Blank White Page
**Cause**: JavaScript error preventing render
**Fix**: Check console for errors, see ErrorBoundary component

### Issue: Stuck on Auth Screen
**Cause**: Wallet not connecting
**Fix**: 
- Click "OVERRIDE" button to skip auth (for testing)
- Or connect Phantom/Solflare wallet

### Issue: "Prop AMM" Old Text Showing
**Cause**: Browser cache with old code
**Fix**: 
```bash
# Clear Vite cache
rm -rf frontend/node_modules/.vite
# Hard refresh browser
```

### Issue: Port 3000 Already in Use
**Fix**:
```bash
# Kill process on port 3000
lsof -ti:3000 | xargs kill -9
# Or change port in vite.config.ts
```

## Testing ReportViewer

1. **Connect Wallet** (or click OVERRIDE)
2. **See Vault Items** (should show 4 sample items)
3. **Click FileText Icon** (top-right toolbar)
4. **Report Opens** in full-screen white background
5. **Click Print/Export** to test printing

## Debug Logs

The app now logs to console:
- `🚀 KeyShield: Initializing application...`
- `✅ KeyShield: Application mounted successfully`
- `🔐 KeyShield Auth State: { ... }`
- `📊 KeyShield: MainContent loaded, items count: X`

If you don't see these, the JavaScript isn't loading.

## Still Not Working?

1. **Check terminal** for Vite errors
2. **Share console errors** from browser
3. **Verify Node version**: `node --version` (should be 18+)
4. **Reinstall dependencies**:
   ```bash
   cd frontend
   rm -rf node_modules package-lock.json
   npm install
   npm run dev
   ```
