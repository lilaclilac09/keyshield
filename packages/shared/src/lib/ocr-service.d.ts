import type { KeyMatch } from './key-detector';
export declare function ocrImage(fileOrUrl: File | string): Promise<{
    text: string;
    confidence: number;
}>;
export declare function captureScreenAndOcr(): Promise<{
    text: string;
    confidence: number;
}>;
export declare function ocrAndDetectKeys(fileOrUrl: File | string): Promise<KeyMatch[]>;
//# sourceMappingURL=ocr-service.d.ts.map