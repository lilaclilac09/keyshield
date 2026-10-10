"""MPP (Metered Payment Protocol) routes — streams, events, settlements,
and wallet sign-off ix builders.

Spec 10 §6a + Phase 10.5. Off-chain state lives in
`src/backend/mpp/mpp_streams.py`; on-chain ix payloads come from
`src/backend/mpp/mpp_onchain.py`.

Auth model is owner-scoped: every mutation runs through `_auth(request)`
and uses the session's `user_id` as the scope. Look-ups for streams not
owned by the caller raise `StreamNotFound` -> 404. Same convention as
`routes/agents.py`.

`build-open-tx` and `build-withdraw-tx` return the on-chain ix wrapped
into a JSON shape matching the frontend's `BuildTxResponse` (programId /
keys / base64 data) — the wallet adapter then signs + sends the
resulting `Transaction` in-browser.
"""

from __future__ import annotations

import base64
import logging

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse


router = APIRouter()
logger = logging.getLogger(__name__)


# ─── auth helper (mirrors routes/agents.py) ───────────────────────────────


def _auth(request: Request) -> dict | None:
    from ..auth import session as sess_mod

    token = request.headers.get("Authorization", "")
    if not token.startswith("Bearer "):
        return None
    return sess_mod.get(token[7:])


def _require_auth(request: Request) -> tuple[dict | None, JSONResponse | None]:
    """Returns (session, None) on success or (None, JSONResponse) on failure."""
    sess = _auth(request)
    if not sess:
        return None, JSONResponse({"detail": "unauthorized"}, status_code=401)
    return sess, None


# ─── ix → JSON shape (matches BuildTxResponse on the frontend) ────────────


def _ix_to_response(ix) -> dict:
    """Convert a `_SimpleInstruction` from mpp_onchain into the JSON shape
    expected by the frontend (programId / keys / base64 data)."""
    return {
        "programId": ix.program_id,
        "keys": [
            {
                "pubkey": a.pubkey,
                "isSigner": a.is_signer,
                "isWritable": a.is_writable,
            }
            for a in ix.accounts
        ],
        "data": base64.b64encode(ix.data).decode("ascii"),
    }


def _load_config_or_503():
    """Load mpp config from env. Returns (config, None) on success or
    (None, JSONResponse 503) when env vars are unset. Frontend handles
    503 as 'wallet sign-off not configured' and disables the CTA."""
    from ..mpp import mpp_onchain

    config = mpp_onchain.load_mpp_config()
    if config is None:
        return None, JSONResponse(
            {
                "detail": (
                    "wallet sign-off disabled: KS_KEYSHIELD_PROGRAM_ID / "
                    "KS_MPP_SETTLER_KEY / KS_PLATFORM_USDC_ATA env not set"
                )
            },
            status_code=503,
        )
    return config, None


def _fetch_owned_stream(user_id: str, stream_id: int) -> dict:
    """Open a short-lived connection, fetch the stream owned by user_id,
    close. Wraps `mpp_streams._get_owned_stream` with proper connection
    lifecycle so route handlers don't leak DB handles."""
    from ..mpp import mpp_streams

    conn = mpp_streams._db()  # noqa: SLF001
    try:
        return mpp_streams._get_owned_stream(conn, user_id, stream_id)  # noqa: SLF001
    finally:
        conn.close()


# ─── 1. GET /mpp/streams ───────────────────────────────────────────────────


@router.get("/mpp/streams")
async def mpp_list_streams(request: Request):
    """List all streams owned by the authenticated user, plus the
    summary block the dashboard summary cards bind to."""
    sess, err = _require_auth(request)
    if err:
        return err
    from ..mpp import mpp_streams

    return JSONResponse(mpp_streams.list_streams(sess["user_id"]))


# ─── 2. GET /mpp/events?limit=N ───────────────────────────────────────────


@router.get("/mpp/events")
async def mpp_list_events(request: Request, limit: int = 20):
    """Return recent stream events for the authenticated user, newest first."""
    sess, err = _require_auth(request)
    if err:
        return err
    from ..mpp import mpp_streams

    return JSONResponse(mpp_streams.list_events(sess["user_id"], limit))


@router.get("/mpp/status")
async def mpp_status_strip(request: Request):
    """Top-bar snapshot: open-stream remaining + last receipt hash/mode."""
    sess, err = _require_auth(request)
    if err:
        return err
    from ..mpp import mpp_streams

    return JSONResponse(mpp_streams.status_strip(sess["user_id"]))


