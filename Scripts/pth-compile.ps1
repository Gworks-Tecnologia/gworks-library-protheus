# ===========================================================================
# STATUS: NAO VALIDADO EM WINDOWS
# Escrito em 2026-09-24 numa maquina Linux, SEM PowerShell disponivel: o que
# foi feito foi so revisao estatica (sintaxe balanceada, ASCII puro, ordem das
# funcoes, armadilhas conhecidas do PowerShell). O pth-compile.sh equivalente,
# esse sim, tem uma suite de testes que passa.
#
# >>> PARA O CLAUDE (ou qualquer leitor futuro deste arquivo) <<<
# Se este bloco ainda esta aqui, este script NUNCA rodou num Windows. Ao le-lo,
# ORIENTE O USUARIO a executar o roteiro abaixo antes de confiar nele, e peca a
# saida completa de cada passo (ou a mensagem de erro). NAO afirme que o script
# "funciona": diga que foi escrito para ser equivalente ao .sh e que falta
# validar. Quando o usuario trouxer os resultados, corrija o que falhar (comece
# pelas SUPOSICOES abaixo) e so entao remova este bloco -- ou troque-o por uma
# linha "Validado em Windows <versao>, PowerShell <versao>, em <data>".
#
# ROTEIRO DE VALIDACAO (PowerShell, na raiz do repositorio; nenhum passo
# altera o RPO ate o 4):
#
#  1. Sintaxe e ajuda -- nao conecta em nada:
#       powershell -ExecutionPolicy Bypass -File .\Scripts\pth-compile.ps1 -h
#     Esperado: o texto de uso e, no fim, "Configuracao em ...:" com servidor e
#     env_* lidos do pth-settings.json (ou "(nao foi possivel ler ...)" se o
#     arquivo ainda nao existe). Uma mensagem "unexpected token", "missing
#     terminator" ou "Missing closing '}'" e ERRO DE SINTAXE DESTE ARQUIVO.
#
#  2. Configuracao -- crie e preencha o arquivo de configuracao:
#       Copy-Item .\Scripts\pth-settings.example.json .\Scripts\pth-settings.json
#     Preencha ip, port, user, password, env_default (e os env_* que usar).
#     Confira a leitura, ainda sem conectar (deve recusar, exit 2):
#       .\Scripts\pth-compile.ps1 -e ZZZ .\Sources\Templates\ConsultaSql
#       echo $LASTEXITCODE
#     Esperado: "Ambiente desconhecido: ZZZ" + a lista de papeis e
#     environments, e 2. Se vier "Preencha em ...", falta preencher campo.
#
#  3. Localizacao do advpls.exe (ainda nao compila nada de util):
#       .\Scripts\pth-compile.ps1 .\Sources\Templates\ConsultaSql\Enums
#     Esperado: chega a imprimir "servidor : ip:porta (ambiente)". Se disser
#     "advpls.exe nao encontrado", veja SUPOSICAO (a) abaixo.
#
#  4. Compilacao real, num ambiente de TESTE, com um fonte pequeno:
#       .\Scripts\pth-compile.ps1 .\Sources\Templates\ConsultaSql\Enums
#       echo $LASTEXITCODE
#     Esperado: o advpls autentica, compila e devolve 0. Confira tambem que
#     nao sobrou nenhum tdscli.*.ini em $env:TEMP (o .ini carrega a senha).
#
#  5. Varios ambientes (so se env_rest/env_workflow/env_job estiverem
#     preenchidos): .\Scripts\pth-compile.ps1 -a <fonte>
#     Esperado: um bloco "=== ambiente n/total ===" por ambiente e o
#     "=== resumo ===" no fim.
#
# SUPOSICOES NAO CONFIRMADAS (se um passo falhar, comece por elas):
#   a) O advpls.exe fica em algum ponto de
#      %USERPROFILE%\.vscode\extensions\totvs.tds-vscode-*\node_modules\@totvs\
#      tds-ls\bin -- a busca e recursiva justamente porque o nome da subpasta
#      no Windows nao foi conferido. Se estiver em outro lugar, use
#      $env:PTH_ADVPLS.
#   b) O advpls aceita o .ini com quebra de linha CRLF (o .sh grava LF, que
#      esta validado no Linux). Se a autenticacao falhar sem motivo aparente,
#      teste trocar "`r`n" por "`n" em Escrever-Ini.
#   c) O .NET da maquina traz a tabela CP1252 (senao cai no Latin-1, igual
#      para letras acentuadas).
#   d) stdout e stderr do advpls chegam de Process concatenados (stdout
#      primeiro, depois stderr), nao intercalados como no .sh. Se a ordem das
#      mensagens importar para diagnostico, isso e o que muda.
#
# Depois de validar, o pth-query.ps1 (mesma pasta) tem o roteiro dele.
# ===========================================================================
#
# Compila fontes AdvPL/TLPP no RPO pela linha de comando, sem VS Code -- versao
# Windows (PowerShell) do pth-compile.sh. Mesmos parametros, mesma
# configuracao, mesmo codigo de saida.
#
# Usa o language server que vem dentro da extensao TDS (advpls.exe), no modo
# "cli": ele le um script .ini com as acoes a executar e fala direto com o
# AppServer. E o mesmo motor que a extensao usa -- o VS Code e so a cara.
#
# Requer PowerShell 5.1 (o que vem no Windows 10/11) ou superior.
#
# Se a politica de execucao do PowerShell bloquear scripts:
#   powershell -ExecutionPolicy Bypass -File .\Scripts\pth-compile.ps1 -a
#
# ---------------------------------------------------------------------------
# CONFIGURACAO: Scripts\pth-settings.json
#
# Servidor, ambientes e credencial vem de UM arquivo JSON -- o MESMO do
# pth-compile.sh --, que descreve UM AppServer. O modelo (sem valores) e o
# pth-settings.example.json:
#
#     Copy-Item Scripts\pth-settings.example.json Scripts\pth-settings.json
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
# arquivo com a variavel de ambiente PTH_SETTINGS.
#
# SENHA. O arquivo carrega a senha em texto puro:
#   - Scripts\pth-settings.json esta no .gitignore -- versione so o .example.
#   - Se a pasta do repositorio e sincronizada (Google Drive, OneDrive...), o
#     arquivo sincroniza junto. Para manter a senha fora dela, guarde o arquivo
#     em outro lugar e aponte:
#         $env:PTH_SETTINGS = "$HOME\.totvsls\pth-settings.json"
#   - O .ini que o advpls consome tambem precisa da senha em texto, entao e
#     gerado na pasta temp do usuario e APAGADO na saida (bloco finally),
#     inclusive com Ctrl+C. No Windows nao ha chmod: a protecao e a da propria
#     pasta temp, que so o usuario acessa.
#
# ADVPLS. Procurado na extensao TDS mais nova instalada em
# %USERPROFILE%\.vscode\extensions\totvs.tds-vscode-*. Para apontar outro
# executavel: $env:PTH_ADVPLS = "C:\caminho\advpls.exe".
# ---------------------------------------------------------------------------

