import type { IncomingMessage, ServerResponse } from 'http';
import { parseTransactionFromText } from '../../services/marketDataService';
import { formatCurrency } from '../../utils/formatters';
const getProject = (): string => String(process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT || '');
const getLocation = (): string => String(process.env.GOOGLE_VERTEX_LOCATION || 'us-central1');
const getModel = (): string => String(process.env.GOOGLE_VERTEX_MODEL || 'gemini-2.5-flash');

export default async function handler(req: any, res: any) {
  try {
    try {
      const fs = await import('fs');
      const path = `${process.cwd()}/.env.local`;
      if (fs.existsSync(path)) {
        const raw = fs.readFileSync(path, 'utf-8');
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
    if ((req.method || '').toUpperCase() !== 'POST') {
      res.statusCode = 405;
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ error: 'method_not_allowed' }));
      return;
    }
    let input: any = {};
    if (req.body) {
      input = req.body;
      console.log('[DEBUG] Advice request body (pre-parsed):', JSON.stringify(input));
    } else {
      let body = '';
      await new Promise<void>((resolve) => { req.on('data', (c: any) => { body += c; }); req.on('end', resolve); });
      console.log('[DEBUG] Advice request body:', body);
      input = body ? JSON.parse(body) : {};
    }
    const ctx = input?.context || {};
    const kind = String(input?.kind || 'finance');
    const project = getProject();
    const location = getLocation();
    const modelId = getModel();
    const accLines = Array.isArray((ctx as any).accounts) ? ((ctx as any).accounts as any[]).map(a => `${String((a.name || a.bank || a.id))}: ${formatCurrency(Number((a.balance || a.currentBalance || 0)))}`) : [];
    const catLines = Array.isArray((ctx as any).categories) ? ((ctx as any).categories as any[]).map(c => `${String((c.name || c.id))}: ${formatCurrency(Number((c.total || 0)))}`) : [];
    const ccLines = Array.isArray((ctx as any).costCenters) ? ((ctx as any).costCenters as any[]).map(cc => `${String((cc.name || cc.id))}: ${formatCurrency(Number((cc.total || 0)))}`) : [];
    const monExp = Number((ctx as any).monthExpense || 0);
    const topCatMonthlyLines = Array.isArray((ctx as any).categories)
      ? ((ctx as any).categories as any[])
          .slice()
          .sort((a, b) => Number(b?.total || 0) - Number(a?.total || 0))
          .slice(0, 3)
          .map(c => {
            const tot = Number(c?.total || 0);
            const pctVal = monExp > 0 ? (tot / monExp * 100) : 0;
            const pct = monExp > 0 ? ` — ${pctVal.toFixed(1)}% do mês` : '';
            const prefix = pctVal >= 25 ? '**- ' : '- ';
            const alert = pctVal >= 25 ? ' !' : '';
            return `${prefix}${String(c?.name || c?.id)}: ${formatCurrency(tot)}${pct}${alert}`;
          })
      : [];
    const topCcMonthlyLines = Array.isArray((ctx as any).costCenters)
      ? ((ctx as any).costCenters as any[])
          .slice()
          .sort((a, b) => Number(b?.total || 0) - Number(a?.total || 0))
          .slice(0, 3)
          .map(cc => {
            const tot = Number(cc?.total || 0);
            const pctVal = monExp > 0 ? (tot / monExp * 100) : 0;
            const pct = monExp > 0 ? ` — ${pctVal.toFixed(1)}% do mês` : '';
            const prefix = pctVal >= 25 ? '**- ' : '- ';
            const alert = pctVal >= 25 ? ' !' : '';
            return `${prefix}${String(cc?.name || cc?.id)}: ${formatCurrency(tot)}${pct}${alert}`;
          })
      : [];
    const financeCtx = [
      `Saldo atual: ${formatCurrency(Number(ctx.totalBalance || 0))}`,
      `Receitas mês: ${formatCurrency(Number(ctx.monthIncome || 0))} • Despesas mês: ${formatCurrency(Number(ctx.monthExpense || 0))}`,
      `Receitas totais: ${formatCurrency(Number(ctx.income || 0))} • Despesas totais: ${formatCurrency(Number(ctx.expenses || 0))}`,
      `Taxa de poupança: ${(Number(ctx.savingsRate || 0) * 100).toFixed(1)}%`,
      `Alocação: Fixa ${formatCurrency(Number(ctx.fixedTotal || 0))} • Variável ${formatCurrency(Number(ctx.variableTotal || 0))}`,
      `Top categorias de gastos: ${String(ctx.topCategories || '').trim() || 'n/d'}`,
      (topCatMonthlyLines.length || topCcMonthlyLines.length) ? `**Resumo mensal**` : '',
      topCatMonthlyLines.length ? `Top categorias do mês:\n${topCatMonthlyLines.join('\n')}` : '',
      topCcMonthlyLines.length ? `Top centros de custos do mês:\n${topCcMonthlyLines.join('\n')}` : '',
      accLines.length ? `Contas bancárias:\n${accLines.join('\n')}` : '',
      catLines.length ? `Categorias:\n${catLines.join('\n')}` : '',
      ccLines.length ? `Centros de custos:\n${ccLines.join('\n')}` : ''
    ].filter(Boolean).join('\n');
    const investAlloc = Array.isArray(ctx.allocation)
      ? String(ctx.allocation.join('\n'))
      : '';
    const investCtx = [
      `Investido: ${formatCurrency(Number(ctx.totalInvested || 0))} • Valor atual: ${formatCurrency(Number(ctx.portfolioValue || 0))}`,
      `Perfil: ${String(ctx.profile || 'Moderado')}`,
      `Alocação por classe:`,
      investAlloc
    ].join('\n');
    const txCtxObj = {
      text: String(ctx.text || ''),
      today: String(ctx.today || ''),
      categories: Array.isArray(ctx.categories) ? ctx.categories : [],
      accounts: Array.isArray(ctx.accounts) ? ctx.accounts : [],
      costCenters: Array.isArray(ctx.costCenters) ? ctx.costCenters : []
    };
    const txCtx = JSON.stringify(txCtxObj);
    const questionRaw = String(input?.question || input?.query || ctx?.text || '').trim();

    // --- LOCAL OFFLINE MODE (Google Account Blocked) ---
    // If AI_PROVIDER is 'aws', we skip the local offline block and try Bedrock
    console.log('Advice: Checking AI Provider...');
    console.log('AI_PROVIDER:', process.env.AI_PROVIDER);
    const providerEnv = String(process.env.AI_PROVIDER || 'vertex').toLowerCase();
    const isAws = providerEnv === 'aws';
    
    if (!isAws && false) {
        let localText = '';
        if (kind === 'finance') {
            localText = `**Análise Financeira (Modo Offline)**\n\n`;
            localText += `**Resumo do Mês:**\n`;
            localText += `- Receitas: R$ ${Number(ctx.monthIncome || 0).toFixed(2)}\n`;
            localText += `- Despesas: R$ ${Number(ctx.monthExpense || 0).toFixed(2)}\n`;
            localText += `- Saldo: R$ ${(Number(ctx.monthIncome || 0) - Number(ctx.monthExpense || 0)).toFixed(2)}\n\n`;
            
            const poup = Number(ctx.savingsRate || 0) * 100;
            localText += `**Taxa de Poupança:** ${poup.toFixed(1)}%\n`;
            if (poup > 20) localText += `✅ Ótimo resultado! Você está poupando bem.\n`;
            else if (poup > 0) localText += `⚠️ Tente aumentar sua poupança para 20%.\n`;
            else localText += `🚨 Atenção: Gastos superaram as receitas.\n`;

        } else if (kind === 'investment') {
            localText = `**Análise de Investimentos (Modo Offline)**\n\n`;
            localText += `**Patrimônio:** ${formatCurrency(Number(ctx.totalInvested || 0))}\n`;
            localText += `**Perfil:** ${ctx.profile || 'Moderado'}\n\n`;
            localText += `**Alocação Atual:**\n`;
            if (Array.isArray(ctx.allocation)) {
                localText += ctx.allocation.join('\n');
            } else {
                localText += "Dados de alocação não disponíveis.";
            }
            localText += `\n\n*Nota: Recomendações detalhadas de IA indisponíveis no momento.*`;

        } else if (kind === 'transaction') {
            // Robust Parser using MarketDataService
            const categories = Array.isArray(ctx.categories) ? ctx.categories.map((c: any) => c.name || c) : [];
            const accounts = Array.isArray(ctx.accounts) ? ctx.accounts : [];
            
            let parsed = await parseTransactionFromText(questionRaw, categories, accounts);
            
            if (!parsed) {
                 // Fallback to simple object if parsing fails completely
                 parsed = {
                    accountId: (accounts.length > 0) ? accounts[0].id : 'default',
                    type: 'Saída',
                    category: 'Outros',
                    description: questionRaw,
                    amount: 0,
                    date: new Date().toISOString().split('T')[0],
                    paymentMethod: 'Outros',
                    costCenterId: null
                };
            } else {
                // Ensure accountId is set if not found
                if (!parsed.accountId && accounts.length > 0) {
                    parsed.accountId = accounts[0].id;
                }
            }

            localText = JSON.stringify(parsed);
        } else {
            // Agent / Generic
            localText = "Estou operando em modo offline. Posso ajudar com lançamentos simples e resumos financeiros baseados nos seus dados atuais.";
        }

        res.statusCode = 200;
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ text: localText, provider: 'local_offline' }));
        return;
    }

    const agentPrompt = [
      'Você é um agente de finanças e investimentos brasileiro.',
      'Escopo: finanças pessoais, investimentos, fluxo de caixa, MEI (Microempreendedor Individual), notas fiscais (NFS/NFS-e), tributos e contabilidade simples.',
      'Se a pergunta estiver fora desse escopo, responda educadamente que só atende assuntos financeiros, investimentos e MEI/NFS-e, e sugira um direcionamento adequado.',
      'Responda em português, de forma objetiva e prática, com passos acionáveis quando aplicável.',
      'Se envolver obrigações fiscais/legais, forneça orientações gerais e recomende consultar um contador quando necessário.',
      '',
      questionRaw ? `Pergunta: ${questionRaw}` : 'Pergunta: [vazia] — peça ao usuário para detalhar a dúvida.'
    ].join('\\n');
    const prompt = kind === 'agent'
      ? agentPrompt
      : kind === 'investment'
      ? [
        'Você é um consultor de investimentos brasileiro. Gere uma análise objetiva e prática com:',
        '- Resumo da carteira',
        '- Diagnóstico da alocação e concentração',
        '- Recomendações acionáveis (rebalanceamento, risco, diversificação)',
        '- Observações considerando o perfil informado',
        'Evite jargões excessivos. Responda em português. Formate com seções curtas.',
        '',
        investCtx
      ].join('\n')
      : kind === 'transaction'
      ? [
        'Você é um assistente de lançamentos financeiros.',
        'Receba o texto do usuário e retorne APENAS um JSON com os campos:',
        '{ "accountId": string, "type": "Entrada" | "Saída", "category": string, "description": string, "amount": number, "date": "YYYY-MM-DD", "paymentMethod": string, "costCenterId": string | null }',
        'Regras:',
        '- Use "accounts" e "costCenters" para escolher "accountId" e "costCenterId" pelo melhor nome correspondente. Sempre retorne o id.',
        '- Resolva termos relativos de data usando "today".',
        '- Valor em reais: detectar e converter para número. Se não houver, estimar 0.',
        '- Categoria deve ser uma das opções em "categories"; se não encontrar, use "Outros".',
        '- Método de pagamento: texto livre curto (ex.: PIX, Cartão de Débito).',
        '- Não inclua comentários nem texto fora do JSON.',
        '',
        txCtx
      ].join('\n')
      : [
        'Você é um consultor financeiro brasileiro. Gere uma análise objetiva e prática com:',
        '- Resumo dos números',
        '- Diagnóstico do mês',
        '- Recomendações acionáveis de curto prazo',
        '- Observações de alocação',
        'Evite jargões excessivos. Responda em português. Formate com seções curtas.',
        '',
        financeCtx
      ].join('\n');

    const apiKey = String(process.env.GOOGLE_API_KEY || '');
    const hasInlineCreds = !!process.env.GOOGLE_CREDENTIALS_JSON || (!!process.env.GOOGLE_CLIENT_EMAIL && !!process.env.GOOGLE_PRIVATE_KEY);
    const hasCredPath = !!process.env.GOOGLE_APPLICATION_CREDENTIALS;
    const preferVertex = String(process.env.GOOGLE_PREFER_VERTEX || '').trim() === '1' || (!!project && (hasInlineCreds || hasCredPath));
    let text = '';
    let transaction: any = null;
    let provider = '';
    let usedModel = '';
    let lastError: any = null;

    // --- AWS BEDROCK IMPLEMENTATION ---
    if (isAws) {
        try {
            console.log('Attempting to use AWS Bedrock (Oregon)...');
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
            
            // Construct prompt for Claude (Messages API)
            const payload = {
                anthropic_version: "bedrock-2023-05-31",
                max_tokens: 2048,
                messages: [
                    {
                        role: "user",
                        content: prompt
                    }
                ]
            };
            let lastAwsErr: any = null;
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
                    text = responseBody.content?.[0]?.text || '';
                    if (text) {
                      provider = 'aws_bedrock';
                      usedModel = modelId;
                      console.log('AWS Bedrock success:', usedModel);
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
            if (!text) throw lastAwsErr || new Error('bedrock_no_model_succeeded');

        } catch (awsErr: any) {
            console.error('AWS Bedrock Error:', awsErr);
            lastError = { provider: 'aws_bedrock', message: awsErr.message, name: awsErr.name };
            
            // Fallback to Local Offline if AWS fails
            // (Similar logic to the previous offline block)
            if (kind === 'transaction') {
                 // Reuse local parser logic
                 const categories = Array.isArray(ctx.categories) ? ctx.categories.map((c: any) => c.name || c) : [];
                 const accounts = Array.isArray(ctx.accounts) ? ctx.accounts : [];
                 const parsed = await parseTransactionFromText(questionRaw, categories, accounts);
                 text = JSON.stringify(parsed || {});
                 provider = 'local_fallback_aws_fail';
            } else {
                 text = "Desculpe, o serviço de IA da AWS também está indisponível no momento. (Fallback Local não implementado para este fluxo)";
            }
        }
    }
    
    // Skip Google Logic if we already have text (from AWS) or if explicitly set to AWS
    if (!text && !isAws) {
      if (kind === 'agent' && !questionRaw) {
      res.statusCode = 400;
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ error: 'missing_question' }));
      return;
    }
    if (preferVertex) {
      if (!project) {
        res.statusCode = 400;
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ error: 'missing_project' }));
        return;
      }
      try {
        const { VertexAI } = await import('@google-cloud/vertexai');
        const credsJsonStr = String(process.env.GOOGLE_CREDENTIALS_JSON || '');
        const clientEmailEnv = String(process.env.GOOGLE_CLIENT_EMAIL || '');
        const privateKeyEnv = String(process.env.GOOGLE_PRIVATE_KEY || '');
        const hasInlineCreds = !!credsJsonStr || (!!clientEmailEnv && !!privateKeyEnv);
        const googleAuthOptions = hasInlineCreds ? (() => {
          if (credsJsonStr) {
            const raw = credsJsonStr.trim();
            const unwrap = (s: string) => {
              let v = s.trim();
              if (v.includes('<<-EOT')) v = v.replace(/<<-EOT/g, '').replace(/EOT/g, '').trim();
              if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")) || (v.startsWith('`') && v.endsWith('`'))) v = v.slice(1, -1);
              return v;
            };
            const tryJson = (s: string) => { try { return JSON.parse(s); } catch { return null; } };
            const s1 = unwrap(raw);
            let parsed: any = tryJson(s1);
            if (!parsed) {
              try {
                const decoded = Buffer.from(s1, 'base64').toString('utf-8');
                parsed = tryJson(decoded);
              } catch {}
            }
            if (!parsed) {
              const emailMatch = s1.match(/"client_email"\s*:\s*"([^"]+)"/i);
              const pkMatch = s1.match(/"private_key"\s*:\s*"([\s\S]*?)"/i);
              if (emailMatch && pkMatch) {
                const pkClean = String(pkMatch[1] || '').replace(/\\n/g, '\n').replace(/\r?\n/g, '\n');
                parsed = { client_email: String(emailMatch[1] || ''), private_key: pkClean };
              }
            }
            if (parsed) {
              const pk = String(parsed?.private_key || '').replace(/\\n/g, '\n').replace(/\r?\n/g, '\n');
              return { credentials: { client_email: String(parsed?.client_email || ''), private_key: pk } };
            }
            console.error('Vertex AI: Failed to parse GOOGLE_CREDENTIALS_JSON. Length:', credsJsonStr.length);
          }
          if (clientEmailEnv && privateKeyEnv) {
            const pk = privateKeyEnv.replace(/\\n/g, '\n');
            return { credentials: { client_email: clientEmailEnv, private_key: pk } };
          }
          if (credsJsonStr) throw new Error('invalid_google_credentials_json');
          return undefined;
        })() : undefined;
        const vertex = new VertexAI({ project, location, ...(googleAuthOptions ? { googleAuthOptions } as any : {}) });
        const candidates = [modelId, 'gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-2.0-flash-exp', 'gemini-1.5-flash'];
        for (const mid of candidates) {
          try {
            const model = vertex.getGenerativeModel({ model: mid });
            const reqObj: any = { contents: [{ role: 'user', parts: [{ text: prompt }] }] };
            if (kind === 'transaction') {
              reqObj.generationConfig = { responseMimeType: 'application/json' };
            }
            const resp = await model.generateContent(reqObj as any);
            const parts = (((resp as any)?.response?.candidates?.[0]?.content?.parts) || []) as any[];
            const t = String(parts.map(p => String(p?.text || '')).filter(Boolean).join('\n')) || String((resp as any)?.response?.text?.() || '');
            if (t) { text = t; provider = 'vertex_ai'; usedModel = mid; break; }
          } catch (e: any) {
            const msg = String(e?.message || '');
            console.error(`Vertex AI Model ${mid} Error:`, msg);
            if (/NOT_FOUND|was not found/i.test(msg)) continue;
            throw e;
          }
        }
      } catch (err: any) {
        const msg = String(err?.message || '');
        const name = String(err?.name || '');
        console.error('Vertex AI Client Error:', name, msg, JSON.stringify(err));
        lastError = { provider: 'vertex_ai', message: msg, name };
        if (apiKey) {
          const candidates = [modelId, 'gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-2.0-flash-exp', 'gemini-1.5-flash'];
          for (const mid of candidates) {
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(mid)}:generateContent?key=${encodeURIComponent(apiKey)}`;
            const bodyObj: any = { contents: [{ role: 'user', parts: [{ text: prompt }] }] };
            if (kind === 'transaction') {
              bodyObj.generationConfig = { responseMimeType: 'application/json' };
            }
            const resp = await (globalThis.fetch as any)(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(bodyObj) });
            const j = await resp.json();
            const parts = (j?.candidates?.[0]?.content?.parts || []) as any[];
            const t = String(parts.map(p => String(p?.text || '')).filter(Boolean).join('\n')) || String(j?.candidates?.[0]?.content?.parts?.[0]?.text || '');
            if (t) { text = t; provider = 'gemini_api'; usedModel = mid; break; }
          }
          if (!text) {
            if (name.includes('GoogleAuthError') || /Unable to authenticate/i.test(msg)) {
              res.statusCode = 401;
              res.setHeader('content-type', 'application/json');
              res.end(JSON.stringify({ error: 'vertex_auth_required' }));
              return;
            }
            throw err;
          }
        } else {
          if (name.includes('GoogleAuthError') || /Unable to authenticate/i.test(msg)) {
            res.statusCode = 401;
            res.setHeader('content-type', 'application/json');
            res.end(JSON.stringify({ error: 'vertex_auth_required' }));
            return;
          }
          throw err;
        }
      }
    } else if (apiKey) {
      const candidates = [modelId, 'gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-2.0-flash-exp', 'gemini-1.5-flash'];
      for (const mid of candidates) {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(mid)}:generateContent?key=${encodeURIComponent(apiKey)}`;
        const bodyObj: any = { contents: [{ role: 'user', parts: [{ text: prompt }] }] };
        if (kind === 'transaction') {
          bodyObj.generationConfig = { responseMimeType: 'application/json' };
        }
        const resp = await (globalThis.fetch as any)(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(bodyObj) });
        const j = await resp.json();
        const parts = (j?.candidates?.[0]?.content?.parts || []) as any[];
        const t = String(parts.map(p => String(p?.text || '')).filter(Boolean).join('\n')) || String(j?.candidates?.[0]?.content?.parts?.[0]?.text || '');
        if (t) { text = t; provider = 'gemini_api'; usedModel = mid; break; }
      }
    } else {
      if (!project) {
        res.statusCode = 400;
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ error: 'missing_project' }));
        return;
      }
      try {
        const { VertexAI } = await import('@google-cloud/vertexai');
        const vertex = new VertexAI({ project, location });
        const candidates = [modelId, 'gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-2.0-flash-exp', 'gemini-1.5-flash'];
        for (const mid of candidates) {
          try {
            const model = vertex.getGenerativeModel({ model: mid });
            const reqObj: any = { contents: [{ role: 'user', parts: [{ text: prompt }] }] };
            if (kind === 'transaction') {
              reqObj.generationConfig = { responseMimeType: 'application/json' };
            }
            const resp = await model.generateContent(reqObj as any);
            const parts = (((resp as any)?.response?.candidates?.[0]?.content?.parts) || []) as any[];
            const t = String(parts.map(p => String(p?.text || '')).filter(Boolean).join('\n')) || String((resp as any)?.response?.text?.() || '');
            if (t) { text = t; provider = 'vertex_ai'; usedModel = mid; break; }
          } catch (e: any) {
            const msg = String(e?.message || '');
            if (/NOT_FOUND|was not found/i.test(msg)) continue;
            throw e;
          }
        }
      } catch (err: any) {
        const msg = String(err?.message || '');
        const name = String(err?.name || '');
        console.error('Vertex AI Error:', name, msg);
        if (name.includes('GoogleAuthError') || /Unable to authenticate/i.test(msg)) {
          res.statusCode = 401;
          res.setHeader('content-type', 'application/json');
          res.end(JSON.stringify({ error: 'vertex_auth_required' }));
          return;
        }
        lastError = { provider: 'vertex_ai', message: msg, name };
        throw err;
      }
    }
  }
    if (!text) {
      console.error('AI Advisor: No text generated. Last error:', lastError);
      res.statusCode = 502;
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ error: 'empty_response', detail: lastError }));
      return;
    }
    if (kind === 'agent' && text) {
      const ql = questionRaw.toLowerCase();
      const hasMei = /(^|\\b)mei(\\b|$)/i.test(ql);
      const hasNfs = /(nfs\\-?e|nota\\s*fiscal)/i.test(ql);
      const hasTrib = /(das|simples\\s*nacional|imposto|tribut)/i.test(ql);
      if (hasMei || hasNfs || hasTrib) {
        const refs = [
          'Referências:',
          '- Portal do Empreendedor (MEI): https://www.gov.br/empresas-e-negocios/pt-br/empreendedor',
          '- NFS-e (Gov.br): https://www.gov.br/nfse',
          '- SEBRAE — MEI: https://www.sebrae.com.br/mei'
        ].join('\\n');
        text = `${text}\\n\\n${refs}`;
      }
    }
    if (kind === 'transaction') {
      const normalize = (s: string) => {
        let v = String(s || '');
        v = v.replace(/^\uFEFF/, '');
        v = v.replace(/```json/gi, '').replace(/```/g, '');
        v = v.replace(/[“”]/g, '"').replace(/[‘’]/g, '"');
        const braceStart = v.indexOf('{');
        const braceEnd = v.lastIndexOf('}');
        const bracketStart = v.indexOf('[');
        const bracketEnd = v.lastIndexOf(']');
        if (braceStart >= 0 && braceEnd > braceStart) v = v.slice(braceStart, braceEnd + 1);
        else if (bracketStart >= 0 && bracketEnd > bracketStart) v = v.slice(bracketStart, bracketEnd + 1);
        v = v.replace(/,(\s*[}\]])/g, '$1');
        return v.trim();
      };
      const tryParse = (s: string) => {
        try { return JSON.parse(s); } catch { return null; }
      };
      const cleaned = normalize(text);
      const raw = tryParse(cleaned) || tryParse(normalize(cleaned));
      if (raw && typeof raw === 'object') {
        const parsed = Array.isArray(raw) ? (raw[0] || {}) : raw;
        const accId = String(parsed?.accountId || '');
        const ccat = String(parsed?.category || '');
        const desc = String(parsed?.description || '');
        const amt = Number(parsed?.amount || 0);
        const dt = String(parsed?.date || new Date().toISOString().split('T')[0]);
        const pm = String(parsed?.paymentMethod || '');
        const ccIdRaw = parsed?.costCenterId;
        const ccId = ccIdRaw === null ? null : (typeof ccIdRaw === 'string' ? ccIdRaw : '');
        const typ = String(parsed?.type || 'Saída');
        transaction = {
          accountId: accId,
          type: (typ === 'Entrada' ? 'Entrada' : 'Saída'),
          category: ccat || 'Outros',
          description: desc,
          amount: isNaN(amt) ? 0 : amt,
          date: dt,
          paymentMethod: pm || 'Outros',
          costCenterId: ccId || undefined
        };
      } else {
        const lower = String(txCtxObj.text || '').toLowerCase();
        const amountMatch = (() => {
          const m1 = lower.match(/r\$\s*(\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?)/i);
          if (m1) return m1[1];
          const m2 = lower.match(/(\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?)\s*reais?/i);
          if (m2) return m2[1];
          const m3 = lower.match(/(\d{2,6}(?:[.,]\d{1,2})?)(?:\s*(?:rs?|reais?))?/i);
          if (m3) return m3[1];
          const m4 = lower.match(/(\d{1,3}(?:,\d{1,2})?)\s*mil/i);
          if (m4) return String(parseFloat(m4[1].replace(',','.')) * 1000);
          return '';
        })();
        const amountNum = (() => {
          if (!amountMatch) return 0;
          const s = amountMatch.replace(/\./g,'').replace(',','.');
          const n = parseFloat(s);
          return isNaN(n) ? 0 : n;
        })();
        const incomeWords = ["salario","salário","recebi","entrada","deposito","depósito","bonus","bônus","rendimento","juros","cashback","venda","reembolso","provento","pix recebido"];
        const expenseWords = ["paguei","pagamento","compra","almoço","mercado","supermercado","uber","ifood","aluguel","conta","internet","energia","luz","gas","gasolina","transporte","cinema","lazer","assinatura","netflix","spotify","restaurante","padaria"];
        const isIncome = incomeWords.some(w => lower.includes(w));
        const isExpense = expenseWords.some(w => lower.includes(w));
        const typeVal = isIncome && !isExpense ? 'Entrada' : 'Saída';
        const todayStr = String(txCtxObj.today || new Date().toISOString().split('T')[0]);
        const dateVal = (() => {
          if (/\bhoje\b/i.test(lower)) return todayStr;
          if (/\bontem\b/i.test(lower)) {
            const d = new Date(todayStr);
            d.setDate(d.getDate()-1);
            return d.toISOString().split('T')[0];
          }
          const m = lower.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
          if (m) return `${m[1]}-${m[2]}-${m[3]}`;
          const dm = lower.match(/\b(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})\b/);
          if (dm) {
            const dd = dm[1].padStart(2,'0');
            const mm = dm[2].padStart(2,'0');
            const yy = dm[3].length === 2 ? `20${dm[3]}` : dm[3];
            return `${yy}-${mm}-${dd}`;
          }
          return todayStr;
        })();
        const categoriesList = Array.isArray(txCtxObj.categories) ? (txCtxObj.categories as any[]) : [];
        const accountsList = Array.isArray(txCtxObj.accounts) ? txCtxObj.accounts as any[] : [];
        const costCentersList = Array.isArray(txCtxObj.costCenters) ? txCtxObj.costCenters as any[] : [];
        const tokens = lower.split(/[^a-z0-9çáàâãéêíóôõúü]+/i).filter(t => t && t.length >= 3);
        const pickFromNames = (nameList: string[]) => {
          let best = '';
          let score = 0;
          for (const n of nameList) {
            const ln = String(n || '').toLowerCase();
            let s = 0;
            if (ln && lower.includes(ln)) s += 2;
            const hits = tokens.filter(t => ln.includes(t)).length;
            s += hits;
            if (s > score) { score = s; best = n; }
          }
          return best;
        };
        const categoryVal = (() => {
          const names = categoriesList.map(c => typeof c === 'string' ? c : String(c?.name || c?.id || c));
          const picked = pickFromNames(names);
          return picked || 'Outros';
        })();
        const accountVal = (() => {
          const names = accountsList.map(a => String(a?.name || a?.bank || a?.id));
          const picked = pickFromNames(names);
          const found = accountsList.find(a => String(a?.name || a?.bank || a?.id).toLowerCase() === picked.toLowerCase());
          return String(found?.id || '');
        })();
        const paymentVal = (() => {
          if (lower.includes('pix')) return 'PIX';
          if (lower.includes('débito') || lower.includes('debito')) return 'Cartão de Débito';
          if (lower.includes('crédito') || lower.includes('credito') || lower.includes('cartão')) return 'Cartão de Crédito';
          if (lower.includes('dinheiro') || lower.includes('cash')) return 'Dinheiro';
          if (lower.includes('transferência') || lower.includes('transferencia')) return 'Transferência Bancária';
          if (lower.includes('boleto')) return 'Boleto';
          if (lower.includes('débito automático') || lower.includes('debito automatico')) return 'Débito Automático';
          return 'Outros';
        })();
        const costCenterVal = (() => {
          const names = costCentersList.map(cc => String(cc?.name || cc?.id));
          const picked = pickFromNames(names);
          const found = costCentersList.find(cc => String(cc?.name || cc?.id).toLowerCase() === picked.toLowerCase());
          return found ? String(found.id || '') : undefined;
        })();
        transaction = {
          accountId: accountVal,
          type: typeVal,
          category: categoryVal,
          description: String(txCtxObj.text || ''),
          amount: amountNum,
          date: dateVal,
          paymentMethod: paymentVal,
          costCenterId: costCenterVal
        };
        if (!transaction.accountId) {
          const fallbackAcc = accountsList[0]?.id ? String(accountsList[0].id) : '';
          transaction.accountId = fallbackAcc;
        }
        if (!transaction.category) transaction.category = 'Outros';
        if (!transaction.paymentMethod) transaction.paymentMethod = 'Outros';
      }
    }

    // Success response
    res.statusCode = 200;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify(transaction ? { text, transaction, provider, model: usedModel } : { text, provider, model: usedModel }));
  } catch (e: any) {
    console.error('Advice Error Full Stack:', e);
    res.statusCode = 500;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ error: e?.message || 'error', stack: e?.stack }));
  }
}
