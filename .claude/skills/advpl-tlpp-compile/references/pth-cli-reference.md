# pth CLI compile reference (Route B)

Reference for Route B of the `advpl-tlpp-compile` skill: compiling from a shell with `Scripts/pth-compile.sh` (Linux/macOS) or `Scripts/pth-compile.ps1` (Windows), no VS Code. Everything below was read from those scripts; the Linux script was exercised end to end against a **fake** `advpls` (no server): 94 automated cases passed on 2026-09-24. It has **not** been run against a real AppServer since the rewrite, and the `.ps1` has never run at all.

## How it works

The TDS VS Code extension does not compile anything itself: it ships a language-server binary that talks to the AppServer. `advpls` has a `cli` mode that runs a **script of actions** — the extension is only a face over it:

```
~/.vscode/extensions/totvs.tds-vscode-<ver>/node_modules/@totvs/tds-ls/bin/linux/advpls cli <script.ini>
```

`pth-compile` generates that `.ini` for each target environment, runs it, and removes it:

```ini
showConsoleOutput=true

[authentication]
action=authentication
server=<ip>
port=<port>
secure=0
build=AUTO
environment=<environment>
user=<user>
psw=<password>

[compile]
action=compile
program=/abs/path/one,/abs/path/two        ; files OR directories (recursive)
recompile=F                                ; T forces rewrite into the RPO
includes=/totvs/protheus/includes/includes-standard/2410
```

Hard requirements, each learned the hard way:

- **The `.ini` must be ANSI/CP1252**; in UTF-8 the run fails. The scripts convert on write (and fail loudly on a character outside CP1252, e.g. an emoji in the password). The **source files** must be CP1252 too → `utf8-to-cp1252-conversion`.
- **`includes` are resolved by the AppServer**, so they are absolute paths *on the server*, not on your machine. The script has one fixed value (`INCLUDES` at the top of `pth-compile.sh`); edit it if the environment's includes differ.
- **`build=AUTO`** spares hard-coding the AppServer release.
- The exit code is non-zero on failure — it chains and works in CI.
- The `.ini` carries the password in plain text: created `chmod 600` in the temp dir and destroyed by `trap EXIT` (`finally` in the `.ps1`), so it does not survive the run even on Ctrl+C.
- *Observed elsewhere, not implemented by the scripts:* `action=validate` needs **no credentials** and answers with the build/secure pair — the cheapest connectivity probe. The grammar is documented in the package itself: `@totvs/tds-ls/TDS-cli-script.md` — read it before inventing syntax.

## `Scripts/pth-settings.json`

One file = **one server**. Copy the model and fill it (the user does this — the agent never reads it):

```
cp Scripts/pth-settings.example.json Scripts/pth-settings.json
```

| Key | Meaning | Required |
| --- | --- | --- |
| `ip` | AppServer host | yes (`"0.0.0.0"` counts as unfilled) |
| `port` | AppServer port (also the WebApp port) | yes (`0` counts as unfilled; number or numeric string) |
| `user` / `password` | Protheus credentials, plain text | yes for compile |
| `env_default` | Environment (RPO) for normal compilation | **yes** |
| `env_rest` | Environment the REST Server serves | optional |
| `env_workflow` | Workflow environment | optional |
| `env_job` | Job/schedule environment | optional |
| `environments` | Every environment on the server; with the `env_*` values it is what `-e NAME` accepts | optional |

Validation (same rule in `.sh` and `.ps1`, and in `pth-execute.mjs`): must be a JSON object; `ip` a string, `port` digits, `environments` a list of strings, the rest strings or absent; **`ip` and environment names contain no whitespace** (a trailing space in `"TESTE5 "` would only surface as "environment not found" on the server). A syntax error is reported with the parser's own message; a UTF-8 BOM is accepted. Missing required values are all listed at once: `Preencha em <file>: ip, port, user, password, env_default`.

