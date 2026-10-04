# Correções de integridade financeira

## Estado da entrega
Implementação em andamento na branch `fix/financial-integrity-advisor`. Não houve deploy, commit, migração remota ou chamadas pagas de IA. Alterações pré-existentes em `api/query.ts`, `.agents/memory` e `mobile/` devem ser preservadas.

## Regressões executadas pelo coordenador
| Comportamento | Red observado | Correção | Verificação |
| --- | --- | --- | --- |
| Parcelas mensais em 31/jan | 03/mar e 03/abr, sem fevereiro | Clamp em UTC e preservação do dia-âncora | `npx tsx --test utils/financial.test.ts`: passou |
| Cache Advisor entre usuários | A e B recebiam a mesma chave pessoal | Chave inclui userId; efeito cancela e ignora resposta obsoleta | `npx tsx --test utils/advisorSession.test.ts`: passou; integração React ainda não validada |
| Saldo completo ao carregar histórico | Saldo autoritativo recebia efeito de página novamente | Snapshot completo mais delta entre baseline e estado atual | `npx tsx --test utils/financialSnapshot.test.ts`: passou; integração backend em andamento |
| Venda entre lotes | Venda150 em dois lotes100 ignorava o segundo lote | Redução FIFO validada por helper de produção | Red e green executados; helper e caller FIFO integrados; atomicidade do fluxo ainda pendente |

## Mudanças em integração
- Importador autenticado não transforma rejeição remota em lançamento local confirmado. Janela permanece aberta se o total confirmado divergir do solicitado. Ainda falta resultado por item e idempotência de importação para retry seguro.
- Atualizações parciais de investimentos/renda fixa omitem campos não fornecidos; backend PATCH em implementação. Não declarar atomicidade da venda enquanto os movimentos e a posição forem comandos separados.
- Extração por voz de investimento, lançamento e widget envia Bearer obtido do AuthContext. Contrato de escopo e respostas segue em revisão.
- Paginação consome cursor/hasMore do backend e deduplica IDs. Baseline do snapshot acompanha páginas já incluídas no saldo completo.

## Verificação global
Antes das mudanças: 18 testes, typecheck e build passaram. A suíte foi ampliada para `tsx --test utils/*.test.ts api/_*.test.ts api/ai/*.test.ts`, incluindo os testes MEI convertidos de Vitest ausente para node:test. Última execução completa: **81 testes, 81 aprovados, zero falhas**. **Typecheck e build cliente/servidor passaram**. Avisos de build permanecem: http/https externalizados no cliente e propriedade CSS `file` inválida. Não houve execução no navegador. Um erro intermediário de export durante trabalho paralelo foi resolvido antes desta execução.

## Correções adicionais após revisão
- Separação de `financial_transactions` completo/autorizado do histórico paginado100 no bootstrap e operação de refresh correspondente. DRE, relatórios e dashboard passam a consumir histórico completo; posição mantém snapshot independente.
- Novas contas, exclusão de contas e alteração de saldo inicial atualizam o snapshot local confirmado.
- Execução do Advisor cobra saldo residual de obrigação parcialmente liquidada, não seu valor original integral.
- Descoberta eager de rotas no servidor exclui `*.test.ts` e `*.spec.ts`, impedindo testes no início de produção.
- Scope organizacional requer membership; dados pessoais não entram no Concierge organizacional. Parecer indisponível retorna erro explícito, não diagnóstico zerado de sucesso.
- Monte Carlo preserva zero; performance agrega ticker e compõe CDI; stress usa preço marcado; valuation não fabrica fundamentos. Calendário produz somente estimativas, sem confirmação/data-com inventadas; monitor fiscal distingue units e resgates RF.
- Snapshot teve SQL de produção exercitado com SQLite local adaptado para verificar transferências e filtros. Isso **não substitui PostgreSQL** para locks, isolamento e migrations.
- Skill code-review executada e achados usados na integração. Skill security-review não iniciou por ausência de `origin/HEAD`; não foi criada referência remota para contornar o bloqueio.

