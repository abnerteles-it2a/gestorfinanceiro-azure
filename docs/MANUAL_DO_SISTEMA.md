# Manual Oficial do Sistema — Gestor Financeiro Enterprise
**Versão**: 2.0 (Azure Cloud-Native)  
**Mantenedor**: IT2A Tecnologia e Inteligência Financeira  
**Modelo de IA Integrado**: Azure AI Foundry (GPT-4.1)

---

## Índice Geral
1. [Capítulo 1: Visão Geral e Arquitetura da Aplicação](#capítulo-1-visão-geral-e-arquitetura-da-aplicação)
2. [Capítulo 2: Contas Bancárias e Gestão de Saldos](#capítulo-2-contas-bancárias-e-gestão-de-saldos)
3. [Capítulo 3: Categorias e Centros de Custo](#capítulo-3-categorias-e-centros-de-custo)
4. [Capítulo 4: Lançamentos Financeiros e Fluxo de Caixa](#capítulo-4-lançamentos-financeiros-e-fluxo-de-caixa)
5. [Capítulo 5: Contas a Pagar e a Receber](#capítulo-5-contas-a-pagar-e-a-receber)
6. [Capítulo 6: Investimentos Inteligentes e Gestão Patrimonial](#capítulo-6-investimentos-inteligentes-e-gestão-patrimonial)
7. [Capítulo 7: DRE Contábil, Balanço Patrimonial e Relatórios Fiscais](#capítulo-7-dre-contábil-balanço-patrimonial-e-relatórios-fiscais)
8. [Capítulo 8: Cofre Digital e Documentos Fiscais (DocsVault)](#capítulo-8-cofre-digital-e-documentos-fiscais-docsvault)
9. [Capítulo 9: Jornada de Onboarding e Rotinas do Dia a Dia](#capítulo-9-jornada-de-onboarding-e-rotinas-do-dia-a-dia)

---

## Capítulo 1: Visão Geral e Arquitetura da Aplicação
O **Gestor Financeiro** é um ecossistema corporativo de inteligência e gestão financeira desenvolvido pela IT2A. Ele combina controle de fluxo de caixa, gestão contábil (DRE e Balanço Patrimonial), inteligência preditiva (projeções de 30 e 90 dias), controle de contas a pagar e a receber, cofre digital de documentos fiscais, monitoramento fiscal MEI e gestão avançada de investimentos (Renda Fixa e Renda Variável com cotações B3/Cripto em tempo real).

### Modos de Visualização: Pessoal vs Organizacional (PJ)
- **Visão Pessoal**: Focada em patrimônio individual, reserva de emergência, despesas cotidianas, investimentos pessoais e metas financeiras familiares.
- **Visão Organizacional (PJ / Corporativa)**: Focada na gestão da empresa, centros de custo, contas bancárias jurídicas, DRE gerencial, obrigações com fornecedores, recebíveis de clientes e conformidade contábil.
- **Como alternar**: Na barra superior (Header), utilize o toggle **Pessoal / Corporativo**.

---

## Capítulo 2: Contas Bancárias e Gestão de Saldos
Uma conta bancária representa qualquer local de custódia (contas correntes, bancos digitais, corretoras ou caixinha em dinheiro).

### Como Cadastrar uma Nova Conta
1. Clique no ícone de engrenagem (**Configurações**).
2. Selecione a aba **Contas**.
3. Na seção "Adicionar Nova Conta", preencha Nome da Conta, Banco, Saldo Inicial e Tipo de Conta.
4. Clique em **Salvar Conta**.
*Atalho alternativo*: Durante o preenchimento de um Novo Lançamento, clique no botão `+` ao lado do seletor de contas.

### Cálculo de Saldo Real Auditado
Saldo Atual = Saldo Inicial + Entradas - Saídas + Transferências Recebidas - Transferências Enviadas.

---

## Capítulo 3: Categorias e Centros de Custo
As categorias alimentam gráficos, o DRE e os conselhos do Concierge IA.

### Como Criar Categorias
1. Em Configurações, acesse a aba **Categorias**.
2. Escolha o tipo: **Receita** ou **Despesa**.
3. Digite o nome da categoria (ex: Moradia, Alimentação, Vendas) e confirme no botão `+`.

### Centros de Custo
Unidades gerenciais de segregação (ex: Comercial, Operacional, TI, Reforma). Cadastre na aba Centros de Custo em Configurações.

---

## Capítulo 4: Lançamentos Financeiros e Fluxo de Caixa
Oferece 4 modos de lançamento:
1. **Manual**: Formulário tradicional no botão "Novo Lançamento".
2. **Por Voz 🎙️**: No modal, clique no microfone e fale naturalmente (ex: *"Almoço de 45 reais no cartão Nubank"*).
3. **Linguagem Natural**: Digite frases como *"gasolina 100 reais bradesco"* no Concierge IA.
4. **Recorrências e Parcelamentos**: Marque "Repetir / Parcelar" para assinaturas ou compras divididas em até 12x ou mais.

### Projeção 30 e 90 Dias
Calcula saldo futuro considerando saldo presente + projeção de contas a pagar/receber e lançamentos recorrentes.

---

## Capítulo 5: Contas a Pagar e a Receber
Gerencia compromissos e direitos creditórios com vencimento futuro.
- **Cadastrar**: Módulo Financeiro / Contábil > aba Contas a Pagar ou Receber > "Novo Lançamento".
- **Liquidar / Baixar**: Clique no ícone de check na linha do título quando a obrigação for quitada ou recebida. O saldo bancário é atualizado automaticamente.

---

## Capítulo 6: Investimentos Inteligentes e Gestão Patrimonial
- **Renda Variável**: Ações da B3, Fundos Imobiliários (FIIs), ETFs e Criptomoedas com busca de cotações automáticas e cálculo de preço médio.
- **Renda Fixa**: CDBs, LCIs, LCAs, Tesouro Direto com indexadores pactuados (% CDI, IPCA+, Pré).
- **Proventos/Dividendos**: Botão "Prov." no ativo para registrar rendimentos creditados em conta.

---

## Capítulo 7: DRE Contábil, Balanço Patrimonial e Relatórios Fiscais
- **DRE**: Receita Bruta - Deduções/Impostos = Receita Líquida - Custos/Despesas = Resultado Operacional Líquido.
- **Balanço Patrimonial**: Ativos Totais (Bancos + Investimentos + Recebíveis) - Passivos Totais (Contas a Pagar) = Patrimônio Líquido.
- **Módulo MEI**: Termômetro com teto anual de R$ 81.000,00, relatório mensal segregado e cálculo de DASN-SIMEI.

---

## Capítulo 8: Cofre Digital e Documentos Fiscais (DocsVault)
Armazenamento em nuvem criptografado para notas fiscais (NF-e, NFS-e), recibos e contratos com vínculo direto a lançamentos financeiros e contas a pagar.

---

## Capítulo 9: Jornada de Onboarding e Rotinas do Dia a Dia
**Roteiro em 4 Passos**:
1. Cadastrar Contas Bancárias com saldo inicial real.
2. Criar Árvore de Categorias.
3. Fazer o Primeiro Lançamento (manual ou por voz).
4. Estabelecer Metas SMART.

**Rotinas**:
- Diária (2 min): lançamentos do dia e conferência de saldo no Concierge IA.
- Semanal (10 min): conferência de contas a pagar e a receber da semana.
- Mensal (30 min): análise de DRE, taxa de poupança e rebalanceamento de carteira de investimentos.
