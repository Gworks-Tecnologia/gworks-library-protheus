#include "totvs.ch"

/*/{Protheus.doc} GMNUEXEC
Executar rotinas sem a necessidade de login pelo SIGAMDI/SIGAADV.
@type function
@version 12.1.2310
@author Marinaldo de Jesus
@since 30/04/2011
@history 28/1/2025, Gworks - Giovani, Revisão.
@param _cParms, character, Parâmetros de execução no formato: "empresa;filial;módulo;rotina"
@param _cAuthFile, character, Arquivo de senha para autenticação separado por linhas (opcional).
    Exemplo:
        linha 1: gworks.usuario
        linha 2: gworks.senha
@param _cTables, character, Lista de tabelas (opcional).
@example
    1. Chamada via vscode debugger:
        "lastPrograms":[
            {
                "label": "U_GMNUEXEC",
                "args": [
                    "01;0102;SIGAOMS;OMSA200",
                    "/totvs/share/debug/auth-protheus.txt",
                    "DAI;DAK"
                ]
            }
        ]
    2. Chamada via linha de comando:
        smartclient.exe -q -p=U_GMNUEXEC -a=01;0101;SIGACOM;MATA010 -c=tcp -e=environment -m -l
/*/
User Function gMnuExec( _cParms, _cAuthFile, _cTables )

    Default _cParms := "99;01;SIGACOM;MATA010"
    Default _cAuthFile := "NO_AUTH"
    Default _cTables := ""

    // Definições do agente local Webagent
    // [1] - Versão do webagent
    // [2] - Porta de comunicação
    Local aWebAgentInfo := GetWebAgentInfo() as array

    // Parâmetros referente à rotina desejada para execução
    Local aParms
    Local cEmp // empresa, ex.: "01"
    Local cFil // filial, ex.: "0101"
    Local cMod // módulo, ex.: "COM"
    Local cModName // módulo com sigla, ex.: "SIGACOM"
    Local cRotina // nome da rotina, ex.: "MATA010"
    Local cTables

    // Usuário e senha para login
    Local cFileContent
    Local aAuthContent
    Local cUser
    Local cPassword

    Local cEnvDef as character
    Local cInit as character
    Local bInit as clodeblock
    Local oApp

    Private __lInternet
    Private __cInternet
    Private lMsFinalAuto

    if( empty(aWebAgentInfo[1]) )
        FwAlertWarning("Favor habilitar WebAgent...", "WebAgent desativado!")
        return
    endif

    _cParms := upper(_cParms)
    aParms := StrTokArr(_cParms,';')

    cEmp := aParms[1]
    cFil := aParms[2]
    cModName := aParms[3]
    cMod := replace(cModName,"SIGA","")
    cRotina := aParms[4]
    cTables := fStringifyTables(_cTables)

    if _cAuthFile == "NO_AUTH"
        cUser := nil
        cPassword := nil
    else
        _cAuthFile := lower(_cAuthFile)
        if left(_cAuthFile, 1) == "/"
            _cAuthFile := "l:" + _cAuthFile // Linux
        else
            _cAuthFile := "c:"+ _cAuthFile // Windows
        endif
        if file(_cAuthFile,,.F.)
            cFileContent := memoRead(_cAuthFile,.F.)
            aAuthContent := StrTokArr(cFileContent,CRLF)
            cUser := aAuthContent[1]
            cPassword := aAuthContent[2]
        endif
    endif

    cEnvDef := '{|| RpcSetEnv( '+;
                                '"'+cEmp +'", '+;
                                '"'+cFil +'", '+;
                                '"'+cUser +'", '+;
                                '"'+cPassword +'", '+;
                                '"'+cMod +'", '+;
                                '"'+cRotina +'", '+;
                                cTables +' ) }'

    cInit := '{|| fwMsgRun( nil, '+cEnvDef+', "Inicializando ambiente...", "Aguarde..." ), U_gMnuEnv(), '+cRotina+'(), Final("debug closed") }'
    bInit := &(cInit)
    oApp := MsApp():New(cModName)

        oApp:CreateEnv()
        oAPp:cInternet := nil
        oApp:bMainInit := bInit
        oApp:lMessageBar := .T.
        oApp:cModDesc := cModName

        ptSetTheme("STANDARD")

    oApp:Activate()

Return

/*/{Protheus.doc} gMnuEnv
Inicializa variáveis de ambiente
@type function
@version 12.1.2410
@author Gworks - Giovani
@since 8/22/2025
/*/
User Function gMnuEnv()

    __lInternet := .F.
    __cInternet := "MANUAL"

    lMsFinalAuto := .F.

Return

/*/{Protheus.doc} fStringifyTables
Retorna todas as tabelas informadas via argumento em uma string no formato array.
@type function
@version 12.1.2310
@author Gworks - Giovani
@since 8/22/2025
@param _cTables, character, String contendo as tabelas, conforme exemplo: "SB1;SB5;SBZ"
@return character, String formatada conforme exemplo: "{ SB1, SB5, SBZ }"
/*/
Static function fStringifyTables( _cTables )

    Local cResult as character
    Local cName as character
    Local nI as numeric
    Local aTables := StrTokArr(_cTables,";")

    cResult := ""
    for nI:=1 to len(aTables)
        cName := '"'+aTables[nI]+'"'
        if !empty(cResult)
            cResult += ','
        endif
        cResult += cName
    next

    cResult := '{'+cResult+'}'

Return cResult

