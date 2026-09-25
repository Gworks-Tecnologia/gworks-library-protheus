#!/usr/bin/env bash
#
# Executa uma consulta SQL no Protheus pela rota GwConsultaSql.
#
# No Windows use o pth-query.ps1: mesmo comportamento, mesmo pth-settings.json.
#
# ONDE PEGAR O RETORNO (leia isto primeiro):
# NAO fica no screenshot. U_ConsultaSqlController (Controllers/
# GwTemplateConsultaSqlController.tlpp) grava o json de retorno num ARQUIVO de nome
# FIXO, "consultasql-retorno.json", dentro de GetTempPath() no disco do
# CLIENTE (prefixo "l:"). O diretorio e calculado num ponto so, a
# U_ConsultaSqlTempFile (Functions/GwTemplateConsultaSqlFunctions.tlpp): no
# Linux "l:/tmp/", no Windows a pasta temp do usuario (veja o pth-query.ps1).
# Na pratica, rodando este script daqui, isso cai em
#
#   /tmp/consultasql-retorno.json
#
# no MESMO disco onde este script roda (confirmado ao vivo). Formato:
# {"ok": true, "data": {"hasNext": false, "items": [...]}} quando deu certo,
# {"ok": false, "status", "message", "detailedMessage"} quando nao.
#
# A rotina grava em ARQUIVO de proposito (comentario em
# GwTemplateConsultaSqlController.tlpp: janela desenhada em PIXEL corta
# resultado grande, sem DOM de onde ler o resto) e NUNCA abre dialogo nem
# imprime nada na tela. O jeito de saber se terminou e o arquivo aparecer (ou
# o ConOut no log do AppServer: "[ConsultaSql] retorno gravado em: ..."). Por
# isso este script APAGA o retorno antes de rodar e passa o caminho ao
# pth-execute.mjs em PROTHEUS_WAIT_FILE:
#   - launch_by_webagent = true: o pth-execute.mjs termina assim que o arquivo
#     aparece (exit 0) ou no limite de segundos sem ele (exit 2);
#   - launch_by_webagent = false: nao ha janela para detectar, entao ele espera
#     o limite inteiro e o exit nao diz nada sobre o retorno -- confira o
#     arquivo. A tela parada em "Programa Inicial" so e normal se o arquivo
#     chegou.
#
# Nome FIXO, sem timestamp -- de proposito (ferramenta de depuracao, uma
# chamada por vez; ver o comentario do Controller). Cada chamada nova
# SOBRESCREVE o arquivo da anterior: ler antes de disparar a proxima.
#
# ALTERNATIVA sem passar pelo webapp/Chromium: a mesma acao tambem responde
# como rota REST de verdade (na porta do REST Server, NAO na "port" do
# pth-settings.json, que e a do webapp/compilacao), com Basic Auth -- devolve
# {"hasNext": bool, "items": [...]} direto no corpo HTTP, sem arquivo, sem
# screenshot. Usuario e senha sao os do proprio pth-settings.json:
#
#   S=Scripts/pth-settings.json
#   AUTH=$(printf '%s' "$(jq -r '"\(.user):\(.password)"' "$S")" | base64 -w0)
#   curl -s -X POST "http://$(jq -r .ip "$S"):<porta-rest>/rest/GwConsultaSql/consultas" \
#     -H "Authorization: Basic $AUTH" -H "Content-Type: application/json" \
#     --data-binary @arquivo-com-o-body.json   # {"query": "SELECT ..."}
#
# (grave o body num ARQUIVO e mande com --data-binary @arquivo -- passar json
# com aspas simples/duplas misturadas direto na linha de comando quebra por
# causa do escaping do shell; ja aconteceu de um heredoc mal fechado mandar
# corpo vazio e a API responder 400 "Corpo da requisicao ausente ou invalido"
# sem o SQL nunca ter chegado a rodar.)
#
# Esta rota REST (GwTemplateConsultaSqlApi.tlpp) fica em ambiente PROPRIO no
# appserver (a porta do REST Server aponta para um so ambiente -- o env_rest do
# pth-settings.json), diferente do ambiente do webapp usado por pth-execute.mjs
# (env_default). Para a rota REST enxergar codigo novo, compile nele:
#   Scripts/pth-compile.sh -e rest <fonte>
# Se a consulta precisar rodar contra outro ambiente, confirmar antes se a rota
# REST daquele ambiente esta de pe -- nao da para escolher pela URL como no
# webapp.
#
# POR QUE NAO MANDA O SQL NA URL. A instrucao ia como &A=<SELECT ...> na
# querystring do webapp, e isso nao se sustenta: aspas, virgula, igual e espaco
# precisam de encode, a URL tem limite de tamanho, e a consulta acaba no log de
# acesso do servidor e de qualquer proxy no caminho.
#
# Aqui o SQL e gravado em arquivo e a URL leva uma palavra so -- RUNQUERY. O
# Service reconhece a sentinela e le a instrucao do arquivo.
#
# ATENCAO: quem le o arquivo e o CLIENT -- a maquina que fez a chamada, pelo
# prefixo "l:" -- e o le no temp dele (U_ConsultaSqlTempFile). Este script
# grava na mesma maquina, entao nao importa se o appserver e remoto. O que
# importa e o caminho bater com o GetTempPath() do client: no Linux, /tmp/ --
# ver PROTHEUS_SQL_PATH abaixo.
#
# Uso:
#   Scripts/pth-query.sh [sufixo] "<SQL>" [rotulo] [segundos]
#   Scripts/pth-query.sh [sufixo] -f consulta.sql [rotulo] [segundos]
#
# sufixo (primeiro argumento, opcional: homolog, cliente-x...) usa
# Scripts/pth-settings.<sufixo>.json; sem ele vale PTH_SETTINGS e, sem ela,
# Scripts/pth-settings.json.
#
# node Scripts/pth-execute.mjs precisa da flag --experimental-websocket
# (Node 20 nao tem WebSocket global sem ela) -- ver pth-execute.mjs.
#
# Variaveis:
#   PROTHEUS_SQL_PATH  Onde gravar o .sql. Default /tmp/consultasql.sql: o
#                      GetTempPath() do client Linux + o nome que o Service
#                      le (consultasql.sql). So mude se o GetTempPath() do
#                      seu client nao for /tmp/ -- o Service nao ve outro
#                      caminho.
#   PROTHEUS_ENV       Ambiente do webapp: um papel (default, rest, workflow,
#                      job) ou o nome de um ambiente de "environments" do
#                      arquivo de settings. Default: env_default.
#   PTH_SETTINGS       Arquivo de settings quando nao se passa sufixo.
#   PROTHEUS_URL       URL do WebApp, sem consultar o arquivo -- exige
#                      PROTHEUS_ENV (nome do ambiente, nao papel) junto.
#   PROTHEUS_OUT       Pasta de saida do pth-execute.mjs.
#   PROTHEUS_BROWSER   Navegador; vale mais que o "browser" do arquivo.
#
# Servidor, ambiente, https, navegador e modo (launch_by_webagent) sao
# resolvidos pelo pth-execute.mjs a partir do arquivo de settings (campos no
# topo do pth-compile.sh e do pth-execute.mjs); este script so escolhe o
# arquivo e repassa as variaveis. user e password nao sao usados aqui.