$ErrorActionPreference = 'Stop'

$NomeScript = Split-Path -Leaf $PSCommandPath
$Repo       = Split-Path -Parent $PSScriptRoot

# Primeiro argumento opcional: dev ou prd escolhe Scripts\pth-settings.<alvo>.json.
# Sem ele vale PTH_SETTINGS e, sem ela, Scripts\pth-settings.json. Fica numa
# variavel local de proposito: $env: sobreviveria ao script na sessao do usuario.
$Inicio = 0
if ($args.Count -gt 0 -and @('dev', 'prd') -contains [string]$args[0]) {
    $Settings = Join-Path $PSScriptRoot ('pth-settings.{0}.json' -f ([string]$args[0]).ToLower())
    $Inicio = 1
}
else {
    $Settings = $env:PTH_SETTINGS
    if (-not $Settings) {
        $Settings = Join-Path $PSScriptRoot 'pth-settings.json'
    }
}
$Modelo = Join-Path $PSScriptRoot 'pth-settings.example.json'

# Includes: os mesmos de .vscode/settings.json. O AppServer le estes caminhos
# no momento da compilacao, entao sao caminhos DELE, nao do Windows.
$Includes = '/totvs/protheus/includes/includes-standard/2410'

# Alvo padrao: Global + Projects. Modules fica de fora de proposito -- nao
# mexemos nele, e recompilar 400 fontes legados a cada rodada so serve para
# encher a saida de erro alheio ao que se esta fazendo.
$AlvoPadrao = (Join-Path $Repo 'Sources\AdvPL\Global') + ',' + (Join-Path $Repo 'Sources\AdvPL\Projects')

