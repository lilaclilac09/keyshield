import type { BrowserContext, Page } from '@playwright/test';

export async function virtualPrfAuthenticator(context: BrowserContext, page: Page) {
  // Mock boundary: Chrome's CDP virtual authenticator replaces physical hardware
  // and user touch only. Chrome computes PRF and signs real WebAuthn challenges.
  const cdp = await context.newCDPSession(page);
  await cdp.send('WebAuthn.enable');
  await cdp.send('WebAuthn.addVirtualAuthenticator', {
    options: {
      protocol: 'ctap2', ctap2Version: 'ctap2_1', transport: 'internal',
      hasResidentKey: true, hasUserVerification: true, isUserVerified: true,
      automaticPresenceSimulation: true, hasPrf: true,
    },
  });
  return cdp;
}

export async function bridgeWebAuthnGet(source: Page, target: Page) {
  // Mock boundary: tab B forwards get() to tab A's virtual authenticator.
  // No fabricated assertion, PRF output, auth response, or sync response.
  await target.exposeBinding('__tutorialWebAuthnGet', async (_, publicKey) => source.evaluate(async opts => {
    opts.challenge = new Uint8Array(opts.challenge).buffer;
    opts.allowCredentials = opts.allowCredentials?.map((c: { id: number[] }) => ({ ...c, id: new Uint8Array(c.id).buffer }));
    if (opts.extensions?.prf?.eval) {
      opts.extensions.prf.eval.first = new Uint8Array(opts.extensions.prf.eval.first).buffer;
    }
    const credential = await navigator.credentials.get({ publicKey: opts }) as PublicKeyCredential;
    const response = credential.response as AuthenticatorAssertionResponse;
    const extensions = credential.getClientExtensionResults() as { prf?: { results?: { first: ArrayBuffer } } };
    const bytes = (value: ArrayBuffer | null) => value ? Array.from(new Uint8Array(value)) : null;
    return {
      id: credential.id, rawId: bytes(credential.rawId), type: credential.type,
      authenticatorAttachment: credential.authenticatorAttachment,
      response: {
        authenticatorData: bytes(response.authenticatorData), clientDataJSON: bytes(response.clientDataJSON),
        signature: bytes(response.signature), userHandle: bytes(response.userHandle),
      },
      prf: extensions.prf?.results ? bytes(extensions.prf.results.first) : null,
    };
  }, publicKey));
  await target.addInitScript(() => {
    navigator.credentials.get = async options => {
      const opts = options!.publicKey!;
      const bytes = (value: BufferSource) => Array.from(new Uint8Array(
        value instanceof ArrayBuffer ? value : value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength),
      ));
      const prf = (opts.extensions as { prf?: { eval?: { first: BufferSource } } })?.prf;
      const result = await (window as unknown as {
        __tutorialWebAuthnGet: (opts: unknown) => Promise<{
          id: string; type: string; rawId: number[]; authenticatorAttachment: string | null;
          response: Record<string, number[] | null>; prf: number[] | null;
        }>;
      }).__tutorialWebAuthnGet({
        ...opts, challenge: bytes(opts.challenge),
        allowCredentials: opts.allowCredentials?.map(c => ({ ...c, id: bytes(c.id) })),
        extensions: prf?.eval ? { ...opts.extensions, prf: { eval: { first: bytes(prf.eval.first) } } } : opts.extensions,
      });
      const buffer = (value: number[] | null) => value ? new Uint8Array(value).buffer : null;
      return {
        ...result, rawId: buffer(result.rawId),
        response: Object.fromEntries(Object.entries(result.response).map(([key, value]) => [key, buffer(value)])),
        getClientExtensionResults: () => result.prf ? { prf: { results: { first: buffer(result.prf) } } } : {},
      } as unknown as PublicKeyCredential;
    };
  });
}
