# ===========================================================================
# STATUS: NAO VALIDADO EM WINDOWS
# Escrito em 2026-09-24 numa maquina Linux, SEM PowerShell disponivel: so
# revisao estatica. Este script depende do pth-execute.mjs e do TLPP do
# ConsultaSql, que tambem nao foram exercitados no Windows.
#
# >>> PARA O CLAUDE (ou qualquer leitor futuro deste arquivo) <<<
# Se este bloco ainda esta aqui, este script NUNCA rodou num Windows. Ao le-lo,
# ORIENTE O USUARIO a executar o roteiro abaixo antes de confiar nele, e peca a
# saida completa de cada passo. NAO afirme que "funciona": diga que foi escrito
# para ser equivalente ao pth-query.sh e que falta validar. Valide primeiro o
# pth-compile.ps1 (o roteiro dele esta no topo do arquivo): este aqui herda a
# leitura do pth-settings.json e depende do Node.js. Quando o usuario trouxer os
# resultados, corrija o que falhar e so entao remova este bloco -- ou troque-o
# por "Validado em Windows <versao>, PowerShell <versao>, em <data>".
#
# ROTEIRO DE VALIDACAO (PowerShell, na raiz do repositorio):
#
#  1. Sintaxe -- nao conecta em nada:
#       powershell -ExecutionPolicy Bypass -File .\Scripts\pth-query.ps1
#     Esperado: as duas linhas de "Uso: ..." e exit 2. "unexpected token" ou
#     "missing terminator" e ERRO DE SINTAXE DESTE ARQUIVO.
#
#  2. Node e configuracao (com o pth-settings.json preenchido, ver o
#     pth-compile.ps1). Um ambiente inexistente deve ser recusado ANTES de abrir
#     navegador:
#       $env:PROTHEUS_ENV = 'ZZZ'
#       .\Scripts\pth-query.ps1 "SELECT 1"
#       Remove-Item Env:PROTHEUS_ENV
#     Esperado: "sql      : ...\consultasql.sql (8 bytes)" e depois
#     "Ambiente desconhecido: ZZZ" (exit 3). "node nao encontrado" = falta o
#     Node.js no PATH.
#
#  3. Consulta de verdade -- precisa de: servidor de pe, WebAgent compativel
#     (porta 21021) e um navegador Chromium/Chrome/Edge:
#       .\Scripts\pth-query.ps1 "SELECT TOP 3 A1_COD FROM SA1010 WHERE D_E_L_E_T_ = ' '"
#     Esperado: o pth-execute.mjs imprime servidor/programa e termina; o
#     retorno aparece em %TEMP%\consultasql-retorno.json.
#     Se "Nenhum navegador ... encontrado": aponte $env:PROTHEUS_BROWSER.
#
# SUPOSICOES NAO CONFIRMADAS (se um passo falhar, comece por elas):
#   a) O GetTempPath() do AdvPL, num cliente Windows, devolve a MESMA pasta que
#      o [System.IO.Path]::GetTempPath() daqui. Se o arquivo de retorno nao
#      aparecer em %TEMP%, confira no ConOut do AppServer a linha
#      "[ConsultaSql] retorno gravado em: ..." -- ela mostra o caminho que o
#      Protheus usou. E se a instrucao nao for encontrada ("Arquivo vazio ou
#      inexistente: ..."), o caminho da mensagem e o que o Service procurou.
#      Nos dois casos o ajuste esta na U_ConsultaSqlTempFile (Functions do
#      ConsultaSql) ou em PROTHEUS_SQL_PATH.
#   b) O pth-execute.mjs acha o navegador nos lugares padrao de instalacao do
#      Chrome/Edge no Windows (lista dentro de acharNavegador).
#   c) O webapp/WebAgent aceita o caminho do arquivo no formato Windows.
#
# PONTO DE ATENCAO DO TLPP, independente do Windows: o Service do ConsultaSql
# chama U_GwApiQuery( cSql, @jDados ) (modo direto, versao 1.1 da lib, trazida
# para este repositorio em 2026-09-24 mas AINDA NAO COMPILADA em nenhum RPO). Se
# o RPO do ambiente tiver a versao antiga (so REST), toda consulta responde
# ok=false, status 500, "Resposta invalida da consulta". Nesse caso NAO e defeito
# deste script: compile Sources\Library\Classes\ApiQuery nesse ambiente.
#
# Depois de validar, apague este bloco (ou troque pela linha de "Validado em").
# ===========================================================================
#
# Executa uma consulta SQL no Protheus pela rota GwConsultaSql -- versao Windows
# (PowerShell) do pth-query.sh. Mesmo comportamento, mesma configuracao
# (Scripts/pth-settings.json, descrito no topo do pth-compile.ps1).
#
# Como funciona (o detalhe completo esta no topo do pth-query.sh): o SQL e
# gravado num ARQUIVO e o webapp e chamado com a sentinela RUNQUERY; a rotina
# le o arquivo, executa e grava o retorno (json) tambem num ARQUIVO.
#
# ONDE FICAM OS ARQUIVOS: no diretorio temporario do CLIENT, calculado pela
# U_ConsultaSqlTempFile (Functions/GwTemplateConsultaSqlFunctions.tlpp) a partir
# do GetTempPath(). No Windows e a pasta temp do usuario, a mesma que o
# [System.IO.Path]::GetTempPath() devolve aqui:
#
#   entrada : %TEMP%\consultasql.sql          (este script grava)
#   retorno : %TEMP%\consultasql-retorno.json (a rotina grava, uma chamada por
#                                              vez: cada uma sobrescreve a anterior)
#
# Formato do retorno: {"ok": true, "data": {"hasNext": false, "items": [...]}}
# quando deu certo; {"ok": false, "status", "message", "detailedMessage"} quando
# nao. A tela do webapp parada no dialogo padrao e o comportamento NORMAL -- a
# rotina nunca desenha nada. O jeito de saber se terminou e o arquivo de retorno
# aparecer (ou o ConOut no log do AppServer).
#
# Uso:
#   .\Scripts\pth-query.ps1 [dev|prd] "<SQL>" [rotulo] [segundos]
#   .\Scripts\pth-query.ps1 [dev|prd] -f consulta.sql [rotulo] [segundos]
#
# dev|prd (primeiro argumento, opcional) usa Scripts\pth-settings.<alvo>.json;
# sem ele vale PTH_SETTINGS e, sem ela, Scripts\pth-settings.json.
#
# Se a politica de execucao do PowerShell bloquear scripts:
#   powershell -ExecutionPolicy Bypass -File .\Scripts\pth-query.ps1 "<SQL>"
#
# Requer o Node.js no PATH (Node 20 precisa da flag --experimental-websocket,
# que este script ja passa) e um navegador Chromium/Chrome/Edge -- o
# pth-execute.mjs procura nos lugares de instalacao do Windows;
# PROTHEUS_BROWSER aponta um executavel especifico.
#
# Variaveis:
#   PROTHEUS_SQL_PATH  Onde gravar o .sql. Default %TEMP%\consultasql.sql: o
#                      GetTempPath() do client + o nome que o Service le. So
#                      mude se o GetTempPath() do seu client for outro -- o
#                      Service nao ve outro caminho.
#   PROTHEUS_ENV, PTH_SETTINGS, PROTHEUS_URL, PROTHEUS_OUT, PROTHEUS_BROWSER:
#                      repassadas ao pth-execute.mjs (veja o topo dele e o do
#                      pth-query.sh).

