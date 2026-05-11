
import type { KeyMatch } from './key-detector';

let tesseract: typeof import('tesseract.js') | null = null;

async function loadTesseract() {
  if (!tesseract) {
    tesseract = await import('tesseract.js');
  }
  return tesseract;
}

export async function ocrImage(fileOrUrl: File | string): Promise<{ text: string; confidence: number }> {
  const T = await loadTesseract();

  let imageSource: string | File = fileOrUrl;

  const result = await T.recognize(imageSource, 'eng', {
    logger: () => {}, // silent
  });

  return {
    text: result.data.text,
    confidence: result.data.confidence,
  };
}

// ImageCapture is a WICG API not yet in TypeScript's DOM lib
declare class ImageCapture {
  constructor(track: MediaStreamTrack);
  grabFrame(): Promise<ImageBitmap>;
  takePhoto(photoSettings?: object): Promise<Blob>;
}

interface ImageCaptureWithGrab extends ImageCapture {
  grabFrame(): Promise<ImageBitmap>;
}

export async function captureScreenAndOcr(): Promise<{ text: string; confidence: number }> {
  try {
    const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
    const track = stream.getVideoTracks()[0];
    const imageCapture = new ImageCapture(track) as ImageCaptureWithGrab;
    const bitmap = await imageCapture.grabFrame();

    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(bitmap, 0, 0);

    track.stop();
    stream.getTracks().forEach((t) => t.stop());

    const blob = await new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b!), 'image/png'));
    const file = new File([blob], 'screenshot.png', { type: 'image/png' });
    return ocrImage(file);
  } catch (err) {
    throw new Error(`Screen capture failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

export async function ocrAndDetectKeys(fileOrUrl: File | string): Promise<KeyMatch[]> {
  const { text } = await ocrImage(fileOrUrl);
  const { detectKeys } = await import('./key-detector');
  return detectKeys(text);
}
