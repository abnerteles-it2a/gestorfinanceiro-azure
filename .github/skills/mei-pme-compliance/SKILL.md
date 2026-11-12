---
name: mei-pme-compliance
description: 'Audita e valida regras fiscais, tributárias e operacionais para MEI, PME e Pessoa Física: teto anual proporcional do MEI (R$ 81k), cálculo de presunção IRPF (8%, 16%, 32%), obrigações DAS, fechamento mensal, segregação patrimonial PF x PJ e orçamento. Use para testes e identificação de bugs tributários/fiscais.'
user-invocable: true
---

# Skill de Conformidade e Regras MEI, PME e Pessoa Física

Esta skill provê diretrizes e testes para regras de negócio aplicáveis ao microempreendedor individual, pequenas empresas e finanças pessoais.

## Quando Usar
- Verificar cálculo de faturamento anual do MEI e seu teto proporcional na abertura.
- Testar apuração da parcela isenta vs. tributável no IRPF do MEI.
- Validar vencimentos e status das guias DAS-MEI (dia 20).
- Avaliar o painel de fechamento mensal do MEI ([MeiMonthlyClosingPanel.tsx](c:/IAC/gestorfinanceiro-azure/components/MeiMonthlyClosingPanel.tsx)).
- Auditar separação patrimonial entre sócio (Pessoa Física) e empresa (PME/MEI).
- Diagnosticar falhas em [MeiStatusWidget.tsx](c:/IAC/gestorfinanceiro-azure/components/MeiStatusWidget.tsx), [MeiReportsModal.tsx](c:/IAC/gestorfinanceiro-azure/components/MeiReportsModal.tsx) e [MeiMonitoringWidget.tsx](c:/IAC/gestorfinanceiro-azure/components/MeiMonitoringWidget.tsx).

## Procedimento de Validação

1. **Consulta das Regras da Legislação**:
   - Leia [domain-rules.md](./references/domain-rules.md).

2. **Execução de Testes Automatizados**:
   - Rodar bateria de testes MEI e obrigações:
     ```powershell
     npx tsx --test utils/meiFiscalCalculator.test.ts utils/meiObligationRules.test.ts utils/meiMonthlyClosing.test.ts
     ```

3. **Verificação de Regras Específicas**:
   - **Teto Proporcional do MEI**:
     - Se empresa abriu em Maio, limite é $81.000 \times 8 / 12 = 54.000$.
     - Testar se meses anteriores não geram competências retroativas indevidas.
   - **Isenção de IRPF**:
     - Confirmar que alíquotas de presunção estão corretas: 8% (comércio/indústria), 16% (transporte), 32% (serviços).
     - Lucro tributável nunca deve ser negativo ($\ge 0$).
   - **Fechamento Mensal**:
     - Checar geração de avisos em caso de receitas sem atividade MEI informada.
     - Verificar se a guia DAS da competência foi contemplada.
   - **Segregação PF x PJ**:
     - Validar que transações de transferência não contam como faturamento empresarial nem como despesa operacional.

4. **Identificação de Desvios e Propostas de Correção**:
   - Produzir diagnóstico claro detalhando regras violadas, impacto tributário e diff de correção.
