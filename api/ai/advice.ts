import { parseTransactionFromText } from '../../services/marketDataService';
import { formatCurrency } from '../../utils/formatters';
import { askAzureOpenAI, DEFAULT_MODEL_DEPLOYMENT } from './_azure_openai';
import { verifySession } from '../_auth_shared';
import { getPool } from '../_db';

export default async function handler(req: any, res: any) {
  try {
    if ((req.method || '').toUpperCase() !== 'POST') {
      res.statusCode = 405;
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ error: 'method_not_allowed' }));
      return;
    }

    // Require valid authenticated session to protect OpenAI token quota
    const session = await verifySession(req, res, getPool());
    if (!session) return; // verifySession sets 401 response

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
    let investmentTransaction: any = null;
    let provider = 'gestor_financeiro';
    let usedModel = 'Gestor Financeiro Intelligence Engine';

    try {
      if (kind === 'transaction' || kind === 'payable' || kind === 'receivable') {
        const prompt = `Você é o parser especialista de lançamentos financeiros e contas do Gestor Financeiro.
Analise a mensagem ou comando do usuário e preencha os campos retornando estritamente um objeto JSON com o formato:
{
  "accountId": "ID da conta de origem correspondente da lista de contas ou a mais coerente",
  "toAccountId": "ID da conta de destino se for uma Transferência entre contas ou null",
  "type": "Entrada" | "Saída" | "Transferência",
  "category": "Nome exato da categoria que mais combina da lista fornecida, ou 'Outros'",
  "description": "Descrição limpa do que foi comprado/recebido/pago",
  "amount": número decimal positivo (ex: 45.50),
  "date": "YYYY-MM-DD (resolva termos como 'hoje', 'amanhã', 'ontem', 'dia 15' a partir da data de referência)",
  "paymentMethod": "PIX" | "Cartão de Crédito" | "Cartão de Débito" | "Dinheiro" | "Transferência Bancária" | "Boleto" | "Outros",
  "costCenterId": "ID do centro de custo se aplicável ou null",
  "supplier": "Nome do fornecedor ou favorecido se mencionado ou null",
  "customer": "Nome do cliente ou pagador se mencionado ou null",
  "installments": número inteiro de parcelas se mencionado (ex: 1, 3, 10) ou 1
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
          toAccountId: parsed.toAccountId || undefined,
          type: parsed.type === 'Transferência' ? 'Transferência' : (parsed.type === 'Entrada' ? 'Entrada' : 'Saída'),
          category: parsed.category || (parsed.type === 'Transferência' ? 'Transferência' : 'Outros'),
          description: parsed.description || txCtxObj.text,
          amount: Number(parsed.amount) || 0,
          date: parsed.date || txCtxObj.today,
          paymentMethod: parsed.paymentMethod || 'PIX',
          costCenterId: parsed.costCenterId || undefined,
          supplier: parsed.supplier || undefined,
          customer: parsed.customer || undefined,
          installments: Number(parsed.installments) || 1,
        };
      } else if (kind === 'investment_transaction') {
        const prompt = `Você é o parser especialista de operações de investimentos do Gestor Financeiro.
Analise a mensagem ou comando falado pelo usuário e preencha os dados da operação de investimento retornando estritamente um objeto JSON com o formato:
{
  "assetType": "Ações" | "Fundos Imobiliários" | "Renda Fixa" | "Criptomoedas" | "BDRs" | "ETFs",
  "operation": "buy" | "sell" | "dividend",
  "ticker": "Código do ativo em maiúsculo (ex: PETR4, MXRF11, BTC, IVVB11, AAPL34) ou vazio se Renda Fixa",
  "name": "Nome descritivo do ativo (ex: CDB Banco Inter, Tesouro Selic 2029, Petrobras)",
  "issuer": "Emissor caso seja Renda Fixa (ex: Banco Inter, Tesouro Nacional) ou vazio",
  "quantity": número positivo (ex: 10, 50, 0.05) ou 1 se não aplicável,
  "purchasePrice": número decimal do preço unitário em R$ (ex: 35.50, 10.25),
  "amountInvested": número decimal do valor total em R$ (ex: 5000.00),
  "yieldRate": "Taxa de rendimento se for Renda Fixa (ex: 110% CDI, IPCA + 6.5%, 12% a.a.) ou vazio",
  "maturityDate": "Data de vencimento YYYY-MM-DD se informada ou vazia",
  "date": "YYYY-MM-DD (data da operação a partir da referência)",
  "paymentMethod": "Saldo Corretora" | "Saldo Conta" | "PIX" | "Transferência Bancária" | "Outros"
}

Data de Referência: ${String(ctx.today || new Date().toISOString().split('T')[0])}
Texto Falado pelo Usuário: "${questionRaw || String(ctx.text || '')}"`;

        const rawJson = await askAzureOpenAI({
          messages: [
            { role: 'system', content: 'Você é um assistente estrito de extração JSON de investimentos. Retorne apenas JSON válido.' },
            { role: 'user', content: prompt }
          ],
          jsonMode: true,
          temperature: 0.1,
        });

        const parsed = JSON.parse(rawJson);
        const qty = Number(parsed.quantity) || 0;
        const price = Number(parsed.purchasePrice) || 0;
        const total = Number(parsed.amountInvested) || (qty > 0 && price > 0 ? qty * price : 0);

        investmentTransaction = {
          assetType: parsed.assetType || 'Ações',
          operation: parsed.operation || 'buy',
          ticker: String(parsed.ticker || '').toUpperCase().trim(),
          name: String(parsed.name || parsed.ticker || '').trim(),
          issuer: String(parsed.issuer || '').trim(),
          quantity: qty,
          purchasePrice: price,
          amountInvested: total,
          yieldRate: String(parsed.yieldRate || '').trim(),
          maturityDate: parsed.maturityDate || '',
          date: parsed.date || String(ctx.today || new Date().toISOString().split('T')[0]),
          paymentMethod: parsed.paymentMethod || 'Saldo Corretora',
        };
      } else if (kind === 'investment_simulator') {
        const simData = input?.simulation || ctx?.simulation || {};
        const targetTicker = String(simData.ticker || questionRaw || '').toUpperCase();
        const targetAmount = Number(simData.amount || 0);
        const currentPrice = Number(simData.price || 0);
        const bazinPrice = Number(simData.bazinPrice || 0);
        const grahamPrice = Number(simData.grahamPrice || 0);
        const dy = Number(simData.dividendYield || 0);
        const portfolio = Array.isArray(ctx.assets) ? ctx.assets : [];
        const totalInvested = Number(ctx.totalInvested || 0);
        const newTotal = totalInvested + targetAmount;

        const currentAsset = portfolio.find((a: any) => String(a.ticker).toUpperCase() === targetTicker);
        const currentAssetTotal = Number(currentAsset?.total || currentAsset?.currentValue || (Number(currentAsset?.quantity || 0) * currentPrice));
        const newAssetTotal = currentAssetTotal + targetAmount;
        const currentPercent = totalInvested > 0 ? ((currentAssetTotal / totalInvested) * 100).toFixed(1) : '0.0';
        const newPercent = newTotal > 0 ? ((newAssetTotal / newTotal) * 100).toFixed(1) : '100.0';

        const broadEtfs = ['BOVA11', 'SMAL11', 'IVVB11', 'HASH11', 'XINA11', 'GOLD11', 'DIVO11', 'BBSD11', 'SPXI11', 'BRAX11'];
        const isCrypto = ['BTC', 'ETH', 'SOL', 'BTCBRL', 'ETHBRL', 'SOLBRL', 'XRP', 'ADA', 'BNB'].includes(targetTicker) || /(BTC|ETH|SOL|USDT|USDC)/i.test(targetTicker);
        const isFii = targetTicker.endsWith('11') && !broadEtfs.includes(targetTicker);
        const assetType = isCrypto ? 'Criptomoeda' : isFii ? 'Fundo Imobiliário (FII)' : 'Ação';

        let prompt = '';
        if (isFii) {
          prompt = `Você é o Gestor Financeiro, inteligência especialista em Fundos Imobiliários (FIIs) e Alocação Estratégica.
Nunca mencione OpenAI, Azure, GPT, Foundry ou provedores externos.
O usuário está avaliando aportar no Fundo Imobiliário ${targetTicker}.

CRITÉRIO OBRIGATÓRIO DE FII:
- NUNCA mencione Graham (inaplicável a FIIs, pois FIIs distribuem 95% do caixa e não retêm lucro líquido).
- NUNCA use o Bazin clássico de 6% (inadequado para o custo de oportunidade brasileiro, onde a NTN-B paga mais de 6% real).
- As métricas fundamentais de FIIs são:
  1. P/VP (Preço sobre Valor Patrimonial): ${simData.pvp ? Number(simData.pvp).toFixed(2) : 'n/d'} (P/VP < 1.00 indica desconto patrimonial em relação ao laudo; P/VP > 1.05 indica ágio).
  2. Preço Teto de FII (Spread sobre NTN-B: taxa de desconto de 8.75% a.a.): ${simData.fiiCeilingPrice > 0 ? formatCurrency(simData.fiiCeilingPrice) : 'n/d'}.
  3. Preço Teto Bazin Clássico (DY min 6%): ${simData.bazinPrice > 0 ? formatCurrency(simData.bazinPrice) : 'n/d'}.
  4. Dividend Yield 12M: ${dy.toFixed(2)}%.
  5. Tipo de Ativo: Analise se o fundo é de Tijolo (Logística, Lajes Corporativas, Shoppings) ou de Papel (CRIs).
  6. Riscos do Setor: Vacância física e financeira (se tijolo), inadimplência de devedores / indexador IPCA/CDI (se papel), risco de diluição por novas emissões de cotas abaixo do VP e fatos relevantes recentes.

Dados do Aporte:
- Ativo: ${targetTicker} (${assetType})
- Cotação Atual: ${formatCurrency(currentPrice)}
- Valor a Aportar: ${formatCurrency(targetAmount)}
- Impacto na Carteira: Concentração em ${targetTicker} vai de ${currentPercent}% para ${newPercent}%.

Instruções da Análise:
Gere uma análise executiva estruturada contendo:
1. **Veredito Claro:** (COMPRA RECOMENDADA, COMPRA PARCIAL/MODERADA ou AGUARDAR MELHOR PONTO).
2. **Avaliação Fundamentalista do FII:** Analise o P/VP, o Dividend Yield comparado ao custo de oportunidade e o preço teto ajustado.
3. **Análise de Qualidade & Fatos Relevantes:** Trate da natureza do fundo (papel vs tijolo), risco de vacância/crédito e emissões.
4. **Análise de Concentração & Risco:** Em FIIs, a concentração prudente recomendada é de no máximo 5% a 8% do patrimônio por fundo. Avalie os ${newPercent}%.
5. **Plano Tático de Entrada:** Sugestão prática (comprar agora, fracionar ordens ou aguardar deságio).`;
        } else if (isCrypto) {
          prompt = `Você é o Gestor Financeiro, inteligência especialista em Criptoativos, Macroeconomia e Gestão de Risco.
Nunca mencione OpenAI, Azure, GPT, Foundry ou provedores externos.
O usuário está avaliando aportar no criptoativo ${targetTicker}.

CRITÉRIO OBRIGATÓRIO DE CRIPTO:
- Criptoativos NÃO possuem balanço contábil, dividendos, LPA, VPA, Graham ou Bazin. NUNCA mencione dividendos, Bazin ou Graham para Cripto.
- As métricas fundamentais para Criptoativos são:
  1. Tese do Ativo: Papel no ecossistema (ex: Bitcoin como reserva de valor digital/ouro digital descentralizado; Ethereum como plataforma líder de contratos inteligentes e DeFi; etc.).
  2. Ciclo de Mercado: Posição no ciclo de 4 anos do mercado (halving do Bitcoin, fases de acumulação, bear/bull market).
  3. Volatilidade e Drawdown: Variações bruscas de preço e correções recentes.
  4. Gestão de Risco Extrema: Exposição máxima prudente em cripto é de **2% a 5% da carteira total** (no máximo 10% para perfis estritamente arrojados). Se o novo aporte fizer a concentração ultrapassar 5%, emita um alerta severo de superconcentração de risco.

Dados do Aporte:
- Ativo: ${targetTicker} (${assetType})
- Cotação Atual: ${formatCurrency(currentPrice)}
- Valor a Aportar: ${formatCurrency(targetAmount)}
- Impacto na Carteira: Concentração em ${targetTicker} vai de ${currentPercent}% para ${newPercent}%.

Instruções da Análise:
Gere uma análise executiva estruturada contendo:
1. **Veredito Claro:** (ACÚMULO RECOMENDADO, ACÚMULO MODERADO ou AGUARDAR CORREÇÃO).
2. **Tese do Ativo & Ciclo:** Análise da tese do criptoativo e momento macro/ciclo.
3. **Análise de Risco & Alocação:** Avalie severamente o percentual de ${newPercent}% na carteira frente ao limite seguro de 2% a 5%.
4. **Plano Tático de Entrada:** Estratégia de Dollar-Cost Averaging (DCA) com compras fracionadas para suavizar a volatilidade.`;
        } else {
          // Ações (Stocks)
          prompt = `Você é o Gestor Financeiro, inteligência especialista em Análise de Ações e Valuation Fundamentalista.
Nunca mencione OpenAI, Azure, GPT, Foundry ou provedores externos.
O usuário está avaliando realizar um novo aporte na ação ${targetTicker}.

Dados do Aporte Pretendido:
- Ativo: ${targetTicker} (Ação B3)
- Cotação Atual: ${formatCurrency(currentPrice)}
- Valor a Aportar: ${formatCurrency(targetAmount)}
- Preço Justo de Graham: ${grahamPrice > 0 ? formatCurrency(grahamPrice) : 'n/d'}
- Preço Teto Bazin (DY min 6%): ${bazinPrice > 0 ? formatCurrency(bazinPrice) : 'n/d'}
- Dividend Yield 12M: ${dy.toFixed(2)}%
- Impacto na Carteira: Concentração em ${targetTicker} de ${currentPercent}% para ${newPercent}%.

Instruções da Análise:
Gere uma análise executiva estruturada contendo:
1. **Veredito Claro:** (COMPRA RECOMENDADA, COMPRA PARCIAL/MODERADA ou AGUARDAR MELHOR PONTO).
2. **Valuation Fundamentalista:** Análise de margem de segurança de Graham e Preço Teto Bazin.
3. **Qualidade do Negócio & Moat:** Vantagem competitiva, histórico de geração de caixa e setor de atuação.
4. **Análise de Risco & Concentração:** Exposição máxima prudente de 15% a 20% por empresa.
5. **Plano Tático de Entrada:** Sugestão prática de execução (comprar a mercado, fracionar ordens ou aguardar correção).`;
        }

        text = await askAzureOpenAI({
          messages: [
            { role: 'system', content: 'Você é o Gestor Financeiro, inteligência proprietária da plataforma. Seja técnico, objetivo e direto ao ponto com formatação elegante em markdown. Nunca mencione terceiros, OpenAI, Azure, GPT ou provedores externos.' },
            { role: 'user', content: prompt }
          ],
          temperature: 0.3,
        });
      } else if (kind === 'investment') {
        const prompt = `Você é a inteligência de investimentos do Gestor Financeiro. Analise a carteira do usuário e gere recomendações claras e prescritivas:
- Diagnóstico da carteira e alocação atual vs perfil informado.
- Sugestões práticas de rebalanceamento (Renda Fixa, FIIs, Ações, Ativos Internacionais).
- Pontos de atenção sobre diversificação e risco.

Contexto da Carteira:
${investCtx}`;

        text = await askAzureOpenAI({
          messages: [
            { role: 'system', content: 'Você é o Gestor Financeiro, especialista em alocação patrimonial. Fale em português de forma clara, direta e orientada a dados. Nunca mencione provedores externos.' },
            { role: 'user', content: prompt }
          ],
          temperature: 0.4,
        });
      } else if (kind === 'accounting_audit') {
        const accData = input?.accounting || ctx?.accounting || {};
        const monthRef = String(accData.month || new Date().toISOString().slice(0, 7));
        const grossRev = Number(accData.grossRevenue || 0);
        const cogs = Number(accData.cogs || 0);
        const grossProfit = Number(accData.grossProfit || (grossRev - cogs));
        const opExp = Number(accData.operatingExpenses || 0);
        const netProfit = Number(accData.netProfit || (grossProfit - opExp));
        const grossMargin = grossRev > 0 ? ((grossProfit / grossRev) * 100).toFixed(1) : '0.0';
        const netMargin = grossRev > 0 ? ((netProfit / grossRev) * 100).toFixed(1) : '0.0';
        const topCategories = Array.isArray(accData.topCategories)
          ? accData.topCategories.map((c: any) => `- ${c[0]}: ${formatCurrency(Number(c[1]))}`).join('\n')
          : 'n/d';

        const prompt = `Você é o Diretor Contábil e Auditor Financeiro Sênior do Gestor Financeiro (Padrão CFC / IFRS / CPC).
Nunca mencione OpenAI, Azure, GPT ou provedores de nuvem.
Analise a Demonstração do Resultado do Exercício (DRE) gerencial referente ao período de ${monthRef} e elabore um PARECER CONTÁBIL EXECUTIVO rigoroso, elegante e orientativo.

Dados da DRE Gerencial:
- Mês de Referência: ${monthRef}
- Receita Bruta Operacional: ${formatCurrency(grossRev)}
- Custos Operacionais / CPV: ${formatCurrency(cogs)}
- Lucro Bruto: ${formatCurrency(grossProfit)} (Margem Bruta: ${grossMargin}%)
- Despesas Operacionais Gerais e Administrativas: ${formatCurrency(opExp)}
- Lucro Líquido do Período: ${formatCurrency(netProfit)} (Margem Líquida: ${netMargin}%)
- Maiores Despesas por Categoria:
${topCategories}

Estrutura Obrigatória do Parecer Executivo:
1. **Diagnóstico Contábil de Eficiência:** Avaliação da qualidade das margens (bruta e líquida) frente às boas práticas de mercado.
2. **Análise de Estrutura de Custos & Ponto de Equilíbrio (Break-Even):** Avalie a proporção de despesas operacionais frente à receita e se há alavancagem operacional saudável.
3. **Identificação de Vulnerabilidades e Ralos de Caixa:** Destaque as categorias que mais pesaram no resultado.
4. **Plano de Ação Tático (3 Recomendações Imediatas):** Passos objetivos para expansão de margem de lucro líquido e conformidade tributária/contábil.`;

        text = await askAzureOpenAI({
          messages: [
            { role: 'system', content: 'Você é o Gestor Financeiro, inteligência contábil e de auditoria gerencial. Seja extremamente técnico, executivo, analítico e elegante em formatação markdown.' },
            { role: 'user', content: prompt }
          ],
          temperature: 0.3,
        });
      } else if (kind === 'cashflow_contingency') {
        const cfData = input?.cashflow || ctx?.cashflow || {};
        const days = Number(cfData.daysHorizon || 60);
        const curBal = Number(cfData.currentBalance || 0);
        const minBal = Number(cfData.minBalance || 0);
        const minDate = String(cfData.minBalanceDate || '');
        const burnRate = Number(cfData.burnRateMonthly || 0);
        const runway = String(cfData.runwayMonths || '—');
        const projIn = Number(cfData.totalProjectedInflow || 0);
        const projOut = Number(cfData.totalProjectedOutflow || 0);
        const hasDeficit = minBal < 0;

        const prompt = `Você é o Diretor de Tesouraria e Planejamento Financeiro (CFO) do Gestor Financeiro.
Nunca mencione OpenAI, Azure, GPT ou provedores de nuvem.
Analise o horizonte preditivo de fluxo de caixa (${days} dias) e elabore um PLANO DE CONTINGÊNCIA & PROTEÇÃO DE LIQUIDEZ objetivo, tático e prioritário.

Dados da Projeção de Caixa:
- Saldo em Caixa Atual: ${formatCurrency(curBal)}
- Horizonte Analisado: ${days} dias
- Menor Saldo Projetado (Vale de Caixa): ${formatCurrency(minBal)} previsto para ${minDate}
- Queima Mensal Histórica (Burn Rate): ${formatCurrency(burnRate)}/mês
- Autonomia Financeira (Runway): ${runway} meses
- Entradas Agendadas no Período: ${formatCurrency(projIn)}
- Saídas Agendadas + Despesas Recorrentes: ${formatCurrency(projOut)}
- Situação de Liquidez: ${hasDeficit ? 'ALERTA CRÍTICO: Risco iminente de saldo negativo / insolvência temporária.' : 'EQUILIBRADO: Saldo positivo projetado com folga de liquidez.'}

Estrutura Obrigatória da Resposta (Markdown elegante e direto):
1. **Diagnóstico Executivo do Vale de Caixa:** Avaliação do ponto de inflexão e risco real de quebra de liquidez no dia ${minDate}.
2. **Plano de Blindagem Imediata (3 Ações Táticas):** Ações práticas como antecipação seletiva de contas a receber, repactuação de prazos com fornecedores ou contingenciamento de gastos discricionários.
3. **Recomendação Estratégica de Runway:** Como recompor a reserva operacional de liquidez para atingir pelo menos 6 meses de cobertura segura.`;

        text = await askAzureOpenAI({
          messages: [
            { role: 'system', content: 'Você é o Diretor de Tesouraria do Gestor Financeiro. Seja extremamente pragmático, numérico, focado em proteção de caixa e sem enrolação.' },
            { role: 'user', content: prompt }
          ],
          temperature: 0.3,
        });
      } else if (kind === 'subscription_optimization') {
        const subData = input?.subscriptions || ctx?.subscriptions || {};
        const totalAnnual = Number(subData.annualProjected || 0);
        const totalMonthly = Number(subData.monthlyTotal || 0);
        const items = Array.isArray(subData.items) ? subData.items : [];
        const leaks = Array.isArray(subData.leaks) ? subData.leaks : [];

        const itemsList = items.map((s: any) => `- ${s.name} (${s.category}): ${formatCurrency(Number(s.monthlyAmount || 0))}/mês (Anual: ${formatCurrency(Number(s.annualProjected || 0))})${s.driftPct ? ` [Reajuste: +${Number(s.driftPct).toFixed(1)}%]` : ''}`).join('\n');
        const leaksList = leaks.length > 0 ? leaks.map((l: any) => `- ${l.name}: ${formatCurrency(Number(l.monthlyAmount || 0))}/mês`).join('\n') : 'Nenhum vazamento tarifário detectado.';

        const prompt = `Você é o Auditor de Custos Fixos e Eficiência Operacional do Gestor Financeiro.
Nunca mencione OpenAI, Azure, GPT ou provedores de nuvem.
Analise a carteira de assinaturas, serviços recorrentes (SaaS, streaming, telecom) e tarifas bancárias e elabore um PLANO DE REDUÇÃO DE FUGAS DE CAPITAL.

Dados dos Custos Recorrentes:
- Custo Mensal Total: ${formatCurrency(totalMonthly)}
- Dreno Anual Projetado: ${formatCurrency(totalAnnual)}
- Fugas e Tarifas Bancárias Detectadas:
${leaksList}

- Assinaturas & Serviços Rastreados:
${itemsList || 'Nenhuma assinatura específica.'}

Estrutura Obrigatória da Resposta (Markdown):
1. **Auditoria de Desperdícios & Fugas:** Diagnóstico das tarifas bancárias, assinaturas duplicadas ou serviços com reajustes abusivos.
2. **Potencial de Economia Imediata:** Estimativa de economia mensal e anual aplicando eliminação de tarifas e consolidação de ferramentas.
3. **Roteiro de Ação & Minuta de Negociação:** 
   - Ações imediatas de cancelamento (isenção de cesta bancária conforme Resolução Bacen 3.919 - Serviços Essenciais).
   - Script direto para renegociação de planos de telecom ou SaaS com desconto de fidelidade.`;

        text = await askAzureOpenAI({
          messages: [
            { role: 'system', content: 'Você é o Auditor de Custos do Gestor Financeiro. Seja analítico, estratégico e focado em corte de desperdícios.' },
            { role: 'user', content: prompt }
          ],
          temperature: 0.3,
        });
      } else {
        const prompt = `Você é o advisor financeiro do Gestor Financeiro.
Analise a saúde financeira do usuário no mês atual e forneça:
1. **Diagnóstico do Mês:** Avaliação do saldo, receitas, despesas e taxa de poupança.
2. **Alertas & Atenção:** Destaque se alguma categoria ou centro de custo está consumindo mais de 25% da receita.
3. **Ações Práticas Recomendadas:** 3 passos objetivos para maximizar sobras e liquidez.

Contexto Financeiro:
${financeCtx}`;

        text = await askAzureOpenAI({
          messages: [
            { role: 'system', content: 'Você é o Gestor Financeiro. Nunca mencione provedores externos, OpenAI ou Azure. Fale em português de forma clara e profissional.' },
            { role: 'user', content: prompt }
          ],
          temperature: 0.4,
        });
      }
    } catch (aiErr: any) {
      console.warn('[Azure AI] Fallback triggered:', aiErr?.message);
      if (kind === 'transaction') {
        const categories = Array.isArray(ctx.categories) ? ctx.categories.map((c: any) => c.name || c) : [];
        const accounts = Array.isArray(ctx.accounts) ? ctx.accounts : [];
        transaction = await parseTransactionFromText(questionRaw, categories, accounts);
        text = JSON.stringify(transaction || {});
      } else {
        text = `**Diagnóstico Financeiro**\n\n- Saldo Atual: ${formatCurrency(Number(ctx.totalBalance || 0))}\n- Receitas: ${formatCurrency(Number(ctx.monthIncome || 0))}\n- Despesas: ${formatCurrency(Number(ctx.monthExpense || 0))}\n\n*Inteligência do Gestor Financeiro temporariamente indisponível.*`;
      }
    }

    res.statusCode = 200;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify(transaction ? { text, transaction } : investmentTransaction ? { text, investment: investmentTransaction } : { text }));
  } catch (e: any) {
    console.error('Advice Error:', e);
    res.statusCode = 500;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ error: e?.message || 'error' }));
  }
}
