//! SHA-256 context digest. The Pinocchio program uses portable FNV-1a
//! (`session_guard::context_digest`) because `sol_sha256` is not
//! available in host unit tests. The host/WASM engine hashes the
//! complete payload + stream + artifact + nonce so a session signature
//! cannot be replayed on a different context.
//!
//! This is not the Anchor framework.

use sha2::{Digest, Sha256};

/// Domain separator. Changing this invalidates every outstanding guard.
pub const CONTEXT_DOMAIN: &[u8] = b"ks.hvc.ctx.v1";

/// SHA-256(domain || 0x00 || program_id || len(ix) || ix || stream || artifact || nonce).
pub fn context_digest(
    program_id: &[u8; 32],
    ix_data: &[u8],
    stream_id: u64,
    artifact_hash: &[u8; 32],
    nonce: u64,
) -> [u8; 32] {
    let mut hasher = Sha256::new();
    hasher.update(CONTEXT_DOMAIN);
    hasher.update([0u8]);
    hasher.update(program_id);
    hasher.update((ix_data.len() as u32).to_le_bytes());
    hasher.update(ix_data);
    hasher.update(stream_id.to_le_bytes());
    hasher.update(artifact_hash);
    hasher.update(nonce.to_le_bytes());
    hasher.finalize().into()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn any_field_change_moves_the_digest() {
        let program = [7u8; 32];
        let ix = [26u8, 1, 2, 3];
        let artifact = [9u8; 32];
        let a = context_digest(&program, &ix, 1, &artifact, 0);
        assert_ne!(a, context_digest(&program, &ix, 1, &artifact, 1));
        assert_ne!(a, context_digest(&program, &ix, 2, &artifact, 0));
        assert_ne!(a, context_digest(&program, &[26, 1, 2, 4], 1, &artifact, 0));
        assert_ne!(a, context_digest(&[8u8; 32], &ix, 1, &artifact, 0));
        let mut other = artifact;
        other[0] = 10;
        assert_ne!(a, context_digest(&program, &ix, 1, &other, 0));
        assert_eq!(a, context_digest(&program, &ix, 1, &artifact, 0));
    }
}
