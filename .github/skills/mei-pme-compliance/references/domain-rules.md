# Regras Fiscais e Financeiras: MEI, PME e Pessoa Física

Este documento serve de base para o agente `business-rules-pme-mei-pf` e a skill `mei-pme-compliance`.

## Regras Fiscais e Operacionais do MEI (Microempreendedor Individual)

1. **Limite Anual de Faturamento e Proporcionalidade** ([meiFiscalCalculator.ts](c:/IAC/gestorfinanceiro-azure/utils/meiFiscalCalculator.ts)):
   - Limite anual teto: **R$ 81.000,00** (para 12 meses completos).
   - Se a empresa abriu no ano corrente (`openingDate`), o teto proporcional é:
     $$\text{Limite Efetivo} = \frac{81.000 \times \text{Meses Ativos}}{12}$$
     onde $\text{Meses Ativos} = 13 - \text{Mês de Abertura}$.
   - O consumo do limite (`limitUsagePercent`) e o saldo restante (`remainingLimit`) devem ser atualizados a cada receita empresarial.

2. **Parcela Isenta do IRPF na Declaração Anual (DASN-SIMEI)**:
   - Percentuais de presunção de lucro isento conforme atividade econômica:
     - **Comércio**: 8% da receita bruta
     - **Indústria**: 8% da receita bruta
     - **Transporte de passageiros**: 16% da receita bruta
     - **Serviços em geral**: 32% da receita bruta
   - **Rendimento Tributável Estimado**:
     $$\text{Lucro Bruto da Empresa} = \text{Receitas Empresariais} - \text{Despesas Empresariais}$$
     $$\text{Rendimento Tributável} = \max(0, \text{Lucro Bruto} - \text{Parcela Isenta})$$

3. **Guia DAS-MEI e Obrigações Mensais** ([meiObligationRules.ts](c:/IAC/gestorfinanceiro-azure/utils/meiObligationRules.ts)):
   - Vencimento fixo no dia **20** de cada mês (ou dia útil subsequente).
   - Competências aplicáveis geradas desde a data de abertura até o mês atual.
   - Status da obrigação: `pending`, `scheduled`, `paid`, `overdue`, `cancelled`.
   - Se `pending` e data atual > vencimento, transiciona logicamente para `overdue`.

4. **Fechamento Mensal do MEI** ([meiMonthlyClosing.ts](c:/IAC/gestorfinanceiro-azure/utils/meiMonthlyClosing.ts)):
   - Alerta obrigatório se houver receita sem categoria MEI classificada (`unclassifiedBusinessRevenueAmount > 0`).
   - Alerta se a guia DAS não foi gerada ou está pendente/atrasada.
   - Status do fechamento: `open`, `reviewed`, `closed`, `reopened`.

## Regras para PME e Pessoa Física

1. **Separação de Entidades (Princípio da Entidade)**:
   - Bloquear confusão patrimonial: contas bancárias pessoais vs. contas PJ da empresa.
   - Transações marcadas como `isBusinessRevenue` / `isBusinessExpense` afetam a apuração da empresa.
   - Transferências entre PF e PJ devem ser tratadas como pró-labore, distribuição de lucros ou aporte de capital.

2. **Pessoa Física**:
   - Orçamento doméstico mensal por categorias ([CategoryBudgetsWidget.tsx](c:/IAC/gestorfinanceiro-azure/components/CategoryBudgetsWidget.tsx)).
   - Objetivos financeiros e metas de poupança ([GoalsWidget.tsx](c:/IAC/gestorfinanceiro-azure/components/GoalsWidget.tsx)).
   - Conciliação bancária via extrato OFX/CSV ([bankStatementParser.ts](c:/IAC/gestorfinanceiro-azure/utils/bankStatementParser.ts)).
