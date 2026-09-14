# `@po-ui/ng-templates` — page templates

Verified against 21.30.1 (`projects/templates/src/lib/components/*`).

Ten components: the five dynamic CRUD pages, the four authentication pages, and the job scheduler.

| Component | Purpose |
|---|---|
| `po-page-dynamic-table` | List + CRUD driven by a field array and an endpoint. |
| `po-page-dynamic-edit` | Create/edit form from the same field array. |
| `po-page-dynamic-detail` | Read-only record view. |
| `po-page-dynamic-search` | Filter-first screen: search, then results. |
| `po-page-job-scheduler` | Create/update scheduled back-end processes. |
| `po-page-login` | Login screen (user, password, recovery, remember-me, side art). |
| `po-page-change-password` | Set / change password. |
| `po-page-blocked-user` | Blocked-account screen. |
| `po-modal-password-recovery` | Password-recovery modal, pairs with `po-page-login`. |
| `po-page-background` | The split background layout the auth pages sit on. |

## The dynamic pages

### How they work

You give the component a **field list** and a **`p-service-api`** URL. It then owns the HTTP traffic itself — list, read, create, update, delete — against the [collection contract](api-contract.md). You do **not** fetch in `ngOnInit`; you intervene through `p-actions` and the `beforeXxx` hooks.

```
GET    {serviceApi}?page=1&pageSize=20&<filters>   → { hasNext, items }
GET    {serviceApi}/{id}                           → entity
POST   {serviceApi}                                → entity
PUT    {serviceApi}/{id}                           → entity
DELETE {serviceApi}/{id}
```

### `po-page-dynamic-table`

```html
<po-page-dynamic-table
  p-title="Clientes"
  p-service-api="/api/v1/clientes"
  [p-fields]="fields"
  [p-actions]="actions"
  [p-table-custom-actions]="tableActions"
  [p-page-custom-actions]="pageActions"
  p-quick-search-width="3">
</po-page-dynamic-table>
```

**`PoPageDynamicTableField`** extends `PoTableColumn` **and** `PoDynamicFormField` — one entry describes both the grid column and the form control. Its own additions:

| Property | Type | Notes |
|---|---|---|
| `filter` | `boolean` | include this field in the advanced filter. |
| `duplicate` | `boolean` | carry the value over when duplicating a record. |
| `sortable` | `boolean` | allow sorting on the column. |
| `width` | `number \| string` | column width. |
| `labels` | `Array<PoTableColumnLabel>` | status-style coloured labels. |
| `allowColumnsManager` | `boolean` | expose the field in the column manager. |

Everything else comes from the two parents — `property` (required), `label`, `type`, `key`, `visible`, `required`, `options`, `optionsService`, `searchService`, `mask`, `format`, `gridColumns`, and so on. See [components-reference.md](components-reference.md#podynamicformfield).

**`PoPageDynamicTableActions`** — each entry is either a **route string** (the component navigates there) or a **function** (you handle it):

| Property | Signature |
|---|---|
| `new` | `string \| Function` |
| `edit` | `string \| ((id, resource) => {...})` |
| `detail` | `string \| ((id, resource) => void)` |
| `duplicate` | `string \| ((resource) => void)` |
| `remove` | `boolean \| ((id, resource) => boolean)` |
| `removeAll` | `boolean \| ((resources) => Array<any>)` |
| `beforeNew` | `string \| (() => PoPageDynamicTableBeforeNew)` |
| `beforeEdit` | `string \| ((id, resource) => PoPageDynamicTableBeforeEdit)` |
| `beforeDetail` | `string \| ((id?, resource?) => PoPageDynamicTableBeforeDetail)` |
| `beforeDuplicate` | `string \| ((key, resource) => PoPageDynamicTableBeforeDuplicate)` |
| `beforeRemove` | `string \| ((id?, resource?) => PoPageDynamicTableBeforeRemove)` |
| `beforeRemoveAll` | `string \| ((resources?) => PoPageDynamicTableBeforeRemoveAll)` |

The `beforeXxx` hooks run **before** the built-in behaviour and can cancel or redirect it (return `{ allowAction: false }`, a `newUrl`, or a modified `resource`). That is the intended place for confirmations, permission checks and payload tweaks — not a wrapper component.

Also available: `p-table-custom-actions` (`PoPageDynamicTableCustomTableAction[]`, per-row) and `p-page-custom-actions` (`PoPageDynamicTableCustomAction[]`, in the page header), plus `PoPageDynamicTableFilters` for the advanced-filter definition and `PoPageDynamicTableOptions` / `p-load` for loading the whole configuration from a metadata endpoint instead of hard-coding it.

### `po-page-dynamic-edit`

Same field array, form-shaped.

**`PoPageDynamicEditActions`:**

| Property | Signature |
|---|---|
| `save` | `string \| ((resource, id) => void)` |
| `saveNew` | `string \| ((resource, id?) => void)` — save and start a new record |
| `cancel` | `string \| boolean \| Function` |
| `beforeSave` | `string \| ((resource, id) => PoPageDynamicEditBeforeSave)` |
| `beforeSaveNew` | `string \| ((resource, id) => PoPageDynamicEditBeforeSaveNew)` |
| `beforeCancel` | `string \| (() => PoPageDynamicEditBeforeCancel)` |

Use `beforeSave` to validate or enrich the payload; returning `{ allowAction: false }` blocks the write.

### `po-page-dynamic-detail`, `po-page-dynamic-search`

`po-page-dynamic-detail` renders a read-only view of one record (`p-service-api`, `p-fields`, `p-keys`, `p-actions` with `edit`/`remove`/`back`).

`po-page-dynamic-search` shows filters first and results after — for screens where an unfiltered list is too expensive or meaningless. It exposes the search actions and leaves the result rendering to you.

### Metadata mode

All four dynamic pages accept `p-load` — a URL or a function returning `PoPageDynamic*Options`. The endpoint returns the fields, actions, title and breadcrumb, so the screen's shape is defined server-side and can change without a front-end deploy. Powerful, but it means the screen is only debuggable with the endpoint in hand; use it when the configuration genuinely needs to be dynamic, not by default.

## `po-page-job-scheduler`

Create and update schedules for back-end processes (nightly payroll, batch integration). Point `p-service-api` at an endpoint that persists the schedule; the component renders the recurrence UI and the parameter form and posts the resulting schedule object. Avoid hand-rolling a cron picker.

## Authentication pages

`po-page-login` handles user/password entry, "remember user", recovery and a custom highlight area (`p-product-name`, `p-background`, `p-literals`, `p-authentication-url` or `(p-login-submit)`). Setting `p-authentication-url` makes the component do the POST itself; binding `(p-login-submit)` gives you the credentials and leaves the call to you.

`po-modal-password-recovery` supports e-mail, SMS and "all" recovery types and is meant to be opened from `po-page-login`'s recovery action.

`po-page-blocked-user` and `po-page-change-password` are the two follow-up screens; both are configuration-only.

All four sit on `po-page-background`, which is why they share the split-screen look.
