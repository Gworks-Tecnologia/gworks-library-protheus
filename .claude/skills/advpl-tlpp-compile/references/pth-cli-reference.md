# pth CLI compile reference (Route B)

Reference for Route B of the `advpl-tlpp-compile` skill: compiling from a shell with **`node Scripts/pth.mjs compile`**, no VS Code and **no password in any file**. `Scripts/pth.mjs` is one Node.js 22+ script, the same on Linux, macOS and Windows, with the subcommands `compile`, `query`, `exec` (the last two: `advpl-tlpp-exec-sql-query` skill), `servers`, `webagents` and `info`; all share the same configuration (settings + `servers.json`).

**Status.** Checked against a **fake** `advpls` that speaks the same protocol (65 checks on the single `pth.mjs`: roles and the empty-default fallback, `-a`, retries, house/globe, VS Code profiles, the extension filter and `.app`, includes, exit codes, the exact request sent, and the `exec`/`query` argument and configuration paths) and against the **real** `advpls` 2.1.4 locally: it accepts the handshake and the reconnect request, and rejects an invalid token in under a second (exit 4). **Confirmed against a real AppServer on 2026-09-29** (Minerasul DEV-DEBUG, AppServer `7.00.240223P`, secure connection, environment `CQSLH5_GWORKS`, TDS 2.1.4, token saved by VS Code, no password anywhere): unchanged source → `[SKIPPED] … already compiled`, `resultado: SKIPPED 1`, exit 0; `-r` → `[SUCCESS] … compiled successfully`, `resultado: SUCCESS 1`, exit 0; syntax error → `[FATAL] Aborting: X.PRW(4) C2003 Syntax Error`, rollback, `resultado: FATAL 1`, exit 1. ~7 s per run. Three consecutive runs reused the **same** saved token. Re-run through `pth.mjs` (compile `SKIPPED`, query `ok`) after the merge into one file.

## How it works — the extension's own login, reused

The TDS extension does not compile anything itself: it runs `advpls language-server` and talks to it over JSON-RPC (LSP framing). `pth.mjs compile` does exactly the same, with the same requests the extension sends:

1. `initialize` / `initialized` — start the language server.
2. `$totvsserver/reconnect { reconnectInfo: { connectionToken, serverName, connType: 3 } }` — log in with the **token the extension saved** when the user connected in VS Code. The token carries the server's address itself ("Encoded server info"); the reply brings a session token.
3. `$totvsserver/compilation { compilationInfo: { connectionToken, authorizationToken, environment, includeUris, fileUris, compileOptions, extensionsAllowed, includeUrisRequired, syntaxOnly } }` — compile. The reply has `returnCode` and `compileInfos[]` (`status` — seen: `SUCCESS`, `SKIPPED` (unchanged, already in the RPO), `FATAL`; also `WARN`/`ERROR` — plus `filePath`, `message`, `detail`); progress arrives as `window/logMessage`.
4. `shutdown` / `exit`.

Where the token comes from: every successful connection in VS Code (TOTVS → Servers → server → environment) makes the extension save it in `servers.json` → `savedTokens`, keyed `<server id>:<environment>`. **One token per environment**: an environment the user never connected to in VS Code has none (`SEM TOKEN` in `info`, exit 4). When the password changes or the token expires, the reconnect fails (exit 4) and one new connection in VS Code fixes it.

`authorizationToken` follows the extension's rule: from build `7.00.191205P` on, the RPO token saved by the extension (`rpoToken`, when enabled); before that, the compile key in `permissions`. Usually empty — only needed on AppServers that require a compile token.

`advpls cli` (the `.ini` scripts) was **not** used on purpose: its `[authentication]` accepts only `user` + `psw`, which would mean a password stored somewhere. Its "tokens" are compile tokens (Harpia), not logins.

## Where `servers.json` is — the house/globe icon

