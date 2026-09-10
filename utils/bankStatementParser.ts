import { Transaction, TransactionType, Category } from '../types';

export interface ParsedStatementItem {
    id: string;
    fitId?: string;
    date: string; // YYYY-MM-DD
    description: string;
    amount: number; // always positive
    transactionType: TransactionType; // 'Entrada' | 'Saída'
    category: string;
    paymentMethod: string;
    isDuplicate: boolean;
    duplicateReason?: string;
    selected: boolean;
}

export interface StatementParseResult {
    success: boolean;
    fileType: 'ofx' | 'csv';
    accountInfo?: {
        bankId?: string;
        accountId?: string;
    };
    items: ParsedStatementItem[];
    totalInflow: number;
    totalOutflow: number;
    duplicateCount: number;
    error?: string;
}

/**
 * Normalizes Brazilian numbers ("1.234,56", "-120,50", "R$ 45,00") into standard float.
 */
export function parseBrazilianNumber(val: string): number {
    if (!val) return 0;
    let clean = val.replace(/R\$/g, '').replace(/\s/g, '').trim();
    
    // If comma is the decimal separator (e.g. 1.250,50 or 50,00)
    if (clean.includes(',') && !clean.includes('.')) {
        clean = clean.replace(',', '.');
    } else if (clean.includes('.') && clean.includes(',')) {
        // e.g. 1.234,56 -> remove dots, replace comma with dot
        clean = clean.replace(/\./g, '').replace(',', '.');
    }
    
    const num = parseFloat(clean);
    return isNaN(num) ? 0 : num;
}

/**
 * Normalizes date string into YYYY-MM-DD
 */
export function normalizeDate(raw: string): string {
    if (!raw) return new Date().toISOString().split('T')[0];
    const s = raw.trim();

    // OFX format: YYYYMMDD...
    const ofxMatch = s.match(/^(\d{4})(\d{2})(\d{2})/);
    if (ofxMatch) {
        return `${ofxMatch[1]}-${ofxMatch[2]}-${ofxMatch[3]}`;
    }

    // Brazilian format: DD/MM/YYYY or DD-MM-YYYY
    const brMatch = s.match(/^(\d{1,2})[\/\.-](\d{1,2})[\/\.-](\d{2,4})$/);
    if (brMatch) {
        let day = brMatch[1].padStart(2, '0');
        let month = brMatch[2].padStart(2, '0');
        let year = brMatch[3];
        if (year.length === 2) {
            year = '20' + year;
        }
        return `${year}-${month}-${day}`;
    }

    // Standard ISO format: YYYY-MM-DD
    const isoMatch = s.match(/^(\d{4})[\/\.-](\d{1,2})[\/\.-](\d{1,2})/);
    if (isoMatch) {
        const y = isoMatch[1];
        const m = isoMatch[2].padStart(2, '0');
        const d = isoMatch[3].padStart(2, '0');
        return `${y}-${m}-${d}`;
    }

    return new Date().toISOString().split('T')[0];
}

/**
 * Intelligent category predictor based on transaction description and financial type.
 */
