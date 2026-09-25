---
name: advpl-tlpp-exec-sql-query
description: "Run a read-only SQL query (SELECT / WITH) against the Protheus database from a plain shell — no SmartClient, no VS Code, no human clicking — and read the result back as JSON. Drives Scripts/pth-query.sh (pth-query.ps1 on Windows) — first argument dev or prd picks Scripts/pth-settings.dev.json or pth-settings.prd.json — which writes the statement to a file in the client's temp directory, opens the Protheus WebApp headlessly (Scripts/pth-execute.mjs, Chromium/Chrome/Edge over CDP), runs the ConsultaSql template (namespace Gworks.Templates.ConsultaSql) and reads back consultasql-retorno.json. Also documents the REST alternative (POST /rest/GwConsultaSql/consultas). Use when the user says 'executar query', 'rodar SQL no Protheus', 'consultar o banco', 'ver os dados da tabela', 'como estão os dados', 'SELECT no Protheus', 'pth-query', 'ConsultaSql', 'run a query against Protheus', 'what does the data look like', or when an agent needs real table data to write or validate AdvPL/TLPP or SQL. Read-only: it never executes INSERT/UPDATE/DELETE."
license: Internal
metadata:
  domain: Protheus
  maintainer: Gworks - Giovani
  category: Build, Execution and Debugging Automation
  reference_module: Gworks.Templates.ConsultaSql (Sources/Templates/ConsultaSql)
  version: '1.0.0'
  status: "Linux flow was exercised against a live environment on 2026-09-23, under the previous namespace. After the 2026-09-24 renames/refactor the TLPP was NOT recompiled or re-run, the Windows scripts were never run, and the library's GwApiQuery direct mode (v1.1, brought into this repository on 2026-09-24) has not been compiled into any RPO yet. Read 'Known status' before running."
---

# Run a SQL query against Protheus from a shell

## Overview

An agent that writes AdvPL/TLPP or SQL needs to see what the data actually looks like. This skill closes that loop without a human: **statement in → JSON out**, through the `ConsultaSql` template in this repository.

```
Scripts/pth-query.sh dev|prd "<SQL>"             (pth-query.ps1 on Windows)
   │  writes  <client temp>/consultasql.sql
   ▼
Scripts/pth-execute.mjs   →  headless Chromium  →  Protheus WebApp
   │  ?E=<env>&P=Gworks.Templates.ConsultaSql.Apps.U_ConsultaSqlPostConsulta&A=RUNQUERY
   ▼
Apps → Controller → Service → (GwApiQuery) → database
   │  writes  <client temp>/consultasql-retorno.json      ← the agent reads THIS
   ▼
{"ok":true,"data":{"hasNext":false,"items":[ ... ]}}
```

| Piece | Where | Role |
| --- | --- | --- |
| `pth-query.sh` / `.ps1` | `Scripts/` | Writes the SQL file, calls `pth-execute.mjs` with the `RUNQUERY` sentinel |
| `pth-execute.mjs` | `Scripts/` | Runs a User Function through the WebApp with a headless browser |
| `pth-settings.dev.json` / `pth-settings.prd.json` | `Scripts/` | Server, port, environments, credentials — one server per file. The first argument of the scripts (`dev` / `prd`) picks the file |
| ConsultaSql module | `Sources/Templates/ConsultaSql/` | Apps (menu/IDE door), Api (REST door), Controller, Service, Functions |

Internals (layers, temp-file contract, the `l:` rule, why a screenshot is never the answer): [references/exec-sql-internals.md](references/exec-sql-internals.md).

## When to Use

- The user wants to **see or check data** in Protheus tables ("consulta essa tabela", "quantos registros tem…", "como está o dado do cliente X").
- You are writing or validating a query, `BeginSql`, or an entity and need real rows or real column names.
- You want to confirm a data-dependent behavior after a compile.

**Do NOT use when:**

