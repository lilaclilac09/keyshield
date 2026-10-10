"""MPP (Metered Payment Protocol) domain — stream state machine and on-chain instructions."""

from .mpp_onchain import (
    MppConfig,
    build_mpp_settle_ix_data,
    build_mpp_settle_ix,
    submit_mpp_settle,
    submit_signed_instructions,
    build_open_payment_stream_ix_data,
    build_open_payment_stream_ix,
    build_withdraw_agent_wallet_ix_data,
    build_withdraw_agent_wallet_ix,
    derive_agent_payment_stream_pda,
    derive_universal_vault_pda,
    build_create_universal_vault_ix,
    build_grant_agent_access_ix,
)
from .mpp_onchain import (
    MppSubmitError,
    OPEN_PAYMENT_STREAM_DISCRIMINATOR,
    WITHDRAW_AGENT_WALLET_DISCRIMINATOR,
    SYSTEM_PROGRAM_ID,
    TOKEN_PROGRAM_ID,
    USDC_MINT_MAINNET,
    DEFAULT_RPC_URL,
)
from . import mpp_streams
from . import owner_submit

__all__ = [
    "MppConfig",
    "MppSubmitError",
    "build_mpp_settle_ix_data",
    "build_mpp_settle_ix",
    "submit_mpp_settle",
    "submit_signed_instructions",
    "build_open_payment_stream_ix_data",
    "build_open_payment_stream_ix",
    "build_withdraw_agent_wallet_ix_data",
    "build_withdraw_agent_wallet_ix",
    "derive_agent_payment_stream_pda",
    "derive_universal_vault_pda",
    "build_create_universal_vault_ix",
    "build_grant_agent_access_ix",
    "OPEN_PAYMENT_STREAM_DISCRIMINATOR",
    "WITHDRAW_AGENT_WALLET_DISCRIMINATOR",
    "SYSTEM_PROGRAM_ID",
    "TOKEN_PROGRAM_ID",
    "USDC_MINT_MAINNET",
    "DEFAULT_RPC_URL",
    "MppStreams",
]
