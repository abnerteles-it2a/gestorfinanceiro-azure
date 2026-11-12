export const formatCurrency = (value: number): string => {
    try {
        if (typeof Intl !== 'undefined' && Intl.NumberFormat) {
            return new Intl.NumberFormat('pt-BR', {
                style: 'currency',
                currency: 'BRL'
            }).format(value || 0);
        }
    } catch (e) {
        console.warn('Intl not supported, using fallback formatter');
    }

    // Fallback for environments without Intl support
    const val = Number(value || 0);
    return 'R$ ' + val.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, ".");
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

export const formatInputMoney = (text: string): string => {
    // Remove non-numeric characters
    const clean = text.replace(/\D/g, '');
    if (!clean) return '';
    
    // Treat as cents
    const number = Number(clean) / 100;
    
    return formatCurrencyForInput(number);
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

export const formatDate = (dateString: string | undefined): string => {
    if (!dateString) return '-';
    try {
        const date = new Date(dateString);
        if (isNaN(date.getTime())) return '-';
        
        if (typeof Intl !== 'undefined' && Intl.DateTimeFormat) {
            return new Intl.DateTimeFormat('pt-BR').format(date);
        }
        
        const day = String(date.getDate()).padStart(2, '0');
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const year = date.getFullYear();
        return `${day}/${month}/${year}`;
    } catch (e) {
        return '-';
    }
};

export const formatPercentage = (value: number): string => {
    const val = Number(value || 0);
    return `${val >= 0 ? '+' : ''}${val.toFixed(2)}%`;
};
