# Tipos de Grid
Principais tipos de GRID que podem ser implementadas em tecnologia TOTVS Protheus (advpl/tlpp).

## Orientada Objetos
Modelo de Grid totalmente orientada a objetos utilizando o framework MVC do Advpl.

## Array
Grid's mais simples, que utilizam o conceito de array.

**Exemplos:**

* [MsSelect()](https://tdn.totvs.com/display/public/framework/MsSelect)
* [MsNewGetDados()](https://tdn.totvs.com/display/public/framework/MsNewGetDados)

Estes modelos, empregam uso dos arrays estruturais aHeader e aCols, onde:

### aHeader
Array referente ao cabeçalho da Grid, cada posição representa uma coluna de dados e possui a seguinte estrutura:
* 01 - Título
* 02 - Campo
* 03 - Picture
* 04 - Tamanho
* 05 - Decimal
* 06 - Validação
* 07 - Reservado
* 08 - Tipo
* 09 - Reservado
* 10 - Reservado


### aCols
Estrutura de dados da Grid, **cada posição do aCols representa uma linha inteira na grid** e possui uma coluna do tipo lógica a mais para representar o status de deleção da linha, onde:
* .T. (true) - linha deletada
* .F. (false) - linha ativa (não deletada)


## Exemplo de Implementação em MsNewGetDados
```java
#include "protheus.ch"

User Function MrbwGtCl()
    Private cCadastro := "Pedidos de Venda"
    Private aRotina := {
        {"Pesquisar"  , "axPesqui" , 0, 1},
        {"Visualizar" , "U_ModGtd" , 0, 2},
        {"Incluir"    , "U_ModGtd" , 0, 3}
    }

    DbSelectArea("SC5")
    DbSetOrder(1)
    MBrowse(6, 1, 22, 75, "SC5")
Return
```

```java
User Function ModGtd(cAlias, nReg, nOpc)
    Local nX := 0
    Local nUsado := 0
    Local aButtons := {}
    Local aCpoEnch := {}
    Local cAliasE := cAlias
    Local aAlterEnch := {}
    Local aPos := {000, 000, 080, 400}
    Local nModelo := 3
    Local lF3 := .F.
    Local lMemoria := .T.
    Local lColumn := .F.
    Local caTela := ""
    Local lNoFolder := .F.
    Local lProperty := .F.
    Local aCpoGDa := {}
    Local cAliasGD := "SC6"
    Local nSuperior := 081
    Local nEsquerda := 000
    Local nInferior := 250
    Local nDireita := 400
    Local cLinOk := "AllwaysTrue"
    Local cTudoOk := "AllwaysTrue"
    Local cIniCpos := "C6_ITEM"
    Local nFreeze := 000
    Local nMax := 999
    Local cFieldOk := "AllwaysTrue"
    Local cSuperDel := ""
    Local cDelOk := "AllwaysFalse"
    Local aHeader := {}
    Local aCols := {}
    Local aAlterGDa := {}

    Private oDlg
    Private oGetD
    Private oEnch
    Private aTELA[0][0]
    Private aGETS[0]

    DbSelectArea("SX3")
    DbSetOrder(1)
    DbSeek(cAliasE)

    While !Eof() .And. SX3->X3_ARQUIVO == cAliasE
        If !(SX3->X3_CAMPO $ "C5_FILIAL") .And. cNivel >= SX3->X3_NIVEL .And. X3Uso(SX3->X3_USADO)
            AADD(aCpoEnch, SX3->X3_CAMPO)
        EndIf
        DbSkip()
    End

    aAlterEnch := aClone(aCpoEnch)

    DbSelectArea("SX3")
    DbSetOrder(1)
    MsSeek(cAliasGD)

    While !Eof() .And. SX3->X3_ARQUIVO == cAliasGD
        If !(AllTrim(SX3->X3_CAMPO) $ "C6_FILIAL") .And. cNivel >= SX3->X3_NIVEL .And. X3Uso(SX3->X3_USADO)
            AADD(aCpoGDa, SX3->X3_CAMPO)
        EndIf
        DbSkip()
    End

    aAlterGDa := aClone(aCpoGDa)

    nUsado := 0
    dbSelectArea("SX3")
    dbSeek("SC6")
    aHeader := {}

    While !Eof() .And. (x3_arquivo == "SC6")
        If X3USO(x3_usado) .And. cNivel >= x3_nivel
            nUsado := nUsado + 1
            AADD(aHeader, {TRIM(x3_titulo), x3_campo, x3_picture,
                x3_tamanho, x3_decimal, "AllwaysTrue()",
                x3_usado, x3_tipo, x3_arquivo, x3_context})
        EndIf
        dbSkip()
    End

    If nOpc == 3 // Incluir
        aCols := {Array(nUsado + 1)}
        aCols[1, nUsado + 1] := .F.
        For nX := 1 To nUsado
            If aHeader[nX, 2] == "C6_ITEM"
                aCols[1, nX] := "0001"
            Else
                aCols[1, nX] := CriaVar(aHeader[nX, 2])
            EndIf
        Next
    Else
        aCols := {}
        dbSelectArea("SC6")
        dbSetOrder(1)
        dbSeek(xFilial() + M->C5_NUM)

        While !Eof() .And. C6_NUM == M->C5_NUM
            AADD(aCols, Array(nUsado + 1))
            For nX := 1 To nUsado
                aCols[Len(aCols), nX] := FieldGet(FieldPos(aHeader[nX, 2]))
            Next
            aCols[Len(aCols), nUsado + 1] := .F.
            dbSkip()
        End
    EndIf

    Dlg := MSDIALOG():New(000,000,400,600, cCadastro,,,,,,,,,.T.)
    RegToMemory("SC5", If(nOpc==3,.T.,.F.))
    oEnch := MsMGet():New(cAliasE,nReg,nOpc,/*aCRA*/,/*cLetra*/, /*cTexto*/,;
                          aCpoEnch,aPos, aAlterEnch, nModelo, /*nColMens*/, /*cMensagem*/,;
                          cTudoOk,oDlg,lF3, lMemoria,lColumn,caTela,lNoFolder,lProperty)

    oGetD:= MsNewGetDados():New(nSuperior,nEsquerda,nInferior,nDireita, nOpc,;
    							cLinOk,cTudoOk,cIniCpos,aAlterGDa,nFreeze,nMax,cFieldOk, cSuperDel,;
                                cDelOk, oDLG, aHeader, aCols)

    // Tratamento para definição de cores específicas,
    // logo após a declaração da MsNewGetDados
    oGetD:oBrowse:lUseDefaultColors := .F.
    oGetD:oBrowse:SetBlkBackColor({|| GETDCLR(oGetD:aCols,oGetD:nAt,aHeader)})
    oDlg:bInit := {|| EnchoiceBar(oDlg, {||oDlg:End()}, {||oDlg:End()},,aButtons)}
    oDlg:lCentered := .T.
    oDlg:Activate()

Return
```
```java
// Função para tratamento das regras de cores para a grid da MsNewGetDados
Static Function GETDCLR(aLinha,nLinha,aHeader)
    Local nCor2 := 16776960 // Ciano - RGB(0,255,255)
    Local nCor3 := 16777215 // Branco - RGB(255,255,255)
    Local nPosProd := aScan(aHeader,{|x| Alltrim(x[2]) == "C6_PRODUTO"})
    Local nUsado := Len(aHeader)+1
    Local nRet := nCor3
    If !Empty(aLinha[nLinha][nPosProd]) .AND. aLinha[nLinha][nUsado]
        nRet := nCor2Else
    If !Empty(aLinha[nLinha][nPosProd]) .AND. !aLinha[nLinha][nUsado]
        nRet := nCor3
    Endif
Return nRet
```

