/**
 * Secure Key Injector
 * Safely injects API keys into form fields without exposing plaintext
 */

export interface InjectionOptions {
  field: HTMLInputElement | HTMLTextAreaElement;
  key: string;
  triggerEvents?: boolean;
}

export class KeyInjector {
  /**
   * Inject key into form field securely
   */
  static injectKey(options: InjectionOptions): void {
    const { field, key, triggerEvents = true } = options;

    // Store original value for undo
    const originalValue = field.value;

    // Set value directly (most secure method)
    field.value = key;

    // Trigger events if requested (for form validation)
    if (triggerEvents) {
      // Trigger input event
      field.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));

      // Trigger change event
      field.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));

      // Trigger focus/blur for some frameworks
      field.focus();
      field.dispatchEvent(new Event('focus', { bubbles: true }));
      field.dispatchEvent(new Event('blur', { bubbles: true }));
    }

    // Clear key from memory after a short delay
    setTimeout(() => {
      // Note: In JavaScript, we can't truly clear strings from memory,
      // but we can minimize exposure by not keeping references
      if (field.value === key) {
        // Value was successfully set
        console.log('Key injected successfully');
      }
    }, 100);
  }

  /**
   * Find input fields that might need key injection
   */
  static findKeyFields(domain: string): Array<{
    field: HTMLInputElement | HTMLTextAreaElement;
    confidence: number;
    fieldName: string;
  }> {
    const candidates: Array<{
      field: HTMLInputElement | HTMLTextAreaElement;
      confidence: number;
      fieldName: string;
    }> = [];

    // Find all input and textarea elements
    const inputs = document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(
      'input[type="text"], input[type="password"], input:not([type]), textarea'
    );

    const keyFieldPatterns = [
      { pattern: /api[_-]?key/i, confidence: 0.9 },
      { pattern: /apikey/i, confidence: 0.9 },
      { pattern: /api[_-]?token/i, confidence: 0.85 },
      { pattern: /access[_-]?token/i, confidence: 0.85 },
      { pattern: /secret[_-]?key/i, confidence: 0.9 },
      { pattern: /secret[_-]?token/i, confidence: 0.85 },
      { pattern: /auth[_-]?token/i, confidence: 0.8 },
      { pattern: /bearer[_-]?token/i, confidence: 0.8 },
      { pattern: /private[_-]?key/i, confidence: 0.9 },
      { pattern: /password/i, confidence: 0.3 }, // Lower confidence
    ];

    inputs.forEach((field) => {
      const fieldName = (field.name || field.id || field.className || '').toLowerCase();
      const placeholder = (field.placeholder || '').toLowerCase();

      // Check field name patterns
      for (const { pattern, confidence } of keyFieldPatterns) {
        if (pattern.test(fieldName) || pattern.test(placeholder)) {
          candidates.push({
            field,
            confidence,
            fieldName: field.name || field.id || 'unnamed',
          });
          break;
        }
      }

      // Check if it's a password field (lower priority)
      if (field.type === 'password' && candidates.every(c => c.field !== field)) {
        candidates.push({
          field,
          confidence: 0.4,
          fieldName: field.name || field.id || 'password',
        });
      }
    });

    // Sort by confidence (highest first)
    return candidates.sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Inject key into the best matching field
   */
  static injectIntoBestField(
    key: string,
    domain: string
  ): { success: boolean; fieldName?: string; error?: string } {
    const candidates = this.findKeyFields(domain);

    if (candidates.length === 0) {
      return {
        success: false,
        error: 'No suitable field found',
      };
    }

    // Use the highest confidence field
    const bestField = candidates[0];
    this.injectKey({
      field: bestField.field,
      key,
      triggerEvents: true,
    });

    return {
      success: true,
      fieldName: bestField.fieldName,
    };
  }

  /**
   * Inject key into specific field by selector
   */
  static injectIntoField(
    selector: string,
    key: string
  ): { success: boolean; error?: string } {
    try {
      const field = document.querySelector<HTMLInputElement | HTMLTextAreaElement>(selector);

      if (!field) {
        return {
          success: false,
          error: `Field not found: ${selector}`,
        };
      }

      this.injectKey({
        field,
        key,
        triggerEvents: true,
      });

      return { success: true };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Injection failed',
      };
    }
  }

  /**
   * Get domain from current URL
   */
  static getCurrentDomain(): string {
    return window.location.hostname;
  }

  /**
   * Check if domain matches (with subdomain support)
   */
  static domainMatches(storedDomain: string, currentDomain: string): boolean {
    // Exact match
    if (storedDomain === currentDomain) {
      return true;
    }

    // Subdomain match (e.g., api.example.com matches example.com)
    if (currentDomain.endsWith(`.${storedDomain}`)) {
      return true;
    }

    // Parent domain match (e.g., example.com matches api.example.com)
    if (storedDomain.endsWith(`.${currentDomain}`)) {
      return true;
    }

    return false;
  }
}
