# Cross-Cutting Patterns

## Service → Core → Builder Pattern

This is the pipeline behind every user action in PreCarga (`LiberacaoComercialService`, `LiberacaoFinanceiraService`, `MontarCargaService`, `PreCargaIncluirService`, `PreCargaUpdateService`, `ReservaEstornarService`, `ReservaIncluirService`). Three responsibilities, three layers, never mixed:

### Service — outer shell

```advpl
User Function ReservaIncluirService()

    Local jAreas := JsonObject():New() as json

    Private oPreCargaDao_ := TemplatePreCarga():New() as object   // shared with Core + Builder for this request

    jAreas["active"] := GetArea()
    jAreas["extras"] := { ZAK->(GetArea()), ZAI->(GetArea()), ZC9->(GetArea()) }

    try

        if !( U_PreCargaReservarCore() )
            return
        endif

    catch _varError

        if!( oMessage_:GetObject("error"):lError )   // don't double-report if Core/Builder already displayed something

            oMessage_:SetProperty( "error_state", .T. )
            oMessage_:SetProperty( "error_message", "Falha inesperada!" )
            oMessage_:SetProperty( "error_suggestion", "Favor contactar o suporte técnico." )
            oMessage_:SetProperty( "error_title", "Falha!" )
            oMessage_:SetProperty( "error_style", "HELP" )
            oMessage_:SetProperty( "error_details", "Erro: " + _varError:description + CRLF2 + "Stack: " + _varError:errorStack )
            oMessage_:SetProperty( "log_state", "ERROR" )
            oMessage_:Display()

        endif

    endtry

    RestArea( jAreas["extras"][3] )
    RestArea( jAreas["extras"][2] )
    RestArea( jAreas["extras"][1] )
    RestArea( jAreas["active"])

Return
```

The Service declares whatever `Private` object(s) the Core/Builder need for this one request (here `oPreCargaDao_`; some Services also declare `jPreCarga_`), does exactly one area-save/try-one-Core-call/area-restore cycle, and nothing else. `oMessage_`/`oError_` are **not** redeclared here — they come from the Controller, one level up, for the whole request.

### Core — user interaction + orchestration

```advpl
User Function PreCargaReservarCore()

    Local lResult as logical
    Local jCounter as json

    if!(FwAlertYesNo("Confirma a Reserva da Pré-Carga?","Reservar!?"))
        return .F.
    endif

    oBrwPreCarga_:Disable()

    jCounter := JsonObject():New()
        jCounter["codigo"] := ""
        jCounter["pendentes"] := 0
        jCounter["sucesso"] := 0
        jCounter["falha"] := 0

    FwMsgRun( nil, {|oSay| lResult := fProc( oSay, @jCounter ) }, "Reservando Pré-Carga...", "aguarde..." )

    if( lResult )
        // ... build a summary message from jCounter and show FwAlertSuccess/Warning/Info ...
    endif

    oBrwPreCarga_:Refresh( .F. )
    oBrwPreCarga_:Enable()

Return lResult

Static Function fProc( oSay as object, jCounter as json )
    // 1. validate preconditions (status checks) with FwAlertInfo + early return .F.
    // 2. position the aggregate Entity (oPreCargaDao_:PosicionarPedidos/PosicionarProdutos)
    // 3. run the actual work through the Entity's iterator, calling into a Builder per row:
    oPreCargaDao_:IterarPedidos( {|| oPreCargaDao_:IterarProdutos( {|| Applications.PreCarga.Builders.U_OrdemProducaoBuilder() } ) } )
    // 4. pull counters back out of the Builder's module statics:
    if( U_OrdemProducaoBuilderGetCounters( @jCounter, 'jCounter["pendentes"] > 0' ) )
        U_OrdemProducaoPersist( @jCounter )       // flush accumulated work (see below)
        U_SetPreCargaStatus(cPreCarga)            // recompute derived header status
    endif
Return .T.
```

The `jCounter` shape (`{codigo, pendentes, sucesso, falha}`) is the **standard result contract** threaded from Builder → Core → the final summary alert — reuse this exact shape for any new action so the summary-alert code (success/warning/info by count) can be copy-pasted unchanged.

### Builder — business logic, with the cross-branch split

The **simple** case (no cross-branch fan-out): a Builder just does the work directly, e.g. `LiberacaoComerciaIncluirlBuilder`/`LiberacaoComerciaEstornarlBuilder` operate straight on the live MVC grids (`FwModelActive():GetModel('MODEL_GRID_PEDIDOS')` etc.) and call other Services/Gworks functions in-line (`U_GwPedidoVendaLiberar`, `U_GwPedidoVendaEstornarLiberacao`).

