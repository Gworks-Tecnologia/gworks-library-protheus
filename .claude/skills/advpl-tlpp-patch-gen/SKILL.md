---
name: advpl-tlpp-patch-gen
description: "Generate a Protheus patch (.ptm) of AdvPL/TLPP sources and resources from a Protheus RPO, from a shell, the same way the TOTVS Developer Studio for VS Code (tds-vscode) does it — by file, by folder, by RPO program name or by a .txt list — with `node .claude/scripts/pth.mjs patch` (Node 22+, drives the extension's advpls language server and logs in with the token the extension saved in servers.json; no password, no VS Code open). Checks every item against the RPO first (shows the compile date of each one), can compile the local files first (-c), and reads the generated patch back to list its content. Use when the user says 'gerar patch', 'gera o patch', 'patch do fonte', 'patch da pasta', 'patch para produção', 'patch para o cliente', 'empacotar fontes', 'generate patch', 'ptm', 'patch from RPO', 'patch from folder', or wants to move compiled sources from one environment to another (e.g. DEV -> PRD) as a patch."
license: MIT
metadata:
  domain: Protheus
  maintainer: Engenharia Protheus - Dados & DevOps
  version: '1.0.0'
  category: Build and Deployment
---

# AdvPL/TLPP Patch Generation (command line)

## Overview

A Protheus **patch** (`.ptm`) packages programs and resources **taken from an RPO** so they can be applied to another environment. The patch is built by the AppServer from what is **compiled in the RPO**, not from the local files: a source that was not compiled (or was compiled in another environment) is missing from the patch or goes in its old version.

This skill generates patches from a shell with `node .claude/scripts/pth.mjs patch`, replicating the three "Generate patch" actions of the TDS extension (reverse-engineered from `TOTVS.tds-vscode` 2.1.4 — see [references/tds-patch-protocol.md](references/tds-patch-protocol.md)):

