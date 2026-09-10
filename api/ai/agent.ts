import type { IncomingMessage, ServerResponse } from 'http';
import fs from 'fs';
import path from 'path';
import { Pool } from 'pg';
import { formatCurrency } from '../../utils/formatters';
import { verifySession } from '../_auth_shared';
import { askAzureOpenAI, DEFAULT_MODEL_DEPLOYMENT, ChatMessage } from './_azure_openai';
import { searchManualKnowledge, formatKnowledgeForPrompt, ActionChip } from './_rag_knowledge';

// Database Pool
let pool: Pool | null = null;
const getPool = () => {
  if (!pool) {
    const rawConnectionString = process.env.NEON_DATABASE_URL || process.env.DATABASE_URL;
    const connectionString = rawConnectionString ? rawConnectionString.replace('?sslmode=require', '') : rawConnectionString;
    pool = new Pool({ 
      connectionString,
      ssl: { rejectUnauthorized: false }
    });
    pool.on('connect', (client) => {
      client.query('SET client_encoding = "UTF8"').catch(e => console.error('Failed to set client_encoding:', e));
    });
  }
  return pool;
};

// Helper to ensure local env vars are loaded if present
const loadEnv = () => {
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
    console.warn('Manual .env load warning:', e);
  }
};

const SYSTEM_MANUAL_GUIDELINES = `
[[MANUAL DO SISTEMA GESTOR FINANCEIRO]]

CONCEITOS IMPORTANTES:
- Balanço Mensal (DRE): Receitas - Despesas = Saldo Operacional do Mês.
- Balanço Patrimonial: Ativos Totais (Contas Bancárias + Investimentos + Contas a Receber) - Passivos (Contas a Pagar) = Patrimônio Líquido.
- Modo de Visualização: O usuário pode alternar entre visão Pessoal e Organizacional (Pessoa Jurídica/Empresas).

COMO CADASTRAR CONTAS BANCÁRIAS:
1. Abra o menu Configurações (ícone de engrenagem) ou use o atalho na barra superior.
2. Acesse a aba "Contas".
3. Clique em "Nova Conta", informe o nome (ex: Nubank, Itaú), tipo e saldo inicial, depois salve.

COMO CRIAR CATEGORIAS:
1. Em Configurações, selecione a aba "Categorias".
2. Escolha o tipo: "Receita" ou "Despesa".
3. Digite o nome da categoria e clique em Adicionar.

COMO LANÇAR DESPESAS OU RECEITAS:
1. Clique no botão "Novo Lançamento" na barra superior ou no dashboard.
2. Escolha o tipo (Receita ou Despesa), preencha descrição, valor, data, conta e categoria.
3. Clique em "Salvar". Também é possível lançar por voz ou por linguagem natural rápida.

COMO LANÇAR CONTAS A PAGAR E RECEBER:
1. Acesse o módulo Financeiro / Contas a Pagar e Receber.
2. Clique em "Novo Lançamento", selecione se é Conta a Pagar ou a Receber.
3. Preencha título, valor, data de vencimento, categoria e fornecedor/cliente.

COMO LANÇAR INVESTIMENTOS:
1. Acesse a aba "Investimentos".
2. Clique em "Novo Investimento", selecione Renda Variável (ações, FIIs, cripto) ou Renda Fixa (CDB, Tesouro, LCI).
3. Preencha ticker/ativo, quantidade, preço e vincule à conta bancária de liquidação.
`;

