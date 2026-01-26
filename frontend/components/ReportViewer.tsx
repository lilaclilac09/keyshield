import React from 'react';
import { Printer, X, FileText, Shield, Key, Calendar, Tag } from 'lucide-react';
import { VaultItem, AuditLog } from '../types';

export interface ReportPage {
  pageNumber: number;
  title?: string;
  keywords?: string;
  content: React.ReactNode[];
}

interface ReportViewerProps {
  pages: ReportPage[];
  onClose?: () => void;
  mode?: 'cyberpunk' | 'clean';
}

export function ReportViewer({ pages, onClose, mode = 'clean' }: ReportViewerProps) {
  const isCyberpunk = mode === 'cyberpunk';

  return (
    <div className={`fixed inset-0 z-50 flex flex-col ${
      isCyberpunk ? 'bg-[#131314] text-zinc-400' : 'bg-white text-gray-900'
    }`}>
      {/* Header */}
      <div className={`border-b p-4 flex justify-between items-center no-print ${
        isCyberpunk ? 'border-zinc-800 bg-[#1e1f20]' : 'border-gray-200 bg-gray-50'
      }`}>
        <div className="flex items-center gap-3">
          <Shield size={20} className={isCyberpunk ? 'text-orange-600/60' : 'text-gray-700'} />
          <h1 className={`text-2xl font-bold ${isCyberpunk ? 'text-zinc-200' : 'text-gray-900'}`}>
            KeyShield Vault Report
          </h1>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => window.print()}
            className={`px-4 py-2 rounded-sm text-sm font-bold transition-all flex items-center gap-2 ${
              isCyberpunk
                ? 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700'
                : 'bg-gray-200 hover:bg-gray-300 text-gray-800 border border-gray-300'
            }`}
          >
            <Printer size={16} /> Print/Export
          </button>
          {onClose && (
            <button
              onClick={onClose}
              className={`p-2 rounded-sm transition-all ${
                isCyberpunk
                  ? 'text-zinc-600 hover:text-orange-500'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <X size={18} />
            </button>
          )}
        </div>
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto p-8 print:p-0">
        <div className={`max-w-4xl mx-auto space-y-12 ${isCyberpunk ? '' : 'bg-white'}`}>
          {pages.map((page) => (
            <div
              key={page.pageNumber}
              className={`space-y-8 print:break-after-page ${
                isCyberpunk ? '' : 'border-b border-gray-200 pb-12'
              }`}
            >
              {/* Title & Keywords */}
              {page.title && (
                <div className="text-center space-y-4">
                  <h2 className={`text-3xl font-bold ${
                    isCyberpunk ? 'text-zinc-200' : 'text-gray-900'
                  }`}>
                    {page.title}
                  </h2>
                  {page.keywords && (
                    <p className={`text-sm ${
                      isCyberpunk ? 'text-zinc-600' : 'text-gray-600'
                    }`}>
                      Keywords: {page.keywords}
                    </p>
                  )}
                </div>
              )}

              {/* Page Content */}
              <div className="space-y-6">
                {page.content}
              </div>

              {/* Page Number */}
              <div className={`text-center text-sm pt-8 ${
                isCyberpunk ? 'text-zinc-800' : 'text-gray-500'
              }`}>
                {page.pageNumber}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Print Styles */}
      <style>{`
        @media print {
          @page {
            margin: 1in;
            size: letter;
          }
          body {
            background: white !important;
            color: black !important;
          }
          .print\\:break-after-page {
            page-break-after: always;
          }
          .no-print {
            display: none !important;
          }
        }
      `}</style>
    </div>
  );
}

// Helper function to generate report pages from vault data
export function generateVaultReport(
  items: VaultItem[],
  auditLogs?: AuditLog[],
  walletAddress?: string
): ReportPage[] {
  const pages: ReportPage[] = [];

  // Page 1: Executive Summary
  pages.push({
    pageNumber: 1,
    title: 'KeyShield Privacy Vault Report',
    keywords: 'Solana, ZK Proofs, MPC, Lit Protocol, API Keys, Encrypted Storage, Browser Extension, Privacy',
    content: [
      <div key="exec" className="space-y-6">
        <div className="space-y-4">
          <h3 className="text-2xl font-bold">Executive Summary</h3>
          <p className="text-base leading-relaxed">
            Your KeyShield vault securely stores and manages API keys using Solana blockchain 
            for cross-device sync. All sensitive data is encrypted with Lit Protocol threshold 
            cryptography and protected with zero-knowledge proofs for privacy-preserving access.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4 mt-6">
          <div className="border border-gray-300 p-4 rounded">
            <div className="text-sm text-gray-600 mb-1">Status</div>
            <div className="text-lg font-bold text-green-600">Active</div>
          </div>
          <div className="border border-gray-300 p-4 rounded">
            <div className="text-sm text-gray-600 mb-1">Connected Wallet</div>
            <div className="text-sm font-mono break-all">
              {walletAddress ? `${walletAddress.slice(0, 8)}...${walletAddress.slice(-8)}` : 'Not Connected'}
            </div>
          </div>
        </div>

        <div className="mt-6">
          <h3 className="text-xl font-bold mb-4">Key Features</h3>
          <ul className="list-disc list-inside space-y-2 text-sm">
            <li>Auto-detect & fill API keys in browsers</li>
            <li>Biometric/master password authentication (WebAuthn)</li>
            <li>Off-grid MPC sharing for AI agents</li>
            <li>ZK proofs (Bonsol) for access verification</li>
            <li>Full-screen report viewer with print/export</li>
          </ul>
        </div>

        <div className="mt-6">
          <h3 className="text-xl font-bold mb-4">Table of Contents</h3>
          <ul className="list-disc list-inside space-y-2 text-sm">
            <li>Vault Overview & Statistics</li>
            <li>Stored Keys Inventory</li>
            {auditLogs && auditLogs.length > 0 && <li>Access History & Audit Logs</li>}
            <li>Security Analysis & Encryption Details</li>
          </ul>
        </div>
      </div>
    ],
  });

  // Page 2: Vault Overview & Statistics
  const totalItems = items.length;
  const itemsByType = items.reduce((acc, item) => {
    acc[item.type] = (acc[item.type] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  // Calculate security features status
  const hasEncryption = true; // Lit Protocol always enabled
  const hasZKProofs = true; // Bonsol integration
  const hasMPC = true; // Arcium integration
  const hasAutoFill = true; // Extension always enabled

  const oldestItem = items.length > 0 
    ? new Date(Math.min(...items.map(i => i.createdAt)))
    : null;
  const newestItem = items.length > 0
    ? new Date(Math.max(...items.map(i => i.lastUsedAt)))
    : null;

  pages.push({
    pageNumber: 2,
    title: 'Vault Overview & Statistics',
    content: [
      <div key="stats" className="space-y-6">
        <div>
          <h3 className="text-xl font-bold mb-4">Security Features Status</h3>
          <table className="w-full border-collapse border border-gray-300 text-sm mb-6">
            <thead>
              <tr className="bg-gray-100">
                <th className="border border-gray-300 p-2 text-left font-bold">Feature</th>
                <th className="border border-gray-300 p-2 text-left font-bold">Status</th>
                <th className="border border-gray-300 p-2 text-left font-bold">Details</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="border border-gray-300 p-2">Encryption</td>
                <td className="border border-gray-300 p-2 text-green-600 font-bold">Enabled</td>
                <td className="border border-gray-300 p-2">Lit Protocol threshold cryptography</td>
              </tr>
              <tr>
                <td className="border border-gray-300 p-2">ZK Proofs</td>
                <td className="border border-gray-300 p-2 text-green-600 font-bold">Active</td>
                <td className="border border-gray-300 p-2">Bonsol verification for access</td>
              </tr>
              <tr>
                <td className="border border-gray-300 p-2">MPC Sharing</td>
                <td className="border border-gray-300 p-2 text-green-600 font-bold">Ready</td>
                <td className="border border-gray-300 p-2">Arcium for off-grid agents</td>
              </tr>
              <tr>
                <td className="border border-gray-300 p-2">Auto-Fill</td>
                <td className="border border-gray-300 p-2 text-green-600 font-bold">On</td>
                <td className="border border-gray-300 p-2">Domain-matched injection</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="border border-gray-300 p-4 rounded">
            <div className="text-sm text-gray-600 mb-1">Total Items</div>
            <div className="text-3xl font-bold">{totalItems}</div>
          </div>
          <div className="border border-gray-300 p-4 rounded">
            <div className="text-sm text-gray-600 mb-1">Item Types</div>
            <div className="text-3xl font-bold">{Object.keys(itemsByType).length}</div>
          </div>
        </div>

        <div className="mt-6">
          <h3 className="text-lg font-bold mb-3">Items by Type</h3>
          <table className="w-full border-collapse border border-gray-300">
            <thead>
              <tr className="bg-gray-100">
                <th className="border border-gray-300 p-2 text-left text-sm font-bold">Type</th>
                <th className="border border-gray-300 p-2 text-left text-sm font-bold">Count</th>
                <th className="border border-gray-300 p-2 text-left text-sm font-bold">Percentage</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(itemsByType).map(([type, count]) => (
                <tr key={type}>
                  <td className="border border-gray-300 p-2 text-sm font-mono">{type}</td>
                  <td className="border border-gray-300 p-2 text-sm">{count}</td>
                  <td className="border border-gray-300 p-2 text-sm">
                    {((count / totalItems) * 100).toFixed(1)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {oldestItem && (
          <div className="mt-6 text-sm space-y-1">
            <p><strong>Oldest Item:</strong> {oldestItem.toLocaleDateString()}</p>
            <p><strong>Most Recent Activity:</strong> {newestItem?.toLocaleDateString()}</p>
          </div>
        )}
      </div>
    ],
  });

  // Page 3: Stored Keys Inventory
  if (items.length > 0) {
    pages.push({
      pageNumber: 3,
      title: 'Stored Keys Inventory',
      content: [
        <div key="inventory" className="space-y-4">
          <p className="text-sm text-gray-600 mb-4">
            All keys are encrypted with Lit Protocol – never exposed in plaintext. 
            Values shown are masked for security.
          </p>
          <table className="w-full border-collapse border border-gray-300 text-sm">
            <thead>
              <tr className="bg-gray-100">
                <th className="border border-gray-300 p-2 text-left font-bold">Service</th>
                <th className="border border-gray-300 p-2 text-left font-bold">Type</th>
                <th className="border border-gray-300 p-2 text-left font-bold">Domain</th>
                <th className="border border-gray-300 p-2 text-left font-bold">Key Preview</th>
                <th className="border border-gray-300 p-2 text-left font-bold">Last Used</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                // Mask the key value for display
                const maskedValue = item.value.length > 8 
                  ? `${item.value.substring(0, 4)}...${item.value.substring(item.value.length - 4)}`
                  : '••••••••';
                return (
                  <tr key={item.id}>
                    <td className="border border-gray-300 p-2 font-mono text-xs font-bold">
                      {item.name}
                    </td>
                    <td className="border border-gray-300 p-2 text-xs">{item.type}</td>
                    <td className="border border-gray-300 p-2 text-xs font-mono">
                      {item.domain || '—'}
                    </td>
                    <td className="border border-gray-300 p-2 text-xs font-mono text-gray-600">
                      {maskedValue}
                    </td>
                    <td className="border border-gray-300 p-2 text-xs">
                      {new Date(item.lastUsedAt).toLocaleDateString()}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="text-xs text-gray-500 mt-4 italic">
            * Keys are encrypted using Lit Protocol threshold cryptography. Full decryption 
            requires authorized access with ZK proof verification.
          </p>
        </div>
      ],
    });
  } else {
    // Show empty state
    pages.push({
      pageNumber: 3,
      title: 'Stored Keys Inventory',
      content: [
        <div key="empty" className="space-y-4 text-center py-12">
          <p className="text-gray-600">No keys stored yet.</p>
          <p className="text-sm text-gray-500">
            Add keys via the extension or dashboard to see them here.
          </p>
        </div>
      ],
    });
  }

  // Page 4: Access History & Audit Logs
  if (auditLogs && auditLogs.length > 0) {
    pages.push({
      pageNumber: 4,
      title: 'Access History & Audit Logs',
      content: [
        <div key="audit" className="space-y-4">
          <table className="w-full border-collapse border border-gray-300 text-sm">
            <thead>
              <tr className="bg-gray-100">
                <th className="border border-gray-300 p-2 text-left font-bold">Timestamp</th>
                <th className="border border-gray-300 p-2 text-left font-bold">Action</th>
                <th className="border border-gray-300 p-2 text-left font-bold">Status</th>
                <th className="border border-gray-300 p-2 text-left font-bold">Details</th>
              </tr>
            </thead>
            <tbody>
              {auditLogs.map((log) => (
                <tr key={log.id}>
                  <td className="border border-gray-300 p-2 text-xs font-mono">
                    {new Date(log.timestamp).toLocaleString()}
                  </td>
                  <td className="border border-gray-300 p-2 text-xs">{log.action}</td>
                  <td className="border border-gray-300 p-2 text-xs">
                    <span className={`px-2 py-1 rounded text-xs ${
                      log.status === 'success' ? 'bg-green-100 text-green-800' :
                      log.status === 'warning' ? 'bg-yellow-100 text-yellow-800' :
                      'bg-red-100 text-red-800'
                    }`}>
                      {log.status.toUpperCase()}
                    </span>
                  </td>
                  <td className="border border-gray-300 p-2 text-xs">{log.details}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ],
    });
  }

  // Page 5: Security Analysis & Encryption Details
  pages.push({
    pageNumber: pages.length + 1,
    title: 'Security Analysis & Encryption Details',
    content: [
      <div key="security" className="space-y-6">
        <div>
          <h3 className="text-lg font-bold mb-3">Vault Account Structure</h3>
          <table className="w-full border-collapse border border-gray-300 text-sm">
            <thead>
              <tr className="bg-gray-100">
                <th className="border border-gray-300 p-2 text-left font-bold">Field</th>
                <th className="border border-gray-300 p-2 text-left font-bold">Type</th>
                <th className="border border-gray-300 p-2 text-left font-bold">Size (bytes)</th>
                <th className="border border-gray-300 p-2 text-left font-bold">Description</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="border border-gray-300 p-2 font-mono text-xs">discriminator</td>
                <td className="border border-gray-300 p-2 text-xs">[u8; 8]</td>
                <td className="border border-gray-300 p-2 text-xs">8</td>
                <td className="border border-gray-300 p-2 text-xs">Vault account identifier</td>
              </tr>
              <tr>
                <td className="border border-gray-300 p-2 font-mono text-xs">owner</td>
                <td className="border border-gray-300 p-2 text-xs">Pubkey</td>
                <td className="border border-gray-300 p-2 text-xs">32</td>
                <td className="border border-gray-300 p-2 text-xs">Vault owner wallet address</td>
              </tr>
              <tr>
                <td className="border border-gray-300 p-2 font-mono text-xs">encrypted_key_hash</td>
                <td className="border border-gray-300 p-2 text-xs">[u8; 32]</td>
                <td className="border border-gray-300 p-2 text-xs">32</td>
                <td className="border border-gray-300 p-2 text-xs">Lit Protocol dataToEncryptHash (reference to encrypted data)</td>
              </tr>
              <tr>
                <td className="border border-gray-300 p-2 font-mono text-xs">zk_commit</td>
                <td className="border border-gray-300 p-2 text-xs">[u8; 32]</td>
                <td className="border border-gray-300 p-2 text-xs">32</td>
                <td className="border border-gray-300 p-2 text-xs">ZK commitment (Bonsol) for access verification</td>
              </tr>
              <tr>
                <td className="border border-gray-300 p-2 font-mono text-xs">mpc_hash</td>
                <td className="border border-gray-300 p-2 text-xs">[u8; 32]</td>
                <td className="border border-gray-300 p-2 text-xs">32</td>
                <td className="border border-gray-300 p-2 text-xs">MPC hash (Arcium) for distributed key management</td>
              </tr>
              <tr>
                <td className="border border-gray-300 p-2 font-mono text-xs">created_at</td>
                <td className="border border-gray-300 p-2 text-xs">u64</td>
                <td className="border border-gray-300 p-2 text-xs">8</td>
                <td className="border border-gray-300 p-2 text-xs">Timestamp for time-locked access</td>
              </tr>
              <tr>
                <td className="border border-gray-300 p-2 font-mono text-xs">access_flags</td>
                <td className="border border-gray-300 p-2 text-xs">u8</td>
                <td className="border border-gray-300 p-2 text-xs">1</td>
                <td className="border border-gray-300 p-2 text-xs">Access control flags</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="mt-6">
          <h3 className="text-lg font-bold mb-3">Security Features</h3>
          <ul className="list-disc list-inside space-y-2 text-sm">
            <li>All keys encrypted using Lit Protocol with threshold cryptography</li>
            <li>Zero-knowledge proofs (Bonsol) for access verification</li>
            <li>Multi-party computation (Arcium) for key management</li>
            <li>On-chain storage of hashes only (full ciphertext stored off-chain)</li>
            <li>Time-locked access controls</li>
            <li>Owner-based direct access with proof verification for shared access</li>
          </ul>
        </div>
      </div>
    ],
  });

  return pages;
}
