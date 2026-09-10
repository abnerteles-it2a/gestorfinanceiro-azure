/**
 * RAG Knowledge Base and Semantic Retrieval Engine
 * Gestor Financeiro — Manual do Sistema & Onboarding Index
 */

export interface ActionChip {
  type: 'OPEN_SETTINGS' | 'ADD_TRANSACTION' | 'ADD_INVESTMENT' | 'NAVIGATE';
  label: string;
  payload?: Record<string, any>;
}

export interface KnowledgeChunk {
  id: string;
  title: string;
  category: 'accounts' | 'categories' | 'transactions' | 'payables_receivables' | 'investments' | 'reports_dre' | 'docsvault' | 'onboarding';
  keywords: string[];
  content: string;
  action?: ActionChip;
}

export const KNOWLEDGE_BASE: KnowledgeChunk[] = [
  {
    id: 'contas-bancarias',
    title: 'Cadastro e Gestão de Contas Bancárias',
    category: 'accounts',
    keywords: [
      'conta', 'contas', 'banco', 'bancaria', 'bancarias', 'saldo inicial', 'instituicao',
      'como criar conta', 'cadastrar conta', 'adicionar conta', 'itau', 'nubank', 'bradesco',
      'inter', 'santander', 'carteira', 'caixinha', 'corretora', 'transferencia', 'transferir'
    ],
    content: `COMO CADASTRAR OU GERENCIAR CONTAS BANCÁRIAS:
1. Acesse o menu Configurações (ícone de engrenagem) no canto superior direito.
2. Na aba "Contas", localize a seção "Adicionar Nova Conta".
3. Preencha o Nome da Conta (ex: Nubank Principal, Itaú PJ), o Banco, o Tipo (Corrente, Poupança, Investimento, Dinheiro) e o Saldo Inicial.
4. Clique em "Salvar Conta".
ATALHO RÁPIDO: No modal de "Novo Lançamento", clique no botão '+' ao lado do campo seletor de Conta Bancária para cadastrar sem sair do fluxo.
CÁLCULO DO SALDO: O saldo atual é auditado em tempo real: Saldo Inicial + Entradas - Saídas + Transferências Recebidas - Transferências Enviadas.`,
    action: {
      type: 'OPEN_SETTINGS',
      label: '⚡ Abrir Cadastro de Contas',
      payload: { tab: 'accounts' }
    }
  },
  {
    id: 'categorias-centros',
    title: 'Criação e Gestão de Categorias e Centros de Custo',
    category: 'categories',
    keywords: [
      'categoria', 'categorias', 'centro de custo', 'centros de custo', 'classificacao',
      'como criar categoria', 'cadastrar categoria', 'tipo de gasto', 'receita ou despesa',
      'alimentacao', 'moradia', 'transporte', 'custo fixo', 'despesa fixa', 'departamento'
    ],
    content: `COMO CRIAR E GERENCIAR CATEGORIAS:
1. Acesse o menu Configurações (ícone de engrenagem).
2. Clique na aba "Categorias".
3. Selecione o Tipo: "Receita" (para entradas como Salário, Vendas, Serviços) ou "Despesa" (para saídas como Moradia, Alimentação, Marketing).
4. Digite o nome da categoria no campo e clique no botão '+' para adicionar.
CENTROS DE CUSTO (Opcional): Na aba "Centros de Custo" em Configurações, crie centros como 'Comercial', 'Operacional', 'Reforma' ou 'Família' para segregar despesas nos relatórios.`,
    action: {
      type: 'OPEN_SETTINGS',
      label: '⚡ Abrir Categorias',
      payload: { tab: 'categories' }
    }
  },
  {
    id: 'novo-lancamento-caixa',
    title: 'Lançamentos Financeiros (Manual, por Voz e Linguagem Natural)',
    category: 'transactions',
    keywords: [
      'lancamento', 'lancamentos', 'lancar', 'despesa', 'receita', 'gasto', 'ganho',
      'voz', 'microfone', 'falar', 'linguagem natural', 'como lancar', 'registrar despesa',
      'parcelado', 'parcelamento', 'recorrente', 'assinatura', 'repetir', 'pix', 'cartao'
    ],
    content: `COMO REALIZAR LANÇAMENTOS NO GESTOR FINANCEIRO:
1. Lançamento Tradicional: Clique no botão "Novo Lançamento" na barra superior. Informe Descrição, Valor, Data, Tipo (Receita/Despesa/Transferência), Categoria e Conta Bancária.
2. Lançamento por Voz 🎙️: No modal de Novo Lançamento, toque no ícone de Microfone e fale naturalmente (ex: "Almoço de 45 reais no cartão Nubank"). O sistema transcreve e preenche os campos automaticamente.
3. Lançamento por Linguagem Natural: Digite no chat do Concierge frases como "padaria 25 reais nubank" para registrar rapidamente.
4. Parcelamentos e Recorrências: Marque a opção "Repetir / Parcelar" para compras em até 12x ou despesas fixas recorrentes (aluguel, condomínio, internet).`,
    action: {
      type: 'ADD_TRANSACTION',
      label: '➕ Novo Lançamento',
      payload: {}
    }
  },
  {
    id: 'contas-pagar-receber',
    title: 'Contas a Pagar e a Receber (Liquidação e Vencimentos)',
    category: 'payables_receivables',
    keywords: [
      'pagar', 'receber', 'contas a pagar', 'contas a receber', 'vencimento', 'vencimentos',
      'boleto', 'fatura', 'fornecedor', 'cliente', 'liquidar', 'baixar', 'liquidacao',
      'titulos', 'obrigacao', 'compromisso', 'previsto', 'a vencer'
    ],
    content: `COMO GERENCIAR CONTAS A PAGAR E A RECEBER:
1. Acesse o módulo "Financeiro / Contábil" no menu principal.
2. Na aba "Contas a Pagar" ou "Contas a Receber", clique em "Novo Lançamento".
3. Preencha Título (ex: Fornecedor X, Fatura do Cartão), Valor (R$), Data de Vencimento, Categoria e Fornecedor/Cliente.
4. Liquidação / Baixa: Quando a conta for paga ou recebida, clique no ícone de Check na linha do título. O sistema marca como 'Liquidado' e efetua o lançamento automático na conta bancária vinculada.`,
    action: {
      type: 'NAVIGATE',
      label: '💼 Ir para Contas a Pagar e Receber',
      payload: { view: 'financeAccounting' }
    }
  },
  {
    id: 'investimentos-ativos',
    title: 'Módulo de Investimentos (Renda Fixa, Variável e Proventos)',
    category: 'investments',
    keywords: [
      'investimento', 'investimentos', 'investir', 'renda fixa', 'renda variavel', 'acao', 'acoes',
      'fii', 'fiis', 'cripto', 'bitcoin', 'tesouro', 'cdb', 'provento', 'proventos', 'dividendo',
      'dividendos', 'preco medio', 'carteira', 'cotacao', 'cotacoes', 'b3'
    ],
    content: `COMO LANÇAR E ACOMPANHAR INVESTIMENTOS:
1. Acesse o menu "Investimentos" no menu principal.
2. Clique em "Novo Investimento".
3. Renda Variável: Escolha Operação (Compra/Venda), Tipo (Ações, FIIs, Cripto, ETFs), informe o Código (Ticker ex: PETR4, MXRF11, BTC), Quantidade e Preço de Compra. O sistema calcula o Preço Médio e busca cotações em tempo real.
4. Renda Fixa: Na aba Renda Fixa, informe o Nome (ex: CDB 110% CDI), Emissor, Valor Investido, Rentabilidade e Data de Vencimento.
5. Proventos e Dividendos: Na lista de ativos, clique no botão 'Prov.' para registrar o dividendo creditado na conta bancária.`,
    action: {
      type: 'ADD_INVESTMENT',
      label: '📈 Novo Investimento',
      payload: {}
    }
  },
  {
    id: 'dre-balanco-relatorios',
    title: 'DRE Contábil, Balanço Patrimonial e Relatórios MEI',
    category: 'reports_dre',
    keywords: [
      'dre', 'balanco', 'balanco patrimonial', 'patrimonio liquido', 'relatorio', 'relatorios',
      'lucro', 'prejuizo', 'margem', 'regime de caixa', 'regime de competencia', 'mei', 'dasn',
      'declaracao mei', 'faturamento anual', 'ebitda'
    ],
    content: `DRE, BALANÇO PATRIMONIAL E RELATÓRIOS:
1. DRE (Demonstração do Resultado do Exercício): No módulo Financeiro ou em Relatórios, visualize: Receita Bruta - Deduções/Impostos = Receita Líquida - Despesas = Lucro/Prejuízo Líquido do mês.
2. Balanço Patrimonial: Ativos Totais (Dinheiro em Contas + Investimentos + Contas a Receber) - Passivos (Contas a Pagar) = Patrimônio Líquido Acumulado.
3. MEI & Fiscal: O sistema acompanha o teto de R$ 81.000,00/ano, gera o Relatório Mensal de Receitas Brutas e consolida valores para a Declaração Anual DASN-SIMEI.`,
    action: {
      type: 'NAVIGATE',
      label: '📊 Ver DRE e Relatórios',
      payload: { view: 'reports' }
    }
  },
  {
    id: 'docsvault-cofre',
    title: 'Cofre Digital e Documentos Fiscais (DocsVault)',
    category: 'docsvault',
    keywords: [
      'cofre', 'documento', 'documentos', 'nota fiscal', 'notas fiscais', 'nfe', 'nfse',
      'recibo', 'comprovante', 'anexo', 'upload', 'arquivo', 'armazenamento', 'docsvault'
    ],
    content: `COMO USAR O COFRE DIGITAL (DOCSVAULT):
1. Acesse o menu "Cofre Digital" (DocsVault).
2. Clique em "Novo Documento" ou arraste arquivos (PDF, PNG, JPG).
3. Preencha Fornecedor/Emitente, Tipo (Nota Fiscal, Recibo, Boleto, Contrato), Valor e Data de Emissão.
4. Vínculo: O documento fica seguro na nuvem Azure e pode ser associado diretamente a lançamentos de despesas ou contas a pagar para comprovação fiscal.`,
    action: {
      type: 'NAVIGATE',
      label: '📁 Abrir Cofre Digital',
      payload: { view: 'docsVault' }
    }
  },
  {
    id: 'onboarding-setup',
    title: 'Jornada de Onboarding para Novos Usuários (Setup Inicial)',
    category: 'onboarding',
    keywords: [
      'onboarding', 'comecar', 'iniciar', 'primeiro acesso', 'como comecar', 'passo a passo',
      'configurar', 'configuracao inicial', 'tutorial', 'guia', 'roteiro', 'novato', 'novo usuario'
    ],
    content: `ROTEIRO DE SETUP INICIAL (4 PASSOS ESSENCIAIS):
Passo 1: Contas Bancárias — Em Configurações > Contas, cadastre suas contas e informe os saldos reais atuais.
Passo 2: Categorias — Em Configurações > Categorias, crie as categorias de despesa e receita da sua rotina.
Passo 3: Primeiro Lançamento — Registre uma entrada ou saída recente no botão "Novo Lançamento" (experimente falar pelo microfone 🎙️).
Passo 4: Metas Financeiras — Defina suas metas no Dashboard (ex: Reserva de Emergência) para acompanhar o progresso.
Dica: Dedique 2 minutos por dia para lançar suas despesas à medida que acontecem!`,
    action: {
      type: 'OPEN_SETTINGS',
      label: '🚀 Iniciar Setup: Cadastrar Contas',
      payload: { tab: 'accounts' }
    }
  }
];

