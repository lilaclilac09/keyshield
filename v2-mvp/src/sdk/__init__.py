"""KeyShield SDK package — extracted from keyshield_sdk.py.

Public API:
    from src.sdk import KeyShield, AsyncKeyShield, AgentKeyShield
    # or (backward compat): from src.keyshield_sdk import KeyShield
"""
from .core import KeyShield, AsyncKeyShield, AgentKeyShield, KeyShieldError

# Backward compat alias
__all__ = ["KeyShield", "AsyncKeyShield", "AgentKeyShield", "KeyShieldError"]
KeyShieldSDK = KeyShield  # Alias for backward compatibility
