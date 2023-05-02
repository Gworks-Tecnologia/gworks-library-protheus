#include "TOTVS.ch"


Static cId__ := "" as character // cModelId
Static cDesc__ := "" as character  // cModelDescription
Static cEventNS__ := "" as character // cModelEventNameSpace
Static cEventCN__ := "" as character // cModelEventClassName
Static aPK__ := {} as array // aPrimaryKey
Static aRel__ := {} as array // aRelation
Static aFldComp__ := {} as array // aFieldsComponents
Static aGrdComp__ := {} as array // aGridComponents
Static aOthComp__ := {} as array // aOthersComponent
Static aStruct__  := {} as array

User Function dasdasd()

    cId__ :=
    aStruct__  :=

Return


Static Function ModelDef()

    Local oModel  as object

    Local nI := 0 as numeric

    aAdd( aStruct__, fGetStruct( aFldComp__ ) )
    aAdd( aStruct__, fGetStruct( aGrdComp__ ) )
    aAdd( aStruct__, fGetStruct( aOthComp__ ) )

    for nI:=1 to Len(aStruct__)




    next


    oModel := MPFormModel():New( cId__, /*bPre*/, /*bPos*/, /*bCommit*/, /*bCancel*/)

    oModel:AddFields('FIELD',/*cOwner*/,oStrField) // adiciona ao modelo a estrutura do cabeçalho

    //Local oEvent    as object





    // Define o modelo de eventos de validação e gatilhos
    //oEvent := Modules.Producao.Projects.KanbanOrdemProducao.Events.FormularioModelEvent():New()

    // Define as estruturas de dicionário/metadados
    oStrField := FWFormStruct(1,'SZ0', {|cCampo| !( AllTrim(cCampo) $ cCpoGrid ) } ) // defne os campos da field (enchoice)
    oStrGrid  := FWFormStruct(1,'SZ0', {|cCampo|  ( AllTrim(cCampo) $ cCpoGrid ) } ) // define os campos da grid

    // Redefine a propriedade de edição de campos do modelo
    oStrField:SetProperty( 'Z0_OPERPAD', MODEL_FIELD_WHEN   , {|| .T. } )
    oStrGrid:SetProperty ( 'Z0_DTIMP'  , MODEL_FIELD_WHEN   , {|| .T. } )
    oStrGrid:SetProperty ( 'Z0_USUIMP' , MODEL_FIELD_WHEN   , {|| .T. } )
    oStrGrid:SetProperty ( 'Z0_DTPROC' , MODEL_FIELD_WHEN   , {|| .T. } )
    oStrGrid:SetProperty ( 'Z0_USUPROC', MODEL_FIELD_WHEN   , {|| .T. } )
    oStrGrid:SetProperty ( 'Z0_DTIMP'  , MODEL_FIELD_OBRIGAT, .F.       )
    oStrGrid:SetProperty ( 'Z0_USUIMP' , MODEL_FIELD_OBRIGAT, .F.       )
    oStrGrid:SetProperty ( 'Z0_DTPROC' , MODEL_FIELD_OBRIGAT, .F.       )
    oStrGrid:SetProperty ( 'Z0_USUPROC', MODEL_FIELD_OBRIGAT, .F.       )

    // Define os gatilhos que serão executados
    oEvent:AddTrigger( oStrField, 'Z0_CDPROD', 'Z0_CDPROD'  )
    oEvent:AddTrigger( oStrField, 'Z0_CDPROD', 'Z0_OPERPAD' )
    oEvent:AddTrigger( oStrField, 'Z0_CDPROD', 'Z0_OPERAC'  )

    // Instanciando o modelo, não é recomendado colocar nome da user function (por causa do u_), respeitando 10 caracteres
    oModel := MPFormModel():New('GWFM001M', /*bPre*/, /*bPos*/, /*bCommit*/, /*bCancel*/)

    // Atribuindo formulários para o modelo
    oModel:AddFields('FIELD',/*cOwner*/,oStrField) // adiciona ao modelo a estrutura do cabeçalho
    oModel:AddGrid('GRID','FIELD',oStrGrid) // adiciona ao modelo a estrutura dos itens

    // Setando a chave primária da rotina
    oModel:SetPrimaryKey({'Z0_FILIAL','Z0_CODIGO'})

    // Define a regra de relacionamento.
    // Obs.: sempre, de filho para pai quando for tabelas distintas
    oModel:SetRelation( 'GRID', { { 'Z0_FILIAL', 'xFilial("SZ0")' } ,;
                                  { 'Z0_CODIGO', 'Z0_CODIGO'      } }, SZ0->(IndexKey(1)) ) // Z0_FILIAL+Z0_CODIGO

    // Adicionando descrição ao modelo
    fGetDescriptions()
    oModel:SetDescription(cDscModel__)
    oModel:GetModel('FIELD'):SetDescription(cDscField__)
    oModel:GetModel('GRID'):SetDescription(cDscGrid__)

    // Demais configurações do modelo
    // oModel:GetModel('GRID'):SetLPost( {|oModelGrid| .T. }) // pós-validação de linha do grid
    // oModel:GetModel('GRID'):SetMaxLine(999) // define a quantidade máxima de linha da grid
    // oModel:GetModel('GRID'):SetUseOldGrid(.T.) // compatibilidade com legado aheader/aCols
    oModel:GetModel('GRID'):SetNoInsertLine(.T.) // permite novas linhas
	oModel:GetModel('GRID'):SetNoDeleteLine(.T.) // permite exclusão de linhas
    oModel:GetModel('GRID'):SetUniqueLine( { "Z0_DTIMP", "Z0_USUIMP", "Z0_DTPROC", "Z0_USUPROC" } ) // regra para não permitir duplicidade de linhas
    oModel:GetModel('GRID'):SetOptional(.T.) // define o preenchimento da Grid é opcional

    oModel:InstallEvent('FormularioModelEvent', /*cOwner*/, oEvent)



Return



Static Function fGetStruct( aComponent as array )

    Local oStruct as object
    Local jComponent as json
    Local nI := 0 as numeric
    Local cAlias := "" as character
    Local bField := {||} as codeblock

    Default aComponent := nil

    for nI:=1 to Len(aComponent)

        jComponent := aComponent[nI]

        oStruct := FWFormStruct(1, jComponent['componentDataBaseAlias'], jComponent['componentFields'] )

        if jComponent:HasProperty('componentProperties')

            { "field":"Z0_OPERPAD", "property": "MODEL_FIELD_WHEN", "value":"{|| .T. }" }

        endif


    next

Return oStruct
