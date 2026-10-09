#!/usr/bin/env python3
"""Bootstrap `.keyshield-devnet/` without solana-cli.

Writes a settler keypair JSON (gitignored), derives the platform USDC
ATA and vault PDA offline, and prints an eval-able env block that
`load_mpp_config()` accepts (base58 64-byte secret, not a file path).

Does not airdrop, deploy, or create the ATA on-chain. The already-
deployed Devnet program id is the default.
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
CACHE = Path(os.environ.get("KS_DEVNET_CACHE_DIR", REPO / ".keyshield-devnet"))
PROGRAM_ID = os.environ.get(
    "KS_KEYSHIELD_PROGRAM_ID",
    "41P2wHKAr69aSgLgt1QdKH6VVgK6uFYKM7hpKAyBxr9j",
)
USDC_MINT = os.environ.get(
    "KS_USDC_MINT",
    "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
)
RPC = os.environ.get("KS_SOLANA_RPC_URL", "https://api.devnet.solana.com")
TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
ATA_PROGRAM = "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"


def _b58encode(raw: bytes) -> str:
    alph = b"123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"
    n = int.from_bytes(raw, "big")
    out = bytearray()
    while n:
        n, r = divmod(n, 58)
        out.append(alph[r])
    pad = 0
    for byte in raw:
        if byte:
            break
        pad += 1
    return (alph[0:1] * pad + bytes(reversed(out))).decode()


def main() -> int:
    try:
        from solders.keypair import Keypair
        from solders.pubkey import Pubkey
    except ImportError:
        print("solders required: .venv/bin/pip install solders", file=sys.stderr)
        return 2

    CACHE.mkdir(parents=True, exist_ok=True)
    key_path = CACHE / "mpp-settler-devnet.json"
    if key_path.exists() and "--refresh" not in sys.argv:
        kp = Keypair.from_bytes(bytes(json.loads(key_path.read_text())))
    else:
        kp = Keypair()
        key_path.write_text(json.dumps(list(bytes(kp))))
        key_path.chmod(0o600)

    owner = kp.pubkey()
    program = Pubkey.from_string(PROGRAM_ID)
    vault_pda, _ = Pubkey.find_program_address(
        [b"universal_vault", bytes(owner)],
        program,
    )
    ata, _ = Pubkey.find_program_address(
        [
            bytes(owner),
            bytes(Pubkey.from_string(TOKEN_PROGRAM)),
            bytes(Pubkey.from_string(USDC_MINT)),
        ],
        Pubkey.from_string(ATA_PROGRAM),
    )

    (CACHE / "program-id.txt").write_text(PROGRAM_ID + "\n")
    (CACHE / "platform-usdc-ata.txt").write_text(str(ata) + "\n")
    secret_b58 = _b58encode(bytes(kp))
    env_path = CACHE / "env.sh"
    env_path.write_text(
        "\n".join(
            [
                f'export KS_MPP_SETTLER_KEY="{secret_b58}"',
                f'export KS_MPP_SETTLER_KEYPAIR="{key_path}"',
                f'export KS_MPP_SETTLER_PUBKEY="{owner}"',
                f'export KS_PLATFORM_USDC_ATA="{ata}"',
                f'export KS_KEYSHIELD_PROGRAM_ID="{PROGRAM_ID}"',
                f'export KS_VAULT_PDA="{vault_pda}"',
                f'export KS_SOLANA_RPC_URL="{RPC}"',
                f'export KS_USDC_MINT="{USDC_MINT}"',
                "",
            ]
        )
    )
    env_path.chmod(0o600)
    sys.stdout.write(env_path.read_text())
    print(f"# wrote {key_path} and {env_path} (gitignored)", file=sys.stderr)
    print('# source: eval "$(python3 src/scripts/devnet-keys.py)"', file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