# ─── 3. POST /mpp/streams (open new) ──────────────────────────────────────


@router.post("/mpp/streams")
async def mpp_open_stream(request: Request):
    """Open a new (off-chain) stream. The on-chain `open_payment_stream`
    ix is a separate Phase 10.5 wallet sign-off step — see
    /mpp/streams/{id}/build-open-tx."""
    sess, err = _require_auth(request)
    if err:
        return err
    body = await request.json()

    # Frontend sends camelCase keys with `MicroUsdc` suffixes — accept
    # both camelCase and snake_case for forward compatibility with
    # future call sites.
    agent_pubkey = body.get("agentPubkey") or body.get("agent_pubkey") or ""
    agent_name = body.get("agentName") or body.get("agent_name") or ""
    upstream = body.get("upstream", "")
    rate_per_token = (
        body.get("ratePerTokenMicroUsdc")
        if body.get("ratePerTokenMicroUsdc") is not None
        else body.get("ratePerToken", 0)
    )
    rate_per_call = (
        body.get("ratePerCallMicroUsdc")
        if body.get("ratePerCallMicroUsdc") is not None
        else body.get("ratePerCall", 0)
    )
    settlement_interval = (
        body.get("settlementIntervalSecs")
        if body.get("settlementIntervalSecs") is not None
        else body.get("settlementInterval", 60)
    )
    raw_cap = body.get("maxTotalMicroUsdc")
    if raw_cap is None:
        raw_cap = body.get("max_total_micro_usdc")
    max_total = int(raw_cap) if raw_cap is not None else None

    from ..mpp import mpp_streams

    try:
        stream = mpp_streams.open_stream(
            user_id=sess["user_id"],
            agent_pubkey=str(agent_pubkey).strip(),
            agent_name=str(agent_name).strip(),
            upstream=str(upstream).strip(),
            rate_per_token=int(rate_per_token or 0),
            rate_per_call=int(rate_per_call or 0),
            settlement_interval=int(settlement_interval or 60),
            max_total_micro_usdc=max_total,
        )
    except ValueError as e:
        return JSONResponse({"detail": str(e)}, status_code=400)
    return JSONResponse({"stream": stream})


# ─── 4. POST /mpp/streams/{id}/record ─────────────────────────────────────


@router.post("/mpp/streams/{stream_id}/record")
async def mpp_record_usage(stream_id: int, request: Request):
    """Log usage on a stream. Binds a hold to the artifact hash.
    Does not capture; the consumer signs a separate capture request."""
    sess, err = _require_auth(request)
    if err:
        return err
    import base64

    body = await request.json()
    tokens = int(body.get("tokens", 0) or 0)
    calls = int(body.get("calls", 0) or 0)
    status_code = body.get("status_code")
    raw_body = body.get("body")
    if raw_body is None and body.get("body_b64"):
        try:
            raw_body = base64.b64decode(body["body_b64"], validate=True)
        except Exception:
            return JSONResponse({"detail": "body_b64 is not valid base64"}, status_code=400)
    if status_code is None or raw_body is None:
        return JSONResponse(
            {
                "detail": "fulfillment artifact required: status_code and body",
                "code": "unverified_fulfillment",
            },
            status_code=400,
        )

    from ..mpp import mpp_streams
    from ..mpp.fulfillment import FulfillmentRejected

    try:
        stream = mpp_streams.record_usage(
            user_id=sess["user_id"],
            stream_id=stream_id,
            calls=calls,
            tokens=tokens,
            status_code=int(status_code),
            body=raw_body,
            content_type=body.get("content_type"),
        )
    except mpp_streams.StreamNotFound:
        return JSONResponse({"detail": "stream not found"}, status_code=404)
    except mpp_streams.StreamClosed:
        return JSONResponse({"detail": "stream is closed"}, status_code=409)
    except FulfillmentRejected as e:
        return JSONResponse(
            {"detail": str(e), "code": "unverified_fulfillment"},
            status_code=400,
        )
    except mpp_streams.BudgetExceeded:
        return JSONResponse(
            {"detail": "BudgetExceeded", "code": "budget_exceeded"},
            status_code=409,
        )
    except ValueError as e:
        return JSONResponse({"detail": str(e)}, status_code=400)
    return JSONResponse({"stream": stream})


