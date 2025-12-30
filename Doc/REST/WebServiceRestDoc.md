# WebService REST em Advpl/Tlpp
Conceitos básicos de Webservice em Rest aplicados ao TOTVS Protheus (advpl/tlpp).

## Leituras sugediras
* [Conceitos Rest TOTVS Protheus](https://www.gworks.com.br/post/totvs-rest)
* [Configuração Básica Serviço Rest V11](https://centraldeatendimento.totvs.com/hc/pt-br/articles/360045401793-Cross-Segmento-TOTVS-Backoffice-Linha-Protheus-ADVPL-Configura%C3%A7%C3%A3o-b%C3%A1sica-REST-do-protheus)
* [Configuração Básica Serviço Rest TLPP](https://tdn.totvs.com/display/tec/Via+INI)

## Rest V11
O Rest V11 é uma implementação REST que suporta a escrita de código em Advpl e TLPP.

### Exemplo classe REST Advpl
```java
#Include "Protheus.ch"
#Include "FwMVCDEF.ch"
#Include "RestFul.ch"

/*/{Protheus.doc} ApiProdutos
Exemplo de uso de API Rest em Advpl com WSRESTFUL.
@type function
@version 12.1.2210
@author Gworks - Eduardo Deroce
@since 11/04/2024
@param cCodigo, character, Código Produto. Ex.: "000123".
@obs
- Exemplo de chamada:
  http://localhost:8080/rest/ApiProdutos/listar/000123

- Exemplo de Retorno com Status Code igual à 200
    {
        "codigo": "000123",
        "descricao": "Produto de Exemplo"
    }
/*/
WSRESTFUL ApiProdutos;
    DESCRIPTION "Obtem Produto";
    FORMAT APPLICATION_JSON

    WSDATA cCodigo AS STRING

    WSMETHOD GET PRODUTO
    DESCRIPTION "Obtem dados do produto"
        WSSYNTAX "listar/{cCodigo}"
        PATH "/listar"
        PRODUCES APPLICATION_JSON

END WSRESTFUL

WSMETHOD GET WSRECEIVE cCodigo WSSERVICE ApiProdutos

    Local jResponse as json

    Default cCodigo := ""

    if( empty(cCodigo) )
        SetRestFault(400,  encodeUtf8("Parâmetro cCodigo não informado..."))
        return .F.
    endif

    dbSelectArea("SB1")
    SB1->(DbSetOrder(retOrder(,"B1_FILIAL+B1_COD")))
    if!( SB1->( msSeek(xFilial("SB1")+cCodigo) ) )
        SetRestFault(404,  encodeUtf8("Parâmetro "+allTrim(cCodigo)+" não encontrado..."))
        return .F.
    endif

    jResponse := JsonObject():New()
    jResponse["codigo"] := allTrim(SB1->B1_COD)
    jResponse["descricao"] := allTrim(SB1->B1_DESC)

    cResponse := encodeUtf8(jResponse:ToJson())

    ::SetResponse(cResponse)

    FreeObj(jResponse)

Return .T.
```

### Exemplo de configuração para serviço Rest V11:
```ini
[GENERAL]
MAXSTRINGSIZE=10

[HTTPV11]
Enable=1
Sockets=HTTPREST

[HTTPREST]
Port=8080
URIs=HTTPURI
SECURITY=1

[HTTPURI]
URL=/rest
PrepareIn=All
Instances=1,2

[ONSTART]
jobs=HTTPJOB
RefreshRate=30

[HTTPJOB]
MAIN=HTTP_START
ENVIRONMENT=environment
```

## Rest TLPP
O Rest TLPP é uma implementação diferente da versão tradicional V11, focada, principalmente, em performance. As principais diferenças são:
1. Suporta somente implementações em TLPP;
2. Não prepara o ambiente (com a função RpcSetEnv()) antes da execução, logo, todas as tratativas de autenticação e acesso à base de dados, devem ser tratadas diretamente no programa. Inclusive, esta característica é um dos fatores que o torna tão performático.

### Exemplo classe REST Advpl
```java
#Include "Tlpp-Core.th"
#Include "Tlpp-Rest.th"

/*/{Protheus.doc} ApiProdutos
Exemplo de uso de API Rest em TLPP com annotation.
@type function
@version 12.1.2210
@author Gworks - Eduardo Deroce
@since 11/04/2024
@param codigo, character, Código Produto. Ex.: "000123".
@obs
- Exemplo de chamada:
  http://localhost:8080/rest/ApiProdutos/listar/000123

- Exemplo de Retorno com Status Code igual à 200
    {
        "codigo": "000123",
        "descricao": "Produto de Exemplo"
    }
/*/
class ApiProdutosClass

    public data jPath as json

    public method new()

    @Get("/rest/ApiProdutos/listar/:codigo")
    public method Get() as logical

EndClass

Method new() class ApiProdutosClass
return self

Method Get() class ApiProdutosClass

    Local cCodigo := "" as character
    Local jResponse := JsonObject():New() as json

    ::jPath := oRest:GetPathParamsRequest()

    cCodigo := ::jPath["codigo"]

    if( empty(cCodigo) )
        jResponse["falha"] := "Parâmetro <codigo> não informado..."
        oRest:setStatusCode(400) // bad request
        oRest:setResponse( encodeUtf8( jResponse:toJson() ) )
        return .T.
    endif

    RPCSetEnv( ;
            /*cRpcEmp*/ "01",;
            /*cRpcFil*/ "01",;
            /*cEnvUser*/ nil,;
            /*cEnvPass*/ nil,;
            /*cEnvMod*/ nil,;
            /*cFunName*/ nil,;
            /*tables*/ "SB1" )

    dbSelectArea("SB1")
    SB1->(DbSetOrder(retOrder(,"B1_FILIAL+B1_COD")))
    if!( SB1->( msSeek(xFilial("SB1")+cCodigo) ) )
        jResponse["falha"] := "Parâmetro "+allTrim(cCodigo)+" não encontrado..."
        oRest:setStatusCode(404) // not found
        oRest:setResponse( encodeUtf8( jResponse:toJson() ) )
        return .T.
    endif

    jResponse["codigo"] := allTrim(SB1->B1_COD)
    jResponse["descricao"] := allTrim(SB1->B1_DESC)

    oRest:setResponse( encodeUtf8( jResponse:toJson() ) )

    FreeObj(jResponse)

    RpcClearEnv()

Return
```

## Arquivo de Configuração TLPP
Exemplo de configuração para serviço Rest Tlpp:

```ini
[HTTPSERVER]
Enable=1
Servers=HTTP_REST
​
[HTTP_REST]
hostname=localhost
port=9995
locations=HTTP_ROOT
​
[HTTP_ROOT]
Path=/
RootPath=root/web
ThreadPool=THREAD_POOL
​
[THREAD_POOL]
Environment=ENV
MinThreads=1
```

Diferenças