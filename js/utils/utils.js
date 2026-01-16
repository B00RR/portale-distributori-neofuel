// ==========================================
// UTILITY FUNCTIONS
// ==========================================

const escapeMap = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;' // Or &#x27; or &apos; depending on context, &#039; is generally safe
};

// Funzione per sanitizzare stringhe per uso in HTML (prevenzione XSS)
/**
 * Escapes HTML special characters to prevent XSS attacks
 * @param {string|number|null|undefined} text - Text to escape
 * @returns {string} Escaped HTML-safe string
 * @example
 * escapeHtml('<script>alert("XSS")</script>')
 * // => '&lt;script&gt;alert(&quot;XSS&quot;)&lt;/script&gt;'
 */
export function escapeHtml(text) {
    if (text == null) return '';
    return String(text).replace(/[&<>"']/g, (match) => escapeMap[match]);
}

// Funzione per sanitizzare numeri per uso in HTML
/**
 * Escapes a number for safe HTML attr rendering
 * @param {number|string|null|undefined} num - Number value to  escape
 * @returns {string} Safe string representation of the number
 */
export function escapeNumber(num) {
    if (num == null || num === '') return '';
    return String(parseFloat(String(num)));
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

/**
 * Formatta numeratore pistola con 2 decimali (es. 1.234,56)
 * @param {number|string} value
 * @returns {string}
 */
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

/**
 * Debounce: delays function execution until after wait ms have elapsed since last call
 * @param {Function} func - Function to debounce
 * @param {number} wait - Delay in milliseconds
 * @returns {Function} Debounced function
 * @example
 * const debouncedSearch = debounce((query) => search(query), 300);
 * input.addEventListener('input', (e) => debouncedSearch(e.target.value));
 */
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


export function formatDate(value) {
    if (!value) return '';
    try {
        const date = new Date(value);
        if (isNaN(date.getTime())) return value;
        return new Intl.DateTimeFormat('it-IT').format(date);
    } catch (e) {
        return value;
    }
}

export function getISODate(date) {
    if (!date) return '';
    const d = new Date(date);
    return new Date(d.getTime() - (d.getTimezoneOffset() * 60000)).toISOString().split('T')[0];
}

/**
 * Throttle: esegue la funzione al massimo una volta ogni `limit` ms
 * @param {Function} func - Funzione da limitare
 * @param {number} limit - Intervallo minimo in ms
 * @returns {Function} Funzione limitata
 */
export function throttle(func, limit) {
    let inThrottle = false;
    return function (...args) {
        if (!inThrottle) {
            func.apply(this, args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    };
}

/**
 * Rate Limiter per azioni critiche
 * Previene chiamate ripetute troppo frequenti
 * @param {number} maxCalls - Numero massimo di chiamate
 * @param {number} windowMs - Finestra temporale in ms
 * @returns {Object} Rate limiter con metodi check() e reset()
 */
export function createRateLimiter(maxCalls = 5, windowMs = 60000) {
    const calls = [];

    return {
        /**
         * Verifica se l'azione è consentita
         * @returns {boolean} true se consentita, false se rate limited
         */
        check() {
            const now = Date.now();
            // Rimuovi chiamate fuori dalla finestra
            while (calls.length > 0 && calls[0] < now - windowMs) {
                calls.shift();
            }

            if (calls.length >= maxCalls) {
                return false;
            }

            calls.push(now);
            return true;
        },

        /**
         * Resetta il contatore
         */
        reset() {
            calls.length = 0;
        },

        /**
         * Ottiene il tempo rimanente prima del prossimo slot
         * @returns {number} Millisecondi rimanenti
         */
        getRemainingTime() {
            if (calls.length === 0) return 0;
            const oldest = calls[0];
            const remaining = (oldest + windowMs) - Date.now();
            return Math.max(0, remaining);
        }
    };
}
