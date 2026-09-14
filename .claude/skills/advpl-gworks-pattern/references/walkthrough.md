# End-to-End Walkthrough: "Reservar" Action

Traces the `PreCargaReservar` action across every layer, showing exactly how the pieces documented in `layers.md` and `patterns.md` fit together in one real call chain. Use this as the template for tracing (or designing) any new action in this pattern.

## 1. Entry point (Apps)

User clicks "Reservar" on the main browse's menu (wired in `MenuDef` to `jConfig___['pre-carga']['customs'][2]`, i.e. `'Applications.PreCarga.Apps.U_PreCargaReservar()'`):

```advpl
User Function PreCargaReservar()
    nOpc___ := oControllerEnum___:GetEnum('PreCargaReservar')
Return( U_Controller( nOpc___ ) )
```

## 2. Routing (Controller)

```advpl
User Function Controller( nOpc as integer, xParam as variant, jRpc as json )
    // ... one-time Private setup of oMessage_/oError_, fSetEnvironment(jRpc) ...
    do case
        case nOpc == oControllerEnum___:GetEnum('PreCargaReservar')
            U_ReservaIncluirService(xParam)
    endcase
    fResetEnvironment()
Return xResult
```

## 3. Service shell

```advpl
User Function ReservaIncluirService()
    Local jAreas := JsonObject():New()
    Private oPreCargaDao_ := TemplatePreCarga():New()   // the aggregate Entity, shared with Core+Builder
    jAreas["active"] := GetArea()
    jAreas["extras"] := { ZAK->(GetArea()), ZAI->(GetArea()), ZC9->(GetArea()) }
    try
        if !( U_PreCargaReservarCore() )
            return
        endif
    catch _varError
        if!( oMessage_:GetObject("error"):lError )
            // ... unexpected-failure report via oMessage_ ...
        endif
    endtry
    // ... restore jAreas in reverse ...
Return
```

## 4. Core — confirm, run with progress, summarize

```advpl
User Function PreCargaReservarCore()
    if!(FwAlertYesNo("Confirma a Reserva da Pré-Carga?","Reservar!?"))
        return .F.
    endif
    oBrwPreCarga_:Disable()
    jCounter := { "codigo":"", "pendentes":0, "sucesso":0, "falha":0 }
    FwMsgRun( nil, {|oSay| lResult := fProc( oSay, @jCounter ) }, "Reservando Pré-Carga...", "aguarde..." )
    // ... build cMensg from jCounter, FwAlertSuccess/Warning/Info ...
    oBrwPreCarga_:Refresh(.F.) ; oBrwPreCarga_:Enable()
Return lResult

Static Function fProc( oSay, jCounter )
    cPreCarga := ZAK->ZAK_CODIGO
    if!( oPreCargaDao_:BuscarPorCodigo(cPreCarga) ) ; return .F. ; endif
    if!( oPreCargaDao_:GetValue("ZAK_STATUS") $ "1/2" )   // precondition: only Montada or Reserva Parcial
        FwAlertInfo("...", "Aviso!") ; return .F.
    endif
    if!( oPreCargaDao_:PosicionarPedidos() ) ; return .F. ; endif
    if!( oPreCargaDao_:PosicionarProdutos() ) ; return .F. ; endif

    lNewProc_ := .T.   // tells the Builder to clear stale accumulated state from any prior run
    oPreCargaDao_:IterarPedidos( {|| oPreCargaDao_:IterarProdutos( {|| Applications.PreCarga.Builders.U_OrdemProducaoBuilder() } ) } )

    if( U_OrdemProducaoBuilderGetCounters( @jCounter, 'jCounter["pendentes"] > 0' ) )
        U_OrdemProducaoPersist( @jCounter )
        U_SetPreCargaStatus(cPreCarga)
        if( ZAK->ZAK_STATUS $ "2/3" )
            RecLock("ZAK",.F.) ; ZAK->ZAK_DRESER := date() ; ZAK->(msUnLock())
        endif
    endif
Return .T.
```

The nested `IterarPedidos({|| IterarProdutos({|| Builder() }) })` is the whole "walk every product of every order of this aggregate" loop, expressed in one line thanks to the Entity's iterator methods (`layers.md#entities`).

## 5. Builder — accumulate per branch/pedido

