# ===========================================================================
# STATUS: ESTA VERSAO AINDA NAO RODOU NO WINDOWS
# A versao anterior deste script (advpls cli, senha no settings) foi validada no
# Windows pelo usuario. Esta e outra implementacao: o pth-compile.mjs (Node), a
# mesma do Linux, onde foi testada contra um servidor real, com login pelo token
# salvo pela extensao; este arquivo so a chama. O que e proprio do Windows
# (suposicoes -- se algo falhar, comece por elas):
#   a) advpls.exe em %USERPROFILE%\.vscode\extensions\totvs.tds-vscode-*\
#      node_modules\@totvs\tds-ls\bin\windows\advpls.exe (tirado do codigo da
#      extensao); PTH_ADVPLS fixa outro.
#   b) Settings do VS Code em %APPDATA%\Code\User (settings.json, perfis em
#      profiles\<id>\, associacao pasta->perfil em globalStorage\storage.json,
#      com a chave "file:///c%3A/..."): o -h mostra de onde leu casa/globo e as
#      extensoes. servers.json global em %USERPROFILE%\.totvsls.
#   c) WebAgent em %LOCALAPPDATA%\Programs\web-agent (pasta confirmada pelo
#      usuario), executavel web-agent.exe ou webagent.exe (nome a confirmar).
#   d) O proprio "node" no PATH.
#
# >>> PARA O CLAUDE: enquanto este bloco existir, NAO afirme que funciona no
# Windows. Peca ao usuario a saida de:
#   1. .\Scripts\pth-compile.ps1 -h        (ajuda + configuracao + servers.json;
#                                           confira modo casa/globo e o perfil)
#   2. .\Scripts\pth-compile.ps1 -w        (WebAgents achados e qual serve)
#   3. .\Scripts\pth-compile.ps1 <um fonte pequeno, ambiente de TESTE>
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
