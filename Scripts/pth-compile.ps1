# ===========================================================================
# STATUS: NAO VALIDADO EM WINDOWS
# A implementacao e o pth-compile.mjs (Node), a mesma do Linux, onde foi
# testada; este arquivo so a chama. O que muda no Windows e so a localizacao do
# advpls.exe (%USERPROFILE%\.vscode\extensions\totvs.tds-vscode-*\node_modules\
# @totvs\tds-ls\bin\windows\advpls.exe, suposicao tirada do codigo da extensao)
# e o proprio "node" no PATH.
#
# >>> PARA O CLAUDE: enquanto este bloco existir, NAO afirme que funciona no
# Windows. Peca ao usuario a saida de:
#   1. .\Scripts\pth-compile.ps1 -h        (ajuda + configuracao + servers.json)
#   2. .\Scripts\pth-compile.ps1 <um fonte pequeno, ambiente de TESTE>
# e so entao troque este bloco por "Validado em Windows <versao> em <data>".
# ===========================================================================
#
# Compila fontes AdvPL/TLPP no RPO pela linha de comando, sem VS Code e sem
# senha em arquivo -- mesmos parametros do pth-compile.sh:
#
#   .\Scripts\pth-compile.ps1 [sufixo] [-r] [-e <alvo>]... [-a] [-h] <caminho>...
#
# Configuracao e login: ver o topo do pth-config.mjs e do pth-compile.mjs.
# PTH_ADVPLS (ou ADVPLS) fixa outro advpls.exe.

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    [Console]::Error.WriteLine('node nao encontrado (Node.js 20+): e ele que roda o pth-compile.mjs')
    exit 3
}

& node (Join-Path $PSScriptRoot 'pth-compile.mjs') @args
exit $LASTEXITCODE