export function suggestCategory(description: string, type: TransactionType, availableCategories: Category[]): string {
    const desc = (description || '').toLowerCase();

    // Direct mapping rules
    const incomeKeywords = [
        { cat: 'Salário', words: ['salario', 'salário', 'remuneracao', 'remuneração', 'folha de pag', 'vencimento', 'pro-labore', 'pró-labore'] },
        { cat: 'Dividendos', words: ['dividendo', 'provento', 'jcp', 'juros sobre capital', 'rendimento fundo', 'rendimento fii'] },
        { cat: 'Freelance', words: ['freelance', 'servico prestado', 'prestação', 'consultoria', 'honorario', 'honorários'] },
        { cat: 'Vendas', words: ['venda', 'faturamento', 'recebimento cliente', 'pagseguro', 'mercado pago', 'stone', 'cielo'] },
        { cat: 'Reembolso', words: ['reembolso', 'estorno', 'devolucao', 'devolução', 'cashback'] }
    ];

    const expenseKeywords = [
        { cat: 'Transporte', words: ['uber', '99app', '99 tecnologia', 'gasolina', 'combustivel', 'combustível', 'posto', 'ipiranga', 'shell', 'estacionamento', 'pedagio', 'pedágio', 'sem parar', 'veloe', 'auto posto'] },
        { cat: 'Alimentação', words: ['ifood', 'rappi', 'restaurante', 'padaria', 'panificadora', 'mercado', 'supermercado', 'carrefour', 'pao de acucar', 'pão de açúcar', 'extra', 'dia brasil', 'acai', 'açaí', 'cafeteria', 'coffee', 'starbucks', 'mcdonald', 'burger king', 'habib', 'subway', 'lanchonete', 'hortifruti'] },
        { cat: 'Moradia', words: ['aluguel', 'condominio', 'condomínio', 'enel', 'cpfl', 'sabesp', 'sanepar', 'copasa', 'luz', 'energia eletrica', 'gas', 'gás', 'ultragaz', 'iptu', 'quinto andar', 'loft'] },
        { cat: 'Assinaturas', words: ['netflix', 'spotify', 'prime video', 'amazon prime', 'disney', 'hbo', 'max.com', 'youtube', 'google storage', 'apple.com/bill', 'icloud', 'openai', 'chatgpt', 'claude.ai', 'github', 'gympass', 'smartfit', 'smart fit', 'bluefit', 'totalpass', 'sem parar'] },
        { cat: 'Saúde', words: ['farmacia', 'farmácia', 'drogaria', 'drogasil', 'droga raia', 'pacheco', 'sao paulo', 'panvel', 'hospital', 'consulta', 'laboratorio', 'laboratório', 'medico', 'médico', 'dentista', 'unimed', 'bradesco saude', 'sulamerica', 'fleury', 'delboni'] },
        { cat: 'Taxas Bancárias', words: ['tarifa', 'tar extrato', 'anuidade', 'iof', 'juros', 'manutencao conta', 'taxa pacote', 'custo servico', 'cesta basica'] },
        { cat: 'Impostos', words: ['das mei', 'simples nacional', 'darf', 'gps inss', 'receita federal', 'tributo', 'ipva', 'taxa licen'] },
        { cat: 'Educação', words: ['udemy', 'alura', 'coursera', 'escola', 'colegio', 'faculdade', 'universidade', 'livraria', 'curso', 'rocketseat'] },
        { cat: 'Lazer', words: ['cinema', 'cinemark', 'ingresso', 'show', 'teatro', 'viagem', 'hotel', 'airbnb', 'decolar', 'latam', 'gol linhas'] },
    ];

    const searchSet = type === TransactionType.INCOME ? incomeKeywords : expenseKeywords;

    for (const group of searchSet) {
        if (group.words.some(w => desc.includes(w))) {
            // Find existing matching category in user's categories
            const match = availableCategories.find(c => c.name.toLowerCase() === group.cat.toLowerCase());
            if (match) return match.name;
            return group.cat;
        }
    }

    // Default fallbacks matching existing user categories
    if (type === TransactionType.INCOME) {
        const defaultIncome = availableCategories.find(c => c.type === 'Entrada');
        return defaultIncome ? defaultIncome.name : 'Outras Receitas';
    } else {
        const defaultExpense = availableCategories.find(c => c.type === 'Saída' && c.name.toLowerCase().includes('outr'));
        return defaultExpense ? defaultExpense.name : 'Outras Despesas';
    }
}

/**
 * Predicts payment method based on description
 */
export function inferPaymentMethod(description: string): string {
    const d = (description || '').toLowerCase();
    if (d.includes('pix')) return 'PIX';
    if (d.includes('ted') || d.includes('doc') || d.includes('transf')) return 'Transferência Bancária';
    if (d.includes('cartao') || d.includes('compra deb') || d.includes('debito') || d.includes('débito')) return 'Cartão de Débito';
    if (d.includes('cred') || d.includes('crédito') || d.includes('fatura')) return 'Cartão de Crédito';
    if (d.includes('boleto') || d.includes('pagto cobranca') || d.includes('convenio')) return 'Boleto';
    if (d.includes('deb auto') || d.includes('debito autom') || d.includes('deb.aut')) return 'Débito Automático';
    return 'Outro';
}

/**
 * Parses an OFX (Open Financial Exchange) file text.
 */