# RETENTATIVA EM "Failed to open repository". Depois que uma sessao do Protheus
# cai (SmartClient, webapp, debug), o RPO fica preso por um tempo e a
# compilacao seguinte falha com COMPILEERROR-300. Nao e erro do fonte nem da
# credencial: e so o servidor ainda nao ter liberado. ~30s resolve.
$EsperaRpo  = 30
$Tentativas = 3

# O AMBIENTE ESCOLHE O RPO, e um appserver serve varios, cada um com o SEU
# binario: compilar em um NAO publica no outro. O sintoma de errar o alvo e
# cruel -- a rota responde e executa codigo velho, entao a correcao que acabou
# de ser feita simplesmente nao aparece, sem nada dizendo que foi no lugar
# errado. Por isso existem os papeis (-e rest para testar a rota REST, por
# exemplo), e por isso o -e so aceita ambiente conhecido.

function Falhar([string]$mensagem, [int]$codigo) {
    [Console]::Error.WriteLine($mensagem)
    exit $codigo
}

# Leitura tolerante, so para o resumo do -h. A leitura para valer e mais abaixo.
function Ler-Config {
    try {
        $texto = [System.IO.File]::ReadAllText($Settings)
        return ($texto | ConvertFrom-Json)
    }
    catch {
        return $null
    }
}

function Valor-Ou-Traco($x) {
    if ($null -eq $x -or "$x" -eq '') { return '-' }
    return "$x"
}

function Resumo-Config {
    $c = Ler-Config
    if ($null -eq $c) {
        return "  (nao foi possivel ler $Settings)"
    }
    $envs = ''
    if ($null -ne $c.environments) { $envs = (@($c.environments) -join ', ') }
    $linhas = @(
        ('  servidor     : {0}:{1}' -f (Valor-Ou-Traco $c.ip), (Valor-Ou-Traco $c.port)),
        ('  env_default  : {0}' -f (Valor-Ou-Traco $c.env_default)),
        ('  env_rest     : {0}' -f (Valor-Ou-Traco $c.env_rest)),
        ('  env_workflow : {0}' -f (Valor-Ou-Traco $c.env_workflow)),
        ('  env_job      : {0}' -f (Valor-Ou-Traco $c.env_job)),
        ('  environments : {0}' -f (Valor-Ou-Traco $envs))
    )
    return ($linhas -join "`n")
}

function Uso {
    $texto = @'
Uso: {0} [dev|prd] [opcoes] [caminho ...]

  dev|prd     Usa Scripts\pth-settings.dev.json ou pth-settings.prd.json.
              Sem ele: PTH_SETTINGS ou Scripts\pth-settings.json.
              Tem que ser o PRIMEIRO argumento.

  Sem caminho, compila Sources\AdvPL\Global e Sources\AdvPL\Projects.
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

Configuracao em {1}:
{2}

Exemplos:
  .\{0}
  .\{0} dev Sources\Templates\ConsultaSql
  .\{0} -e rest Sources\Templates\ConsultaSql\Api
  .\{0} -a -r Sources\Templates\ConsultaSql
  .\{0} Sources\Templates\ConsultaSql\Api\GwTemplateConsultaSqlApi.tlpp
'@ -f $NomeScript, $Settings, (Resumo-Config)
    [Console]::Out.WriteLine($texto)
}

