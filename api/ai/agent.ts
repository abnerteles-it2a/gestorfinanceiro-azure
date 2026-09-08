import type { IncomingMessage, ServerResponse } from 'http';
import * as discoveryEngine from '@google-cloud/discoveryengine';
import { VertexAI } from '@google-cloud/vertexai';
import { GoogleAuth, OAuth2Client } from 'google-auth-library';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { execSync } from 'child_process';
import { Pool } from 'pg';
import { jwtVerify } from 'jose';
import { formatCurrency } from '../../utils/formatters';
import { verifySession } from '../_auth_shared';

// Use SearchServiceClient instead of Conversational (bypassing Enterprise requirement)
const v1beta = discoveryEngine.v1beta || (discoveryEngine as any).default?.v1beta;
const SearchServiceClient = v1beta?.SearchServiceClient;
const DocumentServiceClient = v1beta?.DocumentServiceClient;

const SEARCH_PROJECT_ID = 'formal-audio-480723-b1'; // Project ID from gcp_key.json
const VERTEX_PROJECT_ID = 'formal-audio-480723-b1'; // Project ID for Vertex AI
const LOCATION = 'global'; // For Discovery Engine
const VERTEX_LOCATION = 'us-central1'; // For Vertex AI (Gemini)
const COLLECTION = 'default_collection';
const DATA_STORE_ID = 'gestor-financeiro-manual-ds';

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

    // FORCE LOCAL MODE (Bypassing Vertex/Search due to account block)
    // New Logic: Check provider preference
    console.log('Agent: Checking AI Provider...');
    console.log('AI_PROVIDER:', process.env.AI_PROVIDER);

    const providerEnv = String(process.env.AI_PROVIDER || 'vertex').toLowerCase();
    const isAws = providerEnv === 'aws';

    if (!isAws && false) {
         console.log('Using Local Analysis Engine (Offline Mode)');
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
         
         const localResult = generateLocalAnalysis(query, localData, clientContext);
         
         res.statusCode = 200;
         res.setHeader('content-type', 'application/json');
         res.end(JSON.stringify({
           reply: localResult.reply,
           source: 'local_engine',
           model: 'Local Rules Engine',
           suggestedQuestions: localResult.suggestedQuestions,
           sessionId: sessionId || `session-${Date.now()}`,
           searchResults: []
         }));
         return;
    }

    // --- AWS BEDROCK INTEGRATION (Oregon / us-west-2) ---
    if (isAws) {
        try {
             console.log('Agent: Attempting AWS Bedrock (Oregon)...');
             const { BedrockRuntimeClient, InvokeModelCommand } = await import('@aws-sdk/client-bedrock-runtime');
             
             const region = String(process.env.AWS_REGION || process.env.REGION || 'us-west-2');
             const config: any = { region };

             // Replicate S3 Auth Logic to ensure compatibility with existing env vars
             const accessKeyId = process.env.AWS_ACCESS_KEY_ID || process.env.ACCESS_KEY_ID;
             const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY || process.env.SECRET_ACCESS_KEY;

             if (accessKeyId && secretAccessKey) {
                 config.credentials = { accessKeyId, secretAccessKey };
             }

             const client = new BedrockRuntimeClient(config);
             const envIds = String(process.env.BEDROCK_MODEL_IDS || process.env.AWS_BEDROCK_MODEL_IDS || '')
               .split(',')
               .map(s => s.trim())
               .filter(Boolean);
             const modelIds = envIds.length
               ? envIds
               : [
                   'anthropic.claude-sonnet-4-20250514-v1:0',
                   'us.anthropic.claude-sonnet-4-20250514-v1:0',
                   'anthropic.claude-3-7-sonnet-20250219-v1:0',
                   'anthropic.claude-3-5-sonnet-20241022-v2:0',
                   'anthropic.claude-3-5-sonnet-20240620-v1:0'
                 ];
             
             // Build System Prompt
             const systemPrompt = `Você é o Assistente Virtual Inteligente do "Gestor Financeiro".
             
             INSTRUÇÃO PRIMÁRIA:
             Responda DIRETAMENTE à pergunta do usuário usando os dados fornecidos abaixo.
             NÃO faça resumos gerais ou análises financeiras não solicitadas.
             Se o usuário perguntar "Quanto gastei?", responda apenas o valor e detalhes dos gastos.
             Se perguntar "Meus investimentos", liste os investimentos.
             Se a pergunta for genérica (ex: "Analise minhas finanças"), aí sim faça uma análise completa.

             CONTEXTO DO USUÁRIO:
             ${userDataContext}
             
             MANUAL DO SISTEMA:
             ${supplementaryContext}

             MANUAL COMPLETO DO GESTOR FINANCEIRO (BASE DE CONHECIMENTO):
             # Manual de Utilização - Gestor Financeiro

             ## 1. Introdução
             O Gestor Financeiro é uma solução completa que unifica o controle de fluxo de caixa, gestão de investimentos, contabilidade básica (MEI/Simples) e armazenamento seguro de documentos. A plataforma é dividida em módulos intuitivos acessíveis através de um painel de controle central.

             ## 2. Acesso e Primeiros Passos
             ### 2.1. Login e Cadastro
             Ao acessar a plataforma, você será recebido pela tela de autenticação.
             * Login: Insira seu e-mail e senha cadastrados.
             * Cadastro: Se for um novo usuário, clique na opção de criar conta. Você precisará fornecer: Nome completo, E-mail válido, Senha (mínimo de 6 caracteres), Nome da Organização e Plano desejado.

             ### 2.2. Recuperação de Sessão
             Se você já estiver logado em outro dispositivo, o sistema pode solicitar uma confirmação para assumir a sessão atual ("Takeover").

             ## 3. Visão Geral (Dashboard)
             O Dashboard é a tela inicial que resume a saúde financeira.
             ### 3.1. Indicadores Principais (KPIs)
             * Saldo Total: Soma de todas as contas bancárias cadastradas.
             * Receitas do Mês: Total de entradas no período atual.
             * Despesas do Mês: Total de saídas no período atual.
             * Saúde Financeira: Uma pontuação de 0 a 100 baseada em seus hábitos financeiros. (Verde > 80, Amarelo 50-79, Vermelho < 50).

             ### 3.2. Gráficos e Widgets
             * Fluxo de Caixa: Visualização diária ou mensal de entradas vs. saídas.
             * Metas Financeiras: Acompanhamento do progresso de objetivos.
             * Contas Bancárias: Lista rápida de saldos.

             ## 4. Gestão Financeira (Fluxo de Caixa)
             ### 4.1. Visualização de Transações
             * Filtros: Por conta, centro de custo, período ou busca textual.
             * Cores: Verde (Receitas), Vermelho (Despesas), Amarelo (Transferências).

             ### 4.2. Adicionar Transação
             Clique no botão de Adicionar (+) e selecione o tipo:
             1. Receita/Despesa: Preencha Valor, Descrição, Categoria, Conta, Data, Forma de Pagamento. Anexos disponíveis.
             2. Transferência: Mova valores entre contas sem alterar saldo total.

             ### 4.3. Categorias e Centros de Custo
             * Categorias: Essenciais, Estilo de Vida, Investimentos.
             * Centros de Custo: Separe despesas por projeto ou cliente.

             ### 4.4. Dicas
             * Conciliação Diária: Verifique se o saldo bate com o banco.
             * Não misture PF e PJ.
             * Previsibilidade: Lance despesas fixas futuras.

             ## 5. Contas e Pagamentos
             * Contas a Pagar: Obrigações futuras.
             * Contas a Receber: Valores esperados de clientes.

             ## 6. Investimentos
             * Renda Variável: Ações, FIIs, ETFs. Cotações atualizadas.
             * Renda Fixa: CDBs, Tesouro. Registre valor investido e taxa.
             * Consultor IA: Sugere rebalanceamentos.

             ## 7. Módulo Contábil e Financeiro
             * **Aba Financeira**: Gestão detalhada de "Contas a Pagar" (Passivos) e "Contas a Receber" (Ativos).
             * **Aba Contábil**:
               - **DRE Gerencial**: Demonstração do Resultado do Exercício. Mostra se sua operação teve Lucro ou Prejuízo (Receitas - Despesas).
               - **Balanço Patrimonial**: Visão estática da riqueza.
                 - **Ativos (Bens e Direitos)**: Soma de Dinheiro em Conta + Investimentos + Contas a Receber.
                 - **Passivos (Deveres)**: Soma de Contas a Pagar (Curto e Longo Prazo).
                 - **Patrimônio Líquido**: Ativos - Passivos. É a sua riqueza real.
             * **Impostos (MEI)**: O sistema pode ajudar a estimar o DAS (Documento de Arrecadação do Simples) baseado nas receitas declaradas.

             ## 8. Metas Financeiras (SMART)
             1. Defina Nome, Valor Alvo e Data Limite.
             2. Acompanhe a Barra de Progresso e Projeção automática baseada no valor atual guardado.
             3. Dica: Pague-se primeiro e automatize transferências para a meta.

             ## 9. Ferramentas Avançadas
             * **Cofre Digital (DocsVault)**: Armazenamento seguro de documentos fiscais na nuvem (S3).
               - **Upload**: Permite enviar PDF, Imagens. Campos: Fornecedor, Valor, Data, Notas.
               - **Organização**: Seus documentos ficam vinculados à sua conta e podem ser filtrados.
               - **Disponibilidade**: Recurso exclusivo para o plano Pro.
             * **Chatbot IA**: Assistente para dúvidas de uso e análise de dados.

             ## 11. Administração
             * Gestão de Organizações e Usuários (Promover a Admin, Redefinir senha).

             ## 12. Solução de Problemas
             * Erro Upload: Verifique caracteres especiais no nome do arquivo.
             * Saldo incorreto: Verifique conciliação das transações.
             * Acesso negado: Faça login novamente ou verifique assinatura.

             INSTRUÇÕES DE SEGURANÇA E ESCOPO (MUITO IMPORTANTE):
             1. VOCÊ É EXCLUSIVAMENTE UM ASSISTENTE FINANCEIRO.
             2. RECUSE-SE TERMINANTEMENTE a responder sobre qualquer assunto que não seja:
                - Finanças Pessoais e Corporativas
                - Investimentos (Ações, Renda Fixa, Cripto, etc)
                - Uso do Sistema "Gestor Financeiro" (conforme MANUAL acima)
                - Economia e Mercado Financeiro
             3. Se o usuário perguntar sobre receitas culinárias, esportes, política, entretenimento, conselhos amorosos, piadas, ou qualquer outro tema fora do escopo financeiro, responda APENAS:
                "Desculpe, sou um assistente especializado apenas em finanças e investimentos. Não posso ajudar com outros assuntos."
             4. NÃO tente adaptar assuntos aleatórios para finanças (ex: não dê dicas de "como economizar no churrasco" se o usuário pedir receita de churrasco. Apenas recuse).

             INSTRUÇÕES DE RESPOSTA:
             1. Responda de forma natural, empática e direta.
             2. Use os dados fornecidos em "CONTEXTO DO USUÁRIO" para dar respostas precisas sobre o saldo e gastos do usuário.
             3. Use o "MANUAL DO SISTEMA" para responder dúvidas de "como fazer" no sistema.
             4. Se o usuário perguntar "quanto gastei", some as despesas e mostre o valor exato.
             5. Se perguntar sobre investimentos, analise a carteira fornecida.
             6. Se não houver dados sobre o que foi perguntado, diga que não encontrou a informação.
             7. Responda sempre em Português do Brasil.
             8. Formate a resposta com Markdown (negrito, listas) para facilitar a leitura.
             `;

             const payload = {
                anthropic_version: "bedrock-2023-05-31",
                max_tokens: 4096,
                messages: [
                    { role: "user", content: query }
                ],
                system: systemPrompt 
            };
            let lastAwsErr: any = null;
            let usedModelId = '';
            let aiText = '';
            for (const modelId of modelIds) {
                try {
                    const command = new InvokeModelCommand({
                        modelId,
                        contentType: "application/json",
                        accept: "application/json",
                        body: JSON.stringify(payload),
                    });
                    const response = await client.send(command);
                    const responseBody = JSON.parse(new TextDecoder().decode(response.body));
                    aiText = responseBody.content?.[0]?.text || '';
                    if (aiText) {
                        usedModelId = modelId;
                        break;
                    }
                } catch (e: any) {
                    lastAwsErr = e;
                    const msg = String(e?.message || '');
                    const name = String(e?.name || '');
                    if (/end of its life/i.test(msg) || /not found/i.test(msg) || /access.?denied/i.test(msg) || name === 'ResourceNotFoundException' || name === 'AccessDeniedException') {
                        continue;
                    }
                    throw e;
                }
            }
            if (!aiText) throw lastAwsErr || new Error('bedrock_no_model_succeeded');

            res.statusCode = 200;
            res.setHeader('content-type', 'application/json');
            res.end(JSON.stringify({ 
                reply: aiText,
                source: 'aws_bedrock',
                model: usedModelId || 'aws_bedrock',
                suggestedQuestions: ["Meus gastos por categoria", "Resumo do mês", "Análise de investimentos"],
                sessionId: sessionId || `session-${Date.now()}`,
                searchResults: []
            }));
            return;

        } catch (awsErr: any) {
             console.error('Agent: AWS Bedrock Error:', awsErr);
             console.error('Agent: AWS Bedrock Error Name:', awsErr.name);
             console.error('Agent: AWS Bedrock Error Message:', awsErr.message);
             // Fallback to Local Mode if AWS fails
             console.log('Agent: Falling back to Local Mode due to AWS Error.');
             const localData = {
                 accounts, curIncome, curExpense, lastIncome, lastExpense, 
                 curCats, transactions, varInvestments, fixInvestments
            };
            const localResult = generateLocalAnalysis(query, localData, clientContext);
            res.statusCode = 200;
            res.setHeader('content-type', 'application/json');
            res.end(JSON.stringify({
               reply: localResult.reply,
               source: 'local_engine_fallback',
               model: `Local Rules Engine (Fallback: ${awsErr.message})`,
               suggestedQuestions: localResult.suggestedQuestions,
               sessionId: sessionId || `session-${Date.now()}`,
               searchResults: []
             }));
            return;
        }
    }


    const credentials = await getCredentials();
    const projectId = credentials?.project_id || VERTEX_PROJECT_ID;
    
    // --- AUTH SETUP ---
    let auth: any;
    
    // 1. Credentials Object (Highest Priority - from gcp_key.json or env, processed by getCredentials)
    if (credentials && credentials.client_email && credentials.private_key) {
         try {
             console.log('Using Cleaned Credentials Object');
             auth = new GoogleAuth({
               credentials: {
                 client_email: credentials.client_email,
                 private_key: credentials.private_key,
               },
               projectId: projectId,
               scopes: ['https://www.googleapis.com/auth/cloud-platform']
             });
         } catch (authErr) {
             console.error('Error creating GoogleAuth with credentials:', authErr);
         }
    }

    // 2. Try Local gcloud (if no service account)
    if (!auth && process.env.NODE_ENV !== 'production') {
        try {
           console.log('Attempting gcloud auth...');
           const token = execSync('gcloud auth print-access-token').toString().trim();
           const oAuth2Client = new OAuth2Client();
           oAuth2Client.setCredentials({ access_token: token });
           // Polyfill for google-gax compatibility
           if (!(oAuth2Client as any).getUniverseDomain) {
               (oAuth2Client as any).getUniverseDomain = async () => 'googleapis.com';
           }
           auth = { 
               getClient: async () => oAuth2Client,
               getUniverseDomain: async () => 'googleapis.com',
               getProjectId: async () => SEARCH_PROJECT_ID,
               getAccessToken: async () => token
           };
           console.log('Using gcloud auth.');
        } catch (e) {
            console.warn('Gcloud fallback failed, trying Service Account Key...');
        }
    }

    // 2. Service Account Key - REDUNDANT (handled by getCredentials in step 1), removing to avoid double processing
    // if (!auth && credentials && credentials.client_email && credentials.private_key) { ... }

    if (!auth) {
        // Fallback to ADC
        console.log('Falling back to ADC auth...');
        auth = new GoogleAuth({ 
            projectId: SEARCH_PROJECT_ID,
            scopes: ['https://www.googleapis.com/auth/cloud-platform']
        });
    }

    // --- 1. SEARCH STEP (Retrieval) ---
    let context = '';
    let results: any[] = [];
    let responseText = '';
    let responseSource = 'manual_fallback';
    let suggestedQuestions: string[] = []; // Initialize here to avoid ReferenceError
    
    try {
        const searchClient = new SearchServiceClient({
            auth: auth,
            projectId: SEARCH_PROJECT_ID,
            quotaProjectId: SEARCH_PROJECT_ID
        });

        const servingConfig = `projects/${SEARCH_PROJECT_ID}/locations/${LOCATION}/collections/${COLLECTION}/dataStores/${DATA_STORE_ID}/servingConfigs/default_serving_config`;
        
        console.log(`Searching for: "${query}"`);
        const [searchResponse] = await searchClient.search({
            servingConfig,
            query: query,
            pageSize: 5,
            contentSearchSpec: {
                summarySpec: {
                    summaryResultCount: 5,
                    includeCitations: true,
                    ignoreAdversarialQuery: true,
                    modelSpec: { version: 'stable' },
                },
                snippetSpec: { returnSnippet: true },
            }
        });

        // Debug Search Response for Metadata Validation
        console.log('--- SEARCH RESPONSE DEBUG ---');
        console.log(JSON.stringify(searchResponse.summary, null, 2));
        console.log('-----------------------------');

        results = searchResponse.results || [];
        
        // Try to use Native Summary (Agent Builder / Discovery Engine) - Uses $1000 credits
        // Only use if NOT a data query (because data queries need manual Gemini processing with DB context)
        if (searchResponse.summary?.summaryText && !isDataQuery) {
             console.log('Using Agent Builder Native Summary');
             responseText = searchResponse.summary.summaryText;
             responseSource = 'google_vertex_ai'; // Native Agent Builder
             
             // Process citations if available
             // Citations map parts of the summaryText to the sources (results)
             if (searchResponse.summary.summaryWithMetadata?.citationMetadata?.citations) {
                 const citations = searchResponse.summary.summaryWithMetadata.citationMetadata.citations;
                 console.log(`Found ${citations.length} citations.`);
                 // We can enhance the results array with citation info or just return it as is
                 // The frontend will receive 'results' which correspond to the citations
             } else {
                 console.log('No citations found in summary metadata.');
             }
        }

        // Extract text content from results
        const snippets = results.map((r: any) => {
            // 1. Try derived snippets (common for unstructured/web)
            if (r.document?.derivedStructData?.snippets?.[0]?.snippet) {
                return r.document.derivedStructData.snippets[0].snippet;
            }
            
            // 2. Try structData content (for structured/uploaded JSON)
            const struct = r.document?.structData;
            if (struct) {
                // Check for raw protobuf format or converted JS object
                const content = struct.fields?.content?.stringValue || struct.content;
                if (content) return content;
            }
            
            return '';
        }).filter(Boolean);

        context = snippets.join('\n\n');
        
        // Debug
        console.log(`Found ${results.length} results. Context length: ${context.length}`);

        // --- FALLBACK: If no results, fetch all documents (Brute Force RAG) ---
        if (results.length === 0 || context.length < 50) {
            console.log('Search returned no results. Falling back to listing all documents...');
            try {
                const docClient = new DocumentServiceClient({
                    auth: auth,
                    projectId: SEARCH_PROJECT_ID,
                    quotaProjectId: SEARCH_PROJECT_ID
                });
                
                const parent = `projects/${SEARCH_PROJECT_ID}/locations/${LOCATION}/collections/${COLLECTION}/dataStores/${DATA_STORE_ID}/branches/default_branch`;
                
                const [docs] = await docClient.listDocuments({ parent });
                
                const allSnippets = docs.map((d: any) => {
                     // Try structData content
                     const struct = d.structData;
                     if (struct) {
                         return struct.fields?.content?.stringValue || struct.content || JSON.stringify(struct);
                     }
                     // Try jsonData
                     if (d.jsonData) {
                         return d.jsonData;
                     }
                     return '';
                }).filter(Boolean);
                
                const fullContext = allSnippets.join('\n\n');
                
                if (fullContext.length > 0) {
                    console.log(`Fallback successful. Context length: ${fullContext.length}`);
                    context = fullContext;
                }
            } catch (fallbackErr: any) {
                console.error('Fallback failed:', fallbackErr.message);
            }
        }
    } catch (searchError: any) {
        console.error('Search API failed (continuing with manual context):', searchError.message);
        // Do not throw; continue to generation with supplementary context
    }



    // --- SUPPLEMENTARY CONTEXT (Manual Override) ---
    // Injects critical instructions that might be missing from the cloud index
    
    // (Manual moved to top of file)
    
    context = context + "\n\n" + supplementaryContext;

    // --- 2. GENERATION STEP (Synthesis) ---
     
     // Using Vertex AI Gemini
    let vertexAI;
    let usedModel = '';
     try {
        const vertexOptions: any = {
            project: projectId,
            location: 'us-central1',
        };
 
        // Replicate the auth priority used for Search (Cleaned Credentials Object)
        if (credentials && credentials.client_email && credentials.private_key) {
             console.log('VertexAI: Using Cleaned Credentials Object');
             vertexOptions.googleAuthOptions = {
                 credentials: {
                     client_email: credentials.client_email,
                     private_key: credentials.private_key,
                 },
                 scopes: ['https://www.googleapis.com/auth/cloud-platform']
             };
        }
        // Else rely on ADC/Env
 
        vertexAI = new VertexAI(vertexOptions);
     } catch (vErr: any) {
        console.error('VertexAI init failed:', vErr);
     }

     const candidates = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-2.0-flash-exp', 'gemini-1.5-flash'];
     
     // Only run manual generation if Native Summary was not available
     if (!responseText && vertexAI) {
        for (const mid of candidates) {
            try {
                console.log(`Trying model: ${mid}`);
                const model = vertexAI.getGenerativeModel({
                    model: mid,
                    generationConfig: {
                        maxOutputTokens: 4096,
                        temperature: 0.2,
                    }
                });
                
                const prompt = `
 Você é o Assistente Virtual Inteligente do "Gestor Financeiro", um especialista em finanças pessoais e suporte técnico.

 CONTEXTO DO USUÁRIO:
 ${userDataContext ? userDataContext : 'NOTA: Você não tem acesso aos dados financeiros do usuário nesta consulta. Responda apenas com base no conhecimento geral e no manual.'}

 PERGUNTA DO USUÁRIO: "${query}"

 ${clientContext?.currentView ? `CONTEXTO DE NAVEGAÇÃO: O usuário está atualmente visualizando a tela "${clientContext.currentView}".` : ''}

 RESULTADOS DA BUSCA E MANUAL (Use se necessário para explicar conceitos):
 ${context}

 INSTRUÇÕES:
 1. Se o usuário perguntou sobre SEUS DADOS (saldo, gastos, etc) e você tem os dados acima em "CONTEXTO DO USUÁRIO", responda DIRETAMENTE à pergunta.
 2. NÃO faça resumos gerais ou análises financeiras não solicitadas. Se o usuário perguntar "Quanto gastei?", responda apenas o valor.
 3. Se o usuário perguntar "como fazer" algo, use os "RESULTADOS DA BUSCA E MANUAL".
 4. Se a pergunta mistura os dois (ex: "Como lanço a despesa do meu almoço de R$ 50?"), explique como lançar (Manual) e cite que ele já gastou X em alimentação este mês (Dados), se disponível.
 5. Sempre responda em Markdown amigável. Use negrito para valores monetários.
 6. Se os dados não estiverem disponíveis e o usuário perguntou sobre eles, peça desculpas e diga que só pode ajudar com dúvidas sobre o sistema.
 7. Ao analisar investimentos ou sugerir ações, leve em consideração o "PERFIL DE INVESTIDOR" informado nos dados do usuário. Adapte o tom e o risco das sugestões a esse perfil.
 8. SETUP INICIAL: Se o usuário pedir ajuda para configurar ou começar ("Setup Inicial"), verifique o "DIAGNÓSTICO DE SETUP" acima. Liste o que está PENDENTE. Oriente-o a usar o menu "Ações Rápidas" (ícone de raio ⚡) no chat para abrir diretamente as telas de criação (Conta, Categoria, Centro de Custo). A ordem ideal é: 1. Contas Bancárias -> 2. Categorias -> 3. Centros de Custo.

 FORMATO DE RESPOSTA (OBRIGATÓRIO):
 - Responda DIRETAMENTE em Markdown puro. NÃO envolva em blocos de código. NÃO use JSON.
 - Estruture a resposta em blocos curtos, sempre com títulos em negrito e linhas separadas.
 - Use este template (adapte ao caso):
 **Resposta Direta**
 [1-2 linhas objetivas]

 **Detalhes**
 - item 1
 - item 2

 **Próximos Passos**
 - passo 1
 - passo 2
 - Evite parágrafos longos: quebre em linhas.
 `;
                
                console.log('Generating answer with Gemini (VertexAI SDK)...');
                const result = await model.generateContent(prompt);
                let rawText = result.response.candidates?.[0]?.content?.parts?.[0]?.text || '';
                
                // --- Clean response: strip accidental code block wrappers ---
                rawText = rawText.replace(/^```(?:json|markdown)?\s*/gi, '').replace(/```\s*$/g, '').trim();
                
                // Safety net: if the LLM still wraps in JSON despite instructions
                if (rawText.includes('"reply"')) {
                    try {
                        const si = rawText.indexOf('{');
                        const ei = rawText.lastIndexOf('}');
                        if (si !== -1 && ei > si) {
                            const parsed = JSON.parse(rawText.substring(si, ei + 1));
                            if (parsed.reply) {
                                rawText = parsed.reply;
                                suggestedQuestions = parsed.suggestedQuestions || [];
                            }
                        }
                    } catch {}
                }
                
                responseText = rawText;
                
                // Generate suggested questions programmatically
                if (suggestedQuestions.length === 0) {
                    const ql = query.toLowerCase();
                    if (ql.includes('analise') || ql.includes('análise') || ql.includes('financeira') || ql.includes('resumo')) {
                        suggestedQuestions = ['Como posso definir uma meta financeira?', 'Quais são minhas maiores despesas?', 'Como começar a investir?'];
                    } else if (ql.includes('invest')) {
                        suggestedQuestions = ['Qual é meu perfil de investidor?', 'Como diversificar meus investimentos?', 'Quais são os riscos?'];
                    } else if (ql.includes('meta') || ql.includes('objetivo')) {
                        suggestedQuestions = ['Como acompanhar meu progresso?', 'Quanto devo economizar por mês?', 'O que são metas SMART?'];
                    } else {
                        suggestedQuestions = ['Faça uma análise financeira do meu mês', 'Quais contas vencem esta semana?', 'Como configurar categorias?'];
                    }
                }


                if (responseText) {
                    responseSource = 'google_vertex_ai';
                    usedModel = mid;
                    break;
                }
            } catch (genError: any) {
                console.error(`Gemini Generation Error (${mid}):`, genError.message);
                // Continue to next model
            }
        }
     }

     // --- API KEY FALLBACK (If Service Account Failed) ---
     if (!responseText) {
         const apiKey = String(process.env.GOOGLE_API_KEY || '');
         if (apiKey) {
             console.log('Falling back to GOOGLE_API_KEY for generation...');
             const candidates = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-2.0-flash-exp', 'gemini-1.5-flash'];
             for (const mid of candidates) {
                 try {
                     const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(mid)}:generateContent?key=${encodeURIComponent(apiKey)}`;
                     const prompt = `
Você é o Assistente Virtual Inteligente do "Gestor Financeiro".

INSTRUÇÃO PRIMÁRIA:
Responda DIRETAMENTE à pergunta do usuário usando os dados fornecidos abaixo.

DIRETAMENTE DE SETUP (IMPORTANTE):
Se o usuário pedir ajuda para configurar, começar ou "primeiros passos", verifique o "DIAGNÓSTICO DE SETUP" no contexto abaixo.
Liste o que está PENDENTE.
Oriente-o a usar o menu "Ações Rápidas" (ícone de raio ⚡ no topo deste chat) para abrir diretamente as telas de criação.
A ordem ideal é: 1. Contas Bancárias -> 2. Categorias -> 3. Centros de Custo.

CONTEXTO DO USUÁRIO:
${userDataContext ? userDataContext : 'NOTA: Sem dados financeiros nesta consulta.'}

PERGUNTA DO USUÁRIO: "${query}"

RESULTADOS DA BUSCA:
${context}

INSTRUÇÕES:
1. Responda à pergunta do usuário usando o contexto.
2. Formate a resposta com blocos curtos em Markdown (títulos em negrito, listas, quebras de linha). Evite texto corrido.
3. Responda DIRETAMENTE em Markdown puro. NÃO envolva em blocos de código. NÃO use JSON.
`;
                     const bodyObj: any = { contents: [{ role: 'user', parts: [{ text: prompt }] }] };
                     const resp = await (globalThis.fetch as any)(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(bodyObj) });
                     const j = await resp.json();
                     
                     if (j.error) {
                         console.error(`Gemini API Error (${mid}):`, j.error);
                         continue;
                     }

                     let rawText = j.candidates?.[0]?.content?.parts?.[0]?.text || '';
                     
                     // Clean response: strip accidental code block wrappers
                     rawText = rawText.replace(/^```(?:json|markdown)?\s*/gi, '').replace(/```\s*$/g, '').trim();
                     
                     // Safety net: if the LLM still wraps in JSON
                     if (rawText.includes('"reply"')) {
                         try {
                             const si = rawText.indexOf('{');
                             const ei = rawText.lastIndexOf('}');
                             if (si !== -1 && ei > si) {
                                 const parsed = JSON.parse(rawText.substring(si, ei + 1));
                                 if (parsed.reply) {
                                     rawText = parsed.reply;
                                     suggestedQuestions = parsed.suggestedQuestions || [];
                                 }
                             }
                         } catch {}
                     }
                     
                     responseText = rawText;

                     if (responseText) {
                         responseSource = 'gemini_api_fallback';
                         usedModel = mid;
                         break;
                     }

                 } catch (e: any) {
                     console.error(`Gemini API Fallback Error (${mid}):`, e.message);
                 }
             }
         }
     }

     if (!responseText) {
         // Fallback to snippets if generation fails
         responseText = "Encontrei informações relevantes nos documentos abaixo, mas não consegui gerar um resumo detalhado no momento. Por favor, consulte os links para mais detalhes.";
     }

     console.log('Final Response:', responseText);

     res.statusCode = 200;
     res.setHeader('content-type', 'application/json');
     res.end(JSON.stringify({
       reply: responseText,
       source: responseSource,
       model: usedModel,
       suggestedQuestions: suggestedQuestions,
       sessionId: sessionId || `session-${Date.now()}`,
       searchResults: results.map((r: any) => {
         const struct = r.document?.structData;
         const title = struct?.fields?.title?.stringValue || struct?.title || r.document?.name;
         const link = r.document?.derivedStructData?.link || '';
         return {
           title: title,
           uri: link,
           snippet: '' // Snippet already used in context
         };
       })
     }));

  } catch (e: any) {
    console.error('Agent API Error:', e);
    res.statusCode = 500;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ error: 'agent_error', message: e.message, details: e }));
  }
}
