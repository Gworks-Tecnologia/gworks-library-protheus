---
name: advpl-gworks-pattern
description: "Use this full-stack application architecture pattern (Apps → Controller → Service → Core → Builder → Database/Functions, plus Entities, Metadata, and MVC Forms) when scaffolding or extending a Gworks AdvPL/TLPP application/module that needs more structure than the simple Templates/APITrace MVC scaffold from the advpl-gworks skill. Mined from the reference implementation Applications.PreCarga (Sources/Advpl-Tlpp/Applications/PreCarga), a real production module mixing the Protheus MVC framework with DDD-ish layering: an Enum-routed Controller, one Service per user action wrapping a Core (confirmation + progress dialog + counters) that delegates to one or more Builders (grid/business logic, with a Builder/Persist/Exec split for cross-branch StartJob batch processing), a Database layer split into Repositories (direct table writes) and SQL (BeginSql queries), a GwDataAccess-based aggregate Entity that iterates master/detail child tables, GwMetaData-driven table Schemas plus X3_VLDUSER Validations and SXB Filters, and MVC Forms (Model/View/Events/Captions) built from a shared JSON config. Use when the user says 'segue o padrão do PreCarga', 'cria um Service/Core/Builder', 'organiza como o projeto X', or asks for a new Gworks module with this layered service architecture."
license: Internal
metadata:
  domain: Protheus
  maintainer: Gworks - Giovani
  category: Internal Architecture Reference
  reference_module: Applications.PreCarga (Sources/Advpl-Tlpp/Applications/PreCarga)
---

# Gworks Application Pattern (Service/Core/Builder)

## Overview

This skill documents a full-stack architecture pattern for Gworks Protheus applications, reverse-engineered from **Applications.PreCarga** — a real production module at:

```
Sources/Advpl-Tlpp/Applications/PreCarga/
```

