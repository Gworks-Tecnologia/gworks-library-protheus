#!/usr/bin/env bash
#
# Compila fontes AdvPL/TLPP no RPO pela linha de comando, sem VS Code.
#
# Usa o language server que vem dentro da extensao TDS (advpls), no modo
# "cli": ele le um script .ini com as acoes a executar e fala direto com o
# AppServer. E o mesmo motor que a extensao usa -- o VS Code e so a cara.
#
# POR QUE ISSO EXISTE: a task do VS Code roda dentro do editor, o que exige
# uma pessoa apertando Ctrl+Shift+B. Este script roda de qualquer shell, o
# que fecha o ciclo "editou -> compilou -> leu o erro" sem intervencao.
#
# No Windows use o pth-compile.ps1: mesmos parametros, mesmo pth-settings.json.
#
# ---------------------------------------------------------------------------
# CONFIGURACAO: Scripts/pth-settings.json
#
# Servidor, ambientes e credencial vem de UM arquivo JSON, lido com jq, que
# descreve UM AppServer. O modelo (sem valores) e o pth-settings.example.json:
#
#     cp Scripts/pth-settings.example.json Scripts/pth-settings.json
#
#   ip            AppServer                                        obrigatorio
#   port          Porta do AppServer                               obrigatorio
#   user          Usuario do Protheus                              obrigatorio
#   password      Senha do usuario                                 obrigatorio
#   env_default   Ambiente (RPO) de compilacao                     obrigatorio
#   env_rest      Ambiente que o REST Server atende               opcional
#   env_workflow  Ambiente do workflow                             opcional
#   env_job       Ambiente de job/schedule                         opcional
#   environments  Lista dos ambientes do servidor. Junto com os    opcional
#                 env_* acima, e o que o -e NOME aceita
#
# Campo opcional vazio ("") vale "nao configurado". O modelo vem com ip
# "0.0.0.0" e port 0, que tambem contam como nao preenchidos. ip e nomes de
# ambiente nao podem ter espaco (nem sobrando no fim: "TESTE5 ").
#
# Um arquivo = um servidor. Para compilar em OUTRO servidor, aponte para outro
# arquivo com a variavel PTH_SETTINGS.
#
# SENHA. O arquivo carrega a senha em texto puro:
#   - Scripts/pth-settings.json esta no .gitignore -- versione so o .example.
#   - Se a pasta do repositorio e sincronizada (Google Drive, OneDrive...), o
#     arquivo sincroniza junto. Para manter a senha fora dela, guarde o arquivo
#     em outro lugar e exporte, por exemplo:
#         export PTH_SETTINGS=~/.totvsls/pth-settings.json
#   - Restrinja a permissao quando o sistema de arquivos deixar:
#         chmod 600 <arquivo>
#   - O .ini que o advpls consome tambem precisa da senha em texto, entao e
#     gerado em arquivo temporario com permissao 600 e APAGADO na saida,
#     inclusive se o script morrer no meio (trap EXIT).
#
# O pth-execute.mjs e o pth-query.sh leem o mesmo arquivo.
# ---------------------------------------------------------------------------

set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

ADVPLS="$HOME/.vscode/extensions/totvs.tds-vscode-2.0.16/node_modules/@totvs/tds-ls/bin/linux/advpls"
SETTINGS="${PTH_SETTINGS:-$REPO/Scripts/pth-settings.json}"
MODELO="$REPO/Scripts/pth-settings.example.json"

# Includes: os mesmos de .vscode/settings.json. O AppServer le estes caminhos
# no momento da compilacao, entao precisam ser absolutos.
INCLUDES="/totvs/protheus/includes/includes-standard/2410"

# Alvo padrao: Global + Projects. Modules fica de fora de proposito -- nao
# mexemos nele, e recompilar 400 fontes legados a cada rodada so serve para
# encher a saida de erro alheio ao que se esta fazendo.
ALVO_PADRAO="$REPO/Sources/AdvPL/Global,$REPO/Sources/AdvPL/Projects"

PEDIDOS=()      # o que veio em -e, na ordem
TODOS="F"       # -a
RECOMPILE="F"
PROGRAMAS=""

# O AMBIENTE ESCOLHE O RPO, e um appserver serve varios, cada um com o SEU
# binario: compilar em um NAO publica no outro. O sintoma de errar o alvo e
# cruel -- a rota responde (a varredura de APIs achou a annotation em algum
# RPO) e executa codigo velho, entao a correcao que acabou de ser feita
# simplesmente nao aparece, sem nada dizendo que foi no lugar errado.
#
# Por isso existem os papeis: para testar a rota REST e preciso compilar no
# ambiente que o REST Server atende (-e rest), que nao e o de compilacao; o
# mesmo vale para o workflow e para os jobs. E por isso o -e so aceita
# ambiente conhecido: erro de digitacao vira erro na hora, nao codigo velho
# rodando em outro RPO.

