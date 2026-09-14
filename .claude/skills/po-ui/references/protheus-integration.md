# Running a PO UI app inside Protheus — `@totvs/protheus-lib-core`

Sources: TDN *"Versão 19 (19.0.2) - Frameworksp"* (`tdn.totvs.com/pages/releaseview.action?pageId=911865819`) and the published typings of `@totvs/protheus-lib-core@21.1.2`.

> The TDN page is written against Angular 19, but the flow is unchanged on Angular 21 and the packages ship a matching 21 line. Use the 21 versions below.

There are two ways a PO UI app can front Protheus:

| Mode | What it is | What you need |
|---|---|---|
| **Standalone web app** | An ordinary Angular app served by a web server, calling TLPP REST endpoints over HTTP. | PO UI + the [REST contract](api-contract.md). Nothing else. |
| **Embedded Protheus app** | The app is packaged as a `.app` file and opened from inside SmartClient by `FWCallApp`, with a live channel to the AdvPL layer. | Everything above **plus** `@totvs/protheus-lib-core`. |

This file covers the second mode.

## Dependencies

```jsonc
"@po-ui/ng-components":      "21.30.1",
"@po-ui/ng-templates":       "21.30.1",
"@po-ui/style":              "21.30.1",
"@totvs/po-theme":           "21.30.1",   // TOTVS theme layer, versioned in lockstep with PO UI
"@totvs/protheus-lib-core":  "21.1.2",    // the Protheus bridge
"@totvs/common-assets":      "^1.1.1",    // peer of protheus-lib-core
"subsink":                   "^1.0.2",    // peer of protheus-lib-core
"core-js":                   "^3.13.0",   // peer of protheus-lib-core
```

**`@totvs/protheus-lib-core` is not released for every Angular major.** Published majors are **14, 15, 17, 19, 21** — there is no 16, 18 or 20. If you are choosing an Angular version for a Protheus-embedded app, pick one of those; Angular 21 is the current match and lines up with the rest of this skill.

## Setup

```bash
npm i -g @angular/cli@21
ng new my-protheus-app
cd my-protheus-app
ng add @po-ui/ng-components@latest
ng add @po-ui/ng-templates@latest
npm i subsink
npm i @totvs/protheus-lib-core@latest
ng serve
```

Then import the root module:

```ts
import { ProtheusLibCoreModule } from '@totvs/protheus-lib-core';

@NgModule({
  imports: [ ProtheusLibCoreModule ]
})
export class AppModule {}
```

Like PO UI, `protheus-lib-core` is NgModule-based. In a standalone-component app put `ProtheusLibCoreModule` (or a granular `Pro*Module`) in the component's `imports`.

## Packaging and calling from AdvPL

1. `ng build`
2. Zip the **generated folder inside `dist/`**, keeping the original folder name.
3. Rename the archive's extension from `.zip` to **`.app`**.
4. Write an AdvPL/TLPP source that calls `FWCallApp` with the app name — the `.app` filename **without the extension** — and put that source in the menu.

```advpl
User Function MyPoApp()
    FWCallApp( "my-protheus-app" )
Return
```

Failure modes worth knowing: renaming the folder before zipping, or zipping the *contents* rather than the folder, both produce an app that Protheus refuses to open.

## `ProAppConfigService` — the app's own context

The service the TDN page leads with. Use it to know whether you are running inside Protheus and to close the dialog the app was opened in.

```ts
import { Component, inject } from '@angular/core';
import { ProAppConfigService } from '@totvs/protheus-lib-core';

@Component({ /* ... */ })
export class AppComponent {
  private readonly proAppConfigService = inject(ProAppConfigService);

  closeApp(): void {
    if (this.proAppConfigService.insideProtheus()) {
      this.proAppConfigService.callAppClose();
    } else {
      alert('O App não está sendo executado dentro do Protheus.');
    }
  }
}
```

| Member | Signature |
|---|---|
| `insideProtheus()` | `boolean` — true when running inside SmartClient. **Guard every bridge call with this**; in `ng serve` it is false and the channel does not exist. |
| `callAppClose(ask?)` | `void` — closes the Protheus dialog hosting the app; `ask` prompts for confirmation. |
| `loadAppConfig()` | `Promise<object>` — resolves the app configuration; typically an `APP_INITIALIZER`. |
| `freeAppConfig()` | `void` |
| `proAppConfig` | `ProAppConfig` getter |
| `nameApp`, `serverWithApiUrl`, `productLine`, `isProtheusRender` | getters |
| `readyEmitter` | `EventEmitter<any>` — fires when the config is ready. |

```ts
interface ProAppConfig {
  name?: string;  version?: string;  serverBackend?: string;
  restEntryPoint?: string;  versionAPI?: string;
  productLine?: string;  api_baseUrl?: string;
}
```

`serverWithApiUrl` / `api_baseUrl` is what your services should use as the REST base URL — hardcoding `http://localhost:8080` works in `ng serve` and breaks the moment the app is packaged.

## `ProJsToAdvplService` — the raw JS ↔ AdvPL channel

