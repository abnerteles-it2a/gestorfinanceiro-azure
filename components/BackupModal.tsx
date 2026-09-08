
import React, { useRef, useState } from 'react';
import { useFinancialData } from '../context/FinancialDataContext';
import { Modal } from './shared/Modal';
import { ArrowDownIcon, UploadIcon } from './icons';

interface BackupModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export const BackupModal: React.FC<BackupModalProps> = ({ isOpen, onClose }) => {
    const { exportData, importData } = useFinancialData();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [restoreConfirmOpen, setRestoreConfirmOpen] = useState(false);
    const [restoreContent, setRestoreContent] = useState<string | null>(null);

    const handleImportClick = () => {
        fileInputRef.current?.click();
    };

    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (e) => {
                const content = e.target?.result as string;
                if (content) {
                    setRestoreContent(content);
                    setRestoreConfirmOpen(true);
                }
            };
            reader.readAsText(file);
        }
        // Reset input value so same file can be selected again if needed
        event.target.value = '';
    };
    const confirmRestore = () => {
        const c = restoreContent;
        setRestoreConfirmOpen(false);
        setRestoreContent(null);
        if (c) {
            importData(c);
            onClose();
        }
    };

    return (
        <>
        <Modal isOpen={isOpen} onClose={onClose} title="Backup e Restauração">
            <div className="space-y-6">
                {/* Export Section */}
                <div className="bg-gray-50 dark:bg-gray-700/30 p-4 rounded-lg border border-gray-200 dark:border-gray-600">
                    <div className="flex items-start mb-3">
                        <div className="p-2 bg-indigo-100 dark:bg-indigo-900/50 rounded-lg mr-3">
                            <ArrowDownIcon className="h-6 w-6 text-indigo-600 dark:text-indigo-400" />
                        </div>
                        <div>
                            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Exportar Dados</h3>
                            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                                Salve uma cópia completa dos seus dados (lançamentos, contas, investimentos) em um arquivo JSON seguro.
                            </p>
                        </div>
                    </div>
                    <button 
                        onClick={exportData}
                        className="w-full mt-2 flex items-center justify-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors"
                    >
                        <ArrowDownIcon className="h-4 w-4 mr-2" />
                        Baixar Backup
                    </button>
                </div>

                {/* Import Section */}
                <div className="bg-gray-50 dark:bg-gray-700/30 p-4 rounded-lg border border-gray-200 dark:border-gray-600">
                    <div className="flex items-start mb-3">
                        <div className="p-2 bg-teal-100 dark:bg-teal-900/50 rounded-lg mr-3">
                            <UploadIcon className="h-6 w-6 text-teal-600 dark:text-teal-400" />
                        </div>
                        <div>
                            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Restaurar Dados</h3>
                            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                                Recupere seus dados a partir de um arquivo de backup. 
                                <span className="block mt-1 text-red-500 font-medium text-xs">⚠️ Atenção: Isso substituirá todos os dados atuais.</span>
                            </p>
                        </div>
                    </div>
                    
                    <label htmlFor="backup-file" className="sr-only">Arquivo de backup JSON</label>
                    <input
                        id="backup-file"
                        name="backup-file"
                        type="file"
                        ref={fileInputRef}
                        className="hidden" 
                        accept=".json" 
                        onChange={handleFileChange} 
                    />
                    
                    <button 
                        onClick={handleImportClick}
                        className="w-full mt-2 flex items-center justify-center px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm text-sm font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors"
                    >
                        <UploadIcon className="h-4 w-4 mr-2" />
                        Selecionar Arquivo de Backup
                    </button>
                </div>
            </div>
        </Modal>
        <Modal isOpen={restoreConfirmOpen} onClose={() => { setRestoreConfirmOpen(false); setRestoreContent(null); }} title="Restaurar Dados" size="sm">
            <div className="space-y-3">
                <p className="text-sm text-gray-800 dark:text-gray-200">Isso substituirá seus dados atuais pelos do backup. Deseja continuar?</p>
                <div className="flex items-center justify-end gap-2">
                    <button onClick={() => { setRestoreConfirmOpen(false); setRestoreContent(null); }} className="px-3 py-2 rounded-md text-sm font-medium bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-white">Cancelar</button>
                    <button onClick={confirmRestore} className="px-3 py-2 rounded-md text-sm font-medium bg-teal-600 text-white hover:bg-teal-700">Restaurar</button>
                </div>
            </div>
        </Modal>
        </>
    );
};
