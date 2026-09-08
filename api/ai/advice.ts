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
    let provider = 'gestor_financeiro';
    let usedModel = 'Gestor Financeiro Intelligence Engine';

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
  1. P/VP (Preço sobre Valor Patrimonial): ${simData.pvp ? simData.pvp : 'Aprox. 0.98'} (P/VP < 0.98 indica desconto patrimonial; P/VP > 1.05 indica ágio perigoso).
  2. Preço Teto de FII (Spread sobre NTN-B: taxa de desconto de 8.75% a.a.): ${simData.fiiCeilingPrice > 0 ? formatCurrency(simData.fiiCeilingPrice) : 'n/d'}.
  3. Dividend Yield 12M: ${dy.toFixed(2)}%.
  4. Tipo de Ativo: Analise se o fundo é de Tijolo (Logística, Lajes Corporativas, Shoppings) ou de Papel (CRIs).
  5. Riscos do Setor: Vacância física e financeira (se tijolo), inadimplência de devedores / indexador IPCA/CDI (se papel), risco de diluição por novas emissões de cotas abaixo do VP e fatos relevantes recentes.

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
    res.end(JSON.stringify(transaction ? { text, transaction } : { text }));
  } catch (e: any) {
    console.error('Advice Error:', e);
    res.statusCode = 500;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ error: e?.message || 'error' }));
  }
}