The transport `ProAppConfigService` and the other `Pro*Service`s sit on. Reach for it directly only when you need a custom AdvPL call.

| Method | Purpose |
|---|---|
| `protheusConnected()` / `hasWebChannel()` / `hasDialog()` | channel availability. |
| `jsToAdvpl(type, content)` | `boolean` — fire a message at the AdvPL side. |
| `buildListener(id, callBack)` | register a handler for a response id. |
| `buildObservable<T>(callBack, options: ProJsToAdvpl)` | `Observable<T>` — the request/response pattern; `options.autoDestruct` tears the listener down after the first reply. |
| `connectedJsToAdvpl(type, value, retryCounter?, timeout?)` | send with retry. |
| `AdvplCloseApp(value?)` | close the app. |
| `generateEventId()` | unique correlation id. |

The channel is **asynchronous and event-based**: you send with an id and receive on a listener. Do not expect a synchronous return from `jsToAdvpl` — its `boolean` only says the message was dispatched.

## Session, auth and ERP context

These are the reason to use the library rather than rolling your own — inside Protheus they read the real session instead of asking the user.

**`ProSessionInfoService`** — the current ERP context: `getCompany()`, `getBranch()`, `getModule()`, `getSystemModule()`, `getUser()`, `getDataBase()`, `getIdiom()`, `getRole()`, `getToken()`, `getAppName()`, `getAppConfig()`, `getTheme()`, `getRemoteType()`, `getSocketPort()`, `getProgramStart()`, `getStartTime()`, `getProEnvironment()`, plus the matching setters and `setSessionInfo()`.

**`ProAuthService`** — `login(user)`, `requestToken(user)`, `refreshToken(rt)`, `updateToken()`, `isTokenValid(now?)`, `logout()`, `passwordRecovery(user)`, `saveToken(token)`, `getTokenPayload(token?)`, and the getters `token`, `userInfo`, `userId`, `isUserAuthenticate`.

```ts
interface ProUser      { username: string; password: string; remember_user?: boolean;
                         username_when?: boolean; show_remember_user?: boolean;
                         singleSignOnRequired?: boolean; }
interface ProAuthToken { access_token?: string; refresh_token?: string; scope?: string;
                         token_type?: string; expires_in?: number; hasMFA?: boolean; }
```

**`ProCompanyService` / `ProBranchService`** — `getListOfCompanies()`, `getUserCompanies()`, `getCompany(code)`; `getListOfBranches()`, `getUserBranches()`, `getBranch(code, company?)`, plus `company` / `branch` accessors. Each also exposes `isChannelHTTP()` / `setChannelAsHTTP(v)` — the same call works over the AdvPL channel when embedded and over HTTP when not, which is how one codebase serves both modes.

Others: `ProUserInfoService`, `ProRoleService`, `ProSystemModuleService`, `ProUserAccessService`, `ProUserProfileService`, `ProThreadInfoService`, `ProMessageService`, `ProI18nService`, `ProLanguageService`, `ProDateService`, `ProThemeService`, `ProBrandService`, `ProTranslateStringService`, `ProGenericAdapterService`, `ProAdapterBaseV2Service`, `ProMfaService`.

## Ready-made components

- `ProLoginComponent` (+ `ProLoginDefaultsResolver`) — Protheus-aware login, on top of `po-page-login`.
- `ProCompanyLookupComponent`, `ProBranchLookupComponent`, `ProRoleLookupComponent`, `ProSystemModuleLookupComponent` — the standard ERP pickers.
- `ProSessionSettingsComponent` (+ its resolvers) — company/branch/module switcher.
- `ProHomeComponent`, `ProPageBackgroundComponent`.

## Interceptors and guards

`ProAuthInteceptor` (token injection), `ProAppConfigInteceptor`, `ProSystemIdiomInteceptor`, `ProSystemDatabaseInterceptor`, `ProSystemModulesInteceptor`, and `ProAuthGuard` for route protection. Note the upstream spelling — several are `Inteceptor`, not `Interceptor`; an import typed the correct way will not resolve.

## Gotchas

1. **Always guard with `insideProtheus()`.** Bridge calls in a browser dev session have no channel and fail silently or throw.
2. **The bridge is async.** `buildObservable` + `autoDestruct` is the request/response idiom; `jsToAdvpl` alone is fire-and-forget.
3. **No Angular 16/18/20 build of `protheus-lib-core`.** Check npm before committing to an Angular version for an embedded app.
4. **`@totvs/po-theme` tracks the PO UI version** (both 21.30.1 today) — same lockstep rule as `@po-ui/style`.
5. **`rxjs-compat@^6.6.3` sits in the peer list** alongside `rxjs@~7.8.1`. Install it only if npm actually complains; it is a legacy carry-over and pulling it in unnecessarily drags RxJS 6 typings into the build.
6. **Zip the folder, not its contents**, keep the name, then rename to `.app`.
7. **Never hardcode the backend URL** — read `serverWithApiUrl` / `api_baseUrl` from `ProAppConfigService`.

## Reference

`FWCallApp` — opening web apps inside Protheus — is documented on TDN alongside the page above.
