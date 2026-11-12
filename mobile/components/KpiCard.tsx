import React from 'react';
import { View, Text } from 'react-native';

interface KpiCardProps {
    title: string;
    value: string;
    icon: React.ReactNode;
    subtext?: string;
    subtextColor?: string;
    variant?: 'primary' | 'secondary';
    color?: string; // Hex or CSS color for the icon background if needed
}

/**
 * KpiCard - High-fidelity executive card.
 * Aligned with the "Portal Aesthetic" fluid typography and high-density logic.
 * Uses the exact color tokens from the web branding.
 */
export const KpiCard: React.FC<KpiCardProps> = ({ 
    title, value, icon, subtext, subtextColor = 'text-slate-500', variant = 'secondary', color = 'indigo' 
}) => {
    // Static color mapping to avoid dynamic class generation issues in NativeWind v2
    const bgColors: Record<string, string> = {
        brand: 'bg-teal-50 dark:bg-teal-950/50',
        teal: 'bg-teal-50 dark:bg-teal-950/50',
        indigo: 'bg-teal-50 dark:bg-teal-950/50',
        blue: 'bg-blue-50 dark:bg-blue-950/40',
        green: 'bg-emerald-50 dark:bg-emerald-950/40',
        rose: 'bg-rose-50 dark:bg-rose-950/40',
        amber: 'bg-amber-50 dark:bg-amber-950/40',
    };

    const bgColorClass = bgColors[color] || bgColors.teal || bgColors.indigo;
    
    return (
        <View className={`bg-white dark:bg-slate-900 rounded-2xl p-4 shadow-sm border border-slate-100 dark:border-slate-800`}>
            {/* Header: Icon and Pulse/Comparison */}
            <View className="flex-row items-center justify-between mb-3">
                <View className={`w-8 h-8 rounded-xl items-center justify-center ${bgColorClass}`}>
                    {/* View removed wrapper with text styles to avoid RN crashes */}
                    {icon}
                </View>
                {subtext && (
                    <Text className={`text-[9px] font-black ${subtextColor} uppercase tracking-widest`}>
                        {subtext}
                    </Text>
                )}
            </View>
            
            {/* Body: Title and Value (Executive Density) */}
            <View>
                <Text className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400 mb-1">
                    {title}
                </Text>
                
                <Text className="text-xl font-bold text-slate-900 dark:text-white tabular-nums tracking-tight">
                    {value}
                </Text>
            </View>
        </View>
    );
};
