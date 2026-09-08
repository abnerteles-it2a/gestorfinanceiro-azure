# Roadmap de Produto e Inovações: Gestor Financeiro Cloud-Native (Azure)

Atualizado em: 08/09/2026

## 1. Módulo de Investimentos Inteligente (Foundry Agent)
- **Atualização Automática de Cotações:** Busca híbrida via Bing Grounding e APIs de mercado para ações (B3), FIIs, Tesouro Direto, Criptomoedas e ativos internacionais.
- **Termômetro de Alocação (Compra / Venda / Sem Ação):**
  - Avaliação automática de valuation por múltiplos (P/L, P/VP, Dividend Yield).
  - Cálculo dinâmico do Preço Teto de Graham e Décio Bazin para indicar margem de segurança.
- **Validação de Intenção de Compra (Watchlist & Simulação):**
  - O usuário submete um ticker pretendido e o agente avalia se o ativo está em bom ponto de entrada e se é coerente com a alocação alvo da carteira.
- **Leitura de Fatos Relevantes:** Resumos automáticos de avisos aos acionistas, datas de corte (data-com) e pagamentos de proventos.

## 2. Automação Multimodal e Omnichannel
- **Entrada por Voz (Speech-to-Text):** Transcrição de despesas via áudio com extração estruturada de JSON para lançamento instantâneo.
- **CFO Falante (Text-to-Speech):** Utilização do deployment existente `gpt-4o-mini-tts` para respostas de áudio e briefing financeiro.
- **OCR de Documentos (DocsVault):** Reconhecimento óptico de boletos, cupons fiscais e notas fiscais para agendamento de contas a pagar.
- **Conciliação Bancária:** Processamento de extratos OFX/PDF para identificação de lançamentos pendentes e duplicidades.

## 3. Arquitetura e Provedores
- **E-mail Transacional:** Substituição definitiva do AWS SES pelo Azure Communication Services Email (`@azure/communication-email`).
- **IA:** Azure AI Foundry com recurso `abner-7506-resource` e modelo `gpt-4.1`.
- **Banco de Dados:** Azure Database for PostgreSQL Flexible Server (`psql-aiops-prod-brsouth`).
- **Deploy:** Azure Container Apps (`ca-gestor-staging`) no ambiente `cae-aiops-prod`.
