# Gworks Classes Reference

Full method signatures and short usage notes for every class in `Gworks.Library.Classes`. Source: `gworks-library-protheus/Sources/Library/Classes/`.

## GwDataAccess

Base class for data access. Every `Business/*` entity extends this. Wraps area handling, seek/filter, relations, and transactional insert/update/delete.

Constructor: `New( cAlias as character )` — `cAlias` can be a standard table alias (e.g. `"SB1"`), a dictionary alias (`"SX3"`), or a SQL alias obtained via `GetNextAlias()`. Auto-detects the data source (`SX2` for 3-char aliases, `DIC` for 6-char `*DIC` aliases, `SQL` otherwise).

Key attributes: `oError` (a `GwError`), `cAlias`, `cDataSource`, `nOperation`, `lAutoFilial` (default `.T.`), `lFound`, `cIndexKey`, `nIndexOrd`.

Key methods:
- `SelectArea()` / `SaveArea()` / `RestoreArea()` / `CloseArea()` / `ReleaseArea(lClearFilter)` — area lifecycle. `ReleaseArea` restores if the alias was already open at construction time, otherwise closes it.
- `SaveOtherAreas(cNames)` / `RestoreOtherAreas(cNames)` — same lifecycle for a `;`-separated list of extra aliases.
- `SetOrder(xOrder)` — accepts a numeric SIX order or a descriptive key string (resolved via `RetOrder()`).
- `GoTop()` / `GoBottom()` / `GoToRecno(nRecno)` / `SkipLine()`.
- `EnableAutoFilial()` / `DisableAutoFilial()` — toggle automatic branch-code prefixing in `Seek()`/`SetFilter()`.
- `Seek(cKey)` — seeks by key, auto-prefixing the branch code unless disabled; also calls `RefreshRelation()` on success.
- `SeekStatus(cKey)` — cheap check of whether the currently positioned record already matches `cKey` (no I/O).
- `EvalByCondition(bExec, bCondition)` — `DbEval` wrapper.
- `EndOfFile()` / `NotEndOfFile()` / `TotalLines()`.
- `SetFilter(cFilter)` / `ClearFilter()` — `SetFilter` auto-prepends a `<prefix>_FILIAL == xFilial(...)` clause when `lAutoFilial` is on.
- `GetValue(cFieldName, cToken)` — supports `;`-separated multi-field concatenation (numeric/date auto-converted to string when concatenating).
- `SetOperation(nOperation)` — `MODEL_OPERATION_VIEW/UPDATE/INSERT/DELETE`.
- `SetValue(cFieldName, xValue)` — buffers a field for insert/update (must call `SetOperation` first).
- `SetDelete(nRecno)` — buffers a recno for delete.
- `CommitData()` — persists buffered insert/update/delete inside `BEGIN TRANSACTION`/`END TRANSACTION` with `RecLock`/`MsUnLock`.
- `SetRelation(oAttr)` — `oAttr` is a `GwKeyValue` with keys `AliasFrom`, `AliasJoin`, `IndexFrom`, `KeyFrom` (optional, defaults to `IndexFrom`), `IndexJoinFK`, `IndexJoinPK`. Creates and joins a `GwDataRelation`.
- `RefreshRelation()` / `SelectRelation(cAliasJoin, cIndexJoin)` / `RelationGetValue(cFieldName, cToken)`.
- `GetOpenedStatus()` / `GetFieldPosition(cFieldName)` / `FieldExists(cFieldName)`.

```advpl
oPedido := GwPedidoCompra():New()          // extends GwDataAccess("SC7")
oPedido:SetOrder("C7_FILIAL+C7_NUM")
if oPedido:Seek(cNumero)
    cFornece := oPedido:GetValue("C7_FORNECE")
endif
```

## GwDataRelation

Internal helper behind `GwDataAccess:SetRelation()`. Rarely instantiated directly, but its constructor shape is the canonical example of the join-attribute object:

