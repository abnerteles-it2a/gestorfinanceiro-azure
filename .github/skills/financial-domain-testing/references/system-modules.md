# Matriz Geral de Módulos e Testes do Sistema

Este documento serve de base para o agente `financial-specialist` e a skill `financial-domain-testing`.

## Módulos do Sistema e Seus Componentes

| Módulo | Componentes de UI | Utilitários / APIs | Suites de Teste |
|---|---|---|---|
| **Fluxo de Caixa & Projeção** | [CashFlowView.tsx](c:/IAC/gestorfinanceiro-azure/components/CashFlowView.tsx), [PredictiveCashFlow.tsx](c:/IAC/gestorfinanceiro-azure/components/PredictiveCashFlow.tsx), [CashFlowWidget.tsx](c:/IAC/gestorfinanceiro-azure/components/CashFlowWidget.tsx) | [cashFlowForecast.ts](c:/IAC/gestorfinanceiro-azure/utils/cashFlowForecast.ts) | `utils/cashFlowForecast.test.ts` |
| **Contas e Saldos** | [AccountsList.tsx](c:/IAC/gestorfinanceiro-azure/components/AccountsList.tsx), [AccountBalancesWidget.tsx](c:/IAC/gestorfinanceiro-azure/components/AccountBalancesWidget.tsx), [MonthlyBalance.tsx](c:/IAC/gestorfinanceiro-azure/components/MonthlyBalance.tsx) | [financialSnapshot.ts](c:/IAC/gestorfinanceiro-azure/utils/financialSnapshot.ts), [financial.ts](c:/IAC/gestorfinanceiro-azure/utils/financial.ts), [api/_financial.ts](c:/IAC/gestorfinanceiro-azure/api/_financial.ts) | `utils/financialSnapshot.test.ts`, `api/_snapshotBalance.test.ts`, `api/_financial.test.ts` |
| **Contas a Pagar / Receber e Liquidações** | [PayablesList.tsx](c:/IAC/gestorfinanceiro-azure/components/PayablesList.tsx), [AddTransactionModal.tsx](c:/IAC/gestorfinanceiro-azure/components/AddTransactionModal.tsx) | [transactionHelpers.ts](c:/IAC/gestorfinanceiro-azure/utils/transactionHelpers.ts), [api/transactions.ts](c:/IAC/gestorfinanceiro-azure/api/transactions.ts) | `utils/transactionHelpers.test.ts`, `api/_settlement.test.ts` |
| **Cartão de Crédito e Faturas** | [BankStatementImporterModal.tsx](c:/IAC/gestorfinanceiro-azure/components/BankStatementImporterModal.tsx), [CashFlowView.tsx](c:/IAC/gestorfinanceiro-azure/components/CashFlowView.tsx) | [creditCard.ts](c:/IAC/gestorfinanceiro-azure/utils/creditCard.ts), [accountingRecognition.ts](c:/IAC/gestorfinanceiro-azure/utils/accountingRecognition.ts) | `utils/creditCard.test.ts`, `utils/accountingRecognition.test.ts` |
| **Investimentos e Portfólio** | [Investments.tsx](c:/IAC/gestorfinanceiro-azure/components/Investments.tsx), [InvestmentTabs.tsx](c:/IAC/gestorfinanceiro-azure/components/InvestmentTabs.tsx), [InvestmentSummary.tsx](c:/IAC/gestorfinanceiro-azure/components/InvestmentSummary.tsx), [MonteCarloSimulator.tsx](c:/IAC/gestorfinanceiro-azure/components/MonteCarloSimulator.tsx) | [investmentLots.ts](c:/IAC/gestorfinanceiro-azure/utils/investmentLots.ts), [investmentValuation.ts](c:/IAC/gestorfinanceiro-azure/utils/investmentValuation.ts), [investmentAnalytics.ts](c:/IAC/gestorfinanceiro-azure/utils/investmentAnalytics.ts) | `utils/investment*.test.ts`, `utils/valuationFormulas.test.ts`, `api/_investmentOperation.test.ts` |
| **MEI & Fiscal** | [MeiStatusWidget.tsx](c:/IAC/gestorfinanceiro-azure/components/MeiStatusWidget.tsx), [MeiMonthlyClosingPanel.tsx](c:/IAC/gestorfinanceiro-azure/components/MeiMonthlyClosingPanel.tsx), [MeiReportsModal.tsx](c:/IAC/gestorfinanceiro-azure/components/MeiReportsModal.tsx) | [meiFiscalCalculator.ts](c:/IAC/gestorfinanceiro-azure/utils/meiFiscalCalculator.ts), [meiObligationRules.ts](c:/IAC/gestorfinanceiro-azure/utils/meiObligationRules.ts), [meiMonthlyClosing.ts](c:/IAC/gestorfinanceiro-azure/utils/meiMonthlyClosing.ts) | `utils/meiFiscalCalculator.test.ts`, `utils/meiObligationRules.test.ts`, `utils/meiMonthlyClosing.test.ts` |
| **Contabilidade & Saúde Financeira** | [FinanceAccounting.tsx](c:/IAC/gestorfinanceiro-azure/components/FinanceAccounting.tsx), [AccountingHealthCard.tsx](c:/IAC/gestorfinanceiro-azure/components/AccountingHealthCard.tsx), [FinancialHealthScore.tsx](c:/IAC/gestorfinanceiro-azure/components/FinancialHealthScore.tsx) | [accountingHealth.ts](c:/IAC/gestorfinanceiro-azure/utils/accountingHealth.ts), [accountingRecognition.ts](c:/IAC/gestorfinanceiro-azure/utils/accountingRecognition.ts) | `utils/accountingHealth.test.ts`, `utils/accountingRecognition.test.ts` |
| **Assistente e AI Advisor** | [HelpChatbot.tsx](c:/IAC/gestorfinanceiro-azure/components/HelpChatbot.tsx), [InsightsCarousel.tsx](c:/IAC/gestorfinanceiro-azure/components/InsightsCarousel.tsx) | [api/ai/agent.ts](c:/IAC/gestorfinanceiro-azure/api/ai/agent.ts), [api/ai/advice.ts](c:/IAC/gestorfinanceiro-azure/api/ai/advice.ts), [api/ai/proactive.ts](c:/IAC/gestorfinanceiro-azure/api/ai/proactive.ts) | `api/ai/*.test.ts`, `utils/advisorSession.test.ts` |

## Comandos de Teste e Validação

- Testes completos de backend e utilitários de negócio:
  ```powershell
  npm test
  ```
- Checagem estática de tipos TypeScript:
  ```powershell
  npm run typecheck
  ```
- Build de validação:
  ```powershell
  npm run build
  ```
