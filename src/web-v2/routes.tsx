import { createRouter } from '@tanstack/react-router';
import { routeTree } from './routes/routeTree.gen';

// TanStack Router — type-safe routing (SOTA 2026)
export const router = createRouter({
  routeTree,
  basepath: '/',
  defaultPendingMs: 0,
  defaultPendingMinMs: 150,
});

export function Router({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

// Register the route tree (auto-generated)
declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
