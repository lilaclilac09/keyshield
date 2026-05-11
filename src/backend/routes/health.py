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
