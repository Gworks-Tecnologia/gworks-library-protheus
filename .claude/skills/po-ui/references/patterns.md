# PO UI patterns

Recipes for 21.x. All PO UI components are `standalone: false` — always import the **module**, even into a standalone Angular component.

## Available modules

```
PoModule                 // everything at once
PoAccordionModule PoAvatarModule PoBadgeModule PoBreadcrumbModule PoButtonGroupModule
PoButtonModule PoCalendarModule PoChartModule PoContainerModule PoContextMenuModule
PoContextTabsModule PoDisclaimerGroupModule PoDisclaimerModule PoDividerModule
PoDropdownModule PoDynamicModule PoFieldModule PoFilterChipModule PoGaugeModule
PoGridModule PoHeaderModule PoHelperModule PoIconModule PoImageModule PoInfoModule
PoLabelModule PoLinkModule PoListBoxModule PoListViewModule PoLoadingModule PoLogoModule
PoMenuModule PoMenuPanelModule PoModalModule PoNavbarModule PoOverlayModule PoPageModule
PoPageSlideModule PoPopoverModule PoPopupModule PoProgressModule PoSearchModule
PoSkeletonModule PoSlideModule PoStepperModule PoSwitchModule PoTableModule PoTabsModule
PoTagModule PoTimerModule PoToasterModule PoToolbarModule PoTreeViewModule PoWidgetModule

PoTemplatesModule        // @po-ui/ng-templates
```

`PoFieldModule` covers every `po-field/*` control (input, select, combo, lookup, datepicker, upload, ...) — there is no `PoInputModule`.

## Bootstrap (standalone app, Angular 21)

```ts
// main.ts
import { bootstrapApplication } from '@angular/platform-browser';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { provideAnimations } from '@angular/platform-browser/animations';
import { HTTP_INTERCEPTORS } from '@angular/common/http';
import { PoHttpRequestInterceptor } from '@po-ui/ng-components';

import { AppComponent } from './app/app.component';
import { routes } from './app/app.routes';

bootstrapApplication(AppComponent, {
  providers: [
    provideRouter(routes),
    provideAnimations(),
    provideHttpClient(withInterceptorsFromDi()),
    // turns the standard PO UI error envelope into a toaster/dialog automatically
    { provide: HTTP_INTERCEPTORS, useClass: PoHttpRequestInterceptor, multi: true }
  ]
}).catch(err => console.error(err));
```

## App shell — toolbar + side menu

```ts
import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { PoMenuModule, PoToolbarModule, PoMenuItem } from '@po-ui/ng-components';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, PoToolbarModule, PoMenuModule],
  template: `
    <po-toolbar p-title="Gworks"></po-toolbar>
    <po-menu [p-menus]="menus" p-filter></po-menu>
    <router-outlet></router-outlet>
  `
})
export class AppComponent {
  readonly menus: Array<PoMenuItem> = [
    { label: 'Início', link: '/', icon: 'po-icon-home' },
    {
      label: 'Cadastros', icon: 'po-icon-users',
      subItems: [
        { label: 'Clientes',  link: '/clientes' },
        { label: 'Produtos',  link: '/produtos' }
      ]
    }
  ];
}
```

## A service that speaks the contract

