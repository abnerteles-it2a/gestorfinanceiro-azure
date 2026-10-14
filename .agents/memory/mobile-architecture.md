---
type: mobile-architecture
created: 2026-09-11
updated: 2026-09-11
---

# Arquitetura e Paridade do App Mobile (React Native + Azure)

## 1. Visão Geral do App Mobile
- **Stack**: React Native 0.81.5, Expo 54, React 19, TypeScript 5.9, NativeWind (Tailwind CSS v3), React Navigation v7.
- **Identidade Visual**: Design System IT2A Teal (`#0D9488`), Dark Navy (`#020817`, `#0B1E3B`).
- **Ambiente de Nuvem**: Totalmente desacoplado da AWS. Conectado diretamente à API Azure Container Apps Staging:
  `https://ca-gestor-staging.politewave-3dbe78b6.eastus2.azurecontainerapps.io/api`.
- **Autenticação**: JWT mantido com segurança no `expo-secure-store`.

## 2. Compilação e Build Local do APK (Offline Release)
- **Compilação 100% Local**: Dispensa Expo Application Services (EAS Cloud) ou contas pagas.
- **Ferramentas**: Microsoft OpenJDK 17 LTS (`C:\Program Files\Microsoft\jdk-17.0.20.101-hotspot`) + Android SDK 36.0.0 (`C:\Users\Abner\AppData\Local\Android\Sdk`).
- **Comando de Compilação**:
  ```powershell
  $env:JAVA_HOME = 'C:\Program Files\Microsoft\jdk-17.0.20.101-hotspot'
  $env:ANDROID_HOME = 'C:\Users\Abner\AppData\Local\Android\Sdk'
  $env:Path = "$env:JAVA_HOME\bin;$env:ANDROID_HOME\platform-tools;" + $env:Path
  & .\gradlew.bat assembleRelease
  ```
- **Arquivo de Produção**: [mobile/gestor-financeiro.apk](file:///c:/IAC/gestorfinanceiro-azure/mobile/gestor-financeiro.apk) (~79.4 MB) com bundle JS offline Hermes embutido.

## 3. Lançamento por Voz & IA (Diferencial Mobile)
- **Objetivo**: Eliminar o trabalho de digitação em smartphones.
- **Componentes**:
  - `mobile/services/transactionParserService.ts`: Extração semântica de valor, tipo (`Entrada`/`Saída`), categoria, conta bancária e data.
  - `mobile/components/VoiceTransactionModal.tsx`: Suporte a ditado nativo do teclado (Gboard/Samsung/iOS), exemplos rápidos clicáveis, chip interativo de troca de conta bancária, badge tocável de tipo, botão "Confirmar e Salvar Agora" (envia para `/query`) e "Ajustar no Formulário".
  - Pontos de acesso: Botão de microfone no Header e FAB duplo no `DashboardScreen`, e botão dedicado no topo do `TransactionFormScreen`.
- **Blindagem no Backend**: Em `api/query.ts`, fallback automático caso `accountId` venha ausente ou vazio, buscando a primeira conta do usuário ou criando uma conta padrão, evitando violação de UUID no PostgreSQL.

## 4. Suíte Completa de Investimentos (5 Abas)
- **Localização**: `mobile/screens/InvestmentsScreen.tsx` e `mobile/components/investments/`.
- **Abas**:
  1. **📊 Carteira**: Posições em tempo real, cotações da B3, alocação gráfica da carteira, Top Movers e selos de Valuation Bazin (Preço Teto com DY 6%) com recomendações automáticas (`COMPRA FORTE`, `COMPRAR`, `MANTER`, `AGUARDAR`).
  2. **💰 Proventos** (`DividendsTab.tsx`): Próximos dividendos e JCP confirmados pela B3 via `/portfolio/dividends`, contagem regressiva de dias e histórico recente dos últimos 90 dias.
  3. **⚖️ Rebalancear** (`RebalancerTab.tsx`): Algoritmo de rebalanceamento por aporte sem vender ativos, distribuindo o valor entre Ações, FIIs, Renda Fixa e Cripto de acordo com metas ajustáveis.
  4. **🧾 Fiscal / IR** (`TaxReportTab.tsx`): Radar de uso do teto de isenção de R$ 20.000/mês para Ações, controle de FIIs (20% fixo) e data de vencimento do DARF.
  5. **🎯 Simulador** (`SimulatorTab.tsx`): Simulador de Juros Compostos com aportes iniciais, mensais, prazo e taxa anual, calculando patrimônio e renda passiva mensal estimada.

## 5. Navegação Inferior (Bottom Tabs)
- Atualizada em `mobile/App.tsx` com 5 abas equilibradas:
  1. `Início` (Dashboard)
  2. `Fluxo` (CashFlow)
  3. `Investir` (InvestmentsScreen)
  4. `Relatórios` (ReportsScreen com DRE)
  5. `Menu` (MenuScreen)
