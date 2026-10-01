# TDS patch protocol (reverse-engineered)

Source: `TOTVS.tds-vscode` 2.1.4 (`~/.vscode/extensions/totvs.tds-vscode-2.1.4/out/extension.js`, and the
non-bundled `out/patch/*.js`, `out/protocolMessages.js`, `src/patch/formGenPatch.html`). The extension talks
JSON-RPC (LSP framing over stdio) with its bundled `advpls language-server`
(`node_modules/@totvs/tds-ls/bin/<os>/advpls`). `pth.mjs` drives the same binary the same way.

## Session

1. `initialize` / `initialized` (plain LSP).
2. `$totvsserver/reconnect` `{ reconnectInfo: { connectionToken: <saved token of server:environment>, serverName, connType: 3 } }`
   → `{ connectionToken }` used in every call below. The saved token comes from `servers.json`
   (`savedTokens`, key `"<server id>:<environment>"`), written by the extension when the user connects.
3. `authorizationToken`: the RPO token (`servers.json` → `rpoToken.token`, builds after 7.00.191205P) or the
   old compile key (`permissions.authorizationToken`). Same rule as compile.

## List the RPO — `$totvsserver/inspectorObjects`

```json
{ "inspectorObjectsInfo": { "connectionToken": "...", "environment": "ENV", "includeTres": true } }
```

Response: `{ "message": "Success", "objects": [ "NAME.EXT (dd/mm/yyyy hh:mm:ss) XY", ... ] }`.
The extension parses each line with `/(.*)\s\((.*)\)\s(.)(.)/` → source, date, source_status, rpo_status.
The "from RPO" screen sends only the part before `" ("` (the program name).

## Generate — `$totvsserver/patchGenerate`

```json
{ "patchGenerateInfo": {
    "connectionToken": "...", "authorizationToken": "...", "environment": "ENV",
    "patchMaster": "",                       // RPO master: only for "by difference"
    "patchDest": "file:///abs/dest/folder",  // URI of the LOCAL destination folder
    "isLocal": true,
    "patchType": 3,                          // the only type the extension uses (.ptm)
    "name": "",                              // patch name; "" = server default
    "patchFiles": [ "NAME1.PRW", "NAME2.TLPP" ]  // program NAMES in the RPO, not paths
} }
```

`returnCode === 40840` → expired RPO token (the extension clears it). The extension shows "Patch file
generated" without reading the response; `pth.mjs` checks the destination folder for the new file.

### The three entry points

| Command | patchFiles | patchMaster |
| --- | --- | --- |
| `totvs-developer-studio.patchGenerate.fromRPO` (server view, right click) | names chosen in the RPO list; *Import* reads a `.txt`: one per line, `#` comments, `path.basename(line)`, matched case-insensitively against the RPO list | `""` |
| `totvs-developer-studio.patchGenerate.fromFolder` (explorer, folder right click) | `basename` of every file under the folder (recursive); asks "compile all the files?" first (build of the full paths) | `""` |
| `totvs-developer-studio.patchGenerate.byDifference` | `[]` | path of the master RPO |

### Folder scan (`readFiles` / `vk`)

- A folder containing `.tdspatchignore` is skipped entirely (patch). (Compile uses `.tdscompileignore`.)
- Names matching the extension's ignore list are skipped (with a warning): `.vscode`, `*.erx_`, `*.ppx_`,
  `*.err`, `#...#`, names ending in `.`/`.#`, `%...%`, `._*`, `CVS`, `.cvsignore`, `SCCS`, `vssver.scc`,
  `.svn`, `.DS_Store`, `.git`, `.gitattributes`, `.gitignore`, `.gitmodules`, `.hg*`, `.bzr`, `.bzrignore`.
- The extension sends every remaining file name (no extension filter). `pth.mjs` additionally keeps only the
  extensions of `totvsLanguageServer.folder.extensionsAllowed` (the compile list), and checks each name in
  the RPO before generating.

## Read a patch — `$totvsserver/patchInfo`

```json
{ "patchInfoInfo": { "connectionToken": "...", "authorizationToken": "...", "environment": "ENV",
    "patchUri": "file:///abs/file.ptm", "isLocal": true } }
```

Response: `{ "patchInfos": [ ... ] }` (one entry per program in the patch).

## Validate / apply (not used by pth.mjs)

`$totvsserver/patchApply` `{ patchApplyInfo: { connectionToken, authorizationToken, environment, patchUri,
isLocal: true, isValidOnly: true|false, applyScope: "none" | "only_new" | "all" } }` — `isValidOnly: true`
validates; `false` applies (changes the RPO: never from an agent without the user's explicit decision).