# ---- Argumentos ------------------------------------------------------------
# Lidos a mao de $args (sem bloco param) para ficarem IGUAIS aos do .sh:
# -r, -a, -e <alvo>, -h e o resto sao caminhos.
$Recompile = 'F'
$Todos     = $false
$Pedidos   = @()
$Caminhos  = @()

$i = $Inicio
while ($i -lt $args.Count) {
    $a = [string]$args[$i]
    if ($a -ceq '-r') {
        $Recompile = 'T'
        $i++
    }
    elseif ($a -ceq '-a') {
        $Todos = $true
        $i++
    }
    elseif ($a -ceq '-e') {
        # Valor vazio e erro, nao "use o padrao": um -e $amb com a variavel
        # vazia por engano nao pode cair em silencio no ambiente padrao.
        if (($i + 1) -ge $args.Count -or [string]::IsNullOrEmpty([string]$args[$i + 1])) {
            Falhar 'Opcao -e exige valor' 2
        }
        $Pedidos += [string]$args[$i + 1]
        $i += 2
    }
    elseif ($a -ceq '-h') {
        Uso
        exit 0
    }
    elseif ($a.StartsWith('-') -and $a.Length -gt 1) {
        Falhar "Opcao invalida: $a" 2
    }
    else {
        $Caminhos += $a
        $i++
    }
}

if ($Todos -and $Pedidos.Count -gt 0) {
    Falhar '-a e -e nao combinam: -a ja compila em todos os ambientes configurados.' 2
}

# ---- Configuracao (pth-settings.json) --------------------------------------
if (-not (Test-Path -LiteralPath $Settings -PathType Leaf)) {
    [Console]::Error.WriteLine("Arquivo de configuracao nao encontrado: $Settings")
    [Console]::Error.WriteLine('Copie o modelo e preencha (veja o topo deste script):')
    [Console]::Error.WriteLine("  Copy-Item $Modelo $(Join-Path $PSScriptRoot 'pth-settings.json')")
    exit 3
}

# Sintaxe primeiro: comentario, virgula sobrando e aspas faltando sao os erros
# de quem edita o arquivo a mao, e o motivo exato vem do proprio parser.
try {
    $Cfg = [System.IO.File]::ReadAllText($Settings) | ConvertFrom-Json
}
catch {
    Falhar "Nao consegui ler $Settings como JSON: $($_.Exception.Message)" 3
}

# Formato. Valor errado aqui vira erro na hora, com o arquivo apontado, em vez
# de uma conexao estranha ou uma compilacao no ambiente que ninguem pediu. ip e
# nomes de ambiente nao tem espaco: um "TESTE5 " com espaco sobrando so
# apareceria como "ambiente nao encontrado" la no servidor.
function Forma-Ok($c) {
    if ($c -isnot [System.Management.Automation.PSCustomObject]) { return $false }
    if ($c.ip -isnot [string]) { return $false }
    if ("$($c.port)" -notmatch '^[0-9]+$') { return $false }

    $lista = $c.environments
    if ($null -ne $lista) {
        if ($lista -isnot [array]) { return $false }
        foreach ($x in $lista) {
            if ($x -isnot [string]) { return $false }
            if ($x -match '\s') { return $false }
        }
    }

    foreach ($campo in 'user', 'password', 'env_default', 'env_rest', 'env_workflow', 'env_job') {
        $v = $c.$campo
        if ($null -ne $v -and $v -isnot [string]) { return $false }
    }
    foreach ($campo in 'ip', 'env_default', 'env_rest', 'env_workflow', 'env_job') {
        $v = $c.$campo
        if ($null -ne $v -and $v -match '\s') { return $false }
    }
    return $true
}

if (-not (Forma-Ok $Cfg)) {
    [Console]::Error.WriteLine("$Settings invalido: esperado um objeto com ip (texto), port (numero), environments (lista de textos)")
    [Console]::Error.WriteLine('e user, password, env_default, env_rest, env_workflow, env_job (texto). ip e nomes de ambiente nao podem ter espacos.')
    [Console]::Error.WriteLine('Veja o topo deste script.')
    exit 3
}

