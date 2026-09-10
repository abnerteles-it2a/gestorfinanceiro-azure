
import React, { useState, useEffect } from 'react';
import { useFinancialData } from '../context/FinancialDataContext';
import { parseTransactionFromText } from '../services/marketDataService';
import { recordCategoryPreference, recordAccountPreference, recordPaymentPreference } from '../services/marketDataService';
import { toIsoLocalDate, dateKey } from '../utils/formatters';
import { SparklesIcon, PlusIcon } from './icons';
import { StatusTag } from './ui/StatusTag';
import { AddTransactionModal } from './AddTransactionModal';
import { Modal } from './shared/Modal';
import { TransactionType } from '../types';
import { useToast } from '../context/ToastContext';
import { VoiceRecordButton } from './ui/VoiceRecordButton';

export const SmartTransactionWidget: React.FC = () => {
    const { categories, accounts, addTransaction, transactions, costCenters, addCategory, viewMode } = useFinancialData();
    const { showToast } = useToast();
    const provider = String(((import.meta as any)?.env?.VITE_AI_PROVIDER) || '').trim().toLowerCase();
    const [inputText, setInputText] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [aiMeta, setAiMeta] = useState<{ provider?: string; model?: string } | null>(null);
    const [preview, setPreview] = useState<{
        accountId: string;
        type: 'Entrada' | 'Saída';
        category: string;
        description: string;
        amount: number;
        date: string;
        paymentMethod?: string;
        costCenterId?: string;
        inferredCategory?: boolean;
        inferredPayment?: boolean;
        inferredAccount?: boolean;
        inferredCostCenter?: boolean;
        inferredCategoryReason?: string;
        inferredPaymentReason?: string;
        inferredAccountReason?: string;
        inferredCostCenterReason?: string;
    } | null>(null);
    const [validateOpen, setValidateOpen] = useState(false);
    const [quickMode, setQuickMode] = useState<'save' | 'validate'>(() => {
        try {
            const v = window.localStorage.getItem('gestor_financeiro_quickAddMode');
            if (v === 'save' || v === 'validate') return v as any;
            return 'validate';
        } catch { return 'validate'; }
    });
    const [dupConfirmOpen, setDupConfirmOpen] = useState(false);
    const [dupPayload, setDupPayload] = useState<{
        accountId: string;
        type: 'Entrada'|'Saída';
        category: string;
        description: string;
        amount: number;
        date: string;
        paymentMethod?: string;
        costCenterId?: string;
    } | null>(null);
    const [dupSource, setDupSource] = useState<'quick'|'validate'>('quick');
    useEffect(() => {
        try { window.localStorage.setItem('gestor_financeiro_quickAddMode', quickMode); } catch {}
    }, [quickMode]);

    useEffect(() => {
        if (validateOpen) {
            try {
                const k = 'gestor_financeiro_weekValidations';
                const v = parseInt(window.localStorage.getItem(k) || '0', 10) || 0;
                window.localStorage.setItem(k, String(v + 1));
                window.localStorage.setItem('gestor_financeiro_lastValidationTs', new Date().toISOString());
            } catch {}
        }
    }, [validateOpen]);

    const computeConfidence = (p: { accountId: string; type: 'Entrada'|'Saída'; category: string; description: string; amount: number; date: string; paymentMethod?: string; }) => {
        let score = 0;
        const lower = (p.description || '').toLowerCase();
        const tokens = lower.split(/[^a-zA-Z0-9çáàâãéêíóôõúü]+/).filter(t => t && t.length >= 3);
        try {
            const catRaw = window.localStorage.getItem('smartCategoryPrefs');
            const accRaw = window.localStorage.getItem('smartAccountPrefs');
            const payRaw = window.localStorage.getItem('smartPaymentPrefs');
            const catPrefs = catRaw ? JSON.parse(catRaw) : {};
            const accPrefs = accRaw ? JSON.parse(accRaw) : {};
            const payPrefs = payRaw ? JSON.parse(payRaw) : {};
            const hasCatPref = tokens.some(t => {
                const val = catPrefs[t];
                return typeof val === 'string' && val.toLowerCase() === p.category.toLowerCase();
            });
            const hasAccPref = tokens.some(t => {
                const val = accPrefs[t];
                return typeof val === 'string' && val === p.accountId;
            });
            const hasPayPref = tokens.some(t => {
                const val = payPrefs[t];
                return typeof val === 'string' && val.toLowerCase() === (p.paymentMethod || 'Outros').toLowerCase();
            });
            if (hasCatPref) score += 35;
            if (hasAccPref) score += 35;
            if (hasPayPref) score += 10;
        } catch {}
        if (p.amount && p.amount > 0) score += 10;
        if (p.date && String(p.date).length >= 8) score += 5;
        const accName = accounts.find(a => a.id === p.accountId)?.name?.toLowerCase() || '';
        if (accName && lower.includes(accName)) score += 5;
        const incomeWords = ["salario","salário","recebi","entrada","deposito","depósito","bonus","bônus","rendimento","juros","cashback","venda","reembolso","provento","pix recebido"];
        const expenseWords = ["paguei","pagamento","compra","almoço","mercado","supermercado","uber","ifood","aluguel","conta","internet","energia","luz","gas","gasolina","transporte","cinema","lazer","assinatura","netflix","spotify","restaurante","padaria"];
        const hasIncomeCue = incomeWords.some(w => lower.includes(w));
        const hasExpenseCue = expenseWords.some(w => lower.includes(w));
        if ((p.type === 'Entrada' && hasIncomeCue) || (p.type === 'Saída' && hasExpenseCue)) score += 5;
        const label = score >= 75 ? 'Certeza alta' : score >= 45 ? 'Certeza média' : 'Certeza baixa';
        const color = score >= 75 ? 'bg-green-100 text-green-800 dark:bg-green-600/30 dark:text-green-300' : score >= 45 ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-600/30 dark:text-yellow-300' : 'bg-red-100 text-red-800 dark:bg-red-600/30 dark:text-red-300';
        return { score, label, color };
    };

    const inferCategoryWithReason = (description: string, type: 'Entrada'|'Saída', available: string[]): { value: string, reason: string } | null => {
        const lower = (description || '').toLowerCase();
        const tokens = lower.split(/[^a-zA-Z0-9çáàâãéêíóôõúü]+/).filter(t => t && t.length >= 3);
        const lex: { key: string; cat: string }[] = [
            { key: 'aluguel', cat: 'Aluguel' },
            { key: 'condominio', cat: 'Condomínio' },
            { key: 'internet', cat: 'Internet' },
            { key: 'energia', cat: 'Luz' },
            { key: 'luz', cat: 'Luz' },
            { key: 'agua', cat: 'Água' },
            { key: 'água', cat: 'Água' },
            { key: 'gás', cat: 'Gás' },
            { key: 'gas', cat: 'Gás' },
            { key: 'telefone', cat: 'Telefonia' },
            { key: 'telefonia', cat: 'Telefonia' },
            { key: 'celular', cat: 'Telefonia' },
            { key: 'recarga', cat: 'Telefonia' },
            { key: 'plano', cat: 'Telefonia' },
            { key: 'supermercado', cat: 'Mercado' },
            { key: 'mercado', cat: 'Mercado' },
            { key: 'feira', cat: 'Mercado' },
            { key: 'hortifruti', cat: 'Mercado' },
            { key: 'acougue', cat: 'Mercado' },
            { key: 'açougue', cat: 'Mercado' },
            { key: 'fruta', cat: 'Mercado' },
            { key: 'frutas', cat: 'Mercado' },
            { key: 'legume', cat: 'Mercado' },
            { key: 'legumes', cat: 'Mercado' },
            { key: 'carrefour', cat: 'Mercado' },
            { key: 'pão de açúcar', cat: 'Mercado' },
            { key: 'pao de acucar', cat: 'Mercado' },
            { key: 'extra', cat: 'Mercado' },
            { key: 'tridico', cat: 'Mercado' },
            { key: 'amigão', cat: 'Mercado' },
            { key: 'amigao', cat: 'Mercado' },
            { key: 'assai', cat: 'Mercado' },
            { key: 'assaí', cat: 'Mercado' },
            { key: 'atacadão', cat: 'Mercado' },
            { key: 'atacadao', cat: 'Mercado' },
            { key: 'makro', cat: 'Mercado' },
            { key: 'dia', cat: 'Mercado' },
            { key: 'big', cat: 'Mercado' },
            { key: 'zaffari', cat: 'Mercado' },
            { key: 'angeloni', cat: 'Mercado' },
            { key: 'prezunic', cat: 'Mercado' },
            { key: 'sonda', cat: 'Mercado' },
            { key: 'guanabara', cat: 'Mercado' },
            { key: 'muffato', cat: 'Mercado' },
            { key: 'condor', cat: 'Mercado' },
            { key: 'tauste', cat: 'Mercado' },
            { key: 'oba', cat: 'Mercado' },
            { key: 'oba hortifruti', cat: 'Mercado' },
            { key: 'st marche', cat: 'Mercado' },
            { key: 'super nosso', cat: 'Mercado' },
            { key: 'comper', cat: 'Mercado' },
            { key: 'fort atacadista', cat: 'Mercado' },
            { key: 'ampm', cat: 'Mercado' },
            { key: 'shell select', cat: 'Mercado' },
            { key: 'padaria', cat: 'Padaria' },
            { key: 'café', cat: 'Padaria' },
            { key: 'cafe', cat: 'Padaria' },
            { key: 'lanche', cat: 'Padaria' },
            { key: 'lanchonete', cat: 'Padaria' },
            { key: 'café da manhã', cat: 'Padaria' },
            { key: 'starbucks', cat: 'Padaria' },
            { key: 'casa do pão de queijo', cat: 'Padaria' },
            { key: 'almoço', cat: 'Restaurante' },
            { key: 'jantar', cat: 'Restaurante' },
            { key: 'restaurante', cat: 'Restaurante' },
            { key: 'pizzaria', cat: 'Restaurante' },
            { key: 'churrascaria', cat: 'Restaurante' },
            { key: 'sushi', cat: 'Restaurante' },
            { key: 'mc donald', cat: 'Restaurante' },
            { key: 'mc donalds', cat: 'Restaurante' },
            { key: 'mcdonald', cat: 'Restaurante' },
            { key: 'mcdonalds', cat: 'Restaurante' },
            { key: 'burger king', cat: 'Restaurante' },
            { key: 'subway', cat: 'Restaurante' },
            { key: 'outback', cat: 'Restaurante' },
            { key: 'coco bambu', cat: 'Restaurante' },
            { key: 'habibs', cat: 'Restaurante' },
            { key: 'ragazzo', cat: 'Restaurante' },
            { key: 'madero', cat: 'Restaurante' },
            { key: 'pizza hut', cat: 'Restaurante' },
            { key: 'dominos', cat: 'Restaurante' },
            { key: 'kfc', cat: 'Restaurante' },
            { key: 'giraffas', cat: 'Restaurante' },
            { key: 'delivery', cat: 'Delivery' },
            { key: 'ifood', cat: 'Delivery' },
            { key: 'rappi', cat: 'Delivery' },
            { key: 'bebidas', cat: 'Bebidas' },
            { key: 'refrigerante', cat: 'Bebidas' },
            { key: 'cerveja', cat: 'Bebidas' },
            { key: 'vinho', cat: 'Bebidas' },
            { key: 'whisky', cat: 'Bebidas' },
            { key: 'vodka', cat: 'Bebidas' },
            { key: 'adega', cat: 'Bebidas' },
            { key: 'bar', cat: 'Bebidas' },
            { key: 'pub', cat: 'Bebidas' },
            { key: 'kopenhagen', cat: 'Presentes' },
            { key: 'cacau show', cat: 'Presentes' },
            { key: 'uber', cat: 'Transporte' },
            { key: '99', cat: 'Transporte' },
            { key: 'taxi', cat: 'Transporte' },
            { key: 'ônibus', cat: 'Transporte' },
            { key: 'onibus', cat: 'Transporte' },
            { key: 'metrô', cat: 'Transporte' },
            { key: 'metro', cat: 'Transporte' },
            { key: 'trem', cat: 'Transporte' },
            { key: 'passagem', cat: 'Transporte' },
            { key: 'pedágio', cat: 'Transporte' },
            { key: 'pedagio', cat: 'Transporte' },
            { key: 'estacionamento', cat: 'Estacionamento' },
            { key: 'manutenção', cat: 'Manutenção' },
            { key: 'manutencao', cat: 'Manutenção' },
            { key: 'carro', cat: 'Carro' },
            { key: 'oficina', cat: 'Manutenção' },
            { key: 'mecânico', cat: 'Manutenção' },
            { key: 'mecanico', cat: 'Manutenção' },
            { key: 'óleo', cat: 'Manutenção' },
            { key: 'oleo', cat: 'Manutenção' },
            { key: 'pneu', cat: 'Manutenção' },
            { key: 'seguro', cat: 'Serviços' },
            { key: 'gasolina', cat: 'Combustível' },
            { key: 'combustivel', cat: 'Combustível' },
            { key: 'combustível', cat: 'Combustível' },
            { key: 'diesel', cat: 'Combustível' },
            { key: 'etanol', cat: 'Combustível' },
            { key: 'gnv', cat: 'Combustível' },
            { key: 'posto', cat: 'Combustível' },
            { key: 'cinema', cat: 'Lazer' },
            { key: 'teatro', cat: 'Lazer' },
            { key: 'show', cat: 'Lazer' },
            { key: 'parque', cat: 'Lazer' },
            { key: 'festa', cat: 'Lazer' },
            { key: 'lazer', cat: 'Lazer' },
            { key: 'netflix', cat: 'Assinaturas' },
            { key: 'spotify', cat: 'Assinaturas' },
            { key: 'prime video', cat: 'Assinaturas' },
            { key: 'disney', cat: 'Assinaturas' },
            { key: 'globoplay', cat: 'Assinaturas' },
            { key: 'hbo', cat: 'Assinaturas' },
            { key: 'youtube premium', cat: 'Assinaturas' },
            { key: 'icloud', cat: 'Assinaturas' },
            { key: 'google drive', cat: 'Assinaturas' },
            { key: 'microsoft 365', cat: 'Assinaturas' },
            { key: 'adobe', cat: 'Assinaturas' },
            { key: 'farmácia', cat: 'Farmácia' },
            { key: 'farmacia', cat: 'Farmácia' },
            { key: 'drogasil', cat: 'Farmácia' },
            { key: 'droga raia', cat: 'Farmácia' },
            { key: 'drogaria são paulo', cat: 'Farmácia' },
            { key: 'drogaria sao paulo', cat: 'Farmácia' },
            { key: 'raia', cat: 'Farmácia' },
            { key: 'pague menos', cat: 'Farmácia' },
            { key: 'panvel', cat: 'Farmácia' },
            { key: 'ultrafarma', cat: 'Farmácia' },
            { key: 'extrafarma', cat: 'Farmácia' },
            { key: 'onofre', cat: 'Farmácia' },
            { key: 'são joão', cat: 'Farmácia' },
            { key: 'farmácias são joão', cat: 'Farmácia' },
            { key: 'venâncio', cat: 'Farmácia' },
            { key: 'drogaria venâncio', cat: 'Farmácia' },
            { key: 'nissei', cat: 'Farmácia' },
            { key: 'araújo', cat: 'Farmácia' },
            { key: 'araujo', cat: 'Farmácia' },
            { key: 'pacheco', cat: 'Farmácia' },
            { key: 'drogaria pacheco', cat: 'Farmácia' },
            { key: 'catarinense', cat: 'Farmácia' },
            { key: 'minas brasil', cat: 'Farmácia' },
            { key: 'saúde', cat: 'Saúde' },
            { key: 'saude', cat: 'Saúde' },
            { key: 'exame', cat: 'Saúde' },
            { key: 'consulta', cat: 'Saúde' },
            { key: 'dentista', cat: 'Saúde' },
            { key: 'médico', cat: 'Saúde' },
            { key: 'medico', cat: 'Saúde' },
            { key: 'psicólogo', cat: 'Saúde' },
            { key: 'psicologo', cat: 'Saúde' },
            { key: 'hospital', cat: 'Saúde' },
            { key: 'plano de saúde', cat: 'Saúde' },
            { key: 'educação', cat: 'Educação' },
            { key: 'educacao', cat: 'Educação' },
            { key: 'escola', cat: 'Educação' },
            { key: 'curso', cat: 'Educação' },
            { key: 'faculdade', cat: 'Educação' },
            { key: 'material escolar', cat: 'Educação' },
            { key: 'livro', cat: 'Livros' },
            { key: 'livros', cat: 'Livros' },
            { key: 'tecnologia', cat: 'Tecnologia' },
            { key: 'software', cat: 'Tecnologia' },
            { key: 'eletrônico', cat: 'Eletrônicos' },
            { key: 'eletronico', cat: 'Eletrônicos' },
            { key: 'eletrônicos', cat: 'Eletrônicos' },
            { key: 'hardware', cat: 'Eletrônicos' },
            { key: 'ferramenta', cat: 'Ferramentas' },
            { key: 'ferramentas', cat: 'Ferramentas' },
            { key: 'limpeza', cat: 'Limpeza' },
            { key: 'reforma', cat: 'Reformas' },
            { key: 'obra', cat: 'Reformas' },
            { key: 'jardim', cat: 'Jardinagem' },
            { key: 'jardinagem', cat: 'Jardinagem' },
            { key: 'escritório', cat: 'Escritório' },
            { key: 'escritorio', cat: 'Escritório' },
            { key: 'home office', cat: 'Home Office' },
            { key: 'academia', cat: 'Academia' },
            { key: 'crossfit', cat: 'Academia' },
            { key: 'pilates', cat: 'Academia' },
            { key: 'jogos', cat: 'Jogos' },
            { key: 'psn', cat: 'Jogos' },
            { key: 'xbox', cat: 'Jogos' },
            { key: 'steam', cat: 'Jogos' },
            { key: 'música', cat: 'Música' },
            { key: 'musica', cat: 'Música' },
            { key: 'instrumento', cat: 'Música' },
            { key: 'viagem', cat: 'Viagens' },
            { key: 'viagens', cat: 'Viagens' },
            { key: 'passagens', cat: 'Passagens' },
            { key: 'hotel', cat: 'Hotel' },
            { key: 'pet', cat: 'Pet' },
            { key: 'veterinário', cat: 'Pet' },
            { key: 'veterinario', cat: 'Pet' },
            { key: 'ração', cat: 'Pet' },
            { key: 'racao', cat: 'Pet' },
            { key: 'banho', cat: 'Pet' },
            { key: 'tosa', cat: 'Pet' },
            { key: 'criança', cat: 'Crianças' },
            { key: 'crianca', cat: 'Crianças' },
            { key: 'fralda', cat: 'Crianças' },
            { key: 'brinquedo', cat: 'Crianças' },
            { key: 'roupa', cat: 'Roupas' },
            { key: 'vestuário', cat: 'Roupas' },
            { key: 'vestuario', cat: 'Roupas' },
            { key: 'calçado', cat: 'Roupas' },
            { key: 'calcado', cat: 'Roupas' },
            { key: 'sapato', cat: 'Roupas' },
            { key: 'tênis', cat: 'Roupas' },
            { key: 'tenis', cat: 'Roupas' },
            { key: 'beleza', cat: 'Beleza' },
            { key: 'barbearia', cat: 'Barbearia' },
            { key: 'salão', cat: 'Beleza' },
            { key: 'salao', cat: 'Beleza' },
            { key: 'manicure', cat: 'Beleza' },
            { key: 'maquiagem', cat: 'Beleza' },
            { key: 'cosmético', cat: 'Beleza' },
            { key: 'cosmetico', cat: 'Beleza' },
            { key: 'cuidados pessoais', cat: 'Cuidados Pessoais' },
            { key: 'presentes', cat: 'Presentes' },
            { key: 'aniversário', cat: 'Presentes' },
            { key: 'aniversario', cat: 'Presentes' },
            { key: 'casamento', cat: 'Presentes' },
            { key: 'doação', cat: 'Doações' },
            { key: 'doacao', cat: 'Doações' },
            { key: 'dízimo', cat: 'Doações' },
            { key: 'dizimo', cat: 'Doações' },
            { key: 'imposto', cat: 'Impostos' },
            { key: 'iptu', cat: 'Impostos' },
            { key: 'ipva', cat: 'Impostos' },
            { key: 'darf', cat: 'Impostos' },
            { key: 'taxa', cat: 'Impostos' },
            { key: 'multa', cat: 'Impostos' },
            { key: 'tarifa', cat: 'Tarifas Bancárias' },
            { key: 'anuidade', cat: 'Tarifas Bancárias' },
            { key: 'iof', cat: 'Tarifas Bancárias' },
            { key: 'juros', cat: 'Tarifas Bancárias' },
            { key: 'doc', cat: 'Tarifas Bancárias' },
            { key: 'ted', cat: 'Tarifas Bancárias' },
            { key: 'serviço', cat: 'Serviços' },
            { key: 'servico', cat: 'Serviços' },
            { key: 'jurídico', cat: 'Serviços / Jurídico' },
            { key: 'juridico', cat: 'Serviços / Jurídico' },
            { key: 'advogado', cat: 'Serviços / Jurídico' },
            { key: 'cartório', cat: 'Serviços / Jurídico' },
            { key: 'cartorio', cat: 'Serviços / Jurídico' },
            { key: 'investimento', cat: 'Investimentos' },
            { key: 'ações', cat: 'Ações' },
            { key: 'acao', cat: 'Ações' },
            { key: 'ações br', cat: 'Ações' },
            { key: 'fii', cat: 'FII' },
            { key: 'renda fixa', cat: 'Renda Fixa' },
            { key: 'cripto', cat: 'Cripto' },
            { key: 'bitcoin', cat: 'Cripto' },
            { key: 'btc', cat: 'Cripto' },
            { key: 'internacional', cat: 'Investimentos' },
            { key: 'exterior', cat: 'Investimentos' },
            { key: 'material de construção', cat: 'Reformas' },
            { key: 'construção', cat: 'Reformas' },
            { key: 'construcao', cat: 'Reformas' },
            { key: 'salário', cat: 'Salário' },
            { key: 'salario', cat: 'Salário' },
            { key: 'freelance', cat: 'Freelance' },
            { key: 'provento', cat: 'Renda Extra' },
            { key: 'pix recebido', cat: 'Renda Extra' },
            { key: 'cashback', cat: 'Renda Extra' },
            { key: 'reembolso', cat: 'Renda Extra' },
            { key: 'venda', cat: 'Renda Extra' },
            { key: 'aluguel recebido', cat: 'Renda Extra' }
        ];
        const entryCats = ['Salário', 'Freelance', 'Renda Extra'];
        const allCats = Array.from(new Set(available));
        const expenseCats = allCats.filter(c => !entryCats.includes(c));
        const list = type === 'Entrada' ? lex.filter(l => entryCats.includes(l.cat)) : lex;
        const ordered = [...list].sort((a,b) => b.key.length - a.key.length);
        for (const l of ordered) {
            const isTokenHit = tokens.includes(l.key);
            const isLongPhraseHit = l.key.length >= 5 && lower.includes(l.key);
            if (isTokenHit || isLongPhraseHit) return { value: l.cat, reason: `Pista lexical (“${l.key}”)` };
        }
        try {
            const raw = window.localStorage.getItem('smartCategoryPrefs');
            const prefs = raw ? JSON.parse(raw) : {};
            const votes: Record<string, number> = {};
            const tokenHits: Record<string, string[]> = {};
            tokens.forEach(t => {
                const cat = prefs[t];
                if (cat && available.includes(cat)) {
                    votes[cat] = (votes[cat] || 0) + 1;
                    tokenHits[cat] = [...(tokenHits[cat] || []), t];
                }
            });
            const best = Object.entries(votes).sort((a,b)=>b[1]-a[1])[0]?.[0];
            if (best) return { value: best, reason: `Preferência aprendida (${(tokenHits[best]||[])[0]})` };
        } catch {}
        return null;
    };

    const inferPaymentMethodWithReason = (description: string): { value: string, reason: string } | null => {
        const lower = (description || '').toLowerCase();
        const tokens = lower.split(/[^a-zA-Z0-9çáàâãéêíóôõúü]+/).filter(t => t && t.length >= 3);
        try {
            const raw = window.localStorage.getItem('smartPaymentPrefs');
            const prefs = raw ? JSON.parse(raw) : {};
            const votes: Record<string, number> = {};
            const tokenHits: Record<string, string[]> = {};
            tokens.forEach(t => {
                const pm = prefs[t];
                if (typeof pm === 'string' && pm.length > 0) {
                    votes[pm] = (votes[pm] || 0) + 1;
                    tokenHits[pm] = [...(tokenHits[pm] || []), t];
                }
            });
            const best = Object.entries(votes).sort((a,b)=>b[1]-a[1])[0]?.[0];
            if (best) return { value: best, reason: `Preferência aprendida (${(tokenHits[best]||[])[0]})` };
        } catch {}
        if (lower.includes('pix')) return { value: 'PIX', reason: 'Pista lexical (“pix”)' };
        if (lower.includes('débito') || lower.includes('debito')) return { value: 'Cartão de Débito', reason: 'Pista lexical (“débito”)' };
        if (lower.includes('crédito') || lower.includes('credito') || lower.includes('cartão')) return { value: 'Cartão de Crédito', reason: 'Pista lexical (“crédito/cartão”)' };
        if (lower.includes('dinheiro') || lower.includes('cash')) return { value: 'Dinheiro', reason: 'Pista lexical (“dinheiro”)' };
        if (lower.includes('transferência') || lower.includes('transferencia')) return { value: 'Transferência Bancária', reason: 'Pista lexical (“transferência”)' };
        if (lower.includes('boleto')) return { value: 'Boleto', reason: 'Pista lexical (“boleto”)' };
        if (lower.includes('débito automático') || lower.includes('debito automatico')) return { value: 'Débito Automático', reason: 'Pista lexical (“débito automático”)' };
        return null;
    };

    const inferAccountIdWithReason = (description: string, list: { id: string; name: string }[]): { value: string, reason: string } | null => {
        const lower = (description || '').toLowerCase();
        const tokens = lower.split(/[^a-zA-Z0-9çáàâãéêíóôõúü]+/).filter(t => t && t.length >= 3);
        try {
            const raw = window.localStorage.getItem('smartAccountPrefs');
            const prefs = raw ? JSON.parse(raw) : {};
            const votes: Record<string, number> = {};
            const tokenHits: Record<string, string[]> = {};
            tokens.forEach(t => {
                const acc = prefs[t];
                if (typeof acc === 'string' && acc.length > 0) {
                    votes[acc] = (votes[acc] || 0) + 1;
                    tokenHits[acc] = [...(tokenHits[acc] || []), t];
                }
            });
            const best = Object.entries(votes).sort((a,b)=>b[1]-a[1])[0]?.[0];
            if (best && list.some(x => x.id === best)) return { value: best, reason: `Preferência aprendida (${(tokenHits[best]||[])[0]})` };
        } catch {}
        for (const a of list) {
            if (lower.includes((a.name || '').toLowerCase())) return { value: a.id, reason: `Nome da conta (“${a.name}”)` };
        }
        const bankHints: { key: string; match: string }[] = [
            { key: 'nubank', match: 'nubank' },
            { key: 'itaú', match: 'itaú' },
            { key: 'itau', match: 'itaú' },
            { key: 'bradesco', match: 'bradesco' },
            { key: 'santander', match: 'santander' },
            { key: 'inter', match: 'inter' },
            { key: 'picpay', match: 'picpay' },
            { key: 'caixa', match: 'caixa' },
            { key: 'banco do brasil', match: 'brasil' },
            { key: 'bb', match: 'brasil' },
            { key: 'next', match: 'next' },
            { key: 'c6', match: 'c6' },
            { key: 'xp', match: 'xp' },
        ];
        for (const h of bankHints) {
            if (lower.includes(h.key)) {
                const found = list.find(x => (x.name || '').toLowerCase().includes(h.match));
                if (found) return { value: found.id, reason: `Pista lexical (“${h.key}”)` };
            }
        }
        return null;
    };

    const saveFromPreview = async (p: { accountId: string; type: 'Entrada'|'Saída'; category: string; description: string; amount: number; date: string; paymentMethod?: string; costCenterId?: string; }) => {
        const txType = p.type === 'Entrada' ? TransactionType.INCOME : TransactionType.EXPENSE;
        const normalized = (s: string) => (s || '').toLowerCase().replace(/\s+/g,' ').trim();
        const sameDay = (a: string, b: string) => dateKey(a) === dateKey(b);
        const isDup = transactions.some(t => t.accountId === p.accountId && t.transactionType === txType && Math.abs(t.amount - p.amount) < 0.01 && sameDay(t.date, p.date) && (normalized(t.description) === normalized(p.description) || normalized(t.description).includes(normalized(p.description)) || normalized(p.description).includes(normalized(t.description))));
        if (isDup) { setDupPayload(p); setDupSource('quick'); setDupConfirmOpen(true); return; }
        const exists = categories.some(c => c.name.toLowerCase() === p.category.toLowerCase());
        if (!exists) {
            try { await addCategory({ name: p.category, type: p.type, icon: '' }); } catch {}
        }
        await addTransaction({
            accountId: p.accountId,
            transactionType: txType,
            category: p.category,
            description: p.description,
            amount: p.amount,
            date: toIsoLocalDate(p.date),
            paymentMethod: p.paymentMethod || 'Outros',
            costCenterId: p.costCenterId
        });
        try {
            recordCategoryPreference(p.description, p.category);
            recordAccountPreference(p.description, p.accountId);
            recordPaymentPreference(p.description, p.paymentMethod || 'Outros');
        } catch {}
        showToast("Transação criada.", "success");
        setPreview(null);
        setInputText('');
        setValidateOpen(false);
    };

    const handleProcess = async (e?: React.FormEvent, overrideText?: string) => {
        if (e) e.preventDefault();
        const textToProcess = (overrideText || inputText).trim();
        if (!textToProcess) return;

        setIsLoading(true);
        
        const categoryNames = categories.map(c => c.name);
        const accountList = accounts.map(a => ({ id: a.id, name: a.name }));
        if (accounts.length === 0) {
            showToast("Cadastre uma conta antes de lançar.", "error");
            setIsLoading(false);
            return;
        }

        const lowerText = textToProcess.toLowerCase();
        const hasAmountCandidate = (
            /r\$\s*(\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?)/i.test(lowerText) ||
            /(\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?)\s*reais?/i.test(lowerText) ||
            /(\d{2,6}(?:[.,]\d{1,2})?)(?:\s*(?:rs?|reais?))?/i.test(lowerText) ||
            /(\d{1,3}(?:,\d{1,2})?)\s*mil/i.test(lowerText)
        );

        let aiTx: any = null;
        try {
            const payload = {
                kind: 'transaction',
                context: {
                    text: textToProcess,
                    today: `${new Date().getFullYear()}-${String(new Date().getMonth()+1).padStart(2,'0')}-${String(new Date().getDate()).padStart(2,'0')}`,
                    categories: categoryNames,
                    accounts: accountList,
                    costCenters: costCenters.map(c => ({ id: c.id, name: c.name }))
                }
            };
            const headers: Record<string, string> = { 'content-type': 'application/json' };
            if (viewMode) headers['x-view-mode'] = viewMode;
            const r = await fetch('/api/ai/advice', { method: 'POST', headers, body: JSON.stringify(payload) });
            const j = await r.json();
            if (r.ok && j?.transaction) {
                aiTx = j.transaction;
                setAiMeta({ provider: j?.provider || 'gestor_financeiro', model: j?.model || 'Gestor Financeiro Intelligence Engine' });
            } else {
                setAiMeta(null);
            }
        } catch {}

        const result = aiTx || await parseTransactionFromText(textToProcess, categoryNames, accountList);

        if (result) {
            const finalAccountId = result.accountId || (accounts.length > 0 ? accounts[0].id : '');
            if (!finalAccountId) {
                showToast("Não foi possível identificar uma conta válida.", "error");
                setIsLoading(false);
                return;
            }
            let p = {
                accountId: finalAccountId,
                type: result.type === 'Entrada' ? 'Entrada' : 'Saída',
                category: result.category || 'Outros',
                description: result.description,
                amount: result.amount,
                date: result.date,
                paymentMethod: result.paymentMethod || 'Outros'
            } as const;
            {
                const avail = categories.map(c => c.name);
                const guessed = inferCategoryWithReason(p.description, p.type, avail);
                if (guessed) {
                    const override = (!p.category || p.category === 'Outros' || String(guessed.reason || '').toLowerCase().includes('pista lexical')) && guessed.value && guessed.value !== p.category;
                    if (override) {
                        let nextCat = guessed.value;
                        const exists = avail.some(c => c.toLowerCase() === nextCat.toLowerCase());
                        if (!exists) {
                            try {
                                await addCategory({ name: nextCat, type: p.type, icon: '' });
                            } catch {}
                        }
                        p = { ...p, category: nextCat, inferredCategory: true, inferredCategoryReason: guessed.reason } as any;
                    }
                }
            }
            if (!p.paymentMethod || p.paymentMethod === 'Outros') {
                const guessedPm = inferPaymentMethodWithReason(p.description);
                if (guessedPm) p = { ...p, paymentMethod: guessedPm.value, inferredPayment: true, inferredPaymentReason: guessedPm.reason } as any;
            }
            if (!result.accountId || p.accountId === (accounts[0]?.id || '')) {
                const guessedAcc = inferAccountIdWithReason(p.description, accounts.map(a => ({ id: a.id, name: a.name })));
                if (guessedAcc) p = { ...p, accountId: guessedAcc.value, inferredAccount: true, inferredAccountReason: guessedAcc.reason } as any;
            }
            if (costCenters.length > 0) {
                const normalize = (s: string) => (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();
                const lower = normalize(textToProcess);
                const list = costCenters.map(c => ({ id: c.id, name: c.name, norm: normalize(c.name) }));
                let ccGuess: { value: string; reason: string } | null = null;
                const direct = list.find(c => lower.includes(c.norm));
                if (direct) {
                    ccGuess = { value: direct.id, reason: `Pista lexical (“${direct.name}”)` };
                } else {
                    const synonyms: { key: string; words: string[] }[] = [
                        { key: 'pessoal', words: ['pessoal', 'pessoais'] },
                        { key: 'profissional', words: ['profissional', 'empresa', 'cnpj', 'negocio', 'business'] }
                    ];
                    for (const s of synonyms) {
                        if (s.words.some(w => lower.includes(w))) {
                            const found = list.find(c => c.norm.includes(s.key));
                            if (found) { ccGuess = { value: found.id, reason: `Pista lexical (“${s.key}”)` }; break; }
                        }
                    }
                    if (!ccGuess) {
                        const m = /cc\s+([^\n]+)/i.exec(lower) || /centro\s+de\s+custo\s+([^\n]+)/i.exec(lower);
                        if (m && m[1]) {
                            const raw = m[1].trim();
                            const token = normalize(raw.replace(/[0-9/.,;\-]+.*$/i, ''));
                            const found = list.find(c => c.norm.includes(token));
                            if (found) ccGuess = { value: found.id, reason: `Menção “${token}”` };
                        }
                    }
                }
                if (ccGuess) p = { ...p, costCenterId: ccGuess.value, inferredCostCenter: true, inferredCostCenterReason: ccGuess.reason } as any;
            }
            // Centro de custo: se existir um único, atribuir; se houver vários e estiver faltando, abrir modal para perguntar
            let costCenterId: string | undefined = (p as any).costCenterId;
            if (!costCenterId && costCenters.length === 1) {
                costCenterId = costCenters[0].id;
            }
            const enriched = { ...p, costCenterId } as any;
            const needsCostCenterChoice = costCenters.length > 1 && !enriched.costCenterId;
            const needsValidation = needsCostCenterChoice;
            if (needsValidation) {
                setPreview(enriched);
                setValidateOpen(true);
                showToast('Selecione o Centro de Custo antes de salvar.', 'info');
            } else {
                await saveFromPreview(enriched);
            }
        } else {
            if (!hasAmountCandidate) {
                showToast("Informe um valor (ex.: R$ 45 ou 45 reais).", "error");
            } else {
                showToast("Não entendi a transação. Tente ser mais específico.", "error");
            }
        }
        setIsLoading(false);
    };

    const handleConfirm = async () => {
        if (!preview) return;
        const txType = preview.type === 'Entrada' ? TransactionType.INCOME : TransactionType.EXPENSE;
        const normalized = (s: string) => (s || '').toLowerCase().replace(/\s+/g,' ').trim();
        const sameDay = (a: string, b: string) => dateKey(a) === dateKey(b);
        const isDup = transactions.some(t => t.accountId === preview.accountId && t.transactionType === txType && Math.abs(t.amount - preview.amount) < 0.01 && sameDay(t.date, preview.date) && (normalized(t.description) === normalized(preview.description) || normalized(t.description).includes(normalized(preview.description)) || normalized(preview.description).includes(normalized(t.description))));
        if (isDup) { 
            setDupPayload({
                accountId: preview.accountId,
                type: preview.type,
                category: preview.category,
                description: preview.description,
                amount: preview.amount,
                date: preview.date,
                paymentMethod: preview.paymentMethod,
                costCenterId: preview.costCenterId
            });
            setDupSource('validate');
            setDupConfirmOpen(true);
            return;
        }
        const exists = categories.some(c => c.name.toLowerCase() === preview.category.toLowerCase());
        if (!exists) {
            try { await addCategory({ name: preview.category, type: preview.type, icon: '' }); } catch {}
        }
        await addTransaction({
            accountId: preview.accountId,
            transactionType: txType,
            category: preview.category,
            description: preview.description,
            amount: preview.amount,
            date: toIsoLocalDate(preview.date),
            paymentMethod: preview.paymentMethod || 'Outros',
            costCenterId: preview.costCenterId
        });
        try {
            recordCategoryPreference(preview.description, preview.category);
            recordAccountPreference(preview.description, preview.accountId);
            recordPaymentPreference(preview.description, preview.paymentMethod || 'Outros');
        } catch {}
        showToast("Transação criada.", "success");
        setPreview(null);
        setInputText('');
    };
    const confirmDupSave = async () => {
        if (!dupPayload) { setDupConfirmOpen(false); return; }
        const txType = dupPayload.type === 'Entrada' ? TransactionType.INCOME : TransactionType.EXPENSE;
        const exists = categories.some(c => c.name.toLowerCase() === dupPayload.category.toLowerCase());
        if (!exists) {
            try { await addCategory({ name: dupPayload.category, type: dupPayload.type, icon: '' }); } catch {}
        }
        await addTransaction({
            accountId: dupPayload.accountId,
            transactionType: txType,
            category: dupPayload.category,
            description: dupPayload.description,
            amount: dupPayload.amount,
            date: toIsoLocalDate(dupPayload.date),
            paymentMethod: dupPayload.paymentMethod || 'Outros',
            costCenterId: dupPayload.costCenterId
        });
        try {
            recordCategoryPreference(dupPayload.description, dupPayload.category);
            recordAccountPreference(dupPayload.description, dupPayload.accountId);
            recordPaymentPreference(dupPayload.description, dupPayload.paymentMethod || 'Outros');
        } catch {}
        showToast("Transação criada.", "success");
        if (dupSource === 'quick') { setPreview(null); setInputText(''); setValidateOpen(false); }
        setDupConfirmOpen(false);
        setDupPayload(null);
    };

    const handleCancel = () => {
        setPreview(null);
    };

    return (
        <div className="bg-white dark:bg-gray-800 p-4 lg:p-4 xl:p-6 rounded-lg shadow-lg border border-indigo-100 dark:border-gray-700 h-full">
            <div className="flex items-center mb-3">
                <SparklesIcon className="h-5 w-5 text-indigo-600 dark:text-indigo-400 mr-2" />
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Adicionar Rápido</h3>
                <div className="ml-auto">
                    {aiMeta?.provider && aiMeta?.model && (
                        <span className="mr-2 text-[11px] px-2 py-0.5 rounded bg-indigo-100 text-indigo-700 dark:bg-indigo-600/30 dark:text-indigo-200">
                            {aiMeta.provider === 'vertex_ai' ? 'Vertex AI' : aiMeta.provider} • {aiMeta.model}
                        </span>
                    )}
                    <button
                        type="button"
                        onClick={() => setQuickMode(quickMode === 'save' ? 'validate' : 'save')}
                        className={`text-xs px-2 py-1 rounded-md border transition-colors ${quickMode === 'save' ? 'bg-green-600 text-white border-green-500 hover:bg-green-700' : 'bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-white border-gray-400 hover:bg-gray-300 dark:hover:bg-gray-600'}`}
                    >
                        {quickMode === 'save' ? 'Modo: Salvar direto' : 'Modo: Validar no modal'}
                    </button>
                </div>
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                Digite naturalmente, ex: "Almoço de 45 reais no débito nubank ontem".
                Para centro de custo, mencione no texto: "no centro pessoal", "cc profissional", ou "centro de custo empresa".
            </p>
            <form onSubmit={handleProcess} className="relative flex items-center gap-2">
                <div className="relative flex-1">
                    <input
                        type="text"
                        value={inputText}
                        onChange={(e) => setInputText(e.target.value)}
                        placeholder="Descreva ou dite sua transação..."
                        className="w-full pl-4 pr-12 py-3 rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 transition-shadow placeholder:text-gray-500 dark:placeholder:text-white placeholder:opacity-100"
                        disabled={isLoading}
                    />
                    {aiMeta?.provider && aiMeta?.model && (
                        <span className="absolute right-14 top-1/2 -translate-y-1/2 text-[10px] px-2 py-0.5 rounded bg-indigo-100 text-indigo-700 dark:bg-indigo-600/30 dark:text-indigo-200 hidden sm:inline-block">
                            {aiMeta.provider} • {aiMeta.model}
                        </span>
                    )}
                    <button
                        type="submit"
                        disabled={isLoading || !inputText}
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-md transition-colors disabled:bg-gray-400"
                    >
                        {isLoading ? (
                            <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                        ) : (
                            <PlusIcon className="h-5 w-5" />
                        )}
                    </button>
                </div>
                <VoiceRecordButton
                    onSpeechResult={(spokenText) => {
                        setInputText(spokenText);
                        handleProcess(undefined, spokenText);
                    }}
                    isProcessing={isLoading}
                    label="Voz"
                    size="md"
                />
            </form>
            {quickMode === 'save' && (
                <div className="mt-2 text-xs rounded px-2 py-1 bg-yellow-100 text-yellow-800 dark:bg-yellow-600/30 dark:text-yellow-300">
                    Modo salvar direto ativo: transações serão gravadas sem validação.
                </div>
            )}
            {preview && (
                <div className="mt-4 bg-gray-50 dark:bg-gray-700 p-3 rounded-lg border border-gray-200 dark:border-gray-600">
                    <div className="flex items-center justify-between mb-2">
                        <p className="text-sm font-semibold text-gray-900 dark:text-white">Confirmar transação</p>
                        <div className="flex items-center gap-2">
                            {(() => { const c = computeConfidence(preview); return (
                                <StatusTag type={c.score >= 75 ? 'success' : c.score >= 45 ? 'warning' : 'error'}> {c.label} </StatusTag>
                            ); })()}
                            {aiMeta?.provider && aiMeta?.model && (
                                <span className="text-[11px] px-2 py-0.5 rounded bg-indigo-100 text-indigo-700 dark:bg-indigo-600/30 dark:text-indigo-200">
                                    {aiMeta.provider === 'vertex_ai' ? 'Vertex AI' : aiMeta.provider} • {aiMeta.model}
                                </span>
                            )}
                        </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Conta {preview.inferredAccount && (<span title={preview.inferredAccountReason || ''} className="ml-1"><StatusTag type="info">Sugerida</StatusTag></span>)}
                            </label>
                            <select className="w-full rounded-md bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 text-sm p-2 text-gray-900 dark:text-white"
                                value={preview.accountId}
                                onChange={(e)=>setPreview({...preview, accountId: e.target.value})}
                            >
                                {accounts.map(a=> (
                                    <option key={a.id} value={a.id}>{a.name}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Tipo</label>
                            <select className="w-full rounded-md bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 text-sm p-2 text-gray-900 dark:text-white"
                                value={preview.type}
                                onChange={(e)=>setPreview({...preview, type: e.target.value as any})}
                            >
                                <option value="Entrada">Entrada</option>
                                <option value="Saída">Saída</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Categoria {preview.inferredCategory && (<span title={preview.inferredCategoryReason || ''} className="ml-1"><StatusTag type="info">Sugerida</StatusTag></span>)}</label>
                            <select className="w-full rounded-md bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 text-sm p-2 text-gray-900 dark:text-white"
                                value={preview.category}
                                onChange={(e)=>setPreview({...preview, category: e.target.value})}
                            >
                                {categories.map(c=> (
                                    <option key={c.id} value={c.name}>{c.name}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Data</label>
                            <input type="date" className="w-full rounded-md bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 text-sm p-2 text-gray-900 dark:text-white"
                                value={preview.date}
                                onChange={(e)=>setPreview({...preview, date: e.target.value})}
                            />
                        </div>
                        <div>
                            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Descrição</label>
                            <input type="text" className="w-full rounded-md bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 text-sm p-2 text-gray-900 dark:text-white"
                                value={preview.description}
                                onChange={(e)=>setPreview({...preview, description: e.target.value})}
                            />
                        </div>
                        <div>
                            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Valor (R$)</label>
                            <input type="number" step="0.01" className="w-full rounded-md bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 text-sm p-2 text-gray-900 dark:text-white"
                                value={preview.amount}
                                onChange={(e)=>setPreview({...preview, amount: parseFloat(e.target.value) || 0})}
                            />
                        </div>
                        <div>
                            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Método de Pagamento</label>
                            <input list="payment-methods-quick" type="text" className="w-full rounded-md bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 text-sm p-2 text-gray-900 dark:text-white"
                                value={preview.paymentMethod || ''}
                                onChange={(e)=>setPreview({ ...preview, paymentMethod: e.target.value })}
                            />
                            <datalist id="payment-methods-quick">
                                <option value="PIX" />
                                <option value="Cartão de Débito" />
                                <option value="Cartão de Crédito" />
                                <option value="Dinheiro" />
                                <option value="Transferência Bancária" />
                                <option value="Débito Automático" />
                            </datalist>
                        </div>
                        {costCenters.length > 0 && (
                            <div>
                                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Centro de Custo {preview.inferredCostCenter && (<span title={preview.inferredCostCenterReason || ''} className="ml-1"><StatusTag type="info">Sugerido</StatusTag></span>)}</label>
                                <select className="w-full rounded-md bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 text-sm p-2 text-gray-900 dark:text-white"
                                    value={preview.costCenterId || ''}
                                    onChange={(e)=>setPreview({ ...preview, costCenterId: e.target.value })}
                                >
                                    <option value="">Selecione...</option>
                                    {costCenters.map(c=> (
                                        <option key={c.id} value={c.id}>{c.name}</option>
                                    ))}
                                </select>
                            </div>
                        )}
                    </div>
                    <div className="mt-3 flex justify-end gap-2">
                        <button onClick={handleCancel} className="px-3 py-1 text-xs rounded-md bg-gray-200 dark:bg-gray-600 text-gray-800 dark:text-white">Cancelar</button>
                        <button onClick={() => setValidateOpen(true)} className="px-3 py-1 text-xs rounded-md bg-yellow-500 text-white hover:bg-yellow-600">Validar no Modal</button>
                        <button onClick={handleConfirm} className={`px-3 py-1 text-xs rounded-md text-white ${quickMode === 'save' ? 'bg-green-600 hover:bg-green-700 ring-2 ring-green-300' : 'bg-indigo-600 hover:bg-indigo-700'}`}>Salvar</button>
                    </div>
                </div>
            )}
            {validateOpen && preview && (
                <AddTransactionModal
                    isOpen={validateOpen}
                    onClose={() => { setValidateOpen(false); setPreview(null); }}
                    onAddAccount={() => showToast('Abra Configurações para cadastrar contas.', 'info')}
                    aiInfo={aiMeta}
                    initial={{
                        transactionType: preview.type === 'Entrada' ? TransactionType.INCOME : TransactionType.EXPENSE,
                        accountId: preview.accountId,
                        amount: preview.amount,
                        description: preview.description,
                        category: preview.category,
                        paymentMethod: preview.paymentMethod || 'Outros',
                        date: preview.date,
                        costCenterId: preview.costCenterId,
                        inferredCostCenter: !!preview.inferredCostCenter,
                        inferredCostCenterReason: preview.inferredCostCenterReason,
                        inferredCategory: !!preview.inferredCategory,
                        inferredPayment: !!preview.inferredPayment,
                        inferredAccount: !!preview.inferredAccount,
                        inferredCategoryReason: preview.inferredCategoryReason,
                        inferredPaymentReason: preview.inferredPaymentReason,
                        inferredAccountReason: preview.inferredAccountReason
                    }}
                />
            )}
            <Modal isOpen={dupConfirmOpen} onClose={() => { setDupConfirmOpen(false); setDupPayload(null); }} title="Possível duplicidade" size="sm" zIndex={70}>
                <div className="text-sm text-gray-800 dark:text-gray-100">
                    Possível duplicidade detectada para este lançamento. Deseja salvar mesmo assim?
                </div>
                <div className="mt-3 flex justify-end gap-2">
                    <button onClick={() => { setDupConfirmOpen(false); setDupPayload(null); showToast('Operação cancelada.', 'info'); }} className="px-3 py-1.5 text-xs rounded bg-gray-200 dark:bg-gray-600 text-gray-800 dark:text-white">Cancelar</button>
                    <button onClick={confirmDupSave} className="px-3 py-1.5 text-xs rounded bg-indigo-600 text-white">Salvar</button>
                </div>
            </Modal>
        </div>
    );
};
