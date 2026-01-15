#include "totvs.ch"

/*/{Protheus.doc} gPos
Função auxiliar para chamada de ambiente da função GwPosicione().
@type function
@version 12.1.2410
@author giovani
@since 1/15/2026
@return variant, Retorno lógico (true/false) conforme resutlado da busca ou o valor da execução de bBlock (se informado).
@obs.: Consultar documentação de referência da função GwPosicione().
/*/
User Function gSeek( cAlias as character, nOrder as numeric, cSeek as character, bBlock as codeblock, lAutoFil as logical, lForceSeek as logical )

    Local xResult as variant

    xResult := Gworks.Library.Functions.U_GwPosicione( cAlias, nOrder, cSeek, bBlock, lAutoFil, lForceSeek )

Return xResult
