'use client';

import { Dashboard } from '@/components/Dashboard';
import { useEffect } from 'react';

// Force dynamic rendering to avoid SSR issues with Node.js modules
export const dynamic = 'force-dynamic';

export default function Home() {
  // #region agent log
  useEffect(() => {
    fetch('http://127.0.0.1:7244/ingest/578c6ea9-707c-43da-8c19-a1de0e50bb6b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'page.tsx:12',message:'Home component mounted',data:{url:window.location.href,port:window.location.port},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
  }, []);
  // #endregion

  return (
    <main className="min-h-screen">
      <Dashboard />
    </main>
  );
}
