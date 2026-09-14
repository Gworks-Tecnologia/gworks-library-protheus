# Gworks Architectural Patterns

Worked examples pulled directly from `gworks-library-protheus/Sources/`, showing how the classes/functions in this skill compose together in practice.

## Entity Pattern

Location: `Business/<Modulo>/Entities/*.tlpp`. Every entity extends `GwDataAccess` and follows the same three-part shape:

1. **Constructor** — call `_Super:New("<ALIAS>")`, set descriptive attributes, tag the error object with the class name.
2. **Search method(s)** — `ProcurarPor<X>Id(...)`: save area, select area, set order, seek, restore-on-fail-implicitly (caller decides).
3. **Write method(s)** — `Incluir<X>(...)`: validate input, run the legacy routine, propagate `oError` state. The example below builds a `GwExecAuto` because `lRunAsJob` makes this specific write cross-branch/async-capable; for a write that only ever runs in the current branch, skip `GwExecAuto` and call the routine directly (or via a per-routine wrapper) instead — see the ExecAuto usage guidance in `classes-reference.md#gwexecauto` and `advpl-gworks-pattern`'s `references/patterns.md#execauto-wrapper-pattern`.

```advpl
#include "TOTVS.ch"
#include "FWMVCDEF.ch"
#include "MsObject.ch"
#include "TLPP-Core.th"
#include "TLPP-Object.th"

using namespace Gworks.Library.Utils
using namespace Gworks.Library.Classes

namespace Gworks.Business.Compras.Entities

Class GwPedidoCompra From GwDataAccess

    Public Data cResultId as character default ""

    Public Method New()
    Public Method ObterNovoPedidoCompraId() as character
    Public Method IncluirPedidoCompra() as logical
    Public Method ConfirmarPedidoCompraId()

EndClass

Method New() Class GwPedidoCompra
    ::cAlias := ""                       // touch the inherited attribute before _Super:New (avoids a
                                          // multiple-inheritance init-order quirk noted in the source)
    ::cDescription := "Pedido de Compra"
    ::cSourceModel := ""
    ::cSourceView  := ""
    ::cSourceMenu  := ""
    _Super:New("SC7")
    ::oError:cFunName := "GwPedidoCompra"
Return Self

Method ObterNovoPedidoCompraId() as character Class GwPedidoCompra
    Local cPedidoCompraId := U_GwGetNumbering("SC7", "C7_NUM")
Return Soma1(cPedidoCompraId)

Method ConfirmarPedidoCompraId() Class GwPedidoCompra
    U_GwConfirmNumbering()
Return

Method IncluirPedidoCompra( aKeyValue as array, lRunAsJob as logical, cJobEmpresa as character, cJobFilial as character ) as logical Class GwPedidoCompra

    Local oExecAuto as object
    Local lResult := .F. as logical
    Private lMsErroAuto := .F. as logical

    Default aKeyValue := {}
    Default lRunAsJob := .F.

    ::oError:cMethod := "IncluirPedidoCompra"
    if Empty(aKeyValue)
        ::oError:cError := "Parâmetro aKeyValue não informado ou inválido!"
        ::oError:ThrowException()
    endif

    oExecAuto := GwExecAuto():New("MATA120")
    oExecAuto:SetSuccessExpression('SC7->(C7_FILIAL+C7_NUM)')
    if lRunAsJob
        oExecAuto:SetStartJob(cJobEmpresa, cJobFilial, 'COM', FunName(), {'SB1', 'SBM', 'SC7'})
    endif
    oExecAuto:RunExecAuto(, aKeyValue)

    ::oError:lError     := oExecAuto:oError:lError
    ::oError:cAutoGRLog := oExecAuto:oError:cAutoGRLog
    if !::oError:lError
        ::cResultId := oExecAuto:cSuccessExpressionResult
        lResult := .T.
    endif

Return lResult
```

**Search-only entities** (no write path yet, e.g. `GwProduto`, `GwRoteiroOperacao`, `GwProdutoIndicador`) only implement `New()` + a `ProcurarPor<X>Id(...)` method built the same way:

