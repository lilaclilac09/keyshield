"""
mpp_onchain.py — real `mpp_settle` (ix #26) submission to Solana.

Spec 10 Phase 10.4-real. Replaces the stub body of
`mpp_streams.settle_on_chain()`.

### Config (env)

  KS_MPP_SETTLER_KEY        — base58 ed25519 secret key, 64 bytes
                              (32-byte seed + 32-byte pubkey, the
                              standard Solana keypair format)
  KS_PLATFORM_USDC_ATA      — base58 pubkey of the destination USDC
                              token account
  KS_KEYSHIELD_PROGRAM_ID   — base58 deployed program ID
  KS_USDC_MINT              — optional, defaults to mainnet USDC
  KS_VAULT_PDA              — optional, base58 pubkey of UniversalVault
                              for the owner (required for real submission)
  KS_SOLANA_RPC_URL         — optional, defaults to mainnet RPC

If any *required* env var is missing, `load_mpp_config()` returns None
and the caller falls back to the stub (returns 0). Warning is logged
exactly once at first failed load.

### Byte layout (mpp_settle ix data field)

After the dispatcher strips the discriminator, on-chain expects 112
bytes: `units_consumed` (u64), a 32-byte fulfillment artifact root,
`settlement_seq` (u64), a 32-byte capture signature, and a 32-byte
request hash. A missing or all-zero root, signature, or request hash
is `UnverifiedFulfillment` (6108). Sequence 0, or any sequence
`<= last_settled_seq`, is `SettlementReplay` (6111) and does not
debit. A strictly greater sequence, including a gap, is accepted.
The honest settler still sends `last_settled_seq + 1`. Full ix
data wire is:

  [0]:      discriminator = 26 (0x1a)
  [1..9]:   amount as u64 little-endian
  [9..41]:  artifact root (sha256 of the request hash)
  [41..49]: settlement_seq as u64 little-endian
  [49..81]: capture signature (HMAC-SHA256 of the artifact hash)
  [81..113]: request hash (32-byte fulfillment hash of this receipt)

This module's `build_mpp_settle_ix_data` returns the full 113-byte
payload. Spec 10 Q3 documents the first u64 as `units_consumed`; the
on-chain ix multiplies by `cost_per_unit` to get the actual debit.
The caller (mpp_streams.settle_on_chain) passes the already-priced
amount as `amount_micro_usdc`, which means the on-chain
`cost_per_unit` is 1 for streams opened by this stack — the u64
matches micro-USDC. The artifact root is produced only after
`fulfillment.py` accepts the upstream response. The sequence on the
honest path is the stream's `last_settled_seq + 1`. The capture
signature is the consumer session MAC; the program checks that those
32 bytes are present and non-zero. The request hash is the artifact
hash itself and is stored in the stream's reserved root slot.
"""

from __future__ import annotations

import hashlib
import json
import logging
import os
import struct
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)


# ─── soft deps ────────────────────────────────────────────────────────────
#
# `solders` and `base58` aren't required for stub-fallback (returning 0
# when env vars are missing) and aren't required for the byte-layout
# unit test. They ARE required to actually submit the ix on-chain. We
# import them softly so the module loads cleanly even when the venv
# hasn't installed them yet.

try:
    import base58 as _base58  # type: ignore

    _HAS_BASE58 = True
except ImportError:
    _base58 = None
    _HAS_BASE58 = False

try:
    from solders.keypair import Keypair  # type: ignore
    from solders.pubkey import Pubkey  # type: ignore
    from solders.instruction import Instruction as SoldersInstruction  # type: ignore
    from solders.instruction import AccountMeta  # type: ignore
    from solders.transaction import Transaction  # type: ignore
    from solders.message import Message  # type: ignore
    from solders.hash import Hash  # type: ignore

    _HAS_SOLDERS = True
except ImportError:
    Keypair = None  # type: ignore
    Pubkey = None  # type: ignore
    SoldersInstruction = None  # type: ignore
    AccountMeta = None  # type: ignore
    Transaction = None  # type: ignore
    Message = None  # type: ignore
    Hash = None  # type: ignore
    _HAS_SOLDERS = False


# ─── tiny base58 decoder (no deps) ────────────────────────────────────────
#
# Used when `base58` package isn't installed. Solana uses Bitcoin-style
# base58 (no 0/O/I/l). 32 lines is enough for our purposes — we only
# need decode, not encode.

_B58_ALPHABET = b"123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"


def _b58decode_pure(s: str) -> bytes:
    """Decode a base58 string to bytes. Pure-Python fallback."""
    if not s:
        return b""
    n = 0
    for c in s.encode("ascii"):
        if c not in _B58_ALPHABET:
            raise ValueError(f"invalid base58 character: {chr(c)}")
        n = n * 58 + _B58_ALPHABET.index(c)
    # Count leading '1's → leading zero bytes.
    n_leading = len(s) - len(s.lstrip("1"))
    out = b""
    while n > 0:
        out = bytes([n & 0xFF]) + out
        n >>= 8
    return b"\x00" * n_leading + out


def _b58decode(s: str) -> bytes:
    """Decode base58 — uses installed `base58` package if available,
    else the pure-Python fallback."""
    if _HAS_BASE58:
        return _base58.b58decode(s)  # type: ignore[union-attr]
    return _b58decode_pure(s)


# ─── config ───────────────────────────────────────────────────────────────


# Solana program / mint defaults — same as billing_solana.py constants.
USDC_MINT_MAINNET = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
TOKEN_PROGRAM_ID = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
# SPL Associated Token Program — used by `derive_associated_token_address`
# + `build_create_ata_idempotent_ix` for the /build-open-tx prereq ixs.
ASSOCIATED_TOKEN_PROGRAM_ID = "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
DEFAULT_RPC_URL = "https://api.mainnet-beta.solana.com"


@dataclass(frozen=True)
class MppConfig:
    """Immutable on-chain config loaded from env. All addresses are
    base58 strings (matches billing_solana.py convention); secret_key
    is the raw 64-byte ed25519 keypair."""

    secret_key: bytes  # 64 bytes (32 seed + 32 pubkey)
    settler_pubkey: str  # base58
    platform_usdc_ata: str  # base58
    keyshield_program_id: str  # base58
    usdc_mint: str  # base58
    vault_pda: Optional[str]  # base58 of owner's UniversalVault
    rpc_url: str


# Module-level flag so we only log the "missing env" warning once per
# process, regardless of how many times settle_on_chain is called.
_WARNED_ENV_MISSING = False