set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SQL_PATH="${PROTHEUS_SQL_PATH:-/tmp/consultasql.sql}"
FUNCAO="Gworks.Templates.ConsultaSql.Apps.U_ConsultaSqlPostConsulta"

uso() {
    cat <<EOF
Uso: $(basename "$0") [sufixo] "<SQL>" [rotulo] [segundos]
     $(basename "$0") [sufixo] -f arquivo.sql [rotulo] [segundos]

  sufixo   Usa Scripts/pth-settings.<sufixo>.json (homolog, cliente-x...).
           Sem ele: PTH_SETTINGS ou Scripts/pth-settings.json.
EOF
}

# Primeiro argumento opcional: um sufixo (nome simples: letras, numeros, _ e -)
# escolhe Scripts/pth-settings.<sufixo>.json, repassado ao pth-execute.mjs por
# PTH_SETTINGS. Um SQL nunca e nome simples, e -f comeca com traco.
if [[ "${1:-}" =~ ^[A-Za-z0-9][A-Za-z0-9_-]*$ ]]; then
    export PTH_SETTINGS="$REPO/Scripts/pth-settings.$1.json"
    [ -r "$PTH_SETTINGS" ] || { echo "Arquivo de configuracao nao encontrado: $PTH_SETTINGS" >&2; exit 3; }
    shift
fi

[ "$#" -ge 1 ] || { uso >&2; exit 2; }

if [ "$1" = "-f" ]; then
    [ "$#" -ge 2 ] || { uso >&2; exit 2; }
    [ -r "$2" ] || { echo "Arquivo nao encontrado: $2" >&2; exit 2; }
    SQL="$(cat "$2")"
    shift 2
else
    SQL="$1"
    shift
fi

ROTULO="${1:-consulta}"
LIMITE="${2:-180}"

# Sem quebra de linha no fim: o MemoRead do lado AdvPL ja faz allTrim, mas um
# arquivo que termina em branco e mais dificil de conferir a olho.
printf '%s' "$SQL" > "$SQL_PATH"

# Retorno velho fora: um run que falha nao pode deixar o anterior passar por
# novo, e no modo launch_by_webagent o aparecimento dele e o sinal de fim.
RETORNO="/tmp/consultasql-retorno.json"
rm -f "$RETORNO"
export PROTHEUS_WAIT_FILE="$RETORNO"

echo "sql      : $SQL_PATH ($(wc -c < "$SQL_PATH") bytes)"
echo "config   : ${PTH_SETTINGS:-$REPO/Scripts/pth-settings.json}"

exec node --experimental-websocket "$REPO/Scripts/pth-execute.mjs" "$FUNCAO" "$ROTULO" "$LIMITE" "RUNQUERY"