- `Scripts/pth-settings.json` is in `.gitignore`; only `pth-settings.example.json` is versioned.
- **The repository folder may be synced (Google Drive, OneDrive…)** — then the password syncs too. To keep it out, store the file elsewhere and export `PTH_SETTINGS=~/.totvsls/pth-settings.json` (`$env:PTH_SETTINGS` on Windows).
- To compile on **another server**, use another file through `PTH_SETTINGS`. There is no `-s dev|prd` any more, so nothing forces production to be spelled out: `-h` shows which server the file points at — confirm it.

## Command line

```
Scripts/pth-compile.sh [-r] [-e <target>]... [-a] [-h] [path ...]
```

| Flag | Meaning |
| --- | --- |
| `-r` | Recompile (rewrite into the RPO even without a detected change) |
| `-e <target>` | Environment to compile into. `<target>` is a **role** — `default`, `rest`, `workflow`, `job`, resolving to `env_default`, `env_rest`, … — or a **name** listed in `environments` (or equal to one of the `env_*`). Repeatable: `-e rest -e workflow`. Roles win over names; matching is case-sensitive. Default: `default` |
| `-a` | Compile into **every configured** `env_*`, in order default → rest → workflow → job, without repeating equal ones. Does not combine with `-e` |
| `-h` | Usage + a **password-free** summary of the configuration |
| `path…` | Files or directories (recursive); made absolute because the AppServer does not know your cwd |

An empty value (`-e ""`) is an error, not "use the default" — an empty variable must not silently fall through to the default environment. An unknown target lists the known roles and names.

**Multiple environments** run one after another, **all of them even if one fails** (a locked RPO must not hide the others), with a `=== ambiente n/total ===` header per environment and a `=== resumo ===` at the end. The exit code is that of the **first** failure.

| Exit | Meaning |
| --- | --- |
| `0` | Every environment compiled |
| `1` | Could not convert the `.ini` to CP1252 (bash) / unexpected error (`.ps1`) |
| `2` | Bad usage: unknown option, `-e` without value, `-a` with `-e`, unknown or unconfigured target, path not found |
| `3` | Setup: `jq` missing, settings missing/invalid/incomplete, `advpls` not found |
| other | The `advpls` exit code of the first environment that failed |

