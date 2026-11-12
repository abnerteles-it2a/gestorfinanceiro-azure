import axios, { type AxiosRequestConfig } from 'axios';
import { createFinancialScope, type ViewMode } from '../utils/financialScope';
import { sendInvestmentDisposal } from '../../utils/investmentOperationClient';
import type { InvestmentDisposalRequest } from '../../types';

// ─── API Base URL ──────────────────────────────────────────────────────────────
// Configured via EXPO_PUBLIC_API_URL in eas.json or .env:
//   development → http://localhost:3000/api ou IP da rede local
//   staging/prod → https://ca-gestor-staging.politewave-3dbe78b6.eastus2.azurecontainerapps.io/api
const API_URL =
  process.env.EXPO_PUBLIC_API_URL ??
  'https://ca-gestor-staging.politewave-3dbe78b6.eastus2.azurecontainerapps.io/api';

console.log(`[api] Base URL: ${API_URL}`);

export const api = axios.create({
  baseURL: API_URL,
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Capture at form/list mount, not between the awaits of a multi-request operation.
export function createScopedApi() {
  const scope = financialScope.snapshot();
  const configFor = (config?: AxiosRequestConfig): AxiosRequestConfig => {
    if (!financialScope.isCurrent(scope)) throw new Error('Usuário ou visão alterados; reabra a operação.');
    return { ...config, headers: { ...config?.headers, Authorization: scope.token ? `Bearer ${scope.token}` : '', 'x-view-mode': scope.viewMode } };
  };
  return {
    get: (url: string, config?: AxiosRequestConfig) => api.get(url, configFor(config)),
    post: (url: string, data?: unknown, config?: AxiosRequestConfig) => api.post(url, data, configFor(config)),
  };
}

// Scope is captured synchronously, before any await. Never fetch a possibly newer
// user's token from storage in an old request's interceptor.
export const financialScope = createFinancialScope();
export const setFinancialViewMode = (mode: ViewMode) => {
  const scope = financialScope.set(financialScope.snapshot().token, mode);
  api.defaults.headers.common['x-view-mode'] = scope.viewMode;
};

api.interceptors.request.use((config) => {
  const scope = financialScope.snapshot();
  const authorization = config.headers.get('Authorization');
  const view = config.headers.get('x-view-mode');
  if ((authorization && authorization !== `Bearer ${scope.token}`) || (view && view !== scope.viewMode)) {
    throw new Error('Usuário ou visão alterados; reabra a operação.');
  }
  if (scope.token) config.headers.set('Authorization', `Bearer ${scope.token}`);
  else config.headers.delete('Authorization');
  config.headers.set('x-view-mode', scope.viewMode);
  (config as typeof config & { scopeGeneration: number }).scopeGeneration = scope.generation;
  return config;
}, (error) => { throw error; }, { synchronous: true });

api.interceptors.response.use((response) => {
  const generation = (response.config as typeof response.config & { scopeGeneration: number }).scopeGeneration;
  if (!financialScope.isCurrent({ generation })) throw new Error('Resposta de uma visão anterior descartada.');
  return response;
}, (error) => {
  const generation = error.config?.scopeGeneration;
  // An old 401 must not delete or sign out the new user's session.
  if (generation != null && !financialScope.isCurrent({ generation })) return Promise.reject(new Error('Resposta de uma sessão anterior descartada.'));
  return Promise.reject(error);
});

export const setAuthToken = (token: string | null) => {
  // Authentication changes start in personal scope, never inherit another user's organization.
  financialScope.set(token, 'personal');
  api.defaults.headers.common['x-view-mode'] = 'personal';
  if (token) api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
  else delete api.defaults.headers.common['Authorization'];
};

/** Adapter keeps the shared client's definite/uncertain error classification intact. */
export function sendMobileInvestmentDisposal(request: InvestmentDisposalRequest, scope: ReturnType<typeof financialScope.snapshot>) {
  const headers = { authorization: scope.token ? `Bearer ${scope.token}` : '', 'x-view-mode': scope.viewMode };
  const transport = (async (_url: unknown, init: RequestInit) => {
    if (!financialScope.isCurrent(scope)) throw new Error('Usuário ou visão alterados.');
    const response = await api.post('/query', init.body, { headers, validateStatus: () => true, responseType: 'text', transformResponse: [(value: unknown) => value] });
    return { ok: response.status >= 200 && response.status < 300, status: response.status,
      text: async () => typeof response.data === 'string' ? response.data : JSON.stringify(response.data) };
  }) as typeof fetch;
  return sendInvestmentDisposal(request, headers, transport);
}
