import { Pool } from 'pg';
import { sendEmail } from '../utils/email';

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

export default async function handler(req: any, res: any) {
  try {
    // 1. Security Check
    const secret = req.headers['x-report-secret'];
    const expectedSecret = process.env.REPORT_SECRET || 'gestor-financeiro-report-secret-2026';
    
    if (secret !== expectedSecret) {
      res.statusCode = 401;
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ error: 'unauthorized_secret' }));
      return;
    }

    const db = getPool();

    // 2. Find users due for report
    // We target users where report_enabled is true AND (never sent OR sent more than 14 days ago)
    const usersRes = await db.query(`
      SELECT p.user_id, p.full_name, u.email, p.report_frequency
      FROM public.profiles p
      JOIN public.auth_users u ON p.user_id = u.id
      WHERE p.report_enabled = true 
        AND (p.last_report_at IS NULL OR p.last_report_at < now() - interval '14 days')
      LIMIT 10 -- Process in small batches to avoid timeouts
    `);

    const users = usersRes.rows;
    const results = [];

    for (const user of users) {
      try {
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - 15);
        
        // 3. Aggregate Transactions (Income vs Expense)
        const txRes = await db.query(`
          SELECT 
            transaction_type,
            SUM(amount) as total
          FROM public.transactions
          WHERE user_id = $1 AND date >= $2
          GROUP BY transaction_type
        `, [user.user_id, startDate.toISOString()]);

        let income = 0;
        let expense = 0;
        txRes.rows.forEach(r => {
          if (r.transaction_type === 'receita' || r.transaction_type === 'income') income += Number(r.total);
          if (r.transaction_type === 'despesa' || r.transaction_type === 'expense') expense += Number(r.total);
        });

        // 4. Aggregate by Category (Expenses only)
        const catRes = await db.query(`
          SELECT 
            category,
            SUM(amount) as total
          FROM public.transactions
          WHERE user_id = $1 AND date >= $2 AND transaction_type IN ('despesa', 'expense')
          GROUP BY category
          ORDER BY total DESC
          LIMIT 5
        `, [user.user_id, startDate.toISOString()]);

        const categories = catRes.rows.map(r => ({ name: r.category, total: Number(r.total) }));

        // 5. Send Email
        const formattedIncome = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(income);
        const formattedExpense = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(expense);
        const balance = income - expense;
        const formattedBalance = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(balance);
        const balanceColor = balance >= 0 ? '#10b981' : '#ef4444';

        await sendEmail({
          to: user.email,
          subject: `📊 Relatório Quinzenal: Resumo das suas Finanças`,
          html: `
            <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; color: #1f2937;">
              <div style="background: #3b82f6; padding: 30px; border-radius: 16px 16px 0 0; text-align: center;">
                <h1 style="color: white; margin: 0; font-size: 24px;">Resumo Quinzenal</h1>
                <p style="color: #dbeafe; margin: 5px 0 0 0;">Gestor Financeiro Advisor</p>
              </div>
              
              <div style="padding: 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 16px 16px; background: white;">
                <p>Olá, <strong>${user.full_name || 'Usuário'}</strong>.</p>
                <p>Aqui está o resumo da sua movimentação financeira nos últimos 15 dias:</p>
                
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin: 30px 0;">
                  <div style="background: #f0fdf4; padding: 15px; border-radius: 12px; border: 1px solid #dcfce7;">
                    <div style="font-size: 10px; text-transform: uppercase; color: #166534; font-weight: bold;">Receitas</div>
                    <div style="font-size: 18px; font-weight: bold; color: #15803d;">${formattedIncome}</div>
                  </div>
                  <div style="background: #fef2f2; padding: 15px; border-radius: 12px; border: 1px solid #fee2e2;">
                    <div style="font-size: 10px; text-transform: uppercase; color: #991b1b; font-weight: bold;">Despesas</div>
                    <div style="font-size: 18px; font-weight: bold; color: #b91c1c;">${formattedExpense}</div>
                  </div>
                </div>

                <div style="text-align: center; margin-bottom: 30px; padding: 20px; background: #f8fafc; border-radius: 12px;">
                  <div style="font-size: 12px; color: #64748b; margin-bottom: 5px;">Saldo do Período</div>
                  <div style="font-size: 24px; font-weight: 900; color: ${balanceColor};">${formattedBalance}</div>
                </div>

                ${categories.length > 0 ? `
                  <h3 style="font-size: 14px; text-transform: uppercase; color: #64748b; border-bottom: 1px solid #e5e7eb; padding-bottom: 10px;">Top 5 Despesas por Categoria</h3>
                  <div style="margin-top: 15px;">
                    ${categories.map(c => `
                      <div style="display: flex; justify-content: space-between; margin-bottom: 10px; font-size: 14px;">
                        <span style="color: #4b5563;">${c.name}</span>
                        <span style="font-weight: bold; color: #1f2937;">${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(c.total)}</span>
                      </div>
                    `).join('')}
                  </div>
                ` : ''}

                <div style="margin-top: 40px; padding: 20px; background: #eff6ff; border-radius: 12px; border-left: 4px solid #3b82f6;">
                  <h4 style="margin: 0 0 5px 0; color: #1e40af; font-size: 14px;">💡 Insight do Advisor</h4>
                  <p style="margin: 0; color: #1e3a8a; font-size: 13px; line-height: 1.5;">
                    ${balance >= 0 
                      ? 'Parabéns! Suas receitas superaram suas despesas nesta quinzena. Continue mantendo o foco em suas metas de economia.' 
                      : 'Suas despesas foram maiores que suas receitas neste período. Que tal dar uma olhada nas categorias acima para ver onde pode economizar?'}
                  </p>
                </div>

                <div style="text-align: center; margin-top: 40px;">
                  <a href="${process.env.APP_URL || 'https://gestorfinanceiro.it2a.com'}" style="background: #3b82f6; color: white; padding: 12px 30px; text-decoration: none; border-radius: 99px; font-weight: bold; font-size: 14px; display: inline-block;">Ver Detalhes no App</a>
                </div>
              </div>
              
              <p style="font-size: 11px; color: #9ca3af; text-align: center; margin-top: 20px;">
                Este é um e-mail automático enviado pelo Gestor Financeiro.<br>
                Você pode desativar estes relatórios nas configurações do seu perfil.<br>
                &copy; ${new Date().getFullYear()} Gestor Financeiro. Todos os direitos reservados.
              </p>
            </div>
          `,
          text: `Relatório Quinzenal: Receitas ${formattedIncome}, Despesas ${formattedExpense}. Saldo: ${formattedBalance}.`
        });

        // 6. Update last_report_at
        await db.query('UPDATE public.profiles SET last_report_at = now() WHERE user_id = $1', [user.user_id]);
        
        results.push({ user: user.email, status: 'sent' });
      } catch (err: any) {
        console.error(`Error processing report for ${user.email}:`, err);
        results.push({ user: user.email, status: 'error', error: err.message });
      }
    }

    res.statusCode = 200;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ 
      success: true, 
      processed: users.length, 
      results 
    }));

  } catch (e: any) {
    console.error('Fatal error in report handler:', e);
    res.statusCode = 500;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ error: e?.message || 'error' }));
  }
}
