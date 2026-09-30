# ===========================================================================
# STATUS: VALIDADO EM WINDOWS PELO USUARIO -- o fluxo da consulta (WebApp,
# WebAgent, o navegador.cmd que o pth-execute.mjs gera, a pasta %TEMP% do
# cliente) funcionou. Depois disso mudou so a CONFIGURACAO: o settings passou a
# apontar um servidor do servers.json da extensao TDS (pth-config.mjs, que tambem
# le os perfis do VS Code) e o pth-execute passou a conferir a versao do
# WebApp x WebAgent. Isso ainda nao rodou no Windows.
#
# >>> PARA O CLAUDE: pode dizer que a consulta funciona no Windows; para a
# configuracao nova, peca ao usuario a saida dos passos 2 a 4 abaixo na primeira
# vez que ele usar la, e entao troque este bloco por "Validado em Windows em <data>".
#
# ROTEIRO DE VALIDACAO (PowerShell, na raiz do repositorio):
#
#  1. Sintaxe -- nao conecta em nada:
#       powershell -ExecutionPolicy Bypass -File .\Scripts\pth-query.ps1
#     Esperado: as duas linhas de "Uso: ..." e exit 2. "unexpected token" ou
#     "missing terminator" e ERRO DE SINTAXE DESTE ARQUIVO.
#
#  2. Node e configuracao (com o pth-settings.json criado, ver o topo do
#     pth-config.mjs). Um ambiente inexistente deve ser recusado ANTES de abrir
#     navegador:
#       $env:PROTHEUS_ENV = 'ZZZ'
#       .\Scripts\pth-query.ps1 "SELECT 1"
#       Remove-Item Env:PROTHEUS_ENV
#     Esperado: "sql      : ...\consultasql.sql (8 bytes)" e depois
#     "Ambiente desconhecido: ZZZ" (exit 3). "node nao encontrado" = falta o
#     Node.js no PATH.
#
#  3. WebAgent -- lista os instalados (%LOCALAPPDATA%\Programs\web-agent) e
#     marca qual serve para a versao do WebApp do servidor:
#       .\Scripts\pth-compile.ps1 -w
#     Esperado: "WebApp de <servidor>: <versao> -> precisa de WebAgent 1.x.x" e
#     a lista. Lista vazia = o nome do executavel ou a pasta sao outros: peca
#     o caminho ao usuario.
#
#  4. Consulta de verdade -- precisa de: servidor de pe, os campos webagent e
#     browser preenchidos (com launch_by_webagent true) e o Node.js:
#       .\Scripts\pth-query.ps1 "SELECT TOP 3 A1_COD FROM SA1010 WHERE D_E_L_E_T_ = ' '"
#     Esperado: o pth-execute.mjs imprime servidor/programa/modo, a linha
#     "webapp   : <versao> -> WebAgent 1.x.x (configurado: ...)" e
#     "retorno : ...\consultasql-retorno.json (Ns)", exit 0.
#     "WebAgent X nao serve para o WebApp Y" (exit 3) = webagent da serie
#     errada. "Nenhum navegador ... encontrado": preencha "browser" no arquivo.
#
# CONFIRMADO PELO USO NO WINDOWS: o GetTempPath() do AdvPL num cliente Windows e
# a mesma pasta do [System.IO.Path]::GetTempPath() daqui; o pth-execute.mjs acha o
# navegador; o WebApp/WebAgent aceita o caminho no formato Windows; o
# web-agent.exe aceita o navegador.cmd no --browser. Se um dia falhar, a linha
# "[ConsultaSql] retorno gravado em: ..." do ConOut mostra o caminho usado.
#
# PONTO DE ATENCAO DO TLPP, independente do Windows: o Service do ConsultaSql
# chama U_GwApiQuery( cSql, @jDados ) (modo direto, versao 1.1 da lib). Se o
# RPO do ambiente tiver a versao antiga (so REST), toda consulta responde
# ok=false, status 500, "Resposta invalida da consulta". Nesse caso NAO e
# defeito deste script: compile <lib>\Library\Classes\ApiQuery nesse ambiente
# (<lib> = Sources\Global\Gworks num cliente, Sources na gworks-library-protheus).
#
# Depois de validar, apague este bloco (ou troque pela linha de "Validado em").
# ===========================================================================
#
# Executa uma consulta SQL no Protheus pela rota GwConsultaSql -- versao Windows
# (PowerShell) do pth-query.sh. Mesmo comportamento, mesma configuracao
# (Scripts/pth-settings.json, descrito no topo do pth-config.mjs).
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
#   .\Scripts\pth-query.ps1 [sufixo] "<SQL>" [rotulo] [segundos]
#   .\Scripts\pth-query.ps1 [sufixo] -f consulta.sql [rotulo] [segundos]
#
# sufixo (primeiro argumento, opcional: homolog, cliente-x...) usa
# Scripts\pth-settings.<sufixo>.json; sem ele vale PTH_SETTINGS e, sem ela,
# Scripts\pth-settings.json.
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
    [Console]::Error.WriteLine("Uso: $nome [sufixo] `"<SQL>`" [rotulo] [segundos]")
    [Console]::Error.WriteLine("     $nome [sufixo] -f arquivo.sql [rotulo] [segundos]")
    [Console]::Error.WriteLine("  sufixo: usa Scripts\pth-settings.<sufixo>.json (homolog, cliente-x...);")
    [Console]::Error.WriteLine("          sem ele, PTH_SETTINGS ou Scripts\pth-settings.json.")
}

$restantes = @($args)

# Primeiro argumento opcional: um sufixo (nome simples: letras, numeros, _ e -)
# escolhe Scripts\pth-settings.<sufixo>.json, repassado ao pth-execute.mjs por
# PTH_SETTINGS (restaurado no fim, para nao vazar para a sessao do usuario). Um
# SQL nunca e nome simples, e -f comeca com traco.
$SettingsAlvo = $null
if ($restantes.Count -gt 0 -and ([string]$restantes[0]) -match '^[A-Za-z0-9][A-Za-z0-9_-]*$') {
    $SettingsAlvo = Join-Path $PSScriptRoot ('pth-settings.{0}.json' -f [string]$restantes[0])
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

# Retorno velho fora: um run que falha nao pode deixar o anterior passar por
# novo, e no modo launch_by_webagent o aparecimento dele e o sinal de fim.
$Retorno = Join-Path ([System.IO.Path]::GetTempPath()) 'consultasql-retorno.json'
Remove-Item -LiteralPath $Retorno -ErrorAction SilentlyContinue

$SettingsAnterior = $env:PTH_SETTINGS
$EsperaAnterior   = $env:PROTHEUS_WAIT_FILE
if ($SettingsAlvo) { $env:PTH_SETTINGS = $SettingsAlvo }
$env:PROTHEUS_WAIT_FILE = $Retorno
$config = $env:PTH_SETTINGS
if (-not $config) { $config = Join-Path $PSScriptRoot 'pth-settings.json' }
[Console]::Out.WriteLine("config   : $config")

try {
    & node --experimental-websocket $Mjs $Funcao $rotulo $limite 'RUNQUERY'
    $codigo = $LASTEXITCODE
}
finally {
    $env:PTH_SETTINGS       = $SettingsAnterior
    $env:PROTHEUS_WAIT_FILE = $EsperaAnterior
}
exit $codigo
