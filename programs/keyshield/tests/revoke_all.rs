//! Integration test for RevokeAllAgentAccess instruction
//!
//! Run from workspace root: `cargo build-sbf && SBF_OUT_DIR=target/deploy cargo test -p keyshield revoke_all`

use mollusk::{
    solana_program_test::ProgramTest,
    solana_sdk::{
        signature::Keypair,
        signer::Signer,
        transaction::Transaction,
        transport::TransportError,
    },
    *
};
use keyshield::{
    id,
    instructions::Instruction,
    state::UniversalVault,
};

#[tokio::test]
async fn test_revoke_all_agent_access_success() -> Result<(), TransportError> {
    // Setup test context
    let program_test = ProgramTest::new("keyshield", id(), processor!(keyshield::process_instruction));
    let (mut banks_client, payer, recent_blockhash) = program_test.start().await;

    // Create vault owner and agent keypairs
    let owner = Keypair::new();
    let agent1 = Keypair::new();
    let agent2 = Keypair::new();

    // TODO: Create and initialize UniversalVault with agent grants for agent1 and agent2
    // TODO: Call RevokeAllAgentAccess instruction
    // TODO: Assert all agent grants are revoked

    Ok(())
}
