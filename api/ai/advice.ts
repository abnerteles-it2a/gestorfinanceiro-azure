import { parseTransactionFromText } from '../../services/marketDataService';
import { formatCurrency } from '../../utils/formatters';
import { askAzureOpenAI, DEFAULT_MODEL_DEPLOYMENT } from './_azure_openai';

export default async function handler(req: any, res: any) {
  try {
    if ((req.method || '').toUpperCase() !== 'POST') {
      res.statusCode = 405;
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ error: 'method_not_allowed' }));
      return;
    }

    let input: any = {};
    if (req.body && typeof req.body === 'object') {
      input = req.body;
    } else {
      let body = '';
      await new Promise<void>((resolve) => {
        req.on('data', (c: any) => { body += c; });
        req.on('end', resolve);
      });
      input = body ? JSON.parse(body) : {};
    }

    const ctx = input?.context || {};
    const kind = String(input?.kind || 'finance');
    const questionRaw = String(input?.question || input?.query || ctx?.text || '').trim();

    const accLines = Array.isArray(ctx.accounts)
      ? ctx.accounts.map((a: any) => `${String(a.name || a.bank || a.id)}: ${formatCurrency(Number(a.balance || a.currentBalance || 0))}`)
      : [];
    const catLines = Array.isArray(ctx.categories)
      ? ctx.categories.map((c: any) => `${String(c.name || c.id)}: ${formatCurrency(Number(c.total || 0))}`)
      : [];
    const ccLines = Array.isArray(ctx.costCenters)
      ? ctx.costCenters.map((cc: any) => `${String(cc.name || cc.id)}: ${formatCurrency(Number(cc.total || 0))}`)
      : [];
    const monExp = Number(ctx.monthExpense || 0);

    const financeCtx = [
      `Saldo atual: ${formatCurrency(Number(ctx.totalBalance || 0))}`,
      `Receitas mês: ${formatCurrency(Number(ctx.monthIncome || 0))} • Despesas mês: ${formatCurrency(Number(ctx.monthExpense || 0))}`,
      `Taxa de poupança: ${(Number(ctx.savingsRate || 0) * 100).toFixed(1)}%`,
      `Alocação: Fixa ${formatCurrency(Number(ctx.fixedTotal || 0))} • Variável ${formatCurrency(Number(ctx.variableTotal || 0))}`,
      `Top categorias de gastos: ${String(ctx.topCategories || '').trim() || 'n/d'}`,
      accLines.length ? `Contas bancárias:\n${accLines.join('\n')}` : '',
      catLines.length ? `Categorias:\n${catLines.join('\n')}` : '',
      ccLines.length ? `Centros de custos:\n${ccLines.join('\n')}` : '',
    ].filter(Boolean).join('\n');

    const investAlloc = Array.isArray(ctx.allocation) ? ctx.allocation.join('\n') : '';
    const investCtx = [
      `Investido: ${formatCurrency(Number(ctx.totalInvested || 0))} • Valor atual: ${formatCurrency(Number(ctx.portfolioValue || 0))}`,
      `Perfil: ${String(ctx.profile || 'Moderado')}`,
      `Alocação por classe:`,
      investAlloc,
    ].join('\n');

    const txCtxObj = {
      text: questionRaw || String(ctx.text || ''),
      today: String(ctx.today || new Date().toISOString().split('T')[0]),
      categories: Array.isArray(ctx.categories) ? ctx.categories : [],
      accounts: Array.isArray(ctx.accounts) ? ctx.accounts : [],
      costCenters: Array.isArray(ctx.costCenters) ? ctx.costCenters : [],
    };

    let text = '';
    let transaction: any = null;
    let provider = 'azure_ai_foundry';
    let usedModel = DEFAULT_MODEL_DEPLOYMENT;

    try {
      if (kind === 'transaction') {
        const prompt = `Você é o parser especialista de lançamentos financeiros do Gestor Financeiro.
Analise a mensagem ou comando do usuário e preencha os campos da transação retornando estritamente um objeto JSON com o formato:
{
  "accountId": "ID da conta correspondente da lista de contas ou a mais coerente",
  "type": "Entrada" ou "Saída",
  "category": "Nome exato da categoria que mais combina da lista fornecida, ou 'Outros'",
  "description": "Descrição limpa do que foi comprado/recebido",
  "amount": número decimal positivo (ex: 45.50),
  "date": "YYYY-MM-DD (resolva termos como 'hoje', 'ontem' a partir da data de referência)",
  "paymentMethod": "PIX" | "Cartão de Crédito" | "Cartão de Débito" | "Dinheiro" | "Transferência Bancária" | "Boleto" | "Outros",
  "costCenterId": "ID do centro de custo se aplicável ou null"
}

Dados de Referência:
${JSON.stringify(txCtxObj, null, 2)}
Texto do Usuário: "${txCtxObj.text}"`;

        const rawJson = await askAzureOpenAI({
          messages: [
            { role: 'system', content: 'Você é um assistente estrito de extração JSON financeiro. Retorne apenas JSON válido.' },
            { role: 'user', content: prompt }
          ],
          jsonMode: true,
          temperature: 0.1,
        });

        const parsed = JSON.parse(rawJson);
        transaction = {
          accountId: parsed.accountId || (txCtxObj.accounts[0]?.id ? String(txCtxObj.accounts[0].id) : ''),
          type: parsed.type === 'Entrada' ? 'Entrada' : 'Saída',
          category: parsed.category || 'Outros',
          description: parsed.description || txCtxObj.text,
          amount: Number(parsed.amount) || 0,
          date: parsed.date || txCtxObj.today,
          paymentMethod: parsed.paymentMethod || 'PIX',
          costCenterId: parsed.costCenterId || undefined,
        };
        text = `Transação identificada: ${transaction.type} de ${formatCurrency(transaction.amount)} em "${transaction.category}" (${transaction.description}).`;
      } else if (kind === 'investment') {
        const prompt = `Você é o Consultor de Investimentos do Gestor Financeiro. Analise a carteira do usuário e gere recomendações claras e prescritivas:
- Diagnóstico da carteira e alocação atual vs perfil informado.
- Sugestões práticas de rebalanceamento (Renda Fixa, FIIs, Ações, Ativos Internacionais).
- Pontos de atenção sobre diversificação e risco.

Contexto da Carteira:
${investCtx}`;

        text = await askAzureOpenAI({
          messages: [
            { role: 'system', content: 'Você é um especialista sênior em investimentos (CFA/CEA). Fale em português de forma clara, direta e motivadora.' },
            { role: 'user', content: prompt }
          ],
          temperature: 0.4,
        });
      } else {
        // kind === 'finance'
        const prompt = `Você é o CFO Virtual / Advisor Financeiro do Gestor Financeiro.
Analise a saúde financeira do usuário no mês atual e forneça:
1. **Diagnóstico do Mês:** Avaliação do saldo, receitas, despesas e taxa de poupança.
2. **Alertas & Atenção:** Destaque se alguma categoria ou centro de custo está consumindo mais de 25% da receita.
3. **Plano de Ação Acionável:** 2 a 3 conselhos diretos e práticos para maximizar a economia ou investir com sabedoria.

Contexto Financeiro:
${financeCtx}`;

        text = await askAzureOpenAI({
          messages: [
            { role: 'system', content: 'Você é o CFO do usuário. Responda em português com formatação limpa em markdown, direto ao ponto.' },
            { role: 'user', content: prompt }
          ],
          temperature: 0.3,
        });
      }
    } catch (aiErr: any) {
      console.warn('[Azure AI] Falha ao consultar Azure OpenAI. Ativando fallback local:', aiErr?.message);
      provider = 'local_fallback';
      usedModel = 'Local Rules Engine';

      if (kind === 'transaction') {
        const categories = Array.isArray(ctx.categories) ? ctx.categories.map((c: any) => c.name || c) : [];
        const accounts = Array.isArray(ctx.accounts) ? ctx.accounts : [];
        transaction = await parseTransactionFromText(questionRaw, categories, accounts);
        text = JSON.stringify(transaction || {});
      } else {
        text = `**Diagnóstico Financeiro (Offline)**\n\n- Saldo Atual: ${formatCurrency(Number(ctx.totalBalance || 0))}\n- Receitas: ${formatCurrency(Number(ctx.monthIncome || 0))}\n- Despesas: ${formatCurrency(Number(ctx.monthExpense || 0))}\n\n*Conexão com Azure AI Foundry em configuração.*`;
      }
    }

    res.statusCode = 200;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify(transaction ? { text, transaction, provider, model: usedModel } : { text, provider, model: usedModel }));
  } catch (e: any) {
    console.error('Advice Error:', e);
    res.statusCode = 500;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ error: e?.message || 'error' }));
  }
}