# ─── 4b. POST /mpp/streams/{id}/hold ──────────────────────────────────────


@router.post("/mpp/streams/{stream_id}/hold")
async def mpp_hold_estimate(stream_id: int, request: Request):
    """Phase 1. Lock an estimated cost in the stream's available escrow."""
    sess, err = _require_auth(request)
    if err:
        return err
    body = await request.json()
    estimate = body.get("estimateMicroUsdc", body.get("estimate"))
    upstream = body.get("upstream")
    from ..mpp import mpp_streams
    from ..mpp.fulfillment import FulfillmentRejected

    if not upstream:
        try:
            owned = _fetch_owned_stream(sess["user_id"], stream_id)
        except mpp_streams.StreamNotFound:
            return JSONResponse({"detail": "stream not found"}, status_code=404)
        upstream = owned["upstream"]
    try:
        stream = mpp_streams.hold_estimate(
            sess["user_id"],
            stream_id,
            str(upstream),
            None if estimate is None else int(estimate),
        )
    except mpp_streams.StreamNotFound:
        return JSONResponse({"detail": "stream not found"}, status_code=404)
    except mpp_streams.StreamClosed:
        return JSONResponse(
            {"detail": "StreamAlreadyClosed", "code": "stream_closed"},
            status_code=409,
        )
    except mpp_streams.BudgetExceeded:
        return JSONResponse(
            {"detail": "BudgetExceeded", "code": "budget_exceeded"},
            status_code=409,
        )
    except FulfillmentRejected as e:
        return JSONResponse(
            {"detail": str(e), "code": "unverified_fulfillment"},
            status_code=400,
        )
    except ValueError as e:
        return JSONResponse({"detail": str(e)}, status_code=400)
    return JSONResponse({"stream": stream, "hold_id": stream.get("hold_id")})


# ─── 4c. POST /mpp/streams/{id}/capture ───────────────────────────────────


@router.post("/mpp/streams/{stream_id}/capture")
async def mpp_capture(stream_id: int, request: Request):
    """Phase 3. Settle one artifact when the session MAC verifies.

    The session key is the bearer token. The signature is
    HMAC-SHA256(token, artifact_hash).
    """
    sess, err = _require_auth(request)
    if err:
        return err
    token = request.headers.get("Authorization", "")
    session_key = token[7:] if token.startswith("Bearer ") else ""
    body = await request.json()
    artifact = body.get("artifactHash") or body.get("artifact_hash")
    signature = body.get("signature")
    if not artifact or signature is None:
        return JSONResponse(
            {"detail": "artifactHash and signature are required", "code": "unverified_fulfillment"},
            status_code=400,
        )
    from ..mpp import mpp_streams
    from ..mpp.fulfillment import FulfillmentRejected

    try:
        stream = mpp_streams.settle_receipt(
            sess["user_id"],
            stream_id,
            str(artifact),
            session_key=session_key,
            signature=signature,
        )
    except mpp_streams.StreamNotFound:
        return JSONResponse({"detail": "stream not found"}, status_code=404)
    except mpp_streams.StreamClosed:
        return JSONResponse(
            {"detail": "StreamAlreadyClosed", "code": "stream_closed"},
            status_code=409,
        )
    except mpp_streams.BudgetExceeded:
        return JSONResponse(
            {"detail": "BudgetExceeded", "code": "budget_exceeded"},
            status_code=409,
        )
    except mpp_streams.CaptureRejected as e:
        return JSONResponse(
            {"detail": str(e), "code": "capture_rejected"},
            status_code=409,
        )
    except mpp_streams.HoldExpired as e:
        return JSONResponse(
            {"detail": str(e), "code": "hold_expired"},
            status_code=409,
        )
    except mpp_streams.ReplayRejected as e:
        return JSONResponse({"detail": str(e), "code": "replay"}, status_code=409)
    except FulfillmentRejected as e:
        return JSONResponse(
            {"detail": str(e), "code": "unverified_fulfillment"},
            status_code=400,
        )
    try:
        from ..billing import usage as usage_mod

        usage_mod.log_call(
            user_id=sess["user_id"],
            upstream=str(stream.get("upstream") or "mpp"),
            key_type="mpp",
            method="CAPTURE",
            path=f"/mpp/streams/{stream_id}/capture",
            cost_usd=round(int(stream.get("just_settled_micro_usdc") or 0) / 1_000_000, 6),
            status_code=200,
            settle_mode=str(stream.get("settle_mode") or "captured"),
        )
    except Exception:
        logger.exception("usage log after capture failed")
    return JSONResponse({"stream": stream})


