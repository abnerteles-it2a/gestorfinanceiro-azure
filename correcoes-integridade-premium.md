# Checklist de correções de integridade

Corrigir os gaps confirmados na revisão do codebase de 12/11/2026, sem reescrita, deploy ou migração remota.

- [x] Cobrança e pool: pool preservado, journal por pagamento e transações/locks → 20 testes com adapter controlado aprovados. Migração necessária; pagamentos legados desconhecidos exigem reconciliação.
- [x] MEI: histórico completo, classificação explícita no cadastro e propagação na baixa → regressões com mais de 100 movimentos e recebimento empresarial aprovadas.
- [x] DAS: competência/vencimento compartilhados, fim de semana e preservação de vencimento cadastrado → testes aprovados; feriados/prorrogações dependem de calendário oficial ou override.
- [x] Cartão/recorrência: HTTP, escopo, obrigação sem débito presumido e UUID por parcela → 17 regressões aprovadas. Lotes não são atômicos; retry não sobrevive a reload.
- [x] Mobile: desinvestimento atômico, totais completos e escopo → 14 testes mobile aprovados e typecheck mobile aprovado; recuperação SecureStore ainda requer dispositivo.
- [x] Valuation: classe explícita, ausência/zero/prejuízo e fallback sinalizado → testes de units, FIIs, LPA negativo e dividendos zero aprovados.
- [x] Atualizar contexto e manuais conforme o comportamento entregue; registrar limites e pendências reais.
- [x] Validação final: `npm test` (172 aprovados), testes `mobile/utils/*.test.ts` (14 aprovados), `npm run typecheck`, `npm run build`, typecheck mobile e `git diff --check` aprovados. Permanece aviso CSS preexistente sobre propriedade `file`.

## Validação complementar em PostgreSQL real

- [x] PostgreSQL 16.15 em container próprio, loopback/porta efêmera e dados sintéticos: **26/26 casos aprovados**.
- [x] Migração repetida três vezes, inclusive após inserir dados; criação idempotente, baixas parciais, FIFO, cobrança e rollback exercitados com helpers reais.
- [x] Oito cenários comprovaram espera por locks no PostgreSQL, incluindo criação concorrente e prevenção de liquidação/venda acima do saldo.
- [x] Container e dados temporários removidos. Teste reproduzível: [integração PostgreSQL](api/_premiumPostgres.integration.ts), executado explicitamente fora da suíte padrão.
- [x] Chromium local com app compilada real: **6 cenários / 38 verificações aprovadas**. Cartão vencido gera obrigação, HTTP 503 mantém modal, retry conserva UUID/payload nos escopos pessoal/organizacional; MEI soma 125 receitas apesar de página de 100; valuation preserva zero/prejuízo e reconhece unit. Zero erros de página; erros de console foram requisições externas bloqueadas e falhas HTTP injetadas. Browser/servidor encerrados.
- [x] Removida afirmação residual de dados “100% B3/CVM” no rodapé do simulador; 17 testes direcionados e typecheck aprovados após ajuste. O browser foi executado antes deste ajuste textual; não foi repetido.

HTTP do navegador foi controlado com dados sintéticos; não equivale a E2E integrado com banco.

Limites: schema mínimo compatível e quota sintética transacional. Não certifica equivalência com o schema/dados do staging, integrações externas ou implantação.

## Implantação pendente

Aplicar [migração aditiva](scripts/migrate_premium_integrity.sql) em alvo aprovado **antes** do código dependente. Nenhum banco remoto foi acessado nesta execução. Para cobrança, pendentes legados ainda vinculados por ID são incorporados ao journal durante o callback; pagamentos vinculados já ativos/expirados não recebem extensão adicional. IDs sem vínculo retornam erro e exigem reconciliação, não confirmação silenciosa. Inventariar pendentes e conferir titular, escopo, plano e periodicidade; monitorar reentregas do provedor e solicitar replay controlado após reconciliar, sem depender de retries indefinidos.

## Limites

Não inclui nova arquitetura distribuída, certificação fiscal, transmissão oficial, revisão de segurança dedicada ou validação em PostgreSQL/serviços reais. Cartão completo com entidades próprias e reconciliação de fatura não deve ser anunciado como entregue apenas por corrigir o cadastro. Ajustes que exigirem decisão de produto devem ser explicitados antes de implementação.