- The statement writes (`INSERT`/`UPDATE`/`DELETE`/DDL). This route refuses anything that does not start with `SELECT ` or `WITH `, on purpose. Never work around it.
- You only need the dictionary structure of a table → use `data-dictionary-lookup`.
- You need to *author* the SQL from scratch → use `query-builder` first, then run the result here.

---

## CRITICAL — Agent Execution Rules

1. **Read-only.** Only `SELECT ` / `WITH `. Never try to smuggle a write through this route, never suggest exposing `U_GWQUPD` casually.
2. **NEVER open, `cat`, read or grep any `Scripts/pth-settings*.json`** (nor a file named by `PTH_SETTINGS`) — not even to list the `Scripts/` folder's contents. They hold the password in plain text. To see a configuration use `bash Scripts/pth-compile.sh dev -h` (or `prd -h`), which prints server and environments and never the password. Never ask the user for the password and never pass credentials on a command line.
3. **Always pass `dev` or `prd` as the first argument, and use `dev` by default.** Run with `prd` only when the user explicitly asks for production in this conversation. Before the first run of a session, check with `-h` which server/environment that file points to and say it in the report. This is the real database.
4. **Bound every query.** `TOP n` / explicit columns / a `WHERE` on the key, `D_E_L_E_T_ = ' '`, and `xx_FILIAL` (via `xFilial` logic) on branch-scoped tables. Never `SELECT *` on a large table.
5. **Treat results as business/personal data.** Show the minimum needed to answer; do not paste full dumps into chat, files or commits.
6. **`rm -f` the result file before every run**, then read it. A failed run leaves the previous result in place, and you would read stale data as fresh.
7. **Check `ok` before trusting `data`.** A failed statement still writes the file, with the database's own message in `detailedMessage`.
8. **One call at a time, ~5 s apart.** The result and SQL files have fixed names and the browser uses a fixed CDP port (9253); back-to-back runs also crowd the AppServer and fail in confusing ways.
9. **Never leave a browser running.** The script closes it through CDP; if a run is killed midway, tell the user a browser/session may have leaked — an agent's shell usually cannot kill it.
10. **Do not declare success from the exit code.** The script exits 0 whether or not a result arrived. The result file is the only signal.

---

## Known status (read before running — and update when it changes)

Verify each item; do not assume it still holds.

1. **The library must be the dual-mode `GwApiQuery` (v1.1) — in the source AND in the RPO.** The Service calls `U_GwApiQuery( cSql, @jDados )` (direct mode: no `oRest`, result returned in `jDados` as `{"data":[…]}` or `{"erro":true,"msg":…}`). Until 2026-09-24 this repository's `GwLibraryApiQuery.tlpp` was the older REST-only version (`User Function GwApiQuery()`), which made every query answer `500 "Resposta invalida da consulta."`. It was replaced byte for byte by v1.1, the copy used by a customer project (the only difference was the direct mode, in `GwApiQuery` and also in `U_GWQUPD` — which ConsultaSql does not use; the REST route `/gwquery/query` that the HTML reports consume behaves as before). **Nothing was compiled**: the RPO of the target environment still has whatever version was compiled last. Check the source, and compile the library where you will query:

   ```bash
   grep -n "^User Function GwApiQuery" Sources/Library/Classes/ApiQuery/GwLibraryApiQuery.tlpp
   #   expected: (cQuery as Character, jResult as Json)      — if it shows "()", the old library is back
   bash Scripts/pth-compile.sh dev Sources/Library/Classes/ApiQuery   # env_default (see the compile skill)
   ```
   If a query answers `500 "Resposta invalida da consulta."`, the RPO of that environment still has the old library. **Tell the user before the first run** that the library and the module must both be compiled there.