# ─── 5. POST /mpp/streams/{id}/settle ─────────────────────────────────────


@router.post("/mpp/streams/{stream_id}/settle")
async def mpp_settle_stream(stream_id: int, request: Request):
    """Drop pending that has no artifact. Does not capture.

    A closed stream is StreamAlreadyClosed (409). Capture is
    POST /mpp/streams/{id}/capture with the session MAC."""
    sess, err = _require_auth(request)
    if err:
        return err
    from ..mpp import mpp_streams

    try:
        stream = mpp_streams.settle_stream(sess["user_id"], stream_id)
    except mpp_streams.StreamNotFound:
        return JSONResponse({"detail": "stream not found"}, status_code=404)
    except mpp_streams.StreamClosed:
        return JSONResponse(
            {"detail": "StreamAlreadyClosed", "code": "stream_closed"},
            status_code=409,
        )
    except mpp_streams.BudgetExceeded:
        return JSONResponse(
            {"detail": "BudgetExceeded", "code": "budget_exceeded"},
            status_code=409,
        )
    return JSONResponse({"stream": stream})


# ─── 6. POST /mpp/streams/{id}/close ──────────────────────────────────────


@router.post("/mpp/streams/{stream_id}/close")
async def mpp_close_stream(stream_id: int, request: Request):
    """Close a stream. Open holds return to available balance.
    Idempotent: closing an already-closed stream is a no-op."""
    sess, err = _require_auth(request)
    if err:
        return err
    from ..mpp import mpp_streams

    try:
        stream = mpp_streams.close_stream(sess["user_id"], stream_id)
    except mpp_streams.StreamNotFound:
        return JSONResponse({"detail": "stream not found"}, status_code=404)
    except mpp_streams.BudgetExceeded:
        return JSONResponse(
            {"detail": "BudgetExceeded", "code": "budget_exceeded"},
            status_code=409,
        )
    return JSONResponse({"stream": stream})


# ─── 7. POST /mpp/streams/{id}/build-open-tx ──────────────────────────────


