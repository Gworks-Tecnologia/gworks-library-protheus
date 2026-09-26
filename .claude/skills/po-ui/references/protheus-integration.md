# Running a PO UI app inside Protheus — `FWCallApp`, `@totvs/protheus-lib-core` and working without an API

Sources:
- TDN **"Protheus-lib-core"** — <https://tdn.totvs.com/display/public/framework/Protheus-lib-core> — the official page of the lib,
  including the section *"AdvplToJs e JsToAdvpl"* this file builds on. Version pages: [21 (21.1.2)](https://tdn.totvs.com/x/rMcpPg),
  [19](https://tdn.totvs.com/pages/viewpage.action?pageId=911865819); [FwCallApp](https://tdn.totvs.com.br/display/framework/FwCallApp);
  [FAQ](https://tdn.totvs.com/x/FLseOw); official examples: [github.com/deboraconstantino/doc-lib-core](https://github.com/deboraconstantino/doc-lib-core);
  article [Apps no Protheus](https://medium.com/totvsdevelopers/apps-no-protheus-10db4f47f9fc).
- The published typings/`fesm2022` of `@totvs/protheus-lib-core@21.1.2`.
- **Field-verified** (marked ✅) on a real app, CertificadoVimetal (Vimetal, vimetal-protheus repo), 2026-09-25/26: AppServer
  7.00.240223P, WebApp 10.2.1, Angular 21 + PO UI 21.30.1 + protheus-lib-core 21.1.2, SQL Server.

> **Reading TDN:** `WebFetch` gets **403** on every tdn.totvs.com page. `curl -sSL -A "Mozilla/5.0 (X11; Linux x86_64) … Chrome/140.0 Safari/537.36"`
> from a normal shell returns 200; extract the text from `id="main-content"`.

## Three ways to put a PO UI app in front of Protheus

| Mode | What it is | Data path |
|---|---|---|
| **Standalone web app** | An ordinary Angular app on a web server. | TLPP REST endpoints — [api-contract.md](api-contract.md). |
| **Embedded app + REST** | The app packaged as a `.app` and opened by `FWCallApp`; data still over REST. | REST (base URL from `ProAppConfigService.serverWithApiUrl`, never hard-coded). |
| **Embedded app, no API** ✅ | Same `.app`, but every request goes to the AdvPL of the **user's own session** over the FWCallApp channel. | `jsToAdvpl` → `Static Function JsToAdvpl` → `AdvPLToJS` — [Working without an API](#working-without-an-api-the-advpltojs--jstoadvpl-channel). |

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

**`@totvs/protheus-lib-core` is not released for every Angular major.** Published majors are **14, 15, 17, 19, 21** — there is no 16, 18 or 20.
Like PO UI it is NgModule-based, but **all its services are `providedIn: 'root'`**: a standalone app can `inject(ProAppConfigService)` /
`inject(ProJsToAdvplService)` without importing `ProtheusLibCoreModule`.

## Packaging the `.app` ✅

1. **Build with `ng build --base-href ./`.** The AppServer serves the app under a path it chooses (below); absolute `/…` URLs break. Build
   every asset URL from `document.baseURI` (`new URL('assets/x.png', document.baseURI)`).
2. **Route with the hash:** `provideRouter(routes, withHashLocation())`. The page URL is not yours, so path routes never match and the screen
   opens blank.
3. **Zip ONE top folder named after the app, with `index.html` directly inside it.** Angular 21 puts the build in `dist/<name>/browser/` —
   zip the *contents* of `browser/` under `<app-name>/`, not the `browser/` folder. Rename `.zip` → **`.app`**.
4. **`FWCallApp("<app-name>")`** — the `.app` file name **without the extension**.
5. **Compile the `.app` into the RPO as a resource.** The TDS VS Code UI filters extensions (turn off
   `totvsLanguageServer.folder.enableExtensionsFilter`); the `advpls cli` compile action accepts it as is (`[SUCCESS] Resource compiled`).
6. Make the zip **deterministic** (fixed dates/permissions per entry) if the `.app` is versioned in git: same code → same bytes.

A working script: `Sources/NodeJs/CertificadoVimetal/scripts/empacotar-app.sh` (vimetal-protheus repo).

## Where and how the app runs ✅

- **The client may be the browser, not SmartClient.** With the **WebApp** (`webapp.dll/.so` in the AppServer binaries + the local
  **WebAgent**), Protheus runs in Chrome/Edge and the app runs inside it (F12 works). Say "WebApp/navegador", not "SmartClient", when that is the setup.
- The AppServer extracts the `.app` and serves it at **`/app-root/<env>/<app>_env_<env>/index.html`** (sometimes without `index.html`),
  after a loading page **`/app-root/<env>/preindex_env_<env>/index.html`** in the same place.
- It lives in an **iframe the page cannot see in `window.frames`** (inside a shadow DOM). Automation must go through the CDP frame tree.
- `FWCallApp` applies its own theme (purple), not the app's.
- `FWCallApp` **blocks** until the user closes the app: code after it runs on close.
- **Opening straight from a URL** (`<server>:<port>/webapp/?E=<env>&P=U_FUNC&M=1`) runs the function in a fresh session **with no
  environment and no user**: prepare it (`RpcSetEnv(emp, fil)` when `cFilAnt` is empty; `RpcClearEnv()` after) — `RetCodUsr()` comes empty.
- **A function started by that URL loses its `Return`**: the WebApp goes back to "Programa Inicial". Data must be *sent* somewhere
  (the channel, a file, the DOM).
- A second entry door is fine: a TLPP `User Function` in the App layer that just calls `U_<POAPP>()` — `FWCallApp` still runs from the
  `.prw`, so its `JsToAdvpl` is still found. ✅

## Working without an API: the AdvplToJs / JsToAdvpl channel

The embedded app does **not** need REST: it can ask the AdvPL of the session that opened it and get the answer back over the channel
`FWCallApp` keeps open (TDN, Protheus-lib-core, *"AdvplToJs e JsToAdvpl"*). What that removes: the REST service and its port, CORS,
authentication and a service account (`RetCodUsr()`, `cEmpAnt`, `cFilAnt` are the logged user's), files on disk, and the long-lived
REST/job thread that has to pick up each compile (a REST pool was seen down for minutes after compiling). TOTVS uses the same channel in
the lib (`ProCompanyService.getListOfCompaniesFromAdvpl`).

What it costs: **it only exists inside Protheus** (keep a mock or REST for the plain browser, and detect the channel at run time), and the
messages of one session are handled one at a time. TDN recommends web services where performance is critical; for the app below (a month
of grid rows in ~0.2 s, a 13 MB upload in ~6 s) the channel was plenty.

### The official API (TDN)

| Direction | Send | Receive |
|---|---|---|
| JS → AdvPL | `ProJsToAdvplService.jsToAdvpl(type, content)` (or `twebchannel.jsToAdvpl`) | `Static Function JsToAdvpl(oWebChannel, cType, cContent)` **in the source that calls `FWCallApp`** |
| AdvPL → JS | `oWebChannel:AdvPLToJS(cType, cContent)` | the function in **`assets/preload/advpltojs.js`**: `function(codeType, content)` |

Prerequisites, per TDN: create `assets/preload/advpltojs.js` in the web app ("irá receber e tratar as instruções ADVPL"), and a
`Static Function JsToAdvpl` in the source that calls `FwCallApp` ("irá receber e tratar as instruções Javascript").

- **The `FWCallApp` source must be `.prw`** — "o fonte não pode ser tlpp, pois em tlpp não existe a chamada de funções estáticas" (TDN).
  Keep it a thin door (parse, dispatch to a Controller, answer); business rules go to TLPP Services.
- In `advpltojs.js`, TDN's way to feed `ProJsToAdvplService.buildObservable({ receiveId, sendInfo: { type, content }, autoDestruct })` is
  `this.eventTarget.send(codeType, content)` (`this` is the channel). The protocol below does not depend on it.
- The name `JsToAdvpl` shows up on both sides with opposite roles (the AdvPL static receives from JS; the JS global receives from AdvPL).
- `FWCallApp` sends messages of its own (e.g. `preLoad`) — ignore anything that is not a request of yours.

### A request/response protocol that works ✅

Answer each request **on its own id** (`<action>:<id>`), with one envelope for success and error:

```advpl
// POAPP001.prw — the door: no business rule here
User Function POAPP001()
    Local lPreparou := .F.
    if Type("cFilAnt") == "U" .or. Empty(cFilAnt)       // opened by URL: no session environment
        RpcSetEnv("01", "0101")
        lPreparou := .T.
    endif
    FWCallApp("certificado-vimetal")                     // returns when the app closes
    if lPreparou
        RpcClearEnv()
    endif
Return

Static Function JsToAdvpl(oWebChannel, cType, cContent)
    Local oPedido := JsonObject():New()
    Local oEnum   := Projects.CertificadoVimetal.Enums.U_CertVimControllerEnum()   // GwEnum: action name -> id
    Local xOpc    := Nil
    Local oResult := Nil
    if !Empty( oPedido:FromJson(cContent) ) .or. ValType( oPedido["id"] ) != "C"
        Return .T.                                       // FWCallApp's own messages (preLoad...): nobody to answer
    endif
    xOpc    := oEnum:GetEnum(cType)
    oResult := Projects.CertificadoVimetal.Controllers.U_CertVimController( iif(ValType(xOpc) == "N", xOpc, 0), oPedido["dados"] )
    oWebChannel:AdvPLToJS( cType + ":" + oPedido["id"], oResult:ToJson() )   // { ok, data } | { ok:.F., status, code, message, detailedMessage }
Return .T.
```

```js
// public/assets/preload/advpltojs.js (also loaded by a <script> in index.html): re-emit as a window event
function JsToAdvpl(codeType, content) {
  window.dispatchEvent(new CustomEvent('protheus:' + codeType, { detail: content }));
}
```

```ts
// utils/canal-protheus.ts: send { id, dados }, wait for "protheus:<acao>:<id>", unwrap the envelope
export function chamarProtheus<T>(ponte: ProJsToAdvplService, acao: string, dados: object = {}, esperaMs = 30_000): Observable<T> {
  return new Observable<T>(assinante => {
    if (!ponte.getWebChannel()) { assinante.error(new Error('Fora do Protheus: não há canal com o AdvPL.')); return; }
    const id = novoIdDePedido();
    const resposta = fromEvent<CustomEvent<string>>(window, `protheus:${acao}:${id}`).pipe(
      take(1), timeout(esperaMs),
      map(e => lerEnvelope<T>(e.detail)),   // !ok -> throw new HttpErrorResponse({ status, error: { code, message, detailedMessage } })
      catchError(erro => throwError(() => (erro instanceof TimeoutError ? semResposta(acao) /* 504 */ : erro)))
    ).subscribe(assinante);
    ponte.connectedJsToAdvpl(acao, JSON.stringify({ id, dados }));   // AFTER subscribing: a fast answer must not be lost
    return resposta;
  });
}
```

- Throwing the **same `HttpErrorResponse`** the REST API would give keeps every caller unchanged (a `400` shows the Protheus message).
- **Detect the channel with `ponte.getWebChannel()`**, not `insideProtheus()`/`protheusConnected()`: those read `gotConnection`, still
  false when an `APP_INITIALIZER` runs. `connectedJsToAdvpl` retries (99 × 50 ms) until connected.
- The AdvPL side follows the `advpl-gworks-pattern` layers: door (`.prw`) → Controller (routes by a `GwEnum`) → Services (rules) →
  Database/SQL and Integrations. Refuse in the Controller what must not come from the screen (e.g. dictionary creation):
  `fwIsInCallStack("JSTOADVPL")` → 403.
- Service-side input: sanitize what the user typed before SQL (drop `'`, `"`, `;`, `%`, `_`, `[`, `]`, `\`) and match with `CHARINDEX`, not `LIKE`.
- Full working implementation: `Sources/AdvPL/Projects/CertificadoVimetal` and `Sources/NodeJs/CertificadoVimetal/src/app/utils/canal-protheus.ts`.

### Encoding ✅

- **The channel converts CP1252 ↔ UTF-8 in both directions.** Put plain CP1252 strings in the JSON — **no `EncodeUTF8`** (it doubles:
  "90º" arrives as "90Âº"). Text typed in the browser arrives ready to compare with the database.
- **UTF-8 payloads CP1252 can't hold** (e.g. an AI JSON with "≥") would be mangled by that conversion: send them **base64**
  (`Encode64(cUtf8)`) and decode in the app (`atob` → `Uint8Array` → `new TextDecoder('utf-8')` → `JSON.parse`).
- Sources are CP1252: a "≥" even inside a comment makes the conversion of the file fail.

### Limits measured ✅

- **Volume:** ~10 MB of PDF as **13.3 MB of base64** JS → AdvPL in **~6 s**. AdvPL strings above 1 MB need `MaxStringSize` in the
  `appserver.ini` `[General]` (Vimetal: `50`, i.e. 50 MB).
- **Time:** a handler that took **70 s** answered normally and the channel kept working. Size the app's timeout for the slowest action
  (an upload that calls an AI up to 3 × 100 s: 330 s).

## Testing an embedded app from the terminal ✅

With the Gworks `Scripts/pth-*` (see the `advpl-tlpp-exec-sql-query` skill), `node --experimental-websocket Scripts/pth-execute.mjs U_POAPP001 poapp 90`
opens the WebApp headless (CDP on 9253). Then, from another script:

1. `Page.getFrameTree`, pick the frame whose URL matches `/\/<app>[^/]*\/(index\.html)?([?#]|$)/` (**not** `preindex…`);
2. keep `Runtime.executionContextCreated` events (`auxData.isDefault`, `auxData.frameId`) to get that frame's context;
3. `Runtime.evaluate` in that context: send `twebchannel.jsToAdvpl(acao, JSON.stringify({ id, dados }))` and await
   `protheus:<acao>:<id>`; or read the rendered DOM; `Page.captureScreenshot` for the look.

Wait ~10 s after a compile; right after compiling the app can take more than 40 s to open (give the frame ~75 s). Working scripts:
`Sources/NodeJs/CertificadoVimetal/e2e/protheus/` (vimetal-protheus repo).

## `ProAppConfigService` — the app's own context

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
| `insideProtheus()` | `boolean` — `ProJsToAdvplService.protheusConnected()` (channel exists **and** `gotConnection`). |
| `callAppClose(ask?)` | `void` — closes the Protheus dialog hosting the app (sends `close` over the channel); `ask` prompts first. |
| `loadAppConfig()` | `Promise<object>` — reads `assets/data/appConfig.json` + context; typically an `APP_INITIALIZER`. |
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

`serverWithApiUrl` / `api_baseUrl` is what REST services should use as the base URL — hard-coding `http://localhost:8080` works in `ng serve`
and breaks the moment the app is packaged.

## `ProJsToAdvplService` — the raw transport

| Method | Purpose |
|---|---|
| `getWebChannel()` / `hasWebChannel()` / `hasDialog()` | the channel object (`twebchannel`, or the older `dialog`); use `getWebChannel()` to detect it. |
| `protheusConnected()` | channel **and** `gotConnection`. |
| `jsToAdvpl(type, content)` | `boolean` — fire and forget; the boolean only says a channel existed. |
| `connectedJsToAdvpl(type, value, retryCounter?, timeout?)` | send, retrying until connected. |
| `buildListener(id, callBack)` / `buildObservable<T>(callBack, options: ProJsToAdvpl)` | the lib's own request/response on `twebchannel.eventTarget` (fed by `this.eventTarget.send` in `advpltojs.js`). |
| `AdvplCloseApp(value?)` | close the app. |
| `generateEventId()` | correlation id. |

## Session, auth and ERP context

**`ProSessionInfoService`** — `getCompany()`, `getBranch()`, `getModule()`, `getSystemModule()`, `getUser()`, `getDataBase()`, `getIdiom()`, `getRole()`,
`getToken()`, `getAppName()`, `getAppConfig()`, `getTheme()`, `getRemoteType()`, `getSocketPort()`, `getProgramStart()`, `getStartTime()`,
`getProEnvironment()`, plus setters and `setSessionInfo()`.

**`ProAuthService`** — `login(user)`, `requestToken(user)`, `refreshToken(rt)`, `updateToken()`, `isTokenValid(now?)`, `logout()`,
`passwordRecovery(user)`, `saveToken(token)`, `getTokenPayload(token?)`; getters `token`, `userInfo`, `userId`, `isUserAuthenticate`.

**`ProCompanyService` / `ProBranchService`** — `getListOfCompanies()`, `getUserCompanies()`, `getCompany(code)`; `getListOfBranches()`, `getUserBranches()`,
`getBranch(code, company?)`; `isChannelHTTP()` / `setChannelAsHTTP(v)` — the same call works over the AdvPL channel when embedded and over HTTP when not.

Others: `ProUserInfoService`, `ProRoleService`, `ProSystemModuleService`, `ProUserAccessService`, `ProUserProfileService`, `ProThreadInfoService`,
`ProMessageService`, `ProI18nService`, `ProLanguageService`, `ProDateService`, `ProThemeService`, `ProBrandService`, `ProTranslateStringService`,
`ProGenericAdapterService`, `ProAdapterBaseV2Service`, `ProMfaService`.

Ready-made components: `ProLoginComponent`, `ProCompanyLookupComponent`, `ProBranchLookupComponent`, `ProRoleLookupComponent`,
`ProSystemModuleLookupComponent`, `ProSessionSettingsComponent`, `ProHomeComponent`, `ProPageBackgroundComponent`.

Interceptors and guards: `ProAuthInteceptor`, `ProAppConfigInteceptor`, `ProSystemIdiomInteceptor`, `ProSystemDatabaseInterceptor`,
`ProSystemModulesInteceptor`, `ProAuthGuard`. Note the upstream spelling — several are `Inteceptor`; the correct spelling does not resolve.

## Gotchas

1. **Detect the channel with `getWebChannel()`**; `insideProtheus()` is false until the channel reports `gotConnection`. Guard every bridge call.
2. **The `FWCallApp` source must be `.prw`** (TOTVS calls its static `JsToAdvpl`; TLPP statics are not callable from outside).
3. **Answer each request on its own id** (`<action>:<id>`); a fixed type mixes up two concurrent requests.
4. **No `EncodeUTF8` over the channel**; base64 for UTF-8 payloads CP1252 can't hold.
5. **Zip the contents of `browser/` under one folder named after the app**, `--base-href ./`, hash routing, rename to `.app`.
6. **The function behind a WebApp URL (`P=`) loses its return value**, and runs with no environment/user unless it prepares one.
7. **The app iframe is invisible to `window.frames`** and is preceded by a `preindex` page — automation must use the CDP frame tree.
8. **Big strings need `MaxStringSize`** in the `appserver.ini` (the default caps AdvPL strings at 1 MB).
9. **No Angular 16/18/20 build of `protheus-lib-core`.**
10. **`@totvs/po-theme` tracks the PO UI version** (both 21.30.1 today).
11. **`rxjs-compat@^6.6.3` is in the peer list**: install it only if npm actually complains.
12. **Never hard-code the REST base URL** in an embedded app — `serverWithApiUrl` / `api_baseUrl`.
