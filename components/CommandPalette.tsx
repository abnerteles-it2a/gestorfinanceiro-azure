import React, { useState, useEffect, useRef } from 'react';

interface CommandItem {
  id: string;
  title: string;
  subtitle?: string;
  category: 'Navegação' | 'Ações Rápidas' | 'Inteligência & IA' | 'Sistema';
  icon: string;
  shortcut?: string;
  perform: () => void;
}

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigate: (view: any) => void;
  onOpenHelpChat?: () => void;
  toggleTheme?: () => void;
  isDark?: boolean;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  isOpen,
  onClose,
  onNavigate,
  onOpenHelpChat,
  toggleTheme,
  isDark
}) => {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const commands: CommandItem[] = [
    // Ações Rápidas
    {
      id: 'new-tx',
      title: 'Nova Transação',
      subtitle: 'Registrar entrada, despesa ou transferência',
      category: 'Ações Rápidas',
      icon: '⚡',
      shortcut: 'N',
      perform: () => {
        window.dispatchEvent(new CustomEvent('gestor_financeiro_add_tx', { detail: {} }));
      }
    },
    {
      id: 'new-inv',
      title: 'Novo Investimento',
      subtitle: 'Comprar ou lançar ativo (Ações, FIIs, Renda Fixa, Cripto)',
      category: 'Ações Rápidas',
      icon: '📈',
      shortcut: 'I',
      perform: () => {
        window.dispatchEvent(new CustomEvent('gestor_financeiro_add_investment', { detail: {} }));
      }
    },
    {
      id: 'import-statement',
      title: 'Importar Extrato Bancário (.OFX / .CSV)',
      subtitle: 'Upload de extratos bancários com conciliação e anti-duplicação',
      category: 'Ações Rápidas',
      icon: '📥',
      shortcut: 'E',
      perform: () => {
        onNavigate('cashflow');
        setTimeout(() => window.dispatchEvent(new CustomEvent('gestor_financeiro_import_statement')), 200);
      }
    },
    {
      id: 'closing-dossier',
      title: 'Dossiê Executivo de Fechamento Mensal',
      subtitle: 'Balanço consolidado, conciliação de tesouraria, DRE e checklist formal',
      category: 'Inteligência & IA',
      icon: '🏛️',
      shortcut: 'R',
      perform: () => {
        onNavigate('reports');
        setTimeout(() => window.dispatchEvent(new CustomEvent('gestor_financeiro_set_reports_tab', { detail: { tab: 'fechamento' } })), 100);
      }
    },
    {
      id: 'predictive-cashflow',
      title: 'Radar Preditivo de Fluxo de Caixa (30 / 60 / 90 Dias)',
      subtitle: 'Curva diária de liquidez, detecção de vale de caixa e cálculo de runway',
      category: 'Inteligência & IA',
      icon: '🔮',
      shortcut: 'F',
      perform: () => {
        onNavigate('financeAccounting');
        setTimeout(() => window.dispatchEvent(new CustomEvent('gestor_financeiro_set_finance_tab', { detail: { tab: 'cashflow' } })), 100);
      }
    },
    {
      id: 'inv-monte-carlo',
      title: 'Simulação de Monte Carlo (1.000 Cenários)',
      subtitle: 'Projeção probabilística de patrimônio (P10, P50, P90) com desconto de inflação IPCA',
      category: 'Inteligência & IA',
      icon: '🎲',
      shortcut: 'M',
      perform: () => {
        onNavigate('investments');
        setTimeout(() => {
          window.dispatchEvent(new CustomEvent('gestor_financeiro_set_investments_tab', { detail: { tab: 'simulador' } }));
          window.dispatchEvent(new CustomEvent('gestor_financeiro_set_simulador_view', { detail: { view: 'montecarlo' } }));
        }, 100);
      }
    },
    {
      id: 'inv-stress-test',
      title: 'Stress Test de Crises Históricas',
      subtitle: 'Simulação de choque: COVID-19 (-35%), Joesley Day (-10.5%), Subprime e Hiper-Juros',
      category: 'Inteligência & IA',
      icon: '⚡',
      shortcut: 'S',
      perform: () => {
        onNavigate('investments');
        setTimeout(() => {
          window.dispatchEvent(new CustomEvent('gestor_financeiro_set_investments_tab', { detail: { tab: 'simulador' } }));
          window.dispatchEvent(new CustomEvent('gestor_financeiro_set_simulador_view', { detail: { view: 'stresstest' } }));
        }, 100);
      }
    },
    {
      id: 'inv-valuation',
      title: 'Valuation Graham & Teto Bazin',
      subtitle: 'Cálculo de preço teto, margem de segurança e dividend yield alvo',
      category: 'Inteligência & IA',
      icon: '🎯',
      shortcut: 'V',
      perform: () => {
        onNavigate('investments');
        setTimeout(() => {
          window.dispatchEvent(new CustomEvent('gestor_financeiro_set_investments_tab', { detail: { tab: 'simulador' } }));
          window.dispatchEvent(new CustomEvent('gestor_financeiro_set_simulador_view', { detail: { view: 'valuation' } }));
        }, 100);
      }
    },
    {
      id: 'inv-dividend-calendar',
      title: 'Cronograma de Dividendos & Bola de Neve',
      subtitle: 'Datas COM vs PAG, fluxo projetado 12 meses e reinvestimento autônomo de cotas',
      category: 'Inteligência & IA',
      icon: '💰',
      shortcut: 'D',
      perform: () => {
        onNavigate('investments');
        setTimeout(() => window.dispatchEvent(new CustomEvent('gestor_financeiro_set_investments_tab', { detail: { tab: 'proventos' } })), 100);
      }
    },
    {
      id: 'inv-risk-matrix',
      title: 'Matriz de Correlação & Raio-X de Risco',
      subtitle: 'Coeficiente de Pearson cruzado, concentração setorial e índice de diversificação',
      category: 'Inteligência & IA',
      icon: '📉',
      perform: () => {
        onNavigate('investments');
        setTimeout(() => window.dispatchEvent(new CustomEvent('gestor_financeiro_set_investments_tab', { detail: { tab: 'rebalanceamento' } })), 100);
      }
    },
    {
      id: 'leak-radar',
      title: 'Scanner de Assinaturas & Custos Invisíveis',
      subtitle: 'Identificar aumentos furtivos de mensalidades e tarifas bancárias (CMN 3.919)',
      category: 'Inteligência & IA',
      icon: '🛡️',
      perform: () => {
        onNavigate('financeAccounting');
        setTimeout(() => window.dispatchEvent(new CustomEvent('gestor_financeiro_set_finance_tab', { detail: { tab: 'cashflow' } })), 100);
      }
    },
    {
      id: 'ai-dre-audit',
      title: 'Parecer Contábil de DRE com IA',
      subtitle: 'Auditoria de margens, EBITDA e diagnóstico fiscal sênior emitido pela IA',
      category: 'Inteligência & IA',
      icon: '📑',
      perform: () => {
        onNavigate('financeAccounting');
        setTimeout(() => window.dispatchEvent(new CustomEvent('gestor_financeiro_set_finance_tab', { detail: { tab: 'accounting', accountingTab: 'dre' } })), 100);
      }
    },
    {
      id: 'ai-concierge',
      title: 'Concierge IA Financeiro',
      subtitle: 'Tirar dúvidas de finanças, MEI ou planejamento',
      category: 'Inteligência & IA',
      icon: '✨',
      shortcut: 'C',
      perform: () => {
        if (onOpenHelpChat) onOpenHelpChat();
        else window.dispatchEvent(new CustomEvent('open_concierge_chat'));
      }
    },
    {
      id: 'inv-rebalance',
      title: 'Rebalanceamento de Carteira (Smart Rebalancer)',
      subtitle: 'Alocação ideal e cálculo de aportes inteligentes',
      category: 'Ações Rápidas',
      icon: '⚖️',
      perform: () => {
        onNavigate('investments');
        setTimeout(() => window.dispatchEvent(new CustomEvent('gestor_financeiro_set_investments_tab', { detail: { tab: 'rebalanceamento' } })), 100);
      }
    },
    {
      id: 'inv-tax',
      title: 'Radar Fiscal de IR (DARF & Isenções)',
      subtitle: 'Acompanhar isenção de R$ 20k em Ações e DARF de FIIs',
      category: 'Ações Rápidas',
      icon: '🧾',
      perform: () => {
        onNavigate('investments');
        setTimeout(() => window.dispatchEvent(new CustomEvent('gestor_financeiro_set_investments_tab', { detail: { tab: 'fiscal' } })), 100);
      }
    },
    // Navegação
    {
      id: 'nav-home',
      title: 'Início (Home)',
      subtitle: 'Visão executiva com atalhos e cotações em tempo real',
      category: 'Navegação',
      icon: '🏠',
      shortcut: '1',
      perform: () => onNavigate('home')
    },
    {
      id: 'nav-dash',
      title: 'Dashboard Geral',
      subtitle: 'KPIs financeiros, projeções e indicadores de caixa',
      category: 'Navegação',
      icon: '📊',
      shortcut: '2',
      perform: () => onNavigate('dashboard')
    },
    {
      id: 'nav-cashflow',
      title: 'Fluxo de Caixa & Extrato',
      subtitle: 'Histórico completo de transações e filtros',
      category: 'Navegação',
      icon: '💸',
      shortcut: '3',
      perform: () => onNavigate('cashflow')
    },
    {
      id: 'nav-investments',
      title: 'Investimentos & Carteira',
      subtitle: 'Simulador, cotações e recomendações Graham/Bazin',
      category: 'Navegação',
      icon: '💼',
      shortcut: '4',
      perform: () => onNavigate('investments')
    },
    {
      id: 'nav-finance',
      title: 'Contabilidade & DRE',
      subtitle: 'Contas a pagar/receber, conciliação e obrigações MEI',
      category: 'Navegação',
      icon: '📑',
      shortcut: '5',
      perform: () => onNavigate('financeAccounting')
    },
    {
      id: 'nav-vault',
      title: 'Cofre Digital de Documentos',
      subtitle: 'Armazenamento de notas, contratos e comprovantes na nuvem',
      category: 'Navegação',
      icon: '🔒',
      shortcut: '6',
      perform: () => onNavigate('docsVault')
    },
    {
      id: 'nav-reports',
      title: 'Relatórios & BI',
      subtitle: 'Gráficos analíticos e balanços periódicos',
      category: 'Navegação',
      icon: '📈',
      shortcut: '7',
      perform: () => onNavigate('reports')
    },
    {
      id: 'nav-settings-cats',
      title: 'Gerenciar Categorias',
      subtitle: 'Cadastrar e editar categorias de receitas e despesas',
      category: 'Sistema',
      icon: '🏷️',
      perform: () => {
        window.dispatchEvent(new CustomEvent('openSettingsModal', { detail: { tab: 'categories' } }));
      }
    },
    {
      id: 'nav-settings-accs',
      title: 'Gerenciar Contas Bancárias',
      subtitle: 'Adicionar bancos, corretoras e carteiras',
      category: 'Sistema',
      icon: '🏦',
      perform: () => {
        window.dispatchEvent(new CustomEvent('openSettingsModal', { detail: { tab: 'accounts' } }));
      }
    },
    {
      id: 'nav-settings-cc',
      title: 'Centros de Custo',
      subtitle: 'Gerenciar centros de custo e permissões',
      category: 'Sistema',
      icon: '🏢',
      perform: () => {
        window.dispatchEvent(new CustomEvent('openSettingsModal', { detail: { tab: 'costCenters' } }));
      }
    },
    {
      id: 'sys-theme',
      title: isDark ? 'Ativar Modo Claro' : 'Ativar Modo Escuro',
      subtitle: 'Alternar contraste visual da interface',
      category: 'Sistema',
      icon: isDark ? '☀️' : '🌙',
      perform: () => {
        if (toggleTheme) toggleTheme();
      }
    }
  ];

  const filteredCommands = commands.filter(cmd => {
    const q = query.toLowerCase().trim();
    if (!q) return true;
    return (
      cmd.title.toLowerCase().includes(q) ||
      (cmd.subtitle && cmd.subtitle.toLowerCase().includes(q)) ||
      cmd.category.toLowerCase().includes(q)
    );
  });

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (isOpen) onClose();
        else {
          // Open trigger handled by parent or custom event
          window.dispatchEvent(new CustomEvent('open_command_palette'));
        }
      }
      if (!isOpen) return;

      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(prev => (prev + 1) % (filteredCommands.length || 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(prev => (prev - 1 + filteredCommands.length) % (filteredCommands.length || 1));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (filteredCommands[selectedIndex]) {
          filteredCommands[selectedIndex].perform();
          onClose();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, filteredCommands, selectedIndex, onClose]);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Barra de Comandos Rápidos"
      className="fixed inset-0 z-50 flex items-start justify-center pt-20 sm:pt-28 px-4 bg-slate-950/70 backdrop-blur-md animate-fadeIn"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[75vh] animate-scaleIn">
        {/* Search Input Bar */}
        <div className="flex items-center px-4 py-3.5 border-b border-slate-200 dark:border-slate-800 gap-3">
          <span className="text-teal-600 dark:text-teal-400 font-black text-lg">⌘</span>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="O que você deseja fazer? (ex: Nova Transação, DRE, Cotações...)"
            className="flex-1 bg-transparent text-sm sm:text-base font-medium text-slate-900 dark:text-white placeholder-slate-400 outline-none"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="text-xs px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-slate-800 dark:hover:text-white"
            >
              Limpar
            </button>
          )}
          <kbd className="hidden sm:inline-block text-[10px] font-bold px-2 py-1 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
            ESC
          </kbd>
        </div>

        {/* Results List */}
        <div ref={listRef} className="overflow-y-auto p-2 divide-y divide-slate-100 dark:divide-slate-800/60">
          {filteredCommands.length === 0 ? (
            <div className="p-8 text-center text-slate-400 text-sm">
              Nenhuma ação encontrada para "{query}". Tente buscar por palavras como <em>transação</em>, <em>investimento</em> ou <em>relatórios</em>.
            </div>
          ) : (
            filteredCommands.map((cmd, idx) => {
              const isSelected = idx === selectedIndex;
              return (
                <div
                  key={cmd.id}
                  onClick={() => {
                    cmd.perform();
                    onClose();
                  }}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  className={`flex items-center justify-between px-3.5 py-2.5 rounded-xl cursor-pointer transition-all duration-150 ${
                    isSelected
                      ? 'bg-teal-50 dark:bg-teal-950/40 text-teal-900 dark:text-teal-100 border border-teal-500/20'
                      : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-xl shrink-0">{cmd.icon}</span>
                    <div className="flex flex-col min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm truncate">{cmd.title}</span>
                        <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
                          {cmd.category}
                        </span>
                      </div>
                      {cmd.subtitle && (
                        <span className="text-xs text-slate-400 dark:text-slate-500 truncate">
                          {cmd.subtitle}
                        </span>
                      )}
                    </div>
                  </div>

                  {cmd.shortcut && (
                    <kbd className="hidden sm:inline-block text-[11px] font-semibold px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700/60 ml-3 shrink-0">
                      {cmd.shortcut}
                    </kbd>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Footer info */}
        <div className="px-4 py-2.5 bg-slate-50 dark:bg-slate-950/60 border-t border-slate-200 dark:border-slate-800/80 flex items-center justify-between text-[11px] text-slate-500">
          <div className="flex items-center gap-3">
            <span>Use <kbd className="px-1.5 py-0.5 bg-white dark:bg-slate-800 border rounded">↑</kbd> <kbd className="px-1.5 py-0.5 bg-white dark:bg-slate-800 border rounded">↓</kbd> para navegar</span>
            <span><kbd className="px-1.5 py-0.5 bg-white dark:bg-slate-800 border rounded">Enter</kbd> para executar</span>
          </div>
          <span className="font-semibold text-teal-600 dark:text-teal-400">IT2A Ecosystem</span>
        </div>
      </div>
    </div>
  );
};
