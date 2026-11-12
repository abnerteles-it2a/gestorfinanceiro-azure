# Gestor Financeiro

Gestão do caixa, obrigações, posição de investimentos e aconselhamento financeiro de uma pessoa ou organização.

## Estado verificado do produto — 12/11/2026

Revisão do codebase local na branch `staging`, commit `51b25bc`, incluindo o código mobile não rastreado. Esta seção descreve evidências locais, não certifica a instalação remota, conformidade fiscal ou prontidão comercial.

- **Web**: React 19, TypeScript e Vite; API Express com PostgreSQL. Há perfis `pf`, `mei` e `empresa`, visão pessoal/organizacional, permissões por participação/centro de custo e assinaturas com integração Asaas. Isso não equivale a três motores fiscais completos.
- **Mobile**: React Native/Expo, consumindo a mesma API. Na revisão, todo o diretório estava não rastreado; aprovação do build web não inclui entrega ou paridade mobile.
- **Financeiro**: histórico paginado e histórico financeiro completo são contratos distintos. O bootstrap fornece `transactions`, `financial_transactions` e `financial_snapshot`; relatórios agregados não devem usar apenas `transactions`.
- **Obrigações**: a baixa web usa transação, bloqueio do título e journal de idempotência. A implementação atual mantém `status = open` na baixa parcial e acumula `paid_amount`/`received_amount`; consumidores devem considerar o residual, sem exigir que toda baixa parcial tenha status literal `partial`.
- **Investimentos**: venda/resgate web possui comando atômico `investment_dispose`, redução de posição e caixa opcional. Isso não estabelece atomicidade para compra/proventos nem garante paridade com os comandos CRUD/mobile. FIFO operacional não certifica apuração tributária de ganhos.
- **Contabilidade**: DRE exibida é gerencial, baseada em caixa. Existem helpers testados de competência e cartão, mas ainda não há fluxo completo de reconhecimento econômico, vínculo compra–fatura–liquidação e conciliação persistida. Não anunciar escrituração contábil completa ou competência integrada.
- **MEI**: há cálculo de teto proporcional, receitas classificadas, estimativa de parcela isenta/tributável, obrigações e fechamento mensal. DASN-SIMEI (empresa) e IRPF (pessoa física) são obrigações distintas. As estimativas não substituem validação contábil, regras legais atualizadas, emissão ou transmissão oficial.
- **Dados de mercado**: diferenciar cotação/fundamento observado, benchmark estático e premissa informada. A existência de fórmulas Graham/Bazin não comprova qualidade, atualidade ou adequação dos dados de entrada.

### Lacunas identificadas na revisão inicial

A tabela abaixo preserva o diagnóstico anterior às correções. Consulte o [checklist de implementação](correcoes-integridade-premium.md) para o estado atualizado; não interpretar problemas já corrigidos no código como ainda ativos.

| Área | Evidência na revisão inicial | Critério de aceite |
| --- | --- | --- |
| Ciclo do banco | [checkout](api/subscription/checkout.ts) e [webhook](api/subscription/webhook.ts) encerram com `db.end()` o singleton de [pool](api/_db.ts). Novas consultas ao mesmo pool encerrado falham. | Rotas não encerram o pool global; teste checkout/webhook seguido de consulta no mesmo processo. |
| Cobrança | [Webhook](api/subscription/webhook.ts) reaplica extensão de vigência ao receber novamente confirmação do mesmo pagamento. | Journal por pagamento/evento, transação e transições monotônicas; duplicidade, concorrência e eventos fora de ordem não concedem períodos extras. |
| MEI e completude | [Monitor](components/MeiMonitoringWidget.tsx) e [relatórios](components/MeiReportsModal.tsx) consomem a coleção paginada. A [baixa de recebível](api/_financial.ts) também não propaga a classificação `is_business_revenue` para o movimento. | Totais iguais antes/depois de paginar; receita empresarial à vista e recebida por título produz apuração consistente, sem classificar automaticamente empréstimos/aportes como faturamento. |
| Cartão e recorrência | [Cadastro](components/AddTransactionModal.tsx) não verifica `response.ok` nas criações futuras nem envia `x-view-mode`; competência fica em notas e vencimentos passados geram saída sem confirmação de pagamento. | Erro HTTP não vira sucesso; escopo preservado; compra gera obrigação sem débito presumido; vínculo e competência estruturados; retry não duplica parcelas. |
| DAS | [Regra de vencimento](utils/meiObligationRules.ts) não ajusta dia não útil; [agendamento](components/MeiReportsModal.tsx) usa o dia 20 do próprio mês de referência, enquanto o helper usa o mês seguinte. | Uma regra compartilhada para competência/vencimento, calendário aplicável e testes do formulário até a persistência. |
| Mobile | [Formulário de investimento](mobile/screens/InvestmentFormScreen.tsx) envia `investments_insert` também na venda; [contexto](mobile/context/FinancialDataContext.tsx) calcula totais mensais pela página e não propaga escopo às consultas de projeção. | Usar os comandos financeiros compartilhados; venda reduz posição; totais completos; leituras e escritas respeitam a visão selecionada. |
| Valuation | [Simulador](components/InvestmentSimulator.tsx) trata tickers terminados em `11` como FII salvo poucas exceções, incluindo units como SANB11; valores observados não positivos podem ceder a benchmarks positivos. | Classe do instrumento explícita, ausência diferente de zero/prejuízo e fonte/período visíveis; premissas não substituem silenciosamente observações. |

