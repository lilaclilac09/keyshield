"""Subscription layers + three device levels.

Humans buy seats (devices). Agents buy calls (pay-as-you-go / MPP / x402).
The hybrid is the product: a monthly plan covers the control plane and
included usage; anything beyond that meters from the existing ledger.
"""

from __future__ import annotations

import sqlite3
import time
from pathlib import Path

DB_PATH = Path(__file__).parent.parent / "data" / "usage.db"

DEVICE_LEVELS = ("personal", "companion", "runtime")

FEATURE_COPY = {
    "passkey_collect": "Passkey auto-collection — Face ID / Touch ID devices enroll themselves.",
    "vault_save": "Save secrets in the Path A vault (WebAuthn-PRF → HKDF → AES-GCM). Server stores ciphertext only.",
    "auto_plugin": "Auto plugins — SDK / CLI inject the decrypted key at request time (`X-Upstream-API-Key`).",
    "biometric_zk": "Biometric ZK verify — passkey PRF proves this device. The server never sees the raw key.",
    "accelerate": "Acceleration — RPC cache, batch RPC, and parallel quote + analyze on the hot path.",
    "low_latency": "Extreme low latency — Groq urgent path, cached Helius TTLs, sub-200ms trading budget.",
}

WHY = {
    "hybrid": (
        "Subscribe for trusted devices and a monthly included budget. "
        "Pay-as-you-go meters agent calls after that budget, so a runaway "
        "bot cannot become an unlimited monthly liability."
    ),
    "subscription": (
        "A subscription pays for the control plane: Path A vault seats, "
        "passkey/PRF devices, session minting, auto-plugins, biometric ZK, "
        "and a predictable included proxy budget. Humans have calendars; "
        "seats and latency SLAs are monthly."
    ),
    "payg": (
        "Pay-as-you-go (ledger top-up, MPP streams, x402) pays for agent "
        "commerce. Inference and RPC are bursty. Each proxy call / settle "
        "debits the balance. Agents do not have months — they have calls."
    ),
    "scope": (
        "Free collects passkeys and saves keys in the vault. "
        "Plugin (paid 1) turns the vault into auto-plugins plus biometric "
        "ZK verify. Accelerate (paid 2) is acceleration of the hot path: cache, "
        "batch, and extreme low latency. Every tier still meters overage "
        "as pay-as-you-go so usage cannot outrun the ledger."
    ),
}

DEVICE_LEVEL_COPY = {
    "personal": {
        "id": "personal",
        "title": "Personal workstation",
        "summary": "Laptop or desktop with the Path A vault. WebAuthn-PRF decrypts keys on this device only.",
    },
    "companion": {
        "id": "companion",
        "title": "Companion",
        "summary": "Phone or tablet passkey. Biometric sign-in and unlock; it is not the vault source of truth.",
    },
    "runtime": {
        "id": "runtime",
        "title": "Runtime / agent host",
        "summary": "Headless box, CI, or bot. Holds a session token only — never the raw provider key.",
    },
}

PLANS: dict[str, dict] = {
    "starter": {
        "id": "starter",
        "name": "Free",
        "tier": "free",
        "billing": "payg",
        "monthly_usd": 0.0,
        "included_usd": 0.0,
        "devices": {"personal": 1, "companion": 0, "runtime": 1},
        "features": ["passkey_collect", "vault_save"],
        "promise": "Passkey auto-collection and save in the vault. Agent calls are pay-as-you-go.",
        "blurb": "One personal vault device and one agent. Collect passkeys, seal keys on-device, then PAYG.",
    },
    "pro": {
        "id": "pro",
        "name": "Plugin",
        "tier": "paid_1",
        "billing": "subscription+payg",
        "monthly_usd": 12.0,
        "included_usd": 20.0,
        "devices": {"personal": 1, "companion": 1, "runtime": 1},
        "features": ["passkey_collect", "vault_save", "auto_plugin", "biometric_zk"],
        "promise": "Plugins inject keys automatically. Biometric ZK verifies the device.",
        "blurb": "All three device levels. Auto-plugin SDK/CLI + biometric ZK. $20 included, then PAYG.",
    },
    "accelerate": {
        "id": "accelerate",
        "name": "Accelerate",
        "tier": "paid_2",
        "billing": "subscription+payg",
        "monthly_usd": 49.0,
        "included_usd": 100.0,
        "devices": {"personal": 3, "companion": 3, "runtime": 10},
        "features": [
            "passkey_collect",
            "vault_save",
            "auto_plugin",
            "biometric_zk",
            "accelerate",
            "low_latency",
        ],
        "promise": "Acceleration and extreme low latency for the trading / agent hot path.",
        "blurb": "Fleet seats. RPC cache, batch, Groq-class latency. $100 included each month, then PAYG.",
    },
}

