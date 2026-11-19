---
type: project
created: 2026-11-18
updated: 2026-11-18
---

# Auditoria UI/UX, Otimização de Bootstrap e Deploy Staging (18/11/2026)

## Estado Entregue (Commits `fcea649` e `57ffbef` na branch `staging`)
- **Design System & Acessibilidade (Web Interface Guidelines)**:
  - `components/ui/Forms/FormField.tsx`: Corrigido bug de `opacity-0` sem plugin `tailwindcss-animate` que deixava mensagens de erro invisíveis; adicionado `role="alert"`.
  - `components/shared/Modal.tsx`, `components/ui/DataTable.tsx` e `index.css`: Adicionado suporte completo a Dark Mode nas classes `.omie-*` e componentes base, tecla `Escape` e `overscroll-contain` no `Modal`, e `aria-sort`/teclado no `DataTable`.
  - `components/CommandPalette.tsx` e `App.tsx`: Corrigida rota morta `'cashflow'` que exibia tela em branco; agora redireciona para `financeAccounting` na aba `cashflow`.
  - `hooks/useSecurity.ts`: Removido loop `debugger` a cada 1s e bloqueio de menu de contexto/atalhos.
  - `components/MarketRankWidget.tsx` e `components/WeatherWidget.tsx`: Removida simulação falsa de preços (`Math.random()`) e cidade inicial hardcoded (`São José do Rio Preto` / `Bady Bassitt`).
  - `components/Dashboard.tsx`: Integrado `DailyExecutiveBriefing.tsx` no topo do Dashboard.
  - `components/Header.tsx`: Removida barra de navegação mobile duplicada; toggle "Modo MEI" agora usa `refreshData()` e `role="switch"`.
  - `components/MeiMonthlyClosingPanel.tsx` e `components/MeiReportsModal.tsx`: Substituídos `window.prompt`/`window.confirm` por confirmação inline acessível.

## Performance, Build e Infraestrutura Azure
- **Tailwind v4 `@source`**: Configurado `@import "tailwindcss" source(none);` com `@source` explícitos em `index.css`, eliminando o warning `.\[file\:line\]{file:line}` do esbuild.
- **Code Splitting**: `manualChunks` em `vite.config.ts` corrigido (`react-vendor` com 194 kB e `index.js` reduzido de 605 kB para 398 kB) + prefetch em background dos módulos principais em `App.tsx`.
- **Cold-Start `/api/bootstrap`**:
  - `ensureSchemaOnce` em `api/bootstrap.ts` foi consolidado de 68 queries sequenciais (~9s cross-region entre `eastus2` e `brazilsouth`) para 1 único comando SQL em lote (`BOOTSTRAP_SCHEMA_SQL`) protegido por `schemaEnsurePromise`.
  - Queries de `profiles`, `resolveFinancialScope` e `financialSnapshot` paralelizadas em `api/bootstrap.ts`; pool em `api/_db.ts` ampliado para `max: 20`.
- **Segurança & Mobile**:
  - `npm audit fix` zerou todas as 10 vulnerabilidades do projeto raiz.
  - Novo APK Android de release gerado em `mobile/gestor-financeiro.apk` (`75,82 MB`).

## Próximos Passos Sugeridos (Backlog Evolutivo)
1. **Roteamento com URL sincronizada**: Introduzir sincronização de URL (query params ou `react-router`) para preservar a aba ativa no refresh (F5) e permitir deep-links.
2. **Subledger de Cartão de Crédito na UI**: Criar visão dedicada de conciliação de faturas fechadas vs compras parceladas usando os helpers de `utils/creditCard.ts` e `utils/accountingRecognition.ts`.
3. **Consolidação de Componentes de Assinaturas**: Unificar `SubscriptionAuditor.tsx` e `SubscriptionLeakRadar.tsx` em um único módulo reutilizável e remover os 7 arquivos de modais/widgets órfãos restantes (`AddAccountModal.tsx`, `EditAccountModal.tsx`, `CategoryManagerModal.tsx`, `BackupModal.tsx`, `GamificationWidget.tsx`, `MeiStatusWidget.tsx`, `MonthlyBalance.tsx`).
4. **Git LFS / Release Artifacts para o APK**: Mover `mobile/gestor-financeiro.apk` (75,8 MB) para GitHub Releases ou Git LFS para evitar o aviso de limite de 50 MB do GitHub.
