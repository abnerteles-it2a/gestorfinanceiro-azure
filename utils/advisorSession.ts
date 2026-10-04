export function advisorCacheKeys(userId: string, viewMode: string, orgId?: string) {
  const scope = `${userId}_${viewMode}_${orgId || 'personal'}`;
  return {
    data: `gf_ai_insights_data_v4_${scope}`,
    fetched: `gf_ai_insights_fetched_v4_${scope}`,
  };
}
