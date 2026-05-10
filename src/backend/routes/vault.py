"""Vault routes — REMOVED.

Path A (Cloudflare Worker + client-side AES-GCM): vault storage no longer
lives in Python. The previous /manage/store, /manage/list, /manage/decrypt,
/manage/secret endpoints have been removed. This file is intentionally
empty and is not registered in routes/__init__.py.

See docs/technical/SYNC_VAULT_ARCHITECTURE.md.
"""