### Correções locais após a revisão

O [checklist](correcoes-integridade-premium.md) registra a execução e os testes de cada frente. Cobrança passou a preservar o pool e usar journal/transação por pagamento; monitor/relatórios MEI usam histórico completo; classificação empresarial explícita é persistida no título e propagada à baixa. O cadastro de cartão cria obrigação mesmo vencida, valida HTTP e escopo, e conserva UUIDs das parcelas para retry em memória. DAS usa vencimento compartilhado no mês seguinte e respeita a data cadastrada; feriados/prorrogações ainda exigem fonte oficial.

Mobile usa desinvestimento atômico e preserva pedido para reconciliação; totais usam snapshot completo e projeções respeitam residual/escopo. Valuation distingue ausência de zero/prejuízo e não classifica FII apenas pelo sufixo `11`; benchmarks são sinalizados como estimativas. A validação final desta rodada aprovou **172 testes root e 14 mobile**, typechecks separados, build cliente/servidor e diff-check. Não houve dispositivo/Metro/APK, navegador ou PostgreSQL real; recuperação mobile via SecureStore ainda precisa de teste em dispositivo.

A [migração aditiva](scripts/migrate_premium_integrity.sql) inclui `billing_payments`, `obligation_creation_operations` e campos de classificação. Ela foi preparada, **não aplicada**. A instalação depende de migração prévia e reconciliação de pagamentos legados sem vínculo; testes com adapters não comprovam locks/isolamento no PostgreSQL real. Compras/faturas ainda não formam um subledger contábil completo e os retries dos formulários não sobrevivem a reload.

### Validação complementar isolada

Após as correções, a [integração PostgreSQL](api/_premiumPostgres.integration.ts) aprovou **26/26 casos no PostgreSQL 16.15 real**, incluindo reexecução da migração, idempotência concorrente, baixas/MEI, FIFO, cobrança e rollback. Oito cenários registraram espera por locks reais. Foi usado container próprio com loopback, porta efêmera, schema mínimo compatível e dados sintéticos; container e dados foram removidos. Isso amplia a evidência além dos adapters, mas não confirma o schema/dados do staging nem o fluxo HTTP/navegador integrado.

O Chromium local também executou a aplicação compilada real com HTTP controlado: **6 cenários / 38 verificações aprovadas**, cobrindo cartão vencido, erro e retry nos dois escopos, MEI completo além de 100 movimentos e valuation com unit/zero/prejuízo. Não houve erros de página; requisições externas foram bloqueadas e erros HTTP foram injetados deliberadamente. Browser e servidor foram encerrados. Não é E2E integrado ao PostgreSQL nem validação do staging. Após essa execução, uma afirmação residual de dados “100% B3/CVM” foi substituída por aviso correto de procedência; 17 testes direcionados e typecheck passaram após o ajuste textual.

### Evolução recomendada para SaaS premium

