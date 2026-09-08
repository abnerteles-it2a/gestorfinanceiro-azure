
export const formatCurrency = (value: number, compact = false): string => {
    if (compact) {
        if (Math.abs(value) >= 1_000_000) {
            return new Intl.NumberFormat('pt-BR', {
                style: 'currency',
                currency: 'BRL',
                notation: 'compact',
                compactDisplay: 'short'
            }).format(value);
        }
        if (Math.abs(value) >= 1000) {
             return new Intl.NumberFormat('pt-BR', {
                style: 'currency',
                currency: 'BRL',
                notation: 'compact',
                compactDisplay: 'short'
            }).format(value).replace(/\s/g, '');
        }
    }

    return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL'
    }).format(value);
};

export const parseCurrencyInput = (value: string): number => {
    if (!value) return 0;
    // Remove whitespace
    let clean = value.trim();
    // Remove all dots (thousands separators in PT-BR)
    clean = clean.replace(/\./g, '');
    // Replace comma with dot (decimal separator)
    clean = clean.replace(',', '.');
    // Parse
    const parsed = parseFloat(clean);
    return isNaN(parsed) ? 0 : parsed;
};

export const toNumberPtBr = parseCurrencyInput;

export const formatCurrencyForInput = (value: number | string): string => {
    if (value === '' || value === undefined || value === null) return '';
    const num = typeof value === 'string' ? parseFloat(value) : value;
    if (isNaN(num)) return '';
    
    // 2 decimal places fixed
    const parts = num.toFixed(2).split('.');
    
    // Add thousand separators
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    
    return parts.join(',');
};

export const formatDate = (dateString: string): string => {
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
        const parts = dateString.split('-').map(p => parseInt(p, 10));
        const y = parts[0];
        const m = parts[1] - 1;
        const d = parts[2];
        const dt = new Date(y, m, d, 12, 0, 0, 0);
        return dt.toLocaleDateString('pt-BR');
    }
    const d = new Date(dateString);
    const dt = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12, 0, 0, 0);
    return dt.toLocaleDateString('pt-BR');
};

export const formatPercentage = (value: number): string => {
    return new Intl.NumberFormat('pt-BR', {
        style: 'percent',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    }).format(value);
};

export const toIsoLocalDate = (dateStr: string): string => {
    const parts = dateStr.split('-').map(p => parseInt(p, 10));
    const y = parts[0];
    const m = parts[1] - 1;
    const d = parts[2];
    const dt = new Date(y, m, d, 12, 0, 0, 0);
    return dt.toISOString();
};

export const dateKey = (input: string): string => {
    if (/^\d{4}-\d{2}-\d{2}$/.test(input)) return input;
    const d = new Date(input);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
};

export const formatInputMoney = (raw: string): string => {
    const digits = String(raw || '').replace(/\D+/g, '');
    if (!digits) return '0,00';
    const padded = digits.padStart(3, '0');
    const intPart = padded.slice(0, -2);
    const decPart = padded.slice(-2);
    
    // Add thousand separators
    const withThousandSep = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    
    return `${withThousandSep},${decPart}`;
};

export const formatDocument = (value: string): string => {
    const v = value.replace(/\D/g, '');
    if (v.length <= 11) {
        // CPF
        return v
            .replace(/(\d{3})(\d)/, '$1.$2')
            .replace(/(\d{3})(\d)/, '$1.$2')
            .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
    } else {
        // CNPJ
        return v
            .replace(/^(\d{2})(\d)/, '$1.$2')
            .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
            .replace(/\.(\d{3})(\d)/, '.$1/$2')
            .replace(/(\d{4})(\d)/, '$1-$2');
    }
};
