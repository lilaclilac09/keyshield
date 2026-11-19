'use strict';

const fs = require('node:fs');
const { verifyRegistrationResponse, verifyAuthenticationResponse } = require('@simplewebauthn/server');

function createApprovalPasskey({ file, origin = 'https://app.ks.aileena.xyz', confirmEnrollment = async () => false } = {}) {
  const rpId = new URL(origin).hostname;
  let pin = null;
  let occupied = Boolean(file && fs.existsSync(file));
  let queue = Promise.resolve();
  if (occupied) {
    try {
      const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (saved.origin === origin && saved.rpId === rpId && saved.credentialId && saved.publicKey &&
          Number.isSafeInteger(saved.counter) && saved.counter >= 0 && typeof saved.accountId === 'string' && saved.accountId &&
          saved.enrollment === 'main-confirmed-v1') pin = saved;
    } catch { /* invalid existing pins remain unavailable and cannot be replaced */ }
  }
  function save(next) {
    if (file) {
      fs.writeFileSync(`${file}.new`, JSON.stringify(next), { mode: 0o600 });
      fs.renameSync(`${file}.new`, file);
    }
    pin = next;
    occupied = true;
  }
  function serial(action) {
    const result = queue.then(action);
    queue = result.catch(() => {});
    return result;
  }
  return {
    get() { return pin && { ...pin }; },
    register(response, expectedChallenge, accountId, isCurrent = () => true) {
      return serial(async () => {
        if (occupied) throw new Error('approval_passkey_already_pinned');
        if (typeof accountId !== 'string' || !accountId) throw new Error('approval_registration_unavailable');
        const result = await verifyRegistrationResponse({
          response, expectedChallenge, expectedOrigin: origin, expectedRPID: rpId,
          requireUserVerification: true,
        });
        if (!result.verified || !result.registrationInfo || !isCurrent()) throw new Error('approval_registration_refused');
        const { credential } = result.registrationInfo;
        if (!await confirmEnrollment({ credentialId: credential.id }) || !isCurrent()) throw new Error('approval_confirmation_refused');
        save({ credentialId: credential.id, publicKey: Buffer.from(credential.publicKey).toString('base64url'),
          counter: credential.counter, rpId, origin, accountId, enrollment: 'main-confirmed-v1' });
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
