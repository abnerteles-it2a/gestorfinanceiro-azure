# Gestor Financeiro — Manual Oficial do Sistema
## Capítulo 6: Investimentos Inteligentes e Gestão Patrimonial

### 6.1 Visão Geral do Módulo de Investimentos
O Gestor Financeiro conta com um motor completo de acompanhamento patrimonial para pessoas físicas e jurídicas:
- **Renda Variável**: Ações da B3 (ex: PETR4, VALE3, ITUB4), Fundos Imobiliários (FIIs como HGLG11, MXRF11), BDRs, ETFs e Criptomoedas (BTC, ETH, SOL).
- **Renda Fixa**: CDBs, LCIs, LCAs, Tesouro Selic/IPCA+, Debêntures e Fundos de Renda Fixa com prazos de vencimento e taxas pactuadas (% CDI, IPCA + taxa pré, etc.).
- **Integração com Mercado**: Busca de cotações automáticas e atualização diária de valor de mercado e rentabilidade percentual.

### 6.2 Como Cadastrar Ativos de Renda Variável
1. Acesse o menu **Investimentos**.
2. Clique no botão **"Novo Investimento"**.
3. Selecione a operação: **Compra** (ou Venda para desinvestimento).
4. Selecione o tipo de ativo: *Ações*, *FIIs*, *Cripto* ou *ETFs*.
5. Preencha:
   - **Ticker / Código**: Ex: `WEGE3`, `BBDC4`, `XPML11`, `BTC`.
   - **Quantidade**: Número de cotas/ações adquiridas.
   - **Preço de Compra (R$)**: Preço unitário pago na data do pregão.
   - **Data da Operação**: Data da execução da ordem na corretora.
   - **Conta Bancária (Opcional)**: Ao selecionar a conta da corretora, o sistema debita automaticamente o valor total da compra do seu saldo em caixa.
6. Clique em **Salvar**. Compras são registradas por lote. A performance agrega os lotes do mesmo ticker para os pesos; a posição exibida por lote não constitui um livro fiscal completo de operações.

**Venda e resgate:** a tela envia um único comando autenticado. A redução da posição, o movimento opcional de caixa e o registro de retry são confirmados na mesma transação de banco. Com lote explicitamente selecionado, a redução se limita àquele lote; sem seleção, usa FIFO entre lotes de ticker e tipo compatíveis. Quantidade superior à posição disponível é rejeitada.

- No resgate de renda fixa, selecione a aplicação por identificador e informe o principal abatido, separado do valor recebido em caixa. Não há cálculo automático de juros ou imposto.
- Em erro de comunicação com resultado incerto, tente novamente na mesma janela: o pedido e identificador permanecem estáveis, evitando nova baixa. Esse estado de retry é mantido em memória e não sobrevive ao recarregamento da página.
- Se a operação confirmou, mas a atualização da tela falhou, repetir tenta somente recarregar os dados. Não envia nova venda/resgate. A janela só conclui após confirmação e reconciliação.
- A estrutura `investment_operations` precisa estar criada pela migração antes de ativar o fluxo. Sem ela, o comando recusa a operação antes de alterar dados. Nenhuma migração remota foi executada durante a implementação.
- A serialização cobre comandos de venda/resgate; alterações concorrentes pelos comandos CRUD legados não participam do mesmo lock. A validação com PostgreSQL real e navegador permanece necessária.

### 6.3 Como Cadastrar Ativos de Renda Fixa
1. Em **Investimentos**, clique em **Novo Investimento** e escolha a aba **Renda Fixa**.
2. Preencha:
   - **Nome do Ativo**: Ex: *CDB Banco Inter 110% CDI* ou *Tesouro IPCA+ 2035*.
   - **Emissor / Instituição**: Ex: *Banco Master*, *Tesouro Nacional*.
   - **Valor Investido (R$)**: Capital inicial aplicado.
   - **Rentabilidade Pactuada**: Ex: `100% CDI`, `IPCA + 6.2%`, `12% a.a. Pré`.
   - **Data de Vencimento**: Data final da liquidação do título.
3. Clique em **Salvar**.

### 6.4 Controle de Dividendos e Proventos
- Quando uma empresa ou FII pagar dividendos/JCP:
  - Na linha do ativo na lista de investimentos, clique no botão **"Prov." (Provento)**.
  - Informe o valor total creditado e a conta bancária onde o dinheiro foi depositado.
  - O sistema registra o provento informado e seu movimento financeiro. Confirme conta, data e valor com a corretora; não use previsão de calendário como comprovante.

### 6.5 Premissas e disponibilidade
- Monte Carlo e stress utilizam exposição marcada quando há cotação, com premissas de retorno/volatilidade e cenários explicitados. Probabilidades são ilustrativas, não garantias.
- O CDI mensal é composto, não somado. Históricos incompletos devem permanecer indisponíveis.
- Graham, Bazin e P/VP exigem fundamentos válidos. Dado ausente não é inferido da cotação; zero observado não deve ser substituído por yield presumido.
- Units conhecidas da B3 não são FIIs apenas por terminarem em 11. Ativos não cobertos exigem confirmação de classificação.
- Radar de volumes não substitui apuração de lucro, custo médio fiscal, IRRF, prejuízos compensáveis ou DARF.
