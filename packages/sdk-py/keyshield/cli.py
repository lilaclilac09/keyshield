"""keyshield-proxy CLI: enroll a ZK root, check status, run the local proxy.

  keyshield-proxy enroll            paste the ksz1. unlock code from the dashboard
  keyshield-proxy status            check token + root against the server
  keyshield-proxy run [--port N]    start the local ZK proxy

Environment: KS_TOKEN (a proxy-only token from Developer -> Create agent
token), KS_BASE (default: hosted API), KS_ZK_ROOT or ~/.keyshield/zk-root.
"""

from __future__ import annotations

import argparse
import getpass
import os
import sys
import time

from .zk import (
    DEFAULT_BASE,
    ZkClient,
    ZkError,
    load_root,
    parse_unlock_code,
    root_id,
    save_root,
)


def _client(args) -> ZkClient:
    token = os.environ.get("KS_TOKEN", "").strip()
    if not token:
        raise ZkError(
            "set KS_TOKEN to a proxy-only token (Developer -> Create agent token)"
        )
    return ZkClient(token, load_root(), args.base, share_ttl=args.share_ttl)


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(
        prog="keyshield-proxy", description=__doc__.splitlines()[0]
    )
    p.add_argument("--base", default=os.environ.get("KS_BASE", DEFAULT_BASE))
    p.add_argument(
        "--share-ttl", type=float, default=30.0, help="share cache seconds (max 60)"
    )
    sub = p.add_subparsers(dest="cmd", required=True)
    sub.add_parser("enroll")
    sub.add_parser("status")
    run = sub.add_parser("run")
    run.add_argument(
        "--port", type=int, default=int(os.environ.get("KS_PROXY_PORT", "8787"))
    )
    run.add_argument("--local-token", default=os.environ.get("KS_LOCAL_TOKEN") or None)
    args = p.parse_args(argv)
    try:
        if args.cmd == "enroll":
            code = getpass.getpass("Unlock code (ksz1.…, input hidden): ")
            root = parse_unlock_code(code)
            path = save_root(root)
            print(f"Saved ZK root ({root_id(root)}) to {path} (mode 600).")
            return 0
        zk = _client(args)
        st = zk.check_root()
        if args.cmd == "status":
            print(
                f"ZK mode on · root {st['root_id']} · {st['zk_items']} zero-knowledge keys"
            )
            if st.get("plaintext_items"):
                print(
                    f"{st['plaintext_items']} keys still stored in plaintext: migrate them in the dashboard."
                )
            return 0
        from .local_proxy import serve

        httpd, token = serve(zk, port=args.port, local_token=args.local_token)
        base = f"http://127.0.0.1:{httpd.server_address[1]}/vproxy"
        print("keyshield-proxy (ZK mode) is running.")
        print(f"  base URL:    {base}/<upstream>   e.g. {base}/openai/v1")
        print(f"  local token: {token}   (use it as the API key in your agent)")
        print("  Keys are decrypted here; the KeyShield server never sees them.")
        try:
            while True:
                time.sleep(3600)
        except KeyboardInterrupt:
            httpd.shutdown()
            return 0
    except ZkError as exc:
        print(f"keyshield-proxy: {exc}", file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
