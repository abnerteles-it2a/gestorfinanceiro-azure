import type { IncomingMessage, ServerResponse } from 'http';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { execSync } from 'child_process';
import { Pool } from 'pg';
import { jwtVerify } from 'jose';
import { formatCurrency } from '../../utils/formatters';
import { verifySession } from '../_auth_shared';
import { askAzureOpenAI, DEFAULT_MODEL_DEPLOYMENT } from './_azure_openai';

// DB Pool
let pool: Pool | null = null;
const getPool = () => {
  if (!pool) {
    const rawConnectionString = process.env.NEON_DATABASE_URL || process.env.DATABASE_URL;
    const connectionString = rawConnectionString ? rawConnectionString.replace('?sslmode=require', '') : rawConnectionString;
    pool = new Pool({ 
      connectionString,
      ssl: { rejectUnauthorized: false }
    });
    // Ensure UTF-8 encoding for all connections
    pool.on('connect', (client) => {
      client.query('SET client_encoding = "UTF8"').catch(e => console.error('Failed to set client_encoding:', e));
    });
  }
  return pool;
};

// ... (loadEnv and getCredentials helpers remain the same)
// Helper to ensure env vars are loaded (similar to advice.ts)
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
            if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'")) || (val.startsWith('`') && val.endsWith('`'))) {
               val = val.slice(1, -1);
            }
            if (!process.env[key]) {
              process.env[key] = val;
            }
          }
        });
      }
  } catch (e) {
    console.error('Manual .env load failed:', e);
  }
};

const getCredentials = async () => {
  try {
    // 1. Try environment variables with robust parsing (Highest Priority - matches advice.ts behavior)
    const credsJsonStr = String(process.env.GOOGLE_CREDENTIALS_JSON || '');
    
    if (credsJsonStr) {
        let raw = credsJsonStr.trim();
        // Remove surrounding quotes if present (standard env var behavior)
        if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))) {
            raw = raw.slice(1, -1);
        }

        const tryJson = (s: string) => { try { return JSON.parse(s); } catch { return null; } };
        let parsed: any = tryJson(raw);
        
        // Try Base64 decode if JSON parse failed
        if (!parsed) {
            try {
                const decoded = Buffer.from(raw, 'base64').toString('utf-8');
                parsed = tryJson(decoded);
            } catch {}
        }

        if (parsed && parsed.client_email && parsed.private_key) {
             const pk = String(parsed.private_key).replace(/\\n/g, '\n');
             try {
                crypto.createPrivateKey(pk);
                return { 
                    client_email: parsed.client_email, 
                    private_key: pk,
                    project_id: parsed.project_id
                };
             } catch (e: any) {
                console.error('Agent: Invalid Private Key in GOOGLE_CREDENTIALS_JSON:', e.message);
             }
        }
    }

    // 2. Fallback to individual env vars
    const clientEmailEnv = String(process.env.GOOGLE_CLIENT_EMAIL || '');
    const privateKeyEnv = String(process.env.GOOGLE_PRIVATE_KEY || '');
    
    if (clientEmailEnv && privateKeyEnv) {
        const pk = privateKeyEnv.replace(/\\n/g, '\n');
        try {
            crypto.createPrivateKey(pk);
            return { client_email: clientEmailEnv, private_key: pk };
            } catch (e: any) {
                console.error('Agent: Invalid Private Key in GOOGLE_PRIVATE_KEY:', e.message);
            }
        }

    // 3. Try to load from gcp_key.json (Fallback)
    const keyPath = path.join(process.cwd(), 'gcp_key.json');
    if (fs.existsSync(keyPath)) {
      try {
        const keyContent = fs.readFileSync(keyPath, 'utf-8');
        const creds = JSON.parse(keyContent);
        if (creds.private_key) {
             if (typeof creds.private_key === 'string') {
                creds.private_key = creds.private_key.replace(/\\n/g, '\n');
             }
             try {
                crypto.createPrivateKey(creds.private_key);
                return creds;
             } catch (e: any) {
                console.error('Agent: Invalid Private Key in gcp_key.json:', e.message);
             }
        }
      } catch (e) {
        console.warn('Failed to parse gcp_key.json', e);
      }
    }

    return null;
  } catch (e) {
    console.error('Failed to get credentials:', e);
    return null;
  }
};

