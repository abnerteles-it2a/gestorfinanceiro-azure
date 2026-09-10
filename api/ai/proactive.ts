import type { IncomingMessage, ServerResponse } from 'http';
import { Pool } from 'pg';
import { jwtVerify } from 'jose';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { formatCurrency } from '../../utils/formatters';
import { verifySession } from '../_auth_shared';
import { askAzureOpenAI } from './_azure_openai';

// DB Pool (Shared logic from agent.ts)
let pool: Pool | null = null;
const getPool = () => {
  if (!pool) {
    const rawConnectionString = process.env.NEON_DATABASE_URL || process.env.DATABASE_URL;
    const connectionString = rawConnectionString ? rawConnectionString.replace('?sslmode=require', '') : rawConnectionString;
    pool = new Pool({ 
      connectionString,
      ssl: { rejectUnauthorized: false }
    });
  }
  return pool;
};


const loadEnv = async () => {
    try {
        const envPath = path.join(process.cwd(), '.env.local');
        if (fs.existsSync(envPath)) {
          const raw = fs.readFileSync(envPath, 'utf-8');
          raw.split(/\r?\n/).forEach(line => {
            const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
            if (m) {
              const key = m[1];
              let val = m[2].trim();
              if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
                 val = val.slice(1, -1);
              }
              if (!process.env[key]) process.env[key] = val;
            }
          });
        }
    } catch (e) {}
};

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') { res.statusCode = 200; res.end(); return; }

  await loadEnv();

  // 1. Auth Check (Enforcing Single-Session Compliance)
  const result = await verifySession(req, res, getPool());
  if (!result) return;
  const { userId } = result;

  let body: any = {};
  if (req.method === 'POST') {
      try {
          if (req.body && typeof req.body === 'object') {
              body = req.body;
          } else {
              const chunks = [];
              for await (const chunk of req) chunks.push(chunk);
              const data = Buffer.concat(chunks).toString();
              if (data) body = JSON.parse(data);
          }
      } catch (e) {}
  }
  
  const db = getPool();
  
  // 3. Robust Context Detection
  // Check viewMode from Body OR Header
  const viewMode = body.viewMode || req.headers['x-view-mode'] || 'personal';
  const isOrgView = viewMode === 'organization' || viewMode === 'corporate';

  // Fetch true Org ID from DB to avoid relying solely on Front-end state
  const profRes = await db.query('SELECT org_id FROM public.profiles WHERE user_id=$1', [userId]);
  const userOrgIdFromDb = profRes.rows[0]?.org_id;

  // Final Context Decision
  const effectiveOrgId = isOrgView ? (body.orgId || userOrgIdFromDb) : null;

  const provider = (process.env.AI_PROVIDER || process.env.VITE_AI_PROVIDER || 'vertex').toLowerCase();
  const now = new Date();
  
  // Security: If in Org view but no Org ID is resolved, use a Zero GUID to ensure empty results instead of leaking Personal data.
  const ZERO_GUID = '00000000-0000-0000-0000-000000000000';
  const queryScopeId = isOrgView ? (effectiveOrgId || ZERO_GUID) : userId;
  const queryFilter = isOrgView ? 'org_id=$1' : 'user_id=$1 AND org_id IS NULL';

  console.log(`Proactive Agent: Generating insights for user ${userId} (View: ${viewMode}, ScopeId: ${queryScopeId}) using provider ${provider}`);

  try {
      const daysToProject = Math.min(Math.max(Number(body.days || 30), 14), 90);

      // --- DATA GATHERING (Parallelized for Performance) ---
      const [
          accountsRes,
          totalsRes,
          transRes,
          billsRes,
          topCatsRes,
          upcomingObligationsRes,
          historyRes,
          futurePayablesRes,
          futureReceivablesRes,
          futureTransRes,
          recurrencesRes,
          categoriesRes
      ] = await Promise.all([
          // Accounts & Balance
          db.query(`
              SELECT a.id, a.name, a.initial_balance,
              (
                  COALESCE((SELECT SUM(amount) FROM public.transactions WHERE account_id = a.id AND LOWER(transaction_type) IN ('entrada', 'income', 'receita')), 0)
                  - COALESCE((SELECT SUM(amount) FROM public.transactions WHERE account_id = a.id AND LOWER(transaction_type) IN ('saída', 'saida', 'expense', 'despesa')), 0)
                  + COALESCE((SELECT SUM(amount) FROM public.transactions WHERE to_account_id = a.id AND LOWER(transaction_type) IN ('transferência', 'transferencia', 'transfer')), 0)
                  - COALESCE((SELECT SUM(amount) FROM public.transactions WHERE account_id = a.id AND LOWER(transaction_type) IN ('transferência', 'transferencia', 'transfer')), 0)
              ) as net
              FROM public.accounts a WHERE ${queryFilter}
          `, [queryScopeId]),

          // Current Month Totals
          db.query(`
              SELECT transaction_type, SUM(amount) as total
              FROM public.transactions 
              WHERE ${queryFilter} AND date >= $2
              GROUP BY 1
          `, [queryScopeId, new Date(now.getFullYear(), now.getMonth(), 1)]),

          // Recent Transactions (Last significant ones)
          db.query(`
              SELECT description, category, amount, transaction_type 
              FROM public.transactions 
              WHERE ${queryFilter}
              ORDER BY date DESC LIMIT 8
          `, [queryScopeId]),

          // Open Bills (Current Month)
          db.query(`
              SELECT id, title, amount, due_date, status FROM public.payables 
              WHERE ${queryFilter}
              AND status='open' 
              AND due_date <= $2
              ORDER BY due_date ASC
          `, [queryScopeId, new Date(now.getFullYear(), now.getMonth() + 1, 1)]),

          // Top Spending Categories (Last 30 days)
          db.query(`
              SELECT category, SUM(amount) as total
              FROM public.transactions
              WHERE ${queryFilter}
              AND LOWER(transaction_type) IN ('saída', 'saida', 'expense', 'despesa')
              AND date >= $2
              GROUP BY 1 ORDER BY 2 DESC LIMIT 5
          `, [queryScopeId, new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)]),

          // Upcoming Obligations Summary (Next 30 days)
          db.query(`
              SELECT SUM(amount) as total, COUNT(*) as count
              FROM public.payables 
              WHERE ${queryFilter} 
              AND status='open' 
              AND due_date > CURRENT_DATE AND due_date <= (CURRENT_DATE + INTERVAL '30 days')
          `, [queryScopeId]),

          // Rhythm Analysis (History Last 30 days)
          db.query(`
              SELECT transaction_type, SUM(amount) as total, COUNT(*) as count
              FROM public.transactions
              WHERE ${queryFilter}
              AND date >= CURRENT_DATE - INTERVAL '30 days'
              GROUP BY 1
          `, [queryScopeId]),

          // Future Projection - Payables (Next 30 to 90 days)
          db.query(`
              SELECT due_date, amount, title
              FROM public.payables
              WHERE ${queryFilter}
              AND status = 'open'
              AND due_date > CURRENT_DATE AND due_date <= CURRENT_DATE + ($2 || ' days')::INTERVAL
              ORDER BY due_date ASC
          `, [queryScopeId, daysToProject]),

          // Future Projection - Receivables (Next 30 to 90 days)
          db.query(`
              SELECT due_date, amount, title
              FROM public.receivables
              WHERE ${queryFilter}
              AND status = 'open'
              AND due_date > CURRENT_DATE AND due_date <= CURRENT_DATE + ($2 || ' days')::INTERVAL
              ORDER BY due_date ASC
          `, [queryScopeId, daysToProject]),

          // Future Projection - Scheduled Transactions (Next 30 to 90 days)
          db.query(`
              SELECT date, amount, transaction_type, description
              FROM public.transactions
              WHERE ${queryFilter}
              AND date > CURRENT_DATE AND date <= CURRENT_DATE + ($2 || ' days')::INTERVAL
              ORDER BY date ASC
          `, [queryScopeId, daysToProject]),

          // Recurrences (Active)
          db.query(`
              SELECT label, amount, day_of_month, category
              FROM public.recurrences
              WHERE ${queryFilter} AND active = true
          `, [queryScopeId]),

          // Categories (to check recurrence type)
          db.query(`
              SELECT name, type
              FROM public.categories
              WHERE ${queryFilter}
          `, [queryScopeId])
      ]);
      
      const totalCash = accountsRes.rows.reduce((acc, a) => acc + Number(a.initial_balance) + Number(a.net), 0);
      
      let income = 0;
      let expense = 0;
      totalsRes.rows.forEach(r => {
          const t = String(r.transaction_type || '').toLowerCase();
          if (['entrada', 'income', 'receita'].includes(t)) income += Number(r.total);
          if (['saída', 'saida', 'expense', 'despesa'].includes(t)) expense += Number(r.total);
      });
      const todayStr = now.toISOString().split('T')[0];

      // --- RHYTHM ANALYSIS ---
      let historyIncome = 0;
      let historyExpense = 0;
      historyRes.rows.forEach(r => {
          const t = String(r.transaction_type || '').toLowerCase();
          if (['entrada', 'income', 'receita'].includes(t)) historyIncome += Number(r.total);
          if (['saída', 'saida', 'expense', 'despesa'].includes(t)) historyExpense += Number(r.total);
      });
      const avgDailyExpenseRecent = historyExpense / 30;
      const avgDailyExpenseMonth = expense / 30;
      const spendingRhythmStatus = avgDailyExpenseRecent > avgDailyExpenseMonth * 1.2 ? 'Acelerado' : avgDailyExpenseRecent < avgDailyExpenseMonth * 0.8 ? 'Economizando' : 'Normal';

      // --- DAILY PROJECTION (30 to 90 DAYS) ---
      // Map categories to type
      const catTypeMap = new Map<string, string>();
      categoriesRes.rows.forEach(c => {
          if (c.name) catTypeMap.set(String(c.name).toLowerCase(), c.type);
      });

      const projections = [];
      let runningBalance = totalCash;
      let minBalance = totalCash;
      let minBalanceDate = todayStr;

      try {
          for (let i = 1; i <= daysToProject; i++) {
              const d = new Date(now.getTime() + i * 24 * 60 * 60 * 1000);
              const dStr = d.toISOString().split('T')[0];
              const dayOfMonth = d.getDate();
              
              // 1. Receivables
              const dayReceivables = futureReceivablesRes.rows.filter(r => {
                  try { return r.due_date && new Date(r.due_date).toISOString().split('T')[0] === dStr; } catch { return false; }
              }).reduce((s, r) => s + Number(r.amount || 0), 0);

              // 2. Payables
              const dayPayables = futurePayablesRes.rows.filter(r => {
                  try { return r.due_date && new Date(r.due_date).toISOString().split('T')[0] === dStr; } catch { return false; }
              }).reduce((s, r) => s + Number(r.amount || 0), 0);

              // 3. Scheduled Transactions
              let dayTxIn = 0;
              let dayTxOut = 0;
              futureTransRes.rows.filter(t => {
                  try { return t.date && new Date(t.date).toISOString().split('T')[0] === dStr; } catch { return false; }
              }).forEach(t => {
                  const tType = String(t.transaction_type || '').toLowerCase();
                  if (['entrada', 'income', 'receita'].includes(tType)) dayTxIn += Number(t.amount || 0);
                  else if (['saída', 'saida', 'expense', 'despesa'].includes(tType)) dayTxOut += Number(t.amount || 0);
              });

              // 4. Recurrences
              let dayRecIn = 0;
              let dayRecOut = 0;
              recurrencesRes.rows.forEach(rec => {
                  if (Number(rec.day_of_month) === dayOfMonth) {
                      const rawCType = catTypeMap.get(String(rec.category || '').toLowerCase()) || 'Saída';
                      const isRecIncome = ['entrada', 'income', 'receita'].includes(String(rawCType).toLowerCase());
                      if (isRecIncome) dayRecIn += Number(rec.amount || 0);
                      else dayRecOut += Number(rec.amount || 0);
                  }
              });

              runningBalance = runningBalance + dayReceivables + dayTxIn + dayRecIn - dayPayables - dayTxOut - dayRecOut;
              projections.push({ date: dStr, balance: runningBalance });
              
              if (runningBalance < minBalance) {
                  minBalance = runningBalance;
                  minBalanceDate = dStr;
              }
          }
      } catch (errPro) {
          console.error('Proactive Agent: Error calculating projections', errPro);
      }

      const urgentBills = billsRes.rows.filter(b => {
          try {
              if (!b.due_date) return false;
              const d = new Date(b.due_date);
              const bStr = d.toISOString().split('T')[0];
              return bStr <= todayStr;
          } catch { return false; }
      });

      const topCategories = topCatsRes.rows.map(r => `${r.category}: ${formatCurrency(r.total)}`).join(', ');
      const upcomingTotal = Number(upcomingObligationsRes.rows[0]?.total || 0);

      // --- INTELLIGENT LOCAL INSIGHTS (Always work, no AI needed) ---
      let finalInsights: any[] = [];

      // 1. Urgent Bills Alert
      if (urgentBills.length > 0) {
          const mainUrgent = urgentBills[0];
          const isToday = new Date(mainUrgent.due_date).toISOString().split('T')[0] === todayStr;
          finalInsights.push({
              type: 'negative',
              message: `Urgente: "${mainUrgent.title}" (${formatCurrency(mainUrgent.amount)}) vence ${isToday ? 'HOJE' : 'está ATRASADA'}!`,
              icon: 'alert',
              action: {
                  label: 'Pagar Agora',
                  type: 'pay_bill',
                  params: { billId: mainUrgent.id, amount: mainUrgent.amount, title: mainUrgent.title }
              }
          });
      }

      // 2. Cash Flow Projection Insight
      if (minBalance < 0) {
          finalInsights.push({
              type: 'negative',
              message: `🚨 Saldo negativo de ${formatCurrency(minBalance)} previsto em ${minBalanceDate}!`,
              icon: 'alert'
          });
      } else if (minBalance < totalCash * 0.5 && minBalance < totalCash) {
          finalInsights.push({
              type: 'negative',
              message: `⚠️ Saldo cairá para ${formatCurrency(minBalance)} em ${minBalanceDate}. Planeje-se!`,
              icon: 'alert'
          });
      } else if (totalCash > 0 && upcomingTotal > 0) {
          const coverage = totalCash / upcomingTotal;
          if (coverage >= 2) {
              finalInsights.push({
                  type: 'positive',
                  message: `Saldo cobre ${coverage.toFixed(1)}x suas contas dos próximos ${daysToProject} dias. Bom momento para investir!`,
                  icon: 'trend_up'
              });
          } else {
              finalInsights.push({
                  type: 'neutral',
                  message: `${formatCurrency(upcomingTotal)} em contas nos próximos ${daysToProject} dias. Saldo atual: ${formatCurrency(totalCash)}.`,
                  icon: 'savings'
              });
          }
      }

      // 3. Spending Rhythm Insight
      if (spendingRhythmStatus === 'Acelerado' && topCategories) {
          const topCat = topCatsRes.rows[0]?.category || '';
          finalInsights.push({
              type: 'negative',
              message: `Gastos acelerando! Maior categoria: ${topCat} (${formatCurrency(topCatsRes.rows[0]?.total || 0)}).`,
              icon: 'alert'
          });
      } else if (spendingRhythmStatus === 'Economizando') {
          finalInsights.push({
              type: 'positive',
              message: `Ritmo de gastos em queda vs. média. Continue economizando! 💪`,
              icon: 'savings'
          });
      }

      // 4. Income vs Expense Insight (if we have fewer than 2 insights)
      if (finalInsights.length < 2) {
          if (income > 0 && expense > 0) {
              const savingsRate = ((income - expense) / income * 100);
              if (savingsRate > 20) {
                  finalInsights.push({
                      type: 'positive',
                      message: `Margem de economia de ${savingsRate.toFixed(0)}% este mês. Excelente controle!`,
                      icon: 'trend_up'
                  });
              } else if (savingsRate > 0) {
                  finalInsights.push({
                      type: 'neutral',
                      message: `Economia de ${savingsRate.toFixed(0)}% este mês. Meta ideal: 20%+.`,
                      icon: 'target'
                  });
              } else {
                  finalInsights.push({
                      type: 'negative',
                      message: `Gastos superaram receitas em ${formatCurrency(expense - income)} este mês.`,
                      icon: 'alert'
                  });
              }
          } else if (totalCash > 0) {
              finalInsights.push({
                  type: 'positive',
                  message: `Saldo disponível: ${formatCurrency(totalCash)}. Acompanhe seu fluxo de caixa.`,
                  icon: 'trend_up'
              });
          }
      }

      // 5. Ensure minimum 2 insights
      if (finalInsights.length < 2) {
          if (upcomingTotal > 0) {
              finalInsights.push({
                  type: 'neutral',
                  message: `${formatCurrency(upcomingTotal)} em contas a pagar nos próximos ${daysToProject} dias.`,
                  icon: 'savings'
              });
          } else {
              finalInsights.push({
                  type: 'positive',
                  message: `Nenhuma conta a pagar nos próximos ${daysToProject} dias. Bom momento para metas!`,
                  icon: 'target'
              });
          }
      }

      // --- OPTIONAL AI ENHANCEMENT (Foundry Azure OpenAI) ---
      try {
          const aiPrompt = `Você é o "AI Advisor" de finanças do Gestor Financeiro. Dê exatamente 1 conselho CURTO (máximo 120 caracteres) e PREDITIVO sobre a projeção de ${daysToProject} dias:
- Saldo Atual: ${formatCurrency(totalCash)}
- Menor Saldo Previsto (${daysToProject} dias): ${formatCurrency(minBalance)} em ${minBalanceDate}
- Ritmo de Gastos: ${spendingRhythmStatus} (${formatCurrency(avgDailyExpenseRecent)}/dia)
- Total de Contas Previstas: ${formatCurrency(upcomingTotal)}
- Top Categorias de Gastos: ${topCategories || 'Nenhum'}

Responda APENAS com o texto do conselho objetivo, sem JSON, sem formatação, sem aspas. Exemplo: "Reduza gastos variáveis para manter saldo positivo no dia 25."`;

          const aiResponse = await askAzureOpenAI({
              messages: [
                  { role: 'system', content: 'Você é o AI Advisor de finanças. Dê conselhos preditivos curtos, precisos e motivadores em português.' },
                  { role: 'user', content: aiPrompt }
              ],
              maxTokens: 120,
              temperature: 0.3,
          });
          const aiText = aiResponse?.trim().replace(/["`]/g, '');
          if (aiText && aiText.length > 5 && aiText.length < 250) {
              finalInsights.push({ type: 'neutral', message: `✨ ${aiText}`, icon: 'target' });
          }
      } catch (aiErr) {
          console.warn('[Advisor] AI enhancement skipped:', (aiErr as any)?.message);
      }

      console.log(`[Advisor] Final insights: ${finalInsights.length} items`);
      res.statusCode = 200;
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ 
          insights: finalInsights.slice(0, 4),
          projectionsSummary: {
              days: daysToProject,
              initialBalance: totalCash,
              minBalance,
              minBalanceDate,
              finalBalance: projections[projections.length - 1]?.balance ?? totalCash
          }
      }));

  } catch (err) {
      console.error('Proactive Insights Error:', err);
      res.statusCode = 500;
      res.end(JSON.stringify({ error: 'internal_error' }));
  }
}