def _settler_secret_from_env(raw: str) -> bytes:
    """Accept base58-64 or a Solana keypair JSON path.

    `devnet-setup.sh` historically exported the JSON path. Python
    treated that string as base58, failed closed, and settled as stub
    (on-chain 0). A 64-byte JSON array is the same material.
    """
    path = Path(raw).expanduser()
    if path.is_file():
        data = json.loads(path.read_text())
        if not isinstance(data, list) or len(data) != 64:
            raise ValueError(f"keypair JSON must be a 64-byte array: {path}")
        return bytes(int(b) & 0xFF for b in data)
    return _b58decode(raw)


def load_mpp_config() -> Optional[MppConfig]:
    """Load the mpp_settle config from env. Returns None if any
    required var is missing — caller treats this as the stub path.

    Required:
      KS_MPP_SETTLER_KEY        (base58 64-byte ed25519 secret key,
                                 OR a Solana keypair JSON path — the
                                 setup script used to export a path
                                 and that used to force stub-fallback)
      KS_PLATFORM_USDC_ATA      (base58 pubkey)
      KS_KEYSHIELD_PROGRAM_ID   (base58 program ID)

    Optional:
      KS_USDC_MINT              (defaults to mainnet USDC mint)
      KS_VAULT_PDA              (base58 pubkey of UniversalVault PDA;
                                  required for *real* submission, but
                                  load_mpp_config returns a partial
                                  config without it — caller handles)
      KS_SOLANA_RPC_URL         (defaults to public mainnet)
    """
    global _WARNED_ENV_MISSING

    settler_key_b58 = os.environ.get("KS_MPP_SETTLER_KEY", "").strip()
    platform_ata = os.environ.get("KS_PLATFORM_USDC_ATA", "").strip()
    program_id = os.environ.get("KS_KEYSHIELD_PROGRAM_ID", "").strip()

    if not (settler_key_b58 and platform_ata and program_id):
        if not _WARNED_ENV_MISSING:
            missing = [
                name
                for name, val in (
                    ("KS_MPP_SETTLER_KEY", settler_key_b58),
                    ("KS_PLATFORM_USDC_ATA", platform_ata),
                    ("KS_KEYSHIELD_PROGRAM_ID", program_id),
                )
                if not val
            ]
            logger.warning(
                "mpp_onchain: stub-fallback active — missing env: %s. "
                "settle_on_chain() will return 0 until these are set.",
                ", ".join(missing),
            )
            _WARNED_ENV_MISSING = True
        return None

    try:
        secret_key = _settler_secret_from_env(settler_key_b58)
    except Exception as e:
        logger.error(
            "mpp_onchain: KS_MPP_SETTLER_KEY is not a 64-byte base58 key "
            "or a Solana keypair JSON: %s",
            e,
        )
        return None
    if len(secret_key) != 64:
        logger.error(
            "mpp_onchain: KS_MPP_SETTLER_KEY decoded to %d bytes, expected 64",
            len(secret_key),
        )
        return None

    # Settler pubkey = last 32 bytes of the 64-byte ed25519 keypair
    # (Solana convention). We re-encode to base58 for parity with how
    # the on-chain code compares pubkeys.
    settler_pubkey_bytes = secret_key[32:64]
    if _HAS_BASE58:
        settler_pubkey = _base58.b58encode(settler_pubkey_bytes).decode("ascii")  # type: ignore[union-attr]
    else:
        settler_pubkey = _b58encode_pure(settler_pubkey_bytes)

    # Light validation on remaining base58 fields — shape only,
    # we don't verify they're real on-chain accounts.
    for name, val in (
        ("KS_PLATFORM_USDC_ATA", platform_ata),
        ("KS_KEYSHIELD_PROGRAM_ID", program_id),
    ):
        try:
            decoded = _b58decode(val)
        except Exception as e:
            logger.error("mpp_onchain: %s is not valid base58: %s", name, e)
            return None
        if len(decoded) != 32:
            logger.error(
                "mpp_onchain: %s decoded to %d bytes, expected 32",
                name,
                len(decoded),
            )
            return None

    return MppConfig(
        secret_key=secret_key,
        settler_pubkey=settler_pubkey,
        platform_usdc_ata=platform_ata,
        keyshield_program_id=program_id,
        usdc_mint=os.environ.get("KS_USDC_MINT", USDC_MINT_MAINNET).strip() or USDC_MINT_MAINNET,
        vault_pda=(os.environ.get("KS_VAULT_PDA", "").strip() or None),
        rpc_url=os.environ.get("KS_SOLANA_RPC_URL", DEFAULT_RPC_URL).strip() or DEFAULT_RPC_URL,
    )


def _b58encode_pure(b: bytes) -> str:
    """Pure-Python base58 encode for the rare case `base58` isn't
    installed but we still want to derive the settler pubkey."""
    if not b:
        return ""
    n = int.from_bytes(b, "big")
    out = b""
    while n > 0:
        n, r = divmod(n, 58)
        out = bytes([_B58_ALPHABET[r]]) + out
    # Leading zero bytes → leading '1's
    n_leading = len(b) - len(b.lstrip(b"\x00"))
    return ("1" * n_leading) + out.decode("ascii")


# ─── ix builders ──────────────────────────────────────────────────────────


# On-chain discriminator for ix #26. Lives next to the ix data builder
# so anyone reading this file knows the exact byte that goes on the
# wire.
MPP_SETTLE_DISCRIMINATOR = 26  # 0x1a
ED25519_PROGRAM_ID = "Ed25519SigVerify111111111111111111111111111"
INSTRUCTIONS_SYSVAR_ID = "Sysvar1nstructions1111111111111111111111111"


def settlement_binding_hash(
    stream_pubkey: bytes, seq: int, amount: int, artifact_hash: bytes
) -> bytes:
    """sha256(stream || seq_le || debit_le || artifact).

    The Ed25519 precompile signs this 32-byte message. `mpp_settle`
    reads it back from instruction 0 through the instructions sysvar.
    """
    if not isinstance(stream_pubkey, (bytes, bytearray)) or len(stream_pubkey) != 32:
        raise ValueError("stream_pubkey must be 32 bytes")
    if not isinstance(artifact_hash, (bytes, bytearray)) or len(artifact_hash) != 32:
        raise ValueError("artifact_hash must be 32 bytes")
    if isinstance(seq, bool) or not isinstance(seq, int) or seq < 0 or seq > 0xFFFFFFFFFFFFFFFF:
        raise ValueError("seq must be a u64")
    if (
        isinstance(amount, bool)
        or not isinstance(amount, int)
        or amount < 0
        or amount > 0xFFFFFFFFFFFFFFFF
    ):
        raise ValueError("amount must be a u64")
    preimage = (
        bytes(stream_pubkey)
        + int(seq).to_bytes(8, "little")
        + int(amount).to_bytes(8, "little")
        + bytes(artifact_hash)
    )
    return hashlib.sha256(preimage).digest()