export default async function handler(req: any, res: any) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-view-mode');

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

  loadEnv();

  try {
    let input: any = {};
    if (req.body && typeof req.body === 'object') {
      input = req.body;
    } else {
      let body = '';
      await new Promise<void>((resolve, reject) => {
        req.on('data', (chunk: any) => body += chunk);
        req.on('end', resolve);
        req.on('error', reject);
      });
      input = body ? JSON.parse(body) : {};
    }

    const { query, sessionId, context: clientContext, history: clientHistory } = input;

    if (!query || typeof query !== 'string' || !query.trim()) {
      res.statusCode = 400;
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ error: 'missing_query' }));
      return;
    }

    // Auth & user validation
    const result = await verifySession(req, res, getPool());
    if (!result) return;
    const { userId } = result;

    const viewMode = (req.headers['x-view-mode'] as string) || clientContext?.viewMode || 'personal';

    // Fetch user financial context
    let userDataContext = '';
    let accounts: any[] = [];
    let curIncome = 0;
    let curExpense = 0;
    let lastIncome = 0;
    let lastExpense = 0;
    let curCats: string[] = [];
    let transactions: any[] = [];
    let varInvestments: any[] = [];
    let fixInvestments: any[] = [];

    try {
      const db = getPool();
      const now = new Date();
      const startCurrent = new Date(now.getFullYear(), now.getMonth(), 1);
      const startLast = new Date(now.getFullYear(), now.getMonth() - 1, 1);

      // 1. User Accounts with Net Movement
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
        initial_balance: Number(a.initial_balance || 0),
        current_balance: Number(a.initial_balance || 0) + Number(a.net_movement || 0)
      }));

      // 2. Month Totals (Current & Last Month)
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

      totalsRes.rows.forEach(row => {
        const d = new Date(new Date(row.month_start).getTime() + 43200000); 
        const val = Number(row.total || 0);
        if (d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()) {
          if (row.transaction_type === 'Entrada') curIncome += val;
          if (row.transaction_type === 'Saída') curExpense += val;
        } else {
          if (row.transaction_type === 'Entrada') lastIncome += val;
          if (row.transaction_type === 'Saída') lastExpense += val;
        }
      });

      // 3. Top Expense Categories
      const catRes = await db.query(`
        SELECT 
          category,
          SUM(amount) as total
        FROM public.transactions 
        WHERE user_id=$1 AND date >= $2 AND transaction_type='Saída'
        GROUP BY 1
        ORDER BY 2 DESC
        LIMIT 5
      `, [userId, startCurrent]);
      curCats = catRes.rows.map(r => `${r.category}: ${formatCurrency(Number(r.total || 0))}`);

      // 4. Recent Transactions
      const txRes = await db.query(`
        SELECT date, description, category, amount, transaction_type 
        FROM public.transactions 
        WHERE user_id=$1 AND date >= $2 
        ORDER BY date DESC 
        LIMIT 10
      `, [userId, startCurrent]);
      transactions = txRes.rows;

      // 5. Investments
      const varInvRes = await db.query(`
        SELECT type, ticker, quantity, purchase_price 
        FROM public.investments 
        WHERE user_id=$1
      `, [userId]);
      varInvestments = varInvRes.rows;

      const fixInvRes = await db.query(`
        SELECT name, issuer, amount_invested, yield_rate, maturity_date 
        FROM public.fixed_income_investments 
        WHERE user_id=$1
      `, [userId]);
      fixInvestments = fixInvRes.rows;

      let totalVar = 0;
      varInvestments.forEach(i => totalVar += (Number(i.quantity || 0) * Number(i.purchase_price || 0)));
      let totalFix = 0;
      fixInvestments.forEach(i => totalFix += Number(i.amount_invested || 0));

      // 6. Payables & Receivables
      const payablesRes = await db.query(`
        SELECT title, amount, due_date, status 
        FROM public.payables 
        WHERE user_id=$1 AND status='open'
        ORDER BY due_date ASC
        LIMIT 5
      `, [userId]);
      const payables = payablesRes.rows;
      const totalPayables = payables.reduce((acc, p) => acc + Number(p.amount || 0), 0);

      const receivablesRes = await db.query(`
        SELECT title, amount, due_date, status 
        FROM public.receivables 
        WHERE user_id=$1 AND status='open'
        ORDER BY due_date ASC
        LIMIT 5
      `, [userId]);
      const receivables = receivablesRes.rows;
      const totalReceivables = receivables.reduce((acc, r) => acc + Number(r.amount || 0), 0);

      // Total Cash
      let totalCash = 0;
      accounts.forEach(a => totalCash += a.current_balance);
      const totalAssets = totalCash + totalVar + totalFix + totalReceivables;
      const netWorth = totalAssets - totalPayables;

      userDataContext = `
DADOS REAIS DO USUÁRIO EM TEMPO REAL:
- Modo Ativo: Visão ${viewMode === 'organization' ? 'Organizacional / PJ' : 'Pessoal'}
- Patrimônio Líquido Estimado: ${formatCurrency(netWorth)} (Ativos: ${formatCurrency(totalAssets)} | Passivos a Vencer: ${formatCurrency(totalPayables)})
- Saldo em Caixa / Bancos (${accounts.length} contas): ${formatCurrency(totalCash)}
  ${accounts.map(a => `• ${a.name}: ${formatCurrency(a.current_balance)}`).join('\n  ') || '• Nenhuma conta bancária'}
- Mês Atual (${now.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}):
  • Receitas: ${formatCurrency(curIncome)}
  • Despesas: ${formatCurrency(curExpense)}
  • Saldo Operacional: ${formatCurrency(curIncome - curExpense)} (${curIncome > 0 ? ((curIncome - curExpense) / curIncome * 100).toFixed(1) : 0}% taxa de economia)
- Mês Anterior: Receitas ${formatCurrency(lastIncome)} | Despesas ${formatCurrency(lastExpense)}
- Principais Categorias de Gastos: ${curCats.length ? curCats.join(', ') : 'Sem despesas cadastradas'}
- Próximas Contas a Pagar:
  ${payables.map(p => `• ${p.title}: ${formatCurrency(Number(p.amount))} (Vence em ${new Date(p.due_date).toLocaleDateString('pt-BR')})`).join('\n  ') || '• Nenhuma conta pendente'}
- Próximas Contas a Receber:
  ${receivables.map(r => `• ${r.title}: ${formatCurrency(Number(r.amount))} (Previsto para ${new Date(r.due_date).toLocaleDateString('pt-BR')})`).join('\n  ') || '• Nenhuma receita pendente'}
- Investimentos: Total ${formatCurrency(totalVar + totalFix)} (Renda Fixa: ${formatCurrency(totalFix)} | Renda Variável: ${formatCurrency(totalVar)})
  ${varInvestments.slice(0, 5).map(i => `• ${i.ticker} (${i.type}): ${i.quantity} un.`).join('\n  ')}
- Transações Recentes:
  ${transactions.slice(0, 6).map(t => `• ${new Date(t.date).toLocaleDateString('pt-BR')} - ${t.description} (${t.category}): ${formatCurrency(Number(t.amount))} [${t.transaction_type}]`).join('\n  ')}
`;
    } catch (dbErr: any) {
      console.warn('Could not retrieve full user context for concierge:', dbErr.message);
      userDataContext = 'Dados do usuário indisponíveis no momento da consulta.';
    }

    const deployment = process.env.AZURE_OPENAI_DEPLOYMENT_NAME || 'gpt-4.1';

    // RAG: Retrieve targeted sections from the official system manual based on user query
    const { chunks: ragChunks, topAction } = searchManualKnowledge(query);
    const ragKnowledgeContext = formatKnowledgeForPrompt(ragChunks);

    const isOnboarding = accounts.length === 0;
    const onboardingGuidance = isOnboarding ? `
[[MODO DE ONBOARDING ATIVO]]:
O usuário ainda não possui nenhuma conta bancária cadastrada.
Se ele perguntar sobre o que fazer, como começar ou como lançar, dê as boas-vindas calorosas e oriente-o a completar o Passo 1 da Jornada: cadastrar sua primeira conta bancária (corrente, poupança ou carteira) em Configurações > Contas.
` : '';

    const systemPrompt = `Você é o Concierge e Especialista em Inteligência Financeira e Contábil do "Gestor Financeiro", operando através do modelo Azure AI Foundry (${deployment}).
Seu papel é auxiliar o usuário a gerenciar suas finanças, obrigações contábeis e investimentos com máxima precisão, elegância e clareza.

🛑 REGRA FUNDAMENTAL DE ESCOPO E GUARDRAIL (ESTRITAMENTE OBRIGATÓRIA):
1. ESCOPO PERMITIDO: Você é EXCLUSIVAMENTE especializado em:
   - Gestão financeira pessoal e empresarial (saldos, receitas, despesas, contas bancárias, fluxo de caixa, conciliação).
   - Gestão contábil e fiscal (DRE, balanço patrimonial, contas a pagar, contas a receber, regime de caixa/competência, MEI, notas fiscais, centros de custo, categorias).
   - Investimentos, patrimônio e planejamento (renda fixa, renda variável, tesouro, alocação de carteira, perfil de risco, metas financeiras).
   - Uso, configuração, tutoriais e navegação na plataforma "Gestor Financeiro".

2. PROIBIÇÃO TOTAL DE ASSUNTOS FORA DE ESCOPO:
   - Você está EXPRESSAMENTE PROIBIDO de responder a perguntas ou pedidos sobre assuntos que não sejam financeiros, contábeis ou da plataforma.
   - Exemplos de temas estritamente PROIBIDOS: culinária/gastronomia (como carnes para churrasco, receitas, restaurantes), esportes, jogos/videogames, fofocas/celebridades, política partidária, entretenimento/filmes, medicina/saúde, viagens de turismo (exceto planejamento financeiro/orçamento de viagem), programação geral ou curiosidades gerais.

3. CONDUTA DIANTE DE PERGUNTAS FORA DO ESCOPO:
   - NUNCA responda à dúvida fora de escopo (JAMAIS dê dicas de carne, receitas, palpites de jogos ou amenidades).
   - Recuse com polidez, objetividade, elegância e postura profissional executiva.
   - Explique que sua especialidade exclusiva como Concierge é a inteligência financeira, contábil, investimentos e o suporte ao Gestor Financeiro.
   - Redirecione o usuário convidando-o a consultar suas finanças (como saldos, despesas, contas a pagar ou investimentos).
   - Exemplo de recusa:
     "Como Concierge e Especialista do **Gestor Financeiro**, minha atuação é estritamente dedicada a **gestão financeira, contabilidade, fluxo de caixa e investimentos**, além do suporte às funcionalidades da nossa plataforma.
     
     Por essa razão, não posso orientar sobre temas fora dessa área (como culinária ou assuntos gerais).
     
     Gostaria de verificar o seu saldo atual, analisar seus maiores gastos deste mês ou consultar os próximos vencimentos de contas?"

DIRETRIZES DE RESPOSTA PARA TEMAS PERMITIDOS:
1. Responda em português brasileiro culto, claro e acolhedor.
2. Use formatação Markdown rica (títulos em negrito com **, listas com bullet points, tabelas quando apropriado e valores monetários em R$).
3. Use os dados financeiros reais fornecidos abaixo sempre que a pergunta envolver saldo, gastos, investimentos, contas a pagar ou situação patrimonial do usuário.
4. Se o usuário perguntar como fazer algo no sistema, forneça um passo a passo simples baseado nos trechos do manual do sistema injetados abaixo.
5. Seja proativo ao indicar insights rápidos quando fizer sentido (por exemplo, economia no mês ou contas próximas do vencimento).

${ragKnowledgeContext || SYSTEM_MANUAL_GUIDELINES}

${onboardingGuidance}

${userDataContext}
`;

    const chatMessages: ChatMessage[] = [
      { role: 'system', content: systemPrompt }
    ];

    // Append prior conversation history if provided
    if (Array.isArray(clientHistory) && clientHistory.length > 0) {
      for (const h of clientHistory.slice(-6)) {
        if (h && (h.role === 'user' || h.role === 'assistant') && typeof h.content === 'string' && h.content.trim()) {
          chatMessages.push({
            role: h.role,
            content: h.content.trim()
          });
        }
      }
    }

    // Append current user message
    chatMessages.push({ role: 'user', content: query.trim() });

    let responseText = '';
    let responseSource = 'azure_foundry';
    let usedModel = `Azure AI Foundry (${deployment})`;
    let suggestedQuestions = [
      'Qual o meu saldo e resumo do mês?',
      'Quais são minhas próximas contas a pagar?',
      'Como estão meus investimentos?'
    ];

    try {
      console.log(`[Concierge] Calling Azure AI Foundry deployment: ${deployment} for user: ${userId}`);
      responseText = await askAzureOpenAI({
        messages: chatMessages,
        temperature: 0.3,
        maxTokens: 1500,
        deployment
      });
      console.log(`[Concierge] Successfully received response from Azure AI Foundry (${deployment})`);
    } catch (aiErr: any) {
      console.error('[Concierge] Azure AI Foundry error:', aiErr?.message || aiErr);
      
      // Intelligent fallback
      responseSource = 'local_engine';
      usedModel = 'Regras Locais de Contingência';
      const saldo = curIncome - curExpense;
      responseText = `**Assistente Gestor Financeiro (Modo de Contingência)**\n\n` +
        `Não foi possível obter resposta em tempo real do modelo Azure Foundry GPT no momento.\n\n` +
        `**Resumo Rápido dos seus Dados:**\n` +
        `• **Saldo em Contas:** ${formatCurrency(accounts.reduce((s, a) => s + a.current_balance, 0))}\n` +
        `• **Receitas do Mês:** ${formatCurrency(curIncome)}\n` +
        `• **Despesas do Mês:** ${formatCurrency(curExpense)}\n` +
        `• **Resultado Operacional:** ${formatCurrency(saldo)}\n\n` +
        `Por favor, tente novamente em instantes para assistência completa com a IA.`;
    }

    res.statusCode = 200;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({
      reply: responseText,
      source: responseSource,
      model: usedModel,
      suggestedQuestions,
      action: topAction || null,
      sessionId: sessionId || `session-${Date.now()}`
    }));
  } catch (e: any) {
    console.error('Agent API Handler Error:', e);
    res.statusCode = 500;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ error: 'agent_error', message: e.message }));
  }
}