**Default target caveat:** without a path the script compiles `Sources/AdvPL/Global` + `Sources/AdvPL/Projects` (inherited from another project's layout). **They do not exist in this repository — always pass an explicit path** (e.g. `Sources/Templates/ConsultaSql`).

## Environment = RPO — the trap that costs the most

Each environment has its **own RPO**, and compiling into one does not publish to the others. With the wrong RPO the route still answers (the API scan found the annotation somewhere) and runs **old code**: the fix you just compiled simply does not show up and nothing says it went to the wrong place. Several rounds of "correct change, same error" are the signature. That is why the roles exist: the WebApp (`pth-execute`/`pth-query`) runs in `env_default`; a REST route runs in `env_rest` → `pth-compile.sh -e rest <source>`.

**REST after a compile — no restart on this project's server (user-confirmed 2026-09-24).** With the current binaries the REST service picks up the newly compiled code **by itself, within up to 120 seconds**. So after `-e rest` do not ask the user for a restart: wait, then hit the route again. Calls alternating between `200` and `500`, or the old behaviour still answering, in that first ~2 minutes is the expected signature, not a failure — retry a few times over the window before concluding the compile did not take. Only if the old code is *still* served after ~2 minutes (and the compile went to the right environment: `-h` shows `env_rest`) is a manual restart worth raising with the user — it is theirs to do.

Observed elsewhere (older binaries): compiling into the REST environment while its service runs can fail with `COMPILEERROR-300 Failed to open repository` (the live service holds that RPO); the script retries that already.

## Pacing and the RPO lock

After a SmartClient/WebApp/debug session closes, the RPO stays locked ~30 s and the next compile fails with `COMPILEERROR-300 Failed to open repository`. Nothing is wrong with the source or the credentials. The scripts already **retry 3 times, 30 s apart, only on that message** — do not add your own retry loop, and do not start two compiles at once. Leave ~5 s between two *runs* (WebApp executions).

## What a compile proves — and does not

- It proves syntax and that every **symbol referenced exists in the RPO**. Column names inside `BeginSql`/SQL strings are strings and only meet the database when the query runs → use the `advpl-tlpp-exec-sql-query` skill.
- **A `User Function` inside a `namespace` is global, but the AppServer has a limitation on its first call.** Called by its bare `U_` name from code with no `using namespace <that one>`, the **first** call is not dispatched: it **compiles cleanly** and fails at runtime with `InterFunctionCall: cannot find function U_X in AppMap`; later calls work (same for a job declared under a namespace). The compiler never warns. It looks exactly like "the source was not compiled" — a recompile changes nothing. Call again (if the second attempt works, that is it), and compare the `using` clauses of a file that works against one that does not before recompiling anything.

## Windows (`pth-compile.ps1`)

Same flags, same settings file, same exit codes; requires PowerShell 5.1+. Differences: the newest `advpls.exe` under `%USERPROFILE%\.vscode\extensions\totvs.tds-vscode-*` is found automatically (`$env:PTH_ADVPLS` overrides; the `.sh` pins one extension version at the top of the file — if the extension updates and removes that folder the `.sh` stops with a clear message, edit `ADVPLS`); the `.ini` is written with CRLF; stdout and stderr of `advpls` are read separately (stdout first). **Never run on Windows yet.** The top of the file carries a status block and a step-by-step validation script for the user to run; until it passes, do not claim the script works. Suppositions to check first if something fails: where `advpls.exe` sits inside `tds-ls\bin`, whether `advpls` accepts CRLF in the `.ini`, and whether the .NET build has the CP1252 table.

## Troubleshooting

| Message / symptom | Cause | Action |
| --- | --- | --- |
| `Arquivo de configuracao nao encontrado` | No `pth-settings.json` (the message prints the `cp` of the model) | User copies and fills the model |
| `Preencha em <file>: …` | Required values empty (the unfilled model has `0.0.0.0` / `0`) | User fills them |
| `<file> invalido: esperado um objeto com ip…` | Wrong type, whitespace in `ip`/environment names | Fix the file |
| `Nao consegui ler <file> como JSON: …` | Syntax error (comment, trailing comma, missing quote) | Fix the file; the parser's message says where |
| `Ambiente desconhecido: X` (+ known roles/names) | `-e X` is neither a role nor listed | Fix the typo, or add it to `environments` |
| `O papel "rest" nao esta configurado` | `env_rest` is empty | Fill it or pick another target |
| `-a e -e nao combinam` | Flags conflict | Use one |
| `jq nao encontrado` | `jq` missing (bash script) | `sudo apt install jq` |
| `advpls nao encontrado em: …` | TDS extension updated/removed, or not installed | Edit `ADVPLS` in the `.sh` (or `PTH_ADVPLS` for `.ps1`); install/update the extension |
| `COMPILEERROR-300 Failed to open repository` | RPO locked ~30 s after a session closed | Already retried 3×; if it persists another session/service holds the RPO — tell the user |
| `Nao consegui converter o .ini para CP1252` | Emoji or other non-CP1252 character in user/password/path | Remove it |
| Garbled characters in messages / compile errors about invalid characters | Source is UTF-8 | `utf8-to-cp1252-conversion`, recompile |
| Authentication error | Wrong `user`/`password`/`environment` for that server (also: passwords with `;` or `#` may be cut by the `.ini` parser — unverified, inherited) | Ask the user to check the file |

## Testing the script logic without a server

Point `HOME` at a temp directory that contains a **fake** `advpls` at `.vscode/extensions/totvs.tds-vscode-2.0.16/node_modules/@totvs/tds-ls/bin/linux/advpls` (a shell script that prints the `.ini` it receives with the `psw=` line masked and exits with `$FAKE_EXIT`), and set `PTH_SETTINGS` to a fixture. That is how the argument, validation, role and multi-environment logic was tested (94 cases) without touching a server or a real credential.