(relative to this repo's root — read that directory directly for ground truth on anything this skill doesn't cover). PreCarga blends the Protheus MVC framework (ModelDef/ViewDef/BrowseDef, `FWFormModel`/`FWFormView`/`FwMBrowse`) with a DDD-flavored layering on top: an aggregate **Entity**, a **Repository**/**SQL** data layer, and a **Service → Core → Builder** pipeline per user action. It builds heavily on the `advpl-gworks` skill (the reusable class/function library — `GwDataAccess`, `GwMessagingClass`, `GwMetaData`, `GwEnum`, `U_GwSetGridCaption`, etc.) and on the simpler MVC template pattern documented there (`Templates/APITrace`) — read `advpl-gworks` first if you haven't; this skill is "the same idea, but for a module big enough to need Services."

Use this pattern when a new module has **multiple distinct user actions** against a shared aggregate (here: Incluir, Reservar, Estornar, Liberar Comercial, Liberar Financeira, Montar Carga — all against one Pré-Carga), each action needs its own confirmation/progress/error handling, and at least one action needs to fan out work across company branches.

## When to Use

- Scaffolding a new Gworks application/module with several distinct actions on one aggregate (not just a single CRUD screen — for a single simple MVC screen, the `Templates/APITrace` pattern in `advpl-gworks` is enough).
- The user references "PreCarga", asks to "seguir o padrão do PreCarga/Service/Core/Builder", or describes a workflow with: user picks something → confirms → a progress dialog runs → a summary of successes/failures is shown.
- An action needs to create/update records that may belong to a **different company branch** than the current session (the Builder/Persist/Exec + `StartJob` split in `references/patterns.md#service-core-builder-pattern`).
- Wrapping several **legacy standard routines** (`MATA650`, `MATA250`, `OMSA200`, ...) behind a consistent JSON-in/JSON-out contract (`references/patterns.md#execauto-wrapper-pattern`).
- Building an MVC form where the same ModelDef/ViewDef must serve **more than one entry point** with slightly different grid relations (`references/patterns.md#gridmodel-config-pattern`).
- Creating dictionary tables/fields/indexes for the new module (reuse `GwMetaData` per `references/layers.md#metadata`, same mechanics as `advpl-gworks`'s metadata pattern, just organized as one file per table under `Metadata/Schemas/`).

## Layer Map (namespace `Applications.<AppName>.*`)

| Folder / Namespace | Role | Detail |
|---|---|---|
| `Apps/` → `Applications.<App>.Apps` | Thin entry points (one per menu action/button), resolve an Enum id and forward to the Controller. | `references/layers.md#apps` |
| `Controllers/` → `Applications.<App>.Controllers` | Single `Controller(nOpc, xParam, jRpc)` dispatcher; conditional `RpcSetEnv`; do-case routes to a Service. | `references/layers.md#controllers` |
| `Enums/` → `Applications.<App>.Enums` | `GwEnum()`-based routing tables — one main controller enum, plus small side-enums for sub-routing (e.g. an internal "update" service). | `references/layers.md#enums` |
| `Entities/` → `Applications.<App>.Entities` | One aggregate class extending `GwDataAccess`, wrapping the master table plus one internal `GwDataAccess` per related child table; `Buscar/Posicionar*/Iterar*` methods. | `references/layers.md#entities` |
| `Forms/Main/` → `Applications.<App>.Forms.Main(.Events\|.Captions)` | Standard MVC Model/View/BrowseDef/MenuDef, an `FWModelEvent` subclass for cross-field business rules, and grid caption/legend helpers. | `references/layers.md#forms` |
| `Metadata/` → `Applications.<App>.Metadata` | `Schemas/` (one `GwMetaData` builder per table), `Validations/` (`X3_VLDUSER` target functions), `Filters/` (SXB `%filter%` target functions). | `references/layers.md#metadata` |
| `Services/<Action>Service/` → `Applications.<App>.Services\|Core\|Builders\|Database\|Functions\|Screens` | The work-horse per-action pipeline: **Service** (try/catch + area bracket) → **Core** (confirm + progress + counters) → **Builder** (business logic, optional cross-branch batch split) → **Database** (Repositories/SQL) → **Functions**/**Screens** as needed. | `references/patterns.md#service-core-builder-pattern` |
| `Common/` → `Applications.<App>.Database\|ExecAuto\|Functions` | Cross-Service shared pieces: direct-write Repositories, legacy-routine `ExecAuto` wrappers, small helper functions any Service can call. | `references/layers.md#common` |

## Conventions

- Namespace root is `Applications.<AppName>` (here `Applications.PreCarga`), mirroring the folder path exactly, same as the `Gworks.*` convention from `advpl-gworks`.
- The ProtheusDOC requirement from `advpl-gworks`'s Conventions (`/*/{Protheus.doc} .../*/` on every function/method) still applies here — the code samples in `references/` are trimmed for brevity and don't show it, but don't take that as license to skip it in new Apps/Controllers/Services/Core/Builder/Entity code.
- Nearly every layer uses the **guarded Public-variable init** idiom: `Static lInit__ := iif( lInit__ == nil .or. !lInit__, fInit(), .T. )` at file scope, with `fInit()` doing `if type('xxx___')=='U' ; Public xxx___ ; endif` for each shared variable — this seeds Public config/enum objects exactly once per session regardless of how many times the file's functions get called. Variants exist (some `Controller`s instead guard with a module `Static lInit__` and lazily declare `Private`s inside the function body) — match whichever variant the surrounding layer already uses rather than introducing a third style.
- Session-shared error/log state (`oMessage_`, `oError_`) is created once (by the Controller) and referenced — never recreated — by every Service/Core/Builder further down the call stack for that request. This differs from the standalone CSV-import-wizard style in `advpl-gworks` (`references/patterns.md#csv-import-pattern`), which creates its own local `oError_`/`oLog_` at the top of a single self-contained function — that style is for a flow with no Controller above it, not for anything under `Services/<Action>Service/`. Don't pattern-match the CSV-import example when writing a new Service/Core/Builder here; declaring a fresh `GwError()`/`GwMessagingClass()` inside one of these layers breaks the "don't double-report" check in the Service's try/catch (`references/patterns.md#service-core-builder-pattern`).
- Every Service brackets its work with `GetArea()`/`RestArea()` for the module's own tables (in PreCarga: `ZAK`/`ZAI`/`ZC9`) plus the "active" alias, restoring them in reverse order after the try/catch.
- `try/catch` at the Service layer is a **safety net**, not the primary error path — Core/Builder code reports expected failures directly via `oMessage_:SetProperty(...):Display()` or `FwAlertXxx()`; the catch block only fires for genuinely unexpected exceptions, and checks `!oError_:lError` first so it never double-reports an error the inner code already displayed.
- Legacy routines are wrapped individually under `Common/ExecAuto/<Routine>ExecAuto.tlpp`, not via the generic `GwExecAuto` class — see `references/patterns.md#execauto-wrapper-pattern` for why (routine-specific pre-positioning, fixed `{success,log,<key>}` result contract).
- Cross-branch batch writes always pass data to `StartJob`/direct-call targets as **already-serialized JSON strings** (`jXxx:toJson()` / `:fromJson()`), never live objects — see `references/patterns.md#service-core-builder-pattern`.
- The thread-env JSON built here for `StartJob` uses the keys `cRpcEmpresa`/`cRpcFilial`/`cRpcMod`/`cRpcRotina`/`aRpcTables` — a **different naming convention** from `advpl-gworks`'s `GwExecAuto:SetStartJob(cJobEmpresa, cJobFilial, cJobModule, cJobName, aJobTables)`, even though both wrap the exact same five pieces of data for the exact same purpose (cross-branch job dispatch). Don't transpose field names between the two — this pattern never goes through `GwExecAuto:SetStartJob` at all, it calls `StartJob(...)` directly.

## Known Gotchas / Observations

- `Services/PreCargaUpdateService/PreCargaUpdateService.tlpp`: two branches of the `do case` for `UpdateTotais` and `UpdateLiberFinanceira` are commented out (`// TODO: implementar`) — only `UpdateLiberComercial` is wired. Don't assume the full enum is implemented; check before routing to it.
- `Metadata/Filters/PreCargaPedidosFilter.tlpp`: the dynamically-built SQL filter string is capped — if it exceeds 1900 characters it silently falls back to `.T.` (no filtering at all) rather than erroring. A branch with enough eligible pedidos could silently lose its filter.
- `Services/PreCargaUpdateService/Core/PreCargaUpdateLiberComercialCore.tlpp`: which code path runs (`lAliasTbl_` vs `lModelMvc_`) is decided via `fwIsInCallStack(...)` against two specific fully-qualified Builder function names — adding a third caller of this Core without updating those checks will silently fall through both branches (`lAliasTbl_ := !lModelMvc_` still sets one to true, but if neither is the actual context, the update logic is wrong for the true context, not just "not called").
- `Services/MontarCargaService/Core/PreCargaMontarCargaCore.tlpp` and `Services/ReservaEstornarService/Core/...`: the follow-up call to recompute/persist derived Pré-Carga status (`U_SetPreCargaStatus(cPreCarga)`) is commented out in the Montar Carga Core (`// U_SetPreCargaStatus(cPreCarga)`) but present in Reserva/Estorno — verify status recomputation is actually wired for every new Core you add in this style, it's easy to forget.
- Typos worth not propagating: `FwAlerWarning` (missing a `t`) appears in at least two Cores (`PreCargaMontarCargaCore.tlpp`, `PreCargaReservaIncluirCore.tlpp`, `PreCargaReservaEstornarCore.tlpp`) instead of `FwAlertWarning` — check whether the target Protheus version has a macro/alias for this or whether it's simply a latent bug (dead branch that never actually fires, given the surrounding `if(lResult) ... else FwAlerWarning(...)` — since `lResult` here is basically always `.T.` from `fProc`, this branch may never have been exercised).