```advpl
Method ProcurarPorProdutoId( cProdutoId as character ) as logical Class GwProduto
    Local lResult := .F. as logical
    if !Empty(cProdutoId)
        _Super:SaveArea()
        _Super:SelectArea()
        _Super:SetOrder('B1_FILIAL+B1_COD')
        _Super:GoTop()
        if _Super:Seek(cProdutoId)
            lResult := .T.
        endif
    endif
Return lResult
```

Cross-branch lookups toggle `DisableAutoFilial()`/`EnableAutoFilial()` around the seek (see `GwProdutoIndicador:ProcurarPorProdutoId`, which seeks `cFilialId+cProdutoId` explicitly instead of letting `Seek()` auto-prepend the *current* branch).

**Entities with a related child table** (e.g. `GwSolicitacaoTransferencia` ↔ `GwSolicitacaoTransferenciaItem`, tables `NNS`/`NNT`) add a `Relacionar<X>()` method that lazily builds the join attributes (`GwKeyValue` with `AliasFrom`/`AliasJoin`/`IndexFrom`/`IndexJoinFK`/`IndexJoinPK`) once, then calls `_Super:SetRelation(...)` the first time and `_Super:RefreshRelation()` on subsequent calls (tracked via an `lStatus...` flag), following the pattern in `GwDataAccess`.

Not every write path goes through `GwExecAuto` — `GwSolicitacaoTransferencia:IncluirSolicitacaoTransferencia` instead loads a raw `FwLoadModel('MATA311')`, walks `GwKeyValue` header/children via `GetNameByPosition`/`GetValueByPosition`, calls `oModelField:LoadValue(...)`/`oModelGrid:LoadValue(...)` per field, then `oModel:VldData()`/`CommitData()`. Use this style when the target routine doesn't have a clean ExecAuto entry point.

## Metadata Pattern

Location: `Templates/APITrace/Metadata/GwTemplateAPITraceHeaderMetadata.tlpp`. Building a new dictionary table end-to-end with `GwMetaData`:

```advpl
User Function HeaderCreate( cRetError as character )

    Local lResult as logical

    Private oMeta_ := GwMetaData():New() as object
    Private cAlias_ := jAliases_["api-trace"]["alias"] as character   // e.g. "ZGT", from a GW_ALIASES system param
    Private cPrefix_ := jAliases_["api-trace"]["prefix"] as character // e.g. "GT" (from U_SxUtilGetFieldPrefixByAlias)

    fSetTables()
    fSetFields()
    fSetIndexes()

    if!( lResult := oMeta_:CommitData() )
        cRetError := "Fault on header metadata create..."
    endif

    fwFreeObj(oMeta_)

Return lResult

Static Function fSetTables()
    Local jTable := JsonObject():New()
    jTable["alias"] := cAlias_
    jTable["name"] := "API Trace"
    jTable["sharing_branch"] := "E"
    jTable["sharing_unit"] := "E"
    jTable["sharing_company"] := "E"
    oMeta_:AddTable( jTable )    // also auto-creates the <prefix>_FILIAL field
Return

Static Function fSetFields()
    Local aFields := {}
    aAdd( aFields, {"alias": cAlias_, "order": "02", "name": cPrefix_+"_STATUS", "type": "C", "size": 1, "decimal": 0,;
                     "title": "Status", "description": "Status da Requisição", "picture": "@!",;
                     "visual": "V", "context": "R", "requisite": .T., "used": .T., "used_brw": .T.,;
                     "dataset": "", "vld_user": "", "combo_box": "", "init": "", "init_brw": "", "when": "", "folder": "", "level": 1} )
    // ... more fields ...
    aFields[ aScan(aFields,{|x| x["name"] == cPrefix_+"_STATUS" })]["combo_box"] := "P=Pendente;C=Concluído;F=Falha"
    aFields[ aScan(aFields,{|x| x["name"] == cPrefix_+"_STATUS" })]["init"] := 'P'
    aEval( aFields, {|jField| oMeta_:AddField( jField ) } )
Return .T.

Static Function fSetIndexes()
    Local aIndexes := {}
    aAdd( aIndexes, {"alias": cAlias_, "order": "1", "key": cPrefix_+"_FILIAL+"+cPrefix_+"_STATUS+"+cPrefix_+"_CID+"+cPrefix_+"_DATA",;
                      "name": "Filial + Status + Ident. + Data", "nickname": "", "show_seek": .T. } )
    // ... more indexes ...
    aEval( aIndexes, {|jIndex| oMeta_:AddIndex( jIndex ) } )
Return .T.
```

