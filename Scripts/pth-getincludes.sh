#!/usr/bin/env bash
#
# Imprime os includes de um AppServer, lidos do .vscode/servers.json -- o
# mesmo registro que a extensao TDS usa. Saida: os caminhos separados por
# virgula, numa linha so, no formato que o "includes=" do advpls cli espera.
#
# Vale TUDO o que o servers.json declara para aquele servidor, nesta ordem:
#   1. "includes" do topo -- abrangente, vale para qualquer servidor cadastrado;
#   2. "includes" de cada configuracao cujo address:port e o ip:porta pedido
#      (a de outro servidor nao entra: pode ser outra versao dos .ch).
# Caminho repetido entra uma vez so, na primeira posicao em que apareceu.
#
# Sem servers.json, ou sem nenhum include nele para aquele servidor, e erro
# (exit 3): compilar sem os .ch daria erro em todo fonte que inclui algo, longe
# da causa.
#
# Os caminhos sao do APPSERVER (ele os le na compilacao), nao desta maquina.
#
# No Windows use o pth-getincludes.ps1: mesmos parametros, mesma saida.
#
# Uso:
#   Scripts/pth-getincludes.sh <ip> <porta>
#
# Variavel:
#   PTH_SERVERS_JSON  outro servers.json. Default: <repo>/.vscode/servers.json

set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SERVERS_JSON="${PTH_SERVERS_JSON:-$REPO/.vscode/servers.json}"

[ "$#" -eq 2 ] || { echo "Uso: $(basename "$0") <ip> <porta>" >&2; exit 2; }
IP="$1"
PORTA="$2"

command -v jq >/dev/null || {
    echo "jq nao encontrado (sudo apt install jq): e ele que le $SERVERS_JSON" >&2; exit 3; }

[ -r "$SERVERS_JSON" ] || {
    echo "Nao encontrei $SERVERS_JSON: e de la que saem os includes (PTH_SERVERS_JSON aponta outro)." >&2
    exit 3; }

INCLUDES="$(jq -r --arg ip "$IP" --arg port "$PORTA" '
    [ (.includes // [])[],
      ( (.configurations // [])[]
        | select(.address == $ip and (.port | tostring) == $port)
        | (.includes // [])[] ) ]
    | map(select(type == "string" and . != ""))
    | reduce .[] as $x ([]; if any(.[]; . == $x) then . else . + [$x] end)
    | join(",")
' "$SERVERS_JSON" 2>/dev/null)" || {
    echo "Nao consegui ler $SERVERS_JSON como JSON." >&2
    exit 3; }

[ -n "$INCLUDES" ] || {
    echo "Nenhum include em $SERVERS_JSON (nem no topo nem na configuracao de $IP:$PORTA)." >&2
    exit 3; }

printf '%s\n' "$INCLUDES"
