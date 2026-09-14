# Gworks Functions Reference

All standalone functions live inside `namespace Gworks.Library.Functions` and are called externally with the `U_` prefix (e.g. `U_GwPosicione(...)`), or fully-qualified as `Gworks.Library.Functions.U_GwPosicione(...)` from inside code that already `using namespace`s something else. Source: `gworks-library-protheus/Sources/Library/Functions/`.

## Database

### `U_GwArrayCommit( cAlias as character, aData as array ) as logical`
Inserts one record into `cAlias` using its live `DbStruct()`: fields present in `aData` (`{{"FIELD","VALUE"}, ...}`) get that value, every other field gets `CriaVar(field, .T.)`. Wrapped in `BEGIN TRANSACTION`/`RecLock(cAlias,.T.)`. Legacy alias `U_GwDbInsertFromArray(cAlias, aData)` just forwards here.

### `U_GwGetArea( aAlias as array, lCurrentAlias as logical ) as array`
Saves `GetArea()` for every alias in `aAlias`, plus (if `lCurrentAlias`, default `.T.`) the currently-selected alias too. Returns `{aAreas, cCurrentAlias}` for use with `U_GwRestArea`.

### `U_GwRestArea( aAreas as array, cIgnore as character )`
Restores every area from a `U_GwGetArea()` result, skipping any alias listed in `cIgnore` (`;`-separated), and restoring the "current" alias last to guarantee correct final positioning.

```advpl
jAreas["extras"] := { SC5->(getArea()), SC6->(getArea()) }
...
RestArea(jAreas["extras"][2])
RestArea(jAreas["extras"][1])
```
(Note: the `Business/Faturamento/Functions/*` examples restore raw `GetArea()` results manually rather than via `U_GwGetArea`/`U_GwRestArea` — both styles exist in the codebase; prefer the `U_Gw*` pair for new code since it also tracks the "current" alias.)

### `U_GwGetDbConnec( jConnection as json, cEnvironment as character ) as logical`
Reads external-DB connection info from the running appserver's `.ini` (`DbDataBase`/`DbAlias`/`DbPort`/`DbServer`, falling back to the `Top*` prefixed keys, then to the `[DbAccess]` section). Returns `.T.` and fills `jConnection` (`db_type`, `db_name`, `db_string`, `db_server`, `db_port`) when all four pieces were resolved. Backing function for `GwDbConnect`.

### `U_GwPosicione( cAlias, nOrder, cSeek, bBlock, lAutoFil, lForceSeek )`
Positions `cAlias` on order `nOrder` and seeks `cSeek` (auto-prefixing the branch unless `lAutoFil` is `.F.`, default `.T.`). If `bBlock` is given, returns `Eval(bBlock, lSeek)`; otherwise returns the logical seek result. `lForceSeek` (default `.F.`) skips the "already positioned here?" short-circuit and always reseeks — leave `.F.` for the common case, it's the whole point of the function's I/O optimization. Exposed conveniently as `U_gSeek(...)` too (see `Environment/gSeek.prw`).

## Error

### `U_GwThrowError( cMessage as character )`
`UserException(ProcName(1) + ' - ' + cMessage)` — one-liner for a quick, consistently-prefixed exception. Used pervasively in the `Business/Faturamento/*` raw functions for parameter validation.

## File

### `U_GwGetFile( xFileType, lSaveDialog, lMemoRead, cDirectory ) as character`
Blind-safe file picker: wraps `cGetFile()` in a retry loop (asks "cancel selection?" if the user dismisses without picking), guarded by a `GwError`. Returns the selected path, or (if `lMemoRead`, default `.F.`) the file's content via `MemoRead()`.

## Mail

### `U_GwSendMail( cSubject, cBody, cMailTO, cMailCC, cMailCCO, aAttachment, cRetError ) as logical`
Low-level SMTP sender via `TMailManager()`/`TMailMessage()`. Reads server config from `MV_RELSERV`/`MV_RELACNT`/`MV_RELPSW`/`MV_RELTLS`/`MV_RELSSL`/`MV_RELAUTH`. `aAttachment` is an array of relative paths (e.g. `"\attachments\file.pdf"`). Prefer `GwMailAttachments` for anything that needs directory reservation/cleanup — this function is the primitive it calls under the hood.

## Mapping

