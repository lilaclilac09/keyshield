import type { ComponentPropsWithoutRef } from 'react';
import { cn } from '../../lib/utils';
import { BrandLogo, BrandLogoMark, BrandLogoOutline } from './brand-logo';
import { BrandColorPalette } from './brand-colors';
import { BrandValuesGrid } from './brand-values';
import { PatternTextureGrid } from './pattern-texture';
import { ApplicationMockupGrid } from './application-mockup';
import { SquareGrid, GridCell } from './square-grid';
import { Button, SegmentedControl, Chip, AuthStatus } from './button';
import { ToggleGroup, SwitchRow } from './toggle';
import { VaultCard, AssetWidget, MultiSigControl, DeployVaultButton, ViewAnalyticsButton, AssignKeyButton, SecureAccountButton, ApproveTxButton, NetworkControls, WalletAddressField, PortfolioChart } from './vault-management';
import { Shield, Key, Lock, Activity, Wallet, Network, MoreHorizontal } from 'lucide-react';

export function MediaToolkit(props: ComponentPropsWithoutRef<'div'>) {
  return (
    <div className={cn('mt-square-grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-8 p-6', props.className)}>
      <div className="col-span-full">
        <span className="mt-section-label">Brand Identity</span>
        <div className="flex flex-col gap-6">
          <BrandLogo />
          <div className="flex items-center gap-4">
            <BrandLogoMark /><BrandLogoOutline />
            <div className="w-px h-6 bg-[#d4d4dc]" />
            <div className="text-xs text-[#8e8e9a] font-mono tracking-wider">KEYSHIELD</div>
          </div>
        </div>
      </div>
      <div className="mt-divider col-span-full" />
      <div className="col-span-full"><span className="mt-section-label">Color Palette</span><BrandColorPalette /></div>
      <div className="mt-divider col-span-full" />
      <div className="col-span-full">
        <span className="mt-section-label">Typography</span>
        <div className="mt-typography space-y-4">
          <h1>H1 — Protect What Matters</h1><h2>H2 — Institutional Custody</h2><h3>H3 — Multi-Signature Vaults</h3>
          <p>P paragraph — Secure, sovereign-grade infrastructure for the modern digital economy. Built for institutions that demand precision.</p>
        </div>
      </div>
      <div className="mt-divider col-span-full" />
      <div className="col-span-full">
        <span className="mt-section-label">Button System</span>
        <div className="space-y-6">
          <div><span className="text-[10px] uppercase tracking-[0.25em] font-medium text-[#8e8e9a] mb-3 block">Action Buttons</span>
            <div className="flex flex-wrap gap-3"><DeployVaultButton /><ViewAnalyticsButton /><AssignKeyButton /></div></div>
          <div><span className="text-[10px] uppercase tracking-[0.25em] font-medium text-[#8e8e9a] mb-3 block">Variants</span>
            <div className="flex flex-wrap gap-3">
              <Button variant="primary">Primary</Button><Button variant="secondary">Secondary</Button>
              <Button variant="outlined">Outlined</Button><Button variant="ghost">Ghost</Button>
              <Button variant="pill-primary" size="sm">Pill Primary</Button><Button variant="pill-secondary" size="sm">Pill Secondary</Button>
            </div></div>
          <div><span className="text-[10px] uppercase tracking-[0.25em] font-medium text-[#8e8e9a] mb-3 block">Authentication</span>
            <div className="flex flex-wrap gap-3"><SecureAccountButton /><ApproveTxButton />
              <AuthStatus status="active" /><AuthStatus status="pending" /><AuthStatus status="inactive" /></div></div>
          <div><span className="text-[10px] uppercase tracking-[0.25em] font-medium text-[#8e8e9a] mb-3 block">Controls</span>
            <div className="flex flex-wrap gap-4 items-center"><SegmentedControl options={['All', 'Active', 'Archived']} activeIndex={1} />
              <ToggleGroup options={['Mainnet', 'Testnet', 'Devnet']} activeIndex={0} />
              <Chip variant="default" dot>Connected</Chip><Chip variant="success" dot>Verified</Chip></div></div>
        </div>
      </div>
      <div className="mt-divider col-span-full" />
      <div className="col-span-full"><span className="mt-section-label">Vault Management</span>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-4">
          <VaultCard title="Primary Vault" subtitle="Multi-signature custody" icon={<Shield size={20} className="text-[#525260]" />} headerActions={<MoreHorizontal size={16} className="text-[#8e8e9a] cursor-pointer" />}>
            <div className="space-y-3"><WalletAddressField address="0x7F3d...E42a9C" /><MultiSigControl signed={3} required={5} /><PortfolioChart /><div className="mt-square-grid grid-cols-[repeat(3,1fr)] gap-2">
              <AssetWidget label="Total Value" value="$12.4M" change="+2.3%" positive /><AssetWidget label="Active Keys" value={127} /><AssetWidget label="Pending" value={8} change="-0.5%" positive={false} />
            </div></div>
          </VaultCard>
          <VaultCard title="Network Controls" subtitle="Real-time monitoring" icon={<Network size={20} className="text-[#525260]" />}>
            <div className="space-y-3"><NetworkControls /><SwitchRow label="Auto-synchronize" description="Sync across all vault nodes" checked />
              <SwitchRow label="Hardware wallet mode" description="Require physical key for access" />
              <SwitchRow label="Biometric verification" description="Fingerprint + face recognition" /></div>
          </VaultCard>
        </div>
      </div>
      <div className="mt-divider col-span-full" />
      <div className="col-span-full"><span className="mt-section-label">Square Grid System</span><SquareGrid size={4} gap="md">
        {Array.from({ length: 16 }).map((_, i) => (<GridCell key={i}><div className="flex flex-col items-center justify-center h-full"><Key size={18} className="text-[#8e8e9a] mb-2" /><span className="font-mono text-[9px] tracking-wider text-[#525260]">{String(i + 1).padStart(2, '0')}</span></div></GridCell>))}
      </SquareGrid></div>
      <div className="mt-divider col-span-full" />
      <div className="col-span-full"><span className="mt-section-label">Brand Values</span><BrandValuesGrid /></div>
      <div className="mt-divider col-span-full" />
      <div className="col-span-full"><span className="mt-section-label">Pattern & Texture System</span><PatternTextureGrid /></div>
      <div className="mt-divider col-span-full" />
      <div className="col-span-full"><span className="mt-section-label">Application Mockups</span><ApplicationMockupGrid /></div>
    </div>
  );
}
