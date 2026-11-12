# Diretrizes Contábeis: Competência vs. Caixa e Indicadores de Saúde Financeira

Este documento serve de base para o agente `accounting-specialist` e a skill `accounting-validation`.

## Princípios Fundamentais (Alinhados com CONTEXT.md)

1. **Regime de Caixa vs. Competência Gerencial**:
   - **Competência**: Reconhece receita e despesa na data do fato gerador/econômico (`recognitionDate`).
   - **Caixa**: Reconhece liquidação quando o dinheiro efetivamente entra ou sai da conta bancária (`cashDate` e `cashDirection`).
   - **Cartão de Crédito**: A compra pertence à data de reconhecimento do consumo/fato econômico, NUNCA à data de vencimento da fatura. O pagamento da fatura é liquidação financeira de passivo, não nova despesa por competência ([creditCard.ts](c:/IAC/gestorfinanceiro-azure/utils/creditCard.ts) e [accountingRecognition.ts](c:/IAC/gestorfinanceiro-azure/utils/accountingRecognition.ts)).

2. **Apuração de Resultado por Competência** ([accountingRecognition.ts](c:/IAC/gestorfinanceiro-azure/utils/accountingRecognition.ts)):
   - $\text{Resultado} = \text{Receita por Competência} - \text{Despesa por Competência}$.
   - $\text{Fluxo Líquido de Caixa} = \text{Entradas de Caixa} - \text{Saídas de Caixa}$.
   - O resultado econômico e o fluxo de caixa no mesmo período podem (e frequentemente devem) ser divergentes.

3. **Métricas de Saúde Contábil** ([accountingHealth.ts](c:/IAC/gestorfinanceiro-azure/utils/accountingHealth.ts)):
   - **Liquidez Corrente**: $\text{Ativo Circulante} / \text{Passivo Circulante}$.
   - **Liquidez Imediata**: $\text{Disponibilidades (Saldo Total)} / \text{Passivo Circulante}$.
   - **Margem Líquida**: $(\text{Lucro Líquido} / \text{Receita Bruta}) \times 100$.
   - **Inadimplência / Aging de Recebíveis**: Percentual de títulos vencidos sobre o total de contas a receber.
   - **Inadimplência de Fornecedores / Aging de Contas a Pagar**: Penalização no score quando há duplicatas a pagar vencidas.
   - **Pontuação (0 a 100)**: Distribuída em 4 pilares de até 25 pontos cada: Liquidez, Margem, Inadimplência/Aging e Runway.

4. **Tratamento de Contas e Partidas Dobradas**:
   - Toda transação de transferência bancária não altera o patrimônio líquido e não entra no resultado contábil.
   - Transferências possuem débito em uma conta e crédito em outra conta.

## Checklist de Validação

- [ ] Executar `npx tsx --test utils/accountingRecognition.test.ts utils/accountingHealth.test.ts`.
- [ ] Checar se faturas de cartão de crédito estão separando a despesa econômica da movimentação bancária da fatura.
- [ ] Validar integridade dos cálculos de Aging (overdue, 30d, 60d, 90d, 90d+).
- [ ] Validar consistência nos dados fornecidos ao [FinanceAccounting.tsx](c:/IAC/gestorfinanceiro-azure/components/FinanceAccounting.tsx) e [AccountingHealthCard.tsx](c:/IAC/gestorfinanceiro-azure/components/AccountingHealthCard.tsx).
