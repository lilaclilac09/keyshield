//! Authorization proof check for zk-vault execute.
//!
//! Two tagged kinds:
//!   `0x00` scaffold-sha256 — binds public inputs. **Not** pairing.
//!   `0x01` Groth16 / bn254 — calls `sol_alt_bn128_group_op` pairing
//!   only when a verification key is installed. No VK is installed, so
//!   this path **fails closed**. Do not advertise Groth16 as live.
//!
//! Equation when a VK exists:
//!   e(A, B) · e(−α, β) · e(−L, γ) · e(−C, δ) = 1
//! L = IC[0] + Σ public_i · IC[i+1]

use pinocchio::program_error::ProgramError;

use crate::ed25519_bind::sha256;
use crate::error::KeyShieldError;

pub const PROOF_KIND_SCAFFOLD: u8 = 0x00;
pub const PROOF_KIND_GROTH16: u8 = 0x01;
pub const SCAFFOLD_DOMAIN: &[u8] = b"ks-scaffold-v1";
pub const GROTH16_PROOF_LEN: usize = 64 + 128 + 64;
pub const G1_LEN: usize = 64;
pub const G2_LEN: usize = 128;
pub const PAIR_LEN: usize = G1_LEN + G2_LEN;
/// `sol_alt_bn128_group_op` pairing opcode (Solana runtime).
pub const ALT_BN128_ADD: u64 = 0;
pub const ALT_BN128_SUB: u64 = 1;
pub const ALT_BN128_MUL: u64 = 2;
pub const ALT_BN128_PAIRING: u64 = 3;

/// No circuit-specific VK is shipped. Groth16 tags are rejected.
pub const GROTH16_VK_INSTALLED: bool = false;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ProofKind {
    ScaffoldSha256,
    Groth16Bn254,
}

#[derive(Clone, Copy, Debug)]
pub struct ZkPublicInputs {
    pub nullifier: [u8; 32],
    pub action_hash: [u8; 32],
    pub amount: u64,
    pub valid_until: u64,
    pub merkle_root: [u8; 32],
}

/// `sha256("ks-scaffold-v1" || nullifier || action || amount_le || until_le || root)`
pub fn scaffold_digest(pubs: &ZkPublicInputs) -> [u8; 32] {
    let mut pre = [0u8; 14 + 32 + 32 + 8 + 8 + 32];
    pre[..14].copy_from_slice(SCAFFOLD_DOMAIN);
    pre[14..46].copy_from_slice(&pubs.nullifier);
    pre[46..78].copy_from_slice(&pubs.action_hash);
    pre[78..86].copy_from_slice(&pubs.amount.to_le_bytes());
    pre[86..94].copy_from_slice(&pubs.valid_until.to_le_bytes());
    pre[94..126].copy_from_slice(&pubs.merkle_root);
    sha256(&pre)
}

pub fn encode_scaffold_proof(pubs: &ZkPublicInputs) -> [u8; 33] {
    let mut out = [0u8; 33];
    out[0] = PROOF_KIND_SCAFFOLD;
    out[1..].copy_from_slice(&scaffold_digest(pubs));
    out
}

fn verify_scaffold(body: &[u8], pubs: &ZkPublicInputs) -> Result<(), ProgramError> {
    if body.len() != 32 {
        return Err(KeyShieldError::InvalidZKProof.into());
    }
    let expect = scaffold_digest(pubs);
    if body != expect.as_ref() {
        return Err(KeyShieldError::ScaffoldTranscriptMismatch.into());
    }
    Ok(())
}

/// Host-oracle: Groth16 is only valid when a VK is installed **and**
/// the pairing product is 1. Neither is true in this build.
pub fn assert_groth16_ready(vk_installed: bool, pairing_ok: bool) -> Result<(), ProgramError> {
    if !vk_installed {
        return Err(KeyShieldError::Groth16VkMissing.into());
    }
    if !pairing_ok {
        return Err(KeyShieldError::PairingCheckFailed.into());
    }
    Ok(())
}

#[cfg(target_os = "solana")]
fn alt_bn128_group_op(op: u64, input: &[u8], out: &mut [u8]) -> Result<(), ProgramError> {
    let rc = unsafe {
        pinocchio::syscalls::sol_alt_bn128_group_op(
            op,
            input.as_ptr(),
            input.len() as u64,
            out.as_mut_ptr(),
        )
    };
    if rc != 0 {
        return Err(KeyShieldError::PairingCheckFailed.into());
    }
    Ok(())
}

