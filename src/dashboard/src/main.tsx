import React from 'react';
import ReactDOM from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TooltipProvider } from '@keyshield/ui';
import { configureApi } from '@keyshield/shared/api';
import { getToken, clearAuth, isAuthenticated } from '@keyshield/shared/auth';
import '@keyshield/ui/styles';
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
      <TooltipProvider>
        <RouterProvider router={router} />
      </TooltipProvider>
    </QueryClientProvider>
  </React.StrictMode>
);