```ts
import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface PoCollection<T> {
  hasNext: boolean;
  items: Array<T>;
}

export interface Cliente {
  codigo: string;
  nome: string;
  cidade: string;
  limiteCredito: number;
  ativo: boolean;
}

@Injectable({ providedIn: 'root' })
export class ClienteService {
  private readonly http = inject(HttpClient);
  private readonly url = '/api/v1/clientes';

  list(page = 1, pageSize = 20, filters: Record<string, string> = {}, order?: string)
    : Observable<PoCollection<Cliente>> {

    let params = new HttpParams()
      .set('page', page)
      .set('pageSize', pageSize);

    if (order) {
      params = params.set('order', order);
    }
    Object.entries(filters)
      .filter(([, v]) => v !== undefined && v !== null && v !== '')
      .forEach(([k, v]) => (params = params.set(k, v)));

    return this.http.get<PoCollection<Cliente>>(this.url, { params });
  }

  getById(id: string): Observable<Cliente> {
    return this.http.get<Cliente>(`${this.url}/${id}`);
  }

  create(resource: Cliente): Observable<Cliente> {
    return this.http.post<Cliente>(this.url, resource);
  }

  update(id: string, resource: Cliente): Observable<Cliente> {
    return this.http.put<Cliente>(`${this.url}/${id}`, resource);
  }

  remove(id: string): Observable<void> {
    return this.http.delete<void>(`${this.url}/${id}`);
  }
}
```

## List screen — `po-page-list` + `po-table` with paging

```ts
import { Component, OnInit, inject } from '@angular/core';
import { PoPageModule, PoTableModule, PoTableColumn, PoNotificationService } from '@po-ui/ng-components';
import { Cliente, ClienteService } from './cliente.service';

@Component({
  selector: 'app-clientes',
  imports: [PoPageModule, PoTableModule],
  templateUrl: './clientes.component.html'
})
export class ClientesComponent implements OnInit {
  private readonly service = inject(ClienteService);
  private readonly notification = inject(PoNotificationService);

  items: Array<Cliente> = [];
  loading = false;
  hasNext = false;
  private page = 1;

  readonly columns: Array<PoTableColumn> = [
    { property: 'codigo', label: 'Código', width: '120px' },
    { property: 'nome',   label: 'Nome' },
    { property: 'cidade', label: 'Cidade' },
    { property: 'limiteCredito', label: 'Limite', type: 'currency', format: 'BRL' },
    {
      property: 'ativo', label: 'Situação', type: 'label',
      labels: [
        { value: true,  color: 'color-11', label: 'Ativo' },
        { value: false, color: 'color-07', label: 'Inativo' }
      ]
    }
  ];

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading = true;
    this.service.list(this.page).subscribe({
      next: response => {
        this.items = [...this.items, ...response.items];
        this.hasNext = response.hasNext;
        this.loading = false;
      },
      error: () => {
        this.loading = false;
        this.notification.error('Não foi possível carregar os clientes.');
      }
    });
  }

  onShowMore(): void {
    this.page++;
    this.load();
  }
}
```

```html
<po-page-list p-title="Clientes" [p-actions]="[{ label: 'Novo', url: '/clientes/novo' }]">
  <po-table
    [p-columns]="columns"
    [p-items]="items"
    [p-loading]="loading"
    [p-show-more-disabled]="!hasNext"
    (p-show-more)="onShowMore()">
  </po-table>
</po-page-list>
```

`[p-show-more-disabled]="!hasNext"` is the whole reason the endpoint must return `hasNext` — see `api-contract.md`.

## Full CRUD with `po-page-dynamic-table`

```ts
import { Component } from '@angular/core';
import { PoTemplatesModule } from '@po-ui/ng-templates';
import { PoPageDynamicTableActions, PoPageDynamicTableField } from '@po-ui/ng-templates';

@Component({
  selector: 'app-clientes-dinamico',
  imports: [PoTemplatesModule],
  template: `
    <po-page-dynamic-table
      p-title="Clientes"
      p-service-api="/api/v1/clientes"
      [p-fields]="fields"
      [p-actions]="actions">
    </po-page-dynamic-table>
  `
})
export class ClientesDinamicoComponent {
  readonly fields: Array<PoPageDynamicTableField> = [
    { property: 'codigo', label: 'Código', key: true, filter: true, gridColumns: 6 },
    { property: 'nome',   label: 'Nome',   filter: true, required: true, gridColumns: 6 },
    { property: 'cidade', label: 'Cidade', gridColumns: 6 },
    { property: 'limiteCredito', label: 'Limite', type: 'currency', format: 'BRL', gridColumns: 6 },
    { property: 'ativo',  label: 'Ativo',  type: 'boolean', booleanTrue: 'Sim', booleanFalse: 'Não' }
  ];

  readonly actions: PoPageDynamicTableActions = {
    new:    '/clientes/novo',
    edit:   '/clientes/editar/:codigo',
    detail: '/clientes/:codigo',
    remove: true,
    // runs before the built-in delete; return { allowAction: false } to block it
    beforeRemove: (id, resource) => ({ allowAction: !resource?.['ativo'] })
  };
}
```

