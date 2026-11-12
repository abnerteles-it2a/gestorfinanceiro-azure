# Diretrizes Globais do Copilot - Gestor Financeiro Azure

## Contexto de Domínio e Terminologia
- Sempre consulte o [CONTEXT.md](../CONTEXT.md) antes de alterar ou avaliar lógica financeira e de negócios.
- Respeite rigorosamente a linguagem de domínio:
  - **Saldo completo**: calculado a partir de todos os movimentos históricos ([financialSnapshot.ts](../utils/financialSnapshot.ts)), nunca a partir de páginas paginadas.
  - **Obrigação e Baixa parcial**: ao quitar parte de um título a pagar/receber, conservar o saldo residual em aberto.
  - **Regime de competência vs. caixa**: compras no cartão de crédito pertencem à data de reconhecimento do fato gerador; o pagamento da fatura é liquidação financeira de passivo, não nova despesa ([creditCard.ts](../utils/creditCard.ts), [accountingRecognition.ts](../utils/accountingRecognition.ts)).
  - **Investimentos**: desinvestimentos e amortizações seguem obrigatoriamente ordenação cronológica de lotes (FIFO) ([investmentLots.ts](../utils/investmentLots.ts)).
  - **MEI**: teto anual de R$ 81.000 proporcional ao mês de abertura no ano corrente; apuração de parcela isenta de IRPF conforme alíquotas de presunção (8%, 16%, 32%) ([meiFiscalCalculator.ts](../utils/meiFiscalCalculator.ts)).

## Agentes Especialistas Disponíveis (.github/agents/)
- **Especialista em Investimentos**: [.github/agents/investment-specialist.agent.md](./agents/investment-specialist.agent.md)
- **Especialista Financeiro (Transversal)**: [.github/agents/financial-specialist.agent.md](./agents/financial-specialist.agent.md)
- **Especialista Contábil**: [.github/agents/accounting-specialist.agent.md](./agents/accounting-specialist.agent.md)
- **Especialista em Regras para PME, MEI e PF**: [.github/agents/business-rules-pme-mei-pf.agent.md](./agents/business-rules-pme-mei-pf.agent.md)

## Skills de Suporte (.github/skills/)
- **Auditoria de Investimentos**: [.github/skills/investment-audit/SKILL.md](./skills/investment-audit/SKILL.md)
- **Validação Contábil**: [.github/skills/accounting-validation/SKILL.md](./skills/accounting-validation/SKILL.md)
- **Regras Fiscais MEI, PME e PF**: [.github/skills/mei-pme-compliance/SKILL.md](./skills/mei-pme-compliance/SKILL.md)
- **Testes de Domínio Financeiro**: [.github/skills/financial-domain-testing/SKILL.md](./skills/financial-domain-testing/SKILL.md)

## Validação e Qualidade de Código
- Após alterações em arquivos de regras financeiras, sempre execute `npm test` e `npm run typecheck` para garantir que nenhuma regressão foi introduzida.
