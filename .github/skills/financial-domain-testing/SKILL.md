---
name: financial-domain-testing
description: 'Executa e avalia testes ponta a ponta dos módulos financeiros do sistema: fluxo de caixa, conciliação de saldos, baixa parcial de obrigações, projeções e liquidações. Use para auditoria de bugs e verificação de saúde operacional de todos os módulos.'
user-invocable: true
---

# Skill de Testes de Domínio Financeiro

Esta skill orienta a execução de testes, análise de cobertura, identificação de falhas de regras de negócio e validação da consistência de todos os módulos financeiros da plataforma.

## Quando Usar
- Verificar se todos os módulos do sistema estão funcionando conforme o esperado.
- Executar testes automatizados (unitários, integração e cálculos de fluxo de caixa).
- Validar conformidade de regras de saldo completo vs. histórico paginado.
- Auditar baixas parciais de obrigações e cálculo de saldo residual.
- Analisar projeções de fluxo de caixa baseadas em obrigações conhecidas.
- Identificar regressões após alterações no código.

## Procedimento de Validação

1. **Consulta da Matriz de Módulos**:
   - Leia [system-modules.md](./references/system-modules.md) para identificar os componentes e suites pertinentes ao teste.

2. **Execução da Suite Completa**:
   - Rodar todos os testes de utilitários e APIs:
     ```powershell
     npm test
     ```
   - Executar checagem de tipos estáticos:
     ```powershell
     npm run typecheck
     ```

3. **Verificação de Regras Financeiras Principais**:
   - **Fluxo de Caixa Preditivo** ([cashFlowForecast.ts](c:/IAC/gestorfinanceiro-azure/utils/cashFlowForecast.ts)):
     - Garantir que apenas obrigações em aberto/parciais entram na projeção.
     - Confirmar que títulos vencidos convergem para liquidação simulada na data atual.
   - **Contas e Saldos** ([financialSnapshot.ts](c:/IAC/gestorfinanceiro-azure/utils/financialSnapshot.ts)):
     - Conferir se o saldo inicial somado ao histórico de lançamentos não sofre distorção por paginação.
   - **Baixa Parcial**:
     - Assegurar que ao liquidar R$ 40 de uma conta de R$ 100, o saldo residual de R$ 60 permanece pendente.

4. **Elaboração de Relatório de Diagnóstico**:
   - Descrever o comportamento observado vs. esperado.
   - Apontar arquivo e linha com link Markdown.
   - Sugerir melhorias arquiteturais e funcionais.
