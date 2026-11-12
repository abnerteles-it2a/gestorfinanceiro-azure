---
name: accounting-validation
description: 'Valida reconhecimento contábil (competência gerencial vs regime de caixa), partidas dobradas, conciliação de faturas de cartão de crédito e métricas de saúde contábil (liquidez, margem, aging de contas a pagar/receber, runway). Use para auditoria contábil e testes de integridade financeira.'
user-invocable: true
---

# Skill de Validação Contábil

Esta skill executa auditoria, testes e diagnóstico de regras contábeis, garantindo o correto tratamento de receitas e despesas por competência, conciliação e apuração de saúde contábil.

## Quando Usar
- Verificar se lançamentos respeitam competência vs caixa.
- Testar apuração de resultado econômico (`summarizeRecognition`).
- Validar cálculos de liquidez corrente/imediata, margens e aging no [AccountingHealthCard.tsx](c:/IAC/gestorfinanceiro-azure/components/AccountingHealthCard.tsx).
- Auditar conciliação de faturas de cartão e parcelamentos ([creditCard.ts](c:/IAC/gestorfinanceiro-azure/utils/creditCard.ts)).
- Diagnosticar inconsistências contábeis e propor melhorias de governança fiscal.

## Procedimento de Validação

1. **Consulta de Diretrizes**:
   - Leia [domain-rules.md](./references/domain-rules.md).

2. **Execução de Testes Automatizados**:
   - Rodar a bateria de testes contábeis:
     ```powershell
     npx tsx --test utils/accountingRecognition.test.ts utils/accountingHealth.test.ts utils/creditCard.test.ts
     ```

3. **Verificação de Regras Contábeis**:
   - **Competência x Caixa**: Confirmar que o resumo de reconhecimento ([accountingRecognition.ts](c:/IAC/gestorfinanceiro-azure/utils/accountingRecognition.ts)) não confunde a data de compra parcelada com as datas dos vencimentos futuros da fatura.
   - **Liquidação Financeira**: O evento de liquidação (`kind: 'settlement'`) deve movimentar apenas caixa (`cashDirection`), sem alterar a receita ou despesa de competência.
   - **Aging e Inadimplência**:
     - Garantir que títulos vencidos (`overdue`) penalizam adequadamente o score de saúde contábil.
     - Certificar que divisão por zero não ocorre caso o total a receber/pagar seja zero.
   - **Score de Saúde Contábil**: Pontuação entre 0 e 100, validando os 4 tiers (`critical`, `warning`, `healthy`, `excellent`).

4. **Detecção de Desvios e Recomendações**:
   - Apontar qualquer duplicidade de despesa gerada por faturas de cartão.
   - Apresentar relatórios de inconformidade e sugerir correções de código e modelagem.
