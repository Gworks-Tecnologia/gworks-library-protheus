---
name: po-ui
description: "Build Angular front-ends with PO UI, the TOTVS open-source component library (packages `@po-ui/ng-components`, `@po-ui/ng-templates`, `@po-ui/style`, `@po-ui/ng-code-editor`, `@po-ui/ng-sync`, `@po-ui/ng-storage`). Covers the version matrix against Angular, the `ng add`/`ng generate` schematics, the full component catalog (po-table, po-field family, po-page family, po-menu, po-toolbar, po-modal, po-chart, po-widget...), the dynamic CRUD templates (po-page-dynamic-table / -edit / -detail / -search, po-page-login, po-page-job-scheduler), the services (PoNotificationService, PoDialogService, PoI18nService, PoThemeService), and the REST contract those components expect (hasNext/items, page/pageSize, order, error envelope) including how to serve it from a Protheus TLPP endpoint. Use whenever the user says 'po-ui', 'poui', 'PO UI', 'portinari', 'po-table', 'po-page-dynamic-table', 'cria uma tela PO UI', 'CRUD Angular TOTVS', 'tela Angular para o Protheus', or when writing/reviewing Angular code that imports from @po-ui/*. Also covers running a PO UI app EMBEDDED in Protheus via `@totvs/protheus-lib-core` and `@totvs/po-theme` (ProAppConfigService, ProJsToAdvplService, ProSessionInfoService, ProAuthService, packaging to `.app`, opening it from AdvPL with `FWCallApp`) — trigger on 'protheus-lib-core', 'FWCallApp', 'app dentro do Protheus', 'app web no SmartClient', 'ProAppConfigService'."
license: Internal
metadata:
  domain: Angular / TOTVS PO UI
  maintainer: Gworks - Giovani
  category: Frontend Framework Reference
  verified_against: "@po-ui/* 21.30.1 (typings + fesm2022 do pacote instalado, não só o repo) sobre Angular 21.2.23 / CLI 21.2.24 / Node 20.20.2; repetido em CLI 21.2.21 / Node 24.19.0 / npm 11.17.0; @totvs/protheus-lib-core 21.1.2 + @totvs/po-theme 21.30.1 (npm typings + TDN pageId 911865819)"
  last_field_check: "2026-09-14 — app real criado do zero, compilado (ng build: 2.97 MB raw / 592.79 kB transferido) e testado (ng test) com este passo a passo. Esta 2a passada trocou o pin de zone.js de `npm pkg set` (confirmado sem solução: nenhuma sintaxe de escape testada evita o split no ponto) por edição direta do package.json, e documentou o unsubscribe sem guarda do po-menu no teardown de teste."
  upstream_docs: https://po-ui.io/documentation
---

# PO UI (TOTVS Angular component library)

## Overview

PO UI is TOTVS's open-source Angular design system — the successor to THF/Portinari. It ships as a set of npm packages whose **major version tracks the Angular major version**, plus an official MCP server that serves the live documentation to AI assistants.