| TDS action | Here |
| --- | --- |
| **Generate patch (from RPO)** — pick programs from the RPO list, or *Import* a `.txt` | `patch <NOME.EXT>...` or `patch -l lista.txt` |
| **Generate patch (from folder)** — right click a folder in the explorer | `patch <pasta>` (same scan rules: `.tdspatchignore`, extension's ignore list) |
| Patch of specific files | `patch <arquivo>...` (each file goes by its name; content from the RPO) |
| Generate patch by difference (master RPO) | not implemented |

It uses the same login as the `advpl-tlpp-compile` skill (route B): the token the extension saved in `servers.json` when the user connected in VS Code, and the same `.claude/config/pth-settings[.<suffix>].json`. Read that skill for the settings file, roles (`default`, `rest`, `workflow`, `job`) and the token rules — they apply here unchanged.

## When to Use

- The user asks to **generate a patch** of one or more sources, a folder or a list of programs.
- After a fix compiled in DEV, to **take it to another environment** (PRD, customer) as a patch.
- To check **what an existing patch contains** is NOT this skill's main job, but the command lists the content of every patch it generates.

**Do NOT use when:** the user wants to *apply* a patch (the command does not apply patches — that changes an RPO; ask the user to apply it through VS Code or the TOTVS tools), or to compile only (use `advpl-tlpp-compile`).

---

## CRITICAL — Agent Execution Rules

1. **Never ask for, print or copy the password or any token** (`token`, `savedTokens`, `rpoToken`, `authorizationToken`). Same rules as `advpl-tlpp-compile`. Exit 4 = no saved token / token refused → ask the user to connect once in VS Code to that server **and environment**, then run again.
2. **The patch comes from the RPO.** Before generating, make sure the sources are compiled **in the environment the patch is taken from** — compile first (or use `-c`). The command refuses to generate when an item is not in the RPO (exit 1) unless `-f` is given; never add `-f` on your own — report the missing items.
3. **List every dependency.** When the patch is meant to carry a fix, include every source the fix calls that exists only in the source environment (new functions, entry points, library classes). A patch with one file can break the target at runtime if it calls a function that is not there. Check the changed files of the fix (git diff/log) and say which sources go in the patch and why.
4. **Pick the source environment deliberately** (`-e`, default = `env_default`). Run `node .claude/scripts/pth.mjs info [suffix]` before the first patch of a session. If it shows `production_database : true`, confirm with the user before generating from that environment.
5. **Destination**: pass `-o <folder>` (the user's choice, or the session scratchpad). Default: `<temp>/pth-patches`. Name with `-n` when the user wants a specific name; otherwise the server's default name is used.
6. **Read the result**: the command prints each item with its RPO compile date, the generated file and its content (read back from the `.ptm`). Report the file path, the number of programs and anything missing. Check the dates: an old date means the item was not recompiled.
7. **Do not apply the patch** and do not deploy it anywhere. Generating is read-only for the RPO; applying is the user's decision.

---

## Procedure

1. Confirm the configuration: `node .claude/scripts/pth.mjs info [suffix]` (server, environments, tokens).
2. Decide the items:
   - a folder → `patch <pasta>`;
   - specific files → `patch <arquivo> <arquivo>...`;
   - programs that exist only in the RPO → `patch MATA410.PRX FATXFUN.PRX`;
   - a list → `patch -l lista.txt` (one name per line, `#` comments, basename used).
3. Compile first if the files changed (`-c` compiles the given local files in the same environment and cancels the patch on compile error), or run `advpl-tlpp-compile` before.
4. Generate:

```bash
node .claude/scripts/pth.mjs patch [suffix] [-e <alvo>] -o <pasta-destino> [-n <nome>] [-c] <itens>...
```

5. Read the output and report (file, size, programs and dates).

Examples:

```bash
# patch of three sources of a fix, compiled first, into the scratchpad
node .claude/scripts/pth.mjs patch dev -c -o /tmp/patches -n hotfix_pa231 \
  Sources/.../PreCargaMetaDataValid.tlpp Sources/.../PreCargaPontoEntradaFunction.tlpp Sources-Peroba/.../PE_PCSC5EXP.tlpp

# whole folder (as the explorer's "Generate patch from folder")
node .claude/scripts/pth.mjs patch dev -o /tmp/patches Sources/Advpl-Tlpp/Applications/PreCarga

# programs by name, from a list
node .claude/scripts/pth.mjs patch dev -o /tmp/patches -l fontes.txt
```

Exit codes: `0` patch generated; `1` failure (item missing from the RPO, compile error with `-c`, generation failed, RPO token expired); `2` usage; `3` configuration / advpls not found; `4` no token or token refused.

---

## Output (example)

```
servidor : PEROBA [DEV-DEBUG] host:10514 (CEM8V4_GWORKS)
itens    : 3
destino  : /tmp/patches

  RPO  PRECARGAMETADATAVALID.TLPP                       01/10/2026 17:10:22
  RPO  PRECARGAPONTOENTRADAFUNCTION.TLPP                01/10/2026 11:02:51
  FORA PE_PCSC5EXP.TLPP                                 (nao esta no RPO de CEM8V4_GWORKS)

1 item(ns) fora do RPO: patch NAO gerado. ...
```

When everything is in the RPO, the patch is generated and read back:

```
patch    : /tmp/patches/hotfix_pa231.ptm (12345 bytes)
conteudo : 3 programa(s)
  PRECARGAMETADATAVALID.TLPP   01/10/2026 17:10:22
  ...
```

## Known behavior

- **Reading the patch back can fail** with `DBGCpyFile error` ("File could not be copied to the server"): the server could not receive the local `.ptm` for `$totvsserver/patchInfo` (seen on a cloud AppServer, even for small patches). The patch **was generated** — exit code stays `0`; report that the content could not be listed and, if needed, ask the user to open it in VS Code (*Patch infos*).
- **Same file name in two folders**: the RPO keeps ONE program per name (the last one compiled wins) and the patch carries that one. The command prints `AVISO nome repetido` with both paths — report it; someone must decide which file is the right one (and remove the other).
- `-n` without extension: the server adds `.ptm` (`-n gworks-261001_17_25` → `gworks-261001_17_25.ptm`).
- Items already compiled and unchanged are reported by `compile` as `SKIPPED ... already compiled` — that is fine before a patch.

## Anti-patterns

- **Generating a patch of sources that were not compiled in the source environment** — the patch silently carries the old version (or nothing). Compile first / use `-c`, and read the dates.
- **Patching only the changed file of a fix** when it calls new functions from other sources — the target breaks at runtime. Include the dependencies (rule 3).
- **Using `-f` to "make it work"** — it drops the missing items from the patch. Only with the user's explicit OK.
- **Applying the patch** — out of scope; the user applies it.
- **Assuming a hot-applied patch is live in the target** — see the "troca a quente" anti-pattern in `advpl-tlpp-compile`: a patch applied without restarting the AppServer may not take; check behavior/data before blaming the code.
- **Printing tokens or the password** while troubleshooting.