## Pendências explícitas
- Validar snapshot/baixa parcial/PATCH em PostgreSQL isolado; implementações e regressões locais concluídas, mas nenhum banco remoto foi acessado.
- Executar migração de `obligation_settlements` antes de usar baixa idempotente na instalação atualizada; migração remota não executada.
- Validar a nova operação atômica de venda/resgate em PostgreSQL isolado e navegador; implementação web integrada e testes controlados aprovados. Criar `investment_operations` antes da ativação na instalação atualizada.
- Integrar cartões/faturas e competência às telas/persistência; helpers isolados não representam fluxo entregue.
- Completar idempotência FITID e resultado por item no importador; não há garantia de retry integral sem duplicação em importação parcialmente confirmada.
- Completar deadline Azure, validação runtime de datas/referências e testes React de troca de usuário/escopo.
- Otimizar ledger completo no bootstrap para grandes históricos; o payload cresce proporcionalmente à quantidade de movimentos.
- Executar suíte completa, typecheck, build, revisão de segurança e validação do aplicativo com dados controlados.
- Atualizar manuais somente conforme comportamento efetivamente implementado.

## Etapa atual: operação de venda/resgate e caixa

O comando `investment_dispose` está implementado e integrado ao fluxo web de venda/resgate. O objetivo é gravar a redução de posição e o movimento opcional de caixa numa única transação, com identificador estável para retry. O principal resgatado de renda fixa é informado separadamente do valor líquido de caixa; compra e proventos permanecem fora desta etapa.

### Backend integrado
O module de produção `disposeInvestment` e o comando `investment_dispose` estão integrados. Posição, caixa opcional, uso de quota e journal são gravados no mesmo client/transação. O journal autoriza replay pelo ator e escopo, compara o pedido preservado e funciona após exclusão total da posição. Quantidade usa precisão de oito casas decimais; principal de renda fixa usa centavos. A definição aditiva de `investment_operations` está nos mecanismos de schema existentes; nenhuma migração remota foi executada. Ausência da estrutura retorna 503 antes das mutations.

O agente responsável reportou 13 testes da operação mais três testes adjacentes aprovados, com adapter stateful de rollback/serialização. Após a integração final da tela, o coordenador executou novamente suíte completa, typecheck, build cliente/servidor e diff --check: todos passaram. O runner anterior à última alteração da tela contabilizou 106 testes; a última alteração acrescentou uma regressão cliente, coberta também pela execução final. Os avisos de build existentes permanecem.

### Confirmação e retry no fluxo web
O modal usa somente o comando atômico nos branches de venda/resgate; compra/proventos permaneceram no caminho anterior. O contexto recarrega posições, contas, página, ledger e snapshot autoritativamente após confirmação; não aplica lotes históricos devolvidos por replay. Resultado incerto conserva o pedido e UUID; confirmação seguida de falha de recarga conserva o recibo e repete somente a reconciliação. Guards de geração/identidade impedem aplicar resposta de outra visão/usuário.

Limites: os testes atravessam os modules de produção com adapters controlados, mas não montam o provider React nem dirigem o modal num navegador. Retry é em memória e se perde no reload. Bootstrap lê coleções separadamente, sem garantia de um único snapshot SQL. Os comandos CRUD legados não participam da serialização de desinvestimento.

### Revisão de código desta etapa
A skill code-review executada apontou problemas no mobile preexistente (venda adicionando lote, propagação de visão organizacional, confirmação de recebimento, totais/saldos parciais). Mobile ficou fora do ownership desta fatia e não foi alterado; esses achados não equivalem a validação nem correção do aplicativo mobile. A serialização por escopo limita concorrência entre comandos de desinvestimento; CRUD legado não participa desse lock, portanto não está abrangido pela garantia.

### Verificação intermediária
A execução `npm test` durante o ciclo red da nova etapa encontrou duas falhas: resgate total manteve uma linha com principal zero em vez de removê-la, e o module cliente ainda não existia quando seu teste foi executado. O comando interrompeu antes do typecheck. Esse resultado não substitui os 81 testes aprovados da etapa anterior nem representa validação final da implementação nova.

Critérios para concluir: rollback de todas as escritas em falha; replay após exclusão total sem nova baixa/caixa; mesma operação com payload divergente rejeitada; formulário preservado em erro; confirmação seguida de reconciliação autoritativa sem ressuscitar lotes históricos. Testes com adapters controlados não serão apresentados como validação de locks em PostgreSQL real.

## Skills e método
Diagnóstico e TDD orientam ciclos red→green em seams de produção. Design de modules concentra conhecimento reutilizável; adapters controlados evitam serviços reais nos testes. Revisões de UI/dados devem respeitar o design do projeto. Os resultados serão atualizados conforme cada verificação concluir, sem promover teste local a confirmação em produção.