| Package | What it holds |
|---|---|
| `@po-ui/ng-components` | The core library: all `po-*` components, services, directives, pipes, interceptors. |
| `@po-ui/style` | The CSS/theme layer (grid, tokens, icons). Installed as a peer of `ng-components`. |
| `@po-ui/ng-templates` | Higher-level page templates, including the dynamic CRUD pages. Depends on `ng-components`. |
| `@po-ui/ng-code-editor` | `po-code-editor` (Monaco wrapper). Separate package — heavy, only install if used. |
| `@po-ui/ng-sync` | Offline-first sync engine (schema + `PoSyncService`) for mobile/PWA. |
| `@po-ui/ng-storage` | Local storage abstraction used by `ng-sync`. |
| `@po-ui/mcp` | Official MCP server exposing po-ui.io docs. See [Live documentation](#live-documentation). |
| `@totvs/po-theme` | TOTVS theme layer on top of `@po-ui/style`. Versioned in lockstep with PO UI. |
| `@totvs/protheus-lib-core` | **Not part of PO UI** — the bridge that lets a PO UI app run *inside* Protheus (`FWCallApp`) and read the live ERP session. See [protheus-integration.md](references/protheus-integration.md). |

## Version matrix — check this first

PO UI `21.x` pairs with Angular `21.x`. **Never mix majors.** This `package.json` was produced by `ng new` on CLI 21.2.24 and then installed and built clean with PO UI 21.30.1:

```jsonc
// dependencies
"@angular/animations":               "^21.2.0",    // peer of po-ui; ng new does NOT create it
"@angular/cdk":                      "^21.2.0",    // peer of po-ui; ng new does NOT create it
"@angular/common":                   "^21.2.0",
"@angular/compiler":                 "^21.2.0",
"@angular/core":                     "^21.2.0",
"@angular/forms":                    "^21.2.0",
"@angular/platform-browser":         "^21.2.0",
"@angular/platform-browser-dynamic": "^21.2.0",    // peer of po-ui; ng new does NOT create it
"@angular/router":                   "^21.2.0",
"@po-ui/ng-components":              "21.30.1",
"@po-ui/style":                      "21.30.1",    // must match ng-components exactly
"@po-ui/ng-templates":               "21.30.1",    // must match ng-components exactly
"@totvs/po-theme":                   "21.30.1",    // Protheus-embedded apps only; same lockstep
"@totvs/protheus-lib-core":          "21.1.2",     // Protheus-embedded apps only
"rxjs":                              "~7.8.1",
"tslib":                             "^2.3.0",
"zone.js":                           "~0.15.0",    // NOT the ~0.16.0 that ng new writes — see below

// devDependencies
"@angular/build":                    "^21.2.24",   // the v21 builder package
"@angular/cli":                      "^21.2.24",
"@angular/compiler-cli":             "^21.2.0",
"typescript":                        "~5.9.2"
```

- **Node**: 20.11.x or newer (verified on 20.20.2 and on 24.19.0).
- **`zone.js`**: Angular 21 accepts `~0.15.0 || ~0.16.0` and `ng new` writes `~0.16.0`; PO UI 21 peers on `~0.15.0` only. Pin `~0.15.0` — it satisfies both. Leaving 0.16 gives an `ERESOLVE` peer conflict on install. Pin it **before** the first install by editing `package.json` directly — `npm pkg set` cannot express a key containing a literal dot, see [Getting started](#getting-started).
- **`rxjs`**: `ng new` writes `~7.8.0`, PO UI peers on `~7.8.1`. `~7.8.0` does resolve to a satisfying 7.8.x, but pinning `~7.8.1` matches the peer exactly and costs nothing.
- **Three peers `ng new` does not create**: `@angular/animations`, `@angular/platform-browser-dynamic` and `@angular/cdk`. npm 21 prints a *deprecated* warning for the first two (Angular is phasing them out in v22) — they are still required peers of PO UI 21, so install them anyway.
- `@angular-devkit/build-angular` is the **legacy** builder. A v21 workspace uses `@angular/build` — do not add the devkit package to a fresh project.
- The three `@po-ui/*` runtime packages must be on the **same patch version** — `ng-components`, `style` and `ng-templates` are released in lockstep.
- Before pinning a version for a different Angular major, read the actual peer range rather than guessing:
  `npm view @po-ui/ng-components@<major> peerDependencies`

## Live documentation

The static catalog in this skill is a snapshot of **21.30.1**. Component `@Input`/`@Output` surfaces change between minors, so for anything not spelled out in `references/`, get the current answer instead of guessing:

1. **Official MCP server (preferred).** `@po-ui/mcp` queries po-ui.io at run time — list APIs and guides, fetch a resource's full docs, search across all of it. Add it to the project:
   ```bash
   claude mcp add po-ui -- npx -y @po-ui/mcp
   ```
   or in `.mcp.json`:
   ```json
   { "mcpServers": { "po-ui": { "command": "npx", "args": ["-y", "@po-ui/mcp"] } } }
   ```
   Requires Node 18+ and network access to `po-ui.io` and `raw.githubusercontent.com`.
2. **The source, via raw.githubusercontent.** `po-ui.io/documentation` is an Angular SPA — plain HTTP fetches return the loading shell, not the docs, so do not try to scrape it. Read the repo instead:
   - interfaces: `projects/ui/src/lib/components/<component>/interfaces/*.interface.ts`
   - templates:  `projects/templates/src/lib/components/<component>/interfaces/*.interface.ts`
   - guides:     `docs/guides/*.md`
   - samples:    `.../<component>/samples/` — every component ships runnable examples, the fastest way to see idiomatic usage.

## When to use this skill

- Any Angular file that imports from `@po-ui/*`, or any request to build/alter a PO UI screen.
- Choosing between a hand-built page and a dynamic template → see [Which page component](#which-page-component).
- Wiring a PO UI screen to a back-end → the components impose a specific REST contract; see `references/api-contract.md`. **This matters in this repo**: a Protheus TLPP endpoint must be written to that shape or `po-table`/`po-lookup`/`po-page-dynamic-table` silently show nothing.
- Packaging the app to run **inside** Protheus (`FWCallApp`, `.app`, the AdvPL bridge) → [protheus-integration.md](references/protheus-integration.md).
- Reviewing PO UI code → see [Gotchas](#gotchas).
- Writing a screen from scratch → [patterns.md](references/patterns.md) has working recipes for the app shell, a paged list, a full dynamic CRUD, forms, lookup, notifications and theming.

Not for: generic Angular questions with no PO UI involvement, or the AdvPL/TLPP back-end itself (`advpl-gworks`, `tlpp-rest-endpoint-generator`).

## Getting started

**Angular 21 scaffolds zoneless by default and PO UI does not run zoneless** (it peers on `zone.js` and its components rely on Zone change detection). `--zoneless=false` is not optional:

```bash
# no global install needed — npx pins the CLI major for this command
npx -y @angular/cli@21 new my-po-project \
  --style=css --routing=true --ssr=false \
  --zoneless=false \
  --skip-install --package-manager=npm \
  --ai-config=none --skip-git --defaults
```

The last three flags are what make this safe to run unattended: **`--ai-config=none`** answers the "Which AI tools do you want to configure?" prompt that Angular 21 otherwise raises (it will hang an agent run), `--defaults` suppresses the rest, and **`--skip-git`** stops `ng new` from initialising a nested repo — drop that one when the app really is its own repository. To put the app in a directory whose name differs from the npm package name (e.g. a PascalCase folder inside a Protheus workspace), add `--directory=MyFolderName` and keep the project name itself lower-kebab.

Then, rather than `ng add`, wire it by hand — three steps, all deterministic:

```bash
cd my-po-project

# Pin zone.js BEFORE installing anything — see the version matrix.
# Do NOT use `npm pkg set dependencies.zone.js=...` — npm's dot-separated path
# syntax treats every `.` as a nesting separator with no escape for a literal
# one (npm 11.17.0: neither `zone\.js` nor `["zone.js"]` works — both still
# split, or land the backslash/quotes inside the key). Edit the JSON directly:
node -e "
const fs = require('fs');
const p = JSON.parse(fs.readFileSync('package.json', 'utf8'));
p.dependencies['zone.js'] = '~0.15.0';
fs.writeFileSync('package.json', JSON.stringify(p, null, 2) + '\n');
"
grep '"zone.js"' package.json          # must show "~0.15.0"

# Then install — one resolution pass, no ERESOLVE.
npm i @po-ui/ng-components@21.30.1 @po-ui/style@21.30.1 @po-ui/ng-templates@21.30.1 \
      @angular/animations@^21.2.0 @angular/cdk@^21.2.0 @angular/platform-browser-dynamic@^21.2.0
```

**The order matters.** After `--skip-install` nothing is on disk yet, so the first `npm i` resolves the whole tree at once — with `zone.js` still at `~0.16.0` that pass hits the PO UI peer conflict. Pin first and the install goes through clean.

1. **Theme** — add to `angular.json` → `architect.build.options.styles`, *before* `src/styles.css`:
   `"node_modules/@po-ui/style/css/po-theme-default.min.css"`
2. **Providers** — `provideAnimations()` and, when the app talks REST, `PoHttpRequestInterceptorService` (see [patterns.md](references/patterns.md)).
3. **Budgets** — PO UI alone is ~3 MB raw / ~600 kB transferred. The default production budget (`maximumError: 1MB` on `initial`) **fails the build**. Raise it in `angular.json` to something like `maximumWarning: 4MB` / `maximumError: 6MB`, or the first `ng build` breaks with `bundle initial exceeded maximum budget`.

`ng add @po-ui/ng-components` still exists and also offers a `sidemenu` schematic that replaces `AppComponent` with a toolbar + side menu shell. It is interactive (bad for scripted/agent runs) and was not re-verified on Angular 21 — the manual path above is what was actually built and compiled.

**Angular 19+ build system:** if `ng serve` fails with `Could not find the @angular/build:dev-server builder's package`, the project is on the new builder but missing the package — `npm i -D @angular/build`. Check `angular.json`: a `@angular/build:*` builder requires `@angular/build`; `@angular-devkit/build-angular` is the legacy path.

## Schematics

```bash
ng generate @po-ui/ng-components:<name>    # sidemenu | po-page-list | po-page-default
                                           # po-page-edit | po-page-detail
ng generate @po-ui/ng-templates:<name>     # po-page-dynamic-table | po-page-dynamic-detail | po-page-dynamic-edit
                                           # po-page-dynamic-search | po-page-job-scheduler | po-page-login
                                           # po-page-change-password | po-page-blocked-user
```

(Names taken from each package's `schematics/collection.json` — that file is the authority if a name ever fails.)

Append `--help` to any of them for the available options. Prefer generating over hand-writing the boilerplate — the schematic wires the routing module and the component skeleton consistently.

## Which page component

| Need | Use |
|---|---|
| List screen, full control over the table and actions | `po-page-list` + `po-table` |
| CRUD list driven by a field list and a REST endpoint, minimal code | `po-page-dynamic-table` (templates) |
| Create/edit form, full control | `po-page-edit` + `po-dynamic-form` or explicit `po-*` fields |
| Create/edit form driven by a field list + endpoint | `po-page-dynamic-edit` (templates) |
| Read-only record detail | `po-page-detail`, or `po-page-dynamic-detail` for the metadata-driven version |
| Search-first screen (filter, then results) | `po-page-dynamic-search` |
| Anything else — dashboard, wizard, free-form | `po-page-default` |
| Login / password recovery / blocked user / change password | `po-page-login`, `po-modal-password-recovery`, `po-page-blocked-user`, `po-page-change-password` |
| Scheduling a recurring back-end process | `po-page-job-scheduler` |

Rule of thumb: reach for a **dynamic** template when the screen really is "a list/form over an endpoint". The moment the layout or behaviour stops being uniform, the `po-page-*` + explicit components route is less fighting than bending the dynamic one.

## Component catalog

Full API detail in [components-reference.md](references/components-reference.md); the dynamic templates in [templates-reference.md](references/templates-reference.md); copy-ready code for the common screens in [patterns.md](references/patterns.md).

**Layout / containers** — `po-page-default` `po-page-list` `po-page-edit` `po-page-detail` `po-page-slide` `po-page-header` `po-page-content` `po-container` `po-divider` `po-grid` `po-widget` `po-accordion` `po-tabs` `po-context-tabs` `po-stepper` `po-slide`

**Navigation** — `po-menu` `po-menu-panel` `po-toolbar` `po-navbar` `po-breadcrumb` `po-context-menu` `po-dropdown` `po-link` `po-header` `po-logo`

**Form fields** (`po-field/*`) — `po-input` `po-number` `po-decimal` `po-email` `po-url` `po-password` `po-textarea` `po-rich-text` `po-select` `po-combo` `po-multiselect` `po-lookup` `po-listbox` `po-checkbox` `po-checkbox-group` `po-radio` `po-radio-group` `po-switch` `po-datepicker` `po-datepicker-range` `po-datetimepicker` `po-timepicker` `po-upload` `po-login` `po-search-ai` `po-clean`

**Data display** — `po-table` `po-list-view` `po-tree-view` `po-chart` `po-gauge` `po-progress` `po-info` `po-label` `po-tag` `po-badge` `po-avatar` `po-image` `po-icon` `po-timer` `po-calendar`

**Feedback / overlay** — `po-modal` `po-popover` `po-popup` `po-toaster` `po-loading` `po-overlay` `po-skeleton` `po-helper` `po-disclaimer` `po-disclaimer-group` `po-filter-chip` `po-search`

**Actions** — `po-button` `po-button-group`

**Dynamic** — `po-dynamic-form` `po-dynamic-view` (build a form/view from a field array instead of markup)

**Services** — `PoNotificationService` `PoDialogService` `PoI18nService` `PoThemeService` `PoLanguageService` `PoMediaQueryService` `PoDateService` `PoColorService` `PoControlPositionService` `PoActiveOverlayService` `PoComponentInjectorService` `PoUserGuideService`

**Directives** — `[p-tooltip]` plus the template directives that customise other components: `[p-table-column-template]` `[p-table-cell-template]` `[p-table-row-template]` `[pFrozenColumn]` `[p-combo-option-template]` `[p-multiselect-option-template]` `[p-list-view-content-template]` `[p-list-view-detail-template]` `[p-menu-header-template]` `[p-slide-content-template]` `[p-upload-drag-drop]`

**Pipes** — `poDecimalFormat`, `po_time`, `poI18n` (note the exact names: there is no `poDecimal` and no `poTime`)

**Interceptors** — `PoHttpRequestInterceptorService` (maps the standard error envelope to a toaster/dialog automatically), `PoHttpInterceptorService` (the lower-level hook). Both end in `Service` — importing `PoHttpRequestInterceptor` does not compile.

## Conventions

- **Selectors** are `po-*`; **classes/interfaces/enums** are `PoPascalCase`. A component's config object is almost always an interface named after it: `po-table` → `PoTableColumn`, `PoTableAction`; `po-menu` → `PoMenuItem`; `po-page-*` → `PoPageAction`, `PoBreadcrumb`.
- **Inputs use the `p-` prefix in templates**, without it in TypeScript: `<po-table [p-columns]="columns">` binds to `@Input('p-columns') columns`. Getting this wrong is the single most common PO UI mistake — the binding silently does nothing.
- **Grid**: `@po-ui/style` ships a 12-column grid — `po-row` + `po-sm-12 po-md-6 po-lg-4 po-xl-3`, with `po-offset-*` and `po-push-*`. Use it rather than importing another grid.
- **Icons — PO UI 21 uses the Animalia set, not `po-icon-*`.** Anywhere a component takes an icon (`PoMenuItem.icon`, `PoPageAction.icon`, `po-icon`'s `p-icon`, `po-button`'s `p-icon`), pass either:
  - a **token** from `AnimaliaIconDictionary`: `'ICON_REFRESH'`, `'ICON_SEARCH'`, `'ICON_DELETE'`, `'ICON_EDIT'`, `'ICON_FILTER'`, `'ICON_INFO'`, `'ICON_PLUS'`, `'ICON_CLOSE'`… (the dictionary lives in the `@po-ui/ng-components` bundle; `grep -o "ICON_[A-Z_]*: '[^']*'" node_modules/@po-ui/ng-components/fesm2022/*.mjs` lists all of them with their classes), or
  - the **class pair** directly: `'an an-arrow-clockwise'`, `'an an-chart-bar'`, `'an-fill an-x-circle'` for the filled variant. ~1560 `an-*` glyphs ship in the theme CSS: `grep -o "an-[a-z0-9-]*" node_modules/@po-ui/style/css/po-theme-default.min.css | sort -u`.

  The legacy `po-icon-*` classes are **gone** from the theme (5 leftovers, none of them glyphs). `icon: 'po-icon-refresh'` compiles, renders nothing, and gives no error — the single most likely reason an icon is "missing".
- **PO UI components are NOT standalone** — every concrete component is declared `standalone: false` and exported by an NgModule, even on 21.x. (The abstract `Po*BaseComponent` classes are marked standalone, but they are base classes, never used in a template.) Consume them by importing a **module**, never the component class:
  - `PoModule` — everything (components, directives, pipes, services, interceptors, guards). Simplest, largest surface.
  - Granular modules — `PoTableModule`, `PoFieldModule`, `PoPageModule`, `PoButtonModule`, `PoMenuModule`, `PoModalModule`, `PoWidgetModule`, `PoChartModule`, `PoDynamicModule`, ... (full list in `references/components-reference.md`). Preferred in a standalone-component app.
  - `PoTemplatesModule` — the `@po-ui/ng-templates` pages.

  A **standalone Angular component imports these NgModules** in its `imports` array — that is the normal shape on 21.x:
  ```ts
  @Component({ selector: 'app-clientes', imports: [PoPageModule, PoTableModule], templateUrl: './clientes.component.html' })
  ```
  `imports: [PoTableComponent]` will not compile.
- **Literals / i18n**: most components accept a `p-literals` object to override built-in strings, and `PoI18nService` handles application-level translation. Prefer `p-literals` for one-off label overrides.
- **Theming**: `PoThemeService` (`setTheme`, `changeCurrentThemeType`, `setDensityMode`, `getThemeActive`, `cleanThemeActive`) switches light/dark and density at run time. Do not hand-edit the theme CSS.

## Gotchas

1. **The `p-` prefix.** `[columns]` instead of `[p-columns]` compiles fine in a template with no matching `@Input` only when strict template checking is off — and then renders an empty component. Check this first when a component "does nothing".
   Same family: a **boolean input still needs a binding**. `p-no-shadow` written bare passes the *string* `""` and fails Angular 21's strict template check (`Type 'string' is not assignable to type 'boolean'`). Write `[p-no-shadow]="true"`.
2. **The collection envelope is mandatory.** `po-table` with `p-load`/`po-lookup`/`po-page-dynamic-*` expect `{ "hasNext": boolean, "items": [...] }`. A bare `[...]` array from the endpoint yields an empty grid with no error. See `references/api-contract.md`.
3. **`hasNext` drives infinite scroll and "load more".** Returning it wrong (always `true`) makes the UI loop; omitting it disables paging entirely.
4. **Version lockstep.** `@po-ui/style` on a different patch than `@po-ui/ng-components` produces subtly broken styling rather than an install error.
5. **Dynamic templates own the HTTP calls.** When you pass `p-service-api`, the component issues the requests itself — do not also fetch in `ngOnInit`. Use the `beforeXxx` hooks to intervene.
6. **`po-lookup` needs both a display and a value field** (`p-field-label`, `p-field-value`) plus either `p-filter-service` (a URL or a `PoLookupFilter`) — a plain array is not enough.
7. **Do not scrape po-ui.io.** It is a client-rendered SPA; a fetch returns "Carregando ...". Use the MCP server or `raw.githubusercontent.com`.
8. **`po-code-editor` is a separate, heavy package.** Do not add `@po-ui/ng-code-editor` unless a code editor is actually required.
9. **Never import a PO UI component class.** They are `standalone: false`, so `imports: [PoTableComponent]` fails to compile. Import `PoTableModule` (or `PoModule`) instead — including inside standalone components.
10. **Icons are `an-*`, not `po-icon-*`** — see [Conventions](#conventions). Silent failure.
11. **Angular 21 `ng new` is zoneless and writes `zone.js@~0.16`** — both break PO UI. `--zoneless=false` and pin `zone.js@~0.15.0`, *before* the first install. **`npm pkg set` cannot do this pin** — its path syntax has no way to escape a literal `.` in a key, so `npm pkg set dependencies.zone.js="~0.15.0"` always misparses `zone.js` as nesting and writes a bogus `"zone": { "js": ... }`, leaving the real `zone.js` at `~0.16.0`. It fails silently (exit 0, no warning), so the ERESOLVE you were trying to avoid shows up on the next install anyway. Edit `package.json` directly instead — see [Getting started](#getting-started).
12. **The default production budget fails the build** the moment PO UI is in the bundle. Raise `initial` in `angular.json` before the first `ng build`.
13. **The master/detail column must be named `detail`.** `po-table` finds the detail column by `type: 'detail'` and reads the rows from `row[column.property]` — but the columns manager has code paths that look for `property === 'detail'` literally. Naming it anything else (`detalhes`, `items`) works until someone reorders columns. Keep `property: 'detail'` and name the array field `detail` in the model.
14. **`po-menu` throws on teardown in a test that never ran change detection.** `PoMenuComponent.ngOnDestroy` calls `itemSubscription.unsubscribe()` / `routeSubscription.unsubscribe()` with no guard, but both are only assigned in `ngOnInit` — so destroying a fixture that never called `detectChanges()` dies with `Cannot read properties of undefined (reading 'unsubscribe')`, blamed on whichever test created the fixture. Call `fixture.detectChanges()` in every spec that instantiates a component containing `po-menu`. See [patterns.md](references/patterns.md#testing).

## Protheus integration

A PO UI app can relate to Protheus in two ways, and they need different things:

| Mode | Description | Reference |
|---|---|---|
| **Standalone web app** | Ordinary Angular app on a web server, calling TLPP REST endpoints. | [api-contract.md](references/api-contract.md) |
| **Embedded Protheus app** | Packaged as a `.app`, opened from SmartClient by `FWCallApp`, with a live channel to the AdvPL layer and access to the real ERP session (company, branch, module, user, token). | [protheus-integration.md](references/protheus-integration.md) |

The embedded mode adds `@totvs/protheus-lib-core` (+ `@totvs/po-theme`, `subsink`, `@totvs/common-assets`) and the `ProAppConfigService` / `ProJsToAdvplService` / `ProSessionInfoService` family. **`@totvs/protheus-lib-core` is only published for Angular 14, 15, 17, 19 and 21** — there is no 16, 18 or 20 build, so it constrains the Angular version for that mode.

Either way the REST side is the same. Two things to get right, both detailed in [api-contract.md](references/api-contract.md):

- **Response shape.** A TLPP endpoint feeding a PO UI list must emit `{"hasNext": ..., "items": [...]}` and the `{code, message, detailedMessage}` error envelope — not the bare `{"data": [...]}` some in-house APIs use. Reuse `tlpp-rest-endpoint-generator` for the endpoint and this skill for the contract.
- **Query parameters.** PO UI sends `page`, `pageSize`, `order` (with `-` for descending) and `property=value` filters. Map `page`/`pageSize` onto the SQL pagination and always compute `hasNext` by asking for one row more than `pageSize`.

## Related skills

- `tlpp-rest-endpoint-generator` — the TLPP side of the endpoint PO UI consumes.
- `advpl-gworks` — the AdvPL/TLPP library backing those endpoints.
- `query-builder` — the SQL behind the paginated list.
