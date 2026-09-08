import React from 'react';
import { useFinancialData } from '../context/FinancialDataContext';
import { TrophyIcon, TrendingUpIcon, AlertTriangleIcon } from './icons';

export const FinancialHealthScore: React.FC = () => {
    const { financialScore } = useFinancialData();
    
    let color = 'text-red-500';
    let message = 'Atenção';
    if (financialScore >= 80) { color = 'text-green-500'; message = 'Excelente'; }
    else if (financialScore >= 50) { color = 'text-yellow-500'; message = 'Bom'; }
    
    return (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-3 min-h-[96px] flex items-center">
            <div className="flex items-center">
                <div className="p-2 bg-gray-100 dark:bg-gray-700 rounded-full mr-3">
                    {message === 'Excelente' ? (
                        <TrophyIcon className="h-6 w-6 text-yellow-500" />
                    ) : message === 'Bom' ? (
                        <TrendingUpIcon className="h-6 w-6 text-green-500" />
                    ) : (
                        <AlertTriangleIcon className="h-6 w-6 text-red-500" />
                    )}
                </div>
                <div>
                    <h3 className="text-sm font-medium text-gray-900 dark:text-white">Saúde Financeira</h3>
                    <p className={`text-sm font-medium ${color}`}>{message}</p>
                </div>
            </div>
        </div>
    );
};
