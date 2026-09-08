import React, { useMemo, useState, useEffect } from 'react';
import { useFinancialData } from '../context/FinancialDataContext';
import { TransactionType } from '../types';
import { toIsoLocalDate, dateKey, formatCurrency } from '../utils/formatters';
import { SparklesIcon, PlusIcon } from './icons';
import { StatusTag } from './ui/StatusTag';
import { EmptyState } from './ui/EmptyState';

export const GamificationWidget: React.FC = () => {
  const { transactions, categories, goals } = useFinancialData();
  const [challenge, setChallenge] = useState<{ category: string; baseline: number; target: number; accepted: boolean; completed?: boolean } | null>(() => {
    try {
      const raw = window.localStorage.getItem('gestor_financeiro_challenge');
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  });
  const [points, setPoints] = useState<number>(() => {
    try { return parseInt(window.localStorage.getItem('gestor_financeiro_points') || '0', 10) || 0; } catch { return 0; }
  });
  const [level, setLevel] = useState<number>(() => {
    try { return parseInt(window.localStorage.getItem('gestor_financeiro_level') || '1', 10) || 1; } catch { return 1; }
  });
  const [history, setHistory] = useState<{ category: string; baseline: number; target: number; achievedAt: string; points: number }[]>(() => {
    try { return JSON.parse(window.localStorage.getItem('gestor_financeiro_challengeHistory') || '[]'); } catch { return []; }
  });
  type Mission = { id: string; label: string; target: number; points: number; completed?: boolean };
  const [missions, setMissions] = useState<Mission[]>(() => {
    try { return JSON.parse(window.localStorage.getItem('gestor_financeiro_weekMissions') || '[]'); } catch { return []; }
  });
  const [weekStart, setWeekStart] = useState<string>(() => {
    try { return window.localStorage.getItem('gestor_financeiro_weekStart') || ''; } catch { return ''; }
  });
  const [missionHistory, setMissionHistory] = useState<{ id: string; label: string; achievedAt: string; points: number }[]>(() => {
    try { return JSON.parse(window.localStorage.getItem('gestor_financeiro_missionHistory') || '[]'); } catch { return []; }
  });

  const now = new Date();
  const currentMonth = now.getMonth();
  const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1).getMonth();
  const weekRange = useMemo(() => {
    const day = now.getDay();
    const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((day + 6) % 7));
    monday.setHours(0,0,0,0);
    const sunday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6);
    sunday.setHours(23,59,59,999);
    return { start: monday, end: sunday };
  }, [now]);

  const stats = useMemo(() => {
    const income = transactions.filter(t => {
      if (t.transactionType !== TransactionType.INCOME) return false;
      const parts = dateKey(t.date).split('-').map(p => parseInt(p, 10));
      return parts[1]-1 === currentMonth;
    }).reduce((s,t)=>s+t.amount,0);
    const expense = transactions.filter(t => {
      if (t.transactionType !== TransactionType.EXPENSE) return false;
      const parts = dateKey(t.date).split('-').map(p => parseInt(p, 10));
      return parts[1]-1 === currentMonth;
    }).reduce((s,t)=>s+t.amount,0);
    const savingsRate = income > 0 ? (income - expense) / income : 0;

    const prevExpense = transactions.filter(t => {
      if (t.transactionType !== TransactionType.EXPENSE) return false;
      const parts = dateKey(t.date).split('-').map(p => parseInt(p, 10));
      return parts[1]-1 === prevMonth;
    }).reduce((s,t)=>s+t.amount,0);

    // Streak: dias consecutivos com pelo menos 1 transação
    const byDay = new Map<string, number>();
    transactions.forEach(t => {
      const iso = dateKey(t.date);
      const parts = iso.split('-').map(p => parseInt(p, 10));
      const key = `${parts[0]}-${parts[1]}-${parts[2]}`;
      byDay.set(key, (byDay.get(key) || 0) + 1);
    });
    let streak = 0;
    for (let i=0;i<30;i++) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate()-i);
      const key = `${d.getFullYear()}-${d.getMonth()+1}-${d.getDate()}`;
      if (byDay.has(key)) streak++; else break;
    }

    // Top categoria do mês atual
    const currentCatTotals: Record<string, number> = {};
    transactions.filter(t=> {
      if (t.transactionType!==TransactionType.EXPENSE) return false;
      const parts = dateKey(t.date).split('-').map(p => parseInt(p, 10));
      return parts[1]-1 === currentMonth;
    })
      .forEach(t => { currentCatTotals[t.category] = (currentCatTotals[t.category]||0)+t.amount; });
    const topCategory = Object.entries(currentCatTotals).sort((a,b)=>b[1]-a[1])[0]?.[0] || categories[0]?.name || 'Geral';
    const currentCatSpend = currentCatTotals[topCategory] || 0;

    const prevCatTotals: Record<string, number> = {};
    transactions.filter(t=> {
      if (t.transactionType!==TransactionType.EXPENSE) return false;
      const parts = dateKey(t.date).split('-').map(p => parseInt(p, 10));
      return parts[1]-1 === prevMonth;
    })
      .forEach(t => { prevCatTotals[t.category] = (prevCatTotals[t.category]||0)+t.amount; });
    const prevCatSpend = prevCatTotals[topCategory] || 0;

    return { savingsRate, prevExpense, expense, streak, topCategory, currentCatSpend, prevCatSpend };
  }, [transactions, categories]);

  useEffect(() => {
    if (!challenge) {
      const baseline = stats.prevCatSpend > 0 ? stats.prevCatSpend : stats.currentCatSpend;
      const target = baseline * 0.9; // reduzir 10%
      const c = { category: stats.topCategory, baseline, target, accepted: false, completed: false };
      try { window.localStorage.setItem('gestor_financeiro_challenge', JSON.stringify(c)); } catch {}
      setChallenge(c);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const startKey = weekRange.start.toISOString().split('T')[0];
    if (weekStart !== startKey || missions.length === 0) {
      const initial: Mission[] = [
        { id: 'week_days', label: 'Registrar transações em 3 dias diferentes', target: 3, points: 15 },
        { id: 'week_income', label: 'Adicionar ao menos 1 receita', target: 1, points: 10 },
        { id: 'week_total', label: 'Registrar 10 transações', target: 10, points: 20 },
        { id: 'week_goal_create', label: 'Criar uma nova meta', target: 1, points: 15 },
        { id: 'week_validate_tx', label: 'Validar uma transação no modal', target: 1, points: 10 }
      ];
      setMissions(initial);
      setWeekStart(startKey);
      try {
        window.localStorage.setItem('gestor_financeiro_weekStart', startKey);
        window.localStorage.setItem('gestor_financeiro_weekMissions', JSON.stringify(initial));
        window.localStorage.setItem('gestor_financeiro_weekValidations', '0');
        window.localStorage.setItem('gestor_financeiro_weekGoalCountStart', String(goals.length || 0));
      } catch {}
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekRange.start]);

  useEffect(() => {
    try { window.localStorage.setItem('gestor_financeiro_weekMissions', JSON.stringify(missions)); } catch {}
  }, [missions]);

  const acceptChallenge = () => {
    if (!challenge) return;
    const c = { ...challenge, accepted: true };
    setChallenge(c);
    try { window.localStorage.setItem('gestor_financeiro_challenge', JSON.stringify(c)); } catch {}
  };

  const resetChallenge = () => {
    const baseline = stats.prevCatSpend > 0 ? stats.prevCatSpend : stats.currentCatSpend;
    const target = baseline * 0.9;
    const c = { category: stats.topCategory, baseline, target, accepted: false, completed: false };
    setChallenge(c);
    try { window.localStorage.setItem('gestor_financeiro_challenge', JSON.stringify(c)); } catch {}
  };

  const awardPoints = (p: number) => {
    const newPoints = points + p;
    const newLevel = Math.max(1, Math.floor(newPoints / 100) + 1);
    setPoints(newPoints);
    setLevel(newLevel);
    try {
      window.localStorage.setItem('gestor_financeiro_points', String(newPoints));
      window.localStorage.setItem('gestor_financeiro_level', String(newLevel));
    } catch {}
  };

  const markChallengeCompleted = () => {
    if (!challenge || !challenge.accepted || challenge.completed) return;
    const entry = { category: challenge.category, baseline: challenge.baseline, target: challenge.target, achievedAt: new Date().toISOString(), points: 50 };
    const list = [entry, ...history].slice(0, 10);
    setHistory(list);
    try { window.localStorage.setItem('gestor_financeiro_challengeHistory', JSON.stringify(list)); } catch {}
    const c = { ...challenge, completed: true };
    setChallenge(c);
    try { window.localStorage.setItem('gestor_financeiro_challenge', JSON.stringify(c)); } catch {}
    awardPoints(50);
  };

  const weekTxs = useMemo(() => transactions.filter(t => { const d = new Date(`${dateKey(t.date)}T12:00:00`); return d >= weekRange.start && d <= weekRange.end; }), [transactions, weekRange]);
  const uniqueDays = useMemo(() => {
    const s = new Set<string>();
    weekTxs.forEach(t => { const k = dateKey(t.date); const p = k.split('-').map(q=>parseInt(q,10)); s.add(`${p[0]}-${p[1]}-${p[2]}`); });
    return s.size;
  }, [weekTxs]);
  const weekIncomeCount = useMemo(() => weekTxs.filter(t => t.transactionType === TransactionType.INCOME).length, [weekTxs]);
  const weekTotalCount = weekTxs.length;
  const weekValidations = useMemo(() => {
    try { return parseInt(window.localStorage.getItem('gestor_financeiro_weekValidations') || '0', 10) || 0; } catch { return 0; }
  }, [weekRange.start, transactions]);
  const weekGoalStart = useMemo(() => {
    try { return parseInt(window.localStorage.getItem('gestor_financeiro_weekGoalCountStart') || '0', 10) || 0; } catch { return 0; }
  }, [weekRange.start]);
  const completeMission = (id: string) => {
    const m = missions.find(x => x.id === id);
    if (!m || m.completed) return;
    const updated = missions.map(x => x.id === id ? { ...x, completed: true } : x);
    setMissions(updated);
    try { window.localStorage.setItem('gestor_financeiro_weekMissions', JSON.stringify(updated)); } catch {}
    awardPoints(m.points);
    const entry = { id: m.id, label: m.label, achievedAt: new Date().toISOString(), points: m.points };
    const list = [entry, ...missionHistory].slice(0, 20);
    setMissionHistory(list);
    try { window.localStorage.setItem('gestor_financeiro_missionHistory', JSON.stringify(list)); } catch {}
  };

  const badges: { label: string; type: 'success' | 'warning' | 'info' }[] = [];
  if (stats.savingsRate >= 0.2) badges.push({ label: 'Poupador 20%', type: 'success' });
  if (stats.prevExpense > 0 && stats.expense < stats.prevExpense) badges.push({ label: 'Gastos em queda', type: 'info' });
  if (stats.streak >= 7) badges.push({ label: 'Streak 7 dias', type: 'warning' });

  const challengeProgress = challenge ? Math.min(100, Math.max(0, ((challenge.target - stats.currentCatSpend) / challenge.target) * 100)) : 0;

  return (
    <div className="bg-white dark:bg-gray-800 p-4 lg:p-4 xl:p-6 rounded-lg shadow-lg">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Progresso & Desafios</h3>
        <div className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-2">
          <span>Streak: {stats.streak} dia(s)</span>
          <span>• Pontos: {points}</span>
          <span>• Nível: {level}</span>
        </div>
      </div>

      <div className="mb-3 flex flex-wrap gap-2">
        {badges.length === 0 ? (
          <div className="w-full">
            <EmptyState title="Sem badges por enquanto" />
          </div>
        ) : (
          badges.map(b => (
            <StatusTag key={b.label} type={b.type}>{b.label}</StatusTag>
          ))
        )}
      </div>

      <div className="mt-2">
        <p className="text-sm font-semibold text-gray-900 dark:text-white mb-1">Missões da Semana</p>
        <div className="space-y-2">
          {missions.map(m => {
            const progress = m.id === 'week_days'
              ? uniqueDays
              : m.id === 'week_income'
              ? weekIncomeCount
              : m.id === 'week_total'
              ? weekTotalCount
              : m.id === 'week_validate_tx'
              ? weekValidations
              : m.id === 'week_goal_create'
              ? Math.max(0, (goals.length || 0) - weekGoalStart)
              : 0;
            const pct = Math.min(100, Math.floor((progress / m.target) * 100));
            return (
              <div key={m.id} className="bg-gray-50 dark:bg-gray-700 p-2 rounded">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-800 dark:text-gray-200">{m.label}</span>
                  {!m.completed ? (
                    progress >= m.target ? (
                      <button onClick={() => completeMission(m.id)} className="text-xs px-2 py-1 rounded bg-teal-600 text-white hover:bg-teal-700">Concluir (+{m.points})</button>
                    ) : (
                      <span className="text-[11px] text-gray-500 dark:text-gray-300">{progress}/{m.target}</span>
                    )
                  ) : (
                    <StatusTag type="success">Concluída</StatusTag>
                  )}
                </div>
                <div className="w-full bg-gray-200 dark:bg-gray-600 rounded-full h-2 mt-1 overflow-hidden">
                  <div className="h-2 bg-teal-500 rounded-full transition-all" style={{ width: `${pct}%` }}></div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {challenge && (
        <div className="mt-2">
          <div className="flex items-center justify-between mb-1">
            <p className="text-sm text-gray-800 dark:text-gray-200">Desafio: reduzir gastos em "{challenge.category}" em 10% vs base</p>
            {!challenge.accepted ? (
              <button onClick={acceptChallenge} className="text-xs px-2 py-1 rounded bg-indigo-600 text-white hover:bg-indigo-700">Aceitar</button>
            ) : (
              <div className="flex items-center gap-2">
                {challenge.completed ? (
                  <StatusTag type="success">Concluído</StatusTag>
                ) : (
                  <button onClick={resetChallenge} className="text-xs px-2 py-1 rounded bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-white">Trocar desafio</button>
                )}
              </div>
            )}
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400 mb-2">Base: {formatCurrency(challenge.baseline)} • Meta: {formatCurrency(challenge.target)} • Atual: {formatCurrency(stats.currentCatSpend)}</div>
          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3 overflow-hidden">
            <div className="h-3 bg-teal-600 rounded-full transition-all" style={{ width: `${Math.max(0, challengeProgress)}%` }}></div>
          </div>
          {challenge.accepted && !challenge.completed && challengeProgress >= 100 && (
            <div className="mt-2 text-right">
              <button onClick={markChallengeCompleted} className="text-xs px-3 py-1 rounded bg-teal-600 text-white hover:bg-teal-700">Registrar Conclusão (+50)</button>
            </div>
          )}
        </div>
      )}

      {history.length > 0 && (
        <div className="mt-4">
          <p className="text-sm font-semibold text-gray-900 dark:text-white mb-1">Histórico de Desafios</p>
          <div className="space-y-1">
            {history.map((h, i) => (
              <div key={i} className="text-xs text-gray-700 dark:text-gray-300 flex justify-between">
                <span>{new Date(h.achievedAt).toLocaleDateString()} • {h.category}</span>
                <span className="text-teal-600">+{h.points} pts</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {missionHistory.length > 0 && (
        <div className="mt-3">
          <p className="text-sm font-semibold text-gray-900 dark:text-white mb-1">Histórico de Missões</p>
          <div className="space-y-1">
            {missionHistory.map((h, i) => (
              <div key={i} className="text-xs text-gray-700 dark:text-gray-300 flex justify-between">
                <span>{new Date(h.achievedAt).toLocaleDateString()} • {h.label}</span>
                <span className="text-teal-600">+{h.points} pts</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