def build_ed25519_ix_data(public_key: bytes, signature: bytes, message: bytes) -> bytes:
    """144-byte Ed25519 precompile payload. Offsets point at this instruction."""
    if (
        not isinstance(public_key, (bytes, bytearray))
        or len(public_key) != 32
        or not isinstance(signature, (bytes, bytearray))
        or len(signature) != 64
        or not isinstance(message, (bytes, bytearray))
        or len(message) != 32
    ):
        raise ValueError("ed25519 ix expects a 32-byte key, 64-byte signature, and 32-byte message")
    # signature at 16, pubkey at 80, message at 112. u16::MAX means
    # "data lives in this instruction".
    offsets = struct.pack("<7H", 16, 0xFFFF, 80, 0xFFFF, 112, 32, 0xFFFF)
    return bytes([1, 0]) + offsets + bytes(signature) + bytes(public_key) + bytes(message)


def build_mpp_settle_ix_data(
    amount_micro_usdc: int,
    artifact_root: bytes,
    settlement_seq: int = 1,
    capture_signature: bytes | None = None,
    request_hash: bytes | None = None,
    session_bit_index: int | None = None,
) -> bytes:
    """Construct the full ix data payload for `mpp_settle`.

    Layout (matches `programs/keyshield/src/instructions/mpp_settle.rs`
    after the dispatcher strips byte 0):

      [0]:       discriminator = 26 (0x1a)
      [1..9]:    amount as u64 little-endian
      [9..41]:   fulfillment artifact root
      [41..49]:  settlement sequence, first legal value is 1
      [49..81]:  consumer capture signature
      [81..113]: request hash of this receipt

    On-chain treats the first u64 as `units_consumed` and computes
    `units_consumed * cost_per_unit_micro_usdc` to produce the actual
    debit. We pass the pre-priced amount (cost_per_unit=1). The root
    must be the 32-byte commitment from `fulfillment.artifact_root`;
    an all-zero root is rejected here and again on-chain. The honest
    sequence is the stream's last accepted sequence plus one. Any
    sequence `<= last_settled_seq` is `SettlementReplay` before the
    debit. The signature is HMAC-SHA256(session key, artifact hash).
    An all-zero signature is rejected here and again on-chain. The
    request hash is the 32-byte fulfillment hash. The full payload
    is 113 bytes. Root and sequence are validated before the
    signature, and the signature before the request hash.
    """
    if amount_micro_usdc < 0:
        raise ValueError("amount_micro_usdc must be non-negative")
    if amount_micro_usdc > 0xFFFFFFFFFFFFFFFF:
        raise ValueError("amount_micro_usdc exceeds u64 range")
    if not isinstance(artifact_root, (bytes, bytearray)) or len(artifact_root) != 32:
        raise ValueError("artifact_root must be 32 bytes")
    if bytes(artifact_root) == bytes(32):
        raise ValueError("artifact_root must be a non-zero fulfillment commitment")
    if isinstance(settlement_seq, bool) or not isinstance(settlement_seq, int):
        raise ValueError("settlement_seq must be a positive u64")
    if settlement_seq < 1 or settlement_seq > 0xFFFFFFFFFFFFFFFF:
        raise ValueError("settlement_seq must be a positive u64")
    if not isinstance(capture_signature, (bytes, bytearray)) or len(capture_signature) != 32:
        raise ValueError("capture signature must be 32 non-zero bytes")
    if bytes(capture_signature) == bytes(32):
        raise ValueError("capture signature must be 32 non-zero bytes")
    if not isinstance(request_hash, (bytes, bytearray)) or len(request_hash) != 32:
        raise ValueError("request_hash must be 32 non-zero bytes")
    if bytes(request_hash) == bytes(32):
        raise ValueError("request_hash must be 32 non-zero bytes")
    payload = (
        bytes([MPP_SETTLE_DISCRIMINATOR])
        + int(amount_micro_usdc).to_bytes(8, "little")
        + bytes(artifact_root)
        + int(settlement_seq).to_bytes(8, "little")
        + bytes(capture_signature)
        + bytes(request_hash)
    )
    if session_bit_index is None:
        return payload
    if (
        isinstance(session_bit_index, bool)
        or not isinstance(session_bit_index, int)
        or session_bit_index < 0
        or session_bit_index > 0xFFFFFFFF
    ):
        raise ValueError("session_bit_index must be a u32")
    return payload + int(session_bit_index).to_bytes(4, "little")


@dataclass(frozen=True)
class _SimpleAccountMeta:
    """Minimal AccountMeta-shaped record. Mirrors solders.AccountMeta
    so callers (and tests) can introspect the account list without
    requiring solders. The submitter (`submit_mpp_settle`) maps these
    to real solders.AccountMeta when building the transaction."""

    pubkey: str  # base58
    is_signer: bool
    is_writable: bool


@dataclass(frozen=True)
class _SimpleInstruction:
    """solders.Instruction-shaped record without the dep. Holds enough
    state for both serialization (`submit_mpp_settle`) and unit-testing
    of the byte layout."""

    program_id: str  # base58
    accounts: tuple[_SimpleAccountMeta, ...]
    data: bytes


def build_ed25519_verify_ix(
    public_key: bytes, signature: bytes, message: bytes
) -> _SimpleInstruction:
    """Ed25519 precompile instruction. Place it at transaction index 0."""
    return _SimpleInstruction(
        program_id=ED25519_PROGRAM_ID,
        accounts=(),
        data=build_ed25519_ix_data(public_key, signature, message),
    )