2. **Refactor not yet run.** On 2026-09-24 the module moved from `Applications.ConsultaSql` to `Gworks.Templates.ConsultaSql` (files `GwTemplate*`, class `GwConsultaSqlApi`, route `/GwConsultaSql/consultas`) and the temp-path logic moved into `U_ConsultaSqlTempFile`. It has not been compiled or executed since. The first run is also the first test.
3. **The old version may still live in the RPO** if it was compiled before: old namespace and old route stay live (they execute SQL) until removed by the user.
4. **Windows is unvalidated.** `pth-query.ps1` / `pth-execute.mjs` browser lookup were never run on Windows. When the user is on Windows, point them to the validation script at the top of each `.ps1` and ask for the output — do not claim it works.
5. **Controller environment defaults are inherited from another project:** company `01`, branch `04`, module `PCP` (used only when the thread has no environment yet). Adjust for the target environment (`jRpc`), or a branch-scoped query hits the wrong branch. An invalid branch answers *"Muitos usuários"* — it looks like a license problem and is not.
6. **The effective REST URL is unconfirmed** (see "REST alternative").
7. **`dev` and `prd` may point to the same place.** On 2026-09-25 both files showed the same server (`minerasul215598.protheus.cloudtotvs.com.br:10214`) and the same `env_default` (`CQSLH5_GWORKS`). Check both with `-h`; do not assume `prd` is a different environment, and do not assume `dev` is safe from production.
8. **The `.sh` scripts have no execute bit** (the repository sits in a Google Drive folder). Call them as `bash Scripts/pth-query.sh …`.

---

## Procedure

### 1 — Check the setup (read-only)

```bash
bash Scripts/pth-compile.sh dev -h | sed -n '/^Configuracao/,/^Exemplos/p'
```

Expect the path of `pth-settings.dev.json`, a real `servidor` and an `env_default`. `(nao foi possivel ler …)`, `0.0.0.0:0` or an empty `env_default` means that file is missing or unfilled: ask the user to create/fill it (never fill it yourself, never read it). Then walk the "Known status" checks.

Without `dev`/`prd` the scripts fall back to `PTH_SETTINGS` and then to `Scripts/pth-settings.json`, which does not exist in this repository — so always pass one of the two.

Prerequisites on the machine: **Node.js 20+** (the script passes `--experimental-websocket`), a **Chromium/Chrome/Edge** (`PROTHEUS_BROWSER` to point at one), and the Protheus **WebAgent** running on port 21021 in a version compatible with the AppServer build.

### 2 — Make sure the module is in the RPO of the environment you will query

The function runs in `env_default` (or `PROTHEUS_ENV`) of the chosen settings file. Compile there first, with the `advpl-tlpp-compile` skill (Route B), using the same `dev`/`prd` you will query with:

```bash
bash Scripts/pth-compile.sh dev Sources/Templates/ConsultaSql        # env_default of pth-settings.dev.json
```
Each environment has its own RPO — compiling into one does not publish to another.

### 3 — Write the statement

- Must start with `SELECT ` or `WITH ` **followed by a space** (case-insensitive). A newline right after `SELECT`, a leading comment (`-- …`) or anything else is refused with `400 "Esta rota executa apenas consulta."`. Keep `SELECT ` and the first column on the same line.
- Use the database dialect of that environment (check the DBMS; do not assume).
- Paging does not exist (`hasNext` is always `false`): limit in the SQL itself.

### 4 — Run

```bash
rm -f /tmp/consultasql-retorno.json
bash Scripts/pth-query.sh dev "SELECT TOP 3 A1_COD, A1_NOME FROM SA1010 WHERE D_E_L_E_T_ = ' '" consulta 30
```
`pth-query.sh dev|prd "<SQL>" [label] [seconds]` — or `pth-query.sh dev|prd -f file.sql [label] [seconds]` to read the statement from a file (best for anything long or quote-heavy). `dev`/`prd` must be the **first** argument; the script prints `config : <file>` — confirm it is the one you meant.

