// Reference B3 and CVM fundamental benchmarks for fallback estimates
export interface FundamentalBenchmark {
  vpa: number;
  lpa?: number;
  dividends12m: number;
  sector: string;
}

export const B3_FUNDAMENTAL_BENCHMARKS: Record<string, FundamentalBenchmark> = {
  // FIIs (Fundos Imobiliários)
  'MXRF11': { vpa: 9.84, dividends12m: 1.15, sector: 'Híbrido/Papel' },
  'HGLG11': { vpa: 155.80, dividends12m: 13.20, sector: 'Logística' },
  'BTLG11': { vpa: 99.40, dividends12m: 9.12, sector: 'Logística' },
  'XPML11': { vpa: 112.50, dividends12m: 10.40, sector: 'Shoppings' },
  'KNCR11': { vpa: 101.40, dividends12m: 12.80, sector: 'Papel (CDI)' },
  'KNSC11': { vpa: 8.92, dividends12m: 1.08, sector: 'Papel' },
  'CPTS11': { vpa: 8.85, dividends12m: 0.96, sector: 'Papel' },
  'VISC11': { vpa: 118.20, dividends12m: 10.50, sector: 'Shoppings' },
  'TGAR11': { vpa: 122.40, dividends12m: 15.60, sector: 'Desenvolvimento' },
  'VGHF11': { vpa: 9.10, dividends12m: 1.10, sector: 'Híbrido' },
  'RBRR11': { vpa: 94.60, dividends12m: 9.80, sector: 'Papel' },
  'XPLG11': { vpa: 108.50, dividends12m: 9.36, sector: 'Logística' },
  'HGRU11': { vpa: 124.80, dividends12m: 11.40, sector: 'Renda Urbana' },
  'GARE11': { vpa: 9.20, dividends12m: 1.02, sector: 'Renda Urbana' },
  'TRXF11': { vpa: 104.50, dividends12m: 11.20, sector: 'Renda Urbana' },

  // Ações (Equities)
  'PETR4': { vpa: 31.80, lpa: 8.90, dividends12m: 4.25, sector: 'Petróleo & Gás' },
  'PETR3': { vpa: 31.80, lpa: 8.90, dividends12m: 4.25, sector: 'Petróleo & Gás' },
  'VALE3': { vpa: 44.50, lpa: 7.90, dividends12m: 4.10, sector: 'Mineração' },
  'BBAS3': { vpa: 34.90, lpa: 5.80, dividends12m: 2.45, sector: 'Bancos' },
  'ITUB4': { vpa: 21.20, lpa: 3.90, dividends12m: 1.95, sector: 'Bancos' },
  'BBDC4': { vpa: 16.40, lpa: 1.60, dividends12m: 0.90, sector: 'Bancos' },
  'SANB11': { vpa: 29.30, lpa: 3.10, dividends12m: 1.80, sector: 'Bancos' },
  'WEGE3': { vpa: 8.10, lpa: 1.35, dividends12m: 0.72, sector: 'Bens Industriais' },
  'TAEE11': { vpa: 22.40, lpa: 3.80, dividends12m: 3.20, sector: 'Energia Elétrica' },
  'CPLE6': { vpa: 9.30, lpa: 1.15, dividends12m: 0.65, sector: 'Energia Elétrica' },
  'EGIE3': { vpa: 13.80, lpa: 3.40, dividends12m: 2.75, sector: 'Energia Elétrica' },
  'PRIO3': { vpa: 21.50, lpa: 5.10, dividends12m: 0.00, sector: 'Petróleo & Gás' },
  'VBBR3': { vpa: 14.80, lpa: 2.10, dividends12m: 1.20, sector: 'Distribuição' },
  'CSAN3': { vpa: 12.40, lpa: 1.40, dividends12m: 0.55, sector: 'Agronegócio/Energia' },
  'SAPR11': { vpa: 27.20, lpa: 4.20, dividends12m: 2.30, sector: 'Saneamento' },
  'KLBN11': { vpa: 22.50, lpa: 2.10, dividends12m: 1.45, sector: 'Papel & Celulose' },
  'SUZB3': { vpa: 38.20, lpa: 4.80, dividends12m: 1.80, sector: 'Papel & Celulose' },
  'VIVT3': { vpa: 42.10, lpa: 3.40, dividends12m: 2.95, sector: 'Telecomunicações' },
  'RENT3': { vpa: 32.50, lpa: 2.40, dividends12m: 1.10, sector: 'Locação' },
  'MGLU3': { vpa: 1.65, lpa: 0.08, dividends12m: 0.00, sector: 'Varejo' },
  'ABEV3': { vpa: 6.20, lpa: 0.95, dividends12m: 0.73, sector: 'Bebidas' },
  'BBSE3': { vpa: 5.80, lpa: 3.85, dividends12m: 3.45, sector: 'Seguros' },
  'CXSE3': { vpa: 7.90, lpa: 1.55, dividends12m: 1.25, sector: 'Seguros' },

  // US Stocks & REITs
  'AAPL': { vpa: 4.80, lpa: 6.45, dividends12m: 1.00, sector: 'Tecnologia' },
  'MSFT': { vpa: 36.20, lpa: 11.80, dividends12m: 3.00, sector: 'Tecnologia' },
  'O': { vpa: 42.80, lpa: 1.45, dividends12m: 3.10, sector: 'REIT Imobiliário' }
};