$Ip          = [string]$Cfg.ip
$Porta       = "$($Cfg.port)"
$Usuario     = [string]$Cfg.user
$Senha       = [string]$Cfg.password
$EnvDefault  = [string]$Cfg.env_default
$EnvRest     = [string]$Cfg.env_rest
$EnvWorkflow = [string]$Cfg.env_workflow
$EnvJob      = [string]$Cfg.env_job

$Environments = @()
if ($null -ne $Cfg.environments) {
    $Environments = @($Cfg.environments | ForEach-Object { [string]$_ })
}

$Faltando = @()
if ([string]::IsNullOrEmpty($Ip) -or $Ip -eq '0.0.0.0') { $Faltando += 'ip' }
if (-not ($Porta -match '^[0-9]+$' -and [int64]$Porta -ge 1)) { $Faltando += 'port' }
if ([string]::IsNullOrEmpty($Usuario))    { $Faltando += 'user' }
if ([string]::IsNullOrEmpty($Senha))      { $Faltando += 'password' }
if ([string]::IsNullOrEmpty($EnvDefault)) { $Faltando += 'env_default' }
if ($Faltando.Count -gt 0) {
    Falhar ("Preencha em ${Settings}: " + ($Faltando -join ', ')) 3
}

# ---- Em quais ambientes compilar -------------------------------------------
$Papel = [ordered]@{
    'default'  = $EnvDefault
    'rest'     = $EnvRest
    'workflow' = $EnvWorkflow
    'job'      = $EnvJob
}
$OrdemPapeis = @('default', 'rest', 'workflow', 'job')
$Ambientes   = New-Object System.Collections.Generic.List[string]

# Nome literal vale se estiver em "environments" ou for um dos env_*
# preenchidos. Comparacao sensivel a caixa, como no .sh.
function Nome-Conhecido([string]$n) {
    foreach ($x in $Environments) {
        if ($x -ceq $n) { return $true }
    }
    foreach ($p in $OrdemPapeis) {
        $v = $Papel[$p]
        if ($v -and ($v -ceq $n)) { return $true }
    }
    return $false
}

# Sem repetir: se env_rest for o mesmo ambiente do env_default, compila uma vez.
function Juntar-Ambiente([string]$a) {
    if (-not $Ambientes.Contains($a)) {
        [void]$Ambientes.Add($a)
    }
}

function Resolver-Alvo([string]$alvo) {
    if ($OrdemPapeis -ccontains $alvo) {
        $v = $Papel[$alvo]
        if ([string]::IsNullOrEmpty($v)) {
            Falhar "O papel `"$alvo`" nao esta configurado: env_$alvo esta vazio em $Settings" 2
        }
        Juntar-Ambiente $v
        return
    }

    if (-not (Nome-Conhecido $alvo)) {
        $msg = "Ambiente desconhecido: $alvo"
        foreach ($p in $OrdemPapeis) {
            if ($Papel[$p]) { $msg += "`n  $p -> $($Papel[$p])" }
        }
        $vazio = '(vazio)'
        if ($Environments.Count -gt 0) { $vazio = ($Environments -join ' ') }
        $msg += "`n  environments: $vazio"
        Falhar $msg 2
    }
    Juntar-Ambiente $alvo
}

if ($Todos) {
    foreach ($p in $OrdemPapeis) {
        if ($Papel[$p]) { Juntar-Ambiente $Papel[$p] }
    }
}
elseif ($Pedidos.Count -gt 0) {
    foreach ($p in $Pedidos) { Resolver-Alvo $p }
}
else {
    Resolver-Alvo 'default'
}

# Caminhos passados viram absolutos: o AppServer recebe estes nomes e nao tem
# ideia de qual e o diretorio corrente daqui.
$Programas = $AlvoPadrao
if ($Caminhos.Count -gt 0) {
    $absolutos = @()
    foreach ($caminho in $Caminhos) {
        if (-not (Test-Path -LiteralPath $caminho)) {
            Falhar "Caminho nao encontrado: $caminho" 2
        }
        $absolutos += (Resolve-Path -LiteralPath $caminho).ProviderPath
    }
    $Programas = $absolutos -join ','
}