### `U_GwGetDbFieldMapping( aTabelas, cLang, cDtFields, lInvert ) as object`
Returns a `GwKeyValue` mapping SX3 field names to their (optionally camel-cased/cleaned) titles for the given tables, in a chosen language: `"db"` (raw field name), `"pt"`, `"spa"`, `"eng"`. Skips virtual fields (`X3_CONTEXT == "V"`). `lInvert` swaps key/value order (description → field instead of field → description). Also fills `cDtFields` (by reference) with a `;`-separated list of date-typed field names encountered.

### `U_GwGetDbTableMapping( aTabelas, cLang, lInvert ) as object`
Same idea as above but for SX2 table names/descriptions instead of SX3 fields.

## MBrowse

### `U_GwGetStructForMBrowse( oStruct, cField, nAlign, nSize, bData ) as array`
Builds one `FwMBrowse` column-header row from a `GwKeyValue` holding SX3 struct keys (`X3_TITULO`, `X3_TIPO`, `X3_PICTURE`, `X3_TAMANHO`, `X3_DECIMAL` — as produced by `U_GwGetFieldStruct`). `nAlign` default `1` (left); `nSize`/`bData` default from the struct/field name if omitted.

## Messages

### `U_GwHelp( cTit, cErro, cSolucao, oModel )`
`Help()` wrapper that automatically routes into `oModel:SetErrorMessage(...)` when `oModel` is a valid `FWFORMMODEL` (so the error surfaces correctly inside MVC/REST flows instead of trying to pop a blind dialog).

### `U_GwGetMessage() as json`
Returns a blank, canonically-shaped message JSON: `{cState, cError, cSuggestion, cTitle, cStyle, lError, cDetails}` — the input contract expected by `U_GwSetMessage()`.

### `U_GwSetMessage( oError as object, oLog as object, jMessage as json )`
Given the JSON shape from `U_GwGetMessage()`, populates (creating if needed) a `GwError` and `GwConsoleLog`: sets the error, sets the log state/message, and — unless running blind — calls `oError:ShowError(cStyle)` (`cStyle` defaults to `"HELP"`). This is the standard "one call sets both the error object and the log" entry point used throughout the CSV import wizards (see `patterns.md`).

## Metadata

