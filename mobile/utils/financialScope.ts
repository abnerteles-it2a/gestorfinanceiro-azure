export type ViewMode = 'personal' | 'organization';
export function createFinancialScope() {
  let current = { token: null as string | null, viewMode: 'personal' as ViewMode, generation: 0 };
  return {
    snapshot: () => current,
    set(token: string | null, viewMode: ViewMode) {
      if (token !== current.token || viewMode !== current.viewMode) current = Object.freeze({ token, viewMode, generation: current.generation + 1 });
      return current;
    },
    isCurrent: (snapshot: { generation: number }) => snapshot.generation === current.generation,
  };
}
export function createLatestRequestGuard() {
  let sequence = 0;
  return { invalidate: () => { sequence++; }, begin: () => { const id = ++sequence; return () => id === sequence; } };
}
