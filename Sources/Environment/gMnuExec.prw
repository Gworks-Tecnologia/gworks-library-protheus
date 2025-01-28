#include "totvs.ch"
#include "tbiconn.ch"

/*/{Protheus.doc} GMNUEXEC
Executar rotinas sem a necessidade de login pelo SIGAMDI/SIGAADV.
@type function
@version 12.1.2310
@author Marinaldo de Jesus
@since 30/04/2011
@history 28/1/2025, Gworks - Giovani, Revisão.
@param _cParms, character, Parâmetros no formato:"empresa;filial;módulo;rotina"
@param _cAuthFile, character, Arquivo de senha para autenticação.
@param _cTables, character, Lista de tabelas (opcional).
@example U_GMNUEXEC("01;"0101;SIGACOM;MATA010").
@obs A chamada pode ser realizada diretamente via linha de comando conforme exemplo a seguir:
    totvsclient.exe -q -p=U_GMNUEXEC -a=01;0101;SIGACOM;MATA010 -c=tcp -e=environment -m -l
/*/
User Function gMnuExec( _cParms, _cAuthFile, _cTables ) // U_GMNUEXEC

    Default _cParms := "99;01;SIGACOM;MATA010"
    Default _cAuthFile := "NO_AUTH"
    Default _cTables := nil

    // Parâmetros referente à rotina desejada para execução
    Local aParms
    Local cEmp // empresa, ex.: "01"
    Local cFil // filial, ex.: "0101"
    Local cMod // módulo, ex.: "COM"
    Local cModName // módulo com sigla, ex.: "SIGACOM"
    Local cRotina // nome da rotina, ex.: "MATA010"

    // Usuário e senha para login
    Local cUser
    Local cPassword

    // Lista de tabelas a serem abertas na preparação do ambiente
    Local aTables

    // Bloco de código para execução da rotina
    Local bWindowInit

    _cParms := upper(_cParms)
    aParms := StrTokArr(_cParms,';')

    cEmp := aParms[1]
    cFil := aParms[2]
    cModName := aParms[3]
    cRotina := aParms[4]

    if !empty(_cTables)
        aTables := StrTokArr(_cTables,';')
    endif

    SetModulo( @cModName, @cMod )

    RPCSetEnv(;
        cEmp,; // cRpcEmp
        cFil,; // cRpcFil
        cUser,; // cEnvUser
        cPassword,; // cEnvPass
        cMod,; // cEnvMod
        cRotina,; // cFunName
        aTables; // aTables
    )

    InitPublic()

    SetsDefault()

    SetModulo( @cModName, @cMod )

    bWindowInit := &( "{ || __Execute( "+cRotina+"(), 'xxxxxxxxxxxxxxxxxxxx' , "+cRotina+", "+cModName+", "+cModName+", 1, .T. ) }" )

    DEFINE WINDOW oMainWnd FROM 001,001 TO 400,500 TITLE OemToAnsi( FunName() )

    ACTIVATE WINDOW oMainWnd MAXIMIZED ;
        ON INIT ( Eval( bWindowInit ), oMainWnd:End() )

    RpcClearEnv()

Return

/*/{Protheus.doc} SetModulo
Setar o Modulo desejado para execução.
@type function
@version 12.1.2310
@author Marinaldo de Jesus
@since 1/28/2025
@param cModName, character, Módulo com sigla, ex.: "SIGACOM".
@param cMod, character, Retorna o código do módulo, ex.: "COM".
/*/
Static Function SetModulo( cModName, cMod )

    Local aRetModName := RetModName( .T. )

    Local cSvcModulo
    Local nSvnModulo

    if ( type("nModulo") == "U" )
        _SetOwnerPrvt( "nModulo" , 0 )
    else
        nSvnModulo := nModulo
    endif

    cModName := Upper( AllTrim( cModName ) )
    if ( nModulo <> aScan( aRetModName , { |x| Upper( AllTrim( x[2] ) ) == cModName } ) )
        nModulo := aScan( aRetModName , { |x| Upper( AllTrim( x[2] ) ) == cModName } )
        if ( nModulo == 0 )
            cModName := "SIGAFAT"
            nModulo  := aScan( aRetModName , { |x| Upper( AllTrim( x[2] ) ) == cModName } )
        endif
    endif

    if ( type("cModulo") == "U" )
        _SetOwnerPrvt( "cModulo" , "" )
    else
        cSvcModulo := cModulo
    endif

    cMod := SubStr( cModName , 5 )
    if ( cModulo <> cMod )
        cModulo := cMod
    endif

Return // { cSvcModulo , nSvnModulo  }
