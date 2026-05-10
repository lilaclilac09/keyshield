import { useState } from 'react';
import { Eye as EyeIcon, EyeOff as EyeOffIcon, Copy as CopyIcon, Trash2 as Trash2Icon, Key as KeyIcon, Lock as LockIcon, FileText as FileTextIcon, Terminal as TerminalIcon, Server as ServerIcon, Clock } from 'lucide-react';
import { Button, Badge, Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@keyshield/ui';
import type { VaultItem, VaultItemType, DecryptedKey } from '@keyshield/shared/types';
import { useVault } from '@keyshield/shared/hooks/use-vault';
import { relTime } from '@keyshield/shared/lib/time';
import { useNotificationStore, usePreferencesStore } from '@keyshield/shared/stores';

const typeIcons: Record<VaultItemType, typeof KeyIcon> = {
  api_key: KeyIcon,
  password: LockIcon,
  note: FileTextIcon,
  env: TerminalIcon,
  ssh_key: ServerIcon,
};

interface Props {
  item: VaultItem;
  onReveal: () => void;
  onCopy: () => void;
  onDelete: () => void;
}

export function VaultItemCard({ item }: Props) {
  const { decrypt, deleteKey } = useVault();
  const { add } = useNotificationStore();
  const { reveal_duration_sec } = usePreferencesStore();
  const [revealed, setRevealed] = useState(false);
  const [decrypted, setDecrypted] = useState<DecryptedKey | null>(null);
  const [deleteDialog, setDeleteDialog] = useState(false);
  const Icon = typeIcons[item.type];

  async function handleReveal() {
    try {
      const data = await decrypt(item.id);
      setDecrypted(data);
      setRevealed(true);
      setTimeout(() => { setRevealed(false); setDecrypted(null); }, reveal_duration_sec * 1000);
    } catch (err) {
      add({ type: 'error', message: 'Failed to decrypt key' });
    }
  }

  function handleCopy() {
    if (decrypted?.value) {
      navigator.clipboard.writeText(decrypted.value);
      add({ type: 'success', message: 'Copied to clipboard' });
    } else if (item.masked_value) {
      add({ type: 'warning', message: 'Reveal key first to copy' });
    }
  }

  async function handleDelete() {
    try {
      await deleteKey(item.id);
      add({ type: 'success', message: 'Vault item deleted' });
      setDeleteDialog(false);
    } catch {
      add({ type: 'error', message: 'Failed to delete' });
    }
  }

  return (
    <>
      <div className="rounded-lg bg-[#080808] border shadow-sm hover:shadow-md transition-shadow duration-150" style={{ borderColor: '#0f0f0f' }}>
        <div className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3 flex-1 min-w-0">
              <div className="h-10 w-10 rounded-lg bg-[#0a0a0a] flex items-center justify-center shrink-0" style={{ borderColor: '#141414', borderWidth: '1px' }}>
                <Icon className="h-5 w-5" style={{ color: '#f8f8f8' }} />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="font-medium truncate" style={{ color: '#f8f8f8' }}>{item.name}</h3>
                {item.upstream && <p className="text-xs mt-0.5" style={{ color: '#f8f8f8' }}>{item.upstream}</p>}
                <div className="flex items-center gap-1.5 mt-1.5">
                  <Badge variant="outline" className="text-xs">{item.type.replace('_', ' ')}</Badge>
                  {item.tags?.map(t => <Badge key={t} variant="secondary" className="text-xs">{t}</Badge>)}
                </div>
              </div>
            </div>
          </div>

          <div className="mt-3 p-2.5 rounded-lg bg-[#0a0a0a] font-mono text-sm" style={{ borderColor: '#141414', borderWidth: '1px' }}>
            {revealed && decrypted ? (
              <span className="break-all" style={{ color: '#f8f8f8' }}>{decrypted.value}</span>
            ) : (
              <span style={{ color: '#f8f8f8' }}>{item.masked_value || '\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022'}</span>
            )}
          </div>

          <div className="flex items-center justify-between mt-3">
            <div className="flex items-center gap-1.5 text-xs" style={{ color: '#f8f8f8' }}>
              <Clock className="h-3 w-3" /> {relTime(item.updated_at)}
            </div>
            <div className="flex gap-0.5">
              <Button variant="ghost" size="icon" onClick={revealed ? () => { setRevealed(false); setDecrypted(null); } : handleReveal} title={revealed ? 'Hide' : 'Reveal'}>
                {revealed ? <EyeOffIcon className="h-4 w-4" style={{ color: '#f8f8f8' }} /> : <EyeIcon className="h-4 w-4" style={{ color: '#f8f8f8' }} />}
              </Button>
              <Button variant="ghost" size="icon" onClick={handleCopy} title="Copy">
                <CopyIcon className="h-4 w-4" style={{ color: '#f8f8f8' }} />
              </Button>
              <Button variant="ghost" size="icon" onClick={() => setDeleteDialog(true)} title="Delete">
                <Trash2Icon className="h-4 w-4" style={{ color: '#f8f8f8' }} />
              </Button>
            </div>
          </div>

          {revealed && (
            <div className="mt-2 flex items-center gap-1.5 text-xs" style={{ color: '#f8f8f8' }}>
              <Clock className="h-3 w-3" /> Hiding in {reveal_duration_sec}s
            </div>
          )}
        </div>
      </div>

      <Dialog open={deleteDialog} onOpenChange={setDeleteDialog}>
        <DialogContent className="bg-[#080808] border-[#141414]">
          <DialogHeader><DialogTitle style={{ color: '#f8f8f8' }}>Delete Vault Item</DialogTitle><DialogDescription>Are you sure you want to delete "{item.name}"?</DialogDescription></DialogHeader>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setDeleteDialog(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
