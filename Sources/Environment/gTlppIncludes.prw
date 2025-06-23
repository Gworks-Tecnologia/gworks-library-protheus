#include "totvs.ch"

/*/{Protheus.doc} gTlppInc
Função para exportar os includes do TLPP.
@type function
@version 12.1.2410
@author TOTVS
@since 6/22/2025
@link https://tdn.totvs.com/pages/viewpage.action?pageId=619741238
/*/
User Function gTlppInc()

	Local lRet := .F.
	Local cRet := ""
	Local aMessages := {}
	Local nI := 0

	ConOut("Getting TLPP includes ...")
	lRet := tlpp.environment.getIncludesTLPP(@cRet, @aMessages)

	If(lRet != .T.)
		ConOut("Error: " + cValToChar(cRet))
		For nI := 1 to Len(aMessages)
			ConOut(cValToChar(nI) + " Error: " + cValToChar(aMessages[nI]))
		Next
	Else
		ConOut("OK. 'includes' extracted on path: " + cValToChar(cRet))
	EndIf

Return lRet
