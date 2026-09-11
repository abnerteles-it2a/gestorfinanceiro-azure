import { formatCurrency } from './formatters';

export interface AgingBuckets {
  overdue: number;
  b30: number;
  b60: number;
  b90: number;
  bPlus: number;
  total: number;
}

export interface AccountingHealthInput {
  totalBalance: number;
  currentAssets: number;
  currentLiabilities: number;
  grossRevenue: number;
  grossProfit: number;
  netProfit: number;
  cogs: number;
  opex: number;
  receivablesAging: AgingBuckets;
  payablesAging: AgingBuckets;
  burnRateMonthly?: number;
  runwayMonths?: number | string;
}

export interface HealthInsight {
  id: string;
  type: 'success' | 'warning' | 'info' | 'danger';
  title: string;
  detail: string;
}

export interface AccountingHealthResult {
  score: number; // 0 to 100
  tier: 'excellent' | 'healthy' | 'warning' | 'critical';
  tierLabel: string;
  colorClass: string;
  badgeBg: string;
  breakdown: {
    liquidityScore: number;     // max 25
    marginScore: number;        // max 25
    delinquencyScore: number;   // max 25
    runwayScore: number;        // max 25
  };
  metrics: {
    currentLiquidity: number;
    immediateLiquidity: number;
    netMarginPct: number;
    grossMarginPct: number;
    receivablesDelinquencyPct: number;
    payablesOverduePct: number;
  };
  insights: HealthInsight[];
}

