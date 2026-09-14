# Layer-by-Layer Reference

Detailed breakdown of every folder in the `Applications.PreCarga` reference module. File paths are relative to `Sources/Advpl-Tlpp/Applications/PreCarga/`.

## Apps

`Apps/PreCargaApps.tlpp` — one `User Function` per menu action or button target. Each function is a one-liner shape:

```advpl
User Function StartMainForm()
    nOpc___ := oControllerEnum___:GetEnum('StartMainForm')
Return( U_Controller( nOpc___ ) )
```

A guarded `fInit()` (see the `lInit__`/`Public` idiom in SKILL.md's Conventions) seeds the shared `Public` enum instances (`oControllerEnum___`, `oPreCargaUpdateEnum___`) once. Actions that need structured input (`PreCargaUpdate`) accept `xParam` as either a `character` (JSON string) or an `array` and normalize both into a `json` before forwarding — this lets the same entry point be called from AdvPL (array) or from a serialized context (character) uniformly.

## Controllers

`Controllers/PreCargaController.tlpp` — a single `User Function Controller( nOpc as integer, xParam as variant, jRpc as json )` for the whole module. Responsibilities, in order:

1. **One-time session setup** guarded by a module `Static lInit__ := .F.`: declares `Private lProduction_`, `lBlind_`, `lRpcSetEnv_`, `oMessage_ := GwMessagingClass():New()`, `oError_ := oMessage_:GetObject("error")`. These `Private`s are then visible to every Service/Core/Builder called from here for the rest of the request (AdvPL/TLPP `Private` scoping is dynamic, not lexical).
2. `fSetEnvironment(jRpc)` — fills `jRpc` with defaults (`cRpcEmpresa`, `cRpcFilial`, `cRpcMod`, `cRpcRotina`, `aRpcTables`) then calls `RpcSetEnv(...)` **only if** `lBlind_` is true, it hasn't already set one (`!lRpcSetEnv_`), and it's not already running inside `U_GMNUEXEC`'s environment (`!fwIsInCallStack("U_GMNUEXEC")`) — this makes the Controller safe to call both from a real interactive session and from a blind/REST/job context without double-initializing the RPC environment.
3. A flat `do case` mapping every enum id to exactly one Service call (`U_XxxService(xParam)`).
4. `fResetEnvironment()` — calls `RpcClearEnv()` only if this exact Controller invocation was the one that set the environment (`lRpcSetEnv_`).

Note this Controller does **not** wrap the do-case in try/catch itself — each individual Service does its own try/catch (see Services below). The Controller's job is purely environment + routing.

## Enums

`Enums/PreCargaEnums.tlpp` — two `GwEnum()` factories:

- `GetControllerEnum()` — the main routing table consumed by the Controller (one entry per Apps function).
- `GetPreCargaUpdateEnum()` — a **second, smaller** enum for sub-routing inside `PreCargaUpdateService` alone (`UpdateTotais`, `UpdateLiberComercial`, `UpdateLiberFinanceira`). This is the pattern to follow whenever a single Service internally needs its own multi-way dispatch: give it its own small enum rather than overloading the main controller enum or a bag of booleans.

Both enums get "Public-ified" once, in `Apps`'s `fInit()`, so any layer can call `oControllerEnum___:GetEnum('SomeName')` or `oPreCargaUpdateEnum___:GetEnum('SomeName')` directly without re-fetching.

## Entities

`Entities/PreCargaEntitie.tlpp` — `TemplatePreCarga` extends `GwDataAccess` (constructed against the master table `ZAK`) and additionally holds one **internal** `GwDataAccess` per related child table as public data: `oPedidos` (ZAI), `oProdutos` (ZC9), `oOrdem` (SC2), `oLiberacao` (SC9). This is the aggregate-root shape: one object exposes the whole master/detail/detail-of-detail chain.

Key methods:
- `SaveArea()`/`RestoreArea()` — override the inherited ones to also save/restore all four internal DAOs' areas in one call.
- `BuscarPorCodigo(cCodigo)` — positions the master record.
- `PosicionarPedidos()` / `PosicionarProdutos()` / `PosicionarOrdem()` / `PosicionarLiberacao(cSeek)` — each requires the parent already positioned (throws `UserException` otherwise — e.g. `PosicionarProdutos` requires `lPosPedidos`), each pushes the child DAO to EOF (`GoBottom()` + `SkipLine()`) when the seek fails so a subsequent `NotEndOfFile()` check behaves correctly either way.
- `IterarPedidos(bExec)` / `IterarProdutos(bExec)` — **master/detail iterator with a break-flag contract**: a codeblock is evaluated once per row; either loop can be stopped early by setting `::lStopIterationPedido`/`::lStopIterationProduto` — and setting the *inner* flag from inside a callback also stops the *outer* loop (`if( ::lStopIterationProduto ) ::lStopIterationPedido := .T.` inside `IterarPedidos`), because otherwise the outer loop would keep re-entering the now-truncated inner iteration. `IterarProdutos` also auto-repositions the parent Pedido (`PosicionarPedidos()`) if it detects the child row's `ZAI_PEDIDO` no longer matches the currently-positioned parent — this covers the nested-iterator case `IterarPedidos({|| IterarProdutos(bInner) })` where the child cursor legitimately needs to re-sync the parent as it walks forward.

When to reuse vs. extend: reuse this entity for *any* new Service that needs to walk the whole PreCarga aggregate; if a new Service only ever touches one table in isolation, a plain `GwDataAccess():New("XXX")` (as several `Static Function fXxx()` helpers do throughout the Services layer, e.g. `oLiberacaoDao__`, `oProdutoDao__`) is simpler and fine — the aggregate Entity is for genuinely cross-table master/detail work.

## Forms

`Forms/Main/PreCargaMainForm.tlpp` — the file that seeds the shared MVC config:

- Guarded `fInit()` builds two `Public json` objects: `jConfig___['pre-carga']` (menudef/modeldef/viewdef paths, `MODEL_FIELDS`/`MODEL_GRID_PEDIDOS`/`MODEL_GRID_PRODUTOS`/`MODEL_GRID_EMPENHOS` sub-configs each with `cAlias`/`cId`/`cOwner`/`bFields`/`cIndex`/`aRelation`) and `jBrowser___` (browse alias/description/change-block). It also builds the `jGridCaptionPedidos___`/`jGridCaptionProdutos___` configs consumed by `U_GwSetGridCaption` (from `advpl-gworks`) and four `jBtnXxx___` button-definition JSONs consumed later by `ViewDef`'s `oView:AddUserButton(...)`.
- That whole `MODEL_*`/`jBrowser___` block sits behind a single `if( nOpc___ == oControllerEnum___:GetEnum('StartMainForm') )`. The guard matters: `fInit()` also runs on the `MenuDef` path (a different enum value), which must *not* build the model configs. `ModelDef`/`ViewDef`/`BrowseDef` never branch on `nOpc___` themselves — they only ever read from `jConfig___`/`jBrowser___`, which is the single source of truth for the form.
- `BrowseDef` additionally wraps the `FwMBrowse` in its own `MSDialog` (rather than letting `FwMBrowse` own the window) so it can attach a `DEFINE TIMER ... ACTION fRefresh(.T.)` that periodically calls `U_PreCargaUpdate(...)` to keep pending-status legends fresh without user action.
- `MenuDef` reads action targets from `jConfig___['pre-carga']['customs'][n]` (an array of literal call strings like `'Applications.PreCarga.Apps.U_PreCargaIncluir()'`) instead of hardcoding `ViewDef.<path>` strings for every custom action — keeps the menu declarative and centrally configured.

`Forms/Main/Models/PreCargaMainFormModel.tlpp` / `Views/PreCargaMainFormView.tlpp` — standard `FWFormStruct`/`MPFormModel`/`FWFormView` construction reading exclusively from `jPreCarga__` (a `Static` alias for `jConfig___['pre-carga']`); the View additionally calls `U_GwSetGridCaption` twice — for the Pedidos and Produtos grids only — to inject the legend virtual field, groups header fields (`oStrFields:addGroup(...)`), and wires `GRIDDOUBLECLICK` to the Captions layer's `U_ShowGridCaptionXxx` functions. The third grid (`MODEL_GRID_EMPENHOS`, read-only) has no legend: it is fed by a `bLoad` rather than by the MVC's own per-row alias iteration, so the `bInit` codeblock that `U_GwSetGridCaption` is built around would have nothing positioned to read. Its two virtual fields (`DESC_PROD`/`DESC_COMP`) are added with plain `AddField` calls instead, and their values come from the load array.

`Forms/Main/Events/PreCargaMainFormEvent.tlpp` — `TemplatePreCargaEvent extends FWModelEvent`, installed via `oModel:InstallEvent(...)` in ModelDef. Implements only the hooks actually needed:
- `VldActivate` — blocks/confirms entering Update mode based on the aggregate's current state (already-in-carga, already-fully-reserved, already-fully-liberated) — this is where "can this record even be edited right now" business rules live, at the model level, before any field is touched.
- `GridLinePreVld` — per-grid-row guard, keyed on `oSubModel:cID` and `cId` (the specific field, or `nil` for "line-level" actions like delete): blocks deleting a Pedido row that still has an active reserve or liberação, and requires the "Filial de Origem" field before accepting a Pedido number.

`Forms/Main/Captions/PreCargaGridPedidosCaption.tlpp` / `PreCargaGridProdutosCaption.tlpp` — each pairs an `Init<Grid>Caption()` (returns the row's legend color, called by the framework as the grid loads, positioned on the row's own alias) with a `Show<Grid>Caption(cField)` (pops an `FWLegend()` window on double-click, returns `.F.` unconditionally to prevent the double-click from also opening the field for edit). `InitGridCaptionPedidos` additionally runs a tiny cached SQL lookup (`fGetStatusGrid`) rather than reading a stored field, since the Pedido's aggregate status isn't itself a persisted column.

## Metadata

`Metadata/PreCargaMetadaDataService.tlpp` — `U_MetadataConfigService()`, the entry point wired to the `MetadataConfig` enum id. Runs each table's schema builder inside `BEGIN SEQUENCE`/`BREAK` so the first failure short-circuits the rest, then reports via `oMessage_` (the shared session error object) rather than its own try/catch — this function assumes it's always called from inside a Controller that already set up `oMessage_`.

`Metadata/Schemas/PreCarga<Table>Schema.tlpp` (one per table: Cabec/Pedido/Produto) — identical shape to the `advpl-gworks` metadata pattern: `GwMetaData():New()` → `fSetTables()` → `fSetFields()` → `fSetIndexes()` (→ `fSetQueries()` when the table needs an SXB standard query, see `PreCargaPedidoSchema.tlpp`'s `SC5PRG` query) → `CommitData()`. Two things worth copying from these specific schemas:
- Fields build an incrementing order with `(cOrder:=soma1(cOrder))` inline inside the `aAdd(aFields, {...})` call instead of a manual counter variable.
- After the bulk `aAdd`s, individual field dictionaries are patched in-place via `aFields[ aScan(aFields,{|x| x["name"]==...}) ]["combo_box"] := "..."` / `["init"] := "..."` / `["vld_user"] := "Applications.PreCarga.Metadata.U_<FIELD>_VALID()"` — this keeps the big literal table readable while still letting later fields reference earlier ones (e.g. a combo box or a cross-field default) without threading extra parameters through the `aAdd` calls.

`Metadata/Validations/PreCargaMetaDataValid.tlpp` — `X3_VLDUSER` target functions, named exactly `<FIELD>_VALID` (matching the pattern's naming convention `Applications.PreCarga.Metadata.U_<FIELD>_VALID()` referenced from the schema's `vld_user`). These run inside the live MVC model (`FwModelActive()`) and can do far more than simple validation — `ZAI_PEDIDO_VALID` actually **populates the sibling Produtos grid** (`oProdutos:AddLine()`/`LoadValue(...)`) as a side effect of validating the Pedido field, because that's the natural point in the MVC lifecycle to auto-derive one grid from another as the user types.

`Metadata/Filters/PreCargaPedidosFilter.tlpp` — an SXB `%filter%` target function (`U_SC5PRG`), referenced by the `PreCargaPedidoSchema`'s query definition. Guards its own applicability with `if( upper("PreCarga") $ cFunName )` (checks its own `FunName()`) since standard-query filter functions can be invoked from contexts other than the one they were written for. Builds the filter from a cached-per-branch subquery (`fPedidosComSaldo`) and caps the final string at 1900 characters, falling back to `.T.` if exceeded (see Known Gotchas in SKILL.md).

## Common

`Common/Database/Repositories/PreCargaProdutosRepo.tlpp` — direct-write helper for a single table (`ZC9`) shared across multiple Services/Builders, keyed by a partial-update `jCommit` json: `iif( jCommit["FIELD"] != nil, ZC9->ZC9_FIELD := jCommit["FIELD"], nil )` per field, so callers only need to populate the keys they actually want to change, wrapped in one `BEGIN TRANSACTION`/`RecLock`/`MsUnLock`.

`Common/ExecAuto/<Routine>ExecAuto.tlpp` (`ApontamentoProducaoExecAuto` → MATA250, `OrdemProducaoExecAuto` → MATA650, `CargaExecAuto` → OMSA200) — see `references/patterns.md#execauto-wrapper-pattern` for the full shape; these are shared by every Service that needs to touch those legacy routines (Reserva, Estorno, Montar Carga all call into the same two OP/Apontamento wrappers).

`Common/Functions/PreCargaSetPreCargaStatusFunction.tlpp` / `PreCargaSetProdutoStatusFunction.tlpp` — small cross-Service helpers: `U_SetPreCargaStatus(cCodigo, cStatus)` recomputes (or accepts an explicit) header status by scanning all child Produtos rows via a plain `GwDataAccess("ZC9")`, and `U_SetProdutoStatus(jStatus)` does a single targeted field update on one already-known `ZC9` recno (used heavily from inside the `*Exec` cross-branch workers, where the caller already knows exactly which row to update from a `joins` map carried through the whole `Builder → Persist → Exec` pipeline).
