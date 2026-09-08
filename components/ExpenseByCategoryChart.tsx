import React, { useState } from 'react';
import { PieChart, Pie, Cell, Sector, ResponsiveContainer } from 'recharts';
import { formatCurrency } from '../utils/formatters';

const renderActiveShape = (props: any) => {
  const { cx, cy, innerRadius, outerRadius, startAngle, endAngle, fill, payload, percent, value } = props;
  return (
    <g>
      <text x={cx} y={cy} dy={-5} textAnchor="middle" fill={fill} className="font-semibold text-xs">
        {payload.name.length > 12 ? payload.name.substring(0, 12) + '…' : payload.name}
      </text>
      <text x={cx} y={cy} dy={10} textAnchor="middle" className="fill-gray-800 dark:fill-white text-[11px]">
        {formatCurrency(value)}
      </text>
      <text x={cx} y={cy} dy={23} textAnchor="middle" className="fill-gray-500 dark:fill-gray-400 text-[10px]">
        {(percent * 100).toFixed(0)}%
      </text>
      <Sector
        cx={cx}
        cy={cy}
        innerRadius={innerRadius}
        outerRadius={outerRadius}
        startAngle={startAngle}
        endAngle={endAngle}
        fill={fill}
      />
      <Sector
        cx={cx}
        cy={cy}
        startAngle={startAngle}
        endAngle={endAngle}
        innerRadius={outerRadius + 4}
        outerRadius={outerRadius + 7}
        fill={fill}
      />
    </g>
  );
};

interface ExpenseByCategoryChartProps {
    data: { name: string; value: number }[];
    monthlyExpense: number;
    onCategorySelect: (data: any) => void;
}

const COLORS = ['#0D9488', '#34d399', '#fbbf24', '#f87171', '#38bdf8', '#14b8a6', '#fb923c', '#2dd4bf'];

export const ExpenseByCategoryChart: React.FC<ExpenseByCategoryChartProps> = ({ data, monthlyExpense, onCategorySelect }) => {
    const [activeIndex, setActiveIndex] = useState(0);

    const onPieEnter = (_: any, index: number) => {
        setActiveIndex(index);
    };

    const maxValue = Math.max(...data.map(d => d.value), 1);

    return (
        <div className="bg-white dark:bg-slate-800 p-5 lg:p-6 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 h-full flex flex-col">
            <div className="flex items-center justify-between mb-4">
                <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Despesas por Categoria
                </h3>
                <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                    {formatCurrency(monthlyExpense)}
                </span>
            </div>
            
            <div className="flex-1 flex flex-col md:flex-row gap-4 min-h-0">
                {/* Donut Chart - fixed height container */}
                <div className="flex-shrink-0 flex items-center justify-center" style={{ width: '160px', height: '160px', margin: '0 auto' }}>
                    <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                            <Pie
                                {...{ activeIndex } as any}
                                activeShape={renderActiveShape}
                                data={data}
                                cx="50%"
                                cy="50%"
                                innerRadius={40}
                                outerRadius={60}
                                fill="#8884d8"
                                dataKey="value"
                                onMouseEnter={onPieEnter}
                                onClick={(data) => onCategorySelect?.(data)}
                                style={{ cursor: 'pointer' }}
                            >
                                {data.map((_, index) => (
                                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                ))}
                            </Pie>
                        </PieChart>
                    </ResponsiveContainer>
                </div>

                {/* Category List with progress bars - max 4 visible, scroll after */}
                <div className="flex-1 overflow-y-auto custom-scrollbar space-y-1.5 min-w-0" style={{ maxHeight: '200px' }}>
                    {data.map((d, i) => {
                        const pct = monthlyExpense > 0 ? (d.value / monthlyExpense * 100) : 0;
                        const color = COLORS[i % COLORS.length];
                        return (
                            <button 
                                key={d.name} 
                                onClick={() => onCategorySelect?.(d)}
                                className="w-full text-left group hover:bg-slate-50 dark:hover:bg-slate-700/50 rounded-lg px-2 py-1.5 transition-colors"
                            >
                                <div className="flex items-center justify-between mb-1">
                                    <div className="flex items-center gap-1.5 min-w-0">
                                        <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
                                        <span className="text-[11px] text-slate-700 dark:text-slate-200 truncate">{d.name}</span>
                                    </div>
                                    <span className="text-[11px] font-medium text-slate-600 dark:text-slate-300 flex-shrink-0 ml-2">
                                        {formatCurrency(d.value)}
                                    </span>
                                </div>
                                <div className="w-full h-1 rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden">
                                    <div 
                                        className="h-full rounded-full transition-all duration-500"
                                        style={{ width: `${pct}%`, backgroundColor: color }}
                                    />
                                </div>
                                <div className="text-[9px] text-slate-400 mt-0.5 text-right">{pct.toFixed(1)}%</div>
                            </button>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};