1. **Confiabilidade antes de novas funcionalidades**: resolver as lacunas acima e adicionar regressões nos fluxos reais, não apenas em helpers.
2. **Núcleo compartilhado**: manter um monólito modular, com comandos de obrigações, investimentos, faturamento e escopo reaproveitados por web/mobile; separar transporte, regras e persistência. Não há evidência nesta revisão que justifique microserviços.
3. **Produto por segmento**: PF para orçamento/patrimônio; MEI para receitas, DAS e fechamento assistido; PME para contas a pagar/receber, caixa, centros de custo, aprovação e exportação ao contador. Investimentos devem ser um domínio transversal com adequação distinta de tesouraria PJ e patrimônio PF.
4. **Governança**: migrações versionadas fora do caminho de requisição, trilha de alterações/estornos, períodos fechados com reabertura auditada, política de retenção/exportação e restauração de backup exercitada.
5. **Escala e custos**: agregados no servidor com escopo/período e reconciliação contra o ledger completo; não reduzir carga voltando a calcular totais por página. Medir latência, payload e consumo de banco/IA antes de escolher cache ou infraestrutura adicional.
6. **Qualidade de entrega**: integração PostgreSQL isolada para locks/retry/rollback, E2E de troca de visão e falhas de rede, paridade mobile, métricas de erros e rastreabilidade de comandos. Revisão de segurança dedicada antes de liberação comercial.

### Evidência e limites da validação

- `npm test`: 110 testes aprovados; `npm run typecheck` e `npm run build`: aprovados. Build ainda emite aviso sobre propriedade CSS `file` desconhecida.
- Typecheck mobile aprovado separadamente; não há script de testes mobile no manifesto revisado.
- Provas locais com dados sintéticos reproduziram: diferença de receita MEI entre 150 registros e a página de 100; vencimento DAS em sábado; extensão duplicada de assinatura no handler real com adapter de banco; rejeição de consultas após encerrar um pool `pg` sem conexão real.
- Não foram executados navegador, dispositivo móvel, cobrança real, consultas/migrações remotas, teste de recuperação ou concorrência em PostgreSQL real. A suíte verde não elimina os gaps de integração identificados.
- [Histórico de correções](docs/financial-integrity-corrections.md) e [contexto de migração](CONTEXTO_MIGRACAO_AZURE.md) são registros históricos; suas declarações de deploy/pendência não substituem verificação atual.

## Linguagem

### Financeiro

**Visão pessoal**: Conjunto de contas, movimentos e obrigações da pessoa, separado dos registros de organizações.

**Visão organizacional**: Conjunto de registros da organização acessível conforme participação e permissões da pessoa.

**Saldo completo**: Posição de uma conta considerando os movimentos pertinentes de todo o histórico, independentemente da página exibida.
_Evitar_: Saldo da página

**Histórico paginado**: Parte dos movimentos apresentada para navegação. Não representa a completude da posição financeira.

**Obrigação**: Valor a pagar ou receber associado a um vencimento e a uma origem econômica.

**Baixa parcial**: Liquidação de parte de uma obrigação, conservando seu saldo residual aberto.
_Evitar_: Quitação, quando ainda há saldo residual

**Saldo residual**: Parte do principal de uma obrigação ainda não liquidada.

**Regime de caixa**: Reconhecimento das entradas e saídas quando ocorre a movimentação financeira.

**Competência gerencial**: Reconhecimento de receita ou despesa no período do fato econômico. Não equivale, por si só, a escrituração contábil ou apuração fiscal completa.

**Compra no crédito**: Despesa financiada pelo cartão, distinta do pagamento bancário da fatura.

**Fatura de cartão**: Conjunto de parcelas de compras pertencentes a um ciclo de fechamento, com vencimento próprio.

**Pagamento de fatura**: Liquidação da obrigação com o cartão. Não constitui uma nova compra ou segunda despesa por competência.

### Investimentos

**Lote**: Parcela de uma posição adquirida numa data e a um preço de aquisição.

**Posição consolidada**: Quantidade e custo agregados dos lotes de um instrumento.

**Valor marcado**: Valor da posição usando cotação disponível, distinto do custo de aquisição.

**Fundamento observado**: Informação econômica identificada pela origem e período de referência, distinta de premissa ou estimativa.

**Premissa de simulação**: Hipótese usada para projetar cenários; não é um resultado futuro confirmado.

**Provento confirmado**: Evento de distribuição identificado por uma fonte. Uma previsão de calendário não é confirmação.

### Advisor

**Insight proativo**: Observação financeira oferecida sem uma solicitação pontual, baseada no contexto disponível.

**Parecer sob demanda**: Texto ou análise gerada para uma solicitação da pessoa sobre um contexto financeiro.

**Ação confirmada**: Operação explicitamente aceita pela pessoa e executada sob suas permissões. Não significa transferência bancária autônoma.
