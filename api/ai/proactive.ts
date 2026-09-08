import type { IncomingMessage, ServerResponse } from 'http';
import { Pool } from 'pg';
import { jwtVerify } from 'jose';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { formatCurrency } from '../../utils/formatters';
import { verifySession } from '../_auth_shared';

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
      // --- DATA GATHERING (Parallelized for Performance) ---
      const [accountsRes, totalsRes, transRes, billsRes, topCatsRes, upcomingObligationsRes, historyRes, futurePayablesRes, futureReceivablesRes] = await Promise.all([
          // Accounts & Balance
          db.query(`
              SELECT a.id, a.name, a.initial_balance,
              (
                  COALESCE((SELECT SUM(amount) FROM public.transactions WHERE account_id = a.id AND transaction_type = 'Entrada'), 0)
                  - COALESCE((SELECT SUM(amount) FROM public.transactions WHERE account_id = a.id AND transaction_type = 'Saída'), 0)
                  + COALESCE((SELECT SUM(amount) FROM public.transactions WHERE to_account_id = a.id AND transaction_type = 'Transferência'), 0)
                  - COALESCE((SELECT SUM(amount) FROM public.transactions WHERE account_id = a.id AND transaction_type = 'Transferência'), 0)
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
              AND transaction_type = 'Saída'
              AND date >= $2
              GROUP BY 1 ORDER BY 2 DESC LIMIT 5
          `, [queryScopeId, new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)]),

          // Upcoming Obligations Summary (Next 14 days)
          db.query(`
              SELECT SUM(amount) as total, COUNT(*) as count
              FROM public.payables 
              WHERE ${queryFilter} 
              AND status='open' 
              AND due_date > CURRENT_DATE AND due_date <= (CURRENT_DATE + INTERVAL '14 days')
          `, [queryScopeId]),

          // NEW: Rhythm Analysis (History Last 14 days)
          db.query(`
              SELECT transaction_type, SUM(amount) as total, COUNT(*) as count
              FROM public.transactions
              WHERE ${queryFilter}
              AND date >= CURRENT_DATE - INTERVAL '14 days'
              GROUP BY 1
          `, [queryScopeId]),

          // NEW: Future Projection - Payables (Next 14 days)
          db.query(`
              SELECT due_date, amount, title
              FROM public.payables
              WHERE ${queryFilter}
              AND status = 'open'
              AND due_date > CURRENT_DATE AND due_date <= CURRENT_DATE + INTERVAL '14 days'
              ORDER BY due_date ASC
          `, [queryScopeId]),

          // NEW: Future Projection - Receivables (Next 14 days)
          db.query(`
              SELECT due_date, amount, title
              FROM public.receivables
              WHERE ${queryFilter}
              AND status = 'open'
              AND due_date > CURRENT_DATE AND due_date <= CURRENT_DATE + INTERVAL '14 days'
              ORDER BY due_date ASC
          `, [queryScopeId])
      ]);
      
      const totalCash = accountsRes.rows.reduce((acc, a) => acc + Number(a.initial_balance) + Number(a.net), 0);
      
      let income = 0;
      let expense = 0;
      totalsRes.rows.forEach(r => {
          if (r.transaction_type === 'Entrada') income = Number(r.total);
          if (r.transaction_type === 'Saída') expense = Number(r.total);
      });
      const todayStr = now.toISOString().split('T')[0];

      // --- NEW: RHYTHM ANALYSIS ---
      let historyIncome = 0;
      let historyExpense = 0;
      historyRes.rows.forEach(r => {
          if (r.transaction_type === 'Entrada') historyIncome = Number(r.total);
          if (r.transaction_type === 'Saída') historyExpense = Number(r.total);
      });
      const avgDailyExpenseRecent = historyExpense / 14;
      const avgDailyExpenseMonth = expense / 30;
      const spendingRhythmStatus = avgDailyExpenseRecent > avgDailyExpenseMonth * 1.2 ? 'Acelerado' : avgDailyExpenseRecent < avgDailyExpenseMonth * 0.8 ? 'Economizando' : 'Normal';

      // --- NEW: DAILY PROJECTION (14 DAYS) ---
      const projections = [];
      let runningBalance = totalCash;
      let minBalance = totalCash;
      let minBalanceDate = todayStr;

      try {
          for (let i = 1; i <= 14; i++) {
              const d = new Date(now.getTime() + i * 24 * 60 * 60 * 1000);
              const dStr = d.toISOString().split('T')[0];
              
              const dayReceivables = futureReceivablesRes.rows.filter(r => {
                  try { return r.due_date && new Date(r.due_date).toISOString().split('T')[0] === dStr; } catch { return false; }
              }).reduce((s, r) => s + Number(r.amount), 0);

              const dayPayables = futurePayablesRes.rows.filter(r => {
                  try { return r.due_date && new Date(r.due_date).toISOString().split('T')[0] === dStr; } catch { return false; }
              }).reduce((s, r) => s + Number(r.amount), 0);
              
              runningBalance = runningBalance + dayReceivables - dayPayables;
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
                  message: `Saldo cobre ${coverage.toFixed(1)}x suas contas dos próximos 14 dias. Bom momento para investir!`,
                  icon: 'trend_up'
              });
          } else {
              finalInsights.push({
                  type: 'neutral',
                  message: `${formatCurrency(upcomingTotal)} em contas nos próximos 14 dias. Saldo atual: ${formatCurrency(totalCash)}.`,
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
                  message: `${formatCurrency(upcomingTotal)} em contas a pagar nos próximos 14 dias.`,
                  icon: 'savings'
              });
          } else {
              finalInsights.push({
                  type: 'positive',
                  message: `Nenhuma conta a pagar nos próximos 14 dias. Bom momento para metas!`,
                  icon: 'target'
              });
          }
      }

      // --- OPTIONAL AI ENHANCEMENT (bonus, not required) ---
      try {
          const aiPrompt = `Você é o "AI Advisor" de finanças. Dê exatamente 1 conselho CURTO (máximo 100 caracteres) e PREDITIVO sobre este cenário:
- Saldo: ${formatCurrency(totalCash)}
- Projeção mínima 14 dias: ${formatCurrency(minBalance)} em ${minBalanceDate}
- Ritmo: ${spendingRhythmStatus} (${formatCurrency(avgDailyExpenseRecent)}/dia)
- Contas próximas: ${formatCurrency(upcomingTotal)}
- Top gastos: ${topCategories || 'Nenhum'}

Responda APENAS com o texto do conselho, sem JSON, sem formatação, sem aspas. Exemplo: "Reduza gastos com alimentação para manter saldo positivo até dia 30."`;

          if (provider === 'aws') {
              const { BedrockRuntimeClient, InvokeModelCommand } = await import('@aws-sdk/client-bedrock-runtime');
              const client = new BedrockRuntimeClient({ region: 'us-west-2' });
              const awsBody = JSON.stringify({
                  anthropic_version: "bedrock-2023-05-31",
                  max_tokens: 200,
                  messages: [{ role: "user", content: aiPrompt }]
              });
              const command = new InvokeModelCommand({
                  modelId: "anthropic.claude-3-5-sonnet-20241022-v2:0",
                  contentType: "application/json",
                  accept: "application/json",
                  body: awsBody
              });
              const response = await client.send(command).catch(() => null);
              if (response) {
                  const resBody = JSON.parse(new TextDecoder().decode(response.body));
                  const aiText = resBody.content?.[0]?.text?.trim();
                  if (aiText && aiText.length > 10 && aiText.length < 200) {
                      finalInsights.push({ type: 'neutral', message: `✨ ${aiText}`, icon: 'target' });
                  }
              }
          } else if (provider === 'vertex') {
              const { VertexAI } = await import('@google-cloud/vertexai');
              const credsRaw = process.env.GOOGLE_CREDENTIALS_JSON || '{}';
              let creds: any = {};
              try { creds = JSON.parse(credsRaw); } catch { try { creds = JSON.parse(Buffer.from(credsRaw, 'base64').toString('utf-8')); } catch {} }
              
              const vertexOptions: any = {
                  project: process.env.GOOGLE_CLOUD_PROJECT || creds.project_id,
                  location: process.env.GOOGLE_VERTEX_LOCATION || 'us-central1'
              };
              
              // Fix: Pass explicit credentials (required for Amplify/non-ADC environments)
              if (creds.client_email && creds.private_key) {
                  const pk = String(creds.private_key).replace(/\\n/g, '\n');
                  vertexOptions.googleAuthOptions = {
                      credentials: { client_email: creds.client_email, private_key: pk },
                      scopes: ['https://www.googleapis.com/auth/cloud-platform']
                  };
              }
              
              const vertexAI = new VertexAI(vertexOptions);
              const modelName = process.env.GOOGLE_VERTEX_MODEL || 'gemini-2.5-flash';
              const model = vertexAI.getGenerativeModel({ 
                  model: modelName,
                  generationConfig: { maxOutputTokens: 200, temperature: 0.3 }
              });
              const result = await model.generateContent(aiPrompt).catch((err) => {
                  console.error('[Advisor] Vertex AI failed:', err.message);
                  return null;
              });
              if (result) {
                  let aiText = result.response.candidates?.[0]?.content?.parts?.[0]?.text || '';
                  aiText = aiText.replace(/```/g, '').replace(/"/g, '').trim();
                  if (aiText && aiText.length > 10 && aiText.length < 200) {
                      finalInsights.push({ type: 'neutral', message: `✨ ${aiText}`, icon: 'target' });
                  }
              }
          }
      } catch (aiErr) {
          console.warn('[Advisor] AI enhancement skipped:', (aiErr as any)?.message);
      }

      console.log(`[Advisor] Final insights: ${finalInsights.length} items`);
      res.statusCode = 200;
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ insights: finalInsights.slice(0, 3) }));

  } catch (err) {
      console.error('Proactive Insights Error:', err);
      res.statusCode = 500;
      res.end(JSON.stringify({ error: 'internal_error' }));
  }
}