The **cross-branch batch** case (`OrdemProducaoBuilder`/`MontarCargaBuilder`/`EstornarBuilder`) needs three functions because the work may have to run in a different company branch than the current session, via `StartJob`:

1. **`<Name>Builder()`** — called once per aggregate row (from inside the Entity's iterator). Accumulates the row's data into a **module `Static` json/array**, grouped by branch (and often by parent key too, to batch multiple children under one legacy-routine call):
   ```advpl
   cAttrFilial := ("filial_"+cFilOrigem)
   if( jCommit__[cAttrFilial] == nil )
       jCommit__[cAttrFilial] := JsonObject():New()
   endif
   ```
   Guards re-initialization with the same `lInit__`/`lNewProc_` pair used everywhere else in this pattern (`lNewProc_` is set `.T.` by the Core right before starting a *new* top-level iteration, so the Builder knows to clear stale accumulated state from any previous run in the same session).

2. **`<Name>Persist(jCounter)`** — called once, after the full iteration finishes. Loops the accumulated groups; for each group decides **in-process call vs. `StartJob`** purely by comparing the group's branch to the current session's:
   ```advpl
   lStartThread := ( jJsonGroup["filial"] != cFilAnt )
   cJsonGroup := jJsonGroup:toJson()          // ALWAYS serialize before crossing the StartJob boundary
   if!( lStartThread )
       cJsonRet := Applications.PreCarga.Builders.U_XxxExec( cJsonGroup )
   else
       jJsonThread := JsonObject():New()
           jJsonThread["lNewThread"] := .T.
           jJsonThread["cRpcEmpresa"] := cEmpAnt
           jJsonThread["cRpcFilial"] := jJsonGroup["filial"]
           jJsonThread["cRpcMod"] := "OMS"
           jJsonThread["cRpcRotina"] := FunName()
           jJsonThread["aRpcTables"] := {"SC2","SD4"}   // whatever tables the Exec worker needs open
       cJsonRet := StartJob( "Applications.PreCarga.Builders.U_XxxExec", getEnvServer(), .T./*lWait*/, cJsonGroup, jJsonThread:toJson() )
   endif
   jJsonRet := JsonObject():New() ; jJsonRet:fromJson(cJsonRet)
   nSuccess__ += jJsonRet["nTotSuccess"] ; nFault__ += jJsonRet["nTotFault"]
   ```
   `lWait := .T.` is always passed to `StartJob` — this pattern is synchronous batch fan-out (wait for each branch's thread before moving to the next), not fire-and-forget.

3. **`<Name>Exec(cJsonGroup, cJsonThread)`** — the actual worker, runs either in-process or inside the spawned thread. First thing it does is decode `cJsonThread` and, if `jJsonThread["lNewThread"]`, call `RpcSetEnv(...)` itself (and `RpcClearEnv()` at the end) — **the worker manages its own environment**, the Persist function never calls `RpcSetEnv` directly. Returns a JSON **string** (`jResult:toJson()`, shape `{nTotSuccess, nTotFault[, cError]}`) — never a live object, since it may be crossing a `StartJob` thread boundary.

**Rule of thumb for a new action:** if every write always happens in the current branch, skip the Builder/Persist/Exec split and just write a single `<Name>Builder()` that does the work directly (like the Liberação Comercial builders). Only reach for the three-function split when the aggregate can legitimately span branches (Ordem de Produção, Carga, Estorno — anywhere the child rows carry their own `_FILORI`/branch code that can differ from `cFilAnt`).

## ExecAuto Wrapper Pattern

Unlike the generic `GwExecAuto` class from `advpl-gworks` (dynamic codeblock built from an arbitrary `GwKeyValue` array), each legacy routine PreCarga touches gets its **own** thin, hand-written wrapper under `Common/ExecAuto/`, because each routine needs different pre-positioning depending on the operation:

```advpl
#define STR_NAMES "produto|um|local|cc|quant|datpri|datprf|obs|tpop|recno|joins|apont"

User Function OrdemProducaoExecAuto( jOrdem as json, nOper as integer )

    Local jResult := JsonObject():New() as json
    Local cInvalid := "" as character
    Local oError := GwError():New() as object

    Private lMsErroAuto as logical
    Private lAutoErrNoFile as logical
    Private lMsHelpAuto as logical

    // 1. Reject unknown AND missing properties against a pipe-list allowlist
    aEval( jOrdem:getNames(), {|name| iif(!(name $ STR_NAMES), cInvalid += (name+";"), nil) } )
    if!( empty(cInvalid) )
        UserException("... - Invalid properties for jOrdem: " + cInvalid )
    endif
    if( len(jOrdem:getNames()) != len(strToKarr(STR_NAMES,"|")) )
        UserException("... - Missing properties for jOrdem!" )
    endif

    // 2. Pre-position depending on operation (insert opens fresh; update/delete locate by recno)
    if( allTrim(str(nOper)) $ "3" )
        dbSelectArea("SC2") ; SC2->(dbSetOrder(retOrder(,"C2_FILIAL+C2_NUM+C2_ITEM+C2_SEQUEN+C2_ITEMGRD"))) ; SC2->(dbGoTop())
    elseif( allTrim(str(nOper)) $ "4|5" )
        dbSelectArea("SC2") ; SC2->(dbSetOrder(1)) ; SC2->(dbGoTo(jOrdem["recno"]))
    endif

    oError:DefineWithError(.T.)
    oError:SetExecAutoVariables("CAPTURE")   // prepares lMsErroAuto/lAutoErrNoFile/lMsHelpAuto for MsExecAuto()

    // 3. Build the ExecAuto array, one iif() per optional field
    iif( jOrdem["produto"] != nil, aadd(aDados, {"C2_PRODUTO", jOrdem["produto"], nil}), nil )
    // ... etc ...

    MsExecAuto({|x,y| MATA650(x,y)}, aDados, nOper)

    // 4. Fixed result contract: {success, log, <domain-key>}
    if( lMsErroAuto )
        oError:SetAutoGRLogFromExecAuto("MATA650")
        jResult["success"] := .F. ; jResult["log"] := oError:cAutoGRLog ; jResult["order"] := nil
    else
        jResult["success"] := .T. ; jResult["log"] := "" ; jResult["order"] := &cExpOrdem
    endif

    dbCommitAll()

Return jResult
```

Reuse this exact shape (allowlist validation → pre-position by `nOper` → `SetExecAutoVariables("CAPTURE")` → build array → `MsExecAuto` → `{success,log,<key>}`) for wrapping any new legacy routine — it's what every `*Exec` worker in the Builder/Persist/Exec pattern calls into.

## Repository Pattern (Database/Repositories)

```advpl
User Function PreCargaProdutosRepo( jCommit as json, nOpc as integer )
    Local lNew := (nOpc == MODEL_OPERATION_INSERT) as logical
    BEGIN TRANSACTION
    RecLock("ZC9", lNew)
        if( lNew )
            ZC9->ZC9_FILIAL := xFilial("ZC9")
        endif
        iif( jCommit[ "STATUS"] != nil, ZC9->ZC9_STATUS := jCommit["STATUS"], nil )
        // ... one iif() per field ...
    ZC9->(msUnLock())
    END TRANSACTION
Return
```

Every field is optional in `jCommit` — callers only populate what they're actually changing. Use this for a Service's *own* table when the write doesn't need the MVC model machinery (no cascading grid validation) — for anything that does, go through `FwLoadModel`/`oModel:LoadValue`/`VldData`/`CommitData` instead (see `PreCargaIncluirRepo.tlpp` for that heavier variant, used because inserting a Pré-Carga must also validate `X3_VLDUSER` rules on the grid).

## SQL Query Pattern (Database/SQL)

```advpl
User Function EmptySequenciaQuery( cRetAlias )
    cRetAlias := getNextAlias()
    beginSql alias cRetAlias
        SELECT ... FROM %table:ZAK% ZAK JOIN %table:ZC9% ZC9 ON(...) WHERE ...
    endSql
    dbSelectArea(cRetAlias)
    if!( (cRetAlias)->(eof()) )
        return .T.
    else
        (cRetAlias)->(dbCloseArea())   // auto-close on empty so callers never leak the alias
        return .F.
    endif
Return
```

Every query function returns a **logical "has rows"** and leaves the alias open (positioned at the first row) only on success — callers never have to remember to check emptiness before using the alias, and never leak an alias on the empty path. When the caller needs more than raw alias navigation (Seek by a different key, `GetValue` with multi-field concatenation, etc.), wrap the resulting alias in a `GwDataAccess():New(cAlias)` right after `dbSelectArea` instead of using the raw alias directly — see `EstornarQuery.tlpp`.

## Grid/Model Config Pattern

Build the whole Model/View configuration **once**, as `Public json`, inside a guarded `fInit()`, behind a single check on the entry-point enum:

```advpl
Static Function fInit()
    ...
    if( nOpc___ == oControllerEnum___:GetEnum('StartMainForm') )

        jConfig___['pre-carga']['MODEL_GRID_PRODUTOS'] := JsonObject():New()
        jConfig___['pre-carga']['MODEL_GRID_PRODUTOS']['cAlias'] := 'ZC9'
        jConfig___['pre-carga']['MODEL_GRID_PRODUTOS']['cOwner'] := 'MODEL_GRID_PEDIDOS'
        jConfig___['pre-carga']['MODEL_GRID_PRODUTOS']['aRelation'] := {...}
        ...
        jBrowser___['cAlias'] := 'ZAK'
        jBrowser___['cDescription'] := 'Pré-Carga'
        jBrowser___['bChange'] := {|| nil }

    endif
Return
```

The guard is not optional: `fInit()` also runs when the module is entered for `MenuDef` (a different enum value), and that path must not build the `MODEL_*` configs.

`ModelDef`/`ViewDef`/`BrowseDef` then read exclusively from `jConfig___`/`jBrowser___` and never branch on `nOpc___` themselves — the config is the single source of truth for the whole form.

## MenuDef → FwViewExec Wrapper Pattern

Every `ADD OPTION` in `MenuDef` points at a single wrapper (`U_FormExec`) instead of at `'ViewDef.<fonte>'` or at a routine from `customs`. The wrapper takes the operation plus an optional index into `jConfig___['pre-carga']['customs']`:

```advpl
Static Function fFormExecCall( nOperation as numeric, nCustom as numeric )
    Default nCustom := 0
Return( jConfig___['pre-carga']['formexec'] + "(" + cValToChar(nOperation) + "," + cValToChar(nCustom) + ")" )

// no MenuDef
ADD OPTION aRotina Title 'Editar'   Action fFormExecCall(MODEL_OPERATION_UPDATE)    OPERATION MODEL_OPERATION_UPDATE ACCESS 0
ADD OPTION aRotina Title 'Reservar' Action fFormExecCall(MODEL_OPERATION_UPDATE, 2) OPERATION MODEL_OPERATION_UPDATE ACCESS 0
```

`customs` itself stays untouched — the menu passes the **index**, not the call — so there is exactly one place where a menu option turns into an action. With `nCustom > 0` the wrapper only macro-executes the routine (no form); otherwise it opens the MVC form:

```advpl
oExecView := FwViewExec():New()
oExecView:setTitle( cTitle )
oExecView:setSource( jConfig___['pre-carga']['viewdef'] )
oExecView:setOk( {|| lSetOk := .T. } )
oExecView:setCloseOnOk( {|| .T. } )
oExecView:setCancel( {|| .T. } )
oExecView:setModal( .F. )
oExecView:setOperation( nOperation )
oExecView:openView( lDeActivateView )
```

Two blocking details, both found the hard way:

**`setCancel` must return `.T.`** It is the block that authorizes the close. Returning `nil` or `.F.` leaves the form unclosable.

**`lDeActivateView` must be `.F.` when the form is opened from its own source routine.** The *rotina de origem* is the routine hosting the browse that fires the model's actions — in this layout it shares the namespace of the form's Model and View, and `setSource` points back at that same source. The framework expects it to stay active for the whole session. Passing `.T.` deactivates the view along with it, and the MVC then loads **the first record instead of the selected one** on every open. Called from a *different* routine, in a different namespace, `.T.` is harmless — which is why the flag looks safe in isolation and only misbehaves in the self-hosted arrangement.

## Cross-Cutting "Recompute Derived Status" Pattern

`PreCargaUpdateService` is a dedicated service any Builder calls after mutating data, to keep the header's derived status fields in sync. It has its own small Enum (`GetPreCargaUpdateEnum`, separate from the main controller enum) and internally branches on **who's calling it**, not on an explicit parameter, via `fwIsInCallStack(...)`:

```advpl
lModelLib_ := fwIsInCallStack(upper("Applications.PreCarga.Builders.U_LiberacaoComerciaIncluirlBuilder"))
lModelEst_ := fwIsInCallStack(upper("Applications.PreCarga.Builders.U_LiberacaoComerciaEstornarlBuilder"))
lModelMvc_ := (lModelLib_ .or. lModelEst_)
lAliasTbl_ := !lModelMvc_
```

When called from inside those specific MVC Builders, it writes back into the **live model** (`oFields_:LoadValue(...)`, `oGridProdutos_:SetValue(...)`) so the on-screen grid reflects the change immediately without a full refresh. When called any other way (e.g. the periodic browse-refresh timer in `PreCargaMainForm`), it writes directly to the **table alias** (`recLock("ZAK",.F.) ... msUnLock()`), including a row-lock check (`ZAK->(dbrLockList())`) to skip records another user currently has open. Same derived-status computation, two different write targets, selected by call-stack introspection rather than a parameter — copy this only when you specifically need "behave differently depending on whether I'm inside a live MVC edit or not"; otherwise prefer an explicit parameter.
