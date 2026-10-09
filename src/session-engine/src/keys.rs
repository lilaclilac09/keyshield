//! Session-key lifecycle. The secret is wrapped in `secrecy::Secret`
//! and `Zeroize`s on drop. HMAC-SHA256 matches
//! `src/backend/mpp/capture.py`:
//! `HMAC-SHA256(session_token_utf8, artifact_hash)`.

use hmac::{Hmac, Mac};
use secrecy::{ExposeSecret, Secret};
use sha2::Sha256;
use subtle::ConstantTimeEq;
use zeroize::Zeroize;

use crate::error::EngineError;

type HmacSha256 = Hmac<Sha256>;

#[derive(Clone)]
struct KeyBytes(Vec<u8>);

impl Zeroize for KeyBytes {
    fn zeroize(&mut self) {
        self.0.zeroize();
    }
}

/// Consumer session HMAC key. Debug prints `[REDACTED]`. Drop wipes.
pub struct SessionKey {
    secret: Secret<KeyBytes>,
}

impl core::fmt::Debug for SessionKey {
    fn fmt(&self, f: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
        f.write_str("SessionKey([REDACTED])")
    }
}

impl SessionKey {
    /// 32-byte raw key material.
    pub fn from_bytes(bytes: [u8; 32]) -> Self {
        Self {
            secret: Secret::new(KeyBytes(bytes.to_vec())),
        }
    }

    /// UTF-8 passphrase, same encoding as the Python capture MAC.
    pub fn from_utf8(passphrase: &str) -> Result<Self, EngineError> {
        if passphrase.is_empty() {
            return Err(EngineError::InvalidKey);
        }
        Ok(Self {
            secret: Secret::new(KeyBytes(passphrase.as_bytes().to_vec())),
        })
    }

    fn key_slice(&self) -> &[u8] {
        &self.secret.expose_secret().0
    }

    /// HMAC-SHA256 over a 32-byte artifact hash.
    pub fn sign_artifact(&self, artifact_hash: &[u8; 32]) -> [u8; 32] {
        let mut mac = HmacSha256::new_from_slice(self.key_slice())
            .expect("HMAC-SHA256 accepts any key length");
        mac.update(artifact_hash);
        let digest = mac.finalize().into_bytes();
        let mut out = [0u8; 32];
        out.copy_from_slice(&digest);
        out
    }

    /// HMAC-SHA256 over the SHA-256 context anchor (session guard).
    pub fn sign_anchor(&self, anchor: &[u8; 32]) -> [u8; 32] {
        self.sign_artifact(anchor)
    }

    pub fn verify_artifact(&self, artifact_hash: &[u8; 32], presented: &[u8]) -> bool {
        if presented.len() != 32 || presented == [0u8; 32] {
            return false;
        }
        let expected = self.sign_artifact(artifact_hash);
        expected.ct_eq(presented).into()
    }

    #[cfg(test)]
    pub fn peek_for_test(&self) -> Vec<u8> {
        self.secret.expose_secret().0.clone()
    }
}

impl Drop for SessionKey {
    fn drop(&mut self) {
        // `Secret<KeyBytes>` zeroizes `KeyBytes` on drop. Explicit
        // wipe covers a replace-in-place before the field destructor.
        let mut emptied = Secret::new(KeyBytes(Vec::new()));
        core::mem::swap(&mut self.secret, &mut emptied);
        drop(emptied);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn debug_is_redacted() {
        let key = SessionKey::from_bytes([0x11; 32]);
        assert_eq!(format!("{key:?}"), "SessionKey([REDACTED])");
    }

    #[test]
    fn empty_passphrase_is_rejected() {
        assert_eq!(SessionKey::from_utf8("").unwrap_err(), EngineError::InvalidKey);
    }

    #[test]
    fn python_compat_hmac_vector() {
        // hmac.new(b"ks-session-consumer", bytes(range(32)), sha256)
        let key = SessionKey::from_utf8("ks-session-consumer").unwrap();
        let mut artifact = [0u8; 32];
        for (i, b) in artifact.iter_mut().enumerate() {
            *b = i as u8;
        }
        let mac = key.sign_artifact(&artifact);
        let expected =
            hex::decode("e73c7053ebba0e2e811867cfb36abe5bb4ad03b8b667b956cc71561f57cbd08a")
                .unwrap();
        assert_eq!(mac.as_slice(), expected.as_slice());
    }

    #[test]
    fn drop_wipes_key_bytes() {
        let key = SessionKey::from_bytes([0xAB; 32]);
        assert_eq!(key.peek_for_test(), vec![0xAB; 32]);
        drop(key);
    }
}
