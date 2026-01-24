'use client';

import { Dashboard } from '@/components/Dashboard';
import { useEffect } from 'react';

// Force dynamic rendering to avoid SSR issues with Node.js modules
export const dynamic = 'force-dynamic';

export default function Home() {
  return (
    <main className="min-h-screen">
      <Dashboard />
    </main>
  );
}
