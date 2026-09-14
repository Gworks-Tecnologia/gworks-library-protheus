---
name: po-ui
description: "Build Angular front-ends with PO UI, the TOTVS open-source component library (packages `@po-ui/ng-components`, `@po-ui/ng-templates`, `@po-ui/style`, `@po-ui/ng-code-editor`, `@po-ui/ng-sync`, `@po-ui/ng-storage`). Covers the version matrix against Angular, the `ng add`/`ng generate` schematics, the full component catalog (po-table, po-field family, po-page family, po-menu, po-toolbar, po-modal, po-chart, po-widget...), the dynamic CRUD templates (po-page-dynamic-table / -edit / -detail / -search, po-page-login, po-page-job-scheduler), the services (PoNotificationService, PoDialogService, PoI18nService, PoThemeService), and the REST contract those components expect (hasNext/items, page/pageSize, order, error envelope) including how to serve it from a Protheus TLPP endpoint. Use whenever the user says 'po-ui', 'poui', 'PO UI', 'portinari', 'po-table', 'po-page-dynamic-table', 'cria uma tela PO UI', 'CRUD Angular TOTVS', 'tela Angular para o Protheus', or when writing/reviewing Angular code that imports from @po-ui/*."
license: Internal
metadata:
  domain: Angular / TOTVS PO UI
  maintainer: Gworks - Giovani
  category: Frontend Framework Reference
  verified_against: "@po-ui/* 21.30.1 (source: github.com/po-ui/po-angular, master)"
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

## Version matrix — check this first

PO UI `21.x` pairs with Angular `21.x`. **Never mix majors.** The verified-good set for this project:

```jsonc
// dependencies
"@angular/animations":               "~21.2.17",
"@angular/common":                   "~21.2.17",
"@angular/compiler":                 "~21.2.17",
"@angular/core":                     "~21.2.17",
"@angular/forms":                    "~21.2.17",
"@angular/platform-browser":         "~21.2.17",
"@angular/platform-browser-dynamic": "~21.2.17",
"@angular/router":                   "~21.2.17",
"@angular/cdk":                      "^21",        // peer of @po-ui/ng-components
"@po-ui/ng-components":              "21.30.1",
"@po-ui/style":                      "21.30.1",    // must match ng-components exactly
"@po-ui/ng-templates":               "21.30.1",    // must match ng-components exactly
"rxjs":                              "~7.8.1",
"tslib":                             "^2.6.2",
"zone.js":                           "~0.15.0",

// devDependencies
"@angular-devkit/build-angular":     "~21.2.17",
"@angular-devkit/schematics":        "~21.2.17",
"@angular/cli":                      "~21.2.17",
"@angular/compiler-cli":             "~21.2.17",
"typescript":                        "~5.9.3"
```

