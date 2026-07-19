#!/usr/bin/env bash
# Compila o bbpPairings para WASM (artefatos em lib/pairing/wasm/).
# Pré-requisito: emsdk instalado e ativado (https://github.com/emscripten-core/emsdk)
#   git clone https://github.com/emscripten-core/emsdk && cd emsdk
#   ./emsdk install latest && ./emsdk activate latest && source ./emsdk_env.sh
#
# Uso: scripts/build-bbppairings.sh [dir-do-clone-bbpPairings]
# Fixar o commit upstream registrado em lib/pairing/wasm/VERSION antes de buildar.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BBP_DIR="${1:-$REPO_ROOT/../bbpPairings}"
OUT_DIR="$REPO_ROOT/lib/pairing/wasm"

if [ ! -d "$BBP_DIR/src" ]; then
  echo "bbpPairings não encontrado em $BBP_DIR" >&2
  echo "Clone: git clone https://github.com/BieremaBoyzProgramming/bbpPairings" >&2
  exit 1
fi

EMXX="${EMXX:-em++}"
command -v "$EMXX" >/dev/null || { echo "em++ não está no PATH (source emsdk_env.sh)" >&2; exit 1; }

cd "$BBP_DIR"
SOURCES=$(find src -name '*.cpp' | tr '\n' ' ')

# -fexceptions é OBRIGATÓRIO: o bbpPairings sinaliza erros de validação do TRF
# via exceções C++; sem a flag o Emscripten converte throw em abort().
"$EMXX" -std=c++20 -O2 -Isrc -fexceptions \
  $SOURCES \
  -sMODULARIZE=1 -sEXPORT_ES6=1 -sENVIRONMENT=node \
  -sEXPORTED_RUNTIME_METHODS=callMain,FS \
  -sINVOKE_RUN=0 -sEXIT_RUNTIME=1 -sALLOW_MEMORY_GROWTH=1 \
  -sSTACK_SIZE=8388608 \
  -o "$OUT_DIR/bbppairings.mjs"

echo "OK: $(ls -la "$OUT_DIR"/bbppairings.*)"
echo "Lembre de atualizar lib/pairing/wasm/VERSION com o commit upstream."