export function calculateAccountingHealth(input: AccountingHealthInput): AccountingHealthResult {
  const {
    totalBalance,
    currentAssets,
    currentLiabilities,
    grossRevenue,
    grossProfit,
    netProfit,
    opex,
    receivablesAging,
    payablesAging,
    burnRateMonthly = 0,
    runwayMonths = 0
  } = input;

  // 1. LIQUIDITY (Max 25 pts)
  const currentLiquidity = currentLiabilities > 0
    ? (currentAssets / currentLiabilities)
    : (currentAssets > 0 ? 3.0 : 1.0);

  const immediateLiquidity = currentLiabilities > 0
    ? (totalBalance / currentLiabilities)
    : (totalBalance > 0 ? 2.0 : 1.0);

  let liquidityScore = 0;
  if (currentLiquidity >= 2.0) liquidityScore = 25;
  else if (currentLiquidity >= 1.5) liquidityScore = 22;
  else if (currentLiquidity >= 1.2) liquidityScore = 18;
  else if (currentLiquidity >= 1.0) liquidityScore = 14;
  else if (currentLiquidity >= 0.7) liquidityScore = 8;
  else liquidityScore = 2;

  // 2. PROFIT MARGIN (Max 25 pts)
  const netMarginPct = grossRevenue > 0 ? (netProfit / grossRevenue) * 100 : (netProfit >= 0 ? 15 : -10);
  const grossMarginPct = grossRevenue > 0 ? (grossProfit / grossRevenue) * 100 : 50;

  let marginScore = 0;
  if (netMarginPct >= 25) marginScore = 25;
  else if (netMarginPct >= 15) marginScore = 21;
  else if (netMarginPct >= 8) marginScore = 17;
  else if (netMarginPct >= 0) marginScore = 12;
  else if (netMarginPct >= -10) marginScore = 5;
  else marginScore = 0;

  // 3. DELINQUENCY / AGING (Max 25 pts)
  const recTotal = receivablesAging.total || 0;
  const recOverdue = receivablesAging.overdue || 0;
  const receivablesDelinquencyPct = recTotal > 0 ? (recOverdue / recTotal) * 100 : 0;

  const payTotal = payablesAging.total || 0;
  const payOverdue = payablesAging.overdue || 0;
  const payablesOverduePct = payTotal > 0 ? (payOverdue / payTotal) * 100 : 0;

  let delinquencyScore = 25;
  if (recTotal > 0) {
    if (receivablesDelinquencyPct <= 3) delinquencyScore = 25;
    else if (receivablesDelinquencyPct <= 10) delinquencyScore = 20;
    else if (receivablesDelinquencyPct <= 20) delinquencyScore = 14;
    else if (receivablesDelinquencyPct <= 35) delinquencyScore = 8;
    else delinquencyScore = 2;
  }
  // Penalize if user has overdue payables
  if (payOverdue > 0) {
    delinquencyScore = Math.max(0, delinquencyScore - 5);
  }

  // 4. RUNWAY & CASH COVERAGE (Max 25 pts)
  let runwayVal = typeof runwayMonths === 'number' ? runwayMonths : parseFloat(String(runwayMonths)) || 0;
  if (burnRateMonthly > 0 && runwayVal === 0) {
    runwayVal = totalBalance / burnRateMonthly;
  }

  let runwayScore = 15; // default neutral
  if (burnRateMonthly <= 0) {
    runwayScore = totalBalance >= 0 ? 25 : 5;
  } else {
    if (runwayVal >= 12) runwayScore = 25;
    else if (runwayVal >= 6) runwayScore = 21;
    else if (runwayVal >= 3) runwayScore = 16;
    else if (runwayVal >= 1) runwayScore = 9;
    else runwayScore = 2;
  }

  const totalScore = Math.min(100, Math.max(0, Math.round(liquidityScore + marginScore + delinquencyScore + runwayScore)));

  // Tier determination
  let tier: AccountingHealthResult['tier'] = 'healthy';
  let tierLabel = 'Saudável';
  let colorClass = 'text-teal-400';
  let badgeBg = 'bg-teal-500/10 border-teal-500/30 text-teal-300';

  if (totalScore >= 85) {
    tier = 'excellent';
    tierLabel = 'Excelente';
    colorClass = 'text-emerald-400';
    badgeBg = 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300';
  } else if (totalScore >= 70) {
    tier = 'healthy';
    tierLabel = 'Equilibrado';
    colorClass = 'text-teal-400';
    badgeBg = 'bg-teal-500/10 border-teal-500/30 text-teal-300';
  } else if (totalScore >= 50) {
    tier = 'warning';
    tierLabel = 'Requer Atenção';
    colorClass = 'text-amber-400';
    badgeBg = 'bg-amber-500/10 border-amber-500/30 text-amber-300';
  } else {
    tier = 'critical';
    tierLabel = 'Vulnerável';
    colorClass = 'text-rose-400';
    badgeBg = 'bg-rose-500/10 border-rose-500/30 text-rose-300';
  }

  // Autonomous insights generation (deterministic, instant)
  const insights: HealthInsight[] = [];

  // Insight 1: Liquidity status
  if (currentLiquidity >= 1.5) {
    insights.push({
      id: 'liq-safe',
      type: 'success',
      title: 'Liquidez Confortável',
      detail: `Você possui R$ ${currentLiquidity.toFixed(2)} em ativos circulantes para cada R$ 1,00 de passivo de curto prazo.`
    });
  } else if (currentLiquidity < 1.0) {
    insights.push({
      id: 'liq-alert',
      type: 'danger',
      title: 'Déficit de Capital de Giro',
      detail: `O passivo circulante (${formatCurrency(currentLiabilities)}) supera os ativos imediatos (${formatCurrency(currentAssets)}). Priorize recebíveis.`
    });
  } else {
    insights.push({
      id: 'liq-info',
      type: 'info',
      title: 'Liquidez Equilibrada',
      detail: `Índice de liquidez corrente em ${currentLiquidity.toFixed(2)}. Mantenha acompanhamento do cronograma de pagamentos.`
    });
  }

  // Insight 2: Delinquency / Overdue
  if (recOverdue > 0) {
    insights.push({
      id: 'rec-overdue',
      type: receivablesDelinquencyPct > 15 ? 'danger' : 'warning',
      title: `Inadimplência de Recebíveis: ${receivablesDelinquencyPct.toFixed(1)}%`,
      detail: `R$ ${formatCurrency(recOverdue)} em recebíveis já venceram. Ações ativas de cobrança podem recuperar liquidez imediata.`
    });
  } else if (recTotal > 0) {
    insights.push({
      id: 'rec-perfect',
      type: 'success',
      title: 'Carteira de Recebíveis 100% Adimplente',
      detail: `Todas as contas a receber agendadas (${formatCurrency(recTotal)}) estão rigorosamente em dia.`
    });
  }

  // Insight 3: Margin / Profitability
  if (grossRevenue > 0) {
    if (netMarginPct >= 20) {
      insights.push({
        id: 'margin-high',
        type: 'success',
        title: `Alta Rentabilidade Líquida (${netMarginPct.toFixed(1)}%)`,
        detail: `Margem operacional robusta. Boa eficiência na retenção de lucro frente às despesas operacionais.`
      });
    } else if (netMarginPct < 0) {
      insights.push({
        id: 'margin-neg',
        type: 'danger',
        title: 'Resultado Operacional Negativo',
        detail: `As despesas operacionais e custos superaram a receita do período em ${formatCurrency(Math.abs(netProfit))}.`
      });
    } else {
      insights.push({
        id: 'margin-mod',
        type: 'info',
        title: `Margem Líquida Moderada (${netMarginPct.toFixed(1)}%)`,
        detail: `As despesas operacionais representam ${((opex / grossRevenue) * 100).toFixed(1)}% da receita bruta.`
      });
    }
  } else {
    // If no revenue recorded yet
    if (payOverdue > 0) {
      insights.push({
        id: 'pay-overdue',
        type: 'danger',
        title: `Contas a Pagar Vencidas (${formatCurrency(payOverdue)})`,
        detail: `Há obrigações em atraso. Regularize para evitar incidência de multas e juros rotativos.`
      });
    } else {
      insights.push({
        id: 'cash-status',
        type: 'info',
        title: 'Disponibilidade de Caixa Ativa',
        detail: `Saldo consolidado de ${formatCurrency(totalBalance)} distribuído nas contas financeiras.`
      });
    }
  }

  return {
    score: totalScore,
    tier,
    tierLabel,
    colorClass,
    badgeBg,
    breakdown: {
      liquidityScore,
      marginScore,
      delinquencyScore,
      runwayScore
    },
    metrics: {
      currentLiquidity,
      immediateLiquidity,
      netMarginPct,
      grossMarginPct,
      receivablesDelinquencyPct,
      payablesOverduePct
    },
    insights: insights.slice(0, 3)
  };
}
