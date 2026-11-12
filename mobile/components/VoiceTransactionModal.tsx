import React, { useState, useRef, useEffect } from 'react';
import { 
    View, Text, Modal, TextInput, TouchableOpacity, 
    ActivityIndicator, Alert, ScrollView 
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFinancialData } from '../context/FinancialDataContext';
import { api } from '../services/api';
import { formatCurrency } from '../utils/formatters';
import { parseVoiceTransaction, ParsedVoiceTransaction } from '../services/transactionParserService';

interface VoiceTransactionModalProps {
    visible: boolean;
    onClose: () => void;
    onNavigateToForm?: (prefilledData: any) => void;
}

export const VoiceTransactionModal: React.FC<VoiceTransactionModalProps> = ({
    visible,
    onClose,
    onNavigateToForm
}) => {
    const insets = useSafeAreaInsets();
    const { categories, accounts, refreshData } = useFinancialData();
    const [spokenText, setSpokenText] = useState('');
    const [parsedData, setParsedData] = useState<ParsedVoiceTransaction | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [availableAccounts, setAvailableAccounts] = useState<{ id: string; name: string }[]>([]);
    const [availableCategories, setAvailableCategories] = useState<string[]>([]);
    const inputRef = useRef<TextInput>(null);

    const quickExamples = [
        'Gastei 45 no almoço no Nubank',
        'Gasolina 150 no Pix hoje',
        'Recebi 3500 de salário no Itaú',
        'Farmácia 85 no cartão de crédito',
    ];

    // Sincroniza e garante contas e categorias ativas
    useEffect(() => {
        if (visible) {
            const accs = accounts && accounts.length > 0 
                ? accounts.map(a => ({ id: a.id, name: a.name })) 
                : [];
            const cats = categories && categories.length > 0 
                ? categories.map(c => c.name) 
                : [];

            if (accs.length > 0) setAvailableAccounts(accs);
            if (cats.length > 0) setAvailableCategories(cats);

            // Fetch direto de segurança de /bootstrap caso vazio
            if (accs.length === 0 || cats.length === 0) {
                api.get('/bootstrap').then(res => {
                    if (res.data?.accounts && res.data.accounts.length > 0) {
                        setAvailableAccounts(res.data.accounts.map((a: any) => ({ id: a.id, name: a.name })));
                    }
                    if (res.data?.categories && res.data.categories.length > 0) {
                        setAvailableCategories(res.data.categories.map((c: any) => c.name));
                    }
                }).catch(err => {
                    console.warn('[VoiceModal] Bootstrap fetch error:', err);
                });
            }
        }
    }, [visible, accounts, categories]);

    const handleProcessText = async (textToProcess: string) => {
        const text = textToProcess.trim();
        if (!text) return;
        setIsProcessing(true);
        try {
            const catNames = availableCategories.length > 0 
                ? availableCategories 
                : (categories.map(c => c.name).length > 0 ? categories.map(c => c.name) : ['Alimentação', 'Transporte', 'Moradia', 'Saúde', 'Salário', 'Geral']);
            const accList = availableAccounts.length > 0 
                ? availableAccounts 
                : accounts.map(a => ({ id: a.id, name: a.name }));

            const result = await parseVoiceTransaction(text, catNames, accList);
            if (result) {
                // Se a conta veio vazia e temos contas disponíveis, seleciona a primeira por padrão
                if (!result.accountId && accList.length > 0) {
                    result.accountId = accList[0].id;
                }
                setParsedData(result);
            } else {
                Alert.alert(
                    'Valor não identificado', 
                    'Fale o valor e o que foi gasto/recebido. Exemplo: "Almoço 45 reais no Pix".'
                );
            }
        } catch (error) {
            console.error('Error parsing voice text:', error);
            Alert.alert('Erro', 'Não foi possível processar a frase.');
        } finally {
            setIsProcessing(false);
        }
    };

    // Alterna entre as contas disponíveis ao tocar no chip de conta
    const handleToggleAccount = () => {
        if (!parsedData || availableAccounts.length <= 1) return;
        const currentIndex = availableAccounts.findIndex(a => a.id === parsedData.accountId);
        const nextIndex = (currentIndex + 1) % availableAccounts.length;
        setParsedData({
            ...parsedData,
            accountId: availableAccounts[nextIndex].id
        });
    };

    // Alterna o tipo (Entrada / Saída) ao tocar no badge
    const handleToggleType = () => {
        if (!parsedData) return;
        setParsedData({
            ...parsedData,
            type: parsedData.type === 'Entrada' ? 'Saída' : 'Entrada'
        });
    };

    const handleConfirmAndSave = async () => {
        if (!parsedData) return;

        // Resolução segura de Account ID
        let targetAccountId = parsedData.accountId;
        if (!targetAccountId || targetAccountId.trim() === '') {
            if (availableAccounts.length > 0) {
                targetAccountId = availableAccounts[0].id;
            } else if (accounts.length > 0) {
                targetAccountId = accounts[0].id;
            }
        }

        setIsSaving(true);
        try {
            const payload = {
                description: parsedData.description || 'Lançamento por Voz',
                amount: Number(parsedData.amount),
                date: parsedData.date || new Date().toISOString().split('T')[0],
                transactionType: parsedData.type || 'Saída',
                category: parsedData.category || 'Geral',
                accountId: targetAccountId || null,
                paymentMethod: parsedData.paymentMethod || 'PIX',
            };

            const response = await api.post('/query', {
                type: 'transactions_insert',
                data: payload
            });

            if (response.data?.error) {
                throw new Error(response.data.error);
            }

            Alert.alert('Sucesso! 🎉', `${parsedData.type} de ${formatCurrency(parsedData.amount)} lançada com sucesso.`);
            refreshData();
            handleClose();
        } catch (error: any) {
            console.error('Error saving transaction:', error?.response?.data || error);
            const serverCode = error?.response?.data?.error || error?.message || '';
            const serverMessage = error?.response?.data?.message || '';
            let userMsg = 'Falha ao registrar a transação no servidor.';

            if (serverCode === 'subscription_expired' || serverCode === 'subscription_inactive') {
                userMsg = 'Sua assinatura ou período de testes está expirado. Verifique seu plano no portal web.';
            } else if (serverCode.startsWith('limit_reached_')) {
                userMsg = 'Limite mensal de transações atingido para seu plano atual.';
            } else if (serverMessage) {
                userMsg = `Servidor: ${serverMessage}`;
            } else if (serverCode) {
                userMsg = `Código de erro: ${serverCode}`;
            }

            Alert.alert(
                'Atenção ao Salvar', 
                userMsg,
                [
                    { text: 'Ajustar no Formulário', onPress: handleOpenInForm },
                    { text: 'Fechar', style: 'cancel' }
                ]
            );
        } finally {
            setIsSaving(false);
        }
    };

    const handleOpenInForm = () => {
        if (!parsedData) return;
        const currentData = { ...parsedData };
        handleClose();
        if (onNavigateToForm) {
            onNavigateToForm({
                description: currentData.description,
                amount: String(currentData.amount),
                type: currentData.type,
                category: currentData.category,
                accountId: currentData.accountId || (availableAccounts[0]?.id ?? ''),
                paymentMethod: currentData.paymentMethod,
                date: currentData.date,
            });
        }
    };

    const handleClose = () => {
        setSpokenText('');
        setParsedData(null);
        onClose();
    };

    const currentAccountName = availableAccounts.find(a => a.id === parsedData?.accountId)?.name 
        || accounts.find(a => a.id === parsedData?.accountId)?.name 
        || (availableAccounts.length > 0 ? availableAccounts[0].name : 'Conta Principal');

    return (
        <Modal visible={visible} animationType="slide" transparent presentationStyle="overFullScreen">
            <View className="flex-1 bg-black/60 justify-end">
                <View 
                    className="bg-white dark:bg-slate-900 rounded-t-3xl p-6 border-t border-slate-100 dark:border-slate-800 shadow-2xl max-h-[90%]"
                    style={{ paddingBottom: Math.max(insets.bottom, 24) }}
                >
                    {/* Header */}
                    <View className="flex-row justify-between items-center mb-4">
                        <View className="flex-row items-center gap-2">
                            <View className="w-9 h-9 rounded-xl bg-teal-50 dark:bg-teal-950/40 items-center justify-center">
                                <Ionicons name="mic" size={20} color="#0D9488" />
                            </View>
                            <View>
                                <Text className="text-base font-black text-slate-900 dark:text-white">
                                    Lançamento por Voz & IA
                                </Text>
                                <Text className="text-[10px] text-teal-600 dark:text-teal-400 font-bold uppercase tracking-widest">
                                    Fale ou dite sua despesa
                                </Text>
                            </View>
                        </View>
                        <TouchableOpacity onPress={handleClose} className="p-1">
                            <Ionicons name="close-circle-outline" size={26} color="#94a3b8" />
                        </TouchableOpacity>
                    </View>

                    <ScrollView showsVerticalScrollIndicator={false}>
                        {/* Input Area */}
                        <View className="bg-slate-50 dark:bg-slate-800/80 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 mb-3">
                            <TextInput
                                ref={inputRef}
                                value={spokenText}
                                onChangeText={(val) => {
                                    setSpokenText(val);
                                    if (parsedData) setParsedData(null);
                                }}
                                placeholder="Toque no microfone do teclado e fale: 'Gastei 50 no almoço'..."
                                placeholderTextColor="#94a3b8"
                                multiline
                                numberOfLines={3}
                                className="text-slate-900 dark:text-white text-base font-medium min-h-[60px]"
                            />
                            <View className="flex-row justify-between items-center mt-2 pt-2 border-t border-slate-200 dark:border-slate-700">
                                <Text className="text-[10px] text-slate-400 font-medium">
                                    💡 Use a tecla 🎙️ no seu teclado móvel para ditar
                                </Text>
                                {spokenText.length > 0 && (
                                    <TouchableOpacity 
                                        onPress={() => handleProcessText(spokenText)}
                                        disabled={isProcessing}
                                        className="bg-teal-600 px-3.5 py-1.5 rounded-full flex-row items-center gap-1 shadow-sm"
                                        style={{ backgroundColor: '#0D9488' }}
                                    >
                                        {isProcessing ? (
                                            <ActivityIndicator size="small" color="#fff" />
                                        ) : (
                                            <>
                                                <Ionicons name="sparkles" size={12} color="#fff" />
                                                <Text className="text-white text-xs font-bold">Interpretar</Text>
                                            </>
                                        )}
                                    </TouchableOpacity>
                                )}
                            </View>
                        </View>

                        {/* Quick Examples */}
                        {!parsedData && (
                            <View className="mb-4">
                                <Text className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-2">
                                    Exemplos de Fala Rápida:
                                </Text>
                                <View className="flex-row flex-wrap gap-2">
                                    {quickExamples.map((ex, idx) => (
                                        <TouchableOpacity
                                            key={idx}
                                            onPress={() => {
                                                setSpokenText(ex);
                                                handleProcessText(ex);
                                            }}
                                            className="bg-slate-100 dark:bg-slate-800 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700"
                                        >
                                            <Text className="text-xs text-slate-700 dark:text-slate-300 font-medium">
                                                "{ex}"
                                            </Text>
                                        </TouchableOpacity>
                                    ))}
                                </View>
                            </View>
                        )}

                        {/* AI Confirmation Card */}
                        {parsedData && (
                            <View className="bg-teal-50/50 dark:bg-teal-950/20 p-4 rounded-2xl border border-teal-200 dark:border-teal-800/60 mb-4">
                                <View className="flex-row justify-between items-center mb-3">
                                    <View className="flex-row items-center gap-2">
                                        <Ionicons name="checkmark-circle" size={18} color="#0D9488" />
                                        <Text className="text-xs font-black uppercase text-teal-800 dark:text-teal-300 tracking-wider">
                                            IA Identificou a Transação
                                        </Text>
                                    </View>
                                    {/* Badge Clicável para Alternar Tipo se necessário */}
                                    <TouchableOpacity 
                                        onPress={handleToggleType}
                                        className={`px-2.5 py-0.5 rounded-full flex-row items-center gap-1 ${
                                            parsedData.type === 'Entrada' ? 'bg-emerald-100 dark:bg-emerald-950' : 'bg-rose-100 dark:bg-rose-950'
                                        }`}
                                    >
                                        <Text className={`text-[10px] font-bold ${
                                            parsedData.type === 'Entrada' ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-700 dark:text-rose-400'
                                        }`}>
                                            {parsedData.type.toUpperCase()}
                                        </Text>
                                        <Ionicons name="swap-horizontal" size={10} color={parsedData.type === 'Entrada' ? '#047857' : '#be123c'} />
                                    </TouchableOpacity>
                                </View>

                                {/* Value & Description */}
                                <View className="mb-3">
                                    <Text className="text-2xl font-black text-slate-900 dark:text-white tabular-nums">
                                        {formatCurrency(parsedData.amount)}
                                    </Text>
                                    <Text className="text-sm font-bold text-slate-700 dark:text-slate-200 mt-0.5">
                                        {parsedData.description}
                                    </Text>
                                </View>

                                {/* Badges Interativos */}
                                <View className="flex-row flex-wrap gap-2 pt-2 border-t border-teal-200/60 dark:border-teal-800/40">
                                    <View className="bg-white dark:bg-slate-800 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 flex-row items-center gap-1">
                                        <Ionicons name="folder-outline" size={12} color="#64748b" />
                                        <Text className="text-[11px] font-bold text-slate-700 dark:text-slate-300">
                                            {parsedData.category}
                                        </Text>
                                    </View>

                                    {/* Botão de Conta Clicável para Alternar entre as Contas */}
                                    <TouchableOpacity 
                                        onPress={handleToggleAccount}
                                        className="bg-white dark:bg-slate-800 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 flex-row items-center gap-1"
                                    >
                                        <Ionicons name="wallet-outline" size={12} color="#0D9488" />
                                        <Text className="text-[11px] font-bold text-slate-700 dark:text-slate-300">
                                            {currentAccountName}
                                        </Text>
                                        {availableAccounts.length > 1 && (
                                            <Ionicons name="chevron-forward" size={10} color="#94a3b8" />
                                        )}
                                    </TouchableOpacity>

                                    <View className="bg-white dark:bg-slate-800 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 flex-row items-center gap-1">
                                        <Ionicons name="card-outline" size={12} color="#64748b" />
                                        <Text className="text-[11px] font-bold text-slate-700 dark:text-slate-300">
                                            {parsedData.paymentMethod}
                                        </Text>
                                    </View>
                                </View>

                                {/* Action Buttons */}
                                <View className="mt-4 gap-2">
                                    <TouchableOpacity
                                        onPress={handleConfirmAndSave}
                                        disabled={isSaving}
                                        className="w-full py-3.5 bg-teal-600 rounded-xl items-center shadow-md flex-row justify-center gap-2"
                                        style={{ backgroundColor: '#0D9488' }}
                                    >
                                        {isSaving ? (
                                            <ActivityIndicator color="#fff" />
                                        ) : (
                                            <>
                                                <Ionicons name="checkmark-sharp" size={18} color="#fff" />
                                                <Text className="text-white font-black text-sm uppercase tracking-wider">
                                                    Confirmar e Salvar Agora
                                                </Text>
                                            </>
                                        )}
                                    </TouchableOpacity>

                                    {onNavigateToForm && (
                                        <TouchableOpacity
                                            onPress={handleOpenInForm}
                                            className="w-full py-2.5 bg-transparent rounded-xl items-center"
                                        >
                                            <Text className="text-teal-700 dark:text-teal-400 font-bold text-xs uppercase tracking-wider">
                                                Ajustar Detalhes no Formulário
                                            </Text>
                                        </TouchableOpacity>
                                    )}
                                </View>
                            </View>
                        )}
                    </ScrollView>
                </View>
            </View>
        </Modal>
    );
};
