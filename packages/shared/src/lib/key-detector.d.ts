export interface KeyMatch {
    provider: string;
    value: string;
    confidence: 'high' | 'medium' | 'low';
    offset?: number;
}
export declare function detectKeys(text: string): KeyMatch[];
export declare function scanDomForKeys(root?: Document | Element): KeyMatch[];
//# sourceMappingURL=key-detector.d.ts.map