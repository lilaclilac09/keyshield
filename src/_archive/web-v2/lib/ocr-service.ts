import { KeyDetector, type DetectedKey } from './key-detector';

export class OCRService {
  private worker: any = null;
  private isInitialized = false;

  async initialize(): Promise<void> {
    if (this.isInitialized) return;
    const { createWorker } = await import('tesseract.js');
    this.worker = await createWorker('eng');
    await this.worker.setParameters({ tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_=:./' });
    this.isInitialized = true;
  }

  async extractTextFromImage(imageData: ImageData | HTMLImageElement | HTMLCanvasElement): Promise<string> {
    if (!this.isInitialized) await this.initialize();
    const { data: { text } } = await this.worker.recognize(imageData);
    return text;
  }

  async captureScreenAndDetectKeys(domain: string): Promise<DetectedKey[]> {
    const stream = await navigator.mediaDevices.getDisplayMedia({ video: { mediaSource: 'screen' } as any });
    try {
      const video = document.createElement('video');
      video.srcObject = stream;
      await video.play();
      await new Promise<void>((resolve) => { video.onloadedmetadata = () => resolve(); });
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth; canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('No canvas context');
      ctx.drawImage(video, 0, 0);
      const text = await this.extractTextFromImage(canvas);
      return KeyDetector.detectFromText(text, domain);
    } finally { stream.getTracks().forEach((track) => track.stop()); }
  }

  async extractFromImageFile(file: File, domain: string): Promise<DetectedKey[]> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = async () => { try { const text = await this.extractTextFromImage(img); resolve(KeyDetector.detectFromText(text, domain)); } catch (e) { reject(e); } finally { URL.revokeObjectURL(img.src); } };
      img.onerror = reject;
      img.src = URL.createObjectURL(file);
    });
  }

  async terminate(): Promise<void> { if (this.worker) { await this.worker.terminate(); this.worker = null; this.isInitialized = false; } }
}

export const ocrService = new OCRService();
