'use strict';

const fs = require('node:fs');
const { verifyRegistrationResponse, verifyAuthenticationResponse } = require('@simplewebauthn/server');

function createApprovalPasskey({ file, origin = 'https://app.ks.aileena.xyz' } = {}) {
  const rpId = new URL(origin).hostname;
  let pin = null;
  let queue = Promise.resolve();
  if (file && fs.existsSync(file)) {
    const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (saved.origin !== origin || saved.rpId !== rpId || !saved.credentialId ||
        !saved.publicKey || !Number.isSafeInteger(saved.counter) || saved.counter < 0) {
      throw new Error('invalid_approval_pin');
    }
    pin = saved;
  }
  function save(next) {
    if (file) {
      fs.writeFileSync(`${file}.new`, JSON.stringify(next), { mode: 0o600 });
      fs.renameSync(`${file}.new`, file);
    }
    pin = next;
  }
  function serial(action) {
    const result = queue.then(action);
    queue = result.catch(() => {});
    return result;
  }
  return {
    get() { return pin && { ...pin }; },
    register(response, expectedChallenge) {
      return serial(async () => {
        if (pin) throw new Error('approval_passkey_already_pinned');
        const result = await verifyRegistrationResponse({
          response, expectedChallenge, expectedOrigin: origin, expectedRPID: rpId,
          requireUserVerification: true,
        });
        if (!result.verified || !result.registrationInfo) throw new Error('approval_registration_refused');
        const { credential } = result.registrationInfo;
        save({ credentialId: credential.id, publicKey: Buffer.from(credential.publicKey).toString('base64url'),
          counter: credential.counter, rpId, origin });
      });
    },
    verify(response, expectedChallenge) {
      return serial(async () => {
        if (!pin) throw new Error('approval_passkey_not_pinned');
        if (!response || response.id !== pin.credentialId || response.rawId !== pin.credentialId) {
          throw new Error('approval_assertion_refused');
        }
        const result = await verifyAuthenticationResponse({
          response, expectedChallenge, expectedOrigin: pin.origin, expectedRPID: pin.rpId,
          credential: { id: pin.credentialId, publicKey: new Uint8Array(Buffer.from(pin.publicKey, 'base64url')), counter: pin.counter },
          requireUserVerification: true,
        });
        if (!result.verified) throw new Error('approval_assertion_refused');
        save({ ...pin, counter: result.authenticationInfo.newCounter });
      });
    },
  };
}

module.exports = { createApprovalPasskey };