resumo_config() {
    jq -r '
        def v: if . == null or . == "" then "-" else . end;
        "  servidor     : \(.ip | v):\(.port | v)",
        "  env_default  : \(.env_default | v)",
        "  env_rest     : \(.env_rest | v)",
        "  env_workflow : \(.env_workflow | v)",
        "  env_job      : \(.env_job | v)",
        "  environments : \(((.environments // []) | join(", ")) | v)"
    ' "$SETTINGS" 2>/dev/null || echo "  (nao foi possivel ler $SETTINGS)"
}

uso() {
    cat <<EOF
Uso: $(basename "$0") [opcoes] [caminho ...]

  Sem caminho, compila Sources/AdvPL/Global e Sources/AdvPL/Projects.
  Caminho pode ser arquivo ou diretorio (diretorio e varrido recursivamente).

Opcoes:
  -r          Recompila (regrava no RPO mesmo sem alteracao detectada)
  -e <alvo>   Ambiente onde compilar. <alvo> e um papel -- default, rest,
              workflow ou job, que valem env_default, env_rest, env_workflow
              e env_job -- ou o nome de um ambiente de "environments".
              Pode repetir: -e rest -e workflow. Sem -e nem -a: default
  -a          Compila em TODOS os ambientes configurados (env_default,
              env_rest, env_workflow, env_job), um apos o outro, sem repetir
              os iguais. Roda todos mesmo se um falhar e sai com erro se
              algum falhar. Nao combina com -e
  -h          Esta ajuda

Configuracao em $SETTINGS:
$(resumo_config)

Exemplos:
  $(basename "$0")
  $(basename "$0") -e rest Sources/Templates/ConsultaSql/Api
  $(basename "$0") -a -r Sources/Templates/ConsultaSql
  $(basename "$0") Sources/Templates/ConsultaSql/Api/GwTemplateConsultaSqlApi.tlpp
EOF
}

while getopts ":rae:h" opt; do
    case "$opt" in
        r) RECOMPILE="T" ;;
        a) TODOS="T" ;;
        # Valor vazio e erro, nao "use o padrao": um -e "$AMB" com a variavel
        # vazia por engano nao pode cair em silencio no ambiente padrao.
        e) [ -n "$OPTARG" ] || { echo "Opcao -e exige valor" >&2; exit 2; }
           PEDIDOS+=("$OPTARG") ;;
        h) uso; exit 0 ;;
        \?) echo "Opcao invalida: -$OPTARG" >&2; uso >&2; exit 2 ;;
        :)  echo "Opcao -$OPTARG exige valor" >&2; exit 2 ;;
    esac
done
shift $((OPTIND - 1))

if [ "$TODOS" = "T" ] && [ "${#PEDIDOS[@]}" -gt 0 ]; then
    echo "-a e -e nao combinam: -a ja compila em todos os ambientes configurados." >&2
    exit 2
fi

# ---- Configuracao (pth-settings.json) --------------------------------------
command -v jq >/dev/null || {
    echo "jq nao encontrado (sudo apt install jq): e ele que le $SETTINGS" >&2; exit 3; }

[ -r "$SETTINGS" ] || {
    echo "Arquivo de configuracao nao encontrado: $SETTINGS" >&2
    echo "Copie o modelo e preencha (veja o topo deste script):" >&2
    echo "  cp $MODELO $REPO/Scripts/pth-settings.json" >&2
    exit 3; }

# Sintaxe primeiro: comentario, virgula sobrando e aspas faltando sao os erros
# de quem edita o arquivo a mao, e o motivo exato vem do proprio jq.
erro_json="$(jq empty "$SETTINGS" 2>&1)" || {
    echo "Nao consegui ler $SETTINGS como JSON: ${erro_json%%$'\n'*}" >&2
    exit 3; }

