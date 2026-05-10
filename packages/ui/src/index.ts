export { cn } from './lib/utils';

// --- KeyShield premium components ---
export { MediaToolkit } from './components/keyshield/media-toolkit';
export { BrandLogo, BrandLogoMark, BrandLogoOutline } from './components/keyshield/brand-logo';
export { BrandColorSwatch, BrandColorPalette } from './components/keyshield/brand-colors';
export { BrandValuesGrid } from './components/keyshield/brand-values';
export { PatternTexture, PatternTextureGrid } from './components/keyshield/pattern-texture';
export { SquareGrid, GridCell } from './components/keyshield/square-grid';
export { Button, SegmentedControl, Chip, AuthStatus } from './components/keyshield/button';
export { ToggleButton, ToggleGroup, SwitchRow } from './components/keyshield/toggle';
export {
  VaultCard, AssetWidget, MultiSigControl,
  DeployVaultButton, ViewAnalyticsButton, AssignKeyButton,
  SecureAccountButton, ApproveTxButton, NetworkControls,
  WalletAddressField, PortfolioChart,
} from './components/keyshield/vault-management';
export {
  TitaniumAccessCard, HardwareKey, TabletDashboard,
  NfcDevice, AuthFob, ApplicationMockupGrid,
} from './components/keyshield/application-mockup';

// --- shadcn/ui (kept for backwards compat) ---
export { buttonVariants } from './components/ui/button';
export { Button as ShadButton } from './components/ui/button';
export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent } from './components/ui/card';
export { Input } from './components/ui/input';
export { Textarea } from './components/ui/textarea';
export { Select, SelectGroup, SelectValue, SelectTrigger, SelectContent, SelectLabel, SelectItem, SelectSeparator } from './components/ui/select';
export { Dialog, DialogPortal, DialogOverlay, DialogClose, DialogTrigger, DialogContent, DialogHeader, DialogFooter, DialogTitle, DialogDescription } from './components/ui/dialog';
export { Table, TableHeader, TableBody, TableFooter, TableHead, TableRow, TableCell, TableCaption } from './components/ui/table';
export { Tabs, TabsList, TabsTrigger, TabsContent } from './components/ui/tabs';
export { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuCheckboxItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuShortcut, DropdownMenuGroup, DropdownMenuPortal, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger } from './components/ui/dropdown-menu';
export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from './components/ui/tooltip';
export { Switch } from './components/ui/switch';
export { Badge, badgeVariants } from './components/ui/badge';
export { Separator } from './components/ui/separator';
export { Label } from './components/ui/label';
export { ToastProvider, ToastViewport, Toast, ToastTitle, ToastDescription, ToastClose, ToastAction } from './components/ui/toast';
export { Skeleton } from './components/ui/skeleton';
export { Alert, AlertTitle, AlertDescription } from './components/ui/alert';