Call this once at app-init time (see the Controller pattern below — routed through a `MetadataConfig` enum option) so the dictionary self-heals/creates on first run in any environment, instead of relying on a manually-imported `.dtb`/`.rpo` dictionary patch.

## MVC Template Pattern

Location: `Templates/APITrace/`. This is the reference shape for a small, self-contained Gworks MVC app: one alias-routing table, `Apps` entry points, an `Enum`-driven `Controller`, and standard `ModelDef`/`ViewDef`/`MenuDef`.

**1. Enum defines the routing table** (`Enums/GwTemplateAPITraceEnums.tlpp`):
```advpl
User Function GetControllerEnum()
    Local oEnum := GwEnum():New()
    oEnum:SetEnum( "MetadataConfig", "Inicializar metadados." )
    oEnum:SetEnum( "StartMainBrowse", "Inicializar formulário." )
    oEnum:SetEnum( "GetMenuDef", "Retornar lista de opções do formulário." )
Return oEnum
```

**2. Apps exposes the entry points** users/menus actually call (`Apps/GwTemplateAPITraceApps.tlpp`) — each just resolves the enum id and forwards to the single `Controller`:
```advpl
Static lInit__ := iif( lInit__ == nil .or. !lInit, fInit(), .T. ) as logical
Static Function fInit()
    if type('oControllerEnum___') == 'U'
        Public oControllerEnum___ := U_GetControllerEnum()
    endif
    lInit__ := .T.
Return

User Function StartMainBrowse()
    nOpc___ := oControllerEnum___:GetEnum('StartMainBrowse')
Return( U_Controller( nOpc___ ) )
```

**3. Controller does environment setup + routing, using `GwMessagingClass` for the shared error/log object** (`Controllers/GwTemplateAPITraceController.tlpp`):
```advpl
User Function Controller( nOpc as integer, xParam as variant )
    Default nOpc := iif( empty(nOpc) .and. type("nOpc___")=="N", nOpc___, 0 )
    Private lBlind_ := isBlind() .or. type("cFilAnt") == "U" as logical
    Private oMessage_ := GwMessagingClass():New() as object
    Private oError_ := oMessage_:GetObject("error") as object

    fSetEnvironment(xParam)     // RpcSetEnv() only when blind AND not already inside U_GMNUEXEC's env

    do case
        case nOpc == oControllerEnum___:GetEnum('MetadataConfig')  ; U_MetadataConfig()
        case nOpc == oControllerEnum___:GetEnum('StartMainBrowse') ; U_ApiTraceMainForm()
    otherwise
        U_GwThrowError("Invalid value for nOpc!")
    endcase

    fResetEnvironment()
Return xResult
```

**4. ModelDef/ViewDef** use `Gworks.Library.MvcUtils` helpers and standard `FWFormStruct`/`MPFormModel`/`FWFormView`:
```advpl
User Function ModelDef()
    Local oStrFields := FWFormStruct( 1, jPreCarga__['MODEL_FIELDS']['cAlias'], jPreCarga__['MODEL_FIELDS']['bFields'] )
    Local oModel := MPFormModel():New( jPreCarga__['cId'], jPreCarga__['bPre'], jPreCarga__['bPost'], jPreCarga__['bCommit'], jPreCarga__['bCancel'] )
    oModel:addFields( jPreCarga__['MODEL_FIELDS']['cId'],, oStrFields )
    oModel:SetPrimaryKey( jPreCarga__['MODEL_FIELDS']['aPK'] )
Return oModel
```
`BrowseDef` builds an `FwMBrowse` with `AddLegend()` per status color, driven by the same `jBrowser___` config JSON populated in the app's `fInit()`. `MenuDef` uses `ADD OPTION ... Action jConfig___[...]["actions"]` instead of hardcoding the ViewDef path string.

Use this whole shape (Enum + Apps + Controller + Model/View/Menu + a `Metadata` folder using `GwMetaData`) as the template for a new small Gworks feature app in this project, swapping the alias/fields/routing for the new feature.

## CSV Import Pattern