DEFAULT_PLAN_ID = "starter"


class PlanLimitError(Exception):
    def __init__(self, payload: dict):
        self.payload = payload
        super().__init__(payload.get("detail", "plan limit"))


def _db() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(DB_PATH), check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS user_plan (
            user_id          TEXT PRIMARY KEY,
            plan_id          TEXT NOT NULL,
            selected_at      INTEGER NOT NULL,
            last_credit_period TEXT
        );
        CREATE TABLE IF NOT EXISTS user_devices (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id     TEXT    NOT NULL,
            level       TEXT    NOT NULL,
            name        TEXT    NOT NULL DEFAULT '',
            kind        TEXT    NOT NULL DEFAULT 'passkey',
            ref_id      TEXT    NOT NULL,
            created_at  INTEGER NOT NULL,
            UNIQUE(user_id, kind, ref_id)
        );
        CREATE INDEX IF NOT EXISTS idx_user_devices_user
            ON user_devices (user_id, level);
        """
    )
    conn.commit()
    return conn


def _plan_public(plan: dict) -> dict:
    out = dict(plan)
    out["devices"] = dict(plan["devices"])
    out["features"] = list(plan["features"])
    out["feature_copy"] = {
        fid: FEATURE_COPY[fid] for fid in plan["features"] if fid in FEATURE_COPY
    }
    return out


def catalog() -> dict:
    return {
        "plans": [_plan_public(p) for p in PLANS.values()],
        "device_levels": [DEVICE_LEVEL_COPY[k] for k in DEVICE_LEVELS],
        "features": dict(FEATURE_COPY),
        "why": WHY,
        "default_plan_id": DEFAULT_PLAN_ID,
    }


def _normalize_level(level: str) -> str:
    key = (level or "").strip().lower()
    if key not in DEVICE_LEVELS:
        raise PlanLimitError(
            {
                "detail": f"device_level must be one of {list(DEVICE_LEVELS)}",
                "code": "bad_device_level",
            }
        )
    return key


def get_plan_id(user_id: str) -> str:
    conn = _db()
    try:
        row = conn.execute("SELECT plan_id FROM user_plan WHERE user_id = ?", (user_id,)).fetchone()
        if row and row["plan_id"] in PLANS:
            return str(row["plan_id"])
        return DEFAULT_PLAN_ID
    finally:
        conn.close()


def _period() -> str:
    return time.strftime("%Y-%m", time.gmtime())


def _passkeys(user_id: str) -> list[dict]:
    try:
        from ..auth import passkey as pk_mod

        return list(pk_mod.list_credentials(user_id) or [])
    except Exception:
        return []


def _agents(user_id: str) -> list[dict]:
    try:
        from ..agents import agents as agents_mod

        return list(agents_mod.list_agents(user_id) or [])
    except Exception:
        return []


def list_device_rows(user_id: str) -> list[dict]:
    conn = _db()
    try:
        rows = conn.execute(
            """
            SELECT id, level, name, kind, ref_id, created_at
            FROM user_devices
            WHERE user_id = ?
            ORDER BY created_at
            """,
            (user_id,),
        ).fetchall()
        return [
            {
                "id": r["id"],
                "level": r["level"],
                "name": r["name"],
                "kind": r["kind"],
                "ref_id": r["ref_id"],
                "created_at": r["created_at"],
            }
            for r in rows
        ]
    finally:
        conn.close()


def device_usage(user_id: str) -> dict[str, int]:
    """How many seats of each level this user currently occupies."""
    tagged = {level: 0 for level in DEVICE_LEVELS}
    tagged_refs: set[str] = set()
    for row in list_device_rows(user_id):
        if row["level"] in tagged:
            tagged[row["level"]] += 1
        tagged_refs.add(f"{row['kind']}:{row['ref_id']}")

    untagged = 0
    for cred in _passkeys(user_id):
        key = f"passkey:{cred.get('id')}"
        if key not in tagged_refs:
            untagged += 1
    tagged["personal"] += untagged
    tagged["runtime"] = max(tagged["runtime"], len(_agents(user_id)))
    return tagged


def snapshot(user_id: str) -> dict:
    plan_id = get_plan_id(user_id)
    plan = _plan_public(PLANS[plan_id])
    used = device_usage(user_id)
    caps = plan["devices"]
    remaining = {
        level: max(0, int(caps[level]) - int(used.get(level, 0))) for level in DEVICE_LEVELS
    }
    conn = _db()
    try:
        row = conn.execute(
            "SELECT selected_at, last_credit_period FROM user_plan WHERE user_id = ?",
            (user_id,),
        ).fetchone()
    finally:
        conn.close()
    features = list(plan["features"])
    return {
        "plan": plan,
        "used": used,
        "remaining": remaining,
        "devices": list_device_rows(user_id),
        "why": WHY,
        "device_levels": [DEVICE_LEVEL_COPY[k] for k in DEVICE_LEVELS],
        "features": features,
        "allows": {fid: fid in features for fid in FEATURE_COPY},
        "selected_at": int(row["selected_at"]) if row else None,
        "last_credit_period": row["last_credit_period"] if row else None,
        "period": _period(),
    }


def allows_feature(user_id: str, feature: str) -> bool:
    plan_id = get_plan_id(user_id)
    return feature in PLANS[plan_id]["features"]


def assert_feature(user_id: str, feature: str) -> dict:
    snap = snapshot(user_id)
    if feature not in snap["features"]:
        raise PlanLimitError(
            {
                "detail": (
                    f"{snap['plan']['name']} does not include {feature}. "
                    "Upgrade the subscription for this control-plane feature. "
                    "Pay-as-you-go top-up only covers extra proxy calls."
                ),
                "code": "plan_feature",
                "feature": feature,
                "plan_id": snap["plan"]["id"],
            }
        )
    return snap


def assert_slot(user_id: str, level: str, extra: int = 1) -> dict:
    """Raise PlanLimitError if adding `extra` seats of `level` would exceed the plan."""
    level = _normalize_level(level)
    snap = snapshot(user_id)
    cap = int(snap["plan"]["devices"][level])
    used = int(snap["used"].get(level, 0))
    if used + extra > cap:
        raise PlanLimitError(
            {
                "detail": (
                    f"{snap['plan']['name']} includes {cap} {level} device"
                    f"{'' if cap == 1 else 's'}; {used} in use. "
                    "Upgrade the subscription for more seats, or use pay-as-you-go "
                    "top-up only for extra proxy calls — seats are plan-gated."
                ),
                "code": "plan_limit",
                "level": level,
                "used": used,
                "cap": cap,
                "plan_id": snap["plan"]["id"],
            }
        )
    return snap


def claim_device(
    user_id: str,
    level: str,
    name: str,
    *,
    kind: str = "passkey",
    ref_id: str,
) -> dict:
    level = _normalize_level(level)
    kind = (kind or "passkey").strip() or "passkey"
    ref_id = (ref_id or "").strip()
    if not ref_id:
        raise PlanLimitError({"detail": "ref_id required", "code": "bad_ref"})
    conn = _db()
    try:
        existing = conn.execute(
            "SELECT id, level FROM user_devices WHERE user_id = ? AND kind = ? AND ref_id = ?",
            (user_id, kind, ref_id),
        ).fetchone()
        existing_id = int(existing["id"]) if existing else None
        existing_level = str(existing["level"]) if existing else None
    finally:
        conn.close()

    if existing_id is not None and existing_level == level:
        conn = _db()
        try:
            conn.execute(
                "UPDATE user_devices SET name = ? WHERE id = ?",
                ((name or "")[:64], existing_id),
            )
            conn.commit()
        finally:
            conn.close()
        return snapshot(user_id)

    if existing_id is not None and existing_level != level:
        assert_slot(user_id, level, extra=1)
        conn = _db()
        try:
            conn.execute(
                "UPDATE user_devices SET name = ?, level = ? WHERE id = ?",
                ((name or "")[:64], level, existing_id),
            )
            conn.commit()
        finally:
            conn.close()
        return snapshot(user_id)

    assert_slot(user_id, level, extra=1)
    conn = _db()
    try:
        conn.execute(
            """
            INSERT INTO user_devices (user_id, level, name, kind, ref_id, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (user_id, level, (name or "")[:64], kind, ref_id, int(time.time())),
        )
        conn.commit()
    except sqlite3.IntegrityError:
        pass
    finally:
        conn.close()
    return snapshot(user_id)