export function parseOFXContent(ofxText: string, availableCategories: Category[] = []): StatementParseResult {
    try {
        const items: ParsedStatementItem[] = [];
        let totalInflow = 0;
        let totalOutflow = 0;

        // Extract transaction blocks <STMTTRN>...</STMTTRN>
        const trnRegex = /<STMTTRN>([\s\S]*?)(?:<\/STMTTRN>|(?=<STMTTRN>)|$)/gi;
        let match: RegExpExecArray | null;

        while ((match = trnRegex.exec(ofxText)) !== null) {
            const block = match[1];
            if (!block.trim()) continue;

            const trnTypeMatch = block.match(/<TRNTYPE>([^<\r\n]+)/i);
            const dtPostedMatch = block.match(/<DTPOSTED>([^<\r\n]+)/i);
            const trnAmtMatch = block.match(/<TRNAMT>([^<\r\n]+)/i);
            const fitIdMatch = block.match(/<FITID>([^<\r\n]+)/i);
            const memoMatch = block.match(/<MEMO>([^<\r\n]+)/i);
            const nameMatch = block.match(/<NAME>([^<\r\n]+)/i);

            const rawDate = dtPostedMatch ? dtPostedMatch[1].trim() : '';
            const rawAmt = trnAmtMatch ? trnAmtMatch[1].trim() : '0';
            const rawType = trnTypeMatch ? trnTypeMatch[1].trim().toUpperCase() : '';
            const fitId = fitIdMatch ? fitIdMatch[1].trim() : undefined;
            const description = (memoMatch ? memoMatch[1].trim() : (nameMatch ? nameMatch[1].trim() : 'Transação Sem Descrição'))
                .replace(/\s+/g, ' ');

            const parsedAmt = parseFloat(rawAmt.replace(',', '.'));
            const isNegative = parsedAmt < 0 || rawType === 'DEBIT';
            const amount = Math.abs(parsedAmt);
            const transactionType = isNegative ? TransactionType.EXPENSE : TransactionType.INCOME;

            if (transactionType === TransactionType.INCOME) {
                totalInflow += amount;
            } else {
                totalOutflow += amount;
            }

            const date = normalizeDate(rawDate);
            const category = suggestCategory(description, transactionType, availableCategories);
            const paymentMethod = inferPaymentMethod(description);

            items.push({
                id: fitId || `ofx_${Date.now()}_${items.length}_${Math.random().toString(36).substring(2, 7)}`,
                fitId,
                date,
                description,
                amount,
                transactionType,
                category,
                paymentMethod,
                isDuplicate: false,
                selected: true
            });
        }

        if (items.length === 0) {
            return {
                success: false,
                fileType: 'ofx',
                items: [],
                totalInflow: 0,
                totalOutflow: 0,
                duplicateCount: 0,
                error: 'Nenhuma transação financeira encontrada na estrutura do arquivo OFX.'
            };
        }

        return {
            success: true,
            fileType: 'ofx',
            items,
            totalInflow,
            totalOutflow,
            duplicateCount: 0
        };
    } catch (err: any) {
        return {
            success: false,
            fileType: 'ofx',
            items: [],
            totalInflow: 0,
            totalOutflow: 0,
            duplicateCount: 0,
            error: `Erro ao processar arquivo OFX: ${err.message || 'Formato inválido'}`
        };
    }
}

/**
 * Parses a CSV / TXT statement file.
 */