Location: `Library/Functions/Imports/*.tlpp` (e.g. `GwLibraryImportacaoCliente.tlpp`, `GwLibraryImportacaoCentroCusto.tlpp`). All five import wizards share the same skeleton:

```advpl
User Function Importar()   // (or ImportarCCusto, etc.)

    Local lResult as logical

    Private cTarget_ := '' as character
    Private oError_ := GwError():New() as object
    Private oLog_ := GwConsoleLog():New() as object
    Private jMessage_ := U_GwGetMessage() as json
    Private lProduction_ := empty(GetSrvProfString("SpecialKey","")) as logical
    Private lBlind_ := (isBlind() .or. type('CEMPANT') == 'U' ) as logical

    if lBlind_
        UserException("...U_IMPORTAR - Invalid rpc call...")
    endif

    aDados__ := {}   // module Static, reset between runs

    try

        if( !fGetFile() .or. empty(cTarget_) .or. !file(cTarget_) )
            jMessage_['cState'] := "WARNING"
            jMessage_['cError'] := "Arquivo inválido ou não selecionado!"
            jMessage_['cSuggestion'] := "Selecione um arquivo válido e tente novamente."
            jMessage_['cTitle'] := "Atenção!"
            jMessage_['lError'] := .F.
            U_GwSetMessage(oError_, oLog_, jMessage_)
            return
        endif

        processa({|| lResult := fProcess()}, "Importando arquivo...", "Aguarde...")
        if!( lResult )
            return
        endif

    catch _varError

        if!( oError_:lError )
            jMessage_['cState'] := "FAULT"
            jMessage_['cError'] := "Falha inesperada!"
            jMessage_['cSuggestion'] := "Favor contactar o suporte técnico."
            jMessage_['cTitle'] := "Falha!"
            jMessage_['lError'] := .T.
            jMessage_['cDetails'] := "Erro:" + _varError:Description + CRLF2 + "Stack:" + _varError:errorStack
            U_GwSetMessage(oError_, oLog_, jMessage_)
        endif

    endtry

    if lResult
        fWAlertSuccess("Arquivo processado com sucesso.", "Sucesso!")
    endif

    oError_:Clear()
    oLog_:Clear()

Return
```

Key points for writing a new import in this style:
- `fGetFile()` is a `Static Function` local to the import file — it picks the file (`U_GwGetFile()` or a `cGetFile()` dialog) and sets `cTarget_`.
- `fProcess()` (also `Static`) does the actual row-by-row work — typically via `GwFileIterator:EvalByCondition(...)` reading `cTarget_`, validating each row, and issuing `U_GwArrayCommit()`/`GwExecAuto` calls per row, accumulating any per-row failures into module statics (`cRegistered__`, `c<X>Invalid__`, `cAutoGrLog__`) for the final report.
- Every user-facing outcome — success, validation failure, or unexpected exception — goes through the **same** `U_GwSetMessage(oError_, oLog_, jMessage_)` call, keeping error display and logging consistent across all five importers.
- The header ProtheusDOC block documents the exact CSV column layout (position + field + type) — always include this when adding a new importer, since there's no other schema declaration.

## Error / Log / Messaging Pattern

Two styles coexist in the codebase; prefer the second for new code:

**Classic (`GwError` + `GwConsoleLog` directly)** — used inside `Business/*` entity methods:
```advpl
::oError:cMethod := "IncluirPedidoCompra"
if Empty(aKeyValue)
    ::oError:cError := "Parâmetro aKeyValue não informado ou inválido!"
    ::oError:ThrowException()
endif
```

**Unified (`GwMessagingClass`)** — used in the newer `Templates/APITrace` code and recommended going forward:
```advpl
oMessage_:SetProperty( "error_state", .T. )
oMessage_:SetProperty( "error_message", "Falha ao validar/criar metadados!" )
oMessage_:SetProperty( "error_suggestion", "Favor contactar o suporte técnico." )
oMessage_:SetProperty( "error_style", "HELP" )
oMessage_:SetProperty( "error_details", cError )
oMessage_:SetProperty( "log_state", "ERROR" )
oMessage_:Display()
```

Both ultimately bottom out in `GwError:ShowError()`, which is blind-safe (`IsBlind()` suppresses GUI alert paths automatically) — so error/log code written against either style is safe to call from REST endpoints, jobs, or interactive screens without branching on execution context yourself.
