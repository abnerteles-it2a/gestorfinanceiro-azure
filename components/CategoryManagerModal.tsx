import React, { useState, useMemo } from 'react';
import { useFinancialData } from '../context/FinancialDataContext';
import { Modal } from './shared/Modal';
import { EditIcon, TrashIcon, PlusIcon } from './icons';
import type { Category } from '../types';

interface CategoryManagerModalProps {
    isOpen: boolean;
    onClose: () => void;
}

const CategoryRow: React.FC<{ category: Category, onUpdate: (id: string, name: string) => void, onDelete: (id: string) => void }> = ({ category, onUpdate, onDelete }) => {
    const [isEditing, setIsEditing] = useState(false);
    const [name, setName] = useState(category.name);

    const handleSave = () => {
        if (name.trim() !== category.name) {
            onUpdate(category.id, name.trim());
        }
        setIsEditing(false);
    };

    return (
        <div className="flex items-center justify-between py-2 px-2 rounded-md hover:bg-gray-100 dark:hover:bg-gray-600/50">
            {isEditing ? (
                <input 
                    type="text" 
                    value={name} 
                    onChange={(e) => setName(e.target.value)} 
                    onBlur={handleSave}
                    onKeyPress={(e) => e.key === 'Enter' && handleSave()}
                    className="bg-gray-200 dark:bg-gray-500 border border-gray-400 dark:border-gray-400 rounded-md px-2 py-1 text-gray-900 dark:text-white text-sm w-full" 
                    autoFocus
                />
            ) : (
                <p className="text-sm text-gray-900 dark:text-white">{category.name}</p>
            )}
            <div className="flex items-center space-x-2">
                <button onClick={() => setIsEditing(!isEditing)} className="text-gray-400 hover:text-indigo-500 dark:hover:text-indigo-400">
                    <EditIcon className="h-4 w-4" />
                </button>
                <button onClick={() => onDelete(category.id)} className="text-gray-400 hover:text-red-500 dark:hover:text-red-400">
                    <TrashIcon className="h-4 w-4" />
                </button>
            </div>
        </div>
    );
};

export const CategoryManagerModal: React.FC<CategoryManagerModalProps> = ({ isOpen, onClose }) => {
    const { categories, addCategory, updateCategory, deleteCategory } = useFinancialData();
    const [newCategoryName, setNewCategoryName] = useState('');
    const [newCategoryType, setNewCategoryType] = useState<'Entrada' | 'Saída'>('Saída');

    const { incomeCategories, expenseCategories } = useMemo(() => {
        return {
            incomeCategories: categories.filter(c => c.type === 'Entrada'),
            expenseCategories: categories.filter(c => c.type === 'Saída')
        };
    }, [categories]);

    const handleAddCategory = (e: React.FormEvent) => {
        e.preventDefault();
        if (newCategoryName.trim()) {
            addCategory({ name: newCategoryName.trim(), type: newCategoryType });
            setNewCategoryName('');
        }
    };
    const footerContent = (
        <div className="w-full">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">Nova Categoria</h3>
            <form onSubmit={handleAddCategory} className="flex flex-col sm:flex-row items-center gap-2">
                <input 
                    type="text" 
                    placeholder="Nome da Categoria" 
                    value={newCategoryName}
                    onChange={(e) => setNewCategoryName(e.target.value)}
                    className="w-full bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-sm text-gray-900 dark:text-white focus:ring-indigo-500 focus:border-indigo-500 placeholder:text-gray-500 dark:placeholder:text-white placeholder:opacity-100" 
                />
                <select value={newCategoryType} onChange={(e) => setNewCategoryType(e.target.value as any)} className="w-full sm:w-auto bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-sm text-gray-900 dark:text-white focus:ring-indigo-500 focus:border-indigo-500">
                    <option value="Entrada">Receita</option>
                    <option value="Saída">Despesa</option>
                </select>
                <button type="submit" className="w-full sm:w-auto p-2 text-white bg-indigo-600 hover:bg-indigo-700 rounded-md flex justify-center items-center">
                    <PlusIcon className="h-5 w-5" />
                </button>
            </form>
        </div>
    );
    
    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Gerenciar Categorias" footer={footerContent}>
            <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-2">
                <div className="grid grid-cols-2 gap-6">
                    <div>
                        <h3 className="text-lg font-semibold text-green-600 dark:text-green-400 mb-2">Receitas</h3>
                        <div className="space-y-1">
                            {/* FIX: The `updateCategory` function expects a `Partial<Category>` object, but the `onUpdate` prop for `CategoryRow` expects a function that takes `(id, name)`. This lambda adapts the call to match the `updateCategory` signature, resolving the type error. */}
                            {incomeCategories.map(cat => <CategoryRow key={cat.id} category={cat} onUpdate={(id, name) => updateCategory(id, { name })} onDelete={deleteCategory} />)}
                        </div>
                    </div>
                     <div>
                        <h3 className="text-lg font-semibold text-red-600 dark:text-red-400 mb-2">Despesas</h3>
                        <div className="space-y-1">
                            {/* FIX: The `updateCategory` function expects a `Partial<Category>` object, but the `onUpdate` prop for `CategoryRow` expects a function that takes `(id, name)`. This lambda adapts the call to match the `updateCategory` signature, resolving the type error. */}
                            {expenseCategories.map(cat => <CategoryRow key={cat.id} category={cat} onUpdate={(id, name) => updateCategory(id, { name })} onDelete={deleteCategory} />)}
                        </div>
                    </div>
                </div>
            </div>
        </Modal>
    );
};
