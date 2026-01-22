/**
 * Save Dialog Overlay
 * 
 * In-page overlay dialog that appears when API keys are detected.
 * Non-intrusive, positioned in bottom-right corner with slide-in animation.
 */

import { DetectedKey } from '../lib/key-detector';

export interface SaveDialogOptions {
  detectedKey: DetectedKey;
  onSave: () => void;
  onDismiss: () => void;
  onDontAskAgain?: (domain: string) => void;
}

export class SaveDialog {
  private overlay: HTMLElement | null = null;
  private dialog: HTMLElement | null = null;
  private options: SaveDialogOptions | null = null;
  private autoDismissTimer: number | null = null;

  /**
   * Show save dialog overlay
   */
  show(options: SaveDialogOptions): void {
    try {
      // Remove existing dialog if any
      this.hide();

      this.options = options;
      const { detectedKey } = options;

      console.log('[KeyShield SaveDialog] Showing dialog for key type:', detectedKey.key.substring(0, 10) + '...');

    // Create overlay backdrop
    this.overlay = document.createElement('div');
    this.overlay.id = 'keyshield-save-dialog-overlay';
    this.overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.3);
      z-index: 999998;
      pointer-events: none;
    `;

    // Create dialog container
    this.dialog = document.createElement('div');
    this.dialog.id = 'keyshield-save-dialog';
    this.dialog.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      width: 380px;
      max-width: calc(100vw - 40px);
      background: linear-gradient(135deg, #1a1a1a 0%, #0a0a0a 100%);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 12px;
      padding: 20px;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(139, 92, 246, 0.3);
      z-index: 999999;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      color: #e0e0e0;
      transform: translateY(100px);
      opacity: 0;
      transition: transform 0.3s ease-out, opacity 0.3s ease-out;
      pointer-events: auto;
    `;

    // Get key type info
    const keyType = this.detectKeyType(detectedKey.key, detectedKey.fieldName);
    const keyTypeInfo = this.getKeyTypeInfo(keyType);

    // Mask key preview (first 4 chars + "...")
    const maskedKey = this.maskKey(detectedKey.key);

    // Build dialog HTML
    this.dialog.innerHTML = `
      <div style="display: flex; align-items: flex-start; gap: 12px; margin-bottom: 16px;">
        <div style="
          width: 40px;
          height: 40px;
          background: ${keyTypeInfo.color}20;
          border: 1px solid ${keyTypeInfo.color}40;
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        ">
          <span style="font-size: 20px;">${keyTypeInfo.icon}</span>
        </div>
        <div style="flex: 1; min-width: 0;">
          <div style="
            font-size: 16px;
            font-weight: 600;
            margin-bottom: 4px;
            color: #fff;
          ">API Key Detected</div>
          <div style="
            font-size: 12px;
            color: #888;
            margin-bottom: 8px;
          ">${keyTypeInfo.name} • ${this.formatSource(detectedKey.source)}</div>
          <div style="
            font-family: 'Monaco', 'Menlo', 'Courier New', monospace;
            font-size: 11px;
            color: #aaa;
            background: rgba(0, 0, 0, 0.3);
            padding: 6px 8px;
            border-radius: 4px;
            word-break: break-all;
          ">${maskedKey}</div>
        </div>
        <button id="keyshield-dialog-close" style="
          background: transparent;
          border: none;
          color: #888;
          cursor: pointer;
          padding: 4px;
          font-size: 18px;
          line-height: 1;
          transition: color 0.2s;
        ">×</button>
      </div>

      <div style="
        font-size: 11px;
        color: #666;
        margin-bottom: 16px;
        padding: 8px;
        background: rgba(139, 92, 246, 0.1);
        border-radius: 6px;
        border: 1px solid rgba(139, 92, 246, 0.2);
      ">
        <strong style="color: #a78bfa;">KeyShield</strong> detected an API key. Save it to your encrypted vault?
      </div>

      <div style="display: flex; gap: 8px; margin-bottom: 12px;">
        <button id="keyshield-dialog-save" style="
          flex: 1;
          padding: 10px 16px;
          background: linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%);
          border: none;
          border-radius: 6px;
          color: white;
          font-weight: 600;
          font-size: 13px;
          cursor: pointer;
          transition: transform 0.2s, box-shadow 0.2s;
        ">Save to Vault</button>
        <button id="keyshield-dialog-dismiss" style="
          padding: 10px 16px;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 6px;
          color: #ccc;
          font-weight: 500;
          font-size: 13px;
          cursor: pointer;
          transition: background 0.2s;
        ">Dismiss</button>
      </div>

      <label style="
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 11px;
        color: #888;
        cursor: pointer;
        user-select: none;
      ">
        <input type="checkbox" id="keyshield-dialog-dont-ask" style="
          width: 14px;
          height: 14px;
          cursor: pointer;
        ">
        <span>Don't ask again for ${this.getDomain()}</span>
      </label>
    `;

      // Append to body
      if (!document.body) {
        console.error('[KeyShield SaveDialog] document.body is null');
        return;
      }
      document.body.appendChild(this.overlay);
      document.body.appendChild(this.dialog);

      // Animate in
      requestAnimationFrame(() => {
        if (this.dialog) {
          this.dialog.style.transform = 'translateY(0)';
          this.dialog.style.opacity = '1';
          console.log('[KeyShield SaveDialog] Dialog shown successfully');
        }
      });
    } catch (error) {
      console.error('[KeyShield SaveDialog] Error showing dialog:', error);
    }

    // Add event listeners
    this.attachEventListeners();