def build_mpp_settle_ix(
    config: MppConfig,
    stream_pda: str,
    stream_ata: str,
    amount: int,
    artifact_root: bytes,
    settlement_seq: int = 1,
    capture_signature: bytes | None = None,
    request_hash: bytes | None = None,
    session_bit_index: int | None = None,
    revocation_bitmap: str | None = None,
) -> _SimpleInstruction:
    """Build the full mpp_settle instruction.

    Account order matches the on-chain handler in
    `programs/keyshield/src/instructions/mpp_settle.rs`:

      0. [signer]    mpp_settler                 (config.settler_pubkey)
      1. []          UniversalVault              (config.vault_pda — required;
                                                  if config.vault_pda is None,
                                                  caller falls back to stub
                                                  per Phase 10.4-real
                                                  acceptance gate)
      2. [writable]  AgentPaymentStream PDA      (stream_pda)
      3. [writable]  PaymentStream USDC ATA      (stream_ata, debit source)
      4. [writable]  Recipient USDC ATA          (config.platform_usdc_ata)
      5. []          USDC mint                   (config.usdc_mint)
      6. []          SPL Token Program
      7. []          Instructions sysvar. Instruction 0 of the same
                     transaction is the Ed25519 precompile over
                     `settlement_binding_hash`.
      8. []          Revocation bitmap, only when `session_bit_index`
                     is set.

    A 113-byte payload leaves the bitmap off. A session index appends
    4 bytes and requires the bitmap account.
    """
    if (session_bit_index is None) != (revocation_bitmap is None):
        raise ValueError("session_bit_index and revocation_bitmap are set together")

    if not config.vault_pda:
        # Caller (settle_on_chain) treats vault_pda absence as
        # "PDA not opened" → return 0. We still raise here because
        # build_mpp_settle_ix is documented as building a valid ix;
        # without vault_pda the result wouldn't be valid.
        raise ValueError(
            "config.vault_pda is required to build mpp_settle ix; "
            "set KS_VAULT_PDA env var or fall back to stub",
        )

    accounts = (
        _SimpleAccountMeta(
            pubkey=config.settler_pubkey,
            is_signer=True,
            is_writable=False,
        ),
        _SimpleAccountMeta(
            pubkey=config.vault_pda,
            is_signer=False,
            is_writable=False,
        ),
        _SimpleAccountMeta(
            pubkey=stream_pda,
            is_signer=False,
            is_writable=True,
        ),
        _SimpleAccountMeta(
            pubkey=stream_ata,
            is_signer=False,
            is_writable=True,
        ),
        _SimpleAccountMeta(
            pubkey=config.platform_usdc_ata,
            is_signer=False,
            is_writable=True,
        ),
        _SimpleAccountMeta(
            pubkey=config.usdc_mint,
            is_signer=False,
            is_writable=False,
        ),
        _SimpleAccountMeta(
            pubkey=TOKEN_PROGRAM_ID,
            is_signer=False,
            is_writable=False,
        ),
        _SimpleAccountMeta(
            pubkey=INSTRUCTIONS_SYSVAR_ID,
            is_signer=False,
            is_writable=False,
        ),
    )
    if revocation_bitmap is not None:
        accounts = accounts + (
            _SimpleAccountMeta(
                pubkey=revocation_bitmap,
                is_signer=False,
                is_writable=False,
            ),
        )
    return _SimpleInstruction(
        program_id=config.keyshield_program_id,
        accounts=accounts,
        data=build_mpp_settle_ix_data(
            amount,
            artifact_root,
            settlement_seq,
            capture_signature,
            request_hash,
            session_bit_index,
        ),
    )


# ─── submit ───────────────────────────────────────────────────────────────


class MppSubmitError(Exception):
    """Raised when the on-chain submission could not be sent or did
    not confirm. Caller (mpp_streams.settle_on_chain) catches this and
    records a failed attempt; pending stays in the DB so the next
    interval retries."""


async def submit_mpp_settle(
    config: MppConfig,
    ix: _SimpleInstruction,
    prefix_ix: _SimpleInstruction | None = None,
) -> tuple[int, str]:
    """Wrap the ix in a Solana Transaction, sign with the settler
    keypair, submit via RPC.

    Returns `(debited_micro_usdc, tx_signature)`. The signature is the
    base58 string the cluster returned from `sendTransaction` — caller
    persists it in mpp_settle_attempts so operators can audit which
    on-chain tx settled which stream.

    Raises MppSubmitError on any failure.
    """
    if not _HAS_SOLDERS:
        raise MppSubmitError(
            "solders package not installed — cannot submit mpp_settle ix; "
            "install via `pip install solders` or leave config env unset "
            "to keep stub-fallback active",
        )

    try:
        # Lazy import — keeps module-level cost low when stub-fallback
        # is the only path used.
        import httpx  # type: ignore
    except ImportError as e:
        raise MppSubmitError(f"httpx not installed: {e}") from e

    # Build solders objects from the SimpleInstruction.
    try:
        kp = Keypair.from_bytes(config.secret_key)  # type: ignore[union-attr]
        program_id = Pubkey.from_string(ix.program_id)  # type: ignore[union-attr]
        metas = [
            AccountMeta(  # type: ignore[union-attr]
                pubkey=Pubkey.from_string(a.pubkey),  # type: ignore[union-attr]
                is_signer=a.is_signer,
                is_writable=a.is_writable,
            )
            for a in ix.accounts
        ]
        sd_ix = SoldersInstruction(  # type: ignore[union-attr]
            program_id=program_id,
            accounts=metas,
            data=ix.data,
        )
        prefix = None
        if prefix_ix is not None:
            prefix = SoldersInstruction(  # type: ignore[union-attr]
                program_id=Pubkey.from_string(prefix_ix.program_id),  # type: ignore[union-attr]
                accounts=[
                    AccountMeta(  # type: ignore[union-attr]
                        pubkey=Pubkey.from_string(a.pubkey),  # type: ignore[union-attr]
                        is_signer=a.is_signer,
                        is_writable=a.is_writable,
                    )
                    for a in prefix_ix.accounts
                ],
                data=prefix_ix.data,
            )
    except Exception as e:  # noqa: BLE001
        raise MppSubmitError(f"failed to build solders ix: {e}") from e

    # Fetch latest blockhash, build + sign tx, submit.
    rpc_url = config.rpc_url
    async with httpx.AsyncClient(timeout=15) as client:
        # 1. recent blockhash
        resp = await client.post(
            rpc_url,
            json={
                "jsonrpc": "2.0",
                "id": 1,
                "method": "getLatestBlockhash",
                "params": [{"commitment": "confirmed"}],
            },
        )
        if resp.status_code != 200:
            raise MppSubmitError(
                f"getLatestBlockhash returned HTTP {resp.status_code}",
            )
        bh_body = resp.json()
        if "error" in bh_body:
            raise MppSubmitError(f"getLatestBlockhash error: {bh_body['error']}")
        blockhash_str = (bh_body.get("result") or {}).get("value", {}).get("blockhash")
        if not blockhash_str:
            raise MppSubmitError("getLatestBlockhash response missing blockhash")
        try:
            blockhash = Hash.from_string(blockhash_str)  # type: ignore[union-attr]
        except Exception as e:  # noqa: BLE001
            raise MppSubmitError(f"invalid blockhash: {e}") from e

        # 2. build + sign tx
        try:
            msg = Message.new_with_blockhash(  # type: ignore[union-attr]
                [prefix, sd_ix] if prefix is not None else [sd_ix],
                kp.pubkey(),
                blockhash,
            )
            tx = Transaction([kp], msg, blockhash)  # type: ignore[union-attr]
        except Exception as e:  # noqa: BLE001
            raise MppSubmitError(f"failed to build tx: {e}") from e

        # 3. submit
        import base64

        tx_b64 = base64.b64encode(bytes(tx)).decode("ascii")
        send_resp = await client.post(
            rpc_url,
            json={
                "jsonrpc": "2.0",
                "id": 2,
                "method": "sendTransaction",
                "params": [
                    tx_b64,
                    {"encoding": "base64", "preflightCommitment": "confirmed"},
                ],
            },
        )
        if send_resp.status_code != 200:
            raise MppSubmitError(
                f"sendTransaction returned HTTP {send_resp.status_code}",
            )
        send_body = send_resp.json()
        if "error" in send_body:
            raise MppSubmitError(f"sendTransaction error: {send_body['error']}")
        sig = send_body.get("result")
        if not sig:
            raise MppSubmitError("sendTransaction response missing signature")

    # The amount we asked for is the amount that landed if the tx
    # succeeded. Solana's runtime would have failed the whole tx
    # otherwise.
    amount_from_data = int.from_bytes(ix.data[1:9], "little")
    return amount_from_data, sig


