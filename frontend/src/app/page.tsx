'use client';

import { Dashboard } from '@/components/Dashboard';

export default function Home() {
  return (
    <main className="min-h-screen p-8">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-4xl font-bold mb-2">KeyShield</h1>
        <p className="text-gray-400 mb-8">
          Private API Vault on Solana with ZK proofs, MPC, and Lit Protocol
        </p>
        <Dashboard />
      </div>
    </main>
  );
}