`key: true` marks the field that fills `:codigo` in the action routes and identifies the record in `GET/PUT/DELETE {serviceApi}/{id}`. Forgetting it is the usual reason edit/delete hit the wrong URL.

## Notifications and dialogs

```ts
private readonly notification = inject(PoNotificationService);
private readonly dialog = inject(PoDialogService);

this.notification.success('Registro salvo.');
this.notification.error({ message: 'Falha ao salvar.', duration: 5000 });

this.dialog.confirm({
  title: 'Excluir',
  message: 'Confirma a exclusão do registro?',
  confirm: () => this.remove(),
  cancel: () => {}
});
```

Never `window.alert`/`window.confirm`, and never place a `<po-toaster>` by hand — the service injects it.

## `po-lookup` against an endpoint

```ts
readonly lookupColumns: Array<PoLookupColumn> = [
  { property: 'codigo', label: 'Código' },
  { property: 'nome',   label: 'Nome' }
];
```

```html
<po-lookup
  name="cliente"
  [(ngModel)]="cliente"
  p-label="Cliente"
  p-field-label="nome"
  p-field-value="codigo"
  [p-columns]="lookupColumns"
  p-filter-service="/api/v1/clientes">
</po-lookup>
```

`p-filter-service` accepts a URL (it then issues the paged/filtered requests itself) or a `PoLookupFilter` implementation when the search needs custom logic.

## Reactive form with PO UI fields

```html
<form [formGroup]="form" (ngSubmit)="save()">
  <div class="po-row">
    <po-input   class="po-md-6" formControlName="nome"   p-label="Nome" p-required></po-input>
    <po-select  class="po-md-6" formControlName="uf"     p-label="UF" [p-options]="ufs"></po-select>
    <po-decimal class="po-md-4" formControlName="limite" p-label="Limite" [p-decimals-length]="2"></po-decimal>
    <po-datepicker class="po-md-4" formControlName="cadastro" p-label="Cadastro"></po-datepicker>
    <po-switch  class="po-md-4" formControlName="ativo"  p-label="Ativo"></po-switch>
  </div>
  <po-button p-label="Salvar" p-kind="primary" type="submit" [p-disabled]="form.invalid"></po-button>
</form>
```

The grid is `@po-ui/style`'s: `po-row` on the container, `po-sm-*` / `po-md-*` / `po-lg-*` / `po-xl-*` on the children, 12 columns.

## Theme toggle

```ts
private readonly theme = inject(PoThemeService);

toggle(): void {
  const current = this.theme.getThemeActive();
  this.theme.changeCurrentThemeType(
    current?.active?.type === PoThemeTypeEnum.dark ? PoThemeTypeEnum.light : PoThemeTypeEnum.dark
  );
}
```

`setDensityMode('small' | 'medium' | 'large')` changes component density independently of light/dark.

## Testing

`ng add @po-ui/ng-components` does not add test helpers. In a spec, import the same PO module the component imports:

```ts
await TestBed.configureTestingModule({
  imports: [ClientesComponent, PoPageModule, PoTableModule, HttpClientTestingModule]
}).compileComponents();
```

Assert against the bound inputs (`component.columns`, `component.items`) rather than the rendered PO UI DOM — the internal markup is not a stable contract.
