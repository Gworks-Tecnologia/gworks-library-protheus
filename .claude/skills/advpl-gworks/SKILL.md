---
name: advpl-gworks
description: "Use the Gworks internal AdvPL/TLPP framework (namespaces `Gworks.Library.*`, `Gworks.Business.*`, `Gworks.Templates.*`) when writing new business logic for a Gworks Protheus project. This is Giovani's own reusable class/function library built over years, covering: data-access wrapper (GwDataAccess/GwDataRelation), ExecAuto runner (GwExecAuto), error/log/messaging (GwError, GwConsoleLog, GwMessagingClass), dictionary/metadata builder (GwMetaData), ordered key-value maps (GwKeyValue), sequential numbering (GwSequence/GwGetNumbering), parameter dialogs (GwParamBox), async job queues (GwAsyncQueue/GwSemaphore), mail with attachments (GwMailAttachments/GwSendMail), file helpers (GwGetFile/GwFileIterator), SQL-to-JSON queries direct or over REST (GwApiQuery/GWQTOJSON), and dozens of string/dictionary utility functions (GwCamelCase, GwCleanSpecialChar, GwGetFieldStruct, GwOpenDictionary, etc). Also documents the Business/* Entity pattern and the Templates/APITrace full MVC scaffold example. Use whenever the user says 'usa a lib gworks', 'GwDataAccess', 'cria uma entity gworks', 'ExecAuto com GwExecAuto', 'gera metadado com GwMetaData', 'parambox gworks', or whenever writing new AdvPL/TLPP code where reusing this internal framework is preferable to raw DbSelectArea/MsExecAuto/ParamBox boilerplate."
license: Internal
metadata:
  domain: Protheus
  maintainer: Gworks - Giovani
  category: Internal Framework Reference
  source_repo: gworks-library-protheus
---

# Gworks AdvPL/TLPP Library

## Overview

The Gworks library is Giovani's personal, reusable AdvPL/TLPP framework for TOTVS Protheus, accumulated over several years of consulting work. Its canonical source lives in a **separate repository**, not vendored into this project:

```
/home/giovani/GoogleDrive/Repositories/Git/Gworks/gworks-library-protheus/Sources/
```

That source is the ground truth — if a signature here looks stale, re-read the file there before trusting this skill. This skill exists so that new AdvPL/TLPP code written for a Gworks project **reuses** this framework instead of re-implementing common patterns from scratch (area save/restore, ExecAuto boilerplate, error handling, sequencing, dictionary/metadata access, param dialogs, mail, async jobs, etc). It assumes the library is already compiled into the target Protheus environment (RPO) — this skill does not install or copy the library's source.

## When to Use

