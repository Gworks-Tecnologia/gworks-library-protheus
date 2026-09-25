---
name: advpl-tlpp-exec-sql-query
description: "Run a read-only SQL query (SELECT / WITH) against the Protheus database from a plain shell — no SmartClient, no VS Code, no human clicking — and read the result back as JSON. Drives Scripts/pth-query.sh (pth-query.ps1 on Windows), configured by Scripts/pth-settings.json (or Scripts/pth-settings.<suffix>.json when a suffix is passed as first argument), which writes the statement to a file in the client's temp directory, opens the Protheus WebApp in an isolated headless browser (launched through the WebAgent's `launch` command when launch_by_webagent is true), runs the ConsultaSql template (namespace Gworks.Templates.ConsultaSql) and reads back consultasql-retorno.json. Also documents the REST alternative (POST /rest/GwConsultaSql/consultas). Use when the user says 'executar query', 'rodar SQL no Protheus', 'consultar o banco', 'ver os dados da tabela', 'como estão os dados', 'SELECT no Protheus', 'pth-query', 'ConsultaSql', 'run a query against Protheus', 'what does the data look like', or when an agent needs real table data to write or validate AdvPL/TLPP or SQL. Read-only: it never executes INSERT/UPDATE/DELETE."
license: Internal
metadata:
  domain: Protheus
  maintainer: Gworks - Giovani
  category: Build, Execution and Debugging Automation
  reference_module: Gworks.Templates.ConsultaSql (<lib>/Templates/ConsultaSql)
  version: '1.0.0'
  status: "Linux flow confirmed end to end on 2026-09-25 against CQSLH5_GWORKS (WebApp 10.1.8, WebAgent 1.0.24) and CQSLH5_PROD (WebApp 10.2.1, WebAgent 1.1.1), with Edge headless, in both modes. Windows scripts never run."
---

# Run a SQL query against Protheus from a shell

## Overview

An agent that writes AdvPL/TLPP or SQL needs to see what the data actually looks like. This skill closes that loop without a human: **statement in → JSON out**, through the `ConsultaSql` template in this repository.

```
bash Scripts/pth-query.sh [suffix] "<SQL>"                (pth-query.ps1 on Windows)
   │  writes  <client temp>/consultasql.sql, removes the old consultasql-retorno.json
   ▼
Scripts/pth-execute.mjs
   │  launch_by_webagent = true:
   │    <webagent> launch "<url>" --browser <wrapper>
   │    wrapper = the settings "browser", headless, throwaway profile (never the user's session)
   │  launch_by_webagent = false:
   │    the settings "browser", headless, driven over CDP
   ▼
Protheus WebApp  ?E=<env>&P=Gworks.Templates.ConsultaSql.Apps.U_ConsultaSqlPostConsulta&A=RUNQUERY&M=1
   ▼
Apps → Controller → Service → (GwApiQuery) → database
   │  writes  <client temp>/consultasql-retorno.json      ← the agent reads THIS
   ▼
{"ok":true,"data":{"hasNext":false,"items":[ ... ]}}
```

