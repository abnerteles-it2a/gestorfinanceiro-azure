import { api } from './api';

export interface ParsedVoiceTransaction {
    description: string;
    amount: number;
    date: string;
    category: string;
    type: 'Entrada' | 'Saída';
    paymentMethod: string;
    accountId: string;
}

/**
 * Parser inteligente de linguagem natural para lançamentos por voz no Mobile.
 * Extrai valor, tipo, categoria, data, conta bancária e método de pagamento.
 */
export const parseVoiceTransaction = async (
    text: string, 
    categories: string[], 
    accounts: { id: string; name: string }[]
): Promise<ParsedVoiceTransaction | null> => {
    const raw = (text || '').trim();
    if (!raw) return null;
    const lower = raw.toLowerCase();

    // ─── 1. Extração de Valor Monetário ──────────────────────────────────────────
    const amountPatterns = [
        /r\$\s*(\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?)/i,
        /(\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?)\s*reais?/i,
        /(\d{1,6}(?:[.,]\d{1,2})?)(?:\s*(?:rs?|reais?))?/i,
        /(\d{1,3}(?:,\d{1,2})?)\s*mil/i
    ];
    
    let amount = NaN;
    let amountText = '';
    let amountMatchIndex: number | null = null;
    
    for (const pattern of amountPatterns) {
        const exec = pattern.exec(lower);
        if (exec) {
            amountText = exec[1];
            amountMatchIndex = exec.index;
            break;
        }
    }
    
    if (amountText) {
        const normalized = amountText.replace(/\./g, '').replace(',', '.');
        const parsed = parseFloat(normalized);
        if (lower.includes('mil') && !lower.includes('milh')) {
            amount = parsed * 1000;
        } else {
            amount = parsed;
        }
        if (isNaN(amount) || amount <= 0 || amount >= 10000000) {
            amount = NaN;
        }
    }

    // ─── 2. Extração de Descrição ────────────────────────────────────────────────
    let description = raw;
    if (amountMatchIndex !== null) {
        description = raw.substring(0, amountMatchIndex).trim();
        description = description
            .replace(/\b(de|por|no valor de|valor de|a|em|gastei|paguei|recebi|comprei)\s*$/i, '')
            .trim();
    }
    if (!description || description.length < 2) {
        description = raw.replace(/[0-9]+([.,][0-9]{1,2})?/g, '').replace(/\b(reais|r\$|hoje|ontem)\b/gi, '').trim();
    }
    if (!description) {
        description = 'Lançamento por Voz';
    }

    // ─── 3. Extração de Data ─────────────────────────────────────────────────────
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    let dateStr = fmt(today);

    if (lower.includes('ontem')) dateStr = fmt(yesterday);
    if (lower.includes('anteontem')) {
        const anteontem = new Date(today);
        anteontem.setDate(today.getDate() - 2);
        dateStr = fmt(anteontem);
    }

    // ─── 4. Tipo da Transação (Entrada vs Saída) ─────────────────────────────────
    const incomeWords = ["salario", "salário", "recebi", "recebido", "entrada", "deposito", "depósito", "bonus", "bônus", "rendimento", "venda", "reembolso", "provento", "pix recebido", "lucro"];
    const expenseWords = ["paguei", "pagamento", "gastei", "compra", "comprei", "almoço", "mercado", "supermercado", "uber", "ifood", "aluguel", "conta", "luz", "gasolina", "combustivel", "farmacia"];
    const type: 'Entrada' | 'Saída' = incomeWords.some(w => lower.includes(w)) && !expenseWords.some(w => lower.includes(w)) ? 'Entrada' : 'Saída';

    // ─── 5. Forma de Pagamento ──────────────────────────────────────────────────
    const paymentDict: Record<string, string> = {
        'pix': 'PIX',
        'débito': 'Cartão de Débito',
        'debito': 'Cartão de Débito',
        'crédito': 'Cartão de Crédito',
        'credito': 'Cartão de Crédito',
        'cartão': 'Cartão de Crédito',
        'cartao': 'Cartão de Crédito',
        'dinheiro': 'Dinheiro',
        'espécie': 'Dinheiro',
        'transferência': 'Transferência',
        'transferencia': 'Transferência',
        'boleto': 'Boleto',
    };
    let paymentMethod = 'PIX';
    for (const k of Object.keys(paymentDict)) {
        if (lower.includes(k)) {
            paymentMethod = paymentDict[k];
            break;
        }
    }

    // ─── 6. Identificação de Conta Bancária ──────────────────────────────────────
    let accountId = accounts.length > 0 ? accounts[0].id : '';
    const bankKeywords = ['nubank', 'inter', 'itaú', 'itau', 'bradesco', 'santander', 'bb', 'banco do brasil', 'caixa', 'c6', 'neon', 'picpay'];
    
    for (const keyword of bankKeywords) {
        if (lower.includes(keyword)) {
            const matched = accounts.find(a => a.name.toLowerCase().includes(keyword));
            if (matched) {
                accountId = matched.id;
                break;
            }
        }
    }

    // ─── 7. Sugestão Inteligente de Categoria ────────────────────────────────────
    const categoryDict: Record<string, string[]> = {
        'Alimentação': ['almoço', 'almoco', 'jantar', 'comida', 'restaurante', 'mcdonalds', 'burger king', 'ifood', 'lanchonete', 'padaria', 'café', 'cafe'],
        'Mercado': ['supermercado', 'mercado', 'carrefour', 'extra', 'pão de açúcar', 'pao de acucar', 'assai', 'atacadão', 'atacadao', 'compras do mês'],
        'Transporte': ['uber', '99', 'táxi', 'taxi', 'ônibus', 'onibus', 'metrô', 'metro', 'estacionamento', 'pedágio', 'pedagio'],
        'Combustível': ['gasolina', 'posto', 'etanol', 'álcool', 'diesel', 'shell', 'ipiranga', 'br', 'petrobras', 'combustível', 'combustivel'],
        'Moradia': ['aluguel', 'condomínio', 'condominio', 'água', 'agua', 'luz', 'energia', 'gás', 'gas', 'internet', 'iptu'],
        'Saúde': ['farmácia', 'farmacia', 'drogaria', 'drogasil', 'raia', 'médico', 'medico', 'consulta', 'exame', 'dentista', 'remédio', 'remedio'],
        'Lazer': ['cinema', 'filme', 'netflix', 'spotify', 'show', 'viagem', 'hotel', 'passeio', 'bar', 'chopp', 'cerveja'],
        'Educação': ['curso', 'livro', 'faculdade', 'escola', 'mensalidade', 'udemy'],
        'Salário': ['salário', 'salario', 'pagamento', 'folha', 'adiantamento'],
        'Serviços': ['consultoria', 'freelance', 'serviço', 'servico', 'honorários', 'projeto']
    };

    let bestCategory = categories.length > 0 ? categories[0] : 'Geral';
    let maxMatches = 0;

    for (const [catName, keywords] of Object.entries(categoryDict)) {
        const matches = keywords.filter(kw => lower.includes(kw)).length;
        if (matches > maxMatches) {
            maxMatches = matches;
            // Verifica se a categoria existe na lista do usuário ou mapeia para similar
            const existingCat = categories.find(c => c.toLowerCase() === catName.toLowerCase());
            if (existingCat) {
                bestCategory = existingCat;
            } else {
                bestCategory = catName;
            }
        }
    }

    if (isNaN(amount) || amount <= 0) {
        return null;
    }

    return {
        description: description.charAt(0).toUpperCase() + description.slice(1),
        amount,
        date: dateStr,
        category: bestCategory,
        type,
        paymentMethod,
        accountId
    };
};