```advpl
oAttr := GwKeyValue():New()
oAttr:Add('AliasFrom'  , 'SC5')
oAttr:Add('AliasJoin'  , 'SC6')
oAttr:Add('IndexFrom'  , 'C5_FILIAL+C5_NUM')
oAttr:Add('IndexJoinFK', 'C6_FILIAL+C6_NUM')
oAttr:Add('IndexJoinPK', 'C6_FILIAL+C6_ITEM+C6_PRODUTO')
oRelation := GwDataRelation():New(oAttr)
oRelation:Join()                     // positions cAliasJoin at the first matching record and loads recno/PK lists
oRelation:GetValue('C6_PRODUTO')     // read without moving the record pointer
```
Public data: `aJoinRecno`, `lJoin`, `cAliasFrom/Join`, `cIndexFrom`, `cKeyFrom`, `cIndexJoinFK/PK`, `cKeyJoinFK`, `aKeyJoinPK`. Methods: `Join()`, `Search(cFieldName, xContent)`, `GetValue(cFieldName, cToken)`.

## GwDbConnect

Connects to an external database registered in TOTVS DBAccess.

- `New(lUseServerEnvironment as logical, cEnvironment as character)` — if `lUseServerEnvironment` is `.T.`, pulls connection info via `U_GwGetDbConnec()` (appserver.ini); otherwise starts blank and expects `SetConnection()`.
- `SetConnection(cDbType, cDbAlias, cDbServer, nDbPort)` — `cDbType` one of `ORACLE`/`POSTGRES`/`MSSQL`.
- `GetConnection()` — returns a JSON snapshot: `db_type`, `db_name`, `db_string`, `db_server`, `db_port`, `db_can_connet`, `db_conneted` (note the typo'd key names — they are literal).
- `Connect()` / `Disconnect(nHandle, lVerbose)` — wraps `TCLink`/`TcUnLink`.

## GwEnum

Named-enum helper used for routing patterns (see `Templates/APITrace/Enums`).

```advpl
oEnum := GwEnum():New()
oEnum:SetEnum("Pendente", "Solicitação de Compra pendente!")
oEnum:SetEnum("Aprovado", "Solicitação de Compra aprovada!")
nOpc := oEnum:GetEnum("Pendente")            // -> 1 (auto-incremented id)
cDesc := oEnum:GetDescription("Pendente")    // -> "Solicitação de Compra pendente!"
```
Methods: `SetEnum(cName, cDescription, nId)` (nId optional, auto-increments), `GetEnum(xSearch, cProperty)` (search by id or name; `cProperty` one of `id/name/description`), `GetDescription(xSearch)`.

## GwExecAuto

Runs an `ExecAuto`/`MsExecAuto` dynamically with unified error capture, optionally via `StartJob`.

**Usage guidance**: this is a niche tool, not a general-purpose default — Giovani avoids it for plain, single-branch ExecAuto calls, where a direct call (or a hand-rolled per-routine wrapper, see `advpl-gworks-pattern`'s `references/patterns.md#execauto-wrapper-pattern`) is the simpler, preferred path. Reach for `GwExecAuto` specifically when the call genuinely needs to run on a **new thread** — cross-branch dispatch via `SetStartJob`, especially asynchronous execution — since that's the scenario where the class's unified error capture across a `StartJob` boundary actually earns its complexity.

- `New(cExecAuto as character)` — e.g. `GwExecAuto():New("MATA120")`.
- `SetSuccessExpression(cExpression)` — an AdvPL expression string evaluated after a successful run, e.g. `'SC7->(C7_FILIAL+C7_NUM)'`; result exposed via `cSuccessExpressionResult` / `GetSuccessExpressionResult()`.
- `SetStartJob(cJobEmpresa, cJobFilial, cJobModule, cJobName, aJobTables)` — only actually switches to job mode when company/branch differ from `CEMPANT`/`CFILANT`.
- `RunExecAuto(nOperation, aKeyValue)` — `aKeyValue` is an array of `GwKeyValue` objects (one per "level": header fields directly, or a key whose value is itself a `GwKeyValue` of children for grid/child data — see `HasChildren()`/`GetChildren()` on `GwKeyValue`). Sets `oError:lError`/`oError:cAutoGRLog` on failure.

```advpl
oExecAuto := GwExecAuto():New("MATA120")
oExecAuto:SetSuccessExpression('SC7->(C7_FILIAL+C7_NUM)')
oExecAuto:RunExecAuto(MODEL_OPERATION_INSERT, aKeyValue)
if !oExecAuto:oError:lError
    cNovoPedido := oExecAuto:cSuccessExpressionResult
endif
```

## GwFileIterator

Loads a text file and iterates its lines.

- `New(cFile, cHeader, lLoadFile)` — `lLoadFile` defaults `.T.` (auto-loads on construction).
- `SetFile(cFile, cHeader, lLoadFile)` / `SetHeader(cHeader)` — `SetHeader` prepends the header as line 1 of `aFile`.
- `LoadFile()` — uses `FWFileReader()`; sets `lCaseSensitive` on Linux.
- `GetLoadStatus()` / `nTotalLines` / `lIgnoreBlankLines`.
- `EvalByCondition(bLoad, bValid, bExec, nStart)` — for each line (from `nStart` on): `xLoad := Eval(bLoad, cLine, nI, cFile)`, then `lValid := Eval(bValid, xLoad, cLine, nI, cFile)`, then if valid `Eval(bExec, xLoad, cLine, nI, cFile)`. Set `::lStop := .T.` from inside a block to abort early.

## GwFormatData

Minimal data-formatting helper.

- `DateToUtc(dValue as date, cTime as character)` — returns `"YYYY-MM-DDThh:mm:ss"`.

## GwGetFile

File/folder picker dialog (GUI only — not blind-safe for the dialog methods; `OpenDialog()` throws if `GetRemoteType()` indicates no interface).

- `SetInitDirectory(cDirectory, lCreateDir)` → logical.
- `InitDialog()` → sets sane defaults (temp dir, "Select File" title, all-files mask, `OPEN` mode).
- `SetDialogMask(cDialogFileMask)`, `SetDialodOpening()`, `SetDialodSave()` (sic — no "g"), `SetDialogMultiFile(lOption)`, `SetDialogDirectory(lOption)`.
- `OpenDialog()` → logical (confirmed vs cancelled); populates `cSelectedFile` / `aSelectedFiles` / `cSelectedDiretory` depending on mode.
- `GetResult()` → returns whichever of the three was populated.

For blind/server-side file selection use the standalone function `U_GwGetFile()` instead (see functions-reference.md), which wraps `cGetFile()`.

## GwKeyValue

The framework's ordered key→value map, used everywhere as a lightweight DTO/parameter carrier (including nested "children" for grid/detail data).

- `New(cKey, xValue)` — optional initial pair.
- `Add(cKey, xValue)` — appends (no uniqueness check — use `AddOrReplaceByKey` if you need upsert semantics).
- `Length()`, `HasName(cName)`, `GetKeyByPosition(nPos)`, `GetNameByPosition(nPos)` (alias, deprecated), `GetAllValues()`, `GetValueTypeByPosition(nPos)`, `GetValueByPosition(nPos)`.
- `HasChildren(nPos)` / `GetChildren(nPos)` — `.T.` when the value at `nPos` (default 1) is itself a `GwKeyValue` — this is how nested grid data is represented (see `GwExecAuto:RunExecAuto`).
- `GetValueByKey(cKey, cMatch, cMatchType)` — plain lookup by key, or (if `cMatch`/`cMatchType` given) finds the first entry whose key matches AND whose key/value `cMatchType` (`"key"`/`"value"`) contains `cMatch`.
- `GetPositionKey(cKey)`, `KeyExists(cKey, cMatch, cMatchType)`, `ValueExists(cValue)`.
- `ReplaceValueByKey(cKey, xValue)` — **see Known Gotchas in SKILL.md**: always returns `.F.` due to a typo, even on success. Don't branch on its return value.
- `AddOrReplaceByKey(cKey, xValue)` — safe upsert; this one's return value is reliable.

## GwMailAttachments

Reserves a semaphore-protected attachment directory, copies local files server-side, sends mail.

- `New()` — no-arg.
- `ReserveAttachDir(cAttachDirectory, lEraseFiles)` — default dir `\attachments\`; retries `LockByName` up to 10× with a 5s interval.
- `ReleaseAttachDir(lEraseFiles)` — unlocks and optionally clears the directory.
- `GetNameAttachDir()`.
- `AttachFiles(cLocalDir, lEraseLocal)` — copies every file in `cLocalDir` to the reserved server dir via `CpyT2S`.
- `SendMail(cEmailTO, cEmailCC, cEmailCCO, cSubject, cBody, cFileType, lSplitMail, cRetError)` — `cFileType` default `"*.pdf, *.csv"`; `lSplitMail` sends one email per recipient when `.T.`. Delegates the actual send to `U_GwSendMail()` per attachment batch. Sets `lError`/`cError` on failure.

## GwConsoleLog

Structured console/log-file writer.

- `New()` — defaults: state `INFO`, prefix on, log-to-buffer on, console-print on.
- `UseFwLogMsgClass(lArg)` — route through `FwLogMsg()` instead of `ConOut()`.
- `EnablePrefix(lArg)` — toggles the `Empresa|Filial|FunName|Data|Hora` prefix.
- `EnableLogFile(lArg)` — gated by the `GW_GERLOG` system parameter; if that parameter is off, the call is a no-op with a console warning.
- `EnableConsolePrint(lArg)`.
- `SetState(cState)` / `SetLogId(cLogId)` / `SetLogDescription(cLogDescription)`.
- `SetMessage(xMessage, lConsolePrint, lBreakLine)` — `xMessage` can be a string, or a 2-element array `{cState, cMessage}`. Appends to the internal `cLog` buffer.
- `CreateLogFile(cFileName)` — writes `\log\<name>-<date>-<time>.log` (creates `\log` if missing).
- `GetLastMessage()` / `GetLogFile()`.

## GwError (extends ErrorClass)

Central error object — every `GwDataAccess`-derived entity carries one at `::oError`.

- `New(cError, cSuggestion, cTitle, lError, lShowError, cStyle)` — all optional; can construct pre-populated and optionally auto-display.
- `SetError(cError, cSuggestion, cTitle, lError)` — also resets `oSave` (the named-error stash) and mirrors into the inherited `ErrorClass` fields (`GenCode`, `Description`).
- `GetErrorByLabel(cLabel)` — `"ERROR"`/`"SUGGESTION"`/`"TITLEERROR"`.
- `DefineWithError(lError)` / `HasError()`.
- `ShowError(cStyle, cTitle, lShowAutoGRLog, lDefineWithError, lUpdateErrorClass)` — `cStyle` one of `INFO` (`FwAlertInfo`), `STOP` (`FwAlertError`), `ALERT` (`FwAlertWarning`), `HELP` (routes through `Help()`, safe for blind execution). Blind execution (`IsBlind()`) suppresses the GUI alert paths automatically.
- `SetExecAutoVariables(cMode)` — `"CAPTURE"` vs `"DISPLAY"`; prepares the `lMsErroAuto`/`lAutoErrNoFile`/`lMsHelpAuto` privates required by `MsExecAuto()`. Those three privates **must already be declared** (`Private`) by the caller before this runs.
- `SetAutoGRLog(cAutoGRLog)` / `SetAutoGRLogFromModel(oModel, cModelName)` / `SetAutoGRLogFromExecAuto(cExecAutoName)` / `ShowAutoGRLog()` — capture and (optionally) display the framework's own auto-generated error log (`AutoGRLog()`/`MostraErro()` / MVC `oModel:GetErrorMessage()`).
- `ThrowException(cException)` — raises `UserException()`, prefixed with `cFunName:cMethod - ` when those are set.
- `SaveError(cName)` / `RestoreError(cName)` — stash/recall a full error snapshot under a name (default `"Error"`), backed by a `GwKeyValue`.

```advpl
::oError:cMethod := "IncluirPedidoCompra"
if Empty(aKeyValue)
    ::oError:cError := "Parâmetro aKeyValue não informado ou inválido!"
    ::oError:ThrowException()
endif
```

## GwMessagingClass

Newer unified wrapper over `GwError` + `GwConsoleLog`, driven by a single property bag. Prefer this over manually juggling `GwError`/`GwConsoleLog` in new code.

- `New(oError, oLog)` — reuses existing objects/privates (`oError_`/`oLog_`) if present, otherwise creates fresh ones. `lBlind` auto-detects (`isBlind()` or missing `cEmpAnt`).
- `GetObject(cName)` — `"error"` or `"log"` → the underlying object.
- `AutoLogMessage(lAuto)` — when `.T.` (default), setting `error_message` auto-mirrors into `log_message`.
- `IgnoreInfoLogSate(lIgnore)` / `SetInfoLogState(cState)` — control which `log_state` values are treated as "informational" (skip the auto-save-to-file behavior).
- `SetProperty(cProperty, xValue)` — property names: `error_state`, `error_message`, `error_suggestion`, `error_title`, `error_style` (`INFO`/`STOP`/`ALERT`/`HELP`), `error_details`, `log_state`, `log_message`, `log_console_print`, `log_console_break_line`. Legacy aliases (`lError`, `cError`, `cSuggestion`, `cTitle`, `cStyle`, `cDetails`, `cState`, ...) are auto-mapped to the property names above.
- `DefineErrorAuto(cFrom, xParam)` — `cFrom` `"model"` (pass the MVC `oModel`) or `"execauto"` (pass the ExecAuto routine name) → pulls the error text into `error_details`.
- `Display()` — pushes the property bag into the underlying `oError`/`oLog` and shows it (unless blind).
- `Close()` — saves the log file (if `lSaveLogFile`) and clears.

```advpl
Private oMessage_ := GwMessagingClass():New()
Private oError_ := oMessage_:GetObject("error")
...
oMessage_:SetProperty("error_state", .T.)
oMessage_:SetProperty("error_message", "Falha ao validar/criar metadados!")
oMessage_:SetProperty("error_suggestion", "Favor contactar o suporte técnico.")
oMessage_:SetProperty("error_style", "HELP")
oMessage_:SetProperty("error_details", cError)
oMessage_:SetProperty("log_state", "ERROR")
oMessage_:Display()
```

## GwMetaData (extends GwMetaDataCommit)

Builds and commits SX2/SX3/SIX/SXB dictionary entries from JSON descriptors. See `references/patterns.md#metadata-pattern` for a full worked example.

- `New()` — requires `cEmpAnt`/`cFilAnt` to be set; reads the company's branch layout (`SM0.M0_LEIAUTE`) to compute company/unit/branch field lengths.
- `Clear()` — resets the internal `jMetaData` buffer.
- `AddTable(jTable)` — `jTable`: `alias` (3 chars), `name`, `name_sp`/`name_eng` (optional, default to `name`), `sharing_branch`/`sharing_unit`/`sharing_company` (`"C"`/`"E"`), `unique_key` (optional). Also auto-adds the `<prefix>_FILIAL` field via the internal `SetFieldBranch`.
- `AddField(jField, xDefaults)` — `jField`: `alias`, `order`, `name` (must start with the table's field prefix), `type` (`C/N/L/D/M`), `size`, `decimal`, `title`/`title_sp`/`title_eng`, `description`/`description_sp`/`description_eng`, `picture`, `context` (`R`/`V`), `visual` (`A`/`V`), `requisite` (logical), `used`/`used_brw` (logical or literal SX3 flag string), plus optional `combo_box`, `when`, `init`, `init_brw`, `folder`, `level`, `dataset`, `vld_user`. `xDefaults` lets you override the raw `X3_*` technical defaults (reserved bytes, trigger, GRUPSXG, etc).
- `AddIndex(jIndex)` — `alias`, `order`, `key`, `name`/`name_sp`/`name_eng`, `nickname`, `show_seek` (logical).
- `AddFolder(jFolder)` — `alias`, `order`, `name`/`name_sp`/`name_eng`, `mvc_group_code`/`mvc_group_type` (must be given together).
- `AddQuery(jQuery)` — builds a full SXB standard-query definition: `alias` (≤6 chars), `table`, `title`(+sp/eng), `orders[]` (`{description, content}`), `action` (optional, `{description, content}`), `fields[]` (`{description, content, order}` — `order` must match an `orders[].content`), `relation[]` (array of `"ALIAS->FIELD"` strings), `filter` (optional AdvPL expression string).
- `CommitData()` — validates (`VldData`, inherited from `GwMetaDataCommit`) then commits inside a transaction. All `Add*` methods throw `UserException` on invalid/duplicate input inside the *same* `GwMetaData` instance — they do not, by themselves, check for changes against an *already-committed* physical dictionary entry beyond what `VldData`/`fValid` compute at commit time.

## GwMetaDataCommit

Internal validate/commit engine used by `GwMetaData` — not meant to be instantiated directly by consumers. Exposes `SetData(jData)`, `VldData()`, `CommitData()` plus module-level static helpers (`fValid`, `fCommit`, `fGetChange`, `fGetDeleted`, `fQueryExists`) that diff the incoming JSON against the live SX2/SX3/SIX/SXB tables to decide insert vs. update and which fields actually changed.

## MSPrinterArgs (extends GwMailAttachments)

Wraps report-printing setup for the three common Gworks printing modes.

- `New(cSetup, cFileName, cPath, lLegacy, lDisableSetup)` — `cSetup` one of `"NORMAL"`, `"PDF/LOCAL"`, `"PDF/EMAIL"`; each preset configures `nDevice` (`IMP_SPOOL`/`IMP_PDF`), `cPrinter`, `lViewPDF`, `lServer`, `lDisableSetup` accordingly.
- `CreateDirectory(lEraseFiles)` / `ReleaseDirectory(lEraseFiles)` — for `PDF/EMAIL`, delegates to the inherited `GwMailAttachments:ReserveAttachDir`/`ReleaseAttachDir`.
- `CreatePDF(cSenha)` — shells out to `printer.exe <file> PDF_WITH_PASSWORD <senha>` for every `.rel` file in the directory (Windows appserver only, locates the binary via `GetSrvGlbInfo()`).
- `SendPDF(cEmailTO, cEmailCC, cEmailCCO, cSubject, cBody)` — delegates to the inherited `SendMail(..., ".pdf")`.

## GwParamBox

Builds `ParamBox()` dialogs from a fluent JSON definition instead of a raw positional array — avoids the classic AdvPL "remember the 8-tuple by position" pain.

- `New()`.
- `SetDefaultSizeGet(nSize)` / `SetDefaultRequired(lRequired)` — defaults applied to subsequently-added `get`/`password` params.
- `SetDialogTitle(cTitle)` / `SetDialogValid(bValid)` / `SetDialogSave(lSave)`.
- `SetComboResult(xOption)` — `"Description"`/1 or `"Position"`/2 — controls what `GetValue()` returns for combo params (fixes the usual "combo returns numeric position, not the label" annoyance).
- `AddParam(cType, cName)` — `cType` one of `"get"`, `"combo"`, `"password"`, `"memo"`.
- `SetProperty(cName, cProperty, xValue)` — property names depend on `cType` (see the `GetTemplate` shape in the source): `get`/`password` → `cDescription`, `cInit`, `cPicture`, `cValidation`, `cQuery`, `cWhen`, `nSize`, `lRequired`; `combo` → `cDescription`, `nInit`, `aOptions`, `nSize`, `cValidation`, `lRequired`; `memo` → `cDescription`, `cInit`, `cValidation`, `cWhen`, `lRequired`.
- `ShowDialog()` → logical (confirmed vs. cancelled — loops back to the dialog on cancel unless the user confirms "really cancel?").
- `GetValue(cName)` → the value entered, honoring `SetComboResult()` for combo params.

```advpl
oParamBox := GwParamBox():New()
oParamBox:SetDefaultSizeGet(100)
oParamBox:SetDefaultRequired(.T.)
oParamBox:SetDialogTitle("Parâmetros de Integração")
oParamBox:AddParam("Get", "nome_funcao")
    oParamBox:SetProperty("nome_funcao", "cDescription", "Função")
    oParamBox:SetProperty("nome_funcao", "cInit", Space(250))
if oParamBox:ShowDialog()
    cFncToExec := AllTrim(oParamBox:GetValue("nome_funcao"))
endif
```

## GwSemaphore

Wraps `LockByName`/`UnLockByName` with company/branch scoping.

- `New()` — defaults: `lLockByCompany := .T.`, `lLockByBranch := .F.`.
- `Clear()`.
- `ControlByCompany(lEnable)` — `.T.` → company-only lock; `.F.` → no scoping at all (both flags off).
- `ControlByBranch(lEnable)` — `.T.` → company **and** branch scoping.
- `Lock(cLock)` → logical, stores `cLock` and the result in `lLockResult`.
- `UnLock()` → logical, `.F.` if `cLock` is empty (nothing to unlock).

Used internally by `GwAsyncQueue` and `GwMailAttachments`.

## GwSequence

Sequential number generator with prefix/family scoping, backed by table `ZGS`.

**Prerequisite:** the `ZGS` dictionary must exist. `U_GwSequenceSchema()` (in `Sources/Library/Classes/Sequence/GwLibrarySequenceSchema.tlpp`) creates/validates it and is idempotent — call it at app-init time, like any other Metadata Pattern schema. The class reads the ZGS column sizes at runtime via `TamSx3`, so the schema is the single source of truth for the limits below.

- `New(cCampo, cPrefixo, cFamilia, lReboot)` — `cCampo` (required) must be an SX3 field of type `C` or `N` with 0 decimals; `cPrefixo` is prepended and excluded from the counter; `cFamilia` lets the same field have independent counters per "family"; `lReboot` (default `.T.`) seeds a brand-new counter from `MAX(field)` in the actual table the first time a given campo/prefix/family combo is seen.
- `GetSequence()` → character or numeric (matches the field's SX3 type).

The constructor **throws** (it does not truncate or silently return `nil`) when: the field is absent from SX3 or has decimals; a prefix is given for an `N` field; the field name / prefix / family exceeds `ZGS_CAMPO` (10) / `ZGS_PREFIX` (10) / `ZGS_FAMI` (20); the target field is wider than `ZGS_SEQUEN` (30); or the prefix leaves no room for the counter. `GetSequence()` also throws on a corrupted counter row and on range overflow (when `Soma1` wraps past the field width). Wrap calls in `TRY/CATCH` if a failure must not abort the caller.

**Concurrency contract** (do not reorder this when editing the class): a `LockByName` semaphore named `"GWSEQ|<familia>|<campo>|<prefixo>"` — i.e. one resource per counter, never the generated value — is acquired *before* the `MsSeek` of the ZGS key and released in a `FINALLY` *after* `END TRANSACTION`. Lookup, `Soma1` and the write all live inside that one critical section, so concurrent callers cannot read the same counter or insert duplicate ZGS rows. `SetLock()` gives up after `SEQ_LOCK_RETRY` × `SEQ_LOCK_SLEEP` (300 × 100ms ≈ 30s) and throws, rather than spinning forever inside an open transaction.

Prefer the standalone convenience function `U_GwGetSequence()` (functions-reference.md) over instantiating this class directly — it also handles company-code concatenation into the family.

## GwStructJsonMapping

Maps an arbitrary "external" field name to the corresponding ERP SX3 field metadata.

- `New()`.
- `SetField(cExternalField, cErpField)` — looks up `cErpField` in SX3 and stores `erp_field_name/type/size/decimals/required/default` (via `x3Obrigat()`/`criaVar()`) under `jMapping[cExternalField]`. Throws if the ERP field doesn't exist.
- `GetStruct()` → the accumulated JSON mapping.

Useful when building integration payloads that need to validate/coerce values against the live ERP dictionary before a commit.

## GwAsyncQueue

Multi-thread job queue built on `StartJob()` + `GwSemaphore`, with max-concurrency throttling.

- `New(cProcessName)` — `cProcessName` is required; used as the semaphore-name prefix (`cProcessName:request_id`).
- `Clear()` / `GetSemaphore()` → the internal `GwSemaphore`.
- `Execute(jProcess)` — `jProcess`: `{ "max_threads": n, "wait_time": ms, "request_list": [ { "request_id": n, "request_function": "U_MyFunc", "request_params": [up to 24 positional args] } ] }`. Each queued function **must itself** `Lock`/confirm on the semaphore named `cProcessName:request_id` so the queue can detect completion — the queue does not poll process state any other way.
- Blocks (via `sleep(wait_time)` and internal `WaitingFinishExecution`) until every queued request has signalled completion.

**Gotcha**: see "Known Gotchas" in `SKILL.md` — request parameter #22 is silently dropped when forwarding to `StartJob`.
