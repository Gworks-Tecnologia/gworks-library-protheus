# PO UI REST contract

Source: `docs/guides/api.md` in `po-ui/po-angular`, verified against 21.30.1.

Every PO UI component that talks to a back-end on its own — `po-table` with `p-load`, `po-lookup`, `po-combo` with `p-filter-service`, and the whole `po-page-dynamic-*` family — assumes this contract. Getting it wrong produces **silent empty screens**, not errors.

## Collections (list endpoints)

### Response

```jsonc
{
  "hasNext": true,          // is there a further page?
  "items": [ { }, { } ]     // the rows
}
```

Both keys are required. A bare array (`[ {...} ]`) or a differently-named wrapper (`data`, `records`, `result`) renders nothing.

Optional `_messages` may ride along to surface business warnings:

```jsonc
{
  "hasNext": false,
  "items": [],
  "_messages": [
    { "code": "INFO", "type": "information",
      "message": "Nenhum registro no período.",
      "detailedMessage": "Filtro aplicado: 01/01 a 31/01." }
  ]
}
```

### Request parameters

| Parameter | Meaning |
|---|---|
| `page` | 1-based page number. |
| `pageSize` | rows per page. Multiplier semantics: `page=2&pageSize=20` returns rows 21–40. |
| `order` | comma-separated field list; a leading `-` means descending. `order=name,-age,surname` → name asc, age desc, surname asc. |
| *any other* | a filter, as `property=value`. `?name=john&surname=doe`. |

```
GET /api/users?page=4&pageSize=10&order=name,-age&country=BR
```

**Computing `hasNext` correctly:** query `pageSize + 1` rows, return the first `pageSize`, and set `hasNext` to whether the extra row came back. Do not run a second `COUNT(*)` — on a large Protheus table that doubles the cost of every page.

## Single resources

A `2xx` returns the entity directly — no wrapper:

```jsonc
GET /api/users/10
{ "id": 10, "name": "John", "surname": "Doe", "age": 25, "country": "US" }
```

`_messages` is allowed here too, at the top level of the entity.

## Errors

Any `4xx`/`5xx` that should be shown to the user must carry:

```jsonc
{
  "code":            "Código identificador do erro",
  "message":         "Literal, no idioma da requisição, para o usuário",
  "detailedMessage": "Mensagem técnica e mais detalhada"
}
```

Optional: `type` (`error` | `warning` | `information`), `helpUrl`, and `details` — a recursive array of the same object for sub-errors.

`PoHttpRequestInterceptor` picks this envelope up automatically and raises a toaster or dialog, so a back-end that emits it gets user-facing error handling with no front-end code. A back-end that emits something else forces per-call handling everywhere.

## Serving this contract from Protheus (TLPP)

The endpoint shape a PO UI list needs. Pair with `tlpp-rest-endpoint-generator` for the routing/annotation side and `query-builder` for the SQL.

```advpl
#include "tlpp-core.th"
#include "tlpp-rest.th"

@Get("/api/v1/clientes")
Function GetClientes() as logical

    Local nPage     := Val( oRest:getQueryRequest()["page"] )     as numeric
    Local nPageSize := Val( oRest:getQueryRequest()["pageSize"] ) as numeric
    Local cOrder    := oRest:getQueryRequest()["order"]           as character
    Local jResp     := JsonObject():New()                         as json
    Local aItems    := {}                                         as array
    Local lHasNext  := .F.                                        as logical

    Default nPage     := 1
    Default nPageSize := 20

    if nPage <= 0     ; nPage := 1      ; endif
    if nPageSize <= 0 ; nPageSize := 20 ; endif

    // pede pageSize+1 para saber se existe proxima pagina, sem COUNT(*)
    aItems := fQueryClientes( nPage, nPageSize + 1, cOrder )

    lHasNext := ( Len(aItems) > nPageSize )
    if lHasNext
        aSize( aItems, nPageSize )
    endif

    jResp["hasNext"] := lHasNext
    jResp["items"]   := aItems

    oRest:setResponse( EncodeUTF8( jResp:ToJson() ) )

Return .T.
```

Error side:

```advpl
Static Function fSetError( cCode, cMessage, cDetail, nStatus )

    Local jErr := JsonObject():New() as json

    jErr["code"]            := cCode
    jErr["type"]            := "error"
    jErr["message"]         := cMessage
    jErr["detailedMessage"] := cDetail

    oRest:setStatusCode( nStatus )
    oRest:setFault( EncodeUTF8( jErr:ToJson() ) )

Return
```

### Mapping notes for Protheus specifically

- **Field names.** PO UI binds by `property`, so the JSON keys are what the front-end sees. Prefer trimmed, lower-camel keys (`codigo`, `nomeFantasia`) over raw dictionary names (`A1_COD`), and do the aliasing in SQL. If you must expose `A1_COD`, keep it consistent — `PoTableColumn.property` has to match exactly, case included.
- **Trailing spaces.** Protheus `CHAR` columns come back padded. `AllTrim` every string before it goes into the JSON, or every `po-table` cell and every `po-lookup` label carries the padding.
- **Dates.** PO UI date fields work with ISO 8601 (`yyyy-mm-dd`) or a full ISO timestamp; `PoDatepicker` has `p-iso-format` to pick between them. Convert from `dDataBase`/`DTOS` on the server — do not ship `"20260914"`.
- **Booleans.** Emit real JSON `true`/`false`. A `"1"`/`"2"` or `"S"`/`"N"` string needs a `PoTableColumn.boolean` mapping or a `labels` array on the front-end; converting server-side is cheaper.
- **`order` → `ORDER BY`.** Never interpolate the raw `order` value into SQL. Split on comma, strip a leading `-`, and validate each name against a whitelist of sortable columns before building the clause.
- **Filters → `WHERE`.** Same rule: whitelist the property names, bind the values, and remember `page`/`pageSize`/`order` are not filters — exclude them when iterating the query string.
- **Branch and deletion.** Every query still needs its `xFilial()` predicate and `D_E_L_E_T_ = ' '`; the contract says nothing about them and they are easy to forget in a new endpoint.