export function parseCSVContent(csvText: string, availableCategories: Category[] = []): StatementParseResult {
    try {
        const lines = csvText.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
        if (lines.length < 2) {
            return {
                success: false,
                fileType: 'csv',
                items: [],
                totalInflow: 0,
                totalOutflow: 0,
                duplicateCount: 0,
                error: 'O arquivo CSV está vazio ou contém apenas o cabeçalho.'
            };
        }

        // Determine delimiter (, or ; or \t)
        const headerLine = lines[0];
        let delimiter = ',';
        if (headerLine.split(';').length > headerLine.split(',').length) {
            delimiter = ';';
        } else if (headerLine.split('\t').length > headerLine.split(',').length) {
            delimiter = '\t';
        }

        const headers = headerLine.split(delimiter).map(h => h.replace(/^["']|["']$/g, '').trim().toLowerCase());

        // Find index positions
        let dateIdx = headers.findIndex(h => h.includes('data') || h.includes('date') || h.includes('dt'));
        let descIdx = headers.findIndex(h => h.includes('desc') || h.includes('memo') || h.includes('historico') || h.includes('histórico') || h.includes('titulo') || h.includes('detalhe'));
        let amountIdx = headers.findIndex(h => h.includes('valor') || h.includes('amount') || h.includes('quantia') || h.includes('total'));
        let creditIdx = headers.findIndex(h => h.includes('credito') || h.includes('crédito') || h.includes('entrada') || h.includes('receita'));
        let debitIdx = headers.findIndex(h => h.includes('debito') || h.includes('débito') || h.includes('saida') || h.includes('saída') || h.includes('despesa'));

        // Fallback default index if headers not explicitly matched
        if (dateIdx === -1) dateIdx = 0;
        if (descIdx === -1) descIdx = 1;
        if (amountIdx === -1 && creditIdx === -1 && debitIdx === -1) amountIdx = 2;

        const items: ParsedStatementItem[] = [];
        let totalInflow = 0;
        let totalOutflow = 0;

        for (let i = 1; i < lines.length; i++) {
            const rawLine = lines[i];
            if (!rawLine.trim()) continue;

            // Simple split handling quotes
            const cols = rawLine.split(delimiter).map(c => c.replace(/^["']|["']$/g, '').trim());
            if (cols.length <= Math.max(dateIdx, descIdx)) continue;

            const rawDate = cols[dateIdx] || '';
            const description = cols[descIdx] || 'Transação CSV';
            let amount = 0;
            let transactionType = TransactionType.EXPENSE;

            if (creditIdx !== -1 && debitIdx !== -1) {
                const credVal = parseBrazilianNumber(cols[creditIdx]);
                const debVal = parseBrazilianNumber(cols[debitIdx]);
                if (credVal > 0) {
                    amount = credVal;
                    transactionType = TransactionType.INCOME;
                } else if (debVal > 0) {
                    amount = debVal;
                    transactionType = TransactionType.EXPENSE;
                }
            } else if (amountIdx !== -1 && cols[amountIdx]) {
                const rawAmtStr = cols[amountIdx];
                const rawAmtNum = parseBrazilianNumber(rawAmtStr);
                const isNegative = rawAmtStr.includes('-') || rawAmtNum < 0;
                amount = Math.abs(rawAmtNum);
                transactionType = isNegative ? TransactionType.EXPENSE : TransactionType.INCOME;
            }

            if (amount <= 0) continue; // Skip zero/empty rows

            if (transactionType === TransactionType.INCOME) {
                totalInflow += amount;
            } else {
                totalOutflow += amount;
            }

            const date = normalizeDate(rawDate);
            const category = suggestCategory(description, transactionType, availableCategories);
            const paymentMethod = inferPaymentMethod(description);

            items.push({
                id: `csv_${Date.now()}_${i}_${Math.random().toString(36).substring(2, 7)}`,
                date,
                description,
                amount,
                transactionType,
                category,
                paymentMethod,
                isDuplicate: false,
                selected: true
            });
        }

        if (items.length === 0) {
            return {
                success: false,
                fileType: 'csv',
                items: [],
                totalInflow: 0,
                totalOutflow: 0,
                duplicateCount: 0,
                error: 'Nenhuma transação válida identificada nas linhas do CSV.'
            };
        }

        return {
            success: true,
            fileType: 'csv',
            items,
            totalInflow,
            totalOutflow,
            duplicateCount: 0
        };
    } catch (err: any) {
        return {
            success: false,
            fileType: 'csv',
            items: [],
            totalInflow: 0,
            totalOutflow: 0,
            duplicateCount: 0,
            error: `Erro ao processar arquivo CSV: ${err.message || 'Formato inválido'}`
        };
    }
}

/**
 * Checks parsed items against existing system transactions to flag duplicates.
 */
export function flagDuplicates(
    items: ParsedStatementItem[],
    existingTransactions: Transaction[],
    targetAccountId: string
): { items: ParsedStatementItem[]; duplicateCount: number } {
    let duplicateCount = 0;

    const updated = items.map(item => {
        // Find existing transaction matching date, account, and amount (within 0.02 tolerance)
        const match = existingTransactions.find(existing => {
            const sameAccount = !targetAccountId || targetAccountId === 'all' || existing.accountId === targetAccountId;
            if (!sameAccount) return false;

            const existingDate = existing.date.split('T')[0];
            const sameDate = existingDate === item.date;
            const sameAmount = Math.abs(Number(existing.amount) - item.amount) < 0.02;
            const sameType = existing.transactionType === item.transactionType;

            return sameDate && sameAmount && sameType;
        });

        if (match) {
            duplicateCount++;
            return {
                ...item,
                isDuplicate: true,
                duplicateReason: `Duplicata detectada: Já existe "${match.description}" de R$ ${match.amount.toFixed(2)} em ${item.date}`,
                selected: false // Default to unselected so user is protected from double entry
            };
        }

        return {
            ...item,
            isDuplicate: false,
            selected: true
        };
    });

    return { items: updated, duplicateCount };
}
