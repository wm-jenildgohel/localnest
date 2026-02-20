#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
OUT_DIR="$ROOT_DIR/build"
OUT_BIN="$OUT_DIR/localnest"

mkdir -p "$OUT_DIR"
cd "$ROOT_DIR"

dart compile exe bin/localnest.dart -o "$OUT_BIN"
echo "Built: $OUT_BIN"
