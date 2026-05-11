import React from 'react';
import ReactDOM from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TooltipProvider } from '@keyshield/ui';
import { configureApi } from '@keyshield/shared/api';
import { getToken, clearAuth, isAuthenticated, syncTokenToExtension } from '@keyshield/shared/auth';
import '@keyshield/ui/styles';
import { SolanaProvider } from './providers/SolanaProvider';
import { rootRoutes } from './routes';
import './styles/app.css';

// Configure API client
configureApi({
  baseUrl: import.meta.env.VITE_API_URL ?? 'http://localhost:8000',
  getToken,
  onUnauthorized: () => {
    clearAuth();
    window.location.href = '/login';
  },
});

// Push any existing session token to the KeyShield browser extension so
// returning users (token already in localStorage) get the extension wired
// up without having to log out and back in. New logins go through
// saveToken() which already pushes — this only covers the "already
// signed in last session" path. No-op when the extension isn't installed.
syncTokenToExtension();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      refetchOnWindowFocus: false,
    },
  },
});

const router = createBrowserRouter(rootRoutes, {
  future: { v7_relativeSplatPath: true },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <SolanaProvider>
        <TooltipProvider>
          <RouterProvider router={router} />
        </TooltipProvider>
      </SolanaProvider>
    </QueryClientProvider>
  </React.StrictMode>
);
