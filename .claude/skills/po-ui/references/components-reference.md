# `@po-ui/ng-components` — component & service reference

Verified against 21.30.1 (`projects/ui/src/lib/*`). Component lists are complete for that version; property tables cover the ones you reach for constantly. For anything else, query the `@po-ui/mcp` server or read `projects/ui/src/lib/components/<name>/` — every component ships a `samples/` folder.

**Reminder:** template inputs carry the `p-` prefix (`[p-columns]`), TypeScript members do not.

## Modules — what to import

Components are `standalone: false`. Import a module, never a component class. A standalone Angular component puts these in its own `imports` array.

`PoModule` pulls in everything. The granular modules, exactly as exported by `@po-ui/ng-components`:

```
PoAccordionModule    PoAvatarModule       PoBadgeModule        PoBreadcrumbModule
PoButtonGroupModule  PoButtonModule       PoCalendarModule     PoChartModule
PoContainerModule    PoContextMenuModule  PoContextTabsModule  PoDisclaimerGroupModule
PoDisclaimerModule   PoDividerModule      PoDropdownModule     PoDynamicModule
PoFieldModule        PoFilterChipModule   PoGaugeModule        PoGridModule
PoHeaderModule       PoHelperModule       PoIconModule         PoImageModule
PoInfoModule         PoLabelModule        PoLinkModule         PoListBoxModule
PoListViewModule     PoLoadingModule      PoLogoModule         PoMenuModule
PoMenuPanelModule    PoModalModule        PoNavbarModule       PoOverlayModule
PoPageModule         PoPageSlideModule    PoPopoverModule      PoPopupModule
PoProgressModule     PoSearchModule       PoSkeletonModule     PoSlideModule
PoStepperModule      PoSwitchModule       PoTableModule        PoTabsModule
PoTagModule          PoTimerModule        PoToasterModule      PoToolbarModule
PoTreeViewModule     PoWidgetModule
```

Plus `PoDirectivesModule`, `PoPipesModule`, `PoServicesModule`, `PoInterceptorsModule`, `PoGuardsModule`, and `PoTemplatesModule` from `@po-ui/ng-templates`.

Two traps:
- **There is no `PoInputModule`/`PoSelectModule`/`PoLookupModule`.** Every `po-field/*` control lives in `PoFieldModule`.
- **`po-page-slide` has its own module** (`PoPageSlideModule`); the other `po-page-*` components are in `PoPageModule`.

## po-table

The workhorse. Key inputs:

| Input | Type | Notes |
|---|---|---|
| `p-columns` | `Array<PoTableColumn>` | column definitions. |
| `p-items` | `Array<any>` | the rows. |
| `p-actions` | `Array<PoTableAction>` | per-row action menu. |
| `p-loading` | `boolean` | spinner overlay. |
| `p-show-more-disabled` | `boolean` | drives the "load more" button; tie to `!hasNext`. |
| `p-selectable` / `p-single-select` | `boolean` | selection mode. |
| `p-striped`, `p-hide-columns-manager`, `p-height`, `p-sort`, `p-virtual-scroll` | | presentation. |
| `p-literals` | `PoTableLiterals` | string overrides. |

Outputs: `(p-show-more)`, `(p-sort-by)`, `(p-selected)`, `(p-unselected)`, `(p-all-selected)`, `(p-collapsed)`, `(p-expanded)`.

### `PoTableColumn`

| Property | Type |
|---|---|
| `property` | `string` — must match the item's key exactly. |
| `label` | `string` |
| `type` | `string` — `string` `number` `currency` `date` `dateTime` `time` `boolean` `label` `link` `icon` `subtitle` `detail` `columnTemplate` `cellTemplate` |
| `format` | `string` — e.g. `'BRL'` for currency, `'dd/MM/yyyy'` for date. |
| `mask` | `string` |
| `width` | `string` |
| `visible` | `boolean` |
| `sortable` | `boolean` |
| `fixed` | `boolean` — freeze the column. |
| `color` | `string \| Function` |
| `disabled` | `Function` |
| `action` | `Function` — for `type: 'link'`. |
| `link` | `string` |
| `tooltip` | `string` |
| `boolean` | `PoTableBoolean` — labels for `true`/`false`. |
| `labels` | `Array<PoTableColumnLabel>` — for `type: 'label'`, the coloured-status pattern. |
| `icons` | `Array<PoTableColumnIcon>` |
| `subtitles` | `Array<PoTableSubtitleColumn>` |
| `detail` | `PoTableDetail` — the expandable master/detail row. |
| `searchAiIgnore` | `boolean` |