- Before writing any new AdvPL/TLPP business function or class for a Gworks project, scan the [Catalog](#catalog) below for an existing building block.
- The user mentions "gworks", any `Gw*` class/function name, or asks to "reaproveitar" / "usar a lib" / "seguir o padrão gworks".
- Creating a data-access class for an ERP table → use the **Entity pattern** (`references/patterns.md#entity-pattern`), extending `GwDataAccess`.
- Wrapping an `ExecAuto`/`MsExecAuto` call → prefer a **direct/simple call** (or a hand-rolled per-routine wrapper, `advpl-gworks-pattern`'s `references/patterns.md#execauto-wrapper-pattern`) for a plain, single-branch call. Reach for `GwExecAuto` specifically when the call actually needs to run on a **new thread** (cross-branch `StartJob`, especially async dispatch) — Giovani avoids `GwExecAuto` outside that case, it is not a general-purpose default.
- Building a parameter dialog → use `GwParamBox` instead of a raw `ParamBox()` positional array.
- Creating/altering SX2/SX3/SIX/SXB dictionary entries programmatically → use `GwMetaData` (`references/patterns.md#metadata-pattern`).
- Handling errors/logs/user-facing messages → `GwError` + `GwConsoleLog`, or the newer unified `GwMessagingClass`.
- Sequential numbering with prefix/family control → `GwSequence` / `U_GwGetSequence` (needs the `ZGS` dictionary — `U_GwSequenceSchema()` creates it).
- Sending email with attachments → `GwMailAttachments` / `U_GwSendMail`.
- Parallel/async job processing → `GwAsyncQueue` + `GwSemaphore`.
- A CSV/file import wizard → follow `references/patterns.md#csv-import-pattern`.
- Scaffolding a whole small MVC app (browse + form + metadata) → follow `references/patterns.md#mvc-template-pattern` (based on `Templates/APITrace`). File names and namespaces of any new `Templates/<App>`: `references/patterns.md#templates-file-names-and-namespaces`.
- Running a `SELECT` from AdvPL and getting JSON back → `U_GwApiQuery( cSql, @jResult )` (direct mode, no REST needed); `U_GWQTOJSON( cSql )` when you only want the JSON and will handle environment/errors yourself. Details and the write counterpart `U_GWQUPD` (its `.T.` does not mean written): `references/functions-reference.md` (section *ApiQuery*).
- Exchanging a file with something outside Protheus (a script, a browser, the user) → build the path from `GetTempPath()`, with the OS-dependent separator and the `l:` prefix on a Linux client: `references/patterns.md#client-temp-files-gettemppath--the-l-prefix`.
- Calling a `User Function` that lives in another namespace → `using namespace` it; without it the **first** call can fail at runtime only (AppServer limitation, the function itself is global): `references/patterns.md#namespaced-user-function-calls`.

## Conventions

- **Namespaces**: `Gworks.Library.Classes`, `Gworks.Library.Functions`, `Gworks.Library.MvcUtils`, `Gworks.Business.<Module>.<Entities|Functions>`, `Gworks.Templates.<Name>.*`.
- Classes are prefixed `Gw` (`GwDataAccess`, `GwError`, ...). Standalone functions are `User Function Gw...` declared inside `namespace Gworks.Library.Functions`, called as `U_Gw...` **after `using namespace Gworks.Library.Functions`** (or fully-qualified) — the function is global, but an AppServer limitation makes the **first** call by the bare `U_` name fail at runtime without the `using` (`cannot find function U_X in AppMap`).
- **`Templates/<App>` layout**: files `GwTemplate<App><Layer>.tlpp`, namespace `Gworks.Templates.<App>.<Layer>` (`Apps`, `Api`, `Controllers`, `Services`, `Functions`, `Enums`, `Forms.Main`) — the layer, not every folder level. Public names drop `Template` (`GwConsultaSqlApi`, route `/GwConsultaSql/consultas`). `Templates/APITrace` is the model; `Templates/ConsultaSql` follows it and adds the `Api` and `Services` layers.
- **Do not use** the legacy namespaces `Gworks.Library.Utils` and `Gworks.Library.Mapping` in new code — they are thin forwarding shims kept only for backward compatibility (each function body is one line: `Return Gworks.Library.Functions.U_XXX(...)`). Call `Gworks.Library.Functions.U_...` directly.
- **Do not use** anything under `Legacy/Discontinued/*` (old JasperReport integration, an old `GwGetMessage`/`GwSetMessage` pair under `Gworks.Library.Legacy.*`) — superseded by the live versions under `Gworks.Library.Functions`.
- Every function/method carries a `/*/{Protheus.doc} .../*/` ProtheusDOC block with `@type`, `@version`, `@author`, `@since`, `@param`, `@return`. Keep this style when adding to or extending the library — see the installed `documentation-writer` skill for the full ProtheusDOC standard.
- Standard in-method error pattern: `::oError:cMethod := "MethodName"`, then on failure `::oError:cError := "..."; ::oError:ThrowException()`.
- Entities and business functions live under `Gworks.Business.<Modulo>.<Entities|Functions>`, one file per class/function, mirroring the folder layout (`Business/<Modulo>/Entities/...`, `Business/<Modulo>/Functions/...`).

## Relationship to `advpl-gworks-pattern`

For a full layered application with several distinct user actions, a Service→Core→Builder pipeline, and possible cross-branch batch fan-out, see the **`advpl-gworks-pattern`** skill (mined from `Applications.PreCarga`) instead of scaffolding ad hoc on top of this one. It builds on everything here, but deliberately overrides a few of the defaults below once you're inside that pipeline — when code you're extending already commits to one of the two patterns, follow that code's own convention over the generic default stated here:

- **ExecAuto wrapping**: `GwExecAuto` is **not** a general default in either pattern — Giovani avoids it outside one specific case: a call that actually needs to run on a **new/async thread** (`SetStartJob`). For a plain single-branch call, whether inside a standalone `Gworks.Business.*` entity method or inside an `Applications.<App>.*` Service/Core/Builder pipeline, prefer a direct call or a **hand-written per-routine wrapper** (`Common/ExecAuto/<Routine>ExecAuto.tlpp`, `advpl-gworks-pattern`'s `references/patterns.md#execauto-wrapper-pattern`) — each legacy routine needs its own pre-positioning logic and a fixed `{success,log,<key>}` result contract that the generic class doesn't give you. Reach for `GwExecAuto` only when the thread/async dispatch is the actual requirement.
- **Error/log object lifecycle**: the classic `::oError:cMethod := "..."` / `ThrowException()` pattern is for a `Business/*` entity's own methods. The `GwMessagingClass` "unified" style shown in `references/patterns.md#csv-import-pattern` creates its own `oError_`/`oLog_`/`oMessage_` **locally**, once, for a single self-contained flow (a CSV wizard, a small `Templates/*` app) — don't copy that instantiation inside an `Applications.<App>.*` Controller/Service/Core/Builder chain. There, `oMessage_`/`oError_` are created **once by the Controller** and must be reused, never re-instantiated, by every layer further down the call stack for that request (see `advpl-gworks-pattern`'s Conventions) — recreating them there silently breaks the "don't double-report an error the inner code already displayed" check.
- **Namespace choice**: a standalone, reusable data-access entity (used across several call sites, no dedicated user-action pipeline of its own) → `Gworks.Business.<Module>.Entities` (this skill). An aggregate root that's part of a multi-action layered application with its own Services/Core/Builders → `Applications.<App>.Entities` (`advpl-gworks-pattern`) — even though both extend `GwDataAccess` the exact same way.

## Catalog

### Classes — full detail in `references/classes-reference.md`

| Class | Extends | Purpose |
|---|---|---|
| `GwDataAccess` | — | Generic active-record-style data access wrapper: area save/restore, seek/filter, relations, insert/update/delete via `BEGIN TRANSACTION`. Base class for every `Business/*` entity. |
| `GwDataRelation` | — | One-to-many join helper used internally by `GwDataAccess:SetRelation()`. |
| `GwDbConnect` | — | Connects to an external DB configured in TOTVS DBAccess (`TCLink`/`TcUnLink`). |
| `GwEnum` | — | Simple named-enum helper (id / name / description), used for routing (`nOpc`) patterns. |
| `GwExecAuto` | — | Dynamic `ExecAuto`/`MsExecAuto` runner with unified error capture and optional `StartJob` execution. **Niche tool, not a default** — reach for it specifically when the call needs to run on a new/async thread; for a plain single-branch call, a direct approach is preferred. |
| `GwFileIterator` | — | Loads a text file into memory and iterates its lines via load/valid/exec codeblocks. |
| `GwFormatData` | — | Small data-formatting helper (currently: `DateToUtc`). |
| `GwGetFile` | — | File/folder picker dialog wrapper (`TFileDialog`). |
| `GwKeyValue` | — | Ordered key→value array with nested-children support; the framework's lightweight ordered map, used pervasively as a parameter/DTO carrier. |
| `GwMailAttachments` | — | Reserves a semaphore-protected attachment directory, copies local files to the server, sends mail via `U_GwSendMail`. |
| `GwConsoleLog` | — | Structured console/log-file writer (state, prefix, optional `FwLogMsg` integration). |
| `GwError` | `ErrorClass` | Central error object: set/show/throw, `AutoGRLog` integration for ExecAuto/MVC model errors, named save/restore of errors. |
| `GwMessagingClass` | — | Newer unified wrapper combining `GwError` + `GwConsoleLog` behind one property-based API (`SetProperty`/`Display`/`Close`). Prefer this for new code. |
| `GwMetaData` | `GwMetaDataCommit` | Builds and commits SX2 (tables) / SX3 (fields) / SIX (indexes) / SXB (standard queries) dictionary entries from JSON descriptors. |
| `GwMetaDataCommit` | — | Internal diff/validate/commit engine used by `GwMetaData`; not meant to be used directly. |
| `MSPrinterArgs` | `GwMailAttachments` | Wraps `TMSPrinter`-style report printing setups: `NORMAL` / `PDF/LOCAL` / `PDF/EMAIL`. |
| `GwParamBox` | — | Builds `ParamBox()` dialogs from a JSON param definition instead of a raw positional array. |
| `GwSemaphore` | — | Wraps `LockByName`/`UnLockByName` with company/branch scoping. |
| `GwSequence` | — | Sequential number generator with prefix/family, DB-backed reboot (table `ZGS`, created by `U_GwSequenceSchema()`). Serializes callers with one `LockByName` semaphore per counter, held across the whole lookup/increment/write transaction. |
| `GwStructJsonMapping` | — | Maps external field names to ERP SX3 field metadata (type/size/decimals/required/default). |
| `GwAsyncQueue` | — | Multi-thread job queue built on `StartJob` + `GwSemaphore`, with max-thread throttling. |

### Functions — full detail in `references/functions-reference.md`

| Folder | Functions |
|---|---|
| ApiQuery (`Gworks.Library.Classes` namespace, `Library/Classes/ApiQuery`) | `GwApiQuery` (REST `/gwquery/query` **and** direct call), `GWQUPD` (`/gwquery/upd`, writes), `GWQTOJSON` |
| Database | `GwArrayCommit` (alias `GwDbInsertFromArray`), `GwGetArea`/`GwRestArea`, `GwGetDbConnec`, `GwPosicione` |
| Error | `GwThrowError` |
| File | `GwGetFile` |
| Mail | `GwSendMail` |
| Mapping | `GwGetDbFieldMapping`, `GwGetDbTableMapping` |
| MBrowse | `GwGetStructForMBrowse` |
| Messages | `GwHelp`, `GwGetMessage`, `GwSetMessage` |
| Metadata | `GwGetFieldArray`, `GwGetFieldStruct`, `GwOpenDictionary`, `SxUtilGetAliasByFieldName`, `SxUtilGetFieldPrefixByAlias`, `SxUtilGetFilialFieldName` |
| String | `GwApplyKeyOverString`, `GwCamelCase`, `GwCleanSpecialChar`, `GwGetFileNameFromFullPath`, `GwGZipDecomp`, `GwSearchStringInArray`, `GwWipeSpaces` |
| TReport | `GwTReportStruct` |
| Utils | `GwEvalModelError`, `GwGetNumbering`/`GwConfirmNumbering`, `MGetEval`, `GwRemoteType`, `GwRunExecAuto`, `GwGetSequence`, `GwSequenceSchema` |
| Xml | `GwGetXmlNodeLength`, `GwGetXmlNodeObject` |
| MvcUtils | `GwSetGridCaption`, `GwSetVirtualField` |

### Business Entities & Functions (examples of the patterns in practice)

| Entity/Function | Table/Scope | Notes |
|---|---|---|
| `GwPedidoCompra` | SC7 | Numbering + `IncluirPedidoCompra` via `GwExecAuto("MATA120")` |
| `GwMovimentoInterno` | SD3 | Skeleton only — search methods still `// TODO` |
| `GwSolicitacaoArmazem` | SCP | `IncluirSolicitacaoArmazem` via `GwExecAuto("MATA105")` |
| `GwSolicitacaoTransferencia` + `GwSolicitacaoTransferenciaItem` | NNS / NNT | Shows `SetRelation()` between header/item entities, plus a raw `FwLoadModel('MATA311')` insert path |
| `GwOrdemProducao` | SC2 | Numbering + `IncluirOrdemProducao` via `GwExecAuto("MATA650")` |
| `GwRoteiroOperacao` | SG2 | Search-only entity |
| `GwProduto` | SB1 | Search-only entity |
| `GwProdutoIndicador` | SBZ | Search-only entity, shows `DisableAutoFilial()`/`EnableAutoFilial()` around a cross-branch seek |
| `GwPedidoVendaEstornarLiberacao` / `GwPedidoVendaLiberar` | SC5/SC6/SC9 | Not entity-based — direct workarea manipulation calling `a460Estorna()` / `MaLibDoFat()` |

### Environment / Dev Tooling (`Environment/*.prw`)

`gFncExec`, `gMnuExec`, `gSeek`, `gTlppInc` — developer/debug helpers (ad-hoc function runner, blind-login menu launcher, TLPP include export). Not business APIs; don't suggest these for application code.

## Architectural Patterns

Full walkthroughs with code in `references/patterns.md`:

1. **Entity pattern** — how `Business/*` classes extend `GwDataAccess`.
2. **Metadata/dictionary builder pattern** — `GwMetaData` end-to-end (`Templates/APITrace/Metadata/HeaderCreate`).
3. **Full MVC template scaffold** — `Templates/APITrace` (Apps → Controller/Enum routing → ModelDef/ViewDef/MenuDef).
4. **CSV import wizard pattern** — `Library/Functions/Imports/*`.
5. **Error/log/messaging pattern** — `GwError` + `GwConsoleLog` vs. the newer `GwMessagingClass`.
6. **Templates file names and namespaces** — `GwTemplate<App><Layer>` / `Gworks.Templates.<App>.<Layer>`.
7. **Namespaced `User Function` calls** — global functions, but the AppServer fails the first call made without a `using namespace`; runtime-only, later calls work (jobs under a namespace too).
8. **Client temp files** — `GetTempPath()`, OS-dependent separator, `l:` prefix on Linux (`U_ConsultaSqlTempFile` is the model).

## Known Gotchas (found while reading the source — verify before relying on them)

- `U_GwGetNumbering` (`Library/Functions/Utils/GwLibraryGetNumberingFunction.tlpp`): the required-parameter check reads `if !Empty(cAlias) .Or. Empty(cField)` — this looks inverted (it should likely be `if Empty(cAlias) .Or. Empty(cField)`). As written, it throws whenever `cAlias` **is** filled unless `cField` is also filled, which is backwards from a "required params" check. Double-check behavior before depending on this validation.
- `GwKeyValue:ReplaceValueByKey` (`Library/Classes/KeyValue/GwLibraryKeyValueClass.tlpp`): sets a misspelled local `lRessult := .T.` instead of `lResult`, so the method always returns `.F.` even on a successful replace. `AddOrReplaceByKey` (which calls it) still works because it does its own `lResult := .T.` on the `KeyExists` branch, but calling `ReplaceValueByKey` directly and trusting its return value will misreport success.
- `GwAsyncQueue:StartThreadAsync` (`Library/Classes/AsyncQueue/GwLibraryAsyncQueueClass.tlpp`): builds `aParams` with 24 slots but the `StartJob(...)` call forwards `aParams[23]` and `aParams[24]` while skipping `aParams[22]` entirely — the 22nd request parameter is silently dropped.
- `U_GWQUPD` (`Library/Classes/ApiQuery`): the logical return is `.T.` even when the **database** rejected the statement (the REST contract is HTTP 200 with `"erro": true`). Read `jResult["erro"]`, not the return value.
- `U_GWQTOJSON` runs `SET(_SET_DATEFORMAT, "dd/mm/yyyy")` and never restores it: the thread's date format stays changed after the call. It only converts dates for columns whose name is in the SX3 (an aliased date column comes back unconverted).
- `U_GwApiQuery` has two modes chosen by its parameters; the direct mode (`cQuery` + `@jResult`) exists only in version 1.1 of the file. If the RPO still holds the REST-only version, a direct call gets no result — compile `Library/Classes/ApiQuery` into that environment.
- A path built from `GetTempPath()` without the `l:` prefix on a Linux client points at the **server's** `Protheus_Data`, silently (see `patterns.md#client-temp-files-gettemppath--the-l-prefix`).
- `GwMetaDataCommit` static helper functions (`fValid`, `fCommit`, ...) reference locals like `nOrder`/`cSeek` without a preceding `Local` declaration in some branches — relies on AdvPL's implicit-declaration fallback; safe at runtime but not TLPP-strict style.