/// Pairing product of `n` (G1, G2) pairs. Output is 32-byte BE 1 on success.
#[cfg(target_os = "solana")]
pub fn alt_bn128_pairing(pairs: &[u8]) -> Result<[u8; 32], ProgramError> {
    if pairs.is_empty() || pairs.len() % PAIR_LEN != 0 {
        return Err(KeyShieldError::InvalidZKProof.into());
    }
    let mut out = [0u8; 32];
    alt_bn128_group_op(ALT_BN128_PAIRING, pairs, &mut out)?;
    Ok(out)
}

#[cfg(not(target_os = "solana"))]
pub fn alt_bn128_pairing(_pairs: &[u8]) -> Result<[u8; 32], ProgramError> {
    Err(KeyShieldError::Groth16VkMissing.into())
}

fn pairing_is_one(product: &[u8; 32]) -> bool {
    let mut i = 0;
    while i < 31 {
        if product[i] != 0 {
            return false;
        }
        i += 1;
    }
    product[31] == 1
}

fn verify_groth16(body: &[u8], _pubs: &ZkPublicInputs) -> Result<(), ProgramError> {
    if body.len() != GROTH16_PROOF_LEN {
        return Err(KeyShieldError::InvalidZKProof.into());
    }
    // Install hook: when GROTH16_VK_INSTALLED is true, build
    // e(A,B)·e(−α,β)·e(−L,γ)·e(−C,δ) and require pairing_is_one.
    // No VK ships in this build — fail closed, never skip pairing.
    let _ = (
        ALT_BN128_ADD,
        ALT_BN128_SUB,
        ALT_BN128_MUL,
        ALT_BN128_PAIRING,
        pairing_is_one,
        alt_bn128_pairing,
    );
    let _ = GROTH16_VK_INSTALLED;
    Err(KeyShieldError::Groth16VkMissing.into())
}

pub fn verify_authorization_proof(
    proof: &[u8],
    pubs: &ZkPublicInputs,
) -> Result<ProofKind, ProgramError> {
    if proof.is_empty() {
        return Err(KeyShieldError::InvalidZKProof.into());
    }
    match proof[0] {
        PROOF_KIND_SCAFFOLD => {
            verify_scaffold(&proof[1..], pubs)?;
            Ok(ProofKind::ScaffoldSha256)
        }
        PROOF_KIND_GROTH16 => {
            verify_groth16(&proof[1..], pubs)?;
            Ok(ProofKind::Groth16Bn254)
        }
        _ => Err(KeyShieldError::InvalidZKProof.into()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use pinocchio::program_error::ProgramError;

    fn code(err: ProgramError) -> u32 {
        match err {
            ProgramError::Custom(c) => c,
            _ => 0,
        }
    }

    fn pubs() -> ZkPublicInputs {
        ZkPublicInputs {
            nullifier: [1u8; 32],
            action_hash: [2u8; 32],
            amount: 5,
            valid_until: 10,
            merkle_root: [3u8; 32],
        }
    }

    #[test]
    fn scaffold_binds_public_inputs() {
        let p = pubs();
        let bytes = encode_scaffold_proof(&p);
        assert_eq!(
            verify_authorization_proof(&bytes, &p).unwrap(),
            ProofKind::ScaffoldSha256
        );
    }

    #[test]
    fn scaffold_rejects_wrong_digest() {
        let p = pubs();
        let mut bytes = encode_scaffold_proof(&p);
        bytes[32] ^= 1;
        let err = verify_authorization_proof(&bytes, &p).unwrap_err();
        assert_eq!(code(err), KeyShieldError::ScaffoldTranscriptMismatch as u32);
    }

    #[test]
    fn groth16_tag_fails_closed_without_vk() {
        let mut body = [0u8; 1 + GROTH16_PROOF_LEN];
        body[0] = PROOF_KIND_GROTH16;
        let err = verify_authorization_proof(&body, &pubs()).unwrap_err();
        assert_eq!(code(err), KeyShieldError::Groth16VkMissing as u32);
        assert!(!GROTH16_VK_INSTALLED);
    }

    #[test]
    fn groth16_short_proof_is_invalid() {
        let err = verify_authorization_proof(&[PROOF_KIND_GROTH16, 1, 2, 3], &pubs()).unwrap_err();
        assert_eq!(code(err), KeyShieldError::InvalidZKProof as u32);
    }

    #[test]
    fn pairing_oracle_never_succeeds_without_vk() {
        let err = assert_groth16_ready(false, true).unwrap_err();
        assert_eq!(code(err), KeyShieldError::Groth16VkMissing as u32);
        let err = assert_groth16_ready(true, false).unwrap_err();
        assert_eq!(code(err), KeyShieldError::PairingCheckFailed as u32);
    }

    #[test]
    fn untagged_bytes_are_not_pairing() {
        let err = verify_authorization_proof(&[1, 2, 3, 4], &pubs()).unwrap_err();
        assert_eq!(code(err), KeyShieldError::InvalidZKProof as u32);
    }
}
