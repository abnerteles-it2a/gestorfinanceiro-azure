---
name: investment-audit
description: 'Audita e valida cálculos de investimentos, valuation B3 (Graham, Bazin, P/VP), redução de lotes FIFO, rentabilidade composta, simulação Monte Carlo e testes de estresse de carteira. Use para diagnosticar bugs em investimentos e sugerir melhorias.'
user-invocable: true
---

# Skill de Auditoria e Validação de Investimentos

Esta skill fornece procedimentos passo a passo para inspecionar, testar e diagnosticar bugs em módulos de carteira de investimentos, renda variável, renda fixa e proventos.

## Quando Usar
- Verificar integridade de cálculos de valuation (Graham, Bazin, P/VP, Margem de Segurança).
- Testar regras de desinvestimento, amortização e baixa de lotes (FIFO).
- Validar simulações de projeção patrimonial (Monte Carlo) e stress testing.
- Analisar bugs em [Investments.tsx](c:/IAC/gestorfinanceiro-azure/components/Investments.tsx), [InvestmentSimulator.tsx](c:/IAC/gestorfinanceiro-azure/components/InvestmentSimulator.tsx), [DividendCalendar.tsx](c:/IAC/gestorfinanceiro-azure/components/DividendCalendar.tsx), [PortfolioRiskMatrix.tsx](c:/IAC/gestorfinanceiro-azure/components/PortfolioRiskMatrix.tsx).
- Sugerir melhorias quantitativas e de portfólio.

## Procedimento de Validação

1. **Leitura das Diretrizes de Domínio**:
   - Consulte [domain-rules.md](./references/domain-rules.md).

2. **Execução de Testes Automatizados**:
   - Rodar suite de testes unitários do motor de investimentos:
     ```powershell
     npx tsx --test utils/investment*.test.ts utils/valuationFormulas.test.ts api/_investmentOperation.test.ts
     ```

3. **Verificação de Regras Críticas**:
   - **FIFO de Lotes**: Testar [investmentLots.ts](c:/IAC/gestorfinanceiro-azure/utils/investmentLots.ts) com casos de borda:
     - Quantidade de venda igual ao total exato.
     - Venda parcelada consumindo múltiplos lotes em datas distintas.
     - Tentativa de venda de quantidade maior do que a disponível (deve disparar `insufficient_quantity`).
   - **Valuation**: Em [investmentValuation.ts](c:/IAC/gestorfinanceiro-azure/utils/investmentValuation.ts), validar que LPA ou VPA negativos/nulos retornam `null` em vez de NaN ou erro de runtime.
   - **Preço Médio**: Garantir que compras adicionais recalculam o custo médio ponderado sem alterar os lotes históricos.
   - **Proventos e Dividendos**: Validar se o reinvestimento de dividendos reflete como novo aporte ou caixa livre.

4. **Identificação de Falhas e Proposta de Melhorias**:
   - Classificar se é bug de arredondamento monetário (centavos), divisão por zero ou quebra de premissa conceitual.
   - Apresentar o diagnóstico com caso de teste reproduzível e diff sugerido.
