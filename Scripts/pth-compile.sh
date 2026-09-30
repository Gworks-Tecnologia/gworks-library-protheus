#!/usr/bin/env bash
#
# Compila fontes AdvPL/TLPP no RPO pela linha de comando, sem VS Code e sem
# senha em arquivo. A implementacao e o pth-compile.mjs (a mesma no Windows,
# pelo pth-compile.ps1); este script so a chama.
#
#   bash Scripts/pth-compile.sh [sufixo] [-r] [-e <alvo>]... [-a] [-h] <caminho>...
#
# Configuracao e login: ver o topo do pth-config.mjs e do pth-compile.mjs.
# ---------------------------------------------------------------------------

set -euo pipefail

command -v node >/dev/null || { echo "node nao encontrado (Node.js 20+): e ele que roda o pth-compile.mjs" >&2; exit 3; }

exec node "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/pth-compile.mjs" "$@"