def release_device(user_id: str, *, kind: str, ref_id: str) -> None:
    conn = _db()
    try:
        conn.execute(
            "DELETE FROM user_devices WHERE user_id = ? AND kind = ? AND ref_id = ?",
            (user_id, kind, ref_id),
        )
        conn.commit()
    finally:
        conn.close()


def select_plan(user_id: str, plan_id: str) -> dict:
    if plan_id not in PLANS:
        raise PlanLimitError({"detail": f"unknown plan_id {plan_id}", "code": "bad_plan"})
    target = PLANS[plan_id]
    used = device_usage(user_id)
    over = [
        level for level in DEVICE_LEVELS if int(used.get(level, 0)) > int(target["devices"][level])
    ]
    if over:
        raise PlanLimitError(
            {
                "detail": (
                    f"Cannot switch to {target['name']}: in-use seats exceed "
                    f"that plan on {', '.join(over)}. Remove a device first."
                ),
                "code": "plan_downgrade_blocked",
                "over": over,
                "used": used,
                "cap": target["devices"],
            }
        )

    period = _period()
    conn = _db()
    try:
        prev = conn.execute(
            "SELECT plan_id, last_credit_period FROM user_plan WHERE user_id = ?",
            (user_id,),
        ).fetchone()
        last_period = prev["last_credit_period"] if prev else None
        prev_id = prev["plan_id"] if prev else None
        should_credit = (
            float(target["included_usd"]) > 0 and last_period != period and prev_id != plan_id
        )
        conn.execute(
            """
            INSERT INTO user_plan (user_id, plan_id, selected_at, last_credit_period)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(user_id) DO UPDATE SET
                plan_id = excluded.plan_id,
                selected_at = excluded.selected_at
            """,
            (user_id, plan_id, int(time.time()), last_period),
        )
        if should_credit:
            conn.execute(
                "UPDATE user_plan SET last_credit_period = ? WHERE user_id = ?",
                (period, user_id),
            )
        conn.commit()
    finally:
        conn.close()

    credited = 0.0
    if should_credit:
        from . import usage as usage_mod

        usage_mod.topup(user_id, float(target["included_usd"]))
        credited = float(target["included_usd"])

    snap = snapshot(user_id)
    snap["credited_usd"] = credited
    return snap
