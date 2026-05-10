import { useState } from 'react';
import { useForm, type UseFormReturn } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Plus } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, Tabs, TabsContent, TabsList, TabsTrigger, Input, Label, Textarea, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Button } from '@keyshield/ui';
import { useVault } from '@keyshield/shared/hooks/use-vault';
import { usePreferencesStore } from '@keyshield/shared/stores';
import { useNotificationStore } from '@keyshield/shared/stores';

const keySchema = z.object({
  name: z.string().min(1, 'Name is required'),
  type: z.enum(['api_key', 'password', 'note', 'env', 'ssh_key']),
  upstream: z.string().optional(),
  value: z.string().min(1, 'Value is required'),
  note: z.string().optional(),
  expires_at: z.string().optional(),
});

type KeyForm = z.infer<typeof keySchema>;

interface Props { open: boolean; onOpenChange: (open: boolean) => void }

const providers = ['OpenAI', 'Anthropic', 'Google AI', 'Groq', 'Mistral', 'Cohere', 'Together AI', 'DeepSeek', 'Perplexity', 'Fireworks', 'Custom'];

export function AddKeyModal({ open, onOpenChange }: Props) {
  const { store, isStoring } = useVault();
  const { add } = useNotificationStore();
  const { default_expiry_days } = usePreferencesStore();
  const [tab, setTab] = useState('api_key');

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const resolver = zodResolver(keySchema as any) as any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const formOpts: any = {
    resolver,
    defaultValues: { type: tab as KeyForm['type'] },
  };
  const { register, handleSubmit, reset, formState: { errors } } = useForm(formOpts) as unknown as UseFormReturn<KeyForm>;

  function onSubmit(data: KeyForm) {
    store({ ...data, tags: [] }).then(() => {
      add({ type: 'success', message: 'Key stored successfully' });
      reset();
      onOpenChange(false);
    }).catch(() => {
      add({ type: 'error', message: 'Failed to store key' });
    });
  }

  const expiryDate = new Date(Date.now() + default_expiry_days * 86400000).toISOString().split('T')[0];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg border-[hsl(240deg_5%_89%)]">
        <DialogHeader><DialogTitle>Add Secret</DialogTitle></DialogHeader>
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="w-full">
            <TabsTrigger value="api_key" className="flex-1">API Key</TabsTrigger>
            <TabsTrigger value="password" className="flex-1">Password</TabsTrigger>
            <TabsTrigger value="note" className="flex-1">Note</TabsTrigger>
            <TabsTrigger value="env" className="flex-1">Env</TabsTrigger>
            <TabsTrigger value="ssh_key" className="flex-1">SSH</TabsTrigger>
          </TabsList>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 mt-4">
            <div>
              <Label htmlFor="name" className="text-xs uppercase tracking-wider text-[hsl(240deg_6%_8%)]">Name</Label>
              <Input id="name" {...register('name')} placeholder="e.g. OpenAI Production" />
              {errors.name && <p className="text-xs text-[hsl(356deg_62%_56%)] mt-1">{errors.name.message}</p>}
            </div>

            {tab === 'api_key' && (
              <div>
                <Label htmlFor="upstream" className="text-xs uppercase tracking-wider text-[hsl(240deg_6%_8%)]">Provider</Label>
                <Select onValueChange={v => { /* update upstream */ }}>
                  <SelectTrigger><SelectValue placeholder="Select provider" /></SelectTrigger>
                  <SelectContent>
                    {providers.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div>
              <Label htmlFor="value" className="text-xs uppercase tracking-wider text-[hsl(240deg_6%_8%)]">Value</Label>
              <Textarea id="value" {...register('value')} rows={tab === 'ssh_key' ? 6 : 3} placeholder={tab === 'note' ? 'Your note...' : tab === 'env' ? 'KEY=VALUE\n...' : 'Secret value...'} />
              {errors.value && <p className="text-xs text-[hsl(356deg_62%_56%)] mt-1">{errors.value.message}</p>}
            </div>

            <div>
              <Label htmlFor="note" className="text-xs uppercase tracking-wider text-[hsl(240deg_6%_8%)]">Note (optional)</Label>
              <Input id="note" {...register('note')} placeholder="Additional notes" />
            </div>

            <div>
              <Label htmlFor="expires_at" className="text-xs uppercase tracking-wider text-[hsl(240deg_6%_8%)]">Expiry Date</Label>
              <Input id="expires_at" type="date" {...register('expires_at')} defaultValue={expiryDate} />
            </div>

            <div className="flex gap-2 justify-end pt-2">
              <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button type="submit" disabled={isStoring}>
                <Plus className="h-4 w-4 mr-1.5" /> {isStoring ? 'Storing...' : 'Store'}
              </Button>
            </div>
          </form>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
