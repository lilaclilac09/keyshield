import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider, createRouter } from "@tanstack/react-router";
import { routeTree } from "./routes/routeTree.gen";
import './styles.css';
import { initSentry } from "../../lib/sentry";

// Initialize Sentry error tracking
initSentry();

// TanStack Query — SOTA server state management (2026)
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5_000,
      gcTime: 300_000,
      retry: 2,
      refetchOnWindowFocus: false,
    },
  },
});

// TanStack Router — type-safe routing
const router = createRouter({
  routeTree,
  basepath: '/',
  defaultPendingMs: 0,
  defaultPendingMinMs: 150,
});

// Register router types
declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

// Render with all providers
const root = ReactDOM.createRoot(document.getElementById('root')!);
root.render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </React.StrictMode>,
);