    // Auto-dismiss after 30 seconds
    this.autoDismissTimer = window.setTimeout(() => {
      this.hide();
    }, 30000);
  }

  /**
   * Hide save dialog overlay
   */
  hide(): void {
    if (this.autoDismissTimer) {
      clearTimeout(this.autoDismissTimer);
      this.autoDismissTimer = null;
    }

    if (this.dialog) {
      // Animate out
      this.dialog.style.transform = 'translateY(100px)';
      this.dialog.style.opacity = '0';
      
      setTimeout(() => {
        if (this.dialog && this.dialog.parentNode) {
          this.dialog.parentNode.removeChild(this.dialog);
        }
        if (this.overlay && this.overlay.parentNode) {
          this.overlay.parentNode.removeChild(this.overlay);
        }
        this.dialog = null;
        this.overlay = null;
        this.options = null;
      }, 300);
    }
  }

  /**
   * Attach event listeners to dialog buttons
   */
  private attachEventListeners(): void {
    if (!this.dialog || !this.options) return;

    // Save button
    const saveBtn = this.dialog.querySelector('#keyshield-dialog-save');
    if (saveBtn) {
      saveBtn.addEventListener('click', () => {
        this.options?.onSave();
        this.hide();
      });
      saveBtn.addEventListener('mouseenter', () => {
        (saveBtn as HTMLElement).style.transform = 'translateY(-1px)';
        (saveBtn as HTMLElement).style.boxShadow = '0 4px 12px rgba(139, 92, 246, 0.4)';
      });
      saveBtn.addEventListener('mouseleave', () => {
        (saveBtn as HTMLElement).style.transform = 'translateY(0)';
        (saveBtn as HTMLElement).style.boxShadow = 'none';
      });
    }

    // Dismiss button
    const dismissBtn = this.dialog.querySelector('#keyshield-dialog-dismiss');
    if (dismissBtn) {
      dismissBtn.addEventListener('click', () => {
        const dontAskCheckbox = this.dialog?.querySelector('#keyshield-dialog-dont-ask') as HTMLInputElement;
        if (dontAskCheckbox?.checked && this.options?.onDontAskAgain) {
          this.options.onDontAskAgain(this.getDomain());
        }
        this.options?.onDismiss();
        this.hide();
      });
      dismissBtn.addEventListener('mouseenter', () => {
        (dismissBtn as HTMLElement).style.background = 'rgba(255, 255, 255, 0.1)';
      });
      dismissBtn.addEventListener('mouseleave', () => {
        (dismissBtn as HTMLElement).style.background = 'rgba(255, 255, 255, 0.05)';
      });
    }

    // Close button
    const closeBtn = this.dialog.querySelector('#keyshield-dialog-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        this.options?.onDismiss();
        this.hide();
      });
      closeBtn.addEventListener('mouseenter', () => {
        (closeBtn as HTMLElement).style.color = '#fff';
      });
      closeBtn.addEventListener('mouseleave', () => {
        (closeBtn as HTMLElement).style.color = '#888';
      });
    }

    // Click overlay to dismiss
    if (this.overlay) {
      this.overlay.addEventListener('click', (e) => {
        if (e.target === this.overlay) {
          this.options?.onDismiss();
          this.hide();
        }
      });
    }
  }

  /**
   * Detect key type from key string and field name
   */
  private detectKeyType(key: string, fieldName?: string): 'github' | 'helius' | 'gemini' | 'generic' {
    const lowerFieldName = (fieldName || '').toLowerCase();
    
    if (/helius/.test(lowerFieldName)) {
      return 'helius';
    }
    if (/gemini/.test(lowerFieldName) || /google.*ai/.test(lowerFieldName)) {
      return 'gemini';
    }
    if (/github/.test(lowerFieldName)) {
      return 'github';
    }
    
    // Check key patterns
    if (/^ghp_|^gho_|^ghu_|^ghs_|^ghr_/.test(key)) {
      return 'github';
    }
    if (/^AIza/.test(key)) {
      return 'gemini';
    }
    if (/^[a-zA-Z0-9]{32,64}$/.test(key) && !/^AIza/.test(key)) {
      return 'helius';
    }
    
    return 'generic';
  }

  /**
   * Get key type info (icon, color, name)
   */
  private getKeyTypeInfo(type: 'github' | 'helius' | 'gemini' | 'generic'): {
    icon: string;
    color: string;
    name: string;
  } {
    switch (type) {
      case 'github':
        return { icon: '🔑', color: '#24292e', name: 'GitHub Token' };
      case 'helius':
        return { icon: '⚡', color: '#8b5cf6', name: 'Helius API Key' };
      case 'gemini':
        return { icon: '🤖', color: '#4285f4', name: 'Google Gemini Key' };
      default:
        return { icon: '🔐', color: '#666', name: 'API Key' };
    }
  }

  /**
   * Mask key for preview (first 4 chars + "...")
   */
  private maskKey(key: string): string {
    if (key.length <= 8) {
      return '•'.repeat(key.length);
    }
    return key.slice(0, 4) + '...' + key.slice(-4);
  }

  /**
   * Format source for display
   */
  private formatSource(source: string): string {
    switch (source) {
      case 'form':
        return 'Form field';
      case 'clipboard':
        return 'Clipboard';
      case 'ocr':
        return 'Screen capture';
      default:
        return source;
    }
  }

  /**
   * Get current domain
   */
  private getDomain(): string {
    return window.location.hostname;
  }
}

// Export singleton instance
export const saveDialog = new SaveDialog();
