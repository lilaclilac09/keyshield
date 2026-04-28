/**
 * OCR Service for Screen Capture
 * Uses Tesseract.js for optical character recognition
 */

import { createWorker } from 'tesseract.js';
import { KeyDetector, DetectedKey } from './key-detector';

export class OCRService {
  private worker: any = null;
  private isInitialized = false;

  /**
   * Initialize Tesseract worker
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      this.worker = await createWorker('eng');
      await this.worker.setParameters({
        tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_=:./',
      });
      this.isInitialized = true;
    } catch (error) {
      console.error('Failed to initialize OCR worker:', error);
      throw error;
    }
  }

  /**
   * Extract text from image
   */
  async extractTextFromImage(imageData: ImageData | HTMLImageElement | HTMLCanvasElement): Promise<string> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      const { data: { text } } = await this.worker.recognize(imageData);
      return text;
    } catch (error) {
      console.error('OCR extraction failed:', error);
      throw error;
    }
  }

  /**
   * Capture visible screen area and extract keys
   */
  async captureScreenAndDetectKeys(domain: string): Promise<DetectedKey[]> {
    try {
      // Request screen capture permission
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { mediaSource: 'screen' } as any,
      });

      // Create video element to capture frame
      const video = document.createElement('video');
      video.srcObject = stream;
      await video.play();

      // Wait for video to be ready
      await new Promise((resolve) => {
        video.onloadedmetadata = resolve;
      });

      // Capture frame
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Failed to get canvas context');

      ctx.drawImage(video, 0, 0);

      // Stop the stream
      stream.getTracks().forEach((track) => track.stop());

      // Extract text using OCR
      const text = await this.extractTextFromImage(canvas);

      // Detect keys from extracted text
      return KeyDetector.detectFromText(text, domain);
    } catch (error) {
      console.error('Screen capture failed:', error);
      throw error;
    }
  }

  /**
   * Extract keys from selected region
   */
  async captureRegionAndDetectKeys(
    x: number,
    y: number,
    width: number,
    height: number,
    domain: string
  ): Promise<DetectedKey[]> {
    try {
      // Create canvas from screen region
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Failed to get canvas context');

      // Note: Direct screen capture of specific region requires
      // additional browser APIs or extension permissions
      // This is a simplified version - in production, you might need
      // to use chrome.tabs.captureVisibleTab or similar APIs

      // For now, we'll use the full screen capture approach
      return this.captureScreenAndDetectKeys(domain);
    } catch (error) {
      console.error('Region capture failed:', error);
      throw error;
    }
  }

  /**
   * Extract text from image file
   */
  async extractFromImageFile(file: File, domain: string): Promise<DetectedKey[]> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = async () => {
        try {
          const text = await this.extractTextFromImage(img);
          const detected = KeyDetector.detectFromText(text, domain);
          resolve(detected);
        } catch (error) {
          reject(error);
        }
      };
      img.onerror = reject;
      img.src = URL.createObjectURL(file);
    });
  }

  /**
   * Cleanup worker
   */
  async terminate(): Promise<void> {
    if (this.worker) {
      await this.worker.terminate();
      this.worker = null;
      this.isInitialized = false;
    }
  }
}