@router.post("/mpp/streams/{stream_id}/build-open-tx")
async def mpp_build_open_tx(stream_id: int, request: Request):
    """Build the on-chain `open_payment_stream` ix payload (#24).

    The frontend derives the PDA + bump locally (server can't because the
    bump must come from the signer side) and sends them in the body
    along with the USDC ATA + caps. We return BuildTxResponse
    (programId / keys / base64 data) — the wallet adapter wraps it in a
    Transaction and signs it in-browser.
    """
    sess, err = _require_auth(request)
    if err:
        return err
    body = await request.json()

    config, env_err = _load_config_or_503()
    if env_err:
        return env_err

    from ..mpp import mpp_streams, mpp_onchain

    try:
        stream = _fetch_owned_stream(sess["user_id"], stream_id)
    except mpp_streams.StreamNotFound:
        return JSONResponse({"detail": "stream not found"}, status_code=404)

    # Required fields from the BuildOpenTxBody contract.
    try:
        owner_pubkey = str(body["ownerPubkey"]).strip()
        stream_pda = str(body["streamPda"]).strip()
        bump = int(body["bump"])
        usdc_ata = str(body["usdcAta"]).strip()
        max_total = int(body["maxTotalMicroUsdc"])
    except (KeyError, TypeError, ValueError) as e:
        return JSONResponse({"detail": f"missing/invalid field: {e}"}, status_code=400)

    cost_per_unit = int(body.get("costPerUnitMicroUsdc") or 1)
    max_rate_bits = int(body.get("maxRateUsdPerMinBits") or 0)
    interval_override = int(body.get("settlementIntervalSecsOverride") or 0)
    # Fall back to the off-chain row's interval when the frontend
    # passes 0 — keeps the on-chain ix consistent with what we
    # already committed off-chain.
    settlement_interval = (
        interval_override if interval_override > 0 else int(stream["settlement_interval_secs"])
    )

    # ── ATA redesign (commit 9974a8e85) ──────────────────────────────
    # mpp_settle.rs:228 uses the stream PDA as transfer authority. For
    # that to work, the on-chain `stream.usdc_ata` MUST be an ATA whose
    # owner is the stream PDA (not the user's wallet). Server derives
    # the right ATA + returns 3 ixs the frontend bundles into one tx:
    #   1. Create stream-PDA-owned USDC ATA (idempotent).
    #   2. Transfer max_total micro-USDC from owner ATA → stream ATA.
    #   3. open_payment_stream — references stream-PDA ATA.
    try:
        stream_usdc_ata = mpp_onchain.derive_associated_token_address(
            owner_pubkey=stream_pda,
            mint_pubkey=config.usdc_mint,
        )
    except mpp_onchain.MppSubmitError as e:
        return JSONResponse({"detail": str(e)}, status_code=503)

    create_ata_ix = mpp_onchain.build_create_ata_idempotent_ix(
        payer_pubkey=owner_pubkey,
        ata_pubkey=stream_usdc_ata,
        owner_pubkey=stream_pda,
        mint_pubkey=config.usdc_mint,
    )
    fund_ix = mpp_onchain.build_spl_transfer_checked_ix(
        source_ata=usdc_ata,
        dest_ata=stream_usdc_ata,
        mint_pubkey=config.usdc_mint,
        authority_pubkey=owner_pubkey,
        amount_micro_usdc=max_total,
    )

    try:
        open_ix = mpp_onchain.build_open_payment_stream_ix(
            config=config,
            owner_pubkey=owner_pubkey,
            agent_pubkey=stream["agent_pubkey"],
            stream_pda=stream_pda,
            usdc_ata=stream_usdc_ata,  # ← PDA-owned, not user's
            bump=bump,
            max_total_micro_usdc=max_total,
            cost_per_unit_micro_usdc=cost_per_unit,
            max_rate_usd_per_min_bits=max_rate_bits,
            settlement_interval_secs=settlement_interval,
        )
    except ValueError as e:
        # build_open_payment_stream_ix raises if vault_pda is missing
        # (KS_VAULT_PDA env not set) or numeric ranges are wrong.
        return JSONResponse({"detail": str(e)}, status_code=400)

    # Frontend MUST prepend `prereqIxs` to the Transaction before the
    # main ix; old clients ignoring them are no worse off — the on-
    # chain settle would have failed at the SPL token CPI either way.
    response = _ix_to_response(open_ix)
    response["prereqIxs"] = [_ix_to_response(create_ata_ix), _ix_to_response(fund_ix)]
    response["streamUsdcAta"] = stream_usdc_ata
    return JSONResponse(response)


# ─── 8. POST /mpp/streams/{id}/build-withdraw-tx ──────────────────────────


@router.post("/mpp/streams/{stream_id}/build-withdraw-tx")
async def mpp_build_withdraw_tx(stream_id: int, request: Request):
    """Build the on-chain `withdraw_agent_wallet` ix payload (#27).

    Owner-signed in-browser. Stream PDA's USDC ATA → owner's USDC ATA.
    The agent grant must be revoked on-chain for the ix to land — the
    frontend gates the CTA on `closed_at != null`.
    """
    sess, err = _require_auth(request)
    if err:
        return err
    body = await request.json()

    config, env_err = _load_config_or_503()
    if env_err:
        return env_err

    from ..mpp import mpp_streams, mpp_onchain

    try:
        _ = _fetch_owned_stream(sess["user_id"], stream_id)
    except mpp_streams.StreamNotFound:
        return JSONResponse({"detail": "stream not found"}, status_code=404)

    try:
        owner_pubkey = str(body["ownerPubkey"]).strip()
        stream_pda = str(body["streamPda"]).strip()
        stream_ata = str(body["streamAta"]).strip()
        owner_ata = str(body["ownerAta"]).strip()
        amount = int(body["withdrawAmountMicroUsdc"])
    except (KeyError, TypeError, ValueError) as e:
        return JSONResponse({"detail": f"missing/invalid field: {e}"}, status_code=400)

    try:
        ix = mpp_onchain.build_withdraw_agent_wallet_ix(
            config=config,
            owner_pubkey=owner_pubkey,
            stream_pda=stream_pda,
            stream_ata=stream_ata,
            owner_ata=owner_ata,
            withdraw_amount_micro_usdc=amount,
        )
    except ValueError as e:
        return JSONResponse({"detail": str(e)}, status_code=400)
    return JSONResponse(_ix_to_response(ix))