# ─── Spec 10 Phase 10.5: open_stream / withdraw builders ──────────────────
#
# Both ixs are OWNER-signed (see programs/keyshield/src/instructions/
# open_stream.rs:85 and withdraw.rs:72), so the server cannot submit them
# directly with KS_MPP_SETTLER_KEY. Instead we expose builder functions
# that produce the ix data + account list, and the caller (server.py
# endpoint → frontend) is responsible for wrapping them in a Transaction
# the owner's wallet signs in-browser.
#
# Discriminator parity is the only thing that needs to be byte-perfect
# here; the rest is orchestration. Tests cover layout exhaustively.

OPEN_PAYMENT_STREAM_DISCRIMINATOR = 24  # 0x18
WITHDRAW_AGENT_WALLET_DISCRIMINATOR = 27  # 0x1b

SYSTEM_PROGRAM_ID = "11111111111111111111111111111111"

# Matches `APS_SEED` in programs/keyshield/src/instructions/open_stream.rs:38
APS_SEED = b"agent_payment_stream"


def derive_agent_payment_stream_pda(
    agent_pubkey: str,
    owner_pubkey: str,
    program_id: str,
) -> tuple[str, int]:
    """Derive the AgentPaymentStream PDA for (agent, owner).

    Seeds: ["agent_payment_stream", agent_pubkey, owner_pubkey]
    Mirrors `seeds!(APS_SEED, agent.key(), owner.key(), &bump)` in
    open_stream.rs:155.

    Returns (pda_base58, bump). Raises MppSubmitError if `solders` is
    not installed — PDA derivation requires the curve check.
    """
    if not _HAS_SOLDERS:
        raise MppSubmitError(
            "solders not installed — cannot derive PDA. Install via `pip install solders`.",
        )
    try:
        agent_pk = Pubkey.from_string(agent_pubkey)  # type: ignore[union-attr]
        owner_pk = Pubkey.from_string(owner_pubkey)  # type: ignore[union-attr]
        program_pk = Pubkey.from_string(program_id)  # type: ignore[union-attr]
    except Exception as e:  # noqa: BLE001
        raise MppSubmitError(f"invalid pubkey for PDA derivation: {e}") from e

    pda, bump = Pubkey.find_program_address(  # type: ignore[union-attr]
        [APS_SEED, bytes(agent_pk), bytes(owner_pk)],
        program_pk,
    )
    return (str(pda), bump)


def derive_associated_token_address(
    owner_pubkey: str,
    mint_pubkey: str,
    token_program_id: str = TOKEN_PROGRAM_ID,
) -> str:
    """Derive an Associated Token Account address.

    Seeds: [owner, token_program, mint] under the
    Associated Token Program (`ATokenGPvbdG…`). This is the standard
    SPL ATA layout — same derivation Phantom and the `spl-token` CLI
    use, so any wallet that can hold USDC for `owner_pubkey` already
    knows about this address.
    """
    if not _HAS_SOLDERS:
        raise MppSubmitError(
            "solders not installed — cannot derive ATA. Install via `pip install solders`.",
        )
    try:
        owner_pk = Pubkey.from_string(owner_pubkey)  # type: ignore[union-attr]
        mint_pk = Pubkey.from_string(mint_pubkey)  # type: ignore[union-attr]
        token_pk = Pubkey.from_string(token_program_id)  # type: ignore[union-attr]
        ata_program_pk = Pubkey.from_string(ASSOCIATED_TOKEN_PROGRAM_ID)  # type: ignore[union-attr]
    except Exception as e:  # noqa: BLE001
        raise MppSubmitError(f"invalid pubkey for ATA derivation: {e}") from e

    ata, _bump = Pubkey.find_program_address(  # type: ignore[union-attr]
        [bytes(owner_pk), bytes(token_pk), bytes(mint_pk)],
        ata_program_pk,
    )
    return str(ata)


def build_create_ata_idempotent_ix(
    payer_pubkey: str,
    ata_pubkey: str,
    owner_pubkey: str,
    mint_pubkey: str,
) -> _SimpleInstruction:
    """SPL Associated Token Program — idempotent `Create` (discriminator 1).

    Idempotent variant: succeeds if the ATA already exists, so the
    frontend can include this ix unconditionally without first probing
    on-chain state. Account order matches spl-token-2022 ATA program:

      0. [signer, writable] funding (payer for rent)
      1. [writable]         ATA address
      2. []                 wallet (owner of the ATA, NOT the signer)
      3. []                 mint
      4. []                 system program
      5. []                 SPL Token program
    """
    accounts = (
        _SimpleAccountMeta(pubkey=payer_pubkey, is_signer=True, is_writable=True),
        _SimpleAccountMeta(pubkey=ata_pubkey, is_signer=False, is_writable=True),
        _SimpleAccountMeta(pubkey=owner_pubkey, is_signer=False, is_writable=False),
        _SimpleAccountMeta(pubkey=mint_pubkey, is_signer=False, is_writable=False),
        _SimpleAccountMeta(pubkey=SYSTEM_PROGRAM_ID, is_signer=False, is_writable=False),
        _SimpleAccountMeta(pubkey=TOKEN_PROGRAM_ID, is_signer=False, is_writable=False),
    )
    return _SimpleInstruction(
        program_id=ASSOCIATED_TOKEN_PROGRAM_ID,
        accounts=accounts,
        data=bytes([1]),  # CreateIdempotent discriminator
    )