## Form fields

Everything under `po-field/`. Shared inputs across most of them: `p-label`, `p-help`, `p-placeholder`, `p-required`, `p-disabled`, `p-readonly`, `p-optional`, `p-clean`, `p-error-message`, `p-size`, plus `[(ngModel)]` / reactive-forms support.

| Component | Use it for |
|---|---|
| `po-input` | free text; `p-mask`, `p-pattern`, `p-maxlength`. |
| `po-number` / `po-decimal` | integers / decimals (`p-decimals-length`, `p-thousand-maxlength`). |
| `po-email`, `po-url`, `po-password` | typed text with built-in validation. |
| `po-textarea`, `po-rich-text` | multi-line / HTML. |
| `po-select` | small fixed option list (`p-options`, native select semantics). |
| `po-combo` | searchable list, local `p-options` **or** remote `p-filter-service` with infinite scroll. |
| `po-multiselect` | multiple choice, same local/remote split. |
| `po-lookup` | search a large remote collection through a modal; needs `p-field-label`, `p-field-value` and `p-filter-service`. |
| `po-checkbox`, `po-checkbox-group`, `po-radio`, `po-radio-group`, `po-switch` | booleans and small exclusive sets. |
| `po-datepicker`, `po-datepicker-range`, `po-datetimepicker`, `po-timepicker` | dates/times; `p-iso-format`, `p-min-date`, `p-max-date`. |
| `po-upload` | file upload; `p-url`, `p-restrictions`, `p-auto-upload`, `p-drag-drop`. |
| `po-login` | the username field with its own validation, used by `po-page-login`. |

**Choosing between `po-select`, `po-combo` and `po-lookup`:** a handful of fixed options → `po-select`; a list worth searching or served by an endpoint → `po-combo`; thousands of rows needing columns and filters → `po-lookup`.

## Dynamic form / view

`po-dynamic-form` builds a form from `p-fields: Array<PoDynamicFormField>`, `po-dynamic-view` renders the read-only equivalent. This is the mechanism the `po-page-dynamic-*` templates are built on, and it is usable directly whenever a form's shape is data-driven.

<a id="podynamicformfield"></a>
### `PoDynamicFormField`

Base (`PoDynamicField`): `property` (**required**), `label`, `type`, `visible`, `key`, `divider`, `container`, and the responsive grid keys `gridColumns` / `gridSmColumns` / `gridMdColumns` / `gridLgColumns` / `gridXlColumns`, `offset*Columns`, `grid*Pull`.

The field-specific additions are extensive; the ones that come up constantly:

- **validation** — `required`, `optional`, `showRequired`, `minLength`, `maxLength`, `minValue`, `maxValue`, `pattern`, `mask`, `errorMessage`, `validate` (`string | Function`), `errorAsyncFunction`.
- **options** — `options`, `optionsMulti`, `optionsService`, `fieldLabel`, `fieldValue`, `searchService` (lookup), `columns` (`PoLookupColumn[] | number`), `advancedFilters`.
- **presentation** — `placeholder`, `help`, `helper`, `additionalHelp`, `additionalHelpTooltip`, `icon`, `rows`, `size`, `order`, `disabled`, `readonly`, `clean`.
- **type-specific** — `decimalsLength`, `format`, `isoFormat`, `range`, `secret`, `booleanTrue` / `booleanFalse`, `locale`, `minTime` / `maxTime`, `restrictions`, `dragDrop`, `autoUpload`.
- **behaviour** — `changeOnEnter`, `debounceTime`, `infiniteScroll`, `params`, `formField`.

`type` accepts `string` `number` `boolean` `date` `dateTime` `time` `currency` (`PoDynamicFieldType`). Use `forceOptionsComponentType` / `forceBooleanComponentType` to override which control PO UI picks for a given type.

## Layout & navigation

