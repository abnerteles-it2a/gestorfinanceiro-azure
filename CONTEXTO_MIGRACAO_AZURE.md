# CONTEXTO DE MIGRAÃ‡ÃƒO E PROJETO: GESTOR FINANCEIRO AZURE

> **Documento Mestre de TransiÃ§Ã£o de SessÃ£o / Continuidade Antigravity AI**
> Atualizado em: 08/09/2026

---

## 1. MissÃ£o e Arquitetura do Projeto

Este projeto (`gestorfinanceiro-azure`) Ã© a versÃ£o cloud-native modernizada do Gestor Financeiro, migrado da AWS/GCP para a Microsoft Azure, com foco em:
1. **Infraestrutura no Azure:** Azure Container Apps para deploy contÃ­nuo, Azure Database for PostgreSQL Flexible para banco de dados.
2. **IA Nativa no Azure AI Foundry:** SubstituiÃ§Ã£o do Google Vertex AI antigo pelos modelos GPT-4o e Azure AI Agent Service integrados ao recurso `abner-7506-resource`.
3. **EstratÃ©gia de CrÃ©ditos Microsoft for Startups:**
   - Meta Atual: Marco de $50.000 USD (manter 7+ recursos >= $1.00/dia ininterruptos por 60 dias).
   - PrÃ³xima Meta: Marco de $150.000 USD (apÃ³s receber os $50k, escalar uso no Foundry e faturar ~$3.000/mÃªs sustentado em 10+ workloads).

---

## 2. InventÃ¡rio de Recursos no Azure (Subscription IT2a Tecnologia)

- **Assinatura:** `IT2a Tecnologia` (`f1e1a295-04ed-41e6-9e6b-c0e576e92fb1`)
- **PostgreSQL Ativo:**
  - Servidor: `psql-aiops-prod-brsouth` (Brazil South, Standard_B2s, rodando 24/7)
  - Servidor secundÃ¡rio: `n8npremium-prod-postgres` (Central US, Standard_B2s)
- **Container Apps Environment:** `cae-aiops-prod` (East US 2, RG `rg-aiops-prod`)
- **Container Registry Privado:** `acraiopsprodit2a.azurecr.io` (Premium SKU)
- **Azure AI Foundry / OpenAI:** `abner-7506-resource` (East US 2) com projeto `abner-7506`
- **Dashboard de Monitoramento $50k:** Rodando em `https://ca-credits-monitor.politewave-3dbe78b6.eastus2.azurecontainerapps.io/`

---

## 3. PrÃ³ximos Passos Imediatos ao Iniciar a SessÃ£o

1. **Git & GitHub:**
   - Inicializar repositÃ³rio Git local (`git init`).
   - Adicionar o remote do GitHub do usuÃ¡rio e realizar o push inicial limpo.
2. **Implementar Azure AI Foundry no Advisor:**
   - Em `api/ai/advice.ts` e `api/ai/agent.ts`, plugar o conector OpenAI/Azure com suporte a `AZURE_OPENAI_ENDPOINT`, `AZURE_OPENAI_API_KEY` e `AZURE_OPENAI_DEPLOYMENT_NAME` (ex: `gpt-4o`).
3. **Banco de Dados:**
   - Criar banco `gestorfinanceiro_staging` no PostgreSQL `psql-aiops-prod-brsouth` e rodar `api/neon-schema/init.ts`.
4. **Deploy Staging no Azure Container Apps:**
   - Criar `Dockerfile` multi-stage.
   - Build no ACR `acraiopsprodit2a`.
   - Criar Container App `ca-gestor-staging` no ambiente `cae-aiops-prod`.