def build_spl_transfer_checked_ix(
    source_ata: str,
    dest_ata: str,
    mint_pubkey: str,
    authority_pubkey: str,
    amount_micro_usdc: int,
    decimals: int = 6,
) -> _SimpleInstruction:
    """SPL Token Program — `TransferChecked` (discriminator 12).

    Checks that the mint matches both source and dest, plus the
    declared decimals — safer than the legacy `Transfer`. Used to fund
    the stream's PDA-owned USDC ATA from the owner's USDC ATA when
    opening a payment stream. The `authority_pubkey` must sign in the
    outer transaction.

    Account order:
      0. [writable] source ATA
      1. []         mint
      2. [writable] destination ATA
      3. [signer]   authority (owner of source ATA)
    """
    if amount_micro_usdc < 0:
        raise ValueError("amount_micro_usdc must be non-negative")
    accounts = (
        _SimpleAccountMeta(pubkey=source_ata, is_signer=False, is_writable=True),
        _SimpleAccountMeta(pubkey=mint_pubkey, is_signer=False, is_writable=False),
        _SimpleAccountMeta(pubkey=dest_ata, is_signer=False, is_writable=True),
        _SimpleAccountMeta(pubkey=authority_pubkey, is_signer=True, is_writable=False),
    )
    # u8 discriminator + u64 amount LE + u8 decimals
    data = bytes([12]) + amount_micro_usdc.to_bytes(8, "little") + bytes([decimals])
    return _SimpleInstruction(
        program_id=TOKEN_PROGRAM_ID,
        accounts=accounts,
        data=data,
    )


def build_open_payment_stream_ix_data(
    bump: int,
    max_total_micro_usdc: int,
    cost_per_unit_micro_usdc: int,
    max_rate_usd_per_min_bits: int,
    settlement_interval_secs: int,
) -> bytes:
    """Construct the full ix data payload for `open_payment_stream`.

    Wire layout (matches open_stream.rs after dispatcher strips byte 0):

      [0]:      discriminator = 24 (0x18)
      [1]:      bump (u8)
      [2..10]:  max_total_micro_usdc (u64 little-endian)
      [10..18]: cost_per_unit_micro_usdc (u64 little-endian)
      [18..26]: max_rate_usd_per_min_bits (u64 — `f64::to_bits`)
      [26..30]: settlement_interval_secs (u32 little-endian)

    Total 30 bytes (1 discriminator + 29 body — matches the `data.len() <
    29` check at open_stream.rs:71 once the dispatcher strips the lead
    byte).
    """
    if not 0 <= bump <= 0xFF:
        raise ValueError("bump must fit u8 (0..=255)")
    if max_total_micro_usdc <= 0:
        raise ValueError("max_total_micro_usdc must be positive (matches on-chain check)")
    for name, val, max_val in (
        ("max_total_micro_usdc", max_total_micro_usdc, 0xFFFFFFFFFFFFFFFF),
        ("cost_per_unit_micro_usdc", cost_per_unit_micro_usdc, 0xFFFFFFFFFFFFFFFF),
        ("max_rate_usd_per_min_bits", max_rate_usd_per_min_bits, 0xFFFFFFFFFFFFFFFF),
        ("settlement_interval_secs", settlement_interval_secs, 0xFFFFFFFF),
    ):
        if val < 0 or val > max_val:
            raise ValueError(f"{name}={val} out of range")

    return (
        bytes([OPEN_PAYMENT_STREAM_DISCRIMINATOR])
        + bytes([bump])
        + int(max_total_micro_usdc).to_bytes(8, "little")
        + int(cost_per_unit_micro_usdc).to_bytes(8, "little")
        + int(max_rate_usd_per_min_bits).to_bytes(8, "little")
        + int(settlement_interval_secs).to_bytes(4, "little")
    )


def build_open_payment_stream_ix(
    config: MppConfig,
    owner_pubkey: str,
    agent_pubkey: str,
    stream_pda: str,
    usdc_ata: str,
    bump: int,
    max_total_micro_usdc: int,
    cost_per_unit_micro_usdc: int,
    max_rate_usd_per_min_bits: int,
    settlement_interval_secs: int,
) -> _SimpleInstruction:
    """Build the full open_payment_stream instruction.

    Account order matches open_stream.rs:42-56:

      0. [signer]    owner                       (owner_pubkey)
      1. []          UniversalVault              (config.vault_pda)
      2. [writable]  AgentPaymentStream PDA      (stream_pda)
      3. []          USDC mint                   (config.usdc_mint)
      4. []          USDC ATA                    (usdc_ata, created
                                                   separately by SPL ATA ix)
      5. []          AgentGrant pubkey           (agent_pubkey)
      6. []          MPP settler                 (config.settler_pubkey)
      7. []          System Program

    The frontend signs this in-browser with the owner's wallet adapter,
    typically alongside an SPL Associated Token Program `create` ix in
    the same transaction.
    """
    if not config.vault_pda:
        raise ValueError(
            "config.vault_pda is required to build open_payment_stream ix; "
            "set KS_VAULT_PDA env var",
        )

    accounts = (
        _SimpleAccountMeta(pubkey=owner_pubkey, is_signer=True, is_writable=False),
        _SimpleAccountMeta(pubkey=config.vault_pda, is_signer=False, is_writable=False),
        _SimpleAccountMeta(pubkey=stream_pda, is_signer=False, is_writable=True),
        _SimpleAccountMeta(pubkey=config.usdc_mint, is_signer=False, is_writable=False),
        _SimpleAccountMeta(pubkey=usdc_ata, is_signer=False, is_writable=False),
        _SimpleAccountMeta(pubkey=agent_pubkey, is_signer=False, is_writable=False),
        _SimpleAccountMeta(pubkey=config.settler_pubkey, is_signer=False, is_writable=False),
        _SimpleAccountMeta(pubkey=SYSTEM_PROGRAM_ID, is_signer=False, is_writable=False),
    )
    return _SimpleInstruction(
        program_id=config.keyshield_program_id,
        accounts=accounts,
        data=build_open_payment_stream_ix_data(
            bump=bump,
            max_total_micro_usdc=max_total_micro_usdc,
            cost_per_unit_micro_usdc=cost_per_unit_micro_usdc,
            max_rate_usd_per_min_bits=max_rate_usd_per_min_bits,
            settlement_interval_secs=settlement_interval_secs,
        ),
    )


def build_withdraw_agent_wallet_ix_data(withdraw_amount_micro_usdc: int) -> bytes:
    """Construct the full ix data payload for `withdraw_agent_wallet`.

    Wire layout (matches withdraw.rs after dispatcher strips byte 0):

      [0]:    discriminator = 27 (0x1b)
      [1..9]: withdraw_amount as u64 little-endian

    Total 9 bytes. Withdraw.rs:59 checks `data.len() < 8` after
    dispatcher strip, which corresponds to this 9-byte wire payload.
    """
    if withdraw_amount_micro_usdc < 0:
        raise ValueError("withdraw_amount_micro_usdc must be non-negative")
    if withdraw_amount_micro_usdc > 0xFFFFFFFFFFFFFFFF:
        raise ValueError("withdraw_amount_micro_usdc exceeds u64 range")
    return bytes([WITHDRAW_AGENT_WALLET_DISCRIMINATOR]) + int(withdraw_amount_micro_usdc).to_bytes(
        8, "little"
    )