`U_OrdemProducaoBuilder()` runs once per Produto row (innermost callback). It positions three helper DAOs (`SB1` for the product, `SC5` for the pedido, `SC9` for the already-liberated item), skips rows that shouldn't generate an OP yet (blocked, already-failed-and-user-declined-reprocess), and appends one order-json into a module-`Static` `jCommit__`, keyed first by `"filial_"+cFilOrigem` then by `"pedido_"+cPedido` — grouping every order that must be created under the *same* `MATA650` batch per branch+pedido:

```advpl
jCommit__[cAttrFilial][cAttrPedido]["ordens"] := array(0)  // if not already created
aAdd(jCommit__[cAttrFilial][cAttrPedido]["ordens"], jOrdem)
nOrdens__++
```

## 6. Persist — decide in-process vs. StartJob per branch

`U_OrdemProducaoPersist(jCounter)` loops the accumulated `jCommit__` groups (one per branch):

```advpl
for nI:=1 to len(aNmFiliais)
    cAttrFilial := aNmFiliais[nI]
    aAttrFilial := strToKarr(cAttrFilial,"_")            // "filial_0101" -> {"filial","0101"}
    lStartThread := ( aAttrFilial[2] != cFilAnt )
    cJsonFilial := jCommit__[cAttrFilial]:toJson()
    if!( lStartThread )
        cJsonRet := U_ReservarExec( cJsonFilial )                                    // same branch: call directly
    else
        cJsonThread := { lNewThread:.T., cRpcEmpresa:cEmpAnt, cRpcFilial:aAttrFilial[2], ... }:toJson()
        cJsonRet := StartJob( "...U_ReservarExec", getEnvServer(), .T., cJsonFilial, cJsonThread )  // other branch: thread
    endif
    jJsonRet := JsonObject():New() ; jJsonRet:fromJson(cJsonRet)
    nSuccess__ += jJsonRet["nTotSuccess"] ; nFault__ += jJsonRet["nTotFault"]
next
Return( U_OrdemProducaoBuilderGetCounters( @jCounter ) )
```

## 7. Exec — the actual worker, per branch

`U_ReservarExec(cJsonFilial, cJsonThread)` runs either in-process or inside the `StartJob` thread. It sets up its own RPC environment if it's a new thread, then for every accumulated order: creates the OP via `U_OrdemProducaoExecAuto(jOrdem, MODEL_OPERATION_INSERT)` (the ExecAuto wrapper from `patterns.md#execauto-wrapper-pattern`), writes the resulting status/OP-number back onto the Pré-Carga's product row via `U_SetProdutoStatus(jStatus)` (`Common/Functions`), and — if OP creation succeeded — immediately follows up with an Apontamento via `U_ApontamentoProducaoExecAuto(jApont, MODEL_OPERATION_INSERT)`, again writing the resulting status back via `U_SetProdutoStatus`. Returns `{nTotSuccess, nTotFault}` as a JSON string.

## 8. Back in Core: recompute derived status, show summary

Control returns to `fProc` in the Core, which calls `U_SetPreCargaStatus(cPreCarga)` (`Common/Functions` — scans all `ZC9` rows for the aggregate and derives `ZAK_STATUS` from their individual `ZC9_STATUS` values), sets `ZAK_DRESER` if this was the first reserve, and returns to `PreCargaReservarCore`, which builds the final `cMensg` from `jCounter` and shows `FwAlertSuccess`/`FwAlertWarning`/`FwAlertInfo` depending on the sucesso/falha counts — exactly the same summary-alert shape used by every other action in this module (Estorno, Montar Carga).

## What to change for a new action

To add a brand-new action following this exact pattern:

1. Add one entry to `GetControllerEnum()` and one `Apps` function forwarding to the Controller.
2. Add one `do case` line in the Controller.
3. Write `<Name>Service` (copy the try/catch + area-bracket shell verbatim, changing only which `Private`s it declares).
4. Write `<Name>Core` — preconditions + `FwAlertYesNo` confirm + `FwMsgRun` progress + `jCounter` summary, exactly like `PreCargaReservarCore` above.
5. Decide: does this action's writes ever need to happen in a branch other than the current session's? If no, write a single `<Name>Builder` doing the work directly. If yes, write the three-function `<Name>Builder` / `<Name>Persist` / `<Name>Exec` split.
6. If the action wraps a legacy standard routine not already wrapped, add a `Common/ExecAuto/<Routine>ExecAuto.tlpp` following the shape in `patterns.md#execauto-wrapper-pattern`.
7. If the action changes data that affects the header's derived status, call `U_SetPreCargaStatus` (or the module's equivalent) at the end of the Core, the same way every existing action does.
