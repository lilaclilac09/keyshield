# reset-web-v3.ps1
$ErrorActionPreference = "Stop"
$root = "C:\Users\justi\Desktop\keyshield\src"
$project = "web-v3"
$projectPath = Join-Path $root $project

# 1. Remove old folder (backup first if needed)
if (Test-Path $projectPath) {
    Write-Host "Removing old $projectPath ..." -ForegroundColor Yellow
    Remove-Item -Recurse -Force $projectPath
}

# 2. Create fresh Vite React + TS project
Write-Host "Creating fresh Vite React + TS project..." -ForegroundColor Cyan
Set-Location $root
npm create vite@latest $project -- --template react-ts
Set-Location $projectPath

# 3. Install core dependencies
Write-Host "Installing core dependencies..." -ForegroundColor Cyan
npm install

# 4. Install Tailwind CSS v4 and PostCSS
Write-Host "Installing Tailwind CSS v4..." -ForegroundColor Cyan
npm install -D tailwindcss @tailwindcss/vite @tailwindcss/postcss postcss

# 5. Install TanStack and state management
Write-Host "Installing TanStack Query, Router, Zustand, Zod..." -ForegroundColor Cyan
npm install @tanstack/react-query @tanstack/react-router zustand zod

# 6. Install Solana wallet adapter libraries
Write-Host "Installing Solana wallet adapters..." -ForegroundColor Cyan
npm install @solana/web3.js @solana/wallet-adapter-react @solana/wallet-adapter-react-ui @solana/wallet-adapter-base @solana/wallet-adapter-phantom @solana/wallet-adapter-solflare

# 7. Install Lucide icons
npm install lucide-react

# 8. Configure Tailwind CSS v4
Write-Host "Configuring Tailwind CSS v4..." -ForegroundColor Cyan
@"
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { port: 3000, host: '0.0.0.0' },
})
"@ | Out-File -FilePath "vite.config.ts" -Encoding utf8

@"
export default {
  plugins: {
    '@tailwindcss/postcss': {},
  },
}
"@ | Out-File -FilePath "postcss.config.js" -Encoding utf8

@"
@import "tailwindcss";

@theme {
  --font-sans: 'Inter', system-ui, sans-serif;
}
body {
  background: black;
  color: white;
  font-family: 'Inter', sans-serif;
}
"@ | Out-File -FilePath "src/index.css" -Encoding utf8

# 9. Overwrite main.tsx with providers
@"
import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider, createRouter } from '@tanstack/react-router'
import { routeTree } from './routes/routeTree.gen'
import './index.css'

const queryClient = new QueryClient()
const router = createRouter({ routeTree })

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </React.StrictMode>,
)
"@ | Out-File -FilePath "src/main.tsx" -Encoding utf8

# 10. Create a minimal App component
New-Item -ItemType Directory -Force -Path "src/routes" | Out-Null
@"
import { createRootRoute, createRoute } from '@tanstack/react-router'
import App from '../App'

export const rootRoute = createRootRoute({
  component: App,
})

export const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: () => <div className="p-4 text-center"><h1 className="text-2xl font-bold">KeyShield Vault</h1><p className="mt-2">Welcome!</p></div>,
})

export const routeTree = rootRoute.addChildren([indexRoute])
"@ | Out-File -FilePath "src/routes/routeTree.gen.ts" -Encoding utf8

@"
import { Outlet } from '@tanstack/react-router'
import { SolanaProvider } from './components/SolanaProvider'

function App() {
  return (
    <SolanaProvider>
      <Outlet />
    </SolanaProvider>
  )
}

export default App
"@ | Out-File -FilePath "src/App.tsx" -Encoding utf8

# 11. Create SolanaProvider component
New-Item -ItemType Directory -Force -Path "src/components" | Out-Null
@"
import { useMemo } from 'react'
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react'
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui'
import { PhantomWalletAdapter } from '@solana/wallet-adapter-phantom'
import { SolflareWalletAdapter } from '@solana/wallet-adapter-solflare'
import { clusterApiUrl } from '@solana/web3.js'
import '@solana/wallet-adapter-react-ui/styles.css'

export const SolanaProvider = ({ children }) => {
  const endpoint = useMemo(() => clusterApiUrl('mainnet-beta'), [])
  const wallets = useMemo(() => [new PhantomWalletAdapter(), new SolflareWalletAdapter()], [])
  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>{children}</WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  )
}
"@ | Out-File -FilePath "src/components/SolanaProvider.tsx" -Encoding utf8

# 12. Install remaining dev dependencies
npm install -D @types/react @types/react-dom

# 13. Start dev server
Write-Host "✅ Setup complete! Starting dev server..." -ForegroundColor Green
npm run dev