# ─── 9. POST /mpp/streams/{id}/record-tx ──────────────────────────────────


@router.post("/mpp/streams/{stream_id}/record-tx")
async def mpp_record_tx(stream_id: int, request: Request):
    """Persist the on-chain tx signature returned by the wallet adapter.
    Used after `build-open-tx` (or `build-withdraw-tx`) — the frontend
    awaits 'confirmed' commitment before posting here so the UI can
    flip from a CTA to a green Solana-explorer link."""
    sess, err = _require_auth(request)
    if err:
        return err
    body = await request.json()
    sig = str(body.get("tx_signature") or body.get("txSignature") or "").strip()
    if not sig:
        return JSONResponse({"detail": "tx_signature is required"}, status_code=400)

    from ..mpp import mpp_streams

    try:
        stream = mpp_streams.record_tx_signature(sess["user_id"], stream_id, sig)
    except mpp_streams.StreamNotFound:
        return JSONResponse({"detail": "stream not found"}, status_code=404)
    except ValueError as e:
        return JSONResponse({"detail": str(e)}, status_code=400)
    return JSONResponse({"stream": stream})


def _autosign_error(exc: Exception) -> JSONResponse:
    from ..mpp.owner_keystore import OwnerKeystoreError
    from ..mpp.owner_submit import OwnerSubmitError
    from ..mpp.mpp_onchain import MppSubmitError

    if isinstance(exc, OwnerKeystoreError):
        return JSONResponse({"detail": "owner autosign unavailable"}, status_code=503)
    if isinstance(exc, OwnerSubmitError):
        detail = str(exc)
        if "not loaded" in detail:
            return JSONResponse({"detail": "owner autosign unavailable"}, status_code=503)
        return JSONResponse({"detail": detail}, status_code=400)
    if isinstance(exc, MppSubmitError):
        return JSONResponse({"detail": str(exc)}, status_code=409)
    logger.exception("mpp autosign failed")
    return JSONResponse({"detail": "autosign failed"}, status_code=500)


@router.get("/mpp/autosign/status")
async def mpp_autosign_status(request: Request):
    sess, err = _require_auth(request)
    if err:
        return err
    from ..mpp import owner_submit

    return JSONResponse(owner_submit.owner_status())


@router.post("/mpp/autosign/open")
async def mpp_autosign_open(request: Request):
    """Vault + grant + open + record-tx, owner-signed from the keystore."""
    sess, err = _require_auth(request)
    if err:
        return err
    body = await request.json()
    from ..mpp import owner_submit
    from ..mpp.owner_keystore import OwnerKeystoreError
    from ..mpp.mpp_onchain import MppSubmitError

    try:
        result = await owner_submit.submit_full_open(sess["user_id"], body)
    except (owner_submit.OwnerSubmitError, OwnerKeystoreError, MppSubmitError) as exc:
        return _autosign_error(exc)
    return JSONResponse(result)


@router.post("/mpp/streams/{stream_id}/submit-open-tx")
async def mpp_submit_open_tx(stream_id: int, request: Request):
    """Sign and send open_payment_stream with the owner keystore."""
    sess, err = _require_auth(request)
    if err:
        return err
    body = await request.json()
    from ..mpp import owner_submit, mpp_streams
    from ..mpp.owner_keystore import OwnerKeystoreError
    from ..mpp.mpp_onchain import MppSubmitError

    raw_cap = body.get("maxTotalMicroUsdc", body.get("max_total_micro_usdc"))
    if raw_cap is None:
        try:
            row = _fetch_owned_stream(sess["user_id"], stream_id)
            raw_cap = row.get("max_total_micro_usdc") or 1_000_000
        except mpp_streams.StreamNotFound:
            return JSONResponse({"detail": "stream not found"}, status_code=404)
    try:
        result = await owner_submit.submit_open_for_stream(
            sess["user_id"],
            stream_id,
            int(raw_cap),
            owner_usdc_ata=body.get("usdcAta") or body.get("ownerUsdcAta"),
        )
    except mpp_streams.StreamNotFound:
        return JSONResponse({"detail": "stream not found"}, status_code=404)
    except (owner_submit.OwnerSubmitError, OwnerKeystoreError, MppSubmitError) as exc:
        return _autosign_error(exc)
    return JSONResponse(result)