# Formato. Valor errado aqui vira erro na hora, com o arquivo apontado, em vez
# de uma conexao estranha ou uma compilacao no ambiente que ninguem pediu.
# ip e nomes de ambiente nao tem espaco: um "TESTE5 " com espaco sobrando so
# apareceria como "ambiente nao encontrado" la no servidor.
jq -e '
    type == "object"
    and (.ip | type) == "string"
    and (.port | tostring | test("^[0-9]+$"))
    and ((.environments // []) | type) == "array"
    and all((.environments // [])[]; type == "string")
    and all(.user, .password, .env_default, .env_rest, .env_workflow, .env_job;
            . == null or type == "string")
    and all(.ip, .env_default, .env_rest, .env_workflow, .env_job, (.environments // [])[];
            . == null or test("^\\S*$"))
' "$SETTINGS" >/dev/null 2>&1 || {
    echo "$SETTINGS invalido: esperado um objeto com ip (texto), port (numero), environments (lista de textos)" >&2
    echo "e user, password, env_default, env_rest, env_workflow, env_job (texto). ip e nomes de ambiente nao podem ter espacos." >&2
    echo "Veja o topo deste script." >&2
    exit 3; }

lido() { jq -r --arg k "$1" '.[$k] // empty | tostring' "$SETTINGS"; }

IP="$(lido ip)"
PORTA="$(lido port)"
USUARIO="$(lido user)"
SENHA="$(lido password)"
ENV_DEFAULT="$(lido env_default)"
ENV_REST="$(lido env_rest)"
ENV_WORKFLOW="$(lido env_workflow)"
ENV_JOB="$(lido env_job)"
mapfile -t ENVIRONMENTS < <(jq -r '(.environments // [])[]' "$SETTINGS")

faltando=()
{ [ -n "$IP" ] && [ "$IP" != "0.0.0.0" ]; } || faltando+=("ip")
{ [ -n "$PORTA" ] && [ "$PORTA" -ge 1 ]; } || faltando+=("port")
[ -n "$USUARIO" ]     || faltando+=("user")
[ -n "$SENHA" ]       || faltando+=("password")
[ -n "$ENV_DEFAULT" ] || faltando+=("env_default")
if [ "${#faltando[@]}" -gt 0 ]; then
    printf -v lista '%s, ' "${faltando[@]}"
    echo "Preencha em $SETTINGS: ${lista%, }" >&2
    exit 3
fi

# ---- Em quais ambientes compilar -------------------------------------------
declare -A PAPEL=( [default]="$ENV_DEFAULT" [rest]="$ENV_REST" [workflow]="$ENV_WORKFLOW" [job]="$ENV_JOB" )
ORDEM_PAPEIS=(default rest workflow job)
AMBIENTES=()

# Nome literal vale se estiver em "environments" ou for um dos env_* preenchidos.
nome_conhecido() {
    local n="$1" x
    for x in "${ENVIRONMENTS[@]}"; do
        if [ "$x" = "$n" ]; then return 0; fi
    done
    for x in "${PAPEL[@]}"; do
        if [ -n "$x" ] && [ "$x" = "$n" ]; then return 0; fi
    done
    return 1
}

# Sem repetir: se env_rest for o mesmo ambiente do env_default, compila uma vez.
juntar_ambiente() {
    local a="$1" x
    for x in "${AMBIENTES[@]}"; do
        if [ "$x" = "$a" ]; then return 0; fi
    done
    AMBIENTES+=("$a")
}

resolver_alvo() {
    local alvo="$1" p
    case "$alvo" in
        default|rest|workflow|job)
            [ -n "${PAPEL[$alvo]}" ] || {
                echo "O papel \"$alvo\" nao esta configurado: env_$alvo esta vazio em $SETTINGS" >&2
                exit 2; }
            juntar_ambiente "${PAPEL[$alvo]}"
            ;;
        *)
            nome_conhecido "$alvo" || {
                echo "Ambiente desconhecido: $alvo" >&2
                for p in "${ORDEM_PAPEIS[@]}"; do
                    [ -z "${PAPEL[$p]}" ] || echo "  $p -> ${PAPEL[$p]}" >&2
                done
                echo "  environments: ${ENVIRONMENTS[*]:-(vazio)}" >&2
                exit 2; }
            juntar_ambiente "$alvo"
            ;;
    esac
}

if [ "$TODOS" = "T" ]; then
    for p in "${ORDEM_PAPEIS[@]}"; do
        [ -z "${PAPEL[$p]}" ] || juntar_ambiente "${PAPEL[$p]}"
    done
elif [ "${#PEDIDOS[@]}" -gt 0 ]; then
    for p in "${PEDIDOS[@]}"; do resolver_alvo "$p"; done
else
    resolver_alvo default
fi

# Caminhos passados viram absolutos: o AppServer recebe estes nomes e nao tem
# ideia de qual e o diretorio corrente daqui.
if [ "$#" -gt 0 ]; then
    for alvo in "$@"; do
        abs="$(cd "$(dirname "$alvo")" 2>/dev/null && pwd)/$(basename "$alvo")" || {
            echo "Caminho nao encontrado: $alvo" >&2; exit 2; }
        [ -e "$abs" ] || { echo "Caminho nao encontrado: $alvo" >&2; exit 2; }
        PROGRAMAS="${PROGRAMAS:+$PROGRAMAS,}$abs"
    done
else
    PROGRAMAS="$ALVO_PADRAO"
fi

[ -x "$ADVPLS" ] || {
    echo "advpls nao encontrado em:" >&2
    echo "  $ADVPLS" >&2
    echo "A extensao TDS foi atualizada? Ajuste o caminho no topo do script." >&2
    exit 3
}

# O .ini carrega a senha. Nasce com 600 e morre no fim, aconteca o que
# acontecer -- inclusive se a compilacao estourar no meio.
INI="$(mktemp -t tdscli.XXXXXXXX.ini)"
chmod 600 "$INI"
trap 'rm -f "$INI"' EXIT

# RETENTATIVA EM "Failed to open repository".
#
# Depois que uma sessao do Protheus cai (SmartClient, webapp, debug), o RPO
# fica preso por um tempo e a compilacao seguinte falha com COMPILEERROR-300.
# Nao e erro do fonte nem da credencial: e so o servidor ainda nao ter
# liberado. ~30s resolve, e sem isso um ciclo automatizado de
# "roda -> corrige -> recompila" quebra em toda volta.
#
# O advpls devolve codigo != 0 quando a compilacao falha, e e esse codigo que
# vale para CI ou para encadear com outro comando.
ESPERA_RPO=30
TENTATIVAS=3
codigo=0

# Compila em UM ambiente. Deixa o retorno do advpls em $codigo.
compilar_em() {
    local ambiente="$1" saida n

    # ANSI (CP1252) e exigencia documentada do formato; em UTF-8 a execucao
    # falha. Como o conteudo aqui e ASCII, o iconv e barato e garante o
    # cabecalho certo caso algum caminho ganhe acento um dia.
    iconv -f UTF-8 -t CP1252 > "$INI" <<EOF || { echo "Nao consegui converter o .ini para CP1252: user, password ou algum caminho tem caractere fora dessa codificacao (emoji, por exemplo)." >&2; exit 1; }
; Gerado por Scripts/pth-compile.sh -- arquivo temporario, contem senha.
showConsoleOutput=true

[authentication]
action=authentication
server=$IP
port=$PORTA
secure=0
build=AUTO
environment=$ambiente
user=$USUARIO
psw=$SENHA

[compile]
action=compile
program=$PROGRAMAS
recompile=$RECOMPILE
includes=$INCLUDES
EOF

    echo "servidor : $IP:$PORTA ($ambiente)"
    echo "modo     : $([ "$RECOMPILE" = "T" ] && echo recompilar || echo compilar)"
    echo "alvo     : ${PROGRAMAS//,/$'\n'           }"
    echo

    for (( n=1; n<=TENTATIVAS; n++ )); do

        set +e
        saida="$( "$ADVPLS" cli "$INI" 2>&1 )"
        codigo=$?
        set -e

        printf '%s\n' "$saida"

        if ! grep -q "Failed to open repository" <<< "$saida"; then
            break
        fi

        if (( n < TENTATIVAS )); then
            echo
            echo ">>> RPO ocupado (sessao recem-encerrada). Aguardando ${ESPERA_RPO}s e tentando de novo ($n/$((TENTATIVAS-1)))..."
            sleep "$ESPERA_RPO"
            echo
        fi

    done
}

# Um ambiente por vez, todos ate o fim: um RPO preso nao pode esconder o
# resultado dos outros. O codigo de saida e o do PRIMEIRO que falhou.
PRIMEIRO_ERRO=0
RESUMO=()

for i in "${!AMBIENTES[@]}"; do
    amb="${AMBIENTES[$i]}"

    if [ "${#AMBIENTES[@]}" -gt 1 ]; then
        [ "$i" -eq 0 ] || echo
        echo "=== ambiente $((i + 1))/${#AMBIENTES[@]}: $amb ==="
    fi

    compilar_em "$amb"

    if [ "$codigo" -eq 0 ]; then
        RESUMO+=("  $amb: OK")
    else
        RESUMO+=("  $amb: FALHOU (exit $codigo)")
        [ "$PRIMEIRO_ERRO" -ne 0 ] || PRIMEIRO_ERRO="$codigo"
    fi
done

if [ "${#AMBIENTES[@]}" -gt 1 ]; then
    echo
    echo "=== resumo ==="
    printf '%s\n' "${RESUMO[@]}"
fi

exit "$PRIMEIRO_ERRO"