The icon in the VS Code status bar shows the setting `totvsLanguageServer.workspaceServerConfig` (read from the extension's code, 2.1.4):

| Icon | Setting | File |
| --- | --- | --- |
| house `$(home)` | `true` | `<project>/.vscode/servers.json` |
| globe `$(globe)` | `false` (the default) | `~/.totvsls/servers.json` (`%USERPROFILE%\.totvsls\servers.json` on Windows) |

Clicking the icon writes the setting to the project's `.vscode/settings.json`. `pth.mjs` resolves every plugin setting it needs (this one and the extension filter below) the way VS Code does for this folder:

1. the project's `.vscode/settings.json`;
2. the settings of the **VS Code profile associated with the folder** — `globalStorage/storage.json` → `profileAssociations.workspaces["file:///<folder>"]` → `profiles/<location>/settings.json` under the user folder (`~/.config/Code/User/` on Linux, `%APPDATA%\Code\User\` on Windows, `~/Library/Application Support/Code/User/` on macOS); a folder with no profile, or a profile that inherits settings (`useDefaultFlags.settings`), uses the user folder's `settings.json`;
3. the extension's default.

All read as JSONC (comments and trailing commas allowed). `node Scripts/pth.mjs info` prints each value and where it came from (file and profile name). `.code-workspace` settings are not read: if `-h` disagrees with the icon, that is why — `PTH_SERVERS_JSON=<file>` pins a `servers.json`. On this machine the Protheus folders use **"Profile Advpl - Linux"**.

## Settings file: `Scripts/pth-settings.json`

One file = one server + (optionally) the environment of each role. **No secret in it** — the agent creates, reads and edits it. Server, user, environments and includes come from `servers.json`, looked up by `server`. There is no example file in the repository: this section is the template.

```json
{
  "server": "<id of the configuration in servers.json — see node Scripts/pth.mjs servers>",
  "env_default": "",
  "env_rest": "",
  "env_workflow": "",
  "env_job": "",
  "https": false,
  "webagent": "",
  "browser": "",
  "launch_by_webagent": true,
  "production_database": false
}
```

| Key | Meaning | Required |
| --- | --- | --- |
| `server` | `id` (or unique `name`) of the configuration in `servers.json` | yes |
| `env_default` | Environment (RPO) for `compile`, `query` and `exec` | optional — empty = the **first environment of the server** in `servers.json` (`info` shows which) |
| `env_rest` | Environment the REST Server serves | optional |
| `env_workflow` | Workflow environment | optional |
| `env_job` | Job/schedule environment | optional |
| `https` | `true` when that server's WebApp answers https (an https-only WebApp answers http with an empty response) | optional (default `false`) |
| `webagent` | Path of that environment's WebAgent executable — the version follows the WebApp (10.2.0+ → 1.1.x; below → 1.0.x) | required when `launch_by_webagent` is `true` |
| `browser` | Chromium/Chrome/Edge for WebApp runs (`PROTHEUS_BROWSER` overrides it; without both, the usual install locations are searched). This machine uses Edge (`/usr/bin/microsoft-edge`) | optional |
| `webagent_port` | Port of the user's own WebAgent, used by the direct mode (`launch_by_webagent` false) | optional (default `21021`) |
| `launch_by_webagent` | `true`: WebApp runs go through `<webagent> launch` with an isolated headless browser (see the exec-sql-query skill) | optional (default `false`) |
| `production_database` | `true` when that server's database is production. Informative only — the agent confirms with the user before running against it | optional (default `false`) |

Empty `""` = not configured. Environment names have no whitespace.

**The roles are markers** — they tell whoever runs the scripts (the agent included) what each environment is for, so `-e rest` / `PROTHEUS_ENV=job` hit the right RPO. `env_rest`, `env_workflow` and `env_job` exist only when **the user** named them; they are never inferred from environment names. A file with `ip`, `port`, `user`, `password`, `environments` or `includes` is the **old format** and is rejected with a migration message (delete the password with it).

**Several servers:** one file per server, `Scripts/pth-settings.<suffix>.json`, chosen by a suffix as the **first** argument of every script (plain name: letters, digits, `_`, `-`, starting with a letter or digit; a first argument that is an existing path is a source path). No suffix → `PTH_SETTINGS`, else `Scripts/pth-settings.json`. A missing file is an error, never a silent fallback.

The settings files stay in `.gitignore` — not secret, but machine-specific (paths of WebAgent and browser, server ids of this machine's `servers.json`).

### Creating one (agent procedure)

1. `node Scripts/pth.mjs servers` — lists the servers of the resolved `servers.json` (name, id, address, user, environments, and in which there is a saved login), never a token. Empty or missing → the user registers the server in the extension first (Route A, Step 3).
2. Ask the user **which server** (never guess when there are several). Then the roles:
   - `env_default`: leave empty — the scripts use the server's first environment in `servers.json`; tell the user which one that is, and fill it only if they want another.
   - `env_rest`, `env_workflow`, `env_job`: **ask the user** (optional; empty when they have none or do not say). Offer the server's environments as options, but do not guess from the names.
3. Ask what `servers.json` cannot tell: `https`, the **WebAgent**, `browser`, and whether the database is **production**. The WebAgent is needed to run queries through the WebApp (the JSON result is written on this machine through it) and `servers.json` knows nothing about it:
   - `node Scripts/pth.mjs webagents` lists the WebAgents installed in the default folders — `/opt/web-agent/**` on Linux, `%LOCALAPPDATA%\Programs\web-agent\**` (`C:\Users\<user>\AppData\Local\Programs\web-agent`) on Windows — with the version when the folder name carries it — the executable at the **root** of the install folder is the **latest version installed** (its path never carries the number); nothing is executed.
   - **Know the WebApp version first**: write the file with `server` and `https`, then run `node Scripts/pth.mjs webagents [suffix]` — it reads the version from the server's WebApp page (`webapp-<version>-frontend.min.js`, one GET, no login) and marks each WebAgent `<- serve` / `(nao serve)` / `(serve se for 1.x.x)` for the one at the root (latest installed, number unknown), plus `[no settings]` for the configured one. Ask the user with those paths as options (the one marked `<- serve` first, plus "another path" and "use my running WebAgent"); the rule: **WebApp 10.2.0 or later → WebAgent 1.1.x; below → 1.0.x**. Chosen path → `"launch_by_webagent": true` + `"webagent": "<path>"`. Running WebAgent → `"launch_by_webagent": false` (+ `webagent_port` — the port shown in the WebApp's gear → *Agente Local*, if not 21021): no path needed, but the run waits the whole time limit.
   - Before writing, check that the chosen path exists and is executable; if not, ask again.
4. Write the file from the template (suffix when it is not the project's main server), then `node Scripts/pth.mjs info [suffix]`: the server must resolve, and every role you will use must appear under `conectados` — an environment under `SEM TOKEN` needs one connection in VS Code first.

## Includes

As in the extension: the include folders of the server's configuration in `servers.json`; if it has none, the `includes` at the top of the file. `${workspaceFolder}` and relative paths resolve from the project root, and only folders that **exist on this machine** are kept — the language server reads them locally (the extension discards the others the same way). None left → exit 3 before compiling. Register them with the extension's *Include* assistant.

## Command line

```
node Scripts/pth.mjs compile   [suffix] [-r] [-e <target>]... [-a] [-h] <path>...
node Scripts/pth.mjs servers                   servers of servers.json, no tokens (no settings needed)
node Scripts/pth.mjs webagents [suffix]        installed WebAgents; with a settings: that server's WebApp version and which fits
node Scripts/pth.mjs info      [suffix]        settings + what was resolved from servers.json, no tokens
node Scripts/pth.mjs                           list of subcommands
```

| Flag | Meaning |
| --- | --- |
| `suffix` | Settings file `Scripts/pth-settings.<suffix>.json`. Must come right after the subcommand |
| `-r` | Recompile (rewrite into the RPO even without a detected change) |
| `-e <target>` | Environment: a **role** — `default`, `rest`, `workflow`, `job` → `env_default`, `env_rest`, … — or the **name** of an environment of the server (or equal to an `env_*`). Repeatable. Roles win over names; case-sensitive. Default: `default` |
| `-a` | The default environment (`env_default` or, empty, the server's first) plus every filled `env_rest`/`env_workflow`/`env_job`, in that order, without repeating equal ones. Does not combine with `-e` |
| `-h` | Usage of `compile` + the `info` summary |
| `path…` | Files or folders (recursive). A folder with a `.tdscompileignore` file is skipped; only the extensions the **plugin** allows are sent — `totvsLanguageServer.folder.extensionsAllowed` (default `.prw .prx .prg .ppx .ppp .tlpp .apw .aph .apl .ahu .tres .png .bmp .res .4gl .per .js .rptdesign`), or everything if `totvsLanguageServer.folder.enableExtensionsFilter` is `false`, resolved as above. A **`.app`** (PO UI app package opened by `FWCallApp`) compiles only if `.APP` is in that list — exactly as in VS Code; a file named on the command line and left out by the filter is reported (`ignorado: x.app -- .APP fora de …`), and a folder prints how many were left out per extension. **Required** — there is no default target |

An empty value (`-e ""`) is an error, not "use the default". An unknown target lists the configured roles and the server's environments.

**Multiple environments** run one after another, **all of them even if one fails**, with a `=== ambiente n/total ===` header each and a `=== resumo ===` at the end; one language-server process serves them all. The exit code is that of the **first** failure.

| Exit | Meaning |
| --- | --- |
| `0` | Every environment compiled (no `ERROR`/`FATAL`) |
| `1` | Compile errors, or the server refused the compilation |
| `2` | Bad usage: unknown option, `-e` without value, `-a` with `-e`, unknown or unconfigured target, no path, path not found, nothing compilable |
| `3` | Setup: `node` missing or older than 22, settings missing/invalid/old format, server not in `servers.json`, no include folder, `advpls` not found |
| `4` | Login: no saved token for that server/environment, or the token was not accepted |

Environment variables: `PTH_SETTINGS` (settings file when no suffix), `PTH_SERVERS_JSON` (pin a `servers.json`), `ADVPLS`/`PTH_ADVPLS` (pin an `advpls`; default: the newest `totvs.tds-vscode-*` extension installed), `PTH_DEBUG` (also print the language server's internal log lines and, on failure, its stderr), `PTH_ESPERA_RPO` (seconds between retries; tests only).

## Environment = RPO — the trap that costs the most

Each environment has its **own RPO**, and compiling into one does not publish to the others. With the wrong RPO the route still answers (the API scan found the annotation somewhere) and runs **old code**: the fix you just compiled simply does not show up and nothing says it went to the wrong place. Several rounds of "correct change, same error" are the signature. That is why the roles exist: the WebApp (`pth.mjs exec`/`query`) runs in `env_default`; a REST route runs in `env_rest` → `node Scripts/pth.mjs compile -e rest <source>`.

**REST after a compile — no restart on this project's server (user-confirmed 2026-09-24).** With the current binaries the REST service picks up the newly compiled code **by itself, within up to 120 seconds**. So after `-e rest` do not ask the user for a restart: wait, then hit the route again. Calls alternating between `200` and `500`, or the old behaviour still answering, in that first ~2 minutes is the expected signature, not a failure — retry a few times over the window before concluding the compile did not take. Only if the old code is *still* served after ~2 minutes (and the compile went to the right environment: `info` shows `env_rest`) is a manual restart worth raising with the user — it is theirs to do.

Observed elsewhere (older binaries): compiling into the REST environment while its service runs can fail with `COMPILEERROR-300 Failed to open repository` (the live service holds that RPO); the script retries that already.

## Pacing and the RPO lock

After a SmartClient/WebApp/debug session closes, the RPO stays locked ~30 s and the next compile fails with `COMPILEERROR-300 Failed to open repository`. Nothing is wrong with the source or the login. The script already **retries 3 times, 30 s apart, only on that message** — do not add your own retry loop, and do not start two compiles at once. Leave ~5 s between two *runs* (WebApp executions).

## What a compile proves — and does not

- It proves syntax and that every **symbol referenced exists in the RPO**. Column names inside `BeginSql`/SQL strings are strings and only meet the database when the query runs → use the `advpl-tlpp-exec-sql-query` skill.
- **A `User Function` inside a `namespace` is global, but the AppServer has a limitation on its first call.** Called by its bare `U_` name from code with no `using namespace <that one>`, the **first** call is not dispatched: it **compiles cleanly** and fails at runtime with `InterFunctionCall: cannot find function U_X in AppMap`; later calls work (same for a job declared under a namespace). The compiler never warns. It looks exactly like "the source was not compiled" — a recompile changes nothing. Call again (if the second attempt works, that is it), and compare the `using` clauses of a file that works against one that does not before recompiling anything.

## Windows

The same `node Scripts\pth.mjs …` (Node.js 22+ in the PATH; no PowerShell execution policy involved). The Windows-specific parts are the `advpls.exe` location (`…\tds-ls\bin\windows\advpls.exe`, taken from the extension's code), `%APPDATA%\Code\User` for the VS Code settings/profiles, `%USERPROFILE%\.totvsls` for the global `servers.json`, `%LOCALAPPDATA%\Programs\web-agent` for the WebAgent and the user's temp folder for the query files. The **previous** Windows scripts (`pth-compile.ps1` with `advpls cli`, `pth-query.ps1`) were validated there by the user; **`pth.mjs` has not run on Windows yet**: the *WINDOWS* paragraph at the top of the file lists the suppositions and the checks (`info`, `webagents`, one small compile, one query); until they pass, do not claim it works.

## Open questions (check on the first real runs)

- **Token lifetime.** The extension reconnects with saved tokens after VS Code restarts, so they outlive a session — how long, and whether a password change or server restart voids them, is not measured. Exit 4 is the signal; one connection in VS Code renews it.
- **Token rotation.** The reconnect answers with a new session token; the extension saves it back, the script does **not** write to `servers.json`. Three consecutive runs reused the same saved token (2026-09-29), so a reconnect does not void it right away. If VS Code ever asks for the password after script runs, this is the suspect — then the script must save the new token the way the extension does.
- **Locked RPO wording.** Normal and error output were seen on a real server; the locked-RPO case was not reproduced yet — the retry matches `COMPILEERROR-300` / `Failed to open repository` anywhere in the reply or the log, the texts `advpls cli` used to print.

## Troubleshooting

| Message / symptom | Cause | Action |
| --- | --- | --- |
| `Arquivo de configuracao nao encontrado: <file>` | Wrong suffix, or no settings file yet | Check the suffix, or create the file (*Creating one*) |
| `… esta no formato antigo (ip, port, …)` | Settings from before the token login | Rewrite it from the template (`server` + roles); delete the password |
| `Preencha em <file>: server` | `server` empty | Fill it (`node Scripts/pth.mjs servers` lists the ids) |
| `Sem ambiente padrao: env_default vazio … nao tem ambientes` | `env_default` empty and the server has no environment in `servers.json` | Connect once in VS Code to an environment of it, or fill `env_default` |
| `Servidor "X" … nao existe em <servers.json>` | `server` has a wrong id, or `info` resolved another `servers.json` (house/globe) | `node Scripts/pth.mjs servers` to see the ids; check the `modo` line of `info` |
| `Nao encontrei <servers.json> (…, decidido por: …)` | No server registered for that mode | Register it in the extension, or check the house/globe setting |
| `Sem token salvo para <server> no ambiente <env>` (exit 4) | The user never connected to that environment in VS Code | Ask the user to connect once in VS Code to it |
| `O token salvo … nao foi aceito` (exit 4) | Token invalid/expired, or the password changed | Ask the user to connect again in VS Code to that environment |
| `ignorado: x.app -- .APP fora de totvsLanguageServer.folder.extensionsAllowed` | The plugin's extension list (project or profile settings) lacks `.APP` | Add `.APP` to that list in VS Code (the same setting makes the plugin compile it) |
| `Nenhuma pasta de include existente nesta maquina` | Include folders missing locally | Register/fix them in the extension's *Include* assistant |
| `Ambiente desconhecido: X` | `-e X` is neither a role nor an environment of the server | Fix the typo |
| `O papel "rest" nao esta configurado` | `env_rest` is empty | Fill it or pick another target |
| `advpls nao encontrado` | TDS extension not installed | Install/update `TOTVS.tds-vscode`, or `ADVPLS=<path>` |
| `node nao encontrado` | Node.js missing | Install Node.js 20+ |
| `COMPILEERROR-300 Failed to open repository` | RPO locked ~30 s after a session closed | Already retried 3×; if it persists another session/service holds the RPO — tell the user |
| `Token de RPO expirado` | The AppServer requires a compile token and the saved one expired | Renew it in the extension (*RPO Token* in the status bar) |
| Garbled characters / invalid-character errors | Source is UTF-8 | `utf8-to-cp1252-conversion`, recompile |

## Testing the script logic without a server

Point `ADVPLS` at a **fake** `advpls`: a small Node script that speaks the LSP framing, answers `initialize`/`shutdown`, accepts `$totvsserver/reconnect` for tokens with a known prefix and returns `compileInfos` for `$totvsserver/compilation` (an `ERROR` for files with a known name, a `COMPILEERROR-300` on the first call for a "locked" environment), and appends every request to a log. Set `HOME`/`XDG_CONFIG_HOME` to temp dirs holding a fixture `~/.totvsls/servers.json` and user `settings.json`, copy `Scripts/pth.mjs` into a temp "repo" with its own `.vscode/` (to test house vs globe), and `PTH_ESPERA_RPO=1`. For profiles, a fixture `globalStorage/storage.json` associating the temp repo with a profile folder. That is how the 65 checks above were run — no server, no real token.