$ErrorActionPreference = 'Stop'

$SqlPath = $env:PROTHEUS_SQL_PATH
if (-not $SqlPath) {
    $SqlPath = Join-Path ([System.IO.Path]::GetTempPath()) 'consultasql.sql'
}
$Funcao = 'Gworks.Templates.ConsultaSql.Apps.U_ConsultaSqlPostConsulta'
$Mjs    = Join-Path $PSScriptRoot 'pth-execute.mjs'

function Uso {
    $nome = Split-Path -Leaf $PSCommandPath
    [Console]::Error.WriteLine("Uso: $nome [dev|prd] `"<SQL>`" [rotulo] [segundos]")
    [Console]::Error.WriteLine("     $nome [dev|prd] -f arquivo.sql [rotulo] [segundos]")
    [Console]::Error.WriteLine("  dev|prd: usa Scripts\pth-settings.dev.json ou pth-settings.prd.json;")
    [Console]::Error.WriteLine("           sem ele, PTH_SETTINGS ou Scripts\pth-settings.json.")
}

$restantes = @($args)

# Primeiro argumento opcional: dev ou prd escolhe Scripts\pth-settings.<alvo>.json,
# repassado ao pth-execute.mjs por PTH_SETTINGS (restaurado no fim, para nao
# vazar para a sessao do usuario).
$SettingsAlvo = $null
if ($restantes.Count -gt 0 -and @('dev', 'prd') -contains [string]$restantes[0]) {
    $SettingsAlvo = Join-Path $PSScriptRoot ('pth-settings.{0}.json' -f ([string]$restantes[0]).ToLower())
    if (-not (Test-Path -LiteralPath $SettingsAlvo -PathType Leaf)) {
        [Console]::Error.WriteLine("Arquivo de configuracao nao encontrado: $SettingsAlvo")
        exit 3
    }
    $restantes = @($restantes | Select-Object -Skip 1)
}

if ($restantes.Count -lt 1) {
    Uso
    exit 2
}

if ($restantes[0] -ceq '-f') {
    if ($restantes.Count -lt 2) {
        Uso
        exit 2
    }
    if (-not (Test-Path -LiteralPath $restantes[1] -PathType Leaf)) {
        [Console]::Error.WriteLine("Arquivo nao encontrado: $($restantes[1])")
        exit 2
    }
    $sql = [System.IO.File]::ReadAllText((Resolve-Path -LiteralPath $restantes[1]).ProviderPath)
    $restantes = @($restantes | Select-Object -Skip 2)
}
else {
    $sql = [string]$restantes[0]
    $restantes = @($restantes | Select-Object -Skip 1)
}

$rotulo = 'consulta'
if ($restantes.Count -ge 1 -and $restantes[0]) { $rotulo = [string]$restantes[0] }

$limite = '180'
if ($restantes.Count -ge 2 -and $restantes[1]) { $limite = [string]$restantes[1] }

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    [Console]::Error.WriteLine('node nao encontrado no PATH (https://nodejs.org): e ele que executa o pth-execute.mjs.')
    exit 3
}

# UTF-8 SEM BOM e sem quebra de linha no fim: os mesmos bytes que o
# pth-query.sh grava. O BOM iria junto para dentro da instrucao SQL.
$utf8 = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($SqlPath, $sql, $utf8)

$tamanho = (Get-Item -LiteralPath $SqlPath).Length
[Console]::Out.WriteLine("sql      : $SqlPath ($tamanho bytes)")

$SettingsAnterior = $env:PTH_SETTINGS
if ($SettingsAlvo) { $env:PTH_SETTINGS = $SettingsAlvo }
$config = $env:PTH_SETTINGS
if (-not $config) { $config = Join-Path $PSScriptRoot 'pth-settings.json' }
[Console]::Out.WriteLine("config   : $config")

try {
    & node --experimental-websocket $Mjs $Funcao $rotulo $limite 'RUNQUERY'
    $codigo = $LASTEXITCODE
}
finally {
    $env:PTH_SETTINGS = $SettingsAnterior
}
exit $codigo
