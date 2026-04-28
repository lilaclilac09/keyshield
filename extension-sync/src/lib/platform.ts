/**
 * Browser/platform feature detection for the Path A flow.
 *
 * The whole sync model breaks down on a browser that doesn't support
 * the WebAuthn PRF extension — without PRF we can't derive the cross-
 * device master key and would have to silently regress to a Path-A
 * impostor that pretends to sync but actually re-prompts on every
 * device. Better to detect that up front and show an UpgradeScreen.
 *
 * The runtime probe lives behind an injectable `PlatformProbe`
 * interface so tests can simulate any combination of:
 *   - no PublicKeyCredential at all (very old browsers)
 *   - PublicKeyCredential exists but no getClientCapabilities
 *     (Chrome <130, Safari <18 — they may still support PRF; we
 *      just can't tell without trying)
 *   - getClientCapabilities returns explicit { 'extension:prf': true/false }
 */

export type PrfSupport = 'supported' | 'unsupported' | 'unknown';

export interface PlatformProbe {
  /** True iff `globalThis.PublicKeyCredential` exists. */
  hasPublicKeyCredential: boolean;
  /**
   * Wraps `PublicKeyCredential.getClientCapabilities()` if available.
   * Undefined on older browsers — caller should treat that as
   * "unknown PRF support" rather than "unsupported".
   */
  getClientCapabilities?: () => Promise<Record<string, boolean | undefined>>;
}

/** Default probe wired against the live browser globals. */
export function browserPlatformProbe(): PlatformProbe {
  const pkc = (globalThis as any).PublicKeyCredential;
  return {
    hasPublicKeyCredential: typeof pkc !== 'undefined',
    getClientCapabilities:
      typeof pkc?.getClientCapabilities === 'function'
        ? () => pkc.getClientCapabilities()
        : undefined,
  };
}

/**
 * Best-effort runtime check for PRF support. Returns 'unknown' on
 * older browsers that don't expose the capabilities API; the caller
 * should treat that as "let the user try and surface a clearer error
 * if PRF really isn't there at unlock time".
 */
export async function detectPrfSupport(
  probe: PlatformProbe = browserPlatformProbe(),
): Promise<PrfSupport> {
  if (!probe.hasPublicKeyCredential) return 'unsupported';
  if (!probe.getClientCapabilities) return 'unknown';
  try {
    const caps = await probe.getClientCapabilities();
    // Spec uses 'extension:prf'; some early Chrome versions used
    // 'extensionPrf'. Accept either.
    const prf = caps['extension:prf'] ?? (caps as any).extensionPrf;
    if (prf === true) return 'supported';
    if (prf === false) return 'unsupported';
    return 'unknown';
  } catch {
    return 'unknown';
  }
}

/**
 * Plain-English upgrade message shown by `UpgradeScreen`. Kept here
 * so tests can assert on it without scraping JSX.
 */
export function getUpgradeMessage(): string {
  return (
    'KeyShield needs a passkey-capable browser with PRF support. ' +
    'Please use Safari 17+, Chrome 116+, or Firefox 119+ on a device ' +
    'with biometric or PIN unlock.'
  );
}
