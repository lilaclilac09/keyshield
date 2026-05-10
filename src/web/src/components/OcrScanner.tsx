import { useState } from 'react';
import { Scan, Upload, Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, Button, Card, Badge } from '@keyshield/ui';
import type { KeyMatch } from '@keyshield/shared/lib/key-detector';

interface Props { open: boolean; onOpenChange: (open: boolean) => void }

export function OcrScanner({ open, onOpenChange }: Props) {
  const [scanning, setScanning] = useState(false);
  const [results, setResults] = useState<KeyMatch[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function handleScreenCapture() {
    try {
      setScanning(true);
      setError(null);
      const { captureScreenAndOcr } = await import('@keyshield/shared/lib/ocr-service');
      const { text } = await captureScreenAndOcr();
      const { detectKeys } = await import('@keyshield/shared/lib/key-detector');
      const keys = detectKeys(text);
      setResults(keys);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'OCR failed');
    } finally {
      setScanning(false);
    }
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setScanning(true);
      setError(null);
      const { ocrAndDetectKeys } = await import('@keyshield/shared/lib/ocr-service');
      const keys = await ocrAndDetectKeys(file);
      setResults(keys);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'OCR failed');
    } finally {
      setScanning(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-[hsl(240deg_5%_89%)]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Scan className="h-5 w-5" /> OCR Scanner</DialogTitle>
          <DialogDescription>Capture your screen or upload an image to detect API keys</DialogDescription>
        </DialogHeader>

        <div className="flex gap-2 mt-4">
          <Button onClick={handleScreenCapture} disabled={scanning} className="flex-1">
            {scanning ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Scan className="h-4 w-4 mr-2" />}
            {scanning ? 'Scanning...' : 'Capture Screen'}
          </Button>
          <label className="flex-1">
            <input type="file" accept="image/*" className="hidden" onChange={handleFileUpload} />
            <Button variant="secondary" className="w-full cursor-pointer">{scanning ? 'Scanning...' : 'Upload Image'}</Button>
          </label>
        </div>

        {error && <p className="text-sm text-[hsl(356deg_62%_56%)] mt-2">{error}</p>}

        {results.length > 0 && (
          <div className="mt-4 space-y-2 max-h-64 overflow-y-auto">
            <p className="text-sm font-medium">Detected {results.length} key(s):</p>
            {results.map((r, i) => (
              <Card key={i} className="p-3 border-[hsl(240deg_5%_89%)] shadow-xs">
                <div className="flex items-center justify-between">
                  <Badge variant={r.confidence === 'high' ? 'default' : r.confidence === 'medium' ? 'warning' : 'secondary'}>{r.provider}</Badge>
                  <span className="text-xs text-[hsl(240deg_4%_46%)]">{r.confidence} confidence</span>
                </div>
                <code className="text-xs font-mono mt-2 block break-all text-[hsl(240deg_6%_8%)] bg-[hsl(240deg_5%_96%)] px-2 py-1 rounded">{r.value.slice(0, 20)}...{r.value.slice(-8)}</code>
              </Card>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
