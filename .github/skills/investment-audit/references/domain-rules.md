# Diretrizes de Auditoria e Validação de Investimentos

Este documento serve de base para o agente `investment-specialist` e a skill `investment-audit`.

## Conceitos de Domínio (Alinhados com CONTEXT.md)

1. **Lote**:
   - Parcela de uma posição adquirida em data e preço específicos.
   - Todo desinvestimento/venda deve executar controle FIFO estrito ([investmentLots.ts](c:/IAC/gestorfinanceiro-azure/utils/investmentLots.ts)).
   - NUNCA permitir quantidade de venda superior ao somatório de lotes abertos (`insufficient_quantity`).
   - Quantidades e preços negativos ou inválidos devem ser terminantemente rejeitados (`invalid_sale_quantity`, `invalid_lot_quantity`).

2. **Posição Consolidada vs. Valor Marcado**:
   - Custo total = $\sum (\text{quantidade} \times \text{preço de aquisição})$.
   - Preço médio ponderado = $\text{custo total} / \text{quantidade total}$.
   - Valor marcado = $\text{quantidade} \times \text{cotação atual}$. Cotação zero é válida como preço observado de mercado, mas não deve gerar divisão por zero.
   - Ganho/Perda não realizada = $\text{Valor marcado} - \text{Custo total}$.

3. **Valuation e Fórmulas Fundamentalistas** ([investmentValuation.ts](c:/IAC/gestorfinanceiro-azure/utils/investmentValuation.ts)):
   - **P/VP**: $\text{Preço} / \text{VPA}$. Requer preço > 0 e VPA > 0.
   - **Método Bazin**: $\text{Dividendo 12m} / (\text{Yield Mínimo} / 100)$. Yield padrão = 6%. Retorna null se dividendo <= 0.
   - **Fórmula de Graham**: $\sqrt{22.5 \times \text{LPA} \times \text{VPA}}$. Requer LPA > 0 e VPA > 0.
   - **Margem de Segurança**: $((\text{Preço Teto} / \text{Preço Atual}) - 1) \times 100$.

4. **Analytics e Simulações** ([investmentAnalytics.ts](c:/IAC/gestorfinanceiro-azure/utils/investmentAnalytics.ts)):
   - **Monte Carlo**: Distribuição log-normal com volatilidade anual e aportes periódicos.
   - **Stress Test**: Choques por classe de ativo (Ações, FIIs, Renda Fixa, Cripto). O patrimônio final nunca pode ser negativo ($\ge 0$).
   - **Retorno Composto**: Produtório de $(1 + r_i)$.
   - **Proventos**: Diferenciar proventos confirmados (data-com e valor anunciados) de meras projeções ou histórico.

## Checklist de Validação e Testes

- [ ] Executar `npm test -- utils/investment*.test.ts api/_investmentOperation.test.ts`.
- [ ] Validar que vendas parciais reduzem lotes em ordem cronológica de compra (FIFO).
- [ ] Verificar consistência no cálculo de preço médio e alocação percentual.
- [ ] Testar cenários de estresse com retornos negativos extremos (resiliência entre 10 e 98).
- [ ] Checar integração de proventos no calendário de dividendos.
