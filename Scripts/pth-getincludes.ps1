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
# Irmao do pth-getincludes.sh: mesmos parametros, mesma saida.
#
# Uso:
#   Scripts\pth-getincludes.ps1 <ip> <porta>
#
# Variavel:
#   PTH_SERVERS_JSON  outro servers.json. Default: <repo>\.vscode\servers.json

param(
    [Parameter(Position = 0)] [string]$Ip,
    [Parameter(Position = 1)] [string]$Porta
)

$ErrorActionPreference = 'Stop'

function Falhar([string]$mensagem, [int]$codigo) {
    [Console]::Error.WriteLine($mensagem)
    exit $codigo
}

if ([string]::IsNullOrEmpty($Ip) -or [string]::IsNullOrEmpty($Porta)) {
    Falhar 'Uso: pth-getincludes.ps1 <ip> <porta>' 2
}

$Repo = Split-Path -Parent $PSScriptRoot
$ServersJson = if ($env:PTH_SERVERS_JSON) { $env:PTH_SERVERS_JSON } else { Join-Path $Repo '.vscode\servers.json' }

if (-not (Test-Path -LiteralPath $ServersJson -PathType Leaf)) {
    Falhar "Nao encontrei ${ServersJson}: e de la que saem os includes (PTH_SERVERS_JSON aponta outro)." 3
}
try {
    # O BOM vem de editores que gravam UTF-8 com assinatura; ConvertFrom-Json nao o aceita em todas as versoes.
    $Servers = [System.IO.File]::ReadAllText($ServersJson).TrimStart([char]0xFEFF) | ConvertFrom-Json
} catch {
    Falhar "Nao consegui ler $ServersJson como JSON." 3
}

$Lista = New-Object System.Collections.Generic.List[string]
function Juntar([object]$caminho) {
    $c = [string]$caminho
    if (-not [string]::IsNullOrEmpty($c) -and -not $Lista.Contains($c)) { $Lista.Add($c) }
}

foreach ($inc in @($Servers.includes)) { Juntar $inc }
foreach ($conf in @($Servers.configurations)) {
    if ($null -ne $conf -and [string]$conf.address -eq $Ip -and "$($conf.port)" -eq $Porta) {
        foreach ($inc in @($conf.includes)) { Juntar $inc }
    }
}

if ($Lista.Count -eq 0) {
    Falhar "Nenhum include em $ServersJson (nem no topo nem na configuracao de ${Ip}:${Porta})." 3
}

Write-Output ($Lista -join ',')