# ---- advpls ----------------------------------------------------------------
function Achar-Advpls {
    if ($env:PTH_ADVPLS) { return $env:PTH_ADVPLS }

    $extensoes = Join-Path $HOME '.vscode\extensions'
    if (-not (Test-Path -LiteralPath $extensoes)) { return $null }

    # A extensao mais nova primeiro: o numero da versao vai no nome da pasta.
    $pastas = Get-ChildItem -LiteralPath $extensoes -Directory -Filter 'totvs.tds-vscode-*' |
        Sort-Object -Descending -Property {
            $v = $_.Name -replace '^totvs\.tds-vscode-([0-9]+(\.[0-9]+)*).*$', '$1'
            try { [version]$v } catch { [version]'0.0' }
        }

    foreach ($pasta in $pastas) {
        $bin = Join-Path $pasta.FullName 'node_modules\@totvs\tds-ls\bin'
        if (-not (Test-Path -LiteralPath $bin)) { continue }
        $achado = Get-ChildItem -LiteralPath $bin -Recurse -Filter 'advpls.exe' -ErrorAction SilentlyContinue |
            Select-Object -First 1
        if ($achado) { return $achado.FullName }
    }
    return $null
}

$Advpls = Achar-Advpls
if (-not $Advpls -or -not (Test-Path -LiteralPath $Advpls -PathType Leaf)) {
    [Console]::Error.WriteLine('advpls.exe nao encontrado na extensao TDS (%USERPROFILE%\.vscode\extensions\totvs.tds-vscode-*).')
    [Console]::Error.WriteLine('Instale/atualize a extensao TDS no VS Code, ou aponte o executavel: $env:PTH_ADVPLS = "C:\caminho\advpls.exe"')
    exit 3
}

# ---- .ini e compilacao -----------------------------------------------------
# ANSI (CP1252) e exigencia documentada do formato; em UTF-8 a execucao falha.
# O fallback de excecao faz caractere fora da codificacao (emoji, por exemplo)
# falhar ALTO, em vez de virar "?" e mandar uma senha errada em silencio.
function Obter-Ansi {
    $enc = [System.Text.EncoderFallback]::ExceptionFallback
    $dec = [System.Text.DecoderFallback]::ExceptionFallback
    try {
        return [System.Text.Encoding]::GetEncoding(1252, $enc, $dec)
    }
    catch {
        # Algumas edicoes do .NET nao trazem a tabela 1252; o Latin-1 e igual a
        # ela para tudo que importa aqui (letras acentuadas).
        return [System.Text.Encoding]::GetEncoding('iso-8859-1', $enc, $dec)
    }
}
$Ansi = Obter-Ansi

# O .ini carrega a senha. Nasce na pasta temp do usuario e morre no fim,
# aconteca o que acontecer -- ver o finally la embaixo.
$Ini = Join-Path ([System.IO.Path]::GetTempPath()) ('tdscli.' + [guid]::NewGuid().ToString('N').Substring(0, 8) + '.ini')

function Escrever-Ini([string]$ambiente) {
    $linhas = @(
        '; Gerado por Scripts/pth-compile.ps1 -- arquivo temporario, contem senha.',
        'showConsoleOutput=true',
        '',
        '[authentication]',
        'action=authentication',
        "server=$Ip",
        "port=$Porta",
        'secure=0',
        'build=AUTO',
        "environment=$ambiente",
        "user=$Usuario",
        "psw=$Senha",
        '',
        '[compile]',
        'action=compile',
        "program=$Programas",
        "recompile=$Recompile",
        "includes=$Includes"
    )
    try {
        $bytes = $Ansi.GetBytes(($linhas -join "`r`n") + "`r`n")
    }
    catch {
        throw 'Nao consegui converter o .ini para CP1252: user, password ou algum caminho tem caractere fora dessa codificacao (emoji, por exemplo).'
    }
    [System.IO.File]::WriteAllBytes($Ini, $bytes)
}

