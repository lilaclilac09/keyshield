"""Health and static asset routes."""

import os

from fastapi import APIRouter
from fastapi.responses import JSONResponse, FileResponse
from pathlib import Path

router = APIRouter()


@router.get("/health")
async def health():
    return JSONResponse({"status": "ok", "version": "2.0"})


@router.get("/health/mpp")
async def health_mpp():
    """Show which MPP env vars are *present* — never echo secret values."""
    vars_to_check = [
        "KS_MPP_SETTLER_KEY",
        "KS_PLATFORM_USDC_ATA",
        "KS_KEYSHIELD_PROGRAM_ID",
        "KS_VAULT_PDA",
        "KS_SOLANA_RPC_URL",
        "KS_RPC_URL",
        "KS_USDC_MINT",
        "KS_MPP_SETTLER_PUBKEY",
        "KS_PROGRAM_ID",
        "KS_X402_ENABLED",
        "SERVER_SECRET",
    ]
    present = {v: bool(os.environ.get(v, "").strip()) for v in vars_to_check}

    # Try loading mpp config to see if it succeeds
    try:
        from ..mpp import mpp_onchain

        cfg = mpp_onchain.load_mpp_config()
        mpp_ok = cfg is not None
        program_id = cfg.keyshield_program_id if cfg else None
    except Exception as e:
        mpp_ok = False
        program_id = str(e)

    return JSONResponse(
        {
            "mpp_config_loaded": mpp_ok,
            "active_program_id": program_id,
            "env_vars": present,
        }
    )


@router.get("/install.sh")
async def install_sh():
    path = Path(__file__).parent.parent / "keyshield-cli.sh"
    if not path.exists():
        return JSONResponse(
            {"error": "install script not packaged with this build"},
            status_code=404,
        )
    return FileResponse(path)


@router.get("/static/keyshield_sdk.py")
async def static_sdk():
    path = Path(__file__).parent.parent / "keyshield_sdk.py"
    if not path.exists():
        return JSONResponse(
            {"error": "sdk not packaged with this build"},
            status_code=404,
        )
    return FileResponse(path)
