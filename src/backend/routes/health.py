"""Health and static asset routes."""

from fastapi import APIRouter
from fastapi.responses import JSONResponse, FileResponse
from pathlib import Path

router = APIRouter()


@router.get("/health")
async def health():
    return JSONResponse({"status": "ok", "version": "2.0"})


@router.get("/install.sh")
async def install_sh():
    return FileResponse(Path(__file__).parent.parent / "keyshield-cli.sh")


@router.get("/static/keyshield_sdk.py")
async def static_sdk():
    return FileResponse(Path(__file__).parent.parent / "keyshield_sdk.py")
