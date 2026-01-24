# Fix Internal Server Error

The error is likely due to missing NEXT_PUBLIC_PROGRAM_ID. I've made getProgramId() more resilient.

**To fix:**

1. **Restart the Next.js dev server:**
   ```bash
   # Stop the current server (Ctrl+C in the terminal running it)
   # Then restart:
   cd frontend
   npm run dev
   ```

2. **Or create/update .env.local:**
   ```bash
   cd frontend
   echo "NEXT_PUBLIC_PROGRAM_ID=11111111111111111111111111111111" >> .env.local
   echo "NEXT_PUBLIC_RPC_URL=https://api.devnet.solana.com" >> .env.local
   echo "NEXT_PUBLIC_LIT_NETWORK=datil" >> .env.local
   ```

3. **Check browser console** for the actual error message

The fix I made allows the app to load with a placeholder program ID instead of crashing.