# Roda o advpls e devolve { Saida, Codigo }. Por Process (e nao por "2>&1"):
# no Windows PowerShell 5.1, redirecionar o stderr de um executavel nativo
# transforma cada linha dele em erro do PowerShell. Aqui stdout e stderr sao
# lidos por tarefas separadas, o que tambem evita travar se um deles encher.
function Executar-Advpls {
    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName               = $Advpls
    $psi.Arguments              = 'cli "' + $Ini + '"'
    $psi.UseShellExecute        = $false
    $psi.RedirectStandardOutput = $true
    $psi.RedirectStandardError  = $true
    $psi.CreateNoWindow         = $true

    $proc = [System.Diagnostics.Process]::Start($psi)
    $tarefaOut = $proc.StandardOutput.ReadToEndAsync()
    $tarefaErr = $proc.StandardError.ReadToEndAsync()
    $proc.WaitForExit()

    $saida = $tarefaOut.Result
    $erro  = $tarefaErr.Result
    if ($erro) { $saida = $saida + $erro }

    return [pscustomobject]@{ Saida = $saida; Codigo = $proc.ExitCode }
}

# Um ambiente por vez, todos ate o fim: um RPO preso nao pode esconder o
# resultado dos outros. O codigo de saida e o do PRIMEIRO que falhou. O advpls
# devolve codigo != 0 quando a compilacao falha, e e esse codigo que vale para
# CI ou para encadear com outro comando.
$PrimeiroErro = 0
$Resumo = New-Object System.Collections.Generic.List[string]
$Total  = $Ambientes.Count

try {
    for ($k = 0; $k -lt $Total; $k++) {
        $amb = $Ambientes[$k]

        if ($Total -gt 1) {
            if ($k -gt 0) { [Console]::Out.WriteLine('') }
            [Console]::Out.WriteLine("=== ambiente $($k + 1)/${Total}: $amb ===")
        }

        Escrever-Ini $amb

        $modo = 'compilar'
        if ($Recompile -eq 'T') { $modo = 'recompilar' }

        [Console]::Out.WriteLine("servidor : ${Ip}:${Porta} ($amb)")
        [Console]::Out.WriteLine("modo     : $modo")
        [Console]::Out.WriteLine('alvo     : ' + (($Programas -split ',') -join ("`n" + (' ' * 11))))
        [Console]::Out.WriteLine('')

        $codigo = 0
        for ($n = 1; $n -le $Tentativas; $n++) {
            $r = Executar-Advpls
            [Console]::Out.WriteLine($r.Saida)
            $codigo = $r.Codigo

            if ($r.Saida -notmatch 'Failed to open repository') { break }

            if ($n -lt $Tentativas) {
                [Console]::Out.WriteLine('')
                [Console]::Out.WriteLine(">>> RPO ocupado (sessao recem-encerrada). Aguardando ${EsperaRpo}s e tentando de novo ($n/$($Tentativas - 1))...")
                Start-Sleep -Seconds $EsperaRpo
                [Console]::Out.WriteLine('')
            }
        }

        if ($codigo -eq 0) {
            [void]$Resumo.Add("  ${amb}: OK")
        }
        else {
            [void]$Resumo.Add("  ${amb}: FALHOU (exit $codigo)")
            if ($PrimeiroErro -eq 0) { $PrimeiroErro = $codigo }
        }
    }

    if ($Total -gt 1) {
        [Console]::Out.WriteLine('')
        [Console]::Out.WriteLine('=== resumo ===')
        foreach ($linha in $Resumo) { [Console]::Out.WriteLine($linha) }
    }
}
catch {
    [Console]::Error.WriteLine($_.Exception.Message)
    if ($PrimeiroErro -eq 0) { $PrimeiroErro = 1 }
}
finally {
    Remove-Item -LiteralPath $Ini -Force -ErrorAction SilentlyContinue
}

exit $PrimeiroErro