def build_withdraw_agent_wallet_ix(
    config: MppConfig,
    owner_pubkey: str,
    stream_pda: str,
    stream_ata: str,
    owner_ata: str,
    withdraw_amount_micro_usdc: int,
) -> _SimpleInstruction:
    """Build the full withdraw_agent_wallet instruction.

    Account order matches withdraw.rs:38-45:

      0. [signer, writable]  owner                (owner_pubkey)
      1. []                  UniversalVault       (config.vault_pda)
      2. [writable]          AgentPaymentStream   (stream_pda)
      3. [writable]          PaymentStream's ATA  (stream_ata, drained)
      4. [writable]          Owner's USDC ATA     (owner_ata, recipient)
      5. []                  USDC mint            (config.usdc_mint)
      6. []                  SPL Token Program

    Owner must have already revoked the agent grant (`is_active=0` and
    `revoked_at != 0`) — see withdraw.rs:9-13. The frontend signs this
    in-browser with the owner's wallet adapter.
    """
    if not config.vault_pda:
        raise ValueError(
            "config.vault_pda is required to build withdraw_agent_wallet ix; "
            "set KS_VAULT_PDA env var",
        )

    accounts = (
        _SimpleAccountMeta(pubkey=owner_pubkey, is_signer=True, is_writable=True),
        _SimpleAccountMeta(pubkey=config.vault_pda, is_signer=False, is_writable=False),
        _SimpleAccountMeta(pubkey=stream_pda, is_signer=False, is_writable=True),
        _SimpleAccountMeta(pubkey=stream_ata, is_signer=False, is_writable=True),
        _SimpleAccountMeta(pubkey=owner_ata, is_signer=False, is_writable=True),
        _SimpleAccountMeta(pubkey=config.usdc_mint, is_signer=False, is_writable=False),
        _SimpleAccountMeta(pubkey=TOKEN_PROGRAM_ID, is_signer=False, is_writable=False),
    )
    return _SimpleInstruction(
        program_id=config.keyshield_program_id,
        accounts=accounts,
        data=build_withdraw_agent_wallet_ix_data(withdraw_amount_micro_usdc),
    )


# ─── Spec 10 owner-signed vault / grant / multi-ix submit ────────────────
#
# OpenPaymentStream requires an existing UniversalVault + active agent
# grant. Those ixs are owner-signed. On the Devnet self-contained path
# the settler keypair IS the owner, so the server can sign them with
# KS_MPP_SETTLER_KEY. Phantom / wallet-adapter remains the path when
# the owner is a different key.

CREATE_UNIVERSAL_VAULT_DISCRIMINATOR = 10
UPDATE_UNIVERSAL_POLICY_DISCRIMINATOR = 11
GRANT_AGENT_ACCESS_DISCRIMINATOR = 20
PAYMENT_ENABLED_FLAG = 0x08
VAULT_SEED = b"universal_vault"


def coerce_pubkey32(value: bytes | str) -> bytes:
    """Accept a 32-byte pubkey or a base58 string and return 32 bytes."""
    raw = _b58decode(value) if isinstance(value, str) else bytes(value)
    if len(raw) != 32:
        raise ValueError(f"pubkey must be 32 bytes, got {len(raw)}")
    return raw


def _simple_to_solders(ix: _SimpleInstruction):
    if not _HAS_SOLDERS:
        raise MppSubmitError(
            "solders package not installed — cannot submit a signed transaction",
        )
    return SoldersInstruction(  # type: ignore[union-attr]
        program_id=Pubkey.from_string(ix.program_id),  # type: ignore[union-attr]
        accounts=[
            AccountMeta(  # type: ignore[union-attr]
                pubkey=Pubkey.from_string(a.pubkey),  # type: ignore[union-attr]
                is_signer=a.is_signer,
                is_writable=a.is_writable,
            )
            for a in ix.accounts
        ],
        data=ix.data,
    )


async def submit_signed_instructions(
    rpc_url: str,
    fee_payer_secret: bytes,
    instructions: list[_SimpleInstruction],
) -> str:
    """Sign `instructions` with a 64-byte Solana secret and send.

    Returns the base58 signature. Does not log key material.
    """
    if not _HAS_SOLDERS:
        raise MppSubmitError(
            "solders package not installed — cannot submit a signed transaction",
        )
    if not isinstance(fee_payer_secret, (bytes, bytearray)) or len(fee_payer_secret) != 64:
        raise MppSubmitError("fee payer secret must be 64 bytes")
    if not instructions:
        raise MppSubmitError("no instructions to submit")
    try:
        import httpx  # type: ignore
    except ImportError as e:
        raise MppSubmitError(f"httpx not installed: {e}") from e

    try:
        kp = Keypair.from_bytes(bytes(fee_payer_secret))  # type: ignore[union-attr]
        solders_ixs = [_simple_to_solders(ix) for ix in instructions]
    except MppSubmitError:
        raise
    except Exception as e:  # noqa: BLE001
        raise MppSubmitError(f"failed to build solders ix: {e}") from e

    async with httpx.AsyncClient(timeout=20) as client:
        resp = await client.post(
            rpc_url,
            json={
                "jsonrpc": "2.0",
                "id": 1,
                "method": "getLatestBlockhash",
                "params": [{"commitment": "confirmed"}],
            },
        )
        if resp.status_code != 200:
            raise MppSubmitError(f"getLatestBlockhash returned HTTP {resp.status_code}")
        bh_body = resp.json()
        if "error" in bh_body:
            raise MppSubmitError(f"getLatestBlockhash error: {bh_body['error']}")
        blockhash_str = (bh_body.get("result") or {}).get("value", {}).get("blockhash")
        if not blockhash_str:
            raise MppSubmitError("getLatestBlockhash response missing blockhash")
        try:
            blockhash = Hash.from_string(blockhash_str)  # type: ignore[union-attr]
            msg = Message.new_with_blockhash(  # type: ignore[union-attr]
                solders_ixs,
                kp.pubkey(),
                blockhash,
            )
            tx = Transaction([kp], msg, blockhash)  # type: ignore[union-attr]
        except Exception as e:  # noqa: BLE001
            raise MppSubmitError(f"failed to build tx: {e}") from e

        import base64

        tx_b64 = base64.b64encode(bytes(tx)).decode("ascii")
        send_resp = await client.post(
            rpc_url,
            json={
                "jsonrpc": "2.0",
                "id": 2,
                "method": "sendTransaction",
                "params": [
                    tx_b64,
                    {"encoding": "base64", "preflightCommitment": "confirmed"},
                ],
            },
        )
        if send_resp.status_code != 200:
            raise MppSubmitError(f"sendTransaction returned HTTP {send_resp.status_code}")
        send_body = send_resp.json()
        if "error" in send_body:
            raise MppSubmitError(f"sendTransaction error: {send_body['error']}")
        sig = send_body.get("result")
        if not sig:
            raise MppSubmitError("sendTransaction response missing signature")
    return str(sig)