**Pass a short timeout.** This route draws no window, so the script cannot detect completion by itself and waits the whole timeout (default 180 s) unless the session dies. 20–30 s is plenty for a simple query; raise it for heavy ones. Run it in the background and poll for the file if you prefer.

Another environment of the same file: `PROTHEUS_ENV=rest bash Scripts/pth-query.sh dev …` (a role — `default`, `rest`, `workflow`, `job` — or a name listed in `environments`).

**Windows (unvalidated — see Known status #4):**
```powershell
Remove-Item "$env:TEMP\consultasql-retorno.json" -ErrorAction SilentlyContinue
.\Scripts\pth-query.ps1 dev "SELECT TOP 3 A1_COD FROM SA1010 WHERE D_E_L_E_T_ = ' '" consulta 30
```
The `.ps1` sets `PTH_SETTINGS` only while `node` runs and restores the previous value afterwards, so the choice does not leak into the user's PowerShell session.

### 5 — Read the result

The file is on the **client** (the machine that ran the script), in its temp directory: `/tmp/consultasql-retorno.json` on Linux, `%TEMP%\consultasql-retorno.json` on Windows.

```bash
jq '.ok, .data.items' /tmp/consultasql-retorno.json          # or: jq -r '.message, .detailedMessage'
```
Parse it; do not eyeball it. For arithmetic across rows use `jq` or `python3 -c`.

```jsonc
{"ok":true,"data":{"hasNext":false,"items":[{"A1_COD":"000001","A1_NOME":"..."}]}}
{"ok":false,"status":400,"message":"...","detailedMessage":"..."}      // failure envelope
```

### 6 — Report

Say which server/environment ran, the statement, row count and the relevant rows — nothing more. If it failed, quote `message` and `detailedMessage` and use the table below.

---

## What you see → what it means

| Symptom | Meaning | Action |
| --- | --- | --- |
| `400 "Esta rota executa apenas consulta."` | Statement does not start with `SELECT ` / `WITH ` (space required; comments and newlines first are refused) | Fix the SQL |
| `400 "Nao foi possivel ler a consulta do arquivo."` + `Arquivo vazio ou inexistente: <path>` | The Service looked for the SQL at `<path>` and found nothing: wrong machine/dir or the script wrote elsewhere | Compare `<path>` with where the script wrote (`sql : …` line). See internals: temp-file contract, `PROTHEUS_SQL_PATH` |
| `400 "Nao foi possivel executar a consulta."` | The database rejected it; `detailedMessage` is the database's own message | Fix the SQL (invalid column, syntax…) |
| `500 "Resposta invalida da consulta."` | Known status #1: the RPO of this environment still has the old REST-only `GwApiQuery` | Compile `Sources/Library/Classes/ApiQuery` into that environment (with the user's OK), then retry |
| Script prints `SESSAO ENCERRADA pelo servidor` | Fatal AdvPL error killed the session (the browser tab closed). **It is not a hang.** Invalid SQL built by string concatenation is the typical cause | Read the AppServer console/ConOut; do not "optimize" the query |
| Script ends with `nada detectado` and **no result file** | Session never ran the function: module not compiled in this environment, function not in the AppMap on the **first** call (no `using namespace` at the caller — an AppServer limitation; run again and see if the second attempt works), license server down, or WebAgent problem | Open the printed screenshot; check ConOut for `InterFunctionCall: cannot find function U_… in AppMap` |
| Screen stuck on *"Programa Inicial: SIGAMDI"* / *"Ambiente no servidor"* | **Normal** when a result file arrives — the routine never opens a window. If NO file arrives, the session may not have started (license), and `E=`/`P=` are ignored | Judge by the file, not the screen |
| `Falha ao conectar com o WebAgent` / `Acesso nao autorizado ao WebAgent` | WebAgent not running on 21021, or incompatible with the AppServer build (no browser flag fixes it) | The user must fix the agent |
| `Arquivo de configuracao nao encontrado: …/pth-settings.<dev\|prd>.json` | That settings file does not exist | Ask the user to create it (never create or read it yourself) |
| `Ambiente desconhecido…`, `Preencha em …` (from the script) | Configuration | `bash Scripts/pth-compile.sh dev -h` (or `prd`); ask the user to fix the file |
| `Nenhum navegador … encontrado` | No Chromium/Chrome/Edge in the usual places | Set `PROTHEUS_BROWSER` |
| Result file has old data | You skipped `rm -f` | Rule 6 |
| Accented text makes the JSON fail (`toJson()` error) | Protheus is CP1252, JSON is UTF-8; one accented field can kill the whole response (observed in another project; not yet checked here) | Select fewer/other columns; the durable fix is `EncodeUTF8()` in the library's row formatting |

---

## REST alternative (no browser, no file)

The same rule answers as a real REST route — `@Post("/GwConsultaSql/consultas")` in `GwTemplateConsultaSqlApi.tlpp`. Body `{"query":"SELECT …"}`; reply `{"hasNext":false,"items":[…]}` straight in the HTTP body.

- **URL.** The REST server appends the annotation to its own base path (`/rest/`), so it should be `http://<ip>:<rest-port>/rest/GwConsultaSql/consultas`. **Unconfirmed for this route.** Judge a wrong URL by the status: **404** = no route registered there (URL wrong); **500** = the route exists and the handler failed.
- **Port.** The REST Server port is *not* the `port` of the settings file (that one is the AppServer/WebApp port), and the REST runs in its own environment (`env_rest`).
- **Auth.** Basic auth with the same user/password as the settings file. Build it inside a shell command without printing it: `AUTH=$(printf '%s' "$(jq -r '"\(.user):\(.password)"' Scripts/pth-settings.dev.json)" | base64 -w0)` — never `echo` it.
- **`tenantId: <company>,<branch>` header** selects company and branch (branch codes have the length of the ERP's branch field). Without it the thread gets *a* default and a query scoped by branch quietly runs against the wrong one — a `200` with empty `items`, which reads as "no data".
- **Send the body from a file** (`--data-binary @body.json`); mixed quotes on the command line break and can send an empty body.
- **Compile into the environment REST runs** (`bash Scripts/pth-compile.sh dev -e rest …`). On this project's server (current binaries, user-confirmed 2026-09-24) no restart is needed: the REST service serves the new code **by itself within up to 120 seconds**. Until then the old code (or alternating `200`/`500`) may answer — wait about 2 minutes and hit the route several times before believing any single answer. Only if the old code is still served after that is a restart worth raising (it belongs to the user; older builds needed one).
- **Security:** this endpoint runs SQL that arrives from outside and exposes unrestricted read access to anyone who can reach it. Authentication is the REST Server's (appserver.ini), not the code's. Do not publish it without that decision made.

---

## Anti-patterns

- Reading or printing any `Scripts/pth-settings*.json`, or asking the user for the password.
- Running with `prd` without the user explicitly asking for production, or omitting `dev`/`prd` (the fallback `pth-settings.json` does not exist).
- Sending SQL in the URL (`&A=<SELECT …>`): needs escaping, hits URL limits, lands in every access log. Use the file + `RUNQUERY` sentinel — which is what the script already does.
- Relying on a screenshot for the result. AdvPL windows are pixels, not DOM, and a big result is cropped. The JSON file is the answer.
- Running without `rm -f` on the result file, or two runs at once.
- Leaving the default 180 s timeout on a simple query.
- Optimizing a query after `SESSAO ENCERRADA` — it is a crash, not slowness.
- Assuming `SELECT *` on a big table, an unbounded scan at peak hours, or a correlated subquery inside an aggregate (rewrite with a join / pre-aggregation).
- Treating a compile as proof the query works: column names inside SQL strings only meet the database when the query runs.
- Declaring the Windows scripts working without the user's run of the validation script.
