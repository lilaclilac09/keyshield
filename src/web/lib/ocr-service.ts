/**
 * OCR Service for Screen Capture
 * Uses tesseract.js for optical character recognition.
 * Ported from disabled_extension/src/lib/ocr-service.ts
 * The Tesseract worker is lazy-loaded on first use to avoid large bundle impact.
 */

import { KeyDetector, type DetectedKey } from './key-detector';

export class OCRService {
  private worker: any = null;
  private isInitialized = false;

  /**
   * Lazy-initialize the Tesseract worker. Called automatically before first recognition.
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      // Dynamic import so the large Tesseract bundle is only loaded when OCR is used.
      const { createWorker } = await import('tesseract.js');
      this.worker = await createWorker('eng');
      await this.worker.setParameters({
        // Restrict character set to characters commonly found in API keys.
        tessedit_char_whitelist:
          'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_=:./',
      });
      this.isInitialized = true;
    } catch (error) {
      console.error('[KeyShield] Failed to initialize OCR worker:', error);
      throw error;
    }
  }

  /**
   * Run OCR on an image element or canvas and return raw text.
   */
  async extractTextFromImage(
    imageData: ImageData | HTMLImageElement | HTMLCanvasElement,
  ): Promise<string> {
    if (!this.isInitialized) await this.initialize();

    try {
      const { data: { text } } = await this.worker.recognize(imageData);
      return text;
    } catch (error) {
      console.error('[KeyShield] OCR extraction failed:', error);
      throw error;
    }
  }

  /**
   * Prompt the user for screen-capture permission, grab one frame, and return
   * any API keys found via OCR + pattern matching.
   */
  async captureScreenAndDetectKeys(domain: string): Promise<DetectedKey[]> {
    // getDisplayMedia is only available in secure contexts (HTTPS / extension popup).
    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: { mediaSource: 'screen' } as any,
    });

    try {
      const video = document.createElement('video');
      video.srcObject = stream;

      // Must call play() before metadata is available.
      await video.play();
      await new Promise<void>((resolve) => {
        video.onloadedmetadata = () => resolve();
      });

      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('[KeyShield] Failed to get canvas context');
      ctx.drawImage(video, 0, 0);

      const text = await this.extractTextFromImage(canvas);
      return KeyDetector.detectFromText(text, domain);
    } finally {
      // Always stop the capture stream — never leave it running.
      stream.getTracks().forEach((track) => track.stop());
    }
  }

  /**
   * Run OCR on a user-supplied image File and return detected keys.
   */
  async extractFromImageFile(file: File, domain: string): Promise<DetectedKey[]> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = async () => {
        try {
          const text = await this.extractTextFromImage(img);
          resolve(KeyDetector.detectFromText(text, domain));
        } catch (error) {
          reject(error);
        } finally {
          URL.revokeObjectURL(img.src);
        }
      };
      img.onerror = reject;
      img.src = URL.createObjectURL(file);
    });
  }

  /**
   * Terminate the Tesseract worker and free memory.
   */
  async terminate(): Promise<void> {
    if (this.worker) {
      await this.worker.terminate();
      this.worker = null;
      this.isInitialized = false;
    }
  }
}

// Singleton for use across the extension popup lifetime.
export const ocrService = new OCRService();
