# Gestor Financeiro Mobile (Azure Cloud-Native)

Aplicativo móvel desenvolvido com React Native 0.81.5, Expo 54, React 19 e TypeScript, integrado à nuvem Azure Container Apps e ao banco de dados PostgreSQL.

## 📱 Destaques e Recursos Principais
- **Lançamento por Voz & IA:** Ditado natural via microfone do teclado móvel, com parser inteligente de valor, categoria, conta bancária e tipo (`Entrada`/`Saída`), salvando direto via `/query` ou abrindo no formulário manual.
- **Suíte de Investimentos (5 Abas):**
  - **Carteira:** Cotações em tempo real da B3, alocação gráfica e Valuation Décio Bazin (Preço Teto com DY 6%) com recomendações automáticas (`COMPRA FORTE`, `COMPRAR`, `MANTER`, `AGUARDAR`).
  - **Proventos:** Calendário de dividendos e JCP confirmados pela B3 com data de corte e contagem de dias.
  - **Rebalancear:** Algoritmo de aporte sem venda de ativos, equilibrando pesos ideais da carteira.
  - **Fiscal / IR:** Termômetro de isenção de R$ 20.000/mês para Ações, controle de FIIs (20%) e data do DARF.
  - **Simulador:** Projeção de juros compostos e cálculo de renda passiva mensal estimada.
- **DRE Gerencial Contábil:** DRE mensal com cálculo de receitas, despesas, margem e evolução percentual.
- **Barra de Navegação Inferior (5 Abas):** Início, Fluxo, Investir, Relatórios e Menu.

## Integridade e validação local — 12/11/2026

- Venda usa o comando atômico `investment_dispose`, compartilhado com web, preservando pedido e UUID para retry/reconciliação. Compra e movimento de caixa ainda são comandos separados.
- Totais financeiros usam o snapshot completo; projeções consideram saldo residual de obrigações. Requisições preservam o escopo pessoal/organizacional e descartam respostas obsoletas.
- A partir da raiz do repositório, execute `npx tsx --test mobile/utils/*.test.ts` e `npx tsc -p mobile/tsconfig.json --noEmit`. A suíte root não inclui automaticamente esses testes mobile.
- 14 testes mobile e typecheck aprovados nesta rodada. Não houve build APK/Metro nem teste em dispositivo; recuperação após encerramento via SecureStore permanece pendente de validação no dispositivo.
- O diretório mobile estava não rastreado na revisão; versionamento/release devem incluir seus fontes e excluir ambientes, credenciais, dependências e artefatos locais conforme a política do projeto.

## 📦 Como Compilar o APK Localmente (Release Offline)
Não é necessário utilizar o Expo Cloud / EAS. A compilação é realizada 100% no computador local:

```powershell
$env:JAVA_HOME = 'C:\Program Files\Microsoft\jdk-17.0.20.101-hotspot'
$env:ANDROID_HOME = 'C:\Users\Abner\AppData\Local\Android\Sdk'
$env:Path = "$env:JAVA_HOME\bin;$env:ANDROID_HOME\platform-tools;" + $env:Path
cd android
.\gradlew.bat assembleRelease
```

O arquivo final é gerado em:
`mobile/android/app/build/outputs/apk/release/app-release.apk`
E copiado para:
`mobile/gestor-financeiro.apk` (~79.4 MB).
