import React, { useState, useEffect, useRef } from 'react';

interface RankItem {
  symbol: string;
  name: string;
  price: number;
  change: number; // percentage
  signal: 'COMPRA' | 'VENDA' | 'MANTER';
  currency: string;
}

const fmtPrice = (val: number, currency: string) => {
  const prefix = currency === 'USD' ? '$' : 'R$';
  return `${prefix} ${val.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const ArrowUp = () => (
  <svg viewBox="0 0 10 10" fill="currentColor" className="inline w-3 h-3">
    <path d="M5 2l4 6H1z" />
  </svg>
);

const ArrowDown = () => (
  <svg viewBox="0 0 10 10" fill="currentColor" className="inline w-3 h-3">
    <path d="M5 8L1 2h8z" />
  </svg>
);

export const MarketRankWidget: React.FC<{
  isPro: boolean;
  onGoToDashboard: () => void;
  onUpgrade: () => void;
}> = ({ isPro, onGoToDashboard, onUpgrade }) => {
  const [activeTab, setActiveTab] = useState<'acoes' | 'fiis' | 'eua' | 'cripto'>('acoes');
  
  // High quality default state
  const [rankData, setRankData] = useState<Record<string, RankItem[]>>({
    acoes: [
      { symbol: 'WEGE3', name: 'Weg S.A.', price: 39.80, change: 2.35, signal: 'COMPRA', currency: 'BRL' },
      { symbol: 'VALE3', name: 'Vale S.A.', price: 63.50, change: 1.20, signal: 'COMPRA', currency: 'BRL' },
      { symbol: 'PETR4', name: 'Petrobras', price: 38.20, change: -0.80, signal: 'MANTER', currency: 'BRL' },
      { symbol: 'MGLU3', name: 'Mag. Luiza', price: 1.45, change: -4.50, signal: 'VENDA', currency: 'BRL' },
    ],
    fiis: [
      { symbol: 'HGLG11', name: 'CGHG Logística', price: 164.50, change: 0.75, signal: 'COMPRA', currency: 'BRL' },
      { symbol: 'BTLG11', name: 'BTG Logística', price: 102.40, change: 1.10, signal: 'COMPRA', currency: 'BRL' },
      { symbol: 'MXRF11', name: 'Maxi Renda', price: 10.15, change: 0.20, signal: 'MANTER', currency: 'BRL' },
      { symbol: 'XPML11', name: 'XP Malls', price: 115.80, change: -0.35, signal: 'MANTER', currency: 'BRL' },
    ],
    eua: [
      { symbol: 'AAPL', name: 'Apple Inc.', price: 189.80, change: 1.55, signal: 'COMPRA', currency: 'USD' },
      { symbol: 'MSFT', name: 'Microsoft Corp.', price: 415.50, change: 2.10, signal: 'COMPRA', currency: 'USD' },
      { symbol: 'O', name: 'Realty Income (REIT)', price: 54.20, change: -0.60, signal: 'MANTER', currency: 'USD' },
      { symbol: 'PLD', name: 'Prologis (REIT)', price: 108.30, change: -1.45, signal: 'VENDA', currency: 'USD' },
    ],
    cripto: [
      { symbol: 'SOL', name: 'Solana', price: 174.50, change: 6.80, signal: 'COMPRA', currency: 'USD' },
      { symbol: 'BTC', name: 'Bitcoin', price: 66200.00, change: 3.42, signal: 'COMPRA', currency: 'USD' },
      { symbol: 'ETH', name: 'Ethereum', price: 3450.00, change: 2.85, signal: 'COMPRA', currency: 'USD' },
      { symbol: 'DOGE', name: 'Dogecoin', price: 0.152, change: -3.20, signal: 'VENDA', currency: 'USD' },
    ]
  });

  // Track price flash updates
  const [flashMap, setFlashMap] = useState<Record<string, 'up' | 'down' | null>>({});
  const timeoutRefs = useRef<Record<string, NodeJS.Timeout>>({});

  // Simulated live fluctuation micro-animation to feel alive
  useEffect(() => {
    const interval = setInterval(() => {
      // Pick a random category and asset
      const categories = ['acoes', 'fiis', 'eua', 'cripto'] as const;
      const randomCat = categories[Math.floor(Math.random() * categories.length)];
      const items = rankData[randomCat];
      const randomIdx = Math.floor(Math.random() * items.length);
      const target = items[randomIdx];

      // Fluctuate price by a small percentage (-0.4% to +0.4%)
      const changePercent = (Math.random() * 0.8 - 0.4) / 100;
      const oldPrice = target.price;
      const newPrice = Number((oldPrice * (1 + changePercent)).toFixed(target.price < 5 ? 3 : 2));
      const direction = newPrice > oldPrice ? 'up' : newPrice < oldPrice ? 'down' : null;

      if (!direction) return;

      // Update price and change
      setRankData(prev => {
        const copy = { ...prev };
        const listCopy = [...copy[randomCat]];
        listCopy[randomIdx] = {
          ...target,
          price: newPrice,
          change: Number((target.change + changePercent * 100).toFixed(2))
        };
        copy[randomCat] = listCopy;
        return copy;
      });

      // Trigger flash highlight
      const key = `${randomCat}-${target.symbol}`;
      setFlashMap(prev => ({ ...prev, [key]: direction }));

      // Clear flash after 800ms
      if (timeoutRefs.current[key]) clearTimeout(timeoutRefs.current[key]);
      timeoutRefs.current[key] = setTimeout(() => {
        setFlashMap(prev => ({ ...prev, [key]: null }));
      }, 800);

    }, 3000); // every 3 seconds

    return () => {
      clearInterval(interval);
      Object.values(timeoutRefs.current).forEach(t => clearTimeout(t));
    };
  }, [rankData]);

  const activeList = rankData[activeTab];

  return (
    <div
      style={{
        width: 300,
        flexShrink: 0,
        background: 'rgba(2,8,26,0.55)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        border: '1px solid rgba(255,255,255,0.12)',
        borderRadius: 16,
        overflow: 'hidden',
        boxShadow: '0 25px 50px -12px rgba(0,0,0,0.6)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Header */}
      <div style={{ padding: '16px 20px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ color: 'white', fontSize: 12, fontWeight: 900, letterSpacing: '-0.01em' }}>
            🏆 Top Ativos
          </span>
          <span style={{ color: '#10B981', fontSize: 8, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.1em', background: 'rgba(16,185,129,0.15)', padding: '2px 6px', borderRadius: 20, border: '1px solid rgba(16,185,129,0.3)' }}>
            RANK
          </span>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', flexWrap: 'wrap', padding: '12px 16px 0', gap: 4 }}>
        {([
          { id: 'acoes', label: '🇧🇷 Ações' },
          { id: 'fiis', label: '🏢 FIIs' },
          { id: 'eua', label: '🇺🇸 EUA' },
          { id: 'cripto', label: '🪙 Cripto' }
        ] as const).map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              flex: '1 1 45%',
              padding: '6px 8px',
              fontSize: 10,
              fontWeight: 800,
              borderRadius: 8,
              border: 'none',
              cursor: 'pointer',
              transition: 'all 0.2s',
              background: activeTab === tab.id ? 'rgba(255,159,28,0.2)' : 'transparent',
              color: activeTab === tab.id ? '#0D9488' : 'rgba(255,255,255,0.4)',
              outline: activeTab === tab.id ? '1px solid rgba(255,159,28,0.4)' : '1px solid transparent',
              textAlign: 'center',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Ranks list */}
      <div style={{ flex: 1, padding: '12px 16px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {activeList.map((item, idx) => {
            const flashKey = `${activeTab}-${item.symbol}`;
            const flash = flashMap[flashKey];
            const isPositive = item.change >= 0;
            
            return (
              <div
                key={item.symbol}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '9px 12px',
                  background: 'rgba(255,255,255,0.04)',
                  borderRadius: 10,
                  border: '1px solid rgba(255,255,255,0.06)',
                  transition: 'all 0.4s ease',
                  backgroundColor: flash === 'up' 
                    ? 'rgba(16,185,129,0.12)' 
                    : flash === 'down' 
                    ? 'rgba(248,113,113,0.12)' 
                    : 'rgba(255,255,255,0.04)',
                }}
              >
                {/* Symbol & Rank */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 10, fontWeight: 900, color: 'rgba(255,255,255,0.3)', width: 12 }}>
                    {idx + 1}
                  </span>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 900, color: 'white', letterSpacing: '0.02em' }}>
                      {item.symbol}
                    </div>
                    <div style={{ fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,0.4)' }}>
                      {item.name}
                    </div>
                  </div>
                </div>

                {/* Price, Change & Recommendation Signal */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ textAlign: 'right' }}>
                    <div
                      style={{
                        fontSize: 11,
                        fontWeight: 900,
                        color: flash === 'up' ? '#10B981' : flash === 'down' ? '#F87171' : 'white',
                        transition: 'color 0.2s ease',
                      }}
                    >
                      {fmtPrice(item.price, item.currency)}
                    </div>
                    <div
                      style={{
                        fontSize: 9,
                        fontWeight: 800,
                        color: isPositive ? '#10B981' : '#F87171',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'flex-end',
                        gap: 2,
                      }}
                    >
                      {isPositive ? <ArrowUp /> : <ArrowDown />}
                      {Math.abs(item.change).toFixed(2)}%
                    </div>
                  </div>

                  {/* Buy/Sell Signal */}
                  <div
                    style={{
                      width: 54,
                      textAlign: 'center',
                      fontSize: 8,
                      fontWeight: 900,
                      padding: '4px 0',
                      borderRadius: 6,
                      border: '1px solid',
                      backgroundColor: item.signal === 'COMPRA' 
                        ? 'rgba(16,185,129,0.1)' 
                        : item.signal === 'VENDA' 
                        ? 'rgba(239,68,68,0.1)' 
                        : 'rgba(245,158,11,0.1)',
                      borderColor: item.signal === 'COMPRA' 
                        ? 'rgba(16,185,129,0.4)' 
                        : item.signal === 'VENDA' 
                        ? 'rgba(239,68,68,0.4)' 
                        : 'rgba(245,158,11,0.4)',
                      color: item.signal === 'COMPRA' 
                        ? '#10B981' 
                        : item.signal === 'VENDA' 
                        ? '#EF4444' 
                        : '#F55F0B',
                    }}
                  >
                    {item.signal}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* CTA Footer */}
      <div style={{ padding: '0 16px 16px' }}>
        <button
          style={{
            width: '100%',
            padding: '12px 0',
            background: 'linear-gradient(135deg, #10B981, #059669)',
            border: 'none',
            borderRadius: 10,
            color: 'white',
            fontSize: 11,
            fontWeight: 900,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            cursor: 'pointer',
            transition: 'all 0.2s',
            boxShadow: '0 4px 15px rgba(16,185,129,0.3)',
          }}
          onClick={isPro ? onGoToDashboard : onUpgrade}
        >
          {isPro ? '✦ Analisar Carteira' : '✦ Liberar Sinais Pro'}
        </button>
      </div>
    </div>
  );
};
