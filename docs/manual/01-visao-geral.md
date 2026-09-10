# Gestor Financeiro — Manual Oficial do Sistema
## Capítulo 1: Visão Geral e Arquitetura da Aplicação

### 1.1 O que é o Gestor Financeiro
O **Gestor Financeiro** é um ecossistema corporativo de inteligência e gestão financeira desenvolvido pela IT2A. Ele combina controle de fluxo de caixa, gestão contábil (DRE e Balanço Patrimonial), inteligência preditiva (projeções de 30 e 90 dias), controle de contas a pagar e a receber, cofre digital de documentos fiscais, monitoramento fiscal MEI e gestão avançada de investimentos (Renda Fixa e Renda Variável com cotações B3/Cripto em tempo real).

### 1.2 Modos de Visualização: Pessoal vs Organizacional (PJ)
A plataforma oferece alternância fluida entre dois ecossistemas:
- **Visão Pessoal**: Focada em patrimônio individual, reserva de emergência, despesas cotidianas, investimentos pessoais e metas financeiras familiares.
- **Visão Organizacional (PJ / Corporativa)**: Focada na gestão da empresa, centros de custo, contas bancárias jurídicas, DRE gerencial, obrigações com fornecedores, recebíveis de clientes e conformidade contábil.
- **Como alternar**: Na barra superior (Header), utilize o toggle **Pessoal / Corporativo**. Todos os dashboards, relatórios e filtros da API se adaptam automaticamente ao modo selecionado.

### 1.3 Módulos Principais do Sistema
1. **Início (Home)**: Portal executivo com atalhos para todos os módulos e métricas rápidas.
2. **Dashboard**: Cockpit de comando com 8 KPIs consolidados, projeção de fluxo de caixa (30/90 dias), saldos bancários, balanço de contas e gráficos patrimoniais.
3. **Financeiro / Contábil**: Módulo completo para conciliação bancária, fluxo de caixa diário, contas a pagar, contas a receber, DRE e Balanço Patrimonial.
4. **Investimentos**: Gestão de ativos de renda variável (Ações, FIIs, ETFs, Criptomoedas com cotações automáticas) e renda fixa (CDB, LCIs, LCAs, Tesouro Direto), cálculo de preço médio e controle de proventos/dividendos.
5. **Cofre Digital (DocsVault)**: Gestão de arquivos e notas fiscais (NF-e, NFS-e, recibos) com categorização e vínculo direto a lançamentos.
6. **Relatórios**: Demonstrativos de DRE, fluxo de caixa consolidado, extratos por centro de custo e relatórios fiscais para MEI (declaração DASN e relatório mensal).
7. **Configurações**: Cadastro de Contas Bancárias, Categorias (Receitas/Despesas), Centros de Custo, Gestão de Usuários e Assinatura.
8. **Concierge IA**: Assistente virtual nativo conectado ao **Azure AI Foundry (GPT-4.1)** para auxílio diário, respostas a dúvidas do sistema e análises patrimoniais em tempo real.