- **Node**: 20.11.x or newer.
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
- Reviewing PO UI code → see [Gotchas](#gotchas).
- Writing a screen from scratch → [patterns.md](references/patterns.md) has working recipes for the app shell, a paged list, a full dynamic CRUD, forms, lookup, notifications and theming.

Not for: generic Angular questions with no PO UI involvement, or the AdvPL/TLPP back-end itself (`advpl-gworks`, `tlpp-rest-endpoint-generator`).

## Getting started

```bash
npm i -g @angular/cli@21
ng new my-po-project --skip-install
cd my-po-project && npm install
ng add @po-ui/ng-components      # installs, configures the theme, imports the module,
                                 # optionally scaffolds toolbar + menu + po-page-default
ng add @po-ui/ng-templates       # only if you need the dynamic pages / login templates
ng serve
```

`ng add` asks whether to replace `AppComponent` with a starter shell (toolbar + side menu + `po-page-default`). Answering `Y` is the fastest way to a working layout.

**Angular 19+ build system:** if `ng serve` fails with `Could not find the @angular/build:dev-server builder's package`, the project is on the new builder but missing the package — `npm i -D @angular/build`. Check `angular.json`: a `@angular/build:*` builder requires `@angular/build`; `@angular-devkit/build-angular` is the legacy path.

## Schematics

```bash
ng generate @po-ui/ng-components:<name>    # po-page-list | po-page-default | po-page-edit | po-page-detail
ng generate @po-ui/ng-templates:<name>     # po-page-dynamic-table | po-page-dynamic-detail | po-page-dynamic-edit
                                           # po-page-dynamic-search | po-page-job-scheduler | po-page-login
                                           # po-page-change-password | po-page-blocked-user
```

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

**Directives** — `p-tooltip` (the only one; everything else is a component)

**Pipes** — `poDecimal` `poTime`

**Interceptors** — `PoHttpRequestInterceptor` (maps the standard error envelope to a toaster/dialog automatically), `PoHttpInterceptor`

## Conventions

- **Selectors** are `po-*`; **classes/interfaces/enums** are `PoPascalCase`. A component's config object is almost always an interface named after it: `po-table` → `PoTableColumn`, `PoTableAction`; `po-menu` → `PoMenuItem`; `po-page-*` → `PoPageAction`, `PoBreadcrumb`.
- **Inputs use the `p-` prefix in templates**, without it in TypeScript: `<po-table [p-columns]="columns">` binds to `@Input('p-columns') columns`. Getting this wrong is the single most common PO UI mistake — the binding silently does nothing.
- **Grid**: `@po-ui/style` ships a 12-column grid — `po-row` + `po-sm-12 po-md-6 po-lg-4 po-xl-3`, with `po-offset-*` and `po-push-*`. Use it rather than importing another grid.
- **Icons**: PO UI icon strings (e.g. `po-icon-user`, `ICON_ANIMATE`) or an `<ng-template>`; `po-icon` renders one standalone.
- **PO UI components are NOT standalone** — every one is declared `standalone: false` and exported by an NgModule, even on 21.x. Consume them by importing a **module**, never the component class:
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
2. **The collection envelope is mandatory.** `po-table` with `p-load`/`po-lookup`/`po-page-dynamic-*` expect `{ "hasNext": boolean, "items": [...] }`. A bare `[...]` array from the endpoint yields an empty grid with no error. See `references/api-contract.md`.
3. **`hasNext` drives infinite scroll and "load more".** Returning it wrong (always `true`) makes the UI loop; omitting it disables paging entirely.
4. **Version lockstep.** `@po-ui/style` on a different patch than `@po-ui/ng-components` produces subtly broken styling rather than an install error.
5. **Dynamic templates own the HTTP calls.** When you pass `p-service-api`, the component issues the requests itself — do not also fetch in `ngOnInit`. Use the `beforeXxx` hooks to intervene.
6. **`po-lookup` needs both a display and a value field** (`p-field-label`, `p-field-value`) plus either `p-filter-service` (a URL or a `PoLookupFilter`) — a plain array is not enough.
7. **Do not scrape po-ui.io.** It is a client-rendered SPA; a fetch returns "Carregando ...". Use the MCP server or `raw.githubusercontent.com`.
8. **`po-code-editor` is a separate, heavy package.** Do not add `@po-ui/ng-code-editor` unless a code editor is actually required.
9. **Never import a PO UI component class.** They are `standalone: false`, so `imports: [PoTableComponent]` fails to compile. Import `PoTableModule` (or `PoModule`) instead — including inside standalone components.

## Protheus back-end integration

This repository is a Protheus/AdvPL library, so PO UI screens here are usually fronting TLPP REST endpoints. Two things to get right, both detailed in `references/api-contract.md`:

- **Response shape.** A TLPP endpoint feeding a PO UI list must emit `{"hasNext": ..., "items": [...]}` and the `{code, message, detailedMessage}` error envelope — not the bare `{"data": [...]}` some in-house APIs use. Reuse `tlpp-rest-endpoint-generator` for the endpoint and this skill for the contract.
- **Query parameters.** PO UI sends `page`, `pageSize`, `order` (with `-` for descending) and `property=value` filters. Map `page`/`pageSize` onto the SQL pagination and always compute `hasNext` by asking for one row more than `pageSize`.

## Related skills

- `tlpp-rest-endpoint-generator` — the TLPP side of the endpoint PO UI consumes.
- `advpl-gworks` — the AdvPL/TLPP library backing those endpoints.
- `query-builder` — the SQL behind the paginated list.
