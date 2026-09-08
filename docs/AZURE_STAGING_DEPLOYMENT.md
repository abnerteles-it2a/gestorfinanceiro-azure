# Gestor Financeiro - Arquitetura e Deploy Azure (Staging)

Este documento centraliza todas as instruções de arquitetura, banco de dados, autenticação e automações para o ambiente Microsoft Azure.

---

## 1. Visão Geral da Arquitetura

O Gestor Financeiro foi modernizado para executar de forma nativa na nuvem Microsoft Azure, eliminando dependências de providers externos dispersos (AWS Amplify/SES/Bedrock/S3 e GCP Vertex AI).

```mermaid
graph TD
    Client[Navegador / PWA] -->|HTTPS| ACA[Azure Container Apps: ca-gestor-staging]
    ACA -->|Query / Auth| PG[(Azure PostgreSQL Flexible: psql-aiops-prod-brsouth)]
    ACA -->|Chat / Advisor / Parser| Foundry[Azure AI Foundry: gpt-4.1]
    ACA -->|Transacionais| ACS[Azure Communication Services: Email]
    ACA -->|Comprovantes/NF| Blob[Azure Blob Storage]
```

---

## 2. Acesso ao Ambiente de Staging

- **URL:** [https://ca-gestor-staging.politewave-3dbe78b6.eastus2.azurecontainerapps.io/](https://ca-gestor-staging.politewave-3dbe78b6.eastus2.azurecontainerapps.io/)
- **Ambiente Container Apps:** `cae-aiops-prod`
- **Resource Group:** `rg-aiops-prod`

### Credenciais de Teste (Admin Seed)
- **E-mail:** `admin@it2a.com`
- **Senha:** `Admin@Gestor2026!`

---

## 3. Mecanismo de Autenticação e Sessão Única

O Gestor Financeiro possui mecanismo de segurança contra compartilhamento de contas e vazamento de credenciais:

1. **Validação de Credenciais:** Tabela `public.auth_users` comparando hash via `bcryptjs`.
2. **Prevenção de Múltiplos Logins:**
   - Ao autenticar, o sistema consulta `public.auth_sessions` procurando registros existentes para aquele `user_id`.
   - Caso exista uma sessão ativa e o parâmetro `force` não seja enviado como `true`, a API recusa com `HTTP 409 Conflict`:
     ```json
     {
       "error": "already_logged",
       "lastSeen": "2026-09-08T15:49:21.789Z",
       "minutesAgo": 0
     }
     ```
   - Caso o usuário confirme a desconexão da outra sessão (`force: true`), a sessão antiga é deletada e um novo identificador `jti` é gerado.
3. **Assinatura JWT:** Assinatura HS256 com segredo `JWT_SECRET` contendo `sub` (user_id), `email`, `admin` e `jti`.

---

## 4. Variáveis de Ambiente do Container App

| Variável | Descrição | Exemplo / Valor |
|---|---|---|
| `DATABASE_URL` | String de conexão PostgreSQL SSL | `postgresql://aiopsadmin:...@psql-aiops-prod-brsouth.postgres.database.azure.com:5432/gestorfinanceiro_staging?sslmode=require` |
| `JWT_SECRET` | Chave de assinatura dos tokens JWT | `gestor_financeiro_azure_jwt_super_secret_key_2026_prod!` |
| `AZURE_OPENAI_ENDPOINT` | Endpoint da Cognitive Services | `https://abner-7506-resource.cognitiveservices.azure.com/` |
| `AZURE_OPENAI_API_KEY` | Chave de autenticação do Foundry | `6CfWHCP2...` |
| `AZURE_OPENAI_DEPLOYMENT_NAME` | Modelo de IA para chat e advisor | `gpt-4.1` |
| `COMMUNICATION_SERVICES_CONNECTION_STRING` | String de conexão do Azure Communication Services | `endpoint=https://acs-gestor-prod.unitedstates.communication.azure.com/;accesskey=...` |
| `AZURE_EMAIL_SENDER` | Remetente verificado do domínio gerenciado Azure | `DoNotReply@f0bc3891-e4c8-4670-880e-54d671987bb5.azurecomm.net` |
| `PORT` | Porta interna da aplicação | `3000` |
| `NODE_ENV` | Modo de execução | `production` |

---

## 5. Como Atualizar e Fazer Re-deploy

```powershell
# 1. Build da nova imagem no ACR (sem streaming de logs para evitar conflito UTF-8 no Windows)
az acr build --registry acraiopsprodit2a --image gestorfinanceiro:staging --no-logs .

# 2. Atualização automática do Container App
az containerapp update `
  --name ca-gestor-staging `
  --resource-group rg-aiops-prod `
  --image acraiopsprodit2a.azurecr.io/gestorfinanceiro:staging
```
