# exec-sql-query internals

Reference for the `advpl-tlpp-exec-sql-query` skill. Read it when a run misbehaves or when you need to change the module. Everything here was read from the code in this repository unless it says **observed elsewhere** (learned in another project's live environment and not re-checked here).

## Layers (`Sources/Global/Gworks/Templates/ConsultaSql/`)

| File | Namespace | Role |
| --- | --- | --- |
| `Apps/GwTemplateConsultaSqlApps.tlpp` | `…ConsultaSql.Apps` | Menu/IDE door: `U_ConsultaSqlPostConsulta( xParam )`. Resolves the enum and calls the Controller |
| `Api/GwTemplateConsultaSqlApi.tlpp` | `…ConsultaSql.Api` | REST door: class `GwConsultaSqlApi`, `@Post("/GwConsultaSql/consultas")`. Reads the body, translates the result into status/envelope. No business rule here |
| `Controllers/GwTemplateConsultaSqlController.tlpp` | `…Controllers` | `U_ConsultaSqlController( nOpc, xParam, jRpc )`: prepares the environment, dispatches to the Service, and (with an interface) writes the result file |
| `Services/ExecutarService/…ExecutarService.tlpp` | `…Services` | `U_ConsultaSqlExecutarService`: validation, `RUNQUERY` file read, the `SELECT`/`WITH` rule, the `{ok,data}` envelope |
| `Common/Functions/…Functions.tlpp` | `…Functions` | Envelope helpers (`Ok`, `Erro`, `Colecao`, `FalhaInesperada`, `Texto`, `ParamTexto`) and `U_ConsultaSqlTempFile` |
| `Enums/…Enums.tlpp` | `…Enums` | Action enum (`Executar`) |

Both doors resolve the enum and call the Controller; **the rule lives in the Service** so the IDE door cannot go around a restriction the HTTP door enforces. All namespaces are `Gworks.Templates.ConsultaSql.*`.

The Service delegates the actual query to `U_GwApiQuery` (`Sources/Global/Gworks/Library/Classes/ApiQuery/GwLibraryApiQuery.tlpp`, namespace `Gworks.Library.Classes`) in its **direct mode**: `U_GwApiQuery( cSql, @jResult )` runs with no `oRest` (which only exists inside a REST request) and fills `jResult` with `{"data":[…]}` on success or `{"erro":true,"msg":…}` on failure, in both modes; called with no parameters it is the REST route `POST /gwquery/query` that the HTML reports consume (library v1.1 — see "Known status" in the skill: it must be the version compiled in the RPO). `U_GWQTOJSON(cSql)` in the same file is the public function that runs a `SELECT` through `TCQUERY` and returns `{"data":[…]}` (dates as `dd/mm/yyyy` strings, numerics as-is, text `AllTrim`med).

## The temp-file contract

| File | Written by | Read by | Name |
| --- | --- | --- | --- |
| Statement | the script (`pth-query.*`) | the Service (`MemoRead`) | `consultasql.sql` |
| Result | the Controller (`MemoWrite`) | the agent | `consultasql-retorno.json` |

Names are fixed on purpose: the reader is a script outside Protheus that must know the path *before* the call. The price is that two runs overwrite each other — fine for debugging, one call at a time. `pth-query` deletes the result file before each run, so a failed run never leaves the previous result to be read as fresh, and in launch mode its appearance is the completion signal.

The **directory** is computed in one place, `U_ConsultaSqlTempFile( cName )` (`Functions`):

| Client OS | Result of `U_ConsultaSqlTempFile("x")` |
| --- | --- |
| Linux / Unix | always `l:/tmp/x` |
| Windows | `GetTempPath()` + `x` — `C:\Users\…\Temp\x` *(assumed — not yet confirmed)* |

Rules it applies: the **format** of `GetTempPath()` tells the OS — starting with `/` (or `l:/`) is Unix, anything else Windows (`L:\…` is a Windows drive, not the prefix). On Unix the **value** of `GetTempPath()` is not used: WebApp 10.2.1 returns `l:` + the WebApp's per-user folder **on the server** (`l:/…/webapp/user/<session>/`, a WebApp bug removed in 10.2.2), which does not exist on the client — so the directory is fixed to `/tmp/`, where `pth-query.sh` writes and reads. On Windows a trailing separator is added when missing. The OS does not come from `GetRemoteType()`/`U_GwRemoteType` (a second source of truth, and `U_GwRemoteType` throws when it cannot classify the client). The function is meant for calls **with a client** (menu, WebApp); a REST/job thread has no client disk for `l:` to point at.

### The `l:` prefix chooses the MACHINE, not the syntax

TDN's names are the opposite of what they suggest:

| Form | TDN calls it | Where it actually goes |
| --- | --- | --- |
| `l:/tmp/x` (Linux), `c:\tmp\x` (Windows) | **absolute** | the **client** — the machine that made the call |
| `/tmp/x`, no prefix | **relative** | the **server**, under its `Protheus_Data` |

Get it wrong and **there is no error**: the write silently lands inside the server's `Protheus_Data`, and the read returns empty — "file not found" for a file sitting exactly where you put it. When the result does not appear, the Controller's `ConOut` (`[ConsultaSql] retorno gravado em: <path>`) tells you which machine and path were used; the Service error `Arquivo vazio ou inexistente: <path>` does the same for the statement.

Because the agent driving the browser *is* the client, this turns two hard problems into non-problems: the JSON arrives complete on the agent's own disk (no cropped screenshot), and a large SQL never travels in the URL.

`PROTHEUS_SQL_PATH` overrides where the script writes; the Service still only looks at `U_ConsultaSqlTempFile("consultasql.sql")`, so the override is only useful when the client's real `GetTempPath()` is not `/tmp/`.

## How `pth-execute.mjs` runs a User Function

The AppServer publishes the SmartClient WebApp on the same port as the TCP driver:

```
http://<ip>:<port>/webapp/?E=<ENVIRONMENT>&P=<program>&A=<arg1>&A=<arg2>&M=1
```

`E` = environment (exactly as in `appserver.ini`), `P` = program — accepts a **fully-qualified namespace function** (`Gworks.Templates.ConsultaSql.Apps.U_ConsultaSqlPostConsulta`), `A` = **one positional argument; repeat the key for more** (not a comma-separated list), `M=1` = no menu. Call the function directly; do **not** route through `U_GMNUEXEC` (it is for routines with a UI, calls `RpcSetEnv` itself and burns a second license — observed elsewhere to fail where the direct call worked). The scheme is `https` when the settings file has `"https": true`; an https-only WebApp answers plain `http` with an empty response (`ERR_EMPTY_RESPONSE`).

The page must reach a **WebAgent** on `127.0.0.1` before `E=`/`P=` take effect — the file reads/writes with `l:` go through it. Without it the page shows *"TOTVS WebAgent … INSTALAR"* or *"Falha ao conectar com o WebAgent!"*, falls back to *Programa Inicial* and the program never runs. The ConsultaSql Controller also checks it itself: with an interface and `GetWebAgentInfo()[1]` empty it shows *"Ligue o WebAgent para o ambiente <env> e execute novamente."*, logs `[ConsultaSql] WebAgent desativado na sessao …` and returns without running (same check as `U_gMnuExec`).

### "Agente Local" — the setting a fresh browser profile does not have

Connecting to the agent is not enough. The WebApp's gear option **"Agente Local"** (Habilita/Desabilita o Agente Local) lives in the browser's `localStorage` for that origin, under the key **`desktopagentport`** (the port): present = on, absent = off. With it off, **every `l:` path goes to the server's disk even with the agent connected** — `ExistDir("l:/tmp")` is `.T.` (the server also has `/tmp`), `File()`/`MemoRead()` of a client file give `.F.`/`""`, the SQL is never read and the result never written. A user's everyday browser has it on; a throwaway profile never does.

So, in both modes, `pth-execute.mjs` first loads the WebApp start page (`<base>/webapp/`, no `P=`), sets `localStorage.desktopagentport` to the agent's port, and only then opens the program URL. The run prints `agente : porta <n> (Agente Local ligado)`.

Other WebApp keys seen in `localStorage` (10.2.1): `desktopagentdontshow`, `language`, `viewmode`, `x:\smartclient.ini.*`. The source of truth is the WebApp bundle (`resources/js/webapp-<ver>-frontend.min.js`: `DesktopAgentPort`, `setPort`/`clearPort`).

### Launch mode (`launch_by_webagent: true`)

```
<webagent> launch "<url>" --browser <wrapper>
```

- `web-agent launch` starts an agent dedicated to that page on a **random port** and calls the browser with the URL plus `agent-started=launch&agent-port=<port>`; the page connects to `wss://127.0.0.1:<port>/agent`.
- Given a real browser executable, the WebAgent opens the URL **in the user's already-open browser session** (a new tab on their screen — "Opening in existing browser session"). So `pth-execute.mjs` writes a **wrapper** into its output dir (`navegador.sh`; `navegador.cmd` on Windows) and passes it as `--browser`. The wrapper **saves the launch arguments** to `launch-args.txt` and starts the settings `browser` on `about:blank`: `--headless=new`, a throwaway `--user-data-dir`, CDP on 9253, `--ignore-certificate-errors --allow-insecure-localhost` and `--disable-features=LocalNetworkAccessChecks`.
- The script reads the URL from `launch-args.txt`, takes its `agent-port`, turns on the "Agente Local" with that port, then opens that URL.
- `LocalNetworkAccessChecks` off: the page is public https and the agent is loopback, so current Chromium treats it as local-network access and asks the user for permission; headless has nobody to accept and the WebSocket fails with `net::ERR_BLOCKED_BY_LOCAL_NETWORK_ACCESS_CHECKS`.
- Completion is the file named by `PROTHEUS_WAIT_FILE` appearing (`pth-query` passes the result file and deletes it beforehand). Exit `0` when it appears, `2` after the limit.
- At the end the script closes the browser through CDP (`Browser.close`, trying `127.0.0.1` and `[::1]` — Edge may listen on either) and kills the `web-agent launch` process, which otherwise stays listening on its random port.

### Direct mode (`launch_by_webagent: false`)

The script drives the settings `browser` headless over CDP (same flags, including `LocalNetworkAccessChecks` off), turns on the "Agente Local" with `webagent_port` from the settings file (default 21021) and opens the program URL. The **user's own WebAgent** must be running on that port. Completion is detected by screenshot (below), so the script waits the whole limit for a routine that draws no window — prefer launch mode for ConsultaSql.

### Debugging a run

While the browser is still open (launch: kill the script before its end, or reproduce by hand with a wrapper that keeps CDP on another port), attach to `http://127.0.0.1:<cdp>/json/list`, enable `Runtime`/`Log`/`Network`, reload, and read the console and the `…/agent` WebSocket events. Useful signatures: `Desktop Agent Connected` + `Handshake sucessful` = agent fine; `ERR_BLOCKED_BY_LOCAL_NETWORK_ACCESS_CHECKS` = flag missing; agent fine but no file = "Agente Local" off or the SQL path wrong. In the AdvPL debugger: `U_ConsultaSqlTempFile` must return `l:/tmp/…`, and `File("l:/tmp/consultasql.sql")` must be `.T.`.

**Why a screenshot is never the answer.** AdvPL windows are drawn as pixels, not DOM: walking frames for `innerText` returns nothing while a dialog sits visible in the image. The script therefore detects "a window appeared" by screenshot size (blank ≈ a few KB; a window jumps several-fold) — and this route never draws a window, so that detector never fires and the script waits the full timeout. The WebAgent's own toasts ("Tentando se conectar…", "Acesso nao autorizado…") jump the size exactly like a result window; unlike AdvPL windows they reach the DOM as text, and the script matches that text and keeps waiting.

**Hang vs crash** — by what happens to the CDP session:

| Symptom | Meaning |
| --- | --- |
| Blank, CDP still answers | Still running (slow query, or waiting on a modal) |
| Blank, CDP throws `Not attached to an active page` | **Fatal AdvPL error** — the AppServer tore the session down. The script prints `SESSAO ENCERRADA` |
| A window appears | Result or error dialog: screenshot it |

Modal windows cannot be dismissed with the keyboard (the canvas never takes focus), so an automated run must never wait on a dialog.

**Cleanup.** Every headless run consumes an AppServer session that only drops on inactivity timeout, and the page auto-reconnects. The script ends with CDP `Browser.close` *before* killing the process; a browser left alive reopens its session when the service restarts and consumes a license again.

**Pacing** (observed elsewhere): ~5 s between two runs, ~30 s between two compiles (the RPO stays locked after a session closes — `COMPILEERROR-300`). `pth-compile` already retries the lock; the 5 s between runs is on the caller.

## Environment inside the Controller

`fSetEnvironment( jRpc )` calls `RpcSetEnv` **only when no environment exists** (`cFilAnt` empty) and the call did not come through `U_GMNUEXEC`; with a valid environment (ERP menu, or REST with `PrepareIn`) it touches nothing — preparing twice is worse than not preparing. Defaults when it does prepare: company `01`, branch `04`, module `PCP`, routine `ConsultaSql` — inherited from another project, adjust them. In 12.1.2510, REST and job threads arrive with the environment already prepared; calling `RpcSetEnv` there breaks the request.

The Controller writes the result file only when there is an interface (`!isBlind()`); a REST call returns through the HTTP body instead. `cVarMode` is `"file"` (default, useful) or `"print"` (opens the pixel dialog, cropped for large results).

## Traps that cost real time (all observed elsewhere unless noted)

- **`User Function` inside a `namespace` is global, but the AppServer has a limitation on its first call.** Called by its bare `U_` name from code with no `using namespace <that one>`, the **first** call compiles cleanly and fails at runtime with `InterFunctionCall: cannot find function U_X in AppMap`; later calls work (a job declared under a namespace behaves the same). It looks exactly like "the source was not compiled". Call again — if the second attempt works, that is it — and compare the `using` clauses of the file that works against the one that does not before recompiling anything. The Service carries the `using namespace` for `U_GwApiQuery` because of this.
- **Wrong branch → "Muitos usuários".** `RpcSetEnv` with a non-existent branch answers as if it were a license problem. Check the branch code length first.
- **`select("")` returns the current work area, not 0.** In a `catch`, `if select(cAlias) > 0` with an empty alias closes an area that was never opened and raises a new exception that **replaces the original**. Guard with `!empty(cAlias) .and.`.
- **A `Local` initializer runs at function entry**, before any `Private` declared further down: `Local x := !lBlind_` reads a variable that does not exist yet. Declare with a literal and assign after the `Private`.
- **A `Static` "initialize once" guard around `Private` declarations works for the first call of each thread only** (Private is dynamic scope; Static survives the return). Fine on a menu routine, breaks on the second request of a REST pool thread. Create the Privates on every call.
- **JSON vs encoding.** Protheus is CP1252, JSON is UTF-8: one accented database field makes `toJson()` fail without naming the field. Wrap strings with `EncodeUTF8()`.
- **"Servidor de licencas nao esta respondendo"** is a whole-server condition, not a bug in what you just touched — with no license the session never starts and the WebApp falls back to *Programa Inicial*, so `E=`/`P=` look ignored. It can follow right after a compile and make the compile look guilty. Isolate before blaming the change.
- **A nightly backup makes everything look like a performance bug you just introduced.** Check the server is idle first.
- **Query shape.** A correlated subquery runs once per row; aggregate first and join by key. Drive a join from the small set. SQL Server rejects an aggregate over a correlated subquery — use `LEFT JOIN … SUM(CASE WHEN …)`. Branch-scoped tables (e.g. exclusive `SB1`) need their branch filter spelled out: the same code can be a different product in another branch.

## Dead ends already proven (observed elsewhere — do not re-explore)

| Attempt | Verdict |
| --- | --- |
| `advpls cli` with `action=run` / `action=execute` | `[ERROR] Invalid action` — the CLI only builds, patches and defrags the RPO |
| `advpls appre` | It is the preprocessor (`-I`, `-D`, `-O`) |
| SmartClient desktop from a shell | Discontinued; prints nothing and exits |
| `code --command …` | The VS Code CLI cannot fire palette commands |
| Routing the call through `U_GMNUEXEC` | Failed where the direct call worked; burns a second license |
| Dismissing modals with `Enter`/`Escape` over CDP | The canvas never takes keyboard focus |