| Piece | Where | Role |
| --- | --- | --- |
| `pth-query.sh` / `.ps1` | `Scripts/` | Picks the settings file, writes the SQL file, removes the old result, calls `pth-execute.mjs` with the `RUNQUERY` sentinel and the result file to wait for |
| `pth-execute.mjs` | `Scripts/` | Runs a User Function through the WebApp, by one of the two modes above |
| `pth-settings.json` / `pth-settings.<suffix>.json` | `Scripts/` | One server per file: server, credentials, environments, WebApp and browser settings (schema in the compile skill's [pth-cli-reference.md](../advpl-tlpp-compile/references/pth-cli-reference.md)) |
| ConsultaSql module | `<lib>/Templates/ConsultaSql/` | Apps (menu/IDE door), Api (REST door), Controller, Service, Functions |

`<lib>` is the Gworks library root: `Sources/Global/Gworks` in a client project, `Sources` in the `gworks-library-protheus` repository. Check which one exists before running any command below.

Internals (layers, temp-file contract, the `l:` rule, how both run modes work): [references/exec-sql-internals.md](references/exec-sql-internals.md).

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
2. **NEVER open, `cat`, read or grep any `Scripts/pth-settings*.json`** (nor a file named by `PTH_SETTINGS`). They hold the password in plain text. To see a configuration use `bash Scripts/pth-compile.sh [suffix] -h`, which prints everything except the password. Never ask the user for the password and never pass credentials on a command line. Change a settings file only when the user asks, with `jq` adding/removing keys, never printing the file.
3. **Pick the configuration deliberately.** No suffix = `Scripts/pth-settings.json`; `bash Scripts/pth-query.sh <suffix> …` = `Scripts/pth-settings.<suffix>.json`. Before the first run of a session, read `-h` of that file and say in the report which file, server and environment ran. This is the real database.
4. **`production_database: true` means production.** Before the first run against such a configuration, confirm with the user in this conversation. The scripts do not enforce it — you do.
5. **Run outside the agent sandbox.** The run talks to the WebAgent on `127.0.0.1` and starts processes (`web-agent`, the browser); inside the sandbox it fails in misleading ways.
6. **Bound every query.** `TOP n` / explicit columns / a `WHERE` on the key, `D_E_L_E_T_ = ' '`, and `xx_FILIAL` (via `xFilial` logic) on branch-scoped tables. Never `SELECT *` on a large table.
7. **Treat results as business/personal data.** Show the minimum needed to answer; do not paste full dumps into chat, files or commits.
8. **Check `ok` before trusting `data`.** A failed statement still writes the file, with the database's own message in `detailedMessage`.
9. **One call at a time, ~5 s apart.** The SQL and result files have fixed names and the browser uses a fixed CDP port (9253).
10. **Never leave a browser or agent running.** The script closes both at the end; if a run is killed midway, check `pgrep -af "web-agent launch"` and `ss -ltnp | grep 9253` and close what the run left (only processes the run started — never the user's own WebAgent on 21021 or their browser).

---

## Known status (read before running — and update when it changes)

1. **Confirmed working in both environments** (2026-09-25), `pth-query.sh` with Edge headless and nothing opened in the user's session:

   | Settings | Server | WebApp | WebAgent | Result |
   | --- | --- | --- | --- | --- |
   | `dev` → `CQSLH5_GWORKS` | `minerasul215598…:10214` | 10.1.8 | 1.0.24 | `ok: true`, ~13 s |
   | `prd` → `CQSLH5_PROD` | `minerasul215597…:10064` | 10.2.1 | 1.1.1 | `ok: true`, ~8–9 s |

   The module and the dual-mode `GwApiQuery` (v1.1: `U_GwApiQuery( cSql, @jDados )`, no `oRest`) are compiled in both. Another environment has its own RPO — check the library signature and compile both if needed:

   ```bash
   grep -n "^User Function GwApiQuery" <lib>/Library/Classes/ApiQuery/GwLibraryApiQuery.tlpp
   #   expected: (cQuery as Character, jResult as Json)
   bash Scripts/pth-compile.sh <suffix> <lib>/Library <lib>/Templates/ConsultaSql
   ```
2. **Both modes work** (`launch_by_webagent` true or false), because `pth-execute.mjs` turns on the WebApp's **"Agente Local"** in the throwaway browser profile before opening the program (the `desktopagentport` key — see internals). Without it, a fresh profile sends every `l:` path to the **server's** disk even with the agent connected, and the query silently never runs.
3. **The WebAgent version follows the WebApp of each environment**: WebApp 10.2.0 or later requires WebAgent 1.1.x (JWT handshake); below that, 1.0.x. Here: `dev` uses `/opt/web-agent/1.0.24-x64/opt/web-agent/web-agent`, `prd` uses `/opt/web-agent/web-agent` (1.1.1). Never suggest changing the version as a fix without checking the WebApp version and asking the user.
4. **An older copy of the module may live in some RPO** under the namespace `Applications.ConsultaSql`: it stays live (it executes SQL) until removed by the user.
5. **Windows is unvalidated.** `pth-query.ps1`, the `.cmd` browser wrapper that `pth-execute.mjs` writes on Windows and the browser lookup were never run there. Point the user to the validation script at the top of each `.ps1` and ask for the output — do not claim it works.
6. **Controller environment defaults are inherited from another project:** company `01`, branch `04`, module `PCP` (used only when the thread has no environment yet). Adjust for the target environment (`jRpc`), or a branch-scoped query hits the wrong branch. An invalid branch answers *"Muitos usuários"* — it looks like a license problem and is not.
7. **The effective REST URL is unconfirmed** (see "REST alternative").
8. **The `.sh` scripts have no execute bit** (the repository sits in a Google Drive folder). Call them as `bash Scripts/…`.

---

## Procedure

### 1 — Check the setup (read-only)

```bash
bash Scripts/pth-compile.sh -h | sed -n '/^Configuracao/,/^Exemplos/p'          # or: … <suffix> -h
```

Expect a real `servidor`, the right `https`, and for launch mode a `webagent` path, a `browser` path and `launch_by_webagent : true`; note `production_database` (rule 4). `(nao foi possivel ler …)`, `0.0.0.0:0` or an empty `env_default` means the file is missing or unfilled: ask the user to fill it.

Prerequisites on the machine: **Node.js 20+** (the script passes `--experimental-websocket`), a **Chromium/Chrome/Edge** (`browser` in the settings, or `PROTHEUS_BROWSER`), and the **WebAgent** executable of that environment (`webagent`). Scripts use **Edge** (`/usr/bin/microsoft-edge`): the snap Chromium works too, but its processes cannot be killed from outside the snap, so a run that dies midway leaves it behind. In direct mode the user's WebAgent must be running on `webagent_port` (default 21021); the ConsultaSql Controller refuses to run without it ("Ligue o WebAgent para o ambiente …").

### 2 — Make sure the module is in the RPO of the environment you will query

The function runs in `env_default` (or `PROTHEUS_ENV`) of the chosen settings file. Compile there first, with the `advpl-tlpp-compile` skill (Route B), using the same configuration you will query with:

```bash
bash Scripts/pth-compile.sh <lib>/Templates/ConsultaSql        # env_default of pth-settings.json
```
Each environment has its own RPO — compiling into one does not publish to another.

### 3 — Write the statement

- Must start with `SELECT ` or `WITH ` **followed by a space** (case-insensitive). A newline right after `SELECT`, a leading comment (`-- …`) or anything else is refused with `400 "Esta rota executa apenas consulta."`. Keep `SELECT ` and the first column on the same line.
- Use the database dialect of that environment (check the DBMS; do not assume).
- Paging does not exist (`hasNext` is always `false`): limit in the SQL itself.

### 4 — Run (outside the sandbox)

```bash
bash Scripts/pth-query.sh "SELECT TOP 3 A1_COD, A1_NOME FROM SA1010 WHERE D_E_L_E_T_ = ' '" consulta 60
bash Scripts/pth-query.sh <suffix> -f file.sql consulta 60        # another configuration; long or quote-heavy SQL
```
`pth-query.sh [suffix] "<SQL>" [label] [seconds]` or `pth-query.sh [suffix] -f file.sql [label] [seconds]`. The suffix, when given, is the **first** argument (a plain name: letters, digits, `_`, `-`, starting with a letter or digit). The script prints `config : <file>` — confirm it is the one you meant.

- **Launch mode** (`launch_by_webagent: true`): the script ends as soon as the result file appears (`retorno : … (11.0s)`, exit `0`) or after `[seconds]` without it (`nada em …`, exit `2`). 60 s is a comfortable limit for a simple query.
- **Direct headless mode** (`false`): the routine draws no window, so the script cannot detect completion and waits the whole limit; its exit code says nothing about the result. Pass 20–30 s for a simple query.

Another environment of the same file: `PROTHEUS_ENV=rest bash Scripts/pth-query.sh …` (a role — `default`, `rest`, `workflow`, `job` — or a name listed in `environments`).

**Windows (unvalidated — see Known status #5):**
```powershell
.\Scripts\pth-query.ps1 "SELECT TOP 3 A1_COD FROM SA1010 WHERE D_E_L_E_T_ = ' '" consulta 60
```
The `.ps1` sets `PTH_SETTINGS` and `PROTHEUS_WAIT_FILE` only while `node` runs and restores the previous values afterwards.

### 5 — Read the result

The file is on the **client** (the machine that ran the script), in its temp directory: `/tmp/consultasql-retorno.json` on Linux, `%TEMP%\consultasql-retorno.json` on Windows. `pth-query` deletes it before each run, so what you read is always from this run.

```bash
jq '.ok, .data.items' /tmp/consultasql-retorno.json          # or: jq -r '.message, .detailedMessage'
```
Parse it; do not eyeball it. For arithmetic across rows use `jq` or `python3 -c`.

```jsonc
{"ok":true,"data":{"hasNext":false,"items":[{"A1_COD":"000001","A1_NOME":"..."}]}}
{"ok":false,"status":400,"message":"...","detailedMessage":"..."}      // failure envelope
```

### 6 — Report

Say which settings file, server and environment ran, the statement, row count and the relevant rows — nothing more. If it failed, quote `message` and `detailedMessage` and use the table below.

---

## What you see → what it means

| Symptom | Meaning | Action |
| --- | --- | --- |
| `400 "Esta rota executa apenas consulta."` | Statement does not start with `SELECT ` / `WITH ` (space required; comments and newlines first are refused) | Fix the SQL |
| `400 "Nao foi possivel ler a consulta do arquivo."` + `Arquivo vazio ou inexistente: <path>` | The Service looked for the SQL at `<path>` and found nothing: wrong machine/dir or the script wrote elsewhere | Compare `<path>` with where the script wrote (`sql : …` line). See internals: temp-file contract, `PROTHEUS_SQL_PATH` |
| `400 "Nao foi possivel executar a consulta."` | The database rejected it; `detailedMessage` is the database's own message | Fix the SQL (invalid column, syntax…) |
| `500 "Resposta invalida da consulta."` | The RPO of this environment has the old REST-only `GwApiQuery` | Compile `<lib>/Library/Classes/ApiQuery` into that environment (with the user's OK), then retry |
| `nada em /tmp/consultasql-retorno.json apos Ns` | The function ran and could not read the SQL / write the result on the client, or never ran | Check the `agente : porta … (Agente Local ligado)` line; then debug per [internals](references/exec-sql-internals.md): page console, and in the AdvPL debugger `File("l:/tmp/consultasql.sql")` / `MemoRead(...)` — `.F.`/`""` with the file present means `l:` is going to the server |
| `agente : nao foi possivel ligar o Agente Local` (launch mode) | The wrapper did not record the launch URL or the browser's CDP was unreachable | Rerun once; check nothing else holds port 9253 (`ss -ltnp \| grep 9253`) |
| Result file exists with **0 bytes** | A selected column has accented text (CP1252) and the JSON conversion failed (e.g. `X2_NOME`, `X5_DESCRI`, `*_DESCR`) | Drop the column, or read it as hex: `CONVERT(VARCHAR(200), CAST(col AS VARBINARY(100)), 2)` and decode with `bytes.fromhex(h).decode('cp1252')` |
| Script prints `SESSAO ENCERRADA pelo servidor` (direct mode) | Fatal AdvPL error killed the session. **It is not a hang.** Invalid SQL built by string concatenation is the typical cause | Read the AppServer console/ConOut; do not "optimize" the query |
| `nada detectado` + DOM text *Programa Inicial* / *TOTVS WebAgent … INSTALAR* (direct mode) | The page did not reach the user's WebAgent on `webagent_port` | Start the WebAgent, or use `launch_by_webagent: true` |
| DOM shows `ERR_EMPTY_RESPONSE` (direct mode) | The WebApp is https-only and the settings file has `https` false/absent | Ask the user to set `"https": true` |
| Function not in the AppMap on the **first** call (`InterFunctionCall: cannot find function U_…` in ConOut) | No `using namespace` at the caller — an AppServer limitation | Run again; if the second attempt works, that is it |
| `Arquivo de configuracao nao encontrado: …/pth-settings.<suffix>.json` | Wrong suffix, or that file does not exist | Check the suffix; the user creates the file |
| `launch_by_webagent exige o campo webagent`, `webagent nao existe`, `browser do arquivo de settings nao existe` | Settings incomplete or a path is wrong | Ask the user to fix the file |
| `Ambiente desconhecido…`, `Preencha em …`, `… invalido: esperado …` | Configuration | `bash Scripts/pth-compile.sh [suffix] -h`; ask the user to fix the file |
| Accented text makes the JSON fail | Protheus is CP1252, JSON is UTF-8: one accented value empties the whole response (see the 0-byte row) | Hex workaround above; the durable fix is `EncodeUTF8()` in the library's row formatting |

---

## REST alternative (no browser, no file)

The same rule answers as a real REST route — `@Post("/GwConsultaSql/consultas")` in `GwTemplateConsultaSqlApi.tlpp`. Body `{"query":"SELECT …"}`; reply `{"hasNext":false,"items":[…]}` straight in the HTTP body.

- **URL.** The REST server appends the annotation to its own base path (`/rest/`), so it should be `http(s)://<ip>:<rest-port>/rest/GwConsultaSql/consultas`. **Unconfirmed for this route.** Judge a wrong URL by the status: **404** = no route registered there (URL wrong); **500** = the route exists and the handler failed.
- **Port.** The REST Server port is *not* the `port` of the settings file (that one is the AppServer/WebApp port), and the REST runs in its own environment (`env_rest`).
- **Auth.** Basic auth with the same user/password as the settings file. Build it inside a shell command without printing it: `AUTH=$(printf '%s' "$(jq -r '"\(.user):\(.password)"' Scripts/pth-settings.json)" | base64 -w0)` — never `echo` it.
- **`tenantId: <company>,<branch>` header** selects company and branch (branch codes have the length of the ERP's branch field). Without it the thread gets *a* default and a query scoped by branch quietly runs against the wrong one — a `200` with empty `items`, which reads as "no data".
- **Send the body from a file** (`--data-binary @body.json`); mixed quotes on the command line break and can send an empty body.
- **Compile into the environment REST runs** (`bash Scripts/pth-compile.sh -e rest …`). On this project's server no restart is needed: the REST service serves the new code **by itself within up to 120 seconds**. Until then the old code (or alternating `200`/`500`) may answer — wait about 2 minutes and hit the route several times before believing any single answer. Only if the old code is still served after that is a restart worth raising (it belongs to the user).
- **Security:** this endpoint runs SQL that arrives from outside and exposes unrestricted read access to anyone who can reach it. Authentication is the REST Server's (appserver.ini), not the code's. Do not publish it without that decision made.

---

## Anti-patterns

- Reading or printing any `Scripts/pth-settings*.json`, or asking the user for the password.
- Running against a `production_database: true` configuration without the user's confirmation in this conversation.
- Running inside the agent sandbox and debugging the misleading failure.
- Passing the user's real browser straight to `web-agent launch` — it opens a tab in the user's session. `pth-execute.mjs` passes an isolated headless wrapper instead.
- Killing the user's own WebAgent (port 21021) or browser while cleaning up after a run.
- Sending SQL in the URL (`&A=<SELECT …>`): needs escaping, hits URL limits, lands in every access log. Use the file + `RUNQUERY` sentinel — which is what the script already does.
- Relying on a screenshot for the result. AdvPL windows are pixels, not DOM, and a big result is cropped. The JSON file is the answer.
- Two runs at once.
- Optimizing a query after `SESSAO ENCERRADA` — it is a crash, not slowness.
- Assuming `SELECT *` on a big table, an unbounded scan at peak hours, or a correlated subquery inside an aggregate (rewrite with a join / pre-aggregation).
- Treating a compile as proof the query works: column names inside SQL strings only meet the database when the query runs.
- Suggesting a WebAgent version change as a fix — the version follows the WebApp of each environment.
- Concluding "WebAgent bug" when `ExistDir("l:/tmp")` is `.T.` but `File()` of a client file is `.F.`: that is the "Agente Local" off (`desktopagentport` missing), so `l:` hits the server.
- Declaring the Windows scripts working without the user's run of the validation script.
