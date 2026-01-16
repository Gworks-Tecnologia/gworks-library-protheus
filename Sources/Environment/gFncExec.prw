#include "totvs.ch"

/*/{Protheus.doc} gFncExec
Rotina auxiliar para execução de funções.
@type function
@version 12.1.2410
@author Gworks - Giovani
@since 12/12/2025
@return variant, Retorno variável conforme rotina executada.
/*/
User Function gFncExec()

    Local xResult as variant
    Local oParamBox as object
    Local cFncToExec as character

    oParamBox := Gworks.Library.Classes.GwParamBox():New()
    oParamBox:SetDefaultSizeGet(100)
    oParamBox:SetDefaultRequired(.T.)
    oParamBox:SetDialogTitle("Parâmetros de Integração")
    oParamBox:SetDialogValid( {|| .T. } )
    oParamBox:SetDialogSave( .F. )

    oParamBox:AddParam("Get", "nome_funcao")
        oParamBox:SetProperty("nome_funcao", "cDescription", "Função" )
        oParamBox:SetProperty("nome_funcao", "cInit", space(250))
        oParamBox:SetProperty("nome_funcao", "lRequired", .T.)

    if( oParamBox:ShowDialog() )
        cFncToExec := allTrim(oParamBox:GetValue("nome_funcao"))
        if !empty(cFncToExec)
            if !("(" $ cFncToExec) .and. !(")" $ cFncToExec)
                cFncToExec += "()"
            endif
            xResult := &(cFncToExec)
        endif
    endif

Return xResult
