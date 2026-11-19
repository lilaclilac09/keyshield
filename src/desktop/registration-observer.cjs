'use strict';

const crypto = require('node:crypto');

function createRegistrationObserver({ apiOrigin, origin, now = Date.now }) {
  let pending = null;
  let session = null;
  let generation = 0;
  const rpId = new URL(origin).hostname;
  const digest = (value) => crypto.createHash('sha256').update(value).digest('hex');
  return {
    async observe(request, forward) {
      const url = new URL(request.url);
      if (url.origin !== apiOrigin) return forward(request);
      const token = request.headers.get('authorization');
      const identity = token ? digest(token) : null;
      if (identity && session !== identity) { pending = null; session = identity; generation++; }
      const registering = url.pathname === '/auth/passkey/register-options' && request.method === 'GET';
      if (registering) { pending = null; generation++; }
      const issuedGeneration = generation;
      const response = await forward(request);
      if (registering && issuedGeneration === generation) {
        if (response.ok && identity && request.headers.get('origin') === origin) {
          try {
            const options = await response.clone().json();
            if (typeof options.challenge === 'string' && options.challenge &&
                typeof options.user?.id === 'string' && options.user.id && options.rp?.id === rpId) {
              pending = { challenge: options.challenge, accountId: options.user.id,
                session: identity, generation: issuedGeneration, expiresAt: now() + 120000 };
            }
          } catch { /* unobservable registration stays unavailable */ }
        }
      }
      return response;
    },
    consume(response) {
      const record = pending;
      pending = null;
      if (!record || now() >= record.expiresAt || record.session !== session) throw new Error('approval_registration_unavailable');
      let data;
      try { data = JSON.parse(Buffer.from(response.response.clientDataJSON, 'base64url').toString()); } catch {}
      if (!data || data.type !== 'webauthn.create' || data.challenge !== record.challenge || data.origin !== origin) {
        throw new Error('approval_registration_unavailable');
      }
      return { challenge: record.challenge, accountId: record.accountId,
        isCurrent: () => generation === record.generation && session === record.session };
    },
    invalidate() { pending = null; session = null; generation++; },
  };
}

module.exports = { createRegistrationObserver };
