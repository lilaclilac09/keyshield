# conftest for KeyShield tests
import sys
from pathlib import Path

_repo = Path(__file__).resolve().parent  # keyshield/
_src = _repo / "src"
if str(_src) not in sys.path:
    sys.path.insert(0, str(_src))


def _auth(login=True):
    """Fixture that returns auth headers dict for a logged-in user."""
    if login:
        return {"Authorization": "Bearer test-token"}
    return {}
