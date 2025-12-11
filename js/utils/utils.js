// ==========================================
// UTILITY FUNCTIONS
// ==========================================

// Funzione per sanitizzare stringhe per uso in HTML (prevenzione XSS)
export function escapeHtml(text) {
    if (text == null) return '';
    const div = document.createElement('div');
    div.textContent = String(text);
    return div.innerHTML;
}

// Funzione per sanitizzare numeri per uso in HTML
export function escapeNumber(num) {
    if (num == null || isNaN(num)) return '0';
    return String(Number(num));
}

// Formatta i litri con convenzione italiana (es. 17.153,00)
export function formatNumberIt(value, fractionDigits = 0) {
    const num = Number(value);
    const safeNum = Number.isFinite(num) ? num : 0;
    return new Intl.NumberFormat('it-IT', {
        minimumFractionDigits: fractionDigits,
        maximumFractionDigits: fractionDigits
    }).format(safeNum);
}

export function formatLitri(value) {
    return formatNumberIt(value, 2);
}

// Formatta numeratore pistola con 2 decimali (es. 1.234,56)
export function formatGunCounter(value) {
    const num = Number(value);
    const safeNum = Number.isFinite(num) ? num : 0;
    return new Intl.NumberFormat('it-IT', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    }).format(safeNum);
}

// Parse numeratore pistola da formato italiano (es. "1.234,567" -> 1234.567)
export function parseGunCounter(value) {
    if (value == null || value === '') return 0;
    if (typeof value === 'number') return Number.isFinite(value) ? value : 0;

    const cleaned = value.toString()
        .replace(/\./g, '')      // Rimuove separatori migliaia
        .replace(',', '.');       // Sostituisce virgola con punto

    const num = parseFloat(cleaned);
    return Number.isFinite(num) ? num : 0;
}

export function parseNumberFlexible(value) {
    if (value == null || value === '') return 0;
    if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
    if (typeof value === 'string') {
        const trimmed = value.trim();
        if (!trimmed) return 0;
        if (trimmed.includes(',')) {
            const normalized = trimmed.replace(/\./g, '').replace(',', '.');
            const num = Number(normalized);
            return Number.isFinite(num) ? num : 0;
        }
        const num = Number(trimmed);
        return Number.isFinite(num) ? num : 0;
    }
    return 0;
}

export function slugifyLabel(text) {
    return (text || '')
        .toString()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '') || 'chiusura';
}

export function base64ToArrayBuffer(base64) {
    const cleaned = (base64 || '').replace(/\s+/g, '');
    if (!cleaned) return null;
    const binary = atob(cleaned);
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
}


export function formatEuro(value) {
    const safe = Number.isFinite(value) ? value : 0;
    return `€ ${formatNumberIt(safe, 2)}`;
}

export function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}
