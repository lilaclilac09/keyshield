#!/usr/bin/env bash
# Fetch Yellowstone gRPC `geyser.proto` and compile Python stubs into
# `_laserstream_proto/` for use by helius_laserstream.py.
#
# Run once per checkout. Idempotent — re-run after upgrading proto.
set -euo pipefail

SKILL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUT_DIR="${SKILL_DIR}/_laserstream_proto"
PROTO_URL="${YELLOWSTONE_PROTO_URL:-https://raw.githubusercontent.com/rpcpool/yellowstone-grpc/master/yellowstone-grpc-proto/proto/geyser.proto}"
SOLANA_PROTO_URL="${SOLANA_PROTO_URL:-https://raw.githubusercontent.com/rpcpool/yellowstone-grpc/master/yellowstone-grpc-proto/proto/solana-storage.proto}"

mkdir -p "${OUT_DIR}"
touch "${OUT_DIR}/__init__.py"

TMP="$(mktemp -d)"
trap 'rm -rf "${TMP}"' EXIT

echo "fetching geyser.proto from ${PROTO_URL}"
curl -fsSL "${PROTO_URL}" -o "${TMP}/geyser.proto"
curl -fsSL "${SOLANA_PROTO_URL}" -o "${TMP}/solana-storage.proto"

# Resolve which python has grpc_tools available.
PY="${PYTHON:-python3}"
if ! "${PY}" -c "import grpc_tools" 2>/dev/null; then
    echo "ERROR: grpc_tools not installed for ${PY}." >&2
    echo "  pip install grpcio>=1.60 grpcio-tools" >&2
    exit 1
fi

echo "compiling proto -> ${OUT_DIR}"
"${PY}" -m grpc_tools.protoc \
    --proto_path="${TMP}" \
    --python_out="${OUT_DIR}" \
    --grpc_python_out="${OUT_DIR}" \
    "${TMP}/geyser.proto" "${TMP}/solana-storage.proto"

# Generated files use `import geyser_pb2` (top-level) but we're a package, so
# rewrite to relative imports for clean `from ._laserstream_proto import ...`.
for f in "${OUT_DIR}"/*_pb2_grpc.py "${OUT_DIR}"/*_pb2.py; do
    [[ -e "${f}" ]] || continue
    /usr/bin/sed -i.bak -E 's/^import (geyser_pb2|solana_storage_pb2)( as |$)/from . import \1\2/' "${f}"
    rm -f "${f}.bak"
done

echo "done. files:"
ls -1 "${OUT_DIR}"