| Component | Notes |
|---|---|
| `po-page-default` | generic page shell: `p-title`, `p-actions: PoPageAction[]`, `p-breadcrumb: PoBreadcrumb`. |
| `po-page-list` | list shell — adds `p-filter`, `p-disclaimer-group`, quick search. |
| `po-page-edit` | edit shell — save/cancel/save-new actions wired. |
| `po-page-detail` | detail shell — back/edit/remove. |
| `po-page-slide` | slide-in panel page. |
| `po-menu` | side menu from `p-menus: Array<PoMenuItem>`; `p-filter`, `p-collapsed`, `p-logo`. |
| `po-toolbar` | top bar: `p-title`, `p-actions`, `p-profile`, `p-notification-actions`. |
| `po-navbar`, `po-breadcrumb`, `po-tabs`, `po-context-tabs`, `po-stepper`, `po-accordion` | secondary navigation. |
| `po-widget` | dashboard card: `p-title`, `p-primary-label`, `p-help`, `p-no-shadow`. |
| `po-container`, `po-divider`, `po-grid` | structural. |

`PoMenuItem`: `label` (required), `action`, `link`, `icon`, `shortLabel`, `subItems`, `badge`, `id`, `type`, `level`.

`PoPageAction`: `label`, `action`, `url`, `disabled`, `visible`, `icon`, `selected`, `kind` (`primary` | `secondary` | `tertiary`).

## Feedback & overlay

| Component | Notes |
|---|---|
| `po-modal` | `p-title`, `p-primary-action`, `p-secondary-action`, `p-hide-close`, `p-size`; opened via a `@ViewChild` `.open()`. |
| `po-loading`, `po-loading-overlay` | spinners. |
| `po-popover`, `po-popup` | anchored content. |
| `po-toaster` | rendered by `PoNotificationService` — call the service, do not place the component. |
| `po-disclaimer` / `po-disclaimer-group` | the removable filter chips above a list. |
| `po-filter-chip`, `po-search` | filtering UI. |
| `po-skeleton` | loading placeholder. |
| `po-helper`, `po-info`, `po-label`, `po-tag`, `po-badge` | inline information. |

## Data visualisation

`po-chart` (`p-series: Array<PoChartSerie>`, `p-type`: `line` `bar` `column` `pie` `donut` `area` `gauge`, `p-categories`, `p-options`), `po-gauge`, `po-progress`, `po-list-view`, `po-tree-view`, `po-calendar`, `po-timer`.

The charts guide is `docs/guides/guide-charts.md` upstream.

## Services

| Service | API |
|---|---|
| `PoNotificationService` | `success(msg)`, `warning(msg)`, `error(msg)`, `information(msg)` — each takes `PoNotification \| string`; plus `setDefaultDuration(ms)`. |
| `PoDialogService` | `alert(PoDialogAlertOptions)`, `confirm(PoDialogConfirmOptions)`. Options carry `title`, `message`, `confirm`, `cancel`, `literals`. |
| `PoI18nService` | application translation; configured through `PoI18nModule.config({...})` with contexts and language files. |
| `PoThemeService` | `setTheme`, `applyTheme`, `getThemeActive`, `cleanThemeActive`, `changeCurrentThemeType`, `setCurrentThemeType`, `setDefaultTheme`, `setThemeType`, `getDensityMode`, `setDensityMode`, `persistThemeActive`. |
| `PoLanguageService` | current language / short language. |
| `PoMediaQueryService` | responsive breakpoint observation. |
| `PoDateService`, `PoColorService`, `PoControlPositionService`, `PoActiveOverlayService`, `PoComponentInjectorService`, `PoUserGuideService` | supporting services. |

`PoNotificationService` and `PoDialogService` are the correct way to talk to the user — do not use `window.alert`/`confirm`, and do not place a `po-toaster` by hand.

## Directives, pipes, interceptors

- **Directive:** `p-tooltip` (with `p-tooltip-position`) — the only directive in the library.
- **Pipes:** `poDecimal`, `poTime`.
- **Interceptors:** `PoHttpRequestInterceptor` turns the standard error envelope into a toaster/dialog automatically — register it once and error handling stops being per-call. `PoHttpInterceptor` is the lower-level hook.

## Other packages

- `@po-ui/ng-code-editor` — `po-code-editor` (Monaco). Separate install, heavy bundle.
- `@po-ui/ng-sync` + `@po-ui/ng-storage` — offline-first: define a schema, `PoSyncService` reconciles local storage with the server. Guides: `docs/guides/sync-fundamentals.md`, `sync-get-started.md`.
