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
6. Clique em **Salvar**. O sistema recalcula o **Preço Médio (PM)** e a posição consolidada.

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
  - O sistema registra o dividendo, credita a conta bancária e calcula o *Yield on Cost (YoC)* acumulado da sua carteira.