export default async function handler(req: any, res: any) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.statusCode = 200;
    res.end();
    return;
  }

  if ((req.method || '').toUpperCase() !== 'POST') {
    res.statusCode = 405;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ error: 'method_not_allowed' }));
    return;
  }

  await loadEnv();

  try {
    let input: any = {};
    if (req.body) {
      input = req.body;
    } else {
      let body = '';
      try {
        await new Promise<void>((resolve, reject) => {
          req.on('data', (chunk) => body += chunk);
          req.on('end', resolve);
          req.on('error', reject);
        });
        input = body ? JSON.parse(body) : {};
      } catch (e) {
        console.error('Body parse error:', e);
        input = {};
      }
    }

    const { query, sessionId, context: clientContext } = input;

    if (!query) {
      res.statusCode = 400;
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ error: 'missing_query' }));
      return;
    }

    // --- AUTH & USER CONTEXT (Enforcing Single-Session Compliance) ---
    const result = await verifySession(req, res, getPool());
    if (!result) return;
    const { userId } = result;
    let userDataContext = '';

    // --- DATA AWARENESS TOOLS ---
    // Simple intent detection for "Data Questions"
    // In a production agent, we would use Function Calling or a Classifier
    const lowerQuery = query.toLowerCase();
    
    // --- SUPPLEMENTARY CONTEXT (Manual Override) ---
    // Injects critical instructions that might be missing from the cloud index
    const supplementaryContext = `
    [[MANUAL DO SISTEMA GESTOR FINANCEIRO]]

    CONCEITOS IMPORTANTES - BALANÇO E METAS:
    - Balanço Mensal (DRE): Receitas - (Custos Variáveis + Despesas Fixas) = Lucro/Prejuízo. Use para saber se sobrou dinheiro no mês.
    - Balanço Patrimonial: Ativos (Bens) - Passivos (Dívidas) = Patrimônio Líquido. Use para medir sua riqueza acumulada.
    - Metas SMART: Específica, Mensurável, Atingível, Relevante, Temporal. Ex: "Juntar R$ 10k para viagem em 12 meses".

    COMO CADASTRAR CONTAS BANCÁRIAS:
    1. Clique no ícone de engrenagem (Configurações) no menu principal.
    2. Vá para a aba "Contas".
    3. Na seção "Adicionar Nova Conta", preencha:
       - Nome da Conta (ex: Nubank, Itaú)
       - Nome do Banco
       - Saldo Inicial
    4. Clique no botão de confirmação para salvar.
    OBS: Você também pode criar uma nova conta rapidamente clicando no botão "+" ao lado do campo "Conta" na janela de Novo Lançamento.

    COMO CRIAR CATEGORIAS:
    1. Clique no ícone de engrenagem (Configurações).
    2. Vá para a aba "Categorias".
    3. Selecione o tipo: "Receita" ou "Despesa".
    4. Digite o nome da nova categoria no campo de texto.
    5. Clique no botão "+" azul para adicionar.
    
    COMO LANÇAR DESPESAS E RECEITAS:
    1. Clique no botão "Novo Lançamento" (geralmente destacado na tela principal).
    2. Preencha os campos: Descrição, Valor, Data.
    3. Selecione o Tipo (Receita ou Despesa).
    4. Escolha a Categoria e a Conta Bancária apropriadas.
    5. Clique em "Adicionar" para salvar.

    COMO LANÇAR NOVO INVESTIMENTO:
    1. Vá para a aba "Investimentos" no menu principal.
    2. Clique no botão "Novo Investimento" (geralmente no topo da lista).
    3. Selecione o "Tipo de Ativo" (Ações, Fundos Imobiliários, Renda Fixa, Criptomoedas, etc.).
    4. Selecione a "Operação" como "Compra".
    5. Preencha os detalhes:
       - Para Renda Variável (Ações/FIIs): Código (Ticker), Quantidade, Preço de Compra.
       - Para Renda Fixa: Nome do Ativo, Emissor, Valor Investido, Rentabilidade, Data de Vencimento.
    6. (Opcional) Vincule a uma conta bancária para gerar o lançamento financeiro automático (saída do dinheiro).
    7. Clique em "Salvar".
    
    COMO LANÇAR CONTAS A PAGAR E RECEBER:
    1. Vá para a aba "Financeiro/Contábil" (ícone de cifrão ou gráfico).
    2. Clique no botão azul "Novo Lançamento".
    3. Na janela que abrir, selecione o tipo no topo:
       - "Contas a Pagar" (para despesas futuras/obrigações)
       - "Contas a Receber" (para valores que entrarão)
    4. Preencha os campos obrigatórios:
       - Título (ex: Aluguel, Venda #123)
       - Valor (R$)
       - Data de Vencimento
    5. Preencha os campos opcionais se desejar:
       - Categoria (ex: Moradia, Vendas)
       - Centro de Custo
       - Conta Bancária (para vincular liquidação futura)
       - Fornecedor/Cliente e Observações.
    6. Clique em "Salvar".
    `;

    const dataKeywords = [
        'quanto gastei', 'quanto estou gastando', 'meus gastos', 'minhas despesas',
        'meu saldo', 'minhas contas', 'total de despesas', 'resumo financeiro',
        'mês passado', 'gastando mais', 'comparativo', 'tendência', 'evolução',
        'gastos do mês', 'despesas do mês', 'receitas do mês', 'quanto ganhei',
        'meus investimentos', 'minha carteira', 'quanto tenho investido', 'rendimento',
        'ativos', 'ações', 'fundos', 'cripto', 'renda fixa',
        'saldo', 'banco', 'dinheiro', 'caixa', 'patrimônio', 'quanto tenho',
        'analise', 'análise', 'conselho', 'sugestão', 'auditoria', 'ajuda financeira',
        'como investir', 'onde investir', 'recomendação', 'perfil de risco',
        'rebalancear', 'diversificação', 'reserva de emergência',
        'balanço', 'balanco', 'patrimonial', 'dre', 'resumo', 'relatório',
        'meta', 'objetivo', 'sonho', 'poupança', 'economizar',
        'cofre', 'documento', 'arquivo', 'nota fiscal', 'recibo', 'comprovante', 'upload',
        'categoria', 'classificação', 'tipo de gasto',
        'pagar', 'vencimento', 'boleto', 'fatura', 'receber', 'entrada',
        'recorrente', 'assinatura', 'mensalidade', 'fixo'
    ];

    const isDataQuery = userId && dataKeywords.some(k => lowerQuery.includes(k));

    console.log(`Query analysis - UserId: ${userId ? 'Present' : 'Missing'}, Match: ${isDataQuery}, Query: "${lowerQuery}"`);

    // Define variables in outer scope for Local/Offline Mode access
    let accounts: any[] = [];
    let curIncome = 0;
    let curExpense = 0;
    let lastIncome = 0;
    let lastExpense = 0;
    let curCats: string[] = [];
    let transactions: any[] = [];
    let varInvestments: any[] = [];
    let fixInvestments: any[] = [];

    if (isDataQuery) {
        console.log(`Data Query detected for user ${userId}`);
        try {
            const db = getPool();
            
            // 1. Get Accounts Balance (Calculated with History including Transfers)
            const accountsRes = await db.query(`
                SELECT 
                    a.name, 
                    a.initial_balance,
                    (
                        COALESCE((SELECT SUM(amount) FROM public.transactions WHERE account_id = a.id AND transaction_type = 'Entrada'), 0)
                        +
                        COALESCE((SELECT SUM(amount) FROM public.transactions WHERE to_account_id = a.id AND transaction_type = 'Transferência'), 0)
                        -
                        COALESCE((SELECT SUM(amount) FROM public.transactions WHERE account_id = a.id AND transaction_type = 'Saída'), 0)
                        -
                        COALESCE((SELECT SUM(amount) FROM public.transactions WHERE account_id = a.id AND transaction_type = 'Transferência'), 0)
                    ) as net_movement
                FROM public.accounts a 
                WHERE a.user_id=$1
            `, [userId]);
            accounts = accountsRes.rows.map(a => ({
                name: a.name,
                initial_balance: Number(a.initial_balance),
                current_balance: Number(a.initial_balance) + Number(a.net_movement)
            }));
            
            // 2. Data Retrieval (Current & Last Month for Trends)
            const now = new Date();
            const startCurrent = new Date(now.getFullYear(), now.getMonth(), 1);
            const startLast = new Date(now.getFullYear(), now.getMonth() - 1, 1);

            // A. Aggregate Totals (Group by Month and Type)
            // Fetch everything from start of LAST month onwards
            const totalsRes = await db.query(`
                SELECT 
                    DATE_TRUNC('month', date) as month_start,
                    transaction_type,
                    SUM(amount) as total
                FROM public.transactions 
                WHERE user_id=$1 AND date >= $2
                GROUP BY 1, 2
                ORDER BY 1 DESC
            `, [userId, startLast]);

            // Process Totals
            totalsRes.rows.forEach(row => {
                // Add 12h to avoid timezone shift (e.g. 2025-11-01T00:00Z -> Oct 31 21:00 BRT)
                // DATE_TRUNC ensures it's the 1st of the month
                const d = new Date(new Date(row.month_start).getTime() + 43200000); 
                const val = Number(row.total);
                
                if (d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()) {
                    if (row.transaction_type === 'Entrada') curIncome += val;
                    if (row.transaction_type === 'Saída') curExpense += val;
                } else {
                    // It's last month (since we filtered query by >= startLast)
                    if (row.transaction_type === 'Entrada') lastIncome += val;
                    if (row.transaction_type === 'Saída') lastExpense += val;
                }
            });

            // B. Category Analysis (Top 3 Expenses per Month)
            const catRes = await db.query(`
                SELECT 
                    DATE_TRUNC('month', date) as month_start,
                    category,
                    SUM(amount) as total
                FROM public.transactions 
                WHERE user_id=$1 AND date >= $2 AND transaction_type='Saída'
                GROUP BY 1, 2
                ORDER BY 1 DESC, 3 DESC
            `, [userId, startLast]);

            const lastCats: string[] = [];

            catRes.rows.forEach(row => {
                const d = new Date(new Date(row.month_start).getTime() + 43200000); // 12h buffer
                const line = `${row.category}: ${formatCurrency(Number(row.total))}`;
                if (d.getMonth() === now.getMonth()) {
                    if (curCats.length < 3) curCats.push(line);
                } else {
                    if (lastCats.length < 3) lastCats.push(line);
                }
            });

            // C. Recent Transactions List (for display context)
            const transactionsRes = await db.query(`
                select date, description, category, amount, transaction_type 
                from public.transactions 
                where user_id=$1 and date >= $2 
                order by date desc 
                limit 15
            `, [userId, startCurrent]);
            transactions = transactionsRes.rows;

            // 3. Investments Retrieval
            // Variable Income
            const varInvRes = await db.query(`
                SELECT type, ticker, quantity, purchase_price 
                FROM public.investments 
                WHERE user_id=$1
            `, [userId]);
            
            // Fixed Income
            const fixInvRes = await db.query(`
                SELECT name, issuer, amount_invested, yield_rate, maturity_date 
                FROM public.fixed_income_investments 
                WHERE user_id=$1
            `, [userId]);

            varInvestments = varInvRes.rows;
            fixInvestments = fixInvRes.rows;

            let totalVarInvested = 0;
            varInvestments.forEach(i => totalVarInvested += (Number(i.quantity) * Number(i.purchase_price)));

            let totalFixInvested = 0;
            fixInvestments.forEach(i => totalFixInvested += Number(i.amount_invested));

            // 4. Payables & Receivables (For Patrimonial Balance & Details)
            const payablesRes = await db.query(`
                SELECT title, amount, due_date, status 
                FROM public.payables 
                WHERE user_id=$1 AND status='open'
                ORDER BY due_date ASC
            `, [userId]);
            const payablesList = payablesRes.rows;
            const totalPayables = payablesList.reduce((acc, p) => acc + Number(p.amount), 0);

            const receivablesRes = await db.query(`
                SELECT title, amount, due_date, status 
                FROM public.receivables 
                WHERE user_id=$1 AND status='open'
                ORDER BY due_date ASC
            `, [userId]);
            const receivablesList = receivablesRes.rows;
            const totalReceivables = receivablesList.reduce((acc, r) => acc + Number(r.amount), 0);

            // 5. Supplementary Data (Categories, Goals, Docs, Recurrences)
            const categoriesRes = await db.query('SELECT name, type FROM public.categories WHERE user_id=$1 ORDER BY type, name', [userId]);
            const goalsRes = await db.query('SELECT name, target_amount, current_amount, color FROM public.goals WHERE user_id=$1', [userId]);
            const docsRes = await db.query('SELECT supplier, doc_type, issue_date, amount, notes FROM public.fiscal_documents WHERE user_id=$1 ORDER BY created_at DESC LIMIT 5', [userId]);
            const recurrencesRes = await db.query('SELECT label, amount, day_of_month, category FROM public.recurrences WHERE user_id=$1 AND active=true', [userId]);
            const docsCountRes = await db.query('SELECT count(*) as total FROM public.fiscal_documents WHERE user_id=$1', [userId]);
            const costCentersRes = await db.query('SELECT count(*) as total FROM public.cost_centers WHERE user_id=$1', [userId]);

            // Calculate Patrimonial Data
            let totalCash = 0;
            accounts.forEach(a => totalCash += a.current_balance);
            
            const totalAssets = totalCash + totalVarInvested + totalFixInvested + totalReceivables;
            const totalLiabilities = totalPayables; 
            const netWorth = totalAssets - totalLiabilities;

            const hasAccounts = accounts.length > 0;
            const hasIncomeCats = categoriesRes.rows.some(c => c.type === 'Receita' || c.type === 'Entrada');
            const hasExpenseCats = categoriesRes.rows.some(c => c.type === 'Despesa' || c.type === 'Saída');
            const hasCostCenters = Number(costCentersRes.rows[0]?.total || 0) > 0;

            userDataContext = `
            [[DADOS REAIS DO USUÁRIO]]
            - DIAGNÓSTICO DE SETUP (Status Atual):
              - Contas Bancárias: ${hasAccounts ? `OK (${accounts.length} cadastradas)` : 'PENDENTE (Necessário criar)'}
              - Categorias de Entrada: ${hasIncomeCats ? 'OK' : 'PENDENTE (Necessário criar)'}
              - Categorias de Saída: ${hasExpenseCats ? 'OK' : 'PENDENTE (Necessário criar)'}
              - Centros de Custo: ${hasCostCenters ? 'OK' : 'Não criado (Opcional)'}

            - PERFIL DE INVESTIDOR: ${clientContext?.investmentProfile || 'Não informado (Assumir Moderado)'}
            
            - ESTRUTURA DE CATEGORIAS (Use para sugerir classificações):
              - Receitas: ${categoriesRes.rows.filter(c => c.type === 'Receita').map(c => c.name).join(', ') || 'Nenhuma'}
              - Despesas: ${categoriesRes.rows.filter(c => c.type === 'Despesa').map(c => c.name).join(', ') || 'Nenhuma'}

            - BALANÇO PATRIMONIAL (Visão Geral de Riqueza):
              - ATIVOS TOTAIS: ${formatCurrency(totalAssets)}
                - Dinheiro em Contas: ${formatCurrency(totalCash)}
                - Investimentos: ${formatCurrency(totalVarInvested + totalFixInvested)}
                - Contas a Receber (Aberto): ${formatCurrency(totalReceivables)}
              - PASSIVOS TOTAIS: ${formatCurrency(totalLiabilities)}
                - Contas a Pagar (Aberto): ${formatCurrency(totalPayables)}
              - PATRIMÔNIO LÍQUIDO: ${formatCurrency(netWorth)}
            
            - BALANÇO MENSAL (DRE - ${now.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}):
              - Receita Bruta: ${formatCurrency(curIncome)}
              - (-) Despesas/Custos: ${formatCurrency(curExpense)}
              - (=) Resultado Operacional (Lucro/Prejuízo): ${formatCurrency(curIncome - curExpense)}
              - Margem de Economia: ${curIncome > 0 ? ((curIncome - curExpense) / curIncome * 100).toFixed(1) : 0}%

            - DETALHAMENTO DAS CONTAS BANCÁRIAS:
              ${accounts.map(a => `- ${a.name}: ${formatCurrency(a.current_balance)}`).join('\n              ')}
            
            - CONTAS A PAGAR (Próximos Vencimentos):
              ${payablesList.slice(0, 5).map(p => `- ${p.title}: ${formatCurrency(Number(p.amount))} (Vence: ${new Date(p.due_date).toLocaleDateString()})`).join('\n              ') || '- Nenhuma conta pendente.'}

            - CONTAS A RECEBER (Próximas Entradas):
              ${receivablesList.slice(0, 5).map(r => `- ${r.title}: ${formatCurrency(Number(r.amount))} (Vence: ${new Date(r.due_date).toLocaleDateString()})`).join('\n              ') || '- Nenhuma entrada pendente.'}

            - METAS FINANCEIRAS (Objetivos):
              ${goalsRes.rows.map(g => `- ${g.name}: ${((Number(g.current_amount)/Number(g.target_amount))*100).toFixed(1)}% (${formatCurrency(Number(g.current_amount))} de ${formatCurrency(Number(g.target_amount))})`).join('\n              ') || '- Nenhuma meta definida.'}

            - GASTOS RECORRENTES (Assinaturas/Fixos):
              ${recurrencesRes.rows.map(r => `- ${r.label}: ${formatCurrency(Number(r.amount))} (Dia ${r.day_of_month}) - ${r.category}`).join('\n              ') || '- Nenhuma recorrência ativa.'}

            - COFRE DIGITAL (Documentos Armazenados):
              - Total de Arquivos: ${docsCountRes.rows[0]?.total || 0}
              - Últimos Envios:
                ${docsRes.rows.map(d => `- ${d.supplier || 'Sem fornecedor'} (${d.doc_type || 'Geral'}): ${formatCurrency(Number(d.amount || 0))} - ${d.notes || ''}`).join('\n                ') || '- Nenhum documento recente.'}

            - DETALHAMENTO DE INVESTIMENTOS:
              - Renda Variável (Total: ${formatCurrency(totalVarInvested)}):
                ${varInvestments.map(i => `${i.ticker} (${i.type}): ${i.quantity} un. a ${formatCurrency(Number(i.purchase_price))}`).join(', ')}
              - Renda Fixa (Total: ${formatCurrency(totalFixInvested)}):
                ${fixInvestments.map(i => `${i.name} (${i.issuer}): ${formatCurrency(Number(i.amount_invested))} (${i.yield_rate})`).join(', ')}

            - RESUMO DO MÊS PASSADO (${startLast.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}):
              - Receitas: ${formatCurrency(lastIncome)}
              - Despesas: ${formatCurrency(lastExpense)}
              - Resultado: ${formatCurrency(lastIncome - lastExpense)}
              - Top Despesas: ${lastCats.join(', ')}

            - ANÁLISE DE TENDÊNCIA (Comparativo Mensal):
              - Variação de Despesas: ${formatCurrency(curExpense - lastExpense)} (${curExpense > lastExpense ? 'Aumentou' : 'Diminuiu'})
              - Variação de Receitas: ${formatCurrency(curIncome - lastIncome)}

            - ÚLTIMAS TRANSAÇÕES (Contexto Recente):
            ${transactions.map(t => `  - ${new Date(t.date).toLocaleDateString()}: ${t.description} (${t.category}) - ${formatCurrency(Number(t.amount))} [${t.transaction_type}]`).join('\n')}
            `;
            
            console.log('User Data Context injected with Trend Analysis.');
        } catch (dbErr) {
            console.error('Failed to fetch user data:', dbErr);
            userDataContext = `[[ERRO AO BUSCAR DADOS]] Não consegui acessar seus dados financeiros no momento.`;
        }
    }

    // --- LOCAL ANALYSIS ENGINE (Offline Mode) ---
    const generateLocalAnalysis = (query: string, data: any, clientContext: any) => {
        // If AI_PROVIDER is AWS, we don't want to force local mode unless it fails later.
        // But this function is just a helper, so we keep it as is.
        const q = query.toLowerCase();
        
        // Intent Detection
        const isInvest = q.includes('invest') || q.includes('carteira') || q.includes('ativo') || q.includes('renda');
        const isFinance = q.includes('financ') || q.includes('contas') || q.includes('gasto') || q.includes('saldo') || q.includes('despesa') || q.includes('receita');
        const isHowTo = q.includes('como') || q.includes('ajuda') || q.includes('manual') || q.includes('tutorial');
        
        let reply = '';
        const suggestedQuestions: string[] = [];

        if (isHowTo) {
             reply = `**Ajuda e Manual (Modo Offline)**\n\n`;
             
             if (q.includes('conta')) {
                 reply += `**Como Cadastrar Contas Bancárias:**\n`;
                 reply += `💡 Dica: Use o menu "Ações Rápidas" (ícone de raio ⚡) aqui no chat.\n`;
                 reply += `1. Clique no ícone de engrenagem (Configurações).\n`;
                 reply += `2. Vá para a aba "Contas".\n`;
                 reply += `3. Na seção "Adicionar Nova Conta", preencha os dados e salve.\n`;
                 suggestedQuestions.push('Como lançar despesas?');
             } else if (q.includes('categor')) {
                 reply += `**Como Criar Categorias:**\n`;
                 reply += `💡 Dica: Use o menu "Ações Rápidas" (ícone de raio ⚡) aqui no chat.\n`;
                 reply += `1. Clique no ícone de engrenagem (Configurações).\n`;
                 reply += `2. Vá para a aba "Categorias".\n`;
                 reply += `3. Escolha o tipo (Receita/Despesa), digite o nome e clique no "+".\n`;
                 suggestedQuestions.push('Como criar metas?');
             } else if (q.includes('lança') || q.includes('despesa') || q.includes('receita')) {
                 reply += `**Como Lançar Despesas e Receitas:**\n`;
                 reply += `💡 Dica: Use o menu "Ações Rápidas" (ícone de raio ⚡) -> "Novo Lançamento".\n`;
                 reply += `1. Clique no botão "Novo Lançamento" na tela principal.\n`;
                 reply += `2. Preencha: Descrição, Valor, Data, Tipo, Categoria e Conta.\n`;
                 reply += `3. Clique em "Adicionar".\n`;
                 suggestedQuestions.push('Como ver meus gastos?');
             } else if (q.includes('invest')) {
                 reply += `**Como Lançar Investimentos:**\n`;
                 reply += `1. Vá para a aba "Investimentos".\n`;
                 reply += `2. Clique em "Novo Investimento".\n`;
                 reply += `3. Preencha os dados do ativo (Ticker, Qtd, Preço).\n`;
                 suggestedQuestions.push('Análise de investimentos');
             } else {
                 reply += `Posso te ajudar com:\n`;
                 reply += `- **Como lançar despesas**\n`;
                 reply += `- **Como criar categorias**\n`;
                 reply += `- **Como cadastrar contas**\n`;
                 reply += `- **Como lançar investimentos**\n\n`;
                 reply += `Tente perguntar algo como: "Como lançar uma despesa?"`;
             }
        } else if (isInvest) {
            const totalVar = data.varInvestments.reduce((acc: number, i: any) => acc + (Number(i.quantity) * Number(i.purchase_price)), 0);
            const totalFix = data.fixInvestments.reduce((acc: number, i: any) => acc + Number(i.amount_invested), 0);
            const total = totalVar + totalFix;
            
            reply = `**Análise de Investimentos (Modo Local)**\n\n`;
            reply += `**Patrimônio Total:** ${formatCurrency(total)}\n`;
            reply += `- **Renda Variável:** ${formatCurrency(totalVar)} (${total > 0 ? ((totalVar/total)*100).toFixed(1) : 0}%)\n`;
            reply += `- **Renda Fixa:** ${formatCurrency(totalFix)} (${total > 0 ? ((totalFix/total)*100).toFixed(1) : 0}%)\n\n`;
            
            const profile = clientContext?.investmentProfile || 'Não informado';
            reply += `**Perfil:** ${profile}\n`;
            
            if (profile.toLowerCase().includes('conservador') && (totalVar/total) > 0.3) {
                reply += `⚠️ **Atenção:** Sua exposição em renda variável (${((totalVar/total)*100).toFixed(1)}%) pode estar alta para um perfil Conservador.\n`;
            } else if (profile.toLowerCase().includes('arrojado') && (totalVar/total) < 0.3) {
                reply += `💡 **Dica:** Você tem espaço para aumentar sua exposição em renda variável, considerando seu perfil Arrojado.\n`;
            }
            
            reply += `\n**Ativos Detalhados:**\n`;
            if (data.varInvestments.length > 0) {
                 reply += data.varInvestments.map((i: any) => `- ${i.ticker} (${i.type}): ${i.quantity} un.`).join('\n') + '\n';
            } else {
                reply += `- Nenhum ativo de renda variável encontrado.\n`;
            }
            
            suggestedQuestions.push('Como rebalancear minha carteira?');
            suggestedQuestions.push('Quanto rendeu minha carteira?');
        } else if (isFinance) {
            const saldo = data.curIncome - data.curExpense;
            const savingsRate = data.curIncome > 0 ? (saldo / data.curIncome) * 100 : 0;
            
            reply = `**Análise Financeira Mensal (Modo Local)**\n\n`;
            reply += `**Resumo do Mês:**\n`;
            reply += `- **Receitas:** ${formatCurrency(data.curIncome)}\n`;
            reply += `- **Despesas:** ${formatCurrency(data.curExpense)}\n`;
            reply += `- **Saldo:** ${formatCurrency(saldo)}\n`;
            
            if (saldo > 0) {
                reply += `✅ **Resultado Positivo!** Você economizou ${formatCurrency(saldo)} (${savingsRate.toFixed(1)}% da renda).\n`;
            } else {
                reply += `⚠️ **Atenção!** Você gastou mais do que ganhou este mês.\n`;
            }
            
            reply += `\n**Maiores Gastos:**\n`;
            if (data.curCats.length > 0) {
                reply += data.curCats.map((c: string) => `- ${c}`).join('\n') + '\n';
            } else {
                reply += `- Nenhuma despesa categorizada encontrada.\n`;
            }
            
            const trend = data.curExpense - data.lastExpense;
            reply += `\n**Tendência:**\n`;
            reply += `Em comparação ao mês passado, suas despesas ${trend > 0 ? 'aumentaram' : 'diminuíram'} ${formatCurrency(Math.abs(trend))}.\n`;

            suggestedQuestions.push('Detalhar meus gastos');
            suggestedQuestions.push('Ver meus investimentos');
        } else {
            reply = `**Modo Offline Ativado**\n\n`;
            reply += `Como sua conta Google está temporariamente indisponível para análises via IA, estou operando em modo local.\n\n`;
            reply += `Posso fornecer análises baseadas nos seus dados registrados:\n`;
            reply += `- **Análise Financeira:** Resumo de receitas, despesas e saldo.\n`;
            reply += `- **Análise de Investimentos:** Resumo da carteira e alocação.\n\n`;
            reply += `Por favor, seja específico em sua solicitação (ex: "Análise financeira do mês" ou "Meus investimentos").`;
            
            suggestedQuestions.push('Análise financeira');
            suggestedQuestions.push('Meus investimentos');
        }

        return { reply, suggestedQuestions };
    };

        // Call Azure AI Foundry (GPT-4.1)
    let responseText = '';
    let responseSource = 'gestor_financeiro';
    let usedModel = 'Gestor Financeiro Intelligence Engine';
    let suggestedQuestions: string[] = ['Análise do mês', 'Minhas maiores despesas', 'Meus investimentos'];

    const localData = {
        accounts,
        curIncome,
        curExpense,
        lastIncome,
        lastExpense,
        curCats,
        transactions,
        varInvestments,
        fixInvestments
    };

    try {
      const systemPrompt = `Você é o Concierge e Inteligência Financeira nativa do "Gestor Financeiro".
Nunca mencione OpenAI, Azure, GPT, Foundry ou provedores terceiros. Toda a inteligência, automação e análise pertencem nativamente ao Gestor Financeiro.
Responda diretamente à pergunta do usuário usando os dados financeiros fornecidos.
Responda em português brasileiro com formatação limpa em markdown (títulos em negrito, listas e valores formatados em R$).
Se o usuário perguntar sobre configurações ou primeiros passos, oriente-o a cadastrar primeiro Contas Bancárias, depois Categorias e Centros de Custo.

DADOS FINANCEIROS DO USUÁRIO:
${userDataContext || 'Nenhum dado financeiro específico.'}`;

      responseText = await askAzureOpenAI({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: query }
        ],
        temperature: 0.3,
      });
    } catch (aiErr: any) {
      console.warn('Azure AI Foundry agent error, running local analysis:', aiErr?.message);
      const localResult = generateLocalAnalysis(query, localData, clientContext);
      responseText = localResult.reply;
      responseSource = 'local_engine';
      usedModel = 'Local Rules Engine';
      suggestedQuestions = localResult.suggestedQuestions;
    }

    res.statusCode = 200;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({
      reply: responseText,
      source: responseSource,
      model: usedModel,
      suggestedQuestions: suggestedQuestions,
      sessionId: sessionId || `session-${Date.now()}`,
      searchResults: []
    }));
  } catch (e: any) {
    console.error('Agent API Error:', e);
    res.statusCode = 500;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ error: 'agent_error', message: e.message, details: e }));
  }
}
