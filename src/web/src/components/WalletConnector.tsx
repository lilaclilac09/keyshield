/**
 * WalletConnector — connect button backed by @solana/wallet-adapter-react.
 *
 *   - disconnected → "Connect Wallet" opens the wallet-adapter modal
 *   - connecting   → spinner + "Connecting…"
 *   - connected    → shortened pubkey + dropdown (Disconnect)
 *
 * Uses @keyshield/ui primitives so styling matches the rest of the
 * dashboard (Button + DropdownMenu live in packages/ui).
 */
import type { ReactElement } from 'react';
import { useCallback } from 'react';
import { Wallet, Loader2, LogOut, ChevronDown } from 'lucide-react';
import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import {
  Button,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@keyshield/ui';

function shortAddr(addr: string): string {
  if (!addr) return '';
  return `${addr.slice(0, 4)}…${addr.slice(-4)}`;
}

export function WalletConnector(): ReactElement {
  const { connected, connecting, publicKey, disconnect, disconnecting } = useWallet();
  const { setVisible } = useWalletModal();

  const openModal = useCallback(() => {
    setVisible(true);
  }, [setVisible]);

  const handleDisconnect = useCallback(() => {
    disconnect().catch(() => {
      /* ignore — wallet may already be gone */
    });
  }, [disconnect]);

  if (connecting) {
    return (
      <Button size="sm" variant="secondary" disabled>
        <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
        Connecting…
      </Button>
    );
  }

  if (connected && publicKey) {
    const addr = publicKey.toBase58();
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" variant="secondary" disabled={disconnecting}>
            <Wallet className="h-3.5 w-3.5 mr-1.5" />
            <span className="font-mono">{shortAddr(addr)}</span>
            <ChevronDown className="h-3 w-3 ml-1.5 opacity-60" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={handleDisconnect} className="cursor-pointer">
            <LogOut className="h-3.5 w-3.5 mr-2" />
            Disconnect
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  return (
    <Button size="sm" variant="secondary" onClick={openModal}>
      <Wallet className="h-3.5 w-3.5 mr-1.5" />
      Connect Wallet
    </Button>
  );
}