### `U_GwGetFieldArray( cAlias as character ) as array`
Returns the list of SX3 field names (`AllTrim`'d, in dictionary order) for a given table alias.

### `U_GwGetFieldStruct( cField as character, cProperty as character ) as variant`
Returns SX3 struct info for one field, **memoized in a static cache** (`aFields__`) keyed by field name — safe to call repeatedly without re-hitting the dictionary. Without `cProperty`, returns the full JSON (`X3_ARQUIVO`, `X3_ORDEM`, `X3_CAMPO`, `X3_TIPO`, `X3_TAMANHO`, `X3_DECIMAL`, `X3_TITULO`, `X3_DESCRIC`, `X3_PICTURE`, `X3_F3`, `X3_NIVEL`, `X3_CONTEXT`, `X3_VISUAL`, `X3_OBRIGAT`, `X3_USADO`); with `cProperty`, returns just that key (must be one of the above). This is the **current** version — a refactored/legacy variant of the same name lives under `Gworks.Library.Legacy.Functions.ref01` and returns a `GwKeyValue` for **multiple** fields at once instead; don't mix them up.

### `U_GwOpenDictionary( cDictionary as character, cRetAlias as character ) as logical`
Opens one of `SX1`/`SX2`/`SX3`/`SX6`/`SIX` into a fresh alias named `cRetAlias` via `OpenSxs()`, closing any pre-existing alias of that name first.

### `U_SxUtilGetAliasByFieldName( cField as character ) as character`
Derives a table alias from a field name's prefix (e.g. `"B1_COD"` → `"B1"` → `"SB1"`, since 2-char prefixes get an `"S"` prepended).

### `U_SxUtilGetFieldPrefixByAlias( cAlias as character, lUnderline as logical ) as character`
`"SB1"` → `"B1_"` (or `"B1"` if `lUnderline` is `.F.`, default `.T.`).

### `U_SxUtilGetFilialFieldName( cAlias as character ) as character`
`"SB1"` → `"B1_FILIAL"`.

## String

### `U_GwApplyKeyOverString( cString, oValues, cToken ) as character`
Template-substitution: for every key in the `GwKeyValue` `oValues`, replaces `%key%` (or `<cToken>key<cToken>` if `cToken` given, default `"%"`) with its value inside `cString`.

### `U_GwCamelCase( cString as character ) as character`
Naive CamelCase: capitalizes the first letter of each space-separated token, lowercases the rest — no de-accenting or special-char handling (pair with `U_GwCleanSpecialChar` first if needed).

### `U_GwCleanSpecialChar( cString, lSpaces, lAcentos, lAddress ) as character`
Strips a fixed list of punctuation/special characters. `lSpaces` (default `.T.`) also strips plain spaces. `lAcentos` (default `.T.`) also runs `FwNoAccent()`. `lAddress` (default `.F.`) — when `.F.`, also strips `,` and `-` (set `.T.` when cleaning a street address where those matter).

### `U_GwGetFileNameFromFullPath( cFullPath, cToken ) as character`
Returns just the filename from an absolute path. `cToken` (path separator) auto-detects OS via `GetRemoteType()` when omitted, and **caches** the detected token in a module `Static` for subsequent calls in the same process.

### `U_GwGZipDecomp( lDecode64, cZipped, cRetUnzipped ) as logical`
Decompresses a GZip payload (`gzStrDecomp`), optionally Base64-decoding first when `lDecode64` is `.T.`. `lDecode64` is **required** (no default — passing `nil` throws).

### `U_GwSearchStringInArray( aArray, cSearch, cIgnore, nRetResult ) as logical`
Case-insensitive search of `cSearch` in a flat string array, returning the 1-based position via `nRetResult` (by reference). `cIgnore` excludes a match if the found element's trimmed text is contained in `cIgnore`.

### `U_GwWipeSpaces( cString as character ) as character`
Collapses runs of double-spaces down to single spaces (loop until none remain), and normalizes `" "`/`' '` quoting artifacts to `""`/`''`.

## TReport

### `U_GwTReportStruct( jRetFields, cField, nOpc ) as variant`
Memoizes SX3 struct info per field into the caller-supplied `jRetFields` JSON (`type`/`length`/`decimal`/`picture`), then returns either the picture mask (`nOpc == 1`) or the display length appropriate for a `TReport()` column (`nOpc == 2`, computed from type: `C` → field length, `D` → 10, `N` → picture length).

## Utils

### `U_GwEvalModelError( oModel, cStyle, cTitle ) as logical`
Reads `oModel:GetErrorMessage(.T.)` and, if there's an error message, displays it via `FwAlertInfo`/`FwAlertError`/`FwAlertWarning` (per `cStyle`, default `"ALERT"`) with submodel/field/id detail appended. Returns `.T.` when the model had **no** error.

### `U_GwGetNumbering( cAlias, cField, cAliasSxe, nOrdem, lRunAsJob, cJobEmpresa, cJobFilial ) as character`
Wraps `GetSxEnum()` (the standard Protheus SX8 numbering control), with optional `StartJob` execution for cross-company/branch numbering. **See "Known Gotchas" in SKILL.md** — its required-parameter check looks inverted; treat the validation as unreliable and always pass both `cAlias` and `cField` explicitly.

### `U_GwConfirmNumbering()`
`ConfirmSx8()` — call after `U_GwGetNumbering()` once the numbered record has actually been persisted. (See the `Business/*` entities' `Confirmar<X>Id()` methods for the pattern.)

### `U_MGetEval( xContent as variant ) as variant`
Helper for standard-search (F3) fields configured to allow multi-select (`;`-separated); when the current `FunName()`/`ReadVar()` combination is registered in the module-level `cMVSource___`/`cMVMult___` privates, appends the newly picked value to whatever is already in the GET instead of replacing it.

### `U_GwRemoteType( nOpc as numeric ) as character`
Returns `"WINDOWS"`/`"LINUX"`/`"MAC"` (via `nOpc == 1`, default — uses the appserver LIB string, distinguishes Linux from Mac) or `"JOB"`/`"WINDOWS"`/`"UNIX"` (via `nOpc == 2` — cruder, doesn't distinguish Linux/Mac). Prefer the default unless you specifically need the coarser 3-way split.

### `U_GwRunExecAuto( aData, nOperation, cExecAuto, cSuccessExpression, lRunAsJob, cJobEmpresa, cJobFilial, cJobModule, cJobName, aJobTables ) as character`
The primitive behind `GwExecAuto:RunExecAuto()` — dynamically builds and calls `MsExecAuto()` with up to 10 positional args, handles the `lMsErroAuto`/`RollBackSx8`/`ConfirmSX8` dance, and returns `"SUCCESS[:<expr result>]"` or the `AutoGRLog` text on failure. Prefer using the `GwExecAuto` class instead of calling this directly — the class also manages the `Private lMsErroAuto` declaration your caller would otherwise need to set up by hand.

### `U_GwGetSequence( cCampo, cPrefixo, cFamilia, lReboot, lEmpCode ) as variant`
Convenience wrapper over `GwSequence`. `lEmpCode` (default `.T.`) prepends `cEmpAnt` to the family so counters are naturally scoped per company. Returns character or numeric depending on the field's SX3 type. Requires the `ZGS` dictionary — see `U_GwSequenceSchema()` below. Throws on invalid configuration instead of returning an empty/`nil` sequence; see `GwSequence` in classes-reference.md for the full list.

```advpl
U_GwGetSequence("B1_COD", "CHAPA", "ROCHAS", .T.)   // -> "CHAPA0000000001"
U_GwGetSequence("ZX_DOCPRD", "P2103", "", .T.)      // -> "P21030001"
```

### `U_GwSequenceSchema() as logical`
Creates/validates the `ZGS` dictionary (SX2/SX3/SIX) consumed by `GwSequence`, following the Metadata Pattern (`patterns.md#metadata-pattern`) with the service orchestration in the same file. Idempotent — `GwMetaData:CommitData()` only writes actual differences — so it is safe to call on every run. Reports failures through `oMessage_` when one is in scope, otherwise through its own `GwMessagingClass` instance. Lives next to the class, in `Sources/Library/Classes/Sequence/GwLibrarySequenceSchema.tlpp`.

```advpl
if U_GwSequenceSchema()
    cCodigo := U_GwGetSequence("B1_COD", "CHAPA", "ROCHAS")
endif
```

## Xml

### `U_GwGetXmlNodeLength( oObj as object, cNode as character ) as numeric`
For a deserialized XML object, returns `1` if `cNode` is a single object, or `Len(...)` if it's an array — normalizes the "XML parser gives you an object OR an array depending on cardinality" annoyance. Requires a `Private oXml` in scope (assigned internally) for the `Type()` macro trick to work.

### `U_GwGetXmlNodeObject( oObj, cNode, nPos ) as object`
Companion to the above: returns the object itself, or `array[nPos]` (default `1`) when the node is an array.

## MvcUtils (`Gworks.Library.MvcUtils` namespace)

### `U_GwSetGridCaption( nOpc, jParam, oStr ) as logical`
Adds a "legend/caption" virtual field to an MVC grid — `nOpc` `1` for `FwFormModelStruct()` (via `oStr:AddField(...)`, model-side signature) or `2` for `FwFormViewStruct()` (view-side signature). `jParam`: `cName`, `cOrder` (view only), `bInit`, `cTitle`, `cToolTip`. Always creates a virtual (`lVirtual := .T.`), non-key, non-required `C(50,0)` field with picture `@BMP`.

### `U_GwSetVirtualField( nOpc, jField, oStr ) as logical`
More general virtual-field helper — if `jField["cReference"]` matches a real SX3 field, inherits its title/type/size/decimal/picture/F3/combo from the dictionary; otherwise falls back to the explicit values in `jField` (`cTitle`, `cType`, `nLen`, `nDecimal`, `aCombo`, ...). `jField`: `cReference`, `cName`, `cSeq` (view only), `bValid`, `bWhen`, `bInit`, `cTitle`, `cTooltip`, `cType`, `nLen`, `nDecimal`, `lRequired`, `lCanChange`, `aCombo`. Same `nOpc` `1`/`2` split as `GwSetGridCaption`. Note the View branch (`nOpc == 2`) reads `SX3DIC->(...)` fields unconditionally even when `lRef` is `.F.` for a couple of properties (`cType`/`cPicture`/`cF3`) — make sure the dictionary alias is actually positioned when calling this in View mode with a non-reference field.