async def rpc_account_exists(rpc_url: str, pubkey: str) -> bool:
    """True when `getAccountInfo` returns a non-null account."""
    try:
        import httpx  # type: ignore
    except ImportError as e:
        raise MppSubmitError(f"httpx not installed: {e}") from e
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.post(
            rpc_url,
            json={
                "jsonrpc": "2.0",
                "id": 1,
                "method": "getAccountInfo",
                "params": [pubkey, {"encoding": "base64"}],
            },
        )
        if resp.status_code != 200:
            raise MppSubmitError(f"getAccountInfo returned HTTP {resp.status_code}")
        body = resp.json()
        if "error" in body:
            raise MppSubmitError(f"getAccountInfo error: {body['error']}")
        return (body.get("result") or {}).get("value") is not None


def derive_universal_vault_pda(
    owner_pubkey: str,
    program_id: str,
) -> tuple[str, int]:
    """Derive the UniversalVault PDA. Seeds: [\"universal_vault\", owner]."""
    if not _HAS_SOLDERS:
        raise MppSubmitError(
            "solders not installed — cannot derive vault PDA. Install via `pip install solders`.",
        )
    try:
        owner_pk = Pubkey.from_string(owner_pubkey)  # type: ignore[union-attr]
        program_pk = Pubkey.from_string(program_id)  # type: ignore[union-attr]
    except Exception as e:  # noqa: BLE001
        raise MppSubmitError(f"invalid pubkey for vault PDA derivation: {e}") from e

    pda, bump = Pubkey.find_program_address(  # type: ignore[union-attr]
        [VAULT_SEED, bytes(owner_pk)],
        program_pk,
    )
    return (str(pda), bump)


def build_create_universal_vault_ix_data(bump: int) -> bytes:
    """Wire: [0]=10 CreateUniversalVault, [1]=vault_bump."""
    if not 0 <= bump <= 0xFF:
        raise ValueError("bump must fit u8 (0..=255)")
    return bytes([CREATE_UNIVERSAL_VAULT_DISCRIMINATOR, bump])


def build_create_universal_vault_ix(
    program_id: str,
    owner_pubkey: str,
    vault_pda: str,
    bump: int,
) -> _SimpleInstruction:
    """Accounts match universal_vault.rs:35-38."""
    accounts = (
        _SimpleAccountMeta(pubkey=owner_pubkey, is_signer=True, is_writable=True),
        _SimpleAccountMeta(pubkey=vault_pda, is_signer=False, is_writable=True),
        _SimpleAccountMeta(pubkey=SYSTEM_PROGRAM_ID, is_signer=False, is_writable=False),
    )
    return _SimpleInstruction(
        program_id=program_id,
        accounts=accounts,
        data=build_create_universal_vault_ix_data(bump),
    )


def build_update_universal_policy_flags_ix_data(flags: int) -> bytes:
    """Wire: [0]=11, [1..5]=flags u32 LE, [5]=update_type 0 (set_flags)."""
    if flags < 0 or flags > 0xFFFFFFFF:
        raise ValueError("flags must fit u32")
    return (
        bytes([UPDATE_UNIVERSAL_POLICY_DISCRIMINATOR])
        + int(flags).to_bytes(4, "little")
        + bytes([0])
    )


def build_update_universal_policy_flags_ix(
    program_id: str,
    owner_pubkey: str,
    vault_pda: str,
    flags: int = PAYMENT_ENABLED_FLAG,
) -> _SimpleInstruction:
    """Accounts match universal_vault.rs:142-144."""
    accounts = (
        _SimpleAccountMeta(pubkey=owner_pubkey, is_signer=True, is_writable=False),
        _SimpleAccountMeta(pubkey=vault_pda, is_signer=False, is_writable=True),
    )
    return _SimpleInstruction(
        program_id=program_id,
        accounts=accounts,
        data=build_update_universal_policy_flags_ix_data(flags),
    )


def build_grant_agent_access_ix_data(
    agent_pubkey: bytes | str,
    *,
    key_group: int = 255,
    rate_limit_calls: int = 0,
    rate_limit_tokens: int = 0,
    session_timeout: int = 0,
    max_spend_micro_usdc: int = 0,
    payment_stream_enabled: bool = False,
) -> bytes:
    """Wire matches agent_access.rs:37-46. 61 bytes including discriminator."""
    agent = coerce_pubkey32(agent_pubkey)
    if not 0 <= key_group <= 0xFF:
        raise ValueError("key_group must fit u8")
    for name, val, width in (
        ("rate_limit_calls", rate_limit_calls, 0xFFFFFFFF),
        ("rate_limit_tokens", rate_limit_tokens, 0xFFFFFFFF),
        ("session_timeout", session_timeout, 0xFFFFFFFFFFFFFFFF),
        ("max_spend_micro_usdc", max_spend_micro_usdc, 0xFFFFFFFFFFFFFFFF),
    ):
        if val < 0 or val > width:
            raise ValueError(f"{name}={val} out of range")
    return (
        bytes([GRANT_AGENT_ACCESS_DISCRIMINATOR])
        + agent
        + bytes([key_group])
        + int(rate_limit_calls).to_bytes(4, "little")
        + int(rate_limit_tokens).to_bytes(4, "little")
        + int(session_timeout).to_bytes(8, "little")
        + int(max_spend_micro_usdc).to_bytes(8, "little")
        + bytes([1 if payment_stream_enabled else 0])
        + (0).to_bytes(2, "little")
    )


def build_grant_agent_access_ix(
    program_id: str,
    owner_pubkey: str,
    vault_pda: str,
    agent_pubkey: bytes | str,
    *,
    key_group: int = 255,
    rate_limit_calls: int = 0,
    rate_limit_tokens: int = 0,
    session_timeout: int = 0,
    max_spend_micro_usdc: int = 0,
    payment_stream_enabled: bool = False,
) -> _SimpleInstruction:
    """Accounts match agent_access.rs:33-35."""
    accounts = (
        _SimpleAccountMeta(pubkey=owner_pubkey, is_signer=True, is_writable=True),
        _SimpleAccountMeta(pubkey=vault_pda, is_signer=False, is_writable=True),
    )
    return _SimpleInstruction(
        program_id=program_id,
        accounts=accounts,
        data=build_grant_agent_access_ix_data(
            agent_pubkey,
            key_group=key_group,
            rate_limit_calls=rate_limit_calls,
            rate_limit_tokens=rate_limit_tokens,
            session_timeout=session_timeout,
            max_spend_micro_usdc=max_spend_micro_usdc,
            payment_stream_enabled=payment_stream_enabled,
        ),
    )