/**
 * Normalizes text for search (lowercases, removes accents)
 */
function normalize(str: string): string {
  return (str || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

/**
 * Semantic/Keyword Retrieval: Finds best matching knowledge chunks from the official manual
 */
export function searchManualKnowledge(query: string, maxResults = 3): { chunks: KnowledgeChunk[]; topAction?: ActionChip } {
  const normQuery = normalize(query);
  const words = normQuery.split(/\s+/).filter(w => w.length > 2);

  const scored = KNOWLEDGE_BASE.map(chunk => {
    let score = 0;
    const normTitle = normalize(chunk.title);
    const normContent = normalize(chunk.content);

    // Keyword exact matches
    for (const kw of chunk.keywords) {
      const normKw = normalize(kw);
      if (normQuery.includes(normKw)) {
        score += 8;
      }
    }

    // Title words matches
    for (const w of words) {
      if (normTitle.includes(w)) score += 5;
      if (normContent.includes(w)) score += 1;
    }

    return { chunk, score };
  });

  scored.sort((a, b) => b.score - a.score);

  const relevant = scored.filter(s => s.score > 2).slice(0, maxResults);
  const chunks = relevant.map(r => r.chunk);
  const topAction = chunks.find(c => !!c.action)?.action;

  return { chunks, topAction };
}

/**
 * Formats chunks for dynamic injection into LLM system prompt
 */
export function formatKnowledgeForPrompt(chunks: KnowledgeChunk[]): string {
  if (!chunks.length) return '';
  return `
[[TRECHOS DO MANUAL OFICIAL DO GESTOR FINANCEIRO RELEVANTES À PERGUNTA]]:
${chunks.map(c => `### ${c.title}\n${c.content}`).join('\n\n')}
`;
}